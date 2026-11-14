// ═══════════════════════════════════════════════════════════════════════
// shared/ai-call.js — один виклик AI для панелі й адмінки.
// Провайдер (Groq або Google AI Studio) і модель обираються в адмінці → AI
// (settings/ai), для кожної функції окремо; якщо для обраного немає ключа —
// береться інший. Повертає { text, data } (data — сира відповідь, для токенів).
// ═══════════════════════════════════════════════════════════════════════
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── AI через воркер ────────────────────────────────────────────────────────
// Коли власник у адмінці → AI налаштування ввімкнув «Ключі у воркері» (settings/ai/viaWorker), браузер
// ключів не бачить: запит іде у воркер, який сам перевіряє дозвіл, ліміт і веде облік (worker/src/ai.js).
let _workerUrl;
async function workerUrl(db) {
  if (_workerUrl === undefined) {
    _workerUrl = (async () => {
      try {
        const [on, url] = await Promise.all([get(ref(db, "settings/ai/viaWorker")), get(ref(db, "settings/mail/workerUrl"))]);
        const u = String(url.val() || "").replace(/\/+$/, "");
        return on.val() === true && u ? u : "";
      } catch { return ""; }
    })();
  }
  return _workerUrl;
}
export async function workerAI(url, messages, { maxTokens, temp, feature = "analysis", system, json = false, as } = {}) {
  const headers = { "Content-Type": "application/json" };
  const user = getApps().length ? getAuth(getApps()[0]).currentUser : null;
  if (user) headers.Authorization = "Bearer " + await user.getIdToken();
  let res;
  try {
    res = await fetch(url + "/ai", { method: "POST", headers, body: JSON.stringify({ feature, messages, maxTokens, temp, json, ...(system ? { system } : {}), ...(as ? { as } : {}) }) });
  } catch { throw Object.assign(new Error("Не вдалося зв'язатися з сервером AI. Перевірте інтернет."), { viaWorker: false }); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error || `AI: помилка ${res.status}`), { code: d.code, viaWorker: true });
  // data — у тому ж вигляді, що в провайдера, тож tokensOf() працює однаково; _worker: облік уже веде воркер
  return { text: d.text || "", data: { usage: { total_tokens: d.tokens || 0 }, _worker: true } };
}

const UA = "Ти — розумний асистент викладача. ОБОВ'ЯЗКОВО відповідай ВИКЛЮЧНО українською мовою. Жодних інших мов. Якщо щось не знаєш українською — все одно пиши по-українськи.";

export async function callAIRaw(db, messages, { maxTokens = 800, temp = 0.5, feature = "analysis", system = UA, json = false } = {}) {
  const wurl = await workerUrl(db);
  if (wurl) return workerAI(wurl, messages, { maxTokens, temp, feature, system: system === UA ? undefined : system, json });
  const snap = await get(ref(db, "settings/ai"));
  const s = snap.exists() ? snap.val() : {};
  const geminiKey = s.geminiApiKey || (s.provider === "gemini" ? s.apiKey : "") || "";
  const groqKeyCfg = s.groqApiKey || (s.provider !== "gemini" ? s.apiKey : "") || "";
  const want = (s.featProviders && s.featProviders[feature]) || s.provider || "groq";
  const provider = want === "gemini" ? (geminiKey || !groqKeyCfg ? "gemini" : "groq") : (groqKeyCfg || !geminiKey ? "groq" : "gemini");

  if (provider === "gemini") {
    const key = geminiKey;
    const model = s.geminiModel || "gemini-2.5-flash";
    if (!key) throw new Error("AI не налаштовано: немає ключа (адмінка → AI)");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        // Для flash-моделей Gemini 2.5 вимикаємо «думання», щоб воно не з'їдало ліміт токенів відповіді
        generationConfig: { maxOutputTokens: maxTokens, temperature: temp, ...(json ? { responseMimeType: "application/json" } : {}), ...(/flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
      }),
    });
    const raw = await res.text();
    let d;
    try { d = JSON.parse(raw); } catch { throw new Error("Gemini: невалідна відповідь — " + raw.substring(0, 200)); }
    if (d.error) throw new Error("Gemini: " + (d.error.message || JSON.stringify(d.error)));
    return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || "", data: d };
  }
  const key = groqKeyCfg;
  if (!key) throw new Error("AI не налаштовано: немає ключа Groq (адмінка → AI)");
  const model = s.groqModel || (s.provider !== "gemini" && s.model) || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages], max_tokens: maxTokens, temperature: temp, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return { text: d.choices?.[0]?.message?.content || "", data: d };
}
