/* Academy v3: sanctuary corridor planning, immediate-loss interception and efficient PVS. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('../../public/academy-engine'));
 else root.HikoroAcademyBot=factory(root.HikoroAcademy);
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
'use strict';
const V={pilut:95,pawn:170,yoli:320,fin:300,chair:410,kota:335,lupa:1350,prince:1650};
const MATE=1000000, royals=new Set(['lupa','prince']);
const ROYAL_STEPS={prince:{1:[[-1,0],[-1,-1],[-1,1],[1,-1],[1,1]],2:[[1,0],[-1,-1],[-1,1],[1,-1],[1,1]]},lupa:{1:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],2:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]}};
const ENCODE={pilut:1,pawn:2,yoli:3,fin:4,chair:5,kota:6,lupa:7,prince:8};
function fastKey(s){return String(s.player)+s.board.flat().map(p=>p?String.fromCharCode(65+(p.owner-1)*8+ENCODE[p.type]):'.').join('');}
const squares=[{r:3,c:0},{r:4,c:0},{r:3,c:7},{r:4,c:7}];
function distTable(owner,type){
 const a=Array(64).fill(99);
 for(const p of squares)a[p.r*8+p.c]=0;
 const dr=owner===1?-1:1;
 const steps=type==='prince'?[[dr,0],[-1,-1],[-1,1],[1,-1],[1,1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 for(let pass=0;pass<64;pass++){
  let changed=false;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
   const k=r*8+c;for(const [y,x] of steps){const rr=r+y,cc=c+x;
    if(rr>=0&&rr<8&&cc>=0&&cc<8&&a[k]>a[rr*8+cc]+1){a[k]=a[rr*8+cc]+1;changed=true;}
   }
  }
  if(!changed)break;
 }
 return a;
}
const distances={1:{prince:distTable(1,'prince'),lupa:distTable(1,'lupa')},2:{prince:distTable(2,'prince'),lupa:distTable(2,'lupa')}};
function keyOf(a){return a.from.r*512+a.from.c*64+a.to.r*8+a.to.c;}
function boardKey(s){return s.player+'|'+s.board.flat().map(p=>p?p.owner+':'+p.type:'-').join(',');}
function royalCount(board,owner){
 let count=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.owner===owner&&royals.has(p.type))count++;}
 return count;
}
function winningAction(s,a){
 const piece=s.board[a.from.r][a.from.c],target=s.board[a.to.r][a.to.c];
 return !!(piece&&royals.has(piece.type)&&A.sanctuary(a.to) || target&&royals.has(target.type)&&royalCount(s.board,3-piece.owner)===1);
}
function nextState(s,a){
 const b=s.board.slice(),f=a.from,t=a.to;
 b[f.r]=s.board[f.r].slice();if(t.r!==f.r)b[t.r]=s.board[t.r].slice();
 const piece=b[f.r][f.c],victim=b[t.r][t.c];
 b[t.r][t.c]=piece;b[f.r][f.c]=null;
 const n={board:b,player:3-s.player,mode:'match',ply:s.ply+1,result:null,positions:Object.create(s.positions||null)};
 if(s.fastKey){const chars=s.fastKey.split('');chars[0]=String(n.player);chars[f.r*8+f.c+1]='.';chars[t.r*8+t.c+1]=String.fromCharCode(65+(piece.owner-1)*8+ENCODE[piece.type]);n.fastKey=chars.join('');}
 if(piece&&royals.has(piece.type)&&A.sanctuary(t))n.result={winner:piece.owner,reason:'Sanctuary reached'};
 if(!n.result&&victim&&royals.has(victim.type)&&royalCount(b,3-piece.owner)===0)n.result={winner:piece.owner,reason:'Both opposing royals captured'};
 const sig=boardKey(n);n.positions[sig]=(n.positions[sig]||0)+1;
 if(!n.result&&n.positions[sig]>=3)n.result={winner:0,reason:'Threefold repetition'};
 if(!n.result&&n.ply>=1000)n.result={winner:0,reason:'Move limit reached'};
 return n;
}
function terminal(s,who,ply){
 if(!s.result)return null;
 return s.result.winner===0?0:s.result.winner===who?MATE-ply:-MATE+ply;
}
function directRoyalWin(s,owner){
 if(royalCount(s.board,owner)===0)return false;
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=s.board[r][c];if(!p||p.owner!==owner||!royals.has(p.type))continue;
  const ms=A.movesFor(s.board,{r,c});
  for(const t of ms)if(A.sanctuary(t))return true;
 }
 return false;
}
function center(r,c){return 7-Math.abs(3.5-r)-Math.abs(3.5-c);}
// Actual royal movement geometry, accounting for friendly blockers and palace confinement.
// This is a route HEURISTIC, not a replacement for the official move generator.
function royalRoute(board,owner,type,startR,startC,princeAlive){
 if(type==='lupa'&&princeAlive)return 12;
 const queue=[startR*8+startC],dist=new Int8Array(64).fill(-1),steps=ROYAL_STEPS[type][owner];
 dist[queue[0]]=0;
 for(let head=0;head<queue.length;head++){
  const cell=queue[head],r=cell>>3,c=cell&7,d=dist[cell];
  if((c===0||c===7)&&(r===3||r===4))return d;
  if(d>=9)continue;
  for(const [dr,dc] of steps){
   const rr=r+dr,cc=c+dc;
   if(rr<0||rr>7||cc<0||cc>7)continue;
   const to=rr*8+cc,p=board[rr][cc];
   if(dist[to]>=0 || p?.owner===owner)continue;
   dist[to]=d+1;queue.push(to);
  }
 }
 return 12;
}
function royalPlans(board){
 const princes={1:false,2:false},info={1:[],2:[]};
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=board[r][c];if(p?.type==='prince')princes[p.owner]=true;
 }
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=board[r][c];if(p&&royals.has(p.type))
   info[p.owner].push({r,c,type:p.type,d:royalRoute(board,p.owner,p.type,r,c,princes[p.owner])});
 }
 return info;
}
function raceScore(d){
 if(d===0)return 5000;
 if(d===1)return 1750;
 if(d===2)return 950;
 if(d===3)return 510;
 if(d===4)return 230;
 if(d===5)return 100;
 return d<12?Math.max(0,90-15*(d-6)):0;
}
function quickest(info,owner){return Math.min(12,...info[owner].map(p=>p.d));}
function evaluate(s,who,ply=0){
 const end=terminal(s,who,ply);if(end!==null)return end;
 let score=0;
 const plans=royalPlans(s.board);
 const has={1:plans[1].some(p=>p.type==='prince'),2:plans[2].some(p=>p.type==='prince')};
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=s.board[r][c];if(!p)continue;
  const sign=p.owner===who?1:-1;let v=V[p.type]||100;
  if(royals.has(p.type)){
   const path=plans[p.owner].find(royal=>royal.r===r&&royal.c===c);
   const d=path?.d??12;
   v+=raceScore(d);
   // The Prince is the only sanctuary runner while the Kraken is palace-locked.
   if(p.type==='lupa'&&has[p.owner])v+=20-Math.abs(c-3)*10;
  }else{
   v+=center(r,c)*7;
   if(p.type==='pilut')v+=Math.max(0,p.owner===1?6-r:r-1)*8;
  }
  // Intercept an approaching royal: centralize defenders near its actual corridor.
  if(!royals.has(p.type)){
   const foes=plans[3-p.owner];
   let proximity=0;
   for(const foe of foes)if(foe.d<=4){
    const cheby=Math.max(Math.abs(r-foe.r),Math.abs(c-foe.c));
    proximity=Math.max(proximity,cheby<=1?165:cheby===2?90:cheby===3?30:0);
   }
   v+=proximity;
  }
  score+=sign*v;
 }
 // Race urgency uses both sides; this makes defending a two-ply threat valuable.
 const own=quickest(plans,s.player),opp=quickest(plans,3-s.player);
 if(opp<=3 && own>opp)score+=(s.player===who?-1:1)*(4-opp)*160;
 // Unlike ordinary chess, a royal may enter sanctuary even when its destination is attacked.
 // Therefore an immediately available royal sanctuary move is an urgent, game-ending threat.
 if(directRoyalWin(s,s.player))score+=(s.player===who?1:-1)*125000;
 return score;
}
function moveOrder(s,a,ttMove=0,kill=0,history=null){
 const p=s.board[a.from.r][a.from.c],target=s.board[a.to.r][a.to.c];if(!p)return -1e9;
 const k=keyOf(a);if(k===ttMove)return 1e8;
 if(winningAction(s,a))return 2e7;
 let v=0;
 if(target)v+=15000+(V[target.type]||100)*15-(V[p.type]||100)*0.4;
 if(royals.has(p.type)){
  const b=distances[p.owner][p.type][a.from.r*8+a.from.c];
  const d=distances[p.owner][p.type][a.to.r*8+a.to.c];
  v+=(b-d)*(p.type==='prince'?230:160);
  if(p.type==='lupa'&&A.hasPrince(s.board,p.owner))v-=40;
 }else{
  v+=(center(a.to.r,a.to.c)-center(a.from.r,a.from.c))*12;
  if(p.type==='pilut')v+=(p.owner===1?a.from.r-a.to.r:a.to.r-a.from.r)*35;
 }
 if(k===kill)v+=6000;
 if(history)v+=history.get(k)||0;
 return v;
}
function chooseMove(state,options={}){
 if(!state||state.mode!=='match'||state.result)return null;
 const all=A.allMoves(state);if(!all.length)return null;
 const budget=Math.max(35,Math.min(2000,Number(options.budgetMs)||220));
 const maxDepth=Math.max(1,Math.min(6,Number(options.maxDepth)||4));
 const replyWidth=Math.max(8,Math.min(48,Number(options.replyWidth)||24));
 const rootWidth=Math.max(8,Math.min(96,Number(options.rootWidth)||64));
 const deadline=Date.now()+budget;
 const who=state.player,tt=new Map(),history=new Map(),killers=[];
 // Single-character per-square TT keys avoid rebuilding 64 long tokens at every node.
 state={...state,fastKey:fastKey(state)};
 const roots=all.sort((a,b)=>moveOrder(state,b)-moveOrder(state,a));
 const emergencySafe=new Set();
 // Tactical override: if the enemy can win on their NEXT turn, prioritize
 // candidate moves that remove every immediately winning sanctuary entrance.
 if(directRoyalWin(state,3-who)){
  const forcedSafe=[],losing=[];
  for(const a of roots){const n=nextState(state,a);
   if(!n.result && directRoyalWin(n,3-who))losing.push(a);
   else{forcedSafe.push(a);emergencySafe.add(keyOf(a));}
  }
  if(forcedSafe.length){roots.splice(0,roots.length,...forcedSafe,...losing);}
 }
 for(const a of roots)if(winningAction(state,a))return a;
 let best=roots[0],bestScore=-Infinity,nodes=0,aborted=false;
 function search(s,depth,alpha,beta,ply){
  nodes++;if((nodes&15)===0&&Date.now()>=deadline){aborted=true;return 0;}
  const done=terminal(s,s.player,ply);if(done!==null)return done;
  const originalAlpha=alpha;
  const k=s.fastKey||fastKey(s),repeated=(s.positions[boardKey(s)]||0)>1;
  const cached=!repeated?tt.get(k):null;
  if(cached&&cached.depth>=depth){
   if(cached.flag==='exact')return cached.score;
   if(cached.flag==='lower')alpha=Math.max(alpha,cached.score);
   else beta=Math.min(beta,cached.score);
   if(alpha>=beta)return cached.score;
  }
  if(depth<=0)return evaluate(s,s.player,ply);
  const actions=A.allMoves(s);
  if(!actions.length)return 0;
  const preferred=cached?.move||0,kill=killers[ply]||0;
  actions.sort((a,b)=>moveOrder(s,b,preferred,kill,history)-moveOrder(s,a,preferred,kill,history));
  let value=-Infinity,pv=0;
  // Do not discard captures, royals, or immediate wins just because they rank low.
  // At the widest late plies, trim only quiet moves after examining a substantial prefix.
  const limit=depth>=3?Math.max(replyWidth,Math.ceil(actions.length*.55)):actions.length;
  for(let i=0;i<actions.length;i++){
   const a=actions[i],p=s.board[a.from.r][a.from.c],target=s.board[a.to.r][a.to.c];
   const n=nextState(s,a);
   const quiet=(!target&&!royals.has(p.type));
   // PVS: prove later candidates inferior with a cheap null-window search.
   // LMR is verified by a full search if the reduced result improves alpha.
   let reduced=i>=limit&&quiet&&depth>=3?1:0;
   let score;
   if(i===0)score=-search(n,depth-1,-beta,-alpha,ply+1);
   else{
    score=-search(n,depth-1-reduced,-alpha-1,-alpha,ply+1);
    if(!aborted&&reduced&&score>alpha)score=-search(n,depth-1,-alpha-1,-alpha,ply+1);
    if(!aborted&&score>alpha&&score<beta)score=-search(n,depth-1,-beta,-alpha,ply+1);
   }
   if(aborted)return 0;
   if(score>value){value=score;pv=keyOf(a);}
   if(score>alpha)alpha=score;
   if(alpha>=beta){
    if(!target){killers[ply]=keyOf(a);history.set(keyOf(a),Math.min(6000,(history.get(keyOf(a))||0)+depth*depth*8));}
    break;
   }
  }
  if(!Number.isFinite(value))value=evaluate(s,s.player,ply);
  if(!aborted&&!repeated&&tt.size<80000)tt.set(k,{depth,score:value,move:pv,flag:value<=originalAlpha?'upper':value>=beta?'lower':'exact'});
  return value;
 }
 for(let depth=1;depth<=maxDepth;depth++){
  if(Date.now()>=deadline)break;
  let iteration=null,score=-Infinity,alpha=-Infinity;
  const ordered=roots.slice().sort((a,b)=>Number(keyOf(b)===keyOf(best))-Number(keyOf(a)===keyOf(best))||Number(emergencySafe.has(keyOf(b)))-Number(emergencySafe.has(keyOf(a)))||moveOrder(state,b)-moveOrder(state,a));
  for(let i=0;i<Math.min(rootWidth,ordered.length);i++){
   if(Date.now()>=deadline){aborted=true;break;}
   const a=ordered[i],n=nextState(state,a);
   let result;
   if(i===0)result=-search(n,depth-1,-Infinity,Infinity,1);
   else{
    result=-search(n,depth-1,-alpha-1,-alpha,1);
    if(!aborted&&result>alpha)result=-search(n,depth-1,-Infinity,Infinity,1);
   }
   if(aborted)break;
   if(result>score){score=result;iteration=a;}
   if(score>alpha)alpha=score;
  }
  if(aborted||!iteration)break;
  best=iteration;bestScore=score;
  if(bestScore>MATE-100)break;
 }
 return best;
}
return{chooseMove,legalMoves:s=>A.allMoves(s),evaluate,moveOrder,royalPlans,directRoyalWin};
});
