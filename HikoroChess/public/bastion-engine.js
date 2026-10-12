(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.BastionMarches=factory();
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const SIZES=[13,19],RANKS=['keep','marshal','warden','levy'],
       STARTING={marshal:4,warden:8},KOMI=7.5,LETTERS='ABCDEFGHJKLMNOPQRSTUVWXYZ';
 const other=p=>p===1?2:1,inside=(s,p)=>Number.isInteger(p?.x)&&Number.isInteger(p?.y)&&p.x>=0&&p.y>=0&&p.x<s.size&&p.y<s.size,
       same=(a,b)=>a?.x===b?.x&&a?.y===b?.y,copyPos=p=>({x:p.x,y:p.y}),
       manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y),
       cloneBoard=b=>b.map(row=>row.map(cell=>cell?{owner:cell.owner,rank:cell.rank,cargo:cell.cargo||0}:null)),
       cloneReserves=r=>({1:{...r[1]},2:{...r[2]}}),
       copyAction=a=>JSON.parse(JSON.stringify(a));
 function makeState(size=19){
  if(!SIZES.includes(Number(size)))return null;
  size=Number(size);const board=Array.from({length:size},()=>Array(size).fill(null)),near=3,far=size-4;
  const place=(x,y,owner)=>{board[y][x]={owner,rank:'keep',cargo:0};};
  place(near,near,1);place(far,far,1);place(near,far,2);place(far,near,2);
  const state={size,board,player:1,reserves:{1:{...STARTING},2:{...STARTING}},captured:{1:0,2:0},ply:0,history:[],last:null,pendingSettle:null,result:null,seenKeys:[]};
  state.seenKeys=[positionKey(state)];return state;
 }
 function positionKey(state){return JSON.stringify([state.board.map(row=>row.map(p=>p?`${p.owner}${p.rank[0]}${p.cargo||0}`:'.').join('')).join('/'),state.reserves[1],state.reserves[2],state.player]);}
 function adjacent(p,size,diagonal=false){const dirs=diagonal?[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]:[[-1,0],[1,0],[0,-1],[0,1]];return dirs.map(([x,y])=>({x:p.x+x,y:p.y+y})).filter(q=>q.x>=0&&q.y>=0&&q.x<size&&q.y<size);}
 function pieceAt(state,p){return inside(state,p)?state.board[p.y][p.x]:null;}
 function groupAt(board,size,start){
  if(!inside({size},start)||!board[start.y][start.x])return [];
  const owner=board[start.y][start.x].owner,found=[],queue=[copyPos(start)],seen=new Set([start.x+','+start.y]);
  while(queue.length){const p=queue.pop();found.push(p);for(const q of adjacent(p,size)){const key=q.x+','+q.y;if(!seen.has(key)&&board[q.y][q.x]?.owner===owner){seen.add(key);queue.push(q);}}}
  return found;
 }
 function liberties(board,size,group){const out=new Set();for(const p of group)for(const q of adjacent(p,size))if(!board[q.y][q.x])out.add(q.x+','+q.y);return out;}
 function groups(board,size,owner){const result=[],seen=new Set();for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(board[y][x]?.owner===owner&&!seen.has(x+','+y)){const group=groupAt(board,size,{x,y});for(const p of group)seen.add(p.x+','+p.y);result.push(group);}return result;}
 function isFort(board,group){return group.some(p=>board[p.y][p.x]?.rank==='keep');}
 function siegeReady(board,size,group,attacker){
  const keeps=group.filter(p=>board[p.y][p.x]?.rank==='keep');
  return keeps.every(k=>adjacent(k,size).some(p=>board[p.y][p.x]?.owner===attacker&&board[p.y][p.x]?.rank==='marshal'));
 }
 function supported(state,rank,to,owner=state.player){
  if(rank==='marshal')return state.board.some((row,y)=>row.some((p,x)=>p?.owner===owner&&p.rank==='keep'&&manhattan({x,y},to)<=4));
  if(rank==='warden')return state.board.some((row,y)=>row.some((p,x)=>p?.owner===owner&&p.rank==='marshal'&&manhattan({x,y},to)<=3));
  if(rank==='levy')return state.board.some((row,y)=>row.some((p,x)=>p?.owner===owner&&p.rank==='warden'&&manhattan({x,y},to)<=2));
  return false;
 }
 function moveShape(state,piece,from,to){
  const dx=Math.abs(to.x-from.x),dy=Math.abs(to.y-from.y),d=dx+dy;
  if(piece.rank==='keep')return false;
  if(piece.rank==='levy')return d===1;
  if(piece.rank==='warden')return Math.max(dx,dy)===1;
  if(piece.rank==='marshal'){
   if(!(dx===0||dy===0)||d<1||d>3)return false;
   const sx=Math.sign(to.x-from.x),sy=Math.sign(to.y-from.y);
   for(let n=1;n<d;n++)if(state.board[from.y+sy*n][from.x+sx*n])return false;
   return true;
  }
  return false;
 }
 function withPositionCheck(state,next,actor,action){
  const enemy=other(actor),captured=[];
  for(const group of groups(next.board,next.size,enemy))if(liberties(next.board,next.size,group).size===0){
   if(isFort(next.board,group)&&!siegeReady(next.board,next.size,group,actor))return null;
   for(const p of group){const piece=next.board[p.y][p.x];captured.push({at:copyPos(p),owner:piece.owner,rank:piece.rank,cargo:piece.cargo||0});next.board[p.y][p.x]=null;}
  }
  if(groups(next.board,next.size,actor).some(group=>liberties(next.board,next.size,group).size===0))return null;
  next.captured[actor]+=captured.reduce((n,p)=>n+1+(p.cargo||0),0);
  next.pendingSettle=null;next.player=enemy;next.ply++;next.last={action:copyAction(action),captured};
  const key=positionKey(next);if(state.seenKeys.includes(key))return null;next.seenKeys=[...state.seenKeys,key];
  next.history.push({player:actor,action:copyAction(action),captured});return next;
 }
 function apply(state,action){
  if(!state||!action||state.result||!SIZES.includes(state.size))return null;
  const actor=state.player,next={...state,board:cloneBoard(state.board),reserves:cloneReserves(state.reserves),captured:{...state.captured},history:[...state.history],seenKeys:[...state.seenKeys],last:state.last?{...state.last}:null,pendingSettle:state.pendingSettle?{...state.pendingSettle}:null};
  if(action.type==='resign'){
   next.result={winner:other(actor),reason:'Resignation'};next.history.push({player:actor,action:copyAction(action),captured:[]});next.ply++;next.last={action:copyAction(action),captured:[]};return next;
  }
  if(action.type==='settle'){
   if(state.pendingSettle)return null;
   next.pendingSettle={by:actor};next.player=other(actor);next.ply++;next.history.push({player:actor,action:copyAction(action),captured:[]});next.last={action:copyAction(action),captured:[]};return next;
  }
  if(action.type==='accept-settle'){
   if(!state.pendingSettle||state.pendingSettle.by===actor)return null;
   const score=scoreBoard(next);const winner=score[1].total===score[2].total?0:score[1].total>score[2].total?1:2;
   next.result={winner,reason:'Settlement accepted',score};next.pendingSettle=null;next.ply++;next.history.push({player:actor,action:copyAction(action),captured:[]});next.last={action:copyAction(action),captured:[]};return next;
  }
  if(!['deploy','move','embark','disembark'].includes(action.type))return null;
  if(action.type==='deploy'){
   const rank=action.rank,to=action.to;if(!['marshal','warden','levy'].includes(rank)||!inside(state,to)||next.board[to.y][to.x]||!supported(state,rank,to)||rank!=='levy'&&!next.reserves[actor][rank])return null;
   next.board[to.y][to.x]={owner:actor,rank,cargo:0};if(rank!=='levy')next.reserves[actor][rank]--;
  }else if(action.type==='move'){
   const from=action.from,to=action.to;if(!inside(state,from)||!inside(state,to)||same(from,to)||next.board[to.y][to.x])return null;
   const piece=next.board[from.y][from.x];if(!piece||piece.owner!==actor||!moveShape(state,piece,from,to))return null;
   next.board[to.y][to.x]=piece;next.board[from.y][from.x]=null;
  }else if(action.type==='embark'){
   const from=action.from,at=action.at;if(!inside(state,from)||!inside(state,at)||manhattan(from,at)!==1)return null;
   const levy=next.board[from.y][from.x],warden=next.board[at.y][at.x];if(levy?.owner!==actor||levy.rank!=='levy'||warden?.owner!==actor||warden.rank!=='warden'||(warden.cargo||0)>=2)return null;
   warden.cargo=(warden.cargo||0)+1;next.board[from.y][from.x]=null;
  }else if(action.type==='disembark'){
   const at=action.at,drops=action.drops;if(!inside(state,at)||!Array.isArray(drops)||drops.length<1||drops.length>2)return null;
   const warden=next.board[at.y][at.x];if(warden?.owner!==actor||warden.rank!=='warden'||drops.length>warden.cargo)return null;
   const keys=new Set();for(const p of drops){if(!inside(state,p)||manhattan(at,p)!==1||next.board[p.y][p.x])return null;const key=p.x+','+p.y;if(keys.has(key))return null;keys.add(key);}
   warden.cargo-=drops.length;for(const p of drops)next.board[p.y][p.x]={owner:actor,rank:'levy',cargo:0};
  }
  return withPositionCheck(state,next,actor,action);
 }
 function legalDeployments(state,rank){if(!state||state.result||!['marshal','warden','levy'].includes(rank)||rank!=='levy'&&!state.reserves[state.player][rank])return[];const out=[];for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){const p={x,y};if(!state.board[y][x]&&supported(state,rank,p)&&apply(state,{type:'deploy',rank,to:p}))out.push(p);}return out;}
 function hasLegalDeployment(state,rank){if(!state||state.result||!['marshal','warden','levy'].includes(rank)||rank!=='levy'&&!state.reserves[state.player][rank])return false;for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){const to={x,y};if(!state.board[y][x]&&supported(state,rank,to)&&apply(state,{type:'deploy',rank,to}))return true;}return false;}
 function legalMoves(state,from){if(!state||state.result||!inside(state,from))return[];const piece=pieceAt(state,from);if(!piece||piece.owner!==state.player||piece.rank==='keep')return[];const out=[];for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){const to={x,y};if(!state.board[y][x]&&moveShape(state,piece,from,to)&&apply(state,{type:'move',from,to}))out.push(to);}return out;}
 function legalEmbarks(state,at){if(!state||state.result||!inside(state,at))return[];const w=pieceAt(state,at);if(w?.owner!==state.player||w.rank!=='warden'||(w.cargo||0)>=2)return[];return adjacent(at,state.size).filter(from=>{const p=pieceAt(state,from);return p?.owner===state.player&&p.rank==='levy'&&Boolean(apply(state,{type:'embark',from,at}));});}
 function legalDisembarks(state,at){if(!state||state.result||!inside(state,at))return[];const w=pieceAt(state,at);if(w?.owner!==state.player||w.rank!=='warden'||!w.cargo)return[];return adjacent(at,state.size).filter(p=>!pieceAt(state,p)&&Boolean(apply(state,{type:'disembark',at,drops:[p]})));}
 function scoreBoard(state){const result={1:{occupied:0,territory:0,komi:0,total:0},2:{occupied:0,territory:0,komi:KOMI,total:0}};for(const row of state.board)for(const p of row)if(p)result[p.owner].occupied++;
  const seen=new Set();for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)if(!state.board[y][x]&&!seen.has(x+','+y)){const queue=[{x,y}],region=[],touch=new Set();seen.add(x+','+y);while(queue.length){const p=queue.pop();region.push(p);for(const q of adjacent(p,state.size)){const piece=state.board[q.y][q.x];if(piece)touch.add(piece.owner);else{const key=q.x+','+q.y;if(!seen.has(key)){seen.add(key);queue.push(q);}}}}if(touch.size===1)result[touch.values().next().value].territory+=region.length;}
  for(const p of [1,2])result[p].total=result[p].occupied+result[p].territory+result[p].komi;return result;}
 function replay(journal,size=19,cursor=journal?.length){if(!Array.isArray(journal)||!Number.isInteger(cursor)||cursor<0||cursor>journal.length)return null;let state=makeState(size);if(!state)return null;for(const action of journal.slice(0,cursor)){state=apply(state,action);if(!state)return null;}return state;}
 function coord(state,p){return inside(state,p)?LETTERS[p.x]+(p.y+1):'';}
 return Object.freeze({SIZES,RANKS,KOMI,STARTING,initial:makeState,apply,replay,score:scoreBoard,groupAt,liberties,groups,positionKey,pieceAt,supported,moveShape,legalMoves,legalDeployments,hasLegalDeployment,legalEmbarks,legalDisembarks,coord,inside,other});
});
