const test=require('node:test'),assert=require('node:assert/strict'),B=require('../public/bastion-engine');

function position(size,units,player=1){
 const s=B.initial(size);s.board=Array.from({length:size},()=>Array(size).fill(null));
 for(const {x,y,owner,rank,cargo=0} of units)s.board[y][x]={owner,rank,cargo};
 s.player=player;s.reserves={1:{marshal:4,warden:8},2:{marshal:4,warden:8}};s.captured={1:0,2:0};s.history=[];s.ply=0;s.pendingSettle=null;s.result=null;s.last=null;s.seenKeys=[B.positionKey(s)];return s;
}
const unit=(x,y,owner,rank,cargo)=>({x,y,owner,rank,cargo});

test('13 × 13 and 19 × 19 games set four mirrored corner Keeps',()=>{
 for(const size of [13,19]){const s=B.initial(size),far=size-4;assert.equal(s.size,size);assert.deepEqual([[3,3,1],[far,far,1],[far,3,2],[3,far,2]].map(([x,y,owner])=>s.board[y][x]?.owner===owner),[true,true,true,true]);assert.equal(s.board.flat().filter(p=>p?.rank==='keep').length,4);assert.equal(B.score(s)[2].total-B.score(s)[1].total,7.5);}
});

test('raising follows the rank ladder, spends finite reserves, and is immutable',()=>{
 const s=B.initial(13),raised=B.apply(s,{type:'deploy',rank:'marshal',to:{x:6,y:3}});assert.ok(raised);assert.equal(raised.reserves[1].marshal,3);assert.equal(raised.player,2);assert.equal(s.reserves[1].marshal,4);assert.equal(B.apply(s,{type:'deploy',rank:'warden',to:{x:6,y:4}}),null);
 const reply=B.apply(raised,{type:'deploy',rank:'marshal',to:{x:6,y:9}}),back=B.apply(reply,{type:'deploy',rank:'warden',to:{x:7,y:3}});assert.ok(back);assert.equal(back.reserves[1].warden,7);
});

test('ranked movement is orthogonal or diagonal as written and Marshals cannot cross blockers',()=>{
 let s=position(13,[unit(5,5,1,'marshal'),unit(7,5,2,'levy')]);assert.equal(B.apply(s,{type:'move',from:{x:5,y:5},to:{x:8,y:5}}),null);
 s=position(13,[unit(5,5,1,'marshal'),unit(10,10,2,'levy')]);assert.ok(B.apply(s,{type:'move',from:{x:5,y:5},to:{x:5,y:8}}));assert.equal(B.apply(s,{type:'move',from:{x:5,y:5},to:{x:8,y:8}}),null);
 s=position(13,[unit(5,5,1,'warden'),unit(10,10,2,'levy')]);assert.ok(B.apply(s,{type:'move',from:{x:5,y:5},to:{x:6,y:6}}));
 s=position(13,[unit(5,5,1,'levy'),unit(10,10,2,'levy')]);assert.equal(B.apply(s,{type:'move',from:{x:5,y:5},to:{x:6,y:6}}),null);assert.ok(B.apply(s,{type:'move',from:{x:5,y:5},to:{x:5,y:6}}));
});

test('ordinary capture removes a surrounded group; suicide without capture is illegal',()=>{
 let s=position(13,[unit(4,5,1,'levy'),unit(6,5,1,'levy'),unit(5,4,1,'levy'),unit(5,7,1,'levy'),unit(5,5,2,'levy')]);
 let next=B.apply(s,{type:'move',from:{x:5,y:7},to:{x:5,y:6}});assert.ok(next);assert.equal(next.board[5][5],null);assert.equal(next.captured[1],1);
 s=position(13,[unit(4,5,2,'levy'),unit(6,5,2,'levy'),unit(5,4,2,'levy'),unit(5,6,2,'levy'),unit(4,4,1,'warden')]);
 assert.equal(B.apply(s,{type:'deploy',rank:'levy',to:{x:5,y:5}}),null);
});

test('Keep capture requires a Marshal beside every Keep in the Fort',()=>{
 const surrounded=[unit(4,5,1,'levy'),unit(6,5,1,'levy'),unit(5,4,1,'levy'),unit(5,7,1,'levy'),unit(5,5,2,'keep')];
 const withoutSiege=position(13,[...surrounded,unit(4,4,1,'marshal')]);assert.equal(B.apply(withoutSiege,{type:'move',from:{x:5,y:7},to:{x:5,y:6}}),null);
 const withSiege=position(13,[...surrounded.filter(p=>!(p.x===4&&p.y===5)),unit(4,5,1,'marshal')]);const result=B.apply(withSiege,{type:'move',from:{x:5,y:7},to:{x:5,y:6}});assert.ok(result);assert.equal(result.board[5][5],null);assert.equal(result.captured[1],1);
});

test('Wardens embark, carry, move, and disembark Levies as one stack',()=>{
 let s=position(13,[unit(5,5,1,'warden'),unit(6,5,1,'levy'),unit(10,10,2,'levy')]);s=B.apply(s,{type:'embark',from:{x:6,y:5},at:{x:5,y:5}});assert.ok(s);assert.equal(s.board[5][5].cargo,1);assert.equal(s.board[5][6],null);
 s=B.apply(s,{type:'move',from:{x:10,y:10},to:{x:11,y:10}});s=B.apply(s,{type:'move',from:{x:5,y:5},to:{x:6,y:6}});assert.ok(s);assert.equal(s.board[6][6].cargo,1);
 s=B.apply(s,{type:'move',from:{x:11,y:10},to:{x:10,y:10}});s=B.apply(s,{type:'disembark',at:{x:6,y:6},drops:[{x:6,y:5}]});assert.ok(s);assert.equal(s.board[6][6].cargo,0);assert.equal(s.board[5][6].rank,'levy');
});

test('repetition is rejected and accepted settlement records the territory winner',()=>{
 let s=position(13,[unit(5,5,1,'levy'),unit(9,9,2,'levy')]);
 s=B.apply(s,{type:'move',from:{x:5,y:5},to:{x:6,y:5}});s=B.apply(s,{type:'move',from:{x:9,y:9},to:{x:10,y:9}});s=B.apply(s,{type:'move',from:{x:6,y:5},to:{x:5,y:5}});assert.ok(s);assert.equal(B.apply(s,{type:'move',from:{x:10,y:9},to:{x:9,y:9}}),null);
 const settled=B.replay([{type:'settle'},{type:'accept-settle'}],13);assert.ok(settled.result);assert.equal(settled.result.winner,2);assert.equal(settled.result.score[2].total,9.5);
});
