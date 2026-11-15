// Власник і адміністратор: лише власник керує адмінами, ключами AI, токеном Telegram й обслуговуванням.
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

const as = owner => { const d = admSeed(Date.now()); if (owner === null) delete d.settings.ownerUid; else d.settings.ownerUid = owner; return d; };

test("власник бачить усе: обслуговування, ключі, керування адмінами", async ({ page, errors }) => {
  await seed(page, as("t5"), "t5");
  await page.goto("/cleanup"); await page.waitForTimeout(700);
  await expect(page.getByText("Лише для власника")).toHaveCount(0);
  await page.goto("/ai-settings"); await page.waitForTimeout(900);
  await expect(page.locator("#wk-panel")).toBeVisible();
  await page.goto("/teachers?id=t2"); await page.waitForTimeout(800);
  await expect(page.locator('[data-act="sysrole"][data-v="admin"]')).toBeEnabled();
  expect(await page.locator(".asb-urole").first().textContent()).toContain("Власник");
  expect(errors).toEqual([]);
});

test("адміністратор без прав власника: обслуговування закрите, старі ключі AI з бази видаляє лише власник", async ({ page, errors }) => {
  await seed(page, as("someone-else"), "t5");
  await page.goto("/cleanup"); await page.waitForTimeout(700);
  await expect(page.getByText("Лише для власника")).toBeVisible();
  await page.goto("/ai-settings"); await page.waitForTimeout(900);
  await expect(page.locator("#wk-del")).toHaveCount(0);   // старі ключі з бази видаляє лише власник
  await page.goto("/teachers?id=t2"); await page.waitForTimeout(800);
  await expect(page.locator('[data-act="sysrole"][data-v="admin"]')).toBeDisabled();
  await page.locator('[data-act="new"], #btn-new-teacher, .tb-btn.primary').first().click().catch(() => {});
  expect(errors.filter(e => !/owner-only/.test(e))).toEqual([]);
});

test("адміністратор бачить, що іншим адміністратором керує власник", async ({ page }) => {
  const d = as("someone-else");
  d.users.t4.role = "admin";
  await seed(page, d, "t5");
  await page.goto("/teachers?id=t4"); await page.waitForTimeout(800);
  await expect(page.getByText("Адміністратором керує лише власник")).toBeVisible();
  await expect(page.locator('[data-act="delete"]')).toHaveCount(0);
});

test("власника ще не призначено: пропозиція стати власником", async ({ page, errors }) => {
  await seed(page, as(null), "t5");
  await page.goto("/teachers"); await page.waitForTimeout(900);
  await expect(page.locator("#owner-claim")).toBeVisible();
  await page.locator("#owner-claim-btn").click(); await page.waitForTimeout(900);
  expect((await readDb(page)).settings.ownerUid).toBe("t5");
  await expect(page.locator("#owner-claim")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("власника видно в системі: рядок над списком, позначка в списку й у картці", async ({ page, errors }) => {
  await seed(page, as("t5"), "t5");
  await page.goto("/teachers?id=t5"); await page.waitForTimeout(900);
  await expect(page.locator("#owner-line")).toBeVisible();
  await expect(page.locator("#owner-line")).toContainText("Власник сервісу");
  await expect(page.locator(".tp-adm.own").first()).toHaveText("Власник");
  await expect(page.locator(".tc-status.own")).toContainText("Власник сервісу");
  expect(errors).toEqual([]);
});

test("без власника рядка власника немає", async ({ page }) => {
  await seed(page, as(null), "t5");
  await page.goto("/teachers"); await page.waitForTimeout(900);
  await expect(page.locator("#owner-line")).toBeHidden();
});
