import test from "node:test";
import assert from "node:assert/strict";
import { companyApplicationCounts, companyKey } from "../src/lib/companies.mjs";
import { classifyMail, matchMailToJob } from "../src/lib/mail.mjs";
import { canApply } from "../src/lib/apply.mjs";

test("counts only sent applications across company aliases", () => {
  const jobs = [
    { company: "Авито", status: "Новый" },
    { company: "АВИТО ТЕХ", status: "Отклик" },
    { company: "Avito", status: "Собес" },
  ];
  assert.equal(companyApplicationCounts(jobs).get(companyKey("Авито")), 2);
  assert.equal(companyKey("Банк Точка"), companyKey("Точка"));
});

test("accepts only verified application hosts", () => {
  assert.equal(canApply({ source: "2gis", url: "https://job.2gis.ru/vacancies/1" }), true);
  assert.equal(canApply({ source: "2gis", url: "https://job.2gis.ru.evil.test/vacancies/1" }), false);
});

test("career mail is linked by company and unique vacancy title", () => {
  const event = classifyMail({ id: "m1", from: "alfajob@alfabank.ru",
    subject: "Мы рассматриваем вашу кандидатуру",
    snippet: "Благодарим за отклик на вакансию «Инженер по автоматизации»" });
  assert.equal(event.stage, "Отклик");
  assert.equal(matchMailToJob(event, [
    { source: "alfa", id: "1", company: "Альфа-Банк", title: "Инженер по автоматизации" },
    { source: "alfa", id: "2", company: "Альфа-Банк", title: "Data Scientist" },
  ])?.id, "1");
  assert.equal(classifyMail({ id: "m2", from: "jobs@hh.ru", subject: "Отклик получен" }), null);
  assert.equal(classifyMail({ id: "m3", from: "alfajob@alfabank.ru", subject: "Новости банка" }), null);
});
