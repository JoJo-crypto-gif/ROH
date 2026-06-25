import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { AppError } from "./lib/errors.js";
import { authRouter } from "./modules/auth/auth.router.js";
import { usersRouter } from "./modules/users/users.router.js";
import { rolesRouter } from "./modules/roles/roles.router.js";
import { academicRouter } from "./modules/academic/academic.router.js";
import { studentsRouter } from "./modules/students/students.router.js";
import { calendarRouter } from "./modules/calendar/calendar.router.js";
import { ZodError } from "zod";
import morgan from "morgan";
import { logger } from "./lib/logger.js";

const app = express();

// ── Middleware ────────────────────────────────────────────
app.use(cors({
  origin: config.client.url,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const morganFormat = config.env === "development"
  ? (tokens: any, req: any, res: any) => {
      return [
        tokens.method(req, res),
        tokens.url(req, res),
        tokens.status(req, res),
        tokens['response-time'](req, res), 'ms',
        '-',
        req.user?.id ? `user:${req.user.id}` : "anonymous"
      ].join(' ')
    }
  : (tokens: any, req: any, res: any) => {
      return [
        tokens['remote-addr'](req, res),
        '-',
        req.user?.id ? `user:${req.user.id}` : "anonymous",
        '[' + tokens.date(req, res, 'clf') + ']',
        '"' + tokens.method(req, res) + ' ' + tokens.url(req, res) + ' HTTP/' + tokens['http-version'](req, res) + '"',
        tokens.status(req, res),
        tokens.res(req, res, 'content-length'),
        '"' + tokens.referrer(req, res) + '"',
        '"' + tokens['user-agent'](req, res) + '"'
      ].join(' ')
    };

app.use(morgan(morganFormat as any, {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// ── Health check ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/roles", rolesRouter);
app.use("/academic", academicRouter);
app.use("/students", studentsRouter);
app.use("/calendar", calendarRouter);

// ── Global error handler ─────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      code: "VALIDATION_ERROR",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // Our custom AppError
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err, "Server Error");
    } else {
      logger.warn({ msg: "Client Error", error: err.message, code: err.code });
    }
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unknown errors
  logger.error(err, "Unhandled error during request");
  res.status(500).json({
    error: "Internal server error",
  });
});

// ── Start server ─────────────────────────────────────────
async function main() {
  try {
    await prisma.$connect();
    logger.info("✅ Database connected");

    const server = app.listen(config.port, () => {
      logger.info(`🚀 Server running at http://localhost:${config.port}`);
      logger.info(`   Environment: ${config.env}`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        logger.info("Closed out remaining connections");
        await prisma.$disconnect();
        logger.info("Database disconnected");
        process.exit(0);
      });

      // Force close after 10s
      setTimeout(() => {
        logger.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (err) {
    logger.error(err, "❌ Failed to start server");
    process.exit(1);
  }
}

main();
