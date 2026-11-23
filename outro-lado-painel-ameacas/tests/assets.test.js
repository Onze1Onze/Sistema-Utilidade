import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

test("todos os imports relativos de JavaScript apontam para arquivos existentes", async () => {
  const jsFiles = await walk(ROOT);
  const missing = [];
  for (const file of jsFiles) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.\.?\/[^"']+)["']/g)) {
      const target = resolve(dirname(file), match[1]);
      try { await access(target); }
      catch { missing.push(`${relative(ROOT, file)} -> ${match[1]}`); }
    }
  }
  assert.deepEqual(missing, []);
});
