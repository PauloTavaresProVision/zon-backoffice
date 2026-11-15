#!/usr/bin/env bash
# Atualiza o servidor para a última versão da main: cópia da base de dados, git pull, reconstruir e reiniciar.
# O .env diz se o HTTPS é do Caddy do backoffice (COMPOSE_PROFILES=https) ou de um proxy do servidor (PROXY_NETWORK).
#
#   cd /opt/zon-backoffice && bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# .env de antes desta escolha: era sempre com o Caddy
profile=()
grep -qE '^(COMPOSE_PROFILES|PROXY_NETWORK)=' .env || profile=(--profile https)

bash deploy/backup.sh
git pull --ff-only
docker compose "${profile[@]}" up -d --build
docker image prune -f > /dev/null
docker compose "${profile[@]}" ps
