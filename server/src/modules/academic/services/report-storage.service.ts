import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../../config.js";

function safeSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "record";
}

export function reportPath(parts: { year: string; term: string; section: string; admissionNo: string; version: number }) {
  return path.join(safeSegment(parts.year), safeSegment(parts.term), safeSegment(parts.section), `${safeSegment(parts.admissionNo)}-v${parts.version}.pdf`);
}

export async function saveReport(relativePath: string, data: Buffer) {
  const absolutePath = path.resolve(config.reports.storageDir, relativePath);
  const root = path.resolve(config.reports.storageDir);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid report storage path.");
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data);
  return relativePath;
}

export async function readReport(relativePath: string) {
  const absolutePath = path.resolve(config.reports.storageDir, relativePath);
  const root = path.resolve(config.reports.storageDir);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid report storage path.");
  return fs.readFile(absolutePath);
}

export async function removeReport(relativePath: string) {
  const absolutePath = path.resolve(config.reports.storageDir, relativePath);
  await fs.unlink(absolutePath).catch(() => undefined);
}
