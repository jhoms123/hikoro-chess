(function(root,factory){
 const engine=root.BastionMarches||(typeof module==='object'&&module.exports?require('./bastion-engine'):null);
 const api=factory(engine);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BastionBot=api;
})(typeof globalThis!=='undefined'?globalThis:this,B=>{
 'use strict';
 if(!B)throw new Error('BastionMarches must load before BastionBot.');

 const ORTHO=[[-1,0],[1,0],[0,-1],[0,1]],KING=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]],
       VALUE={keep:8,marshal:3.2,warden:1.7,levy:.42},
       RANGE={keep:3.5,marshal:4.1,warden:3.15,levy:2.25},
       WEIGHT={keep:.78,marshal:1.18,warden:.82,levy:.43};
 const profiles={
  builder:{name:'Moss · Builder',influence:1.22,liberties:1,attack:.9},
  tactician:{name:'Slate · Tactician',influence:.92,liberties:1.18,attack:1.28}
 };
 const other=p=>B.other(p),key=(x,y)=>x+','+y,inBounds=(s,x,y)=>x>=0&&y>=0&&x<s&&y<s;
 const same=(a,b)=>a.x===b.x&&a.y===b.y;

 function legalCandidates(state){
  if(!state||state.result||state.pendingSettle)return[];
  const s=state.size,owner=state.player,board=state.board,actions=[],seen=new Set();
  const add=action=>{
   const id=action.type==='deploy'?`d:${action.rank}:${action.to.x},${action.to.y}`:
    action.type==='move'?`m:${action.from.x},${action.from.y}:${action.to.x},${action.to.y}`:
    action.type==='embark'?`e:${action.from.x},${action.from.y}:${action.at.x},${action.at.y}`:
    `u:${action.at.x},${action.at.y}:${action.drops.map(p=>key(p.x,p.y)).sort().join(';')}`;
   if(seen.has(id))return;seen.add(id);
   const next=B.apply(state,action);if(next)actions.push({action,next});
  };

  // Generate from actual supports instead of checking every empty point on the board.
  const deployment=[['marshal','keep',4],['warden','marshal',3],['levy','warden',2]];
  for(const [rank,support,distance] of deployment){
   if(rank!=='levy'&&!state.reserves[owner][rank])continue;
   const points=new Set();
   for(let y=0;y<s;y++)for(let x=0;x<s;x++){
    if(board[y][x]?.owner!==owner||board[y][x]?.rank!==support)continue;
    for(let dy=-distance;dy<=distance;dy++)for(let dx=-distance;dx<=distance;dx++){
     if(Math.abs(dx)+Math.abs(dy)>distance)continue;
     const nx=x+dx,ny=y+dy;if(inBounds(s,nx,ny)&&!board[ny][nx])points.add(key(nx,ny));
    }
   }
   for(const point of points){const [x,y]=point.split(',').map(Number);add({type:'deploy',rank,to:{x,y}});}
  }

  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
   const piece=board[y][x];if(piece?.owner!==owner)continue;
   if(piece.rank==='marshal'){
    for(const [dx,dy]of ORTHO)for(let n=1;n<=3;n++){
     const nx=x+dx*n,ny=y+dy*n;if(!inBounds(s,nx,ny)||board[ny][nx])break;
     add({type:'move',from:{x,y},to:{x:nx,y:ny}});
    }
   }else if(piece.rank==='warden'){
    for(const [dx,dy]of KING){const nx=x+dx,ny=y+dy;if(inBounds(s,nx,ny)&&!board[ny][nx])add({type:'move',from:{x,y},to:{x:nx,y:ny}});}
    if((piece.cargo||0)<2)for(const [dx,dy]of ORTHO){const nx=x+dx,ny=y+dy;if(inBounds(s,nx,ny)&&board[ny][nx]?.owner===owner&&board[ny][nx]?.rank==='levy')add({type:'embark',from:{x:nx,y:ny},at:{x,y}});}
    if(piece.cargo){
     const drops=ORTHO.map(([dx,dy])=>({x:x+dx,y:y+dy})).filter(p=>inBounds(s,p.x,p.y)&&!board[p.y][p.x]);
     for(let i=0;i<drops.length;i++)add({type:'disembark',at:{x,y},drops:[drops[i]]});
     if(piece.cargo>1)for(let i=0;i<drops.length;i++)for(let j=i+1;j<drops.length;j++)add({type:'disembark',at:{x,y},drops:[drops[i],drops[j]]});
    }
   }else if(piece.rank==='levy'){
    for(const [dx,dy]of ORTHO){const nx=x+dx,ny=y+dy;if(inBounds(s,nx,ny)&&!board[ny][nx])add({type:'move',from:{x,y},to:{x:nx,y:ny}});}
   }
  }
  return actions;
 }

 function fortSiegeThreat(board,size,group,attacker){
  const keeps=group.filter(p=>board[p.y][p.x]?.rank==='keep');if(!keeps.length)return false;
  return keeps.every(k=>ORTHO.some(([dx,dy])=>{
   const x=k.x+dx,y=k.y+dy;return inBounds(size,x,y)&&board[y][x]?.owner===attacker&&board[y][x]?.rank==='marshal';
  }));
 }
 function eyesForGroup(state,group,owner){
  const points=new Map(),size=state.size,board=state.board;
  for(const p of group)for(const [dx,dy]of ORTHO){const x=p.x+dx,y=p.y+dy;if(inBounds(size,x,y)&&!board[y][x])points.set(key(x,y),{x,y});}
  let eyes=0;
  for(const p of points.values()){
   let friendly=0,diagonal=0,diagonalFriendly=0;
   for(const [dx,dy]of ORTHO){const x=p.x+dx,y=p.y+dy;if(!inBounds(size,x,y))continue;friendly+=board[y][x]?.owner===owner?1:0;}
   if(friendly!==ORTHO.filter(([dx,dy])=>inBounds(size,p.x+dx,p.y+dy)).length)continue;
   for(const [dx,dy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){const x=p.x+dx,y=p.y+dy;if(inBounds(size,x,y)){diagonal++;if(board[y][x]?.owner===owner)diagonalFriendly++;}}
   const edgeCount=diagonal<=2,required=edgeCount?diagonal:Math.max(2,diagonal-1);
   if(diagonalFriendly>=required)eyes++;
  }
  return Math.min(2,eyes);
 }

 function influence(state,owner){
  const size=state.size,board=state.board,field=Array.from({length:size},()=>Array(size).fill(0));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const piece=board[y][x];if(piece?.owner!==owner)continue;
   const reach=Math.ceil(RANGE[piece.rank]);
   for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++){
    const nx=x+dx,ny=y+dy,d=Math.abs(dx)+Math.abs(dy);if(!inBounds(size,nx,ny)||board[ny][nx]||d>RANGE[piece.rank])continue;
    field[ny][nx]+=WEIGHT[piece.rank]*Math.exp(-d/(RANGE[piece.rank]*.62));
   }
  }
  return field;
 }

 function profileFor(config,owner){
  const selected=config?.[owner]||config?.[String(owner)]||'builder';
  return typeof selected==='string'?profiles[selected]||profiles.builder:selected;
 }
 function territoryAndInfluence(state,owner,ownerField,enemyField,profile,enemyProfile){
  let sum=0;
  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++)if(!state.board[y][x]){
   const own=ownerField[y][x],enemy=enemyField[y][x],difference=own-enemy;
   sum+=Math.tanh(difference*.82)*(profile.influence+enemyProfile.influence)*.29;
  }
  return sum;
 }

 function evaluate(state,perspective,config={}){
  const rival=other(perspective),profilesBySide={1:profileFor(config,1),2:profileFor(config,2)},
        ownProfile=profilesBySide[perspective],enemyProfile=profilesBySide[rival],
        score=B.score(state),ownField=influence(state,perspective),enemyField=influence(state,rival);
  let value=score[perspective].total-score[rival].total;
  value+=territoryAndInfluence(state,perspective,ownField,enemyField,ownProfile,enemyProfile);

  for(const [owner,sign]of [[perspective,1],[rival,-1]]){
   const groups=B.groups(state.board,state.size,owner),attacker=other(owner),profile=profilesBySide[owner];
   for(const group of groups){
    const libertyCount=B.liberties(state.board,state.size,group).size,fort=group.some(p=>state.board[p.y][p.x]?.rank==='keep'),
          material=group.reduce((sum,p)=>sum+VALUE[state.board[p.y][p.x].rank],0);
    let risk=0;
    if(libertyCount===1){const canBeTaken=!fort||fortSiegeThreat(state.board,state.size,group,attacker);risk=canBeTaken?7.5:2.2;}
    else if(libertyCount===2)risk=fort?1.6:3.1;
    else if(libertyCount===3)risk=fort?.45:1.15;
    value-=sign*risk*profile.liberties*(1+Math.min(1,material*.08));
    if(libertyCount>2)value+=sign*Math.min(2.2,(libertyCount-2)*.19)*profile.liberties;
    value+=sign*Math.min(2.4,Math.sqrt(group.length)*.34);
    value+=sign*eyesForGroup(state,group,owner)*1.8;
   }
  }

  let reserveValue=0;
  for(const owner of [1,2]){
   const sign=owner===perspective?1:-1;
   reserveValue+=sign*(state.reserves[owner].marshal*1.35+state.reserves[owner].warden*.72);
  }
  value+=reserveValue;

  for(let y=0;y<state.size;y++)for(let x=0;x<state.size;x++){
   const p=state.board[y][x];if(!p)continue;const sign=p.owner===perspective?1:-1;
   value+=sign*VALUE[p.rank];
   if(p.cargo)value+=sign*p.cargo*.38;
  }

  // A Marshal beside every Keep in a Fort makes its last liberty capturable.
  for(const owner of [1,2]){
   const enemy=other(owner),sign=owner===perspective?1:-1;
   for(const group of B.groups(state.board,state.size,owner)){
    const keeps=group.filter(p=>state.board[p.y][p.x]?.rank==='keep');if(!keeps.length)continue;
    const enemyBesideAll=fortSiegeThreat(state.board,state.size,group,enemy);
    if(enemyBesideAll){const libs=B.liberties(state.board,state.size,group).size;value-=sign*(libs<=2?5.5:1.1)*profilesBySide[enemy].attack;}
    const defended=fortSiegeThreat(state.board,state.size,group,owner);
    if(defended)value+=sign*1.25;
   }
  }
  return value;
 }

 function actionFamily(action){
  if(action.type==='deploy')return'deploy-'+action.rank;
  if(action.type==='move')return'move';
  return action.type;
 }
 function shortlist(candidates,limit){
  const sorted=[...candidates].sort((a,b)=>b.static-a.static),picked=[],used=new Set();
  const take=c=>{if(c&&!used.has(c.action)){used.add(c.action);picked.push(c);}};
  for(const c of sorted.slice(0,Math.max(4,Math.floor(limit*.55))))take(c);
  const families=new Set();for(const c of sorted){const f=actionFamily(c.action);if(!families.has(f)){families.add(f);take(c);}}
  for(const c of sorted){if(picked.length>=limit)break;take(c);}
  return picked.slice(0,Math.max(limit,picked.length));
 }
 function mixSeed(state,action){
  let value=(state.ply+17)*2654435761+(state.player+5)*2246822519;
  const text=JSON.stringify(action);for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);
  return(value>>>0)/4294967295;
 }
 function moveReason(before,action,next){
  const captured=next.last?.captured||[];
  if(captured.length){const kinds=[...new Set(captured.map(p=>p.rank))].join(', ');return`Captures ${captured.length} unit${captured.length===1?'':'s'} (${kinds}) by closing the group’s last liberty.`;}
  if(action.type==='deploy')return`Raises a ${action.rank} to extend the support network and claim nearby influence.`;
  if(action.type==='move'){
   const piece=before.board[action.from.y][action.from.x];
   return piece?.rank==='marshal'?'Repositions a Marshal to reinforce the frontier or prepare a Keep siege.':piece?.rank==='warden'?'Moves a Warden to connect groups and extend the Levy network.':'Advances a Levy to tighten a surround or secure an open liberty.';
  }
  if(action.type==='embark')return'Embarks a Levy so the Warden can carry it safely across the board.';
  if(action.type==='disembark')return`Disembarks ${action.drops.length} Levy unit${action.drops.length===1?'':'s'} to extend the formation.`;
  return'Calls settlement after the position has become stable.';
 }

 function chooseAction(state,options={}){
  if(!state||state.result)return null;
  if(state.pendingSettle)return{action:{type:'accept-settle'},reason:'The position has been offered for settlement; the bot accepts and scores it.',score:B.score(state)};
  const maxPlies=options.maxPlies||(state.size===13?150:240),beam=options.beam||8;
  if(state.ply>=maxPlies)return{action:{type:'settle'},reason:'The move limit has been reached; the bots score the final position.',score:B.score(state)};

  const actor=state.player,config=options.profiles||{1:options.black||'builder',2:options.white||'tactician'},
        baseline=evaluate(state,actor,config),raw=legalCandidates(state);
  if(!raw.length)return{action:{type:'settle'},reason:'No legal board action remains; the bots call settlement.',score:B.score(state)};
  const candidates=raw.map(item=>({ ...item,static:evaluate(item.next,actor,config)+mixSeed(state,item.action)*.012 }));
  const roots=shortlist(candidates,beam);
  let best=null;
  for(const rootCandidate of roots){
   const replies=legalCandidates(rootCandidate.next);let worst=rootCandidate.static;
   if(replies.length){
    worst=Infinity;
    for(const reply of replies){const value=evaluate(reply.next,actor,config);if(value<worst)worst=value;}
   }
   // The leaf position decides the result; a small initiative bonus rewards sente.
   const value=worst+(rootCandidate.static-baseline)*.16+mixSeed(state,rootCandidate.action)*.008;
   if(!best||value>best.value)best={...rootCandidate,value};
  }
  if(!best)best=candidates[0];
  return{action:best.action,reason:moveReason(state,best.action,best.next),score:best.value,staticScore:best.static,examined:candidates.length,replyBeam:roots.length};
 }

 function profileName(profile){return profiles[profile]?.name||profiles.builder.name;}
 return Object.freeze({chooseAction,evaluate,legalCandidates,profiles:Object.freeze(profiles),profileName});
});
