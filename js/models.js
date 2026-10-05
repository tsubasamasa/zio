/* Kartzooka.io — smooth procedural 3D models (no external files) */
(function (KZ) {
  'use strict';
  const T = window.THREE;
  const PI = Math.PI;

  /* ---------------- materials ---------------- */
  const matCache = new Map();
  function mat(color, o) {
    o = o || {};
    const kind = o.kind || 'lambert';
    const key = kind + '|' + color + '|' + (o.emissive || 0) + '|' + (o.opacity || 1) + '|' + (o.map ? o.map.uuid : '');
    if (!o.unique && matCache.has(key)) return matCache.get(key);
    const base = { color, emissive: o.emissive || 0, transparent: (o.opacity || 1) < 1, opacity: o.opacity || 1, map: o.map || null };
    const m = kind === 'phong' ? new T.MeshPhongMaterial(Object.assign(base, { shininess: o.shininess || 60, specular: o.specular || 0x3a3a3a })) : new T.MeshLambertMaterial(base);
    if (o.side) m.side = o.side;
    if (!o.unique) matCache.set(key, m);
    return m;
  }
  const gloss = (c, s) => mat(c, { kind: 'phong', shininess: s || 70, specular: 0x555555 });

  let stripeCanvasTex = null;
  function paintMat(color, paint) {
    switch (paint) {
      case 'matte': return mat(color, { unique: true });
      case 'metal': return mat(shade(color, 0.85), { kind: 'phong', unique: true, shininess: 140, specular: 0xbbbbbb });
      case 'neon': return mat(color, { kind: 'phong', unique: true, shininess: 90, specular: 0x666666, emissive: shade(color, 0.45) });
      case 'gold': return mat(0xffc21a, { kind: 'phong', unique: true, shininess: 160, specular: 0xfff0b0, emissive: 0x3a2400 });
      case 'candy': {
        const t = canvasTex(128, 128, (c, w, h) => {
          c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
          c.fillStyle = hex(color);
          for (let i = -2; i < 6; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32 + 16, 0); c.lineTo(i * 32 + 48, h); c.lineTo(i * 32 + 32, h); c.fill(); }
        });
        t.wrapS = t.wrapT = T.RepeatWrapping;
        void stripeCanvasTex;
        return mat(0xffffff, { kind: 'phong', unique: true, map: t, shininess: 90, specular: 0x555555 });
      }
      default: return mat(color, { kind: 'phong', unique: true, shininess: 85, specular: 0x5a5a5a });
    }
  }

  function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

  // Rounded box with true smooth normals
  const rbCache = new Map();
  function roundedBox(w, h, d, r, seg) {
    seg = seg || 4;
    r = Math.min(r, w / 2, h / 2, d / 2);
    const key = [w, h, d, r, seg].join(',');
    if (rbCache.has(key)) return rbCache.get(key);
    const g = new T.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
    const v = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
      n.subVectors(v, c);
      if (n.lengthSq() < 1e-9) n.fromBufferAttribute(nor, i); else n.normalize();
      v.copy(c).addScaledVector(n, r);
      pos.setXYZ(i, v.x, v.y, v.z);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    rbCache.set(key, g);
    return g;
  }

  const sphere = (r, ws, hs) => new T.SphereGeometry(r, ws || 24, hs || 16);
  const half = (r, ws) => new T.SphereGeometry(r, ws || 24, 12, 0, PI * 2, 0, PI / 2);
  const cyl = (rt, rb, h, s) => new T.CylinderGeometry(rt, rb, h, s || 24);

  function mesh(geo, m, shadow) {
    const o = new T.Mesh(geo, m);
    if (shadow !== false) { o.castShadow = true; o.receiveShadow = true; }
    return o;
  }
  function at(o, x, y, z) { o.position.set(x, y, z); return o; }
  function addTo(parent, o) { parent.add(o); return o; }

  function shade(color, k) {
    const c = new T.Color(color);
    c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
    return c.getHex();
  }

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  /* ---------------- drivers ---------------- */
  const SKIN = 0xffcf9e;
  function eyes(g, y, z, sx, size, color) {
    const w = mat(0xffffff), b = mat(0x1b1b26);
    for (const s of [-1, 1]) {
      g.add(at(mesh(sphere(size, 16, 12), w, false), s * sx, y, z));
      g.add(at(mesh(sphere(size * 0.55, 12, 10), color ? mat(color, { emissive: shade(color, 0.6) }) : b, false), s * sx, y, z + size * 0.75));
      g.add(at(mesh(sphere(size * 0.18, 8, 6), w, false), s * sx + size * 0.18, y + size * 0.2, z + size * 1.05));
    }
  }
  function ears(g, color, kind, y) {
    for (const s of [-1, 1]) {
      let e;
      if (kind === 'round') e = mesh(sphere(0.22, 16, 12), mat(color));
      else { e = mesh(new T.ConeGeometry(0.22, 0.45, 16), mat(color)); e.rotation.z = -s * 0.35; }
      g.add(at(e, s * 0.42, y, 0));
    }
  }

  function driver(character, color, hatId) {
    const g = new T.Group();
    const suit = gloss(color);
    g.add(at(mesh(new T.CapsuleGeometry(0.42, 0.45, 8, 20), suit), 0, 0.45, 0));
    // arms on the wheel
    for (const s of [-1, 1]) {
      const arm = mesh(new T.CapsuleGeometry(0.13, 0.55, 6, 12), suit);
      arm.position.set(s * 0.42, 0.62, 0.38);
      arm.rotation.x = -1.1; arm.rotation.z = -s * 0.25;
      g.add(arm);
      g.add(at(mesh(sphere(0.15, 14, 10), mat(0xffffff)), s * 0.32, 0.5, 0.75));
    }
    const head = new T.Group();
    head.position.y = 1.35;
    g.add(head);
    let headR = 0.62, hatY = 0.3;
    switch (character) {
      case 'fox':
        head.add(mesh(sphere(0.6, 28, 20), gloss(0xff8a2a)));
        head.add(at(mesh(sphere(0.32, 20, 14), mat(0xffffff)), 0, -0.15, 0.4));
        head.add(at(mesh(sphere(0.09, 12, 10), mat(0x1b1b26)), 0, -0.05, 0.72));
        ears(head, 0xff8a2a, 'pointy', 0.55);
        eyes(head, 0.12, 0.45, 0.22, 0.12);
        break;
      case 'bear':
        head.add(mesh(sphere(0.62, 28, 20), gloss(0x9a6236)));
        head.add(at(mesh(sphere(0.3, 20, 14), mat(0xe9c79a)), 0, -0.15, 0.42));
        head.add(at(mesh(sphere(0.1, 12, 10), mat(0x1b1b26)), 0, -0.06, 0.72));
        ears(head, 0x9a6236, 'round', 0.5);
        eyes(head, 0.15, 0.48, 0.22, 0.1);
        break;
      case 'cat':
        head.add(mesh(sphere(0.6, 28, 20), gloss(0xb8bccc)));
        head.add(at(mesh(sphere(0.24, 18, 12), mat(0xffffff)), 0, -0.18, 0.45));
        head.add(at(mesh(sphere(0.07, 10, 8), mat(0xff7ab0)), 0, -0.05, 0.66));
        ears(head, 0xb8bccc, 'pointy', 0.55);
        eyes(head, 0.14, 0.46, 0.22, 0.13, 0x3ddc5a);
        break;
      case 'robot': {
        head.add(mesh(roundedBox(1.05, 0.9, 0.95, 0.22), mat(0xc9d3e0, { kind: 'phong', shininess: 140, specular: 0xffffff })));
        head.add(at(mesh(roundedBox(0.85, 0.3, 0.1, 0.08), mat(0x1b2a44)), 0, 0.08, 0.47));
        for (const s of [-1, 1]) head.add(at(mesh(sphere(0.08, 12, 8), mat(0x6ff0ff, { emissive: 0x2fb0c0 }), false), s * 0.2, 0.08, 0.53));
        head.add(at(mesh(cyl(0.03, 0.03, 0.45, 8), mat(0x8a95a5)), 0, 0.65, 0));
        head.add(at(mesh(sphere(0.1, 12, 8), mat(0xff4d4d, { emissive: 0x991010 })), 0, 0.9, 0));
        headR = 0.5; hatY = 0.45;
        break;
      }
      case 'frog':
        head.add(mesh(sphere(0.62, 28, 20), gloss(0x45d65a)));
        head.children[0].scale.set(1.15, 0.85, 1);
        for (const s of [-1, 1]) {
          head.add(at(mesh(sphere(0.2, 16, 12), gloss(0x45d65a)), s * 0.3, 0.45, 0.2));
        }
        eyes(head, 0.5, 0.33, 0.3, 0.13);
        addTo(head, at(mesh(new T.TorusGeometry(0.28, 0.035, 8, 20, PI), mat(0x1b1b26), false), 0, -0.1, 0.55)).rotation.z = PI;
        break;
      case 'alien':
        head.add(mesh(sphere(0.64, 28, 20), gloss(0x5ff0c8)));
        head.children[0].scale.set(1, 1.15, 1);
        for (const s of [-1, 1]) {
          const e = mesh(sphere(0.2, 18, 12), mat(0x14121f, { kind: 'phong', shininess: 150, specular: 0xffffff }));
          e.scale.set(0.8, 1.2, 0.5); e.position.set(s * 0.25, 0.08, 0.52); e.rotation.z = s * 0.4;
          head.add(e);
          head.add(at(mesh(cyl(0.025, 0.025, 0.5, 8), mat(0x5ff0c8)), s * 0.25, 0.85, 0));
          head.add(at(mesh(sphere(0.09, 12, 8), mat(0xff4fae, { emissive: 0x991060 })), s * 0.25, 1.1, 0));
        }
        hatY = 0.5;
        break;
      case 'penguin':
        head.add(mesh(sphere(0.6, 28, 20), gloss(0x22232e)));
        head.add(at(mesh(sphere(0.45, 24, 16), mat(0xffffff)), 0, -0.05, 0.25));
        addTo(head, at(mesh(new T.ConeGeometry(0.12, 0.3, 14), mat(0xffa21a)), 0, -0.08, 0.68)).rotation.x = PI / 2;
        eyes(head, 0.12, 0.5, 0.18, 0.1);
        break;
      case 'panda':
        head.add(mesh(sphere(0.62, 28, 20), gloss(0xffffff)));
        ears(head, 0x22232e, 'round', 0.5);
        for (const s of [-1, 1]) { const p = mesh(sphere(0.17, 14, 10), mat(0x22232e)); p.scale.set(1, 1.3, 0.5); p.position.set(s * 0.22, 0.12, 0.5); head.add(p); }
        eyes(head, 0.14, 0.58, 0.22, 0.07);
        head.add(at(mesh(sphere(0.08, 12, 8), mat(0x22232e)), 0, -0.08, 0.62));
        break;
      default: // kid
        head.add(mesh(sphere(0.62, 28, 20), gloss(SKIN, 30)));
        eyes(head, 0.08, 0.5, 0.21, 0.13);
        addTo(head, at(mesh(new T.TorusGeometry(0.15, 0.035, 8, 20, PI), mat(0x1b1b26), false), 0, -0.15, 0.56)).rotation.z = PI;
        for (const s of [-1, 1]) head.add(at(mesh(sphere(0.08, 10, 8), mat(0xff9a8a), false), s * 0.36, -0.07, 0.48));
    }
    addHat(head, hatId, color, headR, hatY);
    return g;
  }

  function addHat(head, hat, color, r, y) {
    const hm = gloss(shade(color, 0.9));
    const ret = {};
    switch (hat) {
      case 'cap':
        head.add(at(mesh(half(r + 0.03), hm), 0, y - 0.25, 0));
        addTo(head, at(mesh(cyl(0.45, 0.45, 0.06, 24), hm), 0, y - 0.2, 0.5)).scale.set(1, 1, 0.8);
        break;
      case 'crown': {
        head.add(at(mesh(cyl(0.42, 0.38, 0.35, 24), mat(0xffcf33, { kind: 'phong', shininess: 150, specular: 0xffffff })), 0, y + 0.35, 0));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * PI * 2;
          head.add(at(mesh(new T.ConeGeometry(0.09, 0.22, 10), mat(0xffcf33)), Math.sin(a) * 0.36, y + 0.6, Math.cos(a) * 0.36));
          head.add(at(mesh(sphere(0.06, 10, 8), mat(0xff4d6d, { emissive: 0x661020 }), false), Math.sin(a) * 0.4, y + 0.4, Math.cos(a) * 0.4));
        }
        break;
      }
      case 'horns':
        head.add(at(mesh(half(r + 0.05), mat(0x9aa3b5, { kind: 'phong', shininess: 120 })), 0, y - 0.25, 0));
        for (const s of [-1, 1]) {
          const h = mesh(new T.ConeGeometry(0.13, 0.6, 16), mat(0xfff3d6));
          h.position.set(s * 0.6, y + 0.15, 0); h.rotation.z = -s * 0.9;
          head.add(h);
        }
        break;
      case 'tophat':
        head.add(at(mesh(cyl(0.6, 0.6, 0.06, 28), mat(0x23232e)), 0, y + 0.25, 0));
        head.add(at(mesh(cyl(0.38, 0.4, 0.7, 28), mat(0x23232e)), 0, y + 0.6, 0));
        head.add(at(mesh(cyl(0.41, 0.41, 0.14, 28), hm), 0, y + 0.35, 0));
        break;
      case 'party': {
        const t = canvasTex(64, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffe03a' : '#ff4fae'; c.fillRect(0, i * 8, 64, 8); } });
        head.add(at(mesh(new T.ConeGeometry(0.32, 0.9, 24), mat(0xffffff, { map: t })), 0, y + 0.6, 0));
        head.add(at(mesh(sphere(0.1, 12, 8), mat(0x2e9bff)), 0, y + 1.08, 0));
        break;
      }
      case 'cowboy': {
        const brown = mat(0xa0622e);
        const brim = mesh(cyl(0.85, 0.85, 0.06, 32), brown);
        brim.position.y = y + 0.2; brim.scale.set(1, 1, 0.85);
        head.add(brim);
        head.add(at(mesh(roundedBox(0.7, 0.45, 0.6, 0.2), brown), 0, y + 0.45, 0));
        head.add(at(mesh(cyl(0.37, 0.37, 0.08, 24), mat(0x23232e)), 0, y + 0.27, 0));
        break;
      }
      case 'halo': {
        const h = mesh(new T.TorusGeometry(0.42, 0.07, 12, 32), mat(0xfff08a, { emissive: 0xc8a000 }), false);
        h.rotation.x = PI / 2; h.position.y = y + 0.65;
        head.add(h);
        ret.halo = h;
        break;
      }
      case 'propeller': {
        head.add(at(mesh(half(r + 0.03), mat(0xffd23a)), 0, y - 0.25, 0));
        const prop = new T.Group();
        prop.position.y = y + 0.42;
        prop.add(mesh(cyl(0.04, 0.04, 0.25, 8), mat(0x8a95a5)));
        for (const s of [-1, 1]) prop.add(at(mesh(roundedBox(0.7, 0.04, 0.16, 0.03), mat(s > 0 ? 0xff4d4d : 0x2e9bff)), s * 0.35, 0.12, 0));
        head.add(prop);
        head.userData.propeller = prop;
        break;
      }
      default: // helmet
        head.add(at(mesh(new T.SphereGeometry(r + 0.07, 28, 16, 0, PI * 2, 0, PI * 0.55), hm), 0, y - 0.28, 0));
        addTo(head, at(mesh(new T.TorusGeometry(r + 0.05, 0.05, 8, 32), mat(0xffffff)), 0, y - 0.15, 0)).rotation.x = PI / 2;
    }
    return ret;
  }

  /* ---------------- tires ---------------- */
  // Wide balloon tire: a lathe of a rounded rectangle with shallow tread grooves, axle along X.
  const tireCache = new Map();
  function fatTire(R, W) {
    const key = R + ',' + W;
    if (tireCache.has(key)) return tireCache.get(key);
    const ri = R * 0.55, c = Math.min(R * 0.32, W * 0.38);
    const pts = [];
    pts.push(new T.Vector2(ri, -W / 2));
    pts.push(new T.Vector2(R - c, -W / 2));
    for (let i = 1; i <= 6; i++) { const a = -PI / 2 + (i / 6) * (PI / 2); pts.push(new T.Vector2(R - c + Math.cos(a) * c, -W / 2 + c + Math.sin(a) * c)); }
    const tread = 4, span = W - 2 * c;
    for (let i = 1; i < tread * 2; i++) {
      const y = -W / 2 + c + (i / (tread * 2)) * span;
      pts.push(new T.Vector2(i % 2 ? R - 0.035 : R, y));
    }
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (PI / 2); pts.push(new T.Vector2(R - c + Math.cos(a) * c, W / 2 - c + Math.sin(a) * c)); }
    pts.push(new T.Vector2(ri, W / 2));
    const g = new T.LatheGeometry(pts, 40);
    g.rotateZ(PI / 2);
    tireCache.set(key, g);
    return g;
  }

  /* ---------------- kart ---------------- */
  function kart(o) {
    if (typeof o === 'number') o = { color: o, hat: arguments[1] };
    const color = o.color, type = o.kartType || 'classic';
    const g = new T.Group();
    const body = new T.Group();
    g.add(body);
    const paint = paintMat(color, o.paint || 'gloss');
    const dark = gloss(0x2a2c38, 40);
    const trim = gloss(shade(color, 0.68));
    const chrome = mat(0xdfe5ee, { kind: 'phong', shininess: 150, specular: 0xffffff });
    // [x, z, radius, width]: chunky cartoon tires, rear ones bigger and wider
    let wheelDef = [[-1.32, 1.18, 0.52, 0.62], [1.32, 1.18, 0.52, 0.62], [-1.42, -1.15, 0.64, 0.84], [1.42, -1.15, 0.64, 0.84]];
    let driverY = 1.05, driverZ = -0.35, mountY = 2.05;

    if (type === 'speedster') {
      body.add(at(mesh(roundedBox(1.9, 0.45, 3.7, 0.22), paint), 0, 0.5, 0));
      const nose = mesh(roundedBox(1.2, 0.35, 1.4, 0.17), paint); nose.position.set(0, 0.52, 2.0); nose.rotation.x = 0.12; body.add(nose);
      body.add(at(mesh(roundedBox(2.5, 0.12, 0.7, 0.05), trim), 0, 1.75, -1.75));
      for (const s of [-1, 1]) body.add(at(mesh(roundedBox(0.1, 1.0, 0.5, 0.04), trim), s * 1.0, 1.25, -1.75));
      body.add(at(mesh(roundedBox(2.3, 0.1, 0.5, 0.04), dark), 0, 0.42, 2.55));
      driverY = 0.85;
    } else if (type === 'monster') {
      wheelDef = [[-1.55, 1.25, 0.86, 1.0], [1.55, 1.25, 0.86, 1.0], [-1.6, -1.2, 0.9, 1.1], [1.6, -1.2, 0.9, 1.1]];
      body.add(at(mesh(roundedBox(2.2, 0.75, 3.2, 0.32), paint), 0, 1.35, 0));
      body.add(at(mesh(roundedBox(2.6, 0.25, 3.4, 0.12), dark), 0, 0.95, 0));
      for (const s of [-1, 1]) addTo(body, at(mesh(cyl(0.12, 0.12, 2.9, 12), chrome), s * 0.9, 0.85, 0)).rotation.x = PI / 2;
      driverY = 1.75; mountY = 2.85;
    } else if (type === 'buggy') {
      wheelDef = [[-1.38, 1.3, 0.6, 0.7], [1.38, 1.3, 0.6, 0.7], [-1.48, -1.2, 0.72, 0.9], [1.48, -1.2, 0.72, 0.9]];
      body.add(at(mesh(roundedBox(1.7, 0.5, 3.0, 0.24), paint), 0, 0.75, 0));
      const tube = r => mesh(cyl(0.07, 0.07, r, 10), dark);
      for (const s of [-1, 1]) {
        const a = tube(2.0); a.position.set(s * 0.75, 1.75, -0.4); a.rotation.x = PI / 2; body.add(a);
        const b = tube(1.1); b.position.set(s * 0.75, 1.25, 0.55); body.add(b);
        const c = tube(1.1); c.position.set(s * 0.75, 1.25, -1.35); body.add(c);
      }
      const top = tube(1.5); top.position.set(0, 1.75, -1.35); top.rotation.z = PI / 2; body.add(top);
      const top2 = tube(1.5); top2.position.set(0, 1.75, 0.55); top2.rotation.z = PI / 2; body.add(top2);
      body.add(at(mesh(sphere(0.22, 16, 12), mat(0xfff7c2, { emissive: 0xaa9900 })), 0.5, 1.0, 1.55));
      body.add(at(mesh(sphere(0.22, 16, 12), mat(0xfff7c2, { emissive: 0xaa9900 })), -0.5, 1.0, 1.55));
      driverY = 1.2; mountY = 2.3;
    } else if (type === 'rocketcar') {
      const b = mesh(new T.CapsuleGeometry(0.85, 2.6, 10, 28), paint);
      b.rotation.x = PI / 2; b.position.set(0, 0.95, 0); body.add(b);
      const tip = mesh(new T.ConeGeometry(0.62, 0.9, 28), trim); tip.rotation.x = PI / 2; tip.position.set(0, 0.95, 2.45); body.add(tip);
      for (let i = 0; i < 3; i++) {
        const f = mesh(roundedBox(0.08, 0.8, 0.9, 0.04), trim);
        const a = (i / 3) * PI * 2 + PI;
        f.position.set(Math.sin(a) * 0.85, 0.95 + Math.cos(a) * 0.85, -1.6); f.rotation.z = -a;
        body.add(f);
      }
      const noz = mesh(cyl(0.5, 0.65, 0.5, 24), chrome); noz.rotation.x = PI / 2; noz.position.set(0, 0.95, -2.15); body.add(noz);
      driverY = 1.35; driverZ = -0.2; mountY = 2.45;
    } else {
      body.add(at(mesh(roundedBox(2.1, 0.55, 3.2, 0.25), paint), 0, 0.62, 0));
      const nose = mesh(roundedBox(1.6, 0.45, 1.1, 0.22), paint); nose.position.set(0, 0.72, 1.55); nose.rotation.x = 0.18; body.add(nose);
      body.add(at(mesh(roundedBox(2.2, 0.3, 0.4, 0.15), dark), 0, 0.45, 1.95));
      for (const s of [-1, 1]) body.add(at(mesh(roundedBox(0.35, 0.4, 2.2, 0.15), trim), s * 1.1, 0.6, -0.1));
      body.add(at(mesh(roundedBox(2.2, 0.14, 0.55, 0.06), trim), 0, 1.55, -1.55));
      for (const sx of [-0.7, 0.7]) body.add(at(mesh(cyl(0.06, 0.06, 0.6, 12), dark), sx, 1.25, -1.5));
    }
    if (type !== 'rocketcar') {
      const seat = mesh(roundedBox(1.1, 0.9, 0.35, 0.16), dark);
      seat.position.set(0, driverY + 0.2, driverZ - 0.5); seat.rotation.x = -0.15; body.add(seat);
      for (const sx of [-0.45, 0.45]) {
        const ex = mesh(cyl(0.14, 0.17, 0.5, 16), chrome);
        ex.rotation.x = PI / 2; ex.position.set(sx, driverY - 0.4, -1.75); body.add(ex);
      }
    }
    const drv = driver(o.character || 'kid', color, o.hat || 'helmet');
    drv.position.set(0, driverY, driverZ);
    body.add(drv);
    const sw = mesh(new T.TorusGeometry(0.28, 0.06, 10, 24), dark);
    sw.position.set(0, driverY - 0.05, driverZ + 0.9); sw.rotation.x = -0.9;
    body.add(sw);

    // wheels: steer pivot (y) -> spin (x). Keeping the two rotations on separate
    // objects avoids the Euler-order wobble when a front wheel steers while spinning.
    const wheels = [];
    const tire = mat(0x2a2b33, { kind: 'phong', shininess: 25, specular: 0x333333 });
    const rimMat = mat(0xf4f5f8, { kind: 'phong', shininess: 110, specular: 0xffffff });
    const hubMat = mat(shade(color, 1), { kind: 'phong', shininess: 110, specular: 0xaaaaaa });
    for (const [wx, wz, wr, ww] of wheelDef) {
      const side = Math.sign(wx);
      const steerPivot = new T.Group();
      steerPivot.position.set(wx, wr, wz);
      const spin = new T.Group();
      steerPivot.add(spin);
      spin.add(mesh(fatTire(wr, ww), tire));
      // big shiny rim on the outside face, colored hub in the middle
      const rim = mesh(cyl(wr * 0.6, wr * 0.6, 0.08, 32), rimMat, false);
      rim.rotation.z = PI / 2; rim.position.x = side * (ww / 2 - 0.02);
      spin.add(rim);
      const hub = mesh(new T.SphereGeometry(wr * 0.3, 20, 12, 0, PI * 2, 0, PI / 2), hubMat, false);
      hub.rotation.z = -side * PI / 2; hub.position.x = side * (ww / 2 + 0.02);
      spin.add(hub);
      for (let i = 0; i < 5; i++) {
        const bolt = mesh(sphere(wr * 0.06, 8, 6), mat(0xb8bfcc), false);
        const a = (i / 5) * PI * 2;
        bolt.position.set(side * (ww / 2 + 0.03), Math.cos(a) * wr * 0.42, Math.sin(a) * wr * 0.42);
        spin.add(bolt);
      }
      g.add(steerPivot);
      wheels.push({ steer: steerPivot, spin, r: wr, front: wz > 0 });
    }

    const mount = new T.Group();
    mount.position.set(0, mountY, 0.4);
    body.add(mount);
    const bubble = new T.Mesh(sphere(2.7, 32, 20), new T.MeshPhongMaterial({ color: 0x66d9ff, emissive: 0x2288aa, transparent: true, opacity: 0.32, depthWrite: false, shininess: 120 }));
    bubble.position.y = 1.2;
    bubble.visible = false;
    g.add(bubble);
    const ice = new T.Mesh(roundedBox(3.2, 3.0, 4.0, 0.5), new T.MeshPhongMaterial({ color: 0xbff0ff, emissive: 0x2a6080, transparent: true, opacity: 0.55, shininess: 150, specular: 0xffffff, depthWrite: false }));
    ice.position.y = 1.3;
    ice.visible = false;
    g.add(ice);
    const flames = new T.Group();
    for (const sx of [-0.45, 0.45]) {
      const f = new T.Mesh(new T.ConeGeometry(0.24, 1.2, 16), new T.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 }));
      f.rotation.x = -PI / 2;
      f.position.set(type === 'rocketcar' ? sx * 0.5 : sx, type === 'rocketcar' ? 0.95 : driverY - 0.4, type === 'rocketcar' ? -2.8 : -2.45);
      flames.add(f);
    }
    flames.visible = false;
    body.add(flames);
    const head = drv.children.find(c => c.isGroup);
    g.userData = { body, wheels, mount, bubble, ice, flames, paint, baseColor: color, paintType: o.paint || 'gloss', mountType: null, head };
    return g;
  }

  /* ---------------- weapons & pickups ---------------- */
  function rocket(color, scale) {
    const g = new T.Group();
    const b = mesh(new T.CapsuleGeometry(0.22, 0.9, 8, 18), gloss(0xf6f6fa), false);
    b.rotation.x = PI / 2;
    g.add(b);
    g.add(at(mesh(sphere(0.23, 18, 12), gloss(color || 0xff5a36), false), 0, 0, 0.55));
    for (let i = 0; i < 4; i++) {
      const f = mesh(roundedBox(0.05, 0.38, 0.35, 0.02, 2), gloss(color || 0xff5a36), false);
      f.rotation.z = (i / 4) * PI * 2;
      f.position.set(Math.sin(f.rotation.z) * 0.18, Math.cos(f.rotation.z) * 0.18, -0.5);
      g.add(f);
    }
    g.add(at(new T.Mesh(sphere(0.26, 12, 8), new T.MeshBasicMaterial({ color: 0xffc040 })), 0, 0, -0.78));
    if (scale) g.scale.setScalar(scale);
    return g;
  }

  function bullet() {
    const g = new T.Group();
    const m = new T.Mesh(new T.CapsuleGeometry(0.09, 1.0, 4, 8), new T.MeshBasicMaterial({ color: 0xffe866 }));
    m.rotation.x = PI / 2;
    g.add(m);
    return g;
  }

  function freezeOrb() {
    const g = new T.Group();
    g.add(new T.Mesh(sphere(0.45, 20, 14), new T.MeshPhongMaterial({ color: 0xbff4ff, emissive: 0x3aa8d0, shininess: 150, transparent: true, opacity: 0.9 })));
    for (let i = 0; i < 6; i++) {
      const c = new T.Mesh(new T.ConeGeometry(0.1, 0.5, 8), new T.MeshBasicMaterial({ color: 0xe8fbff }));
      const a = (i / 6) * PI * 2;
      c.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0); c.rotation.z = a - PI / 2;
      g.add(c);
    }
    return g;
  }

  function glove() {
    const g = new T.Group();
    const red = gloss(0xff3d3d, 90);
    const fist = mesh(sphere(0.42, 24, 18), red); fist.scale.set(1, 0.9, 1.15); g.add(fist);
    g.add(at(mesh(sphere(0.18, 16, 12), red), 0.32, 0.05, 0.15));
    addTo(g, at(mesh(cyl(0.3, 0.32, 0.35, 20), gloss(0xffffff)), 0, 0, -0.45)).rotation.x = PI / 2;
    return g;
  }

  function mine() {
    const g = new T.Group();
    g.add(mesh(half(0.6), gloss(0x3a3d4a)));
    const light = new T.Mesh(sphere(0.18, 16, 12), new T.MeshBasicMaterial({ color: 0xff3030 }));
    light.position.y = 0.55;
    g.add(light);
    g.userData.light = light;
    return g;
  }

  function bomb() {
    const g = new T.Group();
    const b = mesh(sphere(0.55, 28, 20), gloss(0x2b2b3a, 110));
    g.add(b);
    g.add(at(mesh(cyl(0.16, 0.18, 0.2, 16), mat(0x8a8f99)), 0, 0.58, 0));
    const spark = new T.Mesh(sphere(0.12, 10, 8), new T.MeshBasicMaterial({ color: 0xffd040 }));
    spark.position.y = 0.75;
    g.add(spark);
    g.userData.spark = spark;
    g.userData.body = b;
    return g;
  }

  let oilTex = null;
  function oilPuddle() {
    if (!oilTex) {
      oilTex = canvasTex(128, 128, (c, w, h) => {
        const g = c.createRadialGradient(64, 64, 10, 64, 64, 62);
        g.addColorStop(0, 'rgba(40,30,70,0.95)'); g.addColorStop(0.75, 'rgba(60,40,100,0.9)'); g.addColorStop(1, 'rgba(60,40,100,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        const s = c.createLinearGradient(20, 20, 110, 110);
        ['#ff4fae', '#ffe03a', '#3ddc5a', '#2e9bff', '#a64dff'].forEach((col, i) => s.addColorStop(i / 4, col));
        c.globalAlpha = 0.35; c.strokeStyle = s; c.lineWidth = 6;
        c.beginPath(); c.arc(60, 66, 28, 0.3, 2.6); c.stroke();
        c.beginPath(); c.arc(70, 58, 16, 3, 5.4); c.stroke();
      });
    }
    const m = new T.Mesh(new T.CircleGeometry(2.9, 32), new T.MeshPhongMaterial({ map: oilTex, transparent: true, shininess: 150, specular: 0xffffff, depthWrite: false }));
    m.rotation.x = -PI / 2;
    m.position.y = 0.06;
    const g = new T.Group();
    g.add(m);
    return g;
  }

  function weaponIcon(type) {
    const d = KZ.WEAPONS[type];
    switch (type) {
      case 'rocket': case 'homing': { const r = rocket(d.color); r.rotation.x = -0.2; return r; }
      case 'mega': { const r = rocket(d.color, 1.7); r.rotation.x = -0.2; return r; }
      case 'triple': {
        const g = new T.Group();
        for (const sx of [-0.45, 0, 0.45]) { const r = rocket(d.color, 0.8); r.position.x = sx; g.add(r); }
        return g;
      }
      case 'minigun': {
        const g = new T.Group();
        for (let i = 0; i < 4; i++) {
          const b = mesh(cyl(0.07, 0.07, 1.3, 12), gloss(0x3a3d4a), false);
          b.rotation.x = PI / 2;
          b.position.set(Math.sin(i * PI / 2) * 0.12, Math.cos(i * PI / 2) * 0.12, 0.2);
          g.add(b);
        }
        const hub = mesh(cyl(0.25, 0.25, 0.5, 18), gloss(d.color), false);
        hub.rotation.x = PI / 2; hub.position.z = -0.3;
        g.add(hub);
        g.userData.spin = true;
        return g;
      }
      case 'freeze': {
        const g = new T.Group();
        const barrel = mesh(cyl(0.18, 0.28, 1.0, 18), gloss(0xe8f6ff), false); barrel.rotation.x = PI / 2; g.add(barrel);
        addTo(g, at(freezeOrb(), 0, 0, 0.6)).scale.setScalar(0.6);
        return g;
      }
      case 'punch': return glove();
      case 'mine': { const m = mine(); m.scale.setScalar(0.8); return m; }
      case 'oil': {
        const g = new T.Group();
        g.add(mesh(cyl(0.38, 0.38, 0.8, 20), gloss(0x34284a)));
        g.add(at(mesh(cyl(0.39, 0.39, 0.1, 20), gloss(0xffe03a)), 0, 0.2, 0));
        return g;
      }
      case 'bomb': { const b = bomb(); b.scale.setScalar(0.8); return b; }
      case 'lightning': {
        const g = new T.Group();
        g.add(mesh(cyl(0.08, 0.08, 0.8, 12), mat(0x8a8f99), false));
        g.add(at(new T.Mesh(sphere(0.3, 20, 14), new T.MeshBasicMaterial({ color: 0x9fe6ff })), 0, 0.5, 0));
        return g;
      }
      case 'shield': {
        const g = new T.Group();
        const s = mesh(half(0.5), mat(d.color, { emissive: 0x114466, kind: 'phong' }), false);
        s.rotation.x = PI / 2;
        g.add(s);
        return g;
      }
      case 'turbo': {
        const g = new T.Group();
        const c = mesh(cyl(0.32, 0.22, 0.9, 20), gloss(0xdfe3ea), false);
        c.rotation.x = PI / 2;
        g.add(c);
        const f = new T.Mesh(new T.ConeGeometry(0.22, 0.7, 16), new T.MeshBasicMaterial({ color: 0xffa020 }));
        f.rotation.x = -PI / 2; f.position.z = -0.75;
        g.add(f);
        return g;
      }
    }
    return new T.Group();
  }

  let qTex = null;
  function pickupBox() {
    if (!qTex) {
      qTex = canvasTex(128, 128, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#ffe24a'); gr.addColorStop(0.5, '#ffb81f'); gr.addColorStop(1, '#ff8a12');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
        c.fillStyle = '#ffffff';
        c.font = '900 92px Arial, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 10; c.strokeStyle = '#d0560a';
        c.strokeText('?', w / 2, h / 2 + 6);
        c.fillText('?', w / 2, h / 2 + 6);
      });
    }
    const g = new T.Group();
    const box = mesh(roundedBox(1.8, 1.8, 1.8, 0.35, 5), new T.MeshPhongMaterial({ map: qTex, emissive: 0x6a3a00, shininess: 80, specular: 0x777777 }));
    g.add(box);
    const ring = new T.Mesh(new T.TorusGeometry(1.7, 0.09, 10, 40), new T.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.7 }));
    ring.rotation.x = PI / 2;
    ring.position.y = -0.9;
    g.add(ring);
    g.userData.box = box;
    g.userData.ring = ring;
    return g;
  }

  function coin() {
    const g = new T.Group();
    const gold = mat(0xffc81a, { kind: 'phong', emissive: 0x6a4400, shininess: 150, specular: 0xffffff });
    const c = mesh(cyl(0.75, 0.75, 0.2, 32), gold);
    c.rotation.x = PI / 2;
    g.add(c);
    const inner = mesh(cyl(0.5, 0.5, 0.24, 28), mat(0xffe680, { kind: 'phong', emissive: 0x6a4400 }), false);
    inner.rotation.x = PI / 2;
    g.add(inner);
    return g;
  }

  /* ---------------- pads & hazards ---------------- */
  let boostTex = null;
  function boostPad(pd) {
    if (!boostTex) {
      boostTex = canvasTex(128, 256, (c, w, h) => {
        c.fillStyle = '#1a6fd1'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ffffff';
        for (let i = 0; i < 4; i++) {
          const y = h - 30 - i * 60;
          c.beginPath(); c.moveTo(16, y); c.lineTo(64, y - 40); c.lineTo(112, y); c.lineTo(112, y + 18); c.lineTo(64, y - 22); c.lineTo(16, y + 18); c.fill();
        }
      });
      boostTex.wrapT = T.RepeatWrapping;
    }
    const g = new T.Group();
    const base = mesh(roundedBox(4.4, 0.25, 6.2, 0.12), gloss(0x6fe0ff), false);
    base.position.y = 0.1;
    g.add(base);
    const top = new T.Mesh(new T.PlaneGeometry(3.8, 5.6), new T.MeshBasicMaterial({ map: boostTex }));
    top.rotation.x = -PI / 2;
    top.position.y = 0.24;
    g.add(top);
    g.position.set(pd.x, pd.y, pd.z);
    g.rotation.y = pd.a;
    g.userData.tex = boostTex;
    return g;
  }

  function jumpPad(pd) {
    const g = new T.Group();
    g.add(at(mesh(cyl(2.3, 2.5, 0.3, 40), gloss(0x2a2c38)), 0, 0.15, 0));
    const top = mesh(cyl(2.0, 2.0, 0.2, 40), mat(0x3ddc5a, { kind: 'phong', emissive: 0x0a5a1a, shininess: 100 }));
    top.position.y = 0.38;
    g.add(top);
    const ring = new T.Mesh(new T.TorusGeometry(1.6, 0.12, 10, 40), new T.MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = PI / 2;
    ring.position.y = 0.5;
    g.add(ring);
    const arrow = new T.Mesh(new T.ConeGeometry(0.5, 0.8, 4), new T.MeshBasicMaterial({ color: 0xffffff }));
    arrow.position.y = 1.2;
    g.add(arrow);
    g.position.set(pd.x, pd.y, pd.z);
    g.userData = { top, ring, arrow };
    return g;
  }

  let lavaTex = null;
  function lavaPool(l) {
    if (!lavaTex) {
      lavaTex = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#ff5a0a'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
          const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40;
          const g = c.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, i % 3 ? 'rgba(255,220,60,0.85)' : 'rgba(255,140,20,0.7)'); g.addColorStop(1, 'rgba(255,90,10,0)');
          c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
        }
      });
      lavaTex.wrapS = lavaTex.wrapT = T.RepeatWrapping;
    }
    const g = new T.Group();
    const rim = mesh(new T.TorusGeometry(l.r, 0.6, 12, 48), gloss(0x3a2a3e));
    rim.rotation.x = PI / 2;
    rim.position.y = 0.15;
    g.add(rim);
    const pool = new T.Mesh(new T.CircleGeometry(l.r, 48), new T.MeshBasicMaterial({ map: lavaTex }));
    pool.rotation.x = -PI / 2;
    pool.position.y = 0.08;
    g.add(pool);
    g.position.set(l.x, 0, l.z);
    g.userData.tex = lavaTex;
    return g;
  }

  /* ---------------- scenery ---------------- */
  function prop(kind, h, r, theme) {
    const g = new T.Group();
    switch (kind) {
      case 'tree': {
        g.add(at(mesh(cyl(0.35, 0.5, h * 0.45, 16), mat(theme.trunk)), 0, h * 0.22, 0));
        const fm = gloss(theme.foliage, 25);
        for (const [x, y, z, s] of [[0, 0.62, 0, 1.25], [0.6, 0.5, 0.3, 0.9], [-0.55, 0.55, -0.3, 0.95], [0.1, 0.85, -0.2, 0.85]]) {
          g.add(at(mesh(sphere(r * s * 1.6, 24, 18), fm), x * r, y * h, z * r));
        }
        break;
      }
      case 'pine': {
        g.add(at(mesh(cyl(0.3, 0.45, h * 0.3, 14), mat(theme.trunk)), 0, h * 0.15, 0));
        for (let i = 0; i < 3; i++) {
          g.add(at(mesh(new T.ConeGeometry(r * (2.2 - i * 0.55), h * 0.38, 24), gloss(theme.foliage, 20)), 0, h * (0.38 + i * 0.2), 0));
          g.add(at(mesh(new T.ConeGeometry(r * (1.1 - i * 0.25), h * 0.16, 24), mat(0xffffff)), 0, h * (0.5 + i * 0.2), 0));
        }
        break;
      }
      case 'palm': {
        const trunk = mesh(cyl(0.3, 0.45, h * 0.85, 14), mat(theme.trunk));
        trunk.position.set(0.3, h * 0.42, 0); trunk.rotation.z = -0.12;
        g.add(trunk);
        for (let i = 0; i < 7; i++) {
          // each leaf hangs from a pivot at the crown: yaw around, then tilt past horizontal so it droops
          const pivot = new T.Group();
          pivot.position.set(0.6, h * 0.86, 0);
          pivot.rotation.order = 'YXZ';
          pivot.rotation.y = (i / 7) * PI * 2;
          pivot.rotation.x = 1.75 + (i % 2) * 0.25;
          const leaf = mesh(new T.CapsuleGeometry(0.3, 2.2, 6, 12), gloss(theme.foliage, 25));
          leaf.scale.set(1.4, 1, 0.45);
          leaf.position.y = 1.3;
          pivot.add(leaf);
          g.add(pivot);
        }
        g.add(at(mesh(sphere(0.35, 14, 10), mat(0x7a4a22)), 0.5, h * 0.8, 0.3));
        break;
      }
      case 'rock': {
        const m = mesh(sphere(1, 28, 20), gloss(0xd7894a, 15)); m.scale.set(r, h * 0.75, r * 0.9); m.position.y = h * 0.3; g.add(m);
        const m2 = mesh(sphere(1, 24, 16), gloss(0xc0733a, 15)); m2.scale.set(r * 0.6, h * 0.5, r * 0.6); m2.position.set(r * 0.4, h * 0.55, -r * 0.2); g.add(m2);
        break;
      }
      case 'lavarock': {
        const m = mesh(sphere(1, 28, 20), gloss(0x4a3a50, 30)); m.scale.set(r, h * 0.75, r * 0.9); m.position.y = h * 0.3; g.add(m);
        const glow = mesh(sphere(1, 20, 14), mat(0xff6a12, { emissive: 0xff4a00 }), false);
        glow.scale.set(r * 0.35, h * 0.3, r * 0.35); glow.position.set(r * 0.55, h * 0.35, r * 0.4); g.add(glow);
        break;
      }
      case 'volcano': {
        const cone = mesh(new T.CylinderGeometry(r * 0.45, r * 1.35, h, 40, 6), gloss(0x5a4560, 20));
        cone.position.y = h / 2; g.add(cone);
        const lip = mesh(new T.TorusGeometry(r * 0.45, 0.4, 12, 36), gloss(0x3a2a3e)); lip.rotation.x = PI / 2; lip.position.y = h; g.add(lip);
        const lava = new T.Mesh(new T.CircleGeometry(r * 0.45, 32), new T.MeshBasicMaterial({ color: 0xffa020 }));
        lava.rotation.x = -PI / 2; lava.position.y = h - 0.1; g.add(lava);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * PI * 2 + 0.4;
          const s = mesh(new T.CapsuleGeometry(0.35, h * 0.7, 6, 10), mat(0xff6a12, { emissive: 0xff4a00 }), false);
          s.position.set(Math.sin(a) * r * 0.85, h * 0.5, Math.cos(a) * r * 0.85);
          s.rotation.set(Math.cos(a) * -0.42, 0, Math.sin(a) * 0.42);
          g.add(s);
        }
        g.userData.volcano = { top: h };
        break;
      }
      case 'cactus': {
        const cm = gloss(theme.foliage, 30);
        g.add(at(mesh(new T.CapsuleGeometry(0.55, h - 1.1, 8, 20), cm), 0, h / 2, 0));
        for (const sx of [-1, 1]) g.add(at(mesh(new T.CapsuleGeometry(0.32, 0.9, 6, 16), cm), sx * 0.75, h * 0.55 + (sx > 0 ? 0.3 : 0), 0));
        g.add(at(mesh(sphere(0.25, 12, 8), mat(0xff5fae)), 0, h, 0));
        break;
      }
      case 'barrel': {
        g.add(at(mesh(cyl(r, r, h, 28), gloss(0xff4a2a)), 0, h / 2, 0));
        for (const y of [0.25, 0.75]) g.add(at(mesh(cyl(r * 1.03, r * 1.03, 0.12, 28), gloss(0xffd23a)), 0, h * y, 0));
        break;
      }
      case 'fountain': {
        g.add(at(mesh(cyl(r, r * 1.05, h * 0.7, 48), gloss(0xf2ede2, 40)), 0, h * 0.35, 0));
        const water = mesh(cyl(r * 0.85, r * 0.85, 0.1, 48), mat(0x3fbfff, { kind: 'phong', emissive: 0x0a4a70, shininess: 150, specular: 0xffffff }), false);
        water.position.y = h * 0.68; g.add(water);
        g.add(at(mesh(cyl(0.6, 0.8, h * 1.6, 24), gloss(0xf2ede2, 40)), 0, h * 0.9, 0));
        g.add(at(mesh(new T.SphereGeometry(1.8, 32, 12, 0, PI * 2, PI / 2, PI / 2), gloss(0xf2ede2, 40)), 0, h * 1.75, 0));
        g.userData.fountain = { top: h * 1.8 };
        break;
      }
      case 'snowman': {
        const sm = gloss(0xffffff, 30);
        g.add(at(mesh(sphere(1.5, 28, 20), sm), 0, 1.3, 0));
        g.add(at(mesh(sphere(1.05, 28, 20), sm), 0, 3.2, 0));
        g.add(at(mesh(sphere(0.75, 28, 20), sm), 0, 4.6, 0));
        addTo(g, at(mesh(new T.ConeGeometry(0.15, 0.7, 16), mat(0xff8a2a)), 0, 4.6, 0.95)).rotation.x = PI / 2;
        g.add(at(mesh(cyl(0.5, 0.55, 0.8, 24), mat(0x23232e)), 0, 5.5, 0));
        addTo(g, at(mesh(new T.TorusGeometry(0.8, 0.15, 10, 24), mat(0xff3b3b)), 0, 3.95, 0)).rotation.x = PI / 2;
        break;
      }
      case 'igloo': {
        g.add(mesh(half(r, 36), gloss(0xf2f8ff, 40)));
        const door = mesh(half(r * 0.35), mat(0xcfe3f6));
        door.scale.set(1, 1.3, 1.6); door.position.z = r * 0.85; g.add(door);
        break;
      }
      case 'lollipop': {
        g.add(at(mesh(cyl(0.18, 0.18, h * 0.75, 12), mat(0xffffff)), 0, h * 0.37, 0));
        const t = canvasTex(128, 128, (c, w) => {
          const cols = ['#ff3b8a', '#ffe03a', '#3ddcff', '#ffffff'];
          for (let i = 0; i < 12; i++) { c.fillStyle = cols[i % 4]; c.beginPath(); c.moveTo(64, 64); c.arc(64, 64, 64, (i / 12) * PI * 2, ((i + 1) / 12) * PI * 2); c.fill(); }
          void w;
        });
        const candy = mesh(cyl(r * 2.2, r * 2.2, 0.45, 40), mat(0xffffff, { kind: 'phong', map: t, shininess: 120 }));
        candy.rotation.x = PI / 2;
        candy.position.y = h * 0.82;
        g.add(candy);
        break;
      }
      case 'gumdrop': {
        const col = [0xff4f7a, 0x3ddc5a, 0xffc61a, 0x2e9bff, 0xa64dff][Math.floor(Math.random() * 5)];
        const d = mesh(half(r, 32), mat(col, { kind: 'phong', shininess: 130, specular: 0xffffff, emissive: shade(col, 0.15) }));
        d.scale.y = 1.3; g.add(d);
        break;
      }
      case 'candycane': {
        const t = canvasTex(32, 128, (c, w, hh) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, hh); c.fillStyle = '#ff3b3b'; for (let i = 0; i < 8; i++) { c.save(); c.translate(0, i * 16); c.transform(1, 0.5, 0, 1, 0, 0); c.fillRect(0, 0, w, 7); c.restore(); } });
        t.wrapT = T.RepeatWrapping; t.repeat.set(1, 3);
        const m = mat(0xffffff, { kind: 'phong', map: t, shininess: 120 });
        g.add(at(mesh(cyl(r * 0.6, r * 0.6, h, 16), m), 0, h / 2, 0));
        const hook = mesh(new T.TorusGeometry(0.7, r * 0.6, 12, 24, PI), m);
        hook.position.set(0.7, h, 0);
        g.add(hook);
        break;
      }
    }
    return g;
  }

  function solidBlock(b, theme, i) {
    const g = new T.Group();
    switch (b.kind) {
      case 'house': {
        const col = theme.solid[i % theme.solid.length];
        g.add(at(mesh(roundedBox(b.w, b.h * 0.75, b.d, 0.6), gloss(col, 30)), 0, b.h * 0.375, 0));
        g.add(at(mesh(roundedBox(b.w + 0.8, b.h * 0.3, b.d + 0.8, 0.5), gloss(shade(col, 0.72), 30)), 0, b.h * 0.85, 0));
        for (let k = -1; k <= 1; k += 2) {
          const win = mesh(roundedBox(1.6, 1.4, 0.2, 0.15), mat(0xbfe9ff, { kind: 'phong', emissive: 0x1a4a66, shininess: 150 }), false);
          win.position.set(k * b.w * 0.25, b.h * 0.45, b.d / 2 + 0.05); g.add(win);
          const win2 = win.clone(); win2.position.z = -b.d / 2 - 0.05; g.add(win2);
        }
        g.add(at(mesh(roundedBox(1.6, 2.4, 0.2, 0.15), gloss(0x8a5226)), 0, 1.2, b.d / 2 + 0.06));
        break;
      }
      case 'cake': {
        const col = theme.solid[i % theme.solid.length];
        g.add(at(mesh(roundedBox(b.w, b.h * 0.55, b.d, 1.2), gloss(0xffe6c4, 30)), 0, b.h * 0.275, 0));
        g.add(at(mesh(roundedBox(b.w + 0.3, b.h * 0.25, b.d + 0.3, 0.9), gloss(col, 90)), 0, b.h * 0.62, 0));
        g.add(at(mesh(roundedBox(b.w * 0.7, b.h * 0.3, b.d * 0.7, 0.9), gloss(0xfff3e6, 30)), 0, b.h * 0.85, 0));
        g.add(at(mesh(sphere(0.9, 20, 14), gloss(0xff2a4a, 120)), 0, b.h + 0.4, 0));
        break;
      }
      case 'mesa': {
        g.add(at(mesh(roundedBox(b.w, b.h, b.d, 1.2), gloss(0xd06a28, 15)), 0, b.h / 2, 0));
        g.add(at(mesh(roundedBox(b.w + 0.4, 0.6, b.d + 0.4, 0.3), gloss(0xf09a4a, 15)), 0, b.h, 0));
        break;
      }
      case 'icewall':
        g.add(at(mesh(roundedBox(b.w, b.h, b.d, 0.5), mat(0xbfe6ff, { kind: 'phong', emissive: 0x0b2a44, shininess: 150, specular: 0xffffff })), 0, b.h / 2, 0));
        break;
      case 'border':
        g.add(at(mesh(roundedBox(b.w, b.h, b.d, 0.6), gloss(theme.wall, 30)), 0, b.h / 2, 0));
        g.add(at(mesh(roundedBox(b.w, 0.5, b.d + 0.2, 0.22), gloss(theme.wallTop, 60)), 0, b.h, 0));
        break;
      default:
        g.add(at(mesh(roundedBox(b.w, b.h, b.d, Math.min(0.5, b.d / 2.2)), gloss(0xffffff)), 0, b.h / 2, 0));
        g.add(at(mesh(roundedBox(b.w + 0.05, b.h * 0.3, b.d + 0.05, Math.min(0.2, b.d / 3)), gloss(0xff4a2a)), 0, b.h * 0.65, 0));
    }
    g.position.set(b.x, 0, b.z);
    return g;
  }

  let stripeTex = null;
  function rampMesh(r) {
    if (!stripeTex) {
      stripeTex = canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#ffd21a'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ff6a12';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32 - 32); c.lineTo(w, i * 32 - 16); c.lineTo(0, i * 32 + 16); c.fill(); }
        c.fillStyle = 'rgba(255,255,255,0.95)';
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(40, 100 - i * 30); c.lineTo(64, 76 - i * 30); c.lineTo(88, 100 - i * 30); c.lineTo(76, 100 - i * 30); c.lineTo(64, 88 - i * 30); c.lineTo(52, 100 - i * 30); c.fill(); }
      });
      stripeTex.wrapS = stripeTex.wrapT = T.RepeatWrapping;
    }
    const w = r.w, l = r.l, h = r.h;
    const geo = new T.BufferGeometry();
    const x = w / 2, z = l / 2;
    const P = [-x, 0, -z, x, 0, -z, x, h, z, -x, h, z, -x, 0, z, x, 0, z, x, h, z, -x, h, z, -x, 0, -z, -x, 0, z, -x, h, z, x, 0, -z, x, h, z, x, 0, z];
    const UV = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0.3, 0, 0.3, 0, 0, 1, 0, 1, 0.3, 0, 0, 1, 0.3, 1, 0];
    geo.setAttribute('position', new T.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(UV, 2));
    geo.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13]);
    geo.computeVertexNormals();
    const m = mesh(geo, new T.MeshLambertMaterial({ map: stripeTex, side: T.DoubleSide }));
    m.position.set(r.x, 0.02, r.z);
    m.rotation.y = [0, PI / 2, PI, -PI / 2][r.dir];
    return m;
  }

  function deckMesh(d, theme) {
    const g = new T.Group();
    g.add(at(mesh(roundedBox(d.w, d.h, d.d, 0.4), gloss(theme.deck, 40)), 0, d.h / 2, 0));
    g.add(at(mesh(roundedBox(d.w - 1, 0.12, d.d - 1, 0.05), gloss(shade(theme.deck, 1.25), 40)), 0, d.h + 0.02, 0));
    g.position.set(d.x, 0, d.z);
    return g;
  }

  function nameLabel(name, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 72;
    const tex = new T.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(4.2, 1.18, 1);
    sp.renderOrder = 10;
    sp.userData = { c, tex, name, color, hp: -1 };
    return sp;
  }

  function drawLabel(sp, hp) {
    const u = sp.userData;
    const hpq = Math.round(hp);
    if (u.hp === hpq) return;
    u.hp = hpq;
    const g = u.c.getContext('2d');
    g.clearRect(0, 0, 256, 72);
    g.font = '800 30px "Baloo 2", "Trebuchet MS", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = 'rgba(20,24,40,0.85)';
    g.strokeText(u.name, 128, 24);
    g.fillStyle = '#ffffff';
    g.fillText(u.name, 128, 24);
    g.fillStyle = 'rgba(20,24,40,0.75)';
    roundRect(g, 58, 50, 140, 14, 7); g.fill();
    g.fillStyle = hp > 60 ? '#4ff06a' : hp > 30 ? '#ffd23a' : '#ff4a4a';
    roundRect(g, 60, 52, 136 * Math.max(0, hp) / 100, 10, 5); g.fill();
    u.tex.needsUpdate = true;
  }

  // floating text sprite (damage numbers, +coins)
  function floatText(text, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.font = '800 64px "Baloo 2", "Trebuchet MS", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = '#142a4d'; g.lineJoin = 'round';
    g.strokeText(text, 128, 50);
    g.fillStyle = color || '#ffffff';
    g.fillText(text, 128, 50);
    const tex = new T.CanvasTexture(c);
    if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(3.6, 1.35, 1);
    sp.renderOrder = 11;
    return sp;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  KZ.Models = { mat, gloss, roundedBox, kart, rocket, bullet, freezeOrb, glove, mine, bomb, oilPuddle, weaponIcon, pickupBox, coin,
    boostPad, jumpPad, lavaPool, prop, solidBlock, rampMesh, deckMesh, nameLabel, drawLabel, floatText, canvasTex, shade, sphere };
})(window.KZ = window.KZ || {});
