import "dotenv/config";
import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";

async function main() {
  try {
    await prisma.$connect();
    logger.info("Database connected");
    const server = app.listen(config.port, () => logger.info(`Server running at http://localhost:${config.port}`));
    const shutdown = (signal: NodeJS.Signals) => {
      logger.info(`Received ${signal}, shutting down gracefully…`);
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error(error, "Failed to start server");
    process.exit(1);
  }
}

void main();
