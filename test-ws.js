const WebSocket = require('ws');

const callId = 'ad652b05-4e0f-4f41-a1d5-2359894dbc9d';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjYWxsX2lkIjoiYWQ2NTJiMDUtNGUwZi00ZjQxLWExZDUtMjM1OTg5NGRiYzlkIiwiY29tcGFueV9pZCI6IjY3YjEwNjY3LTkwMGEtNDBiMi1iYzBlLTcyNGMxZWNkN2NjNCIsImFnZW50X2lkIjoiMDI2OTMzZDQtNjM2OC00MjZlLWJjODktZTAzYWZhZDgyZTEwIiwiaWF0IjoxNzY3MDM2NjYyLCJleHAiOjE3NjcwNTEwNjJ9.OwnSNXQnf0z54UmbVChJLVBg7fG0Mpvz6SRXUQC8xCU';

const wsUrl = `ws://localhost:8080/v1/ws?call_id=${callId}&token=${token}`;

console.log('🔌 Conectando ao WebSocket...');
console.log('URL:', wsUrl);
console.log('');

// Adicionar debug do cliente
const ws = new WebSocket(wsUrl, {
  handshakeTimeout: 5000
});

// Log de todos os eventos para debug
ws.on('upgrade', (response) => {
  console.log('🔄 WebSocket upgrade recebido');
  console.log('Status:', response.statusCode);
  console.log('');
});

ws.on('open', () => {
  console.log('✅ CONECTADO!');
  console.log('');

  setTimeout(() => {
    const message = {
      event: 'client_segment',
      call_id: callId,
      speaker: 'CLIENTE',
      text: 'quanto custa isso?',
      source: 'TAB',
      start_ms: 1000,
      end_ms: 3000
    };

    console.log('📤 Enviando mensagem:', JSON.stringify(message));
    console.log('');
    ws.send(JSON.stringify(message));

    setTimeout(() => {
      console.log('');
      console.log('🔌 Fechando conexão...');
      ws.close();
    }, 2000);
  }, 500);
});

ws.on('message', (data) => {
  console.log('📥 MENSAGEM RECEBIDA:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log('🔴 Conexão fechada');
  console.log('Código:', code);
  console.log('Razão:', reason.toString() || 'N/A');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏱️  Timeout - encerrando teste');
  ws.close();
  process.exit(1);
}, 10000);
