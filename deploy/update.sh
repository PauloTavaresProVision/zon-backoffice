#!/usr/bin/env bash
# Atualiza o servidor para a última versão da main: cópia da base de dados, git pull, reconstruir e reiniciar.
#
#   cd /opt/zon-backoffice && bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

bash deploy/backup.sh
git pull --ff-only
docker compose --profile https up -d --build
docker image prune -f > /dev/null
docker compose --profile https ps
