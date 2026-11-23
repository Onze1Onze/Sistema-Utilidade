import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONDITION_PRESETS } from "../src/conditions.js";

const source = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/conditions.js", import.meta.url), "utf8");

test("o seletor apresenta as 17 condições predefinidas como opções clicáveis", () => {
  assert.equal(CONDITION_PRESETS.length, 17);
  assert.match(source, /CONDITION_PRESETS\.map\(\(preset\)/);
  assert.match(source, /data-action="apply-preset-condition"/);
  assert.match(source, /data-condition=/);
  for (const condition of CONDITION_PRESETS) {
    assert.ok(catalog.includes(\`name: "\${condition.name}"\`), \`A condição \${condition.name} deve existir no catálogo predefinido.\`);
  }
});

test("clicar em uma opção aplica imediatamente a condição selecionada e fecha a lista", () => {
  assert.match(source, /const name = control\.dataset\.condition;/);
  assert.match(source, /applyPresetCondition\(record, name\)/);
  assert.match(source, /state\.modal = null;/);
});

test("não existe mais interface para escrever condições ou modificadores manualmente", () => {
  for (const forbidden of ["submit-condition", "condition-modifiers", "condition-name", "condition-description", "custom-condition-details", "condition-preset-duration"]) {
    assert.equal(source.includes(forbidden), false, \`A interface não deve conter \${forbidden}.\`);
  }
  assert.match(source, /data-action="remove-condition"/);
});
