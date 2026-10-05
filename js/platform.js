/* Kartzooka.io — storage, synthesized audio, keyboard / touch / gamepad input */
(function (KZ) {
  'use strict';
  const U = KZ.U;

  /* ---------------- storage ---------------- */
  const KEY = 'kartzooka.v1';
  const DEFAULTS = {
    name: '', color: 0xff3b3b, mode: 'ffa', map: 'park', bots: 5, level: 'intermediate',
    settings: { quality: 'auto', sound: true, volume: 0.7, music: true, musicVolume: 0.5, autoGas: null, reducedMotion: false, showFps: false, camShake: true },
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0, coinsEarned: 0 },
    coins: 0, owned: [], equip: { character: 'kid', kart: 'classic', hat: 'helmet', paint: 'gloss', trail: 'none' }
  };
  KZ.Store = {
    load() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
      const d = JSON.parse(JSON.stringify(DEFAULTS));
      if (s && typeof s === 'object') {
        for (const k in d) if (k in s && typeof s[k] === typeof d[k]) d[k] = typeof d[k] === 'object' ? Object.assign(d[k], s[k]) : s[k];
      }
      return d;
    },
    save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } }
  };

  /* ---------------- audio ---------------- */
  // Everything is synthesized with WebAudio: no audio files are downloaded.
  const A = KZ.Audio = {
    ctx: null, master: null, sfx: null, musicBus: null, on: true, musicOn: true, vol: 0.7, musicVol: 0.45,
    engine: null, last: {}, music: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const c = this.ctx = new AC();
        this.master = c.createGain();
        this.master.gain.value = this.vol;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.master.connect(comp); comp.connect(c.destination);
        this.sfx = c.createGain(); this.sfx.gain.value = 0.6; this.sfx.connect(this.master);
        this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? this.musicVol * 0.5 : 0; this.musicBus.connect(this.master);
        this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.startMusic();
      } catch (e) { this.ctx = null; }
    },
    setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; },
    setMusic(on, vol) {
      this.musicOn = on;
      if (vol !== undefined) this.musicVol = vol;
      if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? this.musicVol * 0.5 : 0, this.ctx.currentTime, 0.2);
    },
    tone(f, dur, type, vol, f2, delay, dest) {
      const c = this.ctx; if (!c || !this.on) return;
      const t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, freq, vol, sweep, type, delay, dest) {
      const c = this.ctx; if (!c || !this.on) return;
      const t = c.currentTime + (delay || 0);
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    },
    play(name, vol) {
      if (!this.ctx || !this.on) return;
      const now = performance.now();
      const gap = { minigun: 55, hit: 60, bump: 150, coin: 40, lava: 200, land: 150 }[name] || 0;
      if (gap && now - (this.last[name] || 0) < gap) return;
      this.last[name] = now;
      const v = vol === undefined ? 1 : vol;
      switch (name) {
        case 'rocket': this.noise(0.55, 3500, 0.32 * v, 400); this.tone(320, 0.25, 'sawtooth', 0.06 * v, 120); break;
        case 'mega': this.noise(0.9, 1500, 0.4 * v, 200); this.tone(160, 0.6, 'sawtooth', 0.1 * v, 60); break;
        case 'minigun': this.noise(0.05, 3000, 0.22 * v, 0, 'bandpass'); this.tone(140, 0.04, 'square', 0.05 * v, 70); break;
        case 'explosion':
          this.noise(1.1, 1600, 0.6 * v, 50);
          this.tone(110, 0.7, 'sine', 0.45 * v, 28);
          this.noise(0.25, 5000, 0.25 * v, 800, 'highpass');
          break;
        case 'pickup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.13, 0, i * 0.045)); break;
        case 'zap': this.tone(1600, 0.3, 'sawtooth', 0.09 * v, 180); this.noise(0.3, 6000, 0.14 * v, 1500, 'highpass'); break;
        case 'freeze': this.tone(2400, 0.35, 'sine', 0.1 * v, 900); this.tone(1800, 0.3, 'triangle', 0.06 * v, 3000, 0.05); break;
        case 'frozen': this.noise(0.35, 7000, 0.2 * v, 2000, 'highpass'); [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.06 * v, 0, i * 0.04)); break;
        case 'punch': this.tone(90, 0.18, 'sine', 0.5 * v, 40); this.noise(0.12, 1200, 0.35 * v); this.tone(600, 0.08, 'square', 0.06 * v, 200); break;
        case 'spring': this.tone(220, 0.35, 'sine', 0.2 * v, 900); this.tone(330, 0.3, 'triangle', 0.08 * v, 1300, 0.03); break;
        case 'oil': this.noise(0.3, 600, 0.25 * v, 200); this.tone(120, 0.2, 'sine', 0.12 * v, 70); break;
        case 'slip': [700, 500, 350].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.1 * v, f * 0.7, i * 0.06)); break;
        case 'mine': this.tone(520, 0.08, 'square', 0.07 * v); this.tone(390, 0.1, 'square', 0.06 * v, 0, 0.09); break;
        case 'bomb': this.tone(300, 0.15, 'triangle', 0.1 * v, 520); break;
        case 'shield': this.tone(420, 0.45, 'sine', 0.14, 1100); this.tone(630, 0.4, 'triangle', 0.06, 1650, 0.05); break;
        case 'turbo': this.noise(0.8, 600, 0.3 * v, 4000, 'bandpass'); this.tone(200, 0.5, 'sawtooth', 0.06 * v, 600); break;
        case 'boostpad': this.noise(0.5, 800, 0.25 * v, 5000, 'bandpass'); this.tone(500, 0.25, 'square', 0.05 * v, 1500); break;
        case 'hit': this.tone(200, 0.09, 'square', 0.1 * v, 90); this.noise(0.06, 2000, 0.12 * v); break;
        case 'blocked': this.tone(1300, 0.12, 'sine', 0.1 * v, 1700); this.tone(1950, 0.1, 'sine', 0.06 * v); break;
        case 'bump': this.noise(0.18, 500, 0.3 * v); this.tone(80, 0.12, 'sine', 0.2 * v, 50); break;
        case 'coin': this.tone(1320, 0.07, 'square', 0.07); this.tone(1980, 0.14, 'square', 0.07, 0, 0.06); break;
        case 'earn': [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.1, 'square', 0.06, 0, i * 0.05)); break;
        case 'ko': [523, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.09, 0, i * 0.07)); this.noise(0.4, 6000, 0.08, 2000, 'highpass'); break;
        case 'lava': this.noise(0.25, 3000, 0.15 * v, 700, 'bandpass'); break;
        case 'beep': this.tone(660, 0.16, 'square', 0.1); break;
        case 'go': this.tone(990, 0.45, 'square', 0.12); this.tone(1320, 0.4, 'triangle', 0.06); break;
        case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.15, 0, i * 0.11)); break;
        case 'lose': [420, 350, 290, 220].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.16)); break;
        case 'click': this.tone(900, 0.04, 'sine', 0.08); break;
        case 'buy': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.13, 0, i * 0.06)); this.noise(0.3, 8000, 0.05, 3000, 'highpass'); break;
        case 'deny': this.tone(200, 0.2, 'square', 0.08, 150); break;
        case 'land': this.noise(0.15, 380, 0.3 * v); this.tone(70, 0.15, 'sine', 0.25 * v, 40); break;
      }
    },

    // Engine: a soft, rounded "purr" — triangle + sine voices through a warm low-pass,
    // gentle putter tremolo and a smooth pitch curve. Tire hiss while drifting and light wind at speed.
    setEngine(on, speed, turbo, drifting, airborne) {
      const c = this.ctx;
      if (!c) return;
      if (!this.engine) {
        const mk = t => { const o = c.createOscillator(); o.type = t; return o; };
        const o1 = mk('triangle'), o2 = mk('sine'), sub = mk('sine');
        o1.detune.value = -6;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
        const am = c.createGain(); am.gain.value = 0.85;
        const lfo = mk('sine'), lfoG = c.createGain(); lfoG.gain.value = 0.12;
        lfo.connect(lfoG); lfoG.connect(am.gain);
        const vib = mk('sine'), vibG = c.createGain(); vib.frequency.value = 5.5; vibG.gain.value = 3;
        vib.connect(vibG); vibG.connect(o1.frequency); vibG.connect(o2.frequency);
        const m1 = c.createGain(); m1.gain.value = 0.55;
        const m2 = c.createGain(); m2.gain.value = 0.35;
        const m3 = c.createGain(); m3.gain.value = 0.5;
        o1.connect(m1); o2.connect(m2); sub.connect(m3);
        m1.connect(f); m2.connect(f); m3.connect(f);
        const g = c.createGain(); g.gain.value = 0;
        f.connect(am); am.connect(g); g.connect(this.sfx);
        // soft tire hiss
        const sq = c.createBufferSource(); sq.buffer = this.noiseBuf; sq.loop = true;
        const sqf = c.createBiquadFilter(); sqf.type = 'bandpass'; sqf.frequency.value = 1500; sqf.Q.value = 1.4;
        const sqg = c.createGain(); sqg.gain.value = 0;
        sq.connect(sqf); sqf.connect(sqg); sqg.connect(this.sfx);
        // wind
        const wn = c.createBufferSource(); wn.buffer = this.noiseBuf; wn.loop = true;
        const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 400;
        const wg = c.createGain(); wg.gain.value = 0;
        wn.connect(wf); wf.connect(wg); wg.connect(this.sfx);
        [o1, o2, sub, lfo, vib, sq, wn].forEach(n => n.start());
        this.engine = { o1, o2, sub, f, lfo, g, sqg, wg, wf, sm: 0 };
      }
      const e = this.engine, t = c.currentTime;
      const sp = Math.max(0, speed);
      // smoothed speed → pitch, so it glides instead of jumping
      e.sm += (sp - e.sm) * 0.15;
      const k = Math.min(1, e.sm / 34);
      const base = 62 + k * 70 + (turbo ? 18 : 0) + (airborne ? 10 : 0);
      e.o1.frequency.setTargetAtTime(base, t, 0.12);
      e.o2.frequency.setTargetAtTime(base * 2, t, 0.12);
      e.sub.frequency.setTargetAtTime(base * 0.5, t, 0.12);
      e.lfo.frequency.setTargetAtTime(9 + k * 14, t, 0.12);
      e.f.frequency.setTargetAtTime(420 + k * 700 + (turbo ? 300 : 0), t, 0.15);
      const live = on && this.on;
      e.g.gain.setTargetAtTime(live ? 0.05 + k * 0.03 : 0, t, 0.15);
      e.sqg.gain.setTargetAtTime(live && drifting ? 0.045 : 0, t, drifting ? 0.06 : 0.12);
      e.wg.gain.setTargetAtTime(live ? Math.min(0.035, sp * 0.0012) : 0, t, 0.3);
      e.wf.frequency.setTargetAtTime(300 + sp * 18, t, 0.3);
    },

    // Simple upbeat chiptune loop (bass, drums, arpeggio)
    startMusic() {
      if (this.music) return;
      const c = this.ctx;
      const bpm = 124, step = 60 / bpm / 4;
      const prog = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]];
      const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
      let next = c.currentTime + 0.1, n = 0;
      const self = this;
      const note = (f, t, dur, type, vol) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(self.musicBus); o.start(t); o.stop(t + dur + 0.02);
      };
      const drum = (t, kind) => {
        if (kind === 'k') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); g.connect(self.musicBus); o.start(t); o.stop(t + 0.2); }
        else {
          const s = c.createBufferSource(); s.buffer = self.noiseBuf;
          const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'h' ? 7000 : 1800;
          const g = c.createGain(); const d = kind === 'h' ? 0.04 : 0.14;
          g.gain.setValueAtTime(kind === 'h' ? 0.12 : 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          s.connect(f); f.connect(g); g.connect(self.musicBus); s.start(t, Math.random()); s.stop(t + d + 0.01);
        }
      };
      const tick = () => {
        if (!self.ctx) return;
        while (next < c.currentTime + 0.25) {
          const bar = Math.floor(n / 16) % 4, s16 = n % 16, ch = prog[bar];
          if (self.musicOn) {
            if (s16 % 4 === 0) drum(next, 'k');
            if (s16 === 4 || s16 === 12) drum(next, 's');
            if (s16 % 2 === 1) drum(next, 'h');
            if (s16 % 2 === 0) note(mtof(ch[0] - 12 + (s16 % 8 === 6 ? 12 : 0)), next, step * 1.6, 'square', 0.09);
            const arp = ch[(s16 + bar) % 4] + 12;
            if (s16 % 2 === 0 || Math.random() < 0.2) note(mtof(arp), next, step * 0.9, 'triangle', 0.06);
            if (bar % 2 === 1 && (s16 === 0 || s16 === 6 || s16 === 10)) note(mtof(ch[3] + 24), next, step * 3, 'square', 0.03);
          }
          next += step; n++;
        }
      };
      this.music = setInterval(tick, 60);
    }
  };

  /* ---------------- input ---------------- */
  class Input {
    constructor() {
      this.keys = {};
      this.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      this.joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
      this.fireBtn = false; this.driftBtn = false;
      this.handlers = {};
      window.addEventListener('keydown', e => {
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT') return;
        this.keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
        if (this.handlers.key) this.handlers.key(e.code, e);
      });
      window.addEventListener('keyup', e => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; this.fireBtn = this.driftBtn = false; this.joy.id = null; this.joy.x = this.joy.y = 0; });
      this.bindTouch();
    }

    bindTouch() {
      const zone = document.getElementById('joy-zone');
      const base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob');
      if (!zone) return;
      const R = 60;
      zone.addEventListener('touchstart', e => {
        e.preventDefault();
        if (this.handlers.any) this.handlers.any();
        const t = e.changedTouches[0];
        if (this.joy.id !== null) return;
        this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY;
        base.style.display = 'block';
        base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px';
        knob.style.transform = 'translate(-50%,-50%)';
      }, { passive: false });
      zone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier !== this.joy.id) continue;
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx = dx / d * R; dy = dy / d * R; }
          this.joy.x = dx / R; this.joy.y = dy / R;
          knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
        }
      }, { passive: false });
      const end = e => {
        for (const t of e.changedTouches) if (t.identifier === this.joy.id) {
          this.joy.id = null; this.joy.x = this.joy.y = 0; base.style.display = 'none';
        }
      };
      zone.addEventListener('touchend', end);
      zone.addEventListener('touchcancel', end);
      const hold = (id, prop) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', e => { e.preventDefault(); if (this.handlers.any) this.handlers.any(); this[prop] = true; el.classList.add('down'); }, { passive: false });
        const up = e => { e.preventDefault(); this[prop] = false; el.classList.remove('down'); };
        el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
        el.addEventListener('mousedown', () => { this[prop] = true; });
        el.addEventListener('mouseup', () => { this[prop] = false; });
        el.addEventListener('mouseleave', () => { this[prop] = false; });
      };
      hold('btn-fire', 'fireBtn');
      hold('btn-drift', 'driftBtn');
    }

    // Combined control state for the player's kart
    read(autoGas) {
      const k = this.keys;
      let thr = 0, steer = 0;
      if (k.KeyW || k.ArrowUp) thr += 1;
      if (k.KeyS || k.ArrowDown) thr -= 1;
      if (k.KeyA || k.ArrowLeft) steer += 1;
      if (k.KeyD || k.ArrowRight) steer -= 1;
      let fire = !!(k.Space || k.KeyJ || k.Enter);
      let drift = !!(k.ShiftLeft || k.ShiftRight || k.KeyK);
      if (this.joy.id !== null || this.joy.x || this.joy.y) {
        steer = -this.joy.x * 1.15;
        if (autoGas) thr = this.joy.y > 0.55 ? -1 : 1;
        else thr = Math.abs(this.joy.y) > 0.2 ? -this.joy.y * 1.3 : 0;
      } else if (autoGas && this.touch && thr === 0) thr = 1;
      if (this.fireBtn) fire = true;
      if (this.driftBtn) drift = true;
      // gamepad
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.15) steer = -ax;
        const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
        if (rt > 0.1 || lt > 0.1) thr = rt - lt;
        if (p.buttons[0] && p.buttons[0].pressed) fire = true;
        if ((p.buttons[1] && p.buttons[1].pressed) || (p.buttons[5] && p.buttons[5].pressed)) drift = true;
        if (p.buttons[2] && p.buttons[2].pressed && thr === 0) thr = 1;
        break;
      }
      return { throttle: U.clamp(thr, -1, 1), steer: U.clamp(steer, -1, 1), fire, drift };
    }
  }

  KZ.Input = Input;
})(window.KZ = window.KZ || {});
