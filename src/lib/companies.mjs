const ALIASES = [
  [/авито|\bavito\b/i, "авито"],
  [/яндекс|\byandex\b/i, "яндекс"],
  [/альфа.?банк|\balfa.?bank\b/i, "альфа-банк"],
  [/2.?гис|\b2gis\b/i, "2гис"],
  [/\bvk\b|(^|[^а-я])вк([^а-я]|$)|вконтакте/i, "vk"],
  [/\brwb\b|wildberries|вайлдберриз/i, "rwb"],
  [/\bx5\b|пятерочк|перекресток/i, "x5"],
  [/мтс|\bmts\b/i, "мтс"],
  [/магнит|\bmagnit\b/i, "магнит"],
  [/точка|\btochka\b/i, "точка"],
  [/т.?банк|\bt.?bank\b/i, "т-банк"],
  [/сбер|\bsber\b/i, "сбер"],
];

export function companyKey(company) {
  const name = String(company || "").trim();
  if (!name) return "";
  for (const [pattern, key] of ALIASES) if (pattern.test(name)) return key;
  return name.toLowerCase().replaceAll("ё", "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

export function wasApplied(job) {
  return Boolean(job.appliedAt || ["Отклик", "Без ответа", "Собес", "Тестовое", "Оффер", "Отказ"].includes(job.status));
}

export function companyApplicationCounts(jobs) {
  const counts = new Map();
  for (const job of jobs) {
    const key = companyKey(job.company);
    if (key && wasApplied(job)) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
