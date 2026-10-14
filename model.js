/**
 * model.js  –  Apex Predator (R.E.P.O.)
 * 
 * Karakter anak ayam pemangsa kuning (Apex Predator):
 * - Memenuhi syarat akademis:
 *   1. Kurva 3D: Bezier Sweep 3D kubik untuk ekor (tail) yang melengkung ke atas.
 *   2. Tiga+ jenis Quadratic Object berbeda:
 *      - Ellipsoid          : Badan, kepala (tapered dome), mata, lengan, telapak & jari kaki
 *      - Elliptic Paraboloid: Paruh atas & paruh bawah (beak)
 *      - Cone (Kerucut)     : Jambul belakang kepala (crest) & taring tersembunyi (fangs)
 *      - Cylinder (Silinder): Batang kaki (legs)
 * - Warna: Kuning cerah anak ayam (#FFD21A), mata hitam pekat tanpa glare.
 * - Detail tangan: Dilengkapi 3 ujung bulu/jari pada tepi sayap sesuai siluet game.
 * - Jambul kepala: Jambul khas di belakang kepala sesuai siluet tampak samping.
 */

var C = {
    body     : [0.98, 0.82, 0.12],   // Kuning anak ayam cerah & hangat
    belly    : [1.00, 0.88, 0.24],   // Kuning sedikit lebih lembut/terang untuk perut depan
    crest    : [0.98, 0.80, 0.10],   // Kuning jambul kepala
    eye      : [0.02, 0.02, 0.02],   // Hitam pekat full
    beak     : [0.96, 0.78, 0.50],   // Oranye-peachy muda lembut (paruh bebek asli)
    mouth    : [0.45, 0.12, 0.12],   // Interior mulut gelap kemerahan
    fang     : [0.98, 0.98, 0.90],   // Gading putih taring
    arm      : [0.98, 0.82, 0.12],   // Kuning sayap/lengan
    leg      : [0.94, 0.58, 0.12],   // Oranye kaki bebek
    foot     : [0.94, 0.60, 0.14],   // Oranye telapak kaki
    toe      : [0.92, 0.56, 0.12],   // Oranye jari
    tail     : [0.98, 0.82, 0.12],   // Kuning ekor
};

/**
 * Bangun seluruh scene graph karakter Apex Predator.
 * Mengembalikan objek berisi root dan referensi ke node animasi.
 */
function buildApexPredator(GL, prog, _pos, _col, _Mmat) {

    function mkNode() {
        return new SceneNode(GL, prog, _pos, _col, _Mmat);
    }
    function tx(node, x) { LIBS.translateX(node.POSITION_MATRIX, x); }
    function ty(node, y) { LIBS.translateY(node.POSITION_MATRIX, y); }
    function tz(node, z) { LIBS.translateZ(node.POSITION_MATRIX, z); }
    function pos(node, x, y, z) { tx(node,x); ty(node,y); tz(node,z); }
    function rx(node, a) { LIBS.rotateX(node.POSITION_MATRIX, a); }
    function ry(node, a) { LIBS.rotateY(node.POSITION_MATRIX, a); }
    function rz(node, a) { LIBS.rotateZ(node.POSITION_MATRIX, a); }

    // ══════════════════════════════════════════════════════════════
    //  1. BADAN (BODY) — Quadric: ELLIPSOID
    // ══════════════════════════════════════════════════════════════
    var body = mkNode();
    // Badan agak membulat pir (tapered di atas, mengembang di bawah)
    body.setGeometry(generateEllipsoid(0.96, 1.04, 0.90, 28, 40, C.body, 0.18, -0.10));
    ty(body, 0.15);

    // Perut buncit (area depan menonjol membulat lembut)
    var belly = mkNode();
    belly.setGeometry(generateEllipsoid(0.74, 0.80, 0.52, 22, 32, C.belly));
    pos(belly, 0, -0.15, 0.44);

    // ══════════════════════════════════════════════════════════════
    //  2. KEPALA (HEAD) — Quadric: ELLIPSOID + CONE CREST
    //     Kubah kepala mengerucut mulus di atas (taperTop = 0.28)
    // ══════════════════════════════════════════════════════════════
    var head = mkNode();
    head.setGeometry(generateEllipsoid(1.08, 1.15, 1.02, 32, 44, C.body, 0.28, -0.08));
    pos(head, 0, 1.38, 0.02);

    // ──── Jambul belakang kepala utama — Quadric: CONE ────
    var crestBack = mkNode();
    crestBack.setGeometry(generateCone(0.38, 0.70, 16, C.crest));
    pos(crestBack, 0, 0.16, -0.82);
    rx(crestBack, -Math.PI * 0.50);

    // Jambul atas sekunder
    var crestUpper = mkNode();
    crestUpper.setGeometry(generateCone(0.24, 0.48, 14, C.crest));
    pos(crestUpper, 0, 0.36, -0.76);
    rx(crestUpper, -Math.PI * 0.44);

    // ══════════════════════════════════════════════════════════════
    //  3. PARUH (BEAK) — Quadric: ELLIPTIC PARABOLOID
    // ══════════════════════════════════════════════════════════════
    var beakUpper = mkNode();
    beakUpper.setGeometry(generateEllipticParaboloid(0.72, 0.22, 0.70, 16, 32, C.beak));
    pos(beakUpper, 0, -0.22, 1.44);
    rx(beakUpper, -Math.PI * 0.48);

    var beakLower = mkNode();
    beakLower.setGeometry(generateEllipticParaboloid(0.62, 0.16, 0.62, 14, 28, C.beak));
    pos(beakLower, 0, -0.36, 1.38);
    rx(beakLower, -Math.PI * 0.48);

    // Interior mulut (gelap kemerahan)
    var mouthInner = mkNode();
    mouthInner.setGeometry(generateEllipsoid(0.38, 0.12, 0.38, 10, 16, C.mouth));
    mouthInner.visible = false;
    pos(mouthInner, 0, -0.29, 0.95);

    // ══════════════════════════════════════════════════════════════
    //  4. MATA (EYES) — Quadric: ELLIPSOID
    // ══════════════════════════════════════════════════════════════
    var eyeL = mkNode();
    eyeL.setGeometry(generateEllipsoid(0.40, 0.44, 0.36, 24, 32, C.eye));
    pos(eyeL, -0.54, 0.08, 0.70);
    ry(eyeL, -0.22);

    var eyeR = mkNode();
    eyeR.setGeometry(generateEllipsoid(0.40, 0.44, 0.36, 24, 32, C.eye));
    pos(eyeR, 0.54, 0.08, 0.70);
    ry(eyeR, 0.22);

    // ══════════════════════════════════════════════════════════════
    //  5. TARING (FANGS) — Quadric: CONE (Mengarah tajam ke tengah)
    // ══════════════════════════════════════════════════════════════
    // Taring atas: meruncing ke bawah (arah -Y)
    var fangUL = mkNode();
    fangUL.setGeometry(generateCone(0.055, 0.25, 10, C.fang));
    fangUL.visible = false;
    pos(fangUL, -0.18, 0.02, -0.10);
    rx(fangUL, Math.PI); // putar 180 derajat agar tip mengarah ke bawah

    var fangUR = mkNode();
    fangUR.setGeometry(generateCone(0.055, 0.25, 10, C.fang));
    fangUR.visible = false;
    pos(fangUR, 0.18, 0.02, -0.10);
    rx(fangUR, Math.PI);

    // Taring bawah: meruncing ke atas (arah +Y)
    var fangLL = mkNode();
    fangLL.setGeometry(generateCone(0.045, 0.22, 10, C.fang));
    fangLL.visible = false;
    pos(fangLL, -0.14, -0.02, -0.10);

    var fangLR = mkNode();
    fangLR.setGeometry(generateCone(0.045, 0.22, 10, C.fang));
    fangLR.visible = false;
    pos(fangLR, 0.14, -0.02, -0.10);

    // Susun hierarki kepala
    beakUpper.children.push(fangUL, fangUR);
    beakLower.children.push(fangLL, fangLR);
    head.children.push(
        crestBack, crestUpper,
        beakUpper, beakLower, mouthInner,
        eyeL, eyeR
    );

    // ══════════════════════════════════════════════════════════════
    //  6. SAYAP / LENGAN (ARMS / WINGS) — Quadric: ELLIPSOID
    //     Bentuk sayap memipih mengikuti lambung samping, dengan
    //     3 gerigi bulu/jari pada tepi bawah-belakang sesuai game
    // ══════════════════════════════════════════════════════════════
    // ──── Lengan Kiri ────
    var wingL = mkNode();
    wingL.setGeometry(generateEllipsoid(0.18, 0.44, 0.30, 14, 22, C.arm));
    pos(wingL, -0.88, -0.06, 0.04);
    rz(wingL, 0.28);
    rx(wingL, 0.28);
    ry(wingL, 0.12);

    // 3 ujung bulu / jari lengan kiri di tepi belakang menonjol keluar jelas
    var wingL_f1 = mkNode();
    wingL_f1.setGeometry(generateEllipsoid(0.08, 0.20, 0.16, 8, 12, C.arm));
    pos(wingL_f1, -0.04, -0.14, -0.30);
    rx(wingL_f1, -0.65);

    var wingL_f2 = mkNode();
    wingL_f2.setGeometry(generateEllipsoid(0.09, 0.24, 0.18, 8, 12, C.arm));
    pos(wingL_f2, -0.02, -0.28, -0.34);
    rx(wingL_f2, -0.50);

    var wingL_f3 = mkNode();
    wingL_f3.setGeometry(generateEllipsoid(0.08, 0.18, 0.14, 8, 12, C.arm));
    pos(wingL_f3, 0.01, -0.40, -0.28);
    rx(wingL_f3, -0.30);

    wingL.children.push(wingL_f1, wingL_f2, wingL_f3);

    // ──── Lengan Kanan ────
    var wingR = mkNode();
    wingR.setGeometry(generateEllipsoid(0.18, 0.44, 0.30, 14, 22, C.arm));
    pos(wingR, 0.88, -0.06, 0.04);
    rz(wingR, -0.28);
    rx(wingR, 0.28);
    ry(wingR, -0.12);

    var wingR_f1 = mkNode();
    wingR_f1.setGeometry(generateEllipsoid(0.08, 0.20, 0.16, 8, 12, C.arm));
    pos(wingR_f1, 0.04, -0.14, -0.30);
    rx(wingR_f1, -0.65);

    var wingR_f2 = mkNode();
    wingR_f2.setGeometry(generateEllipsoid(0.09, 0.24, 0.18, 8, 12, C.arm));
    pos(wingR_f2, 0.02, -0.28, -0.34);
    rx(wingR_f2, -0.50);

    var wingR_f3 = mkNode();
    wingR_f3.setGeometry(generateEllipsoid(0.08, 0.18, 0.14, 8, 12, C.arm));
    pos(wingR_f3, -0.01, -0.40, -0.28);
    rx(wingR_f3, -0.30);

    wingR.children.push(wingR_f1, wingR_f2, wingR_f3);

    // ══════════════════════════════════════════════════════════════
    //  7. KAKI & TELAPAK — Quadric: CYLINDER + ELLIPSOID
    // ══════════════════════════════════════════════════════════════
    var legL = mkNode();
    legL.setGeometry(generateCylinder(0.16, 0.75, 16, C.leg));
    pos(legL, -0.34, -1.52, 0.05);

    var footL = mkNode();
    footL.setGeometry(generateEllipsoid(0.28, 0.08, 0.40, 10, 18, C.foot));
    pos(footL, 0, -0.04, 0.16);

    var toeL1 = mkNode();
    toeL1.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeL1, -0.18, 0, 0.30);
    ry(toeL1, -0.22);

    var toeL2 = mkNode();
    toeL2.setGeometry(generateEllipsoid(0.10, 0.07, 0.28, 8, 12, C.toe));
    pos(toeL2, 0, 0, 0.35);

    var toeL3 = mkNode();
    toeL3.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeL3, 0.18, 0, 0.30);
    ry(toeL3, 0.22);

    footL.children.push(toeL1, toeL2, toeL3);
    legL.children.push(footL);

    // ──── Kaki Kanan ────
    var legR = mkNode();
    legR.setGeometry(generateCylinder(0.16, 0.75, 16, C.leg));
    pos(legR, 0.34, -1.52, 0.05);

    var footR = mkNode();
    footR.setGeometry(generateEllipsoid(0.28, 0.08, 0.40, 10, 18, C.foot));
    pos(footR, 0, -0.04, 0.16);

    var toeR1 = mkNode();
    toeR1.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeR1, -0.18, 0, 0.30);
    ry(toeR1, -0.22);

    var toeR2 = mkNode();
    toeR2.setGeometry(generateEllipsoid(0.10, 0.07, 0.28, 8, 12, C.toe));
    pos(toeR2, 0, 0, 0.35);

    var toeR3 = mkNode();
    toeR3.setGeometry(generateEllipsoid(0.09, 0.07, 0.24, 8, 12, C.toe));
    pos(toeR3, 0.18, 0, 0.30);
    ry(toeR3, 0.22);

    footR.children.push(toeR1, toeR2, toeR3);
    legR.children.push(footR);

    // ══════════════════════════════════════════════════════════════
    //  8. EKOR (TAIL) — KURVA 3D: BEZIER SWEEP
    // ══════════════════════════════════════════════════════════════
    var tail = mkNode();
    tail.setGeometry(generateBezierSweep(
        [0,  0.00,  0.00],
        [0,  0.10, -0.20],
        [0,  0.35, -0.42],
        [0,  0.58, -0.58],
        0.22,   // baseRadius
        0.03,   // tipRadius
        18,     // segments
        16,     // slices
        C.tail
    ));
    pos(tail, 0, -0.16, -0.78);

    // ══════════════════════════════════════════════════════════════
    //  RAKIT SELURUH HIERARKI
    // ══════════════════════════════════════════════════════════════
    body.children.push(belly, head, wingL, wingR, legL, legR, tail);

    return {
        root      : body,
        head      : head,
        beakUpper : beakUpper,
        beakLower : beakLower,
        mouthInner: mouthInner,
        fangUL    : fangUL,
        fangUR    : fangUR,
        fangLL    : fangLL,
        fangLR    : fangLR,
        wingL     : wingL,
        wingR     : wingR,
        legL      : legL,
        legR      : legR,
        tail      : tail
    };
}
