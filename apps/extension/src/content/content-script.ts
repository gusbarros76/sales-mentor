console.log('[SalesMentor] Content script loaded');

import config from '../config';

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let isCapturing = false;
let backendWs: WebSocket | null = null;
let callId: string | null = null;
let sessionToken: string | null = null;
let overlayElement: HTMLElement | null = null;
let captionObserver: MutationObserver | null = null;
let isMinimized = false;
let hideStyleEl: HTMLStyleElement | null = null;
let callStartTime = 0; // Timestamp de quando call iniciou (para cálculo de offset)

// Nova abordagem: Debounce + última frase
let captionDebounceTimer: number | null = null;
let lastProcessedText = ''; // Hash da última frase processada
let lastCaptionTime = 0;
let lastSpeaker: 'CLIENTE' | 'VENDEDOR' = 'CLIENTE';

const BACKEND_URL = config.backendUrl;
const WS_URL = config.wsUrl;
const CAPTION_DEBOUNCE_MS = 500;
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const VENDEDOR_KEYWORDS = [
  'como posso ajudar',
  'deixa eu explicar',
  'nosso produto',
  'vou te mostrar',
  'a gente oferece'
];

// ============================================
// HELPERS
// ============================================
function simpleHash(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractCleanText(container: HTMLElement): string {
  // Método 1: innerText (remove hidden)
  let text = container.innerText?.trim();

  if (!text || text.length === 0) {
    // Fallback: text nodes
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textParts: string[] = [];
    let node: Node | null;

    // eslint-disable-next-line no-cond-assign
    while ((node = walker.nextNode())) {
      const content = node.textContent?.trim();
      if (content && content.length > 0) {
        // Filtrar UI artifacts
        if (!content.match(/^(arrow_|chevron_|expand_|close_|menu_)/i)) {
          textParts.push(content);
        }
      }
    }

    text = textParts.join(' ');
  }

  if (!text) return '';

  // LIMPEZA AGRESSIVA E NORMALIZAÇÃO INTELIGENTE
  text = text
    // 1. Remover UI artifacts
    .replace(/arrow_\w+/gi, '')
    .replace(/chevron_\w+/gi, '')
    .replace(/expand_\w+/gi, '')
    .replace(/para o fim/gi, '') // Google Meet artifact

    // 2. Normalizar espaços múltiplos
    .replace(/\s+/g, ' ')

    // 3. CRÍTICO: Separar palavras grudadas
    // "VocêOi" → "Você Oi"
    // "VocêTeste" → "Você Teste"
    // Padrão: minúscula seguida de MAIÚSCULA = fronteira de palavra
    .replace(/([a-zà-ú])([A-ZÀÚÂÊÔÃÕ])/g, '$1 $2')

    // 4. Separar número seguido de letra maiúscula
    // "três.Um" → "três. Um"
    .replace(/(\d)([A-ZÀÚÂÊÔÃÕ])/g, '$1 $2')

    // 5. Separar pontuação grudada em maiúscula
    // ".Um" → ". Um"
    .replace(/([.,!?])([A-ZÀÚÂÊÔÃÕ])/g, '$1 $2')

    // 6. Remover chars especiais (manter acentos PT-BR)
    .replace(/[^\w\sà-úÀ-Ú.,!?-]/g, '')

    // 7. Normalizar espaços novamente (após inserções)
    .replace(/\s+/g, ' ')

    .trim();

  return text;
}

function detectSpeaker(text: string): 'CLIENTE' | 'VENDEDOR' {
  const now = Date.now();
  const timeSinceLastCaption = lastCaptionTime ? now - lastCaptionTime : 0;

  if (lastCaptionTime && timeSinceLastCaption > 3000) {
    lastSpeaker = lastSpeaker === 'CLIENTE' ? 'VENDEDOR' : 'CLIENTE';
    console.log('[Content] 🔄 Mudança de speaker detectada (pausa)');
  }

  lastCaptionTime = now;

  const textLower = text.toLowerCase();
  if (VENDEDOR_KEYWORDS.some((kw) => textLower.includes(kw))) {
    lastSpeaker = 'VENDEDOR';
    console.log('[Content] 🎤 Speaker: VENDEDOR (keywords)');
  }

  return lastSpeaker;
}

function clearCaptionState() {
  if (captionDebounceTimer) {
    clearTimeout(captionDebounceTimer);
    captionDebounceTimer = null;
  }
  lastProcessedText = '';
  lastCaptionTime = 0;
  lastSpeaker = 'CLIENTE';
}

async function clearStoredSession() {
  try {
    await chrome.storage.local.remove([
      'activeSession',
      'call_id',
      'callId',
      'session_token',
      'token',
      'isCapturing',
      'backend_url',
      'backend_ws_url'
    ]);
  } catch (error) {
    console.warn('[Content] Falha ao limpar sessão do storage', error);
  }
}

// ============================================
// LISTENER PRINCIPAL
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] 📨 Message received:', message.type);

  if (message.type === 'COACHING_STARTED') {
    callId = message.call_id;
    sessionToken = message.token;

    console.log('[Content] 🎯 COACHING_STARTED:', {
      callId,
      token: sessionToken?.substring(0, 20) + '...'
    });

    // Iniciar pipeline completo de CC
    startCaptionsPipeline(callId, sessionToken);

    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'COACHING_STOPPED') {
    stopCapture();
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// ============================================
// SESSÃO EXISTENTE (PERSISTÊNCIA)
// ============================================
async function checkExistingSession() {
  try {
    const result = await chrome.storage.local.get('activeSession');
    const session = result?.activeSession;

    if (!session) return;

    const age = Date.now() - (session.started_at || 0);
    if (age > SESSION_MAX_AGE_MS) {
      console.log('[Content] 🗑️ Sessão expirada, limpando storage');
      await clearStoredSession();
      return;
    }

    if (session.meet_url && !window.location.href.includes('meet.google.com')) {
      console.log('[Content] ⚠️ Sessão encontrada mas URL não é Meet, ignorando');
      return;
    }

    // CRÍTICO: Verificar se é o MESMO Meet (mesma URL)
    if (session.meet_url && session.meet_url !== window.location.href) {
      console.log('[Content] ⚠️ Sessão de outro Meet detectada');
      console.log('[Content]   - Sessão antiga:', session.meet_url);
      console.log('[Content]   - Meet atual:', window.location.href);
      console.log('[Content] 🗑️ Limpando sessão antiga e criando nova');
      await clearStoredSession();
      return;
    }

    console.log('[Content] ♻️ Recuperando sessão existente do storage');
    callId = session.call_id;
    sessionToken = session.token;
    await startCaptionsPipeline(session.call_id, session.token);
  } catch (error) {
    console.warn('[Content] Falha ao recuperar sessão existente', error);
  }
}

// ============================================
// PIPELINE DE CLOSED CAPTIONS
// ============================================
async function startCaptionsPipeline(call_id: string, token: string) {
  if (isCapturing) {
    console.log('[Content] ⚠️ Pipeline já está em execução');
    return;
  }

  // Marcar início da call para cálculo de offset
  callStartTime = Date.now();
  console.log('[Content] ⏰ Call iniciou em:', callStartTime);

  callId = call_id;
  sessionToken = token;

  console.log('[Content] 🚀 Iniciando pipeline de Closed Captions...');
  isCapturing = true;
  clearCaptionState();

  // 1. Ativar CC
  enableClosedCaptions();

  // 2. Esconder CC com CSS
  hideClosedCaptions();

  // 3. Conectar WebSocket backend
  connectBackendWebSocket(call_id, token);

  // 4. Iniciar MutationObserver
  startCaptionsObserver();

  // 5. Criar/mostrar overlay
  createOverlayUI();

  console.log('[Content] ✅ Pipeline iniciado');
}

// ============================================
// ATIVAR CLOSED CAPTIONS
// ============================================
function enableClosedCaptions() {
  console.log('[Content] 🎬 Tentando ativar Closed Captions...');

  // Seletores possíveis (2024/2025)
  const ccButtonSelectors = [
    'button[aria-label*="captions" i]',
    'button[aria-label*="legendas" i]',
    'button[data-tooltip*="caption" i]',
    '[jsname="r8qRAd"]',
    'button[aria-label*="subtitle" i]'
  ];

  for (const selector of ccButtonSelectors) {
    const button = document.querySelector(selector) as HTMLButtonElement;
    if (button) {
      const isPressed = button.getAttribute('aria-pressed') === 'true';
      console.log('[Content] 🔍 Found CC button:', selector, 'pressed:', isPressed);

      if (!isPressed) {
        button.click();
        console.log('[Content] ✅ CC ativado!');
        return;
      } else {
        console.log('[Content] ℹ️ CC já está ativo');
        return;
      }
    }
  }

  console.warn('[Content] ⚠️ CC button não encontrado');
}

// ============================================
// ESCONDER CC COM CSS INJECTION
// ============================================
function hideClosedCaptions() {
  console.log('[Content] 🎨 Injetando CSS para esconder CC...');

  const existing = document.getElementById('sales-mentor-hide-cc');
  if (existing) {
    existing.remove();
  }

  const style = document.createElement('style');
  style.id = 'sales-mentor-hide-cc';
  style.textContent = `
    /* Esconder CC do Google Meet */
    [aria-live="polite"],
    [aria-live="assertive"],
    .a4cQT,
    .iOzk7,
    [jsname="dsyhDe"],
    [jsname="YSxPC"],
    .iOzk7.RDPZE {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
  hideStyleEl = style;
  console.log('[Content] ✅ CC escondido via CSS');
}

// ============================================
// CONECTAR BACKEND WEBSOCKET
// ============================================
function connectBackendWebSocket(call_id: string, token: string) {
  const wsUrl = `${WS_URL}/v1/ws?call_id=${call_id}&token=${encodeURIComponent(token)}`;

  console.log('[Content] 🔌 Conectando WebSocket backend:', wsUrl);

  backendWs = new WebSocket(wsUrl);

  backendWs.onopen = () => {
    console.log('[Content] ✅ Backend WebSocket conectado');
  };

  backendWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[Content] 📨 Backend message:', data);

      // Status updates (connected, received, segment saved)
      if (data.status) {
        console.log(`[Content] ℹ️ Status: ${data.status}`);
        // Backend sempre retorna "received" ou "segment saved"
        // Não existe "invalid payload" real
      }

      // Status com event (formato alternativo)
      if (data.event === 'status') {
        console.log('[Content] ℹ️ Status:', data.msg);
      }

      // Insights do rules engine
      if (data.type === 'insight') {
        console.log('[Content] 💡 Insight recebido:', data.category || data.insight_type);
        displayInsight(data);
      }

      // Erros reais do backend
      if (data.type === 'error') {
        console.error('[Content] ❌ Backend error:', data.message);
      }
    } catch (error) {
      console.error('[Content] ❌ Erro ao processar mensagem backend:', error);
    }
  };

  backendWs.onerror = (err) => {
    console.error('[Content] ❌ Backend WebSocket erro:', err);
  };

  backendWs.onclose = () => {
    console.log('[Content] 🔌 Backend WebSocket desconectado');

    // Auto-reconnect se ainda estiver capturando
    if (isCapturing && callId && sessionToken) {
      console.log('[Content] 🔄 Tentando reconectar em 3s...');
      setTimeout(() => {
        connectBackendWebSocket(callId, sessionToken);
      }, 3000);
    }
  };
}

// ============================================
// MUTATION OBSERVER PARA CAPTURAR TEXTO
// ============================================
function startCaptionsObserver() {
  console.log('[Content] 👁️ Iniciando MutationObserver para CC...');

  // Tentar encontrar container CC com retry
  let attempts = 0;
  const maxAttempts = 20;

  const interval = setInterval(() => {
    attempts++;
    const container = findCaptionsContainer();

    if (container) {
      clearInterval(interval);
      observeCaptions(container);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.error('[Content] ❌ Container CC não encontrado após', maxAttempts, 'tentativas');
    } else {
      console.log('[Content] 🔍 Procurando container CC... tentativa', attempts);
    }
  }, 500);
}

function findCaptionsContainer(): HTMLElement | null {
  // Método 1: Atributos semânticos (preferencial)
  const candidates = Array.from(
    document.querySelectorAll('[aria-live], [role="region"]')
  ) as HTMLElement[];

  for (const el of candidates) {
    const text = el.textContent?.trim();
    if (text && text.length > 0 && text.length < 500) {
      console.log('[Content] 🎯 Found CC container (semântico):', el.className);
      return el;
    }
  }

  // Método 2: CSS classes conhecidas (fallback)
  const fallbackSelectors = [
    '.a4cQT',
    '.iOzk7',
    '[jsname="dsyhDe"]',
    '[jsname="YSxPC"]',
    '.iOzk7.RDPZE'
  ];

  for (const selector of fallbackSelectors) {
    const el = document.querySelector(selector) as HTMLElement;
    if (el?.textContent?.trim()) {
      console.log('[Content] 🎯 Found CC container (fallback):', selector);
      return el;
    }
  }

  return null;
}

function observeCaptions(container: HTMLElement) {
  console.log('[Content] 👁️ Observando CC container');

  captionObserver = new MutationObserver(() => {
    // DEBOUNCE: aguardar 800ms sem mudanças
    if (captionDebounceTimer) {
      clearTimeout(captionDebounceTimer);
    }

    captionDebounceTimer = window.setTimeout(() => {
      processStableCaption(container);
    }, 800); // 800ms sem mudanças = fala estabilizada
  });

  captionObserver.observe(container, {
    childList: true,
    subtree: true,
    characterData: true
  });

  console.log('[Content] ✅ Observer ativo!');
}

function processStableCaption(container: HTMLElement) {
  const fullText = extractCleanText(container);

  if (!fullText || fullText.length < 3) {
    return;
  }

  // Extrair APENAS última frase (após último ponto/interrogação/exclamação)
  const sentences = fullText.split(/[.!?]\s+/);
  const lastSentence = sentences[sentences.length - 1].trim();

  if (!lastSentence || lastSentence.length < 3) {
    console.log('[Content] ⏭️ Última frase muito curta');
    return;
  }

  // Evitar enviar mesma frase
  const hash = simpleHash(lastSentence);

  if (hash === lastProcessedText) {
    console.log('[Content] ⏭️ Frase já processada');
    return;
  }

  lastProcessedText = hash;

  // Detectar speaker
  const speaker = detectSpeaker(lastSentence);

  console.log(`[Content] 📝 [${speaker}] ${lastSentence}`);

  // Enviar
  sendSegmentToBackend(lastSentence, speaker);
  displayTranscript(speaker, lastSentence);
}

// ============================================
// ENVIAR SEGMENT PARA BACKEND
// ============================================
function sendSegmentToBackend(text: string, speaker: 'CLIENTE' | 'VENDEDOR') {
  if (!backendWs || backendWs.readyState !== WebSocket.OPEN) {
    console.warn('[Content] ⚠️ Backend não conectado, não pode enviar segment');
    return;
  }

  if (!callId) {
    console.warn('[Content] ⚠️ call_id não definido');
    return;
  }

  if (!callStartTime) {
    console.error('[Content] ❌ callStartTime não inicializado!');
    return;
  }

  // Validar texto
  if (!text || text.length < 3) {
    console.warn('[Content] ⚠️ Texto muito curto, ignorando');
    return;
  }

  // Calcular offset relativo ao início da call
  const now = Date.now();
  const offset = now - callStartTime; // Tempo relativo em MS

  // Segment com offset (não timestamp absoluto) - cabe em INTEGER do Postgres
  const segment = {
    event: 'client_segment',
    call_id: callId,
    speaker: speaker, // ✅ CLIENTE ou VENDEDOR (não força mais CLIENTE)
    text: text,
    start_ms: offset,                    // ✅ Offset relativo (cabe em INTEGER)
    end_ms: offset + CAPTION_DEBOUNCE_MS, // ✅ End = start + duração estimada
    source: 'TAB',
    asr_confidence: 0.9,
    is_echo_suspected: false
  };

  const payload = JSON.stringify(segment);
  backendWs.send(payload);
  console.log(`[Content] 📤 Segment enviado para backend (${speaker}, offset: ${offset}ms)`, payload);
}

// ============================================
// CRIAR OVERLAY UI
// ============================================
function createOverlayUI() {
  if (overlayElement) {
    overlayElement.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'sales-mentor-overlay';
  overlay.style.cssText = `
    position: fixed;
    right: 24px;
    top: 84px;
    width: 400px;
    max-height: 80vh;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    backdrop-filter: blur(10px);
  `;

  overlay.innerHTML = `
    <style>
      #sales-mentor-overlay * {
        box-sizing: border-box;
      }
      #sales-mentor-overlay::-webkit-scrollbar {
        width: 4px;
      }
      #sales-mentor-overlay::-webkit-scrollbar-track {
        background: transparent;
      }
      #sales-mentor-overlay::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 2px;
      }
      #sales-mentor-overlay::-webkit-scrollbar-thumb:hover {
        background: #9ca3af;
      }
      .sm-fade-in {
        animation: smFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes smFadeIn {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .sm-tab {
        background: transparent;
        border: none;
        color: #6b7280;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        padding: 8px 16px;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
        position: relative;
      }
      .sm-tab:hover {
        color: #374151;
        background: #f9fafb;
      }
      .sm-tab.active {
        color: #6366f1;
        border-bottom-color: #6366f1;
      }
      .sm-tab .badge {
        display: inline-block;
        background: #ef4444;
        color: white;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 10px;
        margin-left: 6px;
        min-width: 18px;
        text-align: center;
      }
      .sm-btn-icon {
        background: transparent;
        border: none;
        color: #6b7280;
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        font-size: 16px;
      }
      .sm-btn-icon:hover {
        background: #f3f4f6;
        color: #374151;
      }
      .sm-btn-stop {
        background: #ef4444;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .sm-btn-stop:hover {
        background: #dc2626;
        transform: translateY(-1px);
      }
      .sm-btn-stop:active {
        transform: translateY(0);
      }
    </style>

    <!-- Header -->
    <div style="
      background: #ffffff;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f3f4f6;
    " id="sm-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        ">🎯</div>
        <div style="display: flex; flex-direction: column;">
          <span style="font-weight: 600; font-size: 13px; color: #111827; letter-spacing: -0.01em;">Sales Mentor</span>
          <span style="font-size: 10px; color: #6b7280; font-weight: 500;">AI Coach</span>
        </div>
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <button id="sm-stop" class="sm-btn-stop">
          <span>⏹</span>
          <span>Parar</span>
        </button>
        <button id="sm-minimize" class="sm-btn-icon">−</button>
        <button id="sm-close" class="sm-btn-icon">×</button>
      </div>
    </div>

    <!-- Tabs -->
    <div style="
      display: flex;
      background: #ffffff;
      border-bottom: 1px solid #f3f4f6;
    ">
      <button class="sm-tab active" data-tab="transcript">
        Transcrição
      </button>
      <button class="sm-tab" data-tab="insights">
        Insights
        <span class="badge" id="sm-insights-badge" style="display: none;">0</span>
      </button>
    </div>

    <!-- Content -->
    <div id="sm-content" style="
      flex: 1;
      overflow-y: auto;
      background: #f9fafb;
    ">
      <!-- Transcript Tab -->
      <div id="sm-tab-transcript" style="
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      ">
        <div id="sm-transcriptions" style="
          display: flex;
          flex-direction: column;
          gap: 8px;
        "></div>
      </div>

      <!-- Insights Tab -->
      <div id="sm-tab-insights" style="
        padding: 12px;
        display: none;
        flex-direction: column;
        gap: 10px;
      ">
        <div id="sm-insights" style="
          display: flex;
          flex-direction: column;
          gap: 10px;
        "></div>
      </div>
    </div>

    <!-- Footer -->
    <div style="
      padding: 10px 16px;
      background: #ffffff;
      border-top: 1px solid #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    ">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
          animation: pulse 2s ease-in-out infinite;
        "></div>
        <span style="color: #6b7280; font-weight: 500;">Gravando</span>
      </div>
      <button id="sm-clear" style="
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        font-size: 11px;
        padding: 4px 8px;
        font-weight: 500;
        transition: color 0.15s;
      ">Limpar</button>
    </div>

    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  `;

  document.body.appendChild(overlay);
  overlayElement = overlay;

  // Event listeners
  const stopBtn = overlay.querySelector('#sm-stop') as HTMLButtonElement | null;
  const minimizeBtn = overlay.querySelector('#sm-minimize');
  const closeBtn = overlay.querySelector('#sm-close');
  const clearBtn = overlay.querySelector('#sm-clear');
  const tabs = overlay.querySelectorAll('.sm-tab');

  stopBtn?.addEventListener('click', () => {
    if (confirm('Deseja parar o coaching e encerrar a sessão?')) {
      stopCapture();
    }
  });
  minimizeBtn?.addEventListener('click', toggleMinimize);
  closeBtn?.addEventListener('click', closeOverlay);
  clearBtn?.addEventListener('click', clearTranscript);

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  console.log('[Content] ✅ Overlay criado');
}

function switchTab(tabName: string | null) {
  if (!overlayElement || !tabName) return;

  const tabs = overlayElement.querySelectorAll('.sm-tab');
  const transcriptTab = overlayElement.querySelector('#sm-tab-transcript') as HTMLElement;
  const insightsTab = overlayElement.querySelector('#sm-tab-insights') as HTMLElement;

  // Update tab styles
  tabs.forEach(tab => {
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Show/hide content
  if (tabName === 'transcript') {
    if (transcriptTab) transcriptTab.style.display = 'flex';
    if (insightsTab) insightsTab.style.display = 'none';
  } else if (tabName === 'insights') {
    if (transcriptTab) transcriptTab.style.display = 'none';
    if (insightsTab) insightsTab.style.display = 'flex';
  }
}

function toggleMinimize() {
  if (!overlayElement) return;

  const content = overlayElement.querySelector('#sm-content') as HTMLElement;
  const minimizeBtn = overlayElement.querySelector('#sm-minimize');

  isMinimized = !isMinimized;

  if (isMinimized) {
    content.style.display = 'none';
    if (minimizeBtn) minimizeBtn.textContent = '+';
  } else {
    content.style.display = 'flex';
    if (minimizeBtn) minimizeBtn.textContent = '−';
  }
}

function closeOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

function clearTranscript() {
  const transcriptions = document.getElementById('sm-transcriptions');
  if (transcriptions) {
    transcriptions.innerHTML = '';
  }
}

// ============================================
// DISPLAY TRANSCRIPT
// ============================================
function displayTranscript(speaker: string, text: string, timestamp?: string) {
  const transcriptions = document.getElementById('sm-transcriptions');
  if (!transcriptions) return;

  const time = timestamp || new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const isClient = speaker === 'CLIENTE';
  const speakerConfig = isClient
    ? { color: '#6366f1', bg: '#eef2ff', label: 'Cliente', icon: '👤' }
    : { color: '#10b981', bg: '#d1fae5', label: 'Você', icon: '🎯' };

  const transcriptEl = document.createElement('div');
  transcriptEl.className = 'sm-fade-in';
  transcriptEl.style.cssText = `
    padding: 12px;
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #f3f4f6;
    transition: all 0.15s ease;
  `;

  transcriptEl.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="
          width: 24px;
          height: 24px;
          background: ${speakerConfig.bg};
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        ">${speakerConfig.icon}</div>
        <span style="font-weight: 600; color: ${speakerConfig.color}; font-size: 12px;">${speakerConfig.label}</span>
      </div>
      <span style="font-size: 10px; color: #9ca3af; font-weight: 500;">${time}</span>
    </div>
    <div style="font-size: 13px; color: #374151; line-height: 1.6; padding-left: 30px;">${text}</div>
  `;

  transcriptions.appendChild(transcriptEl);

  // Auto-scroll to latest
  const content = document.getElementById('sm-content');
  if (content) {
    content.scrollTop = content.scrollHeight;
  }
}

// ============================================
// DISPLAY INSIGHT
// ============================================
function displayInsight(data: any) {
  const insights = document.getElementById('sm-insights');
  const badge = document.getElementById('sm-insights-badge');
  if (!insights) return;

  const categoryStyles: Record<string, { color: string; bg: string; gradient: string; icon: string; label: string }> = {
    'PRICE': {
      color: '#dc2626',
      bg: '#fef2f2',
      gradient: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
      icon: '💰',
      label: 'Preço'
    },
    'OBJECTION': {
      color: '#ea580c',
      bg: '#fff7ed',
      gradient: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)',
      icon: '⚠️',
      label: 'Objeção'
    },
    'BUYING_SIGNAL': {
      color: '#16a34a',
      bg: '#f0fdf4',
      gradient: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
      icon: '✅',
      label: 'Sinal de Compra'
    },
    'HOW_IT_WORKS': {
      color: '#2563eb',
      bg: '#eff6ff',
      gradient: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
      icon: 'ℹ️',
      label: 'Como Funciona'
    },
    'NEXT_STEP': {
      color: '#7c3aed',
      bg: '#faf5ff',
      gradient: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
      icon: '🎯',
      label: 'Próximo Passo'
    },
    'RISK': {
      color: '#dc2626',
      bg: '#fef2f2',
      gradient: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
      icon: '🚨',
      label: 'Risco'
    }
  };

  const style = categoryStyles[data.category] || {
    color: '#6b7280',
    bg: '#f9fafb',
    gradient: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
    icon: '💡',
    label: 'Insight'
  };

  const insightEl = document.createElement('div');
  insightEl.className = 'sm-fade-in';
  insightEl.style.cssText = `
    padding: 16px;
    background: #ffffff;
    border-radius: 10px;
    border: 1px solid ${style.color}15;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    transition: all 0.2s ease;
    cursor: pointer;
  `;

  insightEl.onmouseenter = () => {
    insightEl.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
    insightEl.style.transform = 'translateY(-2px)';
  };
  insightEl.onmouseleave = () => {
    insightEl.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
    insightEl.style.transform = 'translateY(0)';
  };

  const suggestions = Array.isArray(data.suggestions)
    ? data.suggestions.map((s: string) => `
        <li style="
          margin-bottom: 8px;
          color: #374151;
          font-size: 13px;
          line-height: 1.6;
          padding-left: 4px;
        ">${s}</li>
      `).join('')
    : '';

  const question = data.question ? `
    <div style="
      margin-top: 12px;
      padding: 12px;
      background: ${style.gradient};
      border-radius: 8px;
      border-left: 3px solid ${style.color};
    ">
      <div style="font-size: 11px; color: ${style.color}; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Pergunta Sugerida</div>
      <div style="font-size: 13px; color: #374151; font-weight: 500;">"${data.question}"</div>
    </div>
  ` : '';

  insightEl.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
      <div style="
        width: 40px;
        height: 40px;
        background: ${style.gradient};
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
      ">${style.icon}</div>
      <div style="flex: 1;">
        <div style="font-size: 11px; color: ${style.color}; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${style.label}</div>
        <div style="font-weight: 600; color: #111827; font-size: 14px; line-height: 1.4;">${data.title || data.category}</div>
      </div>
    </div>
    ${suggestions ? `
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Ações Recomendadas</div>
        <ul style="margin: 0; padding-left: 20px;">${suggestions}</ul>
      </div>
    ` : ''}
    ${question}
    ${data.quote ? `
      <div style="
        margin-top: 12px;
        padding: 10px 12px;
        background: #f9fafb;
        border-radius: 6px;
        border-left: 2px solid #e5e7eb;
      ">
        <div style="font-size: 11px; color: #9ca3af; font-weight: 500; margin-bottom: 4px;">Contexto</div>
        <div style="font-size: 12px; color: #6b7280; font-style: italic; line-height: 1.5;">"${data.quote}"</div>
      </div>
    ` : ''}
  `;

  insights.appendChild(insightEl);

  // Update badge count
  const currentCount = insights.children.length;
  if (badge) {
    badge.textContent = currentCount.toString();
    badge.style.display = 'inline-block';
  }

  // Auto-switch to insights tab and scroll
  switchTab('insights');
  const content = document.getElementById('sm-content');
  if (content) {
    content.scrollTop = content.scrollHeight;
  }
}

// ============================================
// PARAR CAPTURA
// ============================================
function stopCapture() {
  console.log('[Content] ⏹️ Parando captura...');

  isCapturing = false;
  callId = null;
  sessionToken = null;
  callStartTime = 0; // Reset do timestamp de início
  clearCaptionState();

  // Desconectar observer
  if (captionObserver) {
    captionObserver.disconnect();
    captionObserver = null;
  }

  // Fechar WebSocket
  if (backendWs) {
    backendWs.close();
    backendWs = null;
  }

  // Remover CSS que esconde CC
  if (hideStyleEl) {
    hideStyleEl.remove();
    hideStyleEl = null;
  }
  const inlineHide = document.getElementById('sales-mentor-hide-cc');
  inlineHide?.remove();

  // Fechar overlay
  closeOverlay();

  void clearStoredSession();

  console.log('[Content] ✅ Captura parada');
}

void checkExistingSession();
console.log('[Content] ✅ Content script pronto');
