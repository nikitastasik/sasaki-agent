import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { profileDataDir } from "./profiles.mjs";
import { loadJobs, attachMailToJob, addMailJob } from "./state.mjs";
import { companyKey } from "./companies.mjs";

const path = () => join(profileDataDir(), "mail-events.json");
const syncPath = () => join(profileDataDir(), "mail-sync.json");
const SENDERS = [
  [/alfabank\.ru$/i, "альфа-банк"], [/yandex-team\.ru$/i, "яндекс"],
  [/avito\.(?:ru|com)$/i, "авито"], [/vk\.company$/i, "vk"],
  [/tbank\.ru$/i, "т-банк"], [/x5\.(?:ru|tech)$/i, "x5"],
  [/mts\.ru$/i, "мтс"], [/magnit\.(?:ru|tech)$/i, "магнит"],
  [/rwb\.ru$/i, "rwb"], [/2gis\.ru$/i, "2гис"],
  [/tochka\.com$/i, "точка"],
];
const DISPLAY = { "альфа-банк": "Альфа-Банк", "яндекс": "Яндекс", "авито": "Авито",
  vk: "VK", "т-банк": "Т-Банк", x5: "X5", "мтс": "МТС", "магнит": "Магнит",
  rwb: "RWB", "2гис": "2ГИС", "точка": "Точка" };
const STAGE_WORDS = [
  ["Отказ", /к сожалению.{0,160}(?:не готовы|не можем|не подходит|другого кандидата|отказ)|не готовы предложить|rejected|unfortunately.{0,100}(?:not|other)/i],
  ["Оффер", /предложение о работе|job offer|оффер/i],
  ["Тестовое", /тестовое задание|тестовое испытание|test assignment/i],
  ["Собес", /приглашаем.{0,80}(?:собеседован|интервью)|собеседование назначено|приглашение на интервью|interview invitation/i],
  ["Отклик", /благодарим за отклик|отклик получен|отклик принят|рассматриваем вашу кандидатуру|application received/i],
];
const COMMON = new Set(["в", "на", "по", "для", "и", "команду", "команде", "senior", "middle", "разработчик", "инженер", "developer", "engineer"]);

function senderCompany(sender) {
  const email = String(sender || "").match(/[\w.+-]+@([\w.-]+)/)?.[1] || "";
  if (/hh\.ru$|headhunter\.ru$/i.test(email)) return "";
  return SENDERS.find(([pattern]) => pattern.test(email))?.[1] || "";
}

function titleFrom(text) {
  const quoted = String(text).match(/(?:ваканси[юияе]|позици[юияе])\s*[«"]([^»"]{5,140})[»"]/i);
  return quoted?.[1]?.trim() || "";
}

function words(text) {
  return new Set(String(text || "").toLowerCase().replaceAll("ё", "е")
    .split(/[^a-zа-я0-9+#]+/).filter((w) => w.length > 2 && !COMMON.has(w)));
}

function titleScore(a, b) {
  const aa = words(a), bb = words(b);
  if (!aa.size || !bb.size) return 0;
  const overlap = [...aa].filter((w) => bb.has(w)).length;
  return overlap / Math.max(aa.size, bb.size);
}

export function classifyMail(email) {
  const company = senderCompany(email.from || email.from_);
  if (!company) return null;
  const subject = String(email.subject || "").slice(0, 200);
  const snippet = String(email.snippet || email.text || "").slice(0, 1000);
  const combined = `${subject} ${snippet}`;
  const stage = STAGE_WORDS.find(([, pattern]) => pattern.test(combined))?.[0] || "";
  if (!stage) return null;
  return {
    id: String(email.id || "").slice(0, 100), company, stage,
    title: titleFrom(combined), subject,
    date: email.date || email.email_ts || new Date().toISOString(),
    url: /^https:\/\/mail\.google\.com\//.test(email.url || email.display_url || "")
      ? (email.url || email.display_url) : "",
  };
}

export function matchMailToJob(event, jobs) {
  if (!event.title) return null;
  const candidates = jobs.filter((j) => companyKey(j.company) === event.company)
    .map((job) => ({ job, score: titleScore(event.title, job.title) }))
    .sort((a, b) => b.score - a.score);
  if (!candidates.length || candidates[0].score < 0.65 ||
      (candidates[1] && candidates[0].score - candidates[1].score < 0.15)) return null;
  return candidates[0].job;
}

export function loadMailEvents() {
  try { return JSON.parse(readFileSync(path(), "utf8")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}

export function loadMailSync() {
  try { return JSON.parse(readFileSync(syncPath(), "utf8")); }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

export function importMailEvents(emails) {
  if (!Array.isArray(emails) || emails.length > 200) throw new Error("Ожидается список до 200 писем");
  const current = loadMailEvents();
  const known = new Set(current.map((e) => e.id));
  const added = [];
  let changed = false;
  const link = (event) => {
    if (event.job || !event.title) return;
    const job = matchMailToJob(event, loadJobs()) || addMailJob(event, DISPLAY[event.company] || event.company);
    event.job = { source: job.source, id: job.id };
    if (job.source !== "gmail") attachMailToJob(job.source, job.id, event);
    changed = true;
  };
  for (const event of current) link(event);
  for (const email of emails) {
    const event = classifyMail(email);
    if (!event?.id || known.has(event.id)) continue;
    link(event);
    current.push(event);
    added.push(event);
    known.add(event.id);
  }
  if (added.length || changed) {
    mkdirSync(profileDataDir(), { recursive: true });
    const temp = `${path()}.tmp-${process.pid}`;
    writeFileSync(temp, JSON.stringify(current.slice(-1000), null, 2), { mode: 0o600 });
    renameSync(temp, path());
  }
  mkdirSync(profileDataDir(), { recursive: true });
  writeFileSync(syncPath(), JSON.stringify({ at: new Date().toISOString(), scanned: emails.length }), { mode: 0o600 });
  return added;
}
