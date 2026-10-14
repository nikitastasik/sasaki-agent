import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { projectRoot } from "./env.mjs";

export const DEFAULT_PROFILE_ID = "main";
const registryPath = join(projectRoot, "data", "profiles.json");
const scope = new AsyncLocalStorage();
const MAIN = { id: DEFAULT_PROFILE_ID, name: "Основной профиль", kind: "engineering" };
const KINDS = new Set(["marketing", "engineering", "custom"]);

export function listProfiles() {
  let saved = [];
  try { saved = JSON.parse(readFileSync(registryPath, "utf8")); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  if (!Array.isArray(saved)) throw new Error("Список профилей поврежден");
  return [MAIN, ...saved.filter((p) => p && /^[a-z0-9-]{3,40}$/.test(p.id) && p.id !== DEFAULT_PROFILE_ID)];
}

export function getProfile(id) {
  return listProfiles().find((p) => p.id === id) || null;
}

export function currentProfileId() {
  return scope.getStore() || DEFAULT_PROFILE_ID;
}

export function withProfile(id, fn) {
  if (!getProfile(id)) throw new Error("Профиль не найден");
  return scope.run(id, fn);
}

export function profileDataDir() {
  const id = currentProfileId();
  return id === DEFAULT_PROFILE_ID
    ? join(projectRoot, "data") : join(projectRoot, "data", "profiles", id);
}

export function profileConfigPath() {
  return currentProfileId() === DEFAULT_PROFILE_ID
    ? join(projectRoot, "config.json") : join(profileDataDir(), "config.json");
}

export function profileOutputDir() {
  return currentProfileId() === DEFAULT_PROFILE_ID
    ? join(projectRoot, "out") : join(projectRoot, "out", currentProfileId());
}

export function resolveProfileOutput(value) {
  if (isAbsolute(value)) return value;
  if (currentProfileId() === DEFAULT_PROFILE_ID) return join(projectRoot, value);
  const tail = value === "out" ? "" : value.startsWith("out/") ? value.slice(4) : value;
  return join(profileOutputDir(), tail);
}

export function createProfile({ name, kind }) {
  const cleanName = String(name || "").trim();
  if (!cleanName || cleanName.length > 80) throw new Error("Укажи имя профиля до 80 символов");
  if (!KINDS.has(kind)) throw new Error("Неизвестная специальность");
  const profiles = listProfiles();
  if (profiles.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new Error("Профиль с таким именем уже есть");
  }
  const profile = { id: `p-${randomUUID().slice(0, 12)}`, name: cleanName, kind,
    createdAt: new Date().toISOString() };
  const dir = join(projectRoot, "data", "profiles", profile.id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, "config.json"), JSON.stringify(newConfig(kind), null, 2) + "\n", { mode: 0o600 });
  const temp = `${registryPath}.tmp-${process.pid}`;
  writeFileSync(temp, JSON.stringify([...profiles.filter((p) => p.id !== DEFAULT_PROFILE_ID), profile], null, 2), { mode: 0o600 });
  renameSync(temp, registryPath);
  return profile;
}

function newConfig(kind) {
  const base = JSON.parse(readFileSync(join(projectRoot, "config.example.json"), "utf8"));
  const directions = kind === "marketing"
    ? ["маркетолог", "digital-маркетолог", "продуктовый маркетолог", "бренд-менеджер", "performance-маркетолог", "CRM-маркетолог"]
    : kind === "engineering" ? ["Python-разработчик", "ML-инженер", "Data Scientist"] : [];
  const enabled = kind === "marketing"
    ? new Set(["hh", "finder", "linkedin", "alfa", "mts", "rwb", "tochka"])
    : kind === "engineering" ? new Set(["hh", "finder", "getmatch", "habr", "linkedin", "alfa", "avito", "2gis", "magnit", "mts", "rwb", "tbank", "tochka", "vk", "x5", "yandex"])
      : new Set(["hh", "finder"]);
  return {
    ...base, onboarded: true, directions, keywords: directions,
    stopwords: kind === "marketing" ? ["стажер", "стажировка", "junior", "разработчик", "дизайнер"] : [],
    grades: [], formats: [], levels: [], retentionDays: 30,
    salary: { minNetRub: 0, includeUnknown: true },
    sources: Object.fromEntries(Object.keys(base.sources).map((name) => [name, enabled.has(name)])),
    hh: kind === "marketing" ? { queries: ["маркетолог", "digital маркетолог", "продуктовый маркетолог", "бренд менеджер"], area: 113, period: 7, detectFormat: false } : { area: 113, period: 7, detectFormat: false },
    finder: kind === "marketing" ? { queries: ["маркетолог", "digital маркетолог", "бренд менеджер"] } : {},
    linkedin: kind === "marketing" ? { keywords: ["digital marketing", "product marketing", "brand manager"], location: "Russia" } : {},
    alfa: kind === "marketing" ? { queries: ["маркетолог", "маркетинг", "бренд"] } : {},
    mts: kind === "marketing" ? { queries: ["маркетолог", "маркетинг", "бренд"] } : {},
    telegram: { channels: [], disabled: [] },
    delivery: { channels: ["markdown"], markdown: { dir: "out" },
      csv: { file: "out/vacancies.csv" }, webhook: { url: "", format: "slack" } },
  };
}
