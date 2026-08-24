# N5 Pro Deployment

This stack runs the Workspace and Persona API behind one Caddy origin. The
recommended setup reuses the existing iKuai Cloudflare Tunnel: Cloudflare
routes a hostname to the PVE VM fixed LAN address and the VM publishes only
the Caddy port. Persona port `3001` is never published.

## 1. Prepare Cloudflare

1. Reuse the existing iKuai Tunnel and add a hostname such as `persona.<your-domain>`.
2. Point it to `http://<PVE_VM_LAN_IP>:8080`.
3. Create a Self-hosted Access application for the same hostname.
4. Add GitHub as the identity provider and allow only the intended GitHub user.
5. Do not start the `cloudflared` service in this VM; the iKuai connector already owns the Tunnel.

The alternative dedicated-connector mode remains available with the
`dedicated-tunnel` Compose profile. Do not run both connectors for the same
hostname unless both can reach the same origin.

## 2. Prepare N5 Pro

Clone a clean tagged commit, then create local directories on SSD storage:

```bash
mkdir -p /volume1/docker/persona/data
mkdir -p /volume1/docker/persona/backups
chown -R 1000:1000 /volume1/docker/persona/data /volume1/docker/persona/backups
cp deploy/nas/.env.example deploy/nas/.env
chmod 600 deploy/nas/.env
```

Edit `deploy/nas/.env` with the exact public origin and Tunnel token. If the
MinisCloud storage root differs from `/volume1`, use its absolute local path.
Do not use an SMB or NFS mount for the live SQLite directory.

## 3. Build and start

```bash
docker compose --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml config
docker compose --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml build
docker compose --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml up -d
docker compose --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml ps
```

The first start creates an empty `persona-os.db`. Open
`https://app.<your-domain>/calendar` and complete Cloudflare Access login.

## 4. Backup and upgrade

Schedule this command once per day in the NAS task scheduler:

```bash
docker compose --env-file deploy/nas/.env \
  -f deploy/nas/compose.yaml \
  -f deploy/nas/compose.existing-tunnel.yaml \
  --profile maintenance run --rm backup
```

Before an image upgrade, set `PERSONA_BACKUP_LABEL=pre-upgrade` in the command
environment and run the same backup service. Keep the `data` volume when rolling
back an image.

## 5. Model and Obsidian configuration

The NAS runtime uses the configured real model and does not use `mock`. Set
`LLM_PROVIDER`, `LLM_MODEL` and `OPENAI_API_KEY` to the server model values.
The current foreground provider is DeepSeek-compatible; dedicated
OpenAI-compatible analysis jobs can use `PERSONA_ANALYSIS_ENDPOINT` and its
corresponding model/key fields.

Obsidian Snapshot can remain disabled until a NAS-local Vault is mounted.
Browser custom API keys remain session-only and are not written to SQLite.
