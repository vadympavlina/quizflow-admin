// ═══════════════════════════════════════════════════════════════════════
// shared/notices.js — сигнали для адміністратора (дзвіночок в адмінці + Telegram).
// adminNotices/{ключ}: ключ однозначний (місяць + викладач + подія), тож кожна подія
// фіксується рівно один раз — правила не дають перезаписати наявний сигнал.
// Будь-яка помилка тут тиха: сигнал не повинен ламати саму дію викладача.
// ═══════════════════════════════════════════════════════════════════════
import { ref, get, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const LIMIT_LABEL = { maxTests: "тестів", maxActiveLinks: "активних посилань", aiPerMonth: "AI-запитів на місяць" };
const FEAT_LABEL = { comments: "коментарі студентам", analysis: "розбір помилок", generation: "генерація питань", textcheck: "перевірка відповідей", mail: "листи й розсилки" };
const monthKey = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;

export function noticeText(n, name){
  const who = name || n.name || "Викладач";
  if (n.type === "limit") return n.level >= 100
    ? `${who} досяг ліміту ${LIMIT_LABEL[n.key] || n.key}: ${n.limit}`
    : `${who} використав ${n.used} з ${n.limit} ${LIMIT_LABEL[n.key] || n.key} (80%)`;
  if (n.type === "aierr") return `Часті помилки AI у ${who}: ${FEAT_LABEL[n.feature] || n.feature}, ${n.errors} помилок цього місяця`;
  return n.text || "Сигнал";
}

// Telegram: токен бота лежить у воркері, браузер його не бачить. Воркер сам будує текст з перевірених полів.
async function sendTelegram(db, noticeKey, data){
  try {
    const url = String((await get(ref(db, "settings/mail/workerUrl"))).val() || "").replace(/\/+$/, "");
    if (!url) return;
    const headers = { "Content-Type": "application/json" };
    const user = getApps().length ? getAuth(getApps()[0]).currentUser : null;
    if (user) headers.Authorization = "Bearer " + await user.getIdToken();
    await fetch(url + "/telegram/notice", { method: "POST", headers, body: JSON.stringify({
      key: noticeKey, type: data.type, uid: data.uid, limitKey: data.key, level: data.level, used: data.used, limit: data.limit, feature: data.feature, errors: data.errors,
    }) });
  } catch {}
}

// Створює сигнал, якщо його ще немає. data: {type, uid, …}
export async function raiseNotice(db, key, data){
  try {
    let name = data.name || null;
    if (!name){ try { const u = (await get(ref(db, `users/${data.uid}`))).val(); name = [u?.name, u?.surname].filter(Boolean).join(" ") || u?.email || null; } catch {} }
    await set(ref(db, `adminNotices/${key}`), { ...data, name, at: serverTimestamp() });   // уже є — правила відхилять
    sendTelegram(db, key, data);
  } catch {}
}

// Ліміт: 80% — попередження, 100% — досягнуто. current — скільки вже є (до нової дії).
export function limitNotice(db, uid, key, current, limit, name){
  if (!db || !uid || !limit) return;
  const level = current >= limit ? 100 : current + 1 >= Math.ceil(limit * .8) ? 80 : 0;
  if (!level) return;
  const scope = key === "aiPerMonth" ? monthKey() : "all";
  raiseNotice(db, `${scope}_${uid}_lim_${key}_${limit}_${level}`, { type: "limit", uid, key, level, used: Math.min(current + (level < 100 ? 1 : 0), limit), limit, name: name || null });
}

// Помилки AI: сигнал, коли за місяць набирається 5 помилок функції
export function aiErrorNotice(db, uid, feature, errors){
  if (!db || !uid || errors !== 5) return;
  raiseNotice(db, `${monthKey()}_${uid}_aierr_${feature}`, { type: "aierr", uid, feature, errors });
}
