/* Kartzooka.io — particles, explosions, lightning */
(function (KZ) {
  'use strict';
  const T = window.THREE;
  const U = KZ.U;

  class Pool {
    constructor(scene, material, cap) {
      this.cap = cap;
      this.mesh = new T.InstancedMesh(new T.SphereGeometry(1, 12, 9), material, cap);
      this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.count = 0;
      const col = new Float32Array(cap * 3);
      this.mesh.instanceColor = new T.InstancedBufferAttribute(col, 3);
      scene.add(this.mesh);
      this.items = [];
      this.m4 = new T.Matrix4();
      this.c = new T.Color();
      this.tmp = new T.Color();
    }
    add(p) {
      if (this.items.length >= this.cap) this.items.shift();
      this.items.push(p);
    }
    update(dt) {
      const it = this.items;
      let w = 0;
      for (let i = 0; i < it.length; i++) {
        const p = it[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy -= (p.g || 0) * dt;
        const drag = Math.exp(-(p.drag || 0) * dt);
        p.vx *= drag; p.vy *= drag; p.vz *= drag;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; }
        it[w++] = p;
      }
      it.length = w;
      const m = this.mesh;
      for (let i = 0; i < w; i++) {
        const p = it[i];
        const k = p.life / p.max;
        const s = p.size * (p.grow ? 1 + (1 - k) * p.grow : 1) * (p.shrink ? Math.max(0.05, k) : 1);
        this.m4.makeScale(s, s, s);
        this.m4.setPosition(p.x, p.y, p.z);
        m.setMatrixAt(i, this.m4);
        this.c.setHex(p.c);
        if (p.c2 !== undefined) this.c.lerp(this.tmp.setHex(p.c2), 1 - k);
        m.setColorAt(i, this.c);
      }
      m.count = w;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  class Effects {
    constructor(scene, low) {
      this.scene = scene;
      this.low = low;
      this.glow = new Pool(scene, new T.MeshBasicMaterial({ color: 0xffffff }), low ? 220 : 600);
      this.smokeP = new Pool(scene, new T.MeshLambertMaterial({ color: 0xffffff }), low ? 160 : 420);
      this.flashes = [];
      this.bolts = [];
      this.texts = [];
      this.rings = [];
      this.ambient = null;
      this.flashGeo = new T.SphereGeometry(1, 24, 16);
      this.ringGeo = new T.RingGeometry(0.85, 1, 48);
    }

    explosion(x, y, z, r) {
      const n = this.low ? 10 : 22;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, e = Math.random() * 1.2, s = U.rand(6, 15) * (r / 5);
        this.glow.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 3, vz: Math.sin(a) * Math.cos(e) * s, life: U.rand(0.35, 0.7), max: 0.7, size: U.rand(0.5, 1.1) * r / 4.5, shrink: true, drag: 3, c: U.pick([0xffe066, 0xffa020, 0xff6a2a]), c2: 0xff3a1a, floor: y - 3 });
      }
      for (let i = 0; i < (this.low ? 6 : 14); i++) {
        const a = Math.random() * U.TAU, s = U.rand(1, 5);
        this.smokeP.add({ x: x + U.rand(-1, 1), y: y + U.rand(0, 1), z: z + U.rand(-1, 1), vx: Math.cos(a) * s, vy: U.rand(2, 5), vz: Math.sin(a) * s, life: U.rand(0.9, 1.6), max: 1.6, size: U.rand(0.8, 1.4) * r / 4.5, grow: 1.6, drag: 1.5, c: U.pick([0x6b6f7a, 0x8a8e99, 0x505360]), floor: -10 });
      }
      for (let i = 0; i < (this.low ? 4 : 10); i++) {
        const a = Math.random() * U.TAU;
        this.smokeP.add({ x, y, z, vx: Math.cos(a) * U.rand(6, 12), vy: U.rand(6, 13), vz: Math.sin(a) * U.rand(6, 12), life: 1.4, max: 1.4, size: U.rand(0.15, 0.3), g: 30, drag: 0.5, c: 0x2d2f3a, floor: 0.1 });
      }
      const fm = new T.Mesh(this.flashGeo, new T.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, depthWrite: false }));
      fm.position.set(x, y, z);
      this.scene.add(fm);
      const ring = new T.Mesh(this.ringGeo, new T.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, Math.max(0.15, y - 0.8), z);
      this.scene.add(ring);
      this.flashes.push({ m: fm, ring, t: 0, r });
    }

    puff(x, y, z, color, size) {
      this.smokeP.add({ x, y, z, vx: U.rand(-0.5, 0.5), vy: U.rand(0.5, 1.5), vz: U.rand(-0.5, 0.5), life: 0.6, max: 0.6, size: size || 0.35, grow: 2, drag: 1, c: color || 0xdfe3ea, floor: -10 });
    }
    flame(x, y, z, vx, vz) {
      this.glow.add({ x, y, z, vx: vx + U.rand(-1, 1), vy: U.rand(0.5, 2), vz: vz + U.rand(-1, 1), life: 0.25, max: 0.25, size: U.rand(0.18, 0.32), shrink: true, c: 0xffd040, c2: 0xff4a1a, floor: -10 });
    }
    spark(x, y, z, color) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * U.TAU;
        this.glow.add({ x, y, z, vx: Math.cos(a) * U.rand(3, 8), vy: U.rand(2, 6), vz: Math.sin(a) * U.rand(3, 8), life: 0.25, max: 0.25, size: 0.12, shrink: true, g: 20, c: color || 0xffe066, floor: 0 });
      }
    }
    confetti(x, y, z, colors) {
      for (let i = 0; i < (this.low ? 8 : 18); i++) {
        const a = Math.random() * U.TAU;
        this.glow.add({ x, y, z, vx: Math.cos(a) * U.rand(2, 6), vy: U.rand(5, 10), vz: Math.sin(a) * U.rand(2, 6), life: 0.9, max: 0.9, size: 0.16, g: 18, drag: 1, c: U.pick(colors || [0xffe066, 0xff6ab0, 0x66d9ff, 0x7dff8a]), floor: 0.1 });
      }
    }
    dust(x, y, z) {
      this.smokeP.add({ x: x + U.rand(-0.5, 0.5), y: y + 0.2, z: z + U.rand(-0.5, 0.5), vx: 0, vy: 0.6, vz: 0, life: 0.5, max: 0.5, size: 0.3, grow: 2, c: 0xe8e2d4, floor: -10 });
    }

    zap(from, to) {
      const pts = [];
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const j = i === 0 || i === n ? 0 : 1.2;
        pts.push(new T.Vector3(U.lerp(from.x, to.x, t) + U.rand(-j, j), U.lerp(from.y, to.y, t) + U.rand(-j, j) * 0.6, U.lerp(from.z, to.z, t) + U.rand(-j, j)));
      }
      const g = new T.Group();
      const m = new T.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 1 });
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = a.distanceTo(b);
        const c = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, len, 6), m);
        c.position.copy(a).add(b).multiplyScalar(0.5);
        c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(c);
      }
      this.scene.add(g);
      this.bolts.push({ g, m, t: 0 });
      this.spark(to.x, to.y, to.z, 0xbff0ff);
    }

    // floating text: damage numbers, +coins, KO!
    text(x, y, z, str, color, big) {
      if (this.texts.length > 24) { const old = this.texts.shift(); this.scene.remove(old.sp); old.sp.material.map.dispose(); old.sp.material.dispose(); }
      const sp = KZ.Models.floatText(str, color);
      sp.position.set(x + U.rand(-0.5, 0.5), y, z + U.rand(-0.5, 0.5));
      if (big) sp.scale.multiplyScalar(1.5);
      this.scene.add(sp);
      this.texts.push({ sp, t: 0, base: sp.scale.clone() });
    }

    // expanding colored ring on the ground (pads, pickups, KO)
    ring(x, y, z, color, size, life) {
      const m = new T.Mesh(this.ringGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y + 0.2, z);
      this.scene.add(m);
      this.rings.push({ m, t: 0, size: size || 4, life: life || 0.5 });
    }

    burst(x, y, z, colors, n, speed, size) {
      n = this.low ? Math.ceil(n / 2) : n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, e = U.rand(0.1, 1.3), s = U.rand(0.5, 1) * (speed || 8);
        this.glow.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 2, vz: Math.sin(a) * Math.cos(e) * s, life: U.rand(0.5, 0.9), max: 0.9, size: (size || 0.2) * U.rand(0.7, 1.3), shrink: true, g: 14, drag: 1.2, c: U.pick(colors), floor: y - 2 });
      }
    }

    ko(x, y, z) {
      this.burst(x, y + 1, z, [0xffe03a, 0xff4fae, 0x2e9bff, 0x3ddc5a, 0xffffff], 30, 12, 0.24);
      this.ring(x, y, z, 0xffe03a, 7, 0.6);
      this.text(x, y + 4, z, 'KO!', '#ffe03a', true);
    }

    iceBurst(x, y, z) {
      this.burst(x, y, z, [0xe8fbff, 0xa6ecff, 0x7fd8ff], 22, 9, 0.22);
      this.ring(x, y - 0.5, z, 0x9fe6ff, 4.5, 0.5);
    }

    stars(x, y, z) {
      this.burst(x, y, z, [0xffe03a, 0xffffff, 0xff9a1a], 14, 10, 0.25);
    }

    trail(kind, x, y, z) {
      const cols = KZ.TRAILS[kind];
      if (!cols) return;
      const c = U.pick(cols);
      if (kind === 'bubbles') this.smokeP.add({ x, y, z, vx: U.rand(-0.5, 0.5), vy: U.rand(0.8, 1.6), vz: U.rand(-0.5, 0.5), life: 0.8, max: 0.8, size: U.rand(0.15, 0.3), grow: 0.6, c, floor: -10 });
      else this.glow.add({ x: x + U.rand(-0.3, 0.3), y: y + U.rand(-0.2, 0.3), z: z + U.rand(-0.3, 0.3), vx: 0, vy: kind === 'fire' ? 1.5 : 0.4, vz: 0, life: 0.55, max: 0.55, size: U.rand(0.18, 0.3), shrink: true, c, floor: -10 });
    }

    // ambient weather / sparkles that follow the camera
    setAmbient(kind) {
      this.ambientKind = kind;
      this.ambientT = 0;
    }
    updateAmbient(dt, cx, cy, cz) {
      const k = this.ambientKind;
      if (!k || this.low) return;
      this.ambientT -= dt;
      if (this.ambientT > 0) return;
      this.ambientT = 0.04;
      const x = cx + U.rand(-35, 35), z = cz + U.rand(-35, 35);
      switch (k) {
        case 'snow': this.smokeP.add({ x, y: cy + U.rand(8, 18), z, vx: U.rand(-1, 1), vy: -U.rand(2, 4), vz: U.rand(-1, 1), life: 4, max: 4, size: U.rand(0.08, 0.16), c: 0xffffff, floor: 0 }); break;
        case 'embers': this.glow.add({ x, y: U.rand(0.5, 3), z, vx: U.rand(-0.5, 0.5), vy: U.rand(1.5, 3.5), vz: U.rand(-0.5, 0.5), life: 2.5, max: 2.5, size: U.rand(0.08, 0.16), shrink: true, c: U.pick([0xffa020, 0xff6a12, 0xffe03a]), floor: -10 }); break;
        case 'sparkles': this.glow.add({ x, y: U.rand(1, 8), z, vx: 0, vy: 0.3, vz: 0, life: 1.4, max: 1.4, size: U.rand(0.1, 0.2), shrink: true, c: U.pick([0xffffff, 0xffe03a, 0xff9fd2, 0x9fe6ff]), floor: -10 }); break;
        case 'leaves': if (Math.random() < 0.35) this.smokeP.add({ x, y: U.rand(6, 12), z, vx: U.rand(-1.5, 1.5), vy: -U.rand(0.6, 1.4), vz: U.rand(-1.5, 1.5), life: 6, max: 6, size: U.rand(0.12, 0.2), c: U.pick([0x7ad63a, 0xffc61a, 0xff8a2a]), floor: 0.05 }); break;
        case 'dust': if (Math.random() < 0.3) this.smokeP.add({ x, y: U.rand(0.3, 2), z, vx: U.rand(2, 4), vy: 0.1, vz: U.rand(-0.5, 0.5), life: 2.5, max: 2.5, size: U.rand(0.15, 0.35), grow: 1, c: 0xf5d39a, floor: -10 }); break;
      }
    }

    update(dt) {
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.t += dt;
        t.sp.position.y += dt * 2.2;
        const k = t.t < 0.12 ? t.t / 0.12 : 1;
        t.sp.scale.copy(t.base).multiplyScalar(0.6 + k * 0.4 + (t.t < 0.2 ? 0.2 : 0));
        t.sp.material.opacity = t.t > 0.8 ? Math.max(0, 1 - (t.t - 0.8) / 0.4) : 1;
        if (t.t > 1.2) { this.scene.remove(t.sp); t.sp.material.map.dispose(); t.sp.material.dispose(); this.texts.splice(i, 1); }
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.t += dt;
        const k = r.t / r.life;
        if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); continue; }
        r.m.scale.setScalar(0.3 + k * r.size);
        r.m.material.opacity = 0.9 * (1 - k);
      }
      this.glow.update(dt);
      this.smokeP.update(dt);
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i];
        f.t += dt;
        const k = f.t / 0.35;
        if (k >= 1) {
          this.scene.remove(f.m); this.scene.remove(f.ring);
          f.m.material.dispose(); f.ring.material.dispose();
          this.flashes.splice(i, 1);
          continue;
        }
        f.m.scale.setScalar(f.r * (0.4 + k * 0.8));
        f.m.material.opacity = 0.9 * (1 - k);
        f.ring.scale.setScalar(f.r * (0.5 + k * 1.6));
        f.ring.material.opacity = 0.8 * (1 - k);
      }
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        const b = this.bolts[i];
        b.t += dt;
        b.m.opacity = Math.max(0, 1 - b.t / 0.3);
        if (b.t > 0.3) {
          this.scene.remove(b.g);
          b.g.children.forEach(c => c.geometry.dispose());
          b.m.dispose();
          this.bolts.splice(i, 1);
        }
      }
    }
  }

  KZ.Effects = Effects;
})(window.KZ = window.KZ || {});
