/* QI Platform - 3D Submarine Cable Network visualization (Three.js).
 *
 * Exposes window.QIGlobe with:
 *   - STATIONS : landing-station dataset (lat/long + metadata)
 *   - CABLES   : submarine cable-segment dataset (trunk-and-branch topology)
 *   - STATUS_COLOR : status -> colour map shared with the 2D legend
 *   - init(containerEl) : mounts an interactive, photoreal 3D globe
 *   - dispose()         : tears the scene down and frees GPU/listeners
 *   - setProgress(map)  : recolours cable tubes by construction progress
 *
 * The module is built as a no-build global IIFE (loaded via <script src>).
 * It targets Three.js r128 (UMD) plus its classic examples/js add-ons
 * (OrbitControls, EffectComposer, UnrealBloomPass, FXAAShader ...) which all
 * attach to the global THREE.* namespace. Every add-on is feature-detected:
 * when one is missing the module degrades gracefully (plain renderer, custom
 * drag/zoom) and NEVER throws.
 *
 * It MUST also be safe where WebGL / THREE is unavailable (e.g. the jsdom
 * smoke test): init() detects a missing THREE global or a non-functional
 * WebGL context and returns false without throwing. The static datasets are
 * always available so the surrounding view can still render its legend.
 *
 * Earth textures are self-hosted under qi-webapp/textures/ (MIT three.js
 * example assets) so the app honours the img-src 'self' CSP and works offline.
 */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- data --- */
  // The 8 real landing stations of the Submarine Telecom Project (STP).
  var STATIONS = [
    { id: "jakarta",  name: "Jakarta",              country: "Indonesia",   lat: -6.2, lon: 106.8 },
    { id: "songkhla", name: "Songkhla",             country: "Thailand",    lat: 7.2,  lon: 100.6 },
    { id: "danang",   name: "Da Nang",              country: "Vietnam",     lat: 16.0, lon: 108.2 },
    { id: "tamsui",   name: "Tamsui",               country: "Taiwan",      lat: 25.2, lon: 121.4 },
    { id: "batangas", name: "Batangas",             country: "Philippines", lat: 13.8, lon: 121.0 },
    { id: "piti",     name: "Piti",                 country: "Guam (US)",   lat: 13.4, lon: 144.8 },
    { id: "mersing",  name: "Mersing",              country: "Malaysia",    lat: 2.4,  lon: 103.8 },
    { id: "bsb",      name: "Bandar Seri Begawan",  country: "Brunei",      lat: 4.9,  lon: 114.9 }
  ];
  var STATION_BY_ID = {};
  STATIONS.forEach(function (s) { STATION_BY_ID[s.id] = s; });

  // Great-circle distance (km) with a realistic submarine-route slack factor.
  function haversineKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var la1 = a.lat * rad, la2 = b.lat * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 1.12);
  }

  // Submarine cable segments — a realistic trunk-and-branch topology.
  // status: "commissioned" | "in-progress" | "planned"
  var CABLE_DEFS = [
    { id: "STP-T1", n: "STP-Trunk-1",  from: "jakarta",  to: "mersing",  fp: 24, cap: 384, status: "commissioned" },
    { id: "STP-T2", n: "STP-Trunk-2",  from: "mersing",  to: "songkhla", fp: 24, cap: 384, status: "commissioned" },
    { id: "STP-T3", n: "STP-Trunk-3",  from: "songkhla", to: "danang",   fp: 20, cap: 320, status: "in-progress" },
    { id: "STP-T4", n: "STP-Trunk-4",  from: "danang",   to: "batangas", fp: 20, cap: 320, status: "in-progress" },
    { id: "STP-T5", n: "STP-Trunk-5",  from: "batangas", to: "tamsui",   fp: 16, cap: 256, status: "planned" },
    { id: "STP-B1", n: "STP-Branch-1", from: "batangas", to: "piti",     fp: 12, cap: 192, status: "planned" },
    { id: "STP-B2", n: "STP-Branch-2", from: "mersing",  to: "bsb",      fp: 12, cap: 192, status: "in-progress" },
    { id: "STP-B3", n: "STP-Branch-3", from: "bsb",      to: "batangas", fp: 12, cap: 192, status: "planned" }
  ];
  var CABLES = CABLE_DEFS.map(function (c) {
    var a = STATION_BY_ID[c.from], b = STATION_BY_ID[c.to];
    return {
      id: c.id,
      name: c.n + ": " + a.name + "\u2013" + b.name,
      from: c.from,
      to: c.to,
      lengthKm: haversineKm(a, b),
      fibrePairs: c.fp,
      capacityTbps: c.cap,
      status: c.status
    };
  });

  // Status -> colour (hex int + css string) used by both 3D scene and legend.
  var STATUS_COLOR = {
    "commissioned": { hex: 0x42d6a4, css: "#42d6a4" },
    "in-progress":  { hex: 0x4ea1ff, css: "#4ea1ff" },
    "planned":      { hex: 0xe6b84a, css: "#e6b84a" }
  };

  // Self-hosted Earth textures (relative to index.html → same-origin, CSP-safe).
  var TEX = {
    day:      "textures/earth_day.jpg",
    normal:   "textures/earth_normal.jpg",
    specular: "textures/earth_specular.jpg",
    clouds:   "textures/earth_clouds.png",
    lights:   "textures/earth_lights.png"
  };

  /* ----------------------------------------------------------- internals --- */
  var GLOBE_R = 2;          // globe radius in scene units
  var state = null;         // holds live scene objects when mounted

  function hasWebGL() {
    try {
      if (!window.WebGLRenderingContext) return false;
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      return !!(gl && typeof gl.getParameter === "function");
    } catch (e) { return false; }
  }

  // Convert geographic lat/long to a point on a sphere of the given radius.
  function latLonToVec3(lat, lon, r) {
    var phi = (90 - lat) * Math.PI / 180;
    var theta = (lon + 180) * Math.PI / 180;
    return new window.THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }

  // Tag a colour texture as sRGB (r128 API), guarded for older/newer builds.
  function markSRGB(tex) {
    var THREE = window.THREE;
    if (!tex) return tex;
    try {
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      else if (THREE.SRGBColorSpace && "colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    } catch (e) {}
    return tex;
  }

  // Build a text label as a camera-facing sprite backed by a 2D canvas.
  // Rendered at an internal super-sample factor so labels stay crisp.
  function makeLabelSprite(text, opts) {
    var THREE = window.THREE;
    opts = opts || {};
    var ss = 2;  // super-sample for crisp text
    var fontPx = (opts.fontSize || 34) * ss;
    var pad = 16 * ss, font = fontPx + "px 'Segoe UI', Arial, sans-serif";
    var cv = document.createElement("canvas");
    var ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.font = font;
    var w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    var h = fontPx + pad * 2;
    cv.width = w; cv.height = h;
    ctx.font = font;
    ctx.textBaseline = "middle";
    // rounded pill background
    ctx.fillStyle = opts.bg || "rgba(11,22,40,0.74)";
    var r = 12 * ss;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill();
    // subtle border
    ctx.lineWidth = 1 * ss;
    ctx.strokeStyle = opts.border || "rgba(120,160,220,0.35)";
    ctx.stroke();
    ctx.fillStyle = opts.color || "#e6eaf3";
    ctx.fillText(text, pad, h / 2 + 1);

    var tex = new THREE.CanvasTexture(cv);
    markSRGB(tex);
    if (THREE.LinearFilter) tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    var sprite = new THREE.Sprite(mat);
    var scale = (opts.scale || 0.5);
    sprite.scale.set(scale * (w / h), scale, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // Atmosphere fresnel glow via a lightweight shader (BackSide rim light).
  function makeAtmosphere(THREE) {
    var geo = new THREE.SphereGeometry(GLOBE_R * 1.16, 64, 64);
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x5aa9ff) } },
      vertexShader: [
        "varying vec3 vNormal;",
        "void main(){",
        "  vNormal = normalize(normalMatrix * normal);",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "varying vec3 vNormal;",
        "uniform vec3 uColor;",
        "void main(){",
        "  float intensity = pow(0.66 - dot(vNormal, vec3(0.0,0.0,1.0)), 3.2);",
        "  gl_FragColor = vec4(uColor, 1.0) * clamp(intensity, 0.0, 1.4);",
        "}"
      ].join("\n")
    });
    return new THREE.Mesh(geo, mat);
  }

  // City-lights night side: additive shader that only shows where the surface
  // faces away from the sun. World-space normal keeps it correct as Earth spins.
  function makeNightLights(THREE, lightsTex, sunDirRef) {
    var geo = new THREE.SphereGeometry(GLOBE_R * 1.002, 64, 64);
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uLights: { value: lightsTex },
        uSunDir: { value: sunDirRef.clone() }
      },
      vertexShader: [
        "varying vec3 vWorldNormal;",
        "varying vec2 vUv;",
        "void main(){",
        "  vUv = uv;",
        "  vWorldNormal = normalize(mat3(modelMatrix) * normal);",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform sampler2D uLights;",
        "uniform vec3 uSunDir;",
        "varying vec3 vWorldNormal;",
        "varying vec2 vUv;",
        "void main(){",
        "  float lit = dot(normalize(vWorldNormal), normalize(uSunDir));",
        "  float night = smoothstep(0.08, -0.28, lit);",   // 1 on dark side, 0 on lit side
        "  vec3 c = texture2D(uLights, vUv).rgb;",
        "  gl_FragColor = vec4(c * night * 1.5, 1.0);",
        "}"
      ].join("\n")
    });
    return new THREE.Mesh(geo, mat);
  }

  // Layered starfield so the globe sits in deep space (two sizes for depth).
  function makeStars(THREE, count, size, color, opacity) {
    var pos = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var r = 60 + Math.random() * 60;
      var t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.cos(p);
      pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ color: color, size: size, sizeAttenuation: true, transparent: true, opacity: opacity, depthWrite: false });
    return new THREE.Points(g, m);
  }

  /* ----------------------------------------------------------------- init --- */
  function init(containerEl) {
    if (!containerEl) return false;
    if (typeof window.THREE === "undefined" || !hasWebGL()) {
      // Graceful no-op: the surrounding view shows a 2D fallback + the legend.
      return false;
    }
    if (state) dispose();

    var THREE = window.THREE;
    try {
      var width = containerEl.clientWidth || 800;
      var height = containerEl.clientHeight || 520;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      var camDist = 6.2;
      camera.position.set(0, 0, camDist);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height);
      // Colour management + cinematic tone mapping (all guarded for the r128 API).
      try { if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding; } catch (e) {}
      try {
        if (THREE.ACESFilmicToneMapping) {
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.05;
        }
      } catch (e) {}
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.cursor = "grab";
      containerEl.appendChild(renderer.domElement);

      var disposables = [];

      // ---- textures (async, non-blocking — they pop in once decoded) -------
      var loader = new THREE.TextureLoader();
      function loadTex(url, srgb) {
        var t = loader.load(url);
        if (srgb) markSRGB(t);
        if (THREE.LinearMipmapLinearFilter) t.minFilter = THREE.LinearMipmapLinearFilter;
        disposables.push(t);
        return t;
      }
      var dayTex      = loadTex(TEX.day, true);
      var normalTex   = loadTex(TEX.normal, false);
      var specularTex = loadTex(TEX.specular, false);
      var cloudsTex   = loadTex(TEX.clouds, true);
      var lightsTex   = loadTex(TEX.lights, true);

      // ---- lighting --------------------------------------------------------
      scene.add(new THREE.AmbientLight(0x3a4a66, 0.55));
      var sun = new THREE.DirectionalLight(0xfff4e6, 2.0);
      sun.position.set(5, 2.2, 4.2);     // lights SE-Asia / the Pacific rim
      scene.add(sun);
      var sunDir = sun.position.clone().normalize();
      // faint cool fill from behind for rim separation
      var fill = new THREE.DirectionalLight(0x2e5496, 0.35);
      fill.position.set(-6, -1.5, -4);
      scene.add(fill);

      // The world group holds everything that rotates together with the Earth.
      var world = new THREE.Group();
      scene.add(world);

      // ---- Earth -----------------------------------------------------------
      var globeMat = new THREE.MeshPhongMaterial({
        map: dayTex,
        normalMap: normalTex,
        specularMap: specularTex,
        specular: new THREE.Color(0x404a5a),  // oceans glint, land stays matte
        shininess: 18
      });
      if (globeMat.normalScale && globeMat.normalScale.set) globeMat.normalScale.set(0.85, 0.85);
      var globeGeo = new THREE.SphereGeometry(GLOBE_R, 96, 96);
      var globe = new THREE.Mesh(globeGeo, globeMat);
      world.add(globe);
      disposables.push(globeMat, globeGeo);

      // ---- night city lights (additive, dark-side only) --------------------
      var night = null;
      try {
        night = makeNightLights(THREE, lightsTex, sunDir);
        world.add(night);
        disposables.push(night.geometry, night.material);
      } catch (e) { night = null; }

      // ---- clouds (transparent, rotate a touch faster than the surface) ----
      var clouds = null;
      try {
        var cloudGeo = new THREE.SphereGeometry(GLOBE_R * 1.01, 64, 64);
        var cloudMat = new THREE.MeshBasicMaterial({
          map: cloudsTex, transparent: true, opacity: 0.78,
          blending: THREE.AdditiveBlending, depthWrite: false
        });
        clouds = new THREE.Mesh(cloudGeo, cloudMat);
        world.add(clouds);
        disposables.push(cloudGeo, cloudMat);
      } catch (e) { clouds = null; }

      // ---- atmosphere + starfield -----------------------------------------
      var atmo = makeAtmosphere(THREE);
      world.add(atmo);
      disposables.push(atmo.geometry, atmo.material);

      var stars1 = makeStars(THREE, 1400, 0.13, 0xcdd8f0, 0.85);
      var stars2 = makeStars(THREE, 700, 0.26, 0x9fb0cf, 0.55);
      scene.add(stars1); scene.add(stars2);
      disposables.push(stars1.geometry, stars1.material, stars2.geometry, stars2.material);

      // ---- landing stations: beacon + animated surface pulse ring ----------
      var rings = [];
      var beaconGeo = new THREE.SphereGeometry(0.04, 18, 18);
      disposables.push(beaconGeo);
      STATIONS.forEach(function (st, i) {
        var p = latLonToVec3(st.lat, st.lon, GLOBE_R * 1.008);

        var bMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
        var beacon = new THREE.Mesh(beaconGeo, bMat);
        beacon.position.copy(p);
        world.add(beacon);
        disposables.push(bMat);

        // expanding / fading ring laid flat against the surface (live pulse)
        var ringGeo = new THREE.RingGeometry(0.05, 0.075, 28);
        var ringMat = new THREE.MeshBasicMaterial({
          color: 0xffd24a, transparent: true, opacity: 0.6,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
        });
        var ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(p);
        ring.lookAt(p.clone().multiplyScalar(2));   // orient normal radially outward
        world.add(ring);
        disposables.push(ringGeo, ringMat);
        rings.push({ mesh: ring, mat: ringMat, offset: i / STATIONS.length });

        var label = makeLabelSprite(st.name, { fontSize: 30, scale: 0.42, color: "#ffe9b0" });
        if (label) {
          var lp = latLonToVec3(st.lat, st.lon, GLOBE_R * 1.17);
          label.position.copy(lp);
          world.add(label);
          if (label.material.map) disposables.push(label.material.map);
          disposables.push(label.material);
        }
      });

      // ---- submarine cables: glowing tube + halo + flowing pulse -----------
      var pulses = [];
      var cableTubes = [];   // keep tube materials so progress can recolour them
      CABLES.forEach(function (cab) {
        var a = STATION_BY_ID[cab.from], b = STATION_BY_ID[cab.to];
        var start = latLonToVec3(a.lat, a.lon, GLOBE_R * 1.008);
        var end = latLonToVec3(b.lat, b.lon, GLOBE_R * 1.008);
        var mid = start.clone().add(end).multiplyScalar(0.5);
        var lift = 1 + 0.18 + 0.22 * (start.distanceTo(end) / GLOBE_R);
        mid.normalize().multiplyScalar(GLOBE_R * lift);
        var curve = new THREE.QuadraticBezierCurve3(start, mid, end);

        var col = (STATUS_COLOR[cab.status] || STATUS_COLOR.planned).hex;
        // thickness scales subtly with fibre-pair count (12..24 -> ~0.011..0.018)
        var radius = 0.010 + 0.0035 * ((cab.fibrePairs || 12) / 12);

        // bright core tube (picked up by bloom)
        var tubeGeo = new THREE.TubeGeometry(curve, 80, radius, 10, false);
        var tubeMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92 });
        var tube = new THREE.Mesh(tubeGeo, tubeMat);
        world.add(tube);
        disposables.push(tubeGeo, tubeMat);

        // wide faint halo underneath for a glow base
        var haloGeo = new THREE.TubeGeometry(curve, 80, radius * 3.2, 10, false);
        var haloMat = new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false
        });
        var halo = new THREE.Mesh(haloGeo, haloMat);
        world.add(halo);
        disposables.push(haloGeo, haloMat);

        cableTubes.push({ id: cab.id, cable: cab, mat: tubeMat, haloMat: haloMat, baseHex: col });

        // flowing light pulse travelling along the cable
        var pGeo = new THREE.SphereGeometry(0.045, 14, 14);
        var pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false });
        var pulse = new THREE.Mesh(pGeo, pMat);
        world.add(pulse);
        disposables.push(pGeo, pMat);
        pulses.push({ curve: curve, mesh: pulse, speed: 0.06 + Math.random() * 0.05, offset: Math.random() });

        // mid-cable id label for orientation
        var seg = makeLabelSprite(cab.id, { fontSize: 22, scale: 0.3, color: (STATUS_COLOR[cab.status] || STATUS_COLOR.planned).css, bg: "rgba(8,16,32,0.62)" });
        if (seg) {
          seg.position.copy(mid.clone().multiplyScalar(1.02));
          world.add(seg);
          if (seg.material.map) disposables.push(seg.material.map);
          disposables.push(seg.material);
        }
      });

      // initial orientation: tilt + spin so SE-Asia faces the camera
      world.rotation.x = 0.32;
      world.rotation.y = -1.9;

      /* ---------------------------------------------- controls / interaction */
      var controls = null;
      var listeners = {};
      var hasOrbit = typeof THREE.OrbitControls === "function";
      if (hasOrbit) {
        try {
          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;
          controls.enablePan = false;
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.3;
          controls.minDistance = 3.2;
          controls.maxDistance = 12;
          controls.rotateSpeed = 0.6;
          controls.zoomSpeed = 0.8;
        } catch (e) { controls = null; }
      }

      if (!controls) {
        // ---- fallback: custom drag-to-rotate + wheel-to-zoom ---------------
        var dragging = false, lastX = 0, lastY = 0;
        listeners.onPointerDown = function (e) {
          dragging = true;
          lastX = (e.touches ? e.touches[0].clientX : e.clientX);
          lastY = (e.touches ? e.touches[0].clientY : e.clientY);
          renderer.domElement.style.cursor = "grabbing";
        };
        listeners.onPointerMove = function (e) {
          if (!dragging) return;
          var cx = (e.touches ? e.touches[0].clientX : e.clientX);
          var cy = (e.touches ? e.touches[0].clientY : e.clientY);
          world.rotation.y += (cx - lastX) * 0.005;
          world.rotation.x += (cy - lastY) * 0.005;
          world.rotation.x = Math.max(-1.3, Math.min(1.3, world.rotation.x));
          lastX = cx; lastY = cy;
          if (e.cancelable) e.preventDefault();
        };
        listeners.onPointerUp = function () { dragging = false; renderer.domElement.style.cursor = "grab"; };
        listeners.onWheel = function (e) {
          camDist += (e.deltaY > 0 ? 1 : -1) * 0.4;
          camDist = Math.max(3.2, Math.min(12, camDist));
          camera.position.z = camDist;
          if (e.cancelable) e.preventDefault();
        };
        var elc = renderer.domElement;
        elc.addEventListener("mousedown", listeners.onPointerDown);
        window.addEventListener("mousemove", listeners.onPointerMove);
        window.addEventListener("mouseup", listeners.onPointerUp);
        elc.addEventListener("touchstart", listeners.onPointerDown, { passive: true });
        elc.addEventListener("touchmove", listeners.onPointerMove, { passive: false });
        elc.addEventListener("touchend", listeners.onPointerUp);
        elc.addEventListener("wheel", listeners.onWheel, { passive: false });
        state = state || {};
        state.__dragging = function () { return dragging; };
      }

      /* ------------------------------------------------- post-processing ---- */
      var composer = null, bloomPass = null, fxaaPass = null;
      var canCompose = typeof THREE.EffectComposer === "function" &&
                       typeof THREE.RenderPass === "function" &&
                       typeof THREE.UnrealBloomPass === "function";
      if (canCompose) {
        try {
          composer = new THREE.EffectComposer(renderer);
          composer.setSize(width, height);
          if (composer.setPixelRatio) composer.setPixelRatio(dpr);
          composer.addPass(new THREE.RenderPass(scene, camera));
          bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(width, height), 0.75, 0.4, 0.85);
          composer.addPass(bloomPass);
          var lastPass = bloomPass;
          if (typeof THREE.ShaderPass === "function" && THREE.FXAAShader) {
            fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
            var pr = renderer.getPixelRatio();
            fxaaPass.material.uniforms["resolution"].value.set(1 / (width * pr), 1 / (height * pr));
            composer.addPass(fxaaPass);
            lastPass = fxaaPass;
          }
          if (lastPass) lastPass.renderToScreen = true;
        } catch (e) { composer = null; }
      }

      /* ------------------------------------------------------------- resize */
      function resize() {
        var w = containerEl.clientWidth || width;
        var h = containerEl.clientHeight || height;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (composer) composer.setSize(w, h);
        if (bloomPass && bloomPass.setSize) bloomPass.setSize(w, h);
        if (fxaaPass) {
          var pr2 = renderer.getPixelRatio();
          fxaaPass.material.uniforms["resolution"].value.set(1 / (w * pr2), 1 / (h * pr2));
        }
      }
      listeners.resize = resize;
      var ro = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(resize);
        ro.observe(containerEl);
      }
      window.addEventListener("resize", resize);

      /* --------------------------------------------------- animation loop -- */
      var clock = new THREE.Clock();
      var raf = 0, alive = true;
      var dragFn = state && state.__dragging ? state.__dragging : function () { return false; };
      function animate() {
        if (!alive) return;
        raf = window.requestAnimationFrame(animate);
        var t = clock.getElapsedTime();

        if (controls) {
          controls.update();
        } else if (!dragFn()) {
          world.rotation.y += 0.0016;     // gentle auto-rotation in fallback
        }

        if (clouds) clouds.rotation.y += 0.00045;   // clouds drift a touch faster

        // slowly drift the sun for a living terminator, keep night-lights in sync
        sun.position.x = 5 * Math.cos(t * 0.015);
        sun.position.z = 4.2 * Math.sin(t * 0.015) + 2.0;
        sunDir.copy(sun.position).normalize();
        if (night && night.material && night.material.uniforms) {
          night.material.uniforms.uSunDir.value.copy(sunDir);
        }

        // flowing cable pulses (brightest mid-span)
        for (var i = 0; i < pulses.length; i++) {
          var pu = pulses[i];
          var u = (t * pu.speed + pu.offset) % 1;
          pu.curve.getPoint(u, pu.mesh.position);
          pu.mesh.scale.setScalar(0.7 + 0.5 * Math.sin(u * Math.PI));
        }
        // expanding station pulse rings
        for (var k = 0; k < rings.length; k++) {
          var rg = rings[k];
          var rp = (t * 0.5 + rg.offset) % 1;
          var sc = 1 + rp * 2.6;
          rg.mesh.scale.set(sc, sc, sc);
          rg.mat.opacity = 0.6 * (1 - rp);
        }

        if (composer) composer.render();
        else renderer.render(scene, camera);
      }

      var prevState = state || {};
      state = {
        renderer: renderer, scene: scene, camera: camera, world: world,
        disposables: disposables, el: renderer.domElement, ro: ro, containerEl: containerEl,
        cableTubes: cableTubes, controls: controls, composer: composer,
        bloomPass: bloomPass, fxaaPass: fxaaPass,
        listeners: listeners,
        stop: function () { alive = false; if (raf) window.cancelAnimationFrame(raf); }
      };
      // carry over the fallback drag-probe if one was installed
      if (prevState.__dragging) state.__dragging = prevState.__dragging;

      // Best-effort: reflect any saved route progress on first mount.
      try { setProgress(); } catch (e) {}

      // Only drive the loop when frames are actually available (not in jsdom).
      if (typeof window.requestAnimationFrame === "function") {
        animate();
      } else if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
      return true;
    } catch (err) {
      // Never let a rendering failure crash the host app.
      try { dispose(); } catch (e) {}
      if (window.console && console.warn) console.warn("QIGlobe init failed:", err && err.message);
      return false;
    }
  }

  /* ----------------------------------------------------------- progress --- */
  // Recolour each cable tube by its construction progress (0..100). Accepts an
  // explicit { cableId: percent } map; when omitted it reads QIStore.routeProgress()
  // if that module is available. Fully guarded — a no-op when the globe is not
  // mounted (e.g. the jsdom smoke run) or when no progress data exists.
  function progressColor(THREE, pct) {
    // amber (0%) -> blue (50%) -> green (100%)
    var p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
    var amber = new THREE.Color(0xe6b84a), blue = new THREE.Color(0x4ea1ff), green = new THREE.Color(0x42d6a4);
    var c = new THREE.Color();
    if (p < 0.5) c.copy(amber).lerp(blue, p / 0.5);
    else c.copy(blue).lerp(green, (p - 0.5) / 0.5);
    return c;
  }
  function setProgress(map) {
    if (!state || !state.cableTubes || typeof window.THREE === "undefined") return false;
    var THREE = window.THREE;
    // Derive a percent map from the store when none is supplied.
    if (!map && window.QIStore && typeof window.QIStore.routeProgress === "function") {
      try {
        var rp = window.QIStore.routeProgress();
        map = {};
        CABLES.forEach(function (c) {
          var e = rp[c.id];
          if (!e) return;
          map[c.id] = (typeof window.QIStore.routeOverall === "function")
            ? window.QIStore.routeOverall(c, e)
            : (c.lengthKm ? Math.round((Number(e.laidKm) || 0) / c.lengthKm * 100) : 0);
        });
      } catch (e) { map = null; }
    }
    if (!map) return false;
    state.cableTubes.forEach(function (t) {
      if (!t.mat) return;
      if (Object.prototype.hasOwnProperty.call(map, t.id)) {
        try {
          var col = progressColor(THREE, map[t.id]);
          t.mat.color = col; t.mat.needsUpdate = true;
          if (t.haloMat) { t.haloMat.color = col.clone(); t.haloMat.needsUpdate = true; }
        } catch (e) {}
      }
    });
    return true;
  }

  /* -------------------------------------------------------------- dispose --- */
  function dispose() {
    if (!state) return;
    var s = state;
    state = null;
    try { if (s.stop) s.stop(); } catch (e) {}
    try {
      var l = s.listeners || {};
      if (s.el) {
        if (l.onPointerDown) { s.el.removeEventListener("mousedown", l.onPointerDown); s.el.removeEventListener("touchstart", l.onPointerDown); }
        if (l.onPointerMove) s.el.removeEventListener("touchmove", l.onPointerMove);
        if (l.onPointerUp) s.el.removeEventListener("touchend", l.onPointerUp);
        if (l.onWheel) s.el.removeEventListener("wheel", l.onWheel);
      }
      if (l.onPointerMove) window.removeEventListener("mousemove", l.onPointerMove);
      if (l.onPointerUp) window.removeEventListener("mouseup", l.onPointerUp);
      if (l.resize) window.removeEventListener("resize", l.resize);
      if (s.ro) s.ro.disconnect();
    } catch (e) {}
    try { if (s.controls && s.controls.dispose) s.controls.dispose(); } catch (e) {}
    try { (s.disposables || []).forEach(function (d) { if (d && typeof d.dispose === "function") d.dispose(); }); } catch (e) {}
    try {
      if (s.composer) {
        if (s.composer.renderTarget1 && s.composer.renderTarget1.dispose) s.composer.renderTarget1.dispose();
        if (s.composer.renderTarget2 && s.composer.renderTarget2.dispose) s.composer.renderTarget2.dispose();
        if (s.bloomPass && s.bloomPass.dispose) s.bloomPass.dispose();
        if (s.fxaaPass && s.fxaaPass.dispose) s.fxaaPass.dispose();
      }
    } catch (e) {}
    try {
      if (s.renderer) {
        s.renderer.dispose();
        if (s.renderer.domElement && s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
      }
    } catch (e) {}
  }

  /* --------------------------------------------------------------- export --- */
  window.QIGlobe = {
    init: init,
    dispose: dispose,
    setProgress: setProgress,
    isSupported: function () { return typeof window.THREE !== "undefined" && hasWebGL(); },
    STATIONS: STATIONS,
    CABLES: CABLES,
    STATUS_COLOR: STATUS_COLOR
  };
})();
