const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/hikoruka-engine'),{createServer}=require('../server'),{io:connect}=require('socket.io-client');
const move=(from,to)=>({from:{r:from[0],c:from[1]},to:{r:to[0],c:to[1]}});
function position(pieces,player=1){const s=M.initial();s.board=Array.from({length:5},()=>Array(5).fill(null));for(const [r,c,type,owner]of pieces)s.board[r][c]={type,owner};s.player=player;return s;}
const coords=(s,from)=>M.legalMoves(s,{r:from[0],c:from[1]}).map(p=>`${p.r},${p.c}`).sort();
test('Hikorüka starts with the supplied eight-piece armies and knight jumps over blockers',()=>{
 const s=M.initial();assert.equal(s.board.flat().filter(Boolean).length,16);assert.equal(s.board[4][2].type,'H');assert.equal(s.board[0][2].owner,2);
 assert.deepEqual(coords(s,[3,2]),['1,1','1,3','2,0','2,4']);assert.deepEqual(coords(s,[4,0]),['0,0','1,0','2,0','3,0']);
 assert.equal(M.legalMoves(s,{r:1,c:2}).length,0);
});
test('sliding and commander patterns stop at friends, capture the first enemy, and do not enforce check',()=>{
 const s=position([[2,2,'S',1],[2,3,'V',1],[0,2,'V',2],[4,4,'H',1],[0,0,'H',2]]);assert.ok(!coords(s,[2,2]).includes('2,4'));assert.ok(coords(s,[2,2]).includes('0,2'));
 s.board[2][2].type='I';assert.ok(coords(s,[2,2]).includes('0,0'));assert.ok(!coords(s,[2,2]).includes('1,2'));
 const king=position([[2,2,'H',1],[0,0,'H',2],[0,2,'S',2]]);assert.equal(coords(king,[2,2]).length,8);assert.ok(M.apply(king,move([2,2],[1,2]))); // allowed despite attack
});
test('vanguards have owner-relative forward movement, diagonal captures, and no far-edge promotion',()=>{
 for(const owner of [1,2]){const dir=owner===1?-1:1,s=position([[2,2,'V',owner],[2+dir,1,'V',3-owner],[2+dir,3,'V',owner]],owner);assert.deepEqual(coords(s,[2,2]),[`${2+dir},1`,`${2+dir},2`].sort());s.board[2+dir][2]={type:'V',owner:3-owner};assert.deepEqual(coords(s,[2,2]),[`${2+dir},1`]);}
 const edge=position([[1,2,'V',1],[4,0,'H',1],[4,4,'H',2]]);const next=M.apply(edge,move([1,2],[0,2]));assert.equal(next.board[0][2].type,'V');next.player=1;assert.deepEqual(coords(next,[0,2]),[]);
});
test('commander capture preserves the final position and prevents all later moves',()=>{
 const s=position([[2,0,'S',1],[2,4,'H',2],[4,4,'H',1]]),next=M.apply(s,move([2,0],[2,4]));assert.deepEqual(next.result,{winner:1,reason:'Commander captured'});assert.equal(next.board[2][4].type,'S');assert.deepEqual(next.captured[1],['H']);assert.equal(s.board[2][0].type,'S');assert.equal(M.apply(next,move([4,4],[3,4])),null);
});
test('invalid coordinates, ownership, malformed requests and illegal pawn moves are rejected',()=>{
 const s=M.initial();for(const action of [null,{},move([3.5,1],[2,1]),move([3,1],[5,1]),move([1,1],[2,1]),move([3,1],[1,1]),move([3,1],[2,0])])assert.equal(M.apply(s,action),null);assert.equal(M.replay([move([3,1],[2,1])],-1),null);
});
test('journals replay exact captures; repetition and immobile next player draw',()=>{
 const actions=[move([4,0],[3,0]),move([0,0],[1,0]),move([3,0],[4,0]),move([1,0],[0,0])];assert.deepEqual(M.replay([...actions,...actions]).result,{winner:0,reason:'Threefold repetition'});assert.equal(M.replay(actions,1).ply,1);
 const s=position([[0,0,'H',1],[0,1,'S',1],[4,2,'H',2],...[0,1,3,4].map(c=>[4,c,'V',2]),...[0,1,2,3,4].map(c=>[3,c,'V',2])]);assert.deepEqual(M.apply(s,move([0,1],[1,1])).result,{winner:0,reason:'No legal moves'});
});
test('the bot takes a commander capture and avoids an immediate commander loss when it can',()=>{
 const win=position([[2,0,'S',2],[2,4,'H',1],[0,0,'H',2]],2);assert.deepEqual(M.botMove(win),move([2,0],[2,4]));
 const danger=position([[0,2,'H',2],[2,2,'S',1],[4,4,'H',1],[3,0,'V',1]],2);const choice=M.botMove(danger),next=M.apply(danger,choice);assert.ok(next);assert.ok(!M.allMoves(next).some(m=>next.board[m.to.r][m.to.c]?.type==='H'&&next.board[m.to.r][m.to.c]?.owner===2));
 assert.equal(M.botMove({...M.initial(),result:{winner:1}}),null);
});
test('bot and random play remain legal, bounded, and conserve pieces across 200 plies',()=>{
 let s=M.initial(),seed=3;for(let i=0;i<200;i++){if(s.result)s=M.initial();const moves=M.allMoves(s);assert.ok(moves.length);seed=(seed*1664525+1013904223)>>>0;const action=s.player===2?M.botMove(s):moves[seed%moves.length];s=M.apply(s,action);assert.ok(s);assert.equal(s.board.flat().filter(Boolean).length+s.captured[1].length+s.captured[2].length,16);}
});
const once=(socket,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(event,done);reject(Error('Timeout '+event));},4000);const done=data=>{clearTimeout(timer);resolve(data);};socket.once(event,done);});
test('online Hikorüka enforces seats and turns, synchronizes state, resumes and rejects stale sockets',async t=>{
 const {server,io}=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));});
 async function client(){const s=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],forceNew:true});clients.push(s);await once(s,'connect');return s;}
 const a=await client(),b=await client(),outsider=await client(),created=once(a,'gameCreated'),ticket=once(a,'seatAssigned');a.emit('createGame',{gameType:'hikoruka'});const {gameId}=await created,seat=await ticket;const sa=once(a,'gameStart'),sb=once(b,'gameStart');b.emit('joinGame',gameId);await Promise.all([sa,sb]);
 let sync=once(a,'hikorukaState');a.emit('joinHikorukaRoom',{gameId,token:seat.token});assert.equal((await sync).state.ply,0);
 let error=once(b,'errorMsg');b.emit('hikorukaAction',{gameId,action:move([3,1],[2,1])});await error;
 error=once(outsider,'errorMsg');outsider.emit('hikorukaResign',{gameId});await error;
 error=once(a,'errorMsg');a.emit('hikorukaAction',{gameId,action:move([3,1],[1,1])});await error;
 sync=once(a,'hikorukaState');const other=once(b,'hikorukaState');a.emit('hikorukaAction',{gameId,action:move([3,1],[2,1])});const [x,y]=await Promise.all([sync,other]);assert.deepEqual(x.state,y.state);assert.equal(y.playerIndex,1);assert.equal(x.state.ply,1);
 const replacement=await client();sync=once(replacement,'hikorukaState');replacement.emit('joinHikorukaRoom',{gameId,token:seat.token});assert.equal((await sync).state.ply,1);
 error=once(a,'errorMsg');a.emit('hikorukaResign',{gameId});await error;
 sync=once(replacement,'hikorukaState');replacement.emit('hikorukaResign',{gameId});assert.equal((await sync).state.result.winner,2);
});
