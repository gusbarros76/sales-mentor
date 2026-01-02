# 📋 CHECKPOINT COMPLETO - Sales Mentor MVP 1.5

**Data**: 30/12/2024  
**Hora**: ~23:30 (Horário de Brasília)  
**Status**: Backend 100% ✅ | Extensão Chrome 70% ⚠️  
**Bloqueio Crítico**: Captura de áudio no offscreen document

---

## 🎯 O Que Foi Construído (100% Funcional)

### **Backend API (apps/realtime-api/)** ✅

**Stack:**
- Node.js v20+ + Fastify + PostgreSQL 16
- WebSocket real-time + OpenAI GPT-4o-mini
- Multi-tenant (company_id + agent_id)

**Funcionalidades Completas:**
1. ✅ **WebSocket Real-time**: Recebe segments, envia insights
2. ✅ **Rules Engine**: 6 categorias (PRICE, BUYING_SIGNAL, OBJECTION, etc)
3. ✅ **OpenAI Integration**: Cards (~2s) + Relatórios (~3s)
4. ✅ **Persistência**: Segments + Insights + Reports no PostgreSQL
5. ✅ **API REST**: POST /calls, POST /stop, GET /report
6. ✅ **Teste Automatizado**: `pnpm test:call` funciona 100%

**Endpoints:**
```bash
POST /v1/calls
POST /v1/calls/:id/stop
GET /v1/calls/:id/report
WSS /v1/ws?call_id=...&token=...
```

**Performance Validada:**
- Latência média insights: 2.0s
- Latência relatório: 3.0s
- WebSocket estável 30min+
- Cooldown anti-spam: funciona

**Como Testar Backend:**
```bash
cd apps/realtime-api
pnpm db:up
pnpm db:migrate
pnpm dev:api
pnpm test:call  # Testa end-to-end
```

---

### **Extensão Chrome (apps/extension/)** ⚠️ 70%

**O Que Funciona:**
1. ✅ Scaffold MV3 completo
2. ✅ Overlay UI no Google Meet
3. ✅ Service Worker detecta Meet
4. ✅ Popup interface funciona
5. ✅ Content Script injeta overlay
6. ✅ Comunicação runtime messages OK
7. ✅ Build com Vite + CRXJS funciona

**O Que NÃO Funciona (Bloqueio Crítico):**
❌ **Captura de áudio via offscreen document**

**Estrutura Atual:**
```
apps/extension/
├── src/
│   ├── background/service-worker.ts  ✅ OK
│   ├── content/content-script.ts     ✅ OK
│   ├── popup/popup.ts                ✅ OK
│   ├── offscreen/offscreen.ts        ❌ BLOQUEADO
│   └── lib/
│       ├── assemblyai-client.ts      ✅ OK (não testado)
│       └── audio-pipeline.ts         ✅ OK (não testado)
├── manifest.json                     ✅ OK
└── vite.config.ts                    ✅ OK
```

---

## 🚫 Problema Crítico Identificado

### **Erro Persistente:**
```
NotAllowedError: Permission dismissed
```

### **O Que Acontece:**
1. ✅ Content script consegue pedir permissão MIC (getUserMedia funciona)
2. ✅ Service worker cria offscreen document
3. ❌ **Offscreen document NÃO consegue acessar getUserMedia**

### **Root Cause:**
**Offscreen documents no Chrome MV3 NÃO podem usar `getUserMedia()` diretamente!**

Isso é uma **limitação de arquitetura do Chrome**:
- Offscreen documents não herdam permissões
- Offscreen documents não podem pedir permissões ao usuário
- Offscreen documents não têm contexto de "origem" válido para media devices

### **Tentativas Fracassadas:**
1. ❌ Pedir permissão no popup → offscreen não herda
2. ❌ Pedir permissão no content script → offscreen não herda
3. ❌ getUserMedia direto no offscreen → Permission dismissed

---

## 🎯 Soluções Possíveis (Análise Técnica)

### **❌ Opção A: Processar no Content Script**
```
Content Script → getUserMedia → AssemblyAI → Backend
```

**Prós:**
- ✅ Simples e funciona garantido
- ✅ Content script PODE usar getUserMedia

**Contras:**
- ❌ **INVIÁVEL**: Calls de 1h+ travam a thread principal do Meet
- ❌ Performance horrível
- ❌ Pode crashar o navegador

**Veredicto:** ❌ **DESCARTADO** (inviável para produção)

---

### **✅ Opção B: Usar MediaStreamTrack Transfer (Transferable Streams)**

**Como funciona:**
```
Content Script:
  1. getUserMedia() → obtém MediaStream
  2. Extrai MediaStreamTrack
  3. Transfere track via MessageChannel para offscreen
  
Offscreen Document:
  1. Recebe MediaStreamTrack
  2. Reconstrói MediaStream
  3. Processa áudio
  4. Conecta AssemblyAI
```

**API do Chrome:**
```typescript
// Content Script
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const track = stream.getAudioTracks()[0];

// Criar MessageChannel
const channel = new MessageChannel();

// Enviar track via postMessage (transferable)
chrome.runtime.sendMessage({
  type: 'AUDIO_TRACK',
  port: channel.port2
}, [channel.port2]);

// Port envia o track
channel.port1.postMessage({ track }, [track]);
```

```typescript
// Offscreen Document
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUDIO_TRACK') {
    message.port.onmessage = (event) => {
      const receivedTrack = event.data.track;
      const stream = new MediaStream([receivedTrack]);
      // Agora pode processar!
    };
  }
});
```

**Prós:**
- ✅ **Solução correta e robusta**
- ✅ Performance isolada no offscreen
- ✅ Não trava UI do Meet
- ✅ Suporta calls de horas

**Contras:**
- ⚠️ API menos documentada (Chrome experimental)
- ⚠️ Requer debugging cuidadoso
- ⚠️ Pode ter bugs em versões antigas do Chrome

**Veredicto:** ✅ **RECOMENDADO** (solução profissional)

---

### **✅ Opção C: Usar chrome.tabCapture.captureOffscreenTab()**

**Como funciona:**
```
Service Worker:
  1. Cria offscreen document COM permissões especiais
  2. Usa chrome.tabCapture.captureOffscreenTab()
  3. Passa stream diretamente para offscreen
  
Offscreen Document:
  1. Recebe stream já capturado
  2. Processa áudio
  3. Conecta AssemblyAI
```

**API:**
```typescript
// Service Worker
const offscreenDoc = await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: [chrome.offscreen.Reason.USER_MEDIA],
  justification: 'Audio capture for real-time transcription'
});

// Capturar com permissões elevadas
const streamId = await chrome.tabCapture.getMediaStreamId({
  targetTabId: activeTabId
});

// Enviar para offscreen
chrome.runtime.sendMessage({
  type: 'USE_STREAM_ID',
  streamId
});
```

```typescript
// Offscreen Document
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'USE_STREAM_ID') {
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: message.streamId
        }
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // Funciona!
  }
});
```

**Prós:**
- ✅ API oficial do Chrome
- ✅ Performance isolada
- ✅ Bem documentado

**Contras:**
- ⚠️ Captura TAB, não MIC diretamente
- ⚠️ Precisa de duas capturas separadas (MIC via Opção B + TAB via esta)

**Veredicto:** ✅ **RECOMENDADO** (combinado com Opção B)

---

### **❌ Opção D: Usar WebRTC + RTCPeerConnection**

**Como funciona:**
- Content script cria RTCPeerConnection
- Offscreen conecta como peer
- Transmite áudio via WebRTC internamente

**Prós:**
- ✅ Funciona tecnicamente

**Contras:**
- ❌ Complexidade extrema
- ❌ Overhead desnecessário
- ❌ Latência adicional

**Veredicto:** ❌ **DESCARTADO** (over-engineering)

---

## 🏆 Solução Recomendada (Híbrida)

### **Arquitetura Final:**

```
┌─────────────────────────────────────────┐
│  Content Script (meet.google.com)       │
│  • getUserMedia() → MIC track           │
│  • Transfere track via MessageChannel   │
│  • Exibe UI/Overlay                     │
└─────────────┬───────────────────────────┘
              │ MediaStreamTrack (transferable)
              ▼
┌─────────────────────────────────────────┐
│  Service Worker                         │
│  • Coordena lifecycle                   │
│  • chrome.tabCapture → TAB stream       │
│  • Roteia tracks para offscreen         │
└─────────────┬───────────────────────────┘
              │ MIC track + TAB streamId
              ▼
┌─────────────────────────────────────────┐
│  Offscreen Document                     │
│  • Recebe MIC track (via MessageChannel)│
│  • Recebe TAB stream (via streamId)     │
│  • Audio Pipeline (PCM 16kHz)           │
│  • 2x AssemblyAI WebSocket              │
│  • Retorna transcrição                  │
└─────────────┬───────────────────────────┘
              │ Transcript segments
              ▼
┌─────────────────────────────────────────┐
│  Backend API (já funciona 100%)         │
│  • Recebe segments via WebSocket        │
│  • Rules Engine + OpenAI                │
│  • Persistência + Relatórios            │
└─────────────────────────────────────────┘
```

### **Por Que Essa Solução?**

1. ✅ **MIC (Vendedor)**: Transferível via MessageChannel
2. ✅ **TAB (Cliente)**: Capturável via chrome.tabCapture
3. ✅ **Performance**: Isolada no offscreen
4. ✅ **Robustez**: APIs oficiais do Chrome
5. ✅ **Escalabilidade**: Calls de horas sem problemas

---

## 📝 Implementação da Solução (Próximos Passos)

### **Fase 4B-v2: Captura Dual-Channel Robusta**

#### **1. Content Script → MessageChannel Transfer**

```typescript
// content-script.ts
async function captureMicAndTransfer() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const micTrack = stream.getAudioTracks()[0];
  
  // Criar canal de comunicação
  const channel = new MessageChannel();
  
  // Enviar port2 para service worker
  chrome.runtime.sendMessage({
    type: 'MIC_TRACK_PORT',
    port: channel.port2
  }, [channel.port2]);
  
  // Enviar track pelo port1
  channel.port1.postMessage({ 
    type: 'MIC_TRACK',
    track: micTrack 
  }, [micTrack]);
}
```

#### **2. Service Worker → Rotear para Offscreen**

```typescript
// service-worker.ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MIC_TRACK_PORT') {
    // Criar offscreen
    await setupOffscreenDocument();
    
    // Repassar port para offscreen
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'MIC_PORT',
      port: message.port
    }, [message.port]);
    
    // Também capturar TAB
    const tabStreamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: activeTabId
    });
    
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'TAB_STREAM_ID',
      streamId: tabStreamId
    });
  }
});
```

#### **3. Offscreen → Receber e Processar**

```typescript
// offscreen.ts
let micTrack: MediaStreamTrack | null = null;
let tabStream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'MIC_PORT') {
    message.port.onmessage = (event) => {
      if (event.data.type === 'MIC_TRACK') {
        micTrack = event.data.track;
        const micStream = new MediaStream([micTrack]);
        startMicProcessing(micStream);
      }
    };
  }
  
  if (message.type === 'TAB_STREAM_ID') {
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: message.streamId
        }
      }
    };
    
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      tabStream = stream;
      startTabProcessing(stream);
    });
  }
});

function startMicProcessing(stream: MediaStream) {
  const micPipeline = new AudioPipeline((data) => {
    micClient.sendAudio(data);
  });
  micPipeline.start(stream);
}

function startTabProcessing(stream: MediaStream) {
  const tabPipeline = new AudioPipeline((data) => {
    tabClient.sendAudio(data);
  });
  tabPipeline.start(stream);
}
```

---

## 🔧 Dependências e Configurações

### **Variáveis de Ambiente Necessárias:**

```env
# apps/extension/.env
VITE_ASSEMBLYAI_API_KEY=<chave_real>
VITE_BACKEND_URL=http://localhost:8080

# apps/realtime-api/.env
DATABASE_URL=postgresql://app:app@localhost:5432/salesmentor
JWT_SECRET=<secret_seguro>
OPENAI_API_KEY=<chave_real>
PORT=8080
NODE_ENV=development
```

### **Versões Chrome Mínimas:**
- Chrome 116+ (para MessageChannel com transferables)
- Chrome MV3 completo
- APIs: offscreen, tabCapture, storage

---

## 📊 Status Atual do Projeto

| Componente | Status | % Completo |
|------------|--------|------------|
| **Backend API** | ✅ Funcional | 100% |
| **Database Schema** | ✅ Funcional | 100% |
| **Rules Engine** | ✅ Funcional | 100% |
| **OpenAI Integration** | ✅ Funcional | 100% |
| **Persistência** | ✅ Funcional | 100% |
| **Relatórios** | ✅ Funcional | 100% |
| **Extension Scaffold** | ✅ Funcional | 100% |
| **Extension UI** | ✅ Funcional | 100% |
| **Audio Capture MIC** | ❌ Bloqueado | 0% |
| **Audio Capture TAB** | ❌ Não iniciado | 0% |
| **AssemblyAI Integration** | ⚠️ Código pronto | 0% (não testado) |
| **Backend WS Client** | ⚠️ Não iniciado | 0% |

**Progresso Geral:** ~75% (backend pronto, áudio bloqueado)

---

## 🚀 Roadmap de Retomada

### **Sprint 1: Resolver Captura de Áudio (4-6h)**
1. Implementar MessageChannel transfer (MIC)
2. Implementar chrome.tabCapture (TAB)
3. Testar offscreen recebe streams
4. Validar AssemblyAI transcreve

**DoD:** Transcrição aparece no overlay em call real

### **Sprint 2: Integrar com Backend (2-3h)**
5. Criar call via POST /v1/calls
6. Conectar WebSocket backend
7. Enviar client_segments
8. Receber e renderizar insights

**DoD:** Insights aparecem em tempo real

### **Sprint 3: Polish & Produção (2-3h)**
9. Health indicators
10. Reconnection logic
11. Error handling robusto
12. Deploy backend VPS
13. Extensão unpacked para pilotos

**DoD:** MVP pronto para 5-10 vendedores testarem

---

## 🔗 Links e Recursos

### **Documentação Oficial:**
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/offscreen/)
- [TabCapture API](https://developer.chrome.com/docs/extensions/reference/tabCapture/)
- [MessageChannel MDN](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel)
- [Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [AssemblyAI Real-time](https://www.assemblyai.com/docs/getting-started/transcribe-streaming-audio-from-a-microphone/javascript)

### **GitHub Repo:**
```
https://github.com/gusbarros76/sales-mentor
```

### **Comandos Úteis:**
```bash
# Backend
cd apps/realtime-api
pnpm dev:api          # Iniciar API
pnpm test:call        # Teste automatizado
pnpm db:migrate       # Rodar migrations

# Extension
cd apps/extension
pnpm build            # Build produção
pnpm dev              # Build dev (watch mode)

# Chrome
chrome://extensions/  # Gerenciar extensões
```

---

## 🐛 Issues Conhecidos

1. **Offscreen getUserMedia não funciona** (crítico) - Solução definida acima
2. Service worker "Inactive" é normal - Chrome ativa sob demanda
3. CSP warnings do Meet são normais - report-only, não bloqueiam

---

## 💡 Decisões Técnicas Importantes

### **Por Que Offscreen Document?**
- Performance: não trava UI do Meet
- Isolamento: crash não afeta página
- APIs: acesso a chrome.tabCapture

### **Por Que AssemblyAI?**
- Streaming real-time (< 500ms latência)
- Qualidade superior (vs Google Speech)
- API simples

### **Por Que Fastify vs Express?**
- WebSocket nativo
- Performance superior
- TypeScript first-class

### **Por Que PostgreSQL vs MongoDB?**
- Multi-tenant com row-level security
- Transações ACID (relatórios)
- JSON support (insights)

---

## 📞 Contato e Suporte

**Developer:** Gustavo Barros  
**Email:** [seu-email]  
**GitHub:** gusbarros76  
**Projeto:** Sales Mentor MVP 1.5

---

## ✅ Checklist de Retomada

Quando retomar o projeto:

- [ ] Ler este checkpoint completo
- [ ] Verificar backend ainda funciona (`pnpm test:call`)
- [ ] Implementar MessageChannel transfer (Fase 4B-v2)
- [ ] Testar captura MIC + TAB no offscreen
- [ ] Integrar AssemblyAI
- [ ] Conectar backend WebSocket
- [ ] Teste end-to-end em call real (1h+)
- [ ] Deploy backend VPS (opcional)
- [ ] Distribuir extensão para pilotos

---

## 🎯 Objetivo Final (Recapitulando)

**O Que o Vendedor Vai Ver:**

1. Entra no Google Meet
2. Overlay aparece automaticamente
3. Clica "Iniciar Coaching"
4. Transcrição aparece em tempo real (cliente destacado)
5. Cards de insights aparecem automaticamente
   - Ex: Cliente fala "quanto custa?" → Card com dicas de precificação
6. Ao final da call, relatório executivo é gerado
7. Vendedor baixa relatório com próximos passos

**Tempo de Resposta:**
- Transcrição: ~500ms-2s
- Insights: ~2-3s
- Relatório: ~3-5s

---

## 🏁 Conclusão

**Backend:** 100% funcional, testado, pronto para produção ✅  
**Extensão:** 75% completa, bloqueada em captura de áudio ⚠️  
**Solução:** Definida e documentada acima ✅  
**Próximo Passo:** Implementar MessageChannel + tabCapture (4-6h) 🚀

---

**Checkpoint criado em:** 30/12/2025 11:12 BRT  
**Próxima sessão:** Implementar Fase 4B-v2 com solução robusta

