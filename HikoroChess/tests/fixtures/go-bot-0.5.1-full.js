/* Experimental v0.5.1 Shield Go bot, based on the historical v0.5 influence/moyo line.
 * It retains and re-roots the MCTS subtree when a later position matches a searched reply.
 * Shield Go bot: variant-aware search built against GoVariant's shared rules engine.
 * It combines score-aware MCTS with variant-aware jump reading, atari capture/save checks,
 * and a conservative two-eye safety estimate that discounts eyes open to an immediate jump.
 * A separate last-good-reply rollout policy is experimental and disabled by default.
 * No KataGo source or standard-Go model is bundled: the stock model is not trained for
 * Shield Go's jump captures or mandatory shield chains, and its move format lacks those actions.
 * Research references: KataGo's score/ownership evaluation, GNU Go's influence and moyo model
 * (www.gnu.org/software/gnugo/gnugo_13.html), and tactical search work such as Cazenave's
 * "Combining tactical search and deep learning in Go".
 *
 * Browser: load go-engine.js first, then go-bot-0.5.1.js. Call GoVariantBot.chooseAction(state, options)
 * or analyze(state, options) for the action and search statistics, including subtree reuse.
 */
(function(root,factory){
  const engine = root.GoVariant || (typeof module === "object" && module.exports ? require("../../public/go-engine.js") : null);
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoVariantBot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(defaultEngine){
  "use strict";

  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const coordKey = (x,y) => x + "," + y;
  let reusableTree = null;
  const INFLUENCE_DECAY = [1,0.66,0.44,0.29,0.19,0.13,0.085];
  const makeInfluenceKernel = radius => {
    const offsets=[];
    for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++){
      const distance=Math.abs(dx)+Math.abs(dy);
      if(distance>0&&distance<=radius) offsets.push({dx,dy,weight:INFLUENCE_DECAY[distance]});
    }
    return offsets;
  };
  const INFLUENCE_KERNELS = {9:makeInfluenceKernel(5),13:makeInfluenceKernel(6)};

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

  function isEyePoint(state,x,y,side,engine){
    if(!inBounds(state.size,x,y)||state.board[y][x]) return false;
    let orthogonal=0;
    for(const[dx,dy]of DIRS){
      const nx=x+dx,ny=y+dy;
      if(!inBounds(state.size,nx,ny)) continue;
      orthogonal++;
      if(playerOf(engine,state.board[ny][nx])!==side) return false;
    }
    if(orthogonal<2) return false;
    // Conservative false-eye filter: diagonal enemy stones mean this point is
    // not trusted as a life-saving eye by the static evaluator.
    for(const dx of [-1,1]) for(const dy of [-1,1]){
      const nx=x+dx,ny=y+dy;
      if(inBounds(state.size,nx,ny)&&state.board[ny][nx]&&playerOf(engine,state.board[ny][nx])!==side) return false;
    }
    return true;
  }

  function hasJumpLandingAt(state,x,y,defender,engine){
    const attacker=3-defender;
    if(!(state.remaining&&state.remaining[attacker])) return false;
    if(state.chain&&attacker!==state.player) return false;
    const probe=attacker===state.player?state:{...state,player:attacker,chain:null};
    for(const[dx,dy]of DIRS){
      const from={x:x-2*dx,y:y-2*dy},middle={x:x-dx,y:y-dy};
      if(!inBounds(state.size,from.x,from.y)||!inBounds(state.size,middle.x,middle.y)) continue;
      const attackerStone=state.board[from.y][from.x],victim=state.board[middle.y][middle.x];
      if(!attackerStone||attackerStone>2||playerOf(engine,attackerStone)!==attacker||
         !victim||victim>2||playerOf(engine,victim)!==defender) continue;
      if(engine.legalMoves(probe,from).some(move=>move.type==="jump"&&move.to.x===x&&move.to.y===y)) return true;
    }
    return false;
  }

  function eyeFillPenalty(state,row,engine,jumpLandings){
    if(!row||row.kind!=="place"||row.next.result) return 0;
    const point=row.action.to,side=state.player,key=coordKey(point.x,point.y);
    if(!isEyePoint(state,point.x,point.y,side,engine)) return 0;
    if(jumpLandings&&jumpLandings[side]&&jumpLandings[side].has(key)) return 0;
    if(!jumpLandings&&hasJumpLandingAt(state,point.x,point.y,side,engine)) return 0;
    const neighbor=DIRS.map(([dx,dy])=>({x:point.x+dx,y:point.y+dy}))
      .find(p=>inBounds(state.size,p.x,p.y)&&playerOf(engine,state.board[p.y][p.x])===side);
    if(!neighbor) return 0;
    const group=inspectGroup(state,neighbor,engine);
    const groupStones=new Set(group.stones.map(stone=>coordKey(stone.x,stone.y)));
    // Filling the point can be a useful connection when its surrounding stones
    // belong to different strings; do not tax those moves.
    for(const[dx,dy]of DIRS){
      const nx=point.x+dx,ny=point.y+dy;
      if(inBounds(state.size,nx,ny)&&playerOf(engine,state.board[ny][nx])===side&&!groupStones.has(coordKey(nx,ny))) return 0;
    }
    let eyes=0;
    for(const eyeKey of group.liberties.keys()){
      const [x,y]=eyeKey.split(",").map(Number);
      if(isEyePoint(state,x,y,side,engine)&&
         !(jumpLandings&&jumpLandings[side]&&jumpLandings[side].has(eyeKey))&&
         (jumpLandings||!hasJumpLandingAt(state,x,y,side,engine))) eyes++;
    }
    return eyes?Math.min(1.25,0.70+Math.max(0,eyes-1)*0.28):0;
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

  function groupAndThreatFeatures(state,engine,includeAtariGroups,inspectAllEyes){
    const size = state.size;
    const board = state.board;
    const seen = new Set();
    const safety = {1:0,2:0};
    const strength = {1:0,2:0};
    const stability = {1:new Map(),2:new Map()};
    const threatened = {1:new Map(),2:new Map()};
    const jumpLandings={1:new Set(),2:new Set()};
    const groups=[];
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
      const eyes=[];
      if(inspectAllEyes||libCount<=2){
        for(const key of liberties){
          const split=key.indexOf(","),ex=Number(key.slice(0,split)),ey=Number(key.slice(split+1));
          if(isEyePoint(state,ex,ey,side,engine)) eyes.push(key);
        }
      }
      groups.push({side,stones,liberties,libCount,count,shields,eyes});
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
          jumpLandings[defender].add(coordKey(tx,ty));
        }
      }
    }
    const eyeGroups=[];
    for(const group of groups){
      const {side,stones,liberties,libCount,count,shields,eyes}=group;
      const secureEyes=eyes.filter(key=>!jumpLandings[side].has(key));
      const aliveByTwoEyes=secureEyes.length>=2;
      const influenceStability=aliveByTwoEyes?1.12:
        libCount<=1?0.34:libCount===2?0.68:Math.min(1.12,0.88+libCount*0.025);
      for(const stone of stones) stability[side].set(coordKey(stone.x,stone.y),influenceStability);
      if (libCount <= 1){
        safety[side] += 1.10 + Math.min(1.8,(count-1)*0.28);
        if(libCount===1&&atariGroups){
          const [x,y]=liberties.values().next().value.split(",").map(Number);
          atariGroups[side].push({stones,liberty:{x,y}});
        }
      }
      else if (libCount === 2){
        if(aliveByTwoEyes) strength[side] += 0.18 + Math.min(0.20,count*0.025);
        else safety[side] += 0.23 + Math.min(0.80,(count-1)*0.12);
      }
      else strength[side] += Math.min(0.60,count*0.09)*Math.log2(libCount);
      strength[side] += Math.min(0.35,shields*0.09);
      if(eyes.length||secureEyes.length) eyeGroups.push({side,stones:count,liberties:libCount,
        eyes:eyes.length,secureEyes:secureEyes.length,aliveByTwoEyes});
    }
    for (const side of [1,2]){
      // A legal jump removes the exposed stone and gives the capturer a point, a two-point swing.
      for (const [key,count] of threatened[side]){
        safety[side] += 2.70 + Math.min(0.60,(count-1)*0.30);
        stability[side].set(key,(stability[side].get(key)||1)*0.78);
      }
    }
    return {safety,strength,stability,threatened,jumpLandings,eyeGroups,atariGroups};
  }

  function moyoPlacementGains(state,engine,shape){
    // Estimate how much each placement expands or contests potential territory.
    // Moyo is a move prior rather than guaranteed score, and settled points are
    // discounted so softScores() remains the only source of territory points.
    const size=state.size,board=state.board,total=size*size;
    const fields={1:new Float32Array(total),2:new Float32Array(total)};
    const kernel=INFLUENCE_KERNELS[size]||INFLUENCE_KERNELS[13];
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
      for(const offset of kernel){
        const nx=x+offset.dx,ny=y+offset.dy;
        if(nx<0||ny<0||nx>=size||ny>=size||board[ny][nx]) continue;
        fields[side][ny*size+nx]+=force*offset.weight;
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
      let mayJump=false;
      for(const[dx,dy]of DIRS){
        const mx=x+dx,my=y+dy,tx=x+2*dx,ty=y+2*dy;
        if(inBounds(size,mx,my)&&inBounds(size,tx,ty)&&board[my][mx]&&board[my][mx]<=2&&
           playerOf(engine,board[my][mx])!==side&&!board[ty][tx]){mayJump=true;break;}
      }
      if(!mayJump) continue;
      const probe=side===state.player?state:{...state,player:side,chain:null};
      for(const move of engine.legalMoves(probe,{x,y}).filter(move=>move.type==="jump")){
        const landing=move.to.y*size+move.to.x;
        fields[side][landing]+=0.88;
        const cleared=new Set([y*size+x,((y+move.to.y)/2|0)*size+((x+move.to.x)/2|0)]);
        let mayContinue=false;
        for(const[dx,dy]of DIRS){
          const mx=move.to.x+dx,my=move.to.y+dy,tx=move.to.x+2*dx,ty=move.to.y+2*dy;
          if(!inBounds(size,mx,my)||!inBounds(size,tx,ty)) continue;
          const middleIndex=my*size+mx,targetIndex=ty*size+tx,middle=board[my][mx];
          if(!cleared.has(middleIndex)&&middle&&middle<=2&&playerOf(engine,middle)!==side&&
             (!board[ty][tx]||cleared.has(targetIndex))){mayContinue=true;break;}
        }
        if(!mayContinue) continue;
        const after=engine.applySearch(probe,{type:"move",from:{x,y},to:move.to});
        if(!after||!after.chain) continue;
        for(const continuation of engine.legalMoves(after,after.chain).filter(candidate=>candidate.type==="jump")){
          fields[side][continuation.to.y*size+continuation.to.x]+=0.46;
        }
      }
    }

    const gains=new Float32Array(total),side=state.player;
    for(let index=0;index<total;index++){
      if(board[(index/size)|0][index%size]||!unsettledWeight[index]) continue;
      const black=fields[1][index],white=fields[2][index];
      const before=clamp((black-white)/(black+white+0.82),-0.62,0.62);
      let gain=-before*unsettledWeight[index];
      const x=index%size,y=(index/size)|0;
      for(const offset of kernel){
        const nx=x+offset.dx,ny=y+offset.dy;
        if(nx<0||ny<0||nx>=size||ny>=size||board[ny][nx]) continue;
        const target=ny*size+nx,weight=unsettledWeight[target];
        if(!weight) continue;
        const oldBlack=fields[1][target],oldWhite=fields[2][target];
        const newBlack=oldBlack+(side===1?offset.weight:0);
        const newWhite=oldWhite+(side===2?offset.weight:0);
        const after=clamp((newBlack-newWhite)/(newBlack+newWhite+0.82),-0.62,0.62);
        const oldControl=clamp((oldBlack-oldWhite)/(oldBlack+oldWhite+0.82),-0.62,0.62);
        gain+=(after-oldControl)*weight;
      }
      gains[index]=gain*0.14;
    }
    return gains;
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
    const shape=groupAndThreatFeatures(state,engine,Boolean(featureSink),false);
    if(featureSink){featureSink.atariGroups=shape.atariGroups;featureSink.shape=shape;}
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

  function actionRaw(state,row,engine,beforeScore,occupied,moyoGains){
    const mover=state.player;
    const nextScore=staticScore(row.next,mover,engine);
    const before=beforeScore===undefined?staticScore(state,mover,engine):beforeScore;
    let raw=(nextScore-before)*0.85;
    const captured=(row.next.lost&&row.next.lost[3-mover]||0)-(state.lost&&state.lost[3-mover]||0);
    raw+=Math.min(6,captured*1.05);
    if (row.kind==="place"){
      const to=row.action.to;
      raw+=placementQuality(state,to.x,to.y,occupied)*0.78;
      if(moyoGains) raw+=moyoGains[to.y*state.size+to.x]||0;
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

  function actionCanRescueAtari(row,groups){
    if(!groups||!groups.length) return false;
    const action=row.action;
    for(const group of groups){
      if(action.type==="place"&&action.to.x===group.liberty.x&&action.to.y===group.liberty.y) return true;
      if(action.type==="shield"&&group.stones.some(stone=>stone.x===action.at.x&&stone.y===action.at.y)) return true;
      if(action.type==="move"&&(
        group.stones.some(stone=>stone.x===action.from.x&&stone.y===action.from.y)||
        action.to.x===group.liberty.x&&action.to.y===group.liberty.y
      )) return true;
    }
    return false;
  }

  function actionAdjustments(state,row,engine,raw,features,urgentAtariGroups){
    if(features.eyeAware!==false&&row.kind==="place"){
      raw-=eyeFillPenalty(state,row,engine,features.shape&&features.shape.jumpLandings);
    }
    if(urgentAtariGroups.length){
      const rescue=actionCanRescueAtari(row,urgentAtariGroups)?
        atariRescueBonus(state,row,engine,urgentAtariGroups):0;
      raw+=rescue>0?3.5+rescue:-3.5;
    }
    return raw;
  }

  function approximateActionRaw(state,row,engine,occupied,moyoGains,features,urgentAtariGroups){
    const mover=state.player;
    const captured=(row.next.lost&&row.next.lost[3-mover]||0)-(state.lost&&state.lost[3-mover]||0);
    let raw=Math.min(6,captured*1.05);
    if(row.kind==="place"){
      const to=row.action.to;
      raw+=placementQuality(state,to.x,to.y,occupied)*0.78;
      if(moyoGains) raw+=moyoGains[to.y*state.size+to.x]||0;
      if(occupied<4) raw+=0.18;
    }else if(row.kind==="jump"){
      raw+=0.28;
      if(row.next.chain){
        const continuations=engine.legalMoves(row.next,row.next.chain).filter(move=>move.type==="jump").length;
        raw+=Math.min(0.62,continuations*0.18);
      }
    }else if(row.kind==="chain-shield") raw+=0.08;
    else if(row.kind==="shield") raw+=0.13;
    else if(row.kind==="move"&&row.moveType==="move") raw+=0.08;
    else if(row.kind==="pass"){
      raw-=0.42;
      if(row.next.result) raw+=row.next.result.winner===0?0:row.next.result.winner===mover?8:-8;
    }
    return clamp(actionAdjustments(state,row,engine,raw,features,urgentAtariGroups),-12,12);
  }

  function mustRefineAction(state,row,urgentAtariGroups){
    const captured=(row.next.lost&&row.next.lost[3-state.player]||0)-(state.lost&&state.lost[3-state.player]||0);
    return captured>0||Boolean(row.next.result)||row.kind==="jump"||row.kind==="chain-shield"||
      actionCanRescueAtari(row,urgentAtariGroups);
  }

  function rankActions(state,rows,engine,context){
    if (!rows.length) return rows;
    const features=context||{};
    const before=Number.isFinite(features.beforeScore)?features.beforeScore:staticScore(state,state.player,engine,features);
    const occupied=occupiedCount(state);
    const shape=features.shape||groupAndThreatFeatures(state,engine,false);
    features.shape=shape;
    const moyoGains=moyoPlacementGains(state,engine,shape);
    const ownAtariGroups=features.atariGroups&&features.atariGroups[state.player]||findAtariGroups(state,engine,state.player);
    const urgentAtariGroups=ownAtariGroups.filter(group=>hasLegalAtariCapture(state,3-state.player,engine,[group]));
    const refined=new Set(),approximations=[];
    const limit=Number.isFinite(features.priorRefineLimit)?Math.max(1,Math.floor(features.priorRefineLimit)):Infinity;
    for(const row of rows){
      const raw=approximateActionRaw(state,row,engine,occupied,moyoGains,features,urgentAtariGroups);
      approximations.push({row,raw});
      if(mustRefineAction(state,row,urgentAtariGroups)) refined.add(row);
      if(features.stats) features.stats.approxPriorEvaluations++;
    }
    approximations.sort((a,b)=>b.raw-a.raw);
    for(let i=0;i<Math.min(limit,approximations.length);i++) refined.add(approximations[i].row);
    const approximateByRow=new Map(approximations.map(item=>[item.row,item.raw]));
    let max=-Infinity;
    for (const row of rows){
      row.raw=refined.has(row)?actionAdjustments(state,row,engine,
        actionRaw(state,row,engine,before,occupied,moyoGains),features,urgentAtariGroups):approximateByRow.get(row);
      if(refined.has(row)&&features.stats) features.stats.fullPriorEvaluations++;
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

  function jumpThreatExposure(state,engine){
    const size=state.size,board=state.board,total=size*size;
    const threatened={1:new Uint8Array(total),2:new Uint8Array(total)};
    for(let y=0;y<size;y++) for(let x=0;x<size;x++){
      const value=board[y][x];
      if(!value||value>2) continue;
      const attacker=playerOf(engine,value),defender=3-attacker;
      if(!(state.remaining&&state.remaining[attacker])) continue;
      if(state.chain&&(attacker!==state.player||state.chain.x!==x||state.chain.y!==y)) continue;
      for(const[dx,dy]of DIRS){
        const mx=x+dx,my=y+dy,tx=x+2*dx,ty=y+2*dy;
        if(!inBounds(size,mx,my)||!inBounds(size,tx,ty)||board[ty][tx]) continue;
        const victim=board[my][mx];
        if(!victim||victim>2||playerOf(engine,victim)!==defender) continue;
        const index=my*size+mx;
        // Cap redundant approach counts so a single exposed stone cannot dominate
        // a rollout's tactical move selection.
        if(threatened[defender][index]<3) threatened[defender][index]++;
      }
    }
    const exposure={1:0,2:0};
    for(const side of [1,2]) for(let index=0;index<total;index++){
      const count=threatened[side][index];
      if(count) exposure[side]+=2.70+Math.min(0.60,(count-1)*0.30);
    }
    return exposure;
  }

  function quickPolicyScore(state,row,engine,atariGroups,threatsBefore,eyeAware){
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
    if(eyeAware&&row.kind==="place") value-=eyeFillPenalty(state,row,engine);
    if(threatsBefore){
      const threatsAfter=jumpThreatExposure(row.next,engine);
      // During tactical extensions, reward moves that close a jump lane or
      // shield a vulnerable stone, and discourage exposing a fresh target.
      value+=0.72*((threatsAfter[3-mover]-threatsBefore[3-mover])+
        (threatsBefore[mover]-threatsAfter[mover]));
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

  function lgrContextKey(player,previousAction){
    if(!previousAction||previousAction.type==="pass") return null;
    return player+"|"+actionKey(previousAction);
  }

  function updateLastGoodReplies(played,value,rootPlayer,lgr,stats){
    if(!lgr||!played.length) return;
    // Static leaf scores are noisy around even positions. Only teach the
    // rollout policy from a reasonably clear result; terminal outcomes are
    // already represented by values close to +/-1.
    const winner=value>0.22?rootPlayer:value< -0.22?3-rootPlayer:0;
    if(!winner) return;
    for(const step of played){
      if(!step.lgrKey||step.action.type==="pass") continue;
      const replyKey=actionKey(step.action),remembered=lgr.get(step.lgrKey);
      if(step.player===winner){
        if(!remembered||actionKey(remembered)!==replyKey){
          lgr.set(step.lgrKey,step.action);
          stats.lgrUpdates++;
        }
      }else if(remembered&&actionKey(remembered)===replyKey){
        // LGRF: immediately forget the currently remembered reply when a
        // sufficiently clear playout shows it loses.
        lgr.delete(step.lgrKey);
        stats.lgrForgets++;
      }
    }
  }

  function rollout(startState,rootPlayer,engine,options,rng,lgr,previousAction,stats){
    let state=startState;
    const depth=options.rolloutDepth;
    const actionLimit=options.rolloutPlacementLimit;
    const tacticalLimit=Math.max(0,options.tacticalExtension|0);
    // Resolve forced chains fully, then extend through immediate jump and atari tactics.
    // This avoids scoring a leaf while a capture or a save is still available.
    const maxPly=depth+tacticalLimit+state.size*state.size;
    let tacticalUsed=0,tacticalExtensionPlies=0;
    const played=[];
    const finish=()=>({value:terminalValue(state,rootPlayer,engine),tacticalExtensionPlies,played});
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
      const threatsBefore=tacticalStep?jumpThreatExposure(state,engine):null;
      const replyKey=options.lgrEnabled&&!state.chain?lgrContextKey(state.player,previousAction):null;
      const remembered=replyKey&&lgr?lgr.get(replyKey):null;
      const rememberedRow=remembered&&rows.find(row=>actionKey(row.action)===actionKey(remembered));
      let chosen;
      if(rememberedRow){
        chosen=rememberedRow;
        stats.lgrSelections++;
      }else{
      const scored=rows.map(row=>({row,score:quickPolicyScore(state,row,engine,atariGroups,threatsBefore,options.eyeAware!==false)}));
        scored.sort((a,b)=>b.score-a.score);
        const shortlist=scored.slice(0,Math.min(scored.length,10));
        const temp=1.35;
        const weights=shortlist.map(item=>Math.exp(clamp((item.score-shortlist[0].score)/temp,-7,0)));
        chosen=weightedChoice(shortlist.map(item=>item.row),weights,rng);
      }
      played.push({player:state.player,key:amafPlacementKey(chosen.action),action:chosen.action,
        lgrKey:replyKey&&!state.chain&&chosen.action.type!=="pass"?replyKey:null});
      previousAction=state.chain||chosen.next.chain?null:chosen.action;
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
    const features={eyeAware:options.eyeAware!==false,priorRefineLimit:options.priorRefineLimit,stats:options.searchStats};
    features.beforeScore=staticScore(node.state,node.state.player,engine,features);
    const rows=legalActions(node.state,{engine,placementLimit:limit,rng,atariGroups:features.atariGroups});
    node.actions=rankActions(node.state,rows,engine,features);
    node.amafPlacementKeys=new Set(node.actions.filter(row=>row.kind==="place").map(row=>actionKey(row.action)));
  }

  function selectChild(node,rootPlayer,cpuct,raveBias,stats){
    const scale=Math.sqrt(node.visits+1);
    const maximizing=node.state.player===rootPlayer;
    let best=null,bestValue=-Infinity;
    for (const child of node.children){
      let q=child.visits?child.valueSum/child.visits:0;
      const amaf=node.amafStats&&node.amafStats.get(actionKey(child.action));
      if(amaf&&amaf.visits){
        const bias=Math.max(0,raveBias||0);
        const beta=amaf.visits/(amaf.visits+child.visits+bias*amaf.visits*child.visits);
        q=(1-beta)*q+beta*(amaf.valueSum/amaf.visits);
        stats.raveSelections++;
      }
      const exploit=maximizing?q:-q;
      const explore=cpuct*child.prior*scale/(1+child.visits);
      const value=exploit+explore;
      if (value>bestValue){bestValue=value;best=child;}
    }
    return best;
  }

  function makeNode(state,action,prior,parent,depth){
    return {state,action,prior,parent,depth,actions:null,amafPlacementKeys:null,children:[],childActionKeys:new Set(),amafStats:new Map(),visits:0,valueSum:0};
  }

  function actionKey(action){
    return action?JSON.stringify(action):"";
  }

  function amafPlacementKey(action){
    // RAVE is only shared for reserve placements. Shielding and movement are
    // too dependent on the exact local jump/chain position to generalize safely.
    return action&&action.type==="place"?actionKey(action):null;
  }

  function stateKey(state){
    // Repetition counts are part of identity so a saved branch is reused only
    // when it has the same legal future, even if the visible board matches.
    const positions=[];
    for(const key in state.positions||{}) positions.push([key,state.positions[key]]);
    positions.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
    return JSON.stringify([
      state.size,state.board,state.player,state.chain,state.passes,
      state.lost&&state.lost[1],state.lost&&state.lost[2],
      state.remaining&&state.remaining[1],state.remaining&&state.remaining[2],
      state.ply,state.last,state.result,positions
    ]);
  }

  function reuseSignature(options){
    return JSON.stringify([
      options.rolloutDepth,options.rolloutPlacementLimit,options.treePlacementLimit,
      options.rootPlacementLimit,options.cpuct,options.widening,options.rootWidening,
      options.tacticalExtension,options.raveEnabled,options.raveBias,options.lgrEnabled,options.eyeAware,
      options.priorRefineLimit
    ]);
  }

  function findReusableRoot(state,player,engine,signature){
    if(!reusableTree||reusableTree.botSide!==player||reusableTree.engine!==engine||
       reusableTree.signature!==signature||!reusableTree.afterOwnMove) return null;
    const target=stateKey(state),expected=reusableTree.afterOwnMove;
    if(stateKey(expected.state)===target) return expected;
    for(const reply of expected.children){
      if(stateKey(reply.state)===target) return reply;
    }
    return null;
  }

  function firstUnexpandedAction(node){
    for(const candidate of node.actions){
      if(!node.childActionKeys.has(actionKey(candidate.action))) return candidate;
    }
    return null;
  }

  function rebaseTree(node,parent,depth){
    node.parent=parent;
    node.depth=depth;
    for(const child of node.children) rebaseTree(child,node,depth+1);
  }

  function analyze(state,options){
    const largeBoard=state&&state.size===13;
    const opts=Object.assign({
      timeMs:180,
      maxIterations:128,
      rolloutDepth:8,
      rolloutPlacementLimit:16,
      // Bound root branching so ranking fewer placements leaves more of the
      // fixed budget for MCTS. placementTargets preserves tactical points.
      rootPlacementLimit:largeBoard?112:56,
      treePlacementLimit:largeBoard?56:72,
      cpuct:1.32,
      widening:1.55,
      rootWidening:1.9,
      tacticalExtension:2,
      // RAVE did not beat the baseline in a 200-game paired test at the local
      // search budget. Keep it available for experiments, but do not let its
      // noisy reserve-placement AMAF estimates steer normal play by default.
      raveEnabled:false,
      raveBias:0.02,
      // LGRF is an experimental rollout policy. Evidence from Go engines is
      // mixed, so it remains opt-in until Shield Go match tests show a gain.
      lgrEnabled:false,
      eyeAware:true,
      // Experimental staged policy evaluation: tactical actions always keep
      // full static scoring; only the best quick-ranked remainder gets it.
      priorRefineLimit:Infinity,
      seed:(Date.now()^((state&&state.ply)||0)*2654435761)>>>0
    },options||{});
    const engine=engineFor(opts.engine);
    const start=now();
    const rootPlayer=state&&state.player;
    const signature=reuseSignature(opts);
    const stats={iterations:0,nodes:0,rootLegal:0,rootExplored:0,elapsedMs:0,tacticalExtensionPlies:0,treeReused:false,reusedRootVisits:0,reusableReplyNodes:0,raveUpdates:0,raveSelections:0,lgrUpdates:0,lgrForgets:0,lgrSelections:0,fullPriorEvaluations:0,approxPriorEvaluations:0};
    opts.searchStats=stats;
    if (!state||state.result||![1,2].includes(rootPlayer)){
      reusableTree=null;
      return {action:null,stats,values:[]};
    }
    const rng=makeRng(opts.seed);
    const lgr=opts.lgrEnabled?new Map():null;
    let root=findReusableRoot(state,rootPlayer,engine,signature);
    if(root){
      stats.treeReused=true;
      stats.reusedRootVisits=root.visits;
      root.state=state;
      root.action=null;
      root.actions=null;
      root.childActionKeys=new Set(root.children.map(child=>actionKey(child.action)));
      rebaseTree(root,null,0);
    }else{
      reusableTree=null;
      root=makeNode(state,null,1,null,0);
    }
    prepareNode(root,engine,opts,rng,true);
    if(stats.treeReused){
      const byAction=new Map(root.actions.map(row=>[actionKey(row.action),row]));
      for(const child of root.children){
        const current=byAction.get(actionKey(child.action));
        if(current) child.prior=current.prior;
      }
    }
    stats.rootLegal=root.actions.length;
    if (!root.actions.length){reusableTree=null;return {action:null,stats,values:[]};}
    if (root.actions.length===1){
      const forced=root.actions[0];
      const next=makeNode(forced.next,forced.action,forced.prior,null,0);
      reusableTree=next.state&&!next.state.result?{botSide:rootPlayer,engine,signature,afterOwnMove:next}:null;
      stats.elapsedMs=now()-start;
      return {action:forced.action,stats,values:[{action:forced.action,visits:0,prior:1}]};
    }

    for (let iteration=0;iteration<opts.maxIterations;iteration++){
      if (iteration>0&&now()-start>=opts.timeMs) break;
      let node=root;
      const path=[root];
      const trajectory=[];
      let depth=0;
      while (!node.state.result){
        if (node.actions===null) prepareNode(node,engine,opts,rng,node===root);
        if (!node.actions.length) break;
        const widening=node===root?opts.rootWidening:opts.widening;
        const width=Math.min(node.actions.length,Math.max(1,1+Math.floor(widening*Math.sqrt(node.visits+1))));
        if (node.children.length<width){
          const candidate=firstUnexpandedAction(node);
          if(candidate){
          trajectory.push({player:node.state.player,key:amafPlacementKey(candidate.action)});
          const child=makeNode(candidate.next,candidate.action,candidate.prior,node,node.depth+1);
          node.children.push(child);
          node.childActionKeys.add(actionKey(candidate.action));
          stats.nodes++;
          node=child;
          path.push(node);
          depth=node.depth;
          break;
          }
        }
        const child=selectChild(node,rootPlayer,opts.cpuct,opts.raveBias,stats);
        if (!child) break;
        trajectory.push({player:node.state.player,key:amafPlacementKey(child.action)});
        node=child;
        path.push(node);
        depth=node.depth;
      }
      const result=rollout(node.state,rootPlayer,engine,opts,rng,lgr,node.action,stats);
      const value=result.value;
      trajectory.push(...result.played);
      stats.tacticalExtensionPlies+=result.tacticalExtensionPlies;
      if(opts.lgrEnabled) updateLastGoodReplies(result.played,value,rootPlayer,lgr,stats);
      for(let pathIndex=0;pathIndex<path.length;pathIndex++){
        const visited=path[pathIndex];
        visited.visits++;
        visited.valueSum+=value;
        if(!opts.raveEnabled||!visited.actions) continue;
        const legalPlacements=visited.amafPlacementKeys;
        if(!legalPlacements||!legalPlacements.size) continue;
        const credited=new Set();
        for(let step=pathIndex;step<trajectory.length;step++){
          const played=trajectory[step];
          if(played.player!==visited.state.player||!played.key||!legalPlacements.has(played.key)||credited.has(played.key)) continue;
          credited.add(played.key);
          const amaf=visited.amafStats.get(played.key)||{visits:0,valueSum:0};
          amaf.visits++;
          amaf.valueSum+=value;
          visited.amafStats.set(played.key,amaf);
          stats.raveUpdates++;
        }
      }
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
    const chosenAction=best.action||best;
    const nextRoot=best.state?best:makeNode(best.next,best.action,best.prior,null,0);
    if(nextRoot.state&&!nextRoot.state.result){
      nextRoot.parent=null;
      nextRoot.action=null;
      reusableTree={botSide:rootPlayer,engine,signature,afterOwnMove:nextRoot};
      stats.reusableReplyNodes=nextRoot.children.length;
    }else reusableTree=null;
    stats.rootExplored=root.children.length;
    stats.elapsedMs=now()-start;
    const values=root.children.map(child=>({
      action:child.action,
      visits:child.visits,
      winrate:child.visits?((child.valueSum/child.visits)+1)/2:0.5,
      prior:child.prior
    })).sort((a,b)=>b.visits-a.visits||b.prior-a.prior);
    return {action:chosenAction,stats,values};
  }

  function chooseAction(state,options){
    return analyze(state,options).action;
  }

  return {
    version:"0.5.1-shield-go",
    analyze,
    chooseAction,
    legalActions:(state,options)=>legalActions(state,options),
    jumpThreatExposure:(state,options)=>jumpThreatExposure(state,engineFor(options&&options.engine)),
    eyeStatus:(state,options)=>groupAndThreatFeatures(state,engineFor(options&&options.engine),false,true).eyeGroups,
    rankActions:(state,options)=>{
      const opts=options||{};
      const engine=engineFor(opts.engine);
      const rng=opts.rng||makeRng(opts.seed);
      return rankActions(state,legalActions(state,{engine,rng,placementLimit:opts.placementLimit}),engine,{eyeAware:opts.eyeAware!==false})
        .map(row=>({action:row.action,kind:row.kind,moveType:row.moveType,prior:row.prior,score:row.raw}));
    }
  };
});

