# Zon Backoffice

Clientes, boxes, planos, canais, grelhas e pagamentos num único backoffice.

Junta num só sítio o que hoje está espalhado por três sistemas:

- **Faturação** (API .NET da Kimaudi): clientes do IXC, referências Multicaixa (AppyPay), SMS (WeSender) e renovações.
- **TvBox ZON** (API Python): boxes por serial, aprovação de instalações, grelhas versionadas e planos.
- **IXC Zon**: a fonte de verdade dos contratos e do estado do cliente.
- **OfficeGest**: as faturas de cada cliente e o PDF. Ver [docs/officegest.md](docs/officegest.md).

## Mockup do layout

O mockup em [`design/mockup`](design/mockup) é HTML/CSS/JS sem build. Todos os dados são fictícios.

```bash
python -m http.server 4610 --bind 127.0.0.1 --directory design/mockup
```

Depois abrir <http://127.0.0.1:4610>. Precisa de servidor porque os logótipos dos canais e os ícones não carregam por `file://`.

| Ecrã | Rota |
|---|---|
| Dashboard | `#/dashboard` |
| Clientes e ficha do cliente (com faturas e PDF) | `#/clientes`, `#/clientes/10418` |
| Boxes e aprovações | `#/boxes` |
| Planos | `#/planos` |
| Grelhas, catálogo e packs de canais | `#/canais`, `#/canais/catalogo`, `#/canais/packs` |
| Pagamentos por mês e faturas por emitir | `#/pagamentos` |
| Utilizadores e permissões | `#/utilizadores` |
| Definições (integrações, modelo de SMS, agendamentos) | `#/definicoes` |
| Entrar | `#/entrar` |

- Tema escuro por omissão, com claro no botão do topo.
- Responsivo: barra lateral em desktop, só ícones em tablet (≤1100px), barra de navegação inferior em telemóvel (≤760px).
- Pesquisa global com `Ctrl+K`.

## Fluxo de trabalho

- Nunca programar diretamente na `main`.
- Criar sempre a branch de trabalho a partir da `main`.
- Avisar antes de enviar para a `main`.
