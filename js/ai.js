/* Kartzooka.io — AI drivers with three skill levels */
(function (KZ) {
  'use strict';
  const U = KZ.U;

  const RANGED = { rocket: 1, triple: 1, homing: 1, mega: 1, minigun: 1, freeze: 1, lightning: 1 };

  class Driver {
    constructor(kart, world, level) {
      this.k = kart;
      this.w = world;
      this.level = level;
      this.p = KZ.LEVELS[level] || KZ.LEVELS.intermediate;
      this.pers = KZ.PERSONALITIES[kart.personality] || KZ.PERSONALITIES.hunter;
      // small random quirks so no two bots drive the same
      this.quirk = { aim: U.rand(0.85, 1.25), line: U.rand(-1, 1), brave: U.rand(0.7, 1.3), wobble: U.rand(0.6, 1.4) };
      this.seed = Math.random() * 100;
      this.reset();
    }

    reset() {
      this.path = null;
      this.pathAt = 0;
      this.pathGoal = null;
      this.thinkAt = 0;
      this.target = null;
      this.goal = null;
      this.stuckT = 0;
      this.reverseUntil = 0;
      this.holdT = 0;
      this.evadeUntil = 0;
      this.evadeDir = 0;
      this.fireReq = false;
      this.fireHoldUntil = 0;
      this.roam = null;
      this.patience = U.rand(2, 5);
    }

    update(dt, frozen) {
      const k = this.k, w = this.w, now = w.time, p = this.p, ctl = k.ctl;
      if (frozen) { ctl.throttle = 0; ctl.steer = 0; ctl.fire = false; return; }
      if (k.weapon) this.holdT += dt; else this.holdT = 0;
      if (now >= this.thinkAt) {
        this.think(now);
        this.thinkAt = now + p.reaction * U.rand(0.7, 1.3);
      }

      // steering toward the next point on the path
      const sp = this.steerPoint();
      let steer = 0, throttle = 1, drift = false;
      if (sp) {
        const want = U.headingTo(k.x, k.z, sp.x, sp.z);
        const diff = U.angleDiff(k.a, want);
        steer = U.clamp(diff * 2.4, -1, 1);
        const ad = Math.abs(diff);
        if (ad > 2.2 && k.speed < 8) { throttle = -0.8; steer = -steer; }
        else if (ad > 1.1) throttle = 0.45;
        if (p.drift && ad > 0.55 && k.speed > 14) drift = true;
      }
      steer += Math.sin(now * 2.3 * this.quirk.wobble + this.seed) * p.jitter;

      // dodge incoming rockets
      if (now < this.evadeUntil) { steer = this.evadeDir; throttle = 1; }

      // steer around enemy mines
      if (p.avoidMines) {
        for (const m of w.mines) {
          if (!w.isEnemy(m.owner || k, k) && m.owner) continue;
          const d = U.dist2d(k.x, k.z, m.x, m.z);
          if (d > 10 || d < 0.1) continue;
          const da = U.angleDiff(k.a, U.headingTo(k.x, k.z, m.x, m.z));
          if (Math.abs(da) < 0.45) steer = da > 0 ? -1 : 1;
        }
      }

      // stuck against something: back up
      if (now < this.reverseUntil) { throttle = -1; steer = this.revSteer; }
      else if (throttle > 0.4 && k.speed < 1.6 && k.onGround) {
        this.stuckT += dt;
        if (this.stuckT > 0.8) {
          this.reverseUntil = now + U.rand(0.7, 1.1);
          this.revSteer = Math.random() < 0.5 ? -1 : 1;
          this.stuckT = 0;
          this.path = null;
        }
      } else this.stuckT = 0;

      ctl.steer = U.clamp(steer, -1, 1);
      ctl.throttle = throttle;
      ctl.drift = drift;
      if (this.fireReq) { ctl.fire = !ctl.fire ? true : false; if (ctl.fire) this.fireReq = false; }
      else ctl.fire = now < this.fireHoldUntil;
    }

    enemies() {
      return this.w.karts.filter(o => o.alive && this.w.isEnemy(this.k, o));
    }

    think(now) {
      const k = this.k, w = this.w, p = this.p;
      const enemies = this.enemies();

      // target: revenge first, then closest in front
      let t = this.target && this.target.alive && U.dist2d(k.x, k.z, this.target.x, this.target.z) < 70 ? this.target : null;
      if (k.lastHitBy && k.lastHitBy.alive && now - k.lastHitAt < 6 && w.isEnemy(k, k.lastHitBy) && Math.random() < p.smart) t = k.lastHitBy;
      if (!t || Math.random() < 0.15) {
        let best = Infinity;
        for (const o of enemies) {
          const d = U.dist2d(k.x, k.z, o.x, o.z);
          const ang = Math.abs(U.angleDiff(k.a, U.headingTo(k.x, k.z, o.x, o.z)));
          let s = d * (1 + 0.5 * ang / Math.PI);
          if (w.hill && w.hill.owner === o) s *= 0.6;
          if (this.pers.leader > 0.6 && o.score >= k.score + 2) s *= 0.7;
          if (!o.onGround || o.frozen > 0 || o.stun > 0) s *= 0.75;
          if (o.isPlayer) s *= 0.95;
          if (s < best) { best = s; t = o; }
        }
      }
      this.target = t;

      // goal selection
      const wpn = k.weapon ? k.weapon.type : null;
      let goal = null;
      const tDist = t ? U.dist2d(k.x, k.z, t.x, t.z) : 999;
      if (w.mode.id === 'coins' && (!wpn || tDist > 24) && w.coins.length) {
        goal = this.nearest(w.coins);
      } else if (w.mode.id === 'koth' && w.hill && (!wpn || Math.random() < p.smart * 0.6)) {
        const h = w.hill;
        if (U.dist2d(k.x, k.z, h.x, h.z) > h.r * 0.5) goal = { x: h.x, z: h.z };
        else if (t) goal = { x: t.x, z: t.z };
      }
      if (!goal) {
        if (!wpn) {
          goal = this.nearest(w.boxes.filter(b => b.active));
          if (t && tDist < 12 && this.pers.chase > 1.2 && Math.random() < 0.3) goal = { x: t.x, z: t.z };
        } else if (t) {
          const lead = p.lead * Math.min(1, tDist / 40);
          goal = { x: t.x + t.vx * lead, z: t.z + t.vz * lead };
          // ranged weapons: hold a comfortable distance instead of ramming
          const keep = RANGED[wpn] ? this.pers.keepDist * this.quirk.brave : 0;
          if (keep > 0 && tDist < keep * 0.6 && wpn !== 'minigun') {
            const away = U.headingTo(t.x, t.z, k.x, k.z) + this.quirk.line * 0.6;
            goal = { x: k.x + Math.sin(away) * 14, z: k.z + Math.cos(away) * 14 };
          }
          if (wpn === 'punch' || wpn === 'bomb') goal = { x: t.x + t.vx * 0.3, z: t.z + t.vz * 0.3 };
          if ((wpn === 'mine' || wpn === 'oil') && tDist < 25) {
            // drive ahead of the chaser so it runs over the mine
            goal = { x: k.x + k.fx * 25, z: k.z + k.fz * 25 };
          }
        }
      }
      // detour over a nearby boost pad when it is on the way
      if (goal && Math.random() < p.pads * 0.5) {
        for (const pd of w.arena.pads) {
          if (pd.type !== 'boost') continue;
          const dp = U.dist2d(k.x, k.z, pd.x, pd.z);
          if (dp > 6 && dp < 22 && Math.abs(U.angleDiff(k.a, U.headingTo(k.x, k.z, pd.x, pd.z))) < 0.5 &&
            Math.abs(U.angleDiff(pd.a, U.headingTo(pd.x, pd.z, goal.x, goal.z))) < 0.8) { goal = { x: pd.x, z: pd.z, pad: true }; break; }
        }
      }
      if (!goal) {
        if (!this.roam || U.dist2d(k.x, k.z, this.roam.x, this.roam.z) < 6) this.roam = w.arena.randomOpenPoint();
        goal = this.roam;
      }
      this.goal = goal;

      if (!this.path || now >= this.pathAt || !this.pathGoal || U.dist2d(goal.x, goal.z, this.pathGoal.x, this.pathGoal.z) > 6) {
        this.path = w.arena.findPath(k.x, k.z, goal.x, goal.z);
        this.pathGoal = { x: goal.x, z: goal.z };
        this.pathAt = now + (this.level === 'beginner' ? 1.8 : 0.9);
      }

      this.checkThreats(now);
      if (wpn) this.decideFire(now, wpn, t, tDist);
    }

    nearest(list) {
      const k = this.k;
      let best = null, bd = Infinity;
      for (const o of list) {
        const d = U.dist2d(k.x, k.z, o.x, o.z) * (1 + 0.25 * Math.abs(U.angleDiff(k.a, U.headingTo(k.x, k.z, o.x, o.z))) / Math.PI);
        if (d < bd) { bd = d; best = o; }
      }
      return best ? { x: best.x, z: best.z } : null;
    }

    steerPoint() {
      const k = this.k, w = this.w, g = this.goal;
      if (!g) return null;
      const dg = U.dist2d(k.x, k.z, g.x, g.z);
      if (dg < 28 && Math.abs(w.arena.heightAt(g.x, g.z) - k.y) < 0.6 && w.arena.clearLine(k.x, k.z, k.y + 0.8, g.x, g.z, k.y + 0.8)) return g;
      const path = this.path;
      if (!path || !path.length) return g;
      while (path.length > 1 && U.dist2d(k.x, k.z, path[0].x, path[0].z) < 3.5) path.shift();
      return path[0];
    }

    checkThreats(now) {
      const k = this.k, w = this.w, p = this.p;
      let threat = null;
      for (const pr of w.projectiles) {
        if (pr.type === 'bullet' || !pr.owner || !w.isEnemy(pr.owner, k)) continue;
        const d = U.dist2d(k.x, k.z, pr.x, pr.z);
        if (d > 28) continue;
        const toMe = U.headingTo(pr.x, pr.z, k.x, k.z);
        if (pr.target === k || Math.abs(U.angleDiff(pr.a, toMe)) < 0.3) { threat = pr; break; }
      }
      if (!threat) return;
      if (k.weapon && k.weapon.type === 'shield' && Math.random() < p.smart) { this.fireReq = true; return; }
      if (Math.random() < p.evade && now >= this.evadeUntil) {
        const side = U.angleDiff(threat.a, U.headingTo(threat.x, threat.z, k.x, k.z));
        const rel = U.angleDiff(k.a, threat.a);
        this.evadeDir = (side >= 0 ? 1 : -1) * (Math.abs(rel) < Math.PI / 2 ? 1 : -1);
        this.evadeUntil = now + 0.55;
      }
    }

    decideFire(now, wpn, t, d) {
      const k = this.k, w = this.w, p = this.p;
      if (Math.random() > 0.45 + 0.55 * p.smart && this.holdT < 4) return;
      if (!t) {
        if ((wpn === 'shield' || wpn === 'turbo') && this.holdT > this.patience * 2) this.fireReq = true;
        return;
      }
      const flight = d / 46;
      const lx = t.x + t.vx * flight * p.lead, lz = t.z + t.vz * flight * p.lead;
      const aim = Math.abs(U.angleDiff(k.a, U.headingTo(k.x, k.z, lx, lz)));
      const los = () => w.arena.clearLine(k.x, k.z, k.y + 1.1, t.x, t.z, t.y + 1);
      switch (wpn) {
        case 'rocket': case 'triple':
          if (d < 50 && aim < p.aimTol * this.quirk.aim && los()) this.fireReq = true;
          else if ((t.frozen > 0 || t.stun > 0) && d < 40 && aim < p.aimTol * 2 && los()) this.fireReq = true;
          break;
        case 'homing':
          if (d < 65 && aim < 1) this.fireReq = true;
          break;
        case 'mega':
          if (d < 40 && aim < p.aimTol * 1.4 && los()) this.fireReq = true;
          break;
        case 'freeze':
          if (d < 34 && aim < p.aimTol * 1.2 * this.quirk.aim && los()) this.fireReq = true;
          break;
        case 'punch':
          if (d < 6.5 && aim < 0.7) this.fireReq = true;
          break;
        case 'oil':
          if ((aim > 2.2 && d < 20) || this.holdT > 6 * this.pers.mineLove) this.fireReq = true;
          break;
        case 'minigun':
          if (d < 34 && aim < p.aimTol * 1.8 && los()) this.fireHoldUntil = now + 0.4;
          break;
        case 'lightning':
          if (d < 44 && aim < 0.5 && los()) this.fireReq = true;
          break;
        case 'bomb':
          if ((d < 14 && aim < 0.8) || d < 7) this.fireReq = true;
          break;
        case 'mine':
          if ((aim > 2.2 && d < 22) || this.holdT > 7 * this.pers.mineLove) this.fireReq = true;
          break;
        case 'shield':
          if ((k.hp < 60 && d < 18) || this.holdT > this.patience * 2.5) this.fireReq = true;
          break;
        case 'turbo':
          if ((d > 18 && aim < 0.25) || this.holdT > this.patience * 2) this.fireReq = true;
          break;
      }
    }
  }

  KZ.Driver = Driver;
})(window.KZ = window.KZ || {});
