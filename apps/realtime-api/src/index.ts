import fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { config } from "./config";
import { registerCallRoutes } from "./routes/calls";
import { registerInsightWs } from "./ws/insights";
import { RuleEngine } from "./rules/engine";

async function main() {
  const app = fastify({
    logger: {
      level: "info",
    },
  });

  // Register CORS first (before routes)
  await app.register(cors, {
    origin: (origin, callback) => {
      // Durante desenvolvimento, permitir tudo
      // WebSockets de extensions não enviam Origin da mesma forma
      app.log.info({ origin }, 'CORS check');

      // Sempre permitir (modo desenvolvimento)
      callback(null, true);

      /* Produção - descomentar:
      if (!origin || origin.startsWith('chrome-extension://')) {
        callback(null, true);
        return;
      }
      if (origin === 'http://localhost:5173' || origin === 'http://localhost:8080') {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'), false);
      */
    },
    credentials: true
  });

  // Health check endpoint
  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Register websocket plugin
  await app.register(websocket);

  const engine = new RuleEngine({
    cooldownMs: config.cooldownMs,
    openAiApiKey: config.openAiApiKey,
  });

  await registerCallRoutes(app);

  // Register WebSocket routes in an async plugin context
  await app.register(async (fastifyInstance) => {
    registerInsightWs(fastifyInstance, engine);
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`realtime-api listening on port ${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
