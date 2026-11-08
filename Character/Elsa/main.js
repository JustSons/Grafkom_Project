/* main.js - Karakter anjing (Elsa) dengan WebGL: ellipsoid + cone + kurva Bezier */
(function () {
  const canvas = document.getElementById('glcanvas');
  let gl = canvas ? canvas.getContext('webgl') : null;

  const VS = `
    attribute vec3 aPos; attribute vec3 aNorm;
    uniform mat4 uModel, uViewProj; uniform mat3 uNormalMat;
    varying vec3 vN, vW, vL;
    void main(){
      vec4 w = uModel * vec4(aPos, 1.0);
      vW = w.xyz; vL = aPos; vN = normalize(uNormalMat * aNorm);
      gl_Position = uViewProj * w;
    }`;
  const FS = `
    precision mediump float;
    varying vec3 vN, vW, vL;
    uniform vec3 uColor, uEye, uSceneTint; uniform float uMouth, uSceneLight;
    void main(){
      vec3 N = normalize(vN), L = normalize(vec3(0.5, 1.0, 0.8));
      float inside = 0.0; // mode 5 (mangkuk dagu): sisi dalam = bagian dalam mulut
      if (uMouth > 4.5 && dot(N, normalize(uEye - vW)) < 0.0) { N = -N; inside = 1.0; }
      float d = max(dot(N, L), 0.0);
      vec3 V = normalize(uEye - vW), H = normalize(L + V);
      float s = pow(max(dot(N, H), 0.0), 24.0) * 0.15;
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.08;
      vec3 col = uColor * (0.38 + 0.78 * d) + vec3(s + rim);
      if (uMouth > 2.5 && uMouth < 4.5) col = uColor * (0.45 + 0.8 * d) + vec3(s + rim);
      col *= mix(vec3(1.0), vec3(0.3, 0.22, 0.18), inside);
      // uMouth=1: kepala (bagian bawah-depan jadi bagian dalam mulut), uMouth=2: moncong (langit-langit mulut)
      float mk = 0.0, dk = 0.0; vec3 mc = vec3(0.03, 0.015, 0.015) * (0.5 + d);
      if (uMouth > 3.5 && uMouth < 4.5) { // bagian dalam telinga: lanjutan pink di bagian bawah ujung
        float rr = max(1.0 - vL.y, 0.02); mk = smoothstep(0.25, 0.4, vL.z / rr) * (1.0 - smoothstep(0.62, 0.72, abs(vL.x) / rr)) * (1.0 - smoothstep(0.78, 0.9, vL.y));
        mc = vec3(0.80, 0.46, 0.43) * (0.45 + 0.7 * d);
      }
      else if (uMouth > 2.5 && uMouth < 3.5) { // bagian dalam telinga (merah muda) dilukis di permukaan pangkal telinga
        float rr = 1.0 - 0.2 * vL.y; mk = smoothstep(0.25, 0.4, vL.z / rr) * (1.0 - smoothstep(0.62, 0.72, abs(vL.x) / rr));
        mc = vec3(0.80, 0.46, 0.43) * (0.45 + 0.7 * d);
      }
      else if (uMouth > 0.5 && uMouth < 1.5) { // kepala: bagian dalam kantong mulut (atap hitam, lantai cokelat muda) mengikuti kedalaman
        float r = length(vL), im = 1.0 - smoothstep(0.86, 0.985, r);
        float fl = 1.0 - smoothstep(-0.31, -0.19, vL.y);
        col = mix(col, col * mix(vec3(0.02), vec3(0.36, 0.29, 0.25), fl), im);
      }
      col = mix(col, col * vec3(0.64, 0.6, 0.56), dk);
      col = mix(col, mc, mk);
      gl_FragColor = vec4(col * uSceneLight * uSceneTint, 1.0);
    }`;

  let prog, aPos, aNorm, uModel, uVP, uNM, uColor, uEye, uMouth, uSceneLight, uSceneTint;
  let ellipsoid, cone, coneFrustum, legTube, hindLegTube, tailTube, headMesh, chinBowl;

  function initElsaMeshes(_gl) {
    if (prog) return;
    gl = _gl;
    prog = createProgram(gl, VS, FS);
    aPos = gl.getAttribLocation(prog, 'aPos'); aNorm = gl.getAttribLocation(prog, 'aNorm');
    uModel = gl.getUniformLocation(prog, 'uModel'); uVP = gl.getUniformLocation(prog, 'uViewProj');
    uNM = gl.getUniformLocation(prog, 'uNormalMat'); uColor = gl.getUniformLocation(prog, 'uColor');
    uEye = gl.getUniformLocation(prog, 'uEye'); uMouth = gl.getUniformLocation(prog, 'uMouth');
    uSceneLight = gl.getUniformLocation(prog, 'uSceneLight');
    uSceneTint = gl.getUniformLocation(prog, 'uSceneTint');

    ellipsoid = createMesh(gl, Geo.ellipsoid());
    cone = createMesh(gl, Geo.cone());
    coneFrustum = createMesh(gl, Geo.cone(32, 0.8));
    legTube = createMesh(gl, Geo.bezierTube(
      [[0, 0, 0], [0, -0.18, 0.06], [0, -0.34, -0.04], [0, -0.5, 0.0]], t => 0.15 - 0.045 * t));
    hindLegTube = createMesh(gl, Geo.bezierTube(
      [[0, 0, 0], [0, -0.18, -0.08], [0, -0.34, 0.05], [0, -0.5, 0.0]], t => 0.19 - 0.08 * t));
    tailTube = createMesh(gl, Geo.bezierTube(
      [[0, 0, 0], [0, 0.04, -0.14], [0, 0.2, -0.2], [0, 0.36, -0.1]],
      t => Math.max(0.02, 0.075 * (1 - 0.6 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.85) / 0.15), 2))))));
    headMesh = createMesh(gl, Geo.sculptedHead(150, 220, { mouth: { smile: 0.75 } }));
    chinBowl = createMesh(gl, Geo.ellipsoidPatch([0, -1, 0], [0, 0, 1], 0, Math.PI / 2, 0, 2 * Math.PI, 24, 56));
  }

  function draw(mesh, M, color, mouth) {
    gl.uniformMatrix4fv(uModel, false, M);
    gl.uniformMatrix3fv(uNM, false, Mat4.normalMatrix(M));
    gl.uniform3fv(uColor, color);
    gl.uniform1f(uMouth, mouth || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm); gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  const { translation: T, scaling: S, rotX, rotY, rotZ, chain } = Mat4;
  const FUR = [1, 1, 0.999], FUR_D = [0.56, 0.45, 0.35], DARK = [0.08, 0.06, 0.05];
  const TONGUE = [0.93, 0.5, 0.52];

  // Skala seluruh badan Elsa (1 = ukuran semula). 0.8 = 20% lebih kecil; kaki tetap menapak karena skala dari titik tanah (root)
  const ELSA_SCALE = 0.5;

  function rotArbitraryAxis(angle, x, y, z) {
    const length = Math.hypot(x, y, z);
    x /= length; y /= length; z /= length;
    const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c;
    const m = Mat4.identity();
    m[0] = c + x * x * k;     m[4] = x * y * k - z * s; m[8] = x * z * k + y * s;
    m[1] = y * x * k + z * s; m[5] = c + y * y * k;     m[9] = y * z * k - x * s;
    m[2] = z * x * k - y * s; m[6] = z * y * k + x * s; m[10] = c + z * z * k;
    return m;
  }

  function shrinkElsa(elapsed) {
    const progress = Math.max(0, Math.min(1, elapsed));
    const smooth = progress * progress * (3 - 2 * progress);
    return 1 - 0.1 * smooth;
  }
  window.shrinkElsa = shrinkElsa;

  function renderElsaBody(root, w, amp, t, scale = 1) {
    const bob = 0.025 * amp * Math.sin(2 * w);
    const bodyScale = ELSA_SCALE * scale;
    const rootElsa = chain(root, S(bodyScale, bodyScale, bodyScale), T(0, bob, 0));   // skala dulu, lalu gerak naik-turun (ikut mengecil)

    draw(ellipsoid, chain(rootElsa, T(0, 0.85, -0.14), S(0.44, 0.4, 0.6)), FUR); // badan
    draw(ellipsoid, chain(rootElsa, T(0, 1, 0.25), S(0.44, 0.5, 0.45)), FUR); // leher
    draw(tailTube, chain(rootElsa, T(0, 0.98, -0.66), rotArbitraryAxis(0.5 * Math.sin(8 * t), 0.2, 1, 0.35), rotX(0.1)), FUR); // ekor

    [[0.25, 0.36, 0, false], [-0.25, 0.36, Math.PI, false], [0.26, -0.46, Math.PI, true], [-0.26, -0.46, 0, true]].forEach(([x, z, ph, hind]) => {
      const sx = Math.sign(x);
      const hip = chain(rootElsa, T(x, 0.56, z), rotX(0.45 * amp * Math.sin(w + ph)));
      draw(hind ? hindLegTube : legTube, hip, FUR);
      draw(ellipsoid, chain(hip, T(0, -0.5, 0.07), S(0.125, 0.055, 0.17)), FUR);
      if (hind) draw(ellipsoid, chain(hip, T(0.005 * sx, 0.14, -0.01), S(0.2, 0.3, 0.3)), FUR);
      else draw(ellipsoid, chain(hip, T(0.03 * sx, 0.17, 0.0), S(0.2, 0.3, 0.2)), FUR);
    });

    const P = [0, 1.2, 0.4];
    const head = chain(rootElsa, T(0, 0.3, -0.27), T(...P), rotX(0.05 * amp * Math.sin(2 * w + 1)), rotY(0.08 * Math.sin(t * 0.9)), T(-P[0], -P[1], -P[2]));

    draw(headMesh, chain(head, T(0, 1.62-0.3, 0.63), S(0.5, 0.48, 0.43)), FUR, 1); // kepala (bagian bawah-depan jadi bagian dalam mulut)
    draw(ellipsoid, chain(head, T(0, 1.7-0.3, 1.18), S(0.1, 0.07, 0.075)), DARK); // moncong (bagian atas kepala)
    draw(ellipsoid, chain(head, T(0.17, 1.78-0.3, 1.0), S(0.06, 0.062, 0.05)), DARK); // mata
    draw(ellipsoid, chain(head, T(-0.17, 1.78-0.3, 1.0), S(0.06, 0.062, 0.05)), DARK); // mata
    draw(chinBowl, chain(head, T(0, 1.25, 0.79), rotX(0.4), S(0.3, 0.42, 0.32)), FUR, 5); //mangkuk dagu (bagian dalam mulut)
    draw(ellipsoid, chain(head, T(0, 1.23, 0.79), rotX(0.4), S(0.295, 0.025, 0.311)), DARK); //penutup mulut (bagian bawah-depan kepala) agar tidak terlihat dari luar
    draw(ellipsoid, chain(head, T(0, 1.2, 0.9 + 0.02 * Math.sin(5 * t)), rotX(0.35), S(0.1, 0.03, 0.26)), TONGUE); // lidah (bagian dalam mulut)

    const twitch = 0.06 * Math.sin(3 * t);
    [1, -1].forEach(sx => {
      const base = chain(head, T(0.21 * sx, 1.88-0.3, 0.56), rotZ(-sx * (0.26 + twitch)));
      const tip = chain(base, T(0, 0.2, 0));
      draw(coneFrustum, chain(base, S(0.17, 0.2, 0.112)), FUR, 3); // telinga putih dengan bagian dalam merah muda
      draw(cone, chain(tip, S(0.136, 0.28, 0.09)), FUR, 4); // lanjutkan warna merah muda ke ujung telinga
    });
  }

  // EXPORT UNTUK MASTER SCENE:
  window.drawElsa = function(gfx, root, pose, t, o) {
    if (pose === 'hide') return;
    const _gl = window.gl || (gfx && gfx.gl);
    if (!_gl) return;
    initElsaMeshes(_gl);

    gl.useProgram(prog);
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNorm);

    const vp = Mat4.mul(window.getPr(), window.getV());
    gl.uniformMatrix4fv(uVP, false, vp);
    gl.uniform3fv(uEye, [0, 2, 10]);

    o = o || {};
    const ph = o.ph || 0;
    const scale = typeof o.scale === 'number' ? o.scale : 1;
    const sceneLight = typeof o.lit === 'number' ? o.lit : 1;
    gl.uniform1f(uSceneLight, sceneLight);
    gl.uniform3fv(uSceneTint, o.lightTint || [1, 1, 1]);
    const isStep = (pose === 'step');
    renderElsaBody(root, ph, isStep ? 1 : 0, t, scale);

    if (window.pg) gl.useProgram(window.pg);
  };

  // STANDALONE VIEWER
  if (canvas && !window.MASTER_SCENE) {
    if (!gl) { alert('WebGL tidak didukung'); return; }
    initElsaMeshes(gl);
    gl.useProgram(prog);
    gl.uniform1f(uSceneLight, 1);
    gl.uniform3fv(uSceneTint, [1, 1, 1]);
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNorm);
    gl.enable(gl.DEPTH_TEST);

    let walking = true, amp = 1, time = 0, last = performance.now();
    let yaw = 0.6, pitch = 0.18, dist = 5.0, drag = false, lx = 0, ly = 0;
    const walkEl = document.getElementById('walk');
    if (walkEl) walkEl.addEventListener('change', e => (walking = e.target.checked));
    canvas.addEventListener('mousedown', e => { drag = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => (drag = false));
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      yaw -= (e.clientX - lx) * 0.01; pitch = Math.min(1.3, Math.max(-0.1, pitch + (e.clientY - ly) * 0.01));
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); dist = Math.min(10, Math.max(2.5, dist + e.deltaY * 0.004)); }, { passive: false });

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize); resize();

    function frame(now) {
      const dt = (now - last) / 1000; last = now; time += dt;
      amp += ((walking ? 1 : 0) - amp) * Math.min(1, dt * 6);
      const w = 6 * time;

      gl.clearColor(0.93, 0.95, 0.97, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const eye = [dist * Math.cos(pitch) * Math.sin(yaw), 0.9 + dist * Math.sin(pitch), dist * Math.cos(pitch) * Math.cos(yaw)];
      const vp = Mat4.mul(Mat4.perspective(0.9, canvas.width / canvas.height, 0.1, 50), Mat4.lookAt(eye, [0, 0.9, 0], [0, 1, 0]));
      gl.uniformMatrix4fv(uVP, false, vp); gl.uniform3fv(uEye, eye);

      renderElsaBody(Mat4.identity(), w, amp, time);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();