import OpenAI from "openai";
import { z } from "zod";
import { InsightCategoryEnum } from "@sales-mentor/shared";

type InsightCategory = z.infer<typeof InsightCategoryEnum>;

export type InsightCandidate = {
  type: InsightCategory;
  quote: string;
  confidence: number;
  dedupeKey: string;
  ts_ms: number;
  suggestions: string[];
};

const KEYWORD_RULES: Record<InsightCategory, string[]> = {
  BUYING_SIGNAL: ["interesse", "avançar", "fechar", "vamos fazer"],
  HOW_IT_WORKS: ["como funciona", "me explica", "qual o processo", "processo"],
  PRICE: ["quanto custa", "preço", "valor", "orçamento", "caro"],
  OBJECTION: ["preciso pensar", "sem tempo", "já uso", "não agora", "depois"],
  NEXT_STEP: ["manda proposta", "faz demo", "contrato", "agenda", "agendar"],
  RISK: ["não entendi", "confuso", "não está claro", "perdido"],
  OTHER: [],
};

const FALLBACK_SUGGESTIONS: Record<InsightCategory, string[]> = {
  BUYING_SIGNAL: [
    "Confirme o interesse e recapitule o problema que vamos resolver.",
    "Pergunte sobre timeline e próximo passo formal.",
    "Combine quem mais precisa aprovar antes de avançar.",
  ],
  HOW_IT_WORKS: [
    "Explique o fluxo em 3 passos simples, sem jargão.",
    "Mostre um exemplo real do começo ao fim.",
    "Cheque se ficou claro e peça feedback imediato.",
  ],
  PRICE: [
    "Pergunte sobre orçamento/faixa de investimento antes de falar preço.",
    "Contextualize valor com ROI ou casos similares.",
    "Ofereça 2 opções (starter vs completo) para ancorar.",
  ],
  OBJECTION: [
    "Agradeça a honestidade e investigue a objeção raiz com 1 pergunta.",
    "Traga prova social curta alinhada ao caso do cliente.",
    "Confirme se a objeção foi endereçada e proponha micro-próximo passo.",
  ],
  NEXT_STEP: [
    "Defina responsável e data para o próximo passo.",
    "Confirme qual formato de material/proposta é melhor.",
    "Agende já na call um follow-up no calendário.",
  ],
  RISK: [
    "Resuma em 1 frase o que foi dito e peça confirmação.",
    "Pergunte o que ainda está confuso ou faltando.",
    "Reforce o objetivo da call e proponha um caminho claro.",
  ],
  OTHER: [
    "Faça uma pergunta aberta para entender melhor a necessidade.",
    "Reforce a dor principal que estamos resolvendo.",
    "Valide próximo passo para manter o ritmo da call.",
  ],
};

type CallState = Map<InsightCategory, { lastTriggered: number; dedupeKey?: string }>;

export class RuleEngine {
  private readonly cooldownMs: number;
  private readonly openai?: OpenAI;
  private readonly state: Map<string, CallState> = new Map();

  constructor(opts: { cooldownMs: number; openAiApiKey?: string }) {
    this.cooldownMs = opts.cooldownMs;
    if (opts.openAiApiKey) {
      this.openai = new OpenAI({ apiKey: opts.openAiApiKey });
    }
  }

  async evaluate(callId: string, text: string): Promise<InsightCandidate[]> {
    const normalized = text.toLowerCase();
    const now = Date.now();
    const results: InsightCandidate[] = [];

    for (const [category, keywords] of Object.entries(KEYWORD_RULES) as [
      InsightCategory,
      string[]
    ][]) {
      if (!keywords.length) continue;
      const matched = keywords.some((kw) => normalized.includes(kw));
      if (!matched) continue;

      const dedupeKey = `${category}:${normalized.slice(0, 200)}`;
      if (!this.shouldTrigger(callId, category, dedupeKey, now)) {
        continue;
      }

      const suggestions = await this.buildSuggestions(category, text);
      results.push({
        type: category,
        quote: text,
        confidence: 0.72,
        dedupeKey,
        ts_ms: now,
        suggestions,
      });
      this.markTriggered(callId, category, dedupeKey, now);
    }

    return results;
  }

  private async buildSuggestions(
    category: InsightCategory,
    quote: string
  ): Promise<string[]> {
    if (!this.openai) {
      return FALLBACK_SUGGESTIONS[category] || [];
    }

    try {
      const prompt = [
        `Categoria: ${category}`,
        `Fala do cliente: "${quote}"`,
        "Gere 3 bullets curtos e acionáveis para o vendedor responder agora.",
        "Retorne apenas a lista com hífen, nada mais.",
      ].join("\n");

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });

      const text =
        completion.choices[0]?.message?.content ||
        FALLBACK_SUGGESTIONS[category].join("\n");
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[-*]\s?/, "").trim())
        .filter(Boolean);

      return lines.length ? lines.slice(0, 3) : FALLBACK_SUGGESTIONS[category];
    } catch (err) {
      console.error("OpenAI suggestions failed", err);
      return FALLBACK_SUGGESTIONS[category];
    }
  }

  private shouldTrigger(
    callId: string,
    category: InsightCategory,
    dedupeKey: string,
    now: number
  ): boolean {
    const callState = this.state.get(callId);
    if (!callState) {
      return true;
    }

    const last = callState.get(category);
    if (!last) return true;

    if (last.dedupeKey === dedupeKey) return false;
    if (now - last.lastTriggered < this.cooldownMs) return false;

    return true;
  }

  private markTriggered(
    callId: string,
    category: InsightCategory,
    dedupeKey: string,
    ts: number
  ) {
    if (!this.state.has(callId)) {
      this.state.set(callId, new Map());
    }
    const callState = this.state.get(callId)!;
    callState.set(category, { lastTriggered: ts, dedupeKey });
  }
}
