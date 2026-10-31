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
- Boxes e Canais & grelhas têm o lugar reservado: chegam com a ligação à API das TvBox.

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
  src/lib/db/schema.ts  Tabelas (Drizzle ORM); migrações em web/drizzle
  src/jobs/             worker, migrate e seed
dev/officegest-mock/    OfficeGest simulado para desenvolvimento
dev/integrations-mock/  IXC, AppyPay e WeSender simulados para desenvolvimento
```

## Próximas fases

- **API das TvBox**: boxes, aprovação de chaves, grelhas e packs.
- Link da fatura na SMS de pagamento recebido.
