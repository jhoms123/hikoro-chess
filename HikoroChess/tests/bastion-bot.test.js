const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),B=require('../public/bastion-engine'),AI=require('../public/bastion-bot');

function position(size,units,player=1){
 const s=B.initial(size);s.board=Array.from({length:size},()=>Array(size).fill(null));
 for(const {x,y,owner,rank,cargo=0}of units)s.board[y][x]={owner,rank,cargo};
 s.player=player;s.reserves={1:{marshal:0,warden:0},2:{marshal:0,warden:0}};s.captured={1:0,2:0};s.history=[];s.ply=0;s.pendingSettle=null;s.result=null;s.last=null;s.seenKeys=[B.positionKey(s)];return s;
}
const unit=(x,y,owner,rank,cargo)=>({x,y,owner,rank,cargo});

test('the Go-style bot returns a legal opening on both supported board sizes',()=>{
 for(const size of [13,19]){const s=B.initial(size),choice=AI.chooseAction(s,{beam:4});assert.ok(choice?.reason);assert.ok(B.apply(s,choice.action),`${size}x${size} choice should be legal`);assert.ok(choice.examined>0);}
});

test('the tactical reader closes a last liberty when it can capture a group',()=>{
 const s=position(13,[unit(4,5,1,'levy'),unit(6,5,1,'levy'),unit(5,4,1,'levy'),unit(5,7,1,'levy'),unit(5,5,2,'levy'),unit(11,11,2,'keep')]);
 const choice=AI.chooseAction(s,{beam:8});assert.deepEqual(choice.action,{type:'move',from:{x:5,y:7},to:{x:5,y:6}});const next=B.apply(s,choice.action);assert.equal(next.board[5][5],null);assert.equal(next.captured[1],1);
});

test('self-play can complete legal early moves on 13x13 and 19x19 boards',()=>{
 for(const size of [13,19]){let s=B.initial(size);for(let i=0;i<4;i++){const choice=AI.chooseAction(s,{beam:4,maxPlies:24});const next=B.apply(s,choice.action);assert.ok(next,`${size}x${size} move ${i+1} is legal`);s=next;}assert.equal(s.ply,4);assert.equal(s.history.length,4);}
});

test('standalone spectator embeds the current engine and bot without external assets',()=>{
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'public/bastion-spectator.html'),'utf8'),engine=fs.readFileSync(path.join(root,'public/bastion-engine.js'),'utf8').trim(),bot=fs.readFileSync(path.join(root,'public/bastion-bot.js'),'utf8').trim();
 assert.ok(html.includes(engine));assert.ok(html.includes(bot));assert.doesNotMatch(html,/<script\s+[^>]*src=/i);assert.doesNotMatch(html,/<link\s+[^>]*rel=["']stylesheet/i);assert.ok(html.includes('13 × 13'));assert.ok(html.includes('19 × 19'));
});
