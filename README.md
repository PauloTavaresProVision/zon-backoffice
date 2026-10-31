# Zon Backoffice

Clientes, pagamentos, faturas, boxes, planos e canais da ZON num único backoffice, no computador e no telemóvel.

O desenho aprovado está na branch `design/mockup-layout` (pasta `design/mockup`). Esta é a aplicação a sério.

## O que já faz

- **Entrar** com email e palavra-passe; perfis Administrador, Operador e Consulta.
- **Dashboard**: recebido no mês, estado das referências, emitido vs recebido, contratos a expirar, clientes por plano, faturação e atividade.
- **Clientes**: lista com filtros (ativos, a expirar, em atraso, inativos), pesquisa e paginação; ficha com contrato, referência Multicaixa, pagamentos, **faturas do OfficeGest em PDF** e histórico; ativar/desativar.
- **Pagamentos**: mês a mês, recebido por dia, filtros, exportar CSV para a contabilidade, faturas em falta com "Repetir agora".
- **Faturas OfficeGest**:
  - depois de cada pagamento confirmado, o worker emite a fatura-recibo no OfficeGest;
  - de hora a hora traz para a conta do cliente todas as faturas, incluindo as emitidas diretamente no OfficeGest;
  - o PDF fica guardado no volume `faturas`, abre dentro do backoffice e pode ser partilhado com um link assinado que expira em 30 dias.
- **Cobrança** (IXC + AppyPay + WeSender), ver abaixo: referência Multicaixa por cada título do IXC, SMS ao cliente, confirmação do pagamento e baixa no IXC.
- **Utilizadores** e **Definições** (estado das integrações, testar ligações, tarefas automáticas, executar agora).
- **Boxes** (app ZON TV), ver abaixo: pedidos de ativação, aprovar com o código da TV, bloquear, desassociar; estado de cada box na ficha do cliente.
- **Canais & grelhas**, ver abaixo: catálogo de canais, grelhas por plano com rascunho e versões publicadas, importar o XML do headend.

## Boxes ZON TV

A app Android ZON TV (versão de gestão) liga-se a este backoffice. O endereço a pôr na box é o `APP_URL`, que **tem de ser HTTPS** (a app recusa HTTP).

1. Na box, a app pede o servidor e o serial e envia um **pedido de ativação** com a chave pública que gerou (RSA 2048, guardada no AndroidKeyStore da box).
2. O pedido aparece em **Boxes** e na ficha de qualquer cliente. O operador escolhe o cliente e escreve o **código da instalação** que a TV mostra (12 caracteres). Sem o código certo não aprova: assim um serial copiado não serve para outra box.
3. Com a app aberta, a box sincroniza a cada minuto: pede um desafio (60 s, uso único) e assina-o com a chave. Recebe o estado, a grelha e a **conta do cliente**, que a app mostra em Definições: nome, plano, referência Multicaixa por pagar (entidade, referência, valor, data) ou o próximo pagamento.

Estado da box:

| Situação | Na box |
|---|---|
| Box bloqueada aqui, ou cliente desativado no backoffice | Bloqueada (sem canais) |
| Cliente inativo no IXC | Serviço inativo |
| Cliente em atraso | **Continua a ver TV**, com a referência nas Definições |
| Box sem cliente (desassociada) | À espera de aprovação |

Rotas da box (sem sessão, limitadas por IP e por serial, corpo até 16 KB): `POST /api/device/enroll`, `/api/device/challenge`, `/api/device/sync`. Uma reinstalação na mesma box gera chave nova e volta a pedir aprovação; a chave antiga deixa de servir quando a nova é aprovada.

## Canais & grelhas

- **Catálogo**: cada canal é um serviço do headend (endereço multicast e porta, únicos), com nome e uma das categorias que a app conhece. Os logótipos são os mesmos que a app traz, escolhidos pelo nome do canal. Um canal só se desativa depois de sair de todas as grelhas.
- **Importar XML**: o ficheiro DVB ServiceDiscovery do headend (o mesmo formato que a box aceita). Mostra primeiro o que muda: canais novos, nomes novos, os que faltam no XML. Não apaga nem desativa nada. Pode pôr a ordem do XML no rascunho de uma grelha.
- **Grelhas**: o número do canal na TV é a posição na grelha (1, 2, 3…). Arrastar, mudar o número, subir/descer, adicionar da biblioteca: cada alteração fica no **rascunho**, gravado sozinho, e as boxes não veem nada até alguém **publicar**. Antes de publicar o editor diz o que muda (canais novos, retirados, movidos, editados no catálogo, quantos mudam de número).
- **Versões**: cada publicação é uma fotografia (v1, v2…); editar o catálogo depois não mexe no que está publicado. Uma versão antiga pode voltar ao rascunho e ser publicada de novo.
- **Que grelha recebe cada box**: a do plano do cliente; se o plano não tiver grelha (ou a dele ainda não foi publicada), a **predefinida**. A box recebe a mudança na sincronização seguinte (até um minuto, mais até 30 s de cache).
- Perfis: o Operador mexe no catálogo e nos rascunhos; **publicar, escolher os planos de uma grelha, mudar a predefinida e apagar** é com o Administrador.

Na primeira migração o catálogo é criado com os 185 canais da grelha base e a versão que as boxes já tinham passa a ser a v1 da "Grelha base" (predefinida).

## Ciclo de cobrança

O worker faz, por esta ordem:

1. **Sincronizar o IXC** (`IXC_SYNC_MINUTES`, só leitura): clientes com contrato, contratos e títulos em aberto (`fn_areceber`). Os planos que ainda não existem são criados.
2. **Referências e SMS** (15 min): para cada título de um contrato ativo que vence nos próximos 7 dias (ou em atraso há menos de 30), cria **uma** referência na AppyPay. Vale até ao vencimento + 3 dias; em atraso, 7 dias. Envia SMS a 7, 3 e 1 dia, só das 8h às 20h de Luanda; em atraso, no máximo uma por semana. Agradece o pagamento por SMS.
3. **Confirmar pagamentos**: o webhook da AppyPay avisa logo; a cada 10 min as referências por pagar são verificadas. O estado é sempre lido na AppyPay e o valor tem de bater certo.
4. **Baixa no IXC** (cada minuto): liquida o título com a data do pagamento, confirma que ficou fechado e cria o título do período seguinte (se o IXC ainda não o tiver). Depois vem a fatura-recibo do OfficeGest.

Proteções: uma só referência viva por título (garantido pela base de dados); se o título for fechado no IXC por outra via, a nossa referência é anulada; um cliente desativado no backoffice sai do ciclo e a sincronização não o reativa; pagamentos em duplicado ou com valor diferente ficam no histórico para tratar à mão.

`CYCLE_MODE` decide o que corre:

| Modo | O que faz |
|---|---|
| `desligado` | Nada (por omissão) |
| `simulacao` | Lê o IXC e mostra em **Cobrança** as referências e SMS que faria. Não cria referências, não envia SMS, não escreve no IXC |
| `ativo` | Tudo |

O webhook a dar à AppyPay é `<APP_URL>/api/appypay/webhook/<APPYPAY_WEBHOOK_SECRET>` (segredo com pelo menos 24 caracteres).

### Passar do sistema antigo para o backoffice

**Só um sistema pode cobrar.** Com os dois a correr, o cliente recebe duas referências e duas SMS.

1. Pôr credenciais **novas** do IXC, AppyPay e WeSender no `.env` (não reutilizar as do sistema antigo).
2. `CYCLE_MODE=simulacao` durante uns dias: comparar em **Cobrança** o que o backoffice faria com o que o sistema antigo fez.
3. Testar o envio com `SMS_TEST_PHONE` (todas as SMS vão para esse número) e o botão "Enviar SMS de teste" nas Definições.
4. No dia da mudança (dia D):
   - no sistema antigo, desligar **a criação de referências e as SMS**, mas manter a confirmação de pagamentos e as baixas, para as referências que ele já emitiu;
   - pôr `CYCLE_FROM_DUE` = D + 8 dias: os títulos que vencem antes disso já têm referência do sistema antigo e ficam com ele;
   - esvaziar `SMS_TEST_PHONE`, pôr `CYCLE_MODE=ativo`, configurar o webhook na AppyPay e reiniciar o `worker` e o `web`.
5. Uns 40 dias depois, quando as referências do sistema antigo já expiraram, desligar o resto do sistema antigo e esvaziar `CYCLE_FROM_DUE`.

Se um título pago no backoffice já estiver liquidado no IXC (por exemplo, pago também com a referência antiga), fica um aviso no histórico do cliente para confirmar se pagou duas vezes.

## Separado de outros sistemas

O Zon Backoffice não partilha nada com o sistema antigo de faturação (.NET):

| | Zon Backoffice |
|---|---|
| Base de dados | **PostgreSQL 17** próprio, no contentor `db`, volume `pgdata` |
| Ficheiros (PDF) | Volume Docker `faturas` |
| Código e imagens | Este repositório; imagem local `zon-backoffice/web` |
| Integrações | Chaves próprias no `.env` deste servidor |

Só fala com o OfficeGest pela API oficial.

## Arrancar

Precisa de Docker. Na raiz do repositório:

```bash
cp .env.example .env
```

Preencher o `.env` e depois:

```bash
docker compose up -d --build
```

A app fica em http://127.0.0.1:4620. O primeiro administrador é criado com `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD`, só se ainda não houver utilizadores.

### Desenvolvimento com dados de demonstração

```bash
docker compose --profile dev up -d --build
```

O perfil `dev` junta um **OfficeGest simulado** (`dev/officegest-mock`, porta 4630). Os PDF que ele gera dizem "DOCUMENTO DE TESTE". Com `SEED_DEMO=true` e `SEED_OFFICEGEST_MOCK=true` a base de dados começa com 80 clientes fictícios, 7 meses de referências e faturas de instalação no OfficeGest simulado. Dois clientes têm falhas simuladas, para se ver o aviso "pagamentos sem fatura".

Junta também o **IXC, AppyPay e WeSender simulados** (`dev/integrations-mock`, porta 4640). Com `SEED_INTEGRATIONS_MOCK=true` os mesmos clientes ficam no IXC simulado, com contrato e títulos em aberto, e o ciclo corre de ponta a ponta sem tocar em nada verdadeiro. Na ficha do cliente aparece "Simular pagamento" (paga na AppyPay simulada, que chama o webhook). Para ver o que saiu: `http://127.0.0.1:4640/__dev/sms` (SMS) e `/__dev/state` (baixas no IXC). Para simular falhas: `POST /__dev/fail` com `{"target": "ixc.baixa" | "appypay.references" | "wesender", "times": 2}`.

Sem Docker, dentro de `web/`: `npm install`, `npm run db:migrate`, `npm run dev` (precisa de um Postgres e das variáveis do `.env`).

## Contentores

| Serviço | O quê |
|---|---|
| `db` | PostgreSQL 17, só em 127.0.0.1:5450 |
| `web` | Next.js 16 (porta 3000 no contentor, 127.0.0.1:4620 fora). Ao arrancar aplica as migrações |
| `worker` | Tarefas automáticas: ciclo de cobrança (ver acima), emitir faturas (cada minuto), sincronizar o OfficeGest (`OFFICEGEST_SYNC_MINUTES`), expirar referências (10 min) |
| `officegest-mock`, `integrations-mock` | Só no perfil `dev` |

## Passar para produção: atenção à faturação

**Só um sistema pode emitir faturas-recibo.** Enquanto o sistema antigo continuar a emitir, deixe `OFFICEGEST_ISSUE_FROM` vazio: o backoffice traz as faturas do OfficeGest para a conta dos clientes, mas não emite nenhuma.

No dia da mudança:

1. Desligar a emissão automática no sistema antigo.
2. Pôr nesse dia em `OFFICEGEST_ISSUE_FROM` (AAAA-MM-DD) e reiniciar o `worker`. Só os pagamentos a partir desse dia recebem fatura do backoffice.

Mesmo assim, o backoffice protege-se contra duplicados:

- cada pagamento fica reservado enquanto a fatura está a ser emitida;
- se uma tentativa falhar a meio, procura o documento já criado no OfficeGest antes de criar outro.

Confirmar com a contabilidade antes de ligar:

- o artigo da mensalidade (`OFFICEGEST_ARTICLE_ID`);
- a taxa de IVA (`OFFICEGEST_VAT_ID`);
- o NIF de consumidor final;
- os tipos de documento a trazer (`OFFICEGEST_DOC_TYPES`).

## Estrutura

```
compose.yaml            Docker: db, web, worker e (dev) os simuladores
web/                    Aplicação Next.js
  src/app/              Páginas, rotas da API e ações do servidor
  src/lib/officegest/   Cliente da API, sincronização, emissão e PDF
  src/lib/ixc/          Cliente do IXC e sincronização
  src/lib/appypay/      Cliente da AppyPay (referências e cobranças)
  src/lib/sms/          WeSender e registo das SMS
  src/lib/cycle/        Regras do ciclo, referências, confirmação e baixas
  src/lib/boxes/        Protocolo das boxes, conta na TV, que grelha recebe cada box e consultas
  src/lib/channels/     Catálogo, regras das grelhas (as mesmas da box), XML do headend e logótipos
  src/lib/db/schema.ts  Tabelas (Drizzle ORM); migrações em web/drizzle
  src/jobs/             worker, migrate e seed
dev/officegest-mock/    OfficeGest simulado para desenvolvimento
dev/integrations-mock/  IXC, AppyPay e WeSender simulados para desenvolvimento
```

## Próximas fases

- **Packs** de canais extra por cliente (precisa de os cobrar no ciclo).
- Link da fatura na SMS de pagamento recebido.
