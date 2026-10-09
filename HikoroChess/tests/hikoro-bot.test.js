const test=require('node:test');
const assert=require('node:assert/strict');
const {io:connect}=require('socket.io-client');
const {createServer}=require('../server');
const rules=require('../gamelogic');
const bot=require('../hikoro-bot');

function event(socket,name,timeout=5000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,on);reject(Error('Timed out: '+name));},timeout);function on(value){clearTimeout(timer);resolve(value);}socket.once(name,on);});}

test('uploaded Hikoro bot replies legally and keeps the black seat server owned',async t=>{
    const {server,io}=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const socket=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],forceNew:true});
    t.after(async()=>{socket.disconnect();await new Promise(resolve=>io.close(resolve));});
    await event(socket,'connect');
    const start=event(socket,'gameStart');socket.emit('createSinglePlayerGame',{gameType:'hikoro',hikoroBot:true});
    const game=await start;assert.equal(game.hikoroBot,true);assert.equal(game.playerProfiles[1].isBot,true);
    const whiteMove=bot.legalMoves(game).find(move=>move.type==='board');assert.ok(whiteMove);
    const white=event(socket,'gameStateUpdate');socket.emit('makeGameMove',{gameId:game.id,move:whiteMove});
    const afterWhite=await white;assert.equal(afterWhite.isWhiteTurn,false);
    const denied=event(socket,'errorMsg');socket.emit('makeGameMove',{gameId:game.id,move:{type:'resign'}});
    assert.match(await denied,/bot is thinking/i);
    const answer=event(socket,'gameStateUpdate');const afterBot=await answer;
    assert.equal(afterBot.actionJournal.length,2);
    assert.equal(afterBot.actionJournal[1].type,'board');
    assert.equal(afterBot.isWhiteTurn,true);
    assert.deepEqual(rules.makeMove(afterWhite,afterBot.actionJournal[1],'black').updatedGame.boardState,afterBot.boardState);
});

test('shared-screen Hikoro leaves the black seat to a second human',async t=>{
    const {server,io}=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const socket=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],forceNew:true});
    t.after(async()=>{socket.disconnect();await new Promise(resolve=>io.close(resolve));});
    await event(socket,'connect');const start=event(socket,'gameStart');socket.emit('createSinglePlayerGame',{gameType:'hikoro',hikoroBot:false});
    const game=await start;assert.equal(game.hikoroBot,undefined);
    const first=bot.legalMoves(game)[0],update=event(socket,'gameStateUpdate');socket.emit('makeGameMove',{gameId:game.id,move:first});
    const afterWhite=await update,second=bot.legalMoves(afterWhite)[0],other=event(socket,'gameStateUpdate');
    socket.emit('makeGameMove',{gameId:game.id,move:second});assert.equal((await other).actionJournal.length,2);
});
