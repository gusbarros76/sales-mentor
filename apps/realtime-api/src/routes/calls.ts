import { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config";
import { pool } from "../db";
import { SessionTokenPayload } from "../types";
import { generateReport, saveReport, getReport } from '../services/report';

const createCallSchema = z.object({
  company_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  title: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function registerCallRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  app.post("/v1/calls", async (request, reply) => {
    const parsed = createCallSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }

    const { company_id, agent_id, title, metadata } = parsed.data;

    const company = await pool.query(
      "SELECT id FROM companies WHERE id = $1 LIMIT 1",
      [company_id]
    );
    if (!company.rowCount) {
      return reply.status(400).send({ error: "invalid_company" });
    }

    const agent = await pool.query(
      "SELECT id, company_id FROM agents WHERE id = $1 LIMIT 1",
      [agent_id]
    );
    if (!agent.rowCount || agent.rows[0].company_id !== company_id) {
      return reply.status(400).send({ error: "invalid_agent" });
    }

    const callInsert = await pool.query(
      `INSERT INTO calls (company_id, agent_id, title, metadata, status, started_at)
       VALUES ($1, $2, $3, $4, 'RUNNING', now())
       RETURNING id, started_at`,
      [company_id, agent_id, title || null, metadata || {}]
    );

    const callId = callInsert.rows[0].id as string;
    const payload: SessionTokenPayload = { call_id: callId, company_id, agent_id };
    const sessionToken = jwt.sign(payload, config.jwtSecret, {
      expiresIn: "4h",
    });

    app.log.info({ call_id: callId, company_id, agent_id }, "call created");

    return reply.send({
      call_id: callId,
      ws_url: buildWsUrl(request, callId, sessionToken),
      session_token: sessionToken,
    });
  });

  app.post("/v1/calls/:call_id/stop", async (request, reply) => {
    const { call_id } = request.params as { call_id: string };
    if (!call_id) {
      return reply.status(400).send({ error: "missing_call_id" });
    }

    try {
      // 1. Atualizar status da call
      const update = await pool.query(
        `UPDATE calls
         SET status = 'ENDED', ended_at = COALESCE(ended_at, now())
         WHERE id = $1
         RETURNING id, company_id, agent_id, status, ended_at`,
        [call_id]
      );

      if (!update.rowCount) {
        return reply.status(404).send({ error: "call_not_found" });
      }

      const row = update.rows[0];
      app.log.info(
        { call_id, company_id: row.company_id, agent_id: row.agent_id },
        "call stopped"
      );

      // 2. Gerar relatório
      app.log.info({ call_id }, 'Generating post-call report...');
      const { markdown, json } = await generateReport(pool, call_id);

      // 3. Salvar relatório
      const reportId = await saveReport(pool, call_id, markdown, json);
      app.log.info({ call_id, reportId }, 'Report generated and saved');

      return reply.send({
        status: "ENDED",
        call_id,
        report_id: reportId,
        ended_at: row.ended_at,
        message: 'Call ended and report generated'
      });
    } catch (err) {
      app.log.error({ err, call_id }, 'Failed to stop call or generate report');
      return reply.status(500).send({ error: 'Failed to stop call' });
    }
  });

  app.get("/v1/calls/:call_id/report", async (request, reply) => {
    const { call_id } = request.params as { call_id: string };
    if (!call_id) {
      return reply.status(400).send({ error: "missing_call_id" });
    }

    try {
      const report = await getReport(pool, call_id);

      if (!report) {
        return reply.status(404).send({ error: 'Report not found for this call' });
      }

      return reply.send({
        call_id: report.call_id,
        report_md: report.report_md,
        report_json: report.report_json,
        created_at: report.created_at
      });
    } catch (err) {
      app.log.error({ err, call_id }, 'Failed to fetch report');
      return reply.status(500).send({ error: 'Failed to fetch report' });
    }
  });
}

function buildWsUrl(
  request: FastifyRequest,
  callId: string,
  token: string
): string {
  const protocol = request.protocol === "https" ? "wss" : "ws";
  const host = request.headers.host || `localhost:${config.port}`;
  return `${protocol}://${host}/v1/ws?call_id=${callId}&token=${encodeURIComponent(
    token
  )}`;
}
