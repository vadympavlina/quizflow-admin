// Усі листи, пов'язані з акаунтами: відновлення пароля (сторінка входу й адмінка),
// сторінка нового пароля з листа, лист новому викладачу через воркер пошти.
// Firebase Auth підмінено (e2e/mock/auth.js пише виклики в localStorage.authlog).
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

const authlog = page => page.evaluate(() => JSON.parse(localStorage.getItem("authlog") || "[]"));
const WORKER = "https://mail.quizflow.test";

test("адмінка → «Скинути пароль»: лист на email викладача", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/teachers?id=t2");
  await page.locator('.tp-acts [data-act="reset"]').first().click();
  await page.evaluate(() => doResetPassword());
  await expect.poll(async () => (await authlog(page)).find(([k]) => k === "reset")?.[1]?.[0]).toBe("a.melnyk@itstep.org");
  const reset = (await authlog(page)).find(([k]) => k === "reset");
  expect(reset[1][1]).toMatch(/^https:\/\/app\.quizflow\.space\/login\?email=a\.melnyk%40itstep\.org$/);   // повернення — у панель викладача (app)
  const db = await readDb(page);
  expect(Object.values(db.adminLog || {}).some(x => x.action === "teacher.reset")).toBe(true);
  expect(errors).toEqual([]);
});

test("адмінка → новий викладач: лист з даними для входу через воркер", async ({ page, errors }) => {
  const calls = [];
  await page.context().route(`${WORKER}/**`, route => {
    const req = route.request();
    calls.push({ path: new URL(req.url()).pathname, body: JSON.parse(req.postData() || "null") });
    route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: true, to: "new.teacher@school.ua" }) });
  });
  const db = admSeed(Date.now());
  db.settings = { mail: { workerUrl: WORKER } };
  await seed(page, db, "t5");
  await page.goto("/teachers");
  await page.evaluate(() => openCreateModal());
  await expect(page.locator("#new-welcome-row")).toBeVisible();
  await page.fill("#new-surname", "Новенька");
  await page.fill("#new-name", "Оксана");
  await page.fill("#new-email", "new.teacher@school.ua");
  const pass = await page.inputValue("#new-pass");
  await page.click("#create-btn");
  await expect(page.locator("#created-mail")).toContainText("Лист з даними для входу надіслано на new.teacher@school.ua");
  const w = calls.find(c => c.path === "/welcome");
  expect(w.body.password).toBe(pass);
  const uid = w.body.uid;
  const after = await readDb(page);
  expect(after.users[uid]).toMatchObject({ email: "new.teacher@school.ua", name: "Оксана" });

  // Вимкнений перемикач — листа немає
  await page.evaluate(() => { localStorage.setItem("mockUid", "t5"); openCreateModal(); });
  await page.fill("#new-surname", "Друга");
  await page.fill("#new-name", "Ірина");
  await page.fill("#new-email", "second@school.ua");
  await page.click("#new-welcome");
  await page.click("#create-btn");
  await expect(page.locator("#created-box")).toBeVisible();
  await page.waitForTimeout(300);
  expect(calls.filter(c => c.path === "/welcome")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("адмінка → новий викладач без воркера: перемикача немає", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/teachers");
  await page.evaluate(() => openCreateModal());
  await page.waitForTimeout(300);
  await expect(page.locator("#new-welcome-row")).toBeHidden();
  expect(errors).toEqual([]);
});

// ─── Лист зміни пароля в дизайні QuizFlow (через воркер) ─────────────────
async function workerReset(page, status = 200, body = { ok: true }) {
  const calls = [];
  await page.context().route(`${WORKER}/**`, route => {
    const req = route.request();
    calls.push({ path: new URL(req.url()).pathname, body: JSON.parse(req.postData() || "null"), auth: req.headers()["authorization"] || "" });
    route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
  });
  return calls;
}

test("адмінка → «Скинути пароль» через воркер (від імені адміна)", async ({ page, errors }) => {
  const calls = await workerReset(page);
  const db = admSeed(Date.now());
  db.settings = { mail: { workerUrl: WORKER } };
  await seed(page, db, "t5");
  await page.goto("/teachers?id=t2");
  await page.locator('.tp-acts [data-act="reset"]').first().click();
  await page.evaluate(() => doResetPassword());
  await expect.poll(() => calls.find(c => c.path === "/reset")?.body).toEqual({ email: "a.melnyk@itstep.org" });
  expect(calls.find(c => c.path === "/reset").auth).toBe("Bearer mock-token-t5");
  await expect(page.locator("#reset-box")).toBeVisible();
  expect((await authlog(page)).filter(([k]) => k === "reset")).toEqual([]);
  expect(errors).toEqual([]);
});

