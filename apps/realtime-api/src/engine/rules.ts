// apps/realtime-api/src/engine/rules.ts

export type InsightCategory =
  | 'BUYING_SIGNAL'
  | 'PRICE'
  | 'OBJECTION'
  | 'HOW_IT_WORKS'
  | 'NEXT_STEP'
  | 'RISK';

export interface Rule {
  category: InsightCategory;
  triggers: string[];
  cooldownMs: number;
}

export const RULES: Rule[] = [
  {
    category: 'BUYING_SIGNAL',
    triggers: [
      'tenho interesse',
      'quero avançar',
      'vamos fechar',
      'quero fazer',
      'gostei',
      'interessante',
      'pode ser'
    ],
    cooldownMs: 90_000 // 90s
  },
  {
    category: 'PRICE',
    triggers: [
      'quanto custa',
      'qual o valor',
      'preço',
      'investimento',
      'orçamento',
      'quanto fica',
      'quanto é'
    ],
    cooldownMs: 120_000 // 120s
  },
  {
    category: 'OBJECTION',
    triggers: [
      'preciso pensar',
      'sem tempo',
      'muito caro',
      'já uso',
      'não agora',
      'talvez depois',
      'vou avaliar'
    ],
    cooldownMs: 90_000
  },
  {
    category: 'HOW_IT_WORKS',
    triggers: [
      'como funciona',
      'me explica',
      'qual o processo',
      'não entendi',
      'pode detalhar',
      'como é'
    ],
    cooldownMs: 120_000
  },
  {
    category: 'NEXT_STEP',
    triggers: [
      'próximo passo',
      'e agora',
      'o que fazer',
      'como seguir',
      'manda proposta',
      'me envia',
      'agenda'
    ],
    cooldownMs: 120_000
  },
  {
    category: 'RISK',
    triggers: [
      'não tenho certeza',
      'preocupado',
      'risco',
      'e se não der certo',
      'garantia',
      'seguro'
    ],
    cooldownMs: 90_000
  }
];

export function detectCategory(text: string): InsightCategory | null {
  const textLower = text.toLowerCase();

  for (const rule of RULES) {
    for (const trigger of rule.triggers) {
      if (textLower.includes(trigger)) {
        return rule.category;
      }
    }
  }

  return null;
}

export function getCooldownMs(category: InsightCategory): number {
  const rule = RULES.find(r => r.category === category);
  return rule?.cooldownMs || 60_000;
}
