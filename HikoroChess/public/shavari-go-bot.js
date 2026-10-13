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
 const EVAL_CACHE=new Map(),EVAL_CACHE_LIMIT=24000,
  CROWNHOLD_CACHE=new Map(),CROWNHOLD_CACHE_LIMIT=6000;
 const other=p=>B.other(p),inside=(s,x,y)=>x>=0&&y>=0&&x<s&&y<s,key=(x,y)=>x+','+y,
  clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function profileFor(config,owner){
  const p=config?.[owner]||config?.[String(owner)]||'builder';
  return typeof p==='string'?profiles[p]||profiles.builder:p;
 }
 // Return the owner of each empty region using the exact final scoring rule:
 // 0 means neutral, 1 or 2 means territory for that side. Stones never score.
 function territoryOwnerMap(state){
  const s=state.size,owners=Array.from({length:s},()=>Array(s).fill(0)),seen=new Set();
  for(let y=0;y<s;y++)for(let x=0;x<s;x++)if(!state.board[y][x]&&!seen.has(key(x,y))){
   const queue=[{x,y}],region=[],touch=new Set();seen.add(key(x,y));
   while(queue.length){
    const p=queue.pop();region.push(p);
    for(const q of B.adjacent(p,s)){
     const piece=state.board[q.y][q.x];
     if(piece)touch.add(piece.owner);
     else{const k=key(q.x,q.y);if(!seen.has(k)){seen.add(k);queue.push(q);}}
    }
   }
   const owner=touch.size===1?touch.values().next().value:0;
   if(owner)for(const p of region)owners[p.y][p.x]=owner;
  }
  return owners;
 }
 function fieldFor(state,owner,territory=territoryOwnerMap(state)){
  const s=state.size,field=Array.from({length:s},()=>Array(s).fill(0));
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
   const unit=state.board[y][x];if(unit?.owner!==owner)continue;
   const reach=RADIUS[unit.rank],radius=Math.ceil(reach),strength=INFLUENCE[unit.rank];
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const nx=x+dx,ny=y+dy,d=Math.abs(dx)+Math.abs(dy);
    if(inside(s,nx,ny)&&!state.board[ny][nx]&&d<=reach&&territory[ny][nx]!==owner){
     // Influence is only a small forecast for undecided space. A stone cannot
     // claim points the rules already award, and cannot radiate through its own
     // completed territory to inflate its positional value.
     const territoryWeight=territory[ny][nx]===other(owner) ? .2 : 1;
     field[ny][nx]+=strength*Math.exp(-d/(reach*.62))*territoryWeight;
    }
   }
  }
  return field;
 }
 function sourceOptions(state,owner,territory=territoryOwnerMap(state)){
  const options=new Map();
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const p=state.board[y][x];if(p?.owner!==owner||(p.rank!=='banneret'&&p.rank!=='arbalist')||!B.lineActive(state,{x,y},owner))continue;
   const dirs=p.rank==='banneret'?ORTHO:[[-1,-1],[1,-1],[-1,1],[1,1]];
   for(const [dx,dy]of dirs)for(let n=1;n<=B.LINE_REACH;n++){
    const nx=x+dx*n,ny=y+dy*n;if(!inside(state.size,nx,ny)||state.board[ny][nx])break;
    const hasAdjacent=B.adjacent({x:nx,y:ny},state.size).some(q=>state.board[q.y][q.x]?.owner===owner);
    if(!hasAdjacent&&territory[ny][nx]!==owner){
     const k=key(nx,ny),weight=territory[ny][nx]===other(owner) ? .25 : 1;
     options.set(k,Math.max(options.get(k)||0,weight));
    }
   }
  }
  // Additional lines into the same open area have diminishing value.
  let total=0;for(const weight of options.values())total+=weight;
  return Math.min(24,total);
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
 function keepApproachThreats(state,owner){
  if(!state||state.result||state.keepOpening)return[];
  const attacker=other(owner),ranks=['levy','marshal','warden','banneret','arbalist','sapper','cavalier','sentry'];
  if(!ranks.some(rank=>(state.reserves[attacker]?.[rank]||0)>0))return[];
  const threats=[],seen=new Set();
  for(const group of B.groups(state.board,state.size,owner)){
   const keeps=group.filter(p=>state.board[p.y][p.x]?.rank==='keep');
   if(!keeps.length)continue;
   const liberties=B.liberties(state.board,state.size,group);
   if(liberties.size<2||liberties.size>3||!keeps.every(p=>isMarshalBeside(state.board,state.size,p,attacker)))continue;
   for(const encoded of liberties){
    const [lx,ly]=encoded.split(',').map(Number),liberty={x:lx,y:ly};
    for(const approach of B.adjacent(liberty,state.size)){
     const targetKey=key(approach.x,approach.y),sig=`${encoded}|${targetKey}`;
     if(state.board[approach.y][approach.x]||liberties.has(targetKey)||seen.has(sig))continue;
     let accessible=false;
     for(const rank of ranks){
      if(!(state.reserves[attacker]?.[rank]>0))continue;
      const routes=B.routeOptions(state,approach,attacker,rank);
      for(const via of routes){
       const setup=B.apply({...state,player:attacker},{type:'place',rank,to:approach,via},{speculative:true});
       if(setup){accessible=true;break;}
      }
      if(accessible)break;
     }
     if(accessible){seen.add(sig);threats.push({to:approach,liberty,keep:keeps[0]});}
    }
   }
  }
  return threats;
 }
 function keepApproachBonus(candidate,threats){
  const action=candidate?.action;
  if(action?.type!=='place'||!action.to||!threats?.length)return 0;
  let blocked=0;
  for(const threat of threats)if(threat.to.x===action.to.x&&threat.to.y===action.to.y)blocked++;
  return Math.min(12,blocked*6.5);
 }
 function keepSafetyBonus(state,candidate,threats,owner,keepGroups){
  let bonus=keepApproachBonus(candidate,threats);
  const action=candidate?.action;
  if(action?.type!=='place'||!action.to||!candidate.next)return bonus;
  const matching=(keepGroups||[]).filter(group=>B.liberties(state.board,state.size,group).has(key(action.to.x,action.to.y)));
  if(!matching.length)return bonus;
  const beforeLiberties=matching.reduce((sum,group)=>sum+B.liberties(state.board,state.size,group).size,0),
   afterLiberties=matching.reduce((sum,group)=>{
    const anchor=group.find(p=>state.board[p.y][p.x]?.rank==='keep'),nextGroup=B.groupAt(candidate.next.board,candidate.next.size,anchor);
    return sum+(nextGroup.length?B.liberties(candidate.next.board,candidate.next.size,nextGroup).size:0);
   },0),afterThreats=keepApproachThreats(candidate.next,owner).length;
  bonus+=clamp((afterLiberties-beforeLiberties)*3+(threats.length-afterThreats)*2,-5,10);
  return clamp(bonus,-5,14);
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
 function profileCacheKey(config){
  return[1,2].map(owner=>{const p=profileFor(config,owner);return[p.influence,p.liberties,p.attack,p.network,p.security].join(',');}).join('|');
 }
 function evaluate(state,perspective,config={}){
  if(!state)return 0;
  const cacheKey=`${B.positionKey(state)}|${perspective}|${profileCacheKey(config)}`;
  if(EVAL_CACHE.has(cacheKey)){
   const value=EVAL_CACHE.get(cacheKey);EVAL_CACHE.delete(cacheKey);EVAL_CACHE.set(cacheKey,value);return value;
  }
  const value=evaluateUncached(state,perspective,config);
  if(EVAL_CACHE.size>=EVAL_CACHE_LIMIT)EVAL_CACHE.delete(EVAL_CACHE.keys().next().value);
  EVAL_CACHE.set(cacheKey,value);return value;
 }
 function evaluateUncached(state,perspective,config={}){
  if(state.result){
   if(state.result.by==='crownhold'||state.result.reason==='Resignation')return state.result.winner===perspective?1000:state.result.winner===other(perspective)?-1000:0;
   if(state.result.score)return state.result.score[perspective].total-state.result.score[other(perspective)].total;
  }
  const rival=other(perspective),ownProfile=profileFor(config,perspective),enemyProfile=profileFor(config,rival),
   territory=territoryOwnerMap(state),ownField=fieldFor(state,perspective,territory),enemyField=fieldFor(state,rival,territory);
  // Exact score from the rules: count empty single-color regions only, then
  // add White's 7.5 komi. Occupied intersections never score.
  let value=(perspective===2?B.KOMI:-B.KOMI);
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)if(!state.board[y][x]){
   if(territory[y][x]===perspective)value++;
   else if(territory[y][x]===rival)value--;
   const own=ownField[y][x],enemy=enemyField[y][x],total=own+enemy;
   const lead=total<.08?0:Math.tanh((own-enemy)*.72);
   const contested=1-Math.exp(-total*.5);
   value+=lead*contested*.045*(ownProfile.influence+enemyProfile.influence);
  }
  for(const [owner,sign]of [[perspective,1],[rival,-1]]){
   const profile=owner===perspective?ownProfile:enemyProfile;
   for(const group of B.groups(state.board,state.size,owner))value+=sign*groupSecurity(state,group,owner,profile);
   value+=sign*reserveUtility(state,owner);
   value+=sign*sourceOptions(state,owner,territory)*.055*profile.network;
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
 function tieBreak(state,action,seed=0){
  const str=String(seed)+'|'+B.boardKey(state.board)+'|'+action.type+'|'+(action.rank||'')+'|'+(action.to?`${action.to.x},${action.to.y}`:'pass');
  let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0)/4294967295;
 }
 function legalKeepCandidates(state){
  const candidates=[];if(!state?.keepOpening||state.result)return candidates;
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)if(!state.board[y][x]){
   const action={type:'place',rank:'keep',to:{x,y}},next=B.apply(state,action,{speculative:true});
   if(next)candidates.push({action,next});
  }
  return candidates;
 }
 function keepOpeningValue(state,perspective){
  const rival=other(perspective),keeps={1:[],2:[]},size=state.size;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const p=state.board[y][x];if(p?.rank==='keep')keeps[p.owner].push({x,y});
  }
  let value=0;
  // A Keep supplies a compact placement foothold and a small local influence
  // field. Unlike final territory, this remains meaningful before either side
  // has built a boundary and does not award the whole empty board to one color.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!state.board[y][x]){
   let own=0,enemy=0;
   for(const p of keeps[perspective]){const d=Math.abs(x-p.x)+Math.abs(y-p.y);if(d<=5)own+=.72*Math.exp(-d/2.55);}
   for(const p of keeps[rival]){const d=Math.abs(x-p.x)+Math.abs(y-p.y);if(d<=5)enemy+=.72*Math.exp(-d/2.55);}
   const total=own+enemy;
   if(total>.025)value+=Math.tanh((own-enemy)*1.15)*(1-Math.exp(-total*.7))*.48;
  }
  for(const owner of [perspective,rival]){
   const sign=owner===perspective?1:-1,own=keeps[owner],enemy=keeps[other(owner)];
   for(const p of own){
    const edge=Math.min(p.x,p.y,size-1-p.x,size-1-p.y),liberties=B.adjacent(p,size).filter(q=>!state.board[q.y][q.x]).length;
    // The edge is tactically sensitive: fewer liberties make a Keep easier to
    // surround, while a modest central bias preserves room to build outward.
    value+=sign*(Math.min(edge,4)*.1+(liberties-3)*.13-(edge===0?1.1:edge===1?.4:0));
    // Early Shavari territory is easiest to secure from the third-line corner
    // anchors: they touch two board edges and leave room to build an enclosing
    // boundary. The old influence-only score overvalued the centre, where a
    // Keep expands into open space but has no cheap route to a corner.
    const anchors=[{x:3,y:3},{x:size-4,y:3},{x:3,y:size-4},{x:size-4,y:size-4}],
     anchorDistance=Math.min(...anchors.map(q=>Math.abs(p.x-q.x)+Math.abs(p.y-q.y)));
    value+=sign*4.8*Math.exp(-anchorDistance/2.5);
    if(enemy.length){
     const nearest=Math.min(...enemy.map(q=>Math.abs(p.x-q.x)+Math.abs(p.y-q.y)));
     // Keep groups need a Marshal at every Keep when captured. Starting too
     // close to an enemy Keep makes a fast siege much easier, so safety weighs
     // more than the small extra influence from contesting adjacent sites.
     const siegeRisk=nearest<5?-.9*(5-nearest)*(5-nearest):Math.min(4,nearest-5)*.18;
     value+=sign*siegeRisk;
    }
   }
   for(let i=0;i<own.length;i++)for(let j=i+1;j<own.length;j++){
    const d=Math.abs(own[i].x-own[j].x)+Math.abs(own[i].y-own[j].y);
    value+=sign*(Math.min(d,8)*.3-Math.max(0,d-10)*.14);
   }
  }
  return value;
 }
 function openingKeepAction(state,seed=0){
  const owner=state.player,choices=legalKeepCandidates(state);if(!choices.length)return null;
  let best=null,bestValue=-Infinity;
  for(const candidate of choices){
   let value=keepOpeningValue(candidate.next,owner),responses=legalKeepCandidates(candidate.next);
   if(responses.length){
    let worst=Infinity;
    for(const reply of responses)worst=Math.min(worst,keepOpeningValue(reply.next,owner));
    value=worst;
   }
   const rivalKeeps=[];
   for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)if(candidate.next.board[y][x]?.owner===other(owner)&&candidate.next.board[y][x]?.rank==='keep')rivalKeeps.push({x,y});
   if(rivalKeeps.length){
    const nearest=Math.min(...rivalKeeps.map(p=>Math.abs(p.x-candidate.action.to.x)+Math.abs(p.y-candidate.action.to.y)));
    // Keep positions are chosen before regular moves; a Keep placed in the
    // enemy's immediate neighborhood can lose before its influence matures.
    value-=nearest<5?1.2*(5-nearest)*(5-nearest):0;
   }
   value+=tieBreak(state,candidate.action,seed)*.0001;
   if(value>bestValue){bestValue=value;best=candidate;}
  }
  return best?{action:best.action,value:bestValue,examined:choices.length}:null;
 }
 function compare(a,b){return b.value-a.value||a.tie-b.tie;}
 const PIECE_SCORE={keep:9,marshal:2.8,warden:2.5,banneret:2.2,arbalist:2.2,sapper:2.8,cavalier:2.7,sentry:2.9,levy:1.6};
 const SOURCE_DIRS={banneret:ORTHO,arbalist:[[-1,-1],[1,-1],[-1,1],[1,1]]};
 function pieceCount(state,owner){let n=0;for(const row of state.board)for(const p of row)if(p?.owner===owner&&p.rank!=='keep')n++;return n;}
 function sourcePotential(board,size,at,rank,owner,territory=null){
  let remote=0;const seen=new Set(),dirs=SOURCE_DIRS[rank]||[];
  if(!B.lineActive({board,size},at,owner))return 0;
  for(const [dx,dy]of dirs)for(let n=1;n<=B.LINE_REACH;n++){
   const x=at.x+dx*n,y=at.y+dy*n;if(!inside(size,x,y)||board[y][x])break;
   const adjacentFriend=B.adjacent({x,y},size).some(q=>board[q.y][q.x]?.owner===owner),k=key(x,y);
   if(!adjacentFriend&&(!territory||territory[y][x]!==owner)&&!seen.has(k)){remote++;seen.add(k);}
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
   const count=sourcePotential(next.board,next.size,p,rank,owner,territoryOwnerMap(next));
   bias+=1.55+Math.min(1.6,count*.14);
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
  const weight=.045*(profile.influence+context.enemyProfile.influence)*1.5;
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
 function specialistActionValue(state,candidate,context,profile){
  const action=candidate.action,next=candidate.next,owner=state.player,enemy=other(owner),at=action.to;
  if(action.type!=='place'||!at)return 0;
  const beforeOwners=context.territory||territoryOwnerMap(state),targetOwner=beforeOwners[at.y][at.x];
  if(action.rank==='sapper'&&action.via?.kind==='sapper'){
   // Reward the Sapper for using its defining breach to reach contested ground,
   // not for consuming one of our already-scored points.
   if(targetOwner===owner)return 0;
   const liberties=B.liberties(next.board,next.size,B.groupAt(next.board,next.size,at)).size;
   return(targetOwner===enemy ? .78 : .46)+(liberties>=3 ? .24 : 0);
  }
  if(action.rank==='cavalier'&&action.via?.kind==='cavalier'){
   if(targetOwner===owner)return 0;
   const group=B.groupAt(next.board,next.size,at),liberties=B.liberties(next.board,next.size,group).size;
   return(targetOwner===enemy ? .72 : .42)+(liberties>=3 ? .2 : 0);
  }
  if(action.rank==='sentry'){
   const before=sourceOptions(state,enemy,beforeOwners),afterOwners=territoryOwnerMap(next),after=sourceOptions(next,enemy,afterOwners);
   return Math.min(1.5,Math.max(0,before-after)*.18)*profile.attack;
  }
  if(action.rank==='banneret'||action.rank==='arbalist'){
   const afterOwners=territoryOwnerMap(next),remote=sourcePotential(next.board,next.size,at,action.rank,owner,afterOwners);
   return Math.min(1.1,remote*.055)*profile.network;
  }
  return 0;
 }
 function fastPrior(state,candidate,context,config){
  const action=candidate.action,next=candidate.next,mover=state.player,profile=profileFor(config,mover),enemy=other(mover);
  if(action.type==='pass')return next.result?(evaluate(next,mover,config)-evaluate(state,mover,config)):-.68;
  let value=localInfluenceDelta(state,action,context,profile)+specialistActionValue(state,candidate,context,profile),captured=next.last?.captured||[];
  // Non-Keep captures return to the defender's reserve, so count tempo and
  // temporary loss of board presence without valuing them as permanently dead.
  for(const piece of captured)value+=piece.rank==='keep'?1000:.38+(['banneret','arbalist','marshal','sentry'].includes(piece.rank)?.16:0);
  if(action.type==='place'){
   const at=action.to,seen=new Set();
   for(const q of B.adjacent(at,state.size)){
    const before=state.board[q.y][q.x];if(before?.owner!==enemy)continue;
    const group=B.groupAt(state.board,state.size,q),sig=group.map(t=>key(t.x,t.y)).sort().join(';');if(seen.has(sig))continue;seen.add(sig);
    const oldLibs=B.liberties(state.board,state.size,group).size,newGroup=B.groupAt(next.board,next.size,q),newLibs=B.liberties(next.board,next.size,newGroup).size;
    const capturable=B.captureReady(next.board,next.size,newGroup,mover);
    if(newLibs===1&&capturable&&vulnerableByLegalReply(next,newGroup,mover))value+=(4.2+Math.min(2.4,newGroup.length*.3))*profile.attack;
    else if(newLibs===2&&oldLibs>2)value+=(1.05+Math.min(1.2,newGroup.length*.12))*profile.attack;
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
   if(action.rank==='marshal')value+=Math.max(0,siegePressure(next,mover)-siegePressure(state,mover))*.35*profile.attack;
   if(state.ply<2*state.size)value+=openingBias(state,action,next,profile);
  }
  return clamp(value,-24,24);
 }
 function capturePrior(candidate){
  let value=0;
  for(const piece of candidate.next?.last?.captured||[])value+=piece.rank==='keep'?1000:.38+(['banneret','arbalist','marshal','sentry'].includes(piece.rank)?.16:0);
  return value;
 }
 function diversePool(state,candidates,limit,config,exactRoot=false,approachThreats=null,keepGroups=null){
  const actor=state.player,profile=profileFor(config,actor),base=exactRoot?evaluate(state,actor,config):0;
  const territory=territoryOwnerMap(state),context={own:fieldFor(state,actor,territory),enemy:fieldFor(state,other(actor),territory),enemyProfile:profileFor(config,other(actor)),territory};
  for(const c of candidates){
   c.raw=(exactRoot?(evaluate(c.next,actor,config)-base)+openingBias(state,c.action,c.next,profile)+capturePrior(c)+specialistActionValue(state,c,context,profile):fastPrior(state,c,context,config))+keepSafetyBonus(state,c,approachThreats,actor,keepGroups);
   c.tie=tieBreak(state,c.action);
  }
  candidates.sort((a,b)=>b.raw-a.raw||a.tie-b.tie);
  // Factor the prior by piece rank so a rank with many legal placements
  // (usually Levy) does not drown out rare, high-impact specialist actions.
  // Every legal move remains available to later progressive widening.
  const groups=new Map();
  for(const c of candidates){const group=c.action.type==='pass'?'pass':c.action.rank;let list=groups.get(group);if(!list)groups.set(group,list=[]);list.push(c);}
  const maxima=[...groups.entries()].map(([group,list])=>({group,list,best:list[0].raw})),top=Math.max(...maxima.map(x=>x.best));
  let rankMass=0;for(const group of maxima){
   // Passing is a real option, but it should not receive a full piece-rank
   // prior simply because its action group contains one move. In late-game
   // positions that normalization made pass absorb nearly half the search
   // budget before any life-and-death or territory move was examined.
   group.mass=Math.exp(clamp((group.best-top)/3.1,-18,0))*(group.group==='pass'?.04:1);rankMass+=group.mass;
  }
  for(const group of maxima){
   group.mass/=rankMass||1;let moveMass=0;
   for(const c of group.list){c.prior=Math.exp(clamp((c.raw-group.best)/2.5,-18,0));moveMass+=c.prior;}
   for(const c of group.list)c.prior=group.mass*c.prior/(moveMass||1);
  }
  // Widening a single globally sorted list can spend the entire early budget
  // on Levy placements and never consider a Marshal, Sentry, or line piece.
  // Interleave each rank's ordered moves so the best move of several distinct
  // Shavari mechanics is available before any rank gets a deep local slice.
  const rankedGroups=maxima.filter(group=>group.group!=='pass').sort((a,b)=>b.mass-a.mass),
   passGroup=maxima.find(group=>group.group==='pass'),ordered=[];
  for(let offset=0;ordered.length<candidates.length;offset++){
   let added=false;
   for(const group of rankedGroups){if(group.list[offset]){ordered.push(group.list[offset]);added=true;}}
   if(!added)break;
  }
  if(passGroup)ordered.push(...passGroup.list);
  return ordered;
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
 function wideningLimit(node,poolLength,profile){
  const visits=Math.max(0,node.visits),coefficient=node.parent?(profile.attack>1?1.02:.9):(profile.attack>1?1.45:1.25);
  return Math.min(poolLength,Math.max(1,1+Math.floor(coefficient*Math.sqrt(visits))));
 }
 const RAVE_K=18;
 function raveStat(node,action){return node.amaf[actionKey(action)]||null;}
 function raveEnabled(state,action){
  // AMAF is useful here only for interchangeable low-risk Squire placements.
  // Keep, siege, line, breach, leap, and silence actions are too state-specific.
  return Boolean(state&&!state.keepOpening&&state.ply>=4&&state.ply<=28&&action?.type==='place'&&action.rank==='levy');
 }
 function raveBeta(amafVisits,mcVisits){
  if(!amafVisits)return 0;
  return amafVisits/(amafVisits+mcVisits+(amafVisits*mcVisits)/RAVE_K);
 }
 function blendedQ(node,action,mcVisits,mcValue,config,searchOwner){
  const stat=raveStat(node,action);if(!stat||!stat.visits)return mcValue;
  const beta=raveEnabled(node.state,action)?raveBeta(stat.visits,mcVisits):0,amafValue=stat.valueSum/stat.visits;
  return mcValue*(1-beta)+amafValue*beta;
 }
 function puctChild(node,rootPlayer,config){
  const sign=node.state.player===rootPlayer?1:-1,scale=Math.sqrt(node.visits+1);let best=null,bestScore=-Infinity;
  for(const child of node.children){
   const mc=child.visits?child.valueSum/child.visits:0,q=blendedQ(node,child.action,child.visits,mc,config,rootPlayer);
   const score=sign*q+1.25*child.prior*scale/(1+child.visits);
   if(score>bestScore){bestScore=score;best=child;}
  }
  return best;
 }
 function expansionCandidate(node,pool,width,rootPlayer,config){
  const sign=node.state.player===rootPlayer?1:-1,scale=Math.sqrt(node.visits+1),expanded=new Set(node.children.map(c=>actionKey(c.action)));
  let best=null,bestScore=-Infinity;
  for(let i=0;i<width;i++){
   const c=pool[i];if(!c||c.invalid||expanded.has(actionKey(c.action)))continue;
   const stat=raveStat(node,c.action),q=stat?.visits?stat.valueSum/stat.visits:0;
   const beta=stat?.visits&&raveEnabled(node.state,c.action)?raveBeta(stat.visits,0):0;
   const score=sign*q*beta+1.25*c.prior*scale;
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
    if(moveActor!==actor||!edge.action||edge.action.type!=='place'||edge.action.rank!=='levy')continue;
    // A pass has no board location and its value is phase-specific; never share it as an AMAF placement.
    if((edge.state.last?.captured||[]).length)continue;
    if(!raveEnabled(node.state,edge.action))continue;
    if(!B.routeOptions(node.state,edge.action.to,actor,'levy').length)continue;
    const k=actionKey(edge.action);if(seen.has(k))continue;seen.add(k);
    let stat=node.amaf[k];if(!stat)stat=node.amaf[k]={visits:0,valueSum:0};
    stat.visits++;stat.valueSum+=result;updates++;
   }
  }
  return updates;
 }
 function scaledValue(state,perspective,config){
  if(state&&!state.result){
   const win=immediateCrownholdCapture(state,state.player);
   if(win)return state.player===perspective?.995:-.995;
  }
  const raw=evaluate(state,perspective,config),scale=Math.max(11,state.size*.88);
  return Math.tanh(raw/scale);
 }
 function immediateCrownholdCapture(state,attacker){
  if(!state||state.result||state.keepOpening)return null;
  const defender=other(attacker),position=state.player===attacker?state:{...state,player:attacker};
  for(const group of B.groups(position.board,position.size,defender)){
   if(!group.some(p=>position.board[p.y][p.x]?.rank==='keep'))continue;
   // The finishing Marshal may itself be placed on the last liberty, so the
   // siege requirement must be checked by apply() after the candidate lands.
   const liberties=B.liberties(position.board,position.size,group);if(liberties.size!==1)continue;
   const [encoded]=liberties,[x,y]=encoded.split(',').map(Number),to={x,y};
   for(const rank of B.RANKS){
    if(rank==='keep'||(position.reserves[attacker]?.[rank]||0)<=0)continue;
    for(const via of B.routeOptions(position,to,attacker,rank)){
     const action={type:'place',rank,to,via},next=B.apply(position,action,{speculative:true});
     if(next?.result?.by==='crownhold')return{action,next,group};
    }
   }
  }
  return null;
 }
 function localCrownholdResponses(state,defender,attacker,keepGroup){
  const position={...state,player:defender},targets=new Set(),sentryTargets=new Set(),
   liberties=B.liberties(position.board,position.size,keepGroup);
  for(const encoded of liberties)targets.add(encoded);
  const attackPosition={...state,player:attacker};
  for(const encoded of liberties){
   const [x,y]=encoded.split(',').map(Number),to={x,y};
   const routes=[...B.routeOptions(attackPosition,to,attacker,'levy'),...B.routeOptions(attackPosition,to,attacker,'sapper'),...B.routeOptions(attackPosition,to,attacker,'cavalier')],seenRoutes=new Set();
   for(const via of routes){
    const routeKey=`${via.kind}:${via.at.x},${via.at.y}`;if(seenRoutes.has(routeKey))continue;seenRoutes.add(routeKey);
    if(via.kind!=='banneret'&&via.kind!=='arbalist'&&via.kind!=='sapper')continue;
    const dx=Math.sign(to.x-via.at.x),dy=Math.sign(to.y-via.at.y),steps=Math.max(Math.abs(to.x-via.at.x),Math.abs(to.y-via.at.y));
    for(let n=1;n<steps;n++){
     const point={x:via.at.x+dx*n,y:via.at.y+dy*n};
     if(!position.board[point.y][point.x])targets.add(key(point.x,point.y));
    }
    for(const point of B.adjacent(via.at,position.size))if(!position.board[point.y][point.x])sentryTargets.add(key(point.x,point.y));
   }
  }
  // Capturing an attacker in atari can reopen the Keep's last liberty or remove
  // the Marshal that completes Crownhold. Only those capture points can change
  // this tactical verdict, so do not construct every unrelated board move.
  for(const group of B.groups(position.board,position.size,attacker)){
   const groupLiberties=B.liberties(position.board,position.size,group);
   if(groupLiberties.size===1)for(const encoded of groupLiberties)targets.add(encoded);
  }
  const out=[],seen=new Set();
  for(const rank of B.RANKS){
   if(rank==='keep'||!(position.reserves[defender]?.[rank]>0))continue;
   for(const item of B.placementTargets(position,defender,rank)){
    const encoded=key(item.to.x,item.to.y);
    if(!targets.has(encoded)&&!(rank==='sentry'&&sentryTargets.has(encoded)))continue;
    const action={type:'place',rank,to:item.to,via:item.via},next=B.apply(position,action,{speculative:true});
    if(!next)continue;
    const sig=actionKey(action);if(seen.has(sig))continue;seen.add(sig);out.push({action,next});
   }
  }
  const pass=B.apply(position,{type:'pass'},{speculative:true});
  if(pass)out.push({action:{type:'pass'},next:pass});
  return out;
 }
 function forcedCrownholdThreat(state,attacker,maxLiberties=3){
  if(!state||state.result||state.keepOpening)return null;
  const cacheKey=`${attacker}|${maxLiberties}|${B.positionKey({...state,player:attacker})}`;
  if(CROWNHOLD_CACHE.has(cacheKey))return CROWNHOLD_CACHE.get(cacheKey);
  const result=forcedCrownholdThreatUncached(state,attacker,maxLiberties);
  if(CROWNHOLD_CACHE.size>=CROWNHOLD_CACHE_LIMIT)CROWNHOLD_CACHE.delete(CROWNHOLD_CACHE.keys().next().value);
  CROWNHOLD_CACHE.set(cacheKey,result);
  return result;
 }
 function forcedCrownholdThreatUncached(state,attacker,maxLiberties=3){
  if(!state||state.result||state.keepOpening)return null;
  const defender=other(attacker),position=state.player===attacker?state:{...state,player:attacker};
  for(const group of B.groups(position.board,position.size,defender)){
   if(!group.some(p=>position.board[p.y][p.x]?.rank==='keep'))continue;
   const liberties=B.liberties(position.board,position.size,group);
   const keepPoints=group.filter(p=>position.board[p.y][p.x]?.rank==='keep');
   const alreadySieged=keepPoints.every(p=>isMarshalBeside(position.board,position.size,p,attacker));
   if(liberties.size!==2&&!(maxLiberties>=3&&liberties.size===3&&alreadySieged))continue;
   for(const encoded of liberties){
    const [x,y]=encoded.split(',').map(Number),to={x,y};
    for(const rank of B.RANKS){
     if(rank==='keep'||(position.reserves[attacker]?.[rank]||0)<=0)continue;
     for(const via of B.routeOptions(position,to,attacker,rank)){
      const action={type:'place',rank,to,via},afterAttack=B.apply(position,action,{speculative:true});
      if(!afterAttack)continue;
      if(liberties.size===2){
       const winning=immediateCrownholdCapture(afterAttack,attacker);if(!winning)continue;
       // A one-liberty threat is forced only if the defender has no legal
       // reply that removes the immediate Crownhold capture.
       const defenses=legalCandidates(afterAttack),canSave=defenses.some(reply=>
        reply.next?.result?.winner===defender||!immediateCrownholdCapture(reply.next,attacker));
       if(!canSave)return{action,winningReply:winning.action,group};
       continue;
      }
      // Also read the tactical line one turn earlier: when a covered Keep
      // group has three liberties, an attack may reduce it to two; after each
      // legal defense, test whether the attacker can force a terminal atari.
      const afterGroup=B.groupAt(afterAttack.board,afterAttack.size,group.find(p=>position.board[p.y][p.x]?.rank==='keep')),
       afterLiberties=B.liberties(afterAttack.board,afterAttack.size,afterGroup);
      if(afterLiberties.size!==2)continue;
      const defenses=localCrownholdResponses(afterAttack,defender,attacker,afterGroup);let canSave=false,followUp=null;
      for(const reply of defenses){
       if(reply.next?.result?.winner===defender){canSave=true;break;}
       const line=immediateCrownholdCapture(reply.next,attacker)||forcedCrownholdThreat(reply.next,attacker,2);
       if(!line){canSave=true;break;}
       followUp=followUp||line;
      }
      if(!canSave)return{action,winningReply:followUp?.winningReply,group};
     }
    }
   }
  }
  return null;
 }
 function immediatelyCapturableGroups(state,owner){
  const attacker=other(owner),out=[];
  for(const group of B.groups(state.board,state.size,owner)){
   if(B.liberties(state.board,state.size,group).size===1&&vulnerableByLegalReply(state,group,attacker))out.push(group);
  }
  return out;
 }
 function tacticalCandidateSet(state,candidates,config){
  const actor=state.player,enemy=other(actor),ownThreats=immediatelyCapturableGroups(state,actor),
   territory=territoryOwnerMap(state),context={own:fieldFor(state,actor,territory),enemy:fieldFor(state,enemy,territory),enemyProfile:profileFor(config,enemy),territory};
  const ranked=[];
  for(const candidate of candidates){
   const action=candidate.action,next=candidate.next;
   if((next.last?.captured||[]).length||next.result){ranked.push({candidate,priority:80+fastPrior(state,candidate,context,config)});continue;}
   let priority=-Infinity;
   if(ownThreats.length){
    const saves=ownThreats.some(group=>{
     const anchor=group[0],saved=B.groupAt(next.board,next.size,anchor);
     return saved.length&&B.liberties(next.board,next.size,saved).size>1&&!vulnerableByLegalReply(next,saved,enemy);
    });
    if(saves)priority=45+fastPrior(state,candidate,context,config);
   }
   if(action.rank==='marshal'&&siegePressure(next,actor)-siegePressure(state,actor)>.6)priority=Math.max(priority,12+fastPrior(state,candidate,context,config));
   if(action.rank==='sentry'&&sourceOptions(state,enemy,territory)-sourceOptions(next,enemy,territoryOwnerMap(next))>0)priority=Math.max(priority,8+fastPrior(state,candidate,context,config));
   if(Number.isFinite(priority))ranked.push({candidate,priority});
  }
  ranked.sort((a,b)=>b.priority-a.priority);
  return{moves:ranked.slice(0,6).map(x=>x.candidate),mustRespond:ownThreats.length>0};
 }
 function quiescenceValue(state,perspective,config,remaining=2,alpha=-1,beta=1){
  const stand=scaledValue(state,perspective,config);
  if(Math.abs(stand)>.98||remaining<=0)return stand;
  const mover=state.player,ownThreats=immediatelyCapturableGroups(state,mover),
   enemyThreats=immediatelyCapturableGroups(state,other(mover)),noisy=Boolean(state.last?.captured?.length||ownThreats.length||enemyThreats.length);
  if(!noisy)return stand;
  const legal=legalCandidates(state),{moves,mustRespond}=tacticalCandidateSet(state,legal,config);
  if(!moves.length)return stand;
  const maximizing=mover===perspective;
  let best=mustRespond?(maximizing?-Infinity:Infinity):stand;
  for(const candidate of moves){
   const value=quiescenceValue(candidate.next,perspective,config,remaining-1,alpha,beta);
   if(maximizing){best=Math.max(best,value);alpha=Math.max(alpha,best);}else{best=Math.min(best,value);beta=Math.min(beta,best);}
   if(beta<=alpha)break;
  }
  return best;
 }
 function selfFillHasTacticalPurpose(state,candidate,territory,config={}){
  const action=candidate.action,next=candidate.next,owner=state.player,enemy=other(owner);
  if((next.last?.captured||[]).length||next.result)return true;
  const profile=profileFor(config,owner),adjacentGroups=[],seen=new Set();
  for(const p of B.adjacent(action.to,state.size))if(state.board[p.y][p.x]?.owner===owner){
   const group=B.groupAt(state.board,state.size,p),sig=group.map(q=>key(q.x,q.y)).sort().join(';');
   if(!seen.has(sig)){seen.add(sig);adjacentGroups.push(group);}
  }
  if(adjacentGroups.length){
   const before=adjacentGroups.reduce((sum,group)=>sum+groupSecurity(state,group,owner,profile),0),
    joined=B.groupAt(next.board,next.size,action.to),after=groupSecurity(next,joined,owner,profile);
   if(after-before>1.35)return true;
  }
  const beforeOwners=territory||territoryOwnerMap(state);
  if(action.rank==='sentry'){
   const afterOwners=territoryOwnerMap(next);
   if(sourceOptions(state,enemy,beforeOwners)-sourceOptions(next,enemy,afterOwners)>=2)return true;
  }
  if(action.rank==='marshal'&&siegePressure(next,owner)-siegePressure(state,owner)>=1.1)return true;
  if(action.rank==='banneret'||action.rank==='arbalist'){
   const afterOwners=territoryOwnerMap(next);
   const before=sourceOptions(state,owner,beforeOwners),after=sourceOptions(next,owner,afterOwners);
   if(after-before>=3)return true;
  }
  return false;
 }
 function wastefulSelfFill(state,candidate,territory,config={}){
  const action=candidate.action;if(action.type!=='place'||!action.to||territory[action.to.y][action.to.x]!==state.player)return false;
  // With no capture, occupying one of our own scoring points necessarily
  // removes that point from our area. Keep it only for a concrete rule effect.
  if((candidate.next.last?.captured||[]).length)return false;
  return!selfFillHasTacticalPurpose(state,candidate,territory,config);
 }
 function opponentCanImproveAfterPass(state,owner,config){
  const rival=other(owner),reply={...state,player:rival,koBan:null},before=B.score(state),start=before[rival].total-before[owner].total,
   ranks=B.RANKS.filter(rank=>rank!=='keep'&&(reply.reserves[rival]?.[rank]||0)>0),
   territory=territoryOwnerMap(reply),context={own:fieldFor(reply,rival,territory),enemy:fieldFor(reply,owner,territory),enemyProfile:profileFor(config,owner),territory};
  for(const rank of ranks)for(const item of B.placementTargets(reply,rival,rank)){
   const action={type:'place',rank,to:item.to,via:item.via},next=B.apply(reply,action,{speculative:true});if(!next)continue;
   const score=B.score(next),advantage=score[rival].total-score[owner].total;
   if(advantage>start+.001)return true;
   // Continue for a substantial tactical or frontier gain, not merely because
   // another legal placement has a positive generic prior.
   if(fastPrior(reply,{action,next},context,config)>.78)return true;
  }
  return false;
 }
 function chooseAction(state,options={}){
  if(!state||state.result)return null;
  const config=options.profiles||{},actor=state.player,profile=profileFor(config,actor),rootLimit=Infinity,nodeLimit=Infinity,
   iterations=options.iterations??((state.size===13?144:132)+(profile.attack>1?(state.size===13?24:20):0)),maxDepth=options.maxDepth??7;
  if(state.keepOpening){
   const opening=openingKeepAction(state,options.seed||0);if(!opening)return null;
   const next=B.apply(state,opening.action,{speculative:true});
   return{action:opening.action,reason:moveReason(state,opening.action,next),score:opening.value,examined:opening.examined,iterations:0,depth:2,openingSearch:true};
  }
  const root=makeNode(state),allRootCandidates=legalCandidates(state);
  if(!allRootCandidates.length)return{action:{type:'pass'},reason:'No legal placement remains.',score:evaluate(state,actor,config),examined:0,iterations:0,depth:0};
  const immediateWin=allRootCandidates.find(c=>c.next?.result?.by==='crownhold');
  if(immediateWin)return{action:immediateWin.action,reason:moveReason(state,immediateWin.action,immediateWin.next),score:1000,staticScore:1000,examined:allRootCandidates.length,iterations:0,depth:1,forcedWin:true};
  let rootCandidates=allRootCandidates;
  // Check direct captures and the game's most important one-tempo setup:
  // an opponent move that puts a Keep group into an uncapturable-atari.
  const unsafeRootCandidates=[],forcedUnsafeRootCandidates=[],enemy=other(actor),ownKeepGroups=B.groups(state.board,state.size,actor)
   .filter(group=>group.some(p=>state.board[p.y][p.x]?.rank==='keep')),
   watchKeepGroups=ownKeepGroups.filter(group=>{
    const liberties=B.liberties(state.board,state.size,group),keeps=group.filter(p=>state.board[p.y][p.x]?.rank==='keep');
    return liberties.size<=2||liberties.size===3&&keeps.every(p=>isMarshalBeside(state.board,state.size,p,enemy));
   }),watchOwnKeep=watchKeepGroups.length>0,
   keepLibertyTargets=new Set(watchKeepGroups.flatMap(group=>[...B.liberties(state.board,state.size,group)])),
   approachThreats=watchOwnKeep?keepApproachThreats(state,actor):[],preThreat=watchOwnKeep?forcedCrownholdThreat({...state,player:enemy},enemy):null,
   plannedLiberties=preThreat?B.liberties(state.board,state.size,preThreat.group):new Set();
  function changesPlannedSiege(candidate){
   const action=candidate.action;if(action.type!=='place'||!action.to)return false;
   if(plannedLiberties.has(key(action.to.x,action.to.y)))return true;
   if((candidate.next.last?.captured||[]).length||action.rank==='sentry')return true;
   const attack=preThreat?.action,via=attack?.via;
   if(!via||!['banneret','arbalist','sapper'].includes(via.kind))return false;
   const dx=Math.sign(attack.to.x-via.at.x),dy=Math.sign(attack.to.y-via.at.y),steps=Math.max(Math.abs(attack.to.x-via.at.x),Math.abs(attack.to.y-via.at.y));
   for(let n=1;n<steps;n++)if(action.to.x===via.at.x+dx*n&&action.to.y===via.at.y+dy*n)return true;
   return false;
  }
  for(const c of rootCandidates){
   if(c.next?.result?.winner===actor)continue;
   if(immediateCrownholdCapture(c.next,enemy)){unsafeRootCandidates.push(c);continue;}
   if(preThreat&&!changesPlannedSiege(c)){unsafeRootCandidates.push(c);forcedUnsafeRootCandidates.push(c);continue;}
   const action=c.action,keepSafetyChanged=action.type==='pass'||Boolean(c.next?.last?.captured?.length)||
    Boolean(action.to&&keepLibertyTargets.has(key(action.to.x,action.to.y)));
   if(watchOwnKeep&&(preThreat?changesPlannedSiege(c):keepSafetyChanged)&&forcedCrownholdThreat(c.next,enemy)){
    unsafeRootCandidates.push(c);forcedUnsafeRootCandidates.push(c);
   }
  }
  const rootProtection=new Map(rootCandidates.map(c=>[actionKey(c.action),keepSafetyBonus(state,c,approachThreats,actor,watchKeepGroups)])),
   urgentApproachDefense=!preThreat&&approachThreats.length>0&&watchKeepGroups.some(group=>B.liberties(state.board,state.size,group).size<=2),
   bestProtection=urgentApproachDefense?Math.max(0,...rootProtection.values()):0;
  let approachFiltered=0;
  if(bestProtection>0){
   const protective=rootCandidates.filter(c=>(rootProtection.get(actionKey(c.action))||0)>=bestProtection-.001);
   if(protective.length&&protective.length<rootCandidates.length){
    approachFiltered=rootCandidates.length-protective.length;
    const kept=new Set(protective.map(c=>actionKey(c.action)));
    for(const c of rootCandidates)if(!kept.has(actionKey(c.action)))unsafeRootCandidates.push(c);
    rootCandidates=protective;
   }
  }
  const unsafeKeys=new Set(unsafeRootCandidates.map(c=>actionKey(c.action))),
   safeRootCandidates=rootCandidates.filter(c=>c.next?.result?.winner===actor||!unsafeKeys.has(actionKey(c.action)));
  if(safeRootCandidates.length)rootCandidates=safeRootCandidates;
  const baseline=evaluate(state,actor,config),territory=territoryOwnerMap(state),rootContext={own:fieldFor(state,actor,territory),enemy:fieldFor(state,other(actor),territory),enemyProfile:profileFor(config,other(actor)),territory},
   rootExact=rootCandidates.map(c=>{
    const approachBonus=keepSafetyBonus(state,c,approachThreats,actor,watchKeepGroups);
    return{action:c.action,next:c.next,value:evaluate(c.next,actor,config)+specialistActionValue(state,c,rootContext,profile)+approachBonus,
     wasteful:wastefulSelfFill(state,c,territory,config)&&approachBonus===0,approachBonus};
   });
  root.pool=diversePool(state,rootCandidates,rootLimit,config,true,approachThreats,watchKeepGroups);for(const c of root.pool)c.next=null;
  if(!root.pool.length)return null;
  let deepest=0;
  for(let sim=0;sim<iterations;sim++){
   let node=root,depth=0;const path=[root];
   while(depth<maxDepth&&!node.state.result){
    const pool=nodePool(node,config,rootLimit,nodeLimit);if(!pool.length)break;
    const width=wideningLimit(node,pool.length,profile);
    let child;
    if(node.children.length<width){
     const candidate=expansionCandidate(node,pool,width,actor,config);
     if(!candidate)break;
     const next=B.apply(node.state,candidate.action,{speculative:true});
     if(!next){candidate.prior=0;candidate.invalid=true;continue;}
     child=makeNode(next,node,candidate.action,candidate.prior,node.depth+1);node.children.push(child);
     node=node.children[node.children.length-1];path.push(node);depth++;deepest=Math.max(deepest,depth);
     break;
    }
    child=puctChild(node,actor,config);if(!child)break;
    node=child;path.push(node);depth++;deepest=Math.max(deepest,depth);
   }
   const result=quiescenceValue(node.state,actor,config,options.tacticalDepth??2);
   updateRave(path,result,actor);
   for(let i=path.length-1;i>=0;i--){path[i].visits++;path[i].valueSum+=result;}
  }
  let best=null;
  for(const child of root.children){
   const mc=child.visits?child.valueSum/child.visits:-1,mean=blendedQ(root,child.action,child.visits,mc,config,actor);
   if(!best||child.visits>best.visits||child.visits===best.visits&&mean>best.mean)best={action:child.action,visits:child.visits,mean,prior:child.prior};
  }
  if(!best){const first=root.pool[0];best={action:first.action,visits:0,mean:0};}
  const pass=rootExact.find(c=>c.action.type==='pass'),bestLegal=rootExact.filter(c=>c.action.type!=='pass'&&!c.wasteful).sort((a,b)=>b.value-a.value)[0],passMargin=options.passMargin??.24;
  let chosenAction=best.action;
  if(best.action.type==='pass'&&bestLegal&&bestLegal.value>pass.value+passMargin)chosenAction=bestLegal.action;
  else if(pass&&bestLegal&&bestLegal.value<=pass.value+passMargin&&best.mean<Math.tanh((pass.value-baseline)/Math.max(11,state.size*.88))+0.09)chosenAction={type:'pass'};
  // PUCT can overselect a move whose generic position bonus masks a lost
  // territory point. A safe eye-fill is rejected unless it captures, rescues a
  // vulnerable group, disables a real enemy line, or opens useful new reach.
  const chosenRecord=rootExact.find(c=>actionKey(c.action)===actionKey(chosenAction));
  if(chosenRecord?.wasteful){
   chosenAction=bestLegal&&bestLegal.value>pass.value+passMargin?bestLegal.action:pass.action;
  }
  // A pass is premature if the opponent can still increase its exact territory score in one reply.
  let passDeferred=false;
  if(chosenAction.type==='pass'&&bestLegal&&bestLegal.value>pass.value+.12&&opponentCanImproveAfterPass(state,actor,config)){chosenAction=bestLegal.action;passDeferred=true;}
  const next=B.apply(state,chosenAction,{speculative:true})||B.apply(state,{type:'pass'},{speculative:true});
  return{action:chosenAction,reason:moveReason(state,chosenAction,next),score:evaluate(next,actor,config),staticScore:evaluate(next,actor,config),examined:allRootCandidates.length,searchable:rootCandidates.length,crownholdUnsafeRootActions:unsafeRootCandidates.length,crownholdForcedRootActions:forcedUnsafeRootCandidates.length,crownholdApproachTargets:approachThreats.length,crownholdApproachRootActions:rootExact.filter(c=>c.approachBonus>0).length,crownholdApproachFilteredActions:approachFiltered,iterations,depth:deepest,rootVisits:best.visits,rootPrior:best.prior||0,rootActionsExpanded:root.children.length,legalRootActions:root.pool.length,passDeferred,rootStats:root.children.map(c=>{const amaf=raveStat(root,c.action);return{action:c.action,visits:c.visits,value:c.visits?c.valueSum/c.visits:0,prior:c.prior,raveVisits:amaf?.visits||0,raveValue:amaf?.visits?amaf.valueSum/amaf.visits:0};}).sort((a,b)=>b.visits-a.visits)};
 }
 function profileName(name){return profiles[name]?.name||profiles.builder.name;}
 return Object.freeze({chooseAction,evaluate,legalCandidates,forcedCrownholdThreat,keepApproachThreats,keepApproachBonus,keepSafetyBonus,profiles:Object.freeze(profiles),profileName,moveReason,searchVersion:"v6.4.2-approach-aware-keep-safety"});
});
