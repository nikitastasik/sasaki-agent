import test from "node:test";
import assert from "node:assert/strict";
import { netMonthlyFromGross, salaryOk } from "../src/lib/salary.mjs";

const rule = { minNetRub: 300_000, includeUnknown: true };
const job = (salary) => ({ salary });

test("filters salaries below a configured net threshold", () => {
  assert.equal(salaryOk(job("от 250 000 ₽ на руки"), rule), false);
  assert.equal(salaryOk(job("300k ₽ на руки"), rule), true);
  assert.equal(salaryOk(job("250k-350k ₽ на руки"), rule), true);
  assert.equal(salaryOk(job("200k-290k ₽ на руки"), rule), false);
});

test("estimates 2026 progressive income tax for gross salaries", () => {
  assert.equal(netMonthlyFromGross(350_000), 301_500);
  assert.equal(salaryOk(job("340 000 ₽ до вычета налогов"), rule), false);
  assert.equal(salaryOk(job("350 000 ₽ до вычета налогов"), rule), true);
});

test("keeps unknown salaries for manual review", () => {
  assert.equal(salaryOk(job(""), rule), true);
  assert.equal(salaryOk(job("5k € gross"), rule), true);
  assert.equal(salaryOk(job(""), { ...rule, includeUnknown: false }), false);
});
