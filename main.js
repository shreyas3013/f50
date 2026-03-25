/* ═══════════════════════════════════════════════
   ADIDAS F50 — CINEMATIC EXPERIENCE
   main.js  —  Scroll-driven WebGL + GSAP
═══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── REDUCED MOTION GATE ───────────────────────
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── WAIT FOR ALL DEPS ────────────────────────
  window.addEventListener('DOMContentLoaded', init);

  function init() {
    setupLenis();
    setupThreeJS();
    setupCursor();
    setupSections();
    setupColorwaysDrag();
    setupMagneticButtons();
    buildHudMatrix();
    startRAF();
  }

  /* ═══════════════════════════════════════════
     LENIS SMOOTH SCROLL
  ═══════════════════════════════════════════ */
  let lenis;
  let scrollVelocity = 0;

  function setupLenis() {
    if (typeof Lenis === 'undefined') return;

    lenis = new Lenis({
      duration: 1.4,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    });

    lenis.on('scroll', ({ velocity }) => {
      scrollVelocity = velocity;
      updateScrollProgress(lenis.progress);
      updateMarqueeSpeed(Math.abs(velocity));
    });

    // Sync Lenis with GSAP ticker if GSAP is available
    if (typeof gsap !== 'undefined') {
      gsap.ticker.add(time => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      function lenisRaf(time) {
        lenis.raf(time);
        requestAnimationFrame(lenisRaf);
      }
      requestAnimationFrame(lenisRaf);
    }
  }

  function updateScrollProgress(progress) {
    const bar = document.getElementById('scroll-progress');
    if (bar) bar.style.width = (progress * 100) + '%';
  }

  /* ═══════════════════════════════════════════
     THREE.JS — SCENE SETUP
  ═══════════════════════════════════════════ */
  let renderer, scene, camera, postScene, postCamera;
  let renderTarget;
  let shoeGroup, particleSystem, wireShoe;
  let lights = {};
  let postMat;
  let clock;
  let isProductMode = false;
  let orbitActive = false;
  let orbitState = { theta: 0.3, phi: 1.2, lastX: 0, lastY: 0, dragging: false, targetTheta: 0.3, targetPhi: 1.2 };
  const PARTICLE_COUNT = 2400;

  function setupThreeJS() {
    if (typeof THREE === 'undefined') return;

    clock = new THREE.Clock();

    // ── Renderer ──────────────────────────────
    renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('webgl-canvas'),
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // ── Render target for post-processing ─────
    renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    // ── Main Scene ────────────────────────────
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080808);
    scene.fog = new THREE.FogExp2(0x080808, 0.04);

    // ── Camera ────────────────────────────────
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 200);
    camera.position.set(0, 0.2, 5.5);

    // ── Lights ────────────────────────────────
    lights.ambient = new THREE.AmbientLight(0x111111, 0.5);
    scene.add(lights.ambient);

    lights.key = new THREE.DirectionalLight(0xffffff, 1.8);
    lights.key.position.set(-3, 4, 6);
    scene.add(lights.key);

    lights.rim = new THREE.PointLight(0xFFD700, 3.5, 12);
    lights.rim.position.set(3, 1, -3);
    scene.add(lights.rim);

    lights.fill = new THREE.PointLight(0x2244ff, 1.2, 10);
    lights.fill.position.set(-3, -1, 4);
    scene.add(lights.fill);

    lights.top = new THREE.SpotLight(0xFFD700, 2, 20, Math.PI / 5, 0.4, 2);
    lights.top.position.set(0, 8, 2);
    scene.add(lights.top);

    // ── Build shoe ───────────────────────────
    shoeGroup = buildShoeGeometry();
    shoeGroup.position.y = -0.4;
    shoeGroup.rotation.y = 0.4;
    scene.add(shoeGroup);

    // ── Particle system ───────────────────────
    particleSystem = buildParticleSystem();
    scene.add(particleSystem);

    // ── Post-processing scene ─────────────────
    postScene = new THREE.Scene();
    postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:  { value: null },
        uTime:     { value: 0 },
        uGrain:    { value: 0.028 },
        uVignette: { value: 0.38 },
        uChroma:   { value: 0.0012 },
        uDistort:  { value: 0.0 },
        uBrightness: { value: 0.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uGrain;
        uniform float uVignette;
        uniform float uChroma;
        uniform float uDistort;
        uniform float uBrightness;
        varying vec2 vUv;

        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 uv = vUv;

          // Barrel distortion
          if (uDistort > 0.001) {
            vec2 d = uv - 0.5;
            float r2 = dot(d, d);
            uv = uv + d * r2 * uDistort * 0.4;
          }

          // Chromatic aberration
          vec2 dir = (uv - 0.5) * uChroma;
          float r = texture2D(tDiffuse, uv + dir).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv - dir).b;
          vec4 col = vec4(r, g, b, 1.0);

          // Film grain
          float grain = rand(uv + mod(uTime * 0.07, 1.0)) * uGrain;
          col.rgb += grain - uGrain * 0.5;

          // Vignette
          vec2 vig = uv * (1.0 - uv.yx);
          float v = clamp(vig.x * vig.y * 18.0, 0.0, 1.0);
          v = pow(v, uVignette);
          col.rgb *= v;

          // Brightness boost (flash effect)
          col.rgb += uBrightness;

          gl_FragColor = clamp(col, 0.0, 1.0);
        }`,
      depthWrite: false,
    });

    const ppQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
    postScene.add(ppQuad);

    // ── Window resize ─────────────────────────
    window.addEventListener('resize', onResize);

    // ── Orbit drag on Section 03 ──────────────
    setupOrbitControls();
  }

  /* ── Shoe Geometry ────────────────────────── */
  function buildShoeGeometry() {
    const group = new THREE.Group();

    const matUpper = new THREE.MeshPhongMaterial({
      color: 0x0d0d0d,
      specular: 0xFFD700,
      shininess: 90,
      flatShading: false,
    });

    const matSole = new THREE.MeshPhongMaterial({
      color: 0x1a1a1a,
      specular: 0x444444,
      shininess: 20,
    });

    const matStripe = new THREE.MeshPhongMaterial({
      color: 0xFFD700,
      specular: 0xFFFFFF,
      shininess: 120,
      emissive: 0x332200,
    });

    const matCleat = new THREE.MeshPhongMaterial({
      color: 0x0a0a0a,
      specular: 0x333333,
      shininess: 40,
    });

    // ── Main upper body ───────────────────────
    const upperGeo = new THREE.BoxGeometry(2.2, 0.58, 0.72, 20, 10, 10);
    deformUpper(upperGeo);
    const upper = new THREE.Mesh(upperGeo, matUpper);
    upper.position.y = 0.1;
    group.add(upper);

    // ── Toe cap ───────────────────────────────
    const toeGeo = new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI);
    toeGeo.rotateY(-Math.PI / 2);
    const toe = new THREE.Mesh(toeGeo, matUpper);
    toe.position.set(-1.06, 0.02, 0);
    toe.scale.set(1, 0.8, 1.1);
    group.add(toe);

    // ── Heel counter ──────────────────────────
    const heelGeo = new THREE.BoxGeometry(0.56, 0.72, 0.72, 8, 8, 8);
    deformHeel(heelGeo);
    const heel = new THREE.Mesh(heelGeo, matUpper);
    heel.position.set(0.86, 0.18, 0);
    group.add(heel);

    // ── Sole ──────────────────────────────────
    const soleGeo = new THREE.BoxGeometry(2.28, 0.1, 0.78, 20, 2, 8);
    deformSole(soleGeo);
    const sole = new THREE.Mesh(soleGeo, matSole);
    sole.position.y = -0.19;
    group.add(sole);

    // ── Adidas stripes (3 diagonal stripes) ───
    const stripePositions = [-0.3, 0.0, 0.3];
    stripePositions.forEach((xOff) => {
      const sg = new THREE.BoxGeometry(0.06, 0.52, 0.76, 1, 1, 1);
      const strp = new THREE.Mesh(sg, matStripe);
      strp.position.set(xOff, 0.12, 0);
      strp.rotation.z = 0.18;
      group.add(strp);
    });

    // ── Cleats ────────────────────────────────
    const cleatDefs = [
      [-0.80, 0.30], [-0.80, -0.30],
      [-0.45, 0.33], [-0.45, -0.33],
      [-0.05, 0.33], [-0.05, -0.33],
      [ 0.35, 0.30], [ 0.35, -0.30],
      [ 0.68, 0.25], [ 0.68, -0.25],
      [ 0.68,  0.0],
      [-0.62,  0.0],
      [ 0.15,  0.0],
    ];

    cleatDefs.forEach(([cx, cz]) => {
      const cg = new THREE.CylinderGeometry(0.045, 0.065, 0.16, 6);
      const cleat = new THREE.Mesh(cg, matCleat);
      cleat.position.set(cx, -0.26, cz);
      group.add(cleat);
    });

    // ── Tongue ───────────────────────────────
    const tongueGeo = new THREE.BoxGeometry(0.38, 0.55, 0.48, 4, 4, 4);
    deformTongue(tongueGeo);
    const tongue = new THREE.Mesh(tongueGeo, matUpper);
    tongue.position.set(-0.2, 0.46, 0);
    group.add(tongue);

    // ── Wireframe overlay (subtle) ────────────
    const wireGeo = new THREE.BoxGeometry(2.2, 0.58, 0.72, 6, 3, 3);
    deformUpper(wireGeo);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xFFD700,
      wireframe: true,
      transparent: true,
      opacity: 0.04,
    });
    wireShoe = new THREE.Mesh(wireGeo, wireMat);
    wireShoe.position.y = 0.1;
    group.add(wireShoe);

    return group;
  }

  function deformUpper(geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (x + 1.1) / 2.2; // 0=toe, 1=heel
      // Taper Z toward toe
      const toeNarrow = t < 0.25 ? 0.65 + t / 0.25 * 0.35 : 1.0;
      z *= toeNarrow;
      // Heel rise
      const heelRise = Math.max(0, (t - 0.7) / 0.3);
      y += heelRise * 0.38;
      // Toe droop
      const toeDrop = Math.max(0, (0.18 - t) / 0.18);
      y -= toeDrop * 0.16;
      // Natural upper bow
      y += Math.sin(t * Math.PI * 0.85) * 0.1 * (y > 0 ? 1 : 0.2);
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function deformHeel(geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // Round the heel back
      const bk = (x + 0.28) / 0.56;
      if (bk > 0.7) {
        const r = (bk - 0.7) / 0.3;
        z *= (1 - r * 0.3);
        y -= r * 0.1;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function deformSole(geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (x + 1.14) / 2.28;
      const toeNarrow = t < 0.2 ? 0.55 + t / 0.2 * 0.45 : 1.0;
      z *= toeNarrow;
      // Slight rocker bottom
      y += Math.sin(t * Math.PI) * 0.04;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function deformTongue(geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y + 0.275) / 0.55;
      z *= (1 - t * 0.2);
      x += t * 0.08;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /* ── Particle System ──────────────────────── */
  function buildParticleSystem() {
    const shoePos    = generateShoeParticles(Math.floor(PARTICLE_COUNT * 0.65));
    const scatterPos = generateScatterParticles(Math.floor(PARTICLE_COUNT * 0.35));

    const initArr   = new Float32Array(PARTICLE_COUNT * 3);
    const targetArr = new Float32Array(PARTICLE_COUNT * 3);
    const colorArr  = new Float32Array(PARTICLE_COUNT * 3);
    const randArr   = new Float32Array(PARTICLE_COUNT);

    // Scatter (initial)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      initArr[i * 3]     = (Math.random() - 0.5) * 14;
      initArr[i * 3 + 1] = (Math.random() - 0.5) * 14;
      initArr[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }

    // Targets: shoe shape + scattered extras
    const shoeCount = shoePos.length / 3;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (i < shoeCount) {
        targetArr[i * 3]     = shoePos[i * 3];
        targetArr[i * 3 + 1] = shoePos[i * 3 + 1] - 0.4;
        targetArr[i * 3 + 2] = shoePos[i * 3 + 2];
      } else {
        const si = i - shoeCount;
        targetArr[i * 3]     = scatterPos[si * 3];
        targetArr[i * 3 + 1] = scatterPos[si * 3 + 1];
        targetArr[i * 3 + 2] = scatterPos[si * 3 + 2];
      }
      randArr[i] = Math.random();

      // Color: mostly white/dim, some yellow accents
      const isYellow = Math.random() < 0.22;
      if (isYellow) {
        colorArr[i * 3]     = 1.0;
        colorArr[i * 3 + 1] = 0.84;
        colorArr[i * 3 + 2] = 0.0;
      } else {
        const br = 0.35 + Math.random() * 0.45;
        colorArr[i * 3]     = br;
        colorArr[i * 3 + 1] = br;
        colorArr[i * 3 + 2] = br + Math.random() * 0.15;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',      new THREE.BufferAttribute(initArr.slice(),   3));
    geo.setAttribute('aInitPosition', new THREE.BufferAttribute(initArr,           3));
    geo.setAttribute('aShoePosition', new THREE.BufferAttribute(targetArr,         3));
    geo.setAttribute('color',         new THREE.BufferAttribute(colorArr,          3));
    geo.setAttribute('aRand',         new THREE.BufferAttribute(randArr,           1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMorph:    { value: 0.0 },
        uTime:     { value: 0.0 },
        uSize:     { value: 2.8 },
        uOpacity:  { value: 0.9 },
        uPxRatio:  { value: renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */`
        attribute vec3  aInitPosition;
        attribute vec3  aShoePosition;
        attribute float aRand;
        attribute vec3  color;

        uniform float uMorph;
        uniform float uTime;
        uniform float uSize;
        uniform float uOpacity;
        uniform float uPxRatio;

        varying vec3  vColor;
        varying float vRand;

        void main() {
          vColor = color;
          vRand  = aRand;

          // Staggered morph: each particle starts at a slightly different time
          float delay = aRand * 0.45;
          float t = clamp((uMorph - delay) / (1.0 - delay), 0.0, 1.0);
          t = t * t * (3.0 - 2.0 * t); // smoothstep

          vec3 pos = mix(aInitPosition, aShoePosition, t);

          // Subtle orbit noise
          float phase = uTime * 0.6 + aRand * 6.28;
          float orbitR = 0.04 * (1.0 - t * 0.7);
          pos.x += cos(phase)         * orbitR;
          pos.y += sin(phase * 1.3)   * orbitR * 0.6;
          pos.z += cos(phase * 0.7)   * orbitR;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = uSize * uPxRatio * (280.0 / -mvPos.z) * (0.7 + aRand * 0.6);
          gl_Position  = projectionMatrix * mvPos;
        }`,
      fragmentShader: /* glsl */`
        varying vec3  vColor;
        varying float vRand;

        void main() {
          vec2  uv   = gl_PointCoord - 0.5;
          float dist = length(uv);
          if (dist > 0.5) discard;

          float alpha = 1.0 - dist * 1.9;
          alpha = pow(alpha, 1.5);

          // Soft glow core
          float glow = exp(-dist * 6.0) * 0.6;
          vec3  col  = vColor + glow * vec3(1.0, 0.9, 0.4) * vRand;

          gl_FragColor = vec4(col, alpha * 0.88);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    return new THREE.Points(geo, mat);
  }

  function generateShoeParticles(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random();

      if (r < 0.38) {
        // Upper surface
        const u = Math.random();
        const t = u;
        const x = (t - 0.5) * 2.5;
        const narrow = t < 0.22 ? 0.55 + t / 0.22 * 0.45 : 1.0;
        const hw = (0.32 + t * 0.06) * narrow;
        const z = (Math.random() - 0.5) * hw * 2;
        const heelRise = Math.max(0, (t - 0.72) / 0.28);
        const toeDrop = Math.max(0, (0.18 - t) / 0.18);
        const baseH = 0.28 * Math.sin(t * Math.PI * 0.9) + heelRise * 0.45 - toeDrop * 0.18;
        const y = 0.08 + baseH + (Math.random() - 0.5) * 0.02;
        pts.push(x, y, z);
      } else if (r < 0.60) {
        // Side walls
        const u = Math.random();
        const t = u;
        const x = (t - 0.5) * 2.5;
        const narrow = t < 0.22 ? 0.55 + t / 0.22 * 0.45 : 1.0;
        const hw = (0.34 + t * 0.06) * narrow;
        const side = Math.random() > 0.5 ? 1 : -1;
        const z = side * (hw * 0.92 + Math.random() * 0.04);
        const heelRise = Math.max(0, (t - 0.72) / 0.28);
        const toeDrop = Math.max(0, (0.18 - t) / 0.18);
        const topH = 0.08 + 0.28 * Math.sin(t * Math.PI * 0.9) + heelRise * 0.45 - toeDrop * 0.18;
        const y = -0.2 + Math.random() * (topH + 0.2);
        pts.push(x, y, z);
      } else if (r < 0.73) {
        // Sole
        const x = (Math.random() - 0.5) * 2.3;
        const xt = (x + 1.15) / 2.3;
        const narrow = xt < 0.18 ? 0.5 + xt / 0.18 * 0.5 : 1.0;
        const z = (Math.random() - 0.5) * 0.72 * narrow;
        const y = -0.19 + (Math.random() - 0.5) * 0.01;
        pts.push(x, y, z);
      } else if (r < 0.88) {
        // Heel back face
        const z = (Math.random() - 0.5) * 0.68;
        const y = -0.2 + Math.random() * 0.75;
        const x = 1.0 + (Math.random() - 0.5) * 0.04;
        pts.push(x, y, z);
      } else {
        // Cleats
        const cx = (Math.random() - 0.5) * 2.0;
        const cz = (Math.random() - 0.5) * 0.68;
        const y  = -0.22 - Math.random() * 0.14;
        pts.push(cx, y, cz);
      }
    }
    return new Float32Array(pts);
  }

  function generateScatterParticles(n) {
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 3 + Math.random() * 4;
      pts[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pts[i * 3 + 1] = r * Math.cos(phi);
      pts[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return pts;
  }

  /* ── Orbit Controls ───────────────────────── */
  function setupOrbitControls() {
    const canvas = document.getElementById('webgl-canvas');

    canvas.addEventListener('mousedown', e => {
      if (!isProductMode) return;
      orbitState.dragging = true;
      orbitState.lastX = e.clientX;
      orbitState.lastY = e.clientY;
      document.getElementById('cursor').classList.add('cursor--drag');
    });

    window.addEventListener('mousemove', e => {
      if (!orbitState.dragging) return;
      const dx = (e.clientX - orbitState.lastX) * 0.008;
      const dy = (e.clientY - orbitState.lastY) * 0.005;
      orbitState.lastX = e.clientX;
      orbitState.lastY = e.clientY;
      orbitState.targetTheta += dx;
      orbitState.targetPhi = Math.max(0.4, Math.min(2.2, orbitState.targetPhi + dy));
    });

    window.addEventListener('mouseup', () => {
      orbitState.dragging = false;
      document.getElementById('cursor').classList.remove('cursor--drag');
    });

    // Touch orbit
    let lastTouchX = 0, lastTouchY = 0;
    canvas.addEventListener('touchstart', e => {
      if (!isProductMode) return;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      orbitState.dragging = true;
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (!orbitState.dragging) return;
      const dx = (e.touches[0].clientX - lastTouchX) * 0.008;
      const dy = (e.touches[0].clientY - lastTouchY) * 0.005;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      orbitState.targetTheta += dx;
      orbitState.targetPhi = Math.max(0.4, Math.min(2.2, orbitState.targetPhi + dy));
    }, { passive: true });
    canvas.addEventListener('touchend', () => { orbitState.dragging = false; });
  }

  /* ── Resize ───────────────────────────────── */
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderTarget.setSize(window.innerWidth, window.innerHeight);
    if (particleSystem) {
      particleSystem.material.uniforms.uPxRatio.value = renderer.getPixelRatio();
    }
  }

  /* ═══════════════════════════════════════════
     CUSTOM CURSOR
  ═══════════════════════════════════════════ */
  const cursorPos  = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const cursorLag  = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function setupCursor() {
    const el = document.getElementById('cursor');
    if (!el) return;

    window.addEventListener('mousemove', e => {
      cursorPos.x = e.clientX;
      cursorPos.y = e.clientY;
    });

    // Context-aware labels
    document.querySelectorAll('[data-cursor]').forEach(el => {
      const label = el.getAttribute('data-cursor');
      el.addEventListener('mouseenter', () => {
        const lbl = document.querySelector('.cursor__label');
        if (lbl) lbl.textContent = label;
        document.getElementById('cursor').classList.add('cursor--hover');
      });
      el.addEventListener('mouseleave', () => {
        document.getElementById('cursor').classList.remove('cursor--hover');
      });
    });

    // Hover effect on interactive elements
    document.querySelectorAll('button, a, .hotspot__body, .cw-card, .athlete-card').forEach(el => {
      el.addEventListener('mouseenter', () => document.getElementById('cursor').classList.add('cursor--hover'));
      el.addEventListener('mouseleave', () => document.getElementById('cursor').classList.remove('cursor--hover'));
    });
  }

  function tickCursor() {
    const el = document.getElementById('cursor');
    if (!el) return;
    const ease = prefersReducedMotion ? 1 : 0.12;
    cursorLag.x += (cursorPos.x - cursorLag.x) * ease;
    cursorLag.y += (cursorPos.y - cursorLag.y) * ease;
    el.style.transform = `translate(${cursorLag.x}px, ${cursorLag.y}px) translate(-50%, -50%)`;
  }

  /* ═══════════════════════════════════════════
     MAGNETIC BUTTONS
  ═══════════════════════════════════════════ */
  function setupMagneticButtons() {
    document.querySelectorAll('.btn-primary, .btn-ghost').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = (e.clientX - cx) * 0.28;
        const dy = (e.clientY - cy) * 0.28;
        btn.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ═══════════════════════════════════════════
     SPEED LINES CANVAS (Section 02)
  ═══════════════════════════════════════════ */
  let speedCtx = null;
  const speedLines = [];

  function initSpeedLines() {
    const canvas = document.getElementById('speedCanvas');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    speedCtx = canvas.getContext('2d');
    for (let i = 0; i < 80; i++) speedLines.push(createSpeedLine(canvas));
  }

  function createSpeedLine(canvas) {
    const w = canvas ? canvas.width  : window.innerWidth;
    const h = canvas ? canvas.height : window.innerHeight;
    return {
      x:     Math.random() * w,
      y:     Math.random() * h,
      len:   40 + Math.random() * 180,
      speed: 4 + Math.random() * 10,
      alpha: 0.05 + Math.random() * 0.15,
      width: 0.5 + Math.random() * 1.5,
      decay: 0.92 + Math.random() * 0.06,
    };
  }

  function tickSpeedLines(velFactor) {
    const canvas = document.getElementById('speedCanvas');
    if (!speedCtx || !canvas) return;
    speedCtx.clearRect(0, 0, canvas.width, canvas.height);

    const boost = 1 + Math.abs(velFactor) * 0.08;

    speedLines.forEach(line => {
      line.x -= line.speed * boost;
      if (line.x + line.len < 0) {
        line.x   = canvas.width + 20;
        line.y   = Math.random() * canvas.height;
        line.len = 40 + Math.random() * 180;
        line.speed = 4 + Math.random() * 10;
      }

      const gradient = speedCtx.createLinearGradient(line.x, line.y, line.x + line.len, line.y);
      const a1 = Math.min(line.alpha * boost, 0.5);
      gradient.addColorStop(0, `rgba(255,215,0,0)`);
      gradient.addColorStop(0.6, `rgba(255,215,0,${a1})`);
      gradient.addColorStop(1, `rgba(255,215,0,${a1 * 0.3})`);

      speedCtx.beginPath();
      speedCtx.moveTo(line.x, line.y);
      speedCtx.lineTo(line.x + line.len, line.y);
      speedCtx.strokeStyle = gradient;
      speedCtx.lineWidth   = line.width;
      speedCtx.stroke();
    });
  }

  /* ═══════════════════════════════════════════
     IMPACT CANVAS (Section 05)
  ═══════════════════════════════════════════ */
  let impactCtx = null;
  const impactParticles = [];
  let impactTriggered = false;

  function initImpactCanvas() {
    const canvas = document.getElementById('impactCanvas');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
    impactCtx = canvas.getContext('2d');
  }

  function triggerImpactBurst() {
    if (impactTriggered || !impactCtx) return;
    impactTriggered = true;
    const canvas = document.getElementById('impactCanvas');
    const cx = canvas.width / 2, cy = canvas.height * 0.6;

    for (let i = 0; i < 180; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 10;
      const isYellow = Math.random() < 0.35;
      impactParticles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 5,
        alpha: 1,
        size: 2 + Math.random() * 4,
        color: isYellow ? '#FFD700' : '#F5F5F5',
        decay: 0.012 + Math.random() * 0.015,
      });
    }

    // Crack lines
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const len = 40 + Math.random() * 120;
      impactParticles.push({
        crack: true,
        x1: cx, y1: cy,
        x2: cx + Math.cos(angle) * len,
        y2: cy + Math.sin(angle) * len,
        alpha: 0.7,
        decay: 0.008,
      });
    }
  }

  function tickImpactCanvas() {
    if (!impactCtx || impactParticles.length === 0) return;
    const canvas = document.getElementById('impactCanvas');
    impactCtx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = impactParticles.length - 1; i >= 0; i--) {
      const p = impactParticles[i];
      if (p.alpha <= 0) { impactParticles.splice(i, 1); continue; }

      if (p.crack) {
        impactCtx.beginPath();
        impactCtx.moveTo(p.x1, p.y1);
        impactCtx.lineTo(p.x2, p.y2);
        impactCtx.strokeStyle = `rgba(255,215,0,${p.alpha})`;
        impactCtx.lineWidth = p.alpha * 2;
        impactCtx.stroke();
      } else {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.18; // gravity
        p.vx *= 0.97;

        impactCtx.beginPath();
        impactCtx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
        impactCtx.fillStyle = p.color.replace(')', `,${p.alpha})`).replace('rgb', 'rgba').replace('#FFD700', `rgba(255,215,0,${p.alpha})`).replace('#F5F5F5', `rgba(245,245,245,${p.alpha})`);

        // Fallback simpler fill
        impactCtx.fillStyle = p.color === '#FFD700'
          ? `rgba(255,215,0,${p.alpha})`
          : `rgba(245,245,245,${p.alpha})`;
        impactCtx.fill();
      }
      p.alpha -= p.decay;
    }
  }

  /* ═══════════════════════════════════════════
     COUNTER ANIMATION (Section 02 metrics)
  ═══════════════════════════════════════════ */
  function animateCounters() {
    document.querySelectorAll('.count-num').forEach(el => {
      const target  = parseFloat(el.dataset.target);
      const isFloat = el.dataset.target.includes('.');
      let start = null;
      const dur = 1800;
      function step(ts) {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / dur, 1);
        const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        const val  = ease * target;
        el.textContent = isFloat ? val.toFixed(1) : Math.round(val).toString().padStart(el.dataset.target.length, '0');
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = isFloat ? target.toFixed(1) : target.toString();
      }
      requestAnimationFrame(step);
    });
  }

  /* ═══════════════════════════════════════════
     GLITCH NUMBERS (Section 04)
  ═══════════════════════════════════════════ */
  const glitchChars = '0123456789!#@%';

  function animateGlitchNum(el) {
    if (!el) return;
    const target = el.dataset.target;
    let iter = 0;
    const maxIter = 22;
    const intv = setInterval(() => {
      el.textContent = target.split('').map((char, i) => {
        if (i < iter / maxIter * target.length) return char;
        if (char === '.') return '.';
        return glitchChars[Math.floor(Math.random() * glitchChars.length)];
      }).join('');
      iter++;
      if (iter > maxIter) {
        clearInterval(intv);
        el.textContent = target;
      }
    }, 55);
  }

  /* ═══════════════════════════════════════════
     HUD MATRIX (Section 04)
  ═══════════════════════════════════════════ */
  function buildHudMatrix() {
    const matrix = document.getElementById('hudMatrix');
    if (!matrix) return;
    for (let i = 0; i < 72; i++) {
      const cell = document.createElement('span');
      cell.className = 'matrix-cell';
      cell.style.setProperty('--d', `${Math.random() * 3}s`);
      cell.textContent = Math.random() > 0.5 ? '1' : '0';
      matrix.appendChild(cell);
    }
  }

  /* ═══════════════════════════════════════════
     MARQUEE SPEED (Section 08)
  ═══════════════════════════════════════════ */
  function updateMarqueeSpeed(vel) {
    const dur = Math.max(5, 18 - vel * 0.14);
    document.documentElement.style.setProperty('--marquee-dur', `${dur}s`);
  }

  /* ═══════════════════════════════════════════
     COLORWAYS DRAG SLIDER (Section 07)
  ═══════════════════════════════════════════ */
  function setupColorwaysDrag() {
    const track    = document.getElementById('colorwaysTrack');
    const viewport = document.getElementById('colorwaysViewport');
    const indexEl  = document.getElementById('cwIndex');
    if (!track || !viewport) return;

    let isDragging = false;
    let startX = 0, scrollLeft = 0;
    let momentum = 0, lastX = 0, animFrame = null;

    const getMaxScroll = () => track.scrollWidth - viewport.clientWidth;

    function clampX(x) { return Math.max(-getMaxScroll(), Math.min(0, x)); }

    let currentX = 0;

    function setTrackX(x) {
      currentX = clampX(x);
      track.style.transform = `translateX(${currentX}px)`;
      const progress = -currentX / (getMaxScroll() || 1);
      const idx = Math.round(progress * 3) + 1;
      if (indexEl) indexEl.textContent = `0${idx} / 04`;

      // Color-bleed body background
      const cards = track.querySelectorAll('.cw-card');
      const nearIdx = Math.round(progress * (cards.length - 1));
      const card = cards[nearIdx];
      if (card) {
        const bg = card.dataset.bg || '#0d0d0d';
        document.body.style.backgroundColor = bg;
      }
    }

    viewport.addEventListener('mousedown', e => {
      isDragging = true;
      startX     = e.pageX;
      scrollLeft = currentX;
      lastX      = e.pageX;
      momentum   = 0;
      if (animFrame) cancelAnimationFrame(animFrame);
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      momentum = e.pageX - lastX;
      lastX    = e.pageX;
      setTrackX(scrollLeft + (e.pageX - startX));
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      viewport.style.cursor = 'grab';
      applyMomentum();
    });

    // Touch
    viewport.addEventListener('touchstart', e => {
      startX     = e.touches[0].pageX;
      scrollLeft = currentX;
      lastX      = e.touches[0].pageX;
      momentum   = 0;
      if (animFrame) cancelAnimationFrame(animFrame);
    }, { passive: true });
    viewport.addEventListener('touchmove', e => {
      momentum = e.touches[0].pageX - lastX;
      lastX    = e.touches[0].pageX;
      setTrackX(scrollLeft + (e.touches[0].pageX - startX));
    }, { passive: true });
    viewport.addEventListener('touchend', applyMomentum, { passive: true });

    function applyMomentum() {
      function decay() {
        if (Math.abs(momentum) < 0.5) {
          // Snap to nearest card
          snapToCard();
          return;
        }
        momentum *= 0.93;
        setTrackX(currentX + momentum);
        animFrame = requestAnimationFrame(decay);
      }
      decay();
    }

    function snapToCard() {
      const cardW = track.querySelector('.cw-card')?.offsetWidth + 24 || 380;
      const snapIdx = Math.round(-currentX / cardW);
      const target  = -Math.min(snapIdx, 3) * cardW;
      let snapPos = currentX;
      function animate() {
        snapPos += (target - snapPos) * 0.14;
        setTrackX(snapPos);
        if (Math.abs(snapPos - target) > 0.5) requestAnimationFrame(animate);
        else setTrackX(target);
      }
      animate();
    }

    // Apply VanillaTilt to cards if available
    if (typeof VanillaTilt !== 'undefined') {
      VanillaTilt.init(document.querySelectorAll('.cw-card'), {
        max: 8, speed: 400, glare: true, 'max-glare': 0.15,
      });
    }
  }

  /* ═══════════════════════════════════════════
     PRODUCT HUD
  ═══════════════════════════════════════════ */
  function setupHotspots() {
    const hud   = document.getElementById('productHud');
    const close = document.getElementById('hudClose');

    document.querySelectorAll('.hotspot__body').forEach(btn => {
      btn.addEventListener('click', () => {
        if (hud) hud.classList.add('active');
        if (typeof gsap !== 'undefined') {
          gsap.to(camera.position, { z: 3.5, duration: 0.9, ease: 'power3.out' });
          gsap.to(postMat.uniforms.uChroma, { value: 0.006, duration: 0.3, yoyo: true, repeat: 1 });
        }
      });
    });

    if (close) {
      close.addEventListener('click', () => {
        if (hud) hud.classList.remove('active');
        if (typeof gsap !== 'undefined') {
          gsap.to(camera.position, { z: 5.5, duration: 0.9, ease: 'power3.out' });
        }
      });
    }
  }

  /* ═══════════════════════════════════════════
     GSAP SCROLL TIMELINES
  ═══════════════════════════════════════════ */
  function setupSections() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      // Fallback: show everything
      document.querySelectorAll('.scene').forEach(s => { s.style.opacity = 1; });
      initSpeedLines();
      initImpactCanvas();
      setupHotspots();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // ── Section 01: Opening ─────────────────
    const tlOpen = gsap.timeline({ defaults: { ease: 'expo.out' } });

    // Scanning line drops
    tlOpen.to('#scanLine', { y: window.innerHeight, duration: 1.8, ease: 'none' }, 0)
      .to('#scanLine', { opacity: 0, duration: 0.3 }, 1.5);

    // Telemetry lines
    tlOpen.to('.opening__telemetry', { opacity: 1, duration: 0.01 }, 0.1);
    tlOpen.to('.telem-line', {
      opacity: 1, x: 0, stagger: 0.12, duration: 0.6, ease: 'power2.out'
    }, 0.2);

    // F50 chars explode in
    tlOpen.to('.f50-char', {
      opacity: 1, y: 0, scale: 1,
      stagger: { each: 0.12, from: 'center' },
      duration: 0.8, ease: 'back.out(1.5)'
    }, 0.9);

    // Subtitle
    tlOpen.to('#openingSub', { opacity: 1, y: 0, duration: 0.6 }, 1.6);

    // Scroll hint
    tlOpen.to('#scrollHint', { opacity: 1, y: 0, duration: 0.5 }, 2.0);

    // Particle morph in over time
    if (particleSystem) {
      tlOpen.to(particleSystem.material.uniforms.uMorph, {
        value: 1, duration: 2.5, ease: 'power2.inOut'
      }, 0.3);
    }

    // Camera shake on F50 impact
    tlOpen.to(camera.position, { x: 0.08, duration: 0.05, yoyo: true, repeat: 5, ease: 'none' }, 1.0);

    // ── Scroll-based opening exit ────────────
    ScrollTrigger.create({
      trigger: '#s01',
      start: 'top top',
      end: 'bottom top',
      onLeave: () => {
        gsap.to('#s01', { opacity: 0, duration: 0.4 });
      },
      onEnterBack: () => {
        gsap.to('#s01', { opacity: 1, duration: 0.4 });
      }
    });

    // ── Section 02: Speed Hero ───────────────
    initSpeedLines();

    ScrollTrigger.create({
      trigger: '#s02',
      start: 'top 80%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        tl.to('#heroEyebrow', { opacity: 1, y: 0, duration: 0.6 })
          .to('.hero__line--1', { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.7 }, '-=0.3')
          .to('.hero__line--2', { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.7 }, '-=0.5')
          .to('.hero__line--3', { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.7 }, '-=0.5')
          .to('#heroSub',    { opacity: 1, y: 0, duration: 0.5 }, '-=0.3')
          .to('#heroCta',    { opacity: 1, y: 0, duration: 0.5 }, '-=0.3')
          .to('#heroMetrics',{ opacity: 1, y: 0, duration: 0.5 }, '-=0.3');
        gsap.delayedCall(0.8, animateCounters);
      }
    });

    // Speed lines visible in section 02
    ScrollTrigger.create({
      trigger: '#s02',
      start: 'top bottom',
      end:   'bottom top',
      onUpdate: self => {
        const speedEl = document.getElementById('speedCanvas');
        if (speedEl) {
          const vis = self.progress > 0 && self.progress < 1;
          speedEl.style.opacity = vis ? Math.min(self.progress * 3, 1 - (self.progress - 0.7) * 3) : 0;
        }
      }
    });

    // ── Section 03: 3D Product ───────────────
    ScrollTrigger.create({
      trigger: '#s03',
      start: 'top 55%',
      end:   'bottom 45%',
      onEnter: () => {
        isProductMode = true;
        document.getElementById('webgl-canvas').style.pointerEvents = 'all';
        gsap.to('#productRing', { opacity: 1, scale: 1, duration: 1.2, ease: 'expo.out' });
        gsap.to('#dragHint', { opacity: 1, duration: 0.5 });
        gsap.to(lights.rim, { intensity: 6, duration: 1 });

        // Fade in hotspots
        gsap.to('.hotspot', { opacity: 1, stagger: 0.15, duration: 0.6, ease: 'back.out' });

        // Shoe flies in
        if (shoeGroup) {
          gsap.fromTo(shoeGroup.position, { y: -3 }, { y: -0.4, duration: 1.2, ease: 'back.out(1.3)' });
          gsap.fromTo(shoeGroup.rotation, { x: -0.5 }, { x: 0, duration: 1.2, ease: 'expo.out' });
        }
        setupHotspots();
      },
      onLeave: () => {
        isProductMode = false;
        document.getElementById('webgl-canvas').style.pointerEvents = 'none';
        gsap.to('#productRing', { opacity: 0, duration: 0.5 });
        gsap.to('.hotspot', { opacity: 0, duration: 0.3 });
        gsap.to(lights.rim, { intensity: 3.5, duration: 0.8 });
      },
      onEnterBack: () => {
        isProductMode = true;
        document.getElementById('webgl-canvas').style.pointerEvents = 'all';
        gsap.to('#productRing', { opacity: 1, duration: 0.5 });
        gsap.to('.hotspot', { opacity: 1, stagger: 0.1, duration: 0.4 });
      },
      onLeaveBack: () => {
        isProductMode = false;
        document.getElementById('webgl-canvas').style.pointerEvents = 'none';
        gsap.to('#productRing', { opacity: 0, duration: 0.5 });
        gsap.to('.hotspot', { opacity: 0, duration: 0.3 });
      }
    });

    // Auto-slow rotation in product mode (overridden by orbit drag)
    gsap.to(orbitState, {
      targetTheta: orbitState.targetTheta + Math.PI * 2,
      duration: 24, ease: 'none', repeat: -1
    });

    // ── Section 04: Tech HUD ─────────────────
    ScrollTrigger.create({
      trigger: '#s04',
      start: 'top 65%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

        // Scanner sweeps
        tl.to('#techScanner', { y: '100vh', duration: 1.6, ease: 'none' }, 0)
          .to('#techScanner', { opacity: 0, duration: 0.3 }, 1.3);

        tl.to('.techhud__label', { opacity: 1, y: 0, duration: 0.5 }, 0.2);

        // Spec rows
        tl.to('.spec-row', {
          opacity: 1, x: 0, stagger: 0.12, duration: 0.5
        }, 0.5);

        // Spec fill bars
        tl.call(() => {
          document.querySelectorAll('.spec-fill').forEach(fill => {
            const pct = fill.dataset.pct;
            fill.style.width = pct + '%';
          });
        }, null, 0.9);

        // Glitch numbers
        tl.call(() => {
          document.querySelectorAll('.glitch-num').forEach(el => animateGlitchNum(el));
        }, null, 1.0);

        // Right panel
        tl.to('#hudCoords', { opacity: 1, y: 0, duration: 0.5 }, 0.6)
          .to('.hud-graph', { opacity: 1, y: 0, duration: 0.5 }, 0.8)
          .to('.hud-matrix', { opacity: 1, y: 0, duration: 0.6 }, 1.0);

        // Graph line draw
        tl.call(() => {
          const line = document.querySelector('.graph-line');
          const area = document.querySelector('.graph-area');
          if (line) line.style.strokeDashoffset = '0';
          if (area) area.style.opacity = '1';
        }, null, 1.2);

        // Chromatic aberration flash
        if (postMat) {
          tl.to(postMat.uniforms.uChroma, { value: 0.006, duration: 0.15, yoyo: true, repeat: 1 }, 0.5);
        }
      }
    });

    // ── Section 05: Impact ───────────────────
    initImpactCanvas();

    ScrollTrigger.create({
      trigger: '#s05',
      start: 'top 60%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

        tl.to('#impactLabel', { opacity: 1, y: 0, duration: 0.4 })
          .to('#impactWord',  { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.2)' }, '-=0.1')
          .to('#impactData',  { opacity: 1, y: 0, duration: 0.5 }, '-=0.2')
          .to('#impactCrack', { opacity: 1, duration: 0.3 }, '-=0.4');

        tl.call(triggerImpactBurst, null, 0.2);

        if (postMat) {
          tl.to(postMat.uniforms.uBrightness, { value: 0.15, duration: 0.06, yoyo: true, repeat: 3 }, 0.2);
          tl.to(postMat.uniforms.uDistort,    { value: 0.3,  duration: 0.1,  yoyo: true, repeat: 1 }, 0.25);
        }

        if (shoeGroup) {
          tl.to(shoeGroup.position, { y: -0.8, duration: 0.08, yoyo: true, repeat: 3 }, 0.2);
        }
      }
    });

    // ── Section 06: Speed Film ───────────────
    ScrollTrigger.create({
      trigger: '#s06',
      start: 'top 70%',
      once: false,
      onEnter: () => {
        gsap.to('.film__line', {
          opacity: 1, y: 0, x: 0,
          stagger: 0.18,
          duration: 0.7,
          ease: 'power3.out'
        });
        if (postMat) {
          gsap.to(postMat.uniforms.uGrain, { value: 0.055, duration: 0.3 });
        }
      },
      onLeave: () => {
        if (postMat) gsap.to(postMat.uniforms.uGrain, { value: 0.028, duration: 0.5 });
      },
      onLeaveBack: () => {
        if (postMat) gsap.to(postMat.uniforms.uGrain, { value: 0.028, duration: 0.5 });
        gsap.to('.film__line', { opacity: 0, y: 20, x: -10, duration: 0.3 });
      }
    });

    // ── Section 07: Colorways ────────────────
    ScrollTrigger.create({
      trigger: '#s07',
      start: 'top 75%',
      once: true,
      onEnter: () => {
        gsap.to('#colorwaysTitle',       { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' });
        gsap.to('.colorways__scroll-hint', { opacity: 1, duration: 0.5, delay: 0.5 });
        gsap.to('.cw-card', { opacity: 1, y: 0, stagger: 0.1, duration: 0.7, ease: 'expo.out', delay: 0.3 });
      }
    });

    // Reset body background when leaving colorways
    ScrollTrigger.create({
      trigger: '#s07',
      start: 'bottom top',
      onLeave: () => { gsap.to(document.body, { backgroundColor: '#080808', duration: 1 }); },
      onEnterBack: () => { /* restore from card data */ }
    });

    // ── Section 08: Athletes ─────────────────
    ScrollTrigger.create({
      trigger: '#s08',
      start: 'top 70%',
      once: true,
      onEnter: () => {
        gsap.to('.athlete-card', {
          opacity: 1, y: 0, stagger: 0.14, duration: 0.7, ease: 'expo.out'
        });
      }
    });

    // ── Section 09: Final CTA ────────────────
    ScrollTrigger.create({
      trigger: '#s09',
      start: 'top 70%',
      once: true,
      onEnter: () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        tl.to('#ctaEyebrow', { opacity: 1, y: 0, duration: 0.5 })
          .to('.cta__line', { opacity: 1, y: 0, stagger: 0.15, duration: 0.8, ease: 'back.out(1.2)' }, '-=0.2')
          .to('#ctaBuy,#ctaLearn', { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 }, '-=0.3')
          .to('.cta__legal', { opacity: 1, y: 0, duration: 0.4 }, '-=0.2');

        if (shoeGroup) {
          tl.to(shoeGroup.position, { y: -0.1, duration: 1.5, ease: 'expo.out' }, 0);
          tl.to(camera.position, { z: 4.5, duration: 1.5, ease: 'expo.out' }, 0);
          gsap.to(lights.top, { intensity: 5, duration: 1 });
        }
      }
    });

    // Ensure cta buttons are visible (in case opacity wasn't set)
    gsap.set('#ctaBuy,#ctaLearn', { opacity: 0, y: 20 });

    // ── Section 10: Footer ───────────────────
    ScrollTrigger.create({
      trigger: '#s10',
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.to('.footer__content', { opacity: 1, y: 0, duration: 1, ease: 'expo.out' });
        if (postMat) gsap.to(postMat.uniforms.uVignette, { value: 0.6, duration: 1.5 });
      }
    });

    // ── Global scroll-parallax on WebGL ──────
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: self => {
        if (!shoeGroup || !particleSystem) return;

        const progress  = self.progress;
        const velocity  = self.getVelocity();

        // Scroll velocity → chromatic aberration
        if (postMat) {
          const ca = Math.min(0.012, Math.abs(velocity) * 0.00003);
          postMat.uniforms.uChroma.value += (ca - postMat.uniforms.uChroma.value) * 0.1;
        }

        // Rotate particles slowly with scroll
        particleSystem.rotation.y = progress * Math.PI * 0.6;

        // Light follows scroll
        if (lights.key) {
          lights.key.position.x = -3 + progress * 6;
          lights.key.position.y =  4 - progress * 2;
        }
      }
    });
  }

  /* ═══════════════════════════════════════════
     MAIN RAF LOOP
  ═══════════════════════════════════════════ */
  let lastTime = 0;

  function startRAF() {
    function loop(time) {
      requestAnimationFrame(loop);

      if (!renderer || !scene || !camera) {
        tickCursor();
        return;
      }

      const delta = (time - lastTime) * 0.001;
      lastTime = time;
      const elapsed = clock ? clock.getElapsedTime() : time * 0.001;

      // Update particle uniforms
      if (particleSystem) {
        particleSystem.material.uniforms.uTime.value = elapsed;
        // Gentle auto rotation when not in product mode
        if (!isProductMode) {
          particleSystem.rotation.x = Math.sin(elapsed * 0.08) * 0.06;
          shoeGroup.rotation.y += (0.003 + Math.abs(scrollVelocity) * 0.0001);
          shoeGroup.position.y = -0.4 + Math.sin(elapsed * 0.4) * 0.04;
        }
      }

      // Shoe orbit controls (product mode)
      if (shoeGroup && isProductMode) {
        orbitState.theta += (orbitState.targetTheta - orbitState.theta) * 0.08;
        orbitState.phi   += (orbitState.targetPhi   - orbitState.phi)   * 0.08;
        const radius = 5.5;
        camera.position.x = radius * Math.sin(orbitState.theta) * Math.sin(orbitState.phi);
        camera.position.y = radius * Math.cos(orbitState.phi) + 0.2;
        camera.position.z = radius * Math.cos(orbitState.theta) * Math.sin(orbitState.phi);
        camera.lookAt(0, 0, 0);
        shoeGroup.rotation.y = 0; // Let camera orbit instead
      }

      // Wireframe subtle pulse
      if (wireShoe) {
        wireShoe.material.opacity = 0.02 + Math.sin(elapsed * 1.2) * 0.015;
      }

      // Rim light flicker
      if (lights.rim) {
        lights.rim.intensity = 3.5 + Math.sin(elapsed * 2.1) * 0.4;
      }

      // Post uniforms
      if (postMat) {
        postMat.uniforms.uTime.value = elapsed;
        // Slowly restore chroma
        const targetCA = isProductMode ? 0.002 : 0.0012;
        postMat.uniforms.uChroma.value += (targetCA - postMat.uniforms.uChroma.value) * 0.05;
      }

      // Speed lines
      tickSpeedLines(scrollVelocity);

      // Impact particles
      tickImpactCanvas();

      // Cursor
      tickCursor();

      // Render
      if (renderTarget && postMat) {
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        postMat.uniforms.tDiffuse.value = renderTarget.texture;
        renderer.render(postScene, postCamera);
      } else {
        renderer.render(scene, camera);
      }
    }

    requestAnimationFrame(loop);
  }

})();
