import test from "node:test";
import assert from "node:assert/strict";
import { matchesItem, structuralOk } from "../src/lib/filter.mjs";

test("excluded companies are removed from normal and prefiltered sources", () => {
  const cfg = {
    keywords: ["detection engineer"], stopwords: [],
    excludedCompanies: ["Blocked-Corp"],
  };
  const blocked = { title: "Detection Engineer", company: "Blocked Corp" };
  const allowed = { title: "Detection Engineer", company: "Other Security" };
  assert.equal(matchesItem(blocked, cfg), false);
  assert.equal(structuralOk(blocked, cfg), false);
  assert.equal(matchesItem(allowed, cfg), true);
});
