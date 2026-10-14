#!/usr/bin/env node
// Принимает JSON-массив метаданных писем через stdin. Тела и вложения не нужны.
import { importMailEvents } from "./lib/mail.mjs";
import { DEFAULT_PROFILE_ID, withProfile } from "./lib/profiles.mjs";

let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 500_000) throw new Error("Слишком много данных");
}
const profileId = process.argv.find((arg) => arg.startsWith("--profile="))?.slice(10) || DEFAULT_PROFILE_ID;
const added = withProfile(profileId, () => importMailEvents(JSON.parse(raw)));
console.log(JSON.stringify({ added: added.length, matched: added.filter((e) => e.job).length,
  unmatched: added.filter((e) => !e.job).length }));
