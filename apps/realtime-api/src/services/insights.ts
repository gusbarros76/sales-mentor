// apps/realtime-api/src/services/insights.ts

import { Pool } from 'pg';
import { InsightCategory } from '../engine/rules';

export interface InsightInput {
  call_id: string;
  type: InsightCategory;
  confidence: number;
  quote: string;
  suggestions: string[];
  title?: string;
  question?: string;
  model_provider?: string;
  model_name?: string;
}

export async function saveInsight(pool: Pool, input: InsightInput): Promise<string> {
  const query = `
    INSERT INTO insights (
      call_id, type, confidence, quote, suggestions,
      model, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id
  `;

  const model = {
    provider: input.model_provider || 'openai',
    model: input.model_name || 'gpt-4o-mini',
    title: input.title,
    question: input.question
  };

  const values = [
    input.call_id,
    input.type,
    input.confidence,
    input.quote,
    JSON.stringify(input.suggestions),
    JSON.stringify(model)
  ];

  const result = await pool.query(query, values);
  return result.rows[0].id;
}

export async function getInsightsByCallId(pool: Pool, callId: string): Promise<any[]> {
  const query = `
    SELECT id, type, confidence, quote, suggestions, model, created_at
    FROM insights
    WHERE call_id = $1
    ORDER BY created_at ASC
  `;

  const result = await pool.query(query, [callId]);
  return result.rows;
}
