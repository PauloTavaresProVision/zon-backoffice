# Pôr o Zon Backoffice no servidor Contabo

Faz-se no PuTTY, como `root`, num servidor Ubuntu 22.04 ou 24.04, colando **um só bloco**. O bloco autoriza o servidor a ler o código no GitHub, descarrega-o para `/opt/zon-backoffice` e instala tudo: o Docker (se faltar), a base de dados própria, a app em `https://<domínio>` com certificado automático e uma cópia diária da base de dados. Pelo caminho pergunta só o domínio, o administrador e o IXC.

Começa em modo seguro: **lê o IXC mas não cria referências, não envia SMS a clientes, não escreve no IXC e não emite faturas.**

## 0. Antes de começar

- O **IP do servidor** e o acesso `root` pelo PuTTY.
- Um **domínio** para o backoffice (ex.: `backoffice.zon.ao`), com um registo DNS **A** a apontar para o IP do servidor. Pede-se a quem gere o DNS do `zon.ao`. Para confirmar, no Windows: `nslookup backoffice.zon.ao` tem de mostrar o IP do servidor.
- Acesso ao repositório `zon-backoffice` no GitHub, para autorizar o servidor (uma chave só de leitura).
- O URL e o token do **IXC** da Zon.

## 1. Instalar

Copie o bloco todo e cole-o no PuTTY com o **botão direito do rato**:

```bash
set +H
cat > /root/zon-instalar.sh <<'EOF'
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
EOF
bash /root/zon-instalar.sh
```

Depois é só responder:

1. **GitHub.** Aparece uma linha que começa por `ssh-ed25519` (é a parte pública da chave, pode ser partilhada). No GitHub, no repositório **zon-backoffice → Settings → Deploy keys → Add deploy key**: título `Contabo`, cole a linha, **não** marque "Allow write access" e carregue em **Add key**. Volte ao PuTTY e carregue **Enter**.
2. **Domínio**, por exemplo `backoffice.zon.ao`.
3. **Administrador**: email, nome e palavra-passe (12 ou mais caracteres; não aparece enquanto escreve).
4. **IXC**: o URL do webservice e o token (`<id do utilizador>:<token>`).
5. **WeSender** (opcional): a chave e um telemóvel de testes. Com o telemóvel de testes, todas as SMS vão só para ele.

A seguir constrói e arranca a app (a primeira vez demora alguns minutos), confirma o HTTPS, agenda a cópia da base de dados para todos os dias às 03:15 e mostra o endereço. Abra `https://backoffice.zon.ao` e entre com o administrador.

### Se parar

- **"Estas portas já estão a ser usadas"**: há outra coisa no servidor nas portas 80 ou 443 (outro site, nginx, apache) ou nas portas internas do backoffice. Não arrancou nada. Veja o que é antes de continuar.
- **"Ainda sem certificado"**: o DNS do domínio ainda não aponta para o servidor, ou as portas 80 e 443 estão fechadas. O resto já está a correr e o Caddy volta a tentar sozinho; para acompanhar: `cd /opt/zon-backoffice && docker compose --profile https logs caddy --tail 20`.
- **"A app não arrancou"**: as últimas linhas do `web` ficam no ecrã; corrija o que indicam no `.env` (`nano /opt/zon-backoffice/.env`) e volte a correr `bash /root/zon-instalar.sh`.

O bloco pode correr-se outra vez sem problema: o que já está feito fica como está.

## 2. Depois da instalação

Os comandos correm dentro de `/opt/zon-backoffice` (`cd /opt/zon-backoffice`).

| Para | Comando |
|---|---|
| Atualizar para a versão nova da main (faz antes uma cópia da base de dados) | `bash deploy/update.sh` |
| Mudar chaves (AppyPay, OfficeGest, WeSender) | `nano .env` e depois `docker compose --profile https up -d --force-recreate web worker` |
| Ver o estado | `docker compose --profile https ps` |
| Ver o que fizeram a app e o ciclo | `docker compose logs web worker --tail 30` |
| Ver erros recentes | `docker compose logs web worker --since 1h \| grep -iE 'erro\|error\|falh'` |
| Fazer uma cópia já | `bash deploy/backup.sh` |
| Ver as cópias | `ls -lh backups` |
| Parar tudo | `docker compose --profile https down` (os dados ficam) |

Nunca use `docker compose down -v`: o `-v` apaga a base de dados.

No `nano`, para gravar: `Ctrl+O`, `Enter`, `Ctrl+X`. As chaves do AppyPay e do OfficeGest são as da conta da **Zon** (não da TAAG). **Não mude** `CYCLE_MODE` nem `OFFICEGEST_ISSUE_FROM` enquanto o sistema antigo estiver a cobrar e a faturar.

As cópias ficam no mesmo servidor (`/opt/zon-backoffice/backups`, 14 dias): de vez em quando descarregue-as para fora, por exemplo com o WinSCP.

### Firewall (opcional)

A base de dados e a app só aceitam ligações de dentro do servidor; para fora ficam só as portas 80 e 443. Para fechar também o resto com o `ufw`:

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable && ufw status
```

Se o SSH do servidor não estiver na porta 22, troque `OpenSSH` pela porta (ex.: `ufw allow 2222/tcp`), senão o PuTTY perde o acesso.

## 3. Testar a AppyPay com um pagamento de 100 Kz

Dá para fazer com o ciclo em simulação: a referência de teste não tem cliente, não envia SMS, não escreve no IXC e não emite fatura.

1. **Uma aplicação e um webhook só do backoffice**, no portal da AppyPay (`app.appypay.co.ao`):
   - **Aplicações → Adicionar aplicação**: método **Referência**, nome `Zon Backoffice`.
   - **Integração → Webhooks → Novo webhook**: em **Adesão** escolher só `Zon Backoffice`, nome `Zon Backoffice` e o URL
     `https://<domínio>/api/appypay/webhook/<segredo>`. O segredo vê-se no servidor com `grep APPYPAY_WEBHOOK_SECRET .env`.

   Assim só chegam ao backoffice as notificações das referências dele. Não mexa nas outras aplicações nem no webhook que já existe: são do sistema que hoje cobra.
2. **As chaves no servidor.** `nano .env` e preencher `APPYPAY_URL`, `APPYPAY_TOKEN_URL`, `APPYPAY_CLIENT_ID`, `APPYPAY_CLIENT_SECRET`, `APPYPAY_RESOURCE`, `APPYPAY_ENTITY` e `APPYPAY_PAYMENT_METHOD=REF_<chave da aplicação Zon Backoffice>` (o tipo, `_` e a chave). Depois:
   `docker compose up -d --force-recreate web worker`
3. **No backoffice**, em **Definições → Integrações → AppyPay**, carregar em **Testar ligação**. Depois, em **Definições → Teste da AppyPay**, carregar em **Criar referência de teste**: aparecem a entidade, a referência e o valor.
4. **Pagar** essa referência no Multicaixa Express ou num ATM.
5. **Ver o resultado** em **Teste da AppyPay** (recarregar a página):
   - «Notificação da AppyPay: recebida» e «Paga · confirmada pela notificação»: o webhook funciona.
   - Paga, mas «Notificação: ainda não chegou»: a verificação de 10 em 10 min apanhou-a; rever o URL da chave no portal.
   - **Perguntar à AppyPay** mostra o que a AppyPay diz da referência (ativa ou não) e da lista de pagamentos.

Se a notificação não entrar, os erros do webhook aparecem em `docker compose logs web --since 1h | grep -i appypay`.

## Mais tarde

- **Boxes ZON TV**: o servidor a pôr na app é `https://backoffice.zon.ao`.
- **Webhook da AppyPay** ao passar o ciclo para `ativo`: o mesmo URL da chave do passo 3.
- **Passar a cobrar e a faturar**: ver "Passar do sistema antigo para o backoffice" e "Passar para produção" no README. Só depois de desligar as tarefas do sistema antigo.
