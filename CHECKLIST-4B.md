# FASE 4B - Chrome Extension: Dual-Channel Audio Capture

## ✅ Objetivo
Capturar áudio dual-channel (MIC + TAB) do Google Meet, transcrever com AssemblyAI e enviar para backend.

## 🔧 Problemas Encontrados e Correções

### 1. **Permissão de Microfone em Offscreen Document**
- **Erro**: `NotAllowedError: Permission dismissed`
- **Causa**: Tentativa inicial de usar MessageChannel para transferir track
- **Solução**: Offscreen document pode chamar `getUserMedia()` diretamente (não precisa transferência)

### 2. **Permissão activeTab para tabCapture**
- **Erro**: `Extension has not been invoked for the current page (see activeTab permission)`
- **Causa**: Content script enviando mensagem não concede `activeTab`
- **Solução**: User deve clicar no ícone da extensão → Popup chama `chrome.tabCapture.getMediaStreamId()`

### 3. **Tab com Stream Ativo (Google Meet)**
- **Erro**: `Cannot capture a tab with an active stream`
- **Causa**: Google Meet já usa stream de áudio/vídeo
- **Solução**: Adicionar `consumerTabId` no `getMediaStreamId()` para compartilhar stream

### 4. **CORS ao Fazer Fetch do Service Worker**
- **Erro**: `CORS policy: No 'Access-Control-Allow-Origin' header`
- **Causa**: Service worker não pode fazer fetch para localhost
- **Solução**: Mover `fetch POST /v1/calls` para offscreen document

## 🏗️ Arquitetura Final

```
User clica ícone extensão → Popup abre (activeTab concedido)
  ↓
Popup: getMediaStreamId({ targetTabId, consumerTabId })
  ↓
Service Worker: Cria offscreen, envia streamId + tabId
  ↓
Offscreen Document:
  1. fetch POST /v1/calls → callId
  2. getUserMedia({ chromeMediaSource: 'tab', chromeMediaSourceId: streamId })
  3. getUserMedia({ audio: true })
  4. Dual AssemblyAI WebSocket (MIC + TAB)
  5. Backend WebSocket (segments + insights)
  ↓
Content Script: Exibe transcrições e insights no overlay
```

## 📦 Arquivos Principais

| Arquivo | Tamanho | Função |
|---------|---------|--------|
| `popup.html` | 1.52 kB | Botão "Iniciar Coaching", chama `tabCapture.getMediaStreamId()` |
| `service-worker.ts` | 2.27 kB | Orquestra offscreen document |
| `offscreen.ts` | 6.94 kB | Captura dual-channel, transcreve, envia para backend |
| `content-script.ts` | 3.49 kB | Overlay UI, exibe transcrições e insights |

## 🎯 Funcionalidades Implementadas

- ✅ Captura de áudio MIC (vendedor)
- ✅ Captura de áudio TAB (cliente do Meet)
- ✅ Transcrição dual-channel com AssemblyAI
- ✅ WebSocket backend para segments e insights
- ✅ Overlay UI no Google Meet
- ✅ Permissões corretas (activeTab + tabCapture)
- ✅ Compatível com Google Meet streams ativos

## 🧪 Como Testar

1. Recarregar extensão em `chrome://extensions/`
2. Entrar em reunião do Google Meet
3. Clicar no **ícone da extensão** (toolbar)
4. Clicar "Iniciar Coaching" no popup
5. Popup mostra "🟢 Coaching ativo!" e fecha
6. Overlay atualiza para "🟢 Ativo"
7. Transcrições aparecem em tempo real

## 📚 Referências

- [Chrome tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome activeTab Permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Recall.ai Chrome Extension Guide](https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension)
- [AssemblyAI Real-time API](https://www.assemblyai.com/docs/api-reference/realtime)
