# 📦 Sales Mentor - Instruções de Instalação

## Para o Cliente

### Pré-requisitos
- Google Chrome ou navegador baseado em Chromium (Edge, Brave, etc.)
- Acesso ao Google Meet

### Passo 1: Descompactar a Extensão

1. Localize o arquivo `sales-mentor-extension-XXXXXXX.zip` que você recebeu
2. Descompacte o arquivo em uma pasta de sua escolha
3. **IMPORTANTE**: Não delete esta pasta depois de instalar! O Chrome precisa dos arquivos para funcionar

### Passo 2: Instalar no Chrome

1. Abra o Google Chrome
2. Digite na barra de endereços: `chrome://extensions/`
3. Ative o **Modo do desenvolvedor** (toggle no canto superior direito)
4. Clique em **Carregar sem compactação**
5. Selecione a pasta que você descompactou no Passo 1
6. A extensão "Sales Mentor - Meet Coach" deve aparecer na lista

### Passo 3: Fixar a Extensão (Opcional mas Recomendado)

1. Clique no ícone de quebra-cabeça (extensões) no canto superior direito do Chrome
2. Encontre "Sales Mentor - Meet Coach"
3. Clique no ícone de alfinete para fixar na barra de ferramentas

### Passo 4: Testar a Extensão

1. Entre em uma reunião do Google Meet: https://meet.google.com/
2. **IMPORTANTE**: Ative as legendas (CC) manualmente clicando no botão de legendas
3. A extensão deve mostrar um overlay no canto da tela
4. Comece a falar e você verá:
   - Transcrições em tempo real
   - Insights de vendas quando detectar frases-chave

## Frases de Teste

Para testar se os insights estão funcionando, diga estas frases:

### Preço (PRICE)
- "Quanto custa?"
- "Qual o valor?"
- "Cabe no orçamento?"

### Interesse (BUYING_SIGNAL)
- "Tenho interesse"
- "Quero avançar"
- "Faz sentido"

### Como Funciona (HOW_IT_WORKS)
- "Como funciona?"
- "Pode explicar melhor?"

### Próximo Passo (NEXT_STEP)
- "Qual o próximo passo?"
- "E agora?"

### Risco/Preocupação (RISK)
- "Tenho receio"
- "E se der errado?"
- "Muito arriscado"

### Objeção (OBJECTION)
- "Não tenho certeza"
- "Preciso pensar"
- "Muito complicado"

## Troubleshooting

### ❌ Extensão não aparece no Google Meet

**Solução**:
1. Verifique se a extensão está ativada em `chrome://extensions/`
2. Recarregue a página do Meet (F5)
3. Ative as legendas (CC) manualmente

### ❌ Não vejo transcrições

**Solução**:
1. Certifique-se que ativou as legendas (CC) no Meet
2. Fale algumas frases e aguarde 2-3 segundos
3. Verifique se o overlay está visível (canto inferior direito)

### ❌ Não recebo insights

**Solução**:
1. Verifique sua conexão com a internet
2. O backend pode estar offline - contate o suporte
3. Aguarde 25 segundos entre insights (cooldown global)
4. Tente dizer frases-chave da lista acima

### ❌ Insights aparecem atrasados

**Comportamento Normal**:
- Insights baseados em keywords: aparecem em ~2-5 segundos
- Insights contextuais (análise): aparecem a cada 45 segundos
- Cooldown global: 25 segundos entre qualquer insight

### ❌ Console do Chrome mostra erros

**Como abrir o Console**:
1. No Google Meet, pressione `F12`
2. Vá na aba "Console"
3. Procure por mensagens começando com `[Content]` ou `[SalesMentor]`

**Erros comuns**:
- `WebSocket failed`: Backend offline ou URL incorreta
- `CC button não encontrado`: Google Meet mudou layout
- `Failed to fetch`: Problema de CORS no backend

## Informações Técnicas

- **Versão**: 1.5.0
- **Compatibilidade**: Chrome 88+, Edge 88+, Brave 1.20+
- **Idioma**: Português (Brasil)
- **Modelo AI**: OpenAI GPT-4o-mini

## Suporte

Se você encontrar problemas não listados acima:

1. Abra o Console (F12) e tire um print dos erros
2. Descreva os passos que levaram ao problema
3. Envie para o suporte técnico

---

**Desenvolvido para vendedores que querem melhorar suas calls! 🚀**
