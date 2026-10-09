/* Shield Go bot: variant-aware search built against GoVariant's shared rules engine.
 * It combines score-aware MCTS with a local tactical reader for jump captures, atari captures,
 * and atari saves, adapting Go life-and-death search ideas to this variant's legal actions.
 * No KataGo source or standard-Go model is bundled: the stock model is not trained for
 * Shield Go's jump captures or mandatory shield chains, and its move format lacks those actions.
 * Research references: KataGo's score/ownership evaluation, GNU Go's influence and moyo model
 * (www.gnu.org/software/gnugo/gnugo_13.html), and tactical search work such as Cazenave's
 * "Combining tactical search and deep learning in Go".
 *
 * Browser: load go-engine.js first, then go-bot.js. Call GoVariantBot.chooseAction(state, options)
 * or analyze(state, options) for action plus search statistics. The local-match UI runs this
 * synchronous search in go-bot-worker.js so the board remains responsive while it thinks.
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

  function tacticalPlacementTargets(state,engine,knownAtariGroups){
    const targets=new Set();
    const current=state.player,opponent=3-current;
    // Keep placements that capture or save an atari group even when progressive
    // widening would otherwise prune their intersections.
    const atariGroups=knownAtariGroups||findAllAtariGroups(state,engine);
    for(const side of [current,opponent]){
      if(!(state.remaining&&state.remaining[side])) continue;
      for(const group of atariGroups[side]){
        const p=group.liberty;
        if(!state.board[p.y][p.x]) targets.add(coordKey(p.x,p.y));
      }
    }
    // A placement on the landing point can stop an opponent's immediate jump.
    if(!state.chain&&state.remaining&&state.remaining[opponent]){
      const probe={...state,player:opponent,chain:null};
      for(let y=0;y<state.size;y++) for(let x=0;x<state.size;x++){
        const value=state.board[y][x];
        if(!value||value>2||playerOf(engine,value)!==opponent) continue;
        for(const[dx,dy]of DIRS){
          const mx=x+dx,my=y+dy,tx=x+2*dx,ty=y+2*dy;
          if(!inBounds(state.size,mx,my)||!inBounds(state.size,tx,ty)||state.board[ty][tx]) continue;
          const middle=state.board[my][mx];
          if(!middle||middle>2||playerOf(engine,middle)!==current) continue;
          if(engine.legalMoves(probe,{x,y}).some(move=>move.type==="jump"&&move.to.x===tx&&move.to.y===ty)){
            targets.add(coordKey(tx,ty));
          }
        }
      }
    }
    return targets;
  }

  function placementTargets(state,limit,rng,engine,atariGroups){
    const empty = [];
    const occupied=occupiedCount(state);
    for (let y=0;y<state.size;y++) for (let x=0;x<state.size;x++){
      if (!state.board[y][x]) empty.push({x,y,quality:placementQuality(state,x,y,occupied)});
    }
    if (!Number.isFinite(limit) || empty.length <= limit) return empty;
    empty.sort((a,b)=>b.quality-a.quality);
    const keep = Math.max(1,Math.floor(limit*0.78));
    const chosen = empty.slice(0,keep);
    const selected=new Set(chosen.map(p=>coordKey(p.x,p.y)));
    const tactical=engine?tacticalPlacementTargets(state,engine,atariGroups):new Set();
    for(const p of empty){
      const key=coordKey(p.x,p.y);
      if(tactical.has(key)&&!selected.has(key)){chosen.push(p);selected.add(key);}
    }
    const rest = empty.filter(p=>!selected.has(coordKey(p.x,p.y)));
    // Keep some lower-ranked intersections in the tree so a heuristic cannot permanently hide a move.
    while (chosen.length < limit && rest.length){
      const i = Math.floor(rng()*rest.length);
      chosen.push(rest.splice(i,1)[0]);
    }
    return chosen;
  }

  function applyForSearch(engine,state,action){
    const next = typeof engine.applySearch === "function" ? engine.applySearch(state,action) : engine.apply(state,action);
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
      const targets = placementTargets(state,opts.placementLimit,rng,engine,opts.atariGroups);
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

  function groupAndThreatFeatures(state,engine,includeAtariGroups){
    const size = state.size;
    const board = state.board;
    const seen = new Set();
    const safety = {1:0,2:0};
    const strength = {1:0,2:0};
    const stability = {1:new Map(),2:new Map()};
    const threatened = {1:new Map(),2:new Map()};
    const atariGroups=includeAtariGroups?{1:[],2:[]}:null;

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
      const influenceStability=libCount<=1?0.34:libCount===2?0.68:Math.min(1.12,0.88+libCount*0.025);
      for(const stone of stones) stability[side].set(coordKey(stone.x,stone.y),influenceStability);
      if (libCount <= 1){
        safety[side] += 1.10 + Math.min(1.8,(count-1)*0.28);
        if(libCount===1&&atariGroups){
          const [x,y]=liberties.values().next().value.split(",").map(Number);
          atariGroups[side].push({stones,liberty:{x,y}});
        }
      }
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
      if (!(state.remaining&&state.remaining[attacker])) continue;
      // During a forced chain, only the jumping stone can make another jump this turn.
      if (state.chain&&(attacker!==state.player||state.chain.x!==x||state.chain.y!==y)) continue;
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
      for (const [key,count] of threatened[side]){
        safety[side] += 2.70 + Math.min(0.60,(count-1)*0.30);
        stability[side].set(key,(stability[side].get(key)||1)*0.78);
      }
    }
    return {safety,strength,stability,threatened,atariGroups};
  }

  function influenceLead(state,engine,shape){
    // Moyo is potential territory, not guaranteed score. Build a modest, decaying
    // influence field from stable groups, then value only points outside settled
    // one-colour territory. This keeps the field strategic without counting the same
    // secure points twice in softScores().
    const size=state.size,board=state.board,total=size*size;
    const fields={1:new Float32Array(total),2:new Float32Array(total)};
    const decay=[1,0.66,0.44,0.29,0.19,0.13,0.085];
    const radius=size===9?5:6;
    const seen=new Uint8Array(total),unsettledWeight=new Float32Array(total);

    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const start=y*size+x;
      if(board[y][x]||seen[start]) continue;
      const queue=[start],borders=new Set(),boundary=new Set();
      seen[start]=1;
      for(let i=0;i<queue.length;i++){
        const index=queue[i],px=index%size,py=(index/size)|0;
        for(const[dx,dy]of DIRS){
          const nx=px+dx,ny=py+dy;
          if(!inBounds(size,nx,ny)) continue;
          const next=ny*size+nx,value=board[ny][nx];
          if(!value){if(!seen[next]){seen[next]=1;queue.push(next);}}
          else {borders.add(playerOf(engine,value));boundary.add(next);}
        }
      }
      const confidence=borders.size===1?clamp(boundary.size/(1+Math.sqrt(queue.length)),0,1):0;
      const weight=1-confidence*confidence;
      for(const index of queue) unsettledWeight[index]=weight;
    }

    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const value=board[y][x];
      if(!value) continue;
      const side=playerOf(engine,value),key=coordKey(x,y);
      let force=shape.stability[side].get(key)||1;
      // Shield stones hold influence more reliably because jump capture cannot remove them.
      if(value>2) force*=1.04;
      for(let dy=-radius;dy<=radius;dy++){
        const ny=y+dy;
        if(ny<0||ny>=size) continue;
        for(let dx=-radius;dx<=radius;dx++){
          const distance=Math.abs(dx)+Math.abs(dy);
          if(distance===0||distance>radius) continue;
          const nx=x+dx;
          if(nx<0||nx>=size) continue;
          const index=ny*size+nx;
          if(!board[ny][nx]) fields[side][index]+=force*decay[distance];
        }
      }
    }

    // A legal jump contributes pressure at its landing point. Also look one jump
    // deeper so the map recognizes the distinctive multi-capture chain rule.
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const value=board[y][x];
      if(!value||value>2) continue;
      const side=playerOf(engine,value);
      if(!(state.remaining&&state.remaining[side])) continue;
      if(state.chain&&(side!==state.player||state.chain.x!==x||state.chain.y!==y)) continue;
      const probe=side===state.player?state:{...state,player:side,chain:null};
      for(const move of engine.legalMoves(probe,{x,y}).filter(move=>move.type==="jump")){
        const landing=move.to.y*size+move.to.x;
        fields[side][landing]+=0.88;
        const after=engine.applySearch(probe,{type:"move",from:{x,y},to:move.to});
        if(!after||!after.chain) continue;
        for(const continuation of engine.legalMoves(after,after.chain).filter(candidate=>candidate.type==="jump")){
          fields[side][continuation.to.y*size+continuation.to.x]+=0.46;
        }
      }
    }

    let score=0;
    for(let index=0;index<total;index++){
      if(board[(index/size)|0][index%size]||!unsettledWeight[index]) continue;
      const black=fields[1][index],white=fields[2][index];
      const control=clamp((black-white)/(black+white+0.82),-0.62,0.62);
      score+=control*unsettledWeight[index];
    }
    return score*0.14;
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

  function staticScore(state,perspective,engine,featureSink){
    if (state.result){
      if (!state.result.winner) return 0;
      return state.result.winner===perspective?36:-36;
    }
    const other=3-perspective;
    const scores=softScores(state,engine);
    const boardLead=scores[perspective]-scores[other];
    const shape=groupAndThreatFeatures(state,engine,Boolean(featureSink));
    if(featureSink) featureSink.atariGroups=shape.atariGroups;
    const shapeLead=(shape.strength[perspective]-shape.safety[perspective])-
      (shape.strength[other]-shape.safety[other]);
    const moyoLead=influenceLead(state,engine,shape)*(perspective===1?1:-1);
    const reserves=state.remaining||{1:0,2:0};
    const reserveLead=clamp((reserves[perspective]||0)-(reserves[other]||0),-40,40)*0.022;
    let chainBonus=0;
    if (state.chain&&state.player===perspective){
      const jumps=engine.legalMoves(state,state.chain).filter(m=>m.type==="jump").length;
      chainBonus=Math.min(0.52,jumps*0.16);
    }
    return boardLead + shapeLead + moyoLead + reserveLead + chainBonus;
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

  function rankActions(state,rows,engine,context){
    if (!rows.length) return rows;
    const features=context||{};
    const before=Number.isFinite(features.beforeScore)?features.beforeScore:staticScore(state,state.player,engine,features);
    const occupied=occupiedCount(state);
    const ownAtariGroups=features.atariGroups&&features.atariGroups[state.player]||findAtariGroups(state,engine,state.player);
    const urgentAtariGroups=ownAtariGroups.filter(group=>hasLegalAtariCapture(state,3-state.player,engine,[group]));
    let max=-Infinity;
    for (const row of rows){
      row.raw=actionRaw(state,row,engine,before,occupied);
      if(urgentAtariGroups.length){
        const rescue=atariRescueBonus(state,row,engine,urgentAtariGroups);
        row.raw+=rescue>0?3.5+rescue:-3.5;
      }
      max=Math.max(max,row.raw);
    }
    let total=0;
    for (const row of rows){row.prior=Math.exp(clamp((row.raw-max)/1.45,-11,0));total+=row.prior;}
    if (!total) total=rows.length;
    for (const row of rows) row.prior/=total;
    rows.sort((a,b)=>b.prior-a.prior);
    return rows;
  }

  function inspectGroup(state,start,engine){
    const side=playerOf(engine,state.board[start.y][start.x]);
    const queue=[start],seen=new Set(),stones=[],liberties=new Map();
    for(let i=0;i<queue.length;i++){
      const p=queue[i],key=coordKey(p.x,p.y);
      if(seen.has(key)) continue;
      seen.add(key);stones.push(p);
      for(const[dx,dy]of DIRS){
        const x=p.x+dx,y=p.y+dy;
        if(!inBounds(state.size,x,y)) continue;
        const value=state.board[y][x],nextKey=coordKey(x,y);
        if(!value) liberties.set(nextKey,{x,y});
        else if(playerOf(engine,value)===side&&!seen.has(nextKey)) queue.push({x,y});
      }
    }
    return {side,stones,liberties};
  }

  function findAllAtariGroups(state,engine){
    const seen=new Set(),groups={1:[],2:[]};
    for(let y=0;y<state.size;y++) for(let x=0;x<state.size;x++){
      const value=state.board[y][x],key=coordKey(x,y);
      if(!value||seen.has(key)) continue;
      const group=inspectGroup(state,{x,y},engine);
      for(const stone of group.stones) seen.add(coordKey(stone.x,stone.y));
      if(group.liberties.size===1){
        groups[group.side].push({stones:group.stones,liberty:group.liberties.values().next().value});
      }
    }
    return groups;
  }

  function findAtariGroups(state,engine,side){
    return findAllAtariGroups(state,engine)[side];
  }

  function atariRescueBonus(state,row,engine,atariGroups){
    if(!atariGroups.length) return 0;
    const side=state.player,movedFrom=row.action.type==="move"?coordKey(row.action.from.x,row.action.from.y):null;
    let bonus=0;
    for(const group of atariGroups){
      const survivors=[];
      for(const stone of group.stones){
        const point=movedFrom===coordKey(stone.x,stone.y)?row.action.to:stone;
        if(playerOf(engine,row.next.board[point.y][point.x])===side) survivors.push(point);
      }
      if(survivors.length!==group.stones.length) continue;
      const checked=new Set();
      let safe=true;
      for(const point of survivors){
        const key=coordKey(point.x,point.y);
        if(checked.has(key)) continue;
        const nextGroup=inspectGroup(row.next,point,engine);
        if(nextGroup.liberties.size<=1){safe=false;break;}
        for(const stone of nextGroup.stones) checked.add(coordKey(stone.x,stone.y));
      }
      if(safe) bonus+=1.8+Math.min(0.5,group.stones.length*0.08);
    }
    return Math.min(2.8,bonus);
  }

  function quickPolicyScore(state,row,engine,atariGroups){
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
    value+=atariRescueBonus(state,row,engine,atariGroups||[]);
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

  function hasLegalJump(state,side,engine){
    if (!state || state.result || !(state.remaining&&state.remaining[side])) return false;
    if (state.chain && side!==state.player) return false;
    const probe=side===state.player?state:{...state,player:side,chain:null};
    for (let y=0;y<state.size;y++) for (let x=0;x<state.size;x++){
      const value=state.board[y][x];
      if (value>0 && value<=2 && playerOf(engine,value)===side){
        if (engine.legalMoves(probe,{x,y}).some(move=>move.type==="jump")) return true;
      }
    }
    return false;
  }

  function hasLegalAtariCapture(state,attacker,engine,knownGroups){
    if(!state||state.result||state.chain) return false;
    const defender=3-attacker,groups=knownGroups||findAtariGroups(state,engine,defender);
    if(!groups.length) return false;
    const probe=attacker===state.player?state:{...state,player:attacker,chain:null};
    const before=state.lost&&state.lost[defender]||0;
    const captures=(action)=>{
      const next=applyForSearch(engine,probe,action);
      return Boolean(next&&(next.lost&&next.lost[defender]||0)>before);
    };
    const targets=new Map(groups.map(group=>[coordKey(group.liberty.x,group.liberty.y),group.liberty]));
    if(probe.remaining&&probe.remaining[attacker]){
      for(const target of targets.values()){
        if(captures({type:"place",to:target})) return true;
      }
    }
    const checked=new Set();
    for(const target of targets.values()) for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      const from={x:target.x+dx,y:target.y+dy};
      if(!inBounds(state.size,from.x,from.y)) continue;
      const key=coordKey(from.x,from.y),value=state.board[from.y][from.x];
      if(checked.has(key)||!value||value<=2||playerOf(engine,value)!==attacker) continue;
      checked.add(key);
      for(const move of engine.legalMoves(probe,from)){
        if(move.to.x===target.x&&move.to.y===target.y&&captures({type:"move",from,to:move.to})) return true;
      }
    }
    return false;
  }

  function hasTacticalThreat(state,engine){
    for(const side of [state.player,3-state.player]){
      if(hasLegalJump(state,side,engine)||hasLegalAtariCapture(state,side,engine)) return true;
    }
    return false;
  }

  function rollout(startState,rootPlayer,engine,options,rng){
    let state=startState;
    const depth=options.rolloutDepth;
    const actionLimit=options.rolloutPlacementLimit;
    const tacticalLimit=Math.max(0,options.tacticalExtension|0);
    // Resolve forced chains fully, then extend through immediate jump and atari tactics.
    // This avoids scoring a leaf while a capture or a save is still available.
    const maxPly=depth+tacticalLimit+state.size*state.size;
    let tacticalUsed=0,tacticalExtensionPlies=0;
    const finish=()=>({value:terminalValue(state,rootPlayer,engine),tacticalExtensionPlies});
    for (let ply=0;ply<maxPly;ply++){
      if (state.result) return finish();
      let tacticalStep=false;
      if (ply>=depth&&!state.chain){
        if (tacticalUsed>=tacticalLimit||!hasTacticalThreat(state,engine)) break;
        tacticalUsed++;
        tacticalStep=true;
      }
      if (ply>=depth&&!state.chain&&!tacticalStep) break;
      const rows=legalActions(state,{engine,placementLimit:actionLimit,rng});
      if (!rows.length) return finish();
      const atariGroups=tacticalStep?findAtariGroups(state,engine,state.player):[];
      const scored=rows.map(row=>({row,score:quickPolicyScore(state,row,engine,atariGroups)}));
      scored.sort((a,b)=>b.score-a.score);
      const shortlist=scored.slice(0,Math.min(scored.length,10));
      const temp=1.35;
      const weights=shortlist.map(item=>Math.exp(clamp((item.score-shortlist[0].score)/temp,-7,0)));
      const chosen=weightedChoice(shortlist.map(item=>item.row),weights,rng);
      state=chosen.next;
      if (tacticalStep) tacticalExtensionPlies++;
    }
    return finish();
  }

  function now(){
    return typeof performance!=="undefined"&&typeof performance.now==="function"?performance.now():Date.now();
  }

  function prepareNode(node,engine,options,rng,isRoot){
    const limit=isRoot?options.rootPlacementLimit:options.treePlacementLimit;
    const features={};
    features.beforeScore=staticScore(node.state,node.state.player,engine,features);
    const rows=legalActions(node.state,{engine,placementLimit:limit,rng,atariGroups:features.atariGroups});
    node.actions=rankActions(node.state,rows,engine,features);
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
    const largeBoard=state&&state.size===13;
    const opts=Object.assign({
      timeMs:180,
      maxIterations:128,
      rolloutDepth:8,
      rolloutPlacementLimit:16,
      rootPlacementLimit:Infinity,
      treePlacementLimit:largeBoard?56:72,
      cpuct:1.32,
      widening:1.55,
      rootWidening:1.9,
      tacticalExtension:2,
      seed:(Date.now()^((state&&state.ply)||0)*2654435761)>>>0
    },options||{});
    const engine=engineFor(opts.engine);
    const start=now();
    const rootPlayer=state&&state.player;
    const stats={iterations:0,nodes:0,rootLegal:0,rootExplored:0,elapsedMs:0,tacticalExtensionPlies:0};
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
        const widening=node===root?opts.rootWidening:opts.widening;
        const width=Math.min(node.actions.length,Math.max(1,1+Math.floor(widening*Math.sqrt(node.visits+1))));
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
      const result=rollout(node.state,rootPlayer,engine,opts,rng);
      const value=result.value;
      stats.tacticalExtensionPlies+=result.tacticalExtensionPlies;
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
    version:"0.4.0-shield-go",
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

