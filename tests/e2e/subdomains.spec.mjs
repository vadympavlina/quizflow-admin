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
  await page.goto("/overview"); await page.waitForTimeout(1400);
  await expect(page.locator(".asb-q").nth(0)).toHaveAttribute("href", "https://app.quizflow.space/");
  await expect(page.locator(".asb-q-live")).toHaveAttribute("href", "https://app.quizflow.space/live");
  await expect(page.locator(".pulse-live")).toHaveAttribute("href", "https://app.quizflow.space/live");
  expect(errors).toEqual([]);
});

test("корінь admin.quizflow.space відкриває огляд", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/index.html");
  await page.waitForURL(/\/overview$/);
  expect(errors).toEqual([]);
});
