import test from "node:test";
import assert from "node:assert/strict";
import { matchesItem } from "../src/lib/filter.mjs";

test("marketing profile matches Russian and English roles without IT vacancies", () => {
  const cfg = {
    directions: ["маркетолог", "digital-маркетолог", "продуктовый маркетолог", "бренд-менеджер"],
    keywords: [], stopwords: ["разработчик"], grades: [], formats: [],
    salary: { minNetRub: 0, includeUnknown: true },
  };
  for (const title of ["Digital Marketing Manager", "Product Marketing Manager", "Бренд-менеджер"]) {
    assert.equal(matchesItem({ title }, cfg), true, title);
  }
  assert.equal(matchesItem({ title: "Python-разработчик" }, cfg), false);
});
