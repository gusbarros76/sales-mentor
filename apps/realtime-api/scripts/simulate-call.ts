// apps/realtime-api/scripts/simulate-call.ts

import { WebSocket } from 'ws';

interface CallResponse {
  call_id: string;
  session_token: string;
  ws_url: string;
}

// Simulação de uma call real com múltiplos momentos
const CALL_SIMULATION = [
  {
    delay: 2000,
    text: 'Olá, obrigado por me atender',
    speaker: 'CLIENTE'
  },
  {
    delay: 3000,
    text: 'Eu vi sua solução e gostaria de saber mais detalhes',
    speaker: 'CLIENTE'
  },
  {
    delay: 4000,
    text: 'Como funciona exatamente o produto?',
    speaker: 'CLIENTE'
  },
  {
    delay: 5000,
    text: 'Interessante... e quanto custa esse serviço?',
    speaker: 'CLIENTE'
  },
  {
    delay: 3000,
    text: 'Hmm, está um pouco caro para o meu orçamento',
    speaker: 'CLIENTE'
  },
  {
    delay: 4000,
    text: 'Mas gostei da proposta, tenho interesse em avançar',
    speaker: 'CLIENTE'
  },
  {
    delay: 3000,
    text: 'Preciso pensar melhor sobre o investimento',
    speaker: 'CLIENTE'
  },
  {
    delay: 4000,
    text: 'Qual seria o próximo passo se eu decidir fechar?',
    speaker: 'CLIENTE'
  },
  {
    delay: 3000,
    text: 'Ok, manda a proposta então que vou avaliar',
    speaker: 'CLIENTE'
  }
];

async function createCall(): Promise<CallResponse> {
  console.log('📞 Criando nova call...\n');

  const response = await fetch('http://localhost:8080/v1/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_id: '67b10667-900a-40b2-bc0e-724c1ecd7cc4',
      agent_id: '026933d4-6368-426e-bc89-e03afad82e10',
      title: 'Simulação Call Real - ' + new Date().toLocaleString('pt-BR')
    })
  });

  const data = await response.json();
  console.log('✅ Call criada:', data.call_id);
  console.log('🔗 WebSocket URL:', data.ws_url);
  console.log('');

  return data;
}

async function simulateCall(callData: CallResponse) {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(callData.ws_url);
    let segmentIndex = 0;
    let startTime = 0;

    ws.on('open', () => {
      console.log('🟢 WebSocket conectado!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      startTime = Date.now();
    });

    ws.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());

      if (message.event === 'status' && message.msg === 'connected') {
        console.log('✅ Welcome message recebida\n');
        // Iniciar envio de segmentos
        sendNextSegment();
      } else if (message.type === 'insight') {
        console.log('💡 INSIGHT RECEBIDO!');
        console.log('   Categoria:', message.category);
        console.log('   Título:', message.title);
        console.log('   Quote:', message.quote);
        console.log('   Sugestões:');
        message.suggestions.forEach((s: string, i: number) => {
          console.log(`     ${i + 1}. ${s}`);
        });
        if (message.question) {
          console.log('   Pergunta sugerida:', message.question);
        }
        console.log('');
      } else if (message.event === 'status') {
        console.log('✓ Segment confirmado');
      }
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
      reject(err);
    });

    ws.on('close', () => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🔴 Call encerrada (duração: ${duration}s)`);
      resolve();
    });

    function sendNextSegment() {
      if (segmentIndex >= CALL_SIMULATION.length) {
        console.log('\n📊 Todos os segmentos enviados!');
        setTimeout(() => {
          ws.close();
        }, 2000);
        return;
      }

      const segment = CALL_SIMULATION[segmentIndex];
      const currentTime = Date.now() - startTime;

      setTimeout(() => {
        console.log(`\n⏱️  [${(currentTime / 1000).toFixed(1)}s] Cliente diz: "${segment.text}"`);

        ws.send(JSON.stringify({
          event: 'client_segment',
          call_id: callData.call_id,
          speaker: segment.speaker,
          text: segment.text,
          source: 'TAB',
          start_ms: currentTime,
          end_ms: currentTime + 2000
        }));

        segmentIndex++;
        sendNextSegment();
      }, segment.delay);
    }
  });
}

async function main() {
  console.log('🚀 SIMULAÇÃO DE CALL REAL - Sales Mentor\n');
  console.log('Esta simulação vai:');
  console.log('- Criar uma nova call');
  console.log('- Conectar via WebSocket');
  console.log('- Enviar 9 mensagens do cliente');
  console.log('- Disparar múltiplos insights (PRICE, BUYING_SIGNAL, OBJECTION, etc)');
  console.log('- Testar o sistema de cooldown');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const callData = await createCall();
    await simulateCall(callData);

    console.log('\n✅ SIMULAÇÃO CONCLUÍDA COM SUCESSO!');

    // Após simulação completa, encerrar call e gerar relatório
    console.log('\n🔄 Encerrando call e gerando relatório...\n');

    const stopResponse = await fetch(`http://localhost:8080/v1/calls/${callData.call_id}/stop`, {
      method: 'POST'
    });

    const stopData = await stopResponse.json();
    console.log('✅ Call encerrada:', stopData.status);
    console.log('📄 Report ID:', stopData.report_id);

    // Buscar relatório gerado
    console.log('\n📥 Buscando relatório gerado...\n');

    const reportResponse = await fetch(`http://localhost:8080/v1/calls/${callData.call_id}/report`);
    const reportData = await reportResponse.json();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📄 RELATÓRIO FINAL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(reportData.report_md);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erro na simulação:', err);
    process.exit(1);
  }
}

main();
