/* =====================================================================
   ENVIRONMENT: lorong gudang bawah tanah (adegan kejar-kejaran)
   Modul mandiri: tidak mengubah kode karakter siapa pun.
   Butuh dari main.js: M, mm (matriks) dan gfx.unit (mesh satuan: box, cyl, cone, sph)
   Cara pakai:  Environment.init(gfx)  sekali,  Environment.draw(gfx)  tiap frame,
                Environment.getLights(t)  untuk lampu di shader.
   Sumbu: lorong membentang di Z (-10 sampai 40), lebar di X, tinggi di Y. Lantai di y = 0.
   Skala: Semibot setinggi 2.0 satuan.
   ===================================================================== */
const Environment = (() => {
    /* ---- ukuran utama (ubah di sini) ---- */
    const Z0 = -10, Z1 = 40;          // ujung awal dan akhir lorong
    const W = 6.5;                    // setengah lebar lorong (lebar total 13)
    const H = 6.0;                    // tinggi langit-langit
    const MID = (Z0 + Z1) / 2, LEN = Z1 - Z0;

    /* ---- palet (dari foto referensi: beton gelap, kayu cokelat, lampu amber, jendela kebiruan) ---- */
    const PAL = {
        floor: [.20, .19, .17], wall: [.29, .28, .24], ceil: [.13, .12, .10],
        wood: [.27, .17, .09], woodDark: [.19, .11, .06], concrete: [.36, .35, .30], plinth: [.24, .23, .20],
        pipe: [.23, .24, .22], metal: [.18, .19, .20], stripe: [.55, .45, .12],
        bulb: [1, .82, .5], shade: [.55, .38, .20], window: [.14, .20, .36],
        crate: [.42, .28, .14], crateBand: [.30, .19, .10], debris: [.33, .31, .27], seam: [.09, .09, .08]
    };

    /* ---- pilar rintangan di pinggir lorong (jalur tengah |x| < 4 tetap kosong) ---- */
    const pillars = [
        { x: -4.8, z: -4 }, { x: 4.8, z: 4 }, { x: -4.8, z: 12 },
        { x: 4.8, z: 20 }, { x: -4.8, z: 28 }, { x: 4.8, z: 36 }
    ];
    const ELSA_PILLAR = pillars[2];                                   // pilar tempat Elsa bersembunyi
    const elsaHide = { x: ELSA_PILLAR.x, z: ELSA_PILLAR.z + 1.9 };    // titik di balik pilar (dilihat dari arah -Z)

    /* ---- lampu dinding: 8 lampu bergantian kiri/kanan ---- */
    const LAMP_Z = [-7, -0.5, 6, 12.5, 19, 25.5, 32, 38.5];
    const lamps = LAMP_Z.map((z, i) => ({ pos: [(i % 2 ? 1 : -1) * (W - .6), 3.3, z], flicker: i === 5 }));

    const items = [];
    const add = (mesh, pos, scale, col, o = {}) => {
        const model = mm(M.T(pos[0], pos[1], pos[2]), M.RY(o.ry || 0), M.RX(o.rx || 0), M.RZ(o.rz || 0),
                         M.S(scale[0], scale[1], scale[2]));
        items.push({ mesh, model, col, flat: !!o.flat, shine: o.shine === undefined ? .08 : o.shine });
    };

    function init(gfx) {
        const { box, cyl, cone, sph } = gfx.unit;     // semua mesh satuan: ukuran lewat skala = SETENGAH ukuran

        /* lantai + sambungan + garis cat tepi */
        add(box, [0, -.1, MID], [W + .5, .1, LEN / 2 + .5], PAL.floor, { shine: .15 });
        for (let z = Z0; z <= Z1; z += 5) add(box, [0, .006, z], [W, .005, .03], PAL.seam);
        for (const s of [-1, 1]) add(box, [s * (W - .8), .007, MID], [.1, .005, LEN / 2], PAL.stripe);

        /* dinding kiri-kanan: beton + panel kayu bawah + pipa */
        for (const s of [-1, 1]) {
            add(box, [s * (W + .25), H / 2, MID], [.25, H / 2, LEN / 2 + .5], PAL.wall);
            add(box, [s * (W - .05), .6, MID], [.05, .6, LEN / 2], PAL.wood, { shine: .2 });
            add(box, [s * (W - .08), 1.25, MID], [.09, .05, LEN / 2], PAL.woodDark);
            add(cyl, [s * (W - .7), H - .9, MID], [.16, LEN / 2, .16], PAL.pipe, { rx: Math.PI / 2, shine: .3 });
        }

        /* langit-langit + balok kayu melintang */
        add(box, [0, H + .25, MID], [W + .5, .25, LEN / 2 + .5], PAL.ceil);
        for (let z = Z0 + 3; z < Z1; z += 6) add(box, [0, H - .2, z], [W, .2, .16], PAL.woodDark);

        /* dinding ujung: awal tertutup (pintu), akhir punya bukaan untuk lari keluar */
        const DW = 2, DH = 4.2, EW = W + .5;
        add(box, [0, H / 2, Z0 - .25], [EW, H / 2, .25], PAL.wall);
        add(box, [0, DH / 2, Z0 + .02], [DW, DH / 2, .08], PAL.wood, { shine: .2 });
        add(sph, [DW - .4, 2.1, Z0 + .12], [.07, .07, .07], PAL.stripe, { shine: .5 });
        add(box, [-(EW + DW) / 2, H / 2, Z1 + .25], [(EW - DW) / 2, H / 2, .25], PAL.wall);
        add(box, [(EW + DW) / 2, H / 2, Z1 + .25], [(EW - DW) / 2, H / 2, .25], PAL.wall);
        add(box, [0, (DH + H) / 2, Z1 + .25], [DW, (H - DH) / 2, .25], PAL.wall);
        for (const z of [Z0, Z1]) {
            for (const s of [-1, 1]) add(box, [s * (DW + .12), DH / 2, z], [.12, DH / 2, .3], PAL.woodDark);
            add(box, [0, DH + .12, z], [DW + .24, .12, .3], PAL.woodDark);
        }

        /* pilar: batang + alas + kepala */
        for (const p of pillars) {
            add(box, [p.x, H / 2, p.z], [.75, H / 2, .75], PAL.concrete, { shine: .1 });
            add(box, [p.x, .18, p.z], [.9, .18, .9], PAL.plinth);
            add(box, [p.x, H - .18, p.z], [.9, .18, .9], PAL.plinth);
        }

        /* peti kayu (rintangan): s = setengah sisi, ry = putaran, y0 = tinggi dasar (untuk tumpukan) */
        const crate = (x, z, s, ry, y0 = 0) => {
            add(box, [x, y0 + s, z], [s, s, s], PAL.crate, { ry, shine: .1 });
            add(box, [x, y0 + s, z], [s * 1.03, s * .14, s * 1.03], PAL.crateBand, { ry });
            add(box, [x, y0 + s, z], [s * .14, s * 1.03, s * 1.03], PAL.crateBand, { ry });
        };
        crate(-5.5, -7.5, .8, .15);  crate(-5.5, -7.5, .55, -.3, 1.6);
        crate(-5.4, 0, .7, -.1);     crate(-5.5, 8.5, .9, .2);
        crate(-5.4, 16.5, .8, .1);   crate(-5.5, 24, .85, -.2);  crate(-5.5, 24, .5, .25, 1.7);
        crate(-5.4, 32.5, .8, .12);
        crate(5.4, -8, .7, .1);      crate(5.5, -1, .9, -.15);
        crate(5.5, 9, .8, .2);       crate(5.5, 9, .55, -.2, 1.6);
        crate(5.4, 14.5, .7, -.1);   crate(5.5, 25, .9, .18);
        crate(5.4, 31, .75, -.12);   crate(5.4, 39, .7, .1);

        /* rak besi di dinding (seperti di foto ruang beton) */
        const shelf = (s, z) => {
            const x = s * (W - .3);
            for (const dz of [-1, 1]) add(box, [x, 1.2, z + dz], [.04, 1.2, .04], PAL.metal);
            for (const y of [.5, 1.2, 1.9]) add(box, [x, y, z], [.22, .03, 1.05], PAL.metal, { shine: .2 });
            add(box, [x, .72, z - .4], [.15, .2, .25], PAL.crate);
            add(box, [x, 1.4, z + .35], [.14, .18, .3], PAL.crateBand);
            add(cyl, [x, 2.05, z - .2], [.1, .15, .1], PAL.pipe, { shine: .3 });
        };
        shelf(-1, 4.5); shelf(1, 28.5);

        /* puing di lantai */
        const rubble = [[4.3, 23, .3, .08, .2, .4, .1], [4.7, 22.4, .2, .06, .25, -.5, .2], [3.9, 23.8, .25, .07, .18, .9, -.15]];
        for (const [x, z, a, b, c, ry, rz] of rubble) add(box, [x, b, z], [a, b, c], PAL.debris, { ry, rz });
        add(cone, [4.4, .22, 24.4], [.14, .22, .14], PAL.debris, { rz: .5 });
        add(cone, [3.8, .18, 22.2], [.12, .18, .12], PAL.debris, { rz: -.7 });

        /* jendela kebiruan di dinding kanan (kontras dingin terhadap lampu hangat) */
        add(box, [W - .05, 3, 26], [.05, .95, 1.15], PAL.woodDark);
        add(box, [W - .04, 3, 26], [.03, .8, 1.0], PAL.window, { flat: true });
        add(box, [W - .09, 3, 26], [.03, .05, 1.0], PAL.woodDark);
        add(box, [W - .09, 3, 26], [.03, .8, .05], PAL.woodDark);

        /* lampu dinding: lengan, tiang, kap (kerucut), bohlam menyala (bola, tidak kena pencahayaan) */
        lamps.forEach((l, i) => {
            const s = i % 2 ? 1 : -1, x = l.pos[0], z = l.pos[2];
            add(box, [s * (W - .25), 3.5, z], [.25, .04, .04], PAL.metal);
            add(cyl, [x, 3.38, z], [.05, .12, .05], PAL.metal);
            add(cone, [x, 3.75, z], [.28, .2, .28], PAL.shade, { shine: .1 });
            add(sph, [x, 3.42, z], [.1, .1, .1], PAL.bulb, { flat: true });
        });
    }

    const draw = gfx => { for (const it of items) gfx.draw(it.mesh, it.model, it.col, it.flat, it.shine); };

    // posisi lampu dan warnanya (satu lampu berkedip seperti suasana horor)
    function getLights(t) {
        return lamps.map(l => {
            const k = l.flicker ? 1 - .75 * (Math.sin(t * 37) * Math.sin(t * 23.7) > .55 ? 1 : 0) : 1;
            return { pos: l.pos, col: [1.0 * 1.7 * k, .62 * 1.7 * k, .28 * 1.7 * k] };
        });
    }

    return { init, draw, getLights, bounds: { Z0, Z1, W, H }, pillars, ELSA_PILLAR, elsaHide };
})();
