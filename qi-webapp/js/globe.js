/* QI Platform - 3D Submarine Cable Network visualization (Three.js).
 *
 * Exposes window.QIGlobe with:
 *   - STATIONS : landing-station dataset (lat/long + metadata)
 *   - CABLES   : submarine cable-segment dataset (trunk-and-branch topology)
 *   - init(containerEl) : mounts an interactive 3D globe into containerEl
 *   - dispose()         : tears the scene down and frees GPU/listeners
 *
 * The module is built as a no-build global IIFE (loaded via <script src>).
 * It MUST be safe to run where WebGL / THREE is unavailable (e.g. the jsdom
 * smoke test): init() detects a missing THREE global or a non-functional
 * WebGL context and returns without throwing. The static datasets are always
 * available so the surrounding view can still render its legend.
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

  // Build a text label as a camera-facing sprite backed by a 2D canvas.
  function makeLabelSprite(text, opts) {
    var THREE = window.THREE;
    opts = opts || {};
    var pad = 16, font = (opts.fontSize || 34) + "px 'Segoe UI', Arial, sans-serif";
    var cv = document.createElement("canvas");
    var ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.font = font;
    var w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    var h = (opts.fontSize || 34) + pad * 2;
    cv.width = w; cv.height = h;
    ctx.font = font;
    ctx.textBaseline = "middle";
    // pill background
    ctx.fillStyle = opts.bg || "rgba(11,22,40,0.72)";
    var r = 10;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = opts.color || "#e6eaf3";
    ctx.fillText(text, pad, h / 2 + 1);

    var tex = new THREE.CanvasTexture(cv);
    if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
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
    var geo = new THREE.SphereGeometry(GLOBE_R * 1.18, 48, 48);
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x4ea1ff) } },
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
        "  float intensity = pow(0.62 - dot(vNormal, vec3(0.0,0.0,1.0)), 3.0);",
        "  gl_FragColor = vec4(uColor, 1.0) * intensity;",
        "}"
      ].join("\n")
    });
    return new THREE.Mesh(geo, mat);
  }

  // Faint starfield so the globe sits in "space".
  function makeStars(THREE) {
    var n = 900, pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var r = 40 + Math.random() * 40;
      var t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.cos(p);
      pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ color: 0x9fb0cf, size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.7 });
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

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      var camDist = 6.2;
      camera.position.set(0, 0, camDist);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.cursor = "grab";
      containerEl.appendChild(renderer.domElement);

      // Lights
      scene.add(new THREE.AmbientLight(0x4a5a7a, 1.1));
      var key = new THREE.DirectionalLight(0xcfe0ff, 1.2);
      key.position.set(5, 3, 5);
      scene.add(key);
      var rim = new THREE.PointLight(0x2e5496, 1.4, 50);
      rim.position.set(-6, -2, -4);
      scene.add(rim);

      // The world group holds everything that rotates together.
      var world = new THREE.Group();
      scene.add(world);

      // Globe sphere — dark stylised ocean.
      var globeMat = new THREE.MeshPhongMaterial({
        color: 0x12233f, emissive: 0x0a1730, specular: 0x1b3a66, shininess: 18
      });
      var globe = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, 64, 64), globeMat);
      world.add(globe);

      // Latitude/longitude wireframe overlay for a "data" look.
      var gridMat = new THREE.MeshBasicMaterial({ color: 0x2e5496, wireframe: true, transparent: true, opacity: 0.12 });
      var grid = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.001, 24, 18), gridMat);
      world.add(grid);

      world.add(makeAtmosphere(THREE));
      scene.add(makeStars(THREE));

      // Landing-station markers + labels.
      var markerGeo = new THREE.SphereGeometry(0.045, 16, 16);
      var glowGeo = new THREE.SphereGeometry(0.09, 16, 16);
      var disposables = [globeMat, globe.geometry, gridMat, grid.geometry, markerGeo, glowGeo];

      STATIONS.forEach(function (st) {
        var p = latLonToVec3(st.lat, st.lon, GLOBE_R * 1.01);
        var mMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
        var marker = new THREE.Mesh(markerGeo, mMat);
        marker.position.copy(p);
        world.add(marker);
        disposables.push(mMat);

        var gMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
        var glow = new THREE.Mesh(glowGeo, gMat);
        glow.position.copy(p);
        world.add(glow);
        disposables.push(gMat);

        var label = makeLabelSprite(st.name, { fontSize: 30, scale: 0.42, color: "#ffe9b0" });
        if (label) {
          var lp = latLonToVec3(st.lat, st.lon, GLOBE_R * 1.16);
          label.position.copy(lp);
          world.add(label);
          if (label.material.map) disposables.push(label.material.map);
          disposables.push(label.material);
        }
      });

      // Submarine cables — curved arcs lifted off the surface + flowing pulses.
      var pulses = [];
      CABLES.forEach(function (cab) {
        var a = STATION_BY_ID[cab.from], b = STATION_BY_ID[cab.to];
        var start = latLonToVec3(a.lat, a.lon, GLOBE_R * 1.01);
        var end = latLonToVec3(b.lat, b.lon, GLOBE_R * 1.01);
        var mid = start.clone().add(end).multiplyScalar(0.5);
        var lift = 1 + 0.18 + 0.22 * (start.distanceTo(end) / GLOBE_R);
        mid.normalize().multiplyScalar(GLOBE_R * lift);
        var curve = new THREE.QuadraticBezierCurve3(start, mid, end);

        var col = (STATUS_COLOR[cab.status] || STATUS_COLOR.planned).hex;

        // Cable as a thin glowing tube.
        var tubeGeo = new THREE.TubeGeometry(curve, 64, 0.012, 8, false);
        var tubeMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.82 });
        var tube = new THREE.Mesh(tubeGeo, tubeMat);
        world.add(tube);
        disposables.push(tubeGeo, tubeMat);

        // Flowing light pulse travelling along the cable.
        var pGeo = new THREE.SphereGeometry(0.04, 12, 12);
        var pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        var pulse = new THREE.Mesh(pGeo, pMat);
        world.add(pulse);
        disposables.push(pGeo, pMat);
        pulses.push({ curve: curve, mesh: pulse, speed: 0.06 + Math.random() * 0.05, offset: Math.random() });

        // Mid-cable label (short id) for orientation.
        var seg = makeLabelSprite(cab.id, { fontSize: 22, scale: 0.3, color: (STATUS_COLOR[cab.status] || STATUS_COLOR.planned).css, bg: "rgba(8,16,32,0.6)" });
        if (seg) {
          seg.position.copy(mid.clone().multiplyScalar(1.02));
          world.add(seg);
          if (seg.material.map) disposables.push(seg.material.map);
          disposables.push(seg.material);
        }
      });

      // --- interaction: drag to rotate, wheel to zoom -----------------------
      var dragging = false, lastX = 0, lastY = 0;
      var rotX = 0.35;            // tilt so SE-Asia faces the camera
      world.rotation.x = rotX;
      world.rotation.y = -1.9;

      function onPointerDown(e) {
        dragging = true;
        lastX = (e.touches ? e.touches[0].clientX : e.clientX);
        lastY = (e.touches ? e.touches[0].clientY : e.clientY);
        renderer.domElement.style.cursor = "grabbing";
      }
      function onPointerMove(e) {
        if (!dragging) return;
        var cx = (e.touches ? e.touches[0].clientX : e.clientX);
        var cy = (e.touches ? e.touches[0].clientY : e.clientY);
        world.rotation.y += (cx - lastX) * 0.005;
        world.rotation.x += (cy - lastY) * 0.005;
        world.rotation.x = Math.max(-1.3, Math.min(1.3, world.rotation.x));
        lastX = cx; lastY = cy;
        if (e.cancelable) e.preventDefault();
      }
      function onPointerUp() { dragging = false; renderer.domElement.style.cursor = "grab"; }
      function onWheel(e) {
        camDist += (e.deltaY > 0 ? 1 : -1) * 0.4;
        camDist = Math.max(3.2, Math.min(12, camDist));
        camera.position.z = camDist;
        if (e.cancelable) e.preventDefault();
      }

      var el = renderer.domElement;
      el.addEventListener("mousedown", onPointerDown);
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
      el.addEventListener("touchstart", onPointerDown, { passive: true });
      el.addEventListener("touchmove", onPointerMove, { passive: false });
      el.addEventListener("touchend", onPointerUp);
      el.addEventListener("wheel", onWheel, { passive: false });

      // --- resize -----------------------------------------------------------
      function resize() {
        var w = containerEl.clientWidth || width;
        var h = containerEl.clientHeight || height;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
      var ro = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(resize);
        ro.observe(containerEl);
      }
      window.addEventListener("resize", resize);

      // --- animation loop ---------------------------------------------------
      var clock = new THREE.Clock();
      var raf = 0, alive = true;
      function animate() {
        if (!alive) return;
        raf = window.requestAnimationFrame(animate);
        var t = clock.getElapsedTime();
        if (!dragging) world.rotation.y += 0.0016;   // gentle auto-rotation
        // glowing markers breathe slightly
        for (var i = 0; i < pulses.length; i++) {
          var pu = pulses[i];
          var u = (t * pu.speed + pu.offset) % 1;
          pu.curve.getPoint(u, pu.mesh.position);
          var s = 0.7 + 0.5 * Math.sin((u) * Math.PI);   // brightest mid-span
          pu.mesh.scale.setScalar(s);
        }
        renderer.render(scene, camera);
      }

      state = {
        renderer: renderer, scene: scene, camera: camera, world: world,
        disposables: disposables, el: el, ro: ro, containerEl: containerEl,
        listeners: { onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onWheel: onWheel, resize: resize },
        stop: function () { alive = false; if (raf) window.cancelAnimationFrame(raf); }
      };

      // Only drive the loop when frames are actually available (not in jsdom).
      if (typeof window.requestAnimationFrame === "function") {
        animate();
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

  /* -------------------------------------------------------------- dispose --- */
  function dispose() {
    if (!state) return;
    var s = state;
    state = null;
    try { if (s.stop) s.stop(); } catch (e) {}
    try {
      var l = s.listeners || {};
      if (s.el) {
        s.el.removeEventListener("mousedown", l.onPointerDown);
        s.el.removeEventListener("touchstart", l.onPointerDown);
        s.el.removeEventListener("touchmove", l.onPointerMove);
        s.el.removeEventListener("touchend", l.onPointerUp);
        s.el.removeEventListener("wheel", l.onWheel);
      }
      window.removeEventListener("mousemove", l.onPointerMove);
      window.removeEventListener("mouseup", l.onPointerUp);
      window.removeEventListener("resize", l.resize);
      if (s.ro) s.ro.disconnect();
    } catch (e) {}
    try { (s.disposables || []).forEach(function (d) { if (d && typeof d.dispose === "function") d.dispose(); }); } catch (e) {}
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
    isSupported: function () { return typeof window.THREE !== "undefined" && hasWebGL(); },
    STATIONS: STATIONS,
    CABLES: CABLES,
    STATUS_COLOR: STATUS_COLOR
  };
})();
