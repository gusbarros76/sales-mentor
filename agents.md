
## Objetivo
Construir e iterar uma extensão Chrome (Google Meet) com transcrição via **Google Meet Closed Captions** (legendas nativas) e geração de insights em tempo real via backend (OpenAI).

## Arquitetura Atual vs MVP Spec

### Implementação Atual (Fase 1 Simplificada) ✅

**Transcrição:**
- Extensão monitora **Google Meet Closed Captions** via MutationObserver
- Extrai texto do DOM com limpeza agressiva de artefatos UI
- Debounce de 500ms para estabilizar texto
- Speaker detection por keywords + timing (3s de silêncio)

**Fluxo:**
```
Google Meet CC (legendas nativas)
  → DOM MutationObserver
  → Content Script (limpeza + speaker detection)
  → WebSocket Backend
  → Rules Engine + OpenAI
  → Insights retornados ao overlay
```

**Limitações conhecidas:**
- Depende da qualidade das legendas do Google Meet
- Speaker detection é heurística (não 100% precisa)
- Requer que usuário ative CC no Meet
- Sujeito a mudanças no DOM do Google Meet

### MVP Spec Original (Planejado para Fase 2) ⚠️

**Transcrição planejada (não implementada):**
- Captura dual-channel MIC (vendedor) + TAB (cliente)
- Streaming direto para AssemblyAI via 2 WebSockets
- Offscreen document para processamento de áudio
- Speaker detection nativo (por canal de áudio)

**Status:** Bloqueado em captura de áudio (ver `CHECKPOINT-30-12-2025.md`)

**Próximos passos (Fase 2):**
1. Implementar MessageChannel transfer para MIC
2. Implementar chrome.tabCapture para TAB
3. Migrar de Google Meet CC para AssemblyAI
4. Offscreen document para processamento isolado

## Arquivos-chave
- `MVP1.5-Meet-Coach-Spec.md` — especificação do produto/arquitetura (original)
- `CHECKPOINT-30-12-2025.md` — documentação técnica completa da implementação atual
- `CHECKLIST-4B.md` — roadmap para Fase 2 (captura de áudio)
- `apps/extension/` — extensão MV3 (Google Meet CC)
- `apps/realtime-api/` — backend (Node.js + Fastify + PostgreSQL)
- `infra/` — docker-compose (PostgreSQL)
- `db/` — migrations SQL

## Stack Tecnológico Atual

### Extensão Chrome
- **MV3** (Manifest V3)
- **Vite** + CRXJS (build)
- **TypeScript**
- **Google Meet Closed Captions** (DOM scraping via MutationObserver)
- **WebSocket client** (conexão com backend)

### Backend
- **Node.js 20+** + TypeScript
- **Fastify** + @fastify/websocket
- **PostgreSQL 16** (multi-tenant: companies, users, agents, calls, segments, insights, reports)
- **OpenAI GPT-4o-mini** (insights + relatórios)
- **Zod** (validação de schemas)

## Papéis dos "agents" (para Codex)

### 1) Agent: Extension Engineer
Responsável por:
- MV3 scaffold ✅
- Monitoramento de **Google Meet Closed Captions** via MutationObserver ✅
- Extração de texto do DOM com limpeza de artefatos ✅
- Speaker detection via heurísticas (keywords + timing) ✅
- Debounce e deduplicação de texto ✅
- Overlay UI no Meet ✅
- WebSocket client conectado ao backend ✅
- Reconexão e cleanup ✅

Entregáveis:
- ✅ Extensão funcionando em modo developer
- ✅ Overlay com transcrição extraída do Meet CC
- ✅ WebSocket conectado ao backend
- ✅ Logs claros de status

**Próxima fase (não implementada):**
- Captura MIC/TAB via MessageChannel + chrome.tabCapture
- WS com AssemblyAI (2 streams)
- Offscreen document

### 2) Agent: Realtime Backend Engineer ✅
Responsável por:
- ✅ Node/TS Fastify
- ✅ WS insights (real-time push)
- ✅ Endpoints de session/call
- ✅ Persistência Postgres (multi-tenant)
- ✅ Deploy via Docker Compose

Entregáveis:
- ✅ `POST /v1/calls` — cria sessão
- ✅ `POST /v1/calls/:id/stop` — encerra call + gera relatório
- ✅ `GET /v1/calls/:id/report` — retorna relatório
- ✅ `WSS /v1/ws?call_id=...&token=...` — push de insights
- ✅ Schema e migrations SQL

### 3) Agent: Insight Engine (Rules + LLM) ✅
Responsável por:
- ✅ Regras de gatilho por categoria (6 categorias: PRICE, BUYING_SIGNAL, OBJECTION, HOW_IT_WORKS, NEXT_STEP, RISK)
- ✅ Cooldown/dedupe (90-120s por categoria)
- ✅ Prompts OpenAI (cards e relatório)
- ✅ Validação com exemplos (frases do cliente)

Entregáveis:
- ✅ Engine determinístico (regras) + LLM only-on-trigger
- ✅ Output de card curto e acionável
- ✅ Relatório pós-call consistente

### 4) Agent: QA + Demo Operator
Responsável por:
- Checklist de demo
- Testes de call 1-2h
- Métricas de latência, quedas, falsos "cliente"
- Registrar bugs e steps de reprodução

Entregáveis:
- Roteiro de demo
- Relatório de problemas e prioridades

## Regras de engenharia (para acelerar sem quebrar)

- **Não passar áudio pelo backend no MVP**: extensão extrai texto das legendas do Google Meet (não captura áudio).
- **Backend recebe apenas texto já transcrito** pelo Google Meet.
- **OpenAI só é chamado quando**:
  - Regra dispara (insight card)
  - Call encerra (relatório final)
- **Cooldown obrigatório** (anti-spam): 90-120s por categoria.
- **Logs sempre incluem** `call_id`, `company_id`, `agent_id`.

## Convenções de mensagens (WS)

### client -> backend
```typescript
{
  event: "client_segment",
  call_id: string,              // UUID da sessão
  speaker: "CLIENTE" | "VENDEDOR",  // Detectado por heurística
  text: string,                 // Extraído do DOM do Meet
  start_ms: number,             // Offset desde início da call
  end_ms: number,               // start_ms + 500
  source: "TAB",                // Sempre TAB (CC do Meet)
  asr_confidence: 0.9,          // Fixo (confiança das legendas do Meet)
  is_echo_suspected: false      // Sempre false por enquanto
}
```

### backend -> client
```typescript
// Status message
{
  event: "status",
  ok: boolean,
  msg?: string,
  latency_ms?: number
}

// Insight card
{
  event: "insight_event",
  call_id: string,
  type: "PRICE" | "BUYING_SIGNAL" | "OBJECTION" | "HOW_IT_WORKS" | "NEXT_STEP" | "RISK",
  confidence?: number,          // 0-1
  quote: string,                // Frase do cliente que disparou
  suggestions: string[],        // 2-3 sugestões acionáveis
  ts_ms: number                 // Timestamp
}
```

## Definition of Done (DoD) do MVP

- ✅ Call 1-2h sem crash/recarregar a extensão
- ✅ Transcrição via **Google Meet CC** em tempo quase real no overlay
- ✅ Speaker detection funcional (heurístico)
- ✅ Insights acionáveis (sem spam) aparecendo em frases típicas do cliente
- ✅ Relatório final gerado e armazenado por Empresa + Agente
- ✅ Backend 100% funcional com PostgreSQL

## Como o Codex deve trabalhar (modo operacional)

- Sempre implementar em pequenos PRs por fase:
  - ✅ Fase 1: transcrição (via Google Meet CC)
  - ✅ Fase 2: insights ao vivo
  - ✅ Fase 3: persistência + relatório
  - ⚠️ Fase 4 (futura): captura de áudio + AssemblyAI
- Sempre incluir:
  - Logs
  - Instruções de teste local
  - Checklist de validação do PR

## Status Atual das Tarefas

### ✅ Completo
1. ✅ Extensão MV3 com overlay no Google Meet
2. ✅ Monitoramento de Google Meet CC via MutationObserver
3. ✅ Speaker detection heurístico (CLIENTE/VENDEDOR)
4. ✅ Backend Fastify + WebSocket + PostgreSQL
5. ✅ Rules Engine (6 categorias) + Cooldown
6. ✅ Integração OpenAI (insights + relatórios)
7. ✅ Persistência completa (segments + insights + reports)

### ⚠️ Bloqueado / Próxima Fase
8. ⚠️ Captura de áudio dual-channel MIC/TAB (ver `CHECKPOINT-30-12-2025.md`)
9. ⚠️ Integração com AssemblyAI (código pronto, não testado)
10. ⚠️ Offscreen document com processamento isolado

## Como Testar o Sistema Atual

### Backend (100% funcional)
```bash
cd apps/realtime-api
pnpm db:up          # Inicia PostgreSQL via Docker
pnpm db:migrate     # Roda migrations
pnpm db:seed        # Cria empresa/agente demo
pnpm dev:api        # Inicia servidor (porta 8080)
pnpm test:call      # Testa end-to-end com simulação
```

### Extensão (Google Meet CC)
```bash
cd apps/extension
pnpm build          # Build produção

# Chrome
1. Abrir chrome://extensions/
2. Ativar "Modo do desenvolvedor"
3. Clicar "Carregar sem compactação"
4. Selecionar pasta apps/extension/dist/

# Testar
1. Entrar em meet.google.com/nova-reuniao
2. Ativar Closed Captions no Meet (botão CC)
3. Clicar na extensão e "Iniciar Coaching"
4. Falar e verificar transcrição aparecendo no overlay
5. Testar frases que disparam insights (ver abaixo)
```

### Verificar Insights em Tempo Real
Frases de teste que devem disparar insights:
- **PRICE**: "quanto custa", "qual o valor", "preço"
- **OBJECTION**: "muito caro", "preciso pensar", "sem orçamento"
- **BUYING_SIGNAL**: "quero fechar", "vamos avançar", "tenho interesse"
- **HOW_IT_WORKS**: "como funciona", "me explica"
- **NEXT_STEP**: "próximo passo", "manda proposta"
- **RISK**: "não tenho certeza", "preocupado", "garantia"

## Limitações Conhecidas

1. **Dependência do Google Meet CC**: Requer que usuário ative legendas no Meet
2. **Speaker detection heurístico**: Não 100% preciso (usa keywords + timing)
3. **Sujeito a mudanças no DOM**: Google pode alterar estrutura das legendas
4. **Não funciona offline**: Requer internet para legendas e backend
5. **Latência das legendas**: ~1-3s de delay das legendas do Meet

## Próximos Passos (Fase 2)

1. **Captura de áudio dual-channel**:
   - Implementar MessageChannel transfer para MIC
   - Implementar chrome.tabCapture para TAB
   - Offscreen document para processamento isolado

2. **Migração para AssemblyAI**:
   - Substituir Google Meet CC por transcrição própria
   - Streaming real-time via 2 WebSockets
   - Speaker detection nativo por canal

3. **Melhorias**:
   - Remoção de dependência do Google Meet CC
   - Speaker detection 100% preciso
   - Menor latência (~500ms vs 1-3s)

Ver `CHECKPOINT-30-12-2025.md` e `CHECKLIST-4B.md` para detalhes técnicos.

## Referências

- **MVP Spec Original**: `MVP1.5-Meet-Coach-Spec.md` (arquitetura planejada)
- **Checkpoint Técnico**: `CHECKPOINT-30-12-2025.md` (implementação atual)
- **Checklist Fase 4B**: `CHECKLIST-4B.md` (próximos passos)
- **Backend API**: `apps/realtime-api/src/routes/calls.ts`
- **Extension Content Script**: `apps/extension/src/content/content-script.ts`

---

**Última atualização**: 02/01/2026
**Status**: Backend 100% ✅ | Extensão (Google Meet CC) 100% ✅ | Captura de áudio ⚠️ Fase 2
