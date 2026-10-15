(function(){
"use strict";
const COLS=5, ROWS=12, MOSS="moss", RUST="rust";
const SEARCH_OCCUPANCY_CACHE=new WeakMap(),TACTICAL_PROFILE_CACHE=new WeakMap(),BOT_SHARED_TT=new Map();
const NAME={moss:"Moss",rust:"Rust"};

const boardEl=document.getElementById("board");
const state={pieces:[],turn:MOSS,winner:null,capturedHunters:{moss:0,rust:0},history:[],log:[],note:"",lastMove:null,selected:null,gameMode:"human-bot",botThinkingTimeMs:3000,botPaused:false,botThinking:false,botJob:0,botWorker:null,botInfo:{depth:0,nodes:0}};
function key(r,c){return r+","+c;}
function inside(r,c){return r>=0&&r<ROWS&&c>=0&&c<COLS;}
function clonePieces(pieces){return pieces.map(p=>({id:p.id,kind:p.kind,side:p.side,r:p.r,c:p.c,trail:(p.trail||[key(p.r,p.c)]).slice(-7)}));}
function cloneSnapshot(){return {pieces:clonePieces(state.pieces),turn:state.turn,winner:state.winner,capturedHunters:{moss:state.capturedHunters.moss,rust:state.capturedHunters.rust},log:state.log.slice(),note:state.note,lastMove:state.lastMove?{from:{r:state.lastMove.from.r,c:state.lastMove.from.c},to:{r:state.lastMove.to.r,c:state.lastMove.to.c},id:state.lastMove.id}:null};}
function addPiece(kind,side,r,c){state.pieces.push({id:kind+"-"+side+"-"+state.pieces.length,kind:kind,side:side,r:r,c:c,trail:[key(r,c)]});}
function stopBotWorker(){if(!state.botWorker)return;if(state.botWorker._valleyBotUrl&&typeof URL!=="undefined")URL.revokeObjectURL(state.botWorker._valleyBotUrl);state.botWorker.terminate();state.botWorker=null;}
function reset(){
  state.botJob++;state.botThinking=false;
  stopBotWorker();
  state.gameMode=document.getElementById("gameMode").value;state.botThinkingTimeMs=Number(document.getElementById("botThinkingTime").value)||3000;state.botPaused=false;state.botInfo={depth:0,nodes:0};
  state.pieces=[];state.turn=MOSS;state.winner=null;state.capturedHunters={moss:0,rust:0};state.history=[];state.log=[];state.note="";state.lastMove=null;state.selected=null;
  // Rust's opening rows mirror the specified Moss setup.
  [["dog",1],["hunter",2],["dog",3]].forEach(function(v){addPiece(v[0],RUST,0,v[1]);});
  [["dog",0],["hunter",1],["dragon",2],["hunter",3],["dog",4]].forEach(function(v){addPiece(v[0],RUST,1,v[1]);});
  [["child",1],["dog",2],["child",3]].forEach(function(v){addPiece(v[0],RUST,2,v[1]);});
  [["dog",0],["dog",4]].forEach(function(v){addPiece(v[0],RUST,3,v[1]);});
  // Moss setup, from the bottom of the board toward the middle.
  [["dog",1],["hunter",2],["dog",3]].forEach(function(v){addPiece(v[0],MOSS,11,v[1]);});
  [["dog",0],["hunter",1],["dragon",2],["hunter",3],["dog",4]].forEach(function(v){addPiece(v[0],MOSS,10,v[1]);});
  [["child",1],["dog",2],["child",3]].forEach(function(v){addPiece(v[0],MOSS,9,v[1]);});
  [["dog",0],["dog",4]].forEach(function(v){addPiece(v[0],MOSS,8,v[1]);});
  render();queueBotMove();
}
function occupancyFor(pieces){
  let cached=SEARCH_OCCUPANCY_CACHE.get(pieces);if(cached)return cached;
  const cells=Array.from({length:ROWS*COLS},()=>[]),sideMask=new Uint8Array(ROWS*COLS),dragons={moss:null,rust:null};
  for(const p of pieces){
    if(!inside(p.r,p.c))continue;
    const i=p.r*COLS+p.c;cells[i].push(p);sideMask[i]|=p.side===MOSS?1:2;
    if(p.kind==="dragon")dragons[p.side]=p;
  }
  cached={cells:cells,sideMask:sideMask,dragons:dragons,dragonReach:{}};SEARCH_OCCUPANCY_CACHE.set(pieces,cached);return cached;
}
const EMPTY_CELL=[];
function piecesAt(pieces,r,c){return inside(r,c)?occupancyFor(pieces).cells[r*COLS+c]:EMPTY_CELL;}
function topAt(pieces,r,c){const here=piecesAt(pieces,r,c);if(!here.length)return null;return here.find(p=>p.kind==="dragon")||here[0];}
function dragonAt(pieces,r,c){return piecesAt(pieces,r,c).find(p=>p.kind==="dragon")||null;}
function hasSideAt(pieces,r,c,side){if(!inside(r,c))return false;return !!(occupancyFor(pieces).sideMask[r*COLS+c]&(side===MOSS?1:2));}
function hasOtherSideAt(pieces,r,c,side,excludeId){return inside(r,c)&&pieces.some(function(p){return p.id!==excludeId&&p.side===side&&p.r===r&&p.c===c;});}
function pinned(piece,pieces){return piece.kind!=="dragon"&&!!dragonAt(pieces,piece.r,piece.c);}
function forward(side){return side===MOSS?-1:1;}
const ORTHO=[[1,0],[-1,0],[0,1],[0,-1]];
const DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];
const ALL=ORTHO.concat(DIAG);
function dragonLeapClear(piece,pieces){
  const f=forward(piece.side);
  for(let n=1;n<=3;n++)if(hasSideAt(pieces,piece.r+n*f,piece.c,piece.side))return false;
  return true;
}
function wouldCompleteThirdBackAndForth(piece,r,c){
  const trail=(piece.trail||[key(piece.r,piece.c)]).slice(-6).concat(key(r,c));
  if(trail.length<7||trail[0]===trail[1])return false;
  for(let i=2;i<7;i++)if(trail[i]!==trail[i%2])return false;
  return true;
}
function pseudoMoves(piece,pieces,includeThreatDragon){
  const out=[];const add=(r,c,landing)=>{if(inside(r,c))out.push({r:r,c:c,landing:!!landing});};
  if(piece.kind==="dog"){
    const f=forward(piece.side);
    [[f,0],[2*f,0]].forEach(function(d){let r=piece.r+d[0],c=piece.c+d[1];if(!inside(r,c))return;if(d[0]===2*f&&!piecesAt(pieces,piece.r+f,piece.c).length&&!piecesAt(pieces,r,c).length)add(r,c,false);else if(d[0]===f&&!piecesAt(pieces,r,c).length)add(r,c,false);});
    DIAG.forEach(function(d){const r=piece.r+d[0],c=piece.c+d[1];if(inside(r,c)&&!piecesAt(pieces,r,c).length)add(r,c,false);});
  }else if(piece.kind==="hunter"){
    ORTHO.forEach(function(d){const r=piece.r+d[0],c=piece.c+d[1];if(inside(r,c)&&!piecesAt(pieces,r,c).length)add(r,c,false);});
  }else if(piece.kind==="child"){
    ALL.forEach(function(d){const r=piece.r+d[0],c=piece.c+d[1];if(inside(r,c)&&!piecesAt(pieces,r,c).length)add(r,c,false);});
    DIAG.forEach(function(d){const midR=piece.r+d[0],midC=piece.c+d[1],r=piece.r+2*d[0],c=piece.c+2*d[1];if(inside(r,c)&&!piecesAt(pieces,midR,midC).length&&!piecesAt(pieces,r,c).length)add(r,c,false);});
  }else if(piece.kind==="dragon"){
    ORTHO.forEach(function(d){for(let n=1;n<Math.max(ROWS,COLS);n++){const r=piece.r+d[0]*n,c=piece.c+d[1]*n;if(!inside(r,c))break;const cell=piecesAt(pieces,r,c);const otherDragon=cell.some(p=>p.kind==="dragon");if(cell.length){if(!otherDragon||includeThreatDragon)add(r,c,true);break;}add(r,c,false);}});
    const f=forward(piece.side);if(dragonLeapClear(piece,pieces))[-1,1].forEach(function(dc){const r=piece.r+3*f,c=piece.c+dc;if(inside(r,c)){const cell=piecesAt(pieces,r,c);if(!cell.some(p=>p.kind==="dragon")||includeThreatDragon)add(r,c,cell.length>0);}});
  }
  return out;
}
function isSurrounded(target,pieces,bySide){
  const pairs=[[[1,0],[-1,0]],[[0,1],[0,-1]],[[1,1],[-1,-1]],[[1,-1],[-1,1]]];
  return pairs.some(function(pair){return pair.every(function(d){const r=target.r+d[0],c=target.c+d[1];return inside(r,c)&&hasSideAt(pieces,r,c,bySide);});});
}
function isSurroundedByMap(target,sideMap,bySide){
  for(const pair of BOT_CAPTURE_PAIRS){
    let complete=true;
    for(const d of pair){const r=target.r+d[0],c=target.c+d[1];if(!inside(r,c)||!(sideMap[r*COLS+c]&(bySide===MOSS?1:2))){complete=false;break;}}
    if(complete)return true;
  }
  return false;
}
function resolveCaptures(pieces,bySide,capturedHunters){
  const sideMap=new Uint8Array(ROWS*COLS);
  for(const p of pieces)if(inside(p.r,p.c))sideMap[p.r*COLS+p.c]|=p.side===MOSS?1:2;
  const victims=pieces.filter(p=>p.side!==bySide&&p.kind!=="dragon"&&isSurroundedByMap(p,sideMap,bySide));
  if(!victims.length)return [];
  const descriptions=[];
  victims.forEach(function(v){
    const idx=pieces.findIndex(p=>p.id===v.id);if(idx<0)return;
    if(v.kind==="dog"){
      const originalSide=v.side;
      pieces[idx].side=bySide;
      descriptions.push(NAME[bySide]+" flips a "+NAME[originalSide]+" dog to their side.");
    }else{
      if(v.kind==="hunter")capturedHunters[bySide]++;
      pieces.splice(idx,1);
      descriptions.push(NAME[bySide]+" captures a "+NAME[v.side]+" "+v.kind+".");
    }
  });
  return descriptions;
}
function resolveDragonDisplacement(piece,move,pieces,next,capturedHunters){
  if(piece.kind!=="dragon")return [];
  const targets=pieces.filter(function(p){return p.kind!=="dragon"&&p.side!==piece.side&&p.r===move.r&&p.c===move.c;});
  if(!targets.length)return [];
  const descriptions=[];
  targets.forEach(function(target){
    const supported=ORTHO.some(function(d){return hasOtherSideAt(pieces,target.r+d[0],target.c+d[1],piece.side,piece.id);});
    if(!supported)return;
    const idx=next.findIndex(function(p){return p.id===target.id;});
    if(idx<0)return;
    if(target.kind==="hunter")capturedHunters[piece.side]++;
    next.splice(idx,1);
    descriptions.push(NAME[piece.side]+" displaces and captures a "+NAME[target.side]+" "+target.kind+" with the Dragon.");
  });
  return descriptions;
}
function dragonThreats(piece,pieces){
  const cached=occupancyFor(pieces),reachKey=piece.side;
  if(cached.dragonReach[reachKey])return cached.dragonReach[reachKey];
  const squares=new Set();
  // The ray includes the first occupied square as a threat, then stops.
  ORTHO.forEach(function(d){for(let n=1;n<Math.max(ROWS,COLS);n++){const r=piece.r+d[0]*n,c=piece.c+d[1]*n;if(!inside(r,c))break;squares.add(key(r,c));if(piecesAt(pieces,r,c).length)break;}});
  const f=forward(piece.side);if(dragonLeapClear(piece,pieces))[-1,1].forEach(function(dc){const r=piece.r+3*f,c=piece.c+dc;if(inside(r,c))squares.add(key(r,c));});
  cached.dragonReach[reachKey]=squares;return squares;
}
function dragonDisplacementRisk(piece,pieces){
  if(piece.kind==="dragon")return 0;
  const enemy=otherSide(piece.side),enemyDragon=occupancyFor(pieces).dragons[enemy];
  if(!enemyDragon||!dragonThreats(enemyDragon,pieces).has(key(piece.r,piece.c)))return 0;
  const supported=ORTHO.some(function(d){return hasOtherSideAt(pieces,piece.r+d[0],piece.c+d[1],enemy,enemyDragon.id);});
  if(!supported)return 105;
  if(piece.kind==="hunter")return 820;
  return BOT_VALUE[piece.kind];
}
function dragonsSeparated(pieces){
  const cached=occupancyFor(pieces),a=cached.dragons.moss,b=cached.dragons.rust;if(!a||!b)return true;
  if(dragonThreats(a,pieces).has(key(b.r,b.c))||dragonThreats(b,pieces).has(key(a.r,a.c)))return false;
  return true;
}
function simulate(piece,move,pieces,captured){
  if(wouldCompleteThirdBackAndForth(piece,move.r,move.c))return null;
  const next=clonePieces(pieces);const moving=next.find(p=>p.id===piece.id);if(!moving)return null;
  SEARCH_OCCUPANCY_CACHE.delete(next);
  moving.r=move.r;moving.c=move.c;moving.trail=(moving.trail||[key(piece.r,piece.c)]).concat(key(move.r,move.c)).slice(-7);
  const captures=resolveDragonDisplacement(piece,move,pieces,next,captured).concat(resolveCaptures(next,piece.side,captured));
  SEARCH_OCCUPANCY_CACHE.delete(next);
  if(!dragonsSeparated(next))return null;
  return {pieces:next,capturedHunters:captured,captures:captures};
}
function legalMoves(piece){
  if(!piece||piece.side!==state.turn||state.winner||pinned(piece,state.pieces))return [];
  const candidates=pseudoMoves(piece,state.pieces,false);const out=[];
  candidates.forEach(function(move){
    if(piece.kind!=="dragon"&&piecesAt(state.pieces,move.r,move.c).length)return;
    const captured={moss:state.capturedHunters.moss,rust:state.capturedHunters.rust};
    const result=simulate(piece,move,state.pieces,captured);if(result)out.push(move);
  });
  return out;
}
function otherSide(side){return side===MOSS?RUST:MOSS;}
const BOT_VALUE={dog:220,child:320,hunter:1450,dragon:780};
const BOT_WIN=1000000;
const BOT_CAPTURE_PAIRS=[[[1,0],[-1,0]],[[0,1],[0,-1]],[[1,1],[-1,-1]],[[1,-1],[-1,1]]];
function searchPositionKey(node,side){
  const codes=node.pieces.map(function(p){const trail=(p.trail||[key(p.r,p.c)]).slice(-7).join(".");return (p.side===MOSS?"m":"r")+({dog:"d",hunter:"h",child:"c",dragon:"g"}[p.kind])+String.fromCharCode(65+p.r)+String.fromCharCode(65+p.c)+"["+trail+"]";}).sort();
  return side+":"+node.capturedHunters.moss+":"+node.capturedHunters.rust+":"+codes.join("");
}
function searchMoveKey(move){
  return move.kind+":"+move.from.r+":"+move.from.c+":"+move.to.r+":"+move.to.c;
}
function generateSearchMoves(node,side){
  const out=[];
  for(const piece of node.pieces){
    if(piece.side!==side||pinned(piece,node.pieces))continue;
    const candidates=pseudoMoves(piece,node.pieces,false);
    for(const move of candidates){
      if(piece.kind!=="dragon"&&piecesAt(node.pieces,move.r,move.c).length)continue;
      const captured={moss:node.capturedHunters.moss,rust:node.capturedHunters.rust};
      const result=simulate(piece,move,node.pieces,captured);if(!result)continue;
      const next={pieces:result.pieces,capturedHunters:result.capturedHunters,turn:otherSide(side)};
      out.push({pieceId:piece.id,kind:piece.kind,side:piece.side,from:{r:piece.r,c:piece.c},to:{r:move.r,c:move.c},landing:move.landing,captures:result.captures,next:next});
    }
  }
  return out;
}
function hunterDanger(piece,pieces,teamHuntersLost){
  if(piece.kind!=="hunter")return 0;
  const enemy=otherSide(piece.side);let risk=0;
  const pinDragon=dragonAt(pieces,piece.r,piece.c);
  if(pinDragon)risk+=pinDragon.side===enemy?1040:220;
  for(const pair of BOT_CAPTURE_PAIRS){
    const a={r:piece.r+pair[0][0],c:piece.c+pair[0][1]};
    const b={r:piece.r+pair[1][0],c:piece.c+pair[1][1]};
    if(!inside(a.r,a.c)||!inside(b.r,b.c))continue;
    const aEnemy=hasSideAt(pieces,a.r,a.c,enemy),bEnemy=hasSideAt(pieces,b.r,b.c,enemy);
    const aEmpty=piecesAt(pieces,a.r,a.c).length===0,bEmpty=piecesAt(pieces,b.r,b.c).length===0;
    if((aEnemy&&bEmpty)||(bEnemy&&aEmpty))risk+=230;
  }
  risk+=dragonDisplacementRisk(piece,pieces);
  return risk*(teamHuntersLost>0?1.7:1);
}
function hunterSafety(pieces,side,capturedHunters){
  let total=0;
  for(const piece of pieces)if(piece.side===side&&piece.kind==="hunter")total+=hunterDanger(piece,pieces,capturedHunters[otherSide(side)]);
  return total;
}
function surroundCaptureRisk(piece,pieces){
  if(piece.kind!=="dog"&&piece.kind!=="child")return 0;
  const enemy=otherSide(piece.side),weight=piece.kind==="dog"?115:145;let risk=0;
  for(const pair of BOT_CAPTURE_PAIRS){
    const a={r:piece.r+pair[0][0],c:piece.c+pair[0][1]},b={r:piece.r+pair[1][0],c:piece.c+pair[1][1]};
    if(!inside(a.r,a.c)||!inside(b.r,b.c))continue;
    const aEnemy=hasSideAt(pieces,a.r,a.c,enemy),bEnemy=hasSideAt(pieces,b.r,b.c,enemy);
    const aEmpty=piecesAt(pieces,a.r,a.c).length===0,bEmpty=piecesAt(pieces,b.r,b.c).length===0;
    if((aEnemy&&bEmpty)||(bEnemy&&aEmpty))risk+=weight;
  }
  return Math.min(risk,weight*2);
}
function sideTacticalDanger(pieces,side,capturedHunters){
  return tacticalProfile(pieces).danger[side][capturedHunters[otherSide(side)]>0?1:0];
}
function nonHunterDisplacementDanger(pieces,side){
  return tacticalProfile(pieces).loose[side];
}
function pinnedHunters(pieces,side){
  return tacticalProfile(pieces).pinned[side];
}
function tacticalProfile(pieces){
  let profile=TACTICAL_PROFILE_CACHE.get(pieces);if(profile)return profile;
  profile={pinned:{moss:0,rust:0},danger:{moss:[0,0],rust:[0,0]},loose:{moss:0,rust:0}};
  for(const piece of pieces){
    if(piece.kind==="hunter"){
      if(pinned(piece,pieces))profile.pinned[piece.side]++;
      const risk=hunterDanger(piece,pieces,0);
      profile.danger[piece.side][0]+=risk;profile.danger[piece.side][1]+=risk*1.7;
    }else if(piece.kind==="dog"||piece.kind==="child"){
      const displacement=dragonDisplacementRisk(piece,pieces),risk=displacement+surroundCaptureRisk(piece,pieces);
      profile.danger[piece.side][0]+=risk;profile.danger[piece.side][1]+=risk;profile.loose[piece.side]+=displacement;
    }
  }
  TACTICAL_PROFILE_CACHE.set(pieces,profile);return profile;
}
function signedMaterial(pieces,side){
  let score=0;for(const p of pieces)score+=(p.side===side?1:-1)*BOT_VALUE[p.kind];return score;
}
function evaluatePosition(node,side,ply){
  const enemy=otherSide(side);
  if(node.capturedHunters[side]>=2)return BOT_WIN-ply;
  if(node.capturedHunters[enemy]>=2)return -BOT_WIN+ply;
  let score=signedMaterial(node.pieces,side);
  score+=(node.capturedHunters[side]-node.capturedHunters[enemy])*1050;
  for(const p of node.pieces){
    const sign=p.side===side?1:-1;let value=0;
    if(p.kind==="hunter"){
      value-=hunterDanger(p,node.pieces,node.capturedHunters[otherSide(p.side)]);
      value+=ORTHO.filter(function(d){const r=p.r+d[0],c=p.c+d[1];return inside(r,c)&&piecesAt(node.pieces,r,c).length===0;}).length*8;
      // Do not reward passive edge camping; the danger terms above decide safety.
    }else if(p.kind==="dog"||p.kind==="child")value-=dragonDisplacementRisk(p,node.pieces)+surroundCaptureRisk(p,node.pieces);
    if(p.kind==="dog")value+=Math.max(0,(p.side===MOSS?11-p.r:p.r))*8;
    if(p.kind==="child")value+=Math.max(0,(p.side===MOSS?9-p.r:p.r-2))*5;
    value+=Math.max(0,2-Math.abs(p.c-2))*9;
    const pin=dragonAt(node.pieces,p.r,p.c);
    if(pin&&p.kind!=="dragon")value-=pin.side===p.side?BOT_VALUE[p.kind]*0.18:BOT_VALUE[p.kind]*0.42;
    score+=sign*value;
  }
  for(const d of node.pieces)if(d.kind==="dragon"&&d.side===side){
    const reach=dragonThreats(d,node.pieces);
    for(const p of node.pieces)if(p.side===enemy&&p.kind!=="dragon"&&reach.has(key(p.r,p.c))){
      const supported=ORTHO.some(function(step){return hasOtherSideAt(node.pieces,p.r+step[0],p.c+step[1],side,d.id);});
      score+=supported?(p.kind==="hunter"?520:(p.kind==="dog"?BOT_VALUE.dog:Math.round(BOT_VALUE[p.kind]*0.8))):48;
    }
  }
  return score;
}
function isNoisySearchMove(node,side,move){
  if(move.captures.length)return true;
  if(pinnedHunters(node.pieces,MOSS)!==pinnedHunters(move.next.pieces,MOSS)||pinnedHunters(node.pieces,RUST)!==pinnedHunters(move.next.pieces,RUST))return true;
  const beforeOwn=sideTacticalDanger(node.pieces,side,node.capturedHunters),afterOwn=sideTacticalDanger(move.next.pieces,side,move.next.capturedHunters);
  const beforeEnemy=sideTacticalDanger(node.pieces,otherSide(side),node.capturedHunters),afterEnemy=sideTacticalDanger(move.next.pieces,otherSide(side),move.next.capturedHunters);
  const ownLooseBefore=nonHunterDisplacementDanger(node.pieces,side),ownLooseAfter=nonHunterDisplacementDanger(move.next.pieces,side);
  const enemyLooseBefore=nonHunterDisplacementDanger(node.pieces,otherSide(side)),enemyLooseAfter=nonHunterDisplacementDanger(move.next.pieces,otherSide(side));
  return beforeOwn-afterOwn>=135||afterEnemy-beforeEnemy>=135||ownLooseBefore-ownLooseAfter>=80||enemyLooseAfter-enemyLooseBefore>=80;
}
function searchMoveOrder(node,side,move,ply,ctx,ttBest,depth){
  const id=searchMoveKey(move);if(id===ttBest)return 100000000;
  let score=signedMaterial(move.next.pieces,side)-signedMaterial(node.pieces,side);
  score+=(move.next.capturedHunters[side]-node.capturedHunters[side])*15000;
  score+=(pinnedHunters(node.pieces,otherSide(side))-pinnedHunters(move.next.pieces,otherSide(side)))*1600;
  score-=(pinnedHunters(move.next.pieces,side)-pinnedHunters(node.pieces,side))*1900;
  const source=node.pieces.find(function(p){return p.id===move.pieceId;}),moved=move.next.pieces.find(function(p){return p.id===move.pieceId;});
  if(source&&moved){
    const beforeProgress=side===MOSS?source.r:ROWS-1-source.r,afterProgress=side===MOSS?moved.r:ROWS-1-moved.r;
    if(move.kind==="dog")score+=(beforeProgress-afterProgress)*12;
    else if(move.kind==="child")score+=(beforeProgress-afterProgress)*7;
    score+=(Math.abs(source.c-2)-Math.abs(moved.c-2))*10;
    if(move.kind==="hunter")score+=(hunterDanger(source,node.pieces,node.capturedHunters[otherSide(side)])-hunterDanger(moved,move.next.pieces,move.next.capturedHunters[otherSide(side)]))*0.9;
    else if(move.kind==="dog"||move.kind==="child"){
      const beforeRisk=dragonDisplacementRisk(source,node.pieces)+surroundCaptureRisk(source,node.pieces);
      const afterRisk=dragonDisplacementRisk(moved,move.next.pieces)+surroundCaptureRisk(moved,move.next.pieces);
      score+=(beforeRisk-afterRisk)*0.75;
    }else if(move.kind==="dragon"){
      const reach=dragonThreats(moved,move.next.pieces);
      for(const target of move.next.pieces)if(target.side!==side&&target.kind==="hunter"&&reach.has(key(target.r,target.c))){
        const supported=ORTHO.some(function(d){return hasOtherSideAt(move.next.pieces,target.r+d[0],target.c+d[1],side,moved.id);});
        score+=supported?750:70;
      }
    }
  }
  const killer=ctx.killers[ply]||[];
  if(killer[0]===id)score+=6000;else if(killer[1]===id)score+=4500;
  score+=ctx.history.get(side+"|"+id)||0;
  return score;
}
function orderSearchMoves(node,side,moves,ply,ctx,ttBest,depth){
  moves.forEach(function(move){move._order=searchMoveOrder(node,side,move,ply,ctx,ttBest,depth||0);});
  moves.sort(function(a,b){return b._order-a._order;});
  return moves;
}
function recordQuietCutoff(ctx,side,move,depth,ply){
  if(move.captures.length)return;
  const id=searchMoveKey(move),slots=ctx.killers[ply]||(ctx.killers[ply]=[]);
  if(slots[0]!==id){slots[1]=slots[0];slots[0]=id;}
  const hkey=side+"|"+id;ctx.history.set(hkey,Math.min(20000,(ctx.history.get(hkey)||0)+depth*depth*8));
}
function scoreToTable(score,ply){
  if(score>BOT_WIN-10000)return score+ply;
  if(score< -BOT_WIN+10000)return score-ply;
  return score;
}
function scoreFromTable(score,ply){
  if(score>BOT_WIN-10000)return score-ply;
  if(score< -BOT_WIN+10000)return score+ply;
  return score;
}
function storeSearchEntry(table,keyForNode,entry){
  const previous=table.get(keyForNode);
  if(previous&&previous.depth>entry.depth)return;
  if(!previous&&table.size>=50000){
    let removed=0;for(const key of table.keys()){table.delete(key);if(++removed>=10000)break;}
  }
  table.set(keyForNode,entry);
}
function searchShouldStop(ctx){
  if(ctx.aborted)return true;ctx.nodes++;
  if((ctx.nodes&31)===0&&(ctx.nodes>=ctx.maxNodes||Date.now()-ctx.started>=ctx.timeLimit)){ctx.aborted=true;return true;}
  return false;
}
function searchTerminal(node,side,ply){
  if(node.capturedHunters[side]>=2)return BOT_WIN-ply;
  if(node.capturedHunters[otherSide(side)]>=2)return -BOT_WIN+ply;
  return null;
}
function quiescence(node,alpha,beta,side,ply,qdepth,ctx){
  if(searchShouldStop(ctx))return 0;
  const terminal=searchTerminal(node,side,ply);if(terminal!==null)return terminal;
  const stand=evaluatePosition(node,side,ply);
  if(qdepth>=4)return stand;
  if(stand>=beta)return stand;if(stand>alpha)alpha=stand;
  const moves=generateSearchMoves(node,side).filter(function(m){return isNoisySearchMove(node,side,m);});
  orderSearchMoves(node,side,moves,ply,ctx,null,0);
  for(const move of moves){
    const score=-quiescence(move.next,-beta,-alpha,otherSide(side),ply+1,qdepth+1,ctx);
    if(ctx.aborted)return 0;
    if(score>=beta)return score;if(score>alpha)alpha=score;
  }
  return alpha;
}
function alphaBeta(node,depth,alpha,beta,side,ply,ctx){
  if(searchShouldStop(ctx))return 0;
  const terminal=searchTerminal(node,side,ply);if(terminal!==null)return terminal;
  if(depth<=0)return quiescence(node,alpha,beta,side,ply,0,ctx);
  const keyForNode=searchPositionKey(node,side),alphaStart=alpha,betaStart=beta;
  const cached=ctx.table.get(keyForNode);let ttBest=null;
  if(cached){ttBest=cached.bestMove;if(cached.depth>=depth){const ttScore=scoreFromTable(cached.score,ply);if(cached.bound==="exact")return ttScore;if(cached.bound==="lower")alpha=Math.max(alpha,ttScore);else if(cached.bound==="upper")beta=Math.min(beta,ttScore);if(alpha>=beta)return ttScore;}}
  const moves=orderSearchMoves(node,side,generateSearchMoves(node,side),ply,ctx,ttBest,depth);
  if(!moves.length)return evaluatePosition(node,side,ply);
  let best=-Infinity,bestMove=null;
  for(let i=0;i<moves.length;i++){
    const move=moves[i];let score;
    if(i===0)score=-alphaBeta(move.next,depth-1,-beta,-alpha,otherSide(side),ply+1,ctx);
    else{
      const reduction=depth>=4&&i>=7&&(move.kind==="dog"||move.kind==="child")&&!move.captures.length&&!isNoisySearchMove(node,side,move)?1:0;
      score=-alphaBeta(move.next,depth-1-reduction,-alpha-1,-alpha,otherSide(side),ply+1,ctx);
      if(!ctx.aborted&&reduction&&score>alpha)score=-alphaBeta(move.next,depth-1,-alpha-1,-alpha,otherSide(side),ply+1,ctx);
      if(!ctx.aborted&&score>alpha&&score<beta)score=-alphaBeta(move.next,depth-1,-beta,-alpha,otherSide(side),ply+1,ctx);
    }
    if(ctx.aborted)return 0;
    if(score>best){best=score;bestMove=searchMoveKey(move);}
    if(score>alpha)alpha=score;
    if(alpha>=beta){recordQuietCutoff(ctx,side,move,depth,ply);break;}
  }
  const bound=best<=alphaStart?"upper":(best>=betaStart?"lower":"exact");storeSearchEntry(ctx.table,keyForNode,{depth:depth,score:scoreToTable(best,ply),bound:bound,bestMove:bestMove});
  return best;
}
function searchRoot(node,side,depth,ctx,rootMoves,window){
  const rootKey=searchPositionKey(node,side),previous=ctx.table.get(rootKey);
  const moves=orderSearchMoves(node,side,rootMoves||generateSearchMoves(node,side),0,ctx,previous?previous.bestMove:null,depth);
  let bestMove=null,bestScore=-Infinity,alpha=window?window.alpha:-Infinity,beta=window?window.beta:Infinity;
  const alphaStart=alpha,betaStart=beta;
  for(let i=0;i<moves.length;i++){
    const move=moves[i];let score;
    if(i===0)score=-alphaBeta(move.next,depth-1,-beta,-alpha,otherSide(side),1,ctx);
    else{
      score=-alphaBeta(move.next,depth-1,-alpha-1,-alpha,otherSide(side),1,ctx);
      if(!ctx.aborted&&score>alpha&&score<beta)score=-alphaBeta(move.next,depth-1,-beta,-alpha,otherSide(side),1,ctx);
    }
    if(ctx.aborted)break;
    if(score>bestScore){bestScore=score;bestMove=move;}
    if(score>alpha)alpha=score;
    if(alpha>=beta)break;
  }
  if(!ctx.aborted&&bestMove){const bound=bestScore<=alphaStart?"upper":(bestScore>=betaStart?"lower":"exact");storeSearchEntry(ctx.table,rootKey,{depth:depth,score:scoreToTable(bestScore,0),bound:bound,bestMove:searchMoveKey(bestMove)});}
  return {move:bestMove,score:bestScore,complete:!ctx.aborted};
}
function findStrongBotMove(side,rootState,timeLimit,maxNodes,persistentTable){
  rootState=rootState||state;
  const node={pieces:clonePieces(rootState.pieces),capturedHunters:{moss:rootState.capturedHunters.moss,rust:rootState.capturedHunters.rust},turn:side};
  const ctx={started:Date.now(),timeLimit:timeLimit||850,maxNodes:maxNodes||72000,nodes:0,aborted:false,table:persistentTable||BOT_SHARED_TT,killers:[],history:new Map()};
  const fallbackMoves=orderSearchMoves(node,side,generateSearchMoves(node,side),0,ctx,null,0);
  let best=null,bestFallbackScore=-Infinity;
  fallbackMoves.forEach(function(move){const value=-evaluatePosition(move.next,otherSide(side),1);move._fallbackScore=value;if(value>bestFallbackScore){bestFallbackScore=value;best=move;}});
  fallbackMoves.sort(function(a,b){return b._fallbackScore-a._fallbackScore;});
  let completedDepth=0,score=Number.isFinite(bestFallbackScore)?bestFallbackScore:0;
  if(best)storeSearchEntry(ctx.table,searchPositionKey(node,side),{depth:0,score:scoreToTable(score,0),bound:"exact",bestMove:searchMoveKey(best)});
  for(let depth=1;depth<=10&&!ctx.aborted;depth++){
    const center=score;let window=completedDepth?180:Infinity,result=null,attempt=0;
    do{
      const bounds=Number.isFinite(window)?{alpha:center-window,beta:center+window}:null;
      result=searchRoot(node,side,depth,ctx,fallbackMoves,bounds);
      if(!result.complete||!completedDepth||!Number.isFinite(window))break;
      if(result.score>center-window&&result.score<center+window)break;
      attempt++;window=attempt>=3?Infinity:window*3;
    }while(!ctx.aborted);
    if(result.complete&&result.move){best=result.move;score=result.score;completedDepth=depth;}
    else{if(completedDepth===0&&result.move)best=result.move;break;}
    if(Math.abs(score)>=BOT_WIN-20)break;
  }
  return {move:best,depth:completedDepth,nodes:ctx.nodes,score:score};
}
function makeBotWorkerSource(){
  const declarations="const COLS=5,ROWS=12,MOSS=\"moss\",RUST=\"rust\";\n"+
    "const SEARCH_OCCUPANCY_CACHE=new WeakMap(),TACTICAL_PROFILE_CACHE=new WeakMap(),BOT_SHARED_TT=new Map(),EMPTY_CELL=[];\n"+
    "const NAME={moss:\"Moss\",rust:\"Rust\"};\n"+
    "const ORTHO=[[1,0],[-1,0],[0,1],[0,-1]],DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]],ALL=ORTHO.concat(DIAG);\n"+
    "const BOT_VALUE={dog:220,child:320,hunter:1450,dragon:780},BOT_WIN=1000000;\n"+
    "const BOT_CAPTURE_PAIRS=[[[1,0],[-1,0]],[[0,1],[0,-1]],[[1,1],[-1,-1]],[[1,-1],[-1,1]]];\n";
  const functions=[key,inside,clonePieces,occupancyFor,piecesAt,topAt,dragonAt,hasSideAt,hasOtherSideAt,pinned,forward,dragonLeapClear,wouldCompleteThirdBackAndForth,pseudoMoves,isSurroundedByMap,resolveCaptures,resolveDragonDisplacement,dragonThreats,dragonDisplacementRisk,dragonsSeparated,simulate,otherSide,searchPositionKey,searchMoveKey,generateSearchMoves,hunterDanger,hunterSafety,surroundCaptureRisk,sideTacticalDanger,nonHunterDisplacementDanger,pinnedHunters,tacticalProfile,signedMaterial,evaluatePosition,isNoisySearchMove,searchMoveOrder,orderSearchMoves,recordQuietCutoff,scoreToTable,scoreFromTable,storeSearchEntry,searchShouldStop,searchTerminal,quiescence,alphaBeta,searchRoot,findStrongBotMove];
  const handler="self.onmessage=function(event){try{const d=event.data;const r=findStrongBotMove(d.side,{pieces:d.pieces,capturedHunters:d.capturedHunters},d.timeLimit,d.maxNodes,BOT_SHARED_TT);self.postMessage({job:d.job,move:r.move?{pieceId:r.move.pieceId,kind:r.move.kind,from:r.move.from,to:r.move.to}:null,depth:r.depth,nodes:r.nodes,score:r.score});}catch(error){self.postMessage({job:event.data.job,error:String(error)});}};";
  return declarations+functions.map(function(fn){return fn.toString();}).join("\n")+"\n"+handler;
}
function findById(id){return state.pieces.find(p=>p.id===id)||null;}
function fmtMove(piece,from,to){return NAME[piece.side]+" "+piece.kind+" "+String.fromCharCode(97+from.c)+(ROWS-from.r)+" → "+String.fromCharCode(97+to.c)+(ROWS-to.r);}
function playMove(piece,move){
  const valid=legalMoves(piece).some(m=>m.r===move.r&&m.c===move.c);if(!valid)return;
  const from={r:piece.r,c:piece.c};
  const outcome=simulate(piece,move,state.pieces,{moss:state.capturedHunters.moss,rust:state.capturedHunters.rust});if(!outcome)return;
  state.history.push(cloneSnapshot());
  const captures=outcome.captures;state.pieces=outcome.pieces;state.capturedHunters=outcome.capturedHunters;
  state.lastMove={id:piece.id,from:from,to:{r:move.r,c:move.c}};
  const entry=fmtMove(piece,from,move);
  if(captures.length)state.log.unshift(entry+" · "+captures.join(" "));
  else state.log.unshift(entry);
  state.log=state.log.slice(0,18);
  state.note=captures.join(" ");
  if(state.capturedHunters[piece.side]>=2){state.winner=piece.side;state.note=NAME[piece.side]+" has captured two hunters and wins.";}
  window.SiteAudio?.action("valley-hunt",state.winner?"win":captures.length?"capture":"move");
  state.turn=state.winner?state.turn:(state.turn===MOSS?RUST:MOSS);
  state.selected=null;render();queueBotMove();
}
function selectAt(r,c){
  if(state.winner||state.botThinking||state.gameMode==="bot-bot"||isBotTurn())return;
  const cell=piecesAt(state.pieces,r,c);const top=topAt(state.pieces,r,c);
  if(state.selected){
    const selected=findById(state.selected);const options=selected?legalMoves(selected):[];const chosen=options.find(m=>m.r===r&&m.c===c);
    if(chosen){playMove(selected,chosen);return;}
    if(selected&&pseudoMoves(selected,state.pieces,false).some(function(m){return m.r===r&&m.c===c;})&&wouldCompleteThirdBackAndForth(selected,r,c)){
      state.note="That piece has completed this back-and-forth loop twice; choose a different move.";render();return;
    }
  }
  if(top&&top.side===state.turn&&!pinned(top,state.pieces)){
    state.selected=top.id;state.note="";
  }else{
    state.selected=null;
    if(cell.some(p=>p.kind==="dragon")&&cell.some(p=>p.kind!=="dragon"))state.note="That piece is pinned beneath a dragon.";
    else if(top)state.note="That is the other side's piece.";
    else state.note="Select one of your pieces.";
  }
  render();
}
function tokenMarkup(piece,under){
  const kindName=piece.kind.charAt(0).toUpperCase()+piece.kind.slice(1);
  const icon="/assets/valley-hunt/"+piece.kind+".svg";
  let html='<span class="token '+piece.side+(piece.kind==="dragon"?' dragon':'')+'" title="'+NAME[piece.side]+" "+kindName+'"><img class="sigil" src="'+icon+'" alt=""></span>';
  if(under)html+='<span class="stack-under" title="Pinned '+NAME[under.side]+" "+under.kind+'"><img src="/assets/valley-hunt/'+under.kind+'.svg" alt=""></span><span class="pinned-ring"></span>';
  return html;
}
function buildBoard(){
  boardEl.innerHTML='<div class="goal-line top"></div><div class="goal-line bottom"></div>';
  const selected=findById(state.selected);const options=selected?legalMoves(selected):[];
  const legalSet=new Map(options.map(m=>[key(m.r,m.c),m]));
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const btn=document.createElement("button");btn.type="button";btn.className="cell";btn.setAttribute("role","gridcell");let cellLabel="Rank "+(ROWS-r)+", file "+String.fromCharCode(97+c);
    if((r+c)%2===1)btn.classList.add("shade");if(r>=4&&r<=7)btn.classList.add("in-valley");
    const here=piecesAt(state.pieces,r,c);const top=topAt(state.pieces,r,c);
    if(top){
      const under=top.kind==="dragon"?here.find(p=>p.id!==top.id)||null:null;
      btn.innerHTML=tokenMarkup(top,under);cellLabel=NAME[top.side]+" "+top.kind+(under?", pinning "+NAME[under.side]+" "+under.kind:"")+", rank "+(ROWS-r)+", file "+String.fromCharCode(97+c);
      if(legalSet.has(key(r,c))&&top.kind!=="dragon")btn.classList.add("occupied-landing");
    }
    btn.setAttribute("aria-label",cellLabel);
    if(selected&&selected.r===r&&selected.c===c)btn.classList.add("selected");
    if(legalSet.has(key(r,c)))btn.classList.add("legal");
    if(state.lastMove&&state.lastMove.from.r===r&&state.lastMove.from.c===c)btn.classList.add("last-from");
    if(state.lastMove&&state.lastMove.to.r===r&&state.lastMove.to.c===c)btn.classList.add("last-to");
    btn.addEventListener("click",function(){selectAt(r,c);});boardEl.appendChild(btn);
  }
  const left=document.getElementById("ranksLeft"),right=document.getElementById("ranksRight"),files=document.getElementById("files");
  left.innerHTML="";right.innerHTML="";files.innerHTML="";
  for(let r=ROWS;r>=1;r--){const a=document.createElement("span");a.textContent=String(r);left.appendChild(a);const b=document.createElement("span");b.textContent=String(r);right.appendChild(b);}
  for(let c=0;c<COLS;c++){const f=document.createElement("span");f.textContent=String.fromCharCode(97+c);files.appendChild(f);}
}
function statFor(side,kind){return state.pieces.filter(p=>p.side===side&&p.kind===kind).length;}
function renderScores(){
  const box=document.getElementById("scoreBlock");box.innerHTML="";
  [MOSS,RUST].forEach(function(side){
    const captured=state.capturedHunters[side];const remain=statFor(side,"hunter");
    const d=document.createElement("div");d.className="score"+(side===RUST?" rust":"");
    d.innerHTML='<div class="score-head"><span class="score-chip"></span>'+NAME[side]+'</div><div class="score-numbers"><div>Hunters<b>'+remain+' / 3</b></div><div>Hunters lost<b>'+captured+' / 2</b></div></div>';
    box.appendChild(d);
  });
}
function render(){
  buildBoard();renderScores();
  [MOSS,RUST].forEach(function(side){const strip=document.getElementById("strip-"+side);if(strip)strip.classList.toggle("active",state.turn===side);});
  const statusMain=document.getElementById("statusMain"),statusSub=document.getElementById("statusSub"),dot=document.getElementById("turnDot");
  dot.className="turn-dot"+(state.turn===RUST?" rust":"");
  if(state.winner){statusMain.textContent=NAME[state.winner]+" wins the Valley Hunt.";statusSub.textContent="Two of the opposing hunters have been captured.";}
  else if(state.botThinking){statusMain.textContent=NAME[state.turn]+" bot is thinking…";statusSub.textContent="Searching captures, hunter safety, and dragon pins.";}
  else if(state.gameMode==="bot-bot"&&state.botPaused){statusMain.textContent="Bots paused.";statusSub.textContent=NAME[state.turn]+" is next. Resume to continue the match.";}
  else if(state.selected){const p=findById(state.selected);statusMain.textContent=NAME[state.turn]+" selected the "+(p?p.kind:"piece")+".";statusSub.textContent="Choose a highlighted destination. A completed trap captures immediately.";}
  else if(isBotTurn()){statusMain.textContent=NAME[state.turn]+" bot to move";statusSub.textContent=state.note||"The bot is ready to calculate its move.";}
  else{statusMain.textContent=NAME[state.turn]+" to move";const last=state.lastMove?findById(state.lastMove.id):null;statusSub.textContent=state.note||(state.gameMode!=="local"&&last&&isBotSide(last.side)?"Bot search: depth "+state.botInfo.depth+" · "+state.botInfo.nodes.toLocaleString()+" nodes.":"Select a piece, then choose a highlighted square.");}
  const log=document.getElementById("moveLog");log.innerHTML="";
  if(!state.log.length){log.innerHTML='<div class="empty-log">The valley is quiet. Make the first move.</div>';}
  else state.log.slice(0,7).forEach(function(item){const line=document.createElement("div");line.className="log-item";line.textContent=item;log.appendChild(line);});
  document.getElementById("moveNote").textContent=state.note;
  document.getElementById("undoMove").disabled=state.history.length===0||state.botThinking;
  const toggle=document.getElementById("toggleBots");toggle.hidden=state.gameMode!=="bot-bot";toggle.textContent=state.botPaused?"Resume bots":"Pause bots";toggle.disabled=!!state.winner;
}
document.getElementById("newGame").addEventListener("click",reset);
document.getElementById("gameMode").addEventListener("change",reset);
document.getElementById("botThinkingTime").addEventListener("change",function(){state.botThinkingTimeMs=Number(this.value)||3000;});
document.getElementById("toggleBots").addEventListener("click",function(){if(state.gameMode!=="bot-bot"||state.winner)return;if(!state.botPaused&&state.botThinking){state.botJob++;state.botThinking=false;stopBotWorker();}state.botPaused=!state.botPaused;render();if(!state.botPaused)queueBotMove();});
document.getElementById("undoMove").addEventListener("click",function(){
  if(!state.history.length||state.botThinking)return;
  state.botJob++;let old=null;const steps=state.gameMode==="human-bot"&&state.history.length>=2?2:1;
  for(let i=0;i<steps;i++)old=state.history.pop();
  if(state.gameMode==="bot-bot")state.botPaused=true;
  state.pieces=old.pieces;state.turn=old.turn;state.winner=old.winner;state.capturedHunters=old.capturedHunters;state.log=old.log;state.note=old.note;state.lastMove=old.lastMove;state.selected=null;state.botThinking=false;render();queueBotMove();
});
function isBotSide(side){return state.gameMode==="bot-bot"||state.gameMode==="human-bot"&&side===RUST;}
function isBotTurn(){return isBotSide(state.turn)&&!(state.gameMode==="bot-bot"&&state.botPaused);}
function completeBotMove(job,result){
  if(job!==state.botJob||!state.botThinking)return;
  state.botThinking=false;state.botInfo={depth:result.depth||0,nodes:result.nodes||0};
  if(result.error){state.note="The bot search stopped unexpectedly. Start a new game or switch opponents.";render();return;}
  if(!result.move){state.note="The bot found no legal move under the dragon separation rule.";render();return;}
  const piece=findById(result.move.pieceId);
  if(!piece){state.note="The bot's selected piece is no longer available. Start a new game.";render();return;}
  playMove(piece,{r:result.move.to.r,c:result.move.to.c});
}
function queueBotMove(){
  if(!isBotTurn()||state.winner||state.botThinking)return;
  state.botThinking=true;state.note="";const job=++state.botJob;render();
  window.setTimeout(function(){
    if(job!==state.botJob)return;
    const botSide=state.turn;const payload={job:job,side:botSide,pieces:clonePieces(state.pieces),capturedHunters:{moss:state.capturedHunters.moss,rust:state.capturedHunters.rust},timeLimit:state.botThinkingTimeMs,maxNodes:180000};
    const fallback=function(fallbackJob){
      if(fallbackJob!==state.botJob||!state.botThinking)return;
      const snapshot={pieces:clonePieces(state.pieces),capturedHunters:{moss:state.capturedHunters.moss,rust:state.capturedHunters.rust}};
      const result=findStrongBotMove(state.turn,snapshot,state.botThinkingTimeMs,180000,BOT_SHARED_TT);completeBotMove(fallbackJob,result);
    };
    if(typeof Worker!=="undefined"&&typeof Blob!=="undefined"&&typeof URL!=="undefined"&&URL.createObjectURL){
      let pendingUrl=null;
      try{
        if(!state.botWorker){
          pendingUrl=URL.createObjectURL(new Blob([makeBotWorkerSource()],{type:"application/javascript"}));
          const worker=new Worker(pendingUrl);worker._valleyBotUrl=pendingUrl;pendingUrl=null;state.botWorker=worker;
          worker.onmessage=function(event){
            if(worker._valleyBotUrl){URL.revokeObjectURL(worker._valleyBotUrl);worker._valleyBotUrl=null;}
            if(event.data&&event.data.error){
              worker.terminate();state.botWorker=null;
              if(state.botThinking)fallback(state.botJob);
              return;
            }
            completeBotMove(event.data.job,event.data);
          };
          worker.onerror=function(){if(worker._valleyBotUrl){URL.revokeObjectURL(worker._valleyBotUrl);worker._valleyBotUrl=null;}worker.terminate();state.botWorker=null;if(state.botThinking)fallback(state.botJob);};
        }
        state.botWorker.postMessage(payload);return;
      }catch(error){if(pendingUrl)URL.revokeObjectURL(pendingUrl);if(state.botWorker){if(state.botWorker._valleyBotUrl)URL.revokeObjectURL(state.botWorker._valleyBotUrl);state.botWorker.terminate();state.botWorker=null;}}
    }
    fallback(job);
  },35);
}
reset();
})();
