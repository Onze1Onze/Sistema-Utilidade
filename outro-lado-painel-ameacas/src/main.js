import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import {
  createThreatTemplate, normalizeThreatPayload, exportThreatRecord, computeEffectiveStats,
  addCondition, removeCondition, changeHitPoints, changeResource, pushHistory, ThreatValidationError
} from "./threat-engine.js";
import { rollAttack, rollAbility, rollStandalone } from "./dice.js";
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
  const hpPercent = c.hp.max ? Math.max(0, Math.min(100, r.hpCurrent / c.hp.max * 100)) : 0;
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
  const currentConditions = r.conditions.map((condition) => `<div class="condition-entry"><div><b>${escapeHtml(condition.name)}</b>${condition.duration ? `<small>${escapeHtml(condition.duration)}</small>` : ""}${condition.description ? `<small>${escapeHtml(condition.description)}</small>` : ""}<div class="modifier-summary">${escapeHtml(JSON.stringify(condition.modifiers ?? {}))}</div></div><button class="danger-btn" data-action="remove-condition" data-id="${escapeHtml(condition.id)}" title="Remover condição">×</button></div>`).join("");
  const attacks = c.attacks.length ? c.attacks.map((attack) => `<div class="attack-row"><button data-action="roll-attack" data-id="${escapeHtml(attack.id)}">${escapeHtml(attack.name || "Ataque")}</button><span>${escapeHtml(attack.test || "—")}</span><span>${escapeHtml(attack.damage || "—")}</span><span>${escapeHtml([attack.critical, attack.range].filter(Boolean).join(" · ") || "—")}</span></div>`).join("") : `<div class="condition-empty">Nenhum ataque cadastrado.</div>`;
  const abilityGroups = [
    ["abilities", "Habilidade"], ["powers", "Poder"], ["actions", "Ação"],
    ["specialActions", "Ação especial"], ["reactions", "Reação"]
  ];
  const abilityEntries = abilityGroups.flatMap(([key, label]) => (c[key] ?? []).map((ability) => ({ ...ability, groupKey: key, groupLabel: label })));
  const abilities = abilityEntries.length ? abilityEntries.map((ability) => `<article class="ability-card"><div class="card-head"><div><div class="card-name">${escapeHtml(ability.name || ability.groupLabel)}</div><div class="card-sub">${escapeHtml(ability.actionType || ability.groupLabel)}</div></div>${ability.roll ? `<span class="entry-vd">${escapeHtml(ability.roll)}</span>` : ""}</div><div class="card-body">${escapeHtml(ability.description || "Sem descrição.")}${ability.effects ? `<div class="card-sub">Efeitos: ${escapeHtml(typeof ability.effects === "string" ? ability.effects : JSON.stringify(ability.effects))}</div>` : ""}</div><div class="card-actions"><button class="small-btn" data-action="use-ability" data-kind="${escapeHtml(ability.groupKey)}" data-id="${escapeHtml(ability.id)}">${ability.roll ? "Executar / rolar" : "Consultar habilidade"}</button></div></article>`).join("") : `<div class="condition-empty">Nenhuma habilidade ou ação cadastrada.</div>`;
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
  const featureMarkup = c.features.length ? c.features.map((feature) => `<div class="ability-card"><div class="card-head"><span class="card-name">${escapeHtml(typeof feature === "string" ? feature : feature.name || "Característica")}</span></div>${typeof feature === "object" && feature.description ? `<div class="card-body">${escapeHtml(feature.description)}</div>` : ""}</div>`).join("") : "";
  return `<article class="sheet">
    <svg class="sheet-watermark" viewBox="0 0 700 800" aria-hidden="true"><circle cx="350" cy="400" r="265" fill="none" stroke="#111" stroke-width="5"/><circle cx="350" cy="400" r="220" fill="none" stroke="#111" stroke-width="2" stroke-dasharray="4 11"/><path d="M350 95L405 310 595 400 405 490 350 705 295 490 105 400 295 310Z" fill="none" stroke="#111" stroke-width="5"/><circle cx="350" cy="400" r="65" fill="none" stroke="#111" stroke-width="4"/><path d="M350 330v140M280 400h140M250 245l200 310M450 245L250 555" stroke="#111" stroke-width="3" fill="none"/></svg>
    <div class="sheet-content">
      <div class="sheet-head"><div class="name-plaque"><span class="overline">Nome da criatura</span><strong class="creature-name">${escapeHtml(c.name)}</strong></div><div class="vd-plaque"><span class="vd-value">${escapeHtml(c.vd)}</span><span class="vd-label">VALOR DE DESAFIO</span></div><div class="brand-plaque"><span>ORDEM</span><strong>PARANORMAL</strong><small>RPG · OUTRO LADO</small></div></div>
      <div class="element-row"><div class="label-line"><span class="black-label">Elemento principal</span><span class="line-value">${escapeHtml(c.elementPrimary || "—")}</span></div><div class="label-line"><span class="black-label">Elementos secundários</span><span class="line-value">${escapeHtml(toListText(c.elementsSecondary) || "—")}</span></div></div>
      <div class="presence-grid"><div class="label-line"><span class="black-label">Presença perturbadora</span><span class="line-value">DT ${escapeHtml(c.presence.dt ?? "—")}</span></div><div class="presence-item"><b>Dano mental</b>${escapeHtml(c.presence.mentalDamage || "—")} <b>NEX</b>${escapeHtml(c.presence.nex || "—")}</div></div>
      <div class="sheet-rule"></div>
      <div class="sheet-grid">
        <div class="sheet-column">
          <section class="sheet-block"><h3 class="block-title">Sentidos</h3><div class="senses-grid"><div class="sense-cell"><b>Percepção</b>${statMarkup(stats.senses.perception)}</div><div class="sense-cell"><b>Iniciativa</b>${statMarkup(stats.senses.initiative)}</div><div class="sense-cell"><b>Especiais</b><span>${escapeHtml(c.senses.special || "—")}</span></div></div><div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">${/[d]\d+/i.test(String(stats.senses.perception.value)) ? `<button class="small-btn" data-action="roll-stat" data-expression="${escapeHtml(stats.senses.perception.value)}" data-title="Percepção">Rolar percepção</button>` : ""}${/[d]\d+/i.test(String(stats.senses.initiative.value)) ? `<button class="small-btn" data-action="roll-stat" data-expression="${escapeHtml(stats.senses.initiative.value)}" data-title="Iniciativa">Rolar iniciativa</button>` : ""}</div></section>
          <section class="sheet-block"><h3 class="block-title">Defesa e resistências</h3><div class="defense-panel"><div class="defense-number"><strong>${escapeHtml(stats.defense.value)}</strong><span>DEFESA</span>${stats.defense.value !== stats.defense.base ? `<small style="font:9px var(--sans);margin-top:4px">Base ${escapeHtml(stats.defense.base)}</small>` : ""}</div><div class="save-grid">${statRoll("Fortitude", stats.saves.fortitude, "fortitude")}${statRoll("Reflexos", stats.saves.reflexes, "reflexes")}${statRoll("Vontade", stats.saves.will, "will")}</div></div></section>
          <section class="sheet-block"><h3 class="block-title">Pontos de vida <span class="minor">${c.hp.woundedAt !== null && c.hp.woundedAt !== undefined ? `Machucado ${escapeHtml(c.hp.woundedAt)}` : ""}</span></h3><div class="hp-panel"><div class="hp-side"><strong>PV</strong><span>VIDA</span></div><div class="hp-main"><div class="hp-numbers"><strong class="hp-current">${r.hpCurrent}</strong><span class="hp-max">/ ${c.hp.max} PV</span></div><div class="hp-track"><span style="width:${hpPercent}%"></span></div><div class="hp-controls"><input type="number" min="1" max="999999" value="10" id="hp-amount" aria-label="Quantidade de pontos de vida"><button class="small-btn" data-action="damage">− Dano</button><button class="small-btn" data-action="heal">＋ Cura</button></div></div></div></section>
          ${renderTriad("Resistências", c.resistances)}${renderTriad("Vulnerabilidades", c.vulnerabilities)}${renderTriad("Imunidades", c.immunities)}
          <section class="sheet-block"><h3 class="block-title">Atributos</h3><div class="attributes">${attrNames.map(([key, label]) => `<div class="attribute"><label>${label}</label><div class="hex"><strong>${escapeHtml(stats.attributes[key].value)}</strong>${stats.attributes[key].value !== stats.attributes[key].base ? `<small>${stats.attributes[key].base}</small>` : ""}</div></div>`).join("")}</div></section>
          <section class="sheet-block"><h3 class="block-title">Perícias</h3><div class="skill-list">${skillMarkup}</div></section>
          <section class="sheet-block"><h3 class="block-title">Deslocamento</h3><div class="movement-row"><strong>${escapeHtml(stats.movement.value)}m</strong><span>${c.movement.squares !== null && c.movement.squares !== undefined ? `| ${escapeHtml(c.movement.squares)} quadrados` : ""}</span>${stats.movement.value !== stats.movement.base ? `<span class="muted">(base ${escapeHtml(stats.movement.base)}m)</span>` : ""}</div></section>
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
      <div class="sheet-bottom"><div class="sheet-notes"><div class="overline">${escapeHtml(c.type)} ${c.category ? `· ${escapeHtml(c.category)}` : ""}</div><div class="private-note">Ficha privada do Mestre · Estado atual salvo localmente · Sem sincronização pública</div></div><div class="sheet-actions"><button class="small-btn" data-action="edit-threat">Editar JSON</button><button class="small-btn" data-action="export-threat">Exportar JSON</button><button class="small-btn" data-action="show-history">Histórico</button><button class="small-btn" data-action="duplicate-threat">Duplicar</button><button class="danger-btn" data-action="delete-threat">Excluir</button></div></div>
    </div>
  </article>`;
}

function renderModal(modal) {
  if (modal.type === "json") {
    const title = modal.mode === "edit" ? "Editar ficha — JSON" : "Importar / criar ameaça";
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><header class="modal-head"><span class="modal-title">${title}</span><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header><div class="modal-content"><label class="modal-label" for="json-input">Modelo JSON da ameaça</label><textarea class="json-editor" id="json-input" spellcheck="false">${escapeHtml(modal.value)}</textarea><div class="help-text">Cole ou edite o objeto JSON. Os campos desconhecidos são preservados em creature e custom. A validação informa o caminho exato dos erros.</div>${modal.error ? `<div class="error-box">${escapeHtml(modal.error)}</div>` : ""}<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px"><button class="small-btn" data-action="copy-template">Copiar modelo</button><button class="small-btn" data-action="load-json-file">Abrir arquivo .json</button><input type="file" id="json-file" accept=".json,application/json" hidden></div></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" data-action="submit-json">${modal.mode === "edit" ? "Validar e salvar" : "Validar e importar"}</button></footer></section></div>`;
  }
  if (modal.type === "condition") {
    const form = modal.form ?? {};
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-label="Aplicar condição"><header class="modal-head"><span class="modal-title">Aplicar condição</span><button class="modal-close" data-action="close-modal">×</button></header><div class="modal-content"><div class="field-grid"><div class="field"><label class="modal-label" for="condition-name">Nome</label><input id="condition-name" placeholder="Nome da condição" value="${escapeHtml(form.name ?? "")}"></div><div class="field"><label class="modal-label" for="condition-duration">Duração / observação</label><input id="condition-duration" placeholder="Ex.: até o fim da cena" value="${escapeHtml(form.duration ?? "")}"></div></div><div class="field" style="margin-top:10px"><label class="modal-label" for="condition-description">Descrição</label><textarea id="condition-description" placeholder="Detalhes da condição">${escapeHtml(form.description ?? "")}</textarea></div><div class="field" style="margin-top:10px"><label class="modal-label" for="condition-modifiers">Modificadores JSON</label><textarea id="condition-modifiers" class="json-editor" style="height:130px;min-height:90px" spellcheck="false">${escapeHtml(form.modifiers ?? "{}")}</textarea><div class="help-text">Exemplo de estrutura: {"defense":-4,"attack":-2,"diceCount":{"attack":-1}}. Os valores são definidos pelo Mestre; o sistema não presume regras oficiais.</div></div>${modal.error ? `<div class="error-box">${escapeHtml(modal.error)}</div>` : ""}</div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" data-action="submit-condition">Aplicar condição</button></footer></section></div>`;
  }
  if (modal.type === "delete") {
    return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><span class="modal-title">Excluir ameaça</span><button class="modal-close" data-action="close-modal">×</button></header><div class="modal-content"><p style="font:13px/1.5 var(--sans)">Excluir <strong>${escapeHtml(selectedRecord()?.creature.name)}</strong>? A ficha e o estado local serão removidos deste navegador.</p></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Cancelar</button><button class="danger-btn" data-action="confirm-delete">Excluir definitivamente</button></footer></section></div>`;
  }
  if (modal.type === "history") {
    const items = [...(selectedRecord()?.runtime.history ?? [])].reverse();
    return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><span class="modal-title">Histórico da ameaça</span><button class="modal-close" data-action="close-modal">×</button></header><div class="modal-content"><div class="history-list">${items.length ? items.map((item) => `<div class="history-line"><time>${escapeHtml(new Date(item.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</time><span>${escapeHtml(item.message)}</span></div>`).join("") : `<div class="condition-empty">Nenhum evento registrado nesta ficha.</div>`}</div></div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Fechar</button></footer></section></div>`;
  }
  if (modal.type === "roll") {
    return `<div class="modal-backdrop"><section class="modal roll-modal" role="dialog" aria-modal="true"><header class="modal-head"><span class="modal-title">${escapeHtml(modal.result?.title ?? "Rolagem")}</span><button class="modal-close" data-action="close-modal">×</button></header><div class="roll-stage"><div class="roll-die ${modal.loading ? "rolling" : ""}">${modal.loading ? "?" : escapeHtml(modal.displayTotal ?? "—")}</div><div class="roll-title">${modal.loading ? "Dados em movimento" : "Resultado"}</div><div class="roll-expression">${escapeHtml(modal.expression ?? "")}</div>${modal.loading ? `<div class="roll-expression">Calculando os dados…</div>` : `<div class="roll-result">${escapeHtml(modal.displayTotal ?? "—")}</div>`}</div><div class="roll-details">${modal.loading ? "Aguardando o resultado da rolagem." : renderRollDetails(modal.result)}</div><footer class="modal-foot"><button class="small-btn" data-action="close-modal">Fechar</button></footer></section></div>`;
  }
  return "";
}

function renderRollDetails(result) {
  if (!result) return "";
  const results = result.kind === "attack" ? [result.test, result.damage].filter(Boolean) : result.roll ? [result.roll] : result.test ? [result.test] : [];
  const title = result.kind === "attack" ? "ATAQUE" : result.kind === "ability" ? "HABILIDADE" : "TESTE";
  let html = `<div><strong>${title}</strong></div>`;
  for (const [index, roll] of results.entries()) {
    html += `<div class="roll-part"><b>${index === 0 ? (result.kind === "attack" ? "Teste de ataque" : "Rolagem") : "Dano"}</b><br>${escapeHtml(roll.expression)} = <strong>${roll.total}</strong><br>${roll.parts.map((part) => part.type === "dice" ? `${part.sign < 0 ? "−" : ""}${part.count}d${part.sides}: [${part.rolls.join(", ")}]` : `Modificador: ${part.value}`).join(" · ")}</div>`;
  }
  if (result.critical) html += `<div class="roll-part">Crítico: ${escapeHtml(result.critical)} · Alcance: ${escapeHtml(result.range)}</div>`;
  if (result.effects) html += `<div class="roll-part">Efeitos: ${escapeHtml(result.effects)}</div>`;
  if (result.description) html += `<div class="roll-part">${escapeHtml(result.description)}</div>`;
  if (!results.length) html += `<div class="roll-part">Esta habilidade não possui uma rolagem associada.</div>`;
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
  if (action === "damage" || action === "heal") {
    if (!record) return;
    const amount = Math.max(0, Math.floor(safeNumber(document.querySelector("#hp-amount")?.value, 0)));
    if (!amount) { showToast("Informe uma quantidade de PV maior que zero.", true); return; }
    await saveRecord(changeHitPoints(record, amount, action === "heal" ? "heal" : "damage"));
    return;
  }
  if (action === "add-condition" && record) { state.modal = { type: "condition", error: "", form: { name: "", duration: "", description: "", modifiers: "{}" } }; render(); return; }
  if (action === "submit-condition" && record) {
    try {
      const name = document.querySelector("#condition-name")?.value ?? "";
      const duration = document.querySelector("#condition-duration")?.value ?? "";
      const description = document.querySelector("#condition-description")?.value ?? "";
      const modifiersText = document.querySelector("#condition-modifiers")?.value ?? "{}";
      const modifiers = JSON.parse(modifiersText);
      const next = addCondition(record, { name, duration, description, modifiers });
      await saveRecord(next); state.modal = null; render(); showToast("Condição aplicada.");
    } catch (error) {
      state.modal.form = {
        name: document.querySelector("#condition-name")?.value ?? "",
        duration: document.querySelector("#condition-duration")?.value ?? "",
        description: document.querySelector("#condition-description")?.value ?? "",
        modifiers: document.querySelector("#condition-modifiers")?.value ?? "{}"
      };
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
  if (action === "roll-attack" && record) {
    const attack = record.creature.attacks.find((entry) => entry.id === control.dataset.id);
    if (attack) startRoll(record, () => rollAttack(record, attack), `${attack.test || ""} ${attack.damage ? `· ${attack.damage}` : ""}`, attack.name || "Ataque");
    return;
  }
  if (action === "use-ability" && record) {
    const group = control.dataset.kind || "abilities";
    const ability = (record.creature[group] ?? []).find((entry) => entry.id === control.dataset.id);
    if (!ability) return;
    const resourceId = ability.resourceId;
    const cost = Math.max(0, Math.floor(safeNumber(ability.resourceCost, 0)));
    let currentRecord = record;
    if (resourceId && cost) {
      const current = record.runtime.resources[resourceId] ?? 0;
      if (current < cost) { showToast("Recurso insuficiente para executar esta habilidade.", true); return; }
      currentRecord = changeResource(record, resourceId, -cost);
      await saveRecord(currentRecord);
    }
    startRoll(currentRecord, () => rollAbility(currentRecord, ability), ability.roll || "Sem rolagem", ability.name || "Habilidade");
    return;
  }
  if (action === "roll-stat") {
    const expression = control.dataset.expression;
    if (expression) startRoll(record, () => rollStandalone(expression), expression, control.dataset.title || "Teste");
    return;
  }
}

function startRoll(record, calculate, expression, title) {
  if (state.rollBusy) return;
  state.rollBusy = true;
  state.modal = { type: "roll", loading: true, expression, result: { title }, displayTotal: "?" };
  render();
  window.setTimeout(async () => {
    try {
      const result = calculate();
      if (record && record.id === selectedRecord()?.id) {
        const next = structuredClone(record);
        const testTotal = result.kind === "attack" ? result.test.total : result.roll?.total ?? result.total;
        pushHistory(next, `${title}: ${testTotal ?? "consulta"}.`);
        await saveRecord(next);
      }
      state.modal = { type: "roll", loading: false, expression, result, title, displayTotal: result.kind === "attack" ? result.test.total : result.roll?.total ?? result.total };
    } catch (error) {
      state.modal = { type: "roll", loading: false, expression, title, result: { title, description: error.message }, displayTotal: "ERRO" };
    }
    state.rollBusy = false;
    render();
  }, 650);
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
  if (state.modal?.type === "condition") {
    state.modal.form = {
      name: ROOT.querySelector("#condition-name")?.value ?? "",
      duration: ROOT.querySelector("#condition-duration")?.value ?? "",
      description: ROOT.querySelector("#condition-description")?.value ?? "",
      modifiers: ROOT.querySelector("#condition-modifiers")?.value ?? "{}"
    };
  }
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

function replayBufferedReady() {
  if (OBR.isReady) return;
  const pending = window.__OL_OBR_READY_BUFFER__;
  if (!pending || pending.replayed) return;
  pending.replayed = true;
  window.dispatchEvent(new MessageEvent("message", { data: pending.data, origin: pending.origin }));
}

replayBufferedReady();
const readyTimeout = window.setTimeout(() => {
  if (!OBR.isReady && state.role === null) {
    state.role = "ERROR";
    ROOT.innerHTML = `<section class="access-denied"><div class="access-card"><h1>Owlbear não inicializou</h1><p>Abra esta extensão dentro de uma sala do Owlbear Rodeo e confirme que a URL do manifesto está acessível.</p></div></section>`;
  }
}, 15000);

OBR.onReady(async () => {
  window.clearTimeout(readyTimeout);
  try {
    if (!OBR.isAvailable) throw new Error("A extensão não está incorporada ao Owlbear Rodeo.");
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
    ROOT.innerHTML = `<section class="access-denied"><div class="access-card"><h1>Falha ao inicializar</h1><p>${escapeHtml(error.message)}</p></div></section>`;
  }
});
