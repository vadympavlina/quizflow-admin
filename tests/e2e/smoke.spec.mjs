// Кожна сторінка відкривається без помилок JS і без 404 на свої файли
import { test, expect, seed } from "./fixtures.mjs";

const db = { users: { t1: { role: "admin", name: "A" } }, teachers: { t1: { tests: { T1: { title: "x", questions: [] } } } } };
const GROUPS = { admin: ["/", "overview", "teachers", "stats", "problems", "roles", "news", "navigation", "ai-settings", "telegram", "announcements", "mail", "features", "audit", "invites", "cleanup"] };
const EXPECTED = [];

for (const [name, pages] of Object.entries(GROUPS)) {
  test(`сторінки без помилок: ${name}`, async ({ page, errors }) => {
    const missing = [];
    page.on("response", r => { if (r.status() === 404 && r.url().includes("127.0.0.1")) missing.push(new URL(r.url()).pathname); });
    await seed(page, db, "t1");
    for (const pg of pages) {
      await page.goto("/" + pg.replace(/^\//, ""));
      await page.waitForTimeout(1200);
    }
    expect(missing, "файли з 404").toEqual([]);
    expect(errors.filter(e => !EXPECTED.some(r => r.test(e)))).toEqual([]);
  });
}
