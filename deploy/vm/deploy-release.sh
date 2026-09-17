#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:-}"
if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "release tag must match vMAJOR.MINOR.PATCH" >&2
  exit 2
fi

version="${release_tag#v}"
repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$repository_root/deploy/nas/compose.yaml"
compose_tunnel_file="$repository_root/deploy/nas/compose.existing-tunnel.yaml"
runtime_env_file="${PERSONA_RUNTIME_ENV_FILE:-/etc/persona/runtime.env}"
image_repository="${PERSONA_IMAGE_REPOSITORY:-ghcr.io/${GITHUB_REPOSITORY_OWNER:-qiancheng06}/persona-nas}"
image="${image_repository}:${version}"
compose_project="${PERSONA_COMPOSE_PROJECT:-persona-nas}"
lock_file="${PERSONA_DEPLOY_LOCK_FILE:-/tmp/persona-deploy.lock}"

if [[ ! -r "$runtime_env_file" ]]; then
  echo "runtime env file is not readable: $runtime_env_file" >&2
  exit 1
fi
if [[ ! -f "$compose_file" || ! -f "$compose_tunnel_file" ]]; then
  echo "Compose files are missing under $repository_root" >&2
  exit 1
fi

mkdir -p "$(dirname -- "$lock_file")"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "another Persona deployment is already running" >&2
  exit 1
fi

compose=(
  docker compose
  --project-name "$compose_project"
  --project-directory "$repository_root"
  --env-file "$runtime_env_file"
  -f "$compose_file"
  -f "$compose_tunnel_file"
)

echo "Deploying $image from $release_tag"
echo "Creating pre-release SQLite backup"
PERSONA_BACKUP_LABEL="pre-${release_tag}" "${compose[@]}" --profile maintenance run --rm backup

echo "Pulling immutable image"
PERSONA_IMAGE="$image" "${compose[@]}" --profile maintenance pull

echo "Starting services without a local build"
PERSONA_IMAGE="$image" "${compose[@]}" up -d --no-build --wait --wait-timeout 180

health_status() {
  local service="$1"
  local container_id
  container_id="$(PERSONA_IMAGE="$image" "${compose[@]}" ps -q "$service")"
  [[ -n "$container_id" ]] || return 1
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id"
}

for service in persona-api workspace gateway; do
  status="$(health_status "$service")"
  if [[ "$status" != "healthy" ]]; then
    echo "$service is not healthy: $status" >&2
    "${compose[@]} ps" >&2 || true
    exit 1
  fi
done

echo "Checking internal HTTP endpoints"
PERSONA_IMAGE="$image" "${compose[@]}" exec -T persona-api node -e \
  "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
PERSONA_IMAGE="$image" "${compose[@]}" exec -T workspace node -e \
  "fetch('http://127.0.0.1:5173/calendar').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
PERSONA_IMAGE="$image" "${compose[@]}" exec -T gateway wget -q --spider http://127.0.0.1/healthz

digest="$(docker image inspect "$image" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)"
if [[ -z "$digest" ]]; then
  digest="$(docker image inspect "$image" --format '{{.Id}}')"
fi
echo "Deployment successful: release=$release_tag image=$image digest=$digest backup=pre-${release_tag}"
