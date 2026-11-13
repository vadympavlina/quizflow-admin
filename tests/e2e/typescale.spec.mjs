// Типографічна шкала адмінки: на жодній сторінці немає розмірів шрифту поза шкалою (без півпікселів)
import { test, expect, seed } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

const SCALE = [11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 34];
const PAGES = ["", "teachers", "stats", "problems", "roles", "news", "navigation", "ai-settings", "telegram", "announcements", "mail", "features", "audit", "invites", "cleanup"];

test("розміри шрифту всіх сторінок адмінки — зі шкали", async ({ page }) => {
  await seed(page, admSeed(Date.now()), "t5");
  const bad = [];
  for (const pg of PAGES) {
    await page.goto("/" + pg); await page.waitForTimeout(1200);
    const r = await page.evaluate(scale => {
      const out = new Set();
      for (const e of document.querySelectorAll("body *")) {
        if (!e.offsetParent && e.tagName !== "BODY") continue;
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (!scale.includes(fs)) out.add(fs);
      }
      return [...out];
    }, SCALE);
    if (r.length) bad.push(pg + ": " + r.join(", "));
  }
  expect(bad, "розміри поза шкалою").toEqual([]);
});
