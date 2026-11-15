// Processo de fundo resiliente: falhas no SDK não impedem o carregamento da página da extensão.
let OBR = null;
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

async function boot() {
  const urls=[
    "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm",
    "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle"
  ];
  let module=null;
  let error=null;
  for(const url of urls){
    try{
      module=await Promise.race([
        import(url),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("Tempo esgotado ao carregar o SDK de fundo.")),12000))
      ]);
      if(module?.default?.onReady) break;
      module=null;
      throw new Error("SDK de fundo sem exportação OBR.");
    }catch(e){error=e;console.warn("[Sistema de Fechaduras] Provedor de SDK de fundo falhou:",url,e);}
  }
  if(!module?.default) throw error || new Error("Não foi possível carregar o SDK.");
  OBR=module.default;
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Owlbear não respondeu ao SDK de fundo.")),10000);
    OBR.onReady(()=>{clearTimeout(timer);resolve();});
    if(OBR.isReady){clearTimeout(timer);resolve();}
  });
  role=await OBR.player.getRole();
  OBR.broadcast.onMessage(CHANNEL,(event)=>{
    queue=queue.then(()=>handleBroadcast(event)).catch((e)=>console.error("[Sistema de Fechaduras] Erro de arbitragem:",e));
  });
  OBR.room.onMetadataChange((metadata)=>handleSessionChange(metadata));
  await handleSessionChange(await OBR.room.getMetadata());
  console.info("[Sistema de Fechaduras] Processo de fundo iniciado como",role);
}

async function handleSessionChange(metadata) {
  if(role!=="PLAYER") return;
  const session=metadata?.[META_KEY];
  if(session?.status==="active"&&session.sessionId){
    if(lastOpenedSessionId===session.sessionId) return;
    try{
      await OBR.action.open();
      lastOpenedSessionId=session.sessionId;
    }catch(error){
      lastOpenedSessionId=null;
      console.warn("Não foi possível abrir a interface do jogador:",error);
    }
  }else{
    lastOpenedSessionId=null;
    try{await OBR.action.close();}
    catch(error){console.warn("Não foi possível fechar a interface do jogador:",error);}
  }
}

async function handleBroadcast(event) {
  if(role!=="GM") return;
  const message=event?.data;
  const sender=event?.connectionId;
  if(!message||message.type!=="attempt"||typeof sender!=="string") return;
  const session=(await OBR.room.getMetadata())?.[META_KEY];
  if(!session||session.status!=="active"||session.sessionId!==message.sessionId) return;

  const now=Date.now();
  const previous=lastAttemptAt.get(sender)||0;
  if(now-previous<500){
    await sendResult(sender,session,{success:false,responseText:"Aguarde um instante antes de tentar novamente.",remaining:null,finished:false});
    return;
  }
  lastAttemptAt.set(sender,now);

  const secretKey=SECRET_PREFIX+session.sessionId;
  let secret=null;
  try{secret=JSON.parse(localStorage.getItem(secretKey)||"null");}catch{}
  if(!secret||secret.game!==session.game){
    await sendResult(sender,session,{success:false,responseText:"O mestre precisa reiniciar este desafio.",remaining:null,finished:true});
    return;
  }
  if(secret.finished){
    await sendResult(sender,session,{success:false,responseText:"Este desafio já foi concluído ou esgotado.",remaining:secret.picksLeft??null,finished:true});
    return;
  }

  let success=false;
  let responseText="";
  let remaining=null;

  if(session.game==="lock"&&message.kind==="lock"){
    if(!Number.isFinite(message.angle)) return;
    success=validateLockAttempt(message.angle,secret.targetAngle,secret.tolerance);
    if(!success){
      if(!Number.isInteger(secret.picksLeft)||secret.picksLeft<0) return;
      secret.picksLeft=Math.max(0,secret.picksLeft-1);
      remaining=secret.picksLeft;
      responseText=remaining>0?"A ferramenta cedeu. Ajuste a posição.":"A ferramenta quebrou. A fechadura resistiu.";
      if(remaining===0) secret.finished=true;
    }else{
      responseText="Fechadura destrancada.";
      secret.finished=true;
    }
  }else if(session.game==="hack"&&message.kind==="hack"){
    success=isValidHackPath(message.path,secret.puzzle);
    responseText=success?"Acesso concedido.":"Sequência rejeitada. Tente novamente.";
    if(success) secret.finished=true;
  }else if(session.game==="pin"&&message.kind==="pin"){
    if(typeof secret.code!=="string"||secret.code.length<3||secret.code.length>8) return;
    const candidate=normalizePin(message.code);
    if(candidate.length!==secret.code.length){
      await sendResult(sender,session,{success:false,responseText:"O código precisa ter "+secret.code.length+" dígitos.",remaining:null,finished:false});
      return;
    }
    success=candidate===secret.code;
    responseText=success?"Código correto. Acesso liberado.":"Código incorreto.";
    if(success) secret.finished=true;
  }else{
    return;
  }

  try{localStorage.setItem(secretKey,JSON.stringify(secret));}
  catch(error){console.error("Não foi possível atualizar o segredo do desafio:",error);}
  await sendResult(sender,session,{success,responseText,remaining,finished:Boolean(secret.finished)});
  if(success) await OBR.notification.show("Minijogo concluído","SUCCESS");
}

async function sendResult(targetConnectionId,session,result) {
  await OBR.broadcast.sendMessage(CHANNEL,{
    type:"result",
    sessionId:session.sessionId,
    targetConnectionId,
    game:session.game,
    ...result
  });
}

boot().catch((error)=>console.error("[Sistema de Fechaduras] Processo de fundo indisponível:",error));
