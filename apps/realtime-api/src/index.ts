import fastify from "fastify";
import websocket from "@fastify/websocket";
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

  // Register websocket plugin first
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
