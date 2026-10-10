/* 20 paired-opening real-rules head-to-head games. Run: node tests/academy-bot-tournament.js */
'use strict';
const assert=require('node:assert/strict');
const A=require('../public/academy-engine');
const v1=require('./fixtures/academy-bot-v3');
const v2=require('../public/academy-bot');
const games=20,MAX_PLIES=180;
const MOVE_BUDGET=Number(process.env.ACADEMY_BUDGET_MS||60);
const OPENING_SEED=Number(process.env.ACADEMY_SEED||744733);
const maxDepth={v1:5,v2:5};
const opts=who=>({budgetMs:MOVE_BUDGET,maxDepth:maxDepth[who],rootWidth:64,replyWidth:24});
function rng(seed){let n=seed>>>0;return()=>{n=(Math.imul(1664525,n)+1013904223)>>>0;return n/4294967296;};}
function opening(seed){
 const random=rng(OPENING_SEED+seed*8191),actions=[];let state=A.initial('match');
 for(let i=0;i<4;i++){
  const moves=A.allMoves(state).filter(a=>{
   const p=state.board[a.from.r][a.from.c];
   return p&&!['lupa','prince'].includes(p.type)&&!state.board[a.to.r][a.to.c];
  });
  assert(moves.length);
  // Encourage different, but legitimate, non-royal developments.
  const selected=moves[Math.floor(random()*moves.length)];
  const next=A.apply(state,selected);assert(next);
  actions.push(selected);state=next;
 }
 return actions;
}
const results=[],aggregate={v2:0,v1:0,draw:0,unresolved:0,errors:0};
const start=Date.now();
for(let pair=0;pair<10;pair++){
 const book=opening(pair);
 for(let side=0;side<2;side++){
  const v2Side=side===0?1:2;
  let s=A.replay(book),reason='',issue=null;
  assert.equal(s.player,1);
  while(!s.result&&s.ply<MAX_PLIES){
   const label=s.player===v2Side?'v2':'v1';
   const bot=label==='v2'?v2:v1;
   let a;
   try{a=bot.chooseMove(s,opts(label));}
   catch(error){issue=label+' exception: '+error.stack;break;}
   const moves=A.allMoves(s);
   if(!a||!moves.some(m=>m.from.r===a.from.r&&m.from.c===a.from.c&&m.to.r===a.to.r&&m.to.c===a.to.c)){
    issue=label+' returned illegal action: '+JSON.stringify(a);break;
   }
   const next=A.apply(s,a);
   if(!next){issue=label+' action refused by rules engine';break;}
   s=next;
  }
  let outcome;
  if(issue){outcome='error';aggregate.errors++;}
  else if(!s.result){outcome='unresolved';aggregate.unresolved++;}
  else if(s.result.winner===0){outcome='draw';aggregate.draw++;}
  else{outcome=s.result.winner===v2Side?'v2':'v1';aggregate[outcome]++;}
  reason=s.result?.reason||reason||(issue||'Ply cap in test harness');
  const rec={game:results.length+1,pair,v2Side,outcome,plies:s.ply,reason};
  results.push(rec);
  console.log('GAME '+rec.game+' '+JSON.stringify(rec));
  if(issue)console.error(issue);
 }
}
const summary={games:results.length,openingPairs:10,gameBudgetMs:MOVE_BUDGET,openingSeed:OPENING_SEED,capPlies:MAX_PLIES,aggregate,decisiveRate:aggregate.v2+aggregate.v1?aggregate.v2/(aggregate.v2+aggregate.v1):null,elapsedSeconds:Math.round((Date.now()-start)/1000),results};
console.log('ACADEMY_TOURNAMENT_SUMMARY='+JSON.stringify(summary));
if(aggregate.errors)process.exitCode=1;
