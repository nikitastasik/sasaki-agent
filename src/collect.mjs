#!/usr/bin/env node
// Прогон по расписанию: собрать → отфильтровать → отсеять виденное → доставить.
// Вся логика — в src/lib/run.mjs (её же использует UI-сервер).
import { readFileSync } from "node:fs";
import { loadEnv } from "./lib/env.mjs";
import { listProfiles, withProfile, profileConfigPath } from "./lib/profiles.mjs";
import { runPipeline } from "./lib/run.mjs";

loadEnv();
for (const profile of listProfiles()) {
  await withProfile(profile.id, async () => {
    let cfg;
    try { cfg = JSON.parse(readFileSync(profileConfigPath(), "utf8")); }
    catch (e) { console.error(`[${profile.name}] конфиг недоступен: ${e.message}`); return; }
    if (!cfg.directions?.length && !cfg.keywords?.length) return;
    console.log(`[${profile.name}] поиск`);
    await runPipeline(cfg);
  });
}
