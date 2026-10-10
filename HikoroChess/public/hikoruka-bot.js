/* Time-bounded iterative alpha-beta for the 5x5 Hikorüka match. Runs in a Worker. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./hikoruka-engine'));
 else root.HikorukaSearchBot=factory(root.Hikoruka);
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
 'use strict';
 const VALUE={H:18000,S:520,I:370,N:320,V:115},WIN=1000000;
 function child(s,m){
  const board=s.board.slice(),f=m.from,t=m.to;
  board[f.r]=s.board[f.r].slice();if(f.r!==t.r)board[t.r]=s.board[t.r].slice();
  const piece=board[f.r][f.c],captured=board[t.r][t.c];
  board[t.r][t.c]=piece;board[f.r][f.c]=null;
  return {board,player:3-s.player,result:captured?.type==='H'?{winner:s.player}:null};
 }
 function evalBoard(s){
  let score=0,kings=[null,null,null];
  for(let r=0;r<5;r++)for(let c=0;c<5;c++){
   const p=s.board[r][c];if(!p)continue;
   if(p.type==='H')kings[p.owner]={r,c};
   let v=VALUE[p.type]||0;
   v+=p.type==='V'?(p.owner===1?4-r:r)*10:(4-Math.abs(r-2)-Math.abs(c-2))*7;
   score+=(p.owner===s.player?1:-1)*v;
  }
  if(!kings[s.player])return-WIN;
  if(!kings[3-s.player])return WIN;
  return score;
 }
 function key(s){let k=String(s.player);for(const row of s.board)for(const p of row)k+=p?p.owner+p.type:'-';return k;}
 function order(s,a){
  const p=s.board[a.from.r][a.from.c],target=s.board[a.to.r][a.to.c];
  return (target?(target.type==='H'?1000000:VALUE[target.type]*10):0)
   -(p.type==='H'?25:0)+(4-Math.abs(a.to.r-2)-Math.abs(a.to.c-2))*5;
 }
 function chooseMove(s,{timeMs=1000,maxDepth=12}={}){
  if(!s||s.result)return null;
  const moves=A.allMoves(s);
  if(!moves.length)return null;
  for(const m of moves)if(s.board[m.to.r][m.to.c]?.type==='H')return m;
  const deadline=Date.now()+Math.max(35,Math.min(4000,Number(timeMs)||1000));
  const STOP={};let nodes=0,best=moves[0],tt=new Map();
  function search(pos,depth,alpha,beta,ply){
   if((++nodes&31)===0&&Date.now()>=deadline)throw STOP;
   if(pos.result)return pos.result.winner===pos.player?WIN-ply:-WIN+ply;
   if(depth<=0)return evalBoard(pos);
   const k=key(pos),cached=tt.get(k);
   if(cached?.depth>=depth&&cached.exact)return cached.score;
   const actions=A.allMoves(pos);
   if(!actions.length)return 0;
   actions.sort((a,b)=>order(pos,b)-order(pos,a));
   let value=-Infinity,cut=false;
   for(const a of actions){
    const result=-search(child(pos,a),depth-1,-beta,-alpha,ply+1);
    if(result>value)value=result;
    alpha=Math.max(alpha,result);
    if(alpha>=beta){cut=true;break;}
   }
   if(!cut&&tt.size<40000)tt.set(k,{depth,score:value,exact:true});
   return value;
  }
  for(let depth=1;depth<=Math.min(12,Math.max(1,maxDepth));depth++){
   if(Date.now()>=deadline)break;
   let iteration=null,score=-Infinity;
   const ordered=moves.slice().sort((a,b)=>Number(b===best)-Number(a===best)||order(s,b)-order(s,a));
   try{
    for(const a of ordered){
     if(Date.now()>=deadline)throw STOP;
     const v=-search(child(s,a),depth-1,-Infinity,Infinity,1);
     if(v>score){score=v;iteration=a;}
    }
   }catch(error){if(error!==STOP)throw error;break;}
   if(iteration)best=iteration;
   if(score>WIN-100)break;
  }
  return best;
 }
 return {chooseMove};
});
