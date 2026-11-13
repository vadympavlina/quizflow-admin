// Адмінка на телефоні: фільтри в нижній шторці з лічильником, змах вниз закриває шторки й модалки
import { test, expect, seed } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function touchDrag(page, cdp, from, to, { steps = 8, gap = 16 } = {}) {
  const pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps) });
    if (gap) await page.waitForTimeout(gap);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("фільтри викладачів: списки у шторці, лічильник, змах закриває, на ПК усе повертається", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/teachers"); await page.waitForTimeout(1500);
  await expect(page.locator(".ad-fbtn")).toBeVisible();
  expect(await page.locator(".tp-sh > .tp-sel").count()).toBe(0);          // списки не займають місце в рядку
  await page.locator(".ad-fbtn").click(); await page.waitForTimeout(450);
  expect(await page.locator(".ad-fs-b .ad-sel").count()).toBe(2);
  expect(await page.evaluate(() => document.documentElement.classList.contains("qf-lock"))).toBe(true);
  // змах вниз по шторці закриває її
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator(".ad-fs").boundingBox();
  await touchDrag(page, cdp, { x: 195, y: box.y + 20 }, { x: 195, y: box.y + 300 });
  await expect(page.locator(".ad-fs")).not.toHaveClass(/on/);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.classList.contains("qf-lock"))).toBe(false);
  // вибір значення дає лічильник
  await page.locator(".ad-fbtn").click(); await page.waitForTimeout(400);
  await page.evaluate(() => { const s = document.getElementById("tc-sort"); s.value = "name"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.waitForTimeout(100);
  await expect(page.locator(".ad-fb-n")).toHaveText("1");
  await page.locator(".ad-fs-x").click(); await page.waitForTimeout(400);
  // широкий екран: списки на місці, кнопки немає
  await page.setViewportSize({ width: 1200, height: 800 }); await page.waitForTimeout(300);
  expect(await page.locator(".tp-sh > .tp-sel").count()).toBe(1);
  await expect(page.locator(".ad-fbtn")).toBeHidden();
  expect(errors).toEqual([]);
});

test("модалка на телефоні закривається змахом вниз; короткий змах повертає її", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/teachers"); await page.waitForTimeout(1400);
  await page.evaluate(() => window.openModal("m-create")); await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  const b = await page.locator("#m-create .modal-h").boundingBox();
  await touchDrag(page, cdp, { x: 120, y: b.y + 20 }, { x: 120, y: b.y + 50 }, { steps: 6, gap: 60 });   // 30px повільно
  await page.waitForTimeout(450);
  await expect(page.locator("#m-create")).toHaveClass(/on/);
  const b2 = await page.locator("#m-create .modal-h").boundingBox();
  await touchDrag(page, cdp, { x: 120, y: b2.y + 20 }, { x: 120, y: b2.y + 420 }, { steps: 5, gap: 0 });  // далеко й швидко
  await expect(page.locator("#m-create")).not.toHaveClass(/on/);
  expect(await page.evaluate(() => document.documentElement.classList.contains("qf-lock"))).toBe(false);
  expect(errors).toEqual([]);
});
