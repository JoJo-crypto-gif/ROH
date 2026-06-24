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
import { ZodError } from "zod";

const app = express();

// ── Middleware ────────────────────────────────────────────
app.use(cors({
  origin: config.client.url,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ── Health check ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/roles", rolesRouter);

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
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unknown errors
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
  });
});

// ── Start server ─────────────────────────────────────────
async function main() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(config.port, () => {
      console.log(`🚀 Server running at http://localhost:${config.port}`);
      console.log(`   Environment: ${config.env}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

main();
