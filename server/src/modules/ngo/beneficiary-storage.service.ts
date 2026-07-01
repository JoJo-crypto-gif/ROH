import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { AppError } from "../../lib/errors.js";

function imageExtension(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.subarray(1, 4).toString("ascii") === "PNG") return "png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") return "webp";
  throw AppError.badRequest("Profile picture must be a JPG, PNG or WebP image");
}

export async function saveBeneficiaryAvatar(base64Data: string) {
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    throw AppError.badRequest("Profile picture must be smaller than 2MB");
  }
  const extension = imageExtension(buffer);
  const root = path.resolve(config.ngo.storageDir);
  await fs.mkdir(root, { recursive: true });
  const filename = `${crypto.randomUUID()}.${extension}`;
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw AppError.badRequest("Invalid beneficiary profile picture path");
  }
  await fs.writeFile(absolute, buffer);
  return `/storage/beneficiaries/${filename}`;
}
