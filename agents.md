
## Objetivo
Construir e iterar uma extensão Chrome (Google Meet) com transcrição dual-channel (MIC/TAB) via AssemblyAI e geração de insights via backend (OpenAI).

## Arquivos-chave
- `MVP1.5-Meet-Coach-Spec.md` — especificação do produto/arquitetura
- `apps/extension/` — extensão MV3
- `apps/realtime-api/` — backend (VPS)
- `infra/` — docker-compose, nginx/caddy, scripts
- `db/` — migrations SQL

## Papéis dos “agents” (para Codex)
### 1) Agent: Extension Engineer
Responsável por:
- MV3 scaffold
- offscreen document
- captura MIC/TAB
- WS com AssemblyAI (2 streams)
- overlay UI no Meet
- reconexão e cleanup

Entregáveis:
- extensão funcionando em modo developer
- overlay com transcrição incremental
- logs claros de status

### 2) Agent: Realtime Backend Engineer
Responsável por:
- Node/TS Fastify
- WS insights
- endpoints de session/call
- persistência Postgres
- deploy via Docker na VPS

Entregáveis:
- `POST /calls`, `POST /calls/:id/stop`, `GET /calls/:id/report`
- `wss://.../ws` com push de insights
- schema e migrations SQL

### 3) Agent: Insight Engine (Rules + LLM)
Responsável por:
- regras de gatilho por categoria
- cooldown/dedupe
- prompts OpenAI (cards e relatório)
- validação com exemplos (frases do cliente)

Entregáveis:
- engine determinístico (regras) + LLM only-on-trigger
- output de card curto e acionável
- relatório pós-call consistente

### 4) Agent: QA + Demo Operator
Responsável por:
- checklist de demo
- testes de call 1–2h
- métricas de latência, quedas, falsos “cliente”
- registrar bugs e steps de reprodução

Entregáveis:
- roteiro de demo
- relatório de problemas e prioridades

## Regras de engenharia (para acelerar sem quebrar)
- Não passar áudio pelo backend no MVP: extensão -> AssemblyAI direto.
- Backend recebe apenas texto do CLIENTE e devolve insights.
- OpenAI só é chamado quando:
  - regra dispara (insight card)
  - call encerra (relatório final)
- Cooldown obrigatório (anti-spam).
- Logs sempre incluem `call_id`, `company_id`, `agent_id`.

## Convenções de mensagens (WS)
### client -> backend
- `client_segment`: { call_id, speaker:"CLIENTE", text, start_ms, end_ms, source:"TAB" }

### backend -> client
- `insight_event`: { type, confidence, quote, suggestions[], ts_ms }
- `status`: { ok, msg, latency_ms }

## Definition of Done (DoD) do MVP
- Call 1–2h sem crash/recarregar a extensão
- Transcrição MIC/TAB em tempo quase real no overlay
- Insights acionáveis (sem spam) aparecendo em frases típicas do cliente
- Relatório final gerado e armazenado por Empresa + Agente

## Como o Codex deve trabalhar (modo operacional)
- Sempre implementar em pequenos PRs por fase:
  - Fase 1: transcrição
  - Fase 2: insights ao vivo
  - Fase 3: persistência + relatório
- Sempre incluir:
  - logs
  - instruções de teste local
  - checklist de validação do PR

## Tarefas imediatas sugeridas (para Codex começar)
1) Criar scaffold `apps/extension` com MV3 + offscreen + content script
2) Criar overlay básico e canal de mensagens runtime
3) Implementar captura MIC e TAB (sem ASR)
4) Implementar WS com AssemblyAI e renderizar transcrição incremental
5) Criar scaffold `apps/realtime-api` com Fastify + WS
6) Implementar engine de regras + endpoint de report stub
