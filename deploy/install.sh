#!/usr/bin/env bash
# Instala o Zon Backoffice neste servidor, de uma vez: Docker (se faltar), .env com perguntas só do que falta,
# arranque com HTTPS e cópia diária da base de dados. Pode correr-se outra vez: o que já está feito fica como está.
# Começa em modo seguro: ciclo de cobrança em simulação e emissão de faturas desligada. Ver docs/deploy-contabo.md
#
#   bash deploy/install.sh [domínio]
set -euo pipefail
cd "$(dirname "$0")/.."
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

ask() { # ask "Pergunta" [omissão]
  local v
  read -rp "$1${2:+ [$2]}: " v || exit 1
  printf '%s' "${v:-${2:-}}"
}
ask_secret() {
  local v
  IFS= read -rsp "$1: " v || exit 1
  echo >&2
  printf '%s' "$v"
}

# Valores do .env: lidos sem as aspas; gravados entre aspas simples, para o Docker não mexer em $ nem em espaços
env_get() {
  [[ -f .env ]] || return 0
  awk -v k="$1" 'index($0, k "=") == 1 {
    v = substr($0, length(k) + 2); q = substr(v, 1, 1)
    if (length(v) >= 2 && (q == "\047" || q == "\"") && substr(v, length(v)) == q) v = substr(v, 2, length(v) - 2)
    print v; exit }' .env
}
env_set() {
  [[ $2 != *"'"* ]] || fail "$1 não pode ter aspas simples (')."
  local tmp
  tmp=$(mktemp .env.XXXXXX)
  K="$1" V="$2" awk 'BEGIN { k = ENVIRON["K"]; line = k "=\047" ENVIRON["V"] "\047" }
    index($0, k "=") == 1 { if (!done) print line; done = 1; next }
    { print }
    END { if (!done) print line }' .env > "$tmp"
  mv "$tmp" .env
}

add_docker_repo() {
  . /etc/os-release
  [[ ${ID:-} == ubuntu ]] || fail "Este instalador é para Ubuntu; aqui é ${PRETTY_NAME:-outro sistema}."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
}

[[ $(id -u) -eq 0 ]] || fail "Corra como root (sudo -i)."

step "Programas"
missing=()
for p in openssl:openssl curl:curl ss:iproute2 crontab:cron gzip:gzip; do
  command -v "${p%%:*}" >/dev/null || missing+=("${p#*:}")
done
if (( ${#missing[@]} )); then
  echo "A instalar: ${missing[*]}"
  apt-get update -qq && apt-get install -y -qq "${missing[@]}" >/dev/null
fi
if ! command -v docker >/dev/null; then
  echo "A instalar o Docker"
  add_docker_repo
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
elif ! docker compose version >/dev/null 2>&1; then
  echo "A instalar o docker compose"
  add_docker_repo
  apt-get install -y -qq docker-compose-plugin >/dev/null
fi
docker info >/dev/null 2>&1 || systemctl enable --now docker
docker compose version

mem_mb=$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)
if (( mem_mb < 3500 )) && [[ -z $(swapon --show=NAME --noheadings 2>/dev/null) ]]; then
  step "Memória: ${mem_mb} MB e sem swap, a criar 2 GB de swap para a construção da app"
  { [[ -e /swapfile ]] || fallocate -l 2G /swapfile; } && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile &&
    { grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab; } ||
    warn "Não consegui criar o swap: a construção pode falhar por falta de memória."
fi

# Contentor de outro projeto que já publica a 443 (ex.: Nginx Proxy Manager): se existir, o HTTPS é dele
edge_container() {
  docker ps --filter publish=443 --format '{{.Names}}' 2>/dev/null | grep -v '^zon-backoffice-' | head -1 || true
}
edge=$(edge_container)

# Só na primeira vez: com os contentores do backoffice já a correr, as portas são dele
if [[ -z $(docker compose ps -q 2>/dev/null) ]]; then
  step "Portas livres"
  src=.env; [[ -f $src ]] || src=.env.example
  db_port=$(grep -m1 '^DB_PORT=' "$src" | cut -d= -f2 | tr -d "'\"" || true)
  web_port=$(grep -m1 '^WEB_PORT=' "$src" | cut -d= -f2 | tr -d "'\"" || true)
  ports=("${db_port:-5450}" "${web_port:-4620}")
  if [[ -n $edge ]]; then
    echo "A 80 e a 443 são do contentor $edge ($(docker inspect -f '{{.Config.Image}}' "$edge")): o backoffice fica atrás dele, sem HTTPS próprio."
  else
    ports=(80 443 "${ports[@]}")
  fi
  busy=""
  for p in "${ports[@]}"; do busy+=$(ss -Htlnp "sport = :$p"); done
  if [[ -n $busy ]]; then
    printf '%s\n' "$busy"
    fail "Estas portas já estão a ser usadas neste servidor (acima). Não arranquei nada. Se for a ${ports[-1]} ou a ${ports[0]}, mude WEB_PORT ou DB_PORT no .env (nano .env) e volte a correr."
  fi
  echo "${ports[*]} livres."
fi

step "Configuração (.env)"
new_env=false
if [[ ! -e .env ]]; then
  domain=${1:-}
  until [[ ${domain,,} =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]]; do
    domain=$(ask "Domínio do backoffice, com o DNS a apontar para este servidor (ex.: backoffice.zon.ao)")
  done
  bash deploy/setup-env.sh "$domain" >/dev/null
  new_env=true
  echo ".env criado: segredos gerados, ciclo em simulação e emissão de faturas desligada."
fi
domain=$(env_get DOMAIN)
[[ -n $domain ]] || fail "O .env não tem DOMAIN. Acrescente DOMAIN=<domínio> com: nano .env"

# O administrador só é criado no primeiro arranque, com a base de dados vazia
if [[ -z $(env_get ADMIN_EMAIL) || -z $(env_get ADMIN_PASSWORD) ]] && [[ -z $(docker compose ps -aq db 2>/dev/null) ]]; then
  step "Primeiro administrador (para entrar no backoffice)"
  email=""
  until [[ $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do email=$(ask "Email"); done
  name=$(ask "Nome" "Administrador")
  while :; do
    pass=$(ask_secret "Palavra-passe (12 ou mais caracteres; não aparece ao escrever)")
    if (( ${#pass} < 12 )); then warn "Tem de ter pelo menos 12 caracteres."; continue; fi
    if [[ $pass == *"'"* ]]; then warn "Sem aspas simples ('), por favor."; continue; fi
    [[ $(ask_secret "Repita a palavra-passe") == "$pass" ]] && break
    warn "Não são iguais."
  done
  env_set ADMIN_EMAIL "$email"
  env_set ADMIN_NAME "$name"
  env_set ADMIN_PASSWORD "$pass"
fi

if [[ -z $(env_get IXC_URL) || -z $(env_get IXC_TOKEN) ]]; then
  step "IXC da Zon (clientes e mensalidades; só leitura enquanto o ciclo estiver em simulação)"
  url=$(ask "URL do webservice (ex.: https://<servidor-ixc>/webservice/v1; Enter para deixar para depois)")
  if [[ -n $url ]]; then
    until [[ $url =~ ^https?://[^[:space:]]+$ ]]; do url=$(ask "URL a começar por https://"); done
    token=""
    until [[ -n $token ]]; do token=$(ask_secret "Token (\"<id do utilizador>:<token>\")"); done
    env_set IXC_URL "$url"
    env_set IXC_TOKEN "$token"
  fi
fi

if $new_env; then
  step "WeSender (SMS), opcional"
  if [[ $(ask "Configurar agora? (s/N)") == [sS]* ]]; then
    env_set WESENDER_URL "$(ask "URL" "https://api.wesender.co.ao/envio/apikey")"
    key=""
    until [[ -n $key ]]; do key=$(ask_secret "Chave de API"); done
    env_set WESENDER_KEY "$key"
    env_set SMS_TEST_PHONE "$(ask "Telemóvel de testes: com ele, TODAS as SMS vão só para esse número (Enter = nenhum)")"
  fi
fi

if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
fi

# Quem trata do HTTPS: o Caddy do backoffice (COMPOSE_PROFILES=https) ou o proxy que já está no servidor.
# Fica escrito no .env, e o docker compose lê-o sozinho (COMPOSE_PROFILES, COMPOSE_FILE).
if [[ -z $(env_get COMPOSE_PROFILES) ]]; then
  if [[ -z $(env_get PROXY_NETWORK) && -n $edge ]]; then
    net=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$edge" | grep -vxE 'bridge|host|none' | grep . | head -1 || true)
    [[ -n $net ]] || fail "O $edge está só na rede bridge do Docker. Crie uma rede para os dois:
  docker network create zon-proxy && docker network connect zon-proxy $edge
e acrescente ao .env a linha PROXY_NETWORK=zon-proxy (nano .env). Depois volte a correr: bash deploy/install.sh"
    env_set PROXY_NETWORK "$net"
  fi
  if [[ -n $(env_get PROXY_NETWORK) ]]; then
    [[ -n $(env_get COMPOSE_FILE) ]] || env_set COMPOSE_FILE "compose.yaml:deploy/compose.proxy.yaml"
    [[ -n $(env_get PROXY_CONTAINER) || -z $edge ]] || env_set PROXY_CONTAINER "$edge"
  else
    env_set COMPOSE_PROFILES https
  fi
fi
proxy_net=$(env_get PROXY_NETWORK)
proxy=$(env_get PROXY_CONTAINER)
if [[ -n $proxy_net ]]; then
  step "HTTPS pelo proxy do servidor${proxy:+ ($proxy)}"
  docker network inspect "$proxy_net" >/dev/null 2>&1 || fail "A rede Docker $proxy_net (PROXY_NETWORK no .env) não existe neste servidor."
  echo "Sem Caddy próprio. O web entra na rede $proxy_net, onde o proxy o encontra em http://zon-backoffice-web-1:3000."
fi

dns=$(getent ahostsv4 "$domain" | awk '{ print $1 }' | sort -u | xargs || true)
mine=" $(hostname -I 2>/dev/null || true) "
here=false
for ip in $dns; do if [[ $mine == *" $ip "* ]]; then here=true; fi; done
if [[ -z $dns ]]; then
  warn "O $domain ainda não existe no DNS. O certificado só sai quando apontar para este servidor."
elif ! $here; then
  warn "O $domain aponta para $dns, que não é este servidor ($(xargs <<< "$mine")). O certificado só sai quando apontar para aqui."
fi

if [[ -n $(docker compose ps -q db 2>/dev/null) ]]; then
  step "Cópia da base de dados antes de atualizar"
  bash deploy/backup.sh
fi

step "Construir e arrancar (a primeira vez demora alguns minutos)"
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if ! docker compose up -d --build; then
  docker compose logs web --tail 40 || true
  fail "A app não arrancou: as últimas linhas do web estão acima."
fi
docker compose logs web --no-log-prefix --since "$started" 2>/dev/null | grep -E '\[migrate\] (administrador|sem utilizadores|falhou)' | tail -1 || true

step "HTTPS"
https_ok=false
for _ in $(seq "$([[ -n $proxy_net ]] && echo 2 || echo 24)"); do
  if curl -fs -o /dev/null --max-time 5 --resolve "$domain:443:127.0.0.1" "https://$domain/api/health"; then https_ok=true; break; fi
  sleep 5
done
if $https_ok; then
  echo "https://$domain responde, com certificado válido."
elif [[ -n $proxy_net ]]; then
  server_ip=$(hostname -I 2>/dev/null | awk '{ print $1 }')
  if [[ -n $proxy ]] && [[ $(docker inspect -f '{{.Config.Image}}' "$proxy" 2>/dev/null) == *nginx-proxy-manager* ]]; then
    warn "Falta o Nginx Proxy Manager encaminhar o $domain para o backoffice."
    cat <<EOF
  Em http://${server_ip:-<IP do servidor>}:81 > Hosts > Proxy Hosts > Add Proxy Host:
    Details   Domain Names: $domain
              Scheme: http   Forward Hostname / IP: zon-backoffice-web-1   Forward Port: 3000
              ligar Block Common Exploits e Websockets Support
    SSL       SSL Certificate: Request a new SSL Certificate
              ligar Force SSL e HTTP/2 Support, aceitar os termos da Let's Encrypt e Save
  O DNS do $domain tem de apontar para este servidor antes de pedir o certificado.
  Para confirmar no fim:  curl -fsS https://$domain/api/health
EOF
  else
    warn "Falta o proxy${proxy:+ $proxy} encaminhar https://$domain para http://zon-backoffice-web-1:3000 (com certificado para o $domain)."
  fi
else
  docker compose logs caddy --tail 200 2>/dev/null | grep -iE 'error|challenge' | tail -5 || true
  warn "Ainda sem certificado para $domain. Confirme que o DNS aponta para este servidor e que as portas 80 e 443 estão abertas no painel da Contabo; o Caddy volta a tentar sozinho."
fi

step "Cópias de segurança (todos os dias às 03:15, guardadas 14 dias em backups/)"
cron_line="15 3 * * * cd $PWD && bash deploy/backup.sh >> backups/backup.log 2>&1"
current=$(crontab -l 2>/dev/null || true)
if [[ $current != *deploy/backup.sh* ]]; then
  { [[ -n $current ]] && printf '%s\n' "$current"; echo "$cron_line"; } | crontab -
fi
compgen -G "backups/zon-backoffice-*.sql.gz" >/dev/null || bash deploy/backup.sh

admin=$(env_get ADMIN_EMAIL)
issue_from=$(env_get OFFICEGEST_ISSUE_FROM)
step "Pronto"
cat <<EOF
Backoffice:     https://$domain${admin:+   (entrar com $admin)}
Ciclo:          $(env_get CYCLE_MODE) · faturas: ${issue_from:+a partir de }${issue_from:-desligadas}
Boxes ZON TV:   servidor https://$domain

Mudar chaves (AppyPay, OfficeGest, WeSender):  nano .env   e depois
                docker compose up -d --force-recreate web worker
Atualizar:      bash deploy/update.sh
Estado:         docker compose ps
EOF
