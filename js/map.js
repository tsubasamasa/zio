/* Kartzooka.io — arenas: layout, height field (ramps/decks), collisions, A* nav grid */
(function (KZ) {
  'use strict';
  const U = KZ.U;

  // ramp dir: 0 rises toward +z, 1 toward +x, 2 toward -z, 3 toward -x
  const P = Math.PI;
  // ramp dir: 0 rises toward +z, 1 toward +x, 2 toward -z, 3 toward -x
  // pads: boost pads push you along heading a (a=0 → +z, a=PI/2 → +x); jump pads launch you up
  KZ.MAPS = {
    park: {
      id: 'park', name: 'Sunny Park', size: 140, grip: 1, ambient: 'leaves',
      theme: { sky: 0x3fa9ff, horizon: 0xbfe8ff, ground: 0x5bd136, ground2: 0x46c02a, road: 0xe9ecf1, wall: 0xffffff, wallTop: 0xff7a12,
        accent: 0xffc61a, solid: [0xffa443, 0x5fb2ff, 0xff6464, 0xb38cff], foliage: 0x27c43a, trunk: 0x8a5226, deck: 0x2e8cff },
      solids: [
        { x: -42, z: -42, w: 16, d: 14, h: 7, kind: 'house' }, { x: 42, z: 42, w: 14, d: 16, h: 7, kind: 'house' },
        { x: 44, z: -40, w: 12, d: 12, h: 6, kind: 'house' }, { x: -44, z: 42, w: 12, d: 12, h: 6, kind: 'house' },
        { x: -18, z: 18, w: 10, d: 1.6, h: 1.3, kind: 'barrier' }, { x: 18, z: -18, w: 10, d: 1.6, h: 1.3, kind: 'barrier' },
        { x: 18, z: 18, w: 1.6, d: 10, h: 1.3, kind: 'barrier' }, { x: -18, z: -18, w: 1.6, d: 10, h: 1.3, kind: 'barrier' }
      ],
      decks: [{ x: 0, z: 46, w: 26, d: 12, h: 3.2 }, { x: 0, z: -46, w: 26, d: 12, h: 3.2 }],
      ramps: [
        { x: 0, z: 36, w: 8, l: 8, h: 3.2, dir: 0 }, { x: 17, z: 46, w: 8, l: 8, h: 3.2, dir: 3 },
        { x: 0, z: -36, w: 8, l: 8, h: 3.2, dir: 2 }, { x: -17, z: -46, w: 8, l: 8, h: 3.2, dir: 1 },
        { x: -30, z: 0, w: 6, l: 7, h: 1.8, dir: 1 }, { x: 30, z: 0, w: 6, l: 7, h: 1.8, dir: 3 }
      ],
      circles: [
        { x: 0, z: 0, r: 6, h: 1.5, kind: 'fountain' },
        { x: -25, z: -25, r: 1.4, h: 7, kind: 'tree' }, { x: 25, z: 25, r: 1.4, h: 7, kind: 'tree' },
        { x: -25, z: 25, r: 1.4, h: 7, kind: 'tree' }, { x: 25, z: -25, r: 1.4, h: 7, kind: 'tree' },
        { x: -55, z: 0, r: 1.4, h: 7, kind: 'tree' }, { x: 55, z: 0, r: 1.4, h: 7, kind: 'tree' },
        { x: -50, z: -15, r: 1.4, h: 7, kind: 'tree' }, { x: 50, z: 15, r: 1.4, h: 7, kind: 'tree' },
        { x: -22, z: 60, r: 1.4, h: 7, kind: 'tree' }, { x: 22, z: -60, r: 1.4, h: 7, kind: 'tree' },
        { x: -8, z: -26, r: 1, h: 1.4, kind: 'barrel' }, { x: 8, z: 26, r: 1, h: 1.4, kind: 'barrel' },
        { x: -36, z: 20, r: 1, h: 1.4, kind: 'barrel' }, { x: 36, z: -20, r: 1, h: 1.4, kind: 'barrel' }
      ],
      pads: [
        { x: -60, z: -30, a: 0, type: 'boost' }, { x: 60, z: 30, a: P, type: 'boost' },
        { x: -36, z: 60, a: P / 2, type: 'boost' }, { x: 36, z: -60, a: -P / 2, type: 'boost' },
        { x: -46, z: -24, type: 'jump' }, { x: 46, z: 24, type: 'jump' }
      ],
      lava: [],
      roads: [{ x: 0, z: 0, w: 130, d: 8 }, { x: 0, z: 0, w: 8, d: 130 }],
      pickups: [[0, 11], [0, -11], [-11, 0], [11, 0], [-30, -12], [30, 12], [-58, -58], [58, 58], [58, -58], [-58, 58],
        [0, 46], [0, -46], [-40, 8], [40, -8]]
    },
    desert: {
      id: 'desert', name: 'Dusty Canyon', size: 140, grip: 0.92, ambient: 'dust',
      theme: { sky: 0x48aeff, horizon: 0xffdca6, ground: 0xffc04a, ground2: 0xf5ab33, road: 0xe58a32, wall: 0xd9782f, wallTop: 0x9c4a1c,
        accent: 0xff6a1a, solid: [0xe0782f, 0xd06a28, 0xf09040], foliage: 0x22c24a, trunk: 0x22c24a, deck: 0xff8a2a },
      solids: [{ x: -50, z: 45, w: 14, d: 10, h: 6, kind: 'mesa' }, { x: 52, z: -50, w: 10, d: 14, h: 6, kind: 'mesa' }],
      decks: [{ x: 0, z: 0, w: 30, d: 30, h: 4 }],
      ramps: [
        { x: 0, z: 19, w: 10, l: 8, h: 4, dir: 2 }, { x: 0, z: -19, w: 10, l: 8, h: 4, dir: 0 },
        { x: 19, z: 0, w: 10, l: 8, h: 4, dir: 3 }, { x: -19, z: 0, w: 10, l: 8, h: 4, dir: 1 },
        { x: -35, z: -5, w: 6, l: 7, h: 1.8, dir: 0 }, { x: 35, z: 5, w: 6, l: 7, h: 1.8, dir: 2 }
      ],
      circles: [
        { x: -40, z: -30, r: 5, h: 5, kind: 'rock' }, { x: 38, z: 32, r: 6, h: 6, kind: 'rock' },
        { x: -30, z: 42, r: 4, h: 4, kind: 'rock' }, { x: 45, z: -33, r: 4.5, h: 5, kind: 'rock' },
        { x: -56, z: 10, r: 3, h: 3, kind: 'rock' }, { x: 56, z: -5, r: 3.5, h: 4, kind: 'rock' },
        { x: 15, z: 52, r: 3, h: 3, kind: 'rock' }, { x: -12, z: -54, r: 3.5, h: 4, kind: 'rock' },
        { x: -25, z: 18, r: 0.8, h: 3.5, kind: 'cactus' }, { x: 28, z: -20, r: 0.8, h: 3.5, kind: 'cactus' },
        { x: -48, z: -55, r: 0.8, h: 3.5, kind: 'cactus' }, { x: 50, z: 52, r: 0.8, h: 3.5, kind: 'cactus' },
        { x: 22, z: 30, r: 0.8, h: 3.5, kind: 'cactus' }, { x: -22, z: -32, r: 0.8, h: 3.5, kind: 'cactus' }
      ],
      pads: [
        { x: -62, z: -20, a: 0, type: 'boost' }, { x: 62, z: 20, a: P, type: 'boost' },
        { x: 25, z: 40, a: -P / 2, type: 'boost' }, { x: -25, z: -40, a: P / 2, type: 'boost' },
        { x: -48, z: 25, type: 'jump' }, { x: 48, z: -22, type: 'jump' }
      ],
      lava: [],
      roads: [{ x: 0, z: 40, w: 120, d: 7 }, { x: 0, z: -40, w: 120, d: 7 }],
      pickups: [[-7, 7], [7, -7], [-42, 0], [42, -15], [0, -42], [0, 42], [-52, -18], [52, 24], [-26, -48], [26, 58], [-60, 60], [60, -62]]
    },
    snow: {
      id: 'snow', name: 'Frosty Fort', size: 140, grip: 0.6, ambient: 'snow',
      theme: { sky: 0x5cbcff, horizon: 0xe9f7ff, ground: 0xf7fbff, ground2: 0xdcecfb, road: 0x9fd8ff, wall: 0xdff1ff, wallTop: 0x2e9bff,
        accent: 0x2e9bff, solid: [0xbfe3ff, 0xa6d6ff, 0xe8f4ff], foliage: 0x169a52, trunk: 0x7a4a26, deck: 0x46b0ff },
      solids: [
        { x: -9, z: 15, w: 10, d: 2, h: 2.4, kind: 'icewall' }, { x: 9, z: 15, w: 10, d: 2, h: 2.4, kind: 'icewall' },
        { x: -9, z: -15, w: 10, d: 2, h: 2.4, kind: 'icewall' }, { x: 9, z: -15, w: 10, d: 2, h: 2.4, kind: 'icewall' },
        { x: 15, z: -9, w: 2, d: 10, h: 2.4, kind: 'icewall' }, { x: 15, z: 9, w: 2, d: 10, h: 2.4, kind: 'icewall' },
        { x: -15, z: -9, w: 2, d: 10, h: 2.4, kind: 'icewall' }, { x: -15, z: 9, w: 2, d: 10, h: 2.4, kind: 'icewall' }
      ],
      decks: [{ x: 0, z: 52, w: 22, d: 10, h: 3 }, { x: 0, z: -52, w: 22, d: 10, h: 3 }],
      ramps: [
        { x: 0, z: 43, w: 8, l: 8, h: 3, dir: 0 }, { x: 0, z: -43, w: 8, l: 8, h: 3, dir: 2 },
        { x: -32, z: 20, w: 6, l: 7, h: 1.8, dir: 0 }, { x: 32, z: -20, w: 6, l: 7, h: 1.8, dir: 2 },
        { x: -46, z: 0, w: 6, l: 7, h: 1.8, dir: 1 }, { x: 46, z: 0, w: 6, l: 7, h: 1.8, dir: 3 }
      ],
      circles: [
        { x: 0, z: 0, r: 1.6, h: 3.2, kind: 'snowman' },
        { x: -40, z: -40, r: 5, h: 3.5, kind: 'igloo' }, { x: 40, z: 40, r: 5, h: 3.5, kind: 'igloo' },
        { x: -42, z: 40, r: 4.5, h: 3.2, kind: 'igloo' }, { x: 42, z: -40, r: 4.5, h: 3.2, kind: 'igloo' },
        { x: -20, z: -45, r: 1.3, h: 8, kind: 'pine' }, { x: 20, z: 45, r: 1.3, h: 8, kind: 'pine' },
        { x: -56, z: -16, r: 1.3, h: 8, kind: 'pine' }, { x: 56, z: 16, r: 1.3, h: 8, kind: 'pine' },
        { x: -25, z: 58, r: 1.3, h: 8, kind: 'pine' }, { x: 25, z: -58, r: 1.3, h: 8, kind: 'pine' },
        { x: -62, z: -62, r: 1.3, h: 8, kind: 'pine' }, { x: 62, z: 62, r: 1.3, h: 8, kind: 'pine' }
      ],
      pads: [
        { x: -60, z: -30, a: 0, type: 'boost' }, { x: 60, z: 30, a: P, type: 'boost' },
        { x: -28, z: -10, type: 'jump' }, { x: 28, z: 10, type: 'jump' }
      ],
      lava: [],
      roads: [{ x: 0, z: 0, w: 60, d: 60, ice: true }],
      pickups: [[0, 7], [0, -7], [7, 0], [-7, 0], [-30, -30], [30, 30], [-30, 34], [30, -34], [-56, 40], [56, -40], [0, 52], [0, -52], [-58, 0], [58, 0]]
    },
    candy: {
      id: 'candy', name: 'Candy Kingdom', size: 140, grip: 1, ambient: 'sparkles',
      theme: { sky: 0x58c2ff, horizon: 0xffe0f3, ground: 0xff8fcd, ground2: 0xff76bf, road: 0xfff09a, wall: 0xffffff, wallTop: 0xff3fa4,
        accent: 0xffe03a, solid: [0x7ff0cf, 0xffd25a, 0xb98cff, 0x6fd0ff], foliage: 0xff4f7a, trunk: 0xffffff, deck: 0x7fe8ff },
      solids: [
        { x: -40, z: -40, w: 14, d: 14, h: 6, kind: 'cake' }, { x: 40, z: 40, w: 14, d: 14, h: 6, kind: 'cake' },
        { x: 40, z: -40, w: 12, d: 12, h: 5, kind: 'cake' }, { x: -40, z: 40, w: 12, d: 12, h: 5, kind: 'cake' }
      ],
      decks: [{ x: 0, z: 0, w: 22, d: 22, h: 3.5 }],
      ramps: [
        { x: 0, z: 15, w: 10, l: 8, h: 3.5, dir: 2 }, { x: 0, z: -15, w: 10, l: 8, h: 3.5, dir: 0 },
        { x: 15, z: 0, w: 10, l: 8, h: 3.5, dir: 3 }, { x: -15, z: 0, w: 10, l: 8, h: 3.5, dir: 1 }
      ],
      circles: [
        { x: -25, z: -25, r: 1, h: 7, kind: 'lollipop' }, { x: 25, z: 25, r: 1, h: 7, kind: 'lollipop' },
        { x: -25, z: 25, r: 1, h: 7, kind: 'lollipop' }, { x: 25, z: -25, r: 1, h: 7, kind: 'lollipop' },
        { x: -52, z: 0, r: 2.6, h: 2.6, kind: 'gumdrop' }, { x: 52, z: 0, r: 2.6, h: 2.6, kind: 'gumdrop' },
        { x: 0, z: 52, r: 2.6, h: 2.6, kind: 'gumdrop' }, { x: 0, z: -52, r: 2.6, h: 2.6, kind: 'gumdrop' },
        { x: -30, z: 56, r: 2.2, h: 2.2, kind: 'gumdrop' }, { x: 30, z: -56, r: 2.2, h: 2.2, kind: 'gumdrop' },
        { x: -56, z: -25, r: 0.7, h: 5, kind: 'candycane' }, { x: 56, z: 25, r: 0.7, h: 5, kind: 'candycane' },
        { x: -15, z: -60, r: 0.7, h: 5, kind: 'candycane' }, { x: 15, z: 60, r: 0.7, h: 5, kind: 'candycane' }
      ],
      pads: [
        { x: -60, z: -10, a: 0, type: 'boost' }, { x: 60, z: 10, a: P, type: 'boost' },
        { x: 18, z: -62, a: -P / 2, type: 'boost' }, { x: -18, z: 62, a: P / 2, type: 'boost' },
        { x: -36, z: 0, type: 'jump' }, { x: 36, z: 0, type: 'jump' }, { x: 0, z: 36, type: 'jump' }, { x: 0, z: -36, type: 'jump' }
      ],
      lava: [],
      roads: [{ x: 0, z: 0, w: 120, d: 6 }, { x: 0, z: 0, w: 6, d: 120 }],
      pickups: [[0, 0], [6, 6], [-6, -6], [-30, -12], [30, 12], [-58, -58], [58, 58], [58, -58], [-58, 58], [-12, 40], [12, -40], [-45, 30], [45, -30]]
    },
    lava: {
      id: 'lava', name: 'Lava Isle', size: 140, grip: 1, ambient: 'embers',
      theme: { sky: 0x5b7dff, horizon: 0xffb072, ground: 0x6a5470, ground2: 0x5a4560, road: 0x9a8aa0, wall: 0x7a6280, wallTop: 0xff6a12,
        accent: 0xff6a12, solid: [0x7a6280, 0x8a7290], foliage: 0x22c25a, trunk: 0x9a6a3a, deck: 0xb06a4a },
      solids: [],
      decks: [{ x: 0, z: 52, w: 24, d: 10, h: 3 }, { x: 0, z: -52, w: 24, d: 10, h: 3 }],
      ramps: [{ x: 0, z: 43, w: 8, l: 8, h: 3, dir: 0 }, { x: 0, z: -43, w: 8, l: 8, h: 3, dir: 2 }],
      circles: [
        { x: 0, z: 0, r: 7, h: 9, kind: 'volcano' },
        { x: -38, z: 22, r: 3.5, h: 4, kind: 'lavarock' }, { x: 38, z: -22, r: 3.5, h: 4, kind: 'lavarock' },
        { x: -20, z: -48, r: 3, h: 3.5, kind: 'lavarock' }, { x: 20, z: 48, r: 3, h: 3.5, kind: 'lavarock' },
        { x: 56, z: 40, r: 4, h: 4.5, kind: 'lavarock' }, { x: -56, z: -40, r: 4, h: 4.5, kind: 'lavarock' },
        { x: -55, z: 10, r: 1.1, h: 7, kind: 'palm' }, { x: 55, z: -10, r: 1.1, h: 7, kind: 'palm' },
        { x: -10, z: 62, r: 1.1, h: 7, kind: 'palm' }, { x: 10, z: -62, r: 1.1, h: 7, kind: 'palm' }
      ],
      pads: [
        { x: -62, z: 0, a: 0, type: 'boost' }, { x: 62, z: 0, a: P, type: 'boost' },
        { x: 38, z: 62, a: -P / 2, type: 'boost' }, { x: -38, z: -62, a: P / 2, type: 'boost' },
        { x: -18, z: -12, type: 'jump' }, { x: 18, z: 12, type: 'jump' }, { x: -44, z: 28, type: 'jump' }, { x: 44, z: -28, type: 'jump' }
      ],
      lava: [{ x: -30, z: -25, r: 7 }, { x: 30, z: 25, r: 7 }, { x: 45, z: -45, r: 6 }, { x: -45, z: 45, r: 6 }],
      roads: [{ x: 0, z: 0, w: 130, d: 6 }],
      pickups: [[0, 14], [0, -14], [14, 0], [-14, 0], [-58, -58], [58, 58], [60, -58], [-60, 58], [0, 52], [0, -52], [-40, 0], [40, 0]]
    }
  };
  KZ.MAP_ORDER = ['park', 'desert', 'snow', 'candy', 'lava'];

  const CELL = 2;

  class Arena {
    constructor(def) {
      this.def = def;
      this.size = def.size;
      this.half = def.size / 2;
      this.grip = def.grip;
      const H = this.half, T = 3;
      this.boxes = def.solids.map(b => Object.assign({}, b));
      // boundary walls
      this.boxes.push({ x: 0, z: H + T / 2, w: def.size + T * 2, d: T, h: 3, kind: 'border' });
      this.boxes.push({ x: 0, z: -H - T / 2, w: def.size + T * 2, d: T, h: 3, kind: 'border' });
      this.boxes.push({ x: H + T / 2, z: 0, w: T, d: def.size, h: 3, kind: 'border' });
      this.boxes.push({ x: -H - T / 2, z: 0, w: T, d: def.size, h: 3, kind: 'border' });
      this.circles = def.circles.slice();
      this.decks = def.decks;
      this.ramps = def.ramps;
      this.pickups = def.pickups.map(p => ({ x: p[0], z: p[1] }));
      this.pads = (def.pads || []).map(p => Object.assign({ y: this.heightAt(p.x, p.z) }, p));
      this.lava = def.lava || [];
      this.buildSpawns();
      this.buildNav();
    }

    inLava(x, z, pad) {
      pad = pad || 0;
      for (const l of this.lava) {
        const dx = x - l.x, dz = z - l.z, r = l.r + pad;
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    }

    heightAt(x, z) {
      let h = 0;
      for (const d of this.decks) {
        if (Math.abs(x - d.x) <= d.w / 2 && Math.abs(z - d.z) <= d.d / 2 && d.h > h) h = d.h;
      }
      for (const r of this.ramps) {
        let t;
        const along = r.dir === 0 || r.dir === 2;
        const lx = along ? r.w / 2 : r.l / 2, lz = along ? r.l / 2 : r.w / 2;
        if (Math.abs(x - r.x) > lx || Math.abs(z - r.z) > lz) continue;
        switch (r.dir) {
          case 0: t = (z - (r.z - lz)) / r.l; break;
          case 2: t = ((r.z + lz) - z) / r.l; break;
          case 1: t = (x - (r.x - lx)) / r.l; break;
          default: t = ((r.x + lx) - x) / r.l;
        }
        const v = r.h * U.clamp(t, 0, 1);
        if (v > h) h = v;
      }
      return h;
    }

    // Pushes a circle out of solid colliders; returns the last contact normal (or null)
    resolve(p, r) {
      let hit = null;
      for (const b of this.boxes) {
        if (p.y >= b.h - 0.05) continue;
        const hx = b.w / 2, hz = b.d / 2;
        const cx = U.clamp(p.x, b.x - hx, b.x + hx), cz = U.clamp(p.z, b.z - hz, b.z + hz);
        let dx = p.x - cx, dz = p.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) {
          // center inside box: push out along smallest axis
          const ox = hx - Math.abs(p.x - b.x), oz = hz - Math.abs(p.z - b.z);
          if (ox < oz) { dx = Math.sign(p.x - b.x) || 1; dz = 0; p.x = b.x + dx * (hx + r); }
          else { dz = Math.sign(p.z - b.z) || 1; dx = 0; p.z = b.z + dz * (hz + r); }
          hit = { nx: dx, nz: dz };
          continue;
        }
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        p.x = cx + nx * r; p.z = cz + nz * r;
        hit = { nx, nz };
      }
      for (const c of this.circles) {
        if (p.y >= c.h - 0.05) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, nz = dz / d;
        p.x = c.x + nx * rr; p.z = c.z + nz * rr;
        hit = { nx, nz };
      }
      return hit;
    }

    solidAt(x, z, y, r) {
      for (const b of this.boxes) {
        if (y >= b.h) continue;
        if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return true;
      }
      for (const c of this.circles) {
        if (y >= c.h) continue;
        const dx = x - c.x, dz = z - c.z, rr = c.r + r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      return this.heightAt(x, z) > y + 0.35;
    }

    // Line of sight for aiming (samples along the segment)
    clearLine(x0, z0, y0, x1, z1, y1) {
      const d = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(2, Math.ceil(d / 1.5));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (this.solidAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y0 + (y1 - y0) * t, 0.2)) return false;
      }
      return true;
    }

    buildSpawns() {
      const out = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.26;
        for (let R = 60; R > 20; R -= 3) {
          const x = Math.sin(a) * R, z = Math.cos(a) * R;
          if (!this.solidAt(x, z, 0, 3) && this.heightAt(x, z) < 0.1 && !this.inLava(x, z, 4)) {
            out.push({ x, z, a: U.headingTo(x, z, 0, 0) });
            break;
          }
        }
      }
      this.spawns = out;
    }

    /* ---------- navigation grid ---------- */
    buildNav() {
      const n = Math.ceil(this.size / CELL);
      this.n = n;
      this.walk = new Uint8Array(n * n);
      this.ch = new Float32Array(n * n);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = -this.half + (i + 0.5) * CELL, z = -this.half + (j + 0.5) * CELL;
          const h = this.heightAt(x, z);
          this.ch[j * n + i] = h;
          this.walk[j * n + i] = this.solidAt(x, z, h, KZ.CFG.KART_R + 0.3) || this.inLava(x, z, 1.5) ? 0 : 1;
        }
      }
      this.gScore = new Float32Array(n * n);
      this.came = new Int32Array(n * n);
      this.stamp = new Uint32Array(n * n);
      this.closed = new Uint32Array(n * n);
      this.searchId = 0;
    }

    cellOf(x, z) {
      const n = this.n;
      const i = U.clamp(Math.floor((x + this.half) / CELL), 0, n - 1);
      const j = U.clamp(Math.floor((z + this.half) / CELL), 0, n - 1);
      return j * n + i;
    }
    cellPos(c) {
      const n = this.n;
      return { x: -this.half + ((c % n) + 0.5) * CELL, z: -this.half + (Math.floor(c / n) + 0.5) * CELL };
    }
    nearestWalkable(c) {
      if (this.walk[c]) return c;
      const n = this.n, ci = c % n, cj = Math.floor(c / n);
      for (let r = 1; r < 8; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          if (this.walk[j * n + i]) return j * n + i;
        }
      }
      return c;
    }

    findPath(sx, sz, tx, tz) {
      const n = this.n;
      const start = this.nearestWalkable(this.cellOf(sx, sz));
      const goal = this.nearestWalkable(this.cellOf(tx, tz));
      if (start === goal) return [{ x: tx, z: tz }];
      const id = ++this.searchId;
      const g = this.gScore, came = this.came, stamp = this.stamp, closed = this.closed, walk = this.walk, ch = this.ch;
      const gx = goal % n, gz = Math.floor(goal / n);
      const heap = new KZ.Heap();
      stamp[start] = id; g[start] = 0; came[start] = -1;
      heap.push(0, start);
      let found = false, iter = 0;
      while (heap.size && iter++ < 6000) {
        const c = heap.pop();
        if (closed[c] === id) continue;
        closed[c] = id;
        if (c === goal) { found = true; break; }
        const ci = c % n, cj = (c - ci) / n;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const i = ci + di, j = cj + dj;
            if (i < 0 || j < 0 || i >= n || j >= n) continue;
            const nc = j * n + i;
            if (!walk[nc] || closed[nc] === id) continue;
            if (di && dj && (!walk[cj * n + i] || !walk[j * n + ci])) continue;
            if (ch[nc] - ch[c] > 1.25) continue;
            const cost = g[c] + (di && dj ? 1.414 : 1);
            if (stamp[nc] === id && g[nc] <= cost) continue;
            stamp[nc] = id; g[nc] = cost; came[nc] = c;
            const hx = Math.abs(i - gx), hz = Math.abs(j - gz);
            heap.push(cost + Math.max(hx, hz) + 0.414 * Math.min(hx, hz), nc);
          }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let c = goal; c !== -1; c = came[c]) cells.push(c);
      cells.reverse();
      // string-pull smoothing
      const pts = cells.map(c => this.cellPos(c));
      const out = [];
      let anchor = 0;
      for (let k = 2; k < pts.length; k++) {
        if (!this.gridLine(pts[anchor], pts[k])) { out.push(pts[k - 1]); anchor = k - 1; }
      }
      out.push({ x: tx, z: tz });
      return out;
    }

    gridLine(a, b) {
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.ceil(d / (CELL * 0.5));
      let prevH = this.ch[this.cellOf(a.x, a.z)];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const c = this.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        if (!this.walk[c] || this.ch[c] - prevH > 1.25) return false;
        prevH = this.ch[c];
      }
      return true;
    }

    randomOpenPoint() {
      for (let k = 0; k < 50; k++) {
        const x = U.rand(-this.half + 6, this.half - 6), z = U.rand(-this.half + 6, this.half - 6);
        if (!this.solidAt(x, z, this.heightAt(x, z), 1.5) && !this.inLava(x, z, 2)) return { x, z };
      }
      return { x: 0, z: 30 };
    }
  }

  KZ.Arena = Arena;
})(window.KZ = window.KZ || {});
