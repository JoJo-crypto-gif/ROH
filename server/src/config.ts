import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  env: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "4000")),

  databaseUrl: required("DATABASE_URL"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessExpiresIn: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshExpiresIn: optional("JWT_REFRESH_EXPIRES_IN", "7d"),
  },

  client: {
    url: optional("CLIENT_URL", "http://localhost:5173"),
  },

  email: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || "587"),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: optional("EMAIL_FROM", "Lumen Suite <noreply@erp.com>"),
  },

  seed: {
    adminEmail: optional("SEED_ADMIN_EMAIL", "admin@erp.com"),
    adminPassword: optional("SEED_ADMIN_PASSWORD", "admin123"),
    adminName: optional("SEED_ADMIN_NAME", "Super Admin"),
  },
} as const;

export const isDev = config.env === "development";
export const isProd = config.env === "production";
