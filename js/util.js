/* Kartzooka.io — helpers */
(function (KZ) {
  'use strict';
  const TAU = Math.PI * 2;
  KZ.U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: arr => arr[(Math.random() * arr.length) | 0],
    chance: p => Math.random() < p,
    dist2d: (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az),
    angleDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
      return d;
    },
    // heading 0 faces +z; x = sin(a), z = cos(a)
    headingTo: (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz),
    weighted(pairs) {
      let t = 0;
      for (const p of pairs) t += p[1];
      let r = Math.random() * t;
      for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
      return pairs[pairs.length - 1][0];
    },
    shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    },
    fmtTime(s) {
      s = Math.max(0, Math.ceil(s));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },
    esc: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    hex: n => '#' + n.toString(16).padStart(6, '0')
  };

  // Min-heap for A*
  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v;
      let i = k.length;
      k.push(key); v.push(val);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] <= key) break;
        k[i] = k[p]; v[i] = v[p]; i = p;
      }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v;
      const top = v[0];
      const lk = k.pop(), lv = v.pop();
      const n = k.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c++;
          if (k[c] >= lk) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = lk; v[i] = lv;
      }
      return top;
    }
  }
  KZ.Heap = Heap;

  KZ.Emitter = class {
    constructor() { this._l = {}; }
    on(t, f) { (this._l[t] || (this._l[t] = [])).push(f); }
    emit(t, d) { const l = this._l[t]; if (l) for (const f of l) f(d); }
  };
})(window.KZ = window.KZ || {});
