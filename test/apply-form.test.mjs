import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { fillApplicationForm } from "../src/lib/apply.mjs";

const profile = {
  firstName: "Тест", lastName: "Кандидат", email: "test@example.com",
  phone: "+79990000000", telegram: "@candidate", city: "Москва",
  resumeName: "Кандидат резюме.pdf",
};

const fixtures = [
  ["2gis", '<input name="firstName"><input name="lastName"><input name="email"><input name="phone"><input name="messengerUsername"><input name="city">'],
  ["vk", '<input name="first_name"><input name="last_name"><input name="email"><input name="phone">'],
  ["x5", '<input name="name"><input name="secondName"><input name="email"><input name="phone"><input name="city">'],
  ["mts", '<input placeholder="Твоё имя"><input placeholder="Твоя фамилия"><input name="email"><input name="phone">'],
  ["magnit", '<input name="name"><input name="email"><input name="phone"><textarea name="comment"></textarea>'],
  ["rwb", '<input name="firstName"><input name="lastName"><input name="email"><input name="phone"><input name="telegram">'],
  ["avito", '<input name="firstName"><input name="lastName"><input name="email"><input name="phone"><button type="button" class="js-dropzone">PDF</button><div class="js-select-required"><button type="button" class="select__title">Источник</button></div><label><input type="radio" name="source" value="Карьерный сайт">Карьерный сайт</label>'],
];

test("fills contact fields and attaches PDF in supported career forms", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sasaki-apply-test-"));
  const pdf = join(dir, "resume.pdf");
  writeFileSync(pdf, "%PDF-1.4\n% test fixture\n");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [source, inputs] of fixtures) {
      const page = await browser.newPage();
      try {
        await page.setContent(`<form style="display:block">${inputs}<input type="file"></form>`);
        const form = page.locator("form");
        const missing = await fillApplicationForm(page, form, { source, letter: "Тест" }, profile, pdf);
        assert.deepEqual(missing, [], source);
        assert.equal(await form.locator('input[name="email"]').inputValue(), profile.email, source);
        assert.equal(await form.locator('input[name="phone"]').inputValue(), profile.phone, source);
        assert.equal((await form.locator('input[type="file"]').inputValue()).endsWith(profile.resumeName), true, source);
        if (source === "magnit") assert.equal(await form.locator('input[name="name"]').inputValue(), "Тест Кандидат");
        if (source === "avito") assert.equal(await form.locator('input[name="source"]').isChecked(), true);
      } finally { await page.close(); }
    }
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
