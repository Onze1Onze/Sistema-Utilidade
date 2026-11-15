import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

// Processo de fundo resiliente: falhas no SDK não impedem o carregamento da página da extensão.
let role = "PLAYER";
let queue = Promise.resolve();
let lastOpenedSessionId = null;
const lastAttemptAt = new Map();
const CHANNEL = "com.onze11.sistema-utilidade/v1";
const META_KEY = "com.onze11.sistema-utilidade/session";
const SECRET_PREFIX = "com.onze11.sistema-utilidade/secret/";


function normalizePin(value) {
  return String(value ?? "").replace(/[^0-9]/g, "").slice(0, 8);
}
function angularDistance(a,b) {
  const diff=Math.abs(((Number(a)-Number(b))%360+360)%360);
  return Math.min(diff,360-diff);
}
function validateLockAttempt(angle,target,tolerance) {
  return Number.isFinite(angle) && angle>=0 && angle<360
    && Number.isFinite(target) && target>=0 && target<360
    && Number.isFinite(tolerance) && tolerance>=0 && tolerance<=45
    && angularDistance(angle,target)<=tolerance;
}
function isValidHackPath(path,puzzle) {
  if(!Array.isArray(path)||!puzzle||!Array.isArray(puzzle.board)||!Array.isArray(puzzle.target)) return false;
  if(!Number.isInteger(puzzle.rows)||!Number.isInteger(puzzle.columns)
    || puzzle.rows<4||puzzle.rows>8||puzzle.columns<4||puzzle.columns>8
    || !Number.isInteger(puzzle.sequenceLength)||puzzle.sequenceLength<3||puzzle.sequenceLength>6
    || path.length!==puzzle.sequenceLength||puzzle.target.length!==puzzle.sequenceLength
    || puzzle.board.length!==puzzle.rows
    || puzzle.board.some(row=>!Array.isArray(row)||row.length!==puzzle.columns)) return false;
  const used=new Set();
  for(let i=0;i<path.length;i++){
    const cell=path[i];
    if(!Array.isArray(cell)||cell.length!==2) return false;
    const [row,col]=cell;
    if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=puzzle.rows||col<0||col>=puzzle.columns) return false;
    const key=row+":"+col;
    if(used.has(key)) return false;
    used.add(key);
    if(i>0){
      const [pr,pc]=path[i-1];
      if(i%2===1 ? (col!==pc||row===pr) : (row!==pr||col===pc)) return false;
    }
    if(puzzle.board[row][col]!==puzzle.target[i]) return false;
  }
  return true;
}

// O import estático registra o listener para OBR_READY antes do handshake do host.
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
replayBufferedOwlbearReady();

let readyTimeout = setTimeout(() => {
  if (OBR.isReady) return;
  const hasRef = new URLSearchParams(window.location.search).has("obrref");
  console.error("[Sistema de Fechaduras] SDK de fundo não recebeu OBR_READY.", {
    hasObrRef: hasRef,
    href: window.location.href
  });
}, 12000);

OBR.onReady(async () => {
  clearTimeout(readyTimeout);
  try {
    if (!OBR.isAvailable) throw new Error("OBR.isAvailable=false: o parâmetro obrref não foi recebido ou não pôde ser interpretado.");
    role = await OBR.player.getRole();
    OBR.broadcast.onMessage(CHANNEL, (event) => {
      queue = queue.then(() => handleBroadcast(event)).catch((error) => {
        console.error("[Sistema de Fechaduras] Erro de arbitragem:", error);
      });
    });
    OBR.room.onMetadataChange((metadata) => handleSessionChange(metadata));
    await handleSessionChange(await OBR.room.getMetadata());
    console.info("[Sistema de Fechaduras] Processo de fundo conectado como", role);
  } catch (error) {
    console.error("[Sistema de Fechaduras] Falha ao inicializar processo de fundo:", error);
  }
});
