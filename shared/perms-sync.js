// ═══════════════════════════════════════════════════════════════════════
// shared/perms-sync.js — дзеркало дозволів у профілі викладача (users/{uid}/perms).
//
// Правила бази не вміють рахувати ролі, тож адмінка записує підсумок сама: лише заборонені дозволи
// (tests_edit: false …), дозволене не пишеться. Правила читають його й не пускають заборонену дію:
// створювати й редагувати тести, ділитися ними, змінювати посилання, перевіряти роботи, проводити ігри.
// Немає запису = дозволено. «Лише перегляд» уже врахований у підсумку (усі дії зі змінами заборонені).
// Викликати після кожної зміни ролей, дозволів, особистих налаштувань і режиму перегляду.
// ═══════════════════════════════════════════════════════════════════════
import { db, ref, update, dbGet } from "./admin-shell.js?v=22";
import { PERM_KEYS, resolvePerms, storeKey } from "./perms.js?v=3";

// uids: список користувачів або null (усі). Повертає, скільком оновлено дзеркало.
export async function syncPerms(uids = null) {
  const [users, cfg, nav] = await Promise.all([dbGet("users"), dbGet("settings/features").catch(() => null), dbGet("settings/navigation").catch(() => null)]);
  const only = uids ? new Set(uids) : null;
  const upd = {};
  let n = 0;
  Object.entries(users || {}).forEach(([uid, u]) => {
    if (!u || typeof u !== "object" || !u.role || (only && !only.has(uid))) return;
    const denied = {};
    if (u.role !== "admin") {
      const r = resolvePerms(cfg || {}, u, nav);
      PERM_KEYS.forEach(k => { if (!r.perms[k]) denied[storeKey(k)] = false; });
    }
    upd[`users/${uid}/perms`] = Object.keys(denied).length ? denied : null;
    upd[`users/${uid}/permsAt`] = Date.now();
    n++;
  });
  const paths = Object.keys(upd);
  for (let i = 0; i < paths.length; i += 300) {
    const part = {}; paths.slice(i, i + 300).forEach(k => { part[k] = upd[k]; });
    await update(ref(db), part);
  }
  return n;
}
// Користувачі, яким дзеркало ще не рахували (щойно зареєструвались): їх оновлюємо автоматично
export const unsynced = users => Object.entries(users || {}).filter(([, u]) => u && typeof u === "object" && u.role && u.role !== "admin" && !u.permsAt).map(([id]) => id);
