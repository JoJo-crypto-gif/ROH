import { spawnSync } from "node:child_process";
import process from "node:process";

const testUrl = process.env.TEST_DATABASE_URL;
const developmentUrl = process.env.DATABASE_URL;

if (!testUrl) {
  console.error("TEST_DATABASE_URL is required for finance integration tests.");
  process.exit(1);
}

let databaseName;
try {
  databaseName = new URL(testUrl).pathname.replace(/^\//, "");
} catch {
  console.error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}

if (
  !/test/i.test(databaseName) ||
  (developmentUrl && testUrl === developmentUrl)
) {
  console.error(
    "Refusing to run: TEST_DATABASE_URL must target a distinct database whose name contains 'test'.",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: testUrl,
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET || "finance-integration-access-secret",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "finance-integration-refresh-secret",
  FINANCE_STORAGE_DIR:
    process.env.FINANCE_STORAGE_DIR || "/tmp/lumen-finance-integration",
  ACCOUNTING_STORAGE_DIR:
    process.env.ACCOUNTING_STORAGE_DIR || "/tmp/lumen-accounting-integration",
};

const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const tests = spawnSync(
  process.execPath,
  ["--test", "--import", "tsx", "src/modules/finance/finance.integration.ts"],
  { cwd: process.cwd(), env, stdio: "inherit" },
);
process.exit(tests.status ?? 1);
