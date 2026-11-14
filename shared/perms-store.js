// ═══════════════════════════════════════════════════════════════════════
// shared/perms-store.js — запис налаштувань дозволів у settings/features (лише адмінка).
//
// Старий формат (прапорці games/import/export і обмеження меню за ролями) при першому ж збереженні
// перетворюється на новий (v:2) одним записом, тож нічого не губиться. Після цього пункти меню
// більше не обмежуються через roleIds: доступ до сторінок задають дозволи ролей.
// ═══════════════════════════════════════════════════════════════════════
import { PERMS, normalizeCfg, storeKey } from "./perms.js?v=2";

const bool = v => typeof v === "boolean";
const posInt = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; };
const anyInt = v => { if (v === "" || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; };

// Нормалізований конфіг ({perms, limits, roles}) → те, що лягає в базу
export function toStoreCfg(c, roleExists = () => true) {
  const out = { v: 2 };
  const gp = {};
  Object.entries(c.perms || {}).forEach(([k, v]) => { if (PERMS[k] && v === false) gp[storeKey(k)] = false; });
  if (Object.keys(gp).length) out.perms = gp;
  const gl = {};
  Object.entries(c.limits || {}).forEach(([k, v]) => { const n = posInt(v); if (n !== null) gl[k] = n; });
  if (Object.keys(gl).length) out.limits = gl;
  const roles = {};
  Object.entries(c.roles || {}).forEach(([rid, r]) => {
    if (!roleExists(rid)) return;
    const p = {}, l = {};
    Object.entries(r?.perms || {}).forEach(([k, v]) => { if (PERMS[k] && bool(v)) p[storeKey(k)] = v; });
    Object.entries(r?.limits || {}).forEach(([k, v]) => { const n = anyInt(v); if (n !== null) l[k] = n; });
    const x = {};
    if (Object.keys(p).length) x.perms = p;
    if (Object.keys(l).length) x.limits = l;
    if (Object.keys(x).length) roles[rid] = x;
  });
  if (Object.keys(roles).length) out.roles = roles;
  return out;
}

// Навігація без обмежень за ролями (після переходу на дозволи вони не діють)
export function stripNavRoles(nav) {
  const arr = Array.isArray(nav) ? nav : Object.values(nav || {});
  return arr.map(sec => ({ ...sec, items: (Array.isArray(sec?.items) ? sec.items : Object.values(sec?.items || {})).map(it => {
    if (!it || !("roleIds" in it)) return it;
    const { roleIds, ...rest } = it;
    return rest;
  }) }));
}

// Зміни налаштувань: mutate отримує нормалізований конфіг, повертає його ж. Повертає пакет для update(ref(db), …).
// feat — сирий settings/features, nav — сирий settings/navigation (або null), navFromDb — чи він справжній
export function buildSave(feat, nav, navFromDb, mutate, roleExists) {
  const c = normalizeCfg(feat, nav);
  mutate(c);
  const data = toStoreCfg(c, roleExists);
  const upd = { "settings/features": data };
  let newNav = null;
  if ((feat || {}).v !== 2 && navFromDb) { newNav = stripNavRoles(nav); upd["settings/navigation"] = newNav; upd["settings/navigation_ts"] = Date.now(); }
  return { upd, data, newNav };
}
