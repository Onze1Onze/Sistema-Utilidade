import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { createLockPuzzle, getLockPinMotion, LOCK_PRESETS } from "./game-logic.js";

// A interface é renderizada antes da conexão; o SDK estático registra OBR_READY no carregamento do módulo.
let sdkReady = false;
let sdkError = null;
let sdkInitResult = null;
let resolveSdkInit;
const sdkInitPromise = new Promise((resolve) => { resolveSdkInit = resolve; });
function completeSdkInit(result) {
  if (sdkInitResult !== null) return;
  sdkInitResult = result;
  resolveSdkInit(result);
}
async function ensureObrReady() {
  if (sdkReady && OBR.isReady) return OBR;
  const result = await sdkInitPromise;
  if (!result?.ok) throw result?.error || new Error("O Owlbear não concluiu a inicialização.");
  return OBR;
}
const META_KEY = "com.onze11.sistema-utilidade/session";
const CHANNEL = "com.onze11.sistema-utilidade/v1";
const SECRET_PREFIX = "com.onze11.sistema-utilidade/secret/";
const HACK_PRESETS = {
  1: { rows: 4, columns: 6, sequenceLength: 3 },
  2: { rows: 5, columns: 6, sequenceLength: 3 },
  3: { rows: 5, columns: 7, sequenceLength: 4 },
  4: { rows: 6, columns: 8, sequenceLength: 5 },
  5: { rows: 6, columns: 8, sequenceLength: 6 }
};
function randomHex(random = Math.random) {
  return Math.floor(random() * 256).toString(16).padStart(2, "0").toUpperCase();
}
function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function normalizePin(value) {
  return String(value ?? "").replace(/[^0-9]/g, "").slice(0, 8);
}
function createSessionId(random = Math.random) {
  return Array.from({length:16}, () => Math.floor(random()*256).toString(16).padStart(2,"0")).join("");
}
function makeHackPuzzle(config, random = Math.random) {
  const rows = clampInteger(config.rows,4,8,6);
  const columns = clampInteger(config.columns,4,8,8);
  const length = clampInteger(config.sequenceLength,3,Math.min(6,rows+columns-1),4);
  const board = Array.from({length:rows},()=>Array.from({length:columns},()=>randomHex(random)));
  const starts=[];
  for(let r=0;r<rows;r++) for(let c=0;c<columns;c++) starts.push([r,c]);
  for(let i=starts.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[starts[i],starts[j]]=[starts[j],starts[i]];}
  function find(path){
    if(path.length===length) return path;
    const [pr,pc]=path[path.length-1];
    const choices=[];
    if(path.length%2===1){
      for(let r=0;r<rows;r++) if(r!==pr&&!path.some(([ur,uc])=>ur===r&&uc===pc)) choices.push([r,pc]);
    }else{
      for(let c=0;c<columns;c++) if(c!==pc&&!path.some(([ur,uc])=>ur===pr&&uc===c)) choices.push([pr,c]);
    }
    for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
    for(const choice of choices){const found=find([...path,choice]);if(found)return found;}
    return null;
  }
  let path=null;
  for(const start of starts){path=find([start]);if(path)break;}
  if(!path) throw new Error("Não foi possível gerar uma matriz solucionável.");
  const target=Array.from({length},()=>randomHex(random));
  path.forEach(([r,c],i)=>{board[r][c]=target[i];});
  return {rows,columns,sequenceLength:length,board,target};
}

const root = document.querySelector("#app");
const state = {
  role: "GM", session: null, mode: "lock", collapsed: false, advanced: false,
  pinCount: 5, picks: 7, lockPrecision: 88, lockCycleMs: 1350, lockSpeedVariation: 650,
  rows: 5, columns: 7, length: 4, pin: "", path: [], pinInput: "",
  waiting: false, result: null, picksLeft: 0, lockedPins: [], notice: "",
  lastAttempt: null, pendingRequestId: null, lockStartedAt: 0
};
let connectionId = "";
let timeout = null;
let lockAnimationFrame = null;
const WAIT_MS = 10000;


// A inicialização antiga é substituída por bootOwlbear(), chamado depois de renderizar.

function resetPlayerSessionState(session) {
  state.path = [];
  state.pinInput = "";
  state.result = null;
  state.waiting = false;
  state.picksLeft = session?.publicConfig?.picks ?? 0;
  state.lockedPins = session?.game === "lock"
    ? Array.from({ length: session.publicConfig.pinCount }, () => false)
    : [];
  state.lockStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
}
function acceptSession(session) {
  if (JSON.stringify(session) === JSON.stringify(state.session)) return;
  state.session = session;
  resetPlayerSessionState(session);
  state.lastAttempt = null;
  state.pendingRequestId = null;
  clearTimeout(timeout);
  render();
}
function shell(content) {
  return '<section class="frame"><header class="top"><span class="mark"></span><span>INTERFACE DE CONTROLE</span><span class="lights">▰ ▰ ▰ ▰</span></header><div class="workspace"><aside class="sidebar ' + (state.collapsed ? "small" : "") + '"><button class="collapse" data-action="collapse" aria-label="Recolher menu">' + (state.collapsed ? "»" : "«") + '</button>' +
    nav("lock", "♙", "Abrir Fechadura") + nav("hack", "⌘", "Hacking") + nav("pin", "▦", "Painel Numérico") +
    '</aside><main class="content"><div class="content-inner">' + noticeMarkup() + content + '</div></main></div><footer>◉  Interagir <span>ESC  Fechar</span></footer></section>';
}
function nav(mode, symbol, label) {
  return '<button class="nav ' + (state.mode === mode ? "active" : "") + '" data-mode="' + mode + '"><b>' + symbol + '</b><span>' + label + '</span><i>›</i></button>';
}
function render() {
  stopLockAnimation();
  if (state.role === "GM") {
    root.innerHTML = shell(state.session?.status === "active" ? masterActive() : masterConfig());
    return;
  }
  if (!validPublicSession(state.session)) { root.innerHTML = ""; return; }
  root.innerHTML = playerShell(playerGame());
  if (state.session.game === "lock") startLockAnimation();
}
function stopLockAnimation() {
  if (lockAnimationFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(lockAnimationFrame);
  }
  lockAnimationFrame = null;
}
function startLockAnimation() {
  if (typeof requestAnimationFrame !== "function") return;
  const update = () => {
    if (state.role !== "PLAYER" || state.session?.game !== "lock") {
      lockAnimationFrame = null;
      return;
    }
    const pins = state.session.publicConfig.pins || [];
    const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - state.lockStartedAt;
    root.querySelectorAll(".lock-pin[data-pin-index]").forEach((button) => {
      const index = Number(button.dataset.pinIndex);
      const pin = pins[index];
      if (!pin || state.lockedPins[index]) return;
      const track = button.querySelector(".lock-pin-track");
      const tumbler = button.querySelector(".lock-tumbler");
      if (!track || !tumbler) return;
      const motion = getLockPinMotion(pin, elapsed);
      const travel = Math.max(0, track.clientHeight - tumbler.offsetHeight - 12);
      tumbler.style.transform = "translateY(-" + (motion.position * travel).toFixed(2) + "px)";
      button.dataset.rising = String(motion.rising);
      button.dataset.position = motion.position.toFixed(3);
    });
    lockAnimationFrame = requestAnimationFrame(update);
  };
  update();
}
function getCurrentLockPinMotion(pinIndex) {
  const pin = state.session?.publicConfig?.pins?.[pinIndex];
  if (!pin) return { position: 0, rising: false };
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return getLockPinMotion(pin, now - state.lockStartedAt);
}
function playerShell(content) {
  return '<section class="frame player-frame"><header class="top"><span class="mark"></span><span>TERMINAL DE ACESSO</span><span class="lights">▰ ▰ ▰ ▰</span></header><main class="player-content"><div class="content-inner">' + noticeMarkup() + content + '</div></main><footer>ESC  Fechar</footer></section>';
}
function validPublicSession(session) {
  if (!session || session.status !== "active" || typeof session.sessionId !== "string") return false;
  if (session.game === "lock") {
    const config = session.publicConfig;
    return Number.isInteger(config?.picks) && config.picks >= 1 && config.picks <= 15
      && Number.isInteger(config?.pinCount) && config.pinCount >= 3 && config.pinCount <= 8
      && Array.isArray(config.pins) && config.pins.length === config.pinCount
      && config.pins.every((pin) => Number.isInteger(pin.cycleDurationMs)
        && pin.cycleDurationMs >= 650 && pin.cycleDurationMs <= 3400
        && Number.isFinite(pin.phaseOffsetMs) && pin.phaseOffsetMs >= 0 && pin.phaseOffsetMs < pin.cycleDurationMs);
  }
  if (session.game === "pin") return Number.isInteger(session.publicConfig?.codeLength) && session.publicConfig.codeLength >= 3 && session.publicConfig.codeLength <= 8;
  if (session.game === "hack") {
    const puzzle = session.publicConfig?.puzzle;
    return Number.isInteger(puzzle?.rows) && Number.isInteger(puzzle?.columns)
      && puzzle.rows >= 4 && puzzle.rows <= 8 && puzzle.columns >= 4 && puzzle.columns <= 8
      && Array.isArray(puzzle.board) && puzzle.board.length === puzzle.rows
      && puzzle.board.every((row) => Array.isArray(row) && row.length === puzzle.columns && row.every((value) => typeof value === "string"))
      && Array.isArray(puzzle.target) && puzzle.target.length === puzzle.sequenceLength
      && Number.isInteger(puzzle.sequenceLength) && puzzle.sequenceLength >= 3 && puzzle.sequenceLength <= 6;
  }
  return false;
}
function masterActive() {
  const label = state.session.game === "lock" ? "ABRIR FECHADURA" : state.session.game === "hack" ? "HACKING" : "PAINEL NUMÉRICO";
  const activity = state.lastAttempt
    ? '<section class="gm-attempt ' + escapeHTML(state.lastAttempt.status || "processing") + '"><div class="gm-attempt-head"><b>' + escapeHTML(state.lastAttempt.playerLabel || "JOGADOR") + '</b><span>' + escapeHTML(state.lastAttempt.statusLabel || "PROCESSANDO") + '</span></div><p>' + escapeHTML(state.lastAttempt.responseText || "Tentativa recebida.") + '</p>' + (state.lastAttempt.remaining !== null && state.lastAttempt.remaining !== undefined ? '<small>GAZUAS RESTANTES: ' + Number(state.lastAttempt.remaining) + '</small>' : '') +
      (state.lastAttempt.lockedCount !== null && state.lastAttempt.lockedCount !== undefined ? '<small>PINOS TRAVADOS: ' + Number(state.lastAttempt.lockedCount) + '/' + Number(state.lastAttempt.pinCount || state.lastAttempt.lockedCount) + '</small>' : '') + '</section>'
    : '<section class="gm-attempt idle"><div class="gm-attempt-head"><b>JOGADORES</b><span>AGUARDANDO</span></div><p>Aguardando a primeira tentativa.</p></section>';
  return '<div class="heading"><div><h1>' + label + '</h1><p>Desafio liberado para os jogadores.</p></div><span class="tag">ATIVO</span></div><section class="card active-card"><div class="big-mark">✓</div><h2>Desafio em andamento</h2><p>As tentativas dos jogadores aparecerão aqui.</p>' + activity + '<button class="danger" data-action="end">Encerrar minijogo</button></section>';
}
function masterConfig() {
  let body = state.mode === "lock" ? lockConfig() : state.mode === "hack" ? hackConfig() : pinConfig();
  return '<div class="heading"><div><h1>' + (state.mode === "lock" ? "ABRIR FECHADURA" : state.mode === "hack" ? "HACKING" : "PAINEL NUMÉRICO") + '</h1><p>Configure o desafio antes de liberar o acesso.</p></div><span class="tag">MESTRE</span></div>' + body;
}
function presets(mode, chosen) {
  return '<div class="presets">' + [1,2,3,4,5].map((v) => '<button data-preset="' + mode + ':' + v + '" class="' + (v === chosen ? "chosen" : "") + '">' + v + '</button>').join("") + '</div>';
}
function slider(id, label, value, min, max, suffix) {
  return '<label class="slider"><span>' + label + '<b id="' + id + '-value">' + value + suffix + '</b></span><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + value + '"></label>';
}
function lockConfig() {
  const pinPreview = Array.from({ length: state.pinCount }, (_, index) =>
    '<span class="lock-preview-pin"><i></i><small>' + String(index + 1).padStart(2, "0") + '</small></span>'
  ).join("");
  const advanced = state.advanced
    ? slider("pin-count", "Quantidade de pinos", state.pinCount, 3, 8, "")
      + slider("picks", "Gazuas disponíveis", state.picks, 1, 15, "")
      + slider("lock-precision", "Janela de acerto", state.lockPrecision, 70, 98, "%")
      + slider("lock-cycle", "Velocidade-base", state.lockCycleMs, 650, 2200, " ms")
      + slider("lock-variance", "Variação entre pinos", state.lockSpeedVariation, 0, 1200, " ms")
    : "";
  return '<div class="config-grid"><section class="card"><h2>Dificuldade predefinida</h2>' + presets("lock", state.lockLevel || 3) +
    '<div class="stats"><span>Pinos <b id="lock-pins-summary">' + state.pinCount + '</b></span><span>Gazuas <b id="lock-picks-summary">' + state.picks + '</b></span><span>Janela <b id="lock-precision-summary">' + state.lockPrecision + '%</b></span></div>' +
    '<button class="plain" data-action="advanced">' + (state.advanced ? "− Ocultar ajustes" : "+ Ajustar detalhes") + '</button>' +
    advanced +
    '<button class="primary" data-action="publish">Preparar e liberar</button></section><section class="preview lock-config-preview"><div class="lock-preview-pins">' + pinPreview + '</div><p>Pressione cada pino quando estiver subindo e alcançar o topo. Um erro consome uma gazua.</p></section></div>';
}
function hackConfig() {
  return '<div class="config-grid"><section class="card"><h2>Dificuldade predefinida</h2>' + presets("hack", state.hackLevel || 3) +
  '<div class="stats"><span>Matriz <b id="matrix-value">' + state.columns + ' × ' + state.rows + '</b></span><span>Buffer <b id="buffer-value">' + state.length + '</b></span></div>' +
  '<button class="plain" data-action="advanced">' + (state.advanced ? "− Ocultar ajustes" : "+ Ajustar detalhes") + '</button>' +
  (state.advanced ? slider("rows", "Linhas", state.rows, 4, 8, "") + slider("columns", "Colunas", state.columns, 4, 8, "") + slider("length", "Tamanho do buffer", state.length, 3, 6, " códigos") : "") +
  '<button class="primary" data-action="publish">Preparar e liberar</button></section><section class="preview"><div class="preview-grid">' + Array.from({length:16}, () => "<i></i>").join("") + '</div><p>O jogador percorre a matriz alternando coluna e linha para completar a sequência-alvo.</p></section></div>';
}
function pinConfig() {
  return '<div class="config-grid pin-config"><section class="card"><h2>Código de acesso</h2><label class="pin-label" for="pin">Senha numérica</label><input class="pin-entry" id="pin" type="password" inputmode="numeric" maxlength="8" placeholder="Mínimo de 3 dígitos" value="' + state.pin + '"><p class="muted">A senha fica somente no dispositivo do mestre e não é publicada na sala.</p><button class="primary" data-action="publish" ' + (state.pin.length < 3 ? "disabled" : "") + '>Preparar e liberar</button></section><section class="preview"><div class="pin-preview">• • • •</div><p>O jogador digita a senha no teclado numérico. O acesso é validado pelo mestre.</p></section></div>';
}
function playerGame() {
  const game = state.session.game;
  const title = game === "lock" ? "Abrir Fechadura" : game === "hack" ? "Hackear Sistema" : "Painel Numérico";
  return '<div class="game-head"><div><h1>' + title + '</h1><p>' + (game === "lock" ? "Ajuste a ferramenta e encontre o ponto de pressão." : game === "hack" ? "Selecione os códigos na ordem correta." : "Insira a senha para destrancar.") + '</p></div></div>' +
    (game === "lock" ? lockPlayer() : game === "hack" ? hackPlayer() : pinPlayer());
}
function lockPlayer() {
  const config = state.session.publicConfig;
  const pins = config.pins || [];
  const locked = state.lockedPins || [];
  const lockedCount = locked.filter(Boolean).length;
  const pinMarkup = pins.map((pin, index) => {
    const isLocked = Boolean(locked[index]);
    const disabled = isLocked || state.waiting || state.result?.finished;
    return '<button type="button" class="lock-pin ' + (isLocked ? "locked" : "") + '" data-pin-index="' + index + '" ' + (disabled ? "disabled" : "") + ' aria-label="Pino ' + (index + 1) + (isLocked ? ", travado" : ", pressione quando atingir o topo na subida") + '">' +
      '<span class="lock-pin-label">PINO ' + String(index + 1).padStart(2, "0") + '</span>' +
      '<span class="lock-pin-track"><i class="lock-pin-target"></i><i class="lock-pin-slot"></i><i class="lock-tumbler"><b></b></i></span>' +
      '<span class="lock-pin-state">' + (isLocked ? "TRAVADO" : "EM MOVIMENTO") + '</span></button>';
  }).join("");
  const picks = Array.from({ length: config.picks }, (_, index) =>
    '<i class="' + (index >= state.picksLeft ? "used" : "") + '"></i>'
  ).join("");
  return '<div class="lock-oblivion">' +
    '<div class="lock-status-strip"><span>Pinos <b>' + lockedCount + '/' + config.pinCount + '</b></span><span>Gazuas <b>' + state.picksLeft + '/' + config.picks + '</b></span><span class="lock-pick-icons">' + picks + '</span></div>' +
    '<p class="lock-instruction">Clique em cada pino no instante em que alcançar o topo durante a subida.</p>' +
    '<div class="lock-pin-grid">' + pinMarkup + '</div>' +
    '<div class="lock-result">' + resultMarkup() + '</div></div>';
}
function hackPlayer() {
  const puzzle = state.session.publicConfig.puzzle;
  const selected = new Set(state.path.map(([r,c]) => r + ":" + c));
  return '<div class="hack-game"><div class="matrix" style="grid-template-columns:repeat(' + puzzle.columns + ',minmax(0,1fr))">' +
    puzzle.board.map((row,r) => row.map((value,c) => '<button class="cell ' + (selected.has(r+":"+c) ? "selected" : "") + '" data-cell="' + r + ':' + c + '" ' + (state.waiting || state.result?.success || state.path.length >= puzzle.sequenceLength || selected.has(r+":"+c) || !canSelect(r,c) ? "disabled" : "") + '>' + value + '</button>').join("")).join("") +
    '</div><aside class="target"><b>SEQUÊNCIA ALVO</b><div>' + puzzle.target.map((v,i) => '<span class="' + (i < state.path.length ? "done" : "") + '">' + v + '</span>').join("") + '</div><small>BUFFER ' + state.path.length + '/' + puzzle.sequenceLength + '</small><button class="plain" data-action="reset" ' + (!state.path.length || state.waiting ? "disabled" : "") + '>Limpar</button></aside>' + resultMarkup() + '</div>';
}
function pinPlayer() {
  const length = state.session.publicConfig.codeLength;
  return '<div class="pin-game"><div class="pin-dots">' + Array.from({length}, (_,i) => '<i class="' + (i < state.pinInput.length ? "filled" : "") + '"></i>').join("") + '</div><div class="keypad">' +
    ["1","2","3","4","5","6","7","8","9","clear","0","enter"].map((v) => '<button data-key="' + v + '" ' + (state.waiting || state.result?.success || (v === "enter" && state.pinInput.length !== length) || (v !== "clear" && v !== "enter" && state.pinInput.length >= length) ? "disabled" : "") + '>' + (v === "clear" ? "⌫" : v === "enter" ? "OK" : v) + '</button>').join("") +
    '</div>' + resultMarkup() + '</div>';
}
function resultMarkup() {
  if (state.waiting) return '<p class="feedback">Verificando…</p>';
  if (!state.result) return "";
  return '<p class="feedback ' + (state.result.success ? "success" : "error") + '">' + escapeHTML(state.result.responseText || (state.result.success ? "Acesso liberado." : "Acesso negado.")) + '</p>';
}
function canSelect(row, col) {
  if (!state.path.length) return true;
  const [r,c] = state.path[state.path.length - 1];
  return state.path.length % 2 === 1 ? col === c && row !== r : row === r && col !== c;
}
function noticeMarkup() {
  return state.notice ? '<div class="ui-notice" role="status">' + escapeHTML(state.notice) + '</div>' : '';
}
function showNotice(message) {
  state.notice = String(message || "Não foi possível concluir a operação.");
  render();
}
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    OBR?.action?.close?.().catch((error) => console.warn("Não foi possível fechar a extensão:", error));
  }
});

root.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.mode) { state.mode = button.dataset.mode; state.advanced = false; render(); return; }
  if (button.dataset.preset) {
    const [mode, levelText] = button.dataset.preset.split(":"); const level = Number(levelText);
    if (mode === "lock") { state.lockLevel = level; Object.assign(state, LOCK_PRESETS[level]); }
    else { state.hackLevel = level; Object.assign(state, { rows:HACK_PRESETS[level].rows, columns:HACK_PRESETS[level].columns, length:HACK_PRESETS[level].sequenceLength }); }
    render(); return;
  }
  const action = button.dataset.action;
  if (action === "collapse") { state.collapsed = !state.collapsed; render(); }
  if (action === "advanced") { state.advanced = !state.advanced; render(); }
  if (action === "publish") await publish();
  if (action === "end") await endSession();
  if (button.dataset.pinIndex !== undefined) {
    const pinIndex = Number(button.dataset.pinIndex);
    if (!Number.isInteger(pinIndex) || state.lockedPins[pinIndex] || state.waiting || state.result?.finished) return;
    const motion = getCurrentLockPinMotion(pinIndex);
    sendAttempt({
      kind:"lock-pin",
      pinIndex,
      position:Number(motion.position.toFixed(3)),
      rising:motion.rising
    });
    return;
  }
  if (action === "reset") { state.path=[]; render(); }
  if (button.dataset.cell) {
    const [r,c] = button.dataset.cell.split(":").map(Number); if (!canSelect(r,c)) return;
    state.path.push([r,c]);
    if (state.path.length >= state.session.publicConfig.puzzle.sequenceLength) sendAttempt({kind:"hack",path:state.path});
    else render();
  }
  if (button.dataset.key) {
    const key = button.dataset.key;
    if (key === "clear") state.pinInput = "";
    else if (key === "enter") sendAttempt({kind:"pin",code:state.pinInput});
    else state.pinInput += key;
    if (key !== "enter") render();
  }
});
root.addEventListener("input", (event) => {
  const id = event.target.id, value = Number(event.target.value);
  if (id === "angle") { state.angle = value; document.querySelector("#angle-value").textContent = value + "°"; document.querySelector(".needle").style.transform = "rotate(" + value + "deg)"; }
  if (id === "pin") { state.pin = normalizePin(event.target.value); event.target.value = state.pin; document.querySelector('[data-action="publish"]').disabled = state.pin.length < 3; }
  if (id === "tolerance") { state.tolerance=value; document.querySelector("#tolerance-value").textContent=value+"°"; }
  if (id === "picks") {
    state.picks=value;
    const output=document.querySelector("#picks-value"); if(output) output.textContent=value;
    const summary=document.querySelector("#lock-picks-summary"); if(summary) summary.textContent=value;
  }
  if (id === "pin-count") {
    state.pinCount=value;
    const output=document.querySelector("#pin-count-value"); if(output) output.textContent=value;
    const summary=document.querySelector("#lock-pins-summary"); if(summary) summary.textContent=value;
  }
  if (id === "lock-precision") {
    state.lockPrecision=value;
    const output=document.querySelector("#lock-precision-value"); if(output) output.textContent=value+"%";
    const summary=document.querySelector("#lock-precision-summary"); if(summary) summary.textContent=value+"%";
  }
  if (id === "lock-cycle") {
    state.lockCycleMs=value;
    const output=document.querySelector("#lock-cycle-value"); if(output) output.textContent=value+" ms";
  }
  if (id === "lock-variance") {
    state.lockSpeedVariation=value;
    const output=document.querySelector("#lock-variance-value"); if(output) output.textContent=value+" ms";
  }
  if (id === "rows") { state.rows=value; document.querySelector("#matrix-value").textContent=state.columns+" × "+state.rows; }
  if (id === "columns") { state.columns=value; document.querySelector("#matrix-value").textContent=state.columns+" × "+state.rows; }
  if (id === "length") { state.length=value; document.querySelector("#length-value").textContent=value+" códigos"; document.querySelector("#buffer-value").textContent=value; }
});
async function publish() {
  try {
    await ensureObrReady();
    let game, publicConfig, secret;
    if (state.mode === "lock") {
      game="lock";
      const puzzle=createLockPuzzle({
        pinCount:state.pinCount,
        picks:state.picks,
        lockPrecision:state.lockPrecision,
        cycleMs:state.lockCycleMs,
        speedVariationMs:state.lockSpeedVariation
      });
      publicConfig={
        pinCount:puzzle.pinCount,
        picks:puzzle.picks,
        pins:puzzle.pins.map((pin)=>({...pin}))
      };
      secret={
        pins:puzzle.pins,
        hitThreshold:puzzle.hitThreshold,
        picksLeft:puzzle.picks,
        lockedPins:Array.from({length:puzzle.pinCount},()=>false)
      };
    }
    else if (state.mode === "hack") { game="hack"; const puzzle=makeHackPuzzle({rows:state.rows,columns:state.columns,sequenceLength:state.length}); publicConfig={puzzle}; secret={puzzle}; }
    else { const code=normalizePin(state.pin); if(code.length<3) throw new Error("A senha precisa ter ao menos 3 dígitos."); game="pin"; publicConfig={codeLength:code.length}; secret={code}; }
    const sessionId=createSessionId(); localStorage.setItem(SECRET_PREFIX+sessionId,JSON.stringify({...secret,game,finished:false}));
    try { await OBR.room.setMetadata({[META_KEY]:{status:"active",sessionId,game,publicConfig,createdAt:Date.now()}}); }
    catch(error){localStorage.removeItem(SECRET_PREFIX+sessionId);throw error;}
    OBR.notification.show("Minijogo liberado para os jogadores","SUCCESS");
  } catch(error) { showNotice(error.message || "Não foi possível publicar o desafio."); OBR?.notification?.show?.(error.message || "Não foi possível publicar o desafio.","ERROR"); }
}
async function endSession() {
  try { await ensureObrReady(); }
  catch (error) { showNotice(error.message || "O Owlbear não está conectado."); return; }
  const id=state.session?.sessionId;
  await OBR.room.setMetadata({[META_KEY]:{status:"idle",sessionId:null,endedAt:Date.now()}});
  if(id) localStorage.removeItem(SECRET_PREFIX+id);
  OBR.notification.show("Minijogo encerrado","INFO");
}
async function sendAttempt(attempt) {
  if(state.waiting || state.result?.finished) return;
  try { await ensureObrReady(); }
  catch (error) { state.result={success:false,responseText:error.message || "Conexão com o Owlbear indisponível.",finished:false}; render(); return; }
  const requestId = createSessionId();
  state.pendingRequestId = requestId;
  state.waiting=true; state.result=null; render();
  clearTimeout(timeout);
  timeout=setTimeout(()=>{
    state.waiting=false;
    state.pendingRequestId=null;
    state.result={success:false,responseText:"O mestre não respondeu. Confirme se a extensão dele continua aberta e tente novamente.",finished:false};
    render();
  },WAIT_MS);
  try {
    await OBR.broadcast.sendMessage(CHANNEL,{
      type:"attempt",
      requestId,
      sessionId:state.session.sessionId,
      game:state.session.game,
      ...attempt
    },{destination:"REMOTE"});
  } catch(error){
    clearTimeout(timeout); timeout=null;
    state.waiting=false; state.pendingRequestId=null;
    state.result={success:false,responseText:"Não foi possível enviar a tentativa. Verifique a conexão.",finished:false};
    render();
  }
}
async function onMessage(event) {
  const message=event?.data;
  if(!message || typeof message!=="object") return;

  if(state.role==="GM"){
    if(message.sessionId!==state.session?.sessionId || message.game!==state.session?.game) return;
    if(message.type==="attempt"){
      state.lastAttempt={
        status:"processing",
        statusLabel:"RECEBIDA",
        playerLabel:"JOGADOR · "+String(event.connectionId || "").slice(-6),
        responseText:"Tentativa recebida. Aguardando validação.",
        remaining:null,
        requestId:message.requestId
      };
      render();
      return;
    }
    if(message.type==="master-status"){
      state.lastAttempt={
        status:message.success?"success":(message.finished?"failed":"error"),
        statusLabel:message.success?"DESTRANCADO":(message.finished?"ENCERRADO":"TENTATIVA"),
        playerLabel:"JOGADOR · "+String(message.playerConnectionId || event.connectionId || "").slice(-6),
        responseText:String(message.responseText || "Tentativa processada."),
        remaining:message.remaining,
        lockedCount:message.lockedCount,
        pinCount:message.pinCount,
        requestId:message.requestId
      };
      render();
    }
    return;
  }

  if(message.type!=="result" || message.targetConnectionId!==connectionId) return;
  if(message.sessionId!==state.session?.sessionId || message.game!==state.session?.game) return;
  if(!state.pendingRequestId || message.requestId!==state.pendingRequestId) return;
  clearTimeout(timeout); timeout=null; state.waiting=false; state.pendingRequestId=null; state.result=message;
  if(message.remaining!==null && message.remaining!==undefined) state.picksLeft=message.remaining;
  if(Array.isArray(message.lockedPins)) state.lockedPins=[...message.lockedPins];
  render();
}

// O SDK é importado estaticamente para registrar seu listener de mensagens
// antes de o Owlbear enviar o evento único OBR_READY.
function replayBufferedOwlbearReady() {
  if (OBR.isReady) return;
  const pending = window.__OBR_READY_BUFFER__;
  if (!pending || pending.replayed) return;
  pending.replayed = true;
  window.dispatchEvent(new MessageEvent("message", {
    data: pending.data,
    origin: pending.origin
  }));
}

render();
replayBufferedOwlbearReady();

let readyTimeout = setTimeout(() => {
  if (sdkReady) return;
  const hasRef = new URLSearchParams(window.location.search).has("obrref");
  const pendingReady = window.__OBR_READY_BUFFER__;
  const detail = !hasRef
    ? "A URL da extensão chegou sem o parâmetro obrref do Owlbear."
    : pendingReady?.replayed
      ? "O evento OBR_READY foi capturado, mas o SDK não aceitou sua origem. O obrref e a origem enviada pelo Owlbear não coincidem."
      : "O Owlbear ainda não enviou OBR_READY.";
  sdkError = new Error(detail);
  completeSdkInit({ok:false,error:sdkError});
  showNotice("Interface pronta, mas a integração não foi inicializada. " + detail);
}, 12000);

OBR.onReady(async () => {
  clearTimeout(readyTimeout);
  try {
    if (!OBR.isAvailable) {
      throw new Error("OBR.isAvailable=false: confira se esta página foi aberta pelo popover do Owlbear Rodeo e se a URL preservou obrref.");
    }
    state.role = await OBR.player.getRole();
    connectionId = await OBR.player.getConnectionId();
    OBR.room.onMetadataChange((metadata) => acceptSession(metadata?.[META_KEY] ?? null));
    OBR.broadcast.onMessage(CHANNEL, onMessage);
    const initialMetadata = await OBR.room.getMetadata();
    state.session = initialMetadata?.[META_KEY] ?? null;
    state.path = [];
    state.pinInput = "";
    state.result = null;
    state.waiting = false;
    resetPlayerSessionState(state.session);
    state.notice = "";
    sdkReady = true;
    sdkError = null;
    render();
    completeSdkInit({ok:true});
  } catch (error) {
    sdkReady = false;
    sdkError = error;
    completeSdkInit({ok:false,error});
    console.error("[Sistema de Fechaduras] Falha ao conectar ao Owlbear:", error);
    showNotice("A interface abriu, mas a conexão com Owlbear falhou: " + (error?.message || "erro desconhecido"));
  }
});
