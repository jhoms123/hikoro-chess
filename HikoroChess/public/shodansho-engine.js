// Shared Sho Dan Sho rules, used by the browser and the server validator.
const BOARD_SIZE = 900;
const CENTER = [450, 450];
const RADIUS = 447;

// Using new board lines from user prompt
const VERTICAL_LINES = [48, 86, 123, 161, 236, 274, 312, 353, 391, 508, 546, 587, 624, 662, 737, 775, 813, 851];
const HORIZONTAL_LINES = [47, 85, 123, 160, 234, 274, 310, 352, 389, 507, 544, 586, 622, 662, 736, 775, 812, 848];

// Using new vertices from user prompt
const RAW_VERTICES = [
    [0, 6, 312, 47], [0, 7, 353, 47], [0, 8, 391, 47], [0, 9, 508, 47], [0, 10, 546, 47], [0, 11, 587, 47], [1, 4, 236, 85], [1, 5, 274, 85], [1, 6, 312, 85], [1, 7, 353, 85], [1, 8, 391, 85], [1, 9, 508, 85], [1, 10, 546, 85], [1, 11, 587, 85], [1, 12, 624, 85], [1, 13, 662, 85], [2, 4, 236, 123], [2, 5, 274, 123], [2, 6, 312, 123], [2, 7, 353, 123], [2, 8, 391, 123], [2, 9, 508, 123], [2, 10, 546, 123], [2, 11, 587, 123], [2, 12, 624, 123], [2, 13, 662, 123], [3, 3, 161, 160], [3, 4, 236, 160], [3, 5, 274, 160], [3, 6, 312, 160], [3, 7, 353, 160], [3, 8, 391, 160], [3, 9, 508, 160], [3, 10, 546, 160], [3, 11, 587, 160], [3, 12, 624, 160], [3, 13, 662, 160], [3, 14, 737, 160], [4, 1, 86, 234], [4, 2, 123, 234], [4, 3, 161, 234], [4, 4, 236, 234], [4, 5, 274, 234], [4, 6, 312, 234], [4, 7, 353, 234], [4, 8, 391, 234], [4, 9, 508, 234], [4, 10, 546, 234], [4, 11, 587, 234], [4, 12, 624, 234], [4, 13, 662, 234], [4, 14, 737, 234], [4, 15, 775, 234], [4, 16, 813, 234], [5, 1, 86, 274], [5, 2, 123, 274], [5, 3, 161, 274], [5, 4, 236, 274], [5, 5, 274, 274], [5, 6, 312, 274], [5, 7, 353, 274], [5, 8, 391, 274], [5, 9, 508, 274], [5, 10, 546, 274], [5, 11, 587, 274], [5, 12, 624, 274], [5, 13, 662, 274], [5, 14, 737, 274], [5, 15, 775, 274], [5, 16, 813, 274], [6, 0, 48, 310], [6, 1, 86, 310], [6, 2, 123, 310], [6, 3, 161, 310], [6, 4, 236, 310], [6, 5, 274, 310], [6, 6, 312, 310], [6, 7, 353, 310], [6, 8, 391, 310], [6, 9, 508, 310], [6, 10, 546, 310], [6, 11, 587, 310], [6, 12, 624, 310], [6, 13, 662, 310], [6, 14, 737, 310], [6, 15, 775, 310], [6, 16, 813, 310], [6, 17, 851, 310], [7, 0, 48, 352], [7, 1, 86, 352], [7, 2, 123, 352], [7, 3, 161, 352], [7, 4, 236, 352], [7, 5, 274, 352], [7, 6, 312, 352], [7, 7, 353, 352], [7, 8, 391, 352], [7, 9, 508, 352], [7, 10, 546, 352], [7, 11, 587, 352], [7, 12, 624, 352], [7, 13, 662, 352], [7, 14, 737, 352], [7, 15, 775, 352], [7, 16, 813, 352], [7, 17, 851, 352], [8, 0, 48, 389], [8, 1, 86, 389], [8, 2, 123, 389], [8, 3, 161, 389], [8, 4, 236, 389], [8, 5, 274, 389], [8, 6, 312, 389], [8, 7, 353, 389], [8, 8, 391, 389], [8, 9, 508, 389], [8, 10, 546, 389], [8, 11, 587, 389], [8, 12, 624, 389], [8, 13, 662, 389], [8, 14, 737, 389], [8, 15, 775, 389], [8, 16, 813, 389], [8, 17, 851, 389], [9, 0, 48, 507], [9, 1, 86, 507], [9, 2, 123, 507], [9, 3, 161, 507], [9, 4, 236, 507], [9, 5, 274, 507], [9, 6, 312, 507], [9, 7, 353, 507], [9, 8, 391, 507], [9, 9, 508, 507], [9, 10, 546, 507], [9, 11, 587, 507], [9, 12, 624, 507], [9, 13, 662, 507], [9, 14, 737, 507], [9, 15, 775, 507], [9, 16, 813, 507], [9, 17, 851, 507], [10, 0, 48, 544], [10, 1, 86, 544], [10, 2, 123, 544], [10, 3, 161, 544], [10, 4, 236, 544], [10, 5, 274, 544], [10, 6, 312, 544], [10, 7, 353, 544], [10, 8, 391, 544], [10, 9, 508, 544], [10, 10, 546, 544], [10, 11, 587, 544], [10, 12, 624, 544], [10, 13, 662, 544], [10, 14, 737, 544], [10, 15, 775, 544], [10, 16, 813, 544], [10, 17, 851, 544], [11, 0, 48, 586], [11, 1, 86, 586], [11, 2, 123, 586], [11, 3, 161, 586], [11, 4, 236, 586], [11, 5, 274, 586], [11, 6, 312, 586], [11, 7, 353, 586], [11, 8, 391, 586], [11, 9, 508, 586], [11, 10, 546, 586], [11, 11, 587, 586], [11, 12, 624, 586], [11, 13, 662, 586], [11, 14, 737, 586], [11, 15, 775, 586], [11, 16, 813, 586], [11, 17, 851, 586], [12, 1, 86, 622], [12, 2, 123, 622], [12, 3, 161, 622], [12, 4, 236, 622], [12, 5, 274, 622], [12, 6, 312, 622], [12, 7, 353, 622], [12, 8, 391, 622], [12, 9, 508, 622], [12, 10, 546, 622], [12, 11, 587, 622], [12, 12, 624, 622], [12, 13, 662, 622], [12, 14, 737, 622], [12, 15, 775, 622], [12, 16, 813, 622], [13, 1, 86, 662], [13, 2, 123, 662], [13, 3, 161, 662], [13, 4, 236, 662], [13, 5, 274, 662], [13, 6, 312, 662], [13, 7, 353, 662], [13, 8, 391, 662], [13, 9, 508, 662], [13, 10, 546, 662], [13, 11, 587, 662], [13, 12, 624, 662], [13, 13, 662, 662], [13, 14, 737, 662], [13, 15, 775, 662], [13, 16, 813, 662], [14, 3, 161, 736], [14, 4, 236, 736], [14, 5, 274, 736], [14, 6, 312, 736], [14, 7, 353, 736], [14, 8, 391, 736], [14, 9, 508, 736], [14, 10, 546, 736], [14, 11, 587, 736], [14, 12, 624, 736], [14, 13, 662, 736], [14, 14, 737, 736], [15, 4, 236, 775], [15, 5, 274, 775], [15, 6, 312, 775], [15, 7, 353, 775], [15, 8, 391, 775], [15, 9, 508, 775], [15, 10, 546, 775], [15, 11, 587, 775], [15, 12, 624, 775], [15, 13, 662, 775], [16, 4, 236, 812], [16, 5, 274, 812], [16, 6, 312, 812], [16, 7, 353, 812], [16, 8, 391, 812], [16, 9, 508, 812], [16, 10, 546, 812], [16, 11, 587, 812], [16, 12, 624, 812], [16, 13, 662, 812], [17, 6, 312, 848], [17, 7, 353, 848], [17, 8, 391, 848], [17, 9, 508, 848], [17, 10, 546, 848], [17, 11, 587, 848]
];

// Updated ZONE_BY_CELL mapping based on the provided JSON
const ZONE_BY_CELL = {
    "0,6": "field", "0,7": "field", "0,8": "mid_zone", "0,9": "field", "0,10": "field",
    "1,4": "field", "1,5": "field", "1,6": "field", "1,7": "field", "1,8": "mid_zone", "1,9": "field", "1,10": "field", "1,11": "field", "1,12": "field",
    "2,2": "starting_gate", "2,4": "field", "2,5": "field", "2,6": "field", "2,7": "field", "2,8": "mid_zone", "2,9": "field", "2,10": "field", "2,11": "field", "2,12": "field", "2,14": "starting_gate",
    "3,3": "starting_gate", "3,4": "mid_zone", "3,5": "mid_zone", "3,6": "mid_zone", "3,7": "mid_zone", "3,8": "mid_zone", "3,9": "mid_zone", "3,10": "mid_zone", "3,11": "mid_zone", "3,12": "mid_zone", "3,13": "starting_gate",
    "4,1": "field", "4,2": "field", "4,3": "mid_zone", "4,4": "field", "4,5": "field", "4,6": "field", "4,7": "field", "4,8": "river", "4,9": "field", "4,10": "field", "4,11": "field", "4,12": "field", "4,13": "mid_zone", "4,14": "field", "4,15": "field",
    "5,1": "field", "5,2": "field", "5,3": "mid_zone", "5,4": "field", "5,5": "field", "5,6": "field", "5,7": "field", "5,8": "river", "5,9": "field", "5,10": "field", "5,11": "field", "5,12": "field", "5,13": "mid_zone", "5,14": "field", "5,15": "field",
    "6,0": "field", "6,1": "field", "6,2": "field", "6,3": "mid_zone", "6,4": "field", "6,5": "field", "6,6": "field", "6,7": "field", "6,8": "river", "6,9": "field", "6,10": "field", "6,11": "field", "6,12": "field", "6,13": "mid_zone", "6,14": "field", "6,15": "field", "6,16": "field",
    "7,0": "field", "7,1": "field", "7,2": "field", "7,3": "mid_zone", "7,4": "field", "7,5": "field", "7,6": "field", "7,7": "field", "7,8": "river", "7,9": "field", "7,10": "field", "7,11": "field", "7,12": "field", "7,13": "mid_zone", "7,14": "field", "7,15": "field", "7,16": "field",
    "8,0": "mid_zone", "8,1": "mid_zone", "8,2": "mid_zone", "8,3": "mid_zone", "8,4": "river", "8,5": "river", "8,6": "river", "8,7": "river", "8,8": "garden", "8,9": "river", "8,10": "river", "8,11": "river", "8,12": "river", "8,13": "mid_zone", "8,14": "mid_zone", "8,15": "mid_zone", "8,16": "mid_zone",
    "9,0": "field", "9,1": "field", "9,2": "field", "9,3": "mid_zone", "9,4": "field", "9,5": "field", "9,6": "field", "9,7": "field", "9,8": "river", "9,9": "field", "9,10": "field", "9,11": "field", "9,12": "field", "9,13": "mid_zone", "9,14": "field", "9,15": "field", "9,16": "field",
    "10,0": "field", "10,1": "field", "10,2": "field", "10,3": "mid_zone", "10,4": "field", "10,5": "field", "10,6": "field", "10,7": "field", "10,8": "river", "10,9": "field", "10,10": "field", "10,11": "field", "10,12": "field", "10,13": "mid_zone", "10,14": "field", "10,15": "field", "10,16": "field",
    "11,1": "field", "11,2": "field", "11,3": "mid_zone", "11,4": "field", "11,5": "field", "11,6": "field", "11,7": "field", "11,8": "river", "11,9": "field", "11,10": "field", "11,11": "field", "11,12": "field", "11,13": "mid_zone", "11,14": "field", "11,15": "field",
    "12,1": "field", "12,2": "field", "12,3": "mid_zone", "12,4": "field", "12,5": "field", "12,6": "field", "12,7": "field", "12,8": "river", "12,9": "field", "12,10": "field", "12,11": "field", "12,12": "field", "12,13": "mid_zone", "12,14": "field", "12,15": "field",
    "13,3": "starting_gate", "13,4": "mid_zone", "13,5": "mid_zone", "13,6": "mid_zone", "13,7": "mid_zone", "13,8": "mid_zone", "13,9": "mid_zone", "13,10": "mid_zone", "13,11": "mid_zone", "13,12": "mid_zone", "13,13": "starting_gate",
    "14,2": "starting_gate", "14,4": "field", "14,5": "field", "14,6": "field", "14,7": "field", "14,8": "mid_zone", "14,9": "field", "14,10": "field", "14,11": "field", "14,12": "field", "14,14": "starting_gate",
    "15,4": "field", "15,5": "field", "15,6": "field", "15,7": "field", "15,8": "mid_zone", "15,9": "field", "15,10": "field", "15,11": "field", "15,12": "field",
    "16,6": "field", "16,7": "field", "16,8": "mid_zone", "16,9": "field", "16,10": "field"
};

const FPS = 60;
const SNAP_DISTANCE = 25; 
const PIECE_RADIUS = 15; 
const MOVE_DOT_RADIUS = 7;
const REQUIRE_EXACT_STEPS = false; 

const PIECES = {
    star:      { label: "Star",      count: 4, steps: null, letter: "★", desc: "Moves any number of intersections in a straight line. 1-step limit past rivers (unless edge is river-field)." },
    clover:    { label: "Clover",    count: 4, steps: 4,    letter: "♣", desc: "Moves 4 steps. Can jump to friendly Clovers in view to pick a new direction for unlimited steps." },
    daisy:     { label: "Daisy",     count: 6, steps: 3,    letter: "✿", desc: "Moves 3 steps. Unaffected by rivers." },
    water:     { label: "Water",     count: 6, steps: 2,    letter: "✥", desc: "Moves 2 steps. Can only drop in a green zone and cannot leave it." },
    sun:       { label: "Sun",       count: 3, steps: 4,    letter: "☼", desc: "Moves 4 steps. Invulnerable (except to enemy Chysaliths) when in same field or view of a friendly Chysalith. Cannot capture. Stops enemy Shining. Cannot move through enemy Chysalith view." },
    shining:   { label: "Shining",   count: 3, steps: 3,    letter: "✺", desc: "Moves 3 steps. Freezes enemy Chysaliths & blocks view. Moves into but not past enemy Sun view." },
    chysalith: { label: "Chysalith", count: 3, steps: 2,    letter: "C", desc: "Moves 2 steps. The only piece that can capture an invulnerable Sun. Blocks enemy harmonys if in view. Harmonizes with all friendlies." }
};

const HARMONY_PAIRS = {
    star: ["water", "sun", "daisy", "chysalith"],
    sun: ["star", "shining", "clover", "chysalith"],
    clover: ["sun", "daisy", "water", "chysalith"],
    daisy: ["clover", "shining", "star", "chysalith"],
    shining: ["sun", "daisy", "water", "chysalith"],
    water: ["shining", "clover", "star", "chysalith"],
    chysalith: ["star", "sun", "clover", "daisy", "shining", "water", "chysalith"] 
};
const DISHARMONY_PAIRS = {
    star: ["clover", "shining"],
    sun: ["water", "daisy"],
    clover: ["shining", "star"],
    daisy: ["sun", "water"],
    shining: ["clover", "star"],
    water: ["sun", "daisy"],
    chysalith: [] // Chysalith no longer has disharmony pairs, it just blocks.
};

const PLAYER_COLORS = ["#3b82f6", "#a855f7", "#ef4444", "#f59e0b"]; 
const PLAYER_TEXT = ["#fff", "#fff", "#fff", "#fff"];
const SPRITE_COLORS = ["blue", "purple", "red", "yellow"];
const DIRECTIONS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

function normalizeZone(zone) {
    if (!zone) return "unknown";
    let z = String(zone).trim().toLowerCase();
    const aliases = { "starting_gate": "gate", "starting gate": "gate", "mid_zone": "mid", "mid zone": "mid", "outside / ignore": "outside", "ignore": "outside", "none": "unknown", "null": "unknown" };
    return aliases[z] || z;
}

function distSq(x1, y1, x2, y2) { return (x1-x2)*(x1-x2) + (y1-y2)*(y1-y2); }

// Math helpers for Convex Hull and Point in Polygon (for Harmony zones)
function crossProduct(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
function getConvexHull(points) {
    if (points.length <= 3) return points;
    let pts = points.slice().sort((a, b) => a.x == b.x ? a.y - b.y : a.x - b.x);
    let lower = [];
    for (let i = 0; i < pts.length; i++) {
        while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
        lower.push(pts[i]);
    }
    let upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
        upper.push(pts[i]);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
}
function pointInPolygonOrOnEdge(point, vs) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        
        let cross = Math.abs((y - yi) * (xj - xi) - (x - xi) * (yj - yi));
        if (cross < 1.0) {
            let dot = (x - xi) * (xj - xi) + (y - yi) * (yj - yi);
            if (dot >= 0 && dot <= (xj - xi)*(xj - xi) + (yj - yi)*(yj - yi)) return true; 
        }
        
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

class BoardData {
    constructor() {
        this.vertices = new Map();
        this.rowsByCol = new Map();
        this.colsByRow = new Map();
        
        RAW_VERTICES.forEach(([r, c, x, y]) => {
            let key = `${r},${c}`;
            this.vertices.set(key, {r, c, x, y});
            if (!this.rowsByCol.has(c)) this.rowsByCol.set(c, []);
            this.rowsByCol.get(c).push(r);
            if (!this.colsByRow.has(r)) this.colsByRow.set(r, []);
            this.colsByRow.get(r).push(c);
        });

        for (let cols of this.rowsByCol.values()) cols.sort((a,b)=>a-b);
        for (let rows of this.colsByRow.values()) rows.sort((a,b)=>a-b);

        this.zoneAtCell = new Map();
        for (let [k, z] of Object.entries(ZONE_BY_CELL)) {
            this.zoneAtCell.set(k, normalizeZone(z));
        }
        
        this.gateComponentAt = new Map();

        this.zonesTouchingVertex = new Map();
        for (let key of this.vertices.keys()) {
            let touched = new Set();
            for (let cell of this.cellsTouchingVertex(key)) {
                let z = this.zoneAtCell.get(cell);
                if (z && z !== "unknown") touched.add(z);
            }
            this.zonesTouchingVertex.set(key, touched);
        }

        this.buildFieldComponents();
        this.buildZoneComponents("gate", this.gateComponentAt);
        this.buildGardens();
        
        // Combine all gates into a single set of keys for any-gate dropping
        this.allGateKeys = new Set();
        for (let [k, cid] of this.gateComponentAt.entries()) {
            if (cid) this.allGateKeys.add(k);
        }
    }

    cellsTouchingVertex(key) {
        let [r, c] = key.split(',').map(Number);
        let cells = [];
        for (let rr of [r-1, r]) {
            for (let cc of [c-1, c]) {
                if (rr >= 0 && rr < HORIZONTAL_LINES.length-1 && cc >= 0 && cc < VERTICAL_LINES.length-1) {
                    cells.push(`${rr},${cc}`);
                }
            }
        }
        return cells;
    }

    vertexTouchesZone(key, zone) {
        zone = normalizeZone(zone);
        let touched = this.zonesTouchingVertex.get(key);
        return touched ? touched.has(zone) : false;
    }

    neighbors(key) {
        let [r, c] = key.split(',').map(Number);
        let out = {};
        let cols = this.colsByRow.get(r) || [];
        let cIdx = cols.indexOf(c);
        if (cIdx > 0) out["left"] = `${r},${cols[cIdx-1]}`;
        if (cIdx + 1 < cols.length) out["right"] = `${r},${cols[cIdx+1]}`;
        
        let rows = this.rowsByCol.get(c) || [];
        let rIdx = rows.indexOf(r);
        if (rIdx > 0) out["up"] = `${rows[rIdx-1]},${c}`;
        if (rIdx + 1 < rows.length) out["down"] = `${rows[rIdx+1]},${c}`;
        
        return out;
    }

    ray(start, dir) {
        let out = [];
        let cur = start;
        while (true) {
            let nxt = this.neighbors(cur)[dir];
            if (!nxt) return out;
            out.push(nxt);
            cur = nxt;
        }
    }

    directionBetweenAligned(a, b) {
        let [ar, ac] = a.split(',').map(Number);
        let [br, bc] = b.split(',').map(Number);
        if (ar === br) {
            let cols = this.colsByRow.get(ar) || [];
            if (cols.includes(ac) && cols.includes(bc)) {
                return cols.indexOf(bc) > cols.indexOf(ac) ? "right" : "left";
            }
        }
        if (ac === bc) {
            let rows = this.rowsByCol.get(ac) || [];
            if (rows.includes(ar) && rows.includes(br)) {
                return rows.indexOf(br) > rows.indexOf(ar) ? "down" : "up";
            }
        }
        return null;
    }

    edgeTriggersRiverLimit(a, b) {
        let [ar, ac] = a.split(',').map(Number);
        let [br, bc] = b.split(',').map(Number);
        let zones = new Set();
        
        if (ar === br) {
            let r = ar;
            let minC = Math.min(ac, bc), maxC = Math.max(ac, bc);
            for (let c = minC; c < maxC; c++) {
                zones.add(this.zoneAtCell.get(`${r-1},${c}`));
                zones.add(this.zoneAtCell.get(`${r},${c}`));
            }
        } else if (ac === bc) {
            let c = ac;
            let minR = Math.min(ar, br), maxR = Math.max(ar, br);
            for (let r = minR; r < maxR; r++) {
                zones.add(this.zoneAtCell.get(`${r},${c-1}`));
                zones.add(this.zoneAtCell.get(`${r},${c}`));
            }
        }
        
        zones.delete(undefined);
        zones.delete("unknown");
        
        let hasRiver = zones.has("river");
        let hasField = zones.has("field");
        
        if (hasRiver) {
            // Star flower can only pass through edges that are STRICTLY between water and field
            if (zones.size === 2 && hasField) {
                return false; 
            }
            // Any other combination involving river enforces block plus step
            return true;
        }
        return false;
    }

    buildFieldComponents() {
        let fieldCells = new Set([...this.zoneAtCell.keys()].filter(k => this.zoneAtCell.get(k) === "field"));
        let seen = new Set();
        this.fieldComponentAtCell = new Map();
        let compId = 0;

        Array.from(fieldCells).sort().forEach(start => {
            if (seen.has(start)) return;
            compId++;
            let q = [start];
            seen.add(start);
            while (q.length > 0) {
                let cell = q.shift();
                this.fieldComponentAtCell.set(cell, compId);
                let [r, c] = cell.split(',').map(Number);
                [`${r-1},${c}`, `${r+1},${c}`, `${r},${c-1}`, `${r},${c+1}`].forEach(nxt => {
                    if (fieldCells.has(nxt) && !seen.has(nxt)) {
                        seen.add(nxt);
                        q.push(nxt);
                    }
                });
            }
        });

        this.fieldComponentsTouchingVertex = new Map();
        for (let key of this.vertices.keys()) {
            let ids = new Set();
            for (let cell of this.cellsTouchingVertex(key)) {
                if (this.fieldComponentAtCell.has(cell)) ids.add(this.fieldComponentAtCell.get(cell));
            }
            this.fieldComponentsTouchingVertex.set(key, ids);
        }
    }

    fieldIdsAtVertex(key) {
        if (!key) return new Set();
        return this.fieldComponentsTouchingVertex.get(key) || new Set();
    }

    buildZoneComponents(zone, outMap) {
        zone = normalizeZone(zone);
        let keys = new Set([...this.vertices.keys()].filter(k => this.vertexTouchesZone(k, zone)));
        let seen = new Set();
        let compId = 0;
        Array.from(keys).sort().forEach(k => {
            if (seen.has(k)) return;
            compId++;
            let q = [k];
            seen.add(k);
            while(q.length > 0) {
                let cur = q.shift();
                outMap.set(cur, compId);
                Object.values(this.neighbors(cur)).forEach(nxt => {
                    if (keys.has(nxt) && !seen.has(nxt)) {
                        seen.add(nxt);
                        q.push(nxt);
                    }
                });
            }
        });
    }

    buildGardens() {
        let keys = new Set([...this.vertices.keys()].filter(k => this.vertexTouchesZone(k, "garden")));
        let seen = new Set();
        let comps = [];
        Array.from(keys).sort().forEach(k => {
            if (seen.has(k)) return;
            let q = [k];
            seen.add(k);
            let comp = new Set();
            while(q.length > 0) {
                let cur = q.shift();
                comp.add(cur);
                Object.values(this.neighbors(cur)).forEach(nxt => {
                    if (keys.has(nxt) && !seen.has(nxt)) {
                        seen.add(nxt);
                        q.push(nxt);
                    }
                });
            }
            if(comp.size > 0) comps.push(comp);
        });

        comps.sort((a,b) => b.size - a.size);
        this.gardenCorners = new Map();
        this.gardenName = new Map();
        
        // Find center garden
        let centralComp = null;
        for(let comp of comps) {
            let pts = Array.from(comp).map(k => this.vertices.get(k));
            let mx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
            let my = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
            if(Math.hypot(mx - CENTER[0], my - CENTER[1]) < 120) {
                centralComp = comp;
                break;
            }
        }
        
        if (centralComp) {
            let rows = Array.from(centralComp).map(k=>parseInt(k.split(',')[0]));
            let cols = Array.from(centralComp).map(k=>parseInt(k.split(',')[1]));
            let minR = Math.min(...rows), maxR = Math.max(...rows);
            let minC = Math.min(...cols), maxC = Math.max(...cols);
            
            let candidates = [`${minR},${minC}`, `${minR},${maxC}`, `${maxR},${minC}`, `${maxR},${maxC}`];
            let corners = new Set(candidates.filter(k => this.vertices.has(k)));
            
            // If some corners are missing from exact rect, approximate them
            if (corners.size < 4) {
                 let targetPixels = candidates.map(c => {
                    let [rr, cc] = c.split(',').map(Number);
                    let x = VERTICAL_LINES[Math.max(0, Math.min(cc, VERTICAL_LINES.length-1))];
                    let y = HORIZONTAL_LINES[Math.max(0, Math.min(rr, HORIZONTAL_LINES.length-1))];
                    return {x,y};
                });
                corners = new Set();
                targetPixels.forEach(t => {
                    let best = null, bestD = Infinity;
                    centralComp.forEach(k => {
                        let v = this.vertices.get(k);
                        let d = distSq(v.x, v.y, t.x, t.y);
                        if(d < bestD) { bestD = d; best = k; }
                    });
                    corners.add(best);
                });
            }
            this.gardenCorners.set(1, corners);
            this.gardenName.set(1, "central");
        }
    }
}

class Game {
    constructor(board, playerCount=2) {
        this.board = board;
        this.reset(playerCount);
    }

    reset(playerCount) {
        this.playerCount = Math.max(2, Math.min(4, playerCount));
        this.players = [];
        this.pieces = new Map();
        this.nextPieceId = 1;
        
        for (let i = 0; i < this.playerCount; i++) {
            let hand = {};
            for (let [kind, data] of Object.entries(PIECES)) hand[kind] = data.count;
            this.players.push({ hand, captured: {}, eliminated: false });
        }
        
        this.currentPlayer = 0;
        this.turnNumber = 1;
        this.phase = "turn"; // Consolidated phase
        this.selectedPieceId = null;
        this.selectedHandKind = null;
        this.legalMoves = [];
        this.enemyViewPieceId = null; 
        this.enemyMoves = []; 
        this.message = "Game Start! Place a piece in any gate or move a piece.";
        this.winner = null;
        
        this.harmonyData = new Map();
    }

    occupied() {
        let occ = new Map();
        for (let p of this.pieces.values()) {
            if (p.pos && !this.players[p.owner].eliminated) occ.set(p.pos, p);
        }
        return occ;
    }

    piecesOnBoard(owner=null, kind=null) {
        let out = Array.from(this.pieces.values()).filter(p => p.pos);
        if (owner !== null) out = out.filter(p => p.owner === owner);
        if (kind !== null) out = out.filter(p => p.kind === kind);
        return out;
    }

    nearestVertex(pos) {
        let best = null, bestD = SNAP_DISTANCE * SNAP_DISTANCE;
        for (let [key, v] of this.board.vertices.entries()) {
            let d = distSq(pos.x, pos.y, v.x, v.y);
            if (d <= bestD) { bestD = d; best = key; }
        }
        return best;
    }

    // --- HARMONY LOGIC ---
    updateHarmonyCache() {
        this.harmonyData.clear();
        for (let p = 0; p < this.playerCount; p++) {
            if (!this.players[p].eliminated) {
                this.harmonyData.set(p, this.calculateHarmonyFor(p));
            }
        }
    }

    isBlockedByEnemyChysalith(p1Pos, p2Pos, myOwner) {
        let occ = this.occupied();
        for (let ep of occ.values()) {
            if (ep.owner !== myOwner && ep.kind === "chysalith") {
                // If enemy Chysalith is in view of either p1 or p2
                if (this.inView(ep.pos, p1Pos) || this.inView(ep.pos, p2Pos)) {
                    return true;
                }
            }
        }
        return false;
    }

    calculateHarmonyFor(owner) {
        let pieces = this.piecesOnBoard(owner);
        let disharmonies = new Set();
        let harmonyLinks = []; 

        for (let i = 0; i < pieces.length; i++) {
            for (let j = i + 1; j < pieces.length; j++) {
                let p1 = pieces[i], p2 = pieces[j];
                if (this.inView(p1.pos, p2.pos)) {
                    if (DISHARMONY_PAIRS[p1.kind] && DISHARMONY_PAIRS[p1.kind].includes(p2.kind)) {
                        disharmonies.add(p1.id); disharmonies.add(p2.id);
                    } else if (HARMONY_PAIRS[p1.kind] && HARMONY_PAIRS[p1.kind].includes(p2.kind)) {
                        // Check if blocked by enemy Chysalith view
                        if (!this.isBlockedByEnemyChysalith(p1.pos, p2.pos, owner)) {
                            harmonyLinks.push([p1.id, p2.id]);
                        }
                    }
                }
            }
        }

        let adj = new Map();
        for (let p of pieces) {
            if (!disharmonies.has(p.id)) adj.set(p.id, new Set());
        }
        
        let validLinks = [];
        for (let [u, v] of harmonyLinks) {
            if (!disharmonies.has(u) && !disharmonies.has(v)) {
                adj.get(u).add(v);
                adj.get(v).add(u);
                validLinks.push([u, v]);
            }
        }

        let prunedAdj = new Map();
        for (let [k, v] of adj.entries()) prunedAdj.set(k, new Set(v));

        let changed = true;
        while (changed) {
            changed = false;
            for (let [u, neighbors] of prunedAdj.entries()) {
                if (neighbors.size === 1) { 
                    for (let v of neighbors) prunedAdj.get(v).delete(u);
                    neighbors.clear();
                    changed = true;
                }
            }
        }

        let activeNodes = new Set();
        for (let [u, neighbors] of prunedAdj.entries()) {
            if (neighbors.size >= 2) activeNodes.add(u);
        }

        let activeComps = [];
        let activePolys = []; 
        let seen = new Set();
        
        for (let u of activeNodes) {
            if (seen.has(u)) continue;
            let comp = new Set();
            let q = [u];
            seen.add(u);
            while (q.length > 0) {
                let curr = q.shift();
                comp.add(curr);
                for (let n of prunedAdj.get(curr)) {
                    if (!seen.has(n)) { seen.add(n); q.push(n); }
                }
            }
            if (comp.size >= 4) {
                activeComps.push(comp);
                
                let points = Array.from(comp).map(id => {
                    let posKey = this.pieces.get(id).pos;
                    return this.board.vertices.get(posKey);
                });
                activePolys.push(getConvexHull(points));
            }
        }

        return { disharmonies, validLinks, activeComps, activePolys };
    }

    isPieceInActiveHarmony(piece) {
        if (!piece.pos) return false;
        let hData = this.harmonyData.get(piece.owner);
        if (!hData) return false;
        return hData.activeComps.some(comp => comp.has(piece.id));
    }

    isPointInEnemyHarmony(pointV, myOwner) {
        for (let [p, hData] of this.harmonyData.entries()) {
            if (p === myOwner) continue;
            if (hData.activePolys.some(poly => pointInPolygonOrOnEdge(pointV, poly))) {
                return true;
            }
        }
        return false;
    }

    isPieceProtectedByHarmony(piece) {
        if (!piece.pos) return false;
        let hData = this.harmonyData.get(piece.owner);
        if (!hData || hData.activePolys.length === 0) return false;
        
        let isOutline = hData.activeComps.some(comp => comp.has(piece.id));
        if (isOutline) return false;

        let pV = this.board.vertices.get(piece.pos);
        return hData.activePolys.some(poly => pointInPolygonOrOnEdge(pV, poly));
    }
    // --- END HARMONY LOGIC ---

    // --- INTERACTION LOGIC ---
    selectPieceAt(key) {
        if (isOnline && this.currentPlayer !== myPlayerIndex) return;
        let piece = this.occupied().get(key);
        if (!piece) return;
        
        if (piece.owner !== this.currentPlayer) {
            this.enemyViewPieceId = piece.id;
            this.selectedPieceId = null;
            this.selectedHandKind = null;
            this.legalMoves = [];
            this.enemyMoves = this.generateMoves(piece);
            
            if (piece.kind === "shining" && this.shiningPausedBySun(piece)) {
                this.message = `Player ${piece.owner + 1}'s ${PIECES[piece.kind].label} is frozen by a Sun Flower.`;
            } else if (piece.kind === "chysalith" && this.chysalithIsFrozen(piece)) {
                this.message = `Player ${piece.owner + 1}'s ${PIECES[piece.kind].label} is frozen by a Shining Flower.`;
            } else if (this.isPointInEnemyHarmony(this.board.vertices.get(piece.pos), piece.owner)) {
                this.message = `Player ${piece.owner + 1}'s ${PIECES[piece.kind].label} is trapped in a Harmony.`;
            } else {
                this.message = `Viewing valid moves for Player ${piece.owner + 1}'s ${PIECES[piece.kind].label}.`;
            }
            return;
        }

        this.enemyViewPieceId = null;
        this.enemyMoves = [];
        
        if (piece.kind === "chysalith" && this.chysalithIsFrozen(piece)) { this.message = "Chysalith is frozen by an active Shining Flower."; return; }
        if (piece.kind === "shining" && this.shiningPausedBySun(piece)) { this.message = "Shining flower is frozen by an enemy Sun Flower."; return; }
        if (this.isPointInEnemyHarmony(this.board.vertices.get(piece.pos), piece.owner)) {
            this.message = "Your piece is trapped inside an enemy Harmony zone and cannot move!";
            return;
        }

        this.selectedPieceId = piece.id;
        this.selectedHandKind = null;
        this.legalMoves = this.generateMoves(piece);
        
        this.message = `Selected ${PIECES[piece.kind].label}. Valid moves: ${this.legalMoves.length}.`;
    }

    selectHand(kind) {
        this.enemyViewPieceId = null;
        this.enemyMoves = [];

        this.selectedPieceId = null;
        this.selectedHandKind = kind;
        this.legalMoves = this.generateDropMoves(kind);
        this.message = `Selected ${PIECES[kind].label} from hand to drop. Valid drops: ${this.legalMoves.length}.`;
    }

    clickVertex(key) {
        if (this.phase === "game_over") return;
        if (isOnline && this.currentPlayer !== myPlayerIndex) {
            this.message = "Not your turn.";
            return;
        }
        
        this.enemyViewPieceId = null;
        this.enemyMoves = [];

        if (this.selectedPieceId !== null) {
            let move = this.legalMoves.find(m => m.dst === key);
            if (move) {
                this.applyMove(move);
                return;
            }
            this.selectPieceAt(key);
            if (this.selectedPieceId === null && this.enemyViewPieceId === null) this.message = "Not a legal destination.";
            return;
        }

        let occ = this.occupied();
        if (occ.has(key)) {
            this.selectPieceAt(key); 
            return;
        }

        this.dropSelectedHand(key);
    }

    applyMove(move, isRemote = false) {
        if (isOnline && !isRemote) {
            if (waitingForServer) return;
            waitingForServer = true;
            socket.emit('sdsAction', { gameId, action: { type: 'applyMove', move } });
            return;
        }
        if (isOnline && isRemote) waitingForServer = false;

        let piece = this.pieces.get(move.pieceId);
        if (move.captureId !== null) this.capturePiece(this.pieces.get(move.captureId));
        
        piece.lastPosKey = piece.pos;
        piece.animStart = performance.now();
        piece.animType = 'move';
        
        piece.pos = move.dst;
        if (piece.kind === "water" && piece.homeField === null) {
            let ids = Array.from(this.board.fieldIdsAtVertex(move.dst));
            if(ids.length > 0) piece.homeField = Math.min(...ids);
        }
        
        this.updateHarmonyCache(); 
        
        let isSkip = move.dst === piece.lastPosKey;
        this.afterAction(isSkip ? "Skipped." : (move.reason || "Moved."));
        
        requestAnimationFrame(drawBoard);
    }

    capturePiece(victim) {
        victim.pos = null;
        this.players[victim.owner].captured[victim.kind] = (this.players[victim.owner].captured[victim.kind] || 0) + 1;
        // Chysalith loss no longer eliminates
    }

    dropSelectedHand(key, kindOverride=null, isRemote=false) {
        if (isOnline && !isRemote) {
            if (waitingForServer) return;
            if (!this.selectedHandKind) return;
            waitingForServer = true;
            socket.emit('sdsAction', { gameId, action: { type: 'dropSelectedHand', key, kind: this.selectedHandKind } });
            this.selectedHandKind = null;
            return;
        }
        if (isOnline && isRemote) waitingForServer = false;

        let kind = isRemote ? kindOverride : this.selectedHandKind;
        let player = this.players[this.currentPlayer];
        if ((player.hand[kind] || 0) <= 0) { this.message = `No ${PIECES[kind].label} left.`; return; }
        if (this.occupied().has(key)) { this.message = "Intersection is occupied."; return; }

        let [ok, why] = this.canDrop(kind, key);
        if (!ok) { this.message = why; return; }

        let pid = this.nextPieceId++;
        let homeField = null;
        if (kind === "water") {
            let ids = Array.from(this.board.fieldIdsAtVertex(key));
            if(ids.length > 0) homeField = Math.min(...ids);
        }
        
        this.pieces.set(pid, { id: pid, owner: this.currentPlayer, kind, pos: key, homeField, animStart: performance.now(), animType: 'drop' });
        player.hand[kind]--;
        
        this.updateHarmonyCache(); 
        
        if (!isRemote) this.selectedHandKind = null;
        this.afterAction(`Dropped ${PIECES[kind].label}.`);
        
        requestAnimationFrame(drawBoard);
    }

    generateDropMoves(kind) {
        let moves = [];
        let occ = this.occupied();

        for (let key of this.board.vertices.keys()) {
            if (occ.has(key)) continue;
            let [ok] = this.canDrop(kind, key);
            if (ok) {
                moves.push({ dst: key, captureId: null });
            }
        }
        return moves;
    }

    canDrop(kind, key) {
        let touchesGate = this.board.allGateKeys.has(key);
        let touchesField = this.board.vertexTouchesZone(key, "field");
        
        let pV = this.board.vertices.get(key);
        if (this.isPointInEnemyHarmony(pV, this.currentPlayer)) {
            return [false, "Cannot drop into an enemy Harmony."];
        }

        if (kind === "water" && !touchesField) return [false, "Water Flowers must drop touching a green field."];
        if (kind === "chysalith" && this.fieldHasActiveShining(key, this.currentPlayer)) return [false, "Cannot drop Chysalith into a field with active Shining."];
        if (kind === "chysalith" && this.lineHasActiveShiningView(key, this.currentPlayer)) return [false, "Cannot drop where a Shining has line-of-sight."];

        if (touchesGate) return [true, ""];
        if (touchesField) return this.controlsFieldForDrop(this.currentPlayer, key);
        
        return [false, "Drops only allowed on any starting gate or a controlled field."];
    }

    controlsFieldForDrop(owner, key) {
        let targetFieldIds = this.board.fieldIdsAtVertex(key);
        if (targetFieldIds.size === 0) return [false, "Not touching a field."];

        for (let fieldId of targetFieldIds) {
            let ownPieceInField = Array.from(this.pieces.values()).some(p => 
                p.owner === owner && p.pos && this.board.fieldIdsAtVertex(p.pos).has(fieldId)
            );
            
            let counts = Array(this.playerCount).fill(0);
            this.piecesOnBoard(null, "chysalith").forEach(p => {
                if (this.board.fieldIdsAtVertex(p.pos).has(fieldId)) counts[p.owner]++;
            });
            
            let othersMax = 0;
            for(let i=0; i<this.playerCount; i++) if (i !== owner) othersMax = Math.max(othersMax, counts[i]);

            if (ownPieceInField && counts[owner] >= othersMax) return [true, ""];
        }
        return [false, "Need a piece here and not be outnumbered by enemy Chysaliths."];
    }

    afterAction(msg) {
        this.selectedPieceId = null;
        this.legalMoves = [];
        let win = this.checkWinner();
        if (win !== null) {
            this.phase = "game_over";
            this.winner = win;
            this.message = `Player ${win+1} wins! ${msg}`;
            return;
        }

        let advanceMsg = this.advancePlayer();
        this.message = msg + (advanceMsg ? " " + advanceMsg : " Turn ended.");
    }

    advancePlayer() {
        let start = this.currentPlayer;
        while (true) {
            this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
            if (this.currentPlayer === 0) this.turnNumber++;
            if (!this.players[this.currentPlayer].eliminated) break;
            if (this.currentPlayer === start) { this.phase = "game_over"; break; }
        }
        return "";
    }

    pickupSelectedSun(overridePieceId=null, isRemote=false) {
        if (isOnline && !isRemote) {
            if (waitingForServer) return;
            if (this.selectedPieceId === null) { this.message = "Select your Sun Flower first."; updateDOM(); return; }
            waitingForServer = true;
            socket.emit('sdsAction', { gameId, action: { type: 'pickupSelectedSun', pieceId: this.selectedPieceId } });
            return;
        }
        if (isOnline && isRemote) waitingForServer = false;
        
        let pid = isRemote ? overridePieceId : this.selectedPieceId;
        if (pid === null) { this.message = "Select your Sun Flower first."; updateDOM(); return; }
        let p = this.pieces.get(pid);
        if (!p || p.kind !== "sun" || p.owner !== this.currentPlayer || !p.pos) { this.message = "Only your selected Sun Flower can be picked up."; updateDOM(); return; }
        
        p.pos = null;
        this.players[p.owner].hand["sun"]++;
        this.updateHarmonyCache();
        
        if (!isRemote) this.selectedPieceId = null;
        this.afterAction("Picked Sun Flower up.");
        updateDOM();
    }

    generateMoves(piece) {
        if (!piece.pos) return [];
        
        if (piece.kind === "chysalith" && this.chysalithIsFrozen(piece)) return [];
        if (piece.kind === "shining" && this.shiningPausedBySun(piece)) return [];
        if (this.isPointInEnemyHarmony(this.board.vertices.get(piece.pos), piece.owner)) return [];

        let moves = [];
        if (piece.kind === "star") moves = this.starMoves(piece);
        else if (piece.kind === "clover") moves = this.fixedStepMoves(piece, 4).concat(this.cloverSpecialMoves(piece));
        else moves = this.fixedStepMoves(piece, PIECES[piece.kind].steps);

        let steps = PIECES[piece.kind].steps;
        if (steps !== null && steps % 2 === 0) {
            moves.push({ pieceId: piece.id, dst: piece.pos, captureId: null, path: [] });
        }

        moves = moves.filter(m => this.isMoveLegalSpecial(piece, m));

        let out = [];
        let seen = new Set();
        for (let m of moves) {
            let k = `${m.dst}-${m.captureId}`;
            if (!seen.has(k)) { 
                seen.add(k); 
                out.push(m); 
            }
        }
        return out;
    }

    starMoves(piece) {
        let out = [];
        let occ = this.occupied();
        for (let dir in DIRECTIONS) {
            let path = [];
            let prev = piece.pos;
            let riverCrossed = false;
            let stepsPastRiver = 0; 
            
            for (let dst of this.board.ray(piece.pos, dir)) {
                let crossingRiverNow = this.board.edgeTriggersRiverLimit(prev, dst);
                
                if (riverCrossed) {
                    stepsPastRiver++;
                    if (stepsPastRiver > 1) break; 
                }
                
                path.push(dst);
                let victim = occ.get(dst);
                
                if (!victim) {
                    out.push({pieceId: piece.id, dst, captureId: null, path: [...path]});
                    if (crossingRiverNow) riverCrossed = true;
                    prev = dst;
                    continue;
                }
                
                if (victim.owner === piece.owner) break;
                if (this.canCapture(piece, victim)) {
                    out.push({pieceId: piece.id, dst, captureId: victim.id, path: [...path]});
                }
                break; 
            }
        }
        return out;
    }

    fixedStepMoves(piece, steps) {
        let out = [];
        let occ = this.occupied();
        let q = [{cur: piece.pos, used: 0, path: []}];
        let seen = new Set();
        
        while (q.length > 0) {
            let {cur, used, path} = q.shift();
            let state = `${cur}-${used}-${path.join(',')}`;
            if (seen.has(state)) continue;
            seen.add(state);

            if (used > 0 && (!REQUIRE_EXACT_STEPS || used === steps)) {
                out.push({pieceId: piece.id, dst: cur, captureId: null, path: [...path]});
            }
            if (used >= steps) continue;
            
            if (piece.kind === "shining" && used > 0 && this.lineHasEnemySunView(cur, piece.owner, piece.id)) {
                continue; // Cannot move further from this point
            }

            let neighbors = this.board.neighbors(cur);
            for (let dir in neighbors) {
                let nxt = neighbors[dir];
                let nextPath = [...path, nxt];
                let victim = occ.get(nxt);
                
                if (!victim) {
                    q.push({cur: nxt, used: used+1, path: nextPath});
                } else if (victim.owner !== piece.owner) {
                    if (this.canCapture(piece, victim)) out.push({pieceId: piece.id, dst: nxt, captureId: victim.id, path: nextPath});
                }
            }
        }
        return out;
    }

    cloverSpecialMoves(piece) {
        let out = [];
        if (!piece.pos) return out;
        let occ = this.occupied();

        let recurse = (pivot, incoming, used) => {
            for (let d in DIRECTIONS) {
                let opposite = {up:"down", left:"right", right:"left"}[incoming];
                if (incoming && d === opposite) continue;
                
                for (let dst of this.board.ray(pivot, d)) {
                    let victim = occ.get(dst);
                    if (!victim) {
                        out.push({pieceId: piece.id, dst, captureId: null, path: []});
                        continue;
                    }
                    if (victim.owner === piece.owner) {
                        if (victim.kind === "clover" && !used.has(victim.id) && this.inView(pivot, dst, piece.id)) {
                            let nextUsed = new Set(used); nextUsed.add(victim.id);
                            recurse(dst, d, nextUsed);
                        }
                        break;
                    }
                    if (this.canCapture(piece, victim)) out.push({pieceId: piece.id, dst, captureId: victim.id, path: []});
                    break;
                }
            }
        };

        this.piecesOnBoard(piece.owner, "clover").forEach(other => {
            if (other.id !== piece.id && other.pos && this.inView(piece.pos, other.pos, piece.id)) {
                let inc = this.board.directionBetweenAligned(piece.pos, other.pos);
                recurse(other.pos, inc, new Set([other.id]));
            }
        });
        return out;
    }

    isMoveLegalSpecial(piece, move) {
        if (!move.dst) return false;
        
        if (piece.kind === "water") {
            let fields = this.board.fieldIdsAtVertex(move.dst);
            if (piece.homeField !== null && !fields.has(piece.homeField)) return false;
        }
        if (piece.kind === "sun") {
            if (move.captureId !== null) return false;
            let fullPath = move.path && move.path.length > 0 ? move.path : [move.dst];
            for (let step of fullPath) {
                if (this.lineHasEnemyChysalithView(step, piece.owner, piece.id)) return false;
            }
        }
        if (piece.kind === "chysalith") {
            if (this.fieldHasActiveShining(move.dst, piece.owner)) return false;
            let fullPath = move.path && move.path.length > 0 ? move.path : [move.dst];
            for (let step of fullPath) {
                if (this.lineHasActiveShiningView(step, piece.owner, piece.id)) return false;
                if (this.isPointInEnemyHarmony(this.board.vertices.get(step), piece.owner)) return false;
            }
        }
        return true;
    }

    canCapture(attacker, victim) {
        if (attacker.owner === victim.owner) return false;
        
        if (victim.kind === "sun") {
            let victimFieldIds = this.board.fieldIdsAtVertex(victim.pos);
            let protectedByChysalith = false;
            
            // Check if in the same field as a friendly Chysalith
            if (victimFieldIds.size > 0) {
                 protectedByChysalith = Array.from(this.pieces.values()).some(p => 
                    p.owner === victim.owner && 
                    p.kind === "chysalith" && 
                    p.pos && 
                    Array.from(this.board.fieldIdsAtVertex(p.pos)).some(fid => victimFieldIds.has(fid))
                );
            }
            
            // If not protected by field, check if in view of a friendly Chysalith
            if (!protectedByChysalith) {
                protectedByChysalith = Array.from(this.pieces.values()).some(p => 
                    p.owner === victim.owner && 
                    p.kind === "chysalith" && 
                    p.pos && 
                    this.inView(p.pos, victim.pos)
                );
            }
            
            // If the sun is protected/invulnerable, only an opponent's Chysalith can capture it
            if (protectedByChysalith) {
                if (attacker.kind !== "chysalith") return false;
            }
            // If not protected, anyone can capture it (normal rules apply)
        }
        
        if (attacker.kind === "sun") return false; // Sun cannot capture
        return true;
    }

    inView(a, b, ignoreId=null) {
        let dir = this.board.directionBetweenAligned(a, b);
        if (!dir) return false;
        let occ = this.occupied();
        let cur = a;
        while (true) {
            let nxt = this.board.neighbors(cur)[dir];
            if (!nxt) return false;
            if (nxt === b) return true;
            let blocker = occ.get(nxt);
            if (blocker && blocker.id !== ignoreId) return false;
            cur = nxt;
        }
    }

    activeEnemyShiningPieces(owner) {
        return this.piecesOnBoard(null, "shining").filter(sh => sh.owner !== owner && !this.shiningPausedBySun(sh));
    }

    shiningPausedBySun(shining) {
        if (!shining.pos) return false;
        if (this.isPieceProtectedByHarmony(shining)) return false;
        return this.piecesOnBoard(null, "sun").some(sun => sun.owner !== shining.owner && sun.pos && this.inView(sun.pos, shining.pos));
    }

    lineHasEnemySunView(key, owner, ignoreId=null) {
        return this.piecesOnBoard(null, "sun").some(sun => {
            return sun.owner !== owner && sun.pos && this.inView(sun.pos, key, ignoreId);
        });
    }

    lineHasEnemyChysalithView(key, owner, ignoreId=null) {
        return this.piecesOnBoard(null, "chysalith").some(chys => {
            return chys.owner !== owner && chys.pos && this.inView(chys.pos, key, ignoreId);
        });
    }

    lineHasActiveShiningView(key, owner, ignoreId=null) {
        return this.activeEnemyShiningPieces(owner).some(sh => sh.pos && this.inView(sh.pos, key, ignoreId));
    }

    fieldHasActiveShining(key, owner) {
        let fIds = this.board.fieldIdsAtVertex(key);
        if (fIds.size === 0) return false;
        return this.activeEnemyShiningPieces(owner).some(sh => {
            if (!sh.pos) return false;
            let shFids = this.board.fieldIdsAtVertex(sh.pos);
            for (let id of fIds) if (shFids.has(id)) return true;
            return false;
        });
    }

    chysalithIsFrozen(chys) {
        if (this.isPieceProtectedByHarmony(chys)) return false;
        return chys.kind === "chysalith" && chys.pos && this.fieldHasActiveShining(chys.pos, chys.owner);
    }

    checkWinner() {
        let alive = this.players.map((p,i)=>({i,p})).filter(x=>!x.p.eliminated).map(x=>x.i);
        if (alive.length === 1) return alive[0];
        
        let centerGid = 1;
        let centerCorners = this.board.gardenCorners.get(centerGid);
        if (!centerCorners) return null;

        let occ = this.occupied();
        
        // Win condition 1: Occupy all corners of the center garden
        let holders = [];
        for (let k of centerCorners) {
            let p = occ.get(k);
            if (p) holders.push(p.owner);
        }
        if (holders.length === centerCorners.size && holders.every(h => h === holders[0])) {
            return holders[0];
        }

        // Win condition 2: Enclose center garden in a harmony
        for (let player of alive) {
            let hData = this.harmonyData.get(player);
            if (!hData || hData.activePolys.length === 0) continue;
            
            for (let poly of hData.activePolys) {
                let allCornersInHarmony = true;
                for (let c of centerCorners) {
                    if (!pointInPolygonOrOnEdge(this.board.vertices.get(c), poly)) {
                        allCornersInHarmony = false; break;
                    }
                }
                if (allCornersInHarmony) return player;
            }
        }

        return null;
    }
}

