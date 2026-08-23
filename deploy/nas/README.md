# N5 Pro Deployment

This stack runs the Workspace and Persona API behind one Caddy origin. Only
Cloudflare Tunnel reaches Caddy; Persona port `3001` is never published.

## 1. Prepare Cloudflare

1. Create a dashboard-managed Tunnel in Cloudflare Zero Trust.
2. Add public hostname `app.<your-domain>` with service `http://gateway:80`.
3. Create a Self-hosted Access application for the same hostname.
4. Add GitHub as the identity provider and allow only the intended GitHub user.
5. Copy the Tunnel token without placing it in Git or chat logs.

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
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml config
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml build
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml up -d
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml ps
```

The first start creates an empty `persona-os.db`. Open
`https://app.<your-domain>/calendar` and complete Cloudflare Access login.

## 4. Backup and upgrade

Schedule this command once per day in the NAS task scheduler:

```bash
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml --profile maintenance run --rm backup
```

Before an image upgrade, set `PERSONA_BACKUP_LABEL=pre-upgrade` in the command
environment and run the same backup service. Keep the `data` volume when rolling
back an image.

## 5. Enable AI and Obsidian later

Calendar acceptance starts with `LLM_PROVIDER=mock`, Daily Summary disabled, and
Obsidian Snapshot disabled. After the mobile calendar passes, inject the trusted
server model variables and mount a NAS-local Vault directory in `persona-api`.
Browser custom API keys remain session-only and are not written to SQLite.
