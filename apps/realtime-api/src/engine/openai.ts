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
  suggestions: string[]; // 2-3 ações objetivas
  question?: string; // Pergunta sugerida
}

const CATEGORY_PROMPTS: Record<InsightCategory, string> = {
  BUYING_SIGNAL: `O cliente demonstrou interesse. Gere um card de coaching para o vendedor:
- Título: curto e motivador
- Sugestões: 2-3 ações para avançar na venda
- Pergunta: uma pergunta de fechamento`,

  PRICE: `O cliente perguntou sobre preço. Gere um card de coaching:
- Título: curto e objetivo
- Sugestões: 2-3 táticas para justificar valor (não falar número antes de mostrar benefícios)
- Pergunta: uma pergunta para entender orçamento/expectativa`,

  OBJECTION: `O cliente levantou uma objeção. Gere um card de coaching:
- Título: curto e empático
- Sugestões: 2-3 formas de contornar a objeção sem ser agressivo
- Pergunta: uma pergunta para entender a real preocupação`,

  HOW_IT_WORKS: `O cliente pediu explicações. Gere um card de coaching:
- Título: curto e claro
- Sugestões: 2-3 dicas para explicar de forma simples
- Pergunta: uma pergunta para confirmar entendimento`,

  NEXT_STEP: `O cliente perguntou sobre próximos passos. Gere um card de coaching:
- Título: curto e acionável
- Sugestões: 2-3 ações concretas (proposta, demo, reunião)
- Pergunta: uma pergunta para agendar compromisso`,

  RISK: `O cliente demonstrou preocupação/risco. Gere um card de coaching:
- Título: curto e tranquilizador
- Sugestões: 2-3 formas de gerar segurança
- Pergunta: uma pergunta para mapear a preocupação real`
};

export async function generateInsightCard(input: GenerateCardInput): Promise<InsightCard> {
  const systemPrompt = `Você é um coach de vendas experiente.
Gere respostas em JSON puro, sem markdown.
Seja objetivo, acionável e empático.`;

  const userPrompt = `${CATEGORY_PROMPTS[input.category]}

Fala do cliente: "${input.clientText}"

${input.recentContext?.length ? `Contexto recente:\n${input.recentContext.join('\n')}` : ''}

Responda APENAS com JSON neste formato:
{
  "title": "título curto",
  "suggestions": ["ação 1", "ação 2", "ação 3"],
  "question": "pergunta sugerida?"
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 300
  });

  const content = completion.choices[0]?.message?.content || '{}';

  try {
    return JSON.parse(content);
  } catch {
    // Fallback se OpenAI não retornar JSON válido
    return {
      title: `Insight: ${input.category}`,
      suggestions: ['Aja com base no contexto da conversa'],
      question: 'Como posso ajudar mais?'
    };
  }
}
