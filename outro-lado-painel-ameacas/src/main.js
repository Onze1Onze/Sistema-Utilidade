import { loadOwlbearSDK } from "./sdk-loader.js";
import {
  createThreatTemplate, normalizeThreatPayload, exportThreatRecord, computeEffectiveStats,
  removeCondition, changeHitPoints, changeResource, applyTypedDamage, getFastHealing, DAMAGE_TYPES,
  pushHistory, pushRollHistory, ThreatValidationError
} from "./threat-engine.js";
import { CONDITION_PRESETS, applyPresetCondition, getConditionEscalation, getSkillTestRestriction, canPerformAction, canUseAttackWhileGrappled } from "./conditions.js";
import { rollAttack, rollAbility, rollStandalone, rollSkillTest, rollDamageExpression, rollStat } from "./dice.js";
import { ThreatStore } from "./storage.js";

const ROOT = document.querySelector("#app");
const store = new ThreatStore();
const state = { role: null, records: [], selectedId: null, search: "", modal: null, toast: null, rollBusy: false };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function jsonText(value) { return JSON.stringify(value, null, 2); }
function selectedRecord() { return state.records.find((record) => record.id === state.selectedId) ?? null; }
function safeNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function toListText(value) {
  if (Array.isArray(value)) return value.map((entry) => typeof entry === "string" ? entry : entry?.name ?? jsonText(entry)).join(", ");
  return typeof value === "string" ? value : "";
}
function showToast(message, isError = false) {
  state.toast = { message, isError };
  render();
  window.setTimeout(() => { state.toast = null; render(); }, 2600);
}
function updateTimestamp(record) { record.updatedAt = new Date().toISOString(); return record; }
function getElementTheme(value) {
  const normalized = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("sangue")) return { className: "theme-sangue", asset: "./assets/elements/sangue.svg", label: "Sangue" };
  if (normalized.includes("morte")) return { className: "theme-morte", asset: "./assets/elements/morte.svg", label: "Morte" };
  if (normalized.includes("conhecimento")) return { className: "theme-conhecimento", asset: "./assets/elements/conhecimento.svg", label: "Conhecimento" };
  if (normalized.includes("energia")) return { className: "theme-energia", asset: "./assets/elements/energia.svg", label: "Energia" };
  if (normalized.includes("medo")) return { className: "theme-medo", asset: "./assets/elements/medo.svg", label: "Medo" };
  return { className: "theme-neutro", asset: "./assets/elements/neutro.svg", label: "Neutro" };
}
function actionBlocked(record, ability = null, options = {}) {
  return !canPerformAction(record, ability, options);
}
function attackBlocked(record, attack) {
  const rules = computeEffectiveStats(record).rules;
  return actionBlocked(record, attack) || (rules.includes("onlyLightWeapons") && !canUseAttackWhileGrappled(attack));
}
async function saveRecord(record) {
  updateTimestamp(record);
  await store.put(record);
  const index = state.records.findIndex((entry) => entry.id === record.id);
  if (index >= 0) state.records[index] = record; else state.records.push(record);
  state.selectedId = record.id;
  render();
}
async function removeRecord(id) {
  await store.delete(id);
  state.records = state.records.filter((record) => record.id !== id);
  state.selectedId = state.records[0]?.id ?? null;
  state.modal = null;
  render();
}

function render() {
  if (state.role === "PLAYER") {
    ROOT.innerHTML = `<section class="access-denied"><div class="access-card"><div class="access-icon">OL</div><h1>Acesso exclusivo do Mestre</h1><p>O Painel de Ameaças não está disponível para jogadores. Nenhuma ficha ou dado privado foi carregado nesta sessão.</p></div></section>`;
    return;
  }
  if (state.role !== "GM") {
    ROOT.innerHTML = `<div class="boot-screen"><span class="boot-mark">OL</span><span>AGUARDANDO IDENTIFICAÇÃO DO MESTRE</span></div>`;
    return;
  }

  const filtered = getFilteredRecords();
  const record = selectedRecord();
  ROOT.innerHTML = `
    <div class="app-shell">
      <aside class="rail">
        <div class="rail-head">
          <div class="wordmark"><div class="wordmark-mark">OL</div><div><div class="wordmark-name">Outro Lado</div><div class="wordmark-sub">Painel de Ameaças</div></div></div>
        </div>
        <div class="rail-tools"><input class="search-input" id="threat-search" type="search" placeholder="Buscar ameaça…" value="${escapeHtml(state.search)}" aria-label="Buscar ameaça"><button class="square-btn" data-action="new-threat" title="Criar ameaça" aria-label="Criar ameaça">+</button></div>
        <div class="threat-list">
          ${filtered.length ? filtered.map((entry) => renderThreatEntry(entry)).join("") : `<div class="condition-empty">${state.records.length ? "Nenhuma ameaça encontrada." : "Nenhuma ameaça cadastrada."}</div>`}
        </div>
        <footer class="rail-foot"><span>${state.records.length} ameaça(s)</span><span>Arquivo local</span></footer>
      </aside>
      <section class="main-area">
        <header class="topbar"><span class="topbar-title">${record ? escapeHtml(record.creature.name) : "Arquivo de Ameaças"}</span><span class="topbar-spacer"></span><span class="role-chip">Mestre · Privado</span></header>
        <div class="work-area">${record ? renderSheet(record) : renderEmptyState()}</div>
      </section>
    </div>
    ${state.modal ? renderModal(state.modal) : ""}
    ${state.toast ? `<div class="toast ${state.toast.isError ? "error" : ""}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

function getFilteredRecords() {
  const query = state.search.trim().toLocaleLowerCase("pt-BR");
  return state.records.filter((record) => !query || record.creature.name.toLocaleLowerCase("pt-BR").includes(query));
}

function renderThreatEntry(record) {
  const creature = record.creature;
  const current = record.runtime.hpCurrent;
  const max = creature.hp.max;
  const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return `<button class="threat-entry ${record.id === state.selectedId ? "active" : ""}" data-action="select-threat" data-id="${escapeHtml(record.id)}">
    <div class="entry-top"><span class="entry-name">${escapeHtml(creature.name)}</span><span class="entry-vd">VD ${escapeHtml(creature.vd)}</span></div>
    <div class="entry-meta"><span>${escapeHtml(creature.elementPrimary || creature.type || "Ameaça")}</span><span>${current}/${max} PV</span><span>DEF ${escapeHtml(creature.defense)}</span></div>
    <div class="entry-hp"><span style="width:${percent}%"></span></div>
  </button>`;
}

function renderEmptyState() {
  return `<div class="empty-state"><div class="empty-card"><div class="wordmark-mark" style="margin:0 auto 14px">OL</div><h2>Arquivo de Ameaças</h2><p>Crie uma ficha a partir do modelo JSON, importe uma ameaça existente ou mantenha várias criaturas organizadas para a sessão.</p><button class="primary-btn" data-action="new-threat">＋ Criar primeira ameaça</button><div class="private-note">Os dados ficam somente neste navegador e neste perfil de Mestre.</div></div></div>`;
}

function renderSheet(record) {
  const c = record.creature;
  const r = record.runtime;
  const stats = computeEffectiveStats(record);
  const theme = getElementTheme(c.elementPrimary);
  const hpPercent = c.hp.max ? Math.max(0, Math.min(100, r.hpCurrent / c.hp.max * 100)) : 0;
  const configuredWoundedAt = Number(c.hp.woundedAt);
  const woundedAt = c.hp.woundedAt !== null && c.hp.woundedAt !== undefined && Number.isFinite(configuredWoundedAt)
    ? configuredWoundedAt : Math.ceil(c.hp.max / 2);
  const isWounded = r.hpCurrent <= woundedAt;
  const fastHealing = getFastHealing(record);
  const attrNames = [["agi", "AGI"], ["for", "FOR"], ["int", "INT"], ["pre", "PRE"], ["vig", "VIG"]];
  const statMarkup = (stat) => {
    const value = stat.value ?? "—";
    const changed = String(stat.base) !== String(value);
    return `<span class="stat-value">${escapeHtml(value)}${changed ? `<span class="base-value">Base: ${escapeHtml(stat.base)}</span>` : ""}</span>`;
  };
  const statRoll = (label, stat, key) => {
    const expr = typeof stat.value === "string" ? stat.value.trim() : String(stat.value ?? "");
    const valid = expr && /d\d+/i.test(expr);
    return `<div class="save-line"><b>${escapeHtml(label)}</b><span>${statMarkup(stat)}</span>${valid ? `<button class="small-btn" data-action="roll-stat" data-expression="${escapeHtml(expr)}" data-title="${escapeHtml(label)}" data-stat="${escapeHtml(key)}">Rolar</button>` : ""}</div>`;
  };
  const renderTriad = (title, values) => {
    const list = toListText(values);
    return `<div class="sheet-block"><h3 class="block-title">${title}</h3>${list ? `<div class="resistance-line">${escapeHtml(list)}</div>` : `<div class="condition-empty">—</div>`}</div>`;
  };
  const currentConditions = r.conditions.map((condition) => `<div class="condition-entry"><div><div class="condition-entry-title"><b>${escapeHtml(condition.name)}</b>${condition.group ? `<span>${escapeHtml(condition.group)}</span>` : ""}</div>${condition.duration ? `<small>${escapeHtml(condition.duration)}</small>` : ""}${condition.description ? `<small>${escapeHtml(condition.description)}</small>` : ""}${condition.rules?.length ? `<small class="condition-rule-tags">${escapeHtml(condition.rules.map((rule) => ({ immobile: "Imóvel", onlyLightWeapons: "Apenas armas leves", rangedAttackMisfire50: "Ataques à distância contra alvo agarrado: 50% de chance de atingir outro alvo", cannotObserve: "Não pode observar", attacksTargetTotalConcealment: "Alvos com camuflagem total", incapacitated: "Incapacitado", cannotAct: "Não pode agir", cannotReact: "Não pode reagir", reflexesAutoFail: "Falha automática em Reflexos", cannotHear: "Não pode ouvir", ritualsPoorCondition: "Rituais em condição ruim", mentalOnly: "Apenas ações mentais", resistanceAll10: "Resistência a dano 10" }[rule] ?? rule)).join(" · "))}</small>` : ""}</div><button class="danger-btn" data-action="remove-condition" data-id="${escapeHtml(condition.id)}" title="Remover condição" aria-label="Remover condição ${escapeHtml(condition.name)}">×</button></div>`).join("");
  const attackEntries = [
    ...(c.attacks ?? []).map((attack) => ({ ...attack, source: "attacks" })),
    ...(c.actions?.agredir ?? []).map((attack) => ({ ...attack, source: "agredir" }))
  ];
  const attacks = attackEntries.length ? attackEntries.map((attack) => {
    const critical = attack.critical || (attack.criticalMargin ? `${attack.criticalMargin}/${attack.criticalMultiplier || "x2"}` : "");
    return `<div class="attack-row"><div class="attack-name-cell"><strong>${escapeHtml(attack.name || (attack.source === "agredir" ? "Agredir" : "Ataque"))}</strong><div class="attack-actions"><button data-action="roll-attack-test" data-source="${attack.source}" data-id="${escapeHtml(attack.id)}" ${attackBlocked(record, attack) ? "disabled" : ""}>Teste</button><button data-action="roll-attack-damage" data-source="${attack.source}" data-id="${escapeHtml(attack.id)}" ${!attack.damage || attackBlocked(record, attack) ? "disabled" : ""}>Dano</button></div></div><span>${escapeHtml(attack.test || "—")}</span><span>${escapeHtml(attack.damage || "—")}</span><span>${escapeHtml([critical, attack.range].filter(Boolean).join(" · ") || "—")}</span></div>`;
  }).join("") : `<div class="condition-empty">Nenhum ataque cadastrado.</div>`;
  const abilityGroups = [
    ["abilities", "Habilidade", c.abilities ?? []],
    ["powers", "Poder", c.powers ?? []],
    ["actions.other", "Outra ação", c.actions?.other ?? []],
    ["specialActions", "Ação especial", c.specialActions ?? []],
    ["reactions", "Reação", c.reactions ?? []]
  ];
  const abilityEntries = abilityGroups.flatMap(([key, label, entries]) => entries.map((ability) => ({ ...ability, groupKey: key, groupLabel: label })))
    .filter((ability) => Boolean(ability.name || ability.description || ability.damageDice || ability.roll || ability.test || ability.damage || ability.dt !== null && ability.dt !== undefined || ability.savingThrow));
  const abilities = abilityEntries.length ? abilityEntries.map((ability) => {
    const group = ability.groupKey === "actions.other" ? "actions" : ability.groupKey;
    const blocked = actionBlocked(record, ability, { isReaction: ability.groupKey === "reactions" });
    const testExpression = ability.test || (ability.rollType === "damage" ? "" : ability.roll) || "";
    const damageExpression = ability.damageDice || ability.damage || (ability.rollType === "damage" ? ability.roll : "") || "";
    const rollButtons = [
      testExpression ? `<button class="small-btn" data-action="use-ability-test" data-kind="${escapeHtml(ability.groupKey)}" data-id="${escapeHtml(ability.id)}" ${blocked ? "disabled" : ""}>Rolar teste</button>` : "",
      damageExpression ? `<button class="small-btn" data-action="use-ability-damage" data-kind="${escapeHtml(ability.groupKey)}" data-id="${escapeHtml(ability.id)}" ${blocked ? "disabled" : ""}>Rolar dano</button>` : ""
    ].join("");
    const metadata = [
      ability.dt !== null && ability.dt !== undefined ? `DT ${ability.dt}` : "",
      ability.savingThrow ? `Resistência: ${ability.savingThrow}` : "",
      ability.criticalMargin ? `Crítico ${ability.criticalMargin}/${ability.criticalMultiplier || "x2"}` : ""
    ].filter(Boolean).join(" · ");
    return `<article class="ability-card"><div class="card-head"><div><div class="card-name">${escapeHtml(ability.name || ability.groupLabel)}</div><div class="card-sub">${escapeHtml(ability.actionType || ability.groupLabel)}${metadata ? ` · ${escapeHtml(metadata)}` : ""}</div></div>${damageExpression ? `<span class="entry-vd">${escapeHtml(damageExpression)}</span>` : ""}</div><div class="card-body">${escapeHtml(ability.description || "Sem descrição.")}${ability.effects ? `<div class="card-sub">Efeitos: ${escapeHtml(typeof ability.effects === "string" ? ability.effects : JSON.stringify(ability.effects))}</div>` : ""}</div><div class="card-actions">${rollButtons || `<button class="small-btn" data-action="use-ability" data-kind="${escapeHtml(ability.groupKey)}" data-id="${escapeHtml(ability.id)}" ${blocked ? "disabled" : ""}>Consultar</button>`}</div></article>`;
  }).join("") : `<div class="condition-empty">Nenhuma habilidade, poder ou ação adicional cadastrada.</div>`;
  const resources = c.resources.length ? c.resources.map((resource) => {
    const current = r.resources[resource.id] ?? resource.current ?? resource.max ?? 0;
    const max = resource.max ?? "—";
    return `<div class="resource-card"><div class="resource-name">${escapeHtml(resource.name || "Recurso")}</div><div class="resource-count">${escapeHtml(current)} <span class="muted" style="font-size:11px">/ ${escapeHtml(max)}</span></div><div class="resource-controls"><button class="small-btn" data-action="resource-change" data-id="${escapeHtml(resource.id)}" data-amount="-1">−</button><button class="small-btn" data-action="resource-change" data-id="${escapeHtml(resource.id)}" data-amount="1">＋</button></div></div>`;
  }).join("") : `<div class="condition-empty">Nenhum recurso variável.</div>`;
  const skillMarkup = c.skills.length ? c.skills.map((skill) => {
    if (typeof skill === "string") return `<span class="skill-chip">${escapeHtml(skill)}</span>`;
    const label = [skill.name, skill.value ?? skill.test].filter(Boolean).join(" ");
    return `<span class="skill-chip">${escapeHtml(label)}</span>`;
  }).join("") : `<span class="condition-empty">—</span>`;
  const skillTestMarkup = (c.skillTests ?? []).length ? c.skillTests.map((test) => { const blocked = actionBlocked(record, test); const restriction = getSkillTestRestriction(record, test); return `<article class="skill-test-row"><div class="skill-test-main"><b>${escapeHtml(test.name)}</b><small>${escapeHtml(({ agi: "AGI", for: "FOR", int: "INT", pre: "PRE", vig: "VIG" })[test.attribute] ?? "Teste")}${test.senseUse ? ` · ${test.senseUse === "hear" ? "OUVIR" : "OBSERVAR"}` : ""}</small></div><div class="skill-test-expressions"><span>Teste: ${escapeHtml(test.test || "—")}</span><span>Dano: ${escapeHtml(test.damage || "—")}</span></div><div class="skill-test-actions"><button class="small-btn" data-action="roll-skill-test" data-id="${escapeHtml(test.id)}" ${!test.test || blocked || restriction ? "disabled" : ""}>Rolar teste</button>${test.damage ? `<button class="small-btn" data-action="roll-skill-damage" data-id="${escapeHtml(test.id)}" ${blocked || restriction ? "disabled" : ""}>Rolar dano</button>` : ""}</div>${restriction ? `<small class="skill-test-restriction">${escapeHtml(restriction)}</small>` : ""}</article>`; }).join("") : `<div class="condition-empty">Nenhum teste de perícia configurado. Use skillTests no JSON.</div>`;
  const featureMarkup = c.features.length ? c.features.map((feature) => `<div class="ability-card"><div class="card-head"><span class="card-name">${escapeHtml(typeof feature === "string" ? feature : feature.name || "Característica")}</span></div>${typeof feature === "object" && feature.description ? `<div class="card-body">${escapeHtml(feature.description)}</div>` : ""}</div>`).join("") : "";
  return `<article class="sheet ${theme.className}" data-element="${theme.label.toLowerCase()}">
    <img class="sheet-element-art" src="${theme.asset}" alt="" aria-hidden="true">
    <div class="sheet-content">
      <div class="sheet-head"><div class="name-plaque"><span class="overline">Nome da criatura</span><strong class="creature-name">${escapeHtml(c.name)}</strong></div><div class="vd-plaque"><span class="vd-value">${escapeHtml(c.vd)}</span><span class="vd-label">VALOR DE DESAFIO</span></div><div class="brand-plaque"><span>ORDEM</span><strong>PARANORMAL</strong><small>RPG · OUTRO LADO</small></div></div>
      <div class="element-row"><div class="label-line"><span class="black-label">Elemento principal</span><span class="line-value">${escapeHtml(c.elementPrimary || "—")}</span></div><div class="label-line"><span class="black-label">Elementos secundários</span><span class="line-value">${escapeHtml(toListText(c.elementsSecondary) || "—")}</span></div></div>
      <div class="presence-grid"><div class="label-line"><span class="black-label">Presença perturbadora</span><span class="line-value">DT ${escapeHtml(c.presence.dt ?? "—")}</span></div><div class="presence-item"><b>Dano mental</b>${escapeHtml(c.presence.mentalDamage || "—")} <b>NEX</b>${escapeHtml(c.presence.nex || "—")}</div></div>
      <div class="sheet-rule"></div>
      <div class="sheet-grid">
        <div class="sheet-column">
          <section class="sheet-block"><h3 class="block-title">Sentidos</h3><div class="senses-grid"><div class="sense-cell"><b>Percepção</b>${statMarkup(stats.senses.perception)}</div><div class="sense-cell"><b>Iniciativa</b>${statMarkup(stats.senses.initiative)}</div><div class="sense-cell"><b>Especiais</b><span>${escapeHtml(c.senses.special || "—")}</span></div></div><div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">${/[d]\d+/i.test(String(stats.senses.perception.value)) ? `<button class="small-btn" data-action="roll-stat" data-expression="${escapeHtml(stats.senses.perception.value)}" data-title="Percepção" data-stat="perception">Rolar percepção</button>` : ""}${/[d]\d+/i.test(String(stats.senses.initiative.value)) ? `<button class="small-btn" data-action="roll-stat" data-expression="${escapeHtml(stats.senses.initiative.value)}" data-title="Iniciativa" data-stat="initiative">Rolar iniciativa</button>` : ""}</div></section>
          <section class="sheet-block"><h3 class="block-title">Defesa e resistências</h3><div class="defense-panel"><div class="defense-number"><strong>${escapeHtml(stats.defense.value)}</strong><span>DEFESA</span>${stats.defense.value !== stats.defense.base ? `<small style="font:9px var(--sans);margin-top:4px">Base ${escapeHtml(stats.defense.base)}</small>` : ""}</div><div class="save-grid">${statRoll("Fortitude", stats.saves.fortitude, "fortitude")}${statRoll("Reflexos", stats.saves.reflexes, "reflexes")}${statRoll("Vontade", stats.saves.will, "will")}<div class="defense-situational"><span>Corpo a corpo <b>${escapeHtml(stats.defenseMelee.value)}</b></span><span>À distância <b>${escapeHtml(stats.defenseRanged.value)}</b></span></div></div></div>${stats.rules.includes("resistanceAll10") ? `<div class="condition-rule-banner">RESISTÊNCIA A DANO 10</div>` : ""}</section>
          <section class="sheet-block"><h3 class="block-title">Pontos de vida <span class="minor">${c.hp.woundedAt !== null && c.hp.woundedAt !== undefined ? `Machucado ${escapeHtml(c.hp.woundedAt)}` : ""}</span></h3><div class="hp-panel"><div class="hp-side"><strong>PV</strong><span>VIDA</span></div><div class="hp-main"><div class="hp-numbers"><strong class="hp-current ${isWounded ? "is-wounded" : ""}">${r.hpCurrent}</strong><span class="hp-max">/ ${c.hp.max} PV</span></div><div class="hp-track"><span style="width:${hpPercent}%"></span></div><div class="hp-controls"><button class="small-btn incoming-damage-btn" data-action="receive-damage">− Receber dano</button><button class="small-btn heal-life-btn" data-action="open-heal">＋ Curar vida</button>${fastHealing > 0 ? `<button class="small-btn fast-heal-btn" data-action="fast-heal">＋ Cura acelerada (${fastHealing} PV)</button>` : ""}</div></div></div></section>
          ${renderTriad("Resistências", c.resistances)}${renderTriad("Vulnerabilidades", c.vulnerabilities)}${renderTriad("Imunidades", c.immunities)}
          <section class="sheet-block"><h3 class="block-title">Atributos</h3><div class="attributes">${attrNames.map(([key, label]) => `<div class="attribute"><label>${label}</label><div class="hex"><strong>${escapeHtml(stats.attributes[key].value)}</strong>${stats.attributes[key].value !== stats.attributes[key].base ? `<small>${stats.attributes[key].base}</small>` : ""}</div></div>`).join("")}</div></section>
          <section class="sheet-block"><h3 class="block-title">Perícias</h3><div class="skill-list">${skillMarkup}</div></section>
          <section class="sheet-block"><h3 class="block-title">Testes de perícia e dano <span class="minor">Rolagens configuradas no JSON</span></h3><div class="skill-test-list">${skillTestMarkup}</div></section>
          <section class="sheet-block"><h3 class="block-title">Deslocamento</h3><div class="movement-row"><strong>${escapeHtml(stats.movement.value)}m</strong><span>${stats.movement.value === stats.movement.base && c.movement.squares !== null && c.movement.squares !== undefined ? `| ${escapeHtml(c.movement.squares)} quadrados` : ""}</span>${stats.movement.value !== stats.movement.base ? `<span class="muted">(base ${escapeHtml(stats.movement.base)}m)</span>` : ""}</div></section>
        </div>
        <div class="sheet-column">
          <section class="sheet-block"><h3 class="block-title">Habilidades e ações <span class="minor">${abilityEntries.length} registro(s)</span></h3>${abilities}</section>
          ${featureMarkup ? `<section class="sheet-block"><h3 class="block-title">Características</h3>${featureMarkup}</section>` : ""}
          <section class="sheet-block"><h3 class="block-title">Condições ativas <span class="minor">${r.conditions.length}</span></h3><div class="condition-list">${currentConditions || `<div class="condition-empty">Nenhuma condição aplicada.</div>`}</div><button class="small-btn" style="margin-top:7px" data-action="add-condition">＋ Aplicar condição</button></section>
          <section class="sheet-block"><h3 class="block-title">Recursos</h3><div class="resources">${resources}</div></section>
          ${c.description ? `<section class="sheet-block"><h3 class="block-title">Descrição</h3><div class="content-copy">${escapeHtml(c.description)}</div></section>` : ""}
          ${c.appearance ? `<section class="sheet-block"><h3 class="block-title">Aparência</h3><div class="content-copy">${escapeHtml(c.appearance)}</div></section>` : ""}
          ${c.lore ? `<section class="sheet-block"><h3 class="block-title">História</h3><div class="content-copy">${escapeHtml(c.lore)}</div></section>` : ""}
        </div>
      </div>
      <section class="sheet-block" style="margin-top:12px"><h3 class="block-title">Ataques <span class="minor">Teste · Dano · Crítico / Alcance / Efeito</span></h3><div class="attack-table"><div class="attack-table-head"><span>Ataque</span><span>Teste</span><span>Dano</span><span>Crítico / Alcance</span></div>${attacks}</div></section>
      ${c.notes ? `<section class="sheet-block" style="margin-top:9px"><h3 class="block-title">Observações</h3><div class="content-copy">${escapeHtml(c.notes)}</div></section>` : ""}
      <div class="sheet-bottom"><div class="sheet-notes"><div class="overline">${escapeHtml(c.type)} ${c.category ? `· ${escapeHtml(c.category)}` : ""}</div><div class="private-note">Ficha privada do Mestre · Estado atual salvo localmente · Sem sincronização pública</div></div><div class="sheet-actions"><button class="small-btn" data-action="edit-threat">Editar JSON</button><button class="small-btn" data-action="export-threat">Exportar JSON</button><button class="small-btn" data-action="show-history">Histórico</button><button class="small-btn" data-action="show-roll-history">Rolagens (${r.rollHistory?.length ?? 0})</button><button class="small-btn" data-action="duplicate-threat">Duplicar</button><button class="danger-btn" data-action="delete-threat">Excluir</button></div></div>
    </div>
  </article>`;
}

function renderModal(modal) {
  if (modal.type === "json") {
    const title = modal.mode === "edit" ? "Editar ficha — JSON" : "Importar / criar ameaça";
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><header class="modal-head"><span class="modal-title">${title}</span><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header><div class="modal-content"><label class="modal-label" for="json-input">Modelo JSON da ameaça</label><textarea class="json-editor" id="json-input" spellcheck="false">${escapeHtml(modal.value)}</textarea><div class="help-text">Cole ou edite o objeto JSON. Os campos desconhecidos são preservados em creature e custom. A validação informa o caminho exato dos erros.</div>${modal.error ? `<div class="error-box">${escapeHtml(modal.error)}</div>` : ""}<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px"><button class="small-btn" data-action="copy-template">Copiar modelo</button><button class="small-btn" data-action="load-json-file">Abrir arquivo .json</button><input type="file" id="json-file" accept=".json,application/json" hidden></div></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" data-action="submit-json">${modal.mode === "edit" ? "Validar e salvar" : "Validar e importar"}</button></footer></section></div>`;
  }
  if (modal.type === "condition") {
    const record = selectedRecord();
    const activeNames = new Set((record?.runtime.conditions ?? []).map((condition) => condition.name));
    const higherStageFor = {
      "Fraco": ["Debilitado", "Inconsciente"],
      "Debilitado": ["Inconsciente"],
      "Fatigado": ["Exausto", "Inconsciente"],
      "Exausto": ["Inconsciente"]
    };
    const options = CONDITION_PRESETS.map((preset) => {
      const active = activeNames.has(preset.name);
      const escalation = active ? getConditionEscalation(preset.name) : null;
      const higherStage = (higherStageFor[preset.name] ?? []).find((name) => activeNames.has(name));
      const lowerTierFor = { "Debilitado": "Fraco", "Exausto": "Fatigado" }[preset.name];
      const lowerActive = lowerTierFor && activeNames.has(lowerTierFor);
      const disabled = (active && !escalation) || Boolean(higherStage);
      const stateLabel = active
        ? (escalation ? `Reaplicar para agravar → ${escalation}` : "Já aplicada")
        : higherStage
          ? `Substituída por ${higherStage}`
          : lowerActive
            ? `Aplicar e substituir ${lowerTierFor}`
            : "Clique para aplicar";
      return `<button class="condition-picker-option ${active ? "is-active" : ""}" type="button" data-action="apply-preset-condition" data-condition="${escapeHtml(preset.name)}" ${disabled ? "disabled" : ""}>
        <span class="condition-picker-top"><b>${escapeHtml(preset.name)}</b><span class="condition-picker-group">${escapeHtml(preset.group)}</span></span>
        <span class="condition-picker-description">${escapeHtml(preset.description)}</span>
        <span class="condition-picker-state">${escapeHtml(stateLabel)}</span>
      </button>`;
    }).join("");
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal condition-modal" role="dialog" aria-modal="true" aria-label="Selecionar condição"><header class="modal-head"><span class="modal-title">Selecionar condição</span><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header><div class="modal-content"><p class="condition-picker-hint">Clique em uma condição para aplicá-la imediatamente. Os modificadores serão atualizados na ficha; você poderá removê-la a qualquer momento.</p><div class="condition-picker-list">${options}</div>${modal.error ? `<div class="error-box">${escapeHtml(modal.error)}</div>` : ""}</div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Fechar</button></footer></section></div>`;
  }
  if (modal.type === "delete") {
    return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><span class="modal-title">Excluir ameaça</span><button class="modal-close" data-action="close-modal">×</button></header><div class="modal-content"><p style="font:13px/1.5 var(--sans)">Excluir <strong>${escapeHtml(selectedRecord()?.creature.name)}</strong>? A ficha e o estado local serão removidos deste navegador.</p></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Cancelar</button><button class="danger-btn" data-action="confirm-delete">Excluir definitivamente</button></footer></section></div>`;
  }
  if (modal.type === "history") {
    const items = [...(selectedRecord()?.runtime.history ?? [])].reverse();
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><span class="modal-title">Histórico da ameaça</span><button class="modal-close" data-action="close-modal">×</button></header><div class="modal-content"><div class="history-list">${items.length ? items.map((item) => `<div class="history-line"><time>${escapeHtml(new Date(item.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</time><span>${escapeHtml(item.message)}</span></div>`).join("") : `<div class="condition-empty">Nenhum evento registrado nesta ficha.</div>`}</div></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Fechar</button></footer></section></div>`;
  }
  if (modal.type === "roll-history") {
    const items = [...(selectedRecord()?.runtime.rollHistory ?? [])].reverse();
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-label="Histórico de rolagens"><header class="modal-head"><span class="modal-title">Histórico de rolagens</span><button class="modal-close" data-action="close-modal">×</button></header><div class="modal-content"><div class="roll-history-list">${items.length ? items.map((item) => `<article class="roll-history-entry"><div class="roll-history-head"><time>${escapeHtml(new Date(item.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</time><b>${escapeHtml(item.title)}</b><strong>${escapeHtml(item.total)}</strong></div><small>${escapeHtml(item.expression || item.kind)}</small><details><summary>Detalhes dos dados</summary>${renderRollDetails(item.result)}</details></article>`).join("") : `<div class="condition-empty">Nenhuma rolagem registrada nesta ficha.</div>`}</div></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Fechar</button></footer></section></div>`;
  }
  if (modal.type === "heal-life") {
    const presets = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
    const amountButtons = presets.map((amount) => `<button type="button" class="heal-life-amount" data-action="apply-healing" data-amount="${amount}">+${amount} PV</button>`).join("");
    const record = selectedRecord();
    const missing = Math.max(0, (record?.creature.hp.max ?? 0) - (record?.runtime.hpCurrent ?? 0));
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal heal-life-modal" role="dialog" aria-modal="true" aria-label="Curar vida"><header class="modal-head"><span class="modal-title">Curar vida · ${escapeHtml(record?.creature.name ?? "Ameaça")}</span><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header><div class="modal-content"><p class="heal-life-hint">Escolha um valor predefinido para recuperar os PV desta ameaça. A cura nunca ultrapassa o máximo de vida.</p><div class="heal-life-grid">${amountButtons}</div><button type="button" class="heal-life-full" data-action="heal-to-full" ${missing === 0 ? "disabled" : ""}>Restaurar todos os PV · +${missing}</button></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Fechar</button></footer></section></div>`;
  }
  if (modal.type === "incoming-damage") {
    const damageType = modal.damageType || DAMAGE_TYPES[0];
    const typeButtons = DAMAGE_TYPES.map((type) => `<button type="button" class="damage-type-option ${type === damageType ? "is-selected" : ""}" data-action="select-incoming-damage-type" data-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join("");
    const presets = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
    const amountButtons = presets.map((amount) => `<button type="button" class="incoming-damage-amount" data-action="apply-incoming-damage" data-amount="${amount}">−${amount} PV</button>`).join("");
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal incoming-damage-modal" role="dialog" aria-modal="true" aria-label="Receber dano"><header class="modal-head"><span class="modal-title">Aplicar dano recebido · ${escapeHtml(selectedRecord()?.creature.name ?? "Ameaça")}</span><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header><div class="modal-content"><p class="incoming-damage-hint">Este painel é para dano que a ameaça RECEBE dos jogadores. Rolagens de ataque e habilidade da ameaça não alteram os PV dela.</p><div class="damage-picker-label">1. Tipo de dano</div><div class="damage-type-grid">${typeButtons}</div><label class="ignore-rd-option incoming-ignore-rd"><input type="checkbox" data-action="toggle-incoming-ignore-rd" ${modal.ignoreRD ? "checked" : ""}><span>Ignorar RD</span></label><div class="damage-picker-label">2. Quantidade recebida · ${escapeHtml(damageType)}</div><div class="incoming-damage-grid">${amountButtons}</div><p class="incoming-damage-footnote">Cada botão aplica uma instância de dano. Para valores maiores ou compostos, clique em mais de um preset. Imunidades continuam sendo respeitadas.</p></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Fechar</button></footer></section></div>`;
  }
  if (modal.type === "roll") {
    return `<aside class="roll-dock ${modal.loading ? "is-loading" : ""}" role="status" aria-live="polite"><header class="roll-dock-head"><span class="roll-dock-indicator"></span><b>${escapeHtml(modal.title ?? modal.result?.title ?? "Rolagem")}</b><button class="roll-dock-close" data-action="close-modal" aria-label="Fechar resultado">×</button></header><div class="roll-dock-main"><div class="roll-dock-expression">${escapeHtml(modal.expression ?? "")}</div><strong class="roll-dock-total">${modal.loading ? "…" : escapeHtml(modal.displayTotal ?? "—")}</strong></div><div class="roll-dock-status">${modal.loading ? "Rolando dados…" : "Resultado calculado · Dano causado ao alvo"}</div>${modal.loading ? "" : `<details class="roll-dock-details"><summary>Detalhes</summary>${renderRollDetails(modal.result)}</details>`}</aside>`;
  }
  return "";
}

function renderRollDetails(result) {
  if (!result) return "";
  const results = ["attack", "ability"].includes(result.kind) ? [result.test, result.damage].filter(Boolean) : result.roll ? [result.roll] : result.test ? [result.test] : result.parts ? [result] : [];
  const title = result.kind === "attack" ? "ATAQUE" : result.kind === "ability" ? "HABILIDADE / AÇÃO" : result.kind === "skill" ? "TESTE DE PERÍCIA" : result.kind === "damage" ? "ROLAGEM DE DANO" : result.kind === "forced-failure" ? "FALHA AUTOMÁTICA" : "TESTE";
  let html = `<div><strong>${title}</strong></div>`;
  for (const [index, roll] of results.entries()) {
    const partLabel = ["attack", "ability"].includes(result.kind) ? (result.part === "damage" ? "Dano" : result.part === "test" ? "Teste" : index === 0 ? "Teste" : "Dano") : result.kind === "damage" ? "Dano" : result.kind === "skill" ? "Teste de perícia" : "Rolagem";
    html += `<div class="roll-part"><b>${partLabel}</b><br>${escapeHtml(roll.expression)} = <strong>${roll.total}</strong><br>${roll.parts.map((part) => part.type === "dice" ? `${part.sign < 0 ? "−" : ""}${part.count}d${part.sides}: [${part.rolls.join(", ")}]` : `Modificador: ${part.value}`).join(" · ")}</div>`;
  }
  if (result.critical) html += `<div class="roll-part">Crítico: ${escapeHtml(result.critical)} · Alcance: ${escapeHtml(result.range)}</div>`;
  if (result.effects) html += `<div class="roll-part">Efeitos: ${escapeHtml(result.effects)}</div>`;
  if (result.description) html += `<div class="roll-part">${escapeHtml(result.description)}</div>`;
  if (!results.length && result.kind !== "forced-failure") html += `<div class="roll-part">Esta habilidade não possui uma rolagem associada.</div>`;
  return html;
}

function showJsonModal(mode = "new", record = null) {
  state.modal = { type: "json", mode, recordId: record?.id ?? null, value: jsonText(record ? exportThreatRecord(record) : createThreatTemplate()), error: "" };
  render();
}
function buildValidationMessage(error) {
  if (error instanceof ThreatValidationError) return error.errors.map((entry) => `• ${entry.path}: ${entry.message}`).join("\n");
  return error?.message ?? String(error);
}

async function processJsonImport() {
  const textarea = document.querySelector("#json-input");
  if (!textarea) return;
  const modal = state.modal;
  try {
    const parsed = JSON.parse(textarea.value);
    const existing = modal.mode === "edit" ? state.records.find((entry) => entry.id === modal.recordId) : null;
    const record = normalizeThreatPayload(parsed, { id: existing?.id ?? crypto.randomUUID() });
    if (existing) {
      record.createdAt = existing.createdAt;
      record.runtime.history = record.runtime.history ?? [];
      record.runtime.history.push({ at: new Date().toISOString(), message: "Ficha editada pelo JSON." });
    } else {
      record.runtime.history.push({ at: new Date().toISOString(), message: "Ameaça importada." });
    }
    await saveRecord(record);
    state.modal = null;
    render();
    showToast(existing ? "Ficha atualizada." : "Ameaça importada.");
  } catch (error) {
    modal.error = buildValidationMessage(error);
    render();
    const field = document.querySelector("#json-input");
    if (field) { field.value = textarea.value; field.focus(); }
  }
}

async function handleClick(event) {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  const record = selectedRecord();
  if (action === "backdrop-close" && event.target === control) { state.modal = null; render(); return; }
  if (action === "close-modal") { state.modal = null; render(); return; }
  if (action === "new-threat") { showJsonModal("new"); return; }
  if (action === "select-threat") { state.selectedId = control.dataset.id; state.modal = null; render(); return; }
  if (action === "open-import") { showJsonModal("new"); return; }
  if (action === "copy-template") {
    try { await navigator.clipboard.writeText(jsonText(createThreatTemplate())); showToast("Modelo JSON copiado."); }
    catch { showToast("A cópia automática não foi permitida pelo navegador; selecione o JSON e copie manualmente.", true); }
    return;
  }
  if (action === "load-json-file") { document.querySelector("#json-file")?.click(); return; }
  if (action === "submit-json") { await processJsonImport(); return; }
  if (action === "edit-threat" && record) { showJsonModal("edit", record); return; }
  if (action === "export-threat" && record) { downloadJson(exportThreatRecord(record), `${slug(record.creature.name)}.json`); showToast("JSON exportado."); return; }
  if (action === "duplicate-threat" && record) {
    const duplicate = normalizeThreatPayload(exportThreatRecord(record), { id: crypto.randomUUID() });
    duplicate.creature.name = `${duplicate.creature.name} — CÓPIA`;
    duplicate.runtime.history.push({ at: new Date().toISOString(), message: "Ficha duplicada." });
    await saveRecord(duplicate); showToast("Ameaça duplicada."); return;
  }
  if (action === "delete-threat" && record) { state.modal = { type: "delete" }; render(); return; }
  if (action === "confirm-delete" && record) { await removeRecord(record.id); showToast("Ameaça excluída."); return; }
  if (action === "open-heal" && record) {
    state.modal = { type: "heal-life" };
    render();
    return;
  }
  if (action === "apply-healing" && record && state.modal?.type === "heal-life") {
    const amount = Number(control.dataset.amount);
    if (!Number.isInteger(amount) || amount < 1) { showToast("Selecione um valor de cura válido.", true); return; }
    const before = record.runtime.hpCurrent;
    const next = changeHitPoints(record, amount, "heal");
    const restored = next.runtime.hpCurrent - before;
    state.modal = null;
    await saveRecord(next);
    showToast(restored ? "Recuperou " + restored + " PV." : "A ameaça já está com PV máximos.");
    return;
  }
  if (action === "heal-to-full" && record && state.modal?.type === "heal-life") {
    const missing = Math.max(0, record.creature.hp.max - record.runtime.hpCurrent);
    state.modal = null;
    if (!missing) { render(); showToast("A ameaça já está com PV máximos."); return; }
    await saveRecord(changeHitPoints(record, missing, "heal"));
    showToast("PV restaurados ao máximo.");
    return;
  }
  if (action === "fast-heal" && record) {
    const amount = getFastHealing(record);
    if (!amount) { showToast("Esta ameaça não possui Cura Acelerada configurada.", true); return; }
    const before = record.runtime.hpCurrent;
    const next = changeHitPoints(record, amount, "heal");
    const restored = next.runtime.hpCurrent - before;
    await saveRecord(next);
    showToast("Cura acelerada: +" + restored + " PV.");
    return;
  }
  if (action === "receive-damage" && record) {
    state.modal = { type: "incoming-damage", damageType: DAMAGE_TYPES[0], ignoreRD: false };
    render();
    return;
  }
  if (action === "select-incoming-damage-type" && state.modal?.type === "incoming-damage") {
    state.modal.damageType = control.dataset.type || DAMAGE_TYPES[0];
    render();
    return;
  }
  if (action === "toggle-incoming-ignore-rd" && state.modal?.type === "incoming-damage") {
    state.modal.ignoreRD = Boolean(control.checked);
    render();
    return;
  }
  if (action === "apply-incoming-damage" && record && state.modal?.type === "incoming-damage") {
    const amount = Number(control.dataset.amount);
    if (!Number.isInteger(amount) || amount < 1) { showToast("Selecione um valor predefinido válido.", true); return; }
    const damageType = state.modal.damageType || DAMAGE_TYPES[0];
    const ignoreRD = Boolean(state.modal.ignoreRD);
    const result = applyTypedDamage(record, amount, damageType, { ignoreRD });
    state.modal = null;
    await saveRecord(result.record);
    const feedback = result.immune
      ? "Imunidade a " + result.damageType + ": nenhum PV perdido."
      : result.applied + " PV perdidos por " + result.damageType + "."
        + (result.resistance && !ignoreRD ? " RD " + result.resistance + " reduziu " + result.reduced + "." : ignoreRD ? " RD ignorada." : "");
    showToast(feedback);
    return;
  }
  if (action === "add-condition" && record) { state.modal = { type: "condition", error: "" }; render(); return; }
  if (action === "apply-preset-condition" && record) {
    try {
      const name = control.dataset.condition;
      const next = applyPresetCondition(record, name);
      await saveRecord(next);
      state.modal = null;
      render();
      showToast(`${name} aplicada.`);
    } catch (error) {
      state.modal.error = error.message;
      render();
    }
    return;
  }
  if (action === "remove-condition" && record) { await saveRecord(removeCondition(record, control.dataset.id)); showToast("Condição removida."); return; }
  if (action === "resource-change" && record) {
    const next = changeResource(record, control.dataset.id, Number(control.dataset.amount));
    await saveRecord(next); return;
  }
  if (action === "show-history" && record) { state.modal = { type: "history" }; render(); return; }
  if (action === "show-roll-history" && record) { state.modal = { type: "roll-history" }; render(); return; }
  if (["roll-attack", "roll-attack-test", "roll-attack-damage"].includes(action) && record) {
    const source = control.dataset.source === "agredir" ? "agredir" : "attacks";
    const attackList = source === "agredir" ? (record.creature.actions?.agredir ?? []) : (record.creature.attacks ?? []);
    const attack = attackList.find((entry) => entry.id === control.dataset.id);
    if (attack) {
      if (attackBlocked(record, attack)) { showToast(computeEffectiveStats(record).rules.includes("onlyLightWeapons") && !canUseAttackWhileGrappled(attack) ? "Agarrado: somente ataques com armas leves estão permitidos." : "Esta condição impede a criatura de realizar essa ação.", true); return; }
      const part = action === "roll-attack-test" ? "test" : action === "roll-attack-damage" ? "damage" : "both";
      startRoll(record, () => rollAttack(record, attack, part), `${attack.test || ""} ${attack.damage ? `· ${attack.damage}` : ""}`, attack.name || "Ataque");
    }
    return;
  }
  if (action === "roll-skill-test" && record) {
    const item = (record.creature.skillTests ?? []).find((entry) => entry.id === control.dataset.id);
    const restriction = item ? getSkillTestRestriction(record, item) : null;
    if (item && restriction) showToast(restriction, true);
    else if (item && !actionBlocked(record, item)) startRoll(record, () => rollSkillTest(record, item), item.test, item.name);
    else if (item) showToast("A condição atual impede esse teste.", true);
    return;
  }
  if (action === "roll-skill-damage" && record) {
    const item = (record.creature.skillTests ?? []).find((entry) => entry.id === control.dataset.id);
    const restriction = item ? getSkillTestRestriction(record, item) : null;
    if (item && restriction) showToast(restriction, true);
    else if (item?.damage && !actionBlocked(record, item)) startRoll(record, () => rollDamageExpression(record, item.damage), item.damage, `${item.name} · Dano`);
    else if (item?.damage) showToast("A condição atual impede essa ação.", true);
    return;
  }
  if (["use-ability", "use-ability-test", "use-ability-damage"].includes(action) && record) {
    const group = control.dataset.kind || "abilities";
    const entries = group === "actions.other" ? (record.creature.actions?.other ?? []) : (record.creature[group] ?? []);
    const ability = entries.find((entry) => entry.id === control.dataset.id);
    if (!ability) return;
    if (actionBlocked(record, ability, { isReaction: group === "reactions" })) { showToast("A condição atual impede essa ação. Sob Paralisado, somente ações puramente mentais podem ser executadas.", true); return; }
    const resourceId = ability.resourceId;
    const cost = Math.max(0, Math.floor(safeNumber(ability.resourceCost, 0)));
    let currentRecord = record;
    if (resourceId && cost) {
      const current = record.runtime.resources[resourceId] ?? 0;
      if (current < cost) { showToast("Recurso insuficiente para executar esta habilidade.", true); return; }
      currentRecord = changeResource(record, resourceId, -cost);
      await saveRecord(currentRecord);
    }
    const part = action === "use-ability-test" ? "test" : action === "use-ability-damage" ? "damage" : "both";
    const expression = part === "test" ? (ability.test || ability.roll || "") : part === "damage" ? (ability.damageDice || ability.damage || ability.roll || "") : [ability.test || ability.roll, ability.damageDice || ability.damage].filter(Boolean).join(" · ");
    startRoll(currentRecord, () => rollAbility(currentRecord, ability, part), expression || "Sem rolagem", ability.name || "Habilidade");
    return;
  }
  if (action === "roll-stat") {
    const expression = control.dataset.expression;
    const statKey = control.dataset.stat || "";
    const rules = computeEffectiveStats(record).rules;
    if (statKey === "perception") {
      const restriction = getSkillTestRestriction(record, { name: control.dataset.title || "Percepção", senseUse: control.dataset.senseUse || "observe" });
      if (restriction) { showToast(restriction, true); return; }
    }
    if (expression) startRoll(record, () => statKey ? rollStat(record, expression, statKey) : rollStandalone(expression), expression, control.dataset.title || "Teste");
    return;
  }
}

function startRoll(record, calculate, expression, title) {
  if (state.rollBusy) return;
  state.rollBusy = true;
  state.modal = { type: "roll", loading: true, expression, result: { title }, displayTotal: "?", title };
  render();
  window.setTimeout(async () => {
    try {
      const result = calculate();
      const displayTotal = ["attack", "ability"].includes(result.kind) ? (result.test?.total ?? result.damage?.total ?? "—") : result.roll?.total ?? result.total ?? "—";
      if (record && record.id === selectedRecord()?.id) {
        const next = structuredClone(record);
        pushRollHistory(next, title, result);
        await saveRecord(next);
      }
      state.modal = { type: "roll", loading: false, expression, result, title, displayTotal };
    } catch (error) {
      state.modal = { type: "roll", loading: false, expression, title, result: { title, description: error.message }, displayTotal: "ERRO" };
    }
    state.rollBusy = false;
    render();
  }, 280);
}

function slug(value) {
  return String(value || "ameaca").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ameaca";
}
function downloadJson(value, filename) {
  const blob = new Blob([jsonText(value)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

ROOT.addEventListener("click", (event) => { handleClick(event).catch((error) => showToast(error.message, true)); });
ROOT.addEventListener("input", (event) => {
  if (event.target.id === "threat-search") {
    state.search = event.target.value;
    const list = ROOT.querySelector(".threat-list");
    const filtered = getFilteredRecords();
    if (list) list.innerHTML = filtered.length ? filtered.map((entry) => renderThreatEntry(entry)).join("") : `<div class="condition-empty">${state.records.length ? "Nenhuma ameaça encontrada." : "Nenhuma ameaça cadastrada."}</div>`;
    return;
  }
  if (event.target.id === "json-input" && state.modal?.type === "json") state.modal.value = event.target.value;
});
ROOT.addEventListener("change", async (event) => {
  if (event.target.id === "json-file" && event.target.files?.[0]) {
    const file = event.target.files[0];
    try { state.modal.value = await file.text(); state.modal.error = ""; render(); }
    catch (error) { state.modal.error = `Falha ao ler o arquivo: ${error.message}`; render(); }
    return;
  }
  if (event.target.id === "json-input") state.modal.value = event.target.value;
});

let OBR = null;

function replayBufferedReady() {
  if (!OBR || OBR.isReady) return;
  const pending = window.__OL_OBR_READY_BUFFER__;
  if (!pending || pending.replayed) return;
  pending.replayed = true;
  // O SDK oficial valida event.origin; MessageEvent permite entregar o handshake
  // que o Owlbear envia uma única vez enquanto os provedores do SDK são tentados.
  window.dispatchEvent(new MessageEvent("message", { data: pending.data, origin: pending.origin }));
}

function renderBootstrapError(error) {
  state.role = "ERROR";
  const details = escapeHtml(error?.message ?? String(error));
  ROOT.innerHTML = `<section class="access-denied"><div class="access-card"><div class="access-icon">!</div><h1>Não foi possível iniciar o Painel</h1><p>O SDK do Owlbear não foi carregado. O painel tentou mais de um provedor e nenhuma origem respondeu corretamente.</p><pre class="diagnostic-details">${details}</pre><p>Confira a conexão e tente reabrir a extensão. Se o problema persistir, envie este diagnóstico junto com o endereço do manifesto.</p></div></section>`;
}

async function startOwlbearIntegration() {
  try {
    const loaded = await loadOwlbearSDK();
    OBR = loaded.OBR;
    window.__OL_OBR_SDK_SOURCE__ = loaded.source;
    replayBufferedReady();
    const readyTimeout = window.setTimeout(() => {
      if (!OBR.isReady && state.role === null) {
        renderBootstrapError(new Error("O SDK foi baixado, mas não recebeu OBR_READY do Owlbear em 20 segundos. Isso geralmente indica que o popover foi aberto fora do Owlbear ou que a origem do iframe não corresponde ao parâmetro obrref."));
      }
    }, 20000);

    OBR.onReady(async () => {
      window.clearTimeout(readyTimeout);
      try {
        if (!OBR.isAvailable) throw new Error("A extensão não está incorporada ao Owlbear Rodeo. Abra o painel a partir de uma sala ativa.");
        const role = await OBR.player.getRole();
        state.role = role;
        if (role !== "GM") {
          // A verificação de papel acontece antes de abrir o banco privado.
          try { await OBR.action.close(); } catch { /* ação já fechada */ }
          render();
          return;
        }
        await store.open();
        state.records = await store.list();
        state.records.sort((a, b) => new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt));
        state.selectedId = state.records[0]?.id ?? null;
        render();
        await OBR.action.setTitle("Painel de Ameaças · Mestre");
      } catch (error) {
        state.role = "ERROR";
        ROOT.innerHTML = `<section class="access-denied"><div class="access-card"><h1>Falha ao inicializar</h1><pre class="diagnostic-details">${escapeHtml(error.message)}</pre></div></section>`;
      }
    });
  } catch (error) {
    renderBootstrapError(error);
  }
}

void startOwlbearIntegration();
