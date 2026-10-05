/* Kartzooka.io — simulation: kart physics, weapons, pickups, modes */
(function (KZ) {
  'use strict';
  const U = KZ.U, C = KZ.CFG;

  let NEXT = 1;

  class Kart {
    constructor(o) {
      this.id = NEXT++;
      this.name = o.name;
      this.color = o.color;
      this.hat = o.hat || 'helmet';
      this.character = o.character || 'kid';
      this.kartType = o.kartType || 'classic';
      this.paint = o.paint || 'gloss';
      this.trail = o.trail || 'none';
      this.personality = o.personality || null;
      this.frozen = 0; this.slipCd = 0; this.padCd = 0; this.lavaT = 0;
      this.team = o.team === undefined ? -1 : o.team;
      this.isPlayer = !!o.isPlayer;
      this.level = o.level || null;
      this.driver = null;
      this.x = 0; this.y = 0; this.z = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.a = 0;
      this.ctl = { throttle: 0, steer: 0, drift: false, fire: false };
      this.firePrev = false;
      this.hp = C.HP;
      this.alive = false;
      this.out = false;
      this.respawnAt = 0;
      this.shield = 0; this.spawnShield = 0; this.turbo = 0; this.stun = 0;
      this.weapon = null;
      this.wcd = 0;
      this.kills = 0; this.deaths = 0; this.score = 0; this.coins = 0; this.lives = 0;
      this.lastHitBy = null; this.lastHitAt = -99;
      this.onGround = true; this.air = 0;
      this.drifting = false; this.driftCharge = 0;
      this.deadAt = 0; this.tumble = 0;
      this.speed = 0;
      this.streak = 0;
    }
    get fx() { return Math.sin(this.a); }
    get fz() { return Math.cos(this.a); }
  }

  class World extends KZ.Emitter {
    constructor(opts) {
      super();
      this.opts = opts;
      this.mode = KZ.MODES[opts.mode] || KZ.MODES.ffa;
      this.arena = new KZ.Arena(KZ.MAPS[opts.map] || KZ.MAPS.park);
      this.time = 0;
      this.timeLeft = this.mode.time;
      this.countdown = opts.countdown === undefined ? 3 : opts.countdown;
      this.over = false;
      this.result = null;
      this.karts = [];
      this.projectiles = [];
      this.mines = [];
      this.oils = [];
      this.bombs = [];
      this.coins = [];
      this.teamScore = [0, 0];
      this.boxes = this.arena.pickups.map(p => ({ x: p.x, z: p.z, y: this.arena.heightAt(p.x, p.z), active: true, t: 0, seed: Math.random() * 6 }));
      this.hill = null;
      this.hillPoints = this.arena.pickups.slice();
      this.coinTimer = 0;
      this.outOrder = [];
      this.timers = [];
      this.setup();
    }

    setup() {
      const o = this.opts;
      const teams = this.mode.teams;
      const colors = U.shuffle(KZ.KART_COLORS.filter(c => !o.player || c !== o.player.color));
      const names = U.shuffle(KZ.BOT_NAMES.slice());
      if (o.player) {
        const p = new Kart(Object.assign({}, o.player, { name: o.player.name || 'You', color: teams ? KZ.TEAM_COLORS[0] : o.player.color, isPlayer: true, team: teams ? 0 : -1 }));
        this.karts.push(p);
        this.player = p;
      }
      const n = U.clamp(o.bots | 0, 1, 8);
      for (let i = 0; i < n; i++) {
        let lvl = o.level;
        if (lvl === 'mixed') lvl = U.pick(['beginner', 'intermediate', 'advanced']);
        const team = teams ? (this.karts.length % 2) : -1;
        const k = new Kart({
          name: names[i % names.length], color: teams ? KZ.TEAM_COLORS[team] : colors[i % colors.length],
          team, level: lvl, personality: U.pick(Object.keys(KZ.PERSONALITIES)),
          hat: U.pick(KZ.GARAGE.hat).id, character: U.pick(KZ.GARAGE.character).id, kartType: U.pick(KZ.GARAGE.kart).id,
          paint: U.pick(['gloss', 'gloss', 'matte', 'metal', 'neon']), trail: U.pick(['none', 'none', 'fire', 'stars', 'bubbles', 'hearts'])
        });
        k.driver = new KZ.Driver(k, this, lvl);
        this.karts.push(k);
      }
      const spawns = U.shuffle(this.arena.spawns.slice());
      this.karts.forEach((k, i) => {
        const s = spawns[i % spawns.length];
        this.placeKart(k, s);
        if (this.mode.lives) k.lives = this.mode.lives;
      });
      if (this.mode.id === 'koth') this.moveHill();
      if (this.mode.id === 'coins') for (let i = 0; i < 18; i++) this.spawnCoin();
    }

    placeKart(k, s) {
      k.x = s.x; k.z = s.z; k.y = this.arena.heightAt(s.x, s.z);
      k.a = s.a; k.vx = k.vy = k.vz = 0;
      k.hp = C.HP; k.alive = true; k.onGround = true;
      k.shield = 0; k.turbo = 0; k.stun = 0; k.frozen = 0; k.weapon = null;
      k.spawnShield = C.SPAWN_SHIELD;
      k.tumble = 0;
      if (k.driver) k.driver.reset();
    }

    pickSpawn(k) {
      let best = null, bestD = -1;
      for (const s of this.arena.spawns) {
        let d = 999;
        for (const o of this.karts) {
          if (o === k || !o.alive || (this.mode.teams && o.team === k.team)) continue;
          d = Math.min(d, U.dist2d(s.x, s.z, o.x, o.z));
        }
        d += Math.random() * 12;
        if (d > bestD) { bestD = d; best = s; }
      }
      return best;
    }

    isEnemy(a, b) {
      if (a === b) return false;
      if (this.mode.teams && a.team === b.team) return false;
      return true;
    }

    /* ---------------- main step ---------------- */
    step(dt) {
      if (dt > 0.1) dt = 0.1;
      const n = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
      const h = dt / n;
      for (let i = 0; i < n; i++) this.tick(h);
    }

    tick(dt) {
      this.time += dt;
      if (this.countdown > 0) {
        this.countdown -= dt;
        for (const k of this.karts) if (k.driver) k.driver.update(dt, true);
        return;
      }
      if (!this.over) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish(); }
      }
      for (const k of this.karts) {
        if (k.driver && k.alive) k.driver.update(dt);
        if (k.alive) this.updateKart(k, dt);
        else this.updateDead(k, dt);
      }
      this.kartCollisions();
      this.updateProjectiles(dt);
      this.updateMines(dt);
      this.updateBombs(dt);
      this.updateOils(dt);
      this.updateBoxes(dt);
      if (this.mode.id === 'koth') this.updateHill(dt);
      if (this.mode.id === 'coins') this.updateCoins(dt);
      if (this.timers.length) {
        const due = this.timers.filter(tm => this.time >= tm.at);
        if (due.length) { this.timers = this.timers.filter(tm => this.time < tm.at); due.forEach(tm => tm.fn()); }
      }
      if (this.mode.id === 'team') this.teamScore = [0, 1].map(t => this.karts.filter(k => k.team === t).reduce((s, k) => s + k.kills, 0));
    }

    updateKart(k, dt) {
      const ar = this.arena;
      k.spawnShield = Math.max(0, k.spawnShield - dt);
      k.shield = Math.max(0, k.shield - dt);
      k.turbo = Math.max(0, k.turbo - dt);
      k.wcd -= dt;
      k.slipCd -= dt; k.padCd -= dt;
      if (k.frozen > 0) {
        // frozen in an ice block: slide to a stop, no control
        k.frozen -= dt;
        const keep = Math.exp(-3 * dt);
        k.vx *= keep; k.vz *= keep;
      }
      const stunned = k.stun > 0 || k.frozen > 0;
      if (k.stun > 0) k.stun -= dt;
      this.padsAndLava(k, dt);
      const c = k.ctl;
      let thr = stunned || this.over ? 0 : U.clamp(c.throttle, -1, 1);
      let steer = stunned ? 0 : U.clamp(c.steer, -1, 1);
      let fx = k.fx, fz = k.fz;
      let fs = k.vx * fx + k.vz * fz;
      const lx = k.vx - fx * fs, lz = k.vz - fz * fs;
      const maxS = C.MAX_SPEED * (k.turbo > 0 ? 1.55 : 1) * (k.driver ? k.driver.p.speed : 1);
      if (k.onGround) {
        if (thr > 0) {
          if (fs < 0) fs += C.BRAKE * thr * dt;
          else if (fs < maxS) fs = Math.min(maxS, fs + C.ACCEL * thr * dt * (k.turbo > 0 ? 1.6 : 1));
        } else if (thr < 0) {
          if (fs > 0.5) fs -= C.BRAKE * -thr * dt;
          else fs = Math.max(-C.REV_MAX, fs - C.REV_ACCEL * -thr * dt);
        } else {
          fs -= Math.sign(fs) * Math.min(Math.abs(fs), C.DRAG * dt);
        }
        if (fs > maxS) fs -= (fs - maxS) * Math.min(1, dt * 2.5);
        k.drifting = !!c.drift && Math.abs(fs) > 9 && Math.abs(steer) > 0.2;
        const sp = U.clamp(Math.abs(fs) / 7, 0, 1);
        const rate = C.TURN * (k.drifting ? C.DRIFT_TURN : 1) * (1 - 0.22 * Math.min(1, Math.abs(fs) / C.MAX_SPEED)) * (fs >= 0 ? 1 : -1);
        k.a += steer * rate * sp * dt;
        if (k.stun > 0) k.a += 9 * dt;
        fx = k.fx; fz = k.fz;
        const grip = (k.drifting ? C.DRIFT_GRIP : C.GRIP) * ar.grip;
        const keep = Math.exp(-grip * dt);
        k.vx = fx * fs + lx * keep;
        k.vz = fz * fs + lz * keep;
        // drift boost (mini turbo)
        if (k.drifting) k.driftCharge += dt;
        else {
          if (k.driftCharge > 0.9) { k.turbo = Math.max(k.turbo, Math.min(1.2, k.driftCharge * 0.5)); this.emit('driftBoost', { kart: k }); }
          k.driftCharge = 0;
        }
      } else {
        k.a += steer * C.TURN * 0.35 * dt;
        k.drifting = false;
      }

      // move with step/cliff blocking
      let nx = k.x + k.vx * dt, nz = k.z + k.vz * dt;
      const lim = k.onGround ? C.STEP : 0.25;
      if (ar.heightAt(nx, nz) - k.y > lim) {
        const okX = ar.heightAt(nx, k.z) - k.y <= lim;
        const okZ = ar.heightAt(k.x, nz) - k.y <= lim;
        if (okX && !okZ) { nz = k.z; k.vz *= -0.25; }
        else if (okZ && !okX) { nx = k.x; k.vx *= -0.25; }
        else { nx = k.x; nz = k.z; k.vx *= -0.3; k.vz *= -0.3; }
      }
      const prevY = k.y;
      const p = { x: nx, z: nz, y: k.y };
      const hit = ar.resolve(p, C.KART_R);
      // airborne karts (jump pads, punches, blasts) can sail over the low border wall: keep them inside
      const edge = ar.half - C.KART_R;
      if (p.x > edge || p.x < -edge) { p.x = U.clamp(p.x, -edge, edge); k.vx *= -0.3; }
      if (p.z > edge || p.z < -edge) { p.z = U.clamp(p.z, -edge, edge); k.vz *= -0.3; }
      k.x = p.x; k.z = p.z;
      if (hit) {
        const vn = k.vx * hit.nx + k.vz * hit.nz;
        if (vn < 0) {
          k.vx -= vn * 1.3 * hit.nx; k.vz -= vn * 1.3 * hit.nz;
          if (vn < -9) this.emit('bump', { kart: k, power: -vn });
        }
      }
      const g = ar.heightAt(k.x, k.z);
      if (k.onGround) {
        if (g >= prevY - 0.3) {
          k.vy = U.clamp((g - prevY) / dt, -20, 20);
          k.y = g;
        } else {
          k.onGround = false; k.air = 0;
          k.vy = Math.max(k.vy, 0);
        }
      } else {
        k.air += dt;
        k.vy -= C.GRAVITY * dt;
        k.y += k.vy * dt;
        if (k.y <= g) {
          if (k.vy < -9) this.emit('land', { kart: k, power: -k.vy });
          k.y = g; k.vy = 0; k.onGround = true;
        }
      }
      k.speed = Math.hypot(k.vx, k.vz);

      // weapons
      if (k.weapon && k.wcd <= 0 && !stunned && !this.over) {
        const auto = k.weapon.type === 'minigun';
        if (c.fire && (auto || !k.firePrev)) this.fire(k);
      }
      k.firePrev = c.fire;
    }

    updateDead(k, dt) {
      if (k.out) return;
      // tumbling wreck
      k.vy -= C.GRAVITY * 0.6 * dt;
      k.y += k.vy * dt;
      k.x += k.vx * dt * 0.5; k.z += k.vz * dt * 0.5;
      const edge = this.arena.half - C.KART_R;
      if (Math.abs(k.x) > edge) { k.x = U.clamp(k.x, -edge, edge); k.vx = 0; }
      if (Math.abs(k.z) > edge) { k.z = U.clamp(k.z, -edge, edge); k.vz = 0; }
      k.tumble += dt * 7;
      const g = this.arena.heightAt(k.x, k.z);
      if (k.y < g) { k.y = g; k.vy = Math.abs(k.vy) * 0.25; k.vx *= 0.5; k.vz *= 0.5; }
      if (!this.over && this.time >= k.respawnAt) {
        this.placeKart(k, this.pickSpawn(k));
        this.emit('respawn', { kart: k });
      }
    }

    kartCollisions() {
      const ks = this.karts, R2 = C.KART_R * 2;
      for (let i = 0; i < ks.length; i++) {
        const a = ks[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < ks.length; j++) {
          const b = ks[j];
          if (!b.alive || Math.abs(a.y - b.y) > 1.6) continue;
          const dx = b.x - a.x, dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= R2 * R2) continue;
          const d = Math.sqrt(d2) || 0.01;
          const nx = dx / d, nz = dz / d, pen = (R2 - d) / 2;
          a.x -= nx * pen; a.z -= nz * pen; b.x += nx * pen; b.z += nz * pen;
          const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (rv < 0) {
            const j2 = -rv * 0.9;
            a.vx -= nx * j2; a.vz -= nz * j2; b.vx += nx * j2; b.vz += nz * j2;
            if (j2 > 8) this.emit('bump', { kart: a, other: b, power: j2 });
          }
        }
      }
    }

    /* ---------------- weapons ---------------- */
    fire(k) {
      const w = k.weapon, def = KZ.WEAPONS[w.type];
      const fx = k.fx, fz = k.fz;
      const fs = Math.max(0, k.vx * fx + k.vz * fz);
      const y = k.y + 1.1;
      switch (w.type) {
        case 'rocket': case 'triple':
          this.projectiles.push({ type: 'rocket', owner: k, x: k.x + fx * 2, y, z: k.z + fz * 2, a: k.a, speed: 46 + fs * 0.4, life: 2.6, target: null });
          break;
        case 'homing':
          this.projectiles.push({ type: 'homing', owner: k, x: k.x + fx * 2, y: y + 0.4, z: k.z + fz * 2, a: k.a, speed: 34 + fs * 0.3, life: 5, target: this.findTarget(k, 1.2, 80, false) });
          break;
        case 'minigun': {
          const a = k.a + U.rand(-0.035, 0.035);
          this.projectiles.push({ type: 'bullet', owner: k, x: k.x + fx * 2, y, z: k.z + fz * 2, a, speed: 90 + fs, life: 0.55 });
          break;
        }
        case 'mine':
          this.mines.push({ owner: k, x: k.x - fx * 2.6, z: k.z - fz * 2.6, y: this.arena.heightAt(k.x - fx * 2.6, k.z - fz * 2.6), armAt: this.time + 0.7, life: 45 });
          break;
        case 'bomb':
          this.bombs.push({ owner: k, x: k.x + fx * 1.5, y: y + 0.5, z: k.z + fz * 1.5, vx: fx * (13 + fs * 0.6), vy: 8, vz: fz * (13 + fs * 0.6), fuse: 2.6 });
          break;
        case 'lightning': {
          const t = this.findTarget(k, 0.6, 46, true);
          if (t) {
            this.damage(t, 70, k, 'lightning');
            t.stun = Math.max(t.stun, 1.3);
            this.emit('zap', { from: k, to: t });
          } else {
            this.emit('zap', { from: k, to: null });
          }
          break;
        }
        case 'mega':
          this.projectiles.push({ type: 'mega', owner: k, x: k.x + fx * 2.5, y: y + 0.3, z: k.z + fz * 2.5, a: k.a, speed: 27 + fs * 0.3, life: 4 });
          break;
        case 'freeze':
          this.projectiles.push({ type: 'freeze', owner: k, x: k.x + fx * 2, y, z: k.z + fz * 2, a: k.a, speed: 58 + fs * 0.4, life: 1.4 });
          break;
        case 'punch': {
          let hitAny = false;
          for (const o of this.karts) {
            if (!o.alive || !this.isEnemy(k, o)) continue;
            const d = U.dist2d(k.x, k.z, o.x, o.z);
            if (d > 7 || Math.abs(o.y - k.y) > 2) continue;
            if (Math.abs(U.angleDiff(k.a, U.headingTo(k.x, k.z, o.x, o.z))) > 0.8) continue;
            if (!(o.shield > 0 || o.spawnShield > 0)) {
              o.vx += fx * 26; o.vz += fz * 26; o.vy = 10; o.onGround = false; o.stun = Math.max(o.stun, 0.6);
            }
            this.damage(o, 55, k, 'punch');
            hitAny = true;
          }
          this.emit('punch', { kart: k, hit: hitAny });
          break;
        }
        case 'oil':
          this.oils.push({ owner: k, x: k.x - fx * 2.8, z: k.z - fz * 2.8, y: this.arena.heightAt(k.x - fx * 2.8, k.z - fz * 2.8), r: 2.7, life: 22 });
          break;
        case 'shield': k.shield = 5; break;
        case 'turbo': k.turbo = 3.2; break;
      }
      this.emit('fire', { kart: k, type: w.type });
      w.ammo--;
      k.wcd = def.cd;
      if (w.ammo <= 0) k.weapon = null;
    }

    // Closest enemy inside a forward cone; optional line-of-sight check
    findTarget(k, cone, range, los) {
      let best = null, bestS = Infinity;
      for (const o of this.karts) {
        if (!o.alive || !this.isEnemy(k, o)) continue;
        const d = U.dist2d(k.x, k.z, o.x, o.z);
        if (d > range) continue;
        const ang = Math.abs(U.angleDiff(k.a, U.headingTo(k.x, k.z, o.x, o.z)));
        if (ang > cone) continue;
        if (los && !this.arena.clearLine(k.x, k.z, k.y + 1, o.x, o.z, o.y + 1)) continue;
        const s = d * (1 + ang);
        if (s < bestS) { bestS = s; best = o; }
      }
      return best;
    }

    updateProjectiles(dt) {
      const ar = this.arena;
      const out = [];
      for (const p of this.projectiles) {
        p.life -= dt;
        if (p.type === 'homing' && p.target) {
          if (!p.target.alive) p.target = this.findTarget(p.owner && p.owner.alive ? p.owner : p, 3.2, 60, false);
          else {
            const want = U.headingTo(p.x, p.z, p.target.x, p.target.z);
            const d = U.angleDiff(p.a, want);
            p.a += U.clamp(d, -2.8 * dt, 2.8 * dt);
            p.y += U.clamp(p.target.y + 1 - p.y, -6 * dt, 6 * dt);
          }
        }
        const steps = Math.max(1, Math.ceil((p.speed * dt) / 1.2));
        const sx = Math.sin(p.a) * p.speed * dt / steps, sz = Math.cos(p.a) * p.speed * dt / steps;
        let dead = p.life <= 0;
        for (let s = 0; s < steps && !dead; s++) {
          p.x += sx; p.z += sz;
          if (Math.abs(p.x) > ar.half + 2 || Math.abs(p.z) > ar.half + 2 || ar.solidAt(p.x, p.z, p.y, 0.25)) {
            dead = true;
            if (p.type === 'bullet') this.emit('spark', { x: p.x - sx, y: p.y, z: p.z - sz });
            else this.impact(p, p.x - sx, p.y, p.z - sz, null);
            break;
          }
          for (const k of this.karts) {
            if (!k.alive || k === p.owner || (p.owner && !this.isEnemy(p.owner, k))) continue;
            const dx = k.x - p.x, dz = k.z - p.z, dy = (k.y + 0.8) - p.y;
            if (dx * dx + dz * dz < (C.KART_R + 0.4) ** 2 && Math.abs(dy) < 1.6) {
              dead = true;
              if (p.type === 'bullet') { this.damage(k, 9, p.owner, 'minigun'); this.emit('spark', { x: p.x, y: p.y, z: p.z }); }
              else this.impact(p, p.x, p.y, p.z, k);
              break;
            }
          }
          if (!dead && p.type !== 'bullet') {
            for (const m of this.mines) {
              if (!m.dead && U.dist2d(m.x, m.z, p.x, p.z) < 1.2) { m.dead = true; dead = true; this.explode(p.x, p.y, p.z, 5, 100, p.owner, p.type); break; }
            }
          }
        }
        if (dead && p.life <= 0 && p.type !== 'bullet') this.impact(p, p.x, p.y, p.z, null);
        if (!dead) out.push(p);
      }
      this.projectiles = out;
    }

    impact(p, x, y, z, direct) {
      if (p.type === 'freeze') {
        this.emit('freezeBurst', { x, y, z });
        for (const k of this.karts) {
          if (!k.alive || k === p.owner || (p.owner && !this.isEnemy(p.owner, k))) continue;
          if (k !== direct && Math.hypot(k.x - x, k.z - z) > 3.2) continue;
          if (k.shield > 0 || k.spawnShield > 0) { this.emit('blocked', { kart: k }); continue; }
          k.frozen = 2.2;
          this.emit('frozen', { kart: k, by: p.owner });
          this.damage(k, 35, p.owner, 'freeze');
        }
        return;
      }
      if (p.type === 'mega') { this.explode(x, y, z, 9.5, 100, p.owner, 'mega', direct); return; }
      this.explode(x, y, z, 4.6, 100, p.owner, p.type, direct);
    }

    padsAndLava(k, dt) {
      const ar = this.arena;
      if (k.onGround && k.padCd <= 0) {
        for (const pd of ar.pads) {
          if (U.dist2d(k.x, k.z, pd.x, pd.z) > 2.6 || Math.abs(k.y - pd.y) > 1) continue;
          k.padCd = 0.9;
          if (pd.type === 'boost') {
            k.turbo = Math.max(k.turbo, 1.4);
            k.vx += Math.sin(pd.a) * 10; k.vz += Math.cos(pd.a) * 10;
            this.emit('boostPad', { kart: k, pad: pd });
          } else {
            k.onGround = false; k.vy = 15.5;
            const sp = Math.max(14, k.speed);
            k.vx = k.fx * sp; k.vz = k.fz * sp;
            this.emit('jumpPad', { kart: k, pad: pd });
          }
          break;
        }
      }
      if (ar.lava.length && k.onGround && ar.inLava(k.x, k.z)) {
        k.lavaT += dt;
        if (k.lavaT > 0.25) {
          k.lavaT = 0;
          const by = k.lastHitBy && this.time - k.lastHitAt < 4 ? k.lastHitBy : null;
          this.emit('lava', { kart: k });
          if (k.shield > 0 || k.spawnShield > 0) return;
          k.vy = 5; k.onGround = false;
          this.damage(k, 12, by, 'lava');
        }
      } else k.lavaT = 0.2;
    }

    updateOils(dt) {
      for (const o of this.oils) {
        o.life -= dt;
        if (o.life <= 0) { o.dead = true; continue; }
        for (const k of this.karts) {
          if (!k.alive || !k.onGround || k.slipCd > 0 || (o.owner && !this.isEnemy(o.owner, k))) continue;
          if (U.dist2d(k.x, k.z, o.x, o.z) < o.r + 0.6) {
            k.slipCd = 2; k.stun = Math.max(k.stun, 1.1);
            this.emit('slip', { kart: k });
          }
        }
      }
      if (this.oils.some(o => o.dead)) this.oils = this.oils.filter(o => !o.dead);
    }

    updateMines(dt) {
      for (const m of this.mines) {
        if (m.dead) continue;
        m.life -= dt;
        if (m.life <= 0) { m.dead = true; this.emit('fizzle', { x: m.x, y: m.y, z: m.z }); continue; }
        if (this.time < m.armAt) continue;
        for (const k of this.karts) {
          if (!k.alive || (m.owner && !this.isEnemy(m.owner, k))) continue;
          if (U.dist2d(k.x, k.z, m.x, m.z) < 2.5 && Math.abs(k.y - m.y) < 1.5) {
            m.dead = true;
            this.explode(m.x, m.y + 0.5, m.z, 5, 100, m.owner, 'mine');
            break;
          }
        }
      }
      if (this.mines.some(m => m.dead)) this.mines = this.mines.filter(m => !m.dead);
    }

    updateBombs(dt) {
      const ar = this.arena;
      for (const b of this.bombs) {
        b.fuse -= dt;
        b.vy -= C.GRAVITY * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        const p = { x: b.x, z: b.z, y: b.y };
        const hit = ar.resolve(p, 0.6);
        if (hit) {
          b.x = p.x; b.z = p.z;
          const vn = b.vx * hit.nx + b.vz * hit.nz;
          if (vn < 0) { b.vx -= vn * 1.6 * hit.nx; b.vz -= vn * 1.6 * hit.nz; }
        }
        const g = ar.heightAt(b.x, b.z);
        if (b.y < g + 0.5) {
          b.y = g + 0.5;
          if (b.vy < 0) b.vy = -b.vy * 0.35;
          b.vx *= 0.82; b.vz *= 0.82;
        }
        if (b.fuse <= 0) { b.dead = true; this.explode(b.x, b.y, b.z, 8.5, 100, b.owner, 'bomb'); }
      }
      if (this.bombs.some(b => b.dead)) this.bombs = this.bombs.filter(b => !b.dead);
    }

    explode(x, y, z, r, dmg, owner, weapon, direct) {
      this.emit('explosion', { x, y, z, r, weapon });
      for (const k of this.karts) {
        if (!k.alive || k === owner) continue;
        if (owner && !this.isEnemy(owner, k)) continue;
        const d = Math.hypot(k.x - x, (k.y + 0.6) - y, k.z - z);
        if (k !== direct && d > r) continue;
        const amt = k === direct || d < 1.9 ? dmg : dmg * (1 - (d - 1.9) / (r - 1.9)) * 0.8 + 18;
        const push = (1 - Math.min(1, d / r)) * 10;
        if (d > 0.01 && !(k.shield > 0 || k.spawnShield > 0)) {
          k.vx += ((k.x - x) / d) * push; k.vz += ((k.z - z) / d) * push;
          if (k.onGround) { k.onGround = false; k.vy = 4 + push * 0.5; }
        }
        this.damage(k, amt, owner, weapon);
      }
      for (const m of this.mines) {
        if (!m.dead && Math.hypot(m.x - x, m.z - z) < r * 0.6) {
          m.dead = true;
          this.later(0.12, () => this.explode(m.x, m.y + 0.5, m.z, 5, 100, m.owner, 'mine'));
        }
      }
    }

    later(t, fn) { this.timers.push({ at: this.time + t, fn }); }

    damage(k, amt, attacker, weapon) {
      if (!k.alive) return;
      if (k.shield > 0 || k.spawnShield > 0) { this.emit('blocked', { kart: k }); return; }
      if (attacker && attacker !== k && !this.isEnemy(attacker, k)) return;
      k.hp -= amt;
      if (attacker && attacker !== k) { k.lastHitBy = attacker; k.lastHitAt = this.time; }
      this.emit('hit', { kart: k, attacker, amount: amt, weapon });
      if (k.hp <= 0) this.destroy(k, attacker, weapon);
    }

    destroy(k, attacker, weapon) {
      k.alive = false;
      k.hp = 0;
      k.deaths++;
      k.streak = 0;
      k.deadAt = this.time;
      k.vy = 12;
      k.weapon = null;
      k.respawnAt = this.time + C.RESPAWN;
      if (attacker && attacker !== k) {
        attacker.kills++;
        attacker.streak++;
        if (this.mode.id === 'ffa' || this.mode.id === 'team' || this.mode.id === 'survival') attacker.score++;
      }
      if (this.mode.lives) {
        k.lives--;
        if (k.lives <= 0) { k.out = true; this.outOrder.push(k); }
      }
      if (this.mode.id === 'coins' && k.coins > 0) {
        const drop = Math.ceil(k.coins / 2);
        k.coins -= drop; k.score = k.coins;
        for (let i = 0; i < drop; i++) {
          const a = Math.random() * U.TAU, r = U.rand(1.5, 5);
          this.coins.push({ x: k.x + Math.sin(a) * r, z: k.z + Math.cos(a) * r, y: k.y + 2, vy: U.rand(4, 9), seed: Math.random() * 6, dropped: true });
        }
      }
      this.emit('kill', { killer: attacker && attacker !== k ? attacker : null, victim: k, weapon });
      if (this.mode.lives) {
        const left = this.karts.filter(q => !q.out);
        if (left.length <= 1) this.later(1.2, () => this.finish());
      }
    }

    /* ---------------- pickups & modes ---------------- */
    updateBoxes(dt) {
      for (const b of this.boxes) {
        if (!b.active) {
          b.t -= dt;
          if (b.t <= 0) { b.active = true; this.emit('boxSpawn', { box: b }); }
          continue;
        }
        for (const k of this.karts) {
          if (!k.alive || k.weapon) continue;
          if (U.dist2d(k.x, k.z, b.x, b.z) < 2.3 && Math.abs(k.y - b.y) < 2) {
            const type = U.weighted(Object.keys(KZ.WEAPONS).map(t => [t, KZ.WEAPONS[t].weight]));
            k.weapon = { type, ammo: KZ.WEAPONS[type].ammo };
            k.wcd = 0.25;
            b.active = false; b.t = C.BOX_RESPAWN;
            this.emit('pickup', { kart: k, type, box: b });
            break;
          }
        }
      }
    }

    moveHill() {
      const cur = this.hill;
      let p;
      for (let i = 0; i < 10; i++) {
        p = U.pick(this.hillPoints);
        if (!cur || U.dist2d(p.x, p.z, cur.x, cur.z) > 30) break;
      }
      this.hill = { x: p.x, z: p.z, y: this.arena.heightAt(p.x, p.z), r: 9, moveAt: this.time + 35, owner: null, contested: false };
      this.emit('hillMove', { hill: this.hill });
    }

    updateHill(dt) {
      const h = this.hill;
      if (this.time >= h.moveAt) { this.moveHill(); return; }
      const inside = this.karts.filter(k => k.alive && U.dist2d(k.x, k.z, h.x, h.z) < h.r && Math.abs(k.y - h.y) < 3);
      h.contested = inside.length > 1;
      h.owner = inside.length === 1 ? inside[0] : null;
      if (h.owner) h.owner.score += dt;
    }

    spawnCoin() {
      const p = this.arena.randomOpenPoint();
      this.coins.push({ x: p.x, z: p.z, y: this.arena.heightAt(p.x, p.z) + 0.9, vy: 0, seed: Math.random() * 6 });
    }

    updateCoins(dt) {
      this.coinTimer -= dt;
      const free = this.coins.filter(c => !c.dropped).length;
      if (this.coinTimer <= 0 && free < 22) { this.coinTimer = 1.2; this.spawnCoin(); }
      const ar = this.arena;
      for (const c of this.coins) {
        const g = ar.heightAt(c.x, c.z) + 0.9;
        if (c.y > g || c.vy > 0) { c.vy -= C.GRAVITY * 0.6 * dt; c.y += c.vy * dt; if (c.y < g) { c.y = g; c.vy = 0; } }
        for (const k of this.karts) {
          if (!k.alive) continue;
          if (U.dist2d(k.x, k.z, c.x, c.z) < 2.2 && Math.abs(k.y + 0.9 - c.y) < 2) {
            c.dead = true; k.coins++; k.score = k.coins;
            this.emit('coin', { kart: k, x: c.x, y: c.y, z: c.z });
            break;
          }
        }
      }
      if (this.coins.some(c => c.dead)) this.coins = this.coins.filter(c => !c.dead);
    }

    standings() {
      const ks = this.karts.slice();
      if (this.mode.lives) {
        return ks.sort((a, b) => {
          if (a.out !== b.out) return a.out ? 1 : -1;
          if (a.out && b.out) return this.outOrder.indexOf(b) - this.outOrder.indexOf(a);
          return b.lives - a.lives || b.kills - a.kills;
        });
      }
      return ks.sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
    }

    finish() {
      if (this.over) return;
      this.over = true;
      const st = this.standings();
      let winnerTeam = -1;
      if (this.mode.teams) {
        const s = [0, 1].map(t => this.karts.filter(k => k.team === t).reduce((a, k) => a + k.kills, 0));
        winnerTeam = s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1;
      }
      this.result = { standings: st, winner: st[0], winnerTeam, teamScore: this.teamScore.slice() };
      this.emit('matchEnd', this.result);
    }
  }

  KZ.Kart = Kart;
  KZ.World = World;
})(window.KZ = window.KZ || {});
