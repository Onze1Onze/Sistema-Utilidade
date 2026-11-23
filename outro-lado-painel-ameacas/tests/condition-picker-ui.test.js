import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONDITION_PRESETS } from "../src/conditions.js";

const source = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/conditions.js", import.meta.url), "utf8");

test("o seletor apresenta as 17 condições predefinidas como opções clicáveis", () => {
  assert.equal(CONDITION_PRESETS.length, 17);
  assert.ok(source.includes("CONDITION_PRESETS.map((preset)"));
  assert.ok(source.includes('data-action="apply-preset-condition"'));
  assert.ok(source.includes("data-condition="));
  for (const condition of CONDITION_PRESETS) {
    assert.ok(catalog.includes('name: "' + condition.name + '"'), "A condição " + condition.name + " deve existir no catálogo predefinido.");
  }
});

test("clicar em uma opção aplica imediatamente a condição selecionada e fecha a lista", () => {
  assert.ok(source.includes("const name = control.dataset.condition;"));
  assert.ok(source.includes("applyPresetCondition(record, name)"));
  assert.ok(source.includes("state.modal = null;"));
});

test("não existe mais interface para escrever condições ou modificadores manualmente", () => {
  for (const forbidden of ["submit-condition", "condition-modifiers", "condition-name", "condition-description", "custom-condition-details", "condition-preset-duration"]) {
    assert.equal(source.includes(forbidden), false, "A interface não deve conter " + forbidden + ".");
  }
  assert.ok(source.includes('data-action="remove-condition"'));
});
