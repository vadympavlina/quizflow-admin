# QuizFlow Admin (адмін-панель)

Піддомен: **admin.quizflow.space**. Адмін-панель: огляд, статистика, проблеми, журнал дій, викладачі, ролі, можливості, запрошення, оголошення, розсилки, новини, навігація, AI, Telegram, обслуговування. Має власний вхід (`admin-login`).

Статичний сайт (без збірки) на GitHub Pages. Правила роботи з кодом — у [CLAUDE.md](CLAUDE.md), тести — у [tests/README.md](tests/README.md).

## Як підключити домен
1. DNS: `CNAME` запис `admin` → `vadympavlina.github.io`.
2. GitHub: Settings → Pages → Source: **GitHub Actions**; Custom domain: `admin.quizflow.space`; увімкнути Enforce HTTPS.
3. Firebase Console → Authentication → Settings → Authorized domains: додати `admin.quizflow.space`.
