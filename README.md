# Meet Coach — Monorepo scaffold

## Setup rápido
- `pnpm install`
- `cp .env.example .env`
- `pnpm db:up`
- `pnpm db:migrate`
- `pnpm db:seed` (opcional: cria empresa/owner/agent demo)
- `pnpm dev:api`

## Docker
- `pnpm db:up` sobe Postgres 16 em `localhost:5432` (user/password/db: `app/app/salesmentor`).
- Adminer opcional em `http://localhost:8081`.
- Se migration quebrar, resete o volume: `docker compose -f infra/docker-compose.dev.yml down -v && pnpm db:up && pnpm db:migrate`.

## API/WS rápido (localhost)
- Criar call: `curl -X POST http://localhost:8080/v1/calls -H 'content-type: application/json' -d '{"company_id":"<id>","agent_id":"<id>","title":"Demo"}'`
- A resposta traz `session_token` e `ws_url` para conectar no `wscat`.
- Enviar segmento via WS (ex.): `{"event":"client_segment","call_id":"<id>","speaker":"CLIENTE","text":"quanto custa?","source":"TAB"}`.
- Teste WS com wscat: `wscat -c "<ws_url>"` (use o ws_url retornado pelo POST).

## Estrutura
- `apps/realtime-api` — backend Fastify + WS insights
- `apps/extension` — extensão Chrome (placeholder)
- `packages/shared` — tipos/contratos compartilhados
- `db/migrations` — migrations SQL
- `infra/docker-compose.dev.yml` — serviços locais (Postgres + Adminer)
