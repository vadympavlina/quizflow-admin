// ═══════════════════════════════════════════════════════════════════════
// shared/access-notify.js — сповіщення викладачу, що йому змінили доступ.
// Повертає шляхи для update(ref(db), …), тож лягає в той самий атомарний запис, що й сама зміна.
// nid: однаковий nid перезаписує попереднє сповіщення, тому серія кліків дає одне повідомлення.
// ═══════════════════════════════════════════════════════════════════════
export const hourKey = () => Math.floor(Date.now() / 36e5);
export function accessNotice(uids, nid, msg, title = "Змінено ваш доступ") {
  const out = {};
  [...new Set(uids)].filter(Boolean).forEach(uid => {
    out[`teachers/${uid}/notifications/${nid}`] = { type: "access", title, msg, read: false, ts: Date.now() };
  });
  return out;
}
