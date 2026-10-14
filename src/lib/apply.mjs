import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentProfileId, profileDataDir } from "./profiles.mjs";
import { loadProfile, resumePath, validateForApply } from "./profile.mjs";

// Только формы, которые проверены на реальных страницах карьерных сайтов.
const HOSTS = {
  avito: "career.avito.com", "2gis": "job.2gis.ru", vk: "team.vk.company",
  x5: "x5.tech", mts: "job.mts.ru", magnit: "magnit.tech", rwb: "career.rwb.ru",
};
let browserContext;
let browserProfileId;
let active;

export function canApply(job) {
  try {
    const url = new URL(job.url);
    return url.protocol === "https:" && HOSTS[job.source] === url.hostname;
  }
  catch { return false; }
}

async function context() {
  const profileId = currentProfileId();
  if (browserContext && browserProfileId !== profileId) await closeApplication();
  if (!browserContext) {
    browserContext = await chromium.launchPersistentContext(join(profileDataDir(), "apply-browser"), {
      channel: "chrome", headless: process.env.APPLY_HEADLESS === "1", viewport: null,
      acceptDownloads: false,
    });
    browserProfileId = profileId;
    browserContext.on("close", () => { browserContext = undefined; browserProfileId = undefined; active = undefined; });
  }
  return browserContext;
}

async function fill(form, selectors, value) {
  if (!value) return false;
  for (const selector of selectors) {
    for (const input of await form.locator(selector).all()) {
      if (!await input.isVisible()) continue;
      await input.fill(value);
      return true;
    }
  }
  return false;
}

async function visibleForm(page, source) {
  if (source === "vk") {
    await page.getByText("Откликнуться", { exact: true }).first().click();
  }
  if (source === "avito") return page.locator("form.form-vacancy");
  const forms = page.locator("form");
  for (const form of await forms.all()) {
    if (await form.locator('input[type="file"]').count() && await form.isVisible()) return form;
  }
  // На некоторых сайтах форма появляется после нажатия верхней кнопки.
  const open = page.getByText("Откликнуться", { exact: true }).first();
  if (await open.count()) await open.click();
  for (const form of await page.locator("form").all()) {
    if (await form.locator('input[type="file"]').count() && await form.isVisible()) return form;
  }
  throw new Error("Форма отклика не найдена. Сайт мог измениться.");
}

export async function prepareApplication(job) {
  if (!canApply(job)) throw new Error("Для этого источника автоматическая отправка пока недоступна");
  const profile = loadProfile();
  validateForApply(profile);
  if (active) await active.page.close().catch(() => {});
  const ctx = await context();
  const page = await ctx.newPage();
  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(700);
    const form = await visibleForm(page, job.source);
    const missing = await fillApplicationForm(page, form, job, profile, resumePath());
    active = { key: `${currentProfileId()}:${job.source}:${job.id}`, source: job.source, page, form, submitted: false };
    page.on("close", () => { if (active?.page === page) active = undefined; });
    return { ready: !missing.length, missing, site: job.source, url: job.url };
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
  }
}

export async function fillApplicationForm(page, form, job, profile, pdfPath) {
    const filled = {};
    filled.firstName = await fill(form, ['[name="firstName"]', '[name="first_name"]', '[name="name"]', '[placeholder="Имя"]', '[placeholder="Твоё имя"]'],
      job.source === "magnit" ? `${profile.firstName} ${profile.lastName}` : profile.firstName);
    filled.lastName = job.source === "magnit" || await fill(form, ['[name="lastName"]', '[name="last_name"]', '[name="secondName"]', '[placeholder="Фамилия"]', '[placeholder="Твоя фамилия"]'], profile.lastName);
    filled.email = await fill(form, ['[name="email"]', 'input[type="email"]'], profile.email);
    filled.phone = await fill(form, ['[name="phone"]', 'input[type="tel"]'], profile.phone);
    await fill(form, ['[name="telegram"]', '[name="messengerUsername"]'], profile.telegram);
    await fill(form, ['[name="city"]'], profile.city);
    await fill(form, ['textarea[name="comment"]', 'textarea[name="description"]', 'textarea[name="additionalInf"]'], job.letter);
    const pdf = { name: profile.resumeName || "resume.pdf", mimeType: "application/pdf", buffer: readFileSync(pdfPath) };
    if (job.source === "avito") {
      await form.locator(".js-dropzone").click();
      await page.locator('input[type="file"]').setInputFiles(pdf);
      await form.locator(".js-select-required .select__title").click();
      await form.locator('[name="source"][value="Карьерный сайт"]').check();
    } else {
      await form.locator('input[type="file"]').first().setInputFiles(pdf);
    }
    filled.resume = true;
    return Object.entries(filled).filter(([, ok]) => !ok).map(([name]) => name);
}

function submitButton(form, source) {
  if (source === "avito") return form.getByRole("button", { name: /Отправить отклик/ }).first();
  return form.locator('button[type="submit"]').first();
}

async function successVisible(page, source) {
  if (source === "avito" && await page.locator(".js-success-block").isVisible().catch(() => false)) return true;
  if (/thank|success|спасибо|успех/i.test(new URL(page.url()).pathname)) return true;
  const messages = page.getByText(/спасибо за отклик|отклик отправлен|отклик успешно|заявка отправлена|резюме отправлено/i);
  for (const message of await messages.all()) if (await message.isVisible().catch(() => false)) return true;
  return false;
}

export async function sendApplication(source, id) {
  if (!active || active.key !== `${currentProfileId()}:${source}:${id}`) throw new Error("Сначала подготовьте отклик");
  if (active.submitted) throw new Error("Отправка уже начата. Проверьте сайт.");
  const { page, form } = active;
  if (page.isClosed()) throw new Error("Окно сайта закрыто");
  const button = submitButton(form, source);
  if (!await button.isVisible() || !await button.isEnabled()) throw new Error("Кнопка отправки недоступна");
  const postResponses = [];
  const onResponse = (response) => {
    if (response.request().method() === "POST") postResponses.push(response.status());
  };
  page.on("response", onResponse);
  active.submitted = true;
  try {
    await button.click({ timeout: 10_000 });
    for (let i = 0; i < 10; i++) {
      if (await successVisible(page, source)) return { confirmed: true };
      await page.waitForTimeout(800);
    }
  } catch (e) {
    active.submitted = false;
    throw e;
  } finally {
    page.off("response", onResponse);
  }
  const retryable = !postResponses.some((status) => status >= 200 && status < 300);
  if (retryable) active.submitted = false;
  return { confirmed: false, retryable, message: retryable
    ? "Сайт не принял форму. Проверьте ошибки и обязательные поля в Chrome, затем повторите."
    : "Сайт не показал явное подтверждение. Проверьте открытое окно перед учетом отклика." };
}

export async function closeApplication() {
  if (active) await active.page.close().catch(() => {});
  active = undefined;
  if (browserContext) await browserContext.close().catch(() => {});
  browserContext = undefined;
  browserProfileId = undefined;
}
