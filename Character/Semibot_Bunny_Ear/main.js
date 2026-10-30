'use strict';
/* Semibot (R.E.P.O.) + Bunny Ears - WebGL murni, memakai fungsi di libs.js */

// Pilihan bentuk kubah kepala: 'rounded', 'paraboloid', atau 'ellipsoid'.
const DOME_TYPE = 'rounded';
const MAX_HP = 10;

/* ===== 1. WebGL & shader ===== */
const canvas = document.getElementById('mycanvas');
const gl = canvas.getContext('webgl', { antialias: true });
if (!gl) throw alert('WebGL tidak didukung browser ini');
const VS = `attribute vec3 aP,aN;uniform mat4 uMV,uPr;uniform mat3 uNM;varying vec3 vN,vV;
void main(){vec4 p=uMV*vec4(aP,1.);vV=-p.xyz;vN=uNM*aN;gl_Position=uPr*p;}`;
const FS = `precision mediump float;varying vec3 vN,vV;uniform vec3 uC;uniform float uFlat;
void main(){
  if(uFlat>.5){gl_FragColor=vec4(uC,1.);return;}
  vec3 n=normalize(vN),v=normalize(vV);if(dot(n,v)<0.)n=-n;
  vec3 l=normalize(vec3(.5,.8,.7)),h=normalize(l+v);
  float d=max(dot(n,l),0.),s=pow(max(dot(n,h),0.),50.)*.45;
  gl_FragColor=vec4(uC*(.28+.18*(.5+.5*n.y)+.75*d)+s,1.);
}`;
function sh(t, s) {
    const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o));
    return o;
}
const pg = gl.createProgram();
gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(pg); gl.useProgram(pg);
const U = {}; ['uMV', 'uPr', 'uNM', 'uC', 'uFlat'].forEach(n => U[n] = gl.getUniformLocation(pg, n));
const aP = gl.getAttribLocation(pg, 'aP'), aN = gl.getAttribLocation(pg, 'aN');
gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aN); gl.enable(gl.DEPTH_TEST);

/* ===== 2. Matriks (kolom-mayor) ===== */
const M = {
    id: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k]; o[c*4+r] = s } return o },
    T(x, y, z) { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m },
    S(x, y, z) { const m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m },
    RX(a) { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m },
    RY(a) { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m },
    RZ(a) { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m },
    persp(f, a, n, r) { const t = 1/Math.tan(f/2), m = new Float32Array(16); m[0] = t/a; m[5] = t; m[10] = (r+n)/(n-r); m[11] = -1; m[14] = 2*r*n/(n-r); return m }
};
const mm = (...a) => a.reduce(M.mul);
function nmat(m) {   // inverse-transpose 3x3 untuk normal
    const a = (r, c) => m[c*4+r];
    const C = (r, c) => { const r1 = (r+1)%3, r2 = (r+2)%3, c1 = (c+1)%3, c2 = (c+2)%3; return a(r1,c1)*a(r2,c2) - a(r1,c2)*a(r2,c1) };
    const d = a(0,0)*C(0,0) + a(0,1)*C(0,1) + a(0,2)*C(0,2), o = new Float32Array(9);
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c*3+r] = C(r,c)/d;
    return o;
}

/* ===== 3. Mesh dari libs.js ===== */
function interleave(V, N) {
    const d = new Float32Array(V.length * 2);
    for (let i = 0, n = V.length / 3; i < n; i++) { d[6*i] = V[3*i]; d[6*i+1] = V[3*i+1]; d[6*i+2] = V[3*i+2]; d[6*i+3] = N[3*i]; d[6*i+4] = N[3*i+1]; d[6*i+5] = N[3*i+2] }
    return d;
}
function upload(V, N, I, dyn) {
    const vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, interleave(V, N), dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
    return { vb, ib, n: I.length, idx: I };
}
const SEG = 28;
const part = (v, s = SEG) => ({ v, rows: s + 1, cols: s + 1 });
const shift = (v, x, y, z) => v.map((a, i) => a + [x, y, z][i % 3]);
// beberapa patch (tiap patch punya normal sendiri -> tepi tajam) digabung jadi satu mesh
function buildMesh(parts) {
    const V = [], N = [], I = [];
    for (const p of parts) {
        const off = V.length / 3, idx = createGridIndices(p.rows, p.cols), nor = computeNormals(p.v, idx);
        p.v.forEach(x => V.push(x)); nor.forEach(x => N.push(x)); idx.forEach(i => I.push(i + off));
    }
    return upload(V, N, I, false);
}
// tutup/alas = paraboloid setinggi 0 (piringan datar)
const disk = (r, y) => part(shift(createParaboloid(r, 0, SEG), 0, y, 0));
const solidCyl = (r, h) => buildMesh([part(createCylinder(r, h, SEG)), disk(r, h/2), disk(r, -h/2)]);
const solidCone = (r, h) => buildMesh([part(createCone(r, h, SEG)), disk(r, -h/2)]);      // puncak di atas, alas di bawah
const box = (x, y, z) => buildMesh([
    [[-x,-y,z],[x,-y,z],[-x,y,z],[x,y,z]],
    [[x,-y,-z],[-x,-y,-z],[x,y,-z],[-x,y,-z]],
    [[x,-y,z],[x,-y,-z],[x,y,z],[x,y,-z]],
    [[-x,-y,-z],[-x,-y,z],[-x,y,-z],[-x,y,z]],
    [[-x,y,z],[x,y,z],[-x,y,-z],[x,y,-z]],
    [[-x,-y,-z],[x,-y,-z],[-x,-y,z],[x,-y,z]]
].map(face => part(face.flat(), 1)));
function createRoundedDome(radius, height, segments) {
    const sphereRadius = (radius * radius + height * height) / (2 * height);
    const maxAngle = Math.acos((sphereRadius - height) / sphereRadius);
    const vertices = [];
    for (let i = 0; i <= segments; i++) {
        const angle = maxAngle * i / segments;
        const r = sphereRadius * Math.sin(angle);
        const y = height - sphereRadius + sphereRadius * Math.cos(angle);
        for (let j = 0; j <= segments; j++) {
            const theta = 2 * Math.PI * j / segments;
            vertices.push(r * Math.cos(theta), y, r * Math.sin(theta));
        }
    }
    return vertices;
}
function makeTube(seg, ring) {   // buffer dinamis untuk telinga (dibuat ulang tiap frame)
    const z = new Array((seg + 1) * (ring + 1) * 3).fill(0);
    return upload(z, z, createGridIndices(seg + 1, ring + 1), true);
}
function setTube(m, verts) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.bufferData(gl.ARRAY_BUFFER, interleave(verts, computeNormals(verts, m.idx)), gl.DYNAMIC_DRAW);
}

/* ===== 4. Geometri Semibot (tinggi badan + kepala ~ 2.0) ===== */
const R_HEAD = .307, H_DOME = .34;
const mLeg = solidCone(.115, .61);            // kaki: kerucut (dibalik, puncak ke bawah)
const mArm = solidCone(.07, .72);            // lengan meruncing dengan radius lebih besar
const mBand = solidCyl(.352, .36);            // badan bawah (cincin lebar)
const mMain = solidCyl(.34, .36);             // badan atas
const mCollar = solidCyl(.315, .13);          // kerah / leher
const mHeadCyl = solidCyl(R_HEAD, .15);       // sisi kepala
const mHinge = solidCyl(.026, .075);          // engsel kecil di belakang kepala
const mHealthSquare = box(1, 1, 1);             // unit kotak health bar
const mSeamBand = buildMesh([part(createCylinder(1, 1, SEG))]); // dinding silinder satuan untuk garis sambungan
const mDome = DOME_TYPE === 'rounded'
    ? buildMesh([part(createRoundedDome(R_HEAD, H_DOME, SEG)), disk(R_HEAD, 0)])
    : DOME_TYPE === 'paraboloid'
        ? buildMesh([part(createParaboloid(R_HEAD, H_DOME, SEG)), disk(R_HEAD, -H_DOME)])
        : buildMesh([part(createSphere(R_HEAD, SEG))]);
const mBall = buildMesh([part(createSphere(1, SEG))]);   // bola satuan: sclera, pupil, rongga mata
const earOut = [makeTube(16, 12), makeTube(16, 12)], earIn = [makeTube(16, 12), makeTube(16, 12)];

const COL = { white: [.97,.97,.97], black: [.02,.02,.03], socket: [.38,.04,.04], pin: [.35,.36,.4],
              pink: [1,.62,.7], ledOff: [.22,.07,.07], plate: [.1,.03,.03] };
const earW = t => .085 * Math.pow(Math.sin(Math.PI * (.2 + .8 * t)), .8);   // lebar telinga sepanjang kurva

// Titik kontrol Bezier kubik telinga (koordinat kepala). flop/tw menggerakkan p1..p3 -> kurva berubah tiap frame
function earCtl(s, P, t) {
    const f = P.flop, w = P.tw;
    return [
        [s*.13, .40, -.03],
        [s*.17, .70, -.03 - .06*f],
        [s*(.23 + .03*Math.sin(1.3*t + s)), .92, -.06 - .20*f],
        [s*(.21 + .05*w), .98 - .12*Math.abs(f), -.22 - .40*f]
    ];
}

/* ===== 5. Menggambar ===== */
let V = M.id(), Pr = M.id();
function draw(m, model, col, flat) {
    const mv = mm(V, model);
    gl.uniformMatrix4fv(U.uMV, false, mv); gl.uniformMatrix3fv(U.uNM, false, nmat(mv));
    gl.uniform3fv(U.uC, col); gl.uniform1f(U.uFlat, flat ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
}
const lb = gl.createBuffer();
function lines(pts, col) {
    const d = new Float32Array(pts.length * 6); pts.forEach((p, i) => d.set(p, i * 6));
    gl.uniformMatrix4fv(U.uMV, false, V); gl.uniform3fv(U.uC, col); gl.uniform1f(U.uFlat, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, lb); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.LINES, 0, pts.length);
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const grid = []; for (let i = -5; i <= 5; i++) grid.push([i,0,-5], [i,0,5], [-5,0,i], [5,0,i]);

let ang = 0, t = 0, state = 'idle', health = MAX_HP, hit = 0, TAU = Math.PI * 2;

function drawBot(P, bl, body) {
    const q = 1 / Math.sqrt(P.sy);                  // squash & stretch menjaga volume
    const seam = body.map(channel => channel * .32);
    const root = mm(M.T(P.R * Math.sin(ang) + P.shx, P.bob, P.R * Math.cos(ang)), M.RY(P.yaw), M.S(q, P.sy, q),
                    M.T(0, .9, 0), M.RX(P.tx), M.RZ(P.tz), M.T(0, -.9, 0));
    for (const s of [-1, 1]) {                       // kaki: kerucut, pivot di pinggul
        const H = mm(root, M.T(s*.145, .6, 0), M.RX(s < 0 ? P.swL : P.swR));
        draw(mLeg, mm(H, M.T(0, -.30, 0), M.RX(Math.PI)), body);
    }
    draw(mBand, mm(root, M.T(0, .78, 0)), body);     // badan bawah
    draw(mMain, mm(root, M.T(0, 1.14, 0)), body);    // badan atas
    draw(mCollar, mm(root, M.T(0, 1.385, 0)), body);
    draw(mSeamBand, mm(root, M.T(0, .96, 0), M.S(.354, .009, .354)), seam, true);
    draw(mSeamBand, mm(root, M.T(0, 1.32, 0), M.S(.342, .009, .342)), seam, true);
    for (const s of [-1, 1]) {                       // lengan kerucut ramping tanpa engsel
        const A = mm(root, M.T(s*.355, 1.29, 0), M.RZ(s*P.az), M.RX(s < 0 ? P.aR : P.aL));
        draw(mArm, mm(A, M.T(0, -.36, 0), M.RX(Math.PI), M.S(.9, 1, 1)), body);
    }
    /* indikator health kotak di punggung (kerah) */
    const ratio = health / MAX_HP, lit = ratio > .5 ? [.2,.9,.3] : ratio > .25 ? [.95,.8,.15] : [.95,.2,.15];
    for (let i = 0; i < MAX_HP; i++) {
        const th = -.5 + i / (MAX_HP - 1), on = i < health && !(health <= 2 && Math.sin(t*10) > 0);
        const L = mm(root, M.T(.319*Math.sin(th), 1.385, -.319*Math.cos(th)), M.RY(Math.PI - th));
        draw(mHealthSquare, mm(L, M.S(.016, .016, .005)), COL.plate);
        draw(mHealthSquare, mm(L, M.T(0, 0, .007), M.S(.011, .011, .003)), on ? lit : COL.ledOff, on);
    }
    /* kepala: silinder + kubah (paraboloid) */
    const Hd = mm(root, M.T(0, 1.47, 0), M.RY(P.hy), M.RX(P.hp));
    draw(mHeadCyl, mm(Hd, M.T(0, .075, 0)), body);
    const domeModel = DOME_TYPE === 'paraboloid'
        ? mm(Hd, M.T(0, .15 + H_DOME, 0))
        : DOME_TYPE === 'ellipsoid'
            ? mm(Hd, M.T(0, .15, 0), M.S(1, H_DOME / R_HEAD, 1))
            : mm(Hd, M.T(0, .15, 0));
    draw(mDome, domeModel, body);
    draw(mHinge, mm(Hd, M.T(0, 0, -R_HEAD + .012), M.RZ(Math.PI / 2)), body);
    draw(mBall, mm(Hd, M.T(0, 0, -R_HEAD - .014), M.S(.045, .026, .026)), body);
    const dl = Math.hypot(P.lx * .35, P.ly * .35, 1), dx = P.lx * .35 / dl, dy = P.ly * .35 / dl, dz = 1 / dl;
    for (const s of [-1, 1]) {                       // mata: bagian putih dan pupil dibuat matte
        const ex = s * .16, ey = .16, ez = .225;
        draw(mBall, mm(Hd, M.T(ex, ey, ez), M.S(.108, .108 * bl, .108)), COL.white, true);
        draw(mBall, mm(Hd, M.T(ex + dx*.097, ey + dy*.097*bl, ez + dz*.097), M.S(.03, .03 * bl, .02)), COL.black, true);
    }
    /* telinga kelinci: tabung di sepanjang kurva Bezier kubik 3D yang dihitung ulang tiap frame */
    [-1, 1].forEach((s, i) => {
        const c = earCtl(s, P, t);
        setTube(earOut[i], createBezierTube(c[0], c[1], c[2], c[3], 16, 12, u => [earW(u), earW(u) * .32]));
        draw(earOut[i], Hd, body);
        const ci = c.map(p => [p[0], p[1], p[2] + .016]);
        setTube(earIn[i], createBezierTube(ci[0], ci[1], ci[2], ci[3], 16, 12, u => [earW(u) * .55, earW(u) * .34]));
        draw(earIn[i], Hd, COL.pink);
    });
}

/* ===== 6. Animasi: target tiap state di-lerp agar halus ===== */
function target(st, t, y0) {
    const s = Math.sin, c = Math.cos, P = { swL: 0, swR: 0, aL: 0, aR: 0, az: .12, shx: 0,
        bob: .012 * s(2*t), sy: 1 + .012 * s(2*t), R: 0, yaw: Math.round(y0 / TAU) * TAU, tx: 0, tz: 0,
        hy: .35 * s(.8*t), hp: .04 * s(1.1*t), lx: .8 * s(.8*t), ly: .25 * c(1.1*t),
        flop: .15 * s(1.2*t), tw: .3 * s(1.7*t) + (t % 6 < .5 ? .8 * s((t % 6) * 25) : 0) };
    if (st === 'walk') { const p = t * 7; Object.assign(P, { swL: .65*s(p), swR: -.65*s(p), aL: -.6*s(p), aR: .6*s(p),
        bob: .05*Math.abs(c(p)), R: 1.6, yaw: ang + Math.PI/2, hy: .1*s(p/2), lx: 0, ly: 0, sy: 1, flop: .5*s(2*p), tw: 0 }) }
    if (st === 'jump') { const u = t * 3, h = Math.abs(s(u)), g = 1 - h, v = c(u) * Math.sign(s(u));
        Object.assign(P, { bob: .55*h, sy: 1.12 - .28*Math.pow(g, 5), az: .8, aL: -.3, aR: -.3, swL: -.3*h, swR: -.3*h, flop: .9*v, tw: 0, hy: 0 }) }
    return P;
}
const cur = target('idle', 0, 0);
function setState(s) { if (s === 'walk' && cur.R < .3) ang = cur.yaw - Math.PI/2; state = s; }

/* ===== 7. Kamera, UI, loop ===== */
let cy = -.4, cyT = -.4, cp = .12, dist = 8.5, drag = 0, lx0 = 0, ly0 = 0;
canvas.onpointerdown = e => { drag = 1; lx0 = e.clientX; ly0 = e.clientY; canvas.setPointerCapture(e.pointerId) };
canvas.onpointermove = e => { if (!drag) return; cyT += (e.clientX - lx0) * .01; cy = cyT; cp = Math.min(1.2, Math.max(-.2, cp + (e.clientY - ly0) * .01)); lx0 = e.clientX; ly0 = e.clientY };
canvas.onpointerup = () => drag = 0;
canvas.addEventListener('wheel', e => { e.preventDefault(); dist = Math.min(16, Math.max(4, dist + e.deltaY * .006)) }, { passive: false });

const ui = document.createElement('div');
ui.style.cssText = 'position:fixed;left:12px;top:12px;display:flex;flex-direction:column;gap:8px;font:14px system-ui,sans-serif;color:#e8eaed';
ui.innerHTML = '<b>Semibot + Bunny Ears</b><div id="bt" style="display:flex;flex-wrap:wrap;gap:6px"></div>' +
    '<label>Warna <input type="color" id="col" value="#e02020"></label><div id="hp"></div>';
document.body.appendChild(ui);
const stBtns = [];
function btn(label, fn, isState) {
    const b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'background:#1d2129;color:inherit;border:1px solid #394150;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit';
    b.onclick = () => fn(b); document.getElementById('bt').appendChild(b); if (isState) stBtns.push(b); return b;
}
function pick(b, s) { setState(s); stBtns.forEach(x => x.style.background = x === b ? '#e02020' : '#1d2129') }
pick(btn('Diam', b => pick(b, 'idle'), true), 'idle');
btn('Jalan', b => pick(b, 'walk'), true); btn('Lompat', b => pick(b, 'jump'), true);
btn('Hit (-1 HP)', () => { health = Math.max(0, health - 1); hit = 1; showHP() });
btn('Heal (+1 HP)', () => { health = Math.min(MAX_HP, health + 1); showHP() });
btn('Lihat belakang', () => { cyT = Math.abs(cyT % TAU) > 2 ? -.4 : Math.PI });
const colEl = document.getElementById('col'), hpEl = document.getElementById('hp');
function showHP() { hpEl.textContent = 'Health ' + health + ' / ' + MAX_HP }
showHP();

function resize() {
    const d = window.devicePixelRatio || 1, w = canvas.clientWidth * d | 0, h = canvas.clientHeight * d | 0;
    if (canvas.width != w || canvas.height != h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); Pr = M.persp(.8, w / h, .1, 60) }
}
let last = performance.now();
function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    if (state === 'walk') ang += dt * .8;
    hit = Math.max(0, hit - dt * 2.2);
    if (!drag) cy += (cyT - cy) * (1 - Math.exp(-dt * 6));
    const T = target(state, t, cur.yaw), k = 1 - Math.exp(-dt * 7);
    for (const key in T) cur[key] += (T[key] - cur[key]) * k;
    // efek terkena hit (di atas pose saat ini): terhuyung ke belakang, bergetar, telinga terlempar, mata menyipit
    const D = Object.assign({}, cur, { tx: cur.tx - .35*hit, shx: cur.shx + .03*Math.sin(60*t)*hit, flop: cur.flop + 1.4*hit,
        lx: cur.lx * (1 - hit), ly: cur.ly * (1 - hit), hp: cur.hp - .2*hit });
    const bl = Math.max(0, 1 - Math.abs((t % 3.7) - .1) / .1) * .92, eye = (1 - bl) * (1 - .6*hit);
    resize();
    gl.clearColor(.05, .06, .08, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    V = mm(M.T(0, 0, -dist), M.RX(cp), M.RY(cy), M.T(0, -1.3, 0));
    gl.uniformMatrix4fv(U.uPr, false, Pr);
    lines(grid, [.16, .19, .24]);
    drawBot(D, Math.max(.08, eye), rgb(colEl.value));
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);