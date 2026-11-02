#!/usr/bin/env bash
# Primeira vez no servidor: autoriza-o a ler o repositório no GitHub (chave só de leitura), descarrega o código
# para /opt/zon-backoffice e corre a instalação (deploy/install.sh).
# O repositório é privado, por isso este ficheiro cola-se no PuTTY: está copiado no passo 1 de docs/deploy-contabo.md
# (ao mudar um, mudar o outro). Só com letras do latim, para colar bem no PuTTY.
set -euo pipefail
repo=PauloTavaresProVision/zon-backoffice
dir=/opt/zon-backoffice
key=/root/.ssh/zon_backoffice
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

[[ $(id -u) -eq 0 ]] || { echo "Corra como root (sudo -i)."; exit 1; }
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }

mkdir -p /root/.ssh && chmod 700 /root/.ssh
[[ -f $key ]] || ssh-keygen -q -t ed25519 -N "" -C "contabo-zon-backoffice" -f "$key"
grep -qx 'Host github-zon' /root/.ssh/config 2>/dev/null ||
  printf 'Host github-zon\n  HostName github.com\n  User git\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$key" >> /root/.ssh/config
chmod 600 /root/.ssh/config
# Chave do próprio GitHub (SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU): assim não pergunta se confia
github_key='github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl'
grep -qxF "$github_key" /root/.ssh/known_hosts 2>/dev/null || echo "$github_key" >> /root/.ssh/known_hosts

until [[ $(ssh -T -o BatchMode=yes github-zon 2>&1 < /dev/null) == *"successfully authenticated"* ]]; do
  echo
  echo "Falta autorizar este servidor no GitHub: github.com/$repo > Settings > Deploy keys > Add deploy key"
  echo "  Title: Contabo | Key: a linha abaixo | NAO marque \"Allow write access\""
  echo
  cat "$key.pub"
  echo
  read -rp "Depois de carregar em \"Add key\", carregue Enter aqui... " _ < /dev/tty
done
echo "GitHub: acesso de leitura ao $repo confirmado."

if [[ -d $dir/.git ]]; then git -C "$dir" pull --ff-only; else git clone -q "github-zon:$repo.git" "$dir"; fi
exec bash "$dir/deploy/install.sh" "$@" < /dev/tty
