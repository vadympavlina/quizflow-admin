// Дзеркало дозволів у профілі викладача (users/{uid}/perms): його читають правила бази.
import { test, expect, seed, readDb } from "./fixtures.mjs";
import { admSeed } from "./seeds/admin.mjs";

test("лише перегляд записує в дзеркало заборони на зміни, адміністратору дзеркала немає", async ({ page, errors }) => {
  const d = admSeed(Date.now()); d.settings.ownerUid = "t5";
  await seed(page, d, "t5");
  await page.goto("/teachers?id=t2"); await page.waitForTimeout(900);
  await page.locator('[data-act="readonly"]').evaluate(el => { el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.waitForTimeout(900);
  const db = await readDb(page);
  const u = db.users.t2;
  expect(u.readOnly).toBe(true);
  expect(u.permsAt).toBeGreaterThan(0);
  expect(u.perms).toBeTruthy();
  expect(u.perms.tests_edit).toBe(false);
  expect(u.perms.links_manage).toBe(false);
  expect(u.perms.tests_view ?? true).toBe(true);
  expect(Object.values(u.perms).every(v => v === false)).toBe(true);
  expect(Object.keys(u.perms).every(k => !/[.$#\[\]/]/.test(k))).toBe(true);
  expect(db.users.t5.perms ?? null).toBeNull();
  expect(errors).toEqual([]);
});

test("сторінка викладачів сама рахує дзеркало для нових користувачів", async ({ page }) => {
  const d = admSeed(Date.now()); d.settings.ownerUid = "t5";
  await seed(page, d, "t5");
  await page.goto("/teachers"); await page.waitForTimeout(1500);
  const db = await readDb(page);
  expect(db.users.t2.permsAt).toBeGreaterThan(0);
});
