import WebSocket from 'ws';

const BACKEND_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080';

console.log('🧪 TESTE COMPLETO DO BACKEND SALES MENTOR\n');

// ============================================
// TESTE 1: HEALTH CHECK
// ============================================
async function testHealth() {
  console.log('1️⃣ Testing health endpoint...');
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    const data = await response.json();

    if (response.ok && data.ok) {
      console.log('   ✅ Health check: OK\n');
      return true;
    } else {
      console.log('   ❌ Health check failed:', data);
      return false;
    }
  } catch (error) {
    console.log('   ❌ Backend não está rodando:', error.message);
    return false;
  }
}

// ============================================
// TESTE 2: CREATE CALL
// ============================================
async function testCreateCall() {
  console.log('2️⃣ Testing POST /v1/calls...');
  try {
    const response = await fetch(`${BACKEND_URL}/v1/calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting_url: 'https://meet.google.com/test-abc-def'
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.log('   ❌ Failed to create call:', response.status, text);
      return null;
    }

    const data = await response.json();

    if (data.call_id && data.token) {
      console.log('   ✅ Call created successfully!');
      console.log('   📋 call_id:', data.call_id);
      console.log('   🔑 token:', data.token.substring(0, 50) + '...');
      console.log('   🔗 meeting_url:', data.meeting_url, '\n');
      return data;
    } else {
      console.log('   ❌ Invalid response:', data);
      return null;
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    return null;
  }
}

// ============================================
// TESTE 3: WEBSOCKET CONNECTION
// ============================================
async function testWebSocket(callData) {
  console.log('3️⃣ Testing WebSocket connection...');

  return new Promise((resolve) => {
    const token = encodeURIComponent(callData.token);
    const wsUrl = `${WS_URL}/v1/ws?call_id=${callData.call_id}&token=${token}`;
    console.log('   🔌 Connecting to WebSocket...');

    const ws = new WebSocket(wsUrl);
    let authenticated = false;

    const timeout = setTimeout(() => {
      console.log('   ❌ WebSocket timeout (10s)');
      ws.close();
      resolve({ ws: null, authenticated: false });
    }, 10000);

    ws.on('open', () => {
      console.log('   🟢 WebSocket OPENED');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('   📨 Message received:', message);

        if (message.event === 'status' && message.msg === 'connected') {
          console.log('   ✅ WebSocket AUTHENTICATED!\n');
          authenticated = true;
          clearTimeout(timeout);
          resolve({ ws, authenticated: true });
        }
      } catch (error) {
        console.log('   ⚠️ Failed to parse message:', error.message);
      }
    });

    ws.on('error', (error) => {
      console.log('   ❌ WebSocket ERROR:', error.message);
      clearTimeout(timeout);
      resolve({ ws: null, authenticated: false });
    });

    ws.on('close', () => {
      console.log('   🔴 WebSocket CLOSED');
      if (!authenticated) {
        clearTimeout(timeout);
        resolve({ ws: null, authenticated: false });
      }
    });
  });
}

// ============================================
// TESTE 4: SEND SEGMENT
// ============================================
async function testSendSegment(ws, callId) {
  console.log('4️⃣ Testing segment processing...');

  return new Promise((resolve) => {
    const segment = {
      event: 'client_segment',
      call_id: callId,
      speaker: 'CLIENTE',
      text: 'Quanto custa o produto?',
      start_ms: Date.now() - 1000,
      end_ms: Date.now(),
      source: 'TAB',
      asr_confidence: 0.95,
      is_echo_suspected: false
    };

    console.log('   📤 Sending segment:', segment.text);

    let receivedResponse = false;
    let insightReceived = false;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.event === 'status' && message.msg === 'segment saved') {
          console.log('   ✅ Segment saved! Latency:', message.latency_ms, 'ms');
          receivedResponse = true;
        }

        if (message.type === 'insight') {
          console.log('   💡 INSIGHT RECEIVED!');
          console.log('       Category:', message.category);
          console.log('       Title:', message.title);
          console.log('       Suggestions:', message.suggestions);
          console.log('       Quote:', message.quote, '\n');
          insightReceived = true;
        }
      } catch (error) {
        console.log('   ⚠️ Failed to parse message:', error.message);
      }
    });

    ws.send(JSON.stringify(segment));

    setTimeout(() => {
      if (receivedResponse) {
        console.log('   ✅ Segment processing complete!');
        if (insightReceived) {
          console.log('   ✅ Insight generated!\n');
        } else {
          console.log('   ℹ️ No insight generated (might be in cooldown)\n');
        }
        resolve(true);
      } else {
        console.log('   ❌ No response received for segment\n');
        resolve(false);
      }
    }, 5000);
  });
}

// ============================================
// TESTE 5: STOP CALL
// ============================================
async function testStopCall(callId) {
  console.log('5️⃣ Testing POST /v1/calls/:call_id/stop...');
  try {
    const response = await fetch(`${BACKEND_URL}/v1/calls/${callId}/stop`, {
      method: 'POST'
    });

    if (!response.ok) {
      const text = await response.text();
      console.log('   ❌ Failed to stop call:', response.status, text);
      return false;
    }

    const data = await response.json();

    if (data.status === 'ENDED') {
      console.log('   ✅ Call stopped successfully!');
      console.log('   📋 Status:', data.status);
      console.log('   🆔 Report ID:', data.report_id);
      console.log('   ⏰ Ended at:', data.ended_at, '\n');
      return true;
    } else {
      console.log('   ❌ Invalid response:', data);
      return false;
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    return false;
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════\n');

  // Test 1: Health
  const healthOk = await testHealth();
  if (!healthOk) {
    console.log('\n❌ BACKEND NOT RUNNING! Start it with: cd apps/realtime-api && pnpm dev\n');
    process.exit(1);
  }

  // Test 2: Create Call
  const callData = await testCreateCall();
  if (!callData) {
    console.log('\n❌ FAILED TO CREATE CALL\n');
    process.exit(1);
  }

  // Test 3: WebSocket
  const { ws, authenticated } = await testWebSocket(callData);
  if (!authenticated || !ws) {
    console.log('\n❌ WEBSOCKET AUTHENTICATION FAILED\n');
    process.exit(1);
  }

  // Test 4: Send Segment
  const segmentOk = await testSendSegment(ws, callData.call_id);

  // Test 5: Stop Call
  const stopOk = await testStopCall(callData.call_id);

  // Close WebSocket
  ws.close();

  // Final Report
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 TESTE COMPLETO - RESULTADOS:');
  console.log('═══════════════════════════════════════════════════');
  console.log('1. Health Check:      ', healthOk ? '✅ PASS' : '❌ FAIL');
  console.log('2. Create Call:       ', callData ? '✅ PASS' : '❌ FAIL');
  console.log('3. WebSocket Auth:    ', authenticated ? '✅ PASS' : '❌ FAIL');
  console.log('4. Segment Processing:', segmentOk ? '✅ PASS' : '❌ FAIL');
  console.log('5. Stop Call:         ', stopOk ? '✅ PASS' : '❌ FAIL');
  console.log('═══════════════════════════════════════════════════\n');

  if (healthOk && callData && authenticated && segmentOk && stopOk) {
    console.log('🎉 TODOS OS TESTES PASSARAM! Backend está 100% funcional!\n');
    console.log('📋 Call ID testado:', callData.call_id);
    console.log('💡 Verifique no banco de dados:');
    console.log('   SELECT * FROM calls WHERE id = \'' + callData.call_id + '\';');
    console.log('   SELECT * FROM segments WHERE call_id = \'' + callData.call_id + '\';');
    console.log('   SELECT * FROM insights WHERE call_id = \'' + callData.call_id + '\';\n');
    process.exit(0);
  } else {
    console.log('⚠️ ALGUNS TESTES FALHARAM. Verifique os logs acima.\n');
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('\n💥 ERRO INESPERADO:', error);
  process.exit(1);
});
