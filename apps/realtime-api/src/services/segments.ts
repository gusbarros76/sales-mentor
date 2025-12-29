// apps/realtime-api/src/services/segments.ts

import { Pool } from 'pg';

export interface SegmentInput {
  call_id: string;
  source: 'MIC' | 'TAB';
  speaker: 'VENDEDOR' | 'CLIENTE';
  start_ms: number;
  end_ms: number;
  text: string;
  asr_confidence?: number;
}

export async function saveSegment(pool: Pool, input: SegmentInput): Promise<string> {
  const query = `
    INSERT INTO segments (
      call_id, source, speaker, start_ms, end_ms, text, asr_confidence, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id
  `;

  const values = [
    input.call_id,
    input.source,
    input.speaker,
    input.start_ms,
    input.end_ms,
    input.text,
    input.asr_confidence || null
  ];

  const result = await pool.query(query, values);
  return result.rows[0].id;
}

export async function getSegmentsByCallId(pool: Pool, callId: string): Promise<any[]> {
  const query = `
    SELECT id, source, speaker, start_ms, end_ms, text, asr_confidence, created_at
    FROM segments
    WHERE call_id = $1
    ORDER BY start_ms ASC
  `;

  const result = await pool.query(query, [callId]);
  return result.rows;
}
