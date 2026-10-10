/* Port of jhoms123/goGameLocal and csharpgogame: moving stones and shields, without bots. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GoVariant=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const owner=v=>v?((v-1)%2)+1:0, dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const valid=(s,p)=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<s.size&&p.y<s.size;
const neighbors=(s,p)=>dirs.map(([x,y])=>({x:p.x+x,y:p.y+y})).filter(p=>valid(s,p));
const key=s=>s.board.flat().join('')+':'+s.player;
function initial(size=9){if(![9,13].includes(size))throw Error('Board size must be 9 or 13');const s={size,board:Array.from({length:size},()=>Array(size).fill(0)),player:1,chain:null,passes:0,lost:{1:0,2:0},remaining:{1:100,2:100},ply:0,history:[],last:null,result:null,positions:{}};s.positions[key(s)]=1;return s;}
function group(s,p){const team=owner(s.board[p.y][p.x]),stones=[],liberties=new Set(),seen=new Set(),queue=[p];for(let i=0;i<queue.length;i++){const q=queue[i],k=q.x+','+q.y;if(seen.has(k))continue;seen.add(k);stones.push(q);for(const n of neighbors(s,q)){const v=s.board[n.y][n.x];if(!v)liberties.add(n.x+','+n.y);else if(owner(v)===team&&!seen.has(n.x+','+n.y))queue.push(n);}}return {stones,liberties};}
function capture(s,p){const team=owner(s.board[p.y][p.x]);for(const n of neighbors(s,p)){if(s.board[n.y][n.x]&&owner(s.board[n.y][n.x])!==team){const g=group(s,n);if(!g.liberties.size)for(const q of g.stones){s.lost[owner(s.board[q.y][q.x])]++;s.board[q.y][q.x]=0;}}}return group(s,p).liberties.size>0;}
function candidates(s,p){if(!valid(s,p)||owner(s.board[p.y][p.x])!==s.player||s.result)return[];if(s.chain&&(p.x!==s.chain.x||p.y!==s.chain.y))return[];const v=s.board[p.y][p.x],moves=[];if(v<=2){if(!s.remaining[s.player])return[];for(const [dx,dy]of dirs){const to={x:p.x+dx*2,y:p.y+dy*2},mid={x:p.x+dx,y:p.y+dy};if(valid(s,to)&&!s.board[to.y][to.x]&&s.board[mid.y][mid.x]===3-s.player)moves.push({type:'jump',to});}}else if(!s.chain){for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const to={x:p.x+dx,y:p.y+dy};if((dx||dy)&&valid(s,to)&&!s.board[to.y][to.x])moves.push({type:'move',to});}}return moves;}
function score(s){const out={1:{stones:0,shields:0,territory:0,captures:s.lost[2],komi:0,total:0},2:{stones:0,shields:0,territory:0,captures:s.lost[1],komi:4,total:0}},seen=new Set();for(let y=0;y<s.size;y++)for(let x=0;x<s.size;x++){const v=s.board[y][x];if(v){if(v>2)out[owner(v)].shields++;else out[owner(v)].stones++;continue;}const k=x+','+y;if(seen.has(k))continue;const queue=[{x,y}],borders=new Set();seen.add(k);for(let i=0;i<queue.length;i++)for(const n of neighbors(s,queue[i])){const v=s.board[n.y][n.x],nk=n.x+','+n.y;if(v)borders.add(owner(v));else if(!seen.has(nk)){seen.add(nk);queue.push(n);}}if(borders.size===1)out[[...borders][0]].territory+=queue.length;}for(const p of [1,2])out[p].total=out[p].stones+out[p].shields*.5+out[p].territory+out[p].captures+out[p].komi;return out;}
const namesForReserve=p=>p===1?'Black':'White';
// Search states use a prototype overlay for repetition counts. Public transitions flatten it
// back into a plain object, while avoiding a deep copy of the move log during search.
function flattenPositions(positions){const copy={};for(const position in positions||{})copy[position]=positions[position];return copy;}
function cloneState(state,search){
const copy={...state,board:state.board.map(row=>row.slice()),chain:state.chain?{...state.chain}:null,lost:{...state.lost},remaining:{...state.remaining},last:state.last?{...state.last}:null,result:state.result?{...state.result}:null};
copy.positions=search?Object.create(state.positions||null):flattenPositions(state.positions);
copy.history=search?[]:(state.history||[]).map(entry=>({...entry,action:JSON.parse(JSON.stringify(entry.action))}));
return copy;}
function apply(state,a,options){if(!state||state.result||!a||typeof a!=='object')return null;const search=Boolean(options&&options.search),s=cloneState(state,search),p=s.player;let to=null;
if(a.type==='resign'){s.result={winner:3-p,reason:'Resignation'};}
else if(a.type==='pass'){if(s.chain)return null;s.passes++;if(s.passes===2){const sc=score(s);s.result={winner:sc[1].total===sc[2].total?0:sc[1].total>sc[2].total?1:2,reason:'Two consecutive passes'};}s.player=3-p;}
else if(a.type==='place'){to=a.to;if(!s.remaining[p]||s.chain||!valid(s,to)||s.board[to.y][to.x])return null;s.board[to.y][to.x]=p;if(!capture(s,to))return null;s.passes=0;s.player=3-p;}
else if(a.type==='shield'){to=a.at;if(!s.remaining[p]||!valid(s,to)||s.board[to.y][to.x]!==p||s.chain&&(to.x!==s.chain.x||to.y!==s.chain.y))return null;s.board[to.y][to.x]=p+2;if(!capture(s,to))return null;s.chain=null;s.passes=0;s.player=3-p;}
else if(a.type==='move'){to=a.to;const from=a.from;if(!valid(s,to)||!valid(s,from))return null;const move=candidates(s,from).find(m=>m.to.x===to.x&&m.to.y===to.y);if(!move)return null;const piece=s.board[from.y][from.x];s.board[from.y][from.x]=0;s.board[to.y][to.x]=piece;if(move.type==='jump'){s.board[(from.y+to.y)/2][(from.x+to.x)/2]=0;s.lost[3-p]++;}if(!capture(s,to))return null;s.chain=null;s.passes=0;if(move.type==='jump')s.chain={...to};else s.player=3-p;}
else return null;
if(a.type==='place'||a.type==='shield')s.remaining[p]--;
if(!s.result&&!s.remaining[p]){const sc=score(s);s.result={winner:sc[1].total===sc[2].total?0:sc[1].total>sc[2].total?1:2,reason:namesForReserve(p)+' used the final reserve stone'};}
s.ply++;s.last=to?{...to}:null;if(!search)s.history.push({player:p,action:JSON.parse(JSON.stringify(a))});if(!s.result&&!s.chain&&a.type!=='pass'){const k=key(s);s.positions[k]=(s.positions[k]||0)+1;if(s.positions[k]>=3){const sc=score(s);s.result={winner:sc[1].total===sc[2].total?0:sc[1].total>sc[2].total?1:2,reason:'Threefold repetition; score decides'};}}return s;}
// Ephemeral search transitions preserve repetition counts but intentionally omit replay history.
function applySearch(state,a){return apply(state,a,{search:true});}
function canMove(s,from,m){const copy={size:s.size,board:s.board.map(row=>row.slice()),lost:{...s.lost}};const to=m.to,v=copy.board[from.y][from.x];copy.board[from.y][from.x]=0;copy.board[to.y][to.x]=v;if(m.type==='jump')copy.board[(from.y+to.y)/2][(from.x+to.x)/2]=0;return capture(copy,to);}
const legalMoves=(s,p)=>candidates(s,p).filter(m=>canMove(s,p,m));
function replay(actions,size=9,cursor=actions?.length){if(!Array.isArray(actions)||actions.length>10000||!Number.isInteger(cursor)||cursor<0||cursor>actions.length)return null;let s;try{s=initial(size);}catch{return null;}for(const a of actions.slice(0,cursor)){s=apply(s,a);if(!s)return null;}return s;}
const coord=(s,p)=>'ABCDEFGHJKLMNOPQR'[p.x]+(s.size-p.y);
return{initial,apply,applySearch,legalMoves,replay,score,owner,coord};
});

