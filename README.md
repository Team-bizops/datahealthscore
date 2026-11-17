# Data Health Score · BizOps RankMyApp

Painel do Data Health Score lido direto da API do HubSpot.

## Como funciona
- `netlify/functions/dhs-run.mjs` (segundo plano, até 15 min): lê empresas, contatos, negócios, leads (SDRs e Executivos),
  clientes e contratos RMApp e grupos RMAds pela API do HubSpot, calcula os IDPs e grava em Netlify Blobs (`dhs`).
- `netlify/functions/dhs-agendado.mjs`: dispara a medição todo dia às 06:00 (Brasília).
- `netlify/functions/dhs-api.mjs`: `/api/data`, `/api/history`, `/api/status`, `/api/lista`, `/api/run` (botão "Atualizar agora").
- `public/index.html`: o painel.
- Regras e pesos: `netlify/functions/lib/rules.mjs` e `lib/config.mjs`.

## Variáveis de ambiente (Netlify > Project configuration > Environment variables, escopo Functions)
- `HUBSPOT_TOKEN` (obrigatória, marcar como secreta): token do Private App, só leitura.
  Escopos: crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, crm.objects.leads.read,
  crm.objects.custom.read, crm.schemas.custom.read, crm.schemas.contacts.read, crm.schemas.companies.read, crm.schemas.deals.read.
- `GRUPOS_OBJECT` (opcional): objeto do HubSpot usado como "grupo" de RMAds. Padrão: `p44530090_campanhas_rmads`.

## Deploy
Conectado ao Netlify (projeto bizops-datahealthscore): cada commit na branch main publica o painel.
Depois do primeiro deploy, abra o painel e clique em "Atualizar agora".

## Revisão de duplicidade no painel

Nas listas UNI-01, UNI-02 e UNI-03, o botão "Revisar grupo" grava a decisão da BizOps em /api/revisao (código em DHS_REVISAO_CODIGO). Na medição seguinte, os registros aprovados entram na faixa "Aprovado na revisão" e a automação do n8n executa; os marcados como outra empresa saem da duplicidade e são renomeados.
