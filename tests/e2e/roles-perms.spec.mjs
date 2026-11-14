// Сторінка «Ролі»: матриця дозволів, міграція зі старого формату, ліміти.
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

function legacyDb() {
  const d = admSeed(Date.now());
  d.roles = { games: { name: "Лише ігри", color: "#2563EB" }, authors: { name: "Автори", color: "#059669" } };
  d.users.t1.customRoleIds = { games: true };
  d.settings = { ...(d.settings || {}),
    features: { flags: { export: false }, limits: { maxTests: 20 }, roles: { authors: { flags: { export: true }, limits: { maxTests: 50 } } } },
    navigation: [{ id: "sec-main", type: "section", label: "Головне", order: 0, items: [
      { id: "dashboard", label: "Дашборд", file: "./", icon: "dashboard", enabled: true, protected: true },
      { id: "tests", label: "Тести", file: "tests", icon: "files", enabled: true, roleIds: ["authors"] },
      { id: "history", label: "Історія ігор", file: "game-history", icon: "award", enabled: true },
    ] }] };
  return d;
}
const row = (page, name) => page.locator(".rp-row", { hasText: name }).first();
const pick = async (page, name, v) => { await row(page, name).locator(`[data-pk][data-v="${v}"]`).click(); await page.waitForTimeout(250); };

test("матриця дозволів: зберігається одразу, показує, що побачить викладач", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=games");
  await expect(page.locator(".rl-hero h2")).toHaveText("Лише ігри");
  await expect(page.locator("#rp-t-access")).toHaveAttribute("aria-selected", "true");
  // Старе обмеження меню читається як дозволи: «Тести» закриті для всіх, крім «Автори»
  await expect(row(page, "Сторінка «Тести»")).toContainText("Роль не має доступу");

  await pick(page, "Проводити ігри", "1");
  await expect(row(page, "Проводити ігри")).toContainText("Роль має доступ");
  await pick(page, "Експорт результатів", "0");
  await expect(row(page, "Експорт результатів")).toContainText("Роль не має доступу");

  // Перше збереження перевело налаштування у новий формат і зняло обмеження з меню
  const db = await readDb(page);
  expect(db.settings.features.v).toBe(2);
  expect(db.settings.features.roles.games.perms).toMatchObject({ "games.run": true, export: false });
  expect(db.settings.features.roles.authors.perms["tests.view"]).toBe(true);     // автори, як і було
  expect(db.settings.features.perms["tests.view"]).toBe(false);                  // для всіх закрито, як і було
  expect(JSON.stringify(db.settings.navigation)).not.toContain("roleIds");
  expect(db.settings.features.roles.authors.limits.maxTests).toBe(50);           // ліміти не загубились
  expect(db.settings.features.limits.maxTests).toBe(20);
  expect(Object.keys(db.settings.features)).not.toContain("flags");

  // Перегляд: що бачить викладач лише з цією роллю
  await expect(page.locator(".rp-chips").first()).toContainText("Історія ігор");
  await expect(page.locator(".rp-chips.no")).toContainText("Тести");
  expect(errors).toEqual([]);
});

test("попередження про суперечності: ігри без доступу до тестів", async ({ page }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=games");
  await pick(page, "Вибирати тест", "0");
  await pick(page, "Проводити ігри", "1");
  // «Проводити ігри» вмикає «Вибирати тест» залежністю, тож суперечності немає
  await expect(page.locator(".rl-warn")).toHaveCount(0);
  await expect(row(page, "Вибирати тест")).toContainText("потрібно для іншого дозволу");
});

test("ліміти ролі: порожнє = як для всіх, 0 = без обмежень", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=authors&tab=limits");
  const inp = page.locator('[data-lk="maxTests"]');
  await expect(inp).toHaveValue("50");
  await inp.fill("0"); await inp.blur(); await page.waitForTimeout(300);
  let db = await readDb(page);
  expect(db.settings.features.roles.authors.limits.maxTests).toBe(0);
  await inp.fill(""); await inp.blur(); await page.waitForTimeout(300);
  db = await readDb(page);
  expect(db.settings.features.roles.authors.limits?.maxTests).toBeUndefined();
  expect(errors).toEqual([]);
});

test("вкладки й клавіатура, телефон без горизонтального скролу", async ({ page }) => {
  await seed(page, legacyDb(), "t5");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/roles?id=games");
  await expect(page.locator(".rl-hero h2")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.locator("#rp-t-members").click();
  await expect(page.locator("#mb-add")).toBeVisible();
  await page.locator("#rp-t-limits").click();
  await expect(page.locator('[data-lk="maxTests"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test("«Для всіх»: вимкнути дозвіл і ліміт, зберегти, ролі видно списком", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/features");
  await expect(page.locator("h1")).toHaveText("Базові дозволи й ліміти");
  // Стара обмеженість сторінки «Тести» ролями відображається як вимкнено для всіх
  await expect(page.locator('[data-pk="tests.view"]')).not.toBeChecked();
  await expect(page.locator('[data-pk="export"]')).not.toBeChecked();             // старий прапорець export:false
  await expect(page.locator(".fx-rl", { hasText: "Автори" })).toBeVisible();
  await page.locator('[data-pk="export"]').evaluate(el => el.click());             // перемикач із візуальним слайдером
  await page.locator('[data-pk="ai"]').evaluate(el => el.click());
  await page.locator('[data-lim="maxActiveLinks"]').fill("15");
  await expect(page.locator("#save-bar")).toHaveClass(/on/);
  await page.locator("#btn-save").click(); await page.waitForTimeout(400);
  const f = (await readDb(page)).settings.features;
  expect(f.v).toBe(2);
  expect(f.perms.ai).toBe(false);
  expect(f.perms.export).toBeUndefined();
  expect(f.perms["tests.view"]).toBe(false);
  expect(f.limits).toMatchObject({ maxTests: 20, maxActiveLinks: 15 });
  expect(f.roles.authors.limits.maxTests).toBe(50);
  expect(errors).toEqual([]);
});

test("картка викладача: особисті дозволи, джерело, «лише перегляд»", async ({ page, errors }) => {
  const d = legacyDb();
  d.settings.features = { v: 2, perms: { ai: false }, roles: { games: { perms: { "games.run": false } } } };
  d.users.t1.customRoleIds = { games: true };
  await seed(page, d, "t5");
  await page.goto("/teachers?id=t1");
  const row = name => page.locator(".cp-row", { hasText: name }).first();
  await expect(row("Проводити ігри")).toContainText("за роллю");
  await expect(row("Проводити ігри")).toContainText("Вимкнено");
  await expect(row("AI-функції")).toContainText("як для всіх");
  // особисте «Так» сильніше за роль
  await row("Проводити ігри").locator('[data-k="games.run"][data-v="1"]').click();
  await page.waitForTimeout(400);
  await expect(row("Проводити ігри")).toContainText("особисто");
  await expect(row("Проводити ігри")).toContainText("Доступно");
  let u = (await readDb(page)).users.t1;
  expect(u.features.perms["games.run"]).toBe(true);
  // «лише перегляд» зберігається й вимикає зміни у підсумку
  await page.locator('[data-act="readonly"]').evaluate(el => el.click());
  await page.waitForTimeout(400);
  u = (await readDb(page)).users.t1;
  expect(u.readOnly).toBe(true);
  await expect(row("Створювати й редагувати")).toContainText("лише перегляд");
  await expect(row("Сторінка «Тести»")).toContainText("Доступно");
  await page.locator('[data-act="readonly"]').evaluate(el => el.click());
  await page.waitForTimeout(400);
  expect((await readDb(page)).users.t1.readOnly).toBeUndefined();
  expect(errors).toEqual([]);
});

test("редактор меню: доступ за ролями береться з дозволів, кнопка веде в «Ролі»", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/navigation"); await page.waitForTimeout(1200);
  await expect(page.locator('a.i-roles[href="roles"]').first()).toBeVisible();
  const items = () => page.locator(".pv-it").allTextContents();
  // Старе обмеження «Тести лише для Автори» читається як дозволи
  await page.locator("#pv-role").selectOption("__all");
  expect((await items()).join("|")).not.toContain("Тести");
  await page.locator("#pv-role").selectOption("authors");
  expect((await items()).join("|")).toContain("Тести");
  await page.locator("#pv-role").selectOption("__admin");
  expect((await items()).join("|")).toContain("Тести");
  expect(errors).toEqual([]);
});

test("зміни доступу залишають викладачу сповіщення", async ({ page, errors }) => {
  const d = legacyDb();
  await seed(page, d, "t5");
  // роль додано з картки ролі
  await page.goto("/roles?id=authors&tab=members");
  await page.locator("#mb-add").fill("Олена");
  await page.locator("#mb-sug [data-add]").first().click();
  await page.waitForTimeout(400);
  let n = Object.values((await readDb(page)).teachers.t1.notifications || {}).filter(x => x.type === "access");
  expect(n.length).toBe(1);
  expect(n[0].msg).toContain("Автори");
  expect(n[0].read).toBe(false);
  // налаштування ролі: одне сповіщення на годину, скільки б кліків не було
  await page.locator("#rp-t-access").click();
  const r = name => page.locator(".rp-row", { hasText: name }).first();
  await r("Експорт результатів").locator('[data-pk][data-v="1"]').click(); await page.waitForTimeout(250);
  await r("AI-функції").locator('[data-pk][data-v="0"]').click(); await page.waitForTimeout(250);
  n = Object.values((await readDb(page)).teachers.t1.notifications).filter(x => x.type === "access");
  expect(n.length).toBe(2);                               // додавання + одне про налаштування ролі
  // «лише перегляд» з картки викладача
  await page.goto("/teachers?id=t1");
  await page.locator('[data-act="readonly"]').evaluate(el => el.click());
  await page.waitForTimeout(400);
  n = Object.values((await readDb(page)).teachers.t1.notifications).filter(x => x.type === "access");
  expect(n.length).toBe(3);
  expect(n.some(x => /режим перегляду/.test(x.msg))).toBe(true);
  expect(errors).toEqual([]);
});
