import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../../config.js";

function resolveSafe(filename: string) {
  const root = path.resolve(config.students.storageDir);
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid student avatar path.");
  }
  return absolute;
}

export async function saveStudentAvatar(base64Data: string): Promise<string> {
  const root = path.resolve(config.students.storageDir);
  await fs.mkdir(root, { recursive: true });

  const buffer = Buffer.from(base64Data, "base64");
  const filename = `${crypto.randomUUID()}.jpg`;
  const absolute = resolveSafe(filename);

  await fs.writeFile(absolute, buffer);
  return `/storage/students-pfp/${filename}`;
}
