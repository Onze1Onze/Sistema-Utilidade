import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test("ficha renderiza actions.agredir junto dos ataques normais", () => {
  assert.ok(main.includes("c.actions?.agredir"));
  assert.ok(main.includes("data-source="));
  assert.ok(main.includes('control.dataset.source === "agredir"'));
});

test("ficha mostra DT, teste de resistência e damageDice das habilidades", () => {
  assert.ok(main.includes("ability.damageDice"));
  assert.ok(main.includes("ability.dt"));
  assert.ok(main.includes("ability.savingThrow"));
  assert.ok(main.includes("use-ability-damage"));
});
