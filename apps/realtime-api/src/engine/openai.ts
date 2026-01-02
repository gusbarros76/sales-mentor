// apps/realtime-api/src/engine/openai.ts

import OpenAI from 'openai';
import { InsightCategory } from './rules';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface GenerateCardInput {
  category: InsightCategory;
  clientText: string;
  recentContext?: string[]; // Últimas 3-5 falas do cliente
}

interface InsightCard {
  title: string;
  urgency: 'high' | 'medium' | 'low';
  context: string;
  suggestions: string[]; // 3-4 ações priorizadas
  question: string;
  pitfalls: string[]; // 2-3 armadilhas a evitar
  script?: string; // Script pronto para vendedor usar
}

const CATEGORY_PROMPTS: Record<InsightCategory, string> = {
  BUYING_SIGNAL: `O cliente demonstrou INTERESSE DE COMPRA. Esta é uma janela de oportunidade CRÍTICA.

Como coach de vendas expert, gere um card ACIONÁVEL:

**Título:** Curto, motivador e urgente (ex: "🔥 Cliente Aquecido - Hora de Fechar!")

**Urgency:** "high" (esta é uma oportunidade quente)

**Context:** Explique em 1 frase por que este momento é decisivo para fechar negócio.

**Suggestions (3-4 ações priorizadas):**
1. Usar técnica de fechamento assumptivo (assumir que venda está confirmada)
2. Criar senso de urgência (escassez, bônus temporário, deadline)
3. Preparar próximo passo concreto (enviar contrato, agendar assinatura)
4. Pedir referências ou expandir conta (momentum positivo)

**Question:** Pergunta de FECHAMENTO ASSUMPTIVO que presume acordo (ex: "Prefere começar na segunda ou na quarta?")

**Pitfalls (2-3 erros fatais a evitar):**
- NÃO questionar o interesse ("tem certeza?")
- NÃO introduzir novas informações ou dúvidas
- NÃO deixar sem próximo passo agendado

**Script (opcional):** Frase pronta específica para a situação do cliente.`,

  PRICE: `O cliente perguntou sobre PREÇO. Momento delicado que pode fazer ou quebrar a venda.

Como coach de vendas expert usando técnica de Value-Based Selling:

**Título:** Curto e estratégico (ex: "💰 Preço Mencionado - Ancorar Valor ANTES")

**Urgency:** "high" (resposta errada pode perder a venda)

**Context:** Explique em 1 frase por que falar preço sem contexto de valor é perigoso.

**Suggestions (3-4 ações priorizadas):**
1. NÃO dar o preço ainda - primeiro ancorear valor e ROI
2. Fazer pergunta de qualificação orçamentária (BANT: Budget)
3. Apresentar custo de NÃO resolver o problema (dor atual)
4. Usar framing de investimento vs custo ("investimento que se paga em X meses")

**Question:** Pergunta para entender orçamento e expectativa SEM revelar preço ainda (ex: "Qual range de investimento você considerou para resolver isso?")

**Pitfalls (2-3 erros fatais):**
- NÃO soltar o preço sem mostrar valor/benefícios antes
- NÃO justificar preço de forma defensiva
- NÃO comparar apenas com concorrentes mais baratos

**Script (opcional):** Frase de transição do preço para valor (ex: "Ótima pergunta! Antes de entrar em valores, me conta: quanto você estima que esse problema está custando hoje?")`,

  OBJECTION: `O cliente levantou uma OBJEÇÃO. Esta é uma oportunidade de entender a real necessidade.

Como coach de vendas expert usando técnica LAER (Listen, Acknowledge, Explore, Respond):

**Título:** Empático e construtivo (ex: "⚠️ Objeção Detectada - Investigar Fundo")

**Urgency:** "medium" (importante resolver, mas sem pressão)

**Context:** Explique em 1 frase por que objeções são oportunidades (normalmente escondem o real problema).

**Suggestions (3-4 ações usando LAER):**
1. LISTEN: Deixar cliente terminar completamente, não interromper
2. ACKNOWLEDGE: Validar preocupação sem concordar ("Entendo sua preocupação...")
3. EXPLORE: Fazer perguntas para encontrar o REAL motivo (objeção é superficial)
4. RESPOND: Só depois de entender, responder com case/exemplo específico

**Question:** Pergunta EXPLORATÓRIA para descobrir a raiz da objeção usando técnica "5 porquês" (ex: "Me ajuda a entender: quando você diz X, o que te preocupa especificamente?")

**Pitfalls (2-3 erros fatais):**
- NÃO responder imediatamente (parece defensivo)
- NÃO argumentar ou contradizer cliente diretamente
- NÃO assumir que entendeu a objeção sem explorar

**Script (opcional):** Frase de validação + pergunta exploratória específica para esta objeção.`,

  HOW_IT_WORKS: `O cliente pediu EXPLICAÇÕES. Momento de educar sem complicar.

Como coach de vendas expert em apresentações consultivas:

**Título:** Curto e claro (ex: "💡 Dúvida Técnica - Simplificar e Conectar ao Valor")

**Urgency:** "medium" (importante educar bem)

**Context:** Explique em 1 frase por que explicações devem conectar features a benefícios do cliente.

**Suggestions (3-4 ações priorizadas):**
1. Usar analogias simples (evitar jargão técnico)
2. Conectar funcionalidade ao problema específico DO CLIENTE
3. Mostrar exemplo prático ou case de cliente similar
4. Confirmar entendimento antes de continuar

**Question:** Pergunta para confirmar entendimento e conectar ao valor (ex: "Faz sentido? E como você vê isso resolvendo [problema específico do cliente]?")

**Pitfalls (2-3 erros fatais):**
- NÃO fazer "feature dump" (listar recursos sem conectar a valor)
- NÃO usar jargão técnico demais
- NÃO explicar sem confirmar se cliente está acompanhando

**Script (opcional):** Analogia simples e frase de conexão ao problema do cliente.`,

  NEXT_STEP: `O cliente perguntou sobre PRÓXIMOS PASSOS. Janela para criar compromisso concreto.

Como coach de vendas expert em gestão de pipeline:

**Título:** Curto e acionável (ex: "✅ Próximo Passo - Agendar Compromisso AGORA")

**Urgency:** "high" (sem próximo passo agendado, lead esfria)

**Context:** Explique em 1 frase por que é crítico sair desta conversa com data e hora marcada.

**Suggestions (3-4 ações priorizadas):**
1. Propor próximo passo específico COM DATA E HORA (não "semana que vem")
2. Oferecer 2 opções de data/hora (técnica do "ou...ou")
3. Confirmar participantes e enviar convite imediatamente
4. Preparar pré-work ou material que cliente deve ver antes

**Question:** Pergunta de agendamento com 2 opções (ex: "Perfeito! Te mando a proposta amanhã e a gente agenda 30min quinta às 14h ou sexta às 10h para revisar juntos. Qual funciona melhor?")

**Pitfalls (2-3 erros fatais):**
- NÃO deixar vago ("a gente se fala")
- NÃO assumir que cliente vai retornar sozinho
- NÃO sair sem data/hora específica agendada

**Script (opcional):** Frase de transição com agendamento específico.`,

  RISK: `O cliente demonstrou PREOCUPAÇÃO/RISCO. Momento de gerar segurança e confiança.

Como coach de vendas expert em gestão de objeções de risco:

**Título:** Curto e tranquilizador (ex: "🛡️ Preocupação Identificada - Gerar Segurança")

**Urgency:** "high" (preocupação não resolvida = não compra)

**Context:** Explique em 1 frase por que preocupações de risco são normais e podem ser convertidas em confiança.

**Suggestions (3-4 ações priorizadas):**
1. Validar a preocupação como legítima (não minimizar)
2. Apresentar prova social (case de cliente similar que tinha mesma dúvida)
3. Oferecer garantias, piloto ou período de teste
4. Mostrar plano de mitigação de risco específico

**Question:** Pergunta para mapear o tamanho do risco percebido (ex: "Se pudéssemos garantir [X], isso resolveria sua preocupação ou existe algo mais?")

**Pitfalls (2-3 erros fatais):**
- NÃO minimizar preocupação ("isso nunca acontece")
- NÃO empurrar venda sem resolver risco
- NÃO deixar vago - oferecer garantia concreta

**Script (opcional):** Validação + case específico + garantia oferecida.`
};

export async function generateInsightCard(input: GenerateCardInput): Promise<InsightCard> {
  const systemPrompt = `Você é um coach de vendas SÊNIOR com 15+ anos de experiência em vendas consultivas B2B.

EXPERTISE:
- Metodologias: SPIN Selling, BANT, Challenger Sale, MEDDIC, Value-Based Selling
- Especialidade: Vendas de alto ticket e ciclos longos
- Foco: Coaching em tempo real, ações ACIONÁVEIS e práticas

ESTILO DE RESPOSTA:
- Objetivo e direto (vendedor precisa agir rápido)
- Baseado em frameworks provados de vendas
- Empático mas assertivo
- Sempre em português BR
- Use emojis nos títulos quando apropriado (🔥, 💰, ⚠️, 💡, ✅, 🛡️)

OUTPUT:
- JSON puro, sem markdown
- Sugestões priorizadas (mais importante primeiro)
- Scripts prontos quando possível
- Evitar jargão, usar linguagem clara e acionável`;

  const userPrompt = `${CATEGORY_PROMPTS[input.category]}

Fala do cliente: "${input.clientText}"

${input.recentContext?.length ? `Contexto recente:\n${input.recentContext.join('\n')}` : ''}

Responda APENAS com JSON neste formato exato:
{
  "title": "título curto com emoji",
  "urgency": "high" | "medium" | "low",
  "context": "uma frase explicando por que este momento é importante",
  "suggestions": ["ação 1 específica", "ação 2 específica", "ação 3 específica", "ação 4 opcional"],
  "question": "pergunta estratégica específica para o contexto",
  "pitfalls": ["erro fatal 1 a evitar", "erro fatal 2 a evitar", "erro fatal 3 opcional"],
  "script": "frase pronta opcional que vendedor pode usar neste momento"
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 600,
    response_format: { type: "json_object" }
  });

  const content = completion.choices[0]?.message?.content || '{}';

  try {
    return JSON.parse(content);
  } catch {
    // Fallback se OpenAI não retornar JSON válido
    return {
      title: `⚠️ Insight: ${input.category}`,
      urgency: 'medium',
      context: 'Momento importante detectado na conversa.',
      suggestions: [
        'Aja com base no contexto da conversa',
        'Mantenha foco nas necessidades do cliente',
        'Busque próximos passos concretos'
      ],
      question: 'Como posso ajudar mais?',
      pitfalls: [
        'Não perder o momentum da conversa',
        'Não assumir sem confirmar com cliente'
      ]
    };
  }
}

/**
 * Análise contextual periódica (timer de 45s)
 * Analisa últimas falas do cliente para detectar sinais implícitos
 */
export async function generateContextualInsight(
  recentSegments: Array<{ text: string }>
): Promise<InsightCard | null> {
  if (recentSegments.length < 2) {
    return null; // Precisa de pelo menos 2 falas para análise contextual
  }

  const systemPrompt = `Você é um coach de vendas SÊNIOR analisando uma conversa em andamento.

TAREFA:
1. Analise o contexto completo das últimas falas do CLIENTE
2. Identifique sinais IMPLÍCITOS que o vendedor deve notar:
   - Sinais de interesse (mesmo sem palavras explícitas)
   - Objeções veladas ou preocupações não verbalizadas
   - Confusão ou dúvidas sutis
   - Mudança de tom ou direção da conversa
   - Oportunidades de fechamento

3. Se houver um momento CRÍTICO que exige ação do vendedor:
   - Gere um insight completo com urgência, contexto, sugestões, pitfalls e script

4. Se a conversa está fluindo bem SEM necessidade de intervenção:
   - Retorne: {"no_insight_needed": true}

CRITÉRIO DE IMPORTÂNCIA:
- Só gere insight se for REALMENTE relevante (não gere por gerar)
- Priorize sinais de compra, objeções graves, ou mudanças críticas de direção

OUTPUT: JSON puro sem markdown`;

  const userPrompt = `Últimas ${recentSegments.length} falas do CLIENTE:

${recentSegments.map((s, i) => `${i + 1}. "${s.text}"`).join('\n')}

Analise o contexto e decida se há um insight crítico necessário.

Responda com um dos formatos:

A) Se houver insight necessário:
{
  "title": "título com emoji",
  "urgency": "high" | "medium" | "low",
  "context": "por que este momento é crítico",
  "suggestions": ["ação 1", "ação 2", "ação 3"],
  "question": "pergunta estratégica",
  "pitfalls": ["erro 1 a evitar", "erro 2 a evitar"],
  "script": "frase pronta opcional"
}

B) Se não há necessidade de insight agora:
{
  "no_insight_needed": true
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6, // Um pouco mais conservador para análise contextual
      max_tokens: 600,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    // Se GPT decidiu que não precisa de insight
    if (parsed.no_insight_needed === true) {
      return null;
    }

    // Validar estrutura mínima
    if (!parsed.title || !parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      return null;
    }

    return parsed as InsightCard;
  } catch (err) {
    console.error('Error generating contextual insight:', err);
    return null;
  }
}
