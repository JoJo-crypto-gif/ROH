import { PrismaClient } from "@prisma/client";

// Global instance of PrismaClient shared across the application
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
