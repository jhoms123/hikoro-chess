/* Shield Go bot: variant-aware search built against GoVariant's shared rules engine.
 * Search design is independently implemented, drawing on score-aware MCTS research in KataGo.
 * No KataGo source or standard-Go model is bundled: the stock model is not trained for
 * Shield Go's jump captures or mandatory shield chains, and its move format lacks those actions.
 * Research references: github.com/lightvector/KataGo and its Analysis_Engine.md / KataGoMethods.md.
 *
 * Browser: load go-engine.js first, then go-bot.js. Call GoVariantBot.chooseAction(state, options)
 * or analyze(state, options) for action plus search statistics. Search is synchronous; a UI
 * integration should run it in a worker so the board remains responsive during thinking.
 */
(function(root,factory){
  const engine = root.GoVariant || (typeof module === "object" && module.exports ? require("./go-engine.js") : null);
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoVariantBot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(defaultEngine){
  "use strict";

  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const coordKey = (x,y) => x + "," + y;

  function makeRng(seed){
    let value = (Number.isFinite(seed) ? seed : Date.now()) >>> 0;
    if (!value) value = 0x9e3779b9;
    return function(){
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  }

  function engineFor(engine){
    const found = engine || defaultEngine;
    if (!found || typeof found.apply !== "function" || typeof found.legalMoves !== "function" || typeof found.score !== "function"){
      throw new Error("GoVariantBot needs the GoVariant rules engine.");
    }
    return found;
  }

  function inBounds(size,x,y){
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function playerOf(engine,value){
    return value ? engine.owner(value) : 0;
  }

  function occupiedCount(state){
    let count = 0;
    for (const row of state.board) for (const value of row) if (value) count++;
    return count;
  }

  function placementQuality(state,x,y,knownOccupied){
    const size = state.size;
    const edge = Math.min(x,y,size-1-x,size-1-y);
    const target = size === 9 ? 2.5 : 3.5;
    let value = 0.34 - Math.abs(edge-target)*0.16;
    const center = (size-1)/2;
    const axis = size === 9 ? [2,4,6] : [3,6,9];
    const isStar = axis.includes(x)&&axis.includes(y);
    if (isStar) value += (x===center&&y===center) ? 0.10 : 0.42;

    let ownNear = 0, enemyNear = 0, nearest = size*2;
    for (let sy=Math.max(0,y-3);sy<=Math.min(size-1,y+3);sy++) for (let sx=Math.max(0,x-3);sx<=Math.min(size-1,x+3);sx++){
      const piece = state.board[sy][sx];
      if (!piece) continue;
      const d = Math.max(Math.abs(x-sx),Math.abs(y-sy));
      nearest = Math.min(nearest,d);
      if (d <= 3){
        if (((piece-1)%2)+1 === state.player) ownNear += d===1?0.34:d===2?0.20:0.08;
        else enemyNear += d===1?0.30:d===2?0.22:0.10;
      }
    }
    if (ownNear > 0.80) value -= (ownNear-0.80)*0.38;
    value += Math.min(0.42,enemyNear*0.28);
    if (nearest > 5 && (knownOccupied===undefined?occupiedCount(state):knownOccupied) > 2) value -= 0.12;
    return value;
  }

  function placementTargets(state,limit,rng){
    const empty = [];
    const occupied=occupiedCount(state);
    for (let y=0;y<state.size;y++) for (let x=0;x<state.size;x++){
      if (!state.board[y][x]) empty.push({x,y,quality:placementQuality(state,x,y,occupied)});
    }
    if (!Number.isFinite(limit) || empty.length <= limit) return empty;
    empty.sort((a,b)=>b.quality-a.quality);
    const keep = Math.max(1,Math.floor(limit*0.78));
    const chosen = empty.slice(0,keep);
    const rest = empty.slice(keep);
    // Keep some lower-ranked intersections in the tree so a heuristic cannot permanently hide a move.
    while (chosen.length < limit && rest.length){
      const i = Math.floor(rng()*rest.length);
      chosen.push(rest.splice(i,1)[0]);
    }
    return chosen;
  }

  function applyForSearch(engine,state,action){
    const next = engine.apply(state,action);
    if (next && Array.isArray(next.history)) next.history = [];
    return next;
  }

  function addAction(engine,state,action,kind,moveType,out){
    const next = applyForSearch(engine,state,action);
    if (next) out.push({action,next,kind,moveType:moveType||null,prior:0,raw:0});
  }

  function legalActions(state,options){
    const opts = options || {};
    const engine = engineFor(opts.engine);
    const rng = opts.rng || makeRng(opts.seed);
    const out = [];
    if (!state || state.result || !Array.isArray(state.board)) return out;
    const player = state.player;
    const reserve = state.remaining && state.remaining[player] || 0;

    if (state.chain){
      const from = {x:state.chain.x,y:state.chain.y};
      for (const move of engine.legalMoves(state,from)){
        if (move.type === "jump"){
          addAction(engine,state,{type:"move",from,to:move.to},"jump","jump",out);
        }
      }
      addAction(engine,state,{type:"shield",at:from},"chain-shield",null,out);
      return out;
    }

    if (reserve > 0){
      const targets = placementTargets(state,opts.placementLimit,rng);
      for (const p of targets) addAction(engine,state,{type:"place",to:{x:p.x,y:p.y}},"place",null,out);
    }

    for (let y=0;y<state.size;y++) for (let x=0;x<state.size;x++){
      const value = state.board[y][x];
      if (!value || playerOf(engine,value) !== player) continue;
      const from = {x,y};
      if (reserve > 0 && value <= 2) addAction(engine,state,{type:"shield",at:from},"shield",null,out);
      for (const move of engine.legalMoves(state,from)){
        addAction(engine,state,{type:"move",from,to:move.to},"move",move.type,out);
      }
    }

    addAction(engine,state,{type:"pass"},"pass",null,out);
    return out;
  }

  function groupAndThreatFeatures(state,engine){
    const size = state.size;
    const board = state.board;
    const seen = new Set();
    const safety = {1:0,2:0};
    const strength = {1:0,2:0};
    const threatened = {1:new Map(),2:new Map()};

    for (let y=0;y<size;y++) for (let x=0;x<size;x++){
      const value = board[y][x];
      if (!value) continue;
      const side = playerOf(engine,value);
      const rootKey = coordKey(x,y);
      if (seen.has(rootKey)) continue;
      const queue = [{x,y}];
      const stones = [];
      const liberties = new Set();
      let shields = 0;
      seen.add(rootKey);
      for (let i=0;i<queue.length;i++){
        const p = queue[i];
        stones.push(p);
        if (board[p.y][p.x] > 2) shields++;
        for (const [dx,dy] of DIRS){
          const nx=p.x+dx, ny=p.y+dy;
          if (!inBounds(size,nx,ny)) continue;
          const other=board[ny][nx], key=coordKey(nx,ny);
          if (!other) liberties.add(key);
          else if (playerOf(engine,other)===side&&!seen.has(key)){seen.add(key);queue.push({x:nx,y:ny});}
        }
      }
      const libCount=liberties.size, count=stones.length;
      if (libCount <= 1) safety[side] += 1.10 + Math.min(1.8,(count-1)*0.28);
      else if (libCount === 2) safety[side] += 0.23 + Math.min(0.80,(count-1)*0.12);
      else strength[side] += Math.min(0.60,count*0.09)*Math.log2(libCount);
      strength[side] += Math.min(0.35,shields*0.09);
    }

    // A normal enemy stone can jump over an ordinary stone into an empty point.
    // Count each threatened victim once per approach, with extra pressure for crossing threats.
    for (let y=0;y<size;y++) for (let x=0;x<size;x++){
      const attackerValue=board[y][x];
      if (!attackerValue || attackerValue>2) continue;
      const attacker=playerOf(engine,attackerValue), defender=3-attacker;
      for (const [dx,dy] of DIRS){
        const mx=x+dx,my=y+dy,tx=x+2*dx,ty=y+2*dy;
        if (!inBounds(size,mx,my)||!inBounds(size,tx,ty)) continue;
        const victim=board[my][mx];
        if (victim && victim<=2 && playerOf(engine,victim)===defender && !board[ty][tx]){
          const key=coordKey(mx,my);
          threatened[defender].set(key,(threatened[defender].get(key)||0)+1);
        }
      }
    }
    for (const side of [1,2]){
      // A legal jump removes the exposed stone and gives the capturer a point, a two-point swing.
      for (const count of threatened[side].values()) safety[side] += 2.70 + Math.min(0.60,(count-1)*0.30);
    }
    return {safety,strength,threatened};
  }

  function softScores(state,engine){
    // Match the current Shield Go final score's material, captures, and white 4-point komi.
    // Territory is softened below until a match is actually over, so an open empty board
    // is not mistaken for territory secured by a single stone.
    const base={1:state.lost&&state.lost[2]||0,2:(state.lost&&state.lost[1]||0)+4};
    const territory={1:0,2:0};
    const size=state.size,board=state.board,seen=new Set();
    for (let y=0;y<size;y++) for (let x=0;x<size;x++){
      const stone=board[y][x];
      if (stone){base[playerOf(engine,stone)]+=stone>2?0.5:1;continue;}
      const first=coordKey(x,y);
      if (seen.has(first)) continue;
      const queue=[{x,y}],borders=new Set(),boundary=new Set();
      seen.add(first);
      for (let i=0;i<queue.length;i++){
        const p=queue[i];
        for (const [dx,dy] of DIRS){
          const nx=p.x+dx,ny=p.y+dy;
          if (!inBounds(size,nx,ny)) continue;
          const value=board[ny][nx],key=coordKey(nx,ny);
          if (!value){if(!seen.has(key)){seen.add(key);queue.push({x:nx,y:ny});}}
          else {borders.add(playerOf(engine,value));boundary.add(key);}
        }
      }
      if (borders.size===1){
        const side=borders.values().next().value;
        // A single boundary stone should not make an open 13x13 board look like settled territory.
        const confidence=clamp(boundary.size/(1+Math.sqrt(queue.length)),0,1);
        territory[side]+=queue.length*confidence*confidence;
      }
    }
    return {
      1:base[1]+territory[1],
      2:base[2]+territory[2]
    };
  }

  function staticScore(state,perspective,engine){
    if (state.result){
      if (!state.result.winner) return 0;
      return state.result.winner===perspective?36:-36;
    }
    const other=3-perspective;
    const scores=softScores(state,engine);
    const boardLead=scores[perspective]-scores[other];
    const shape=groupAndThreatFeatures(state,engine);
    const shapeLead=(shape.strength[perspective]-shape.safety[perspective])-
      (shape.strength[other]-shape.safety[other]);
    const reserves=state.remaining||{1:0,2:0};
    const reserveLead=clamp((reserves[perspective]||0)-(reserves[other]||0),-40,40)*0.022;
    let chainBonus=0;
    if (state.chain&&state.player===perspective){
      const jumps=engine.legalMoves(state,state.chain).filter(m=>m.type==="jump").length;
      chainBonus=Math.min(0.52,jumps*0.16);
    }
    return boardLead + shapeLead + reserveLead + chainBonus;
  }

  function terminalValue(state,perspective,engine){
    if (state.result){
      if (!state.result.winner) return 0;
      return state.result.winner===perspective?1:-1;
    }
    return Math.tanh(staticScore(state,perspective,engine)/11);
  }

  function actionRaw(state,row,engine,beforeScore,occupied){
    const mover=state.player;
    const nextScore=staticScore(row.next,mover,engine);
    const before=beforeScore===undefined?staticScore(state,mover,engine):beforeScore;
    let raw=(nextScore-before)*0.85;
    const captured=(row.next.lost&&row.next.lost[3-mover]||0)-(state.lost&&state.lost[3-mover]||0);
    raw+=Math.min(6,captured*1.05);
    if (row.kind==="place"){
      const to=row.action.to;
      raw+=placementQuality(state,to.x,to.y,occupied)*0.78;
      if (occupied<4) raw+=0.18;
    } else if (row.kind==="jump"){
      raw+=0.28;
      if (row.next.chain){
        const continuations=engine.legalMoves(row.next,row.next.chain).filter(m=>m.type==="jump").length;
        raw+=Math.min(0.62,continuations*0.18);
      }
    } else if (row.kind==="chain-shield"){
      raw+=0.08;
    } else if (row.kind==="shield"){
      raw+=0.13;
    } else if (row.kind==="move"&&row.moveType==="move"){
      raw+=0.08;
    } else if (row.kind==="pass"){
      raw-=0.42;
      if (row.next.result) raw+=row.next.result.winner===0?0:row.next.result.winner===mover?8:-8;
    }
    return clamp(raw,-12,12);
  }

  function rankActions(state,rows,engine){
    if (!rows.length) return rows;
    const before=staticScore(state,state.player,engine);
    const occupied=occupiedCount(state);
    let max=-Infinity;
    for (const row of rows){row.raw=actionRaw(state,row,engine,before,occupied);max=Math.max(max,row.raw);}
    let total=0;
    for (const row of rows){row.prior=Math.exp(clamp((row.raw-max)/1.45,-11,0));total+=row.prior;}
    if (!total) total=rows.length;
    for (const row of rows) row.prior/=total;
    rows.sort((a,b)=>b.prior-a.prior);
    return rows;
  }

  function quickPolicyScore(state,row,engine){
    const mover=state.player;
    const captured=(row.next.lost&&row.next.lost[3-mover]||0)-(state.lost&&state.lost[3-mover]||0);
    let value=captured*2.2;
    if (row.kind==="jump") value+=0.65;
    if (row.kind==="chain-shield") value+=0.22;
    if (row.kind==="shield") value+=0.18;
    if (row.kind==="pass") value-=1.3;
    if (row.kind==="place"){
      const p=row.action.to;
      value+=placementQuality(state,p.x,p.y)*0.9;
    }
    if (row.next.result){
      value+=row.next.result.winner===0?0:row.next.result.winner===mover?12:-12;
    }
    return clamp(value,-8,12);
  }

  function weightedChoice(rows,weights,rng){
    if (!rows.length) return null;
    let total=0;
    const values=rows.map((row,i)=>{
      const w=weights?weights[i]:1;
      total+=w;
      return w;
    });
    if (total<=0) return rows[Math.floor(rng()*rows.length)];
    let pick=rng()*total;
    for (let i=0;i<rows.length;i++){pick-=values[i];if(pick<=0)return rows[i];}
    return rows[rows.length-1];
  }

  function rollout(startState,rootPlayer,engine,options,rng){
    let state=startState;
    const depth=options.rolloutDepth;
    const actionLimit=options.rolloutPlacementLimit;
    for (let ply=0;ply<depth;ply++){
      if (state.result) return terminalValue(state,rootPlayer,engine);
      const rows=legalActions(state,{engine,placementLimit:actionLimit,rng});
      if (!rows.length) return terminalValue(state,rootPlayer,engine);
      const scored=rows.map(row=>({row,score:quickPolicyScore(state,row,engine)}));
      scored.sort((a,b)=>b.score-a.score);
      const shortlist=scored.slice(0,Math.min(scored.length,10));
      const temp=1.35;
      const weights=shortlist.map(item=>Math.exp(clamp((item.score-shortlist[0].score)/temp,-7,0)));
      const chosen=weightedChoice(shortlist.map(item=>item.row),weights,rng);
      state=chosen.next;
    }
    return terminalValue(state,rootPlayer,engine);
  }

  function now(){
    return typeof performance!=="undefined"&&typeof performance.now==="function"?performance.now():Date.now();
  }

  function prepareNode(node,engine,options,rng,isRoot){
    const limit=isRoot?options.rootPlacementLimit:options.treePlacementLimit;
    const rows=legalActions(node.state,{engine,placementLimit:limit,rng});
    node.actions=rankActions(node.state,rows,engine);
  }

  function selectChild(node,rootPlayer,cpuct){
    const scale=Math.sqrt(node.visits+1);
    const maximizing=node.state.player===rootPlayer;
    let best=null,bestValue=-Infinity;
    for (const child of node.children){
      const q=child.visits?child.valueSum/child.visits:0;
      const exploit=maximizing?q:-q;
      const explore=cpuct*child.prior*scale/(1+child.visits);
      const value=exploit+explore;
      if (value>bestValue){bestValue=value;best=child;}
    }
    return best;
  }

  function makeNode(state,action,prior,parent,depth){
    return {state,action,prior,parent,depth,actions:null,children:[],visits:0,valueSum:0};
  }

  function analyze(state,options){
    const opts=Object.assign({
      timeMs:180,
      maxIterations:128,
      rolloutDepth:8,
      rolloutPlacementLimit:16,
      rootPlacementLimit:Infinity,
      treePlacementLimit:72,
      cpuct:1.32,
      widening:1.55,
      seed:(Date.now()^((state&&state.ply)||0)*2654435761)>>>0
    },options||{});
    const engine=engineFor(opts.engine);
    const start=now();
    const rootPlayer=state&&state.player;
    const stats={iterations:0,nodes:0,rootLegal:0,rootExplored:0,elapsedMs:0};
    if (!state||state.result||![1,2].includes(rootPlayer)){
      return {action:null,stats,values:[]};
    }
    const rng=makeRng(opts.seed);
    const root=makeNode(state,null,1,null,0);
    prepareNode(root,engine,opts,rng,true);
    stats.rootLegal=root.actions.length;
    if (!root.actions.length) return {action:null,stats,values:[]};
    if (root.actions.length===1){
      stats.elapsedMs=now()-start;
      return {action:root.actions[0].action,stats,values:[{action:root.actions[0].action,visits:0,prior:1}]};
    }

    for (let iteration=0;iteration<opts.maxIterations;iteration++){
      if (iteration>0&&now()-start>=opts.timeMs) break;
      let node=root;
      const path=[root];
      let depth=0;
      while (!node.state.result){
        if (node.actions===null) prepareNode(node,engine,opts,rng,node===root);
        if (!node.actions.length) break;
        const width=Math.min(node.actions.length,Math.max(1,1+Math.floor(opts.widening*Math.sqrt(node.visits+1))));
        if (node.children.length<width){
          const candidate=node.actions[node.children.length];
          const child=makeNode(candidate.next,candidate.action,candidate.prior,node,node.depth+1);
          node.children.push(child);
          stats.nodes++;
          node=child;
          path.push(node);
          depth=node.depth;
          break;
        }
        const child=selectChild(node,rootPlayer,opts.cpuct);
        if (!child) break;
        node=child;
        path.push(node);
        depth=node.depth;
      }
      const value=rollout(node.state,rootPlayer,engine,opts,rng);
      for (const visited of path){visited.visits++;visited.valueSum+=value;}
      stats.iterations++;
      stats.maxDepth=Math.max(stats.maxDepth||0,depth);
    }

    let best=null;
    for (const child of root.children){
      if (!best||child.visits>best.visits||
          child.visits===best.visits&&child.valueSum>best.valueSum){
        best=child;
      }
    }
    if (!best) best=root.actions[0];
    stats.rootExplored=root.children.length;
    stats.elapsedMs=now()-start;
    const values=root.children.map(child=>({
      action:child.action,
      visits:child.visits,
      winrate:child.visits?((child.valueSum/child.visits)+1)/2:0.5,
      prior:child.prior
    })).sort((a,b)=>b.visits-a.visits||b.prior-a.prior);
    return {action:best.action||best,stats,values};
  }

  function chooseAction(state,options){
    return analyze(state,options).action;
  }

  return {
    version:"0.1.0-shield-go",
    analyze,
    chooseAction,
    legalActions:(state,options)=>legalActions(state,options),
    rankActions:(state,options)=>{
      const opts=options||{};
      const engine=engineFor(opts.engine);
      const rng=opts.rng||makeRng(opts.seed);
      return rankActions(state,legalActions(state,{engine,rng,placementLimit:opts.placementLimit}),engine)
        .map(row=>({action:row.action,kind:row.kind,moveType:row.moveType,prior:row.prior,score:row.raw}));
    }
  };
});

