import { z } from "zod";

export const SpeakerEnum = z.enum(["VENDEDOR", "CLIENTE"]);
export const SourceEnum = z.enum(["MIC", "TAB"]);
export const InsightCategoryEnum = z.enum([
  "BUYING_SIGNAL",
  "HOW_IT_WORKS",
  "PRICE",
  "OBJECTION",
  "NEXT_STEP",
  "RISK",
  "OTHER",
]);

export const ClientSegmentSchema = z.object({
  event: z.literal("client_segment"),
  call_id: z.string().uuid(),
  speaker: z.literal("CLIENTE"),
  text: z.string().min(1),
  start_ms: z.number().int().nonnegative().optional(),
  end_ms: z.number().int().nonnegative().optional(),
  source: z.literal("TAB"),
  asr_confidence: z.number().min(0).max(1).optional(),
  is_echo_suspected: z.boolean().optional(),
});

export const InsightEventSchema = z.object({
  event: z.literal("insight_event"),
  call_id: z.string().uuid(),
  type: InsightCategoryEnum,
  confidence: z.number().min(0).max(1).optional(),
  quote: z.string(),
  suggestions: z.array(z.string()).default([]),
  ts_ms: z.number().int(),
});

export const StatusMessageSchema = z.object({
  event: z.literal("status"),
  ok: z.boolean(),
  msg: z.string().optional(),
  latency_ms: z.number().int().nonnegative().optional(),
});

export const ServerMessageSchema = z.union([
  InsightEventSchema,
  StatusMessageSchema,
]);

export type ClientSegmentMessage = z.infer<typeof ClientSegmentSchema>;
export type InsightEventMessage = z.infer<typeof InsightEventSchema>;
export type StatusMessage = z.infer<typeof StatusMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
