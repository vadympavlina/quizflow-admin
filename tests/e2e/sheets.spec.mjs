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

// Видима прозорість модалки = добуток прозорості її самої й усіх батьків; вона не має падати нижче 1
const alphaOf = (page, sel) => page.evaluate(s => { let a = 1; for (let n = document.querySelector(s); n; n = n.parentElement) a *= +getComputedStyle(n).opacity; return a; }, sel);

test("модалка не стає прозорою, коли її згортаєш змахом", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/teachers"); await page.waitForTimeout(1400);
  await page.evaluate(() => window.openModal("m-create")); await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  const b = await page.locator("#m-create .modal-h").boundingBox();
  const x = 120, y = b.y + 20;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 25, id: 1 }] }); await page.waitForTimeout(16); }
  expect(await alphaOf(page, "#m-create .modal"), "під час тяги").toBe(1);
  for (let i = 9; i <= 16; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 25, id: 1 }] });   // далі — до порогу закриття
  const bg = await page.evaluate(() => +getComputedStyle(document.getElementById("m-create")).backgroundColor.match(/[\d.]+/g)[3]);
  expect(bg, "затемнення фону слабшає").toBeLessThan(0.5);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const seen = [];
  for (let i = 0; i < 6; i++) { seen.push(await alphaOf(page, "#m-create .modal")); await page.waitForTimeout(25); }
  expect(Math.min(...seen), "після змаху").toBe(1);
  await expect(page.locator("#m-create")).not.toHaveClass(/on/);
  // наступне відкриття — з чистого стану (ні прозорості, ні зсуву)
  await page.waitForTimeout(400);
  await page.evaluate(() => window.openModal("m-create")); await page.waitForTimeout(600);
  const st = await page.evaluate(() => { const m = document.querySelector("#m-create .modal"); return { tr: getComputedStyle(m).transform, bg: document.getElementById("m-create").style.backgroundColor, ty: new DOMMatrix(getComputedStyle(m).transform).m42 }; });
  expect(st.bg).toBe(""); expect(Math.abs(st.ty)).toBeLessThan(2);
  expect(errors).toEqual([]);
});
