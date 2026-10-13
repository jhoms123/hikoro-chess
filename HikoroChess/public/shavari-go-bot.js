(function(root,factory){
 const engine=root.ShavariGo||(typeof module==='object'&&module.exports?require('./shavari-go-engine'):null);
 const api=factory(engine);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ShavariGoBot=api;
})(typeof globalThis!=='undefined'?globalThis:this,B=>{
 'use strict';
 if(!B)throw new Error('ShavariGo must load before ShavariGoBot.');
 const ORTHO=[[-1,0],[1,0],[0,-1],[0,1]],
  MATERIAL={marshal:.18,warden:.08,banneret:.08,arbalist:.08,sapper:.17,cavalier:.16,sentry:.18,levy:0,keep:0},
  INFLUENCE={keep:.66,marshal:1.28,warden:1.05,banneret:.83,arbalist:.83,sapper:.7,cavalier:.95,sentry:.9,levy:.48},
  RADIUS={keep:3.3,marshal:3.7,warden:3.25,banneret:2.7,arbalist:2.7,sapper:2.6,cavalier:3.05,sentry:2.9,levy:2.45},
  RESERVE_WEIGHT={marshal:.34,warden:.3,banneret:.28,arbalist:.28,sapper:.28,cavalier:.28,sentry:.3,levy:.025};
 const profiles={
  builder:{name:'Moss · Builder',influence:1.28,liberties:1,attack:.76,network:1.35,security:1.02,rootBeam:5,replyBeam:4},
  tactician:{name:'Slate · Tactician',influence:.83,liberties:1.3,attack:1.42,network:.82,security:1.18,rootBeam:6,replyBeam:5}
 };
 const other=p=>B.other(p),inside=(s,x,y)=>x>=0&&y>=0&&x<s&&y<s,key=(x,y)=>x+','+y,
  clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function profileFor(config,owner){
  const p=config?.[owner]||config?.[String(owner)]||'builder';
  return typeof p==='string'?profiles[p]||profiles.builder:p;
 }
 function fieldFor(state,owner){
  const s=state.size,field=Array.from({length:s},()=>Array(s).fill(0));
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
   const unit=state.board[y][x];if(unit?.owner!==owner)continue;
   const reach=RADIUS[unit.rank],radius=Math.ceil(reach),strength=INFLUENCE[unit.rank];
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const nx=x+dx,ny=y+dy,d=Math.abs(dx)+Math.abs(dy);
    if(inside(s,nx,ny)&&!state.board[ny][nx]&&d<=reach)field[ny][nx]+=strength*Math.exp(-d/(reach*.62));
   }
  }
  return field;
 }
 function sourceOptions(state,owner){
  let total=0;
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const p=state.board[y][x];if(p?.owner!==owner||(p.rank!=='banneret'&&p.rank!=='arbalist')||!B.lineActive(state,{x,y},owner))continue;
   const dirs=p.rank==='banneret'?ORTHO:[[-1,-1],[1,-1],[-1,1],[1,1]];
   for(const [dx,dy]of dirs)for(let n=1;n<=B.LINE_REACH;n++){
    const nx=x+dx*n,ny=y+dy*n;if(!inside(state.size,nx,ny)||state.board[ny][nx])break;
    const hasAdjacent=B.adjacent({x:nx,y:ny},state.size).some(q=>state.board[q.y][q.x]?.owner===owner);
    if(!hasAdjacent)total++;
   }
  }
  return total;
 }
 function hasPlacementRoute(state,target,owner){
  if(B.adjacent(target,state.size).some(q=>state.board[q.y][q.x]?.owner===owner))return true;
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const p=state.board[y][x];if(p?.owner!==owner||(p.rank!=='banneret'&&p.rank!=='arbalist')||!B.lineActive(state,{x,y},owner))continue;
   const dx=target.x-x,dy=target.y-y,steps=Math.max(Math.abs(dx),Math.abs(dy));
   if(steps<1||steps>B.LINE_REACH)continue;
   if(p.rank==='banneret'&&!(dx===0||dy===0))continue;
   if(p.rank==='arbalist'&&Math.abs(dx)!==Math.abs(dy))continue;
   const sx=Math.sign(dx),sy=Math.sign(dy);let clear=true;
   for(let n=1;n<steps;n++)if(state.board[y+sy*n][x+sx*n]){clear=false;break;}
   if(clear)return true;
  }
  return B.RANKS.some(rank=>rank!=='keep'&&(state.reserves[owner]?.[rank]||0)>0&&B.routeOptions(state,target,owner,rank).length>0);
 }
 function reserveUtility(state,owner){
  let value=0;
  for(const [rank,weight]of Object.entries(RESERVE_WEIGHT)){
   const n=state.reserves[owner]?.[rank]||0;
   if(rank==='levy')value+=Math.min(12,n)*weight+Math.max(0,n-12)*.004;
   else value+=Math.min(5,n)*weight;
  }
  return value;
 }
 function isMarshalBeside(board,size,point,owner){
  return B.adjacent(point,size).some(q=>board[q.y][q.x]?.owner===owner&&board[q.y][q.x]?.rank==='marshal');
 }
 function vulnerableByLegalReply(state,group,attacker){
  if(state.result)return false;
  const libs=B.liberties(state.board,state.size,group);if(libs.size!==1)return false;
  const [encoded]=libs, [x,y]=encoded.split(',').map(Number),target={x,y},position={...state,player:attacker};
  for(const rank of B.RANKS){
   if(rank==='keep'||(state.reserves[attacker]?.[rank]||0)<=0)continue;
   for(const {kind,at,over} of B.routeOptions(position,target,attacker,rank)){
    const via={kind,at,over};
    const next=B.apply(position,{type:'place',rank,to:target,via},{speculative:true});
    if(next?.last?.captured?.some(c=>group.some(p=>p.x===c.at.x&&p.y===c.at.y)))return true;
   }
  }
  return false;
 }
 function groupSecurity(state,group,owner,profile){
  const board=state.board,size=state.size,enemy=other(owner),unitRanks=group.map(p=>board[p.y][p.x].rank),
   fortified=unitRanks.includes('keep'),warded=unitRanks.includes('warden'),libs=B.liberties(board,size,group).size;
  let value=0;
  const multiplier=1+Math.min(1.5,Math.sqrt(group.length)*.12);
  if(libs===1)value-=vulnerableByLegalReply(state,group,enemy)?8.4:2.15;
  else if(libs===2)value-=fortified?1.15:2.35;
  else if(libs===3)value-=fortified?.35:.82;
  if(libs>2)value+=Math.min(2.5,(libs-2)*.16);
  if(warded&&!group.some(p=>isMarshalBeside(board,size,p,enemy)))value+=.55*profile.security;
  const material=group.reduce((sum,p)=>sum+MATERIAL[board[p.y][p.x].rank],0);
  value-=material*Math.min(.28,1/Math.max(4,libs+2))*.24;
  return value*multiplier*profile.liberties;
 }
 function siegePressure(state,owner){
  const board=state.board,size=state.size,enemy=other(owner);let pressure=0;
  for(const group of B.groups(board,size,enemy)){
   const keeps=group.filter(p=>board[p.y][p.x]?.rank==='keep');if(!keeps.length)continue;
   let touched=0,openSites=0;
   for(const k of keeps){
    if(isMarshalBeside(board,size,k,owner))touched++;
    else if(B.adjacent(k,size).some(q=>!board[q.y][q.x]&&hasPlacementRoute(state,q,owner)))openSites++;
   }
   pressure+=touched*(keeps.length===1?1.6:.9);
   if(touched===keeps.length)pressure+=3.8;
   else pressure+=Math.min(openSites,keeps.length-touched)*.5;
  }
  for(const group of B.groups(board,size,enemy)){
   if(!group.some(p=>board[p.y][p.x]?.rank==='warden'))continue;
   if(group.some(p=>isMarshalBeside(board,size,p,owner)))pressure+=1.05;
  }
  return pressure;
 }
 function evaluate(state,perspective,config={}){
  if(state.result){
   if(state.result.by==='crownhold'||state.result.reason==='Resignation')return state.result.winner===perspective?1000:state.result.winner===other(perspective)?-1000:0;
   if(state.result.score)return state.result.score[perspective].total-state.result.score[other(perspective)].total;
  }
  const rival=other(perspective),ownProfile=profileFor(config,perspective),enemyProfile=profileFor(config,rival),
   scores=B.score(state),ownField=fieldFor(state,perspective),enemyField=fieldFor(state,rival);
  let value=scores[perspective].total-scores[rival].total;
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)if(!state.board[y][x]){
   const own=ownField[y][x],enemy=enemyField[y][x],total=own+enemy;
   const lead=total<.08?0:Math.tanh((own-enemy)*.72);
   const contested=1-Math.exp(-total*.5);
   value+=lead*contested*.17*(ownProfile.influence+enemyProfile.influence);
  }
  for(const [owner,sign]of [[perspective,1],[rival,-1]]){
   const profile=owner===perspective?ownProfile:enemyProfile;
   for(const group of B.groups(state.board,state.size,owner))value+=sign*groupSecurity(state,group,owner,profile);
   value+=sign*reserveUtility(state,owner);
   value+=sign*sourceOptions(state,owner)*.085*profile.network;
   value+=sign*siegePressure(state,owner)*profile.attack;
  }
  const enemyKeepPoints=B.groups(state.board,state.size,rival).flat().filter(p=>state.board[p.y][p.x]?.rank==='keep');
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const unit=state.board[y][x];if(!unit)continue;const sign=unit.owner===perspective?1:-1;
   value+=sign*MATERIAL[unit.rank];
   if(unit.rank==='marshal'){
    const targets=unit.owner===perspective?enemyKeepPoints:B.groups(state.board,state.size,perspective).flat().filter(p=>state.board[p.y][p.x]?.rank==='keep');
    for(const k of targets)if(Math.abs(k.x-x)+Math.abs(k.y-y)===1)value+=sign*.8;
   }
  }
  return value;
 }
 function legalCandidates(state){
  if(!state||state.result)return[];
  if(state.keepOpening)return B.legalKeepPlacements(state).map(to=>{
   const action={type:'place',rank:'keep',to},next=B.apply(state,action,{speculative:true});return{action,next};
  }).filter(candidate=>candidate.next);
  const owner=state.player,actions=[];
  for(const rank of B.RANKS){
   if(rank==='keep'||!state.reserves[owner][rank])continue;
   for(const {to,via}of B.placementTargets(state,owner,rank)){
    const action={type:'place',rank,to,via},next=B.apply(state,action,{speculative:true});
    if(next)actions.push({action,next});
   }
  }
  const pass=B.apply(state,{type:'pass'},{speculative:true});if(pass)actions.push({action:{type:'pass'},next:pass});
  return actions;
 }
 function moveReason(state,action,next){
  if(action.type==='pass')return'No placement is worth its cost in territory or tactical position.';
  const rank=action.rank,coord=B.coord(state,action.to),captured=next.last?.captured||[];
  if(rank==='keep')return`Opens with a Crownhold at ${coord}; this stronghold anchors later placements.`;
  if(captured.some(p=>p.rank==='keep'))return`Siege succeeds at ${coord}; an enemy Crownhold group is captured.`;
  if(captured.length)return`Captures ${captured.length} piece${captured.length===1?'':'s'} at ${coord}.`;
  if(rank==='sapper')return`Saps through one enemy piece and places beyond it at ${coord}.`;
  if(rank==='cavalier'&&action.via?.kind==='cavalier')return`Uses a Cavalier's knight leap to establish a foothold at ${coord}.`;
  if(rank==='sentry')return`Places a Sentry at ${coord} to silence nearby enemy projection lines.`;
  if(action.via?.kind==='banneret'||action.via?.kind==='arbalist')return`Extends a ${action.via.kind==='banneret'?'Standard-Bearer':'Crossbowman'} line with ${({marshal:'High Marshal',warden:'Royal Guard',levy:'Squire',banneret:'Standard-Bearer',arbalist:'Crossbowman',sapper:'Sapper',cavalier:'Cavalier',sentry:'Sentry'})[rank]||rank} at ${coord}.`;
  if(rank==='marshal')return`Places a High Marshal at ${coord} to threaten or complete a siege.`;
  if(rank==='warden')return`Places a Royal Guard at ${coord} to protect its connected group.`;
  if(rank==='banneret'||rank==='arbalist')return`Places a ${rank==='banneret'?'Standard-Bearer':'Crossbowman'} at ${coord} to open a new placement line.`;
  return`Places a Squire at ${coord} to extend the boundary and claim territory.`;
 }
 function tieBreak(state,action){
  const str=B.boardKey(state.board)+'|'+action.type+'|'+(action.rank||'')+'|'+(action.to?`${action.to.x},${action.to.y}`:'pass');
  let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0)/4294967295;
 }
 function openingKeepAction(state){
  const choices=B.legalKeepPlacements(state);if(!choices.length)return null;
  const owner=state.player,placed=state.keepPlacements?.[owner]||0,near=3,far=state.size-4;
  // Begin from the familiar corner star points; each side's second Keep aims
  // for the opposite diagonal. If a preferred point is occupied, use its
  // nearest legal intersection instead.
  const target=owner===1
   ?(placed===0?{x:near,y:near}:{x:far,y:far})
   :(placed===0?{x:far,y:near}:{x:near,y:far});
  const own=[],enemy=[];
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const piece=state.board[y][x];if(piece?.rank!=='keep')continue;
   (piece.owner===owner?own:enemy).push({x,y});
  }
  let best=null,bestValue=-Infinity;
  for(const to of choices){
   const anchorDistance=Math.abs(to.x-target.x)+Math.abs(to.y-target.y);
   const ownDistance=own.length?Math.min(...own.map(p=>Math.abs(to.x-p.x)+Math.abs(to.y-p.y))):0;
   const enemyDistance=enemy.length?Math.min(...enemy.map(p=>Math.abs(to.x-p.x)+Math.abs(to.y-p.y))):0;
   const value=-anchorDistance*12+(own.length?Math.min(ownDistance,12)*.11:0)+(enemy.length?Math.min(enemyDistance,10)*.035:0)+tieBreak(state,{type:'place',rank:'keep',to})*.001;
   if(value>bestValue){bestValue=value;best=to;}
  }
  return best?{type:'place',rank:'keep',to:best}:null;
 }
 function compare(a,b){return b.value-a.value||a.tie-b.tie;}
 const PIECE_SCORE={keep:9,marshal:2.8,warden:2.5,banneret:2.2,arbalist:2.2,sapper:2.8,cavalier:2.7,sentry:2.9,levy:1.6};
 const SOURCE_DIRS={banneret:ORTHO,arbalist:[[-1,-1],[1,-1],[-1,1],[1,1]]};
 function pieceCount(state,owner){let n=0;for(const row of state.board)for(const p of row)if(p?.owner===owner&&p.rank!=='keep')n++;return n;}
 function sourcePotential(board,size,at,rank,owner){
  let remote=0;const dirs=SOURCE_DIRS[rank]||[];
  if(!B.lineActive({board,size},at,owner))return 0;
  for(const [dx,dy]of dirs)for(let n=1;n<=B.LINE_REACH;n++){
   const x=at.x+dx*n,y=at.y+dy*n;if(!inside(size,x,y)||board[y][x])break;
   const adjacentFriend=B.adjacent({x,y},size).some(q=>board[q.y][q.x]?.owner===owner);
   if(!adjacentFriend)remote++;
  }
  return remote;
 }
 function openingBias(state,action,next,profile){
  if(action.type!=='place')return 0;
  const owner=state.player,rank=action.rank,p=action.to,ownCount=pieceCount(state,owner),opening=Math.max(0,1-ownCount/12);
  if(opening<=0)return 0;
  const edge=Math.min(p.x,p.y,state.size-1-p.x,state.size-1-p.y);
  let bias=edge===2?.72:edge===3?.52:edge===1?.28:edge===0?.08:edge===4?.18:0;
  if(action.via&&(action.via.kind==='banneret'||action.via.kind==='arbalist'))bias+=.32;
  if(rank==='sapper')bias+=.75;
  if(rank==='cavalier'&&action.via?.kind==='cavalier')bias+=.8;
  if(rank==='sentry')bias+=.42;
  if(rank==='banneret'||rank==='arbalist'){
   const count=sourcePotential(next.board,next.size,p,rank,owner);
   bias+=2.45+Math.min(2.4,count*.22);
   if(!state.board.some(row=>row.some(q=>q?.owner===owner&&q.rank===rank)))bias+=ownCount<4?2.35:ownCount<7?1.25:.4;
  }
  if(rank==='marshal'){
   for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
    const q=state.board[y][x];if(q?.owner!==other(owner)||(q.rank!=='keep'&&q.rank!=='warden'))continue;
    const d=Math.abs(x-p.x)+Math.abs(y-p.y);if(d===1)bias+=q.rank==='keep'?1.35:.6;else if(d===2)bias+=q.rank==='keep'?.48:.18;
   }
  }
  if(rank==='warden'){
   for(const q of B.adjacent(p,state.size)){
    const ally=state.board[q.y][q.x];if(ally?.owner!==owner)continue;
    const g=B.groupAt(state.board,state.size,q),libs=B.liberties(state.board,state.size,g).size;
    if(libs<=2)bias+=libs===1?1.4:.75;
   }
  }
  return bias*opening*(profile.network*.55+profile.influence*.25+profile.attack*.2);
 }
 function localInfluenceDelta(state,action,context,profile){
  if(action.type!=='place')return 0;
  const p=action.to,rank=action.rank,reach=RADIUS[rank],radius=Math.ceil(reach),strength=INFLUENCE[rank],own=context.own,enemy=context.enemy,owner=state.player;
  let delta=0;
  const weight=.17*(profile.influence+context.enemyProfile.influence)*1.8;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const x=p.x+dx,y=p.y+dy,d=Math.abs(dx)+Math.abs(dy);
   if(!inside(state.size,x,y)||state.board[y][x]||d>reach)continue;
   const oldOwn=own[y][x],oldEnemy=enemy[y][x],add=strength*Math.exp(-d/(reach*.62));
   const lead0=Math.tanh((oldOwn-oldEnemy)*.72),contest0=1-Math.exp(-(oldOwn+oldEnemy)*.5);
   const lead1=Math.tanh((oldOwn+add-oldEnemy)*.72),contest1=1-Math.exp(-(oldOwn+add+oldEnemy)*.5);
   delta+=(lead1*contest1-lead0*contest0)*weight;
  }
  return delta;
 }
 function fastPrior(state,candidate,context,config){
  const action=candidate.action,next=candidate.next,mover=state.player,profile=profileFor(config,mover),enemy=other(mover);
  if(action.type==='pass')return next.result?(evaluate(next,mover,config)-evaluate(state,mover,config)):-.68;
  let value=1+localInfluenceDelta(state,action,context,profile),captured=next.last?.captured||[];
  for(const piece of captured)value+=2+((PIECE_SCORE[piece.rank]||1)*.72)+(piece.rank==='keep'?9:0);
  if(action.type==='place'){
   const at=action.to,seen=new Set();
   for(const q of B.adjacent(at,state.size)){
    const before=state.board[q.y][q.x];if(before?.owner!==enemy)continue;
    const group=B.groupAt(state.board,state.size,q),sig=group.map(t=>key(t.x,t.y)).sort().join(';');if(seen.has(sig))continue;seen.add(sig);
    const oldLibs=B.liberties(state.board,state.size,group).size,newGroup=B.groupAt(next.board,next.size,q),newLibs=B.liberties(next.board,next.size,newGroup).size;
    const capturable=B.captureReady(next.board,next.size,newGroup,mover);
    if(newLibs===1&&capturable)value+=(7.2+Math.min(4,newGroup.length*.45))*profile.attack;
    else if(newLibs===2&&oldLibs>2)value+=(1.7+Math.min(2,newGroup.length*.18))*profile.attack;
   }
   const ownGroup=B.groupAt(next.board,next.size,at),ownLibs=B.liberties(next.board,next.size,ownGroup).size;
   const adjoiningOwn=[];for(const q of B.adjacent(at,state.size))if(state.board[q.y][q.x]?.owner===mover){const g=B.groupAt(state.board,state.size,q);if(!adjoiningOwn.some(a=>a.key===g.map(t=>key(t.x,t.y)).sort().join(';')))adjoiningOwn.push({group:g,key:g.map(t=>key(t.x,t.y)).sort().join(';')});}
   const mostThreatened=adjoiningOwn.reduce((m,a)=>Math.min(m,B.liberties(state.board,state.size,a.group).size),99);
   if(mostThreatened<=2&&ownLibs>mostThreatened)value+=(mostThreatened===1?2.7:1.25)*profile.security;
   if(ownLibs===1&&vulnerableByLegalReply(next,ownGroup,enemy))value-=7.5*profile.security;
   if(action.rank==='warden'&&!adjoiningOwn.some(a=>B.liberties(state.board,state.size,a.group).size<=2))value+=.32;
   if(action.rank==='marshal'){
    let siegeAdjacency=0;
    for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
     const q=state.board[y][x];if(q?.owner!==enemy||(q.rank!=='keep'&&q.rank!=='warden'))continue;
     const d=Math.abs(x-at.x)+Math.abs(y-at.y);if(d===1)siegeAdjacency+=q.rank==='keep'?1.8:.8;else if(d===2)siegeAdjacency+=q.rank==='keep'?.45:.2;
    }
    value+=siegeAdjacency*profile.attack;
   }
   if(action.rank==='banneret'||action.rank==='arbalist'){
    const remote=sourcePotential(next.board,next.size,at,action.rank,mover);
    value+=Math.min(3.2,remote*.17)*profile.network;
   }
   if(action.rank==='sapper')value+=1.1*profile.attack;
   if(action.rank==='cavalier'&&action.via?.kind==='cavalier')value+=.85*profile.network;
   if(action.rank==='sentry')value+=(sourceOptions(state,enemy)-sourceOptions(next,enemy))*.08*profile.attack;
   if(state.ply<2*state.size)value+=openingBias(state,action,next,profile);
  }
  return clamp(value,-24,24);
 }
 function capturePrior(candidate){
  let value=0;
  for(const piece of candidate.next?.last?.captured||[])value+=2+(PIECE_SCORE[piece.rank]||1)*.72+(piece.rank==='keep'?9:0);
  return value;
 }
 function diversePool(state,candidates,limit,config,exactRoot=false){
  const actor=state.player,profile=profileFor(config,actor),base=exactRoot?evaluate(state,actor,config):0;
  const context={own:fieldFor(state,actor),enemy:fieldFor(state,other(actor)),enemyProfile:profileFor(config,other(actor))};
  for(const c of candidates){
   c.raw=exactRoot?(evaluate(c.next,actor,config)-base)+openingBias(state,c.action,c.next,profile)+capturePrior(c):fastPrior(state,c,context,config);
   c.tie=tieBreak(state,c.action);
  }
  candidates.sort((a,b)=>b.raw-a.raw||a.tie-b.tie);
  const chosen=[],ids=new Set(),add=c=>{if(c&&!ids.has(actionKey(c.action))){ids.add(actionKey(c.action));chosen.push(c);}};
  // Preserve immediate captures, one strong option for every available rank, and pass.
  for(const c of candidates)if((c.next.last?.captured?.length||0)>0&&chosen.length<Math.min(5,limit))add(c);
  for(const rank of ['banneret','arbalist','marshal','warden','sapper','cavalier','sentry','levy'])add(candidates.find(c=>c.action.rank===rank));
  const pass=candidates.find(c=>c.action.type==='pass');
  for(const c of candidates){if(chosen.length>=limit-1)break;add(c);}
  if(pass)add(pass);
  for(const c of chosen)c.prior=0;
  let max=-Infinity;for(const c of chosen)max=Math.max(max,c.raw);
  let total=0;for(const c of chosen){c.prior=Math.exp(clamp((c.raw-max)/2.35,-18,0));total+=c.prior;}
  for(const c of chosen)c.prior/=total||1;
  return chosen.slice(0,limit);
 }
 function actionKey(a){return a.type==='pass'?'pass':`${a.rank}:${a.to.x},${a.to.y}`;}
 function searchPool(state,config,limit,exactRoot=false){
  const all=legalCandidates(state);
  if(!all.length)return[];
  const pool=diversePool(state,all,limit,config,exactRoot);
  // Do not retain every speculative board in each tree node.
  for(const c of pool)c.next=null;
  return pool;
 }
 function makeNode(state,parent=null,action=null,prior=1,depth=0){return{state,parent,action,prior,depth,visits:0,valueSum:0,children:[],pool:null,amaf:Object.create(null)};}
 function nodePool(node,config,rootLimit,nodeLimit){
  if(node.pool)return node.pool;
  node.pool=searchPool(node.state,config,node.parent?nodeLimit:rootLimit,!node.parent);
  return node.pool;
 }
 const RAVE_K=180;
 function raveStat(node,action){return node.amaf[actionKey(action)]||null;}
 function raveEnabled(state,config,searchOwner){return state.size===13||profileFor(config,searchOwner).attack>1.3;}
 function raveBeta(amafVisits,mcVisits){
  if(!amafVisits)return 0;
  return amafVisits/(amafVisits+mcVisits+(amafVisits*mcVisits)/RAVE_K);
 }
 function blendedQ(node,action,mcVisits,mcValue,config,searchOwner){
  const stat=raveStat(node,action);if(!stat||!stat.visits)return mcValue;
  const beta=raveEnabled(node.state,config,searchOwner)?raveBeta(stat.visits,mcVisits):0,amafValue=stat.valueSum/stat.visits;
  return mcValue*(1-beta)+amafValue*beta;
 }
 function puctChild(node,rootPlayer,config){
  const sign=node.state.player===rootPlayer?1:-1,scale=Math.sqrt(node.visits+1);let best=null,bestScore=-Infinity;
  for(const child of node.children){
   const mc=child.visits?child.valueSum/child.visits:0,q=blendedQ(node,child.action,child.visits,mc,config,rootPlayer);
   const score=sign*q+.96*child.prior*scale/(1+child.visits);
   if(score>bestScore){bestScore=score;best=child;}
  }
  return best;
 }
 function expansionCandidate(node,pool,width,rootPlayer,config){
  const sign=node.state.player===rootPlayer?1:-1,scale=Math.sqrt(node.visits+1),expanded=new Set(node.children.map(c=>actionKey(c.action)));
  let best=null,bestScore=-Infinity;
  for(let i=0;i<width;i++){
   const c=pool[i];if(!c||expanded.has(actionKey(c.action)))continue;
   const stat=raveStat(node,c.action),q=stat?.visits?stat.valueSum/stat.visits:0;
   const beta=stat?.visits&&raveEnabled(node.state,config,rootPlayer)?raveBeta(stat.visits,0):0;
   const score=sign*q*beta+.96*c.prior*scale;
   if(score>bestScore){bestScore=score;best=c;}
  }
  return best;
 }
 function updateRave(path,result,rootPlayer){
  let updates=0;
  for(let i=0;i<path.length;i++){
   const node=path[i],actor=node.state.player,seen=new Set();
   for(let j=i+1;j<path.length;j++){
    const edge=path[j],moveActor=edge.parent.state.player;
    if(moveActor!==actor||!edge.action)continue;
    // A pass has no board location and its value is phase-specific; never share it as an AMAF placement.
    if(edge.action.type==='pass')continue;
    const k=actionKey(edge.action);if(seen.has(k))continue;seen.add(k);
    let stat=node.amaf[k];if(!stat)stat=node.amaf[k]={visits:0,valueSum:0};
    stat.visits++;stat.valueSum+=result;updates++;
   }
  }
  return updates;
 }
 function scaledValue(state,perspective,config){
  const raw=evaluate(state,perspective,config),scale=Math.max(11,state.size*.88);
  return Math.tanh(raw/scale);
 }
 function opponentCanImproveAfterPass(state,owner,config){
  const rival=other(owner),reply={...state,player:rival,koBan:null},before=B.score(state),start=before[rival].total-before[owner].total,
   ranks=B.RANKS.filter(rank=>rank!=='keep'&&(reply.reserves[rival]?.[rank]||0)>0),
   context={own:fieldFor(reply,rival),enemy:fieldFor(reply,owner),enemyProfile:profileFor(config,owner)};
  for(const rank of ranks)for(const item of B.placementTargets(reply,rival,rank)){
   const action={type:'place',rank,to:item.to,via:item.via},next=B.apply(reply,action,{speculative:true});if(!next)continue;
   const score=B.score(next),advantage=score[rival].total-score[owner].total;
   if(advantage>start+.001)return true;
   // Also keep the game going for moves that improve influence or create an immediate tactical threat.
   if(fastPrior(reply,{action,next},context,config)>.18+1)return true;
  }
  return false;
 }
 function chooseAction(state,options={}){
  if(!state||state.result)return null;
  const config=options.profiles||{},actor=state.player,profile=profileFor(config,actor),rootLimit=options.rootWidth||26,nodeLimit=options.nodeWidth||12,
   iterations=options.iterations||((state.size===13?144:132)+(profile.attack>1?(state.size===13?24:20):0)),maxDepth=options.maxDepth||7;
  if(state.keepOpening){
   const action=openingKeepAction(state);if(!action)return null;
   const next=B.apply(state,action,{speculative:true});
   return{action,reason:moveReason(state,action,next),score:next?evaluate(next,actor,config):0,examined:B.legalKeepPlacements(state).length,iterations:0,depth:0};
  }
  const root=makeNode(state),rootCandidates=legalCandidates(state);
  if(!rootCandidates.length)return{action:{type:'pass'},reason:'No legal placement remains.',score:evaluate(state,actor,config),examined:0,iterations:0,depth:0};
  const baseline=evaluate(state,actor,config),rootExact=rootCandidates.map(c=>({action:c.action,next:c.next,value:evaluate(c.next,actor,config)}));
  root.pool=diversePool(state,rootCandidates,rootLimit,config,true);for(const c of root.pool)c.next=null;
  if(!root.pool.length)return null;
  let deepest=0;
  for(let sim=0;sim<iterations;sim++){
   let node=root,depth=0;const path=[root];
   while(depth<maxDepth&&!node.state.result){
    const pool=nodePool(node,config,rootLimit,nodeLimit);if(!pool.length)break;
    const width=Math.min(pool.length,Math.max(1,Math.floor(1+0.72*Math.sqrt(node.visits+1))));
    let child;
    if(node.children.length<width){
     const candidate=expansionCandidate(node,pool,width,actor,config)||pool[node.children.length];
     const next=B.apply(node.state,candidate.action,{speculative:true});
     if(!next){candidate.prior=0;continue;}
     child=makeNode(next,node,candidate.action,candidate.prior,node.depth+1);node.children.push(child);
     node=node.children[node.children.length-1];path.push(node);depth++;deepest=Math.max(deepest,depth);
     break;
    }
    child=puctChild(node,actor,config);if(!child)break;
    node=child;path.push(node);depth++;deepest=Math.max(deepest,depth);
   }
   const result=scaledValue(node.state,actor,config);
   if(raveEnabled(state,config,actor))updateRave(path,result,actor);
   for(let i=path.length-1;i>=0;i--){path[i].visits++;path[i].valueSum+=result;}
  }
  let best=null;
  for(const child of root.children){
   const mc=child.visits?child.valueSum/child.visits:-1,mean=blendedQ(root,child.action,child.visits,mc,config,actor);
   if(!best||child.visits>best.visits||child.visits===best.visits&&mean>best.mean)best={action:child.action,visits:child.visits,mean,prior:child.prior};
  }
  if(!best){const first=root.pool[0];best={action:first.action,visits:0,mean:0};}
  const pass=rootExact.find(c=>c.action.type==='pass'),bestLegal=rootExact.filter(c=>c.action.type!=='pass').sort((a,b)=>b.value-a.value)[0],passMargin=options.passMargin??.24;
  let chosenAction=best.action;
  if(best.action.type==='pass'&&bestLegal&&bestLegal.value>pass.value+passMargin)chosenAction=bestLegal.action;
  else if(pass&&bestLegal&&bestLegal.value<=pass.value+passMargin&&best.mean<Math.tanh((pass.value-baseline)/Math.max(11,state.size*.88))+0.09)chosenAction={type:'pass'};
  // A pass is premature if the opponent can still increase its exact territory score in one reply.
  let passDeferred=false;
  if(chosenAction.type==='pass'&&bestLegal&&opponentCanImproveAfterPass(state,actor,config)){chosenAction=bestLegal.action;passDeferred=true;}
  const next=B.apply(state,chosenAction,{speculative:true})||B.apply(state,{type:'pass'},{speculative:true});
  return{action:chosenAction,reason:moveReason(state,chosenAction,next),score:evaluate(next,actor,config),staticScore:evaluate(next,actor,config),examined:rootCandidates.length,iterations,depth:deepest,rootVisits:best.visits,rootPrior:best.prior||0,passDeferred,rootStats:root.children.map(c=>{const amaf=raveStat(root,c.action);return{action:c.action,visits:c.visits,value:c.visits?c.valueSum/c.visits:0,prior:c.prior,raveVisits:amaf?.visits||0,raveValue:amaf?.visits?amaf.valueSum/amaf.visits:0};}).sort((a,b)=>b.visits-a.visits)};
 }
 function profileName(name){return profiles[name]?.name||profiles.builder.name;}
 return Object.freeze({chooseAction,evaluate,legalCandidates,profiles:Object.freeze(profiles),profileName,moveReason,searchVersion:"v6-profile-adaptive-puct-rave"});
});
