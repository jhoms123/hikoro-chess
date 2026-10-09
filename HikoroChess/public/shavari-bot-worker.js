
'use strict';
function shavariFactory(){
'use strict';
const TYPES=['G','L','C','P'], NAMES=['Lotus General','Caravan Lance','Elephant Cannon','Scarab Pawn'], GLYPHS=['✿','♞','♜','✦'];
const VAL=[850,305,590,118], DIR4=[[-1,0],[1,0],[0,-1],[0,1]], DIAG=[[-1,-1],[1,-1],[-1,1],[1,1]];
const KIND=['move','stack','capture','cover'], MATE=1000000, MAXPLY=4000, NO_CAPTURE_LIMIT=100;
// Exchange Guardian v1.3: search scores near MATE are distances, not ordinary material.
const MATE_ZONE=10000;
const owner=p=>p>>2, type=p=>p&3, index=(x,y)=>y*9+x, sqname=i=>'ABCDEFGHI'[i%9]+(9-Math.floor(i/9));
// Pseudorandom Zobrist tables, reproducible across browsers and workers.
let seed=0x5A5A2026;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const z1=new Uint32Array(81*3*8),z2=new Uint32Array(81*3*8);for(let i=0;i<z1.length;i++){z1[i]=rand();z2[i]=rand();}
const turn1=rand(),turn2=rand();
function hashBoard(board,side){let a=side===2?turn1:0,b=side===2?turn2:0;for(let sq=0;sq<81;sq++){const st=board[sq];for(let i=0;i<st.length;i++){const k=((sq*3+i)*8+(st[i]-4));a^=z1[k];b^=z2[k];}}return [a>>>0,b>>>0];}
function keyHash(h){return h[0].toString(36)+'.'+h[1].toString(36);}
function initial(){const board=Array.from({length:81},()=>[]);for(let side of [1,2]){const back=side===1?8:0,front=side===1?7:1;['L','C','G','C','L'].forEach((t,i)=>board[index(i*2,back)]=[(side<<2)+TYPES.indexOf(t)]);for(let x=0;x<9;x+=2)board[index(x,front)]=[(side<<2)+3];}const h=hashBoard(board,1),k=keyHash(h);return {board,player:1,ply:0,result:null,history:[],noCapturePlies:0,repetitions:{[k]:1}};}
function noCaptureClock(state){if(Number.isInteger(state.noCapturePlies))return Math.max(0,state.noCapturePlies);let n=0;const history=state.history||[];for(let i=history.length-1;i>=0;i--){if(history[i]?.kind==='capture')break;n++;}return n;}
// v1.3 movement geometry: one-time tables for all original ownership directions.
// Rays are arrays of square indices. The shared path rules remain identical to the website.
const PATHS=Array.from({length:3},()=>Array.from({length:4},()=>Array.from({length:81},()=>[])));
for(let o=1;o<=2;o++)for(let t=0;t<4;t++)for(let sq=0;sq<81;sq++){
 const x=sq%9,y=(sq/9)|0;
 const directions=t===1?DIAG:t===0?DIR4.concat(o===1?[[1,1],[-1,1]]:[[1,-1],[-1,-1]]):DIR4;
 const max=t===2?8:t===1?2:1,paths=PATHS[o][t][sq];
 for(const [dx,dy] of directions){const ray=[];for(let d=1;d<=max;d++){
  const nx=x+dx*d,ny=y+dy*d;if(nx<0||nx>8||ny<0||ny>8)break;
  ray.push(ny*9+nx);
 }if(ray.length)paths.push(ray);}
}
// Cached 81-bit reachable-destination masks for non-sliding, one-step pieces.
const STATIC_REACH=Array.from({length:3},()=>Array.from({length:4},()=>Array.from({length:81},()=>[0,0,0])));
for(let o=1;o<=2;o++)for(let t=0;t<4;t++)for(let sq=0;sq<81;sq++){
 const bits=STATIC_REACH[o][t][sq];for(const ray of PATHS[o][t][sq])for(let k=0;k<ray.length;k++){
  if(t===1&&k===0)continue;const to=ray[k];
  bits[to>>>5]|=(1<<(to&31));
 }
}
function bits32(x){x=x-((x>>>1)&0x55555555);x=(x&0x33333333)+((x>>>2)&0x33333333);return (((x+(x>>>4))&0x0f0f0f0f)*0x01010101)>>>24;}
// Precompute positional diversity once for the 255 distinct piece/owner
// combinations. Runtime evaluation needs just an 8-bit mask table lookup.
const COMBO_MOBILITY=new Int16Array(81*256);
for(let sq=0;sq<81;sq++){
 const v0=new Uint32Array(256),v1=new Uint32Array(256),v2=new Uint32Array(256);
 for(let mask=1;mask<256;mask++){
  const bit=31-Math.clz32(mask&-mask),base=mask&(mask-1),b=STATIC_REACH[1+(bit>>>2)][bit&3][sq];
  v0[mask]=v0[base]|b[0];v1[mask]=v1[base]|b[1];v2[mask]=v2[base]|b[2];
  const mobility=bits32(v0[mask])+bits32(v1[mask])+bits32(v2[mask]);
  COMBO_MOBILITY[sq*256+mask]=Math.min(15,mobility)*2+Math.min(8,Math.max(0,mobility-15));
 }
}
let stamp=1;const seen=new Uint32Array(81*4);
// A General never shares a stack; it is moved alone.
function mayStackWith(source,count,target){
 for(let i=source.length-count;i<source.length;i++)if(type(source[i])===0)return false;
 for(let i=0;i<target.length;i++)if(type(target[i])===0)return false;
 return count+target.length<=3;
}
function generate(board,side,capturesOnly=false,onlyWinning=false){
 const result=[];
 for(let from=0;from<81;from++){
  const st=board[from],height=st.length;if(!height||owner(st[height-1])!==side)continue;
  for(let count=1;count<=height;count++){
   let carriesGeneral=false;for(let j=height-count;j<height;j++)if(type(st[j])===0){carriesGeneral=true;break;}
   if(carriesGeneral&&count>1)continue;
   ++stamp;if(stamp===0xffffffff){seen.fill(0);stamp=1;}
   for(let layer=height-count;layer<height;layer++){
    const token=st[layer],t=type(token),minimum=t===1?2:1;
    for(const ray of PATHS[owner(token)][t][from]){
     for(let i=0;i<ray.length;i++){
      const to=ray[i],target=board[to],th=target.length;
      if(i+1>=minimum){
       let k=-1;
       if(!th){if(!capturesOnly&&!onlyWinning)k=0;}
       else if(owner(target[th-1])!==side){
        if(!onlyWinning||captureWinner(target)===side)k=2;
       }else if(!capturesOnly&&!onlyWinning&&mayStackWith(st,count,target))k=1;
       if(k>=0){const slot=to*4+k;if(seen[slot]!==stamp){seen[slot]=stamp;result.push({from,to,count,kind:k,id:(((from*81+to)*3+count-1)*4+k)});}}
       if(th&&owner(target[th-1])!==side&&!capturesOnly&&!onlyWinning&&count>th&&count+th<=3&&mayStackWith(st,count,target)){
        const slot=to*4+3;if(seen[slot]!==stamp){seen[slot]=stamp;result.push({from,to,count,kind:3,id:(((from*81+to)*3+count-1)*4+3)});}
       }
      }
      if(th&&count<=th)break;
     }
    }
   }
  }
 }
 return result;
}
function hasLegalMove(board,side){
 for(let from=0;from<81;from++){
  const st=board[from],height=st.length;if(!height||owner(st[height-1])!==side)continue;
  for(let count=1;count<=height;count++){
   let carriesGeneral=false;for(let j=height-count;j<height;j++)if(type(st[j])===0){carriesGeneral=true;break;}
   if(carriesGeneral&&count>1)continue;
   for(let layer=height-count;layer<height;layer++){
    const token=st[layer],t=type(token),minimum=t===1?2:1;
    for(const ray of PATHS[owner(token)][t][from]){
     for(let i=0;i<ray.length;i++){
      const to=ray[i],target=board[to],th=target.length;
      if(i+1>=minimum){
       if(!th||owner(target[th-1])!==side||mayStackWith(st,count,target))return true;
      }
      if(th&&count<=th)break;
     }
    }
   }
  }
 }
 return false;
}
function captureWinner(target){let ones=false,twos=false;for(const p of target){if(type(p)===0){if(owner(p)===1)ones=true;else twos=true;}}
 if(ones&&twos)return 0;if(ones)return 2;if(twos)return 1;return null;
}
// Exact fast predicate: is there a legal capture that immediately wins?
// Rather than allocating every other legal move, trace paths only to enemy
// controlled stacks containing the opponent's General and not our own.
function hasWinningCapture(board,side){
 for(let to=0;to<81;to++){
  const target=board[to],th=target.length;
  if(!th||owner(target[th-1])===side||captureWinner(target)!==side)continue;
  for(let from=0;from<81;from++){
   const stack=board[from],height=stack.length;
   if(!height||owner(stack[height-1])!==side)continue;
   for(let count=1;count<=height;count++){
    for(let layer=height-count;layer<height;layer++){
     const p=stack[layer],t=type(p),minimum=t===1?2:1;
     for(const ray of PATHS[owner(p)][t][from]){
      const ix=ray.indexOf(to);if(ix<minimum-1)continue;
      let blocked=false;
      for(let j=0;j<ix;j++)if(board[ray[j]].length>=count){blocked=true;break;}
      if(!blocked)return true;
     }
    }
   }
  }
 }
 return false;
}
// v1.3: Target-specific geometric captures, with all height and buried-ownership rules.
// Each precomputed route records only the intermediate squares. Cannons can jump a
// shorter intervening stack; a camel must reach its second diagonal intersection.
const CAPTURE_ROUTES=Array.from({length:3},()=>Array.from({length:4},()=>Array.from({length:81},()=>Array(81).fill(null))));
for(let o=1;o<=2;o++)for(let t=0;t<4;t++)for(let from=0;from<81;from++){
 const dests=CAPTURE_ROUTES[o][t][from];
 for(const ray of PATHS[o][t][from])for(let i=t===1?1:0;i<ray.length;i++)dests[ray[i]]=ray.slice(0,i);
}
function captureCandidates(board,side,to){
 const target=board[to],th=target.length;
 if(!th||owner(target[th-1])===side)return [];
 const out=[];
 for(let from=0;from<81;from++){
  const st=board[from],h=st.length;if(!h||owner(st[h-1])!==side)continue;
  for(let count=1;count<=h;count++){
   let reachable=false;
   for(let j=h-count;j<h&&!reachable;j++){
    const t=st[j],intermediate=CAPTURE_ROUTES[owner(t)][type(t)][from][to];
    if(intermediate===null)continue;
    let clear=true;for(let i=0;i<intermediate.length;i++)if(board[intermediate[i]].length>=count){clear=false;break;}
    if(clear)reachable=true;
   }
   if(reachable)out.push({from,to,count,kind:2,id:(((from*81+to)*3+count-1)*4+2)});
  }
 }
 return out;
}
// Signed gain for capturing a stack. A captured own General is a loss, even
// when the target's TOP member is enemy-controlled; both Generals is a draw.
function stackGain(target,side){
 const w=captureWinner(target);if(w!==null)return w===side?500000:w===0?0:-500000;
 let gain=0;for(const p of target)gain+=(owner(p)===side? -1:1)*VAL[type(p)];
 return gain;
}
// A bounded, target-square SEE: the opponent may choose to stop exchanging.
// This is an ordering estimate, not a replacement for alpha-beta search.
function replyExchange(board,side,to,remaining){
 if(remaining<=0)return 0;
 const target=board[to],w=captureWinner(target),options=captureCandidates(board,side,to);
 if(!options.length)return 0;
 if(w!==null){return w===side?500000:w===0?0:-500000;}
 const gain=stackGain(target,side);
 let best=0;
 for(let k=0;k<options.length;k++){
  const m=options[k],prev=change(board,m);
  let continuation=0;
  try{if(remaining>1)continuation=replyExchange(board,3-side,to,remaining-1);}finally{rollback(board,m,prev);}
  const total=gain-continuation;
  if(total>best)best=total;
  if(best>=500000)break;
 }
 return best;
}
function seeMove(board,side,m,plies=2){
 if(m.kind!==2&&m.kind!==3)return 0;
 const dest=board[m.to],w=m.kind===2?captureWinner(dest):null;
 if(w!==null)return w===side?500000:w===0?0:-500000;
 const gain=m.kind===2?stackGain(dest,side):0;
 const prev=change(board,m);
 let reply;
 try{reply=replyExchange(board,3-side,m.to,plies);}finally{rollback(board,m,prev);}
 // A cover gains movement/control, but is not itself a material capture.
 return gain-reply;
}
function orderMoves(ctx,moves,ttid,ply,useSEE=false){
 // Score each action ONCE. Sorting-comparator SEE calls would repeat searches.
 const priced=moves.map(m=>{
  let score=sortScore(ctx,m,ttid,ply);
  if(useSEE&&m.id!==ttid&&(m.kind===2||m.kind===3)){
   const winner=m.kind===2?captureWinner(ctx.board[m.to]):null;
   if(winner===null){const see=seeMove(ctx.board,ctx.side,m,1);
    if(m.kind===2){score=see>=0?450000+Math.min(80000,see*32):Math.max(-40000,-1000+see*24);}
    else score=see< -180?Math.max(-25000,see*16):65000+Math.min(12000,see*10);
   }
  }
  return {m,score};
 });
 priced.sort((a,b)=>b.score-a.score);
 for(let i=0;i<priced.length;i++)moves[i]=priced[i].m;
 return moves;
}

function moveKind(m){return KIND[m.kind];}
function change(board,m){const a=board[m.from],b=board[m.to];const moved=a.slice(a.length-m.count);board[m.from]=a.slice(0,a.length-m.count);board[m.to]=m.kind===2?moved:b.concat(moved);return [a,b,m.kind===2?captureWinner(b):null];}
function rollback(board,m,prev){board[m.from]=prev[0];board[m.to]=prev[1];}
function signature(board,side){let s=side+'|';for(let i=0;i<81;i++){if(board[i].length)s+=i+':'+board[i].join(',')+';';}return s;}
function apply(state,m){if(state.result)return null;const legal=generate(state.board,state.player).find(v=>v.id===m.id);if(!legal)return null;
 const board=state.board.map(st=>st.slice()),b=board[legal.to].slice(),moving=board[legal.from].slice(-legal.count),who=state.player;
 const noCapturePlies=legal.kind===2?0:noCaptureClock(state)+1;
 change(board,legal);let winner=legal.kind===2?captureWinner(b):null;
 const h=hashBoard(board,3-who),hk=keyHash(h),repetitions={...state.repetitions};repetitions[hk]=(repetitions[hk]||0)+1;
 let result=winner!==null?{winner,reason:winner===0?'Both generals captured':'General captured'}:null;
 if(!result&&repetitions[hk]>=3)result={winner:0,reason:'Threefold repetition'};
 if(!result&&generate(board,3-who).length===0)result={winner:who,reason:'No legal moves'};
 if(!result&&noCapturePlies>=NO_CAPTURE_LIMIT)result={winner:0,reason:'100 plies without a capture'};
 if(!result&&state.ply+1>=MAXPLY)result={winner:0,reason:'Move limit reached'};
 const rec={from:legal.from,to:legal.to,count:legal.count,mode:legal.count===state.board[legal.from].length?'all':legal.count===1?'top':'pair',kind:KIND[legal.kind],player:who,moved:moving.map(p=>TYPES[type(p)]).join('+'),movedKey:moving.join('.'),captured:legal.kind===2?b.map(p=>TYPES[type(p)]).join('+'):'',height:board[legal.to].length};
 return{board,player:3-who,ply:state.ply+1,result,history:[...state.history,rec],noCapturePlies,repetitions};}
function generalPressure(board,side){
 let target=-1;
 outer:for(let sq=0;sq<81;sq++)for(const p of board[sq])if(owner(p)!==side&&type(p)===0){target=sq;break outer;}
 if(target<0)return 0;
 const weight=[0,34,28,20,12,5],pressures=[];
 for(let sq=0;sq<81;sq++){
  const st=board[sq];if(!st.length||owner(st[st.length-1])!==side)continue;
  if(st.some(p=>owner(p)===side&&type(p)===0)||!st.some(p=>owner(p)===side&&type(p)!==0))continue;
  const d=Math.abs(sq%9-target%9)+Math.abs((sq/9|0)-(target/9|0));if(d>0&&d<=5)pressures.push(weight[d]);
 }
 pressures.sort((a,b)=>b-a);
 return Math.min(48,(pressures[0]||0)+Math.round((pressures[1]||0)*.3)+Math.round((pressures[2]||0)*.1));
}
function backtrackPenalty(history,board,side,m){
 if(m.kind>=2)return 0;
 const stack=board[m.from]||[],movedPieces=stack.slice(-m.count),movedKey=movedPieces.join('.'),movedTypes=movedPieces.map(p=>TYPES[type(p)]).join('+');
 let previous=null;for(let i=history.length-1;i>=0;i--)if(history[i]?.player===side){previous=history[i];break;}
 if(!previous||previous.kind==='capture'||previous.kind==='cover'||previous.from!==m.to||previous.to!==m.from)return 0;
 if(previous.movedKey?previous.movedKey!==movedKey:previous.moved!==movedTypes)return 0;
 let prior=0;for(let i=Math.max(2,history.length-28);i<history.length;i++){
  const cur=history[i],before=history[i-2];if(cur?.player===side&&before?.player===side&&cur.from===before.to&&cur.to===before.from&&((cur.movedKey&&before.movedKey)?cur.movedKey===before.movedKey:cur.moved===before.moved))prior++;
 }
 return Math.min(72,24+16*prior);
}
// Search leaf evaluation: permanent original ownership, current formation control,
// and the extra terrain a stack can reach over lower blockers are distinct resources.
// Exact tactical General loss is handled by search, never by an arbitrary value here.
function evaluate(board,side){let total=0;
 for(let sq=0;sq<81;sq++){
  const st=board[sq],h=st.length;if(!h)continue;
  const x=sq%9,y=(sq/9)|0,central=8-Math.abs(x-4)-Math.abs(y-4),controller=owner(st[h-1]);
  let mask=0,combo=0,buriedEnemy=0,ownedValue=0;
  for(let j=0;j<h;j++){
   const p=st[j],o=owner(p),t=type(p),sgn=o===side?1:-1;
   mask|=1<<t;combo|=1<<(p-4);ownedValue+=VAL[t];
   // General mobility is not a substitute for General safety.
   const positional=t===0?(-4*central+2*Math.abs(y-(o===1?8:0))):
    t===1?4*central:t===2?5*central:2*central+2*(o===1?8-y:y);
   total+=sgn*(VAL[t]+positional);
   if(j<h-1&&o!==controller)buriedEnemy++;
  }
  const sg=controller===side?1:-1,distinct=popcount(mask);
  if(h>1){
   // Elevation makes a full stack able to cross lower formations. Identical
   // stacked pieces give height, but fewer new movement possibilities.
   total+=sg*((h-1)*30+(distinct-1)*18+buriedEnemy*12);
   // Being caught in a tall stack loses more material at once. Modest
   // fragility penalty prevents unlimited stacking into exposed one-shot targets.
   total-=sg*Math.min(25,Math.round(ownedValue/75))*(h-1);
  }
  // Table-driven movement synergy. Height-aware nearby obstruction checks
  // retain basic terrain sensitivity without tracing every piece's full rays.
  let obstruction=0;
  if(mask&4){ // A carried Cannon contributes four sliding directions.
   for(let j=0;j<h;j++)if(type(st[j])===2){
    for(const ray of PATHS[owner(st[j])][2][sq])if(ray.length>1&&board[ray[0]].length>=h)obstruction+=8;
   }
  }
  if(mask&2){for(let j=0;j<h;j++)if(type(st[j])===1){
   for(const ray of PATHS[owner(st[j])][1][sq])if(ray.length===2&&board[ray[0]].length>=h)obstruction+=3;
  }}
  total+=sg*(COMBO_MOBILITY[sq*256+combo]-Math.min(30,obstruction));
 }
 return total+generalPressure(board,side)-generalPressure(board,3-side);
}
function popcount(x){let n=0;while(x){n+=x&1;x>>=1;}return n;}
function makeHash(ctx,m,prev){const h=ctx.h;
 for(let j=0;j<prev[0].length;j++){const i=(m.from*3+j)*8+prev[0][j]-4;h[0]^=z1[i];h[1]^=z2[i];}
 for(let j=0;j<prev[1].length;j++){const i=(m.to*3+j)*8+prev[1][j]-4;h[0]^=z1[i];h[1]^=z2[i];}
 for(let j=0;j<ctx.board[m.from].length;j++){const i=(m.from*3+j)*8+ctx.board[m.from][j]-4;h[0]^=z1[i];h[1]^=z2[i];}
 for(let j=0;j<ctx.board[m.to].length;j++){const i=(m.to*3+j)*8+ctx.board[m.to][j]-4;h[0]^=z1[i];h[1]^=z2[i];}
 h[0]^=turn1;h[1]^=turn2;h[0]>>>=0;h[1]>>>=0;
}
// Scores move urgency, without pretending that a whole captured mixed stack has one owner.
// A capture that removes our own General is a terminal loss, regardless of its material gain.
function sortScore(ctx,m,ttid,ply){if(m.id===ttid)return 10000000;
 const b=ctx.board[m.to],sgn=ctx.side,from=ctx.board[m.from];
 if(m.kind===2){const win=captureWinner(b);if(win!==null)return win===sgn?9000000:win===0?2100000:-900000;
  let gain=0;for(const p of b)gain+=VAL[type(p)]*(owner(p)===sgn?-1:1);
  let carried=0;for(let j=from.length-m.count;j<from.length;j++)carried+=VAL[type(from[j])];
  // Capture priority = whole-stack material gain, with a modest risk/exposure adjustment.
  return 450000+gain*17-carried*1.5+b.length*120;
 }
 if(m.kind===3){let borrowed=0;for(const p of b)borrowed+=VAL[type(p)];
  const types=new Set(from.slice(-m.count).map(type));return 60000+borrowed*.23+m.count*90+types.size*35;
 }
 if(m.kind===1){let movedMask=0;for(let j=from.length-m.count;j<from.length;j++)movedMask|=1<<type(from[j]);
  return 21500+370*m.count+90*popcount(movedMask);}
 const killers=ctx.killers[ply]||[];if(killers[0]===m.id)return 13000;if(killers[1]===m.id)return 12000;
 const history=ctx.history[m.id]||0,center=8-Math.abs(m.to%9-4)-Math.abs((m.to/9|0)-4);
 return history+center*3;
}
function mateToTT(score,ply){return score>MATE-MATE_ZONE?score+ply:score< -MATE+MATE_ZONE?score-ply:score;}
function mateFromTT(score,ply){return score>MATE-MATE_ZONE?score-ply:score< -MATE+MATE_ZONE?score+ply:score;}
function search(state,options={},update=()=>{}){
 const ctx={board:state.board.map(s=>s.slice()),side:state.player,noCapturePlies:noCaptureClock(state),h:hashBoard(state.board,state.player),nodes:0,qnodes:0,tt:new Map(),ttMax:240000,history:new Int32Array(81000),gameHistory:state.history||[],pathMoves:[],killers:[],rep:new Map(Object.entries(state.repetitions||{})),ttHits:0,threatEvasions:0,tacticalExtensions:0,start:performance.now(),ms:Math.max(25,options.ms||2000),deadline:0,stop:false,selDepth:0,ply:state.ply};
 ctx.deadline=ctx.start+ctx.ms;let best=null,score=0,depthReached=0,stats=null,completed=false;const STOP={};
 const key=()=>keyHash(ctx.h),ttKey=()=>key()+'|nc'+ctx.noCapturePlies;
 function tick(ply){ctx.nodes++;ctx.selDepth=Math.max(ctx.selDepth,ply);if((ctx.nodes&511)===0&&performance.now()>=ctx.deadline)throw STOP;}
 function step(m){const noCapturePrev=ctx.noCapturePlies,prev=change(ctx.board,m);makeHash(ctx,m,prev);ctx.noCapturePlies=m.kind===2?0:noCapturePrev+1;ctx.side=3-ctx.side;const k=key();ctx.rep.set(k,(ctx.rep.get(k)||0)+1);return {prev,k,noCapturePrev};}
 function unstep(m,u){ctx.rep.set(u.k,ctx.rep.get(u.k)-1);if(ctx.rep.get(u.k)===0)ctx.rep.delete(u.k);ctx.side=3-ctx.side;ctx.noCapturePlies=u.noCapturePrev;makeHash(ctx,m,u.prev);rollback(ctx.board,m,u.prev);}
 function outcome(m,who,ply){if(m.kind!==2)return null;const winner=captureWinner(ctx.board[m.to]);if(winner===null)return null;return winner===who?MATE-ply-1:winner===0?0:-MATE+ply+1;}
 function terminalChild(m,prev,who,ply){if(prev[2]===null)return null;return prev[2]===who?MATE-ply-1:prev[2]===0?0:-MATE+ply+1;}
 // Safety-first quiescence: threat evasions are mandatory even when nominal q-depth runs out.
 // Quiescence cannot use stand-pat when the enemy can immediately capture our General.
 function evaluateAtClock(board,side){
  const raw=evaluate(board,side),urgency=Math.max(0,Math.min(1,(ctx.noCapturePlies-55)/(NO_CAPTURE_LIMIT-55)));
  // A leading score loses value as a clock draw nears; a trailing score
  // moves toward zero, correctly making the draw more attractive to that side.
  return raw*(1-0.72*urgency);
 }
 function qsearch(alpha,beta,ply,remaining){tick(ply);ctx.qnodes++;
  if(ctx.ply+ply>=MAXPLY)return 0;
  const side=ctx.side;if(!hasLegalMove(ctx.board,side))return -MATE+ply;
  if(ctx.noCapturePlies>=NO_CAPTURE_LIMIT)return 0;
  // Immediate General capture beats speculative positional evaluation.
  if(hasWinningCapture(ctx.board,side))return MATE-ply-1;
  const danger=hasWinningCapture(ctx.board,3-side);
  const stand=evaluateAtClock(ctx.board,side);
  if(!danger){
   if(remaining<=0)return stand;
   if(stand>=beta)return stand;
   if(stand>alpha)alpha=stand;
  }
  // A threatened General has NO safe static fallback. Search every available escape,
  // even past q-depth, then verify that the enemy's General capture was really stopped.
  const moves=danger?generate(ctx.board,side):remaining>=2?generate(ctx.board,side).filter(m=>m.kind===2||m.kind===3):generate(ctx.board,side,true);
  if(!moves.length)return danger?0:stand;
  orderMoves(ctx,moves,-1,ply,ply<=2);
  let best=danger?-MATE+ply:stand;
  for(let i=0;i<moves.length;i++){
   const m=moves[i],who=ctx.side,u=step(m);
   let val;
   try{
    val=terminalChild(m,u.prev,who,ply);
    if(val===null){
     if(ctx.rep.get(u.k)>=3)val=0;
     else if(ctx.noCapturePlies>=NO_CAPTURE_LIMIT)val=hasLegalMove(ctx.board,ctx.side)?0:MATE-ply-1;
     else if(danger && hasWinningCapture(ctx.board,ctx.side)){
      // The candidate fails to evade an immediate opposing winning capture.
      val=-MATE+ply+2;
     }else if(remaining<=-1){
      // Bounded defensive extension, only after verifying the General is safe.
      val=-evaluateAtClock(ctx.board,ctx.side);
     }else{
      val=-qsearch(-beta,-alpha,ply+1,remaining-1);
     }
    }
   }finally{unstep(m,u);}
   if(val>best)best=val;
   if(val>alpha)alpha=val;
   if(alpha>=beta)break;
  }
  if(danger)ctx.threatEvasions++;
  return best;
 }
 function negamax(depth,alpha,beta,ply,pv){tick(ply);
  if(ctx.ply+ply>=MAXPLY)return 0;
  const k=key(),ttk=ttKey(),reps=ctx.rep.get(k)||0;if(reps>=3)return 0;
  const side=ctx.side;
  if(depth<=0)return qsearch(alpha,beta,ply,3);
  if(ctx.noCapturePlies>=NO_CAPTURE_LIMIT)return hasLegalMove(ctx.board,side)?0:-MATE+ply;
  const alphaStart=alpha, entry=ctx.tt.get(ttk),ttid=entry?.move??-1;
  if(entry&&entry.depth>=depth&&reps<2&&!pv){const value=mateFromTT(entry.value,ply);ctx.ttHits++;if(entry.flag===0)return value;if(entry.flag===1&&value>=beta)return value;if(entry.flag===-1&&value<=alpha)return value;}
  const moves=generate(ctx.board,side);if(!moves.length)return -MATE+ply;
  orderMoves(ctx,moves,ttid,ply,ply<=2&&depth>=2);
  let best=-MATE*2,bestId=-1;
  for(let i=0;i<moves.length;i++){
   const m=moves[i],who=ctx.side,u=step(m);let val;
   try{val=terminalChild(m,u.prev,who,ply);
    if(val===null){if(ctx.rep.get(u.k)>=3)val=0;
     else if(ctx.noCapturePlies>=NO_CAPTURE_LIMIT)val=hasLegalMove(ctx.board,ctx.side)?0:MATE-ply-1;
     else{
      const tactical=m.kind>=1||(m.count<u.prev[0].length&&owner(u.prev[0][u.prev[0].length-m.count-1])!==who);
      let reduction=!pv&&!tactical&&depth>=4&&i>=5&&ply>0?Math.min(2,1+(i>13?1:0)):0;
      if(i===0){val=-negamax(depth-1,-beta,-alpha,ply+1,pv);}
      else{val=-negamax(depth-1-reduction,-alpha-1,-alpha,ply+1,false);
        if(reduction&&val>alpha)val=-negamax(depth-1,-alpha-1,-alpha,ply+1,false);
        if(val>alpha&&val<beta)val=-negamax(depth-1,-beta,-alpha,ply+1,pv);
      }
     }
    }
   }finally{unstep(m,u);}
   if(val>best){best=val;bestId=m.id;}
   if(val>alpha)alpha=val;
   if(alpha>=beta){if(m.kind<2){const killers=ctx.killers[ply]||(ctx.killers[ply]=[-1,-1]);if(killers[0]!==m.id){killers[1]=killers[0];killers[0]=m.id;}ctx.history[m.id]=Math.min(10000,ctx.history[m.id]+depth*depth*2);}break;}
  }
  // Retain useful entries instead of flushing the entire table at capacity.
  if(ctx.tt.size>ctx.ttMax){let n=0;for(const oldKey of ctx.tt.keys()){ctx.tt.delete(oldKey);if(++n>=ctx.ttMax/8)break;}}
  if(reps<2&&(!entry||depth>=entry.depth||best>=MATE-MATE_ZONE))ctx.tt.set(ttk,{depth,value:mateToTT(best,ply),flag:best<=alphaStart?-1:best>=beta?1:0,move:bestId});
  return best;
 }
 function root(depth,low=-MATE*2,high=MATE*2){const moves=generate(ctx.board,ctx.side),entry=ctx.tt.get(ttKey());orderMoves(ctx,moves,entry?.move??-1,0,true);
  let alpha=low,beta=high,best=-MATE*2,bestMove=null;
  for(let i=0;i<moves.length;i++){
   const m=moves[i],who=ctx.side,penalty=hasWinningCapture(ctx.board,3-who)?0:backtrackPenalty(ctx.gameHistory,ctx.board,who,m),u=step(m);let val;
   try{val=terminalChild(m,u.prev,who,0);
    if(val===null){if(ctx.rep.get(u.k)>=3)val=0;
     else if(ctx.noCapturePlies>=NO_CAPTURE_LIMIT)val=hasLegalMove(ctx.board,ctx.side)?0:MATE-1;
     else if(i===0)val=-negamax(depth-1,-beta,-alpha,1,true);
     else{val=-negamax(depth-1,-alpha-1,-alpha,1,false);if(val>alpha&&val<beta)val=-negamax(depth-1,-beta,-alpha,1,true);}
    }
   }finally{unstep(m,u);}
   val-=penalty;
   if(val>best){best=val;bestMove=m;}if(val>alpha)alpha=val;if(alpha>=beta)break;
  }
  if(bestMove)ctx.tt.set(ttKey(),{depth,value:mateToTT(best,0),flag:best<=low?-1:best>=high?1:0,move:bestMove.id});
  return{best:bestMove,score:best};
 }
 function pvLine(max=12){const seenPV=new Set(),made=[],list=[];
  try{for(let i=0;i<max;i++){const k=key();if(seenPV.has(k))break;seenPV.add(k);const e=ctx.tt.get(ttKey());if(!e)break;const m=generate(ctx.board,ctx.side).find(x=>x.id===e.move);if(!m)break;
   list.push(sqname(m.from)+(m.kind===2?'×':m.kind===3?'⊕':m.kind===1?'+':'–')+sqname(m.to)+(m.count>1?'['+m.count+']':''));const u=step(m);made.push([m,u]);if(u.prev[2]!==null)break;
  }}finally{for(let i=made.length-1;i>=0;i--)unstep(...made[i]);}return list;}
 if(ctx.noCapturePlies>=NO_CAPTURE_LIMIT)return {move:null,score:0,depth:0,nodes:0,ms:0,pv:[]};
 const avail=generate(ctx.board,ctx.side);if(!avail.length)return {move:null,score:0,depth:0,nodes:0,ms:0,pv:[]};
 best=avail[0];
 for(let depth=1;depth<=Math.max(1,options.maxDepth||14);depth++){
  if(performance.now()>=ctx.deadline&&depth>1)break;
  try{let r;
   if(depth>=4&&Math.abs(score)<MATE/2){let delta=65;while(true){r=root(depth,score-delta,score+delta);if(r.score<=score-delta||r.score>=score+delta){delta*=3;if(delta>MATE){r=root(depth);break;}}else break;}}
   else r=root(depth);
   if(r.best)best=r.best;score=r.score;depthReached=depth;completed=true;
   stats={move:best,score,depth:depthReached,nodes:ctx.nodes,ms:Math.round(performance.now()-ctx.start),pv:pvLine(depth+2),selDepth:ctx.selDepth,qnodes:ctx.qnodes,ttHits:ctx.ttHits,threatEvasions:ctx.threatEvasions};
   update(stats);
   if(Math.abs(score)>MATE-200)break;
   if(performance.now()>ctx.deadline-(ctx.ms/15)&&depth>1)break;
  }catch(e){if(e!==STOP)throw e;break;}
 }
 return stats||{move:best,score:evaluateAtClock(ctx.board,ctx.side),depth:0,nodes:ctx.nodes,ms:Math.round(performance.now()-ctx.start),pv:[]};
}
return {VERSION:'1.3.3 Non-Stackable General',TYPES,NAMES,GLYPHS,KIND,MATE,NO_CAPTURE_LIMIT,initial,owner,type,index,sqname,hashBoard,keyHash,signature,generate,apply,search,evaluate,generalPressure,backtrackPenalty,noCaptureClock,captureWinner,hasWinningCapture,captureCandidates,seeMove,stackGain};
}
const ShavariLab=shavariFactory();
globalThis.ShavariLab=ShavariLab;globalThis.ShavariFactory=shavariFactory;

self.onmessage = event => {
  const { id, journal = [], ms = 900 } = event.data || {};
  try {
    const S = globalThis.ShavariLab; let state = S.initial();
    for (const action of journal) {
      const from = action.from.y * 9 + action.from.x, to = action.to.y * 9 + action.to.x;
      const stack = state.board[from] || [], count = action.mode === 'top' ? 1 : action.mode === 'pair' ? 2 : stack.length, kind = S.KIND.indexOf(action.kind);
      const move = S.generate(state.board, state.player).find(m => m.from === from && m.to === to && m.count === count && m.kind === kind);
      if (!move) throw Error('Saved Shavari actions do not match the v1.3.3 rules.');
      state = S.apply(state, move); if (!state) throw Error('The bot could not replay the current Shavari position.');
    }
    if (state.result) throw Error('The Shavari match is already finished.');
    const search = S.search(state, { ms: Math.max(25, Math.min(5000, Number(ms) || 900)) });
    if (!search?.move) throw Error('The Shavari bot found no legal move.');
    const move = search.move, stack = state.board[move.from], mode = move.count === stack.length ? 'all' : move.count === 1 ? 'top' : 'pair';
    self.postMessage({ id, action: { from: { x: move.from % 9, y: Math.floor(move.from / 9) }, to: { x: move.to % 9, y: Math.floor(move.to / 9) }, mode, kind: S.KIND[move.kind] }, stats: { depth: search.depth, nodes: search.nodes } });
  } catch (error) { self.postMessage({ id, error: error.stack || error.message }); }
};
