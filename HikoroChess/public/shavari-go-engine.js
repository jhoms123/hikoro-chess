(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.ShavariGo=factory();
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const SIZES=[13],RANKS=['keep','marshal','warden','banneret','arbalist','sapper','cavalier','sentry','levy'],
  RESERVE={marshal:4,warden:6,banneret:4,arbalist:4,sapper:2,cavalier:2,sentry:2},LINE_REACH=Infinity,KOMI=3.5,
  LETTERS='ABCDEFGHJKLMNOPQRSTUVWXYZ',ORTHO=[[-1,0],[1,0],[0,-1],[0,1]],
  DIAG=[[-1,-1],[1,-1],[-1,1],[1,1]];
 const other=p=>p===1?2:1,copy=p=>({x:p.x,y:p.y}),same=(a,b)=>a?.x===b?.x&&a?.y===b?.y,
  inBounds=(size,p)=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&p.x>=0&&p.y>=0&&p.x<size&&p.y<size,
  cloneBoard=b=>b.map(row=>row.map(p=>p?{owner:p.owner,rank:p.rank}:null)),
  cloneReserves=r=>({1:{...r[1]},2:{...r[2]}}),
  copyAction=a=>JSON.parse(JSON.stringify(a));
 function levySupply(size){return size*size;}
 function reservesForSize(size){return{...RESERVE,levy:levySupply(size)};}
 function standardKeeps(size){
  if(!SIZES.includes(Number(size)))return null;
  const far=Number(size)-4;
  return{1:[{x:3,y:3},{x:far,y:far}],2:[{x:far,y:3},{x:3,y:far}]};
 }
 function normalizeKeeps(size,keeps){
  if(!SIZES.includes(Number(size))||!keeps)return null;
  const out={1:[],2:[]},used=new Set();
  for(const owner of [1,2]){
   const row=keeps[owner]||keeps[String(owner)];
   if(!Array.isArray(row)||row.length!==2)return null;
   for(const p of row){
    if(!inBounds(Number(size),p))return null;
    const k=p.x+','+p.y;if(used.has(k))return null;used.add(k);out[owner].push(copy(p));
   }
  }
  return out;
 }
 function boardKey(board){
  const code={keep:'K',marshal:'M',warden:'W',banneret:'B',arbalist:'A',sapper:'P',cavalier:'C',sentry:'T',levy:'L'};
  return board.map(row=>row.map(p=>p?(p.owner===1?'b':'w')+code[p.rank]:'.').join('')).join('/');
 }
 function positionKey(state){
  if(!state)return'';
  // Simple-ko legality and the two-pass end condition are part of the game
  // state. Omitting either can make a search/evaluation cache reuse an
  // impossible move or a non-terminal value for a finished position.
  return JSON.stringify([
   boardKey(state.board),state.reserves?.[1],state.reserves?.[2],state.player,
   Boolean(state.keepOpening),state.keepPlacements,state.koBan||null,
   state.consecutivePasses||0,state.result?.winner??null,state.result?.by||null,
   state.result?.reason||null
  ]);
 }
 function makeState(size=13,keeps=null){
  size=Number(size);if(!SIZES.includes(size))return null;
  const setup=keeps?normalizeKeeps(size,keeps):null;if(keeps&&!setup)return null;
  const board=Array.from({length:size},()=>Array(size).fill(null));
  const keepPlacements={1:0,2:0};
  if(setup)for(const owner of [1,2]){for(const p of setup[owner])board[p.y][p.x]={owner,rank:'keep'};keepPlacements[owner]=2;}
  const reserve=reservesForSize(size),state={size,board,player:1,
   reserves:{1:{...reserve},2:{...reserve}},captured:{1:0,2:0},ply:0,history:[],
   keepPlacements,keepOpening:!setup,last:null,consecutivePasses:0,result:null,koBan:null};
  return state;
 }
 function adjacent(p,size,diagonal=false){
  const dirs=diagonal?ORTHO.concat(DIAG):ORTHO;
  return dirs.map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})).filter(q=>inBounds(size,q));
 }
 function pieceAt(state,p){return state&&inBounds(state.size,p)?state.board[p.y][p.x]:null;}
 function groupAt(board,size,start){
  if(!inBounds(size,start)||!board[start.y][start.x])return[];
  const owner=board[start.y][start.x].owner,found=[],queue=[copy(start)],seen=new Set([start.x+','+start.y]);
  while(queue.length){
   const p=queue.pop();found.push(p);
   for(const q of adjacent(p,size)){const key=q.x+','+q.y;if(!seen.has(key)&&board[q.y][q.x]?.owner===owner){seen.add(key);queue.push(q);}}
  }
  return found;
 }
 function liberties(board,size,group){
  const out=new Set();for(const p of group)for(const q of adjacent(p,size))if(!board[q.y][q.x])out.add(q.x+','+q.y);return out;
 }
 function groups(board,size,owner){
  const out=[],seen=new Set();
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(board[y][x]?.owner===owner&&!seen.has(x+','+y)){
   const group=groupAt(board,size,{x,y});for(const p of group)seen.add(p.x+','+p.y);out.push(group);
  }
  return out;
 }
 function lineActive(state,from,owner){
  const source=pieceAt(state,from);if(!source||source.owner!==owner||(source.rank!=='banneret'&&source.rank!=='arbalist'))return false;
  return !adjacent(from,state.size).some(q=>{const p=pieceAt(state,q);return p?.owner!==owner&&p?.rank==='sentry';});
 }
 function lineGeometry(size,rank,from,to){
  if(!inBounds(size,from)||!inBounds(size,to))return null;
  const dx=to.x-from.x,dy=to.y-from.y,steps=Math.max(Math.abs(dx),Math.abs(dy));
  if(steps<1||steps>LINE_REACH)return null;
  if(rank==='banneret'&&!(dx===0||dy===0))return null;
  if(rank==='arbalist'&&Math.abs(dx)!==Math.abs(dy))return null;
  if(rank!=='banneret'&&rank!=='arbalist')return null;
  return{steps,sx:Math.sign(dx),sy:Math.sign(dy)};
 }
 function lineValid(board,size,rank,from,to){
  if(!inBounds(size,from)||!inBounds(size,to))return false;
  const source=board[from.y][from.x];if(!source||source.rank!==rank)return false;
  const path=lineGeometry(size,rank,from,to);if(!path)return false;
  for(let n=1;n<path.steps;n++)if(board[from.y+path.sy*n][from.x+path.sx*n])return false;
  return true;
 }
 function sapperLineValid(state,from,to,owner){
  const source=pieceAt(state,from);if(!source||source.owner!==owner||!lineActive(state,from,owner))return false;
  const path=lineGeometry(state.size,source.rank,from,to);if(!path)return false;
  let enemies=0;
  for(let n=1;n<path.steps;n++){
   const p=state.board[from.y+path.sy*n][from.x+path.sx*n];
   if(!p)continue;
   if(p.owner===owner||++enemies>1)return false;
  }
  const previous={x:to.x-path.sx,y:to.y-path.sy},blocker=pieceAt(state,previous);
  return enemies===1&&Boolean(blocker)&&blocker.owner!==owner;
 }
 function cavalierJump(from,to){
  const dx=Math.abs(to.x-from.x),dy=Math.abs(to.y-from.y);
  return dx*dy===2&&(dx===1||dy===1);
 }
 function routeOptions(state,to,owner=state?.player,rank=null){
  if(!state||!inBounds(state.size,to)||state.board[to.y][to.x])return[];
  const found=[];
  if(rank==='sapper'){
   for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
    const p=state.board[y][x];if(p?.owner!==owner||(p.rank!=='banneret'&&p.rank!=='arbalist')||!sapperLineValid(state,{x,y},to,owner))continue;
    const path=lineGeometry(state.size,p.rank,{x,y},to);found.push({kind:'sapper',at:{x,y},over:{x:to.x-path.sx,y:to.y-path.sy}});
   }
   return found;
  }
  for(const q of adjacent(to,state.size)){
   const p=state.board[q.y][q.x];if(p?.owner===owner)found.push({kind:'adjacent',at:q});
  }
  if(found.length)return found;
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const p=state.board[y][x];if(p?.owner!==owner||(p.rank!=='banneret'&&p.rank!=='arbalist'))continue;
   if(lineActive(state,{x,y},owner)&&lineValid(state.board,state.size,p.rank,{x,y},to))found.push({kind:p.rank,at:{x,y}});
  }
  if(rank==='cavalier')for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)
   if(state.board[y][x]?.owner===owner&&cavalierJump({x,y},to))found.push({kind:'cavalier',at:{x,y}});
  return found;
 }
 function canPlace(state,rank,to,owner=state?.player,via=null){
  if(!state||!RANKS.includes(rank)||!inBounds(state.size,to)||state.board[to.y][to.x])return false;
  if(rank==='keep')return Boolean(state.keepOpening&&!via&&(state.keepPlacements?.[owner]||0)<2);
  if(state.keepOpening)return false;
  if(state.reserves[owner]?.[rank]<=0)return false;
  if(via){
   if(via.kind==='adjacent'){
    const p=pieceAt(state,via.at);return rank!=='sapper'&&p?.owner===owner&&Math.abs(via.at.x-to.x)+Math.abs(via.at.y-to.y)===1;
   }
   if(via.kind==='banneret'||via.kind==='arbalist'){
    const p=pieceAt(state,via.at);return rank!=='sapper'&&p?.owner===owner&&p.rank===via.kind&&lineActive(state,via.at,owner)&&lineValid(state.board,state.size,via.kind,via.at,to);
   }
   if(via.kind==='sapper')return rank==='sapper'&&sapperLineValid(state,via.at,to,owner);
   if(via.kind==='cavalier')return rank==='cavalier'&&pieceAt(state,via.at)?.owner===owner&&cavalierJump(via.at,to);
   return false;
  }
  return routeOptions(state,to,owner,rank).length>0;
 }
 function placementTargets(state,owner=state?.player,rank=null){
  if(!state||state.result||state.keepOpening)return[];
  const out=new Map(),add=(p,via)=>{
   if(!inBounds(state.size,p)||state.board[p.y][p.x])return;
   const k=p.x+','+p.y,prior=out.get(k);
   if(!prior||via.kind==='adjacent'&&prior.kind!=='adjacent')out.set(k,{to:copy(p),via:{kind:via.kind,at:copy(via.at),...(via.over?{over:copy(via.over)}:{})}});
  };
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const piece=state.board[y][x];if(piece?.owner!==owner)continue;
   if(rank!=='sapper')for(const p of adjacent({x,y},state.size))add(p,{kind:'adjacent',at:{x,y}});
   if(rank==='cavalier'){
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
     const p={x:x+dx,y:y+dy};if(cavalierJump({x,y},p))add(p,{kind:'cavalier',at:{x,y}});
    }
   }
   if(piece.rank!=='banneret'&&piece.rank!=='arbalist'||!lineActive(state,{x,y},owner))continue;
   const dirs=piece.rank==='banneret'?ORTHO:DIAG;
   for(const [dx,dy]of dirs){let crossedEnemy=null;
    for(let n=1;n<=LINE_REACH;n++){
     const p={x:x+dx*n,y:y+dy*n};if(!inBounds(state.size,p))break;
     const obstruction=state.board[p.y][p.x];
     if(!obstruction){
      if(rank!=='sapper'&&!crossedEnemy)add(p,{kind:piece.rank,at:{x,y}});
      else if(rank==='sapper'&&crossedEnemy){add(p,{kind:'sapper',at:{x,y},over:crossedEnemy});break;}
      continue;
     }
     if(rank==='sapper'&&!crossedEnemy&&obstruction.owner!==owner){crossedEnemy={x:p.x,y:p.y};continue;}
     break;
    }
   }
  }
  if(rank==='sapper')return[...out.values()].filter(item=>item.via.kind==='sapper');
  if(rank&&rank!=='cavalier')return[...out.values()].filter(item=>item.via.kind==='adjacent'||item.via.kind==='banneret'||item.via.kind==='arbalist');
  return[...out.values()];
 }
 function captureReady(board,size,group,attacker){
  const keeps=group.filter(p=>board[p.y][p.x]?.rank==='keep');
  const wardens=group.filter(p=>board[p.y][p.x]?.rank==='warden');
  const touches=(point)=>adjacent(point,size).some(q=>board[q.y][q.x]?.owner===attacker&&board[q.y][q.x]?.rank==='marshal');
  if(keeps.length&&!keeps.every(touches))return false;
  // A Marshal attached to any part of the zero-liberty Warden group completes its siege.
  if(wardens.length&&!group.some(touches))return false;
  return true;
 }
 function scoreBoard(state){
  const score={1:{occupied:0,territory:0,komi:0,total:0},2:{occupied:0,territory:0,komi:KOMI,total:0}};
  for(const row of state.board)for(const p of row)if(p)score[p.owner].occupied++;
  const seen=new Set();
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)if(!state.board[y][x]&&!seen.has(x+','+y)){
   const queue=[{x,y}],region=[],touch=new Set();seen.add(x+','+y);
   while(queue.length){
    const p=queue.pop();region.push(p);
    for(const q of adjacent(p,state.size)){
     const stone=state.board[q.y][q.x];
     if(stone)touch.add(stone.owner);
     else{const key=q.x+','+q.y;if(!seen.has(key)){seen.add(key);queue.push(q);}}
    }
   }
   if(touch.size===1)score[touch.values().next().value].territory+=region.length;
  }
  // Territory scoring counts only empty, single-color regions. Occupied
  // intersections are tracked for display but do not add points.
  score[1].total=score[1].territory;
  score[2].total=score[2].territory+KOMI;
  return score;
 }
 function finishByScore(state,reason){
  const score=scoreBoard(state),winner=score[1].total===score[2].total?0:score[1].total>score[2].total?1:2;
  state.result={winner,reason,score};return state;
 }
 function finishByCrownhold(state,winner){
  const score=scoreBoard(state);
  state.result={winner,reason:'Crownhold captured — immediate victory.',score,by:'crownhold'};
  return state;
 }
 function cloneState(state,speculative){
  return{...state,board:cloneBoard(state.board),reserves:cloneReserves(state.reserves),
   captured:{...state.captured},keepPlacements:{...state.keepPlacements},history:speculative?state.history:state.history.slice(),
   last:state.last?{...state.last}:null};
 }
 function apply(state,action,options={}){
  if(!state||!action||state.result)return null;
  const actor=state.player,next=cloneState(state,Boolean(options.speculative));
  if(action.type==='resign'){
   next.result={winner:other(actor),reason:'Resignation'};
   next.ply++;next.last={action:copyAction(action),captured:[]};
   if(!options.speculative)next.history.push({player:actor,action:copyAction(action),captured:[]});
   return next;
  }
  if(action.type==='pass'){
   if(state.keepOpening)return null;
   next.consecutivePasses=(state.consecutivePasses||0)+1;next.koBan=null;
   next.player=other(actor);next.ply++;next.last={action:copyAction(action),captured:[]};
   if(!options.speculative)next.history.push({player:actor,action:copyAction(action),captured:[]});
   if(next.consecutivePasses>=2)finishByScore(next,'Two consecutive passes');
   return next;
  }
  if(action.type!=='place')return null;
  const rank=action.rank,to=action.to;
  if(!canPlace(state,rank,to,actor,action.via||null))return null;
  const beforeKey=boardKey(state.board),captured=[],seenGroups=new Set();
  next.board[to.y][to.x]={owner:actor,rank};
  if(rank==='keep'){
   const ownGroup=groupAt(next.board,next.size,to);
   if(!ownGroup.length||liberties(next.board,next.size,ownGroup).size===0)return null;
   if(groups(next.board,next.size,other(actor)).some(group=>liberties(next.board,next.size,group).size===0))return null;
   next.keepPlacements[actor]++;next.keepOpening=next.keepPlacements[1]<2||next.keepPlacements[2]<2;
   next.consecutivePasses=0;next.koBan=beforeKey;next.player=other(actor);next.ply++;
   next.last={action:copyAction(action),captured:[]};
   if(!options.speculative)next.history.push({player:actor,action:copyAction(action),captured:[]});
   return next;
  }
  for(const q of adjacent(to,state.size)){
   const enemyPiece=next.board[q.y][q.x];if(enemyPiece?.owner!==other(actor))continue;
   const group=groupAt(next.board,state.size,q),sig=group.map(p=>p.x+','+p.y).sort().join(';');
   if(seenGroups.has(sig))continue;seenGroups.add(sig);
   if(liberties(next.board,next.size,group).size!==0)continue;
   if(!captureReady(next.board,next.size,group,actor))return null;
   for(const p of group){
    const piece=next.board[p.y][p.x];captured.push({at:copy(p),owner:piece.owner,rank:piece.rank});
    if(piece.rank!=='keep')next.reserves[piece.owner][piece.rank]++;
    next.board[p.y][p.x]=null;
   }
  }
  const ownGroup=groupAt(next.board,next.size,to);
  if(!ownGroup.length||liberties(next.board,next.size,ownGroup).size===0)return null;
  const afterKey=boardKey(next.board);
  if(state.koBan&&afterKey===state.koBan)return null;
  next.reserves[actor][rank]--;next.captured[actor]+=captured.length;
  next.consecutivePasses=0;next.koBan=beforeKey;next.player=other(actor);next.ply++;
  next.last={action:copyAction(action),captured};
  if(!options.speculative)next.history.push({player:actor,action:copyAction(action),captured});
  if(captured.some(piece=>piece.rank==='keep'))finishByCrownhold(next,actor);
  return next;
 }
 function legalPlacements(state,rank){
  if(!state||state.result||!RANKS.includes(rank))return[];
  if(rank==='keep')return legalKeepPlacements(state).map(to=>({to,via:null}));
  if(state.keepOpening)return[];
  if(!state.reserves[state.player][rank])return[];
  const out=[];
  for(const item of placementTargets(state,state.player,rank)){
   const action={type:'place',rank,to:item.to,via:item.via},next=apply(state,action);
   if(next)out.push({to:item.to,via:item.via});
  }
  return out;
 }
 function legalKeepPlacements(state,owner=state?.player){
  if(!state||state.result||!state.keepOpening||owner!==state.player)return[];
  const out=[];
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const to={x,y};if(!state.board[y][x]&&apply(state,{type:'place',rank:'keep',to},{speculative:true}))out.push(to);
  }
  return out;
 }
 function coord(state,p){return inBounds(state.size,p)?LETTERS[p.x]+(state.size-p.y):'';}
 return Object.freeze({SIZES,RANKS,RESERVE,LINE_REACH,KOMI,ORTHO,DIAG,
  levySupply,reservesForSize,standardKeeps,normalizeKeeps,initial:makeState,
  boardKey,positionKey,
  adjacent,pieceAt,groupAt,liberties,groups,lineActive,routeOptions,canPlace,placementTargets,
  captureReady,score:scoreBoard,apply,legalPlacements,legalKeepPlacements,coord,other,inBounds});
});
