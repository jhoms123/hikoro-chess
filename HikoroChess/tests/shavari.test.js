const test = require('node:test');
const assert = require('node:assert/strict');
const Shavari = require('../public/shavari-engine');
const { createServer } = require('../server');
const { io: connect } = require('socket.io-client');
const move = (from, to, mode='all') => ({from:{x:from[0],y:from[1]},to:{x:to[0],y:to[1]},mode});
const once = (socket,event) => new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{socket.off(event,done);reject(Error('Timed out: '+event));},4000);
    const done=value=>{clearTimeout(timeout);resolve(value);};socket.once(event,done);
});
test('Shavari preserves initial armies, top-piece ranges, blocking and capture rules',()=>{
    const s=Shavari.initial();assert.equal(Object.values(s.board).flat().length,20);
    assert.deepEqual(Shavari.legalMoves(s,{x:0,y:8}).map(m=>[m.x,m.y,m.kind]),[[0,7,'stack'],[1,8,'move'],[2,8,'stack']]);
    assert.equal(Shavari.legalMoves(s,{x:0,y:0}).length,0);
    const custom=Shavari.initial();custom.board={'4,4':[{type:'L',owner:1},{type:'G',owner:1}], '4,6':[{type:'P',owner:2}]};
    assert.equal(Shavari.legalMoves(custom,{x:4,y:4}).length,4); // general on top: short range
    custom.board['4,4'].reverse(); // lance on top: long range, blocked by opponent
    const ray=Shavari.legalMoves(custom,{x:4,y:4});assert.ok(ray.some(m=>m.x===4&&m.y===6&&m.kind==='capture'));assert.ok(!ray.some(m=>m.x===4&&m.y===7));
});
test('friendly formations cap at three and top detachment preserves the base and piece order',()=>{
    const s=Shavari.initial();s.board={'4,4':[{type:'G',owner:1},{type:'L',owner:1}], '5,4':[{type:'P',owner:1},{type:'C',owner:1}], '0,0':[{type:'G',owner:2}]};
    assert.equal(Shavari.apply(s,move([4,4],[5,4])),null);
    const next=Shavari.apply(s,move([4,4],[5,4],'top'));assert.ok(next);
    assert.deepEqual(next.board['4,4'],[{type:'G',owner:1}]);assert.deepEqual(next.board['5,4'].map(p=>p.type),['P','C','L']);
    assert.equal(next.player,2);assert.equal(s.board['4,4'].length,2); // immutable input
});
test('capture removes the entire enemy formation and a buried general ends the game',()=>{
    const s=Shavari.initial();s.board={'0,4':[{type:'L',owner:1}],'4,4':[{type:'G',owner:2},{type:'P',owner:2}],'0,8':[{type:'G',owner:1}]};
    const next=Shavari.apply(s,move([0,4],[4,4]));assert.equal(next.result.winner,1);assert.deepEqual(next.history[0].captured,['G','P']);
    assert.equal(Shavari.apply(next,move([4,4],[5,4])),null);
});
test('malformed actions, wrong owners and non-orthogonal moves are rejected',()=>{
    const s=Shavari.initial();for(const action of [null,{},move([0.5,7],[0,6]),move([0,7],[9,7]),move([0,7],[1,6]),move([0,1],[0,2]),move([0,7],[0,6],'fake')])assert.equal(Shavari.apply(s,action),null);
    assert.equal(Shavari.replay([move([0,7],[0,6])],-1),null);
    assert.equal(Shavari.replay([move([0,7],[0,5])]),null);
});
test('replay reconstructs stacks and splitting; third repeated position is a draw',()=>{
    const actions=[move([0,8],[0,7]),move([0,1],[0,2]),move([0,7],[1,7],'top')];
    const s=Shavari.replay(actions);assert.equal(s.ply,3);assert.equal(s.board['0,7'][0].type,'P');assert.equal(s.board['1,7'][0].type,'L');
    assert.equal(Shavari.replay(actions,1).board['0,7'].length,2);
    const cycle=[move([0,7],[0,6]),move([0,1],[0,2]),move([0,6],[0,7]),move([0,2],[0,1])];
    assert.deepEqual(Shavari.replay([...cycle,...cycle]).result,{winner:0,reason:'Threefold repetition'});
});
test('500 randomized legal plies preserve piece ownership, height and general termination',()=>{
    let s=Shavari.initial(),seed=12;
    for(let i=0;i<500;i++){
        if(s.result)s=Shavari.initial();const choices=[];
        for(const k of Object.keys(s.board)){const [x,y]=k.split(',').map(Number);for(const mode of ['all','top'])for(const to of Shavari.legalMoves(s,{x,y},mode))choices.push({from:{x,y},to,mode});}
        if(!choices.length)break;seed=(seed*1664525+1013904223)>>>0;s=Shavari.apply(s,choices[seed%choices.length]);assert.ok(s);
        for(const stack of Object.values(s.board)){assert.ok(stack.length>=1&&stack.length<=3);assert.ok(stack.every(p=>p.owner===stack[0].owner));}
        const generals=Object.values(s.board).flat().filter(p=>p.type==='G');assert.equal(generals.length,s.result?.winner?1:2);
    }
});
test('online Shavari validates turns, protects seats, restores state and permits only seated resignation',async t=>{
    const {server,io}=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const clients=[];
    t.after(async()=>{clients.forEach(c=>c.disconnect());await new Promise(r=>io.close(r));});
    async function client(){const c=connect(`http://127.0.0.1:${server.address().port}`,{transports:['websocket'],forceNew:true});clients.push(c);await once(c,'connect');return c;}
    const a=await client(),b=await client(),outsider=await client();const created=once(a,'gameCreated'),seatA=once(a,'seatAssigned');
    a.emit('createGame',{gameType:'shavari'});const {gameId}=await created,ta=await seatA;
    const startA=once(a,'gameStart'),startB=once(b,'gameStart'),seatB=once(b,'seatAssigned');b.emit('joinGame',gameId);await Promise.all([startA,startB,seatB]);
    let sync=once(a,'shavariState');a.emit('joinShavariRoom',{gameId,token:ta.token});assert.equal((await sync).state.ply,0);
    let error=once(outsider,'errorMsg');outsider.emit('shavariAction',{gameId,action:move([0,7],[0,6])});await error;
    error=once(b,'errorMsg');b.emit('shavariAction',{gameId,action:move([0,7],[0,6])});await error;
    error=once(a,'errorMsg');a.emit('shavariAction',{gameId,action:move([0,7],[0,5])});await error;
    sync=once(a,'shavariState');const syncB=once(b,'shavariState');a.emit('shavariAction',{gameId,action:move([0,8],[0,7])});const [sa,sb]=await Promise.all([sync,syncB]);assert.equal(sa.state.ply,1);assert.deepEqual(sa.state,sb.state);assert.equal(sb.playerIndex,1);
    const replacement=await client();sync=once(replacement,'shavariState');replacement.emit('joinShavariRoom',{gameId,token:ta.token});assert.equal((await sync).state.board['0,7'].length,2);
    error=once(a,'errorMsg');a.emit('shavariResign',{gameId});await error;
    error=once(outsider,'errorMsg');outsider.emit('joinShavariRoom',{gameId,token:'wrong'});await error;
    sync=once(replacement,'shavariState');replacement.emit('shavariResign',{gameId});assert.deepEqual((await sync).state.result,{winner:2,reason:'Resignation'});
});
