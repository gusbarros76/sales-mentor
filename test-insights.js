const WebSocket = require('ws');

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function createCall() {
  console.log(`${colors.cyan}📞 Criando nova call...${colors.reset}`);

  const response = await fetch('http://localhost:8080/v1/calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_id: '67b10667-900a-40b2-bc0e-724c1ecd7cc4',
      agent_id: '026933d4-6368-426e-bc89-e03afad82e10',
      title: 'Test Insights AI'
    })
  });

  const data = await response.json();
  console.log(`${colors.green}✅ Call criado: ${data.call_id}${colors.reset}\n`);
  return data;
}

function testWebSocket(callId, token) {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://localhost:8080/v1/ws?call_id=${callId}&token=${token}`;
    const ws = new WebSocket(wsUrl);
    const results = [];
    let testIndex = 0;

    const tests = [
      {
        name: 'PRICE',
        text: 'Quanto custa esse produto?',
        expectedCategory: 'PRICE'
      },
      {
        name: 'BUYING_SIGNAL',
        text: 'Gostei muito, tenho interesse em avançar',
        expectedCategory: 'BUYING_SIGNAL'
      },
      {
        name: 'OBJECTION',
        text: 'Preciso pensar melhor, está muito caro',
        expectedCategory: 'OBJECTION'
      },
      {
        name: 'PRICE (Cooldown Test)',
        text: 'Mas quanto custa mesmo?',
        expectedCategory: 'PRICE',
        shouldSkip: true // Deve estar em cooldown
      },
      {
        name: 'NO TRIGGER',
        text: 'Hoje está um dia bonito',
        expectedCategory: null
      }
    ];

    ws.on('open', () => {
      console.log(`${colors.green}🔌 WebSocket conectado${colors.reset}\n`);
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.event === 'status' && message.msg === 'connected') {
        console.log(`${colors.green}✅ Welcome message recebida${colors.reset}\n`);
        runNextTest();
        return;
      }

      if (message.type === 'insight') {
        const test = tests[testIndex - 1];
        console.log(`${colors.blue}📊 INSIGHT RECEBIDO:${colors.reset}`);
        console.log(`   Category: ${colors.yellow}${message.category}${colors.reset}`);
        console.log(`   Title: "${message.title}"`);
        console.log(`   Suggestions: [${message.suggestions.length}] ${message.suggestions.map(s => `"${s}"`).join(', ')}`);
        console.log(`   Question: "${message.question}"`);
        console.log(`   Quote: "${message.quote}"\n`);

        results.push({
          test: test.name,
          success: !test.shouldSkip && message.category === test.expectedCategory,
          category: message.category,
          expectedCategory: test.expectedCategory
        });

        if (test.shouldSkip) {
          console.log(`${colors.red}❌ ERRO: Insight gerado durante cooldown!${colors.reset}\n`);
        }
      }

      if (message.event === 'status' && message.msg === 'segment saved') {
        const test = tests[testIndex - 1];

        if (test.expectedCategory === null || test.shouldSkip) {
          console.log(`${colors.green}✅ Nenhum insight gerado (esperado)${colors.reset}\n`);
          results.push({
            test: test.name,
            success: true,
            noInsight: true
          });
        }

        setTimeout(runNextTest, 1000);
      }
    });

    function runNextTest() {
      if (testIndex >= tests.length) {
        ws.close();
        printResults();
        resolve(results);
        return;
      }

      const test = tests[testIndex];
      testIndex++;

      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.cyan}🧪 TESTE ${testIndex}: ${test.name}${colors.reset}`);
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`Enviando: "${test.text}"\n`);

      const message = {
        event: 'client_segment',
        call_id: callId,
        speaker: 'CLIENTE',
        text: test.text,
        source: 'TAB',
        start_ms: testIndex * 5000,
        end_ms: testIndex * 5000 + 3000
      };

      ws.send(JSON.stringify(message));
    }

    function printResults() {
      console.log(`\n${colors.cyan}╔═══════════════════════════════════════╗${colors.reset}`);
      console.log(`${colors.cyan}║     RESUMO DOS TESTES                 ║${colors.reset}`);
      console.log(`${colors.cyan}╚═══════════════════════════════════════╝${colors.reset}\n`);

      results.forEach((result, i) => {
        const icon = result.success ? '✅' : '❌';
        const color = result.success ? colors.green : colors.red;
        console.log(`${color}${icon} ${result.test}${colors.reset}`);
        if (result.category) {
          console.log(`   Category: ${result.category} (Expected: ${result.expectedCategory})`);
        }
        if (result.noInsight) {
          console.log(`   Sem insight (correto)`);
        }
        console.log('');
      });

      const passed = results.filter(r => r.success).length;
      const total = results.length;

      if (passed === total) {
        console.log(`${colors.green}🎉 TODOS OS TESTES PASSARAM! (${passed}/${total})${colors.reset}\n`);
      } else {
        console.log(`${colors.red}⚠️  ${total - passed} TESTE(S) FALHARAM (${passed}/${total} passaram)${colors.reset}\n`);
      }
    }

    ws.on('error', (err) => {
      console.error(`${colors.red}❌ Erro WebSocket: ${err.message}${colors.reset}`);
      reject(err);
    });

    ws.on('close', () => {
      console.log(`${colors.yellow}🔴 WebSocket fechado${colors.reset}\n`);
    });
  });
}

async function main() {
  try {
    console.log(`${colors.cyan}╔═══════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║   TESTE RULES ENGINE + OPENAI         ║${colors.reset}`);
    console.log(`${colors.cyan}║   Fase 2B - Insights em Tempo Real    ║${colors.reset}`);
    console.log(`${colors.cyan}╚═══════════════════════════════════════╝${colors.reset}\n`);

    const { call_id, session_token } = await createCall();
    await testWebSocket(call_id, session_token);

    process.exit(0);
  } catch (err) {
    console.error(`${colors.red}❌ Erro fatal: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

main();
