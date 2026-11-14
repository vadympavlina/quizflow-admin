// Прев'ю посилань: кожна сторінка (крім 404) має повні мета-теги Open Graph і Twitter, а картинка, на яку вони вказують,
// лежить у репозиторії, має розмір 1200×630 і не важить понад 300 КБ (WhatsApp не показує важчі).
// Картинки генерує репозиторій quizflow (cd tests && npm run og); після їх зміни піднімайте ?v= в og:image / twitter:image
// усіх сторінок, бо месенджери кешують прев'ю за адресою.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const host = fs.readFileSync(path.join(ROOT, "CNAME"), "utf8").trim();
const pages = [...fs.readdirSync(ROOT).filter(f => f.endsWith(".html")), ...(fs.existsSync(path.join(ROOT, "live")) ? fs.readdirSync(path.join(ROOT, "live")).filter(f => f.endsWith(".html")).map(f => "live/" + f) : [])]
  .filter(f => f !== "404.html");

// Розмір JPEG зі службового блоку SOF (без залежностей)
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("це не JPEG");
  for (let i = 2; i < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("у JPEG немає SOF");
}

test("усі картинки assets/og: JPEG 1200×630 до 300 КБ", () => {
  const dir = path.join(ROOT, "assets/og");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".jpg"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    expect(jpegSize(buf), f).toEqual({ w: 1200, h: 630 });
    expect(buf.length, `${f}: ${Math.round(buf.length / 1024)} КБ`).toBeLessThanOrEqual(300 * 1024);
  }
});

for (const page of pages) {
  test(`прев'ю посилання: ${page} має повні теги, а картинка існує`, () => {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    const meta = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];
    for (const k of ["og:type", "og:site_name", "og:title", "og:image:alt"]) expect(meta("property", k), `${page}: ${k}`).toBeTruthy();
    expect(meta("property", "og:description") || meta("name", "description"), `${page}: опис`).toBeTruthy();
    const img = meta("property", "og:image");
    expect(img, `${page}: og:image абсолютна адреса з ?v=`).toMatch(new RegExp(`^https://${host.replace(/\./g, "\\.")}/assets/og/[a-z]+\\.jpg\\?v=\\d+$`));
    expect(meta("name", "twitter:image"), `${page}: twitter:image збігається з og:image`).toBe(img);
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    // картинка, на яку вказує адреса, лежить у репозиторії
    const file = path.join(ROOT, new URL(img).pathname);
    expect(fs.existsSync(file), `${page}: файл ${new URL(img).pathname}`).toBe(true);
  });
}
