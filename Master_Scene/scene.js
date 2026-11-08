'use strict';
/* =====================================================================
   scene.js — adegan "R.E.P.O. – The Chase" (timeline, kamera, lampu, karakter)
   Dimuat SETELAH main.js. environment.js dan libs.js tidak diubah.
   Memakai dari main.js: M, mm, buildMesh, gfx.unit, gfx.draw.
   Kontrol: Spasi = jeda | R = ulang | 1-5 = loncat fase | H = sembunyikan UI

   TIMELINE (detik, total 62)                         RUBRIK
   Fase 1   0-12    Semibot masuk, jalan, berhenti     translate (jalan), kamera sorot telinga (hierarchical)
   Fase 2  12-25    berbalik 180°, lampu padam 14-15,  rotate (RY pi), scaling (Apex membesar,
                    Apex muncul & meraung, berbalik     Semibot meregang kaget)
   Fase 3  25-43    KEJAR: Semibot 2.1 u/s, Apex 2.2   translate + hierarchical (kaki, lengan, telinga)
   Fase 4  43-46.3  Elsa muncul dari pilar z=36, rem   scaling (squash saat rem)
   Fase 5  46.3-62  Apex menghantam, Semibot terlempar arbitrary axis (M.R_Arb) pada pose 'tumble'
                    (pusat badan maks y=3.0), fade, credits

   Semua posisi = fungsi murni dari waktu t, jadi loncat fase / jeda / restart aman.
   ===================================================================== */
const Scene = (() => {
    const PI2 = Math.PI * 2, DUR = 62, PH = [0, 12, 25, 43, 46.3];
    // t = jam adegan. Sengaja bernama `t` karena drawChar (kode Semibot) membaca `t` bebas untuk kibasan telinga.
    let t = 0, paused = false, hidden = false, cur = null;

    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const lerp = (a, b, k) => a + (b - a) * k;
    const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k) };
    const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    const angLerp = (a, b, k) => a + ((((b - a + Math.PI) % PI2) + PI2) % PI2 - Math.PI) * k;   // lewat jalur terpendek
    const bump = (a, b, x) => sstep(a, (a + b) / 2, x) * (1 - sstep((a + b) / 2, b, x));        // 0 -> 1 -> 0 di [a,b]

    /* ---------- rotasi sumbu sembarang (Rodrigues): sumbu dinormalisasi, radian, kolom-mayor 4x4 ---------- */
    if (!M.R_Arb) M.R_Arb = (a, x, y, z) => {
        const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
        const c = Math.cos(a), s = Math.sin(a), k = 1 - c, m = M.id();
        m[0] = c + x*x*k;     m[4] = x*y*k - z*s;  m[8]  = x*z*k + y*s;
        m[1] = y*x*k + z*s;   m[5] = c + y*y*k;    m[9]  = y*z*k - x*s;
        m[2] = z*x*k - y*s;   m[6] = z*y*k + x*s;  m[10] = c + z*z*k;
        return m;
    };

    /* =================== SEMIBOT ===================
       Kontrak: drawSemibot(gfx, root, pose, t, o)
         pose: 'idle' | 'walk' | 'run' | 'tumble'
       (Fungsi export tersedia dari Character/Semibot_Bunny_Ear/main.js.) */
    function semibotBox(gfx, root, pose, t, o = {}) {
        // Placeholder balok Semibot jika fungsi karakter belum tersedia
        const u = gfx.unit;
        gfx.draw(u.box, mm(root, M.T(0, 1.0, 0), M.S(.35, 1.0, .35)), [.8, .8, .8]); // Badan
        gfx.draw(u.box, mm(root, M.T(0.15, 2.2, 0), M.S(.05, .3, .05)), [1, 1, 1]);  // Telinga Kanan
        gfx.draw(u.box, mm(root, M.T(-0.15, 2.2, 0), M.S(.05, .3, .05)), [1, 1, 1]); // Telinga Kiri
    }
    const callSemibot = (...a) => (typeof drawSemibot === 'function' ? drawSemibot : semibotBox)(...a);

    /* =================== APEX ===================
       Kontrak: drawApex(gfx, root, pose, t, o)
         pose: 'idle' | 'roar' | 'run' | 'swat'    o.ph = fase langkah (rad)    o.scale = skala saat ini
         root sudah memuat posisi, yaw (menghadap +Z) dan skala seragam (Apex membesar 1 -> 1.45 saat mengamuk).
       Tempel kode Apex di bawah dan beri nama fungsinya drawApex: scene.js otomatis memakainya.
       (Boleh juga file terpisah yang mendefinisikan drawApex global.) */
    // [INSERT_APEX_CODE_HERE]
    function apexBox(gfx, root, pose, t, o = {}) {     // placeholder balok 1.1 x 1.5 x 1.7
        const u = gfx.unit, hop = pose === 'run' ? .05 * Math.abs(Math.sin(o.ph || 0)) : 0, R = mm(root, M.T(0, hop, 0));
        gfx.draw(u.box, mm(R, M.T(0, .75, 0), M.S(.55, .75, .85)), [.50, .10, .09]);
        gfx.draw(u.box, mm(R, M.T(0, 1.0, .98), M.S(.34, .3, .3)), [.62, .14, .11]);
        for (const s of [-1, 1]) gfx.draw(u.sph, mm(R, M.T(s * .17, 1.08, 1.27), M.S(.07, .07, .07)), [1, .35, .1], true);
    }
    const callApex = (...a) => (typeof drawApex === 'function' ? drawApex : apexBox)(...a);

    /* =================== ELSA ===================
       Kontrak: drawElsa(gfx, root, pose, t, o)
         pose: 'hide' (di balik pilar) | 'step' (keluar) | 'stand'    o.ph = fase langkah (rad)
         root = posisi + yaw (yaw = PI berarti menghadap -Z, ke arah Semibot). */
    // [INSERT_ELSA_CODE_HERE]
    function elsaBox(gfx, root, pose, t, o = {}) {     // placeholder balok 0.8 x 0.9 x 2.0
        const u = gfx.unit;
        gfx.draw(u.box, mm(root, M.T(0, .45, 0), M.S(.4, .45, 1.0)), [.22, .42, .58]);
        gfx.draw(u.box, mm(root, M.T(0, .8, 1.0), M.S(.25, .22, .25)), [.30, .52, .70]);
        for (const s of [-1, 1]) gfx.draw(u.sph, mm(root, M.T(s * .12, .86, 1.24), M.S(.05, .05, .05)), [.7, .95, 1], true);
    }
    const callElsa = (...a) => (typeof drawElsa === 'function' ? drawElsa : elsaBox)(...a);

    /* =================== LINTASAN ===================
       Jarak tempuh: percepatan linear 'ramp' detik, kecepatan v, lalu rem linear mulai tb selama bd detik. */
    function runDist(t, t0, v, ramp, tb, bd) {
        const a = Math.max(0, Math.min(t, tb) - t0), y = clamp(t - tb, 0, bd);
        return (a < ramp ? v * a * a / (2 * ramp) : v * (a - ramp / 2)) + v * y - v * y * y / (2 * bd);
    }
    function runSpeed(t, t0, v, ramp, tb, bd) {
        if (t < t0) return 0;
        return t < tb ? v * Math.min(1, (t - t0) / ramp) : v * Math.max(0, 1 - (t - tb) / bd);
    }
    const RUN = [25, 2.1, 2, 44.2, 1.3];      // Semibot: mulai, v (u/s), ramp, mulai rem, lama rem
    const RUNA = [25.5, 2.2, 2, 44.4, 1.4];   // Apex
    const rd = (t, p) => runDist(t, ...p), rs = (t, p) => runSpeed(t, ...p);
    const weaveX = z => .8 * Math.sin(.3 * (z + 5)), weaveYaw = z => Math.atan(.24 * Math.cos(.3 * (z + 5)));   // jalur sedikit berkelok, |x| < 0.8
    const Z_END = -5 + rd(1e3, RUN);                                    // ≈ 34.6

    const EP = Environment.pillars[5] || Environment.pillars[Environment.pillars.length - 1];   // pilar z = 36
    const E_HIDE = [EP.x, EP.z + 1.9], E_STAND = [.8, 37.4];
    const LAND = [-3.4, 36.2];                                          // titik mendarat Semibot

    function semiState(t) {
        const S = { x: 0, y: 0, z: -5, yaw: 0, pose: 'idle', k: 1, ph: 0, sq: 0, lean: 0, spin: undefined };
        if (t < 25) {
            S.z = lerp(-8.2, -5, sstep(2.5, 6.5, t));                                        // translate: masuk dari pintu
            S.pose = 'walk'; S.k = sstep(2.5, 3.2, t) * (1 - sstep(6.0, 6.7, t)); S.ph = (S.z + 8.2) * PI2 / 1.1;
            S.yaw = Math.PI * sstep(12.3, 14, t) * (1 - sstep(21.8, 23.6, t));               // rotate: berbalik 180° dan kembali
            const h = bump(15, 15.4, t);                                                     // kaget: lompat kecil + meregang
            S.y = .28 * h; S.sq = -.9 * h;
        } else if (t < 46.6) {
            const d = rd(t, RUN), v = rs(t, RUN), z = -5 + d, wv = sstep(25, 28, t), vk = clamp(v / RUN[1]);
            S.z = z; S.x = weaveX(z) * wv; S.yaw = weaveYaw(z) * wv * vk;
            S.pose = 'run'; S.k = clamp(v / .9); S.ph = d * PI2 / 1.5;                       // kaki mengikuti jarak
            const br = sstep(RUN[3], RUN[3] + .25, t) * (1 - sstep(RUN[3] + .9, RUN[3] + 1.9, t));
            S.lean = .14 * vk * (1 - br) - .28 * br;                                         // condong maju, lalu miring ke belakang saat rem
            S.sq = .75 * br;                                                                 // scaling: gepeng saat mengerem
        } else {
            const x0 = weaveX(Z_END), u = clamp((t - 46.6) / 2.8), e = u * u * (3 - 2 * u);
            S.x = lerp(x0, LAND[0], u); S.z = lerp(Z_END, LAND[1], u);
            S.y = 8 * u * (1 - u);                                                           // pusat badan: y = 1 + 8u(1-u), puncak 3.0
            S.pose = t < 49.4 ? 'tumble' : "idle";
            S.k = sstep(46.6, 46.8, t) * (1 - sstep(49.0, 49.8, t));
            S.spin = 2 * PI2 * e;                                                            // 2 putaran penuh -> mendarat tegak
            S.sq = .9 * bump(49.35, 50.2, t);
            S.yaw = angLerp(0, Math.atan2(E_STAND[0] - LAND[0], E_STAND[1] - LAND[1]), sstep(49.9, 51.5, t));
        }
        return S;
    }

    function apexState(t) {
        const d = rd(t, RUNA), v = rs(t, RUNA);
        let z = -9 + d;
        if (t >= 45.9) z += 1.5 * sstep(45.9, 46.5, t);                                      // lonjakan sebelum menghantam
        const wv = sstep(25.5, 28.5, t);
        const pose = v > .05 ? 'run' : (t >= 45.9 && t < 47.3 ? 'swat' : (t > 15.4 && t < 17.8 ? 'roar' : 'idle'));
        return {
            vis: t >= 14.4, x: weaveX(z) * wv, z, yaw: weaveYaw(z) * wv * clamp(v / RUNA[1]), pose, ph: d * PI2 / 1.7,
            scale: 1 + .3 * sstep(24.5, 44.5, t) + .15 * sstep(44.8, 46.0, t) + .12 * Math.sin(Math.PI * clamp((t - 15.4) / 2.4))   // scaling: membesar saat mengamuk
        };
    }

    function elsaState(t) {
        const k = sstep(43, 44.8, t), x = lerp(E_HIDE[0], E_STAND[0], k), z = lerp(E_HIDE[1], E_STAND[1], k);
        return { x, z, pose: k <= 0 ? 'hide' : (k < 1 ? 'step' : 'stand'), ph: k * PI2 * 1.5,
                 yaw: angLerp(Math.PI, Math.atan2(LAND[0] - x, LAND[1] - z), sstep(49.9, 51.6, t)) };   // menoleh ke Semibot
    }

    /* =================== LAMPU ===================
       Padam t = 14-15 (tersendat), lalu menyala dan Apex sudah ada. Hanya mengalikan warna lampu environment. */
    function lightK(t) {
        if (t < 13.4) return 1;
        if (t < 14) return (1 - sstep(13.4, 14, t)) * (Math.sin(t * 61) > .1 ? 1 : .25);
        if (t < 15) return 0;
        if (t < 15.7) return Math.sin(t * 70) > -.2 ? .45 + .55 * sstep(15, 15.7, t) : .08;
        return 1;
    }
    const lights = () => { const k = lightK(t); return Environment.getLights(t).map(l => ({ pos: l.pos, col: l.col.map(c => c * k) })); };
    const ambK = () => lerp(.22, 1, clamp(lightK(t) * 1.25));

    /* =================== KAMERA (M.look dari titik kamera ke titik bidik) =================== */
    const BL = .9;      // lama transisi antar shot (detik); shot bertanda cut:true = potong langsung
    const shots = [
        { t0: 0,    f: (t, q) => ({ e: [1.2, 1.5, q.s.z + 6.5], c: [0, 1.2, q.s.z] }) },                                     // 1 pembuka, pintu di belakang Semibot
        { t0: 7,    f: (t, q) => { const a = .7 * sstep(7, 12, t); return { e: [2.4 * Math.cos(a), 2.3, q.s.z + 2.4 * Math.sin(a)], c: [0, 2.2, q.s.z] } } },   // 2 close-up kepala + telinga
        { t0: 12,   f: (t, q) => { const k = sstep(12, 19, t); return { e: [lerp(4.6, 3.6, k), 1.7, lerp(-4.2, -5.4, k)], c: [0, 1.3, -7.4] } } },   // 3 berbalik, gelap, Apex muncul
        { t0: 19,   cut: true, f: (t, q) => ({ e: [1.1, 1.0, lerp(-6.0, -6.8, sstep(19, 25, t))], c: [0, 1.15, -9] }) },        // 4 wajah Apex dari bawah
        { t0: 25,   cut: true, f: (t, q) => ({ e: [.9, 1.25, q.s.z + 5.5], c: [q.s.x * .6, 1.1, q.s.z - 1.2] }) },             // 5 kejar: depan Semibot (menatap -Z), Apex di belakangnya
        { t0: 31,   f: (t, q) => { const m = (q.s.z + q.a.z) / 2; return { e: [3.3, 1.7, m + .2], c: [q.s.x * .5, 1.05, m] } } },     // 6 samping (sebelum z = 22)
        { t0: 38,   f: (t, q) => ({ e: [q.a.x * .4 + .6, 2.1, q.a.z - 5.2], c: [0, 1.2, q.s.z + 1.5] }) },                      // 7 dari belakang Apex
        { t0: 43.2, cut: true, f: (t, q) => ({ e: [-2.2, 1.3, 39.4], c: [.3, 1.1, 33.5] }) },                                    // 8 Elsa muncul, Semibot berlari ke arah kamera
        { t0: 46.4, cut: true, f: (t, q) => ({ e: [4.0, 1.9, 31.8], c: [q.s.x, q.s.y + 1, q.s.z] }) },                          // 9 melacak lemparan
        { t0: 50,   f: (t, q) => { const k = sstep(50, 60, t); return { e: [lerp(2.4, .6, k), lerp(1.7, 1.4, k), lerp(30.8, 32.6, k)], c: [-1.4, 1.1, 36.6] } } }   // 10 penutup, dorong pelan
    ];
    function view() {
        let i = 0; while (i + 1 < shots.length && t >= shots[i + 1].t0) i++;
        let s = shots[i].f(t, cur); const n = shots[i + 1];
        if (n && !n.cut) { const k = sstep(n.t0 - BL, n.t0, t); if (k > 0) { const s2 = n.f(t, cur); s = { e: mix3(s.e, s2.e, k), c: mix3(s.c, s2.c, k) } } }
        const a = .03 * sstep(26, 28, t) * (1 - sstep(44, 45, t)) + .05 * bump(15.4, 17.4, t) + .09 * bump(46.5, 47.6, t);   // getar: lari, raungan, hantaman
        return M.look([s.e[0] + a * Math.sin(t * 47), s.e[1] + a * Math.sin(t * 61 + 1), s.e[2]], s.c);
    }

    /* =================== GAMBAR =================== */
    function draw(gfx) {
        const { s, a, e } = cur;
        callSemibot(gfx, mm(M.T(s.x, s.y, s.z), M.RY(s.yaw)), s.pose, t, { k: s.k, ph: s.ph, sq: s.sq, lean: s.lean, spin: s.spin });
        if (a.vis) callApex(gfx, mm(M.T(a.x, 0, a.z), M.RY(a.yaw), M.S(a.scale, a.scale, a.scale)), a.pose, t, { ph: a.ph, scale: a.scale });
        callElsa(gfx, mm(M.T(e.x, 0, e.z), M.RY(e.yaw)), e.pose, t, { ph: e.ph });
    }

    /* =================== OVERLAY HTML + KONTROL =================== */
    const CREDITS = [['Semibot', 'Ricson Witamso'], ['Apex', 'Jason Maximilian Ungranesia'], ['Elsa', 'Davin Edbert Lie']];
    const el = {};
    const on = () => typeof mode === 'undefined' || mode === 'scene';
    function buildUI() {
        const mk = (css, html = '') => { const d = document.createElement('div'); d.style.cssText = css; d.innerHTML = html; document.body.appendChild(d); return d };
        const fill = 'position:fixed;inset:0;pointer-events:none;';
        const ctr = fill + 'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#e8dfc8;text-shadow:0 0 24px #000;opacity:0;';
        el.fade = mk(fill + 'background:#000;opacity:1;');
        el.title = mk(ctr + 'font:700 clamp(28px,6vw,72px) Georgia,serif;letter-spacing:.18em;',
            'R.E.P.O.<div style="font:400 clamp(12px,1.6vw,20px) system-ui,sans-serif;letter-spacing:.5em;opacity:.7;margin-top:14px">THE CHASE</div>');
        el.cred = mk(ctr, '<div style="font:700 clamp(22px,3.4vw,40px) Georgia,serif;letter-spacing:.2em;margin-bottom:18px">R.E.P.O. – THE CHASE</div>' +
            CREDITS.map(([r, n]) => `<div style="margin:6px 0;font:clamp(13px,1.6vw,20px) system-ui,sans-serif"><span style="opacity:.6">${r}</span> &nbsp; ${n}</div>`).join(''));
        el.hud = mk('position:fixed;right:12px;top:12px;font:12px/1.5 system-ui,sans-serif;color:#e8eaed;text-align:right;pointer-events:none;text-shadow:0 0 4px #000');
    }
    function overlays() {
        const o = on();
        el.fade.style.opacity = o ? Math.max(1 - sstep(0, 1.6, t), sstep(56.2, 58.4, t)) : 0;     // fade-in awal, fade-out akhir
        el.title.style.opacity = o ? sstep(.4, 1.4, t) * (1 - sstep(3.6, 4.6, t)) : 0;
        el.cred.style.opacity = o ? sstep(58.8, 60, t) : 0;
        el.hud.style.display = hidden ? 'none' : '';
        el.hud.innerHTML = o ? `Fase ${PH.filter(p => t >= p).length} · ${t.toFixed(1)} / ${DUR} s${paused ? ' · JEDA' : ''}<br><span style="opacity:.65">Spasi jeda · R ulang · 1–5 fase · H sembunyikan UI</span>` : '';
    }
    function update(dt) {
        if (!paused && on()) t = Math.min(DUR, t + dt);
        cur = { s: semiState(t), a: apexState(t), e: elsaState(t) };
        overlays();
    }

    addEventListener('keydown', ev => {
        if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const k = ev.key.toLowerCase();
        if (k === ' ') { paused = !paused; ev.preventDefault(); }
        else if (k === 'h') { hidden = !hidden; if (typeof ui !== 'undefined') ui.style.display = hidden ? 'none' : 'flex'; }
        else if (k === 'r' || (k >= '1' && k <= '5')) {
            t = k === 'r' ? 0 : PH[+k - 1]; paused = false;
            if (typeof mode !== 'undefined') { mode = 'scene'; if (typeof syncBtn === 'function') syncBtn(); }
        }
    });

    buildUI();
    cur = { s: semiState(0), a: apexState(0), e: elsaState(0) };
    if (typeof mode !== 'undefined') { mode = 'scene'; if (typeof syncBtn === 'function') syncBtn(); }
    window.drawSemibot = drawSemibot;

    return { update, on, view, lights, ambK, draw, drawSemibot, seek: s => { t = clamp(s, 0, DUR) }, state: () => cur, DUR };
})();