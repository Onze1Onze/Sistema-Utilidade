import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test("ficha renderiza actions.agredir junto dos ataques normais", () => {
  assert.match(main, /c\.actions\?\.agredir/);
  assert.match(main, /data-source=/);
  assert.match(main, /data-source === "agredir"/);
});

test("ficha mostra DT, teste de resistência e damageDice das habilidades", () => {
  assert.match(main, /ability\.damageDice/);
  assert.match(main, /ability\.dt/);
  assert.match(main, /ability\.savingThrow/);
  assert.match(main, /use-ability-damage/);
});
