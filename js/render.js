/* Kartzooka.io — three.js scene, kart visuals, chase camera */
(function (KZ) {
  'use strict';
  const T = window.THREE;
  const U = KZ.U, M = KZ.Models;

  class Scene3D {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.settings = settings;
      this.quality = null;
      this.createRenderer();
      this.camera = new T.PerspectiveCamera(70, 1, 0.3, 700);
      this.camYaw = 0;
      this.camPos = new T.Vector3(0, 30, -40);
      this.look = new T.Vector3();
      this.shake = 0;
      this.time = 0;
      this.orbit = 0;
      this.tmpCol = new T.Color();
      this.resize();
    }

    createRenderer() {
      const q = this.settings.quality === 'auto' ? (this.autoLow ? 'low' : 'high') : this.settings.quality;
      if (this.renderer && q === this.quality) return;
      this.quality = q;
      if (this.renderer) this.renderer.dispose();
      this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(q === 'low' ? Math.min(1, window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1.5));
      this.renderer.shadowMap.enabled = q !== 'low';
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.resize();
    }

    setQuality() {
      this.createRenderer();
      if (this.world) this.build(this.world);
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      if (this.renderer) this.renderer.setSize(w, h, false);
      if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
      this.portrait = h > w;
    }

    /* ---------------- build ---------------- */
    build(world) {
      this.world = world;
      const th = world.arena.def.theme;
      const S = world.arena.size;
      const scene = this.scene = new T.Scene();
      scene.fog = new T.Fog(th.horizon, 110, 360);
      const low = this.quality === 'low';

      // sky dome
      const sky = new T.Mesh(new T.SphereGeometry(500, 32, 16), new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new T.Color(th.sky) }, bottom: { value: new T.Color(th.horizon) } },
        vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float vy; void main(){ float t = clamp(vy*1.6+0.1,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, t),1.0); }'
      }));
      scene.add(sky);
      this.sky = sky;

      scene.add(new T.HemisphereLight(0xffffff, M.shade(th.ground, 0.75), 0.62));
      const sun = this.sun = new T.DirectionalLight(0xfff6e8, 1.5);
      sun.position.set(40, 80, 25);
      if (!low) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
        const sc = sun.shadow.camera;
        sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 10; sc.far = 200;
        sun.shadow.bias = -0.0008;
        sun.shadow.normalBias = 0.03;
      }
      scene.add(sun);
      scene.add(sun.target);
      scene.add(new T.AmbientLight(0xffffff, 0.1));

      // ground with soft grass patches
      const gtex = M.canvasTex(512, 512, (c, w, h) => {
        c.fillStyle = U.hex(th.ground); c.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
          const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 60;
          const g = c.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, U.hex(th.ground2) + 'aa'); g.addColorStop(1, U.hex(th.ground2) + '00');
          c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 900; i++) {
          c.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.06) + ')';
          c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
      });
      gtex.wrapS = gtex.wrapT = T.RepeatWrapping;
      gtex.repeat.set(S / 24, S / 24);
      const ground = new T.Mesh(new T.PlaneGeometry(S, S), new T.MeshLambertMaterial({ map: gtex }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      const outer = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshLambertMaterial({ color: M.shade(th.ground2, 0.95) }));
      outer.rotation.x = -Math.PI / 2;
      outer.position.y = -0.05;
      scene.add(outer);

      // roads / ice patches
      for (const r of world.arena.def.roads) {
        const rm = new T.Mesh(new T.PlaneGeometry(r.w, r.d), new T.MeshLambertMaterial({ color: r.ice ? 0xcfeaff : th.road, transparent: !!r.ice, opacity: r.ice ? 0.75 : 1 }));
        rm.rotation.x = -Math.PI / 2;
        rm.position.set(r.x, 0.02, r.z);
        rm.receiveShadow = true;
        scene.add(rm);
      }

      // arena pieces
      world.arena.boxes.forEach((b, i) => scene.add(M.solidBlock(b, th, i)));
      for (const d of world.arena.decks) scene.add(M.deckMesh(d, th));
      for (const r of world.arena.ramps) scene.add(M.rampMesh(r, th));
      this.padViews = world.arena.pads.map(pd => { const m = pd.type === 'boost' ? M.boostPad(pd) : M.jumpPad(pd); scene.add(m); return m; });
      this.lavaViews = world.arena.lava.map(l => { const m = M.lavaPool(l); scene.add(m); return m; });
      this.emitters = [];
      for (const c of world.arena.circles) {
        const p = M.prop(c.kind, c.h, c.r, th);
        if (p.userData.volcano) this.emitters.push({ kind: 'volcano', x: c.x, y: c.h, z: c.z, t: 0 });
        if (p.userData.fountain) this.emitters.push({ kind: 'fountain', x: c.x, y: p.userData.fountain.top, z: c.z, t: 0 });
        p.position.set(c.x, 0, c.z);
        p.rotation.y = Math.random() * Math.PI * 2;
        scene.add(p);
      }

      // scenery outside the walls
      const hillMat = M.mat(M.shade(th.ground2, 0.9));
      for (let i = 0; i < (low ? 14 : 28); i++) {
        const a = (i / (low ? 14 : 28)) * Math.PI * 2 + Math.random() * 0.2;
        const R = S / 2 + U.rand(25, 90);
        const hill = new T.Mesh(new T.SphereGeometry(1, 24, 14), hillMat);
        hill.scale.set(U.rand(14, 30), U.rand(6, 18), U.rand(14, 30));
        hill.position.set(Math.sin(a) * R, -2, Math.cos(a) * R);
        scene.add(hill);
        if (i % 2 === 0) {
          const kind = world.arena.def.id === 'snow' ? 'pine' : world.arena.def.id === 'desert' ? 'cactus' : 'tree';
          const tr = M.prop(kind, kind === 'cactus' ? 4 : 8, 1.4, th);
          tr.position.set(Math.sin(a + 0.08) * (S / 2 + 12), 0, Math.cos(a + 0.08) * (S / 2 + 12));
          scene.add(tr);
        }
      }

      // dynamic objects
      this.kartViews = new Map();
      for (const k of world.karts) this.addKart(k);
      this.boxViews = world.boxes.map(b => {
        const g = M.pickupBox();
        g.position.set(b.x, b.y + 1.4, b.z);
        scene.add(g);
        return g;
      });
      this.objViews = new Map();
      this.hillView = null;
      if (world.mode.id === 'koth') {
        const g = new T.Group();
        const ring = new T.Mesh(new T.TorusGeometry(9, 0.25, 12, 64), new T.MeshBasicMaterial({ color: 0xffe066 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.3;
        g.add(ring);
        const col = new T.Mesh(new T.CylinderGeometry(9, 9, 6, 48, 1, true), new T.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
        col.position.y = 3;
        g.add(col);
        g.userData = { ring, col };
        scene.add(g);
        this.hillView = g;
      }
      this.fx = new KZ.Effects(scene, low);
      this.fx.setAmbient(world.arena.def.ambient);
      if (this.boundWorld !== world) { this.bindWorld(world); this.boundWorld = world; }
    }

    addKart(k) {
      const g = M.kart({ color: k.color, hat: k.hat, character: k.character, kartType: k.kartType, paint: k.paint });
      g.userData.baseHex = g.userData.paint.color.getHex();
      g.userData.baseEm = g.userData.paint.emissive.getHex();
      g.rotation.order = 'YXZ';
      this.scene.add(g);
      let label = null;
      if (!k.isPlayer) {
        label = M.nameLabel(k.name, k.color);
        this.scene.add(label);
      }
      this.kartViews.set(k, { g, label, pitch: 0, roll: 0, weapon: null, dark: 0, flash: 0, steer: 0, bob: 0 });
    }

    bindWorld(w) {
      w.on('explosion', e => {
        this.fx.explosion(e.x, e.y, e.z, e.r);
        const v = this.viewKart;
        if (v) {
          const d = U.dist2d(v.x, v.z, e.x, e.z);
          if (d < 30 && !this.settings.reducedMotion) this.shake = Math.max(this.shake, (1 - d / 30) * 0.9);
        }
      });
      w.on('spark', e => this.fx.spark(e.x, e.y, e.z));
      w.on('zap', e => {
        const f = e.from;
        const to = e.to || { x: f.x + f.fx * 25, y: f.y + 1, z: f.z + f.fz * 25 };
        this.fx.zap({ x: f.x, y: f.y + 2.2, z: f.z }, { x: to.x, y: to.y + 1, z: to.z });
      });
      const near = (x, z, r) => { const v = this.viewKart; return !v || U.dist2d(v.x, v.z, x, z) < (r || 60); };
      w.on('pickup', e => {
        this.fx.confetti(e.box.x, e.box.y + 1.4, e.box.z);
        this.fx.ring(e.box.x, e.box.y, e.box.z, 0xffd21a, 5, 0.5);
        if (e.kart === this.viewKart) this.fx.text(e.kart.x, e.kart.y + 4, e.kart.z, KZ.WEAPONS[e.type].icon, '#ffffff');
      });
      w.on('coin', e => { this.fx.confetti(e.x, e.y, e.z, [0xffd23a, 0xfff0a0]); if (e.kart === this.viewKart) this.fx.text(e.x, e.y + 2, e.z, '+1', '#ffd23a'); });
      w.on('blocked', e => { this.fx.spark(e.kart.x, e.kart.y + 1.2, e.kart.z, 0x66d9ff); if (near(e.kart.x, e.kart.z, 40)) this.fx.text(e.kart.x, e.kart.y + 3.5, e.kart.z, 'BLOCK', '#7fe3ff'); });
      w.on('hit', e => {
        const v = this.kartViews.get(e.kart);
        if (v) v.flash = 1;
        if (e.weapon !== 'lava' && near(e.kart.x, e.kart.z, 45) && (e.attacker === this.viewKart || e.kart === this.viewKart || e.amount >= 20)) {
          this.fx.text(e.kart.x, e.kart.y + 3.2, e.kart.z, '-' + Math.round(Math.min(100, e.amount)), e.kart === this.viewKart ? '#ff5a5a' : '#ffffff');
        }
      });
      w.on('kill', e => this.fx.ko(e.victim.x, e.victim.y, e.victim.z));
      w.on('boostPad', e => { this.fx.ring(e.pad.x, e.pad.y, e.pad.z, 0x6fe0ff, 5, 0.45); this.fx.burst(e.kart.x, e.kart.y + 0.6, e.kart.z, [0x6fe0ff, 0xffffff], 10, 6, 0.18); });
      w.on('jumpPad', e => { this.fx.ring(e.pad.x, e.pad.y, e.pad.z, 0x3ddc5a, 6, 0.5); this.fx.burst(e.pad.x, e.pad.y + 0.5, e.pad.z, [0x3ddc5a, 0xffffff, 0xffe03a], 16, 9, 0.2); });
      w.on('frozen', e => { this.fx.iceBurst(e.kart.x, e.kart.y + 1.2, e.kart.z); if (near(e.kart.x, e.kart.z)) this.fx.text(e.kart.x, e.kart.y + 4, e.kart.z, 'FROZEN!', '#9fe6ff'); });
      w.on('freezeBurst', e => this.fx.iceBurst(e.x, e.y, e.z));
      w.on('punch', e => {
        const k = e.kart;
        this.fx.stars(k.x + k.fx * 4, k.y + 1.2, k.z + k.fz * 4);
        if (e.hit) this.fx.text(k.x + k.fx * 4, k.y + 3.5, k.z + k.fz * 4, 'POW!', '#ff5a5a', true);
      });
      w.on('slip', e => { this.fx.burst(e.kart.x, e.kart.y + 0.5, e.kart.z, [0x6a4aa0, 0xff4fae, 0x3ddcff], 10, 5, 0.18); if (near(e.kart.x, e.kart.z)) this.fx.text(e.kart.x, e.kart.y + 3.5, e.kart.z, 'SLIP!', '#ff9fd2'); });
      w.on('lava', e => this.fx.burst(e.kart.x, e.kart.y + 0.3, e.kart.z, [0xffa020, 0xff4a00, 0xffe03a], 6, 5, 0.2));
      w.on('driftBoost', e => this.fx.burst(e.kart.x - e.kart.fx * 2, e.kart.y + 0.5, e.kart.z - e.kart.fz * 2, [0xffa020, 0x6fe0ff, 0xffffff], 10, 6, 0.16));
      w.on('respawn', e => this.fx.ring(e.kart.x, e.kart.y, e.kart.z, 0x66d9ff, 5, 0.6));
      w.on('fire', e => {
        if (e.type === 'minigun') this.fx.spark(e.kart.x + e.kart.fx * 2.4, e.kart.y + 1.1, e.kart.z + e.kart.fz * 2.4, 0xffe066);
        if (e.type === 'rocket' || e.type === 'triple' || e.type === 'homing') this.fx.puff(e.kart.x + e.kart.fx * 1.5, e.kart.y + 1.2, e.kart.z + e.kart.fz * 1.5, 0xffffff, 0.6);
      });
      w.on('land', e => { for (let i = 0; i < 5; i++) this.fx.dust(e.kart.x, e.kart.y, e.kart.z); });
    }

    /* ---------------- per-frame sync ---------------- */
    update(world, dt, viewKart, menuMode) {
      this.time += dt;
      this.viewKart = viewKart;
      const ar = world.arena;
      const reduced = this.settings.reducedMotion;

      for (const [k, v] of this.kartViews) {
        const g = v.g, ud = g.userData;
        g.position.set(k.x, k.y, k.z);
        g.rotation.y = k.a;
        const fs = k.vx * k.fx + k.vz * k.fz;
        let pitch = 0, roll = 0;
        if (k.alive) {
          if (k.onGround) {
            const hf = ar.heightAt(k.x + k.fx * 1.3, k.z + k.fz * 1.3), hb = ar.heightAt(k.x - k.fx * 1.3, k.z - k.fz * 1.3);
            pitch = -Math.atan2(hf - hb, 2.6);
          } else pitch = U.clamp(-k.vy * 0.025, -0.45, 0.45);
          roll = U.clamp(-k.ctl.steer * Math.min(1, Math.abs(fs) / 20) * 0.12, -0.15, 0.15) * (k.drifting ? 1.8 : 1);
          v.pitch += (pitch - v.pitch) * Math.min(1, dt * 12);
          v.roll += (roll - v.roll) * Math.min(1, dt * 8);
          g.rotation.x = v.pitch;
          g.rotation.z = v.roll;
          v.dark = Math.max(0, v.dark - dt * 3);
          // blink while spawn-protected
          g.visible = !(k.spawnShield > 0 && k.spawnShield < 1.6 && Math.floor(this.time * 10) % 2 === 0);
        } else if (!k.out) {
          g.rotation.x = k.tumble * 0.8;
          g.rotation.z = k.tumble * 0.5;
          v.dark = 1;
          g.visible = true;
        } else g.visible = false;
        const pm = ud.paint;
        pm.color.setHex(ud.baseHex);
        if (v.dark > 0) pm.color.lerp(this.tmpCol.setHex(0x2a2a30), v.dark * 0.85);
        v.flash = Math.max(0, v.flash - dt * 5);
        pm.emissive.setHex(ud.baseEm);
        if (v.flash > 0) pm.emissive.lerp(this.tmpCol.setHex(0xffffff), v.flash);
        // wheels: steer on the pivot, roll on the inner group (no Euler mixing)
        const steerTarget = k.alive && !(k.stun > 0) && !(k.frozen > 0) ? k.ctl.steer : 0;
        v.steer += (steerTarget - v.steer) * Math.min(1, dt * 12);
        for (const wh of ud.wheels) {
          wh.spin.rotation.x = (wh.spin.rotation.x + fs * dt / wh.r) % (Math.PI * 2);
          wh.steer.rotation.y = wh.front ? v.steer * 0.45 : 0;
        }
        if (ud.head) {
          v.bob += dt * (6 + Math.min(10, Math.abs(fs) * 0.4));
          ud.head.position.y = 1.35 + Math.sin(v.bob) * 0.03;
          ud.head.rotation.z = -v.steer * 0.12;
          if (ud.head.userData.propeller) ud.head.userData.propeller.rotation.y += dt * (8 + Math.abs(fs));
        }
        ud.ice.visible = k.alive && k.frozen > 0;
        if (k.alive && k.trail !== 'none' && (k.turbo > 0 || k.drifting || Math.abs(fs) > 19) && Math.random() < 0.8) {
          this.fx.trail(k.trail, k.x - k.fx * 2.2, k.y + 0.7, k.z - k.fz * 2.2);
        }
        // shield / turbo
        const sh = k.alive && (k.shield > 0 || k.spawnShield > 0);
        ud.bubble.visible = sh;
        if (sh) {
          ud.bubble.material.opacity = k.shield > 0 ? 0.32 + Math.sin(this.time * 8) * 0.06 : 0.18;
          ud.bubble.scale.setScalar(1 + Math.sin(this.time * 6) * 0.03);
        }
        ud.flames.visible = k.alive && k.turbo > 0;
        if (ud.flames.visible) {
          ud.flames.children.forEach(f => f.scale.set(1, 0.7 + Math.random() * 0.6, 1));
          if (Math.random() < 0.6) this.fx.flame(k.x - k.fx * 2.5, k.y + 0.6, k.z - k.fz * 2.5, -k.vx * 0.3, -k.vz * 0.3);
        }
        if (k.alive && k.drifting && Math.random() < 0.7) {
          const sx = Math.cos(k.a) * 1.1, sz = -Math.sin(k.a) * 1.1;
          this.fx.puff(k.x - k.fx * 1.2 + sx * (Math.random() < 0.5 ? 1 : -1), k.y + 0.2, k.z - k.fz * 1.2 + sz * (Math.random() < 0.5 ? 1 : -1), 0xf2f2f2, 0.4);
        }
        if (!k.alive && !k.out && Math.random() < 0.5) this.fx.puff(k.x, k.y + 1, k.z, 0x55585f, 0.6);
        // held weapon on top
        const wt = k.alive && k.weapon ? k.weapon.type : null;
        if (wt !== ud.mountType) {
          ud.mount.clear();
          if (wt) ud.mount.add(M.weaponIcon(wt));
          ud.mountType = wt;
        }
        if (wt && ud.mount.children[0]) {
          const icon = ud.mount.children[0];
          icon.position.y = Math.sin(this.time * 4) * 0.08;
          if (icon.userData.spin) icon.rotation.z += dt * (k.ctl.fire ? 25 : 2);
        }
        if (v.label) {
          v.label.visible = k.alive && !menuMode;
          v.label.position.set(k.x, k.y + 3.9, k.z);
          if (v.label.visible) M.drawLabel(v.label, k.hp);
        }
      }

      // pickup boxes
      world.boxes.forEach((b, i) => {
        const g = this.boxViews[i];
        g.visible = b.active;
        if (b.active) {
          g.userData.box.rotation.y = this.time * 1.4 + b.seed;
          g.userData.box.position.y = Math.sin(this.time * 2.5 + b.seed) * 0.25;
          const s = Math.min(1, g.scale.x + dt * 3);
          g.scale.setScalar(s);
        } else g.scale.setScalar(0.01);
      });

      this.syncObjects(world, dt);

      if (this.hillView && world.hill) {
        const h = world.hill, hv = this.hillView;
        hv.position.set(h.x, h.y, h.z);
        const c = h.contested ? 0xff5050 : h.owner ? h.owner.color : 0xffe066;
        hv.userData.ring.material.color.setHex(c);
        hv.userData.col.material.color.setHex(c);
        hv.userData.col.material.opacity = 0.14 + Math.sin(this.time * 4) * 0.05;
        hv.userData.ring.rotation.z += dt;
      }

      // pads, lava, emitters
      if (this.padViews) {
        world.arena.pads.forEach((pd, i) => {
          const m = this.padViews[i];
          if (pd.type === 'boost') m.userData.tex.offset.y = -(this.time * 1.6) % 1;
          else {
            const s = 1 + Math.sin(this.time * 5 + i) * 0.08;
            m.userData.ring.scale.setScalar(s);
            m.userData.arrow.position.y = 1.2 + Math.sin(this.time * 4 + i) * 0.25;
            m.userData.arrow.rotation.y += dt * 2;
          }
        });
        for (const lv of this.lavaViews) { lv.userData.tex.offset.x = (this.time * 0.05) % 1; lv.userData.tex.offset.y = (this.time * 0.03) % 1; }
        for (const e of this.emitters) {
          e.t -= dt;
          if (e.t > 0) continue;
          if (e.kind === 'volcano') {
            e.t = 0.08;
            this.fx.puff(e.x + U.rand(-1.5, 1.5), e.y + 0.5, e.z + U.rand(-1.5, 1.5), 0x6a5a70, 1.2);
            if (Math.random() < 0.4) this.fx.glow.add({ x: e.x, y: e.y, z: e.z, vx: U.rand(-4, 4), vy: U.rand(8, 14), vz: U.rand(-4, 4), life: 1.6, max: 1.6, size: 0.35, shrink: true, g: 18, c: 0xffa020, c2: 0xff3a00, floor: 0.2 });
          } else {
            e.t = 0.05;
            this.fx.smokeP.add({ x: e.x, y: e.y, z: e.z, vx: U.rand(-2.5, 2.5), vy: U.rand(4, 6), vz: U.rand(-2.5, 2.5), life: 1.1, max: 1.1, size: 0.16, g: 12, c: 0x8fdcff, floor: 1.2 });
          }
        }
        for (const l of world.arena.lava) if (Math.random() < dt * 6) this.fx.glow.add({ x: l.x + U.rand(-l.r, l.r) * 0.7, y: 0.3, z: l.z + U.rand(-l.r, l.r) * 0.7, vx: 0, vy: U.rand(2, 5), vz: 0, life: 0.8, max: 0.8, size: 0.25, shrink: true, g: 8, c: 0xffd040, c2: 0xff4a00, floor: 0 });
      }
      const ck = viewKart || { x: 0, y: 0, z: 0 };
      this.fx.updateAmbient(dt, ck.x, ck.y, ck.z);
      this.fx.update(dt);
      this.updateCamera(world, dt, viewKart, menuMode, reduced);
    }

    syncObjects(world, dt) {
      const seen = new Set();
      const sync = (obj, make, place) => {
        let m = this.objViews.get(obj);
        if (!m) { m = make(); this.scene.add(m); this.objViews.set(obj, m); }
        place(m);
        seen.add(obj);
      };
      for (const p of world.projectiles) {
        sync(p, () => (p.type === 'bullet' ? M.bullet() : p.type === 'freeze' ? M.freezeOrb() : p.type === 'mega' ? M.rocket(0xb04dff, 1.8) : M.rocket(p.type === 'homing' ? 0xff3d7a : 0xff5a36)), m => {
          m.position.set(p.x, p.y, p.z);
          m.rotation.y = p.a;
          if (p.type !== 'bullet' && Math.random() < 0.85) this.fx.puff(p.x - Math.sin(p.a) * 0.9, p.y, p.z - Math.cos(p.a) * 0.9, 0xe9ecf2, 0.32);
        });
      }
      for (const o of world.oils) {
        sync(o, M.oilPuddle, m => {
          m.position.set(o.x, o.y, o.z);
          m.scale.setScalar(Math.min(1, (22 - o.life) * 4 + 0.2) * (o.life < 1 ? o.life : 1));
        });
      }
      for (const mi of world.mines) {
        sync(mi, M.mine, m => {
          m.position.set(mi.x, mi.y, mi.z);
          const armed = world.time >= mi.armAt;
          m.userData.light.visible = !armed || Math.floor(this.time * 4) % 2 === 0;
        });
      }
      for (const b of world.bombs) {
        sync(b, M.bomb, m => {
          m.position.set(b.x, b.y, b.z);
          m.rotation.x += dt * 4;
          const f = 1 + (b.fuse < 1 ? Math.sin(this.time * 30) * 0.1 : 0);
          m.userData.body.scale.setScalar(f);
          m.userData.spark.visible = Math.floor(this.time * 12) % 2 === 0;
        });
      }
      for (const c of world.coins) {
        sync(c, M.coin, m => {
          m.position.set(c.x, c.y + Math.sin(this.time * 3 + c.seed) * 0.2, c.z);
          m.rotation.y = this.time * 3 + c.seed;
        });
      }
      for (const [obj, m] of this.objViews) {
        if (!seen.has(obj)) { this.scene.remove(m); this.objViews.delete(obj); }
      }
    }

    updateCamera(world, dt, k, menuMode, reduced) {
      const cam = this.camera;
      if (menuMode || !k) {
        // slow cinematic orbit for the menu
        this.orbit += dt * 0.06;
        const R = world.arena.size * 0.55;
        cam.position.set(Math.sin(this.orbit) * R, 38, Math.cos(this.orbit) * R);
        cam.lookAt(0, 0, 0);
        cam.fov = 55;
        cam.updateProjectionMatrix();
        this.sun.position.set(40, 80, 25);
        this.sun.target.position.set(0, 0, 0);
        return;
      }
      const yaw = k.alive ? k.a : this.camYaw;
      const fs = Math.max(0, k.vx * k.fx + k.vz * k.fz);
      this.camYaw += U.angleDiff(this.camYaw, yaw) * Math.min(1, dt * (k.drifting ? 3.2 : 5.5));
      const far = this.portrait ? 1.35 : 1;
      const dist = (9 + fs * 0.07) * far, height = (4.4 + fs * 0.02) * far;
      const tx = k.x - Math.sin(this.camYaw) * dist, tz = k.z - Math.cos(this.camYaw) * dist;
      let ty = k.y + height;
      ty = Math.max(ty, world.arena.heightAt(tx, tz) + 1.5);
      const want = new T.Vector3(tx, ty, tz);
      this.camPos.lerp(want, Math.min(1, dt * 9));
      cam.position.copy(this.camPos);
      if (this.shake > 0 && !reduced) {
        cam.position.x += U.rand(-1, 1) * this.shake;
        cam.position.y += U.rand(-1, 1) * this.shake * 0.6;
        this.shake = Math.max(0, this.shake - dt * 2.5);
      }
      this.look.set(k.x + Math.sin(this.camYaw) * 5, k.y + 1.5, k.z + Math.cos(this.camYaw) * 5);
      cam.lookAt(this.look);
      const fov = (this.portrait ? 78 : 68) + fs * 0.35 + (k.turbo > 0 ? 8 : 0);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
      this.sun.position.set(k.x + 40, k.y + 80, k.z + 25);
      this.sun.target.position.set(k.x, k.y, k.z);
    }

    render() {
      if (this.scene) this.renderer.render(this.scene, this.camera);
    }

    // world → screen (for minimap & markers)
    project(x, y, z) {
      const v = new T.Vector3(x, y, z).project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, behind: v.z > 1 };
    }

    dispose() {
      if (!this.scene) return;
      this.scene.traverse(o => {
        if (o.geometry && !o.geometry.parameters) o.geometry.dispose();
      });
      this.scene = null;
    }
  }

  KZ.Scene3D = Scene3D;
})(window.KZ = window.KZ || {});
