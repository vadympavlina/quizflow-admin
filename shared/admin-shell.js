// ═══════════════════════════════════════════════════════════════════════════
//  admin-shell.js — спільний bootstrap для всіх сторінок адмінки
//
//  Кожна сторінка адмінки імпортує initAdminShell(activePage):
//
//    import { initAdminShell, dbGet } from "./shared/admin-shell.js";
//    await initAdminShell("overview");
//
//  Що робить:
//    1) Перевіряє auth: якщо немає sessionStorage.qf_user або це не admin —
//       редіректить на admin-login.html
//    2) Інжектує topbar + контент; меню (admin-nav.js) лише підсвічує й оновлює
//    3) Запускає Firebase + експортує `db`, `dbGet`, `dbUpd`, etc.
//    4) Експортує стан `_user`, _users, _stats, _allAttempts через window
//    5) Дає утіли: esc, genPass, formatTimeAgo, openModal, closeModal, toast, doLogout
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import "./admin-ui.js?v=1";   // власні дропдаун і календар замість системних select / date
import { getDatabase, ref, get, set, update, remove, onValue, push, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const cfg = {
  apiKey: "AIzaSyDsA4IQkn5tV41LDK43vzgm0XnRnbdgvTc",
  authDomain: "quizflow-8a978.firebaseapp.com",
  databaseURL: "https://quizflow-8a978-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quizflow-8a978",
  storageBucket: "quizflow-8a978.firebasestorage.app",
  messagingSenderId: "206469794166",
  appId: "1:206469794166:web:55cd7007b429607acd5257"
};
const app = getApps().length ? getApps()[0] : initializeApp(cfg);
const db = getDatabase(app);

// ─── Журнал дій адміністраторів (adminLog, лише дописування) ─────────────────
// logAction("teacher.block", { type:"teacher", id, label:"Коваль Олена" }, "необов'язкові деталі")
// Помилка запису ніколи не заважає самій дії.
export function logAction(action, target = {}, details = null){
  try {
    const u = window._user || {};
    const name = [u.name, u.surname].filter(Boolean).join(" ") || u.email || "Адміністратор";
    const entry = { at: serverTimestamp(), uid: u.id || "", name, action,
      targetType: target.type || null, targetId: target.id || null, targetLabel: target.label ? String(target.label).slice(0, 120) : null,
      details: details == null ? null : String(details).slice(0, 300) };
    push(ref(db, "adminLog"), entry).catch(() => {});
  } catch {}
}

// ─── Helpers (чисті утіли, без DOM) ─────────────────────────────────────────

export const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export const genPass = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#";
  return Array.from({length:10}, () => c[Math.floor(Math.random()*c.length)]).join("");
};

export function formatTimeAgo(ts){
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60000) return "щойно";
  if (diff < 3600000) return Math.floor(diff/60000) + " хв тому";
  if (diff < 86400000) return Math.floor(diff/3600000) + " год тому";
  if (diff < 604800000) return Math.floor(diff/86400000) + " дн тому";
  return new Date(ts).toLocaleDateString("uk-UA", {day:"numeric", month:"short"});
}

// ─── Firebase helpers (export) ──────────────────────────────────────────────

export async function dbGet(path){
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}
export async function dbSet(path, value){ await set(ref(db, path), value); }
export async function dbUpd(path, value){ await update(ref(db, path), value); }
export async function dbRemove(path){ await remove(ref(db, path)); }
export { db, ref, get, set, update, remove, onValue, push };

// ─── Modal / Toast (DOM utilities) ──────────────────────────────────────────

// Фокус переходить у модалку й повертається на кнопку, що її відкрила.
// Поки модалка відкрита: сторінка під нею не прокручується, Tab ходить по колу.
const _modalOpeners = new Map();
const _modalStack = [];
const _lockHeld = new Set();
let _scrollLocked = false;
const _FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function _lockGuard(e){
  // Дозволяємо прокрутку лише всередині самої модалки та її списків
  for (let n = e.target; n && n !== document.body && n.nodeType === 1; n = n.parentNode){
    if (!n.closest || !n.closest(".modal-bd,.ad-fs")) break;
    const cs = getComputedStyle(n);
    if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(cs.overflowY)) return;
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(cs.overflowX)) return;
  }
  if (e.cancelable) e.preventDefault();
}
function _setLock(want, key = "modal"){
  if (want) _lockHeld.add(key); else _lockHeld.delete(key);
  const on = _lockHeld.size > 0;
  if (on === _scrollLocked) return;
  _scrollLocked = on;
  const de = document.documentElement;
  if (on){
    const sbw = window.innerWidth - de.clientWidth;
    de.classList.add("qf-lock");
    if (sbw > 0) de.style.paddingRight = sbw + "px";
    document.addEventListener("touchmove", _lockGuard, { passive: false });
  } else {
    de.classList.remove("qf-lock");
    de.style.paddingRight = "";
    document.removeEventListener("touchmove", _lockGuard, { passive: false });
  }
}
function _modalKeys(e){
  const id = _modalStack[_modalStack.length - 1];
  const el = id && document.getElementById(id);
  if (!el) return;
  // Esc обробляє кожна сторінка сама (деякі модалки не можна закрити, поки триває відправка)
  if (e.key === "Tab"){
    const items = [...el.querySelectorAll(_FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!el.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
}
document.addEventListener("keydown", _modalKeys);

window.qfDismiss = function (el, o) {
  if (!el || el._qfDismiss) return;
  el._qfDismiss = true;
  const dir = o.dir || "down";                                      // down | up | left | right
  const vert = dir === "down" || dir === "up", sgn = dir === "down" || dir === "right" ? 1 : -1;
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SKIP = "input,textarea,select,[contenteditable='true'],.ad-pop,[data-no-swipe]";
  let st = null;
  const ovl = () => (typeof o.overlay === "function" ? o.overlay() : o.overlay) || null;
  const size = () => (vert ? el.offsetHeight : el.offsetWidth) || 300;
  // Чи є всередині вміст, який ще можна прокрутити проти жесту (тоді це прокрутка, а не закриття)
  function scrolledInside(target) {
    for (let n = target; n && n !== el.parentNode; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      if (vert ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1) {
        const pos = vert ? n.scrollTop : n.scrollLeft;
        const ov = getComputedStyle(n)[vert ? "overflowY" : "overflowX"];
        if (/auto|scroll/.test(ov) && (sgn > 0 ? pos > 0 : pos < (vert ? n.scrollHeight - n.clientHeight : n.scrollWidth - n.clientWidth) - 1)) return true;
      }
      if (n === el) break;
    }
    return false;
  }
  // Затемнення: o.dim — гасимо лише колір фону підкладки, а не всю підкладку (разом із шторкою всередині,
  // яка інакше теж ставала б прозорою). Без o.dim підкладка окремий елемент, гасимо її прозорість.
  const bgOf = v => {
    if (!v._qfBg) { const m = getComputedStyle(v).backgroundColor.match(/[\d.]+/g) || [0, 0, 0, 0.5]; v._qfBg = { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? +m[3] : 1 }; }
    return v._qfBg;
  };
  const dimTo = (v, k) => { if (o.dim) { const c = bgOf(v); v.style.backgroundColor = `rgba(${c.r},${c.g},${c.b},${c.a * k})`; } else v.style.opacity = String(k); };
  const dimTrans = () => (o.dim ? "background-color" : "opacity");
  function paint(d) {
    const m = d > 0 ? d : d * 0.15;                                 // проти жесту — опір, а не жорсткий стоп
    el.style.transform = vert ? `translate3d(0,${m * sgn}px,0)` : `translate3d(${m * sgn}px,0,0)`;
    const v = ovl(); if (v) dimTo(v, Math.max(0, 1 - Math.max(0, d) / (size() * 1.1)));
  }
  function reset() {
    el.style.transition = ""; el.style.transform = ""; el.style.willChange = "";
    const v = ovl(); if (v) { v.style.transition = ""; v.style.opacity = ""; v.style.backgroundColor = ""; v._qfBg = null; }
  }
  function cleanup() {
    el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end);
    st = null;
  }
  function move(e) {
    if (!st) return;
    const t = e.touches[0]; if (!t) return;
    const dx = t.clientX - st.x, dy = t.clientY - st.y;
    const d = (vert ? dy : dx) * sgn, c = vert ? dx : dy;
    if (!st.drag) {
      if (Math.abs(c) > 10 && Math.abs(c) > Math.abs(d)) { cleanup(); return; }   // це інший жест (прокрутка вбік)
      if (d < -10) { cleanup(); return; }                                         // тягнуть у протилежний бік
      if (d < 12) return;                                                          // поріг активації
      st.drag = true; st.off = d;
      el.style.transition = "none"; el.style.willChange = "transform";
      const v = ovl(); if (v) { bgOf(v); v.style.transition = "none"; }
    }
    if (e.cancelable) e.preventDefault();                                          // тепер це наш жест, сторінка не прокручується
    const dist = d - st.off, dt = e.timeStamp - st.lt;
    if (dt > 0) st.v = 0.7 * ((d - st.ld) / dt) + 0.3 * st.v;                       // згладжена швидкість
    st.ld = d; st.lt = e.timeStamp; st.dist = dist;
    if (!st.tick && dist > size() * 0.3) { st.tick = true; try { navigator.vibrate && navigator.vibrate(8); } catch {} }
    if (st.tick && dist < size() * 0.3) st.tick = false;
    paint(dist);
  }
  function end() {
    if (!st) return;
    const s = st; cleanup();
    if (!s.drag) return;
    const far = s.dist > size() * 0.3 || (s.v > 0.5 && s.dist > 24);
    const v = ovl();
    if (reduce()) { reset(); if (far) o.close(); return; }
    if (far) {
      el.style.transition = "transform .22s cubic-bezier(.4,0,1,1)";
      if (v) { v.style.transition = dimTrans() + " .22s ease"; dimTo(v, 0); }
      el.style.transform = vert ? `translate3d(0,${sgn * 100}%,0)` : `translate3d(${sgn * 100}%,0,0)`;
      setTimeout(() => { o.close(); setTimeout(reset, 60); }, 190);
    } else {
      el.style.transition = "transform .3s cubic-bezier(.2,.8,.2,1)";
      if (v) { v.style.transition = dimTrans() + " .3s ease"; if (o.dim) dimTo(v, 1); else v.style.opacity = ""; }
      el.style.transform = "";
      setTimeout(reset, 320);
    }
  }
  el.addEventListener("touchstart", e => {
    if (st || e.touches.length !== 1 || (o.enabled && !o.enabled())) return;
    if (e.target.closest && e.target.closest(SKIP)) return;
    if (scrolledInside(e.target)) return;
    const t = e.touches[0];
    st = { x: t.clientX, y: t.clientY, lt: e.timeStamp, ld: 0, v: 0, dist: 0, off: 0, drag: false, tick: false };
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
  }, { passive: true });
};

// ─── Нижня шторка фільтрів (телефон) ────────────────────────────────────
// У рядку лишаються пошук і вкладки, а списки та перемикачі йдуть у шторку за кнопкою «Фільтри»
// з лічильником активних. Елементи переносяться (не копіюються), на широкому екрані повертаються.
const _FS_MQ = matchMedia("(max-width:640px)");
const _FS_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg>';
export function filterSheet(cfg){
  const items = (cfg.items || []).map(s => document.querySelector(s)).filter(Boolean);
  const anchor = document.querySelector(cfg.anchor);
  if (!items.length || !anchor) return null;
  const marks = items.map(el => { const m = document.createComment("fs"); el.parentNode.insertBefore(m, el); return m; });
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "ad-fbtn"; btn.setAttribute("aria-label", "Фільтри"); btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = _FS_ICON + '<span class="ad-fb-n" hidden>0</span>';
  // Пошук і кнопка стоять в одному рядку
  const row = document.createElement("div"); row.className = "ad-frow";
  anchor.parentNode.insertBefore(row, anchor); row.append(anchor, btn);
  const ov = document.createElement("div"); ov.className = "ad-fs-ov";
  const sh = document.createElement("div"); sh.className = "ad-fs"; sh.setAttribute("role", "dialog"); sh.setAttribute("aria-label", cfg.title || "Фільтри");
  sh.innerHTML = '<div class="ad-fs-h"><b></b><button type="button" class="ad-fs-x">Готово</button></div><div class="ad-fs-b"></div>';
  sh.querySelector("b").textContent = cfg.title || "Фільтри";
  const body = sh.querySelector(".ad-fs-b");
  document.body.append(ov, sh);
  let moved = false, isOpen = false;
  const count = () => {
    const n = cfg.count ? cfg.count() : 0;
    const b = btn.querySelector(".ad-fb-n"); b.textContent = String(n); b.hidden = !n;
    btn.classList.toggle("set", n > 0);
  };
  function place(narrow){
    if (narrow && !moved){ items.forEach(el => body.appendChild(el)); moved = true; }
    else if (!narrow && moved){ items.forEach((el, i) => marks[i].parentNode.insertBefore(el, marks[i].nextSibling)); moved = false; if (isOpen) close(); }
    btn.hidden = !narrow; count();
  }
  function open(){
    if (isOpen) return; isOpen = true;
    sh.style.display = "flex"; ov.style.display = "block"; void sh.offsetWidth;
    sh.classList.add("on"); ov.classList.add("on");
    btn.setAttribute("aria-expanded", "true");
    _setLock(true, "filters");
    setTimeout(() => sh.querySelector(".ad-fs-x").focus({ preventScroll: true }), 80);
  }
  function close(){
    if (!isOpen) return; isOpen = false;
    sh.classList.remove("on"); ov.classList.remove("on");
    btn.setAttribute("aria-expanded", "false");
    _setLock(false, "filters"); count();
    setTimeout(() => { if (!isOpen){ sh.style.display = "none"; ov.style.display = "none"; sh.style.transform = ""; sh.style.transition = ""; ov.style.opacity = ""; ov.style.transition = ""; } }, 300);
    try { btn.focus({ preventScroll: true }); } catch {}
  }
  btn.addEventListener("click", () => (isOpen ? close() : open()));
  sh.querySelector(".ad-fs-x").addEventListener("click", close);
  ov.addEventListener("click", close);
  addEventListener("keydown", e => { if (e.key === "Escape" && isOpen && !document.querySelector('.ad-pop[data-open="1"]')){ e.stopPropagation(); close(); } }, true);
  window.qfDismiss(sh, { dir: "down", overlay: ov, close, enabled: () => isOpen });
  body.addEventListener("change", () => setTimeout(count, 0));
  body.addEventListener("click", () => setTimeout(count, 0));
  _FS_MQ.addEventListener("change", e => place(e.matches));
  place(_FS_MQ.matches);
  return { open, close, refresh: count };
}

export function openModal(id){
  const el = document.getElementById(id);
  if (!el) return;
  if (!_modalStack.includes(id)){
    _modalOpeners.set(id, document.activeElement);
    _modalStack.push(id);
  }
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  const h = el.querySelector(".modal-h h3");
  if (h){ if (!h.id) h.id = id + "-t"; el.setAttribute("aria-labelledby", h.id); }
  el.querySelectorAll(".close:not([aria-label])").forEach(b => b.setAttribute("aria-label", "Закрити"));
  el.classList.add("on");
  // Телефон: модалка — нижня шторка, її можна змахнути вниз
  const box = el.querySelector(".modal");
  if (box) window.qfDismiss(box, { dir: "down", overlay: el, dim: true, close: () => closeModal(id), enabled: () => matchMedia("(max-width:640px)").matches });
  _setLock(true);
  setTimeout(() => {
    if (!el.classList.contains("on") || el.contains(document.activeElement)) return;
    const f = el.querySelector("[autofocus]:not([disabled])")
      || [...el.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([readonly]):not([disabled])")].find(x => x.offsetParent && !x.value)
      || el.querySelector(".modal-f button:not([disabled]):last-child");
    try { f?.focus({ preventScroll: true }); } catch {}
  }, 60);
}
export function closeModal(id){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("on");
  const i = _modalStack.indexOf(id);
  if (i >= 0) _modalStack.splice(i, 1);
  // Модалка могла бути прихована й без closeModal — відпускаємо лише коли жодної не лишилось
  if (!_modalStack.length || !document.querySelector(".modal-bd.on")) { _modalStack.length = 0; _setLock(false); }
  const op = _modalOpeners.get(id);
  _modalOpeners.delete(id);
  try { if (op && document.contains(op)) op.focus({ preventScroll: true }); } catch {}
}
let _toastT;
export function toast(msg, type){
  const el = document.getElementById("admin-toast");
  if (!el) return;
  const err = type === "err";
  // Роль задаємо до тексту — скрінрідер озвучує зміну вмісту
  el.setAttribute("role", err ? "alert" : "status");
  el.setAttribute("aria-live", err ? "assertive" : "polite");
  el.setAttribute("aria-atomic", "true");
  el.textContent = msg;
  el.classList.toggle("err", err);
  el.classList.add("show");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove("show"), 3000);
}

// ─── Auth (Firebase Auth) ────────────────────────────────────────────────────
import { getAuth, onAuthStateChanged, signOut as _signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const _adminAuth = getAuth(app);

// Чекаємо Firebase Auth — визначаємо поточного юзера
const _adminFbUser = await new Promise(resolve => {
  const unsub = onAuthStateChanged(_adminAuth, u => { unsub(); resolve(u); });
});

// Після входу повертаємо на ту саму сторінку адмінки (admin-login?next=…)
const _adminNext = () => { const h = (location.pathname.split("/").pop() || "") + location.search; return h ? "next=" + encodeURIComponent(h) : ""; };
if (!_adminFbUser) {
  location.href = "admin-login" + (_adminNext() ? "?" + _adminNext() : "");
  throw new Error("no auth");
}

// Читаємо профіль з DB і перевіряємо role === "admin"
const _adminProfileSnap = await get(ref(db, `users/${_adminFbUser.uid}`));
if (!_adminProfileSnap.exists() || _adminProfileSnap.val().role !== "admin") {
  // Викладача не розлогінюємо (інакше він вилетить і з панелі викладача) — сторінка входу пояснить
  location.href = "admin-login?denied=1" + (_adminNext() ? "&" + _adminNext() : "");
  throw new Error("not admin");
}
if (_adminProfileSnap.val().blocked === true) {
  await _signOut(_adminAuth);
  location.href = "admin-login?blocked=1";
  throw new Error("blocked");
}

const _adminProfile = _adminProfileSnap.val();

let _currentAdminUser = {
  id:      _adminFbUser.uid,
  email:   _adminFbUser.email,
  name:    _adminProfile.name    || "",
  surname: _adminProfile.surname || "",
  role:    "admin"
};

function getCurrentUser(){
  return _currentAdminUser;
}

// ─── Воркер пошти (Cloudflare) ──────────────────────────────────────────
// Адреса зберігається в settings/mail/workerUrl, запит підписується Firebase
// ID-токеном — воркер сам перевіряє, що це адмін. Див. worker/ і docs/email-setup.md.
let _mailUrl;
export async function mailWorkerUrl(force = false){
  if (_mailUrl !== undefined && !force) return _mailUrl;
  _mailUrl = String((await dbGet("settings/mail/workerUrl").catch(() => null)) || "").replace(/\/+$/, "");
  return _mailUrl;
}
export function setMailWorkerUrl(u){ _mailUrl = String(u || "").replace(/\/+$/, ""); }
export async function mailApi(path, body, { url } = {}){
  const base = url || await mailWorkerUrl();
  if (!base) throw new Error("Воркер пошти не налаштовано — див. «Розсилки»");
  const token = await _adminAuth.currentUser?.getIdToken();
  if (!token) throw new Error("Сесія завершилась, увійдіть знову");
  let r;
  try {
    r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw Object.assign(new Error(`Не вдалося з'єднатися з воркером. Відкрийте ${base}/ у новій вкладці: має показати {"ok":true,"service":"quizflow-mail"}. Якщо бачите «Hello World» — у воркер ще не вставлено код з worker/dist/worker.js`), { code: "network" }); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Воркер відповів ${r.status}`), { status: r.status, code: data.code || "" });
  return data;
}

export function doLogout(){
  try { localStorage.removeItem("qf_admin_user"); localStorage.removeItem("qf_signed_in"); } catch {}
  _signOut(_adminAuth);
  location.href = "admin-login";
}

// ─── Sidebar / Topbar markup ────────────────────────────────────────────────

const ICONS = {
  overview:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  teachers:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20c0-2.6 2-4.8 4.5-5"/></svg>',
  stats:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/></svg>',
  news:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 9h6M7 13h6M7 17h4"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/></svg>',
  problems:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
  ai:        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M9 9h.01M15 9h.01"/><path d="M9 13c1 1 2 1.5 3 1.5s2-.5 3-1.5"/><path d="M12 17v3"/><path d="M9 21h6"/></svg>',
  menu:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  logout:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  bell:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15V11a6 6 0 1 1 12 0v4l1.5 3h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  search:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  chevron:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  help:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4"/><circle cx="12" cy="17" r=".9" fill="currentColor"/></svg>',
};

// Меню малює admin-nav.js синхронно ще до Firebase (тому воно не зникає між
// сторінками). Якщо сторінка його не підключила — довантажуємо тут.
function ensureAdminNav(){
  if (window.AdminNav) return Promise.resolve();
  return new Promise(res => {
    const s = document.createElement("script");
    s.src = new URL("./admin-nav.js?v=9", import.meta.url).href;
    s.onload = s.onerror = () => res();
    document.head.appendChild(s);
  });
}

// Верхня панель: кнопка меню (телефон), розділ і назва сторінки, дії сторінки,
// дзвіночок нових проблем. Без неактивних кнопок.
function renderTopbar(activeId, crumbs){
  const nfo = window.AdminNav?.info(activeId) || {};
  const title = (crumbs && crumbs[crumbs.length - 1]) || nfo.label || "";
  return `
  <header class="topbar">
    <button type="button" class="tb-menu" id="tb-menu" onclick="AdminNav.open()" aria-controls="admin-sidebar" aria-expanded="false" aria-label="Меню">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
    </button>
    <div class="tb-title">
      ${nfo.icon ? `<span class="tb-ico">${nfo.icon}</span>` : ""}
      <div class="tb-tt"><small>${esc(nfo.section || "Адмінка")}</small><b>${esc(title)}</b></div>
    </div>
    <div class="tb-spacer"></div>
    <div id="topbar-extras" class="tb-extras"></div>
    <button type="button" class="tb-icon tb-bell" id="tb-bell" aria-label="Сигнали" title="Сигнали" aria-haspopup="dialog" aria-expanded="false">${ICONS.bell}<span class="badge" id="tb-bell-n" hidden></span></button>
  </header>`;
}

// Заголовок сторінки, що повторює шлях зверху («Розділ / Сторінка»), лишаємо лише для читачів з екрана
function plainTitle(t){ return String(t || "").toLowerCase().replace(/[^a-zа-яіїєґ0-9]+/gi, " ").replace(/\s+/g, " ").trim(); }
function dedupeTitle(){
  const cur = plainTitle(document.querySelector(".tb-tt b")?.textContent);
  if (!cur) return;
  document.querySelectorAll("#admin-content h1").forEach(h => {
    const t = plainTitle(h.textContent);
    h.classList.toggle("tb-h1-dup", !!t && (t === cur || t.startsWith(cur + " ") || cur.startsWith(t + " ")));
  });
}

// ─── Шаблон сторінки ────────────────────────────────────────────────────────
//
// Кожна .html має містити (МІНІМУМ):
//
//  <body>
//    <div id="admin-loader"><div class="spin"></div></div>
//    <div id="admin-root"></div>     ← сюди вставляється sidebar + main
//    <div id="admin-modals"></div>   ← модалки
//    <div id="admin-toast" class="toast"></div>
//    <script type="module" src="./your-page.js"></script>
//  </body>
//
// Сторінка ВСЕРЕДИНІ свого скрипта робить:
//   const { _user } = await initAdminShell({
//     activeId: "overview",
//     crumbs: ["Огляд"],
//     content: "<div>...your content with elements...</div>"
//   });

// ─── Дзвіночок: сигнали + нові проблеми ─────────────────────────────────────
const _bell = { bugs: 0, notices: [], names: {} };
const _nLabel = { maxTests: "тестів", maxActiveLinks: "активних посилань", aiPerMonth: "AI-запитів на місяць" };
const _fLabel = { comments: "коментарі студентам", analysis: "розбір помилок", generation: "генерація питань", textcheck: "перевірка відповідей", mail: "листи й розсилки" };
function noticeLine(n){
  const who = `<b>${esc(n.name || _bell.names[n.uid] || "Викладач")}</b>`;
  if (n.type === "limit") return n.level >= 100 ? `${who} досяг ліміту ${_nLabel[n.key] || esc(n.key)}: ${Number(n.limit) || 0}` : `${who} використав ${Number(n.used) || 0} з ${Number(n.limit) || 0} ${_nLabel[n.key] || esc(n.key)}`;
  if (n.type === "aierr") return `Часті помилки AI у ${who}: ${_fLabel[n.feature] || esc(n.feature)}`;
  return esc(n.text || "Сигнал");
}
function renderBell(){
  const unread = _bell.notices.filter(n => !n.readAt).length;
  const t = document.getElementById("tb-bell-n"), total = _bell.bugs + unread;
  if (t){ t.textContent = total > 99 ? "99+" : String(total || ""); t.hidden = !total; }
  document.getElementById("tb-bell")?.setAttribute("aria-label", total ? `Сигнали: ${total}` : "Сигнали");
  if (document.getElementById("tb-pop")) fillBellPop();
}
function fillBellPop(){
  const pop = document.getElementById("tb-pop"); if (!pop) return;
  const list = _bell.notices.slice(0, 20), unread = list.filter(n => !n.readAt).length;
  // Імена для сигналів зі сторінки тесту (без імені) — підтягуємо один раз
  list.filter(n => !n.name && n.uid && !(n.uid in _bell.names)).forEach(n => { _bell.names[n.uid] = ""; get(ref(db, `users/${n.uid}`)).then(s => { const u = s.val() || {}; _bell.names[n.uid] = [u.name, u.surname].filter(Boolean).join(" ") || u.email || ""; fillBellPop(); }).catch(() => {}); });
  const ico = n => n.type === "aierr" ? '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>' : '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>';
  pop.innerHTML = `<div class="tbp-h"><b>Сигнали</b>${unread ? `<button type="button" id="tbp-read">Позначити прочитаними</button>` : ""}</div>
    <div class="tbp-l">${list.length ? list.map(n => `<a class="tbp-i${n.readAt ? "" : " new"}${n.level >= 100 || n.type === "aierr" ? " hot" : ""}" href="teachers?id=${encodeURIComponent(n.uid || "")}">
      <span class="tbp-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ico(n)}</svg></span>
      <span class="tbp-t">${noticeLine(n)}<small>${esc(formatTimeAgo(n.at))}</small></span></a>`).join("") : `<div class="tbp-e">Сигналів немає. Тут з'являться попередження про ліміти й часті помилки AI.</div>`}</div>
    <a class="tbp-f" href="problems"><span>Проблеми та звернення</span>${_bell.bugs ? `<b>${_bell.bugs} нових</b>` : "<em>нових немає</em>"}</a>`;
  document.getElementById("tbp-read")?.addEventListener("click", () => {
    const upd = {}; _bell.notices.filter(n => !n.readAt).forEach(n => { upd[`adminNotices/${n.id}/readAt`] = Date.now(); });
    update(ref(db), upd).catch(e => toast("Помилка: " + e.message, "err"));
  });
}
function toggleBellPop(){
  const btn = document.getElementById("tb-bell");
  let pop = document.getElementById("tb-pop");
  if (pop){ pop.remove(); btn?.setAttribute("aria-expanded", "false"); return; }
  pop = document.createElement("div"); pop.id = "tb-pop"; pop.className = "tb-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Сигнали");
  document.body.appendChild(pop); fillBellPop();
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom + 8) + "px";
  pop.style.right = Math.max(8, innerWidth - r.right) + "px";
  btn.setAttribute("aria-expanded", "true");
  const close = e => { if (e.type === "keydown" && e.key !== "Escape") return; if (e.type === "click" && (pop.contains(e.target) && !e.target.closest("a"))) return;
    pop.remove(); btn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  setTimeout(() => { document.addEventListener("click", close); document.addEventListener("keydown", close); });
}

export async function initAdminShell({ activeId, crumbs, content, topbarRight }){
  // Auth
  const _user = getCurrentUser();
  if (!_user){
    location.href = "admin-login";
    throw new Error("not authenticated");
  }

  // Render shell
  const root = document.getElementById("admin-root");
  if (!root){
    console.error("admin-root not found in DOM");
    return null;
  }

  await ensureAdminNav();
  window.AdminNav?.ensure();
  window.AdminNav?.setActive(activeId);
  window.AdminNav?.setUser(_user);

  root.innerHTML = `
    <div class="app">
      <main class="main">
        ${renderTopbar(activeId, crumbs)}
        <div class="content" id="admin-content">${content || ""}</div>
      </main>
    </div>
  `;

  // Дії сторінки у верхній панелі
  const extras = document.getElementById("topbar-extras");
  if (extras){
    extras.innerHTML = topbarRight || ""; extras.hidden = !topbarRight;
    // На телефоні кнопки показуються іконками — підпис переносимо в aria-label і підказку
    extras.querySelectorAll(".tb-btn").forEach(b => {
      const t = b.textContent.replace(/\s+/g, " ").trim();
      if (t && !b.getAttribute("aria-label")) b.setAttribute("aria-label", t);
      if (t && !b.title) b.title = t;
    });
  }

  // Дублі заголовків: стежимо й за пізнішими перемальовками вмісту
  dedupeTitle();
  const contentEl = document.getElementById("admin-content");
  if (contentEl) new MutationObserver(dedupeTitle).observe(contentEl, { childList: true, subtree: true, characterData: true });

  // Expose user globally
  window._user = _user;
  window.doLogout = doLogout;

  // Safety timeout: якщо за 15с сторінка не приховала loader — приховуємо самі
  // (захист від зависань на повільному з'єднанні / помилках у renderAll)
  setTimeout(() => {
    const ld = document.getElementById("admin-loader");
    if (ld && ld.style.display !== "none") {
      console.warn("[admin-shell] Loader auto-hidden by safety timeout (15s)");
      hideLoader();
    }
  }, 15000);

  // Realtime: нові проблеми + сигнали (ліміти, помилки AI) → дзвіночок
  const { onValue, ref: dbRef } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
  onValue(dbRef(db, "bugReports"), snap => {
    _bell.bugs = snap.exists() ? Object.values(snap.val()).filter(p => p.status === "new").length : 0;
    window.AdminNav?.setBadge(_bell.bugs);
    renderBell();
  });
  onValue(dbRef(db, "adminNotices"), snap => {
    _bell.notices = Object.entries(snap.val() || {}).map(([id, n]) => ({ id, ...n })).filter(n => n && n.at).sort((a, b) => b.at - a.at);
    renderBell();
  }, () => {});
  document.getElementById("tb-bell")?.addEventListener("click", e => { e.stopPropagation(); toggleBellPop(); });

  return { _user };
}

// ─── Loader control ─────────────────────────────────────────────────────────
// Сторінки явно викликають hideLoader() після першого рендеру даних.
// Це треба щоб людина не бачила порожні картки/таблиці поки тягнуться дані.

export function hideLoader(){
  const ld = document.getElementById("admin-loader");
  if (!ld) return;
  if (ld.style.display === "none") return;
  ld.style.opacity = "0";
  setTimeout(() => { ld.style.display = "none"; }, 250);
}

export function showLoader(){
  const ld = document.getElementById("admin-loader");
  if (!ld) return;
  ld.style.display = "";
  // Force reflow перед opacity → плавний fade-in
  void ld.offsetHeight;
  ld.style.opacity = "1";
}

// Експортуємо у window щоб inline-onclick могли використати
window.hideLoader = hideLoader;
window.showLoader = showLoader;

// ─── loadAll: спільний завантажувач даних викладачів (overview/teachers/stats) ──

// ─── Швидкість: кеш між сторінками + один запит замість кількох однакових ───
// Огляд, статистика й викладачі показують збережені дані одразу (якщо їм
// < 30 хв), а свіжі підтягують у фоні. У кеш і в пам'ять ідуть лише ті поля
// спроб, які потрібні графікам — без відповідей і питань.
const CACHE_KEY = "qf_adm_teachers_v3";   // v3: легкі дані з attemptLog/gameLog
const slimAttempt = (a, teacherId, teacherName) => ({
  createdAt: a.createdAt || 0, finishedAt: a.finishedAt || 0, startedAt: a.startedAt || 0, lastSeen: a.lastSeen || 0,
  status: a.status || "", grade12: a.grade12 ?? null, testId: a.testId || "", teacherId, teacherName,
});
function publish(d){
  window._users = d._users; window._stats = d._stats; window._allAttempts = d._allAttempts; window._allGames = d._allGames;
  return d;
}
export function cachedTeachers(maxAgeMs = 30 * 60e3){
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!c || !Array.isArray(c._users) || Date.now() - c.at > maxAgeMs) return null;
    return publish({ ...c, _liveNow: [], cached: true });
  } catch { return null; }
}
let _inflight = null;
export function loadAllTeachers(){
  if (_inflight) return _inflight;
  _inflight = _loadAllFresh().then(d => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), _users: d._users, _stats: d._stats, _allAttempts: d._allAttempts, _allGames: d._allGames })); }
    catch { try { localStorage.removeItem(CACHE_KEY); } catch {} }   // переповнено — просто без кешу
    return publish(d);
  }).finally(() => { _inflight = null; });
  return _inflight;
}

async function _loadAllFresh(){
  const snap = await get(ref(db, "users"));
  if (!snap.exists()) return { _users: [], _stats: {}, _allAttempts: [], _allGames: [], _liveNow: [] };

  const _users = Object.entries(snap.val())
    .filter(([id,u]) => u && typeof u === "object")
    .map(([id,u]) => ({ id, ...u }));

  const _allAttempts = [];
  const _allGames = [];      // історія ігор наживо всіх викладачів
  const _liveRooms = [];     // коди кімнат, які викладачі тримають відкритими
  const _stats = {};
  const opt = p => get(ref(db, p)).catch(() => null);   // нова гілка може бути закрита правилами — не валимо сторінку

  const weekAgo = Date.now() - 7 * 864e5;
  await Promise.all(_users.map(async u => {
    const tName = (u.surname ? u.surname + " " + u.name : u.name) || u.email || "";
    // Легкий шлях: готові лічильники й журнали, які веде панель викладача (shared/admin-index.js).
    // Якщо панель ще не заповнила їх (викладач не заходив після оновлення) — старий повний шлях.
    const [tsS, alS, glS, lr] = await Promise.all([opt(`teacherStats/${u.id}`), opt(`attemptLog/${u.id}`), opt(`gameLog/${u.id}`), opt(`teachers/${u.id}/liveRooms`)]);
    const ts0 = tsS?.val();
    if (lr?.exists()) Object.keys(lr.val()).forEach(code => _liveRooms.push({ code, teacherId: u.id, teacherName: tName }));
    let atArr, games, base;
    if (ts0?.logReady){
      atArr = Object.values(alS?.val() || {}).filter(x => x && typeof x === "object").map(x => ({
        createdAt: Number(x.c) || 0, finishedAt: Number(x.f) || 0, startedAt: Number(x.c) || 0, lastSeen: Number(x.l) || 0,
        status: x.s || "", grade12: x.g ?? null, testId: "", teacherId: u.id, teacherName: tName }));
      base = { tests: ts0.tests || 0, activeTests: ts0.activeTests || 0, students: ts0.students || 0, links: ts0.links || 0, testsLive: ts0.testsLive || 0, activeLinks: ts0.activeLinks || 0 };
    } else {
      const [ts, as, ss, ls] = await Promise.all([`tests`, `attempts`, `students`, `links`].map(p => get(ref(db, `teachers/${u.id}/${p}`))));
      atArr = (as.exists() ? Object.values(as.val()) : []).filter(a => a && typeof a === "object").map(a => slimAttempt(a, u.id, tName));
      const tv = ts.exists() ? Object.values(ts.val()) : [], lv = ls.exists() ? Object.values(ls.val()) : [];
      base = { tests: tv.length, activeTests: tv.filter(t => t?.status === "active").length, students: ss.exists() ? Object.keys(ss.val()).length : 0, links: lv.length,
        testsLive: tv.filter(t => t && t.status !== "archived").length, activeLinks: lv.filter(l => l && l.status === "active" && !(l.closeAt && l.closeAt <= Date.now())).length };
    }
    if (ts0?.gameLogReady){
      games = Object.entries(glS?.val() || {}).filter(([, g]) => g && typeof g === "object").map(([code, g]) => ({
        code, teacherId: u.id, teacherName: tName, title: g.t || "Без назви", testId: g.id || "", playedAt: Number(g.p) || 0, players: Number(g.n) || 0, questions: Number(g.q) || 0 }));
    } else {
      const gh = await opt(`teachers/${u.id}/gameHistory`);
      games = gh?.exists() ? Object.entries(gh.val()).filter(([, g]) => g && typeof g === "object").map(([code, g]) => ({
        code, teacherId: u.id, teacherName: tName, title: g.testTitle || "Без назви", testId: g.testId || "",
        playedAt: Number(g.playedAt) || 0, players: Number(g.playerCount) || (Array.isArray(g.results) ? g.results.length : Object.keys(g.results || {}).length),
        questions: Number(g.questionCount) || 0,
      })) : [];
    }
    _allAttempts.push(...atArr);
    _allGames.push(...games);
    const lastAct = atArr.reduce((m, a) => Math.max(m, a.createdAt || 0), 0);
    _stats[u.id] = {
      ...base,
      attempts: atArr.length,
      weekAttempts: atArr.filter(a => (a.createdAt || 0) >= weekAgo).length,
      games: games.length,
      gamePlayers: games.reduce((s, g) => s + g.players, 0),
      weekGames: games.filter(g => g.playedAt >= weekAgo).length,
      lastAct: games.reduce((m, g) => Math.max(m, g.playedAt), lastAct),
    };
  }));

  // Які з відкритих кімнат справді йдуть зараз (статус і кількість гравців)
  // Лише статус, назва й гравці — без відповідей усієї кімнати
  await Promise.all(_liveRooms.map(async r => {
    const [st, tt, pl] = await Promise.all([opt(`rooms/${r.code}/status`), opt(`rooms/${r.code}/testTitle`), opt(`rooms/${r.code}/players`)]);
    r.status = st?.val() || null;
    r.title = tt?.val() || "";
    r.players = pl?.exists() ? Object.keys(pl.val()).length : 0;
  }));
  const liveNow = _liveRooms.filter(r => ["lobby", "question", "paused", "reveal"].includes(r.status));

  return { _users, _stats, _allAttempts, _allGames, _liveNow: liveNow };
}

// Оголосити утіли як глобальні (для inline onclick=)
window.openModal = openModal;
window.closeModal = closeModal;
window.toast = toast;
