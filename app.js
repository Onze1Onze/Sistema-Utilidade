// A interface não depende da rede para aparecer. O SDK é carregado em segundo plano.
let OBR = null;
let sdkReady = false;
let sdkError = null;
const META_KEY = "com.onze11.sistema-utilidade/session";
const CHANNEL = "com.onze11.sistema-utilidade/v1";
const SECRET_PREFIX = "com.onze11.sistema-utilidade/secret/";
const LOCK_PRESETS = {
  1: { tolerance: 34, picks: 7 },
  2: { tolerance: 26, picks: 6 },
  3: { tolerance: 19, picks: 5 },
  4: { tolerance: 12, picks: 4 },
  5: { tolerance: 7, picks: 3 }
};
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
const state = { role: "GM", session: null, mode: "lock", collapsed: false, advanced: false, tolerance: 19, picks: 5, rows: 5, columns: 7, length: 4, pin: "", angle: 0, path: [], pinInput: "", waiting: false, result: null, picksLeft: 0, notice: "" };
let connectionId = "";
let timeout = null;
const WAIT_MS = 10000;

// A inicialização antiga é substituída por bootOwlbear(), chamado depois de renderizar.

function acceptSession(session) {
  if (JSON.stringify(session) === JSON.stringify(state.session)) return;
  state.session = session;
  state.path = [];
  state.pinInput = "";
  state.result = null;
  state.waiting = false;
  state.picksLeft = session?.publicConfig?.picks ?? 0;
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
  if (state.role === "GM") {
    root.innerHTML = shell(state.session?.status === "active" ? masterActive() : masterConfig());
    return;
  }
  if (!validPublicSession(state.session)) { root.innerHTML = ""; return; }
  root.innerHTML = playerShell(playerGame());
}
function playerShell(content) {
  return '<section class="frame player-frame"><header class="top"><span class="mark"></span><span>TERMINAL DE ACESSO</span><span class="lights">▰ ▰ ▰ ▰</span></header><main class="player-content"><div class="content-inner">' + noticeMarkup() + content + '</div></main><footer>ESC  Fechar</footer></section>';
}
function validPublicSession(session) {
  if (!session || session.status !== "active" || typeof session.sessionId !== "string") return false;
  if (session.game === "lock") return Number.isInteger(session.publicConfig?.picks) && session.publicConfig.picks >= 1 && session.publicConfig.picks <= 10;
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
  return '<div class="heading"><div><h1>' + label + '</h1><p>Desafio liberado para os jogadores.</p></div><span class="tag">ATIVO</span></div><section class="card active-card"><div class="big-mark">✓</div><h2>Desafio em andamento</h2><p>Os jogadores estão vendo o minijogo. Encerre a sessão para preparar outro desafio.</p><button class="danger" data-action="end">Encerrar minijogo</button></section>';
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
  return '<div class="config-grid"><section class="card"><h2>Dificuldade predefinida</h2>' + presets("lock", state.lockLevel || 3) +
  '<div class="stats"><span>Precisão <b>' + state.tolerance + '°</b></span><span>Ferramentas <b>' + state.picks + '</b></span></div>' +
  '<button class="plain" data-action="advanced">' + (state.advanced ? "− Ocultar ajustes" : "+ Ajustar detalhes") + '</button>' +
  (state.advanced ? slider("tolerance", "Margem de acerto", state.tolerance, 3, 45, "°") + slider("picks", "Ferramentas", state.picks, 1, 10, "") : "") +
  '<button class="primary" data-action="publish">Preparar e liberar</button></section><section class="preview"><div class="lock-preview"><div class="keyhole"></div></div><p>O jogador ajusta a ferramenta e tenta girar o cilindro. Errar consome uma ferramenta.</p></section></div>';
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
  const picks = state.session.publicConfig.picks;
  return '<div class="lock-game"><div class="lock-graphic"><div class="ring"></div><div class="needle" style="transform:rotate(' + state.angle + 'deg)"></div><div class="lock-core"><div class="keyhole"></div></div></div><div class="play-controls"><label>Ajuste a posição <b id="angle-value">' + state.angle + '°</b></label><input id="angle" type="range" min="0" max="359" value="' + state.angle + '" ' + (state.waiting || state.result?.finished ? "disabled" : "") + '><div class="attempts">' + Array.from({length:picks}, (_,i) => '<i class="' + (i >= state.picksLeft ? "used" : "") + '"></i>').join("") + '</div><button class="primary" data-action="try-lock" ' + (state.waiting || state.result?.finished ? "disabled" : "") + '>Girar fechadura</button>' + resultMarkup() + '</div></div>';
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
  if (action === "try-lock") sendAttempt({kind:"lock",angle:state.angle});
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
  if (id === "picks") { state.picks=value; document.querySelector("#picks-value").textContent=value; }
  if (id === "rows") { state.rows=value; document.querySelector("#matrix-value").textContent=state.columns+" × "+state.rows; }
  if (id === "columns") { state.columns=value; document.querySelector("#matrix-value").textContent=state.columns+" × "+state.rows; }
  if (id === "length") { state.length=value; document.querySelector("#length-value").textContent=value+" códigos"; document.querySelector("#buffer-value").textContent=value; }
});
async function publish() {
  try {
    if (!sdkReady || !OBR) throw new Error("Owlbear SDK ainda não está conectado. Reabra a extensão.");
    let game, publicConfig, secret;
    if (state.mode === "lock") { game="lock"; publicConfig={picks:state.picks}; secret={targetAngle:Math.floor(Math.random()*360),tolerance:state.tolerance,picksLeft:state.picks}; }
    else if (state.mode === "hack") { game="hack"; const puzzle=makeHackPuzzle({rows:state.rows,columns:state.columns,sequenceLength:state.length}); publicConfig={puzzle}; secret={puzzle}; }
    else { const code=normalizePin(state.pin); if(code.length<3) throw new Error("A senha precisa ter ao menos 3 dígitos."); game="pin"; publicConfig={codeLength:code.length}; secret={code}; }
    const sessionId=createSessionId(); localStorage.setItem(SECRET_PREFIX+sessionId,JSON.stringify({...secret,game,finished:false}));
    try { await OBR.room.setMetadata({[META_KEY]:{status:"active",sessionId,game,publicConfig,createdAt:Date.now()}}); }
    catch(error){localStorage.removeItem(SECRET_PREFIX+sessionId);throw error;}
    OBR.notification.show("Minijogo liberado para os jogadores","SUCCESS");
  } catch(error) { showNotice(error.message || "Não foi possível publicar o desafio."); OBR?.notification?.show?.(error.message || "Não foi possível publicar o desafio.","ERROR"); }
}
async function endSession() {
  if (!sdkReady || !OBR) { showNotice("Conectando ao Owlbear Rodeo. Tente novamente em instantes."); return; }
  const id=state.session?.sessionId;
  await OBR.room.setMetadata({[META_KEY]:{status:"idle",sessionId:null,endedAt:Date.now()}});
  if(id) localStorage.removeItem(SECRET_PREFIX+id);
  OBR.notification.show("Minijogo encerrado","INFO");
}
async function sendAttempt(attempt) {
  if (!sdkReady || !OBR) { state.result={success:false,responseText:"Conexão com o Owlbear indisponível. Reabra a extensão.",finished:false}; render(); return; }
  if(state.waiting || state.result?.finished) return;
  state.waiting=true; state.result=null; render();
  clearTimeout(timeout);
  timeout=setTimeout(()=>{state.waiting=false;state.result={success:false,responseText:"Sem resposta do mestre. Verifique a conexão e tente novamente."};render();},WAIT_MS);
  try { await OBR.broadcast.sendMessage(CHANNEL,{type:"attempt",sessionId:state.session.sessionId,...attempt}); }
  catch(error){clearTimeout(timeout);state.waiting=false;state.result={success:false,responseText:"Falha de conexão. Tente novamente."};render();}
}
async function onMessage(event) {
  const message=event?.data;
  if(!message || message.type!=="result" || message.targetConnectionId!==connectionId) return;
  if(message.sessionId!==state.session?.sessionId || message.game!==state.session?.game) return;
  clearTimeout(timeout); timeout=null; state.waiting=false; state.result=message;
  if(message.remaining!==null && message.remaining!==undefined) state.picksLeft=message.remaining;
  render();
}

async function bootOwlbear() {
  const urls = [
    "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm",
    "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle"
  ];
  let sdkModule = null;
  let lastError = null;
  for (const url of urls) {
    try {
      sdkModule = await Promise.race([
        import(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Tempo esgotado ao carregar o SDK.")), 12000))
      ]);
      if (sdkModule?.default?.onReady) break;
      sdkModule = null;
      throw new Error("O arquivo carregado não exportou a API OBR.");
    } catch (error) {
      lastError = error;
      console.warn("[Sistema de Fechaduras] Falha no provedor de SDK:", url, error);
    }
  }
  if (!sdkModule?.default) throw lastError || new Error("SDK não encontrado.");
  OBR = sdkModule.default;
  await Promise.race([
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("O Owlbear não respondeu à inicialização do SDK.")), 10000);
      OBR.onReady(() => { clearTimeout(timer); resolve(); });
      if (OBR.isReady) { clearTimeout(timer); resolve(); }
    })
  ]);
  if (OBR.isAvailable === false) throw new Error("Abra esta extensão dentro de uma sala do Owlbear Rodeo.");
  state.role = await OBR.player.getRole();
  connectionId = await OBR.player.getConnectionId();
  sdkReady = true;
  sdkError = null;
  OBR.room.onMetadataChange((metadata) => acceptSession(metadata?.[META_KEY] ?? null));
  OBR.broadcast.onMessage(CHANNEL, onMessage);
  acceptSession((await OBR.room.getMetadata())?.[META_KEY] ?? null);
  state.notice = "";
  render();
}

render();
bootOwlbear().catch((error) => {
  sdkError = error;
  sdkReady = false;
  console.error("[Sistema de Fechaduras] SDK indisponível:", error);
  showNotice("Interface aberta, mas sem conexão ao Owlbear. Feche e reabra a extensão. Detalhe: " + (error?.message || "falha de inicialização"));
});
