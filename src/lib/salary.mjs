// Зарплата в источниках чаще всего приходит строкой и без пометки о налогах.
// Неизвестную сумму оставляем, если пользователь разрешил это в конфиге.
const RUB = /₽|руб|\brub\b|\brur\b/i;
const FOREIGN = /\$|€|£|\busd\b|\beur\b|\bgbp\b/i;
const AMOUNT = /(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?)\s*(млн\.?|миллион\w*|тыс\.?|тысяч\w*|[кk])?/gi;

// НДФЛ 2026 для регулярной зарплаты за 12 месяцев. Это оценка для отбора
// вакансий, а не расчёт личного налога с премиями и другими доходами.
export function netMonthlyFromGross(grossMonthly) {
  const annual = grossMonthly * 12;
  const bands = [[2_400_000, .13], [5_000_000, .15], [20_000_000, .18], [50_000_000, .20], [Infinity, .22]];
  let tax = 0, lower = 0;
  for (const [upper, rate] of bands) {
    tax += Math.max(0, Math.min(annual, upper) - lower) * rate;
    if (annual <= upper) break;
    lower = upper;
  }
  return (annual - tax) / 12;
}

function amountsOf(text) {
  const values = [];
  const matches = [...text.matchAll(AMOUNT)];
  const sharedUnit = matches.find((m) => m[2])?.[2]?.toLowerCase() || "";
  for (const m of matches) {
    let n = Number(m[1].replace(/[ \u00a0\u202f]/g, "").replace(",", "."));
    const unit = (m[2] || (n < 1000 ? sharedUnit : "")).toLowerCase();
    if (/^млн|^миллион/.test(unit)) n *= 1_000_000;
    else if (/^тыс|^тысяч|^[кk]$/.test(unit)) n *= 1000;
    if (n >= 1000 && Number.isFinite(n)) values.push(n);
  }
  return values;
}

export function salaryOk(item, rule) {
  if (!rule?.minNetRub) return true;
  const text = String(item.salary || "").replace(/[\u00a0\u202f]/g, " ");
  const unknown = rule.includeUnknown !== false;
  if (!text.trim() || FOREIGN.test(text) || /\b(?:час|hour|день|day)\b/i.test(text)) return unknown;
  const values = amountsOf(text);
  if (!values.length) return unknown;
  const monthly = Math.max(...values) / (/\bгод|year|annual/i.test(text) ? 12 : 1);
  if (FOREIGN.test(text) || (!RUB.test(text) && /[A-Z]{3}/.test(text))) return unknown;
  const net = /на руки|после вычета|чистыми|\bnet\b/i.test(text);
  const gross = /до вычета|\bgross\b|\bбрутто\b/i.test(text);
  const comparable = gross && !net ? netMonthlyFromGross(monthly) : monthly;
  return comparable >= rule.minNetRub;
}
