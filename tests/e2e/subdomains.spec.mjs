// Зв'язки з іншими частинами сайту (піддомени): посилання ведуть куди треба
import { test, expect, seed } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

test("запрошення: посилання на реєстрацію веде в панель викладача (app.quizflow.space)", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/invites");
  await page.click("#btn-new");
  await page.fill("#nw-note", "Іваненко О.");
  await page.click("#nw-create");
  await expect(page.locator("#nw-link")).toHaveValue(/^https:\/\/app\.quizflow\.space\/register\?token=.+/);
  expect(errors).toEqual([]);
});

test("меню: «Панель викладача» і Live ведуть на app.quizflow.space", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/"); await page.waitForTimeout(1400);
  await expect(page.locator(".asb-q").nth(0)).toHaveAttribute("href", "https://app.quizflow.space/");
  await expect(page.locator(".asb-q-live")).toHaveAttribute("href", "https://app.quizflow.space/live");
  await expect(page.locator(".pulse-live")).toHaveAttribute("href", "https://app.quizflow.space/live");
  expect(errors).toEqual([]);
});

test("огляд — це index.html: корінь відкриває його, старий /overview веде на корінь", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/");
  await expect(page.locator(".asb-item.on")).toHaveAttribute("data-id", "overview");
  await page.goto("/overview?x=1");
  await page.waitForURL(u => u.pathname === "/" && u.search === "?x=1");
  expect(errors).toEqual([]);
});

// Куди потрапляє адмін після входу: без next — на корінь, зі старим next=overview — теж на корінь, зі своїм — туди
for (const [q, re] of [["", /^\/$/], ["?next=overview", /^\/$/], ["?next=index.html", /^\/index\.html$/], ["?next=teachers", /^\/teachers$/]]) {
  test(`вхід вже авторизованого адміна: admin-login${q} веде куди треба`, async ({ page, errors }) => {
    await seed(page, admSeed(Date.now()), "t5");
    await page.goto("/admin-login" + q);
    await page.waitForURL(u => !/admin-login/.test(u.pathname), { timeout: 8000 });
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toMatch(re);
    await expect(page.locator(".asb-item.on").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("неавторизований відкриває корінь — потрапляє на вхід без зайвого next", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "");
  await page.goto("/");
  await page.waitForURL(/admin-login/);
  expect(new URL(page.url()).search).toBe("");
  expect(errors.filter(e => !/no auth/.test(e)), "«no auth» — навмисне переривання скрипта до переходу на вхід").toEqual([]);
});

test("манифест адмінки: ярлик на екрані відкриває корінь, а не неіснуючу сторінку", async ({ page, request }) => {
  await page.goto("/404.html");
  const m = await (await request.get("/assets/icons/admin/site.webmanifest")).json();
  expect(m.start_url).toBe("/");
  expect((await request.get(m.start_url)).status()).toBe(200);
});
