const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const A=require('../public/academy-engine');
const bot=require('../public/academy-bot');
const action=(from,to)=>({from:{r:from[0],c:from[1]},to:{r:to[0],c:to[1]}});
function emptyState(player=1){
    const state=A.initial('match');
    state.board=Array.from({length:8},()=>Array(8).fill(null));
    state.player=player;state.ply=0;state.history=[];state.lastMove=null;
    state.captured={1:[],2:[]};state.result=null;state.positions={};
    return state;
}
function put(state,type,owner,r,c){state.board[r][c]={type,owner};}
test('Academy bot returns a legal action for the 8×8 match and declines lesson states',()=>{
    const state=A.initial('match');
    const move=bot.chooseMove(state,{budgetMs:700,maxDepth:2,rootWidth:24,replyWidth:10});
    assert.ok(move);
    assert.ok(A.allMoves(state).some(m=>m.from.r===move.from.r&&m.from.c===move.from.c&&m.to.r===move.to.r&&m.to.c===move.to.c));
    assert.equal(bot.chooseMove(A.initial('lesson')),null);
});
test('Academy bot takes an immediate royal sanctuary win',()=>{
    const state=emptyState(1);
    put(state,'prince',1,3,1);put(state,'lupa',1,7,3);
    put(state,'lupa',2,0,3);put(state,'prince',2,0,4);
    const move=bot.chooseMove(state,{budgetMs:1000,maxDepth:2,rootWidth:32,replyWidth:12});
    assert.ok(move);
    assert.equal(A.apply(state,move).result?.winner,1);
});
test('Academy bot sees a final royal capture as a forced win',()=>{
    const state=emptyState(1);
    put(state,'kota',1,3,3);put(state,'lupa',1,7,3);
    put(state,'prince',2,3,4);
    const move=bot.chooseMove(state,{budgetMs:1000,maxDepth:2,rootWidth:32,replyWidth:12});
    assert.ok(move);
    assert.equal(A.apply(state,move).result?.winner,1);
});
test('Academy bot avoids a one-move sanctuary loss when it can stop the Prince',()=>{
    const state=emptyState(2);
    put(state,'lupa',2,0,3);put(state,'prince',2,0,4);
    put(state,'kota',2,2,0);
    put(state,'lupa',1,7,3);put(state,'prince',1,3,1);
    const move=bot.chooseMove(state,{budgetMs:1500,maxDepth:2,rootWidth:36,replyWidth:14});
    assert.ok(move);
    const next=A.apply(state,move);
    assert.ok(next);
    if(next.result)assert.notEqual(next.result.winner,1);
    else for(const reply of A.allMoves(next))assert.notEqual(A.apply(next,reply)?.result?.winner,1);
});
test('Academy page wires a local bot selector and off-thread worker',()=>{
    const html=fs.readFileSync(path.join(__dirname,'../public/academy.html'),'utf8');
    const ui=fs.readFileSync(path.join(__dirname,'../public/academy-ui.js'),'utf8');
    assert.match(html,/id="academy-opponent"/);
    assert.match(html,/academy-bot\.js\?v=20261010-academy-bot-v2/);
    assert.match(ui,/academy-bot-worker\.js\?v=20261010-academy-bot-v2/);
});
test('bot returns null for a terminal or move-less Academy position',()=>{
    const state=emptyState(2);
    assert.equal(bot.chooseMove(state),null);
    state.result={winner:0,reason:'draw'};
    assert.equal(bot.chooseMove(state),null);
});
test('Royal race planner accounts for palace lock and clears actual paths',()=>{
 const state=emptyState(1);
 put(state,'lupa',1,7,3);
 put(state,'prince',1,3,1);
 put(state,'lupa',2,0,3);
 put(state,'prince',2,0,4);
 const plans=bot.royalPlans(state.board);
 assert.equal(plans[1].find(p=>p.type==='prince').d,1);
 assert.equal(plans[1].find(p=>p.type==='lupa').d,12);
 put(state,'pilut',1,4,0); // Blocks the direct diagonal to sanctuary.
 const blocked=bot.royalPlans(state.board);
 assert.ok(blocked[1].find(p=>p.type==='prince').d>1);
 state.board[4][0]=null;
 state.board[3][1]=null;
 const released=bot.royalPlans(state.board);
 assert.ok(released[1].find(p=>p.type==='lupa').d<12);
});
test('Academy V3 recognizes enemy sanctuary move even while it is their off-turn',()=>{
 const s=emptyState(2);
 put(s,'lupa',1,7,3);put(s,'prince',1,3,1);
 put(s,'lupa',2,0,3);put(s,'prince',2,0,4);
 assert.equal(bot.directRoyalWin(s,1),true);
 assert.equal(bot.directRoyalWin(s,2),false);
});
test('Academy V3 never overlooks a capture-on-sanctuary immediate victory',()=>{
 const s=emptyState(1);
 put(s,'lupa',1,7,3);put(s,'prince',1,3,1);
 put(s,'lupa',2,0,3);put(s,'prince',2,0,4);
 put(s,'pawn',2,4,0);
 const a=bot.chooseMove(s,{budgetMs:220,maxDepth:3});
 const result=A.apply(s,a);
 assert.equal(result?.winner,undefined); // A.apply returns a state, not a result object
 assert.equal(result?.result?.winner,1);
 assert.equal(result?.result?.reason,'Sanctuary reached');
});
