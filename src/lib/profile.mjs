import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, chmodSync } from "node:fs";
import { basename, join } from "node:path";
import { profileDataDir } from "./profiles.mjs";

const dir = () => profileDataDir();
const profilePath = () => join(dir(), "profile.json");
export const resumePath = () => join(dir(), "resume.pdf");
const FIELDS = ["firstName", "lastName", "middleName", "email", "phone", "telegram", "city", "resumeName"];

export function loadProfile() {
  let saved = {};
  try { saved = JSON.parse(readFileSync(profilePath(), "utf8")); } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  let resume = null;
  try { resume = { name: saved.resumeName || "resume.pdf", size: statSync(resumePath()).size }; }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  return { ...saved, resume };
}

function privateWrite(path, data) {
  mkdirSync(dir(), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, data, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}

export function saveProfile(fields) {
  const current = loadProfile();
  const next = {};
  for (const field of FIELDS) {
    const value = fields[field] ?? current[field] ?? "";
    if (typeof value !== "string" || value.length > 300) throw new Error(`${field}: неверное значение`);
    next[field] = value.trim();
  }
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) throw new Error("Неверный email");
  privateWrite(profilePath(), JSON.stringify(next, null, 2));
  return loadProfile();
}

export function saveResume(bytes, name) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 100 || bytes.length > 8 * 1024 * 1024 ||
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("Нужен PDF до 8 МБ");
  }
  privateWrite(resumePath(), bytes);
  return saveProfile({ resumeName: basename(String(name || "resume.pdf")).slice(0, 150) });
}

export function validateForApply(profile) {
  const missing = ["firstName", "lastName", "email", "phone"].filter((field) => !profile[field]);
  if (!profile.resume) missing.push("PDF");
  if (missing.length) throw new Error(`Заполните профиль: ${missing.join(", ")}`);
}
