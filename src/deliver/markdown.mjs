// Доставка markdown-файлами в папку. Укажи путь внутрь Obsidian vault —
// получишь вакансии прямо в заметках. delivery.markdown.dir, дефолт out/.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveProfileOutput } from "../lib/profiles.mjs";
import { buildDigest, stamp } from "../lib/digest.mjs";

export default {
  name: "markdown",
  async deliver({ items, errors }, cfg) {
    const dir = cfg.delivery?.markdown?.dir || "out";
    const abs = resolveProfileOutput(dir);
    mkdirSync(abs, { recursive: true });
    const file = join(abs, `vacancies-${stamp()}.md`);
    writeFileSync(file, buildDigest(items, errors).md);
    console.log(`[markdown] ${file}`);
  },
};
