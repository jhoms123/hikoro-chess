'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(search='?gameId=game_0123456789abcdef'){
 const values=new Map([
  ['hikoro-room-return','game_0123456789abcdef'],
  ['hikoro-room-type','shodansho'],
  ['hikoro-seat-game_0123456789abcdef','private-seat-token'],
  ['hikoro-dashboard-room','{"id":"game_0123456789abcdef","type":"shodansho"}']
 ]),listeners={};
 const store={getItem:key=>values.get(key)??null,removeItem:key=>values.delete(key)};
 const context={window:{},document:{addEventListener:(type,fn)=>{listeners[type]=fn;}},URLSearchParams,URL,location:{pathname:'/shodansho.html',search,href:'https://example.test/shodansho.html'+search,origin:'https://example.test'},sessionStorage:store};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/table-companion.js'),'utf8'),context);
 return {context,values,listeners};
}

test('leaving an online Sho Dan Sho match clears only its automatic lobby return target',()=>{
 const {context,values}=setup();
 context.window.leaveSdsGame();
 assert.equal(context.location.href,'/');
 assert.equal(values.has('hikoro-room-return'),false);
 assert.equal(values.has('hikoro-room-type'),false);
 assert.equal(values.get('hikoro-seat-game_0123456789abcdef'),'private-seat-token');
 assert.equal(values.has('hikoro-dashboard-room'),true);
});

test('following the game header home link also stops automatic re-entry',()=>{
 const {listeners,values}=setup();
 listeners.click({target:{closest:()=>({href:'https://example.test/'})}});
 assert.equal(values.has('hikoro-room-return'),false);
 assert.equal(values.has('hikoro-seat-game_0123456789abcdef'),true);
});

test('a different game seat is left intact when this match is exited',()=>{
 const {context,values}=setup('?gameId=game_fedcba9876543210');
 context.window.leaveSdsGame();
 assert.equal(values.get('hikoro-room-return'),'game_0123456789abcdef');
 assert.equal(values.get('hikoro-room-type'),'shodansho');
});
