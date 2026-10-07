const test=require('node:test'),assert=require('node:assert/strict'),G=require('../public/go-engine');
const {createServer}=require('../server'),{io:connect}=require('socket.io-client');
function pos(entries,size=9){const s=G.initial(size);for(const [x,y,v]of entries)s.board[y][x]=v;return s;}
test('both sizes start empty; actions reject malformed coordinates, ownership and suicide atomically',()=>{for(const size of [9,13]){const s=G.initial(size);assert.equal(s.board.flat().length,size*size);assert.equal(G.score(s)[1].total,0);const n=G.apply(s,{type:'place',to:{x:size-1,y:size-1}});assert.equal(n.player,2);assert.equal(s.board[size-1][size-1],0);}assert.throws(()=>G.initial(19));const s=pos([[1,0,2],[0,1,2]]);for(const a of [null,{}, {type:'place',to:{x:-1,y:0}},{type:'place',to:{x:0.5,y:0}},{type:'place',to:{x:0,y:0}},{type:'shield',at:{x:1,y:0}},{type:'move',from:{x:1,y:0},to:{x:2,y:0}}])assert.equal(G.apply(s,a),null);assert.equal(s.lost[1],0);});
test('surrounding captures mixed stone/shield groups, while suicide after vacating a liberty rolls back',()=>{const s=pos([[0,0,2],[1,0,4],[0,1,1],[2,0,1]]),n=G.apply(s,{type:'place',to:{x:1,y:1}});assert.equal(n.lost[2],2);assert.equal(n.board[0][0],0);assert.equal(n.board[0][1],0);const blocked=pos([[4,4,3],[4,5,2],[5,4,2],[5,6,2],[6,5,2]]);assert.equal(G.apply(blocked,{type:'move',from:{x:4,y:4},to:{x:5,y:5}}),null);assert.equal(blocked.board[4][4],3);});
test('jumps require shielding the jumping stone, including after the final legal jump',()=>{
 for(const size of [9,13]){
  const s=pos([[0,4,1],[1,4,2],[3,4,2],[5,4,4],[8,8,1]],size);
  const n=G.apply(s,{type:'move',from:{x:0,y:4},to:{x:2,y:4}});
  assert.equal(n.player,1);assert.deepEqual(n.chain,{x:2,y:4});assert.equal(n.lost[2],1);
  for(const action of [{type:'pass'},{type:'place',to:{x:0,y:0}},{type:'shield',at:{x:8,y:8}},{type:'move',from:{x:8,y:8},to:{x:6,y:8}}])assert.equal(G.apply(n,action),null);
  const end=G.apply(n,{type:'move',from:{x:2,y:4},to:{x:4,y:4}});
  assert.equal(end.player,1);assert.deepEqual(end.chain,{x:4,y:4});assert.equal(end.lost[2],2);
  assert.equal(end.board[4][5],4);assert.deepEqual(G.legalMoves(end,end.chain),[]);
  assert.equal(G.apply(end,{type:'pass'}),null);assert.equal(end.remaining[1],100);
  const shield=G.apply(end,{type:'shield',at:end.chain});
  assert.equal(shield.player,2);assert.equal(shield.chain,null);assert.equal(shield.board[4][4],3);
  assert.equal(shield.remaining[1],99);assert.equal(shield.passes,0);
  assert.equal(end.board[4][4],1);assert.equal(shield.history.at(-1).player,1);
 }
});
test('shielding can stop a chain early and only the completed turn counts for repetition',()=>{
 const s=pos([[0,4,1],[1,4,2],[3,4,2]]);s.passes=1;
 const jump=G.apply(s,{type:'move',from:{x:0,y:4},to:{x:2,y:4}});
 assert.equal(jump.passes,0);assert.equal(G.legalMoves(jump,jump.chain).length,1);
 assert.deepEqual(jump.positions,s.positions);
 const end=G.apply(jump,{type:'shield',at:jump.chain});
 assert.equal(end.player,2);assert.equal(end.chain,null);assert.equal(end.board[4][2],3);
 assert.equal(end.board[4][3],2);assert.equal(end.lost[2],1);assert.equal(end.remaining[1],99);
 assert.equal(Object.keys(end.positions).length,Object.keys(s.positions).length+1);
 const pass=G.apply(end,{type:'pass'});assert.equal(pass.passes,1);assert.equal(pass.result,null);
});
test('a final reserve is spent on the mandatory shield, and shields still move without shielding again',()=>{
 const s=pos([[0,4,1],[1,4,2]]);s.remaining[1]=1;
 const jump=G.apply(s,{type:'move',from:{x:0,y:4},to:{x:2,y:4}});
 assert.equal(jump.remaining[1],1);assert.equal(jump.result,null);
 const end=G.apply(jump,{type:'shield',at:jump.chain});
 assert.equal(end.remaining[1],0);assert.equal(end.board[4][2],3);assert.equal(end.chain,null);
 assert.equal(end.result.reason,'Black used the final reserve stone');
 const noReserve=pos([[0,4,1],[1,4,2]]);noReserve.remaining[1]=0;
 assert.deepEqual(G.legalMoves(noReserve,{x:0,y:4}),[]);
 assert.equal(G.apply(noReserve,{type:'move',from:{x:0,y:4},to:{x:2,y:4}}),null);
 const shield=pos([[4,4,3]]);const moved=G.apply(shield,{type:'move',from:{x:4,y:4},to:{x:5,y:5}});
 assert.equal(moved.player,2);assert.equal(moved.chain,null);assert.equal(moved.remaining[1],100);
});
test('journals replay unfinished chains and shield endings; obsolete pass endings are rejected',()=>{
 const actions=[{type:'place',to:{x:0,y:4}},{type:'place',to:{x:1,y:4}},
  {type:'place',to:{x:8,y:8}},{type:'place',to:{x:3,y:4}},
  {type:'move',from:{x:0,y:4},to:{x:2,y:4}},
  {type:'shield',at:{x:2,y:4}}];
 const pending=G.replay(actions,9,5);assert.deepEqual(pending.chain,{x:2,y:4});assert.equal(pending.player,1);
 const end=G.replay(actions,9);assert.equal(end.board[4][2],3);assert.equal(end.chain,null);assert.equal(end.player,2);
 assert.equal(G.replay([...actions.slice(0,5),{type:'pass'}],9),null);
});
test('shields transform permanently, move to eight adjacent empty points, and still use liberties',()=>{let s=pos([[4,4,1]]);s=G.apply(s,{type:'shield',at:{x:4,y:4}});assert.equal(s.board[4][4],3);assert.equal(s.remaining[1],99);assert.equal(G.score(s)[1].shields,1);s.player=1;assert.equal(G.legalMoves(s,{x:4,y:4}).length,8);const n=G.apply(s,{type:'move',from:{x:4,y:4},to:{x:5,y:5}});assert.equal(n.board[5][5],3);assert.equal(G.apply(s,{type:'shield',at:{x:4,y:4}}),null);});
test('weighted area scores include capture points and komi; two passes finish, repetition draws and journals replay',()=>{const s=pos([[0,0,1],[8,8,2]]);s.lost[2]=10;assert.equal(G.score(s)[1].total,11);const a=G.apply(s,{type:'pass'}),b=G.apply(a,{type:'pass'});assert.equal(b.result.winner,1);assert.equal(G.apply(b,{type:'place',to:{x:1,y:1}}),null);let cycle=pos([[0,0,3],[8,8,4]]);const actions=[{type:'move',from:{x:0,y:0},to:{x:0,y:1}},{type:'move',from:{x:8,y:8},to:{x:8,y:7}},{type:'move',from:{x:0,y:1},to:{x:0,y:0}},{type:'move',from:{x:8,y:7},to:{x:8,y:8}}];for(let i=0;i<12&&!cycle.result;i++)cycle=G.apply(cycle,actions[i%4]);assert.equal(cycle.result.reason,'Threefold repetition');const journal=[{type:'place',to:{x:0,y:0}},{type:'place',to:{x:12,y:12}},{type:'pass'},{type:'pass'}];assert.equal(G.replay(journal,13).result.winner,2);assert.equal(G.replay(journal,13,1).ply,1);assert.equal(G.replay(journal,9),null);});
const once=(s,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timeout '+event)),4000);s.once(event,v=>{clearTimeout(timer);resolve(v);});});
test('online Go keeps board size, authenticates seats and turns, synchronizes moves and resumes',async t=>{const {server,io}=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));});async function client(){const s=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],forceNew:true});clients.push(s);await once(s,'connect');return s;}const a=await client(),b=await client(),outside=await client();let error=once(a,'errorMsg');a.emit('createGame',{gameType:'go',boardSize:19});await error;const ticket=once(a,'seatAssigned'),created=once(a,'gameCreated');a.emit('createGame',{gameType:'go',boardSize:13});const {gameId}=await created,seat=await ticket;const start=once(a,'gameStart');b.emit('joinGame',gameId);await start;let sync=once(a,'goState');a.emit('joinGoRoom',{gameId,token:seat.token});assert.equal((await sync).state.size,13);error=once(b,'errorMsg');b.emit('goAction',{gameId,action:{type:'pass'}});await error;error=once(outside,'errorMsg');outside.emit('goAction',{gameId,action:{type:'resign'}});await error;sync=once(a,'goState');const other=once(b,'goState');a.emit('goAction',{gameId,action:{type:'place',to:{x:12,y:12}}});const [x,y]=await Promise.all([sync,other]);assert.deepEqual(x.state,y.state);assert.equal(x.state.ply,1);const replacement=await client();sync=once(replacement,'goState');replacement.emit('joinGoRoom',{gameId,token:seat.token});assert.equal((await sync).state.ply,1);error=once(a,'errorMsg');a.emit('goAction',{gameId,action:{type:'resign'}});await error;sync=once(replacement,'goState');b.emit('goAction',{gameId,action:{type:'resign'}});assert.equal((await sync).state.result.winner,1);});

test('reserves spend only on valid placement or shielding; exhaustion scores the final board',()=>{const s=G.initial();s.remaining[1]=1;const n=G.apply(s,{type:'place',to:{x:4,y:4}});assert.equal(n.remaining[1],0);assert.equal(n.result.reason,'Black used the final reserve stone');assert.equal(n.result.winner,1);const blocked=pos([[1,0,2],[0,1,2]]);assert.equal(G.apply(blocked,{type:'place',to:{x:0,y:0}}),null);assert.equal(blocked.remaining[1],100);const sc=G.score(pos([[4,4,3],[4,5,4]]));assert.equal(sc[1].total,.5);assert.equal(sc[2].total,4.5);});

test('online chain retains the seat through jumps, rejects pass and unrelated shields, and ends on shielding',async t=>{
 const {server,io}=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const clients=[];t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));});
 async function client(){const s=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],forceNew:true});clients.push(s);await once(s,'connect');return s;}
 const a=await client(),b=await client();const created=once(a,'gameCreated'),ticket=once(a,'seatAssigned');
 a.emit('createGame',{gameType:'go',boardSize:9});const {gameId}=await created;const seat=await ticket;
 const started=once(a,'gameStart');b.emit('joinGame',gameId);await started;
 async function action(client,action){const x=once(a,'goState'),y=once(b,'goState');client.emit('goAction',{gameId,action});const states=await Promise.all([x,y]);assert.deepEqual(states[0].state,states[1].state);return states[0].state;}
 for(const [client,to]of [[a,{x:0,y:4}],[b,{x:1,y:4}],[a,{x:8,y:8}],[b,{x:3,y:4}]])await action(client,{type:'place',to});
 let state=await action(a,{type:'move',from:{x:0,y:4},to:{x:2,y:4}});
 assert.equal(state.player,1);assert.deepEqual(state.chain,{x:2,y:4});
 for(const [client,action]of [[a,{type:'pass'}],[a,{type:'shield',at:{x:8,y:8}}],[b,{type:'place',to:{x:7,y:7}}]]){const error=once(client,'errorMsg');client.emit('goAction',{gameId,action});await error;}
 const resumed=await client(),sync=once(resumed,'goState');resumed.emit('joinGoRoom',{gameId,token:seat.token});
 assert.deepEqual((await sync).state.chain,{x:2,y:4});
 // The replacement seat must be allowed to finish early while another jump remains.
 const x=once(resumed,'goState'),y=once(b,'goState');resumed.emit('goAction',{gameId,action:{type:'shield',at:{x:2,y:4}}});
 const [done,other]=await Promise.all([x,y]);assert.deepEqual(done.state,other.state);
 assert.equal(done.state.player,2);assert.equal(done.state.chain,null);assert.equal(done.state.board[4][2],3);assert.equal(done.state.board[4][3],2);
});
