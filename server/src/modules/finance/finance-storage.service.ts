import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";

function resolveSafe(relativePath: string) {
  const root = path.resolve(config.finance.storageDir);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`))
    throw new Error("Invalid finance document path.");
  return absolute;
}

export async function saveFinanceDocument(relativePath: string, data: Buffer) {
  const absolute = resolveSafe(relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, data);
  return relativePath;
}

export async function readFinanceDocument(relativePath: string) {
  return fs.readFile(resolveSafe(relativePath));
}
