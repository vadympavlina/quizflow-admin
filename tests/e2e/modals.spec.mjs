// Модалки адмінки: сторінка під ними не прокручується, Tab не виходить за межі, «×» і тости доступні скрінрідеру
import { test, expect, seed } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

test("модалка: блокує прокрутку сторінки, тримає фокус, має підписи", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/teachers"); await page.waitForTimeout(1400);
  await page.evaluate(() => window.openModal("m-create")); await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({
    lock: document.documentElement.classList.contains("qf-lock"),
    ov: getComputedStyle(document.documentElement).overflow,
    lab: document.querySelector("#m-create .close").getAttribute("aria-label"),
    lby: document.getElementById("m-create").getAttribute("aria-labelledby"),
  }));
  expect(st.lock).toBe(true); expect(st.ov).toBe("hidden");
  expect(st.lab).toBe("Закрити"); expect(st.lby).toBeTruthy();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement.closest("#m-create")), "фокус лишається в модалці").toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement.closest("#m-create"))).toBe(true);
  await page.evaluate(() => window.closeModal("m-create"));
  expect(await page.evaluate(() => document.documentElement.classList.contains("qf-lock"))).toBe(false);
  expect(errors).toEqual([]);
});

test("кожна модалка закривається клавішею Esc і знімає блокування", async ({ page, errors }) => {
  await seed(page, admSeed(Date.now()), "t5");
  for (const [pg, id] of [["teachers", "m-create"], ["roles", "m-role"], ["invites", "m-new"], ["navigation", "m-icon"], ["problems", "m-item"], ["cleanup", "m-cl"]]) {
    await page.goto("/" + pg); await page.waitForTimeout(1200);
    await page.evaluate(i => window.openModal(i), id); await page.waitForTimeout(120);
    await page.keyboard.press("Escape"); await page.waitForTimeout(80);
    const r = await page.evaluate(i => ({ on: document.getElementById(i).classList.contains("on"), lock: document.documentElement.classList.contains("qf-lock") }), id);
    expect(r.on, `Esc закриває ${id} на ${pg}`).toBe(false);
    expect(r.lock, `блокування знято на ${pg}`).toBe(false);
  }
  expect(errors).toEqual([]);
});

test("тост озвучується: status для звичайного, alert для помилки", async ({ page }) => {
  await seed(page, admSeed(Date.now()), "t5");
  await page.goto("/teachers"); await page.waitForTimeout(1200);
  await page.evaluate(() => window.toast ? 0 : 0);
  const r = await page.evaluate(async () => {
    const m = await import("./shared/admin-shell.js");
    const el = document.getElementById("admin-toast"); const out = {};
    m.toast("Збережено"); out.a = [el.getAttribute("role"), el.getAttribute("aria-live")];
    m.toast("Помилка", "err"); out.b = [el.getAttribute("role"), el.getAttribute("aria-live")];
    return out;
  });
  expect(r.a).toEqual(["status", "polite"]); expect(r.b).toEqual(["alert", "assertive"]);
});
