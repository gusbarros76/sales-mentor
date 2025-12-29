# 📋 Checklist - Teste em Call Real

## Pré-requisitos
- [ ] API rodando (`pnpm dev:api`)
- [ ] Banco de dados ativo (`pnpm db:up`)
- [ ] OPENAI_API_KEY configurada no .env

## Executar Teste
```bash
pnpm --filter realtime-api test:call
```

## O Que Observar

### 1. Conexão WebSocket
- [ ] Conecta sem erros
- [ ] Welcome message recebida
- [ ] Permanece estável durante toda simulação

### 2. Insights Esperados
Durante a simulação, deve gerar insights para:

- [ ] **HOW_IT_WORKS** - "Como funciona exatamente o produto?"
- [ ] **PRICE** - "Quanto custa esse serviço?"
- [ ] **OBJECTION** - "Está um pouco caro" + "Preciso pensar melhor"
- [ ] **BUYING_SIGNAL** - "Tenho interesse em avançar"
- [ ] **NEXT_STEP** - "Qual seria o próximo passo?"

### 3. Sistema de Cooldown
- [ ] Segunda menção de OBJECTION não gera novo insight (cooldown 90s)
- [ ] Logs mostram "insight in cooldown" quando apropriado

### 4. Qualidade dos Insights
Para cada insight gerado, verificar:
- [ ] Título relevante e acionável
- [ ] 2-3 sugestões práticas
- [ ] Pergunta sugerida coerente
- [ ] Linguagem adequada (português, tom profissional)

### 5. Performance
- [ ] Latência média < 3s por insight
- [ ] Sem travamentos ou timeouts
- [ ] Memória estável (sem leaks)

### 6. Logs da API
No terminal do `pnpm dev:api`, confirmar:
- [ ] "WS: authenticated" no início
- [ ] "WS: generating insight" para cada trigger
- [ ] "WS: insight sent" após cada geração
- [ ] "WS: insight in cooldown" quando aplicável
- [ ] Nenhum erro 500 ou exception

## Critérios de Sucesso

✅ **PASSA** se:
- 4+ insights gerados corretamente
- Cooldown funciona (bloqueia duplicatas)
- Latência aceitável (< 3s)
- Qualidade do conteúdo dos insights é boa
- Sem erros ou crashes

❌ **FALHA** se:
- Menos de 3 insights gerados
- Cooldown não funciona (gera duplicatas)
- Latência > 5s
- Insights genéricos ou sem contexto
- Erros ou desconexões

## Possíveis Problemas e Soluções

### WebSocket não conecta
- Verificar se API está rodando na porta 8080
- Verificar logs de erro na API

### Insights não são gerados
- Verificar OPENAI_API_KEY no .env
- Verificar logs: pode ser erro de rate limit da OpenAI
- Verificar que triggers estão corretos (rules.ts)

### Latência muito alta (> 5s)
- Pode ser rate limit da OpenAI
- Trocar para gpt-3.5-turbo se necessário
- Verificar conexão de internet

### Cooldown não funciona
- Verificar logs: deve aparecer "insight in cooldown"
- Testar manualmente com wscat enviando mesma mensagem 2x

## Próximos Passos Após Teste

Se tudo passar:
✅ Commit dos scripts de teste
✅ Prosseguir para Fase 3 (Persistência + Relatórios)

Se houver problemas:
🔧 Ajustar triggers/prompts conforme necessário
🔧 Otimizar latência se > 3s
🔧 Revisar logs para debugging
