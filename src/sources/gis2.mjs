// 2ГИС: текущая страница вакансий рендерит карточки на сервере.
// Параметр direction принимает слаги из списка фильтров сайта.
const PAGE_URL = "https://job.2gis.ru/vacancies";
const MAX_PAGES = 8;

export async function fetch2gis(cfg) {
  const directions = cfg["2gis"]?.directions || ["development", "data_science_ai", "information_security"];
  const byId = new Map();
  for (const dir of directions) {
    let totalPages = 1;
    for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
      const params = new URLSearchParams({ direction: dir });
      if (page > 1) params.set("page", String(page));
      const res = await fetch(`${PAGE_URL}?${params}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh) sasaki-agent/0.1" },
      });
      if (res.status === 451) throw new Error("2ГИС HTTP 451: нужен российский IP");
      if (!res.ok) throw new Error(`2ГИС HTTP ${res.status}`);
      const html = await res.text();
      totalPages = Number((html.match(/totalPages:(\d+)/) || [])[1]) || 1;
      for (const card of html.matchAll(/<li><a href="(\/vacancies\/[^" ]+\/(\d+))"[^>]*>([\s\S]*?)<\/a><\/li>/g)) {
        const [, path, id, block] = card;
        const title = clean((block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/) || [])[1]);
        if (!title) continue;
        // В сериализованном состоянии страницы есть формат, город и зарплата.
        const start = html.indexOf(`id:${id},title:`);
        const data = start >= 0 ? html.slice(start, start + 1200) : "";
        const city = (data.match(/city:(?:\$R\[\d+\]=)?\{id:\d+,name:"([^"]+)"/) || [])[1] || "";
        const remote = /isRemote:!0/.test(data);
        const from = Number((data.match(/salaryFrom:(\d+)/) || [])[1]) || 0;
        const to = Number((data.match(/salaryTo:(\d+)/) || [])[1]) || 0;
        const salary = from && to ? `${from}–${to} ₽` : from ? `от ${from} ₽` : to ? `до ${to} ₽` : "";
        byId.set(id, {
          source: "2gis", id, title, company: "2ГИС",
          url: `https://job.2gis.ru${path}`, salary,
          location: [city, remote ? "удаленно" : ""].filter(Boolean).join(" · "),
          published: "",
        });
      }
    }
  }
  return [...byId.values()];
}

function clean(s) {
  return String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

export default { name: "2gis", fetch: fetch2gis };
