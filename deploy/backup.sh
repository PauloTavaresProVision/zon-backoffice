#!/usr/bin/env bash
# Cópia da base de dados para backups/ (comprimida). Guarda os últimos 14 dias.
# No servidor corre todos os dias pelo cron: ver docs/deploy-contabo.md
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p backups
chmod 700 backups
file="backups/zon-backoffice-$(date +%Y%m%d-%H%M).sql.gz"
# O utilizador e a base vêm das variáveis do próprio contentor da base de dados
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$file.tmp"
mv "$file.tmp" "$file"
chmod 600 "$file"
find backups -name 'zon-backoffice-*.sql.gz' -mtime +14 -delete
echo "$(date '+%Y-%m-%d %H:%M') cópia feita: $file ($(du -h "$file" | cut -f1))"
