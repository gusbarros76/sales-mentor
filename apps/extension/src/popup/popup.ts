// Explicit backend URL for popup (avoid relying on import.meta.env here during tests)
const BACKEND_URL = 'http://localhost:8080';

type CallCreateResponse = {
  call_id?: string;
  token?: string;
  [key: string]: unknown;
};

function setStatus(element: HTMLElement | null, text: string) {
  if (element) {
    element.textContent = text;
  }
}

async function createCall(meetingUrl: string): Promise<{ call_id: string; token: string }> {
  console.log('[Popup] BACKEND_URL =', BACKEND_URL);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/v1/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting_url: meetingUrl
      })
    });
  } catch (err) {
    console.error('[Popup] Fetch failed', err);
    throw err;
  }

  if (!response.ok) {
    const text = await response.text();
    console.error('[Popup] Backend error', response.status, text);
    throw new Error('Backend responded with error');
  }

  const data: CallCreateResponse = await response.json();
  console.log('[Popup] Call created:', data);

  if (!data.call_id || !data.token) {
    console.error('[Popup] call_id/token ausentes na criação da call');
    throw new Error('Backend não retornou call_id/token');
  }

  return { call_id: data.call_id, token: data.token };
}

async function persistSession(callId: string, token: string, meetingUrl: string) {
  try {
    await chrome.storage?.local?.set({
      isCapturing: true,
      call_id: callId,
      callId,
      session_token: token,
      token,
      backend_url: BACKEND_URL,
      backend_ws_url: BACKEND_URL,
      activeSession: {
        call_id: callId,
        token,
        started_at: Date.now(),
        meet_url: meetingUrl
      }
    });
  } catch (error) {
    console.warn('[Popup] Falha ao salvar sessão no storage', error);
  }
}

async function startCoaching(statusEl: HTMLElement | null, startBtn: HTMLButtonElement | null) {
  setStatus(statusEl, '🟡 Iniciando...');
  if (startBtn) startBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('meet.google.com')) {
      throw new Error('Você precisa estar em uma reunião do Google Meet');
    }

    if (!tab.id) {
      throw new Error('Aba ativa não encontrada');
    }

    // 1. Create call in backend
    const { call_id, token } = await createCall(tab.url);
    console.log('[Popup] Call created:', { call_id, token: token.substring(0, 20) + '...' });

    // 2. Persist session
    await persistSession(call_id, token, tab.url);

    // 3. Send COACHING_STARTED to content-script
    console.log('[Popup] Sending COACHING_STARTED to content-script...');
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'COACHING_STARTED',
      call_id,
      token
    });

    if (!response?.success) {
      throw new Error('Content-script failed to start coaching');
    }

    console.log('[Popup] ✅ Content-script started coaching');

    setStatus(statusEl, '🟢 Coaching ativo!');
    window.setTimeout(() => window.close(), 1500);

  } catch (error: any) {
    console.error('[Popup] Error:', error);
    setStatus(statusEl, `🔴 Erro: ${error?.message || 'Falha ao iniciar'}`);
    if (startBtn) startBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement | null;

  startBtn?.addEventListener('click', () => startCoaching(statusDiv, startBtn));
});
