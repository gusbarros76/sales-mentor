// apps/realtime-api/src/services/report.ts

import OpenAI from 'openai';
import { Pool } from 'pg';
import { getSegmentsByCallId } from './segments';
import { getInsightsByCallId } from './insights';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface ReportData {
  call_id: string;
  segments: any[];
  insights: any[];
}

export async function generateReport(pool: Pool, callId: string): Promise<{ markdown: string; json: any }> {
  // 1. Buscar dados da call
  const segments = await getSegmentsByCallId(pool, callId);
  const insights = await getInsightsByCallId(pool, callId);

  if (segments.length === 0) {
    throw new Error('No segments found for this call');
  }

  // 2. Preparar contexto para OpenAI
  const transcript = segments
    .map(s => `[${s.speaker}]: ${s.text}`)
    .join('\n');

  const insightsSummary = insights
    .map(i => `- ${i.type}: "${i.quote}"`)
    .join('\n');

  // 3. Gerar relatório com OpenAI
  const systemPrompt = `Você é um especialista em análise de vendas.
Gere um relatório executivo completo baseado na transcrição da call e nos insights gerados.

O relatório deve ter:
1. Resumo Executivo (2-3 parágrafos)
2. Necessidades e Dores do Cliente (bullet points)
3. Objeções Levantadas (bullet points com contexto)
4. Sinais de Compra (bullet points)
5. Próximos Passos (ações concretas com responsável e prazo sugerido)
6. Checklist do Vendedor nas Próximas 24h

Use markdown para formatação. Seja objetivo e acionável.`;

  const userPrompt = `# Transcrição da Call

${transcript}

# Insights Gerados Durante a Call

${insightsSummary}

Gere o relatório executivo completo seguindo a estrutura solicitada.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  const reportMarkdown = completion.choices[0]?.message?.content || '# Relatório não disponível';

  // 4. Estruturar JSON
  const reportJson = {
    call_id: callId,
    generated_at: new Date().toISOString(),
    summary: {
      total_segments: segments.length,
      total_insights: insights.length,
      duration_ms: segments[segments.length - 1]?.end_ms || 0
    },
    insights_by_category: insights.reduce((acc: any, i: any) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {}),
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      version: '2024-12'
    }
  };

  return {
    markdown: reportMarkdown,
    json: reportJson
  };
}

export async function saveReport(
  pool: Pool,
  callId: string,
  markdown: string,
  json: any
): Promise<string> {
  const query = `
    INSERT INTO reports (call_id, report_md, report_json, model, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING id
  `;

  const model = {
    provider: 'openai',
    model: 'gpt-4o-mini'
  };

  const values = [callId, markdown, JSON.stringify(json), JSON.stringify(model)];
  const result = await pool.query(query, values);
  return result.rows[0].id;
}

export async function getReport(pool: Pool, callId: string): Promise<any> {
  const query = `
    SELECT id, call_id, report_md, report_json, model, created_at
    FROM reports
    WHERE call_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [callId]);
  return result.rows[0] || null;
}
