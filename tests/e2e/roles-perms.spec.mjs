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
const blk = (page, name) => page.locator(".rv-blk", { hasText: name }).first();
const level = async (page, block, lvl) => { await blk(page, block).locator(".rv-seg button", { hasText: new RegExp(`^${lvl}$`) }).click(); await page.waitForTimeout(300); };
const open = async (page, block) => { const b = blk(page, block); if (await b.locator(".rv-detail").count() === 0) await b.locator("[data-open]").click(); };
const sw = (page, block, label) => blk(page, block).locator(".rv-sw-row", { hasText: label }).locator("input");
const toggle = async (page, block, label) => { await open(page, block); await sw(page, block, label).evaluate(el => el.click()); await page.waitForTimeout(300); };

test("сторінка ролі: рівні блоків зберігаються одразу, міграція зі старого формату", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=games");
  await expect(page.locator(".rl-hero h2")).toHaveText("Лише ігри");
  await expect(page.locator("#rp-t-access")).toHaveAttribute("aria-selected", "true");
  // Старе обмеження меню: «Тести» закриті в «Усі викладачі», тож у цій ролі сторінки «Тести» немає
  await expect(page.locator(".rv-mi.off", { hasText: "Тести" })).toBeVisible();

  await level(page, "Ігри наживо", "Проводити");
  await expect(page.locator(".rv-act.on", { hasText: "Проводити Live-ігри" })).toBeVisible();
  await level(page, "Інше", "Розширене");
  // Перше збереження перевело налаштування у новий формат і зняло обмеження з меню
  const db = await readDb(page);
  expect(db.settings.features.v).toBe(2);
  expect(db.settings.features.roles.games.perms).toMatchObject({ games_run: true, games_history: true, export: true });
  expect(Object.values(db.settings.features.roles.games.perms).every(v => v === true)).toBe(true);   // роль лише додає
  expect(db.settings.features.roles.authors.perms.tests_view).toBe(true);     // автори, як і було
  expect(db.settings.features.perms.tests_view).toBe(false);                  // для всіх закрито, як і було
  expect(JSON.stringify(db.settings.navigation)).not.toContain("roleIds");
  expect(db.settings.features.roles.authors.limits.maxTests).toBe(50);           // ліміти не загубились
  expect(db.settings.features.limits.maxTests).toBe(20);
  expect(Object.keys(db.settings.features)).not.toContain("flags");
  expect(errors).toEqual([]);
});

test("залежності: ігри без тестів вмикають «Вибирати тест» самі, і його не можна вимкнути окремо", async ({ page }) => {
  const d = legacyDb();
  d.settings.features = { v: 2, perms: { tests_use: false, tests_view: false }, roles: {} };   // «Усі викладачі» тестів не дають
  d.settings.navigation = null;
  await seed(page, d, "t5");
  await page.goto("/roles?id=games");
  await level(page, "Ігри наживо", "Проводити");
  await open(page, "Тести");
  await expect(sw(page, "Тести", "Вибирати тест")).toBeChecked();
  await expect(sw(page, "Тести", "Вибирати тест")).toBeDisabled();
  await expect(blk(page, "Тести").locator(".rv-tag", { hasText: "потрібно для" })).toBeVisible();
  await expect(page.locator(".rl-warn")).toHaveCount(0);
});

test("окремий перемикач у блоці дає «Свій набір»", async ({ page }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=games");
  await level(page, "Інше", "Базове");
  await toggle(page, "Інше", "Експорт результатів");   // «Усі викладачі» експорт закрили
  await expect(blk(page, "Інше").locator(".rv-seg .cust")).toBeVisible();
  const db = await readDb(page);
  expect(db.settings.features.roles.games.perms.export).toBe(true);
});

test("«Усі викладачі»: базові права редагуються тут і зберігають лише заборонене", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=__base");
  await expect(page.locator(".rl-hero h2")).toHaveText("Усі викладачі");
  await expect(page.locator("#rp-t-members")).toHaveCount(0);
  await expect(page.locator('[data-act="delete"]')).toHaveCount(0);
  await level(page, "Інше", "Базове");
  await toggle(page, "Аналіз", "Підозрілі");
  const f = (await readDb(page)).settings.features;
  expect(f.v).toBe(2);
  expect(f.perms.tests_view).toBe(false);          // стара обмеженість меню
  expect(f.perms.ai).toBe(false);                  // «Інше → Базове» закрило AI
  expect(f.perms.export).toBe(false);
  expect(f.perms.news_view ?? null).toBeNull();    // новини лишились відкритими
  expect(Object.values(f.perms).every(v => v === false)).toBe(true);
  expect(f.roles.authors.limits.maxTests).toBe(50);
  expect(errors).toEqual([]);
});

test("у ролі те, що дає «Усі викладачі», видно заблокованим", async ({ page }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=games");
  await open(page, "Інше");
  await expect(sw(page, "Інше", "Новини")).toBeChecked();
  await expect(sw(page, "Інше", "Новини")).toBeDisabled();
  await expect(blk(page, "Інше").locator(".rv-tag", { hasText: "Усі викладачі" }).first()).toBeVisible();
});

test("нова роль із шаблону отримує його права", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles");
  await page.locator(".rl-new-btn").click();
  await page.locator("#role-name-inp").fill("Тільки ігри 2");
  await page.locator('#role-tpls [data-tpl="Лише ігри"]').click();
  await page.locator("#role-save-btn").click(); await page.waitForTimeout(600);
  const db = await readDb(page);
  const id = Object.keys(db.roles).find(k => db.roles[k].name === "Тільки ігри 2");
  expect(db.settings.features.roles[id].perms).toMatchObject({ tests_use: true, games_history: true, games_run: true });
  expect(errors).toEqual([]);
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

test("картка викладача: особисті дозволи, джерело, «лише перегляд»", async ({ page, errors }) => {
  const d = legacyDb();
  d.settings.features = { v: 2, perms: { ai: false, games_run: false }, roles: { games: { perms: { games_run: true } } } };
  d.users.t1.customRoleIds = { games: true };
  await seed(page, d, "t5");
  await page.goto("/teachers?id=t1");
  const tab = async t => { await page.locator(`[data-act="tab"][data-t="${t}"]`).click(); };
  await tab("access");
  await page.locator('[data-act="caps-all"]').click();
  const row = name => page.locator(".cp-row", { hasText: name }).first();
  await expect(row("Проводити ігри")).toContainText("за роллю");
  await expect(row("Проводити ігри")).toContainText("Доступно");
  await expect(row("AI-функції")).toContainText("як для всіх");
  // особисте «Ні» сильніше за роль
  await row("Проводити ігри").locator('[data-k="games.run"][data-v="0"]').click();
  await page.waitForTimeout(400);
  await expect(row("Проводити ігри")).toContainText("особисто");
  await expect(row("Проводити ігри")).toContainText("Вимкнено");
  let u = (await readDb(page)).users.t1;
  expect(u.features.perms.games_run).toBe(false);
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
  await level(page, "Ігри наживо", "Проводити");
  await level(page, "Ігри наживо", "Лише історія");
  n = Object.values((await readDb(page)).teachers.t1.notifications).filter(x => x.type === "access");
  expect(n.length).toBe(2);                               // додавання + одне про налаштування ролі
  // «лише перегляд» з картки викладача
  await page.goto("/teachers?id=t1");
  await page.locator('[data-act="tab"][data-t="access"]').click();
  await page.locator('[data-act="readonly"]').evaluate(el => el.click());
  await page.waitForTimeout(400);
  n = Object.values((await readDb(page)).teachers.t1.notifications).filter(x => x.type === "access");
  expect(n.length).toBe(3);
  expect(n.some(x => /режим перегляду/.test(x.msg))).toBe(true);
  expect(errors).toEqual([]);
});

test("запрошення: ролі за замовчуванням і ролі в посиланні", async ({ page, errors }) => {
  const d = legacyDb();
  d.settings.defaultRoleIds = { authors: true };
  await seed(page, d, "t5");
  await page.goto("/invites?new=1"); await page.waitForTimeout(900);
  // типова роль уже позначена
  await expect(page.locator('#nw-roles input[value="authors"]')).toBeChecked();
  await expect(page.locator('#nw-roles input[value="games"]')).not.toBeChecked();
  await page.locator('#nw-roles input[value="games"]').evaluate(el => el.click());
  await page.locator("#nw-def").evaluate(el => el.click());
  await page.locator("#nw-create").click(); await page.waitForTimeout(500);
  const db = await readDb(page);
  const tok = Object.values(db.invite_tokens || {}).find(t => t.roleIds);
  expect(tok.roleIds).toEqual({ authors: true, games: true });
  expect(db.settings.defaultRoleIds).toEqual({ authors: true, games: true });
  expect(errors).toEqual([]);
});

const WORKER = "https://mail.quizflow.test";
// Воркер повністю стирає користувача на сервері, тож у тесті він підмінений: перевіряємо запит і те, що робить сторінка
async function mockErase(page) {
  const calls = [];
  await page.context().route(`${WORKER}/**`, route => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    calls.push({ path: new URL(req.url()).pathname, body: JSON.parse(req.postData() || "{}") });
    route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: true, removed: 9 }) });
  });
  return calls;
}
const eraseSeed = () => { const d = admSeed(Date.now()); d.settings = { ...(d.settings || {}), mail: { workerUrl: WORKER } }; return d; };

test("видалення викладача: тести можна передати колезі, решту стирає воркер", async ({ page, errors }) => {
  const d = eraseSeed();
  const calls = await mockErase(page);
  await seed(page, d, "t5");
  const srcCount = Object.keys(d.teachers.t2.tests).length;
  expect(srcCount).toBeGreaterThan(0);
  await page.goto("/teachers?id=t2"); await page.waitForTimeout(800);
  await page.locator('[data-act="delete"]').first().click();
  await page.locator("#del-xfer-inp").fill("Олена");
  await page.locator("#del-xfer-sug [data-xf]").first().click();
  await expect(page.locator("#del-xfer-pick")).toContainText("Олена");
  await page.locator("#del-confirm-inp").fill("a.melnyk@itstep.org");
  await page.locator("#del-confirm-btn").click(); await page.waitForTimeout(700);
  expect(calls).toEqual([{ path: "/users/delete", body: { uid: "t2" } }]);
  const db = await readDb(page);
  const copies = Object.entries(db.teachers.t1.tests).filter(([id]) => id.startsWith("xf_"));
  expect(copies.length).toBe(srcCount);
  expect(copies[0][1].transferredFrom).toContain("Мельник");
  expect(copies[0][1].folderId ?? null).toBeNull();
  const n = Object.values(db.teachers.t1.notifications || {}).find(x => x.title === "Вам передано тести");
  expect(n.msg).toContain(String(srcCount));
  // у журналі немає ні імені, ні пошти видаленого
  const log = Object.values(db.adminLog || {}).find(x => x.action === "teacher.delete");
  expect(JSON.stringify(log)).not.toMatch(/Мельник|melnyk|t2/i);
  expect(errors).toEqual([]);
});

test("видалення без передачі тестів: лише виклик воркера, копій тестів немає", async ({ page, errors }) => {
  const calls = await mockErase(page);
  await seed(page, eraseSeed(), "t5");
  await page.goto("/teachers?id=t3"); await page.waitForTimeout(800);
  await page.locator('[data-act="delete"]').first().click();
  await page.locator("#del-confirm-inp").fill("shevchenko@itstep.org");
  await page.locator("#del-confirm-btn").click(); await page.waitForTimeout(600);
  expect(calls).toEqual([{ path: "/users/delete", body: { uid: "t3" } }]);
  expect(Object.keys((await readDb(page)).teachers.t1.tests).some(id => id.startsWith("xf_"))).toBe(false);
  expect(errors).toEqual([]);
});

test("видалення: якщо воркер відмовив, показуємо помилку й модалка лишається", async ({ page }) => {
  await page.context().route(`${WORKER}/**`, route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    route.fulfill({ status: 503, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: false, error: "На воркері не задано FIREBASE_SERVICE_ACCOUNT" }) });
  });
  await seed(page, eraseSeed(), "t5");
  await page.goto("/teachers?id=t3"); await page.waitForTimeout(800);
  await page.locator('[data-act="delete"]').first().click();
  await page.locator("#del-confirm-inp").fill("shevchenko@itstep.org");
  await page.locator("#del-confirm-btn").click();
  await expect(page.locator("#del-err")).toContainText("FIREBASE_SERVICE_ACCOUNT");
  expect((await readDb(page)).users.t3).toBeDefined();
});

function noDots(o, path = "db") { const bad = []; (function walk(v, p) { if (v && typeof v === "object") for (const k of Object.keys(v)) { if (/[.$#\[\]]/.test(k)) bad.push(p + "/" + k); walk(v[k], p + "/" + k); } })(o, path); return bad; }
test("усі збереження дозволів лягають у базу з коректними ключами (без крапки)", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/roles?id=games");
  await level(page, "Ігри наживо", "Проводити");
  await toggle(page, "Тести", "Імпорт з Excel");
  await page.goto("/teachers?id=t1"); await page.waitForTimeout(700);
  await page.locator('[data-act="tab"][data-t="access"]').click();
  await page.locator('[data-act="caps-all"]').click();
  await page.locator('.cp-row', { hasText: "Створювати посилання" }).locator('[data-k="links.manage"][data-v="0"]').click(); await page.waitForTimeout(300);
  await page.goto("/roles?id=__base"); await page.waitForTimeout(700);
  await toggle(page, "Ігри наживо", "Історія ігор");
  const db = await readDb(page);
  expect(noDots(db.settings.features, "settings/features")).toEqual([]);
  expect(noDots(db.users.t1, "users/t1")).toEqual([]);
  expect(db.settings.features.roles.games.perms.tests_import).toBe(true);
  expect(db.users.t1.features.perms.links_manage).toBe(false);
  expect(db.settings.features.perms.games_history).toBe(false);
  expect(errors).toEqual([]);
});

test("список викладачів: ролі видно чипами, статус не лише крапкою", async ({ page, errors }) => {
  const d = legacyDb();
  d.users.t4.blocked = true;
  await seed(page, d, "t5");
  await page.goto("/teachers"); await page.waitForTimeout(900);
  await expect(page.locator('.tp-it[data-id="t1"] .tp-rc', { hasText: "Лише ігри" })).toBeVisible();
  await expect(page.locator('.tp-it[data-id="t4"] .tp-it-t.bad')).toHaveText("Заблоковано");
  expect(errors).toEqual([]);
});

test("ролі: на вузькому екрані підсумок «що побачить» згорнуто в один рядок, на широкому видно одразу", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/roles?id=__base"); await page.waitForTimeout(800);
  await expect(page.locator(".rv-prev-t")).toBeVisible();
  await expect(page.locator(".rv-prev .rv-menu")).toBeHidden();
  await page.locator(".rv-prev-t").click();
  await expect(page.locator(".rv-prev .rv-menu")).toBeVisible();
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.waitForTimeout(300);
  await expect(page.locator(".rv-prev-t")).toBeHidden();
  await expect(page.locator(".rv-prev .rv-menu")).toBeVisible();
  expect(errors).toEqual([]);
});

test("картка викладача: вкладки; у «Доступі» лише винятки, усі дозволи — за кнопкою", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/teachers?id=t1"); await page.waitForTimeout(700);
  await expect(page.locator(".tp-tabs [aria-selected='true']")).toHaveText("Огляд");
  await expect(page.locator(".tp-sec h3", { hasText: "Ролі" })).toBeVisible();
  await expect(page.locator(".cp-row")).toHaveCount(0);                    // доступу на «Огляді» немає
  await page.locator('[data-act="tab"][data-t="access"]').click();
  await expect(page.getByText("Особистих винятків немає")).toBeVisible();
  await expect(page.locator(".cp-row.cp-ro")).toHaveCount(1);              // «лише перегляд» і ліміти лишаються
  await expect(page.locator('.cp-row [data-act="cap-perm"]')).toHaveCount(0);
  await page.locator('[data-act="caps-all"]').click();                     // «Задати виняток»
  expect(await page.locator('.cp-row [data-act="cap-perm"][data-v=""]').count()).toBeGreaterThan(15);
  await page.locator('.cp-row', { hasText: "Створювати посилання" }).locator('[data-k="links.manage"][data-v="0"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-act="caps-all"]').click();                     // «Показати лише винятки»
  await expect(page.locator('.cp-row [data-act="cap-perm"][data-v=""]')).toHaveCount(1);
  await expect(page.locator(".tp-tabs button", { hasText: "Доступ" }).locator("b")).toHaveText("1");
  await page.locator('[data-act="tab"][data-t="ai"]').click();
  await expect(page.locator("[data-ai]").first()).toBeVisible();
  await page.locator('[data-act="tab"][data-t="names"]').click();
  await expect(page.locator("#tp-names-list")).toBeVisible();
  expect(errors).toEqual([]);
});

test("редактор меню: сторінку «Оновлення» можна додати, іконка є в наборі", async ({ page, errors }) => {
  await seed(page, legacyDb(), "t5");
  await page.goto("/navigation"); await page.waitForTimeout(1200);
  const chip = page.locator('#nav-missing [data-add-page="updates"]');
  await expect(chip).toBeVisible();
  await expect(chip.locator("svg path").first()).toBeAttached();       // іконка «updates» намальована
  await chip.click();
  await expect(page.locator('#nav-missing [data-add-page="updates"]')).toHaveCount(0);   // пункт додано в меню
  await expect(page.locator("#nav-list, .nav-editor, main").first()).toContainText("Оновлення");
  expect(errors).toEqual([]);
});
