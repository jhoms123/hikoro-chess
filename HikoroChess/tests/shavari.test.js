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
test('Shavari combines carried ranges, preserves initial armies and applies height blocking',()=>{
    const s=Shavari.initial();assert.equal(Object.values(s.board).flat().length,20);
    assert.deepEqual(Shavari.legalMoves(s,{x:0,y:8}).map(m=>[m.x,m.y,m.kind]),[[2,6,'move']]);
    assert.equal(Shavari.legalMoves(s,{x:0,y:0}).length,0);
    const custom=Shavari.initial();custom.board={'4,4':[{type:'C',owner:1},{type:'G',owner:1}], '4,6':[{type:'P',owner:2}]};
    assert.ok(Shavari.legalMoves(custom,{x:4,y:4}).length>4); // buried cannon contributes its range
    assert.equal(Shavari.legalMoves(custom,{x:4,y:4},'top').length,6);
    custom.board['4,4'].reverse(); // cannon on top: long range, blocked by opponent
    const ray=Shavari.legalMoves(custom,{x:4,y:4});assert.ok(ray.some(m=>m.x===4&&m.y===6&&m.kind==='capture'));assert.ok(ray.some(m=>m.x===4&&m.y===7));
});
test('friendly formations cap at three and top detachment preserves the base and piece order',()=>{
    const s=Shavari.initial();s.board={'4,4':[{type:'G',owner:1},{type:'C',owner:1}], '5,4':[{type:'P',owner:1},{type:'C',owner:1}], '0,0':[{type:'G',owner:2}]};
    assert.equal(Shavari.apply(s,move([4,4],[5,4])),null);
    const next=Shavari.apply(s,move([4,4],[5,4],'top'));assert.ok(next);
    assert.deepEqual(next.board['4,4'],[{type:'G',owner:1}]);assert.deepEqual(next.board['5,4'].map(p=>p.type),['P','C','C']);
    assert.equal(next.player,2);assert.equal(s.board['4,4'].length,2); // immutable input
});
test('capture removes the entire enemy formation and a buried general ends the game',()=>{
    const s=Shavari.initial();s.board={'0,4':[{type:'C',owner:1}],'4,4':[{type:'G',owner:2},{type:'P',owner:2}],'0,8':[{type:'G',owner:1}]};
    const next=Shavari.apply(s,move([0,4],[4,4]));assert.equal(next.result.winner,1);assert.deepEqual(next.history[0].captured,['G','P']);
    assert.equal(Shavari.apply(next,move([4,4],[5,4])),null);
});
test('malformed actions, wrong owners and non-orthogonal moves are rejected',()=>{
    const s=Shavari.initial();for(const action of [null,{},move([0.5,7],[0,6]),move([0,7],[9,7]),move([0,7],[1,6]),move([0,1],[0,2]),move([0,7],[0,6],'fake')])assert.equal(Shavari.apply(s,action),null);
    assert.equal(Shavari.replay([move([0,7],[0,6])],-1),null);
    assert.equal(Shavari.replay([move([0,7],[0,5])]),null);
});
test('replay reconstructs stacks and splitting; third repeated position is a draw',()=>{
    const actions=[move([2,8],[2,7]),move([0,1],[0,2]),move([2,7],[3,7],'top')];
    const s=Shavari.replay(actions);assert.equal(s.ply,3);assert.equal(s.board['2,7'][0].type,'P');assert.equal(s.board['3,7'][0].type,'C');
    assert.equal(Shavari.replay(actions,1).board['2,7'].length,2);
    const cycle=[move([0,7],[0,6]),move([0,1],[0,2]),move([0,6],[0,7]),move([0,2],[0,1])];
    assert.deepEqual(Shavari.replay([...cycle,...cycle]).result,{winner:0,reason:'Threefold repetition'});
});
test('500 randomized legal plies preserve piece ownership, height and general termination',()=>{
    let s=Shavari.initial(),seed=12;
    for(let i=0;i<500;i++){
        if(s.result)s=Shavari.initial();const choices=[];
        for(const k of Object.keys(s.board)){const [x,y]=k.split(',').map(Number);for(const mode of ['all','top'])for(const to of Shavari.legalMoves(s,{x,y},mode))choices.push({from:{x,y},to,mode,kind:to.kind});}
        if(!choices.length)break;seed=(seed*1664525+1013904223)>>>0;s=Shavari.apply(s,choices[seed%choices.length]);assert.ok(s);
        for(const stack of Object.values(s.board)){assert.ok(stack.length>=1&&stack.length<=3);assert.ok(stack.every(p=>[1,2].includes(p.owner)));}
        const generals=Object.values(s.board).flat().filter(p=>p.type==='G');assert.ok(generals.length<=2);if(!s.result)assert.equal(generals.length,2);
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
    sync=once(a,'shavariState');const syncB=once(b,'shavariState');a.emit('shavariAction',{gameId,action:move([2,8],[2,7])});const [sa,sb]=await Promise.all([sync,syncB]);assert.equal(sa.state.ply,1);assert.deepEqual(sa.state,sb.state);assert.equal(sb.playerIndex,1);
    const replacement=await client();sync=once(replacement,'shavariState');replacement.emit('joinShavariRoom',{gameId,token:ta.token});assert.equal((await sync).state.board['2,7'].length,2);
    error=once(a,'errorMsg');a.emit('shavariResign',{gameId});await error;
    error=once(outsider,'errorMsg');outsider.emit('joinShavariRoom',{gameId,token:'wrong'});await error;
    sync=once(replacement,'shavariState');replacement.emit('shavariResign',{gameId});assert.deepEqual((await sync).state.result,{winner:2,reason:'Resignation'});
});

test('a taller moving formation jumps shorter blockers; equal, larger and detached heights block',()=>{
    const s=Shavari.initial();s.board={'0,4':[{type:'C',owner:1},{type:'P',owner:1}], '2,4':[{type:'P',owner:2}], '4,4':[{type:'P',owner:2},{type:'P',owner:2}]};
    const all=Shavari.legalMoves(s,{x:0,y:4});assert.ok(all.some(m=>m.x===3&&m.y===4));assert.ok(!all.some(m=>m.x===5&&m.y===4));
    const top=Shavari.legalMoves(s,{x:0,y:4},'top');assert.ok(!top.some(m=>m.x===3&&m.y===4));
    assert.equal(Shavari.apply(s,{...move([0,4],[4,4]),kind:'cover'}),null);
});
test('cover retains enemy movement and ownership; detaching the top restores enemy control',()=>{
    const s=Shavari.initial();s.board={'2,4':[{type:'G',owner:1},{type:'P',owner:1}], '3,4':[{type:'C',owner:2}], '8,0':[{type:'G',owner:2}]};
    const covered=Shavari.apply(s,{...move([2,4],[3,4]),kind:'cover'});assert.ok(covered);assert.deepEqual(covered.board['3,4'].map(p=>p.owner),[2,1,1]);assert.equal(covered.result,null);
    assert.equal(Shavari.legalMoves(covered,{x:3,y:4}).length,0);covered.player=1;
    assert.ok(Shavari.legalMoves(covered,{x:3,y:4}).some(m=>m.x===8&&m.y===4));
    const split=Shavari.apply(covered,{...move([3,4],[4,4],'pair'),kind:'move'});assert.equal(split.board['3,4'].at(-1).owner,2);assert.ok(Shavari.legalMoves(split,{x:3,y:4}).length);
});
test('top-two split can cover one enemy while retaining a base; cap and explicit choices are enforced',()=>{
    const s=Shavari.initial();s.board={'0,4':[{type:'G',owner:1},{type:'C',owner:1},{type:'P',owner:1}], '3,4':[{type:'P',owner:2}], '8,0':[{type:'G',owner:2}]};
    assert.equal(Shavari.apply(s,{...move([0,4],[3,4]),kind:'cover'}),null);
    const next=Shavari.apply(s,{...move([0,4],[3,4],'pair'),kind:'cover'});assert.ok(next);assert.equal(next.board['0,4'][0].type,'G');assert.equal(next.board['3,4'].length,3);
    const capture=Shavari.apply(s,{...move([0,4],[3,4],'pair'),kind:'capture'});assert.equal(capture.board['3,4'].length,2);assert.deepEqual(capture.lastMove.captured,['P']);
    s.board['0,4']=[{type:'C',owner:1}];assert.equal(Shavari.apply(s,{...move([0,4],[3,4]),kind:'cover'}),null);
});
test('covering generals does not win; capturing your own buried general loses and both generals draws',()=>{
    const s=Shavari.initial();s.board={'0,4':[{type:'C',owner:1},{type:'P',owner:1}], '3,4':[{type:'G',owner:2}], '0,8':[{type:'G',owner:1}], '8,0':[{type:'P',owner:2}]};
    assert.equal(Shavari.apply(s,{...move([0,4],[3,4]),kind:'cover'}).result,null);
    s.board['3,4']=[{type:'G',owner:1},{type:'P',owner:2}];assert.equal(Shavari.apply(s,{...move([0,4],[3,4]),kind:'capture'}).result.winner,2);
    s.board['3,4']=[{type:'G',owner:1},{type:'G',owner:2},{type:'P',owner:2}];assert.deepEqual(Shavari.apply(s,{...move([0,4],[3,4]),kind:'capture'}).result,{winner:0,reason:'Both generals captured'});
});

test('camel moves exactly two diagonally, with elevation blocking at the intermediate intersection',()=>{
    const s=Shavari.initial();s.board={'4,4':[{type:'L',owner:1}]};
    const coords=Shavari.legalMoves(s,{x:4,y:4}).map(m=>[m.x,m.y]).sort();
    assert.deepEqual(coords,[[2,2],[2,6],[6,2],[6,6]]);
    for(const to of [[4,2],[5,5],[7,7]])assert.equal(Shavari.apply(s,move([4,4],to)),null);
    s.board['5,5']=[{type:'P',owner:2}];assert.ok(!Shavari.legalMoves(s,{x:4,y:4}).some(m=>m.x===6&&m.y===6));
    s.board['4,4'].push({type:'P',owner:1});assert.ok(Shavari.legalMoves(s,{x:4,y:4}).some(m=>m.x===6&&m.y===6));
    s.board['5,5'].push({type:'P',owner:2});assert.ok(!Shavari.legalMoves(s,{x:4,y:4}).some(m=>m.x===6&&m.y===6));
    delete s.board['5,5'];s.board['6,6']=[{type:'P',owner:2}];assert.ok(Shavari.legalMoves(s,{x:4,y:4}).some(m=>m.x===6&&m.y===6&&m.kind==='cover'));
    assert.ok(!Shavari.legalMoves(s,{x:4,y:4},'top').some(m=>m.x===6&&m.y===6));
});
test('lotus excludes its original court forward diagonals and combines with buried enemy camel moves',()=>{
    for(const owner of [1,2]){
        const s=Shavari.initial();s.player=owner;s.board={'4,4':[{type:'G',owner}]};
        const legal=Shavari.legalMoves(s,{x:4,y:4}),forward=owner===1?-1:1;
        assert.equal(legal.length,6);for(const dx of [-1,1]){
            assert.ok(!legal.some(m=>m.x===4+dx&&m.y===4+forward));
            assert.ok(legal.some(m=>m.x===4+dx&&m.y===4-forward));
        }
    }
    const s=Shavari.initial();s.board={'4,4':[{type:'G',owner:2},{type:'L',owner:2},{type:'P',owner:1}]};
    const all=Shavari.legalMoves(s,{x:4,y:4});assert.equal(all.length,10);assert.ok(all.some(m=>m.x===3&&m.y===3));assert.ok(!all.some(m=>m.x===3&&m.y===5));
    const pair=Shavari.legalMoves(s,{x:4,y:4},'pair');assert.equal(pair.length,8);
    assert.equal(Shavari.legalMoves(s,{x:4,y:4},'top').length,4);
    assert.equal(new Set(all.map(m=>`${m.x},${m.y},${m.kind}`)).size,all.length);
});
