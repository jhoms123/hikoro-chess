const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server');
const { remainingTime, commitClock } = require('../clock');
const { createSdsValidator, applySdsAction } = require('../sds-validator');
const logic = require('../gamelogic');
const once = (socket, name) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, done); reject(new Error('Timed out: ' + name)); }, 4000);
    const done = value => { clearTimeout(timer); resolve(value); };
    socket.once(name, done);
});
async function setup(t) {
    const { server, io } = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const sockets = [];
    t.after(async () => { sockets.forEach(s => s.disconnect()); await new Promise(resolve => io.close(resolve)); });
    const client = async () => { const s = connect(`http://127.0.0.1:${server.address().port}`, { transports:['websocket'], forceNew:true }); sockets.push(s); await once(s, 'connect'); return s; };
    return { client };
}
async function room(a, b, gameType = 'hikoro') {
    const seatA = once(a, 'seatAssigned'), created = once(a, 'gameCreated');
    a.emit('createGame', { gameType, timeControl:{ main:-1, byoyomiTime:0 }, sdsPlayerCount:2 });
    const ca = await created, ta = await seatA;
    const startA = once(a, 'gameStart'), startB = once(b, 'gameStart'), seatB = once(b, 'seatAssigned');
    b.emit('joinGame', ca.gameId);
    const [stateA, stateB, tb] = await Promise.all([startA, startB, seatB]);
    return { id:ca.gameId, ta, tb, stateA, stateB };
}
test('main clock charges the active player and bonus actions share one byoyomi period', () => {
    const g = { isWhiteTurn:true, whiteTimeLeft:10, blackTimeLeft:10, lastMoveTimestamp:1000, timeControl:{main:10,byoyomiTime:5} };
    commitClock(g, 4000, false); assert.equal(g.whiteTimeLeft,10); assert.equal(g.lastMoveTimestamp,1000);
    commitClock(g,6000,true); assert.equal(g.whiteTimeLeft,5); assert.equal(g.blackTimeLeft,10); assert.equal(g.lastMoveTimestamp,6000);
    g.whiteTimeLeft=0; assert.equal(remainingTime(g,10999).expired,false); assert.equal(remainingTime(g,11000).expired,true);
});
test('malformed Hikoro coordinates return errors instead of throwing; bonus drop is rejected', () => {
    const g = { boardState:logic.getInitialBoard(),bonusMoveInfo:{pieceX:0,pieceY:0} };
    for (const coord of [{x:0.5,y:0},{x:'0',y:0},{x:0,y:null}]) {
        assert.deepEqual(logic.getValidMoves(g,{square:coord}),[]);
        assert.equal(logic.makeMove(g,{type:'board',from:coord,to:{x:0,y:1}},'white').success,false);
    }
    assert.equal(logic.makeMove(g,{type:'drop',piece:{type:'pawn'},to:{x:4,y:4}},'white').success,false);
});
test('shared SDS validator rejects forged actions and generates canonical capture targets', () => {
    const e=createSdsValidator(2);
    assert.equal(applySdsAction(e,{type:'applyMove',move:{pieceId:999,dst:'fake'}}),null);
    assert.equal(applySdsAction(e,{type:'dropSelectedHand',kind:'__proto__',key:'fake'}),null);
    const key=e.generateDropMoves('sun')[0].dst;
    assert.ok(applySdsAction(e,{type:'dropSelectedHand',kind:'sun',key}));
    assert.equal(e.currentPlayer,1); assert.equal(e.players[0].hand.sun,2);
    assert.equal(applySdsAction(e,{type:'pickupSelectedSun',pieceId:1}),null);
    assert.equal(applySdsAction(e,{type:'dropSelectedHand',kind:'star',key}),null);
    const nextKey=e.generateDropMoves('star')[0].dst;
    assert.ok(applySdsAction(e,{type:'dropSelectedHand',kind:'star',key:nextKey}));
    const canonical=applySdsAction(e,{type:'applyMove',move:{pieceId:1,dst:key,captureId:999999,path:['forged']}});
    assert.ok(canonical);assert.equal(canonical.move.captureId,null);assert.deepEqual(canonical.move.path,[]);
});
test('outsiders cannot resign, delete rooms, or masquerade as the black player', async t => {
    const {client}=await setup(t); const a=await client(), b=await client(), stranger=await client();
    const r=await room(a,b);
    for (const [event,data] of [['makeGameMove',{gameId:r.id,move:{type:'resign'}}],['leaveGame',r.id],['makeGameMove',{gameId:r.id,move:{type:'board',from:{x:4,y:14},to:{x:4,y:13}}}]]) {
        const rejected=once(stranger,'errorMsg'); stranger.emit(event,data); assert.match(await rejected,/seat/);
    }
    const update=once(a,'gameStateUpdate'); b.emit('makeGameMove',{gameId:r.id,move:{type:'resign'}});
    assert.equal((await update).winner,'white');
});
test('SDS seat survives redirect, replays accepted actions and rejects wrong-seat actions', async t => {
    const {client}=await setup(t); const a=await client(),b=await client(),stranger=await client(); const r=await room(a,b,'shodansho');
    const reject=once(stranger,'errorMsg');stranger.emit('joinSdsRoom',{gameId:r.id,token:'fake'});assert.match(await reject,/restored/);
    a.disconnect();const redirected=await client();const sync=once(redirected,'sdsSync');redirected.emit('joinSdsRoom',{gameId:r.id,token:r.ta.token});
    assert.equal((await sync).playerIndex,0);
    const engine=createSdsValidator(2);const key=engine.generateDropMoves('sun')[0].dst;
    const wrong=once(b,'errorMsg');b.emit('sdsAction',{gameId:r.id,action:{type:'dropSelectedHand',kind:'sun',key}});assert.match(await wrong,/turn/);
    const applied=once(redirected,'sdsAction');redirected.emit('sdsAction',{gameId:r.id,action:{type:'dropSelectedHand',kind:'sun',key}});assert.equal((await applied).type,'dropSelectedHand');
    const restored=await client(), again=once(restored,'sdsSync');restored.emit('joinSdsRoom',{gameId:r.id,token:r.ta.token});assert.equal((await again).actions.length,1);
    const old=once(redirected,'errorMsg');redirected.emit('leaveGame',r.id);assert.match(await old,/seat/);
});
test('Hikoro authenticated reconnect restores the game; malformed events stay contained', async t => {
    const {client}=await setup(t);const a=await client(),b=await client();const r=await room(a,b);a.disconnect();const restored=await client();
    const state=once(restored,'gameStart');restored.emit('resumeGame',{gameId:r.id,token:r.ta.token});assert.equal((await state).players.white,restored.id);
    const invalid=once(restored,'errorMsg');restored.emit('makeGameMove',null);assert.match(await invalid,/seat/);
    const finished=once(restored,'gameStateUpdate');restored.emit('makeGameMove',{gameId:r.id,move:{type:'resign'}});assert.equal((await finished).winner,'black');
});
test('accepted Hikoro moves deduct white time; rejected moves do not reset the clock', async t => {
    const {client}=await setup(t);const a=await client(),b=await client();
    const created=once(a,'gameCreated');a.emit('createGame',{gameType:'hikoro',timeControl:{main:300,byoyomiTime:0}});const id=(await created).gameId;
    const started=once(a,'gameStart');b.emit('joinGame',id);const initial=await started;
    let move;
    for(let y=0;y<16&&!move;y++)for(let x=0;x<10&&!move;x++)if(initial.boardState[y][x]?.color==='white'){
        const moves=logic.getValidMoves(initial,{square:{x,y}});if(moves.length)move={type:'board',from:{x,y},to:moves[0]};
    }
    assert.ok(move);await new Promise(resolve=>setTimeout(resolve,25));
    const invalid=once(a,'errorMsg');a.emit('makeGameMove',{gameId:id,move:{type:'board',from:{x:.5,y:0},to:{x:0,y:1}}});assert.match(await invalid,/coordinates/);
    const updated=once(a,'gameStateUpdate');a.emit('makeGameMove',{gameId:id,move});const next=await updated;
    assert.ok(next.whiteTimeLeft<300);assert.equal(next.blackTimeLeft,300);
});
