'use strict';
/* Preview ENVIRONMENT lorong gudang. Karakter belum digambar (menyusul).
   Berisi: shader (8 lampu titik + kabut), mesh satuan, kamera orbit / fly-through, patokan skala. */

/* ===== 1. WebGL & shader ===== */
const canvas = document.getElementById('mycanvas');
const gl = canvas.getContext('webgl', { antialias: true });
if (!gl) throw alert('WebGL tidak didukung browser ini');
const VS = `attribute vec3 aP,aN;uniform mat4 uMV,uPr;uniform mat3 uNM;varying vec3 vN,vP;
void main(){vec4 p=uMV*vec4(aP,1.);vP=p.xyz;vN=uNM*aN;gl_Position=uPr*p;}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN,vP;
uniform vec3 uC,uFog,uAmb,uLP[8],uLC[8];
uniform float uFlat,uSpec,uFogD;
void main(){
  float dist=length(vP);
  vec3 col=uC;
  if(uFlat<.5){
    vec3 v=-vP/dist,n=normalize(vN);if(dot(n,v)<0.)n=-n;
    vec3 dif=uAmb,spc=vec3(0.);
    for(int i=0;i<8;i++){
      vec3 L=uLP[i]-vP;float d=length(L);L/=d;
      float att=1./(1.+.06*d*d);
      dif+=uLC[i]*att*max(dot(n,L),0.);
      spc+=uLC[i]*att*pow(max(dot(n,normalize(L+v)),0.),24.)*uSpec;
    }
    col=uC*dif+spc;
  }
  gl_FragColor=vec4(mix(uFog,col,exp(-uFogD*dist)),1.);
}`;
function sh(t, s) {
    const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o));
    return o;
}
const pg = gl.createProgram();
gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(pg); gl.useProgram(pg);
if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(pg));
const U = {};
['uMV', 'uPr', 'uNM', 'uC', 'uFog', 'uAmb', 'uLP[0]', 'uLC[0]', 'uFlat', 'uSpec', 'uFogD'].forEach(n => U[n] = gl.getUniformLocation(pg, n));
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
    persp(f, a, n, r) { const t = 1 / Math.tan(f / 2), m = new Float32Array(16); m[0] = t / a; m[5] = t; m[10] = (r + n) / (n - r); m[11] = -1; m[14] = 2 * r * n / (n - r); return m },
    look(e, c) {   // kamera dari titik e menatap titik c (sumbu atas = Y)
        const n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l] };
        const cr = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        const f = n([c[0]-e[0], c[1]-e[1], c[2]-e[2]]), s = n(cr(f, [0, 1, 0])), u = cr(s, f), m = M.id();
        m[0] = s[0]; m[4] = s[1]; m[8] = s[2];  m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
        m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
        m[12] = -(s[0]*e[0] + s[1]*e[1] + s[2]*e[2]); m[13] = -(u[0]*e[0] + u[1]*e[1] + u[2]*e[2]); m[14] = f[0]*e[0] + f[1]*e[1] + f[2]*e[2];
        return m;
    }
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
function upload(V, N, I) {
    const vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, interleave(V, N), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
    return { vb, ib, n: I.length };
}
const SEG = 28;
const part = (v, s = SEG) => ({ v, rows: s + 1, cols: s + 1 });
const shift = (v, x, y, z) => v.map((a, i) => a + [x, y, z][i % 3]);
function buildMesh(parts) {   // tiap patch punya normal sendiri -> tepi tajam
    const V = [], N = [], I = [];
    for (const p of parts) {
        const off = V.length / 3, idx = createGridIndices(p.rows, p.cols), nor = computeNormals(p.v, idx);
        p.v.forEach(x => V.push(x)); nor.forEach(x => N.push(x)); idx.forEach(i => I.push(i + off));
    }
    return upload(V, N, I);
}
const disk = (r, y) => part(shift(createParaboloid(r, 0, SEG), 0, y, 0));   // piringan datar = paraboloid setinggi 0
const solidCyl = (r, h) => buildMesh([part(createCylinder(r, h, SEG)), disk(r, h / 2), disk(r, -h / 2)]);
const solidCone = (r, h) => buildMesh([part(createCone(r, h, SEG)), disk(r, -h / 2)]);   // puncak di atas
const box = (x, y, z) => buildMesh([      // x, y, z = SETENGAH ukuran
    [[-x,-y,z], [x,-y,z], [-x,y,z], [x,y,z]],
    [[x,-y,-z], [-x,-y,-z], [x,y,-z], [-x,y,-z]],
    [[x,-y,z], [x,-y,-z], [x,y,z], [x,y,-z]],
    [[-x,-y,-z], [-x,-y,z], [-x,y,-z], [-x,y,z]],
    [[-x,y,z], [x,y,z], [-x,y,-z], [x,y,-z]],
    [[-x,-y,-z], [x,-y,-z], [-x,-y,z], [x,-y,z]]
].map(face => part(face.flat(), 1)));

// mesh satuan: ukuran sebenarnya lewat M.S(...) = SETENGAH ukuran (kotak 1x1x1, silinder r=1 tinggi -1..1, dst.)
const unit = { box: box(1, 1, 1), cyl: solidCyl(1, 2), cone: solidCone(1, 2), sph: buildMesh([part(createSphere(1, 24))]) };

let V = M.id(), Pr = M.id();
function draw(m, model, col, flat, shine) {
    const mv = mm(V, model);
    gl.uniformMatrix4fv(U.uMV, false, mv); gl.uniformMatrix3fv(U.uNM, false, nmat(mv));
    gl.uniform3fv(U.uC, col); gl.uniform1f(U.uFlat, flat ? 1 : 0); gl.uniform1f(U.uSpec, shine === undefined ? .1 : shine);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
}
window.gl = gl;
window.pg = pg;
window.getV = () => V;
window.getPr = () => Pr;
const gfx = { unit, draw, gl, pg, getV: () => V, getPr: () => Pr };
Environment.init(gfx);

/* ===== 4. Kamera, UI, loop ===== */
const B = Environment.bounds;
let mode = 'orbit', cy = .2, cp = .25, dist = 13, drag = 0, lx0 = 0, ly0 = 0, showRef = false;
canvas.onpointerdown = e => { if (mode === 'scene') return; drag = 1; lx0 = e.clientX; ly0 = e.clientY; canvas.setPointerCapture(e.pointerId); mode = 'orbit'; syncBtn() };
canvas.onpointermove = e => { if (!drag) return; cy -= (e.clientX - lx0) * .008; cp = Math.min(.9, Math.max(-.1, cp + (e.clientY - ly0) * .008)); lx0 = e.clientX; ly0 = e.clientY };
canvas.onpointerup = () => drag = 0;
canvas.addEventListener('wheel', e => { if (mode === 'scene') return; e.preventDefault(); dist = Math.min(40, Math.max(3, dist + e.deltaY * .01)) }, { passive: false });

function viewMatrix(t) {
    if (mode === 'fly') {      // kamera menyusuri lorong, mulus (smoothstep)
        const u = (t % 45) / 45, e = u * u * (3 - 2 * u), z = B.Z0 + 1 + (B.Z1 - B.Z0 - 4) * e;
        return M.look([Math.sin(t * .6) * 2.2, 2.6 + .35 * Math.sin(t * .9), z], [Math.sin(t * .6 + .8) * 1.2, 2.3, z + 9]);
    }
    const tg = [0, 2.2, 8];
    return M.look([tg[0] + dist * Math.cos(cp) * Math.sin(cy), tg[1] + dist * Math.sin(cp), tg[2] + dist * Math.cos(cp) * Math.cos(cy)], tg);
}

const ui = document.createElement('div');
ui.style.cssText = 'position:fixed;left:12px;top:12px;display:flex;flex-direction:column;gap:8px;font:14px system-ui,sans-serif;color:#e8eaed';
ui.innerHTML = '<b>Preview environment: lorong gudang</b><div id="bt" style="display:flex;flex-wrap:wrap;gap:6px"></div>' +
    '<div style="font-size:12px;opacity:.7">Seret = putar kamera, scroll = zoom</div>';
document.body.appendChild(ui);
const btns = {};
function btn(key, label, fn) {
    const b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'border:1px solid #394150;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit;color:inherit';
    b.onclick = fn; document.getElementById('bt').appendChild(b); btns[key] = b;
}
function syncBtn() {
    const on = '#d98a2b', off = '#1d2129';
    btns.orbit.style.background = mode === 'orbit' ? on : off; btns.fly.style.background = mode === 'fly' ? on : off;
    btns.ref.style.background = showRef ? on : off;
    btns.scene.style.background = mode === 'scene' ? on : off;
}
btn('scene', 'Adegan', () => { mode = 'scene'; syncBtn() });
btn('orbit', 'Orbit bebas', () => { mode = 'orbit'; syncBtn() });
btn('fly', 'Fly-through', () => { mode = 'fly'; syncBtn() });
btn('ref', 'Patokan skala', () => { showRef = !showRef; syncBtn() });
syncBtn();

function resize() {
    const d = window.devicePixelRatio || 1, w = canvas.clientWidth * d | 0, h = canvas.clientHeight * d | 0;
    if (canvas.width != w || canvas.height != h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); Pr = M.persp(.9, w / h, .1, 200) }
}
const FOG = [.035, .035, .03];
const toView = (m, p) => [m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12], m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13], m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]];
let t = 0, last = performance.now();
function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    resize();
    const SC = typeof Scene !== 'undefined';
    if (SC) Scene.update(dt);
    const sceneOn = SC && Scene.on();
    gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    V = sceneOn ? Scene.view() : viewMatrix(t);
    gl.uniformMatrix4fv(U.uPr, false, Pr);
    const ak = sceneOn ? Scene.ambK() : 1;
    gl.uniform3fv(U.uFog, FOG); gl.uniform1f(U.uFogD, .03); gl.uniform3fv(U.uAmb, [.17 * ak, .17 * ak, .16 * ak]);
    const lights = sceneOn ? Scene.lights() : Environment.getLights(t), lp = [], lc = [];
    for (const l of lights) { lp.push(...toView(V, l.pos)); lc.push(...l.col) }
    gl.uniform3fv(U['uLP[0]'], lp); gl.uniform3fv(U['uLC[0]'], lc);

    Environment.draw(gfx);
    if (sceneOn) Scene.draw(gfx);

    if (showRef) {     // patokan ukuran (kotak): Semibot 2.0, Apex 1.5, Elsa bahu 0.9; magenta = titik sembunyi Elsa
        const h = Environment.elsaHide;
        draw(unit.cyl, mm(M.T(0, 1, 6), M.S(.35, 1, .35)), [.85, .15, .15], false, .3);
        draw(unit.box, mm(M.T(-2.2, .75, 6), M.S(.55, .75, .85)), [.9, .75, .2]);
        draw(unit.box, mm(M.T(2.2, .45, 6), M.S(.4, .45, 1.0)), [.7, .5, .3]);
        draw(unit.box, mm(M.T(h.x, .15, h.z), M.S(.4, .15, 1.0)), [1, 0, 1], true);
    }
    // Panggil drawSemibot(matriksPosisiSemibot), drawApex(matriksPosisiApex), drawElsa(matriksPosisiElsa) di sini (tahap berikutnya)
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
