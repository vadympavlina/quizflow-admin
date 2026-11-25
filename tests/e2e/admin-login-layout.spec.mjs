// Сторінка входу в адмінку: фіолетова панель із совою й текстом зліва, форма справа; на телефоні лише форма
import { test, expect, seed } from "./fixtures.mjs";

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test("комп'ютер: панелі на всю висоту, текст над совою, форма справа; видно кнопку й поля", async ({ page, errors }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, { users: {} });
  await page.goto("/admin-login"); await page.waitForTimeout(900);
  const hero = await page.locator(".hero").boundingBox(), side = await page.locator(".side").boundingBox();
  expect(Math.round(hero.x)).toBe(0); expect(Math.round(hero.y)).toBe(0); expect(Math.round(hero.height)).toBe(800);
  expect(Math.round(side.y)).toBe(0); expect(Math.round(side.height)).toBe(800); expect(Math.round(side.x + side.width)).toBe(1280);
  expect(hero.x).toBeLessThan(side.x);
  const rad = await page.evaluate(() => { const c = getComputedStyle(document.querySelector(".side")); return [c.borderTopLeftRadius, c.borderBottomLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius].map(parseFloat); });
  expect(rad).toEqual([34, 34, 0, 0]);                                           // заокруглення лише на стику
  const h1 = await page.locator(".hero h1").boundingBox(), m = await page.locator(".mascot").boundingBox();
  expect(h1.y + h1.height).toBeLessThan(m.y + 40);                                 // текст над совою, без перекриття
  expect(m.y + m.height).toBeGreaterThan(hero.y + hero.height - 40);               // сова внизу панелі
  const sz = await page.evaluate(async () => (await fetch(document.querySelector(".mascot").src)).blob().then(b => b.size));
  expect(sz).toBeLessThan(160000);                                                 // легкий файл — швидко вантажиться
  await expect(page.locator(".mascot.in")).toHaveCount(1);
  for (const sel of ["#email", "#pass", "#stay", ".top-link"]) await expect(page.locator(sel)).toBeVisible();
  // кнопка «Увійти» має видимий фон (раніше через невизначені змінні вона була порожньою)
  const bg = await page.locator("#loginBtn").evaluate(el => getComputedStyle(el).backgroundImage);
  expect(bg).toContain("gradient");
  expect(await page.locator(".top-link").getAttribute("href")).toContain("app.quizflow.space");
  expect(await noOverflow(page)).toBe(true);
  expect(errors).toEqual([]);
});

test.describe("телефон", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("лише форма: лівої панелі немає, кнопка видна без прокрутки, нічого не вилазить", async ({ page, errors }) => {
    await seed(page, { users: {} });
    await page.goto("/admin-login"); await page.waitForTimeout(700);
    await expect(page.locator(".hero")).toBeHidden();
    for (const sel of ["#email", "#pass", "#loginBtn", ".top-link"]) await expect(page.locator(sel)).toBeVisible();
    const btn = await page.locator("#loginBtn").boundingBox();
    expect(btn.y + btn.height).toBeLessThan(844);
    expect(await noOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test("під формою є посилання на політику конфіденційності й умови, на телефоні без горизонтальної прокрутки", async ({ page, errors }) => {
  await seed(page, { users: {} });
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    await page.goto("/admin-login"); await page.waitForTimeout(700);
    const links = page.locator(".legal a");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toBeVisible(); await expect(links.nth(1)).toBeVisible();
    expect(await links.nth(0).getAttribute("href")).toBe("https://quizflow.space/privacy");
    expect(await links.nth(1).getAttribute("href")).toBe("https://quizflow.space/terms");
    expect(await links.nth(0).getAttribute("target")).toBe("_blank");
    expect(await links.nth(0).getAttribute("rel")).toContain("noopener");
    expect(await noOverflow(page)).toBe(true);
  }
  expect(errors).toEqual([]);
});
