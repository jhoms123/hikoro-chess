/* Hikorüka: the supplied 5x5 capture-the-commander rules, shared with the server. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Hikoruka=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const SIZE=5;
    const TYPES=Object.freeze({
        H:{name:'Hikoro commander',sprite:'lupa',value:10000,description:'One square in any direction. Capture the opposing commander to win.'},
        S:{name:'Striker',sprite:'jotu',value:500,description:'Slide any distance horizontally or vertically; stop at the first occupied square.'},
        I:{name:'Infiltrator',sprite:'chair',value:350,description:'Slide diagonally; stop at the first occupied square.'},
        N:{name:'Ninja',sprite:'cope',value:300,description:'Jump two squares along one axis and one along the other, over intervening pieces.'},
        V:{name:'Vanguard',sprite:'pawn',value:100,description:'Move one square forward into an empty square; capture one square diagonally forward. No double move or promotion.'}
    });
    const inBounds=(r,c)=>Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<SIZE&&c>=0&&c<SIZE;
    const point=p=>p&&inBounds(p.r,p.c);
    const coord=p=>`${'ABCDE'[p.c]}${5-p.r}`;
    const signature=s=>s.player+'|'+s.board.flat().map(p=>p?`${p.owner}${p.type}`:'-').join(',');
    function initial(){
        const s={board:Array.from({length:SIZE},()=>Array(SIZE).fill(null)),player:1,ply:0,result:null,lastMove:null,history:[],captured:{1:[],2:[]},positions:{}};
        for(const owner of [1,2]){const back=owner===1?4:0,front=owner===1?3:1;
            ['S','I','H','I','S'].forEach((type,c)=>s.board[back][c]={type,owner});
            s.board[front][1]={type:'V',owner};s.board[front][2]={type:'N',owner};s.board[front][3]={type:'V',owner};}
        s.positions[signature(s)]=1;return s;
    }
    function movesFor(board,from){
        if(!point(from))return[];const piece=board[from.r][from.c];if(!piece)return[];
        const {r,c}=from, moves=[],dir=piece.owner===1?-1:1;
        const add=(nr,nc)=>{if(inBounds(nr,nc)&&board[nr][nc]?.owner!==piece.owner)moves.push({r:nr,c:nc});};
        const ray=(dr,dc)=>{for(let nr=r+dr,nc=c+dc;inBounds(nr,nc);nr+=dr,nc+=dc){if(board[nr][nc]){add(nr,nc);break;}add(nr,nc);}};
        if(piece.type==='V'){if(inBounds(r+dir,c)&&!board[r+dir][c])add(r+dir,c);for(const dc of [-1,1])if(inBounds(r+dir,c+dc)&&board[r+dir][c+dc]&&board[r+dir][c+dc].owner!==piece.owner)add(r+dir,c+dc);}
        else if(piece.type==='H'){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);}
        else if(piece.type==='N'){for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);}
        else if(piece.type==='S')for(const [dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]])ray(dr,dc);
        else if(piece.type==='I')for(const [dr,dc]of[[1,1],[1,-1],[-1,1],[-1,-1]])ray(dr,dc);
        return moves;
    }
    function legalMoves(s,from){if(!s||s.result||!point(from)||s.board[from.r][from.c]?.owner!==s.player)return[];return movesFor(s.board,from);}
    function allMoves(s){if(!s||s.result)return[];const moves=[];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(s.board[r][c]?.owner===s.player)for(const to of movesFor(s.board,{r,c}))moves.push({from:{r,c},to});return moves;}
    function apply(s,action){
        if(!action||!point(action.from)||!point(action.to)||!legalMoves(s,action.from).some(m=>m.r===action.to.r&&m.c===action.to.c))return null;
        const next=JSON.parse(JSON.stringify(s)),from={r:action.from.r,c:action.from.c},to={r:action.to.r,c:action.to.c};
        const piece=next.board[from.r][from.c],target=next.board[to.r][to.c];
        const record={from,to,player:s.player,type:piece.type,captured:target?.type||null};
        if(target)next.captured[s.player].push(target.type);
        next.board[to.r][to.c]=piece;next.board[from.r][from.c]=null;next.player=3-s.player;next.ply++;next.lastMove=record;next.history.push(record);
        if(target?.type==='H')next.result={winner:s.player,reason:'Commander captured'};
        const sig=signature(next);next.positions[sig]=(next.positions[sig]||0)+1;
        if(!next.result&&next.positions[sig]>=3)next.result={winner:0,reason:'Threefold repetition'};
        if(!next.result&&!allMoves(next).length)next.result={winner:0,reason:'No legal moves'};
        if(!next.result&&next.ply>=1000)next.result={winner:0,reason:'Move limit reached'};
        return next;
    }
    function replay(journal,cursor=journal?.length){if(!Array.isArray(journal)||journal.length>1000||!Number.isInteger(cursor)||cursor<0||cursor>journal.length)return null;let s=initial();for(const m of journal.slice(0,cursor)){s=apply(s,m);if(!s)return null;}return s;}
    // Small deterministic two-ply bot: captures, position, and the opponent's best reply.
    function lightMove(s,m){const board=s.board.map(row=>row.slice());board[m.to.r][m.to.c]=board[m.from.r][m.from.c];board[m.from.r][m.from.c]=null;return{board,player:3-s.player,result:null};}
    function score(s,owner){let value=0;const commanders=new Set();for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){const p=s.board[r][c];if(!p)continue;if(p.type==='H')commanders.add(p.owner);const advance=p.owner===1?4-r:r;const positional=p.type==='V'?advance*8:(4-Math.abs(2-r)-Math.abs(2-c))*3;value+=(p.owner===owner?1:-1)*(TYPES[p.type].value+positional);}if(!commanders.has(owner))return-1000000;if(!commanders.has(3-owner))return 1000000;return value;}
    function botMove(s){const actions=allMoves(s);let best=null,bestScore=-Infinity;for(const m of actions){const child=lightMove(s,m);let value=score(child,s.player);if(value<1000000&&value>-1000000){const replies=allMoves(child);if(replies.length)value=Math.min(...replies.map(reply=>score(lightMove(child,reply),s.player)));else value=0;}if(value>bestScore){bestScore=value;best=m;}}return best;}
    return{SIZE,TYPES,initial,movesFor,legalMoves,allMoves,apply,replay,botMove,coord};
});
