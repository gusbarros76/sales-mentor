import { SocketStream } from "@fastify/websocket";
import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import {
  ClientSegmentSchema,
  InsightEventSchema,
  StatusMessageSchema,
} from "@sales-mentor/shared";
import { config } from "../config";
import { pool } from "../db";
import { RuleEngine } from "../rules/engine";
import { SessionTokenPayload } from "../types";
import { detectCategory, getCooldownMs } from '../engine/rules';
import { CooldownManager } from '../engine/cooldown';
import { generateInsightCard } from '../engine/openai';

const cooldownManager = new CooldownManager();

export function registerInsightWs(app: FastifyInstance, engine: RuleEngine) {
  app.get(
    "/v1/ws",
    {
      websocket: true,
      schema: {
        querystring: {
          type: "object",
          required: ["call_id", "token"],
          properties: {
            call_id: { type: "string" },
            token: { type: "string" },
          },
        },
      },
    },
    (connection, request) => {
      const ws = connection.socket;
      const queryObj = (request.query as any) || {};

      app.log.info(
        {
          request_url: request.url,
          raw_url: request.raw?.url,
          host: request.headers?.host,
          request_query: queryObj,
        },
        "WS DEBUG: handshake url sources"
      );

      const rawUrl = pickHandshakeUrl(request);
      const queryCallId = sanitizeParam(queryObj.call_id);
      const queryToken = sanitizeParam(queryObj.token);
      const parsed = parseWsParams(rawUrl, request.headers?.host);

      const callId = queryCallId || parsed.callId;
      const token = queryToken || parsed.token;

      app.log.info(
        {
          call_id: callId,
          token_present: Boolean(token),
          rawUrl_used: rawUrl,
          from_query: { call_id: Boolean(queryCallId), token: Boolean(queryToken) },
          from_parsed: { call_id: Boolean(parsed.callId), token: Boolean(parsed.token) },
        },
        "WS connection attempt"
      );

      if (!callId || !token) {
        app.log.warn(
          { call_id: callId, rawUrl_used: rawUrl, request_query: queryObj, parsed },
          "WS rejected: missing params"
        );
        try {
          ws.close(1008, "Missing call_id or token");
        } catch (_err) {
          // ignore close errors
        }
        return;
      }

      let payload: SessionTokenPayload;
      try {
        payload = jwt.verify(token, config.jwtSecret) as SessionTokenPayload;
      } catch (err) {
        app.log.warn({ call_id: callId, rawUrl_used: rawUrl, err }, "WS rejected: invalid token");
        try {
          ws.close(1008, "Invalid token");
        } catch (_err) {
          // ignore close errors
        }
        return;
      }

      if (payload.call_id !== callId) {
        app.log.warn(
          { call_id: callId, token_call_id: payload.call_id, rawUrl_used: rawUrl },
          "WS rejected: call mismatch"
        );
        try {
          ws.close(1008, "Call mismatch");
        } catch (_err) {
          // ignore close errors
        }
        return;
      }

      // CRITICAL: Register event handlers SYNCHRONOUSLY before any async work
      // This ensures the WebSocket handshake completes properly
      let isAuthenticated = false;

      ws.on("message", async (buffer: Buffer | string) => {
        if (!isAuthenticated) {
          sendStatus(ws, { ok: false, msg: "not authenticated yet" });
          return;
        }

        const raw = buffer.toString();
        let parsedMsg: unknown;
        try {
          parsedMsg = JSON.parse(raw);
        } catch (_err) {
          sendStatus(ws, { ok: false, msg: "invalid json" });
          return;
        }

        const parsedSegment = ClientSegmentSchema.safeParse(parsedMsg);
        if (!parsedSegment.success) {
          sendStatus(ws, { ok: false, msg: "invalid payload" });
          return;
        }

        const message = parsedSegment.data;
        if (message.call_id !== callId) {
          sendStatus(ws, { ok: false, msg: "call id mismatch" });
          return;
        }

        // Ack any valid payload so clients always see a response
        try {
          ws.send(JSON.stringify({ event: "status", ok: true, msg: "received" }));
        } catch (_err) {
          // ignore send errors
        }

        const started = Date.now();

        try {
          await pool.query(
            `INSERT INTO segments
             (id, call_id, source, speaker, start_ms, end_ms, text, asr_confidence, is_echo_suspected)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              message.call_id,
              message.source,
              message.speaker,
              message.start_ms ?? null,
              message.end_ms ?? null,
              message.text,
              message.asr_confidence ?? null,
              message.is_echo_suspected ?? false,
            ]
          );

          app.log.info(
            {
              call_id: callId,
              company_id: payload.company_id,
              agent_id: payload.agent_id,
              text: message.text,
            },
            "segment stored"
          );

          // Processar com rules engine
          const category = detectCategory(message.text);

          if (category) {
            const cooldownMs = getCooldownMs(category);
            const canTrigger = cooldownManager.canTrigger(callId, category, cooldownMs);

            if (canTrigger) {
              app.log.info({ callId, category }, 'WS: generating insight');

              try {
                const card = await generateInsightCard({
                  category,
                  clientText: message.text
                });

                cooldownManager.markTriggered(callId, category);

                // Enviar insight para extensão
                ws.send(JSON.stringify({
                  type: 'insight',
                  call_id: callId,
                  category,
                  title: card.title,
                  suggestions: card.suggestions,
                  question: card.question,
                  quote: message.text,
                  ts: Date.now()
                }));

                app.log.info({ callId, category, title: card.title }, 'WS: insight sent');
              } catch (err) {
                app.log.error({ err, callId, category }, 'WS: failed to generate insight');
              }
            } else {
              app.log.debug({ callId, category }, 'WS: insight in cooldown');
            }
          }

          const latency = Date.now() - started;
          sendStatus(ws, { ok: true, msg: "segment saved", latency_ms: latency });
        } catch (err) {
          app.log.error(
            { err, call_id: callId, company_id: payload.company_id, agent_id: payload.agent_id },
            "ws processing failed"
          );
          sendStatus(ws, { ok: false, msg: "server_error" });
        }
      });

      ws.on("close", () => {
        app.log.info({ call_id: callId }, "WS: connection closed");
      });

      ws.on("error", (err) => {
        app.log.error({ err, call_id: callId }, "WS: socket error");
      });

      // Now perform async validation and send welcome message
      (async () => {
        try {
          const res = await pool.query(
            "SELECT company_id, agent_id, status FROM calls WHERE id = $1 LIMIT 1",
            [callId]
          );

          if (!res.rowCount) {
            app.log.warn({ call_id: callId }, "WS rejected: call not found");
            try {
              ws.close(1008, "Call not found");
            } catch (_err) {
              // ignore close errors
            }
            return;
          }

          const call = res.rows[0];
          if (call.company_id !== payload.company_id) {
            app.log.warn(
              { call_id: callId, company_id: call.company_id },
              "WS rejected: company mismatch"
            );
            try {
              ws.close(1008, "Company mismatch");
            } catch (_err) {
              // ignore close errors
            }
            return;
          }

          if (call.status === "ENDED") {
            app.log.warn({ call_id: callId }, "WS rejected: call ended");
            try {
              ws.close(1008, "Call ended");
            } catch (_err) {
              // ignore close errors
            }
            return;
          }

          // Mark as authenticated - messages will now be processed
          isAuthenticated = true;

          // Send welcome message to confirm handshake to clients
          try {
            ws.send(JSON.stringify({ event: "status", ok: true, msg: "connected" }));
          } catch (_err) {
            // ignore send errors during handshake
          }

          app.log.info(
            { call_id: callId, company_id: payload.company_id, agent_id: payload.agent_id },
            "WS authenticated"
          );
        } catch (err) {
          app.log.error({ err, call_id: callId }, "ws setup failed");
          try {
            ws.send(JSON.stringify({ event: "status", ok: false, msg: "server_error" }));
            ws.close(1011, "server error");
          } catch (_err) {
            // ignore errors during error handling
          }
        }
      })();
    }
  );
}

function pickHandshakeUrl(request: any): string | null {
  const candidates = [
    request.raw?.originalUrl,
    request.raw?.url,
    request.url,
    (request.raw as any)?.req?.url,
  ].filter(Boolean) as string[];

  const withQuery = candidates.find((c) => c.includes("?"));
  return withQuery || candidates[0] || null;
}

function parseWsParams(rawUrl?: string | null, host?: string | null) {
  if (!rawUrl) return { callId: null, token: null, rawUrl };
  try {
    const base = `http://${host || "localhost"}`;
    const parsed = new URL(rawUrl, base);
    return {
      callId: sanitizeParam(parsed.searchParams.get("call_id")),
      token: sanitizeParam(parsed.searchParams.get("token")),
      rawUrl,
    };
  } catch (_err) {
    return { callId: null, token: null, rawUrl };
  }
}

function sendStatus(
  ws: any,
  payload: { ok: boolean; msg?: string; latency_ms?: number }
) {
  const parsed = StatusMessageSchema.safeParse({ event: "status", ...payload });
  if (!parsed.success) return;
  try {
    ws.send(JSON.stringify(parsed.data));
  } catch (_err) {
    // ignore send errors
  }
}

function sendInsight(ws: any, payload: any) {
  try {
    ws.send(JSON.stringify(payload));
  } catch (_err) {
    // ignore send errors
  }
}

function sanitizeParam(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim();
  return cleaned.length ? cleaned : null;
}
