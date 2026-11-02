#!/usr/bin/env bash
# Cria o .env do servidor a partir do .env.example: segredos gerados aqui e tudo em modo seguro
# (ciclo de cobrança em simulação, sem emissão de faturas, sem dados de demonstração).
# As chaves das integrações e o administrador preenchem-se depois com: nano .env
#
#   bash deploy/setup-env.sh backoffice.zon.ao
set -euo pipefail
cd "$(dirname "$0")/.."

domain="${1:-}"
domain="${domain,,}"
if [[ ! "$domain" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]]; then
  echo "Uso: bash deploy/setup-env.sh <domínio>    (ex.: backoffice.zon.ao)"
  exit 1
fi
if [[ -e .env ]]; then
  echo "Já existe um .env e não o substituo. Para o alterar: nano .env"
  exit 1
fi

umask 077
cp .env.example .env

# Só valores gerados aqui (hexadecimal, o domínio, palavras fixas): seguros para o sed
set_var() {
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}
set_var DOMAIN "$domain"
set_var APP_URL "https://$domain"
set_var COOKIE_SECURE true
set_var POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_var APP_SECRET "$(openssl rand -hex 32)"
set_var APPYPAY_WEBHOOK_SECRET "$(openssl rand -hex 24)"
set_var CYCLE_MODE simulacao
set_var CYCLE_FROM_DUE ""
set_var OFFICEGEST_ISSUE_FROM ""
set_var DEV_MOCKS_URL ""
set_var SEED_DEMO false
set_var SEED_OFFICEGEST_MOCK false
set_var SEED_INTEGRATIONS_MOCK false
chmod 600 .env

cat <<EOF
.env criado para https://$domain (só o root o lê).
Já tem: palavra-passe da base de dados, APP_SECRET e segredo do webhook (gerados agora),
ciclo em simulação e emissão de faturas desligada.

Falta preencher com:  nano .env
  ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD   (12+ caracteres; com \$ use aspas simples: '...')
  IXC_URL, IXC_TOKEN
  (opcional) WESENDER_URL, WESENDER_KEY, SMS_TEST_PHONE
  (opcional) APPYPAY_*  e  OFFICEGEST_*  (da conta da Zon, não da TAAG)
Não mude CYCLE_MODE nem OFFICEGEST_ISSUE_FROM enquanto o sistema antigo estiver a cobrar e a faturar.
EOF
