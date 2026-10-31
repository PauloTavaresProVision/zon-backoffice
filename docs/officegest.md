# OfficeGest: faturas na conta do cliente

O backoffice tem de mostrar, na ficha de cada cliente, **todas** as faturas que o OfficeGest tem para ele, com o PDF. Inclui as que o backoffice emite depois de cada pagamento e as que a Zon emite diretamente no OfficeGest (instalações, acertos, notas de crédito).

## Como funciona hoje (API .NET antiga)

Código em `Kimaudi/api-backoffice-faturacao-zon`: `OfficeGestClient.cs` e `PaymentService.GenerateInvoiceForPaymentAsync`.

1. A AppyPay confirma o pagamento da referência.
2. O job `GenerateInvoiceWorker` chama `POST /payment/generate-invoices`.
3. Para cada pagamento pago sem fatura:
   - procura o cliente no OfficeGest e cria-o se não existir;
   - cria a fatura-recibo com `POST /sales/documents/fr`;
   - pede o PDF com `GET /sales/documents/fr/{n}?print=A`, que devolve um URL em `pdf`, e descarrega-o;
   - guarda o PDF num bucket S3/MinIO (`zon-bucket`, Contabo) e regista número e ficheiro na tabela `Invoice`.
4. O frontend lista com `GET /payment/invoices/{contractId}` e abre o PDF por um URL temporário (`POST /file/temporary-urls-file`, válido 1 h).

A reserva de 15 minutos por pagamento (`TryClaimInvoiceAsync`) evita faturas duplicadas e deve manter-se.

## Problemas a não repetir

| # | Problema | Onde | Efeito |
|---|---|---|---|
| 1 | O URL aponta para `taag.officegest.com` | `appsettings*.json` | É a conta da TAAG (resto do fork). Se o servidor não o substituir, as faturas da Zon são emitidas na empresa errada |
| 2 | Credenciais do OfficeGest no repositório | `appsettings.json` | Rodar a chave e passar a variável de ambiente |
| 3 | `IdArticle` só existe em `appsettings.Development.json` | configuração | Em produção, sem variável de ambiente, a criação da fatura falha |
| 4 | O NIF enviado é o número de telefone | `CustomerTaxId = customer.MobilePhone` | Faturas com NIF errado. Usar o NIF real ou "consumidor final" (confirmar com a contabilidade da Zon) |
| 5 | Email inventado `<9 caracteres>@gmail.com` quando o cliente não tem email | `CreateOfficeGestCustomerAsync` | Pode ser o email de outra pessoa. Hoje não se envia (`sendemail=0`), mas é um risco |
| 6 | IVA fixo: `vatid=0`, `re=5` | `DocumentLine` | Confirmar com a contabilidade a taxa ou isenção correta |
| 7 | Só mostra as faturas que o próprio sistema criou | `GetInvoicesByContractAsync` lê a tabela local | As faturas emitidas no OfficeGest não aparecem ao cliente |
| 8 | O frontend chama rotas que a API não tem | `/invoices/public/{token}`, `/payment/generate-invoice/{id}` | Dão 404: a página pública da fatura e o botão "gerar fatura" não funcionam |

## API do OfficeGest (v1)

Confirmado em <https://api.officegest.com/docs/officegest-api/v1>. Autenticação HTTP Basic (`utilizador:chave`), sempre a partir do servidor e nunca do browser.

| Para quê | Pedido |
|---|---|
| Tipos de documento da conta | `GET /sales/documents` |
| Documentos de um cliente | `GET /sales/documents/{tipo}?filter[idcustomer]={id}&order=date&sorder=DESC&limit=50&offset=0` |
| Detalhe e PDF | `GET /sales/documents/{tipo}/{número}?print=A`. A API antiga lê o URL do PDF no campo `pdf` |
| Emitir fatura-recibo | `POST /sales/documents/{tipo}` (a API antiga usa `fr`) |
| Clientes | `GET /entities/customers?filter[id]=…`, `POST /entities/customers` |

A listagem também filtra por `date`, `date_alter`, `state` e `documentnumber`, com `operator` (`>=`, `<=`, `like`…). Isto permite sincronizar só o que mudou.

Falta confirmar na conta da Zon:

- os códigos de tipo (`GET /sales/documents`): FR, FT, NC, RE;
- o significado dos valores de `print` (`A`, `T`, `O`).

## No Zon Backoffice

- **Ligação de clientes.** Na tabela que une os sistemas, cada cliente do IXC guarda o seu `idcustomer` do OfficeGest. A correspondência faz-se pelo NIF; se o cliente não existir no OfficeGest, cria-se.
- **Sincronização (a cada hora).** Para cada cliente ligado, lista os documentos de cada tipo alterados desde a última execução (`filter[date_alter]` com `operator=>=`). Guarda número, tipo, data, total, estado e se está anulado.
- **PDF.**
  - Pedido ao OfficeGest na primeira vez que alguém o abre.
  - Fica guardado no MinIO do próprio Docker e é servido pelo backend com sessão.
  - Um documento emitido não muda; se for anulado, a sincronização atualiza o estado.
- **Depois de cada pagamento.** Emite a fatura-recibo com a mesma reserva anti-duplicados e guarda o PDF. Envia por SMS um link público assinado, que expira, para o cliente ver a fatura.
- **Falhas.**
  - Repetir com espera crescente.
  - Mostrar em Pagamentos o aviso "pagamentos sem fatura" com o botão "Repetir agora".
  - Mostrar o filtro "Sem fatura".

O mockup mostra isto na ficha do cliente (cartão **Faturas** e pré-visualização do PDF), em **Pagamentos** (número da fatura em cada pagamento, aviso e filtro) e em **Definições** (integração e agendamentos).
