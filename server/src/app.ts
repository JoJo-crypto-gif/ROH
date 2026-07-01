import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { ZodError } from "zod";
import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { authRouter } from "./modules/auth/auth.router.js";
import { usersRouter } from "./modules/users/users.router.js";
import { rolesRouter } from "./modules/roles/roles.router.js";
import { schoolStaffRouter } from "./modules/school-staff/school-staff.router.js";
import { academicRouter } from "./modules/academic/academic.router.js";
import { studentsRouter } from "./modules/students/students.router.js";
import { calendarRouter } from "./modules/calendar/calendar.router.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.router.js";
import { financeRouter } from "./modules/finance/finance.router.js";
import { accountingRouter } from "./modules/accounting/accounting.router.js";
import { ngoRouter } from "./modules/ngo/ngo.router.js";

function corsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) {
  if (!origin) return callback(null, true);
  if (origin === config.client.url) return callback(null, true);
  if (
    config.env === "development" &&
    /^http:\/\/(localhost|127\.0\.0\.1):517\d$/.test(origin)
  ) {
    return callback(null, true);
  }
  return callback(null, false);
}

export function createApp() {
  const app = express();
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: "4mb" }));
  app.use(cookieParser());
  const logStream = { write: (message: string) => logger.info(message.trim()) };
  app.use(
    config.env === "development"
      ? morgan(
          (tokens, req, res) =>
            [
              tokens.method(req, res),
              tokens.url(req, res),
              tokens.status(req, res),
              tokens["response-time"](req, res),
              "ms",
              "-",
              req.user?.id ? `user:${req.user.id}` : "anonymous",
            ].join(" "),
          { stream: logStream },
        )
      : morgan("combined", { stream: logStream }),
  );
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  app.use("/storage/beneficiaries", express.static(config.ngo.storageDir));
  app.use("/storage", express.static("./storage"));
  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/roles", rolesRouter);
  app.use("/school-staff", schoolStaffRouter);
  app.use("/academic", academicRouter);
  app.use("/students", studentsRouter);
  app.use("/calendar", calendarRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/finance", financeRouter);
  app.use("/accounting", accountingRouter);
  app.use("/ngo", ngoRouter);
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "Validation error",
          code: "VALIDATION_ERROR",
          details: err.errors.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      if (err instanceof AppError) {
        if (err.statusCode >= 500) logger.error(err, "Server Error");
        else
          logger.warn({
            msg: "Client Error",
            error: err.message,
            code: err.code,
          });
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      logger.error(err, "Unhandled error during request");
      res.status(500).json({ error: "Internal server error" });
    },
  );
  return app;
}

export const app = createApp();
