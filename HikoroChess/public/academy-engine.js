/* 8×8 teaching adapter. Movement comes directly from the full Hikoro engine. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../gamelogic'));else root.HikoroAcademy=factory(root.gameLogic);})(typeof globalThis!=='undefined'?globalThis:this,function(full){
'use strict';
const SIZE=8;
const TYPES=Object.freeze({
    lupa:{name:'King Kraken',notation:'K',description:'One square in any direction. This board has no Prince, so the King is free to roam.',lesson:'Learn the leader’s eight adjacent steps. A friendly piece blocks a landing square.'},
    pawn:{name:'Fish',notation:'F',description:'One square orthogonally or exactly two squares diagonally. The diagonal leap can jump over intervening pieces.',lesson:'This is not a normal chess pawn: it moves and captures in the same eight directions, with no forward restriction.'},
    yoli:{name:'Big Eye Squid',notation:'B',description:'A 2 + 1 knight jump, plus one square orthogonally. All leaps jump over intervening pieces.',lesson:'Compare the eight L-shaped leaps with the four short orthogonal steps.'},
    fin:{name:'One Pincer Crab',notation:'Oc',description:'Slide diagonally. A one-square horizontal step is allowed only into an empty square.',lesson:'Green marks empty destinations; red marks captures. A horizontal enemy cannot be captured by this piece.'},
    chair:{name:'Dumbo Octopus',notation:'Du',description:'Slide any distance diagonally or vertically. No horizontal sliding.',lesson:'Trace a ray until the first occupied square. Friends block it; enemies may be captured, but you cannot move past them.'},
    kota:{name:'Hermit Crab',notation:'H',description:'Slide horizontally, or move one square in any direction.',lesson:'Combine long horizontal rays with short vertical and diagonal steps.'}
});
const point=p=>p&&Number.isInteger(p.r)&&Number.isInteger(p.c)&&p.r>=0&&p.r<SIZE&&p.c>=0&&p.c<SIZE;
const coord=p=>'ABCDEFGH'[p.c]+(SIZE-p.r);
const signature=s=>s.player+'|'+s.board.flat().map(p=>p?p.owner+':'+p.type:'-').join(',');
function initial(mode='match',lesson='pawn'){
    if(!['match','lesson'].includes(mode)||!TYPES[lesson])throw Error('Invalid teaching setup');
    const s={mode,lesson,board:Array.from({length:SIZE},()=>Array(SIZE).fill(null)),player:1,ply:0,history:[],lastMove:null,captured:{1:[],2:[]},result:null,positions:{}};
    if(mode==='match')for(const owner of [1,2]){
        const back=owner===1?7:0,front=owner===1?6:1;
        ['chair','yoli','fin','lupa','kota','fin','yoli','chair'].forEach((type,c)=>s.board[back][c]={type,owner});
        for(const c of [1,3,4,6])s.board[front][c]={type:'pawn',owner};
    }else{
        s.board[4][3]={type:lesson,owner:1};
        for(const [r,c]of [[2,1],[4,4],[6,5]])s.board[r][c]={type:'pawn',owner:2};
        s.board[3][3]={type:'pawn',owner:1};
    }
    s.positions[signature(s)]=1;return s;
}
function movesFor(board,from){
    if(!point(from)||!TYPES[board[from.r]?.[from.c]?.type])return[];
    // Embed the 8×8 square in the full board's uninterrupted center, away from cut-out corners.
    // All selected types are direction independent and have no bonus actions or shielding.
    const padded=Array.from({length:full.BOARD_HEIGHT},()=>Array(full.BOARD_WIDTH).fill(null));
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){const p=board[r][c];if(p)padded[r+4][c+1]={type:p.type,color:p.owner===1?'white':'black'};}
    const piece=padded[from.r+4][from.c+1],seen=new Set();
    return full.getValidMovesForPiece(piece,from.c+1,from.r+4,padded).map(m=>({r:m.y-4,c:m.x-1})).filter(m=>{const k=m.r+','+m.c;if(!point(m)||seen.has(k))return false;seen.add(k);return true;});
}
function legalMoves(s,from){if(!s||s.result||!point(from)||!s.board[from.r][from.c]||s.mode==='match'&&s.board[from.r][from.c].owner!==s.player)return[];return movesFor(s.board,from);}
function allMoves(s){if(!s||s.result)return[];const moves=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(s.board[r][c]&&(s.mode==='lesson'||s.board[r][c].owner===s.player))for(const to of legalMoves(s,{r,c}))moves.push({from:{r,c},to});return moves;}
function apply(s,a){
    if(!a||!point(a.from)||!point(a.to)||!legalMoves(s,a.from).some(m=>m.r===a.to.r&&m.c===a.to.c))return null;
    const n=JSON.parse(JSON.stringify(s)),from={r:a.from.r,c:a.from.c},to={r:a.to.r,c:a.to.c},p=n.board[from.r][from.c],target=n.board[to.r][to.c];
    const record={from,to,type:p.type,player:p.owner,captured:target?.type||null};
    if(target)n.captured[p.owner].push(target.type);
    n.board[to.r][to.c]=p;n.board[from.r][from.c]=null;n.player=n.mode==='match'?3-s.player:p.owner;n.ply++;n.history.push(record);n.lastMove=record;
    if(n.mode==='match'){
        if(target?.type==='lupa')n.result={winner:p.owner,reason:'King Kraken captured'};
        const sig=signature(n);n.positions[sig]=(n.positions[sig]||0)+1;
        if(!n.result&&n.positions[sig]>=3)n.result={winner:0,reason:'Threefold repetition'};
        if(!n.result&&!allMoves(n).length)n.result={winner:0,reason:'No legal moves'};
        if(!n.result&&n.ply>=1000)n.result={winner:0,reason:'Move limit reached'};
    }
    return n;
}
function replay(actions,cursor=actions?.length,mode='match',lesson='pawn'){
    if(!Array.isArray(actions)||actions.length>1000||!Number.isInteger(cursor)||cursor<0||cursor>actions.length)return null;
    let s;try{s=initial(mode,lesson);}catch{return null;}for(const a of actions.slice(0,cursor)){s=apply(s,a);if(!s)return null;}return s;
}
return{SIZE,TYPES,initial,movesFor,legalMoves,allMoves,apply,replay,coord};
});
