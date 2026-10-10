/* Academy-only opponent for Hikoro's 8×8 teaching match. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory(require('../../public/academy-engine'));
    else root.HikoroAcademyBot=factory(root.HikoroAcademy);
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
'use strict';
if(!A)throw new Error('Hikoro Academy rules are required before the Academy bot.');
const VALUES=Object.freeze({pilut:105,pawn:150,yoli:320,fin:270,chair:350,kota:300,lupa:1450,prince:1550});
const ROYALS=new Set(['lupa','prince']);
const MATE=1000000;
const SANCTUARIES=Object.freeze([{r:3,c:0},{r:4,c:0},{r:3,c:7},{r:4,c:7}]);
const other=owner=>3-owner;
function distanceToSanctuary(r,c){
    let best=Infinity;
    for(const p of SANCTUARIES)best=Math.min(best,Math.abs(r-p.r)+Math.abs(c-p.c));
    return best;
}
function centerValue(r,c){return 7-(Math.abs(3.5-r)+Math.abs(3.5-c));}
function terminalScore(state,perspective,ply){
    if(!state.result)return null;
    if(!state.result.winner)return 0;
    return state.result.winner===perspective?MATE-ply:-MATE+ply;
}
function isThreatened(board,target,byOwner){
    for(let r=0;r<A.SIZE;r++)for(let c=0;c<A.SIZE;c++){
        const piece=board[r][c];
        if(!piece||piece.owner!==byOwner)continue;
        for(const move of A.movesFor(board,{r,c}))if(move.r===target.r&&move.c===target.c)return true;
    }
    return false;
}
function evaluate(state,perspective,ply=0){
    const finished=terminalScore(state,perspective,ply);
    if(finished!==null)return finished;
    let score=0;
    for(let r=0;r<A.SIZE;r++)for(let c=0;c<A.SIZE;c++){
        const piece=state.board[r][c];
        if(!piece)continue;
        const sign=piece.owner===perspective?1:-1;
        const base=VALUES[piece.type]||100;
        let positional=0;
        if(ROYALS.has(piece.type)){
            const distance=distanceToSanctuary(r,c);
            positional+=Math.max(-40,180-distance*27);
            if(piece.type==='prince'){
                positional+=(piece.owner===1?7-r:r)*9;
            }else if(A.hasPrince(state.board,piece.owner)){
                const palaceRow=piece.owner===1?6.5:0.5;
                positional+=25-Math.abs(c-3)*6-Math.abs(r-palaceRow)*5;
            }else{
                positional+=centerValue(r,c)*5;
            }
        }else{
            positional+=centerValue(r,c)*5;
            const advance=piece.owner===1?6-r:r-1;
            positional+=Math.max(0,Math.min(6,advance))*4;
        }
        score+=sign*(base+positional);
    }
    for(const owner of [1,2]){
        for(let r=0;r<A.SIZE;r++)for(let c=0;c<A.SIZE;c++){
            const piece=state.board[r][c];
            if(!piece||piece.owner!==owner||!ROYALS.has(piece.type))continue;
            if(isThreatened(state.board,{r,c},other(owner)))score+=(owner===perspective?-1:1)*360;
        }
    }
    return score;
}
function moveOrder(state,action){
    const moving=state.board[action.from.r][action.from.c];
    if(!moving)return -Infinity;
    const target=state.board[action.to.r][action.to.c];
    let score=0;
    if(target)score+=(ROYALS.has(target.type)?9000:VALUES[target.type]||100)*5-(VALUES[moving.type]||100)*0.08;
    if(ROYALS.has(moving.type)){
        const before=distanceToSanctuary(action.from.r,action.from.c);
        const after=distanceToSanctuary(action.to.r,action.to.c);
        score+=(before-after)*55;
        if(A.sanctuary(action.to))score+=MATE/2;
    }else{
        score+=(centerValue(action.to.r,action.to.c)-centerValue(action.from.r,action.from.c))*8;
        if(moving.type==='pilut'){
            const advance=moving.owner===1?action.from.r-action.to.r:action.to.r-action.from.r;
            score+=advance*16;
        }
    }
    return score;
}
function sortedLimitedMoves(state,limit){
    return A.allMoves(state).sort((a,b)=>moveOrder(state,b)-moveOrder(state,a)).slice(0,limit);
}
function chooseMove(state,options={}){
    if(!state||state.mode!=='match'||state.result)return null;
    const all=A.allMoves(state);
    if(!all.length)return null;
    const budget=Math.max(40,Math.min(2000,Number(options.budgetMs)||220));
    const maxDepth=Math.max(1,Math.min(5,Number(options.maxDepth)||3));
    const rootWidth=Math.max(8,Math.min(64,Number(options.rootWidth)||32));
    const replyWidth=Math.max(4,Math.min(28,Number(options.replyWidth)||12));
    const deadline=Date.now()+budget;
    const perspective=state.player;
    const roots=all.sort((a,b)=>moveOrder(state,b)-moveOrder(state,a)).slice(0,rootWidth);
    let best=roots[0],timedOut=false;
    function search(node,depth,alpha,beta,ply){
        const finished=terminalScore(node,perspective,ply);
        if(finished!==null)return finished;
        if(Date.now()>=deadline){timedOut=true;return evaluate(node,perspective,ply);}
        if(depth<=0)return evaluate(node,perspective,ply);
        const maximizing=node.player===perspective;
        const actions=sortedLimitedMoves(node,replyWidth);
        if(!actions.length)return 0;
        let value=maximizing?-Infinity:Infinity;
        for(const action of actions){
            if(Date.now()>=deadline){timedOut=true;break;}
            const next=A.apply(node,action);
            if(!next)continue;
            const result=search(next,depth-1,alpha,beta,ply+1);
            if(timedOut)break;
            if(maximizing){value=Math.max(value,result);alpha=Math.max(alpha,value);}
            else{value=Math.min(value,result);beta=Math.min(beta,value);}
            if(beta<=alpha)break;
        }
        return Number.isFinite(value)?value:evaluate(node,perspective,ply);
    }
    for(let depth=1;depth<=maxDepth;depth++){
        let iterationMove=null,iterationScore=-Infinity,alpha=-Infinity;
        for(const action of roots){
            if(Date.now()>=deadline){timedOut=true;break;}
            const next=A.apply(state,action);
            if(!next)continue;
            const score=search(next,depth-1,alpha,Infinity,1);
            if(timedOut)break;
            if(score>iterationScore){iterationScore=score;iterationMove=action;}
            alpha=Math.max(alpha,iterationScore);
        }
        if(timedOut||!iterationMove)break;
        best=iterationMove;
    }
    return best;
}
return{chooseMove,legalMoves:state=>A.allMoves(state),evaluate,moveOrder};
});