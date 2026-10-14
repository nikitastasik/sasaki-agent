// Finder (finder.work, бывш. finder.vc): агрегатор, открытый JSON API.
// Параметра категории у API нет — используем полнотекстовый search
// (запросы — в config.json → finder.queries); выдача по релевантности,
// свежие титульные совпадения наверху. Центральный фильтр дорежет по title.
//
// У generic-заголовков («Ведущий дизайнер») области в названии нет, и такой
// вакансией может оказаться кто угодно — хоть бренд-дизайнер салонов оптики.
// Для них дотягиваем детальную страницу и определяем область по полному
// описанию (item.areas) — центральный фильтр использует её как запасную.
import { areasOf, dutiesOf, roleKeywords, matches } from "../lib/filter.mjs";

const API = "https://api.finder.work/api/v1/vacancies/";
const PAGE = 100;
const MAX_PAGES = 2;
const DETAIL_LIMIT = 8; // параллельность догрузки деталей

export async function fetchFinder(cfg) {
  const queries = cfg.finder?.queries || (cfg.directions?.length ? cfg.directions.slice(0, 3) : ["дизайнер"]);
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        search: q,
        limit: String(PAGE),
        offset: String(page * PAGE),
      });
      const res = await fetch(`${API}?${params}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh) sasaki-agent/0.1" },
      });
      if (!res.ok) throw new Error(`Finder HTTP ${res.status}`);
      const json = await res.json();
      const items = json.items || [];
      for (const v of items) {
        if (seen.has(v.id) || v.archived_at) continue;
        seen.add(v.id);
        out.push({
          source: "finder",
          id: String(v.id),
          title: v.title,
          company: v.company?.title || "",
          url: `https://finder.work/vacancies/${v.id}`,
          applyUrl: v.external_url?.value || "",   // оригинал (часто hh) — для межисточникового дедупа
          salary: fmtSalary(v),
          location: fmtLocation(v),
          published: v.publication_at || "",
        });
      }
      if (items.length < PAGE) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Область из описания — только там, где заголовок её не назвал И вакансия
  // вообще способна пройти фильтр по роли (иначе зря дёргать их API).
  const kws = roleKeywords(cfg);
  const need = out.filter(
    (v) => !areasOf(v.title).length && matches(v.title, { keywords: kws, stopwords: [] })
  );
  await mapLimit(need, DETAIL_LIMIT, async (v) => {
    try {
      const res = await fetch(`${API}${v.id}/`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh) sasaki-agent/0.1" },
      });
      if (!res.ok) return;
      const detail = await res.json();
      const text = String(detail.description || "").replace(/<[^>]+>/g, " ");
      const areas = areasOf(dutiesOf(text));
      if (areas.length) v.areas = areas;
    } catch { /* деталь недоступна — вакансия остаётся без areas, фильтр её не тронет */ }
  });

  return out;
}

// Пул с ограничением параллелизма — чтобы не бомбить API десятками запросов разом.
async function mapLimit(arr, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (i < arr.length) { const idx = i++; await fn(arr[idx]); }
  }));
}

function fmtSalary(v) {
  const cur = v.currency_symbol === "RUR" ? "₽" : v.currency_symbol || "₽";
  const n = (x) => Number(x).toLocaleString("ru-RU");
  if (v.salary_from && v.salary_to) return `${n(v.salary_from)}–${n(v.salary_to)} ${cur}`;
  if (v.salary_from) return `от ${n(v.salary_from)} ${cur}`;
  if (v.salary_to) return `до ${n(v.salary_to)} ${cur}`;
  return "";
}

function fmtLocation(v) {
  const cities = (v.locations || []).map((l) => l?.name).filter(Boolean).slice(0, 2);
  if (v.distant_work) cities.push("удалённо");
  return cities.join(" · ");
}

export default { name: "finder", fetch: fetchFinder };
