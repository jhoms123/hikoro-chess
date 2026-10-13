(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory({hikoro:require('../gamelogic'),academy:require('./academy-engine'),go:require('./go-engine'),bastion:require('./bastion-engine'),'shavari-go':require('./shavari-go-engine'),shavari:require('./shavari-engine'),hikoruka:require('./hikoruka-engine'),sds:require('../sds-validator')});else root.MatchRecord=factory({hikoro:root.gameLogic,academy:root.HikoroAcademy,go:root.GoVariant,bastion:root.BastionMarches,'shavari-go':root.ShavariGo,shavari:root.Shavari,hikoruka:root.Hikoruka,sds:typeof Game==='undefined'?null:{createSdsValidator:n=>new Game(new BoardData(),n)}});})(typeof globalThis!=='undefined'?globalThis:this,engines=>{
 'use strict';
 const games=['hikoro','shodansho','shavari','hikoruka','go','bastion','shavari-go','academy'];
 function initialHikoro(){return {boardState:engines.hikoro.getInitialBoard(),isWhiteTurn:true,turnCount:0,moveList:[],whiteCaptured:[],blackCaptured:[],whitePrinceOnBoard:true,blackPrinceOnBoard:true,gameOver:false};}
 function sdsAction(s,a){if(engines.sds.applySdsAction)return engines.sds.applySdsAction(s,a);if(s.phase==='game_over')return null;
  if(a.type==='applyMove'){const p=s.pieces.get(a.move?.pieceId);const move=p?.owner===s.currentPlayer&&s.generateMoves(p).find(m=>m.dst===a.move.dst);if(!move)return null;s.applyMove(move,true);return true;}
  if(a.type==='dropSelectedHand'){if(!s.board.vertices.has(a.key)||!Object.hasOwn(s.players[s.currentPlayer].hand,a.kind)||s.players[s.currentPlayer].hand[a.kind]<=0||s.occupied().has(a.key)||!s.canDrop(a.kind,a.key)[0])return null;s.dropSelectedHand(a.key,a.kind,true);return true;}
  if(a.type==='pickupSelectedSun'){const p=s.pieces.get(a.pieceId);if(!p||p.kind!=='sun'||!p.pos||p.owner!==s.currentPlayer)return null;s.pickupSelectedSun(a.pieceId,true);return true;}return null;
 }
 function replay(record,cursor=record?.actions?.length){
  if(record?.format!=='hikoro-record'||record.version!==1||record.rules!=='2026-10-08'||!games.includes(record.game)||!Array.isArray(record.actions)||record.actions.length>10000||!Number.isInteger(cursor)||cursor<0||cursor>record.actions.length)throw Error('Unsupported or malformed replay record.');
  const setup=record.setup||{};let s;
  if(record.game==='hikoro')s=initialHikoro();
  else if(record.game==='shodansho'){if(![2,3,4].includes(setup.playerCount)||!engines.sds)throw Error('Invalid garden setup.');s=engines.sds.createSdsValidator(setup.playerCount);}
  else if(record.game==='go')s=engines.go.initial(setup.size);
  else if(record.game==='bastion'){if(![13,19].includes(setup.size))throw Error('Invalid Bastion setup.');s=engines.bastion.initial(setup.size);}
  else if(record.game==='shavari-go'){if(setup.size!==13)throw Error('Invalid Shavari Go setup.');s=engines['shavari-go'].initial(13);}
  else if(record.game==='academy'){if(!['match','lesson'].includes(setup.mode)||!engines.academy.TYPES[setup.lesson])throw Error('Invalid Academy setup.');s=engines.academy.initial(setup.mode,setup.lesson);}
  else s=engines[record.game].initial();
  for(const action of record.actions.slice(0,cursor)){
   if(!action||typeof action!=='object')throw Error('Invalid action.');
   if(record.game==='hikoro'){if(s.gameOver)throw Error('Action after game end.');const next=engines.hikoro.makeMove(s,action,s.isWhiteTurn?'white':'black');if(!next.success)throw Error('Illegal Hikoro action.');s=next.updatedGame;}
   else if(record.game==='shodansho'){if(!sdsAction(s,action))throw Error('Illegal garden action.');}
   else {s=engines[record.game].apply(s,action);if(!s)throw Error('Illegal action in record.');}
  }
  return s;
 }
 function create(game,payload={},result=null,meta={}){const record={format:'hikoro-record',version:1,rules:'2026-10-08',game,setup:game==='go'||game==='bastion'||game==='shavari-go'?{size:game==='shavari-go'?13:payload.size||(game==='bastion'?19:9)}:game==='academy'?{mode:payload.mode||'match',lesson:payload.lesson||'pawn'}:game==='shodansho'?{playerCount:payload.playerCount||2}:{},actions:JSON.parse(JSON.stringify((payload.journal||[]).slice(0,payload.cursor??payload.journal?.length))),result:result?{winner:result.winner,reason:String(result.reason||'').slice(0,160)}:null,createdAt:new Date().toISOString(),players:Array.isArray(meta.players)?meta.players.map(p=>String(p).slice(0,30)):[],id:String(meta.id||'').slice(0,80)};replay(record);return record;}
 function parse(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>2000000)throw Error('Record exceeds the 2 MB limit.');const r=JSON.parse(text);replay(r);return r;}
 function describe(game,a,index,setup={}){const c=p=>p?(game==='go'?engines.go.coord({size:setup.size||9},p):game==='shavari'?engines.shavari.coord(p):game==='shavari-go'?engines['shavari-go'].coord({size:setup.size||13},p):['academy','hikoruka'].includes(game)?engines[game].coord(p):Object.hasOwn(p,'r')?String.fromCharCode(65+p.c)+(p.r+1):Object.hasOwn(p,'x')?`${game==='bastion'?'ABCDEFGHJKLMNOPQRSTUVWXYZ'[p.x]:String.fromCharCode(65+p.x)}${p.y+1}`:String(p)):'';return (index+1)+'. '+(a.type==='resign'?'Resign':a.type==='pass'?'Pass':a.type==='settle'?'Call settlement':a.type==='accept-settle'?'Accept settlement':a.type==='deploy'?`Raise ${a.rank} at ${c(a.to)}`:a.type==='embark'?`Embark Levy at ${c(a.from)}`:a.type==='disembark'?`Disembark ${a.drops?.length||0} Levy`:a.type==='dropSelectedHand'?`Drop ${a.kind} at ${a.key}`:a.type==='pickupSelectedSun'?`Pick up Sun #${a.pieceId}`:a.type==='applyMove'?`Flower #${a.move.pieceId} → ${a.move.dst}`:a.type==='drop'?`Drop ${a.pieceType||a.piece?.type||''} ${c(a.to)}`:a.type==='shield'?`Shield ${c(a.at)}`:a.type==='place'&&game==='shavari-go'?`Place ${{keep:'Crownhold',marshal:'High Marshal',warden:'Royal Guard',banneret:'Standard-Bearer',arbalist:'Crossbowman',sapper:'Sapper',cavalier:'Cavalier',sentry:'Sentry',levy:'Squire'}[a.rank]||'Squire'} at ${c(a.to)}`:a.type==='place'?`Place ${c(a.to)}`:`${['board','move'].includes(a.type)?'Move':a.type||'Move'} ${c(a.from)} → ${c(a.to)}${a.mode?' · '+({all:'Whole formation',top:'Top piece',pair:'Top pair'}[a.mode]||a.mode):''}`);}
 return {games,replay,create,parse,describe};
});
