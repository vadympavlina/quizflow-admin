// Сторінка «Ліміти»: Firebase, Cloudflare і AI з воркера; стани «не налаштовано» й помилки. Воркер підмінено.
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

const WORKER = "https://mail.quizflow.test", GiB = 1024 ** 3;
const REPORT = (over = {}) => ({ ok: true, at: Date.now(), sections: [
  { id: "firebase", title: "Firebase · Realtime Database", state: "ok", plan: "Безкоштовна квота (Spark)", items: [
    { key: "fb-storage", label: "Сховище бази", used: 0.4 * GiB, limit: GiB, unit: "bytes", period: "зараз" },
    { key: "fb-download", label: "Завантажено з бази", used: 9.5 * GiB, limit: 10 * GiB, unit: "bytes", period: "місяць" },
    { key: "fb-conns", label: "Одночасні підключення (пік)", used: 80, limit: 100, unit: "count", period: "24 години" } ] },
  over.cf || { id: "cloudflare", title: "Cloudflare · Worker і KV", state: "ok", plan: "Безкоштовний план (Free)", items: [
    { key: "cf-requests", label: "Запити до воркера", used: 10000, limit: 100000, unit: "count", period: "день", note: "з помилками: 12" },
    { key: "cf-kv-write", label: "KV: запис", used: 300, limit: 1000, unit: "count", period: "день" } ] },
  over.ai || { id: "ai", title: "AI · Groq і Gemini", state: "ok", items: [
    { key: "groq-day", label: "Groq: запити", used: 400, limit: 14400, unit: "count", period: "день", asOf: Date.now() },
    { key: "gemini-calls", label: "Gemini: запити воркера", used: 25, limit: null, unit: "count", period: "день", note: "помилок: 2" } ], hint: "Щоб бачити смугу, задайте GEMINI_DAILY_LIMIT" },
] });
async function fakeWorker(page, report, { status = 200 } = {}) {
  const calls = [];
  await page.context().route(`${WORKER}/**`, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push({ path, auth: req.headers()["authorization"] });
    if (path === "/limits") return route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(status === 200 ? report : { ok: false, error: "Лише для адміністратора" }) });
    return route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: "{}" });
  });
  return calls;
}
const db = () => { const d = admSeed(Date.now()); d.settings.ownerUid = "t5"; d.settings.mail = { workerUrl: WORKER }; return d; };

test("ліміти: смуги використання, кольори за відсотком, підсумок попереджає про майже вичерпане", async ({ page, errors }) => {
  const calls = await fakeWorker(page, REPORT());
  await seed(page, db(), "t5");
  await page.goto("/limits");
  await expect(page.locator(".lim-card")).toHaveCount(3);
  expect(calls.some(c => c.path === "/limits" && /^Bearer /.test(c.auth || ""))).toBe(true);                // запит підписано токеном
  const dl = page.locator('[data-key="fb-download"]');
  await expect(dl).toContainText("9,5 ГБ"); await expect(dl).toContainText("95%");
  await expect(dl.locator(".lim-track i")).toHaveClass(/bad/);                                            // ≥90%
  await expect(page.locator('[data-key="fb-conns"] .lim-track i')).toHaveClass(/warn/);                   // 80%
  await expect(page.locator('[data-key="fb-storage"] .lim-track i')).toHaveClass(/ok/);                   // 40%
  await expect(page.locator('[data-key="gemini-calls"] .lim-track')).toHaveCount(0);                      // ліміту невідомо — смуги немає
  await expect(page.locator("#lim-sum")).toHaveClass(/bad/);
  await expect(page.locator("#lim-sum")).toContainText("Завантажено з бази");
  await expect(page.locator('[data-key="cf-requests"]')).toContainText("з помилками: 12");
  expect(errors).toEqual([]);
});

test("ліміти: ненастроєні блоки показують підказку, решта працює", async ({ page, errors }) => {
  await fakeWorker(page, REPORT({
    cf: { id: "cloudflare", title: "Cloudflare · Worker і KV", state: "unconfigured", hint: "На воркері немає секретів CF_API_TOKEN і CF_ACCOUNT_ID." },
    ai: { id: "ai", title: "AI · Groq і Gemini", state: "error", error: "База: 503" } }));
  await seed(page, db(), "t5");
  await page.goto("/limits");
  await expect(page.locator("#lim-cloudflare")).toContainText("CF_API_TOKEN");
  await expect(page.locator("#lim-cloudflare .lim-st")).toHaveText("Не налаштовано");
  await expect(page.locator("#lim-ai .lim-msg.bad")).toContainText("База: 503");
  await expect(page.locator("#lim-firebase .lim-i")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("ліміти: текст із воркера екранується, а кнопка «Оновити» перезавантажує дані", async ({ page, errors }) => {
  const rep = REPORT(); rep.sections[0].items[0].label = '<img src=x onerror=alert(1)>';
  const calls = await fakeWorker(page, rep);
  await seed(page, db(), "t5");
  await page.goto("/limits");
  await expect(page.locator(".lim-card")).toHaveCount(3);
  expect(await page.locator("#lim-firebase img").count()).toBe(0);
  const n = calls.filter(c => c.path === "/limits").length;
  await page.locator("#lim-refresh").click();
  await expect.poll(() => calls.filter(c => c.path === "/limits").length).toBeGreaterThan(n);
  expect(errors).toEqual([]);
});

test("ліміти: помилка воркера — зрозуміле повідомлення, а не порожня сторінка", async ({ page, errors }) => {
  await fakeWorker(page, null, { status: 403 });
  await seed(page, db(), "t5");
  await page.goto("/limits");
  await expect(page.locator(".lim-empty")).toContainText("Лише для адміністратора");
  await expect(page.locator("#lim-sum")).toHaveClass(/bad/);
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("без горизонтального скролу", async ({ page, errors }) => {
    await fakeWorker(page, REPORT());
    await seed(page, db(), "t5");
    await page.goto("/limits");
    await expect(page.locator(".lim-card")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});

test("ліміти: на Blaze перевищення безкоштовної частини — застереження з вартістю, а не червона тривога; тариф перемикається", async ({ page, errors }) => {
  const rep = REPORT();
  const fb = rep.sections[0];
  fb.planKey = "blaze"; fb.plan = "Blaze: безкоштовна частина, понад неї оплата за використання";
  fb.items = [
    { key: "fb-download", label: "Завантажено з бази", used: 13 * GiB, limit: 10 * GiB, unit: "bytes", period: "місяць", paid: true, note: "понад безкоштовну частину: ≈ $3.00" },
    { key: "fb-conns", label: "Одночасні підключення (пік)", used: 80, limit: 200000, unit: "count", period: "24 години" } ];
  const calls = await fakeWorker(page, rep);
  await seed(page, db(), "t5");
  await page.goto("/limits");
  const dl = page.locator('[data-key="fb-download"]');
  await expect(dl).toContainText("130%");
  await expect(dl).toContainText("≈ $3.00");
  await expect(dl.locator(".lim-track i")).toHaveClass(/warn/);                               // не bad
  await expect(dl.locator(".lim-track i")).toHaveAttribute("style", /width:100%/);            // смуга не виходить за межі
  await expect(page.locator("#lim-firebase .lim-st")).toHaveText("Є платна частина");
  await expect(page.locator("#lim-sum")).not.toHaveClass(/bad/);
  await expect(page.locator('#lim-firebase [data-plan="blaze"]')).toHaveAttribute("aria-pressed", "true");
  const n = calls.filter(c => c.path === "/limits").length;
  await page.locator('#lim-firebase [data-plan="spark"]').click();
  await expect.poll(async () => (await readDb(page)).settings?.limits?.firebasePlan).toBe("spark");
  await expect.poll(() => calls.filter(c => c.path === "/limits").length).toBeGreaterThan(n);   // після вибору дані перезавантажуються
  expect(errors).toEqual([]);
});

test("ліміти: якщо Google не віддав значення, замість вигаданого нуля — «немає даних» без смуги", async ({ page, errors }) => {
  const rep = REPORT();
  rep.sections[0].items[0] = { key: "fb-storage", label: "Сховище бази", used: null, limit: GiB, unit: "bytes", period: "зараз", paid: true, note: "Google ще не віддав це значення" };
  await fakeWorker(page, rep);
  await seed(page, db(), "t5");
  await page.goto("/limits");
  const st = page.locator('[data-key="fb-storage"]');
  await expect(st).toContainText("немає даних");
  await expect(st.locator(".lim-track")).toHaveCount(0);
  await expect(st).not.toContainText("0%");
  expect(errors).toEqual([]);
});
