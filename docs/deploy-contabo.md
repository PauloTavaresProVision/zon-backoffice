# Pôr o Zon Backoffice no servidor Contabo

Guia para fazer no PuTTY, como `root`, num servidor Ubuntu 22.04 ou 24.04. No PuTTY, cola-se com o **botão direito do rato**.

O backoffice fica em `/opt/zon-backoffice`, com base de dados própria no Docker, e abre em `https://<domínio>` com certificado automático. Começa em modo seguro: **lê o IXC mas não cria referências, não envia SMS a clientes, não escreve no IXC e não emite faturas.**

## 0. Antes de começar

- O **IP do servidor** e o acesso `root` pelo PuTTY.
- Um **domínio** para o backoffice (ex.: `backoffice.zon.ao`), com um registo DNS **A** a apontar para o IP do servidor. Pede-se a quem gere o DNS do `zon.ao`. Para confirmar, no Windows: `nslookup backoffice.zon.ao` tem de mostrar o IP do servidor.
- Acesso ao repositório `zon-backoffice` no GitHub, para autorizar o servidor a descarregar o código.

Em todo o guia, troque `backoffice.zon.ao` pelo domínio verdadeiro.

## 1. Ver o servidor

```bash
lsb_release -ds; nproc; free -h; df -h /
```

```bash
ss -tlnp | grep -vE '127\.0\.0\.1|::1'
```

O segundo comando mostra o que já está à escuta. **Pare aqui e avise** se aparecer alguma coisa nas portas **80** ou **443** (outro site, nginx, apache), ou outros serviços além do SSH (porta 22): é preciso combinar o resto antes de continuar.

Se `free -h` mostrar menos de 4 GB de memória e nenhum swap, crie 2 GB de swap (a construção da app precisa de memória):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. Instalar o Docker

Se `docker compose version` já responder, salte este passo.

```bash
apt update && apt -y upgrade && apt -y install ca-certificates curl git ufw
```

```bash
install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
```

```bash
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && docker compose version
```

## 3. Firewall

Abre só o SSH, o HTTP e o HTTPS. A base de dados e a app ficam só dentro do servidor.

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable && ufw status
```

Se o SSH do servidor não estiver na porta 22, troque `OpenSSH` pela porta (ex.: `ufw allow 2222/tcp`) **antes** de ativar, senão o PuTTY perde o acesso.

## 4. Autorizar o servidor no GitHub (só leitura)

Cria uma chave só para este servidor:

```bash
ssh-keygen -t ed25519 -N "" -C "contabo-zon-backoffice" -f /root/.ssh/zon_backoffice && cat /root/.ssh/zon_backoffice.pub
```

Copie a linha que começa por `ssh-ed25519` (é a parte pública, pode ser partilhada). No GitHub: repositório **zon-backoffice → Settings → Deploy keys → Add deploy key**. Título `Contabo`, cole a linha e **não** marque "Allow write access".

Depois, no servidor:

```bash
printf 'Host github-zon\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/zon_backoffice\n  IdentitiesOnly yes\n' >> /root/.ssh/config && chmod 600 /root/.ssh/config
```

```bash
ssh -T github-zon
```

Na primeira vez pergunta se confia no GitHub. A impressão digital certa é `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`; se for essa, escreva `yes`. A resposta tem de dizer "successfully authenticated".

## 5. Descarregar o código

```bash
git clone github-zon:PauloTavaresProVision/zon-backoffice.git /opt/zon-backoffice && cd /opt/zon-backoffice && git log --oneline -1
```

## 6. Configurar

Cria o `.env` com os segredos gerados e o modo seguro:

```bash
cd /opt/zon-backoffice && bash deploy/setup-env.sh backoffice.zon.ao
```

Abra-o para preencher o que falta:

```bash
nano .env
```

- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`: o primeiro administrador. Palavra-passe com 12 ou mais caracteres; se tiver `$`, ponha-a entre aspas simples: `ADMIN_PASSWORD='...'`.
- `IXC_URL` e `IXC_TOKEN`.
- Opcional: `WESENDER_URL`, `WESENDER_KEY` e `SMS_TEST_PHONE` (com o número de testes, as SMS só vão para ele).
- Opcional: `APPYPAY_*` e `OFFICEGEST_*`, da conta da **Zon** (não da TAAG).
- **Não mude** `CYCLE_MODE` nem `OFFICEGEST_ISSUE_FROM` enquanto o sistema antigo estiver a cobrar e a faturar.

Para gravar no nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

## 7. Arrancar

A primeira vez demora alguns minutos (constrói a app).

```bash
cd /opt/zon-backoffice && docker compose --profile https up -d --build && docker compose --profile https ps
```

Confirmar:

```bash
docker compose logs web worker --tail 30
```

```bash
docker compose logs caddy --tail 20
```

- No `web`: `migrações aplicadas` e `administrador ... criado`.
- No `worker`: `ciclo de cobrança: simulacao` e, pouco depois, `Sincronizar o IXC: N clientes`.
- No `caddy`: `certificate obtained successfully`. Se falhar, o DNS do domínio ainda não aponta para o servidor, ou as portas 80/443 estão fechadas.

Depois abra `https://backoffice.zon.ao` e entre com o administrador do `.env`.

## 8. Cópias de segurança diárias

Uma cópia já, e depois todos os dias às 03:15 (hora do servidor), guardando 14 dias em `/opt/zon-backoffice/backups`:

```bash
cd /opt/zon-backoffice && bash deploy/backup.sh
```

```bash
(crontab -l 2>/dev/null; echo '15 3 * * * cd /opt/zon-backoffice && bash deploy/backup.sh >> backups/backup.log 2>&1') | crontab - && crontab -l
```

As cópias ficam no mesmo servidor: de vez em quando descarregue-as para fora (ex.: com o WinSCP, pasta `/opt/zon-backoffice/backups`).

## 9. Atualizar para uma versão nova

Faz uma cópia da base de dados, descarrega a main, reconstrói e reinicia:

```bash
cd /opt/zon-backoffice && bash deploy/update.sh
```

## Comandos úteis

| Para | Comando |
|---|---|
| Ver o estado | `cd /opt/zon-backoffice && docker compose --profile https ps` |
| Ver erros recentes | `docker compose logs web worker --since 1h \| grep -iE 'erro\|error\|falh'` |
| Reiniciar depois de mudar o `.env` | `docker compose --profile https up -d --force-recreate web worker` |
| Parar tudo | `docker compose --profile https down` (os dados ficam) |
| Ver as cópias | `ls -lh /opt/zon-backoffice/backups` |

Nunca use `docker compose down -v`: o `-v` apaga a base de dados.

## Mais tarde

- **Boxes ZON TV**: o servidor a pôr na app é `https://backoffice.zon.ao`.
- **Webhook da AppyPay** (só ao passar o ciclo para `ativo`): `https://backoffice.zon.ao/api/appypay/webhook/<segredo>`, com o segredo de `APPYPAY_WEBHOOK_SECRET` no `.env` (`grep APPYPAY_WEBHOOK_SECRET .env`).
- **Passar a cobrar e a faturar**: ver "Passar do sistema antigo para o backoffice" e "Passar para produção" no README. Só depois de desligar as tarefas do sistema antigo.
