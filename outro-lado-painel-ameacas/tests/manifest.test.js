import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("manifesto é JSON válido e aponta para arquivos da extensão", async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.name, "Outro Lado — Painel de Ameaças");
  assert.equal(manifest.version, "1.2.0");
  assert.match(manifest.icon, /^https:\/\/raw\.githack\.com\//);
  assert.match(manifest.action.icon, /^https:\/\/raw\.githack\.com\//);
  assert.match(manifest.action.popover, /^https:\/\/raw\.githack\.com\//);
  for (const localPath of ["index.html", "styles.css", "icon.svg", "src/main.js", "src/conditions.js", "assets/elements/sangue.svg", "assets/elements/morte.svg", "assets/elements/conhecimento.svg", "assets/elements/energia.svg", "assets/elements/medo.svg"]) {
    await access(resolve(ROOT, localPath));
  }
});

test("HTML não força o carregamento do SDK por um único CDN", async () => {
  const html = await readFile(resolve(ROOT, "index.html"), "utf8");
  assert.match(html, /src="\.\/src\/main\.js"/);
  assert.doesNotMatch(html, /modulepreload[^>]+cdn\.jsdelivr\.net/);
});
