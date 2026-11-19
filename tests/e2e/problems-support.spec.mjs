// «Проблеми»: контекст і знімок від кульки «Підтримка»; статус і відповідь ідуть автору в bugStatus
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

const SHOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
test("звернення з кульки: видно тест, питання, браузер, помилки і знімок; відповідь і статус потрапляють автору", async ({ page, errors }) => {
  const d = admSeed(Date.now());
  d.bugReports = { ...d.bugReports, s1: { message: "Не перетягується питання", reportType: "bug", status: "new", uid: "t2", page: "Конструктор", createdAt: Date.now() - 6e4,
    ctx: { page: "Конструктор", test: "Географія світу", q: 3, browser: "Chrome 130, Windows", screen: "1440×900", path: "/constructor", errors: ["TypeError: x is undefined"] }, shot: SHOT } };
  await seed(page, d, "t5");
  await page.goto("/problems"); await page.waitForTimeout(1200);
  await page.locator('.pcard[data-id="s1"]').click();
  const m = page.locator("#m-item");
  await expect(m).toContainText("Географія світу");
  await expect(m).toContainText("Chrome 130");
  await expect(m).toContainText("TypeError: x is undefined");
  await expect(m.locator(".it-shot img")).toBeVisible();
  await page.locator("#f-reply").fill("Виправили, оновіть сторінку");
  await page.locator('#f-col [data-v="done"]').click();
  await page.locator("#it-save").click();
  await expect.poll(async () => (await readDb(page)).bugStatus?.t2?.s1).toMatchObject({ s: "resolved", r: "Виправили, оновіть сторінку", t: "Не перетягується питання", k: "bug" });
  expect((await readDb(page)).bugReports.s1.reply).toBe("Виправили, оновіть сторінку");
  expect(errors).toEqual([]);
});
