// AI через воркер: панель «Ключі у воркері» в налаштуваннях AI. Воркер підмінено.
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

const WORKER = "https://mail.quizflow.test";
async function fakeWorker(page, calls, { groq = true, gemini = false, legacy = true } = {}) {
  await page.context().route(`${WORKER}/**`, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ path, body, auth: req.headers()["authorization"] });
    const json = (d, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }, body: JSON.stringify(d) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
    if (path === "/ai/status") return json({ ok: true, configured: { groq, gemini }, legacyKeysInDb: { groq: legacy, gemini: false } });
    if (path === "/ai") return json({ ok: true, text: "так", tokens: 3, provider: "groq" });
    return json({ ok: false, error: "404" }, 404);
  });
}
const db = (extra = {}) => {
  const d = admSeed(Date.now());
  d.settings = { ...d.settings, ownerUid: "t5", mail: { workerUrl: WORKER }, ai: { groqApiKey: "gsk_old", enabled: true, groqModel: "llama-3.3-70b-versatile", ...extra } };
  return d;
};

test("панель воркера: статус ключів, перевірка відповіді, перехід і видалення старих ключів", async ({ page, errors }) => {
  const calls = [];
  await fakeWorker(page, calls);
  await seed(page, db(), "t5");
  await page.goto("/ai-settings"); await page.waitForTimeout(1200);
  await expect(page.locator("#wk-panel")).toContainText("Groq у воркері");
  await expect(page.locator("#wk-panel .wk-row", { hasText: "Groq у воркері" })).toContainText("є ключ");
  await expect(page.locator("#wk-panel .wk-row", { hasText: "Gemini у воркері" })).toContainText("немає");
  await expect(page.locator("#wk-panel .wk-row", { hasText: "Старі ключі" })).toContainText("лишились");
  expect(calls[0].auth).toBe("Bearer mock-token-t5");
  await page.locator("#wk-test").click();
  await expect(page.locator("#wk-msg")).toContainText("Відповів Groq");
  // перехід на воркер
  await page.locator("#wk-on").evaluate(el => el.click()); await page.waitForTimeout(400);
  expect((await readDb(page)).settings.ai.viaWorker).toBe(true);
  // видалення старих ключів із бази двома кроками
  await page.locator("#wk-del").click();
  await expect(page.locator("#wk-del")).toContainText("Так, видалити");
  await page.locator("#wk-del").click(); await page.waitForTimeout(500);
  const ai = (await readDb(page)).settings.ai;
  expect(ai.groqApiKey).toBeUndefined();
  expect(ai.viaWorker).toBe(true);
  expect(ai.groqModel).toBe("llama-3.3-70b-versatile");
  expect(errors).toEqual([]);
});

test("без ключів у воркері перехід недоступний; не власник нічого не перемикає", async ({ page }) => {
  const calls = [];
  await fakeWorker(page, calls, { groq: false, legacy: true });
  await seed(page, db(), "t5");
  await page.goto("/ai-settings"); await page.waitForTimeout(1200);
  await expect(page.locator("#wk-on")).toBeDisabled();
  await expect(page.locator("#wk-test")).toBeDisabled();
  const d = db(); d.settings.ownerUid = "someone-else";
  await seed(page, d, "t5");
  await page.goto("/ai-settings"); await page.waitForTimeout(1200);
  await expect(page.locator("#wk-on")).toBeDisabled();
  await expect(page.locator("#wk-panel")).toContainText("лише власник");
});

test("у режимі воркера збереження налаштувань не вимагає ключів і не торкається їх", async ({ page, errors }) => {
  const calls = [];
  await fakeWorker(page, calls, { legacy: false });
  const d = db({ viaWorker: true }); delete d.settings.ai.groqApiKey;
  await seed(page, d, "t5");
  await page.goto("/ai-settings"); await page.waitForTimeout(1200);
  await page.locator('[data-flag="mail"]').evaluate(el => el.click());          // змінили налаштування
  await page.locator("#btn-save-ai").click();
  await page.waitForTimeout(600);
  const ai = (await readDb(page)).settings.ai;
  expect(ai.viaWorker).toBe(true);
  expect(ai.groqApiKey ?? "").toBe("");
  expect(ai.aiMail).toBe(false);
  expect(errors).toEqual([]);
});
