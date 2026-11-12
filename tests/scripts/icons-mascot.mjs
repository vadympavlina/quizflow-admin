// Іконки адмінки з талісмана (assets/icons/admin/mascot.webp, прозорий фон).
// Запуск: cd tests && npm run icons:mascot  (PW_CHROMIUM=/шлях/до/chromium, якщо браузер не стандартний)
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = new URL("../../assets/icons/admin/", import.meta.url);
const ROOT = new URL("../../", import.meta.url);
const src = "data:image/webp;base64," + fs.readFileSync(new URL("mascot.webp", OUT)).toString("base64");
const BG = ["#F1EBFF", "#DCCDFF"]; // світлий градієнт під колір персонажа, талісман цілком у рамці

const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const p = await b.newPage();
await p.goto("about:blank");
async function render(size, bg, scale, type = "image/png", q, bottom = false, round = false) {
  const url = await p.evaluate(async ({ src, size, bg, scale, type, q, bottom, round }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = size;
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
    if (round) { x.beginPath(); x.roundRect(0, 0, size, size, size * 0.22); x.clip(); } // закруглені краї; apple-touch і maskable лишаються квадратними: їх округлює система
    if (bg) { const g = x.createLinearGradient(0, 0, 0, size); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]); x.fillStyle = g; x.fillRect(0, 0, size, size); }
    const k = size * scale / Math.max(img.width, img.height), w = img.width * k, h = img.height * k;
    x.drawImage(img, (size - w) / 2, bottom || bg ? size - h : (size - h) / 2, w, h); // бюст обрізаний знизу — притискаємо до низу
    return c.toDataURL(type, q);
  }, { src, size, bg, scale, type, q, bottom, round });
  return Buffer.from(url.split(",")[1], "base64");
}
function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = 6 + pngs.length * 16; const dir = [], body = [];
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16); e[0] = size; e[1] = size; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(off, 12);
    dir.push(e); body.push(buf); off += buf.length;
  }
  return Buffer.concat([head, ...dir, ...body]);
}
fs.writeFileSync(new URL("favicon.ico", OUT), ico(await Promise.all([16, 32, 48].map(async s => ({ size: s, buf: await render(s, BG, 0.97, "image/png", undefined, false, true) })))));
fs.writeFileSync(new URL("apple-touch-icon.png", OUT), await render(180, BG, 0.97));
fs.writeFileSync(new URL("icon-192.png", OUT), await render(192, BG, 0.97, "image/png", undefined, false, true));
fs.writeFileSync(new URL("icon-512.png", OUT), await render(512, BG, 0.97, "image/png", undefined, false, true));
fs.writeFileSync(new URL("icon-maskable-512.png", OUT), await render(512, BG, 0.8, "image/png", undefined, true));
fs.writeFileSync(new URL("owl.webp", OUT), await render(160, null, 1, "image/webp", 0.92)); // логотип у меню
const svgPng = (await render(256, BG, 0.97, "image/png", undefined, false, true)).toString("base64");
fs.writeFileSync(new URL("icon.svg", OUT), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,${svgPng}"/></svg>\n`);
fs.copyFileSync(new URL("favicon.ico", OUT), new URL("favicon.ico", ROOT));
fs.copyFileSync(new URL("apple-touch-icon.png", OUT), new URL("apple-touch-icon.png", ROOT));
await b.close();
console.log("готово: assets/icons/admin (favicon, apple, 192/512, maskable, icon.svg, owl.webp)");
