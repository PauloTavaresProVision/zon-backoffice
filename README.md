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
- **Utilizadores** e **Definições** (estado das integrações, tarefas automáticas, executar agora).
- Boxes e Canais & grelhas têm o lugar reservado: chegam com a ligação à API das TvBox.

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

Sem Docker, dentro de `web/`: `npm install`, `npm run db:migrate`, `npm run dev` (precisa de um Postgres e das variáveis do `.env`).

## Contentores

| Serviço | O quê |
|---|---|
| `db` | PostgreSQL 17, só em 127.0.0.1:5450 |
| `web` | Next.js 16 (porta 3000 no contentor, 127.0.0.1:4620 fora). Ao arrancar aplica as migrações |
| `worker` | Tarefas automáticas: emitir faturas (cada minuto), sincronizar o OfficeGest (`OFFICEGEST_SYNC_MINUTES`), expirar referências (10 min) |
| `officegest-mock` | Só no perfil `dev` |

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
compose.yaml            Docker: db, web, worker e (dev) officegest-mock
web/                    Aplicação Next.js
  src/app/              Páginas, rotas da API e ações do servidor
  src/lib/officegest/   Cliente da API, sincronização, emissão e PDF
  src/lib/db/schema.ts  Tabelas (Drizzle ORM); migrações em web/drizzle
  src/jobs/             worker, migrate e seed
dev/officegest-mock/    OfficeGest simulado para desenvolvimento
```

## Próximas fases

- **IXC**: clientes, contratos e planos.
- **AppyPay**: gerar referências e confirmar pagamentos.
- **WeSender**: SMS com a referência, lembretes e link da fatura.
- **API das TvBox**: boxes, aprovação de chaves, grelhas e packs.
