/* main.js - Karakter anjing (Elsa) dengan WebGL: ellipsoid + cone + kurva Bezier */
(function () {
  const canvas = document.getElementById('glcanvas');
  const gl = canvas.getContext('webgl');
  if (!gl) { alert('WebGL tidak didukung'); return; }

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
    uniform vec3 uColor, uEye; uniform float uMouth;
    void main(){
      vec3 N = normalize(vN), L = normalize(vec3(0.5, 1.0, 0.8));
      float d = max(dot(N, L), 0.0);
      vec3 V = normalize(uEye - vW), H = normalize(L + V);
      float s = pow(max(dot(N, H), 0.0), 24.0) * 0.15;
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.08;
      vec3 col = uColor * (0.38 + 0.78 * d) + vec3(s + rim);
      // uMouth=1: kepala (bagian bawah-depan jadi bagian dalam mulut), uMouth=2: moncong (langit-langit mulut)
      float mk = 0.0, dk = 0.0; vec3 mc = vec3(0.03, 0.015, 0.015) * (0.5 + d);
      if (uMouth > 3.5) { // bagian dalam telinga: lanjutan pink di bagian bawah ujung
        float rr = max(1.0 - vL.y, 0.02); mk = smoothstep(0.25, 0.4, vL.z / rr) * (1.0 - smoothstep(0.62, 0.72, abs(vL.x) / rr)) * (1.0 - smoothstep(0.78, 0.9, vL.y));
        mc = vec3(0.80, 0.46, 0.43) * (0.45 + 0.7 * d); dk = 1.0 - smoothstep(0.5, 0.8, vL.y);
      }
      else if (uMouth > 2.5) { // bagian dalam telinga (merah muda) dilukis di permukaan pangkal telinga
        float rr = 1.0 - 0.2 * vL.y; mk = smoothstep(0.25, 0.4, vL.z / rr) * (1.0 - smoothstep(0.62, 0.72, abs(vL.x) / rr));
        mc = vec3(0.80, 0.46, 0.43) * (0.45 + 0.7 * d); dk = 1.0;
      }
      else if (uMouth > 0.5) { // kepala: bagian dalam kantong mulut (atap hitam, lantai cokelat muda) mengikuti kedalaman
        float r = length(vL), im = 1.0 - smoothstep(0.86, 0.985, r);
        float fl = 1.0 - smoothstep(-0.31, -0.19, vL.y);
        col = mix(col, col * mix(vec3(0.02), vec3(0.36, 0.29, 0.25), fl), im);
      }
      col = mix(col, col * vec3(0.64, 0.6, 0.56), dk);
      col = mix(col, mc, mk);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const prog = createProgram(gl, VS, FS);
  gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, 'aPos'), aNorm = gl.getAttribLocation(prog, 'aNorm');
  const uModel = gl.getUniformLocation(prog, 'uModel'), uVP = gl.getUniformLocation(prog, 'uViewProj');
  const uNM = gl.getUniformLocation(prog, 'uNormalMat'), uColor = gl.getUniformLocation(prog, 'uColor');
  const uEye = gl.getUniformLocation(prog, 'uEye'), uMouth = gl.getUniformLocation(prog, 'uMouth');
  gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNorm);
  gl.enable(gl.DEPTH_TEST);

  /* ---- Mesh ---- */
  const ellipsoid = createMesh(gl, Geo.ellipsoid());
  const cone = createMesh(gl, Geo.cone());
  const coneFrustum = createMesh(gl, Geo.cone(32, 0.8)); // kerucut terpotong (pangkal telinga)
  // kaki: kurva Bezier melengkung (relatif terhadap pinggul), tebal & pendek
  const legTube = createMesh(gl, Geo.bezierTube(
    [[0, 0, 0], [0, -0.18, 0.06], [0, -0.34, -0.04], [0, -0.5, 0.0]], t => 0.15 - 0.045 * t));
  const hindLegTube = createMesh(gl, Geo.bezierTube(
    [[0, 0, 0], [0, -0.18, -0.08], [0, -0.34, 0.05], [0, -0.5, 0.0]], t => 0.19 - 0.08 * t));
  // ekor: tonjolan pendek berkurva ke atas (relatif terhadap pangkal ekor)
  const tailTube = createMesh(gl, Geo.bezierTube(
    [[0, 0, 0], [0, 0.04, -0.14], [0, 0.2, -0.2], [0, 0.36, -0.1]],
    t => Math.max(0.02, 0.075 * (1 - 0.6 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.85) / 0.15), 2))))));

  // kepala: SATU permukaan utuh hasil pahatan satu ellipsoid -- moncong, kantong mulut (senyum) dan dagu rata ikut permukaan yang sama
  const headMesh = createMesh(gl, Geo.sculptedHead(150, 220, { mouth: { smile: 0.75 }, chin: { yBot: -0.8, yBot2: -1.0, wEdge: 0.45, zPlane: 0.82 } }));

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
  const FUR = [0.80, 0.66, 0.52], FUR_D = [0.56, 0.45, 0.35], DARK = [0.08, 0.06, 0.05];
  const TONGUE = [0.93, 0.5, 0.52], EAR_IN = [0.78, 0.45, 0.42], CAVITY = [0.03, 0.015, 0.015], FUR_L = [0.86, 0.72, 0.57], MOUTH = [0.18, 0.08, 0.07], SHADOW = [0.12, 0.12, 0.12];

  /* ---- Kontrol ---- */
  let walking = true, amp = 1, time = 0, last = performance.now();
  let yaw = 0.6, pitch = 0.18, dist = 5.0, drag = false, lx = 0, ly = 0;
  document.getElementById('walk').addEventListener('change', e => (walking = e.target.checked));
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

  /* ---- Render ---- */
  function frame(now) {
    const dt = (now - last) / 1000; last = now; time += dt;
    amp += ((walking ? 1 : 0) - amp) * Math.min(1, dt * 6);
    const w = 6 * time;

    gl.clearColor(0.93, 0.95, 0.97, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const eye = [
      dist * Math.cos(pitch) * Math.sin(yaw), 0.9 + dist * Math.sin(pitch), dist * Math.cos(pitch) * Math.cos(yaw)];
    const vp = Mat4.mul(Mat4.perspective(0.9, canvas.width / canvas.height, 0.1, 50),
      Mat4.lookAt(eye, [0, 0.9, 0], [0, 1, 0]));
    gl.uniformMatrix4fv(uVP, false, vp); gl.uniform3fv(uEye, eye);

    // bayangan (ellipsoid pipih)
    draw(ellipsoid, chain(T(0, 0.005, -0.1), S(0.75, 0.005, 1.15)), SHADOW);

    const bob = 0.025 * amp * Math.sin(2 * w);
    const root = T(0, bob, 0);

    // ===== BADAN (section): badan utama, dada, leher penyambung, pangkal ekor =====
    draw(ellipsoid, chain(root, T(0, 0.85, -0.14), S(0.44, 0.4, 0.6)), FUR);          // badan utama
    draw(ellipsoid, chain(root, T(0, 1, 0.25), S(0.44, 0.5, 0.45)), FUR);           // dada
    draw(tailTube, chain(root, T(0, 0.98, -0.66), rotY(0.5 * Math.sin(8 * time)), rotX(0.1)), FUR); // ekor (kurva Bezier)

    // ===== KAKI (section): bahu/paha + kaki bawah (kurva Bezier) + telapak; gaya jalan diagonal =====
    [[0.25, 0.36, 0, false], [-0.25, 0.36, Math.PI, false], [0.26, -0.46, Math.PI, true], [-0.26, -0.46, 0, true]].forEach(([x, z, ph, hind]) => {
      const sx = Math.sign(x);
      const hip = chain(root, T(x, 0.56, z), rotX(0.45 * amp * Math.sin(w + ph)));
      draw(hind ? hindLegTube : legTube, hip, FUR);                                              // kaki bawah
      draw(ellipsoid, chain(hip, T(0, -0.5, 0.07), S(0.125, 0.055, 0.17)), FUR);                  // telapak
      if (hind) draw(ellipsoid, chain(hip, T(0.005 * sx, 0.14, -0.01), S(0.2, 0.3, 0.3)), FUR); // paha
      else draw(ellipsoid, chain(hip, T(0.03 * sx, 0.17, 0.0), S(0.2, 0.3, 0.2)), FUR);         // bahu
    });

    // ===== KEPALA (section-section, pivot di leher) =====
    const P = [0, 1.2, 0.4];
    const head = chain(root, T(0, 0, -0.27), T(...P), rotX(0.05 * amp * Math.sin(2 * w + 1)), rotY(0.08 * Math.sin(time * 0.9)), T(-P[0], -P[1], -P[2]));

    // -- section 1: KEPALA = satu permukaan utuh; mulut = kantong cekung dengan tepi membulat (bukan lembaran) --
    draw(headMesh, chain(head, T(0, 1.62, 0.63), S(0.5, 0.48, 0.43)), FUR, 1);

    // -- moncong sudah menjadi tonjolan kepala; hidung = ellipsoid kecil yang setengah tertanam di ujung moncong --
    draw(ellipsoid, chain(head, T(0, 1.7, 1.18), S(0.1, 0.07, 0.075)), DARK);         // hidung
    draw(ellipsoid, chain(head, T(0.17, 1.78, 1.0), S(0.06, 0.062, 0.05)), DARK);      // mata
    draw(ellipsoid, chain(head, T(-0.17, 1.78, 1.0), S(0.06, 0.062, 0.05)), DARK);

    // -- lidah menjulur dari mulut ke atas dinding dagu --
    draw(ellipsoid, chain(head, T(0, 1.36, 0.96 + 0.02 * Math.sin(5 * time)), rotX(0.3), S(0.1, 0.03, 0.26)), TONGUE);

    // -- telinga: 2 segmen (pangkal frustum + ujung kerucut), radius sambungan sama sehingga mulus,
    //    pangkal lebar tertanam di kepala; bagian dalam pink dilukis di pangkal --
    const twitch = 0.06 * Math.sin(3 * time);
    [1, -1].forEach(sx => {
      const base = chain(head, T(0.21 * sx, 1.88, 0.56), rotZ(-sx * (0.26 + twitch)));
      const tip = chain(base, T(0, 0.2, 0));      // sambung di puncak frustum (radius sama)
      draw(coneFrustum, chain(base, S(0.17, 0.2, 0.13)), FUR, 3);  // segmen 1: pangkal
      draw(cone, chain(tip, S(0.136, 0.28, 0.104)), FUR, 4);        // segmen 2: ujung (pink menerus di bagian bawah)
    });

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();