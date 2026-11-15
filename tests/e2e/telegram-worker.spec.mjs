// Сторінка «Telegram» працює лише через воркер: токена в браузері й базі немає. Воркер підмінено.
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

const WORKER = "https://mail.quizflow.test";
async function fakeWorker(page, calls, { token = true } = {}) {
  await page.context().route(`${WORKER}/**`, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
    const json = (d, status = 200) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(d) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (path === "/telegram/api") {
      calls.push(body);
      if (!token) return json({ ok: false, error: "На воркері не задано TELEGRAM_BOT_TOKEN", code: "no_token" }, 503);
      if (body.method === "getMe") return json({ ok: true, result: { username: "qf_bot", first_name: "QuizFlow Bot" } });
      if (body.method === "getUpdates") return json({ ok: true, result: [] });
    }
    return json({ ok: false, error: "404" }, 404);
  });
}
const db = () => { const d = admSeed(Date.now()); d.settings.ownerUid = "t5"; d.settings.mail = { workerUrl: WORKER }; d.settings.telegramBot = { enabled: true, token: "old:token", recipients: {} }; d.secrets = { telegramToken: "old:token" }; return d; };

test("Telegram: бот береться з воркера, старі копії токена в базі зникають", async ({ page, errors }) => {
  const calls = [];
  await fakeWorker(page, calls);
  await seed(page, db(), "t5");
  await page.goto("/telegram"); await page.waitForTimeout(1200);
  await expect(page.locator("#bot-name")).toHaveText("QuizFlow Bot");
  await expect(page.locator("#bot-user")).toContainText("@qf_bot");
  await expect(page.locator("#btn-bot, #tg-token-inp")).toHaveCount(0);
  expect(calls.map(c => c.method)).toContain("getMe");
  const d = await readDb(page);
  expect(d.settings.telegramBot.token).toBeUndefined();
  expect(d.secrets?.telegramToken ?? null).toBeNull();
  expect(errors).toEqual([]);
});

test("Telegram: без секрету у воркері сторінка підказує, що додати", async ({ page }) => {
  const calls = [];
  await fakeWorker(page, calls, { token: false });
  await seed(page, db(), "t5");
  await page.goto("/telegram"); await page.waitForTimeout(1200);
  await expect(page.locator("#bot-user")).toContainText("TELEGRAM_BOT_TOKEN");
  await expect(page.locator("#tg-enabled")).toBeDisabled();
});
