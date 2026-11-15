import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";
import { CHANNEL, META_KEY, SECRET_PREFIX, resolvePlayerAttempt } from "./game-logic.js";

let role = "PLAYER";
let queue = Promise.resolve();
let lastOpenedSessionId = null;
const lastAttemptAt = new Map();

const REPLY_THROTTLE_MS = 500;

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

async function sendPlayerResult(targetConnectionId, session, requestId, result) {
  await OBR.broadcast.sendMessage(CHANNEL, {
    type: "result",
    requestId,
    sessionId: session.sessionId,
    game: session.game,
    targetConnectionId,
    success: Boolean(result.success),
    responseText: result.responseText,
    remaining: result.remaining ?? null,
    finished: Boolean(result.finished)
  }, { destination: "REMOTE" });
}

async function sendMasterStatus(senderConnectionId, session, requestId, result) {
  // LOCAL encaminha o resultado ao restante da extensão no dispositivo do mestre,
  // incluindo o popover visível, sem expor esse status aos outros jogadores.
  await OBR.broadcast.sendMessage(CHANNEL, {
    type: "master-status",
    requestId,
    sessionId: session.sessionId,
    game: session.game,
    playerConnectionId: senderConnectionId,
    success: Boolean(result.success),
    responseText: result.responseText,
    remaining: result.remaining ?? null,
    finished: Boolean(result.finished),
    receivedAt: Date.now()
  }, { destination: "LOCAL" });
}

async function handleBroadcast(event) {
  if (role !== "GM") return;
  const message = event?.data;
  const senderConnectionId = event?.connectionId;
  if (!message || message.type !== "attempt" || typeof senderConnectionId !== "string") return;

  const metadata = await OBR.room.getMetadata();
  const session = metadata?.[META_KEY];
  if (!session || session.status !== "active" || session.sessionId !== message.sessionId
    || session.game !== message.game) return;

  const requestId = typeof message.requestId === "string" ? message.requestId : "";
  const now = Date.now();
  const previousAttempt = lastAttemptAt.get(senderConnectionId) ?? 0;
  if (now - previousAttempt < REPLY_THROTTLE_MS) {
    const limited = {
      success: false,
      responseText: "Aguarde um instante antes de tentar novamente.",
      remaining: null,
      finished: false
    };
    await sendPlayerResult(senderConnectionId, session, requestId, limited);
    await sendMasterStatus(senderConnectionId, session, requestId, limited);
    return;
  }
  lastAttemptAt.set(senderConnectionId, now);

  const secretKey = SECRET_PREFIX + session.sessionId;
  let secret = null;
  try {
    secret = JSON.parse(localStorage.getItem(secretKey) || "null");
  } catch (error) {
    console.error("[Sistema de Fechaduras] Não foi possível ler o segredo do desafio:", error);
  }

  const result = resolvePlayerAttempt(session, secret, message);
  if (!result) {
    const invalid = {
      success: false,
      responseText: "Tentativa inválida ou configuração do desafio inconsistente.",
      remaining: null,
      finished: false
    };
    await sendPlayerResult(senderConnectionId, session, requestId, invalid);
    await sendMasterStatus(senderConnectionId, session, requestId, invalid);
    return;
  }

  try {
    localStorage.setItem(secretKey, JSON.stringify(result.secret));
  } catch (error) {
    console.error("[Sistema de Fechaduras] Não foi possível salvar o estado do desafio:", error);
    const storageError = {
      success: false,
      responseText: "O mestre não conseguiu salvar o estado do desafio. Verifique o armazenamento do navegador.",
      remaining: result.remaining,
      finished: false
    };
    await sendPlayerResult(senderConnectionId, session, requestId, storageError);
    await sendMasterStatus(senderConnectionId, session, requestId, storageError);
    return;
  }

  await sendPlayerResult(senderConnectionId, session, requestId, result);
  await sendMasterStatus(senderConnectionId, session, requestId, result);
  if (result.success) {
    await OBR.notification.show("Minijogo concluído", "SUCCESS");
  }
}

async function handleSessionChange(metadata) {
  if (role !== "PLAYER") return;
  const session = metadata?.[META_KEY];
  if (session?.status === "active" && session.sessionId) {
    if (lastOpenedSessionId === session.sessionId) return;
    try {
      await OBR.action.open();
      lastOpenedSessionId = session.sessionId;
    } catch (error) {
      lastOpenedSessionId = null;
      console.warn("[Sistema de Fechaduras] Não foi possível abrir a interface do jogador:", error);
    }
  } else {
    lastOpenedSessionId = null;
    try { await OBR.action.close(); }
    catch (error) { console.warn("[Sistema de Fechaduras] Não foi possível fechar a interface do jogador:", error); }
  }
}

replayBufferedOwlbearReady();
let readyTimeout = setTimeout(() => {
  if (OBR.isReady) return;
  console.error("[Sistema de Fechaduras] Processo de fundo não recebeu OBR_READY.", {
    hasObrRef: new URLSearchParams(window.location.search).has("obrref")
  });
}, 12000);

OBR.onReady(async () => {
  clearTimeout(readyTimeout);
  try {
    if (!OBR.isAvailable) throw new Error("OBR.isAvailable=false: o background não recebeu o parâmetro obrref.");
    role = await OBR.player.getRole();

    // O mestre recebe e valida tentativas; o jogador só precisa observar a sessão.
    if (role === "GM") {
      OBR.broadcast.onMessage(CHANNEL, (event) => {
        queue = queue.then(() => handleBroadcast(event)).catch(async (error) => {
          console.error("[Sistema de Fechaduras] Falha ao processar tentativa:", error);
          const message = event?.data;
          if (message?.type === "attempt" && typeof event?.connectionId === "string") {
            try {
              const metadata = await OBR.room.getMetadata();
              const session = metadata?.[META_KEY];
              if (session?.sessionId === message.sessionId) {
                const failure = {
                  success: false,
                  responseText: "O mestre recebeu a tentativa, mas ocorreu um erro ao processá-la.",
                  remaining: null,
                  finished: false
                };
                await sendPlayerResult(event.connectionId, session, message.requestId, failure);
                await sendMasterStatus(event.connectionId, session, message.requestId, failure);
              }
            } catch (replyError) {
              console.error("[Sistema de Fechaduras] Falha ao devolver erro ao jogador:", replyError);
            }
          }
        });
      });
    } else {
      OBR.room.onMetadataChange(handleSessionChange);
      await handleSessionChange(await OBR.room.getMetadata());
    }

    console.info("[Sistema de Fechaduras] Conexão de fundo pronta:", role);
  } catch (error) {
    console.error("[Sistema de Fechaduras] Falha ao inicializar o processo de fundo:", error);
  }
});
