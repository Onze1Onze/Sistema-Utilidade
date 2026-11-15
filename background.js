import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import { CHANNEL, META_KEY, SECRET_PREFIX, validateLockAttempt, validateHackAttempt, normalizePin } from "./game-logic.js";

let role = "PLAYER";
let queue = Promise.resolve();
let lastOpenedSessionId = null;
const lastAttemptAt = new Map();

OBR.onReady(async () => {
  try {
    role = await OBR.player.getRole();
    OBR.broadcast.onMessage(CHANNEL, (event) => {
      queue = queue.then(() => handleBroadcast(event)).catch((error) => {
        console.error("[Sistema de Fechaduras] Falha ao processar mensagem:", error);
      });
    });
    OBR.room.onMetadataChange((metadata) => handleSessionChange(metadata));
    const metadata = await OBR.room.getMetadata();
    await handleSessionChange(metadata);
  } catch (error) {
    console.error("[Sistema de Fechaduras] Falha ao iniciar sincronização:", error);
  }
});

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
      console.warn("Não foi possível abrir a interface do jogador:", error);
    }
  } else {
    lastOpenedSessionId = null;
    try { await OBR.action.close(); }
    catch (error) { console.warn("Não foi possível fechar a interface do jogador:", error); }
  }
}

async function handleBroadcast(event) {
  if (role !== "GM") return;
  const message = event?.data;
  if (!message || message.type !== "attempt" || typeof event.connectionId !== "string") return;

  const metadata = await OBR.room.getMetadata();
  const session = metadata?.[META_KEY];
  if (!session || session.status !== "active" || session.sessionId !== message.sessionId) return;
  const throttleNow = Date.now();
  const previousAttempt = lastAttemptAt.get(event.connectionId) ?? 0;
  if (throttleNow - previousAttempt < 700) {
    await OBR.broadcast.sendMessage(CHANNEL, {
      type: "result",
      sessionId: session.sessionId,
      targetConnectionId: event.connectionId,
      game: session.game,
      success: false,
      responseText: "Aguarde um instante antes de tentar novamente.",
      remaining: null,
      finished: false
    });
    return;
  }
  lastAttemptAt.set(event.connectionId, throttleNow);

  const secretKey = SECRET_PREFIX + session.sessionId;
  let secret;
  try { secret = JSON.parse(localStorage.getItem(secretKey) || "null"); }
  catch { secret = null; }
  const secretIsValid = secret?.game === session.game && (
    (session.game === "lock" && Number.isFinite(secret.targetAngle) && Number.isFinite(secret.tolerance) && Number.isInteger(secret.picksLeft)) ||
    (session.game === "hack" && secret.puzzle && Array.isArray(secret.puzzle.board) && Array.isArray(secret.puzzle.target)) ||
    (session.game === "pin" && typeof secret.code === "string" && secret.code.length >= 3)
  );
  if (!secretIsValid) {
    await sendResult(event.connectionId, session, {
      success: false,
      responseText: "O mestre precisa reiniciar este desafio.",
      remaining: null,
      finished: true
    });
    return;
  }
  if (secret.finished) {
    await sendResult(event.connectionId, session, {
      success: false,
      responseText: "Este desafio já foi concluído ou esgotado.",
      remaining: secret.picksLeft ?? null,
      finished: true
    });
    return;
  }

  let success = false;
  let responseText = "";
  let remaining = null;

  if (session.game === "lock" && message.kind === "lock") {
    if (!Number.isFinite(message.angle)) return;
    success = validateLockAttempt(message.angle, secret.targetAngle, secret.tolerance);
    if (!success) {
      secret.picksLeft = Math.max(0, secret.picksLeft - 1);
      remaining = secret.picksLeft;
      responseText = remaining > 0 ? "A ferramenta cedeu. Ajuste a posição." : "A ferramenta quebrou. A fechadura resistiu.";
      if (remaining === 0) secret.finished = true;
    } else {
      responseText = "Fechadura destrancada.";
      secret.finished = true;
    }
  } else if (session.game === "hack" && message.kind === "hack") {
    if (!Array.isArray(message.path) || !message.path.every((cell) => Array.isArray(cell) && cell.length === 2 && cell.every(Number.isInteger))) return;
    success = validateHackAttempt(message.path, secret.puzzle);
    responseText = success ? "Acesso concedido." : "Sequência rejeitada. Tente novamente.";
    if (success) secret.finished = true;
  } else if (session.game === "pin" && message.kind === "pin") {
    const candidate = normalizePin(message.code);
    if (!candidate || candidate.length !== secret.code.length) {
      responseText = `O código precisa ter ${secret.code.length} dígitos.`;
      await OBR.broadcast.sendMessage(CHANNEL, {
        type: "result", sessionId: session.sessionId, targetConnectionId: event.connectionId,
        game: session.game, success: false, responseText, remaining: null, finished: false
      });
      return;
    }
    success = candidate === secret.code;
    responseText = success ? "Código correto. Acesso liberado." : "Código incorreto.";
    if (success) secret.finished = true;
  } else {
    return;
  }

  if (secret.finished && !success && remaining === null) return;
  localStorage.setItem(secretKey, JSON.stringify(secret));
  await sendResult(event.connectionId, session, {
    success,
    responseText,
    remaining,
    finished: Boolean(secret.finished)
  });
  if (success) {
    await OBR.notification.show("Minijogo concluído", "SUCCESS");
  }
}

async function sendResult(targetConnectionId, session, result) {
  await OBR.broadcast.sendMessage(CHANNEL, {
    type: "result",
    sessionId: session.sessionId,
    targetConnectionId,
    game: session.game,
    ...result
  });
}
