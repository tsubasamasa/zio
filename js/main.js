/* Kartzooka.io — game controller: menus, HUD, loop */
(function (KZ) {
  'use strict';
  const U = KZ.U;
  const $ = id => document.getElementById(id);
  const T = window.THREE;

  const STREAK = { 2: 'DOUBLE KO!', 3: 'TRIPLE KO!', 4: 'RAMPAGE!', 5: 'UNSTOPPABLE!', 7: 'LEGENDARY!' };

  class Game {
    constructor() {
      this.profile = KZ.Store.load();
      this.settings = this.profile.settings;
      this.input = new KZ.Input();
      if (this.settings.autoGas === null) this.settings.autoGas = this.input.touch;
      this.scene3d = new KZ.Scene3D($('c'), this.settings);
      this.state = 'menu';
      this.world = null;
      this.last = 0;
      this.fps = 60;
      this.lowT = 0;
      this.hudT = 0;
      this.miniT = 0;
      this.countBeep = 4;
      this.input.handlers.key = code => this.onKey(code);
      this.input.handlers.any = () => KZ.Audio.init();
      window.addEventListener('pointerdown', () => KZ.Audio.init(), { once: false });
      window.addEventListener('resize', () => { this.scene3d.resize(); this.resizePreview(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
      if (this.input.touch) document.body.classList.add('touch');
      KZ.Audio.on = this.settings.sound;
      KZ.Audio.musicOn = this.settings.music;
      KZ.Audio.musicVol = this.settings.musicVolume;
      KZ.Audio.setVolume(this.settings.volume);
    }

    save() { KZ.Store.save(this.profile); }

    /* ---------------- menu ---------------- */
    boot() {
      this.buildMenu();
      this.initPreview();
      this.startDemo();
      $('boot').remove();
      requestAnimationFrame(t => this.loop(t));
    }

    buildMenu() {
      const p = this.profile;
      $('nick').value = p.name;
      $('nick').addEventListener('input', () => { p.name = $('nick').value.trim().slice(0, 14); this.save(); });
      $('nick').addEventListener('keydown', e => { if (e.key === 'Enter') this.play(); });

      $('colors').innerHTML = KZ.KART_COLORS.map(c => '<button class="swatch" data-c="' + c + '" style="background:' + U.hex(c) + '" aria-label="Color"></button>').join('');
      $('colors').addEventListener('click', e => {
        const b = e.target.closest('.swatch'); if (!b) return;
        p.color = +b.dataset.c; this.save(); this.refreshMenu(); this.refreshPreview(); KZ.Audio.play('click');
      });
      this.gtab = 'character';
      $('gtabs').innerHTML = KZ.GARAGE_TABS.map(t => '<button data-t="' + t[0] + '">' + t[1] + '</button>').join('');
      $('gtabs').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        this.gtab = b.dataset.t; this.renderGarage(); KZ.Audio.play('click');
      });
      $('items').addEventListener('click', e => {
        const b = e.target.closest('.item'); if (!b) return;
        this.garageClick(this.gtab, b.dataset.id, b);
      });

      $('modes').innerHTML = KZ.MODE_ORDER.map(id => { const m = KZ.MODES[id]; return '<button class="mode" data-m="' + id + '"><span class="i">' + m.icon + '</span><span class="n">' + U.esc(m.name) + '</span></button>'; }).join('');
      $('modes').addEventListener('click', e => {
        const b = e.target.closest('.mode'); if (!b) return;
        p.mode = b.dataset.m; this.save(); this.refreshMenu(); KZ.Audio.play('click');
      });
      $('maps').innerHTML = KZ.MAP_ORDER.map(id => {
        const m = KZ.MAPS[id], t = m.theme;
        return '<button class="map" data-m="' + id + '"><span class="sw" style="background:linear-gradient(' + U.hex(t.sky) + ' 0 45%,' + U.hex(t.ground) + ' 45%)"></span><span class="n">' + U.esc(m.name) + '</span></button>';
      }).join('');
      $('maps').addEventListener('click', e => {
        const b = e.target.closest('.map'); if (!b) return;
        p.map = b.dataset.m; this.save(); this.refreshMenu(); this.startDemo(); KZ.Audio.play('click');
      });
      $('bots').value = p.bots;
      $('bots').addEventListener('input', () => { p.bots = +$('bots').value; this.save(); this.refreshMenu(); });
      const lv = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['mixed', 'Mixed']];
      $('levels').innerHTML = lv.map(l => '<button data-l="' + l[0] + '">' + l[1] + '</button>').join('');
      $('levels').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        p.level = b.dataset.l; this.save(); this.refreshMenu(); KZ.Audio.play('click');
      });
      $('play').addEventListener('click', () => this.play());
      $('menu-tabs').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        document.querySelector('.menu-grid').dataset.show = b.dataset.mt;
        $('menu-tabs').querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
        this.resizePreview();
      });
      const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
      if (!fsOk) $('fs-btn').classList.add('hidden');
      $('fs-btn').addEventListener('click', () => {
        const d = document, el = d.documentElement;
        try {
          if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
          else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        } catch (err) { /* blocked by the host page */ }
      });
      $('again').addEventListener('click', () => this.play());
      $('to-menu').addEventListener('click', () => this.toMenu());
      $('resume').addEventListener('click', () => this.resume());
      $('quit').addEventListener('click', () => this.toMenu());
      $('pause-btn').addEventListener('click', () => this.pause());
      document.querySelectorAll('[data-modal]').forEach(b => b.addEventListener('click', () => this.openModal(b.dataset.modal)));
      $('modal').addEventListener('click', e => { if (e.target === $('modal') || e.target.closest('.close')) this.closeModal(); });
      this.refreshMenu();
    }

    refreshMenu() {
      const p = this.profile;
      document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('sel', +b.dataset.c === p.color));
      this.renderGarage();
      document.querySelectorAll('.mode').forEach(b => b.classList.toggle('sel', b.dataset.m === p.mode));
      document.querySelectorAll('.map').forEach(b => b.classList.toggle('sel', b.dataset.m === p.map));
      document.querySelectorAll('#levels button').forEach(b => b.classList.toggle('sel', b.dataset.l === p.level));
      $('bots-val').textContent = p.bots;
      $('mode-desc').textContent = KZ.MODES[p.mode].desc + (KZ.MODES[p.mode].teams && p.bots < 3 ? ' Tip: add more rivals for bigger teams.' : '');
      const s = p.stats;
      $('career').innerHTML = [[s.matches, 'Matches'], [s.wins, 'Wins'], [s.kills, 'KOs'], [s.bestStreak, 'Best streak']]
        .map(x => '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>').join('');
    }

    initPreview() {
      const cv = $('preview');
      try {
        this.pr = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      } catch (e) { this.pr = null; return; }
      this.pr.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      if ('outputColorSpace' in this.pr) this.pr.outputColorSpace = T.SRGBColorSpace;
      this.prScene = new T.Scene();
      this.prScene.add(new T.HemisphereLight(0xffffff, 0x88aacc, 1.0));
      const d = new T.DirectionalLight(0xffffff, 1.0);
      d.position.set(5, 8, 6);
      this.prScene.add(d);
      this.prCam = new T.PerspectiveCamera(35, 260 / 200, 0.1, 100);
      this.prCam.position.set(0, 4.2, 9);
      this.prCam.lookAt(0, 1.2, 0);
      this.resizePreview();
      this.refreshPreview();
    }

    resizePreview() {
      if (!this.pr) return;
      const cv = $('preview');
      const w = cv.clientWidth || 260, h = cv.clientHeight || w * 200 / 260;
      this.pr.setSize(w, h, false);
      this.prCam.aspect = w / h;
      this.prCam.updateProjectionMatrix();
    }

    refreshPreview() {
      if (!this.pr) return;
      if (this.prKart) this.prScene.remove(this.prKart);
      const eq = this.profile.equip;
      this.prKart = KZ.Models.kart({ color: this.profile.color, hat: eq.hat, character: eq.character, kartType: eq.kart, paint: eq.paint });
      this.prTrail = eq.trail;
      this.prScene.add(this.prKart);
    }

    /* ---------------- garage & shop ---------------- */
    isUnlocked(cat, it) {
      const u = it.unlock;
      if (!u) return true;
      if (this.profile.owned.indexOf(cat + ':' + it.id) >= 0) return true;
      if (u.stat) return (this.profile.stats[u.stat] || 0) >= u.n;
      return false;
    }
    unlockedSet() {
      const set = new Set();
      for (const [cat] of KZ.GARAGE_TABS) for (const it of KZ.GARAGE[cat]) if (this.isUnlocked(cat, it)) set.add(cat + ':' + it.id);
      return set;
    }
    itemIcon(cat, id) {
      const icons = {
        character: { kid: '🧒', fox: '🦊', bear: '🐻', cat: '🐱', robot: '🤖', frog: '🐸', alien: '👽', penguin: '🐧', panda: '🐼' },
        kart: { classic: '🏎️', speedster: '🚀', monster: '🛻', buggy: '🚙', rocketcar: '🛸' },
        hat: { helmet: '⛑️', cap: '🧢', tophat: '🎩', horns: '🪖', crown: '👑', party: '🥳', cowboy: '🤠', halo: '😇', propeller: '🌀' },
        paint: { gloss: '✨', matte: '🎨', metal: '🔩', neon: '💡', gold: '🥇', candy: '🍬' },
        trail: { none: '⬜', fire: '🔥', rainbow: '🌈', stars: '⭐', hearts: '💖', bubbles: '🫧' }
      };
      return (icons[cat] && icons[cat][id]) || '❔';
    }
    renderGarage() {
      const p = this.profile, cat = this.gtab;
      document.querySelectorAll('#gtabs button').forEach(b => b.classList.toggle('sel', b.dataset.t === cat));
      const eqId = p.equip[cat];
      $('items').innerHTML = KZ.GARAGE[cat].map(it => {
        const ok = this.isUnlocked(cat, it);
        let sub = '';
        if (!ok) sub = it.unlock.coins ? '<span class="pr">🪙 ' + it.unlock.coins + '</span>' : '<span class="lk">🔒 ' + U.esc(KZ.STAT_LABEL[it.unlock.stat].replace('{n}', it.unlock.n)) + '</span>';
        return '<button class="item' + (it.id === eqId ? ' eq' : '') + (ok ? '' : ' locked') + '" data-id="' + it.id + '"><span class="ic">' + this.itemIcon(cat, it.id) + '</span>' + U.esc(it.name) + sub + '</button>';
      }).join('');
      $('coin-balance').textContent = '🪙 ' + p.coins;
    }
    garageClick(cat, id, el) {
      const p = this.profile;
      const it = KZ.GARAGE[cat].find(x => x.id === id);
      if (!it) return;
      if (!this.isUnlocked(cat, it)) {
        if (it.unlock.coins && p.coins >= it.unlock.coins) {
          p.coins -= it.unlock.coins;
          p.owned.push(cat + ':' + id);
          KZ.Audio.play('buy');
          const cb = $('coin-balance'); cb.classList.remove('pulse'); void cb.offsetWidth; cb.classList.add('pulse');
        } else {
          KZ.Audio.play('deny');
          el.classList.remove('cant'); void el.offsetWidth; el.classList.add('cant');
          return;
        }
      } else KZ.Audio.play('click');
      p.equip[cat] = id;
      this.save();
      this.renderGarage();
      this.refreshPreview();
    }

    startDemo() {
      // live AI match behind the menu
      this.world = new KZ.World({ mode: 'ffa', map: this.profile.map, bots: 7, level: 'mixed', player: null, countdown: 0 });
      this.world.demo = true;
      this.scene3d.build(this.world);
    }

    play() {
      KZ.Audio.init();
      const p = this.profile;
      p.name = ($('nick').value || '').trim().slice(0, 14);
      this.save();
      this.world = new KZ.World({
        mode: p.mode, map: p.map, bots: p.bots, level: p.level,
        player: { name: p.name || 'You', color: p.color, hat: p.equip.hat, character: p.equip.character, kartType: p.equip.kart, paint: p.equip.paint, trail: p.equip.trail }
      });
      this.scene3d.build(this.world);
      this.bindWorld(this.world);
      this.state = 'playing';
      this.countBeep = 4;
      $('menu').classList.add('hidden');
      $('results').classList.add('hidden');
      $('pause').classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('touch').classList.toggle('hidden', !this.input.touch);
      $('killfeed').innerHTML = '';
      $('center-msg').innerHTML = '';
      $('fire-key').textContent = 'SPACE';
      $('fps').classList.toggle('hidden', !this.settings.showFps);
      this.lastWeapon = undefined;
      this.matchStreak = 0;
    }

    toMenu() {
      this.state = 'menu';
      KZ.Audio.setEngine(false, 0, false);
      $('hud').classList.add('hidden');
      $('results').classList.add('hidden');
      $('pause').classList.add('hidden');
      $('menu').classList.remove('hidden');
      this.refreshMenu();
      this.startDemo();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      KZ.Audio.setEngine(false, 0, false);
      $('pause').classList.remove('hidden');
    }
    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      $('pause').classList.add('hidden');
      this.last = performance.now();
    }

    onKey(code) {
      KZ.Audio.init();
      if (code === 'Escape') {
        if (!$('modal').classList.contains('hidden')) this.closeModal();
        else if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (code === 'KeyM') {
        this.settings.sound = !this.settings.sound;
        KZ.Audio.on = this.settings.sound;
        this.save();
        this.toast(this.settings.sound ? '🔊 Sound on' : '🔇 Sound off');
      } else if (code === 'Enter' && this.state === 'over') this.play();
    }

    /* ---------------- match events ---------------- */
    bindWorld(w) {
      const me = () => w.player;
      const nm = k => '<span style="color:' + U.hex(k.color === 0x30323d ? 0xb0b6c8 : k.color) + '">' + U.esc(k.name) + '</span>';
      w.on('kill', e => {
        const icon = e.weapon ? (KZ.WEAPONS[e.weapon] || {}).icon || '💥' : '💥';
        const mine = e.killer === me() || e.victim === me();
        this.feed((e.killer ? nm(e.killer) + ' ' + icon + ' ' : '💥 ') + nm(e.victim), mine);
        if (e.killer === me()) {
          KZ.Audio.play('ko');
          setTimeout(() => KZ.Audio.play('earn'), 250);
          this.toast('🪙 +' + KZ.ECON.perKO);
          const s = me().streak;
          this.bigMsg(STREAK[s] || 'KO!', 'mid');
          this.matchStreak = Math.max(this.matchStreak, s);
        }
        if (e.victim === me()) {
          KZ.Audio.play('lose', 0.6);
          const by = e.killer ? 'by ' + U.esc(e.killer.name) : '';
          this.bigMsg('KNOCKED OUT', 'big', by);
        }
      });
      w.on('explosion', e => {
        const k = me();
        const d = k ? U.dist2d(k.x, k.z, e.x, e.z) : 30;
        KZ.Audio.play('explosion', U.clamp(1 - d / 80, 0.15, 1));
      });
      w.on('fire', e => {
        const k = me();
        const d = k ? U.dist2d(k.x, k.z, e.kart.x, e.kart.z) : 50;
        const v = e.kart === k ? 1 : U.clamp(1 - d / 60, 0, 0.6);
        if (v <= 0.02) return;
        const s = { rocket: 'rocket', triple: 'rocket', homing: 'rocket', mega: 'mega', minigun: 'minigun', freeze: 'freeze', punch: 'punch', oil: 'oil', mine: 'mine', bomb: 'bomb', lightning: 'zap', shield: 'shield', turbo: 'turbo' }[e.type];
        KZ.Audio.play(s, v);
      });
      w.on('pickup', e => {
        if (e.kart !== me()) return;
        KZ.Audio.play('pickup');
        const d = KZ.WEAPONS[e.type];
        this.toast(d.icon + ' ' + d.name + '!');
      });
      w.on('hit', e => { if (e.kart === me()) KZ.Audio.play('hit'); });
      w.on('blocked', e => { if (e.kart === me()) KZ.Audio.play('blocked'); });
      w.on('bump', e => { if (e.kart === me() || e.other === me()) KZ.Audio.play('bump'); });
      w.on('land', e => { if (e.kart === me()) KZ.Audio.play('land'); });
      w.on('coin', e => { if (e.kart === me()) KZ.Audio.play('coin'); });
      w.on('frozen', e => { if (e.kart === me() || e.by === me()) KZ.Audio.play('frozen'); if (e.kart === me()) this.toast('❄️ Frozen!'); });
      w.on('boostPad', e => { if (e.kart === me()) KZ.Audio.play('boostpad'); });
      w.on('jumpPad', e => { if (e.kart === me()) KZ.Audio.play('spring'); });
      w.on('slip', e => { if (e.kart === me()) { KZ.Audio.play('slip'); this.toast('🛢️ Slipped!'); } });
      w.on('lava', e => { if (e.kart === me()) { KZ.Audio.play('lava'); this.toast('🔥 Hot hot hot!'); } });
      w.on('driftBoost', e => { if (e.kart === me()) { KZ.Audio.play('turbo', 0.5); this.toast('🔥 Drift boost!'); } });
      w.on('respawn', e => { if (e.kart === me()) $('center-msg').innerHTML = ''; });
      w.on('hillMove', () => { if (this.state === 'playing' && w.time > 1) this.toast('👑 The hill moved!'); });
      w.on('matchEnd', r => setTimeout(() => this.showResults(r), 1400));
    }

    feed(html, mine) {
      const d = document.createElement('div');
      d.className = 'kf' + (mine ? ' me' : '');
      d.innerHTML = html;
      const kf = $('killfeed');
      kf.prepend(d);
      while (kf.children.length > 5) kf.lastChild.remove();
      setTimeout(() => d.remove(), 5000);
    }

    bigMsg(text, size, sub) {
      const c = $('center-msg');
      c.innerHTML = '<div class="' + (size === 'big' ? 'big-msg' : 'mid-msg') + '">' + U.esc(text) + '</div>' + (sub ? '<div class="sub-msg">' + sub + '</div>' : '');
      clearTimeout(this.msgT);
      this.msgT = setTimeout(() => { if (c.firstChild && c.firstChild.textContent === text) c.innerHTML = ''; }, size === 'big' ? 2400 : 1300);
    }

    toast(text) {
      const d = document.createElement('div');
      d.className = 'toast';
      d.textContent = text;
      const a = $('toast-area');
      a.appendChild(d);
      while (a.children.length > 3) a.firstChild.remove();
      setTimeout(() => d.remove(), 1800);
    }

    showResults(r) {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      const w = this.world, me = w.player;
      this.state = 'over';
      KZ.Audio.setEngine(false, 0, false);
      const st = r.standings;
      const place = st.indexOf(me) + 1;
      const key = k => w.mode.lives ? [k.out ? 0 : 1, k.lives, k.kills] : [Math.floor(k.score), k.kills];
      const tied = st.length > 1 && key(st[0]).join() === key(st[1]).join() && key(st.find(k => k === me) || st[0]).join() === key(st[0]).join();
      let won = place === 1 && !tied;
      if (w.mode.teams) won = r.winnerTeam === me.team;
      KZ.Audio.play(won ? 'win' : 'lose');
      const s = this.profile.stats;
      s.matches++; if (won) s.wins++;
      s.kills += me.kills; s.deaths += me.deaths;
      s.bestStreak = Math.max(s.bestStreak, this.matchStreak || 0);
      // coins earned this match
      const E = KZ.ECON, parts = [];
      const add = (label, v) => { if (v > 0) parts.push([label, v]); };
      add('Played', E.play);
      add(me.kills + ' KO', me.kills * E.perKO);
      if (w.mode.id === 'coins') add(me.coins + ' coins', me.coins * E.perCoin);
      if (won) add('Win', E.win); else if (place <= 3 && !w.mode.teams) add('Top 3', E.top3);
      if ((this.matchStreak || 0) >= 3) add('Streak', E.streak3);
      const earned = parts.reduce((a, x) => a + x[1], 0);
      const before = this.unlockedSet();
      this.profile.coins += earned;
      s.coinsEarned += earned;
      const fresh = [];
      for (const [cat] of KZ.GARAGE_TABS) for (const it of KZ.GARAGE[cat]) if (it.unlock && it.unlock.stat && this.isUnlocked(cat, it) && !before.has(cat + ':' + it.id)) fresh.push(it.name);
      $('res-earn').innerHTML = parts.map(x => '<span>' + U.esc(x[0]) + ' +' + x[1] + '</span>').join('') + '<span class="total">🪙 +' + earned + '</span>' +
        fresh.map(n => '<span class="unlock">🔓 ' + U.esc(n) + '</span>').join('');
      setTimeout(() => KZ.Audio.play(fresh.length ? 'buy' : 'earn'), 900);
      this.save();
      $('res-title').textContent = won ? (w.mode.teams ? 'Team Victory!' : 'You Win!') : w.mode.teams ? (r.winnerTeam === -1 ? 'Draw!' : 'Defeat') : tied ? 'Draw!' : 'Match Over';
      let sub;
      if (w.mode.teams) sub = KZ.TEAM_NAMES[0] + ' ' + r.teamScore[0] + ' – ' + r.teamScore[1] + ' ' + KZ.TEAM_NAMES[1];
      else sub = tied ? 'Tied for first place' : 'You finished #' + place + ' of ' + st.length;
      $('res-sub').textContent = sub;
      const col = { ffa: 'KOs', team: 'KOs', survival: 'Lives', koth: 'Points', coins: 'Coins' }[w.mode.id];
      $('res-table').innerHTML = '<tr><th>#</th><th style="text-align:left">Driver</th><th>' + col + '</th><th>KO</th><th>Out</th></tr>' +
        st.map((k, i) => {
          const val = w.mode.id === 'survival' ? Math.max(0, k.lives) : Math.floor(k.score);
          const medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
          return '<tr class="' + (k === me ? 'me' : '') + '"><td class="pos">' + medal + '</td><td class="nm"><span class="dot" style="background:' + U.hex(k.color) + '"></span>' + U.esc(k.name) +
            (k.level ? ' <small style="color:#8a9bb8">' + KZ.LEVELS[k.level].name + '</small>' : '') + '</td><td>' + val + '</td><td>' + k.kills + '</td><td>' + k.deaths + '</td></tr>';
        }).join('');
      $('hud').classList.add('hidden');
      $('results').classList.remove('hidden');
      this.refreshMenu();
    }

    /* ---------------- modals ---------------- */
    openModal(type) {
      KZ.Audio.play('click');
      const b = $('modal-body');
      if (type === 'howto') {
        b.innerHTML = '<h2>How to play</h2>' +
          '<p>Drive over the glowing <b>? boxes</b> to grab a weapon, then blast your rivals. A knocked-out kart respawns after a moment.</p>' +
          '<h3>Controls</h3><div class="keys">' +
          '<kbd>W / ↑</kbd><span>Accelerate</span><kbd>S / ↓</kbd><span>Brake and reverse</span><kbd>A D / ← →</kbd><span>Steer</span>' +
          '<kbd>SPACE</kbd><span>Fire / use item</span><kbd>SHIFT</kbd><span>Drift (hold through a turn for a speed boost)</span>' +
          '<kbd>ESC</kbd><span>Pause</span><kbd>M</kbd><span>Mute</span>' +
          '<kbd>Touch</kbd><span>Drag on the left side to steer, tap FIRE and DRIFT on the right</span>' +
          '<kbd>Gamepad</kbd><span>Left stick steer, RT gas, LT brake, A fire, B drift</span></div>' +
          '<h3>Weapons</h3><div class="wgrid">' +
          [['rocket', 'Flies straight. One direct hit knocks a kart out.'], ['triple', 'Three rockets in a row.'], ['homing', 'Locks on to the nearest rival in front.'],
            ['minigun', 'Hold fire for a stream of bullets.'], ['mine', 'Drops behind you. Three per box.'], ['bomb', 'Lobbed ahead, explodes after a short fuse.'],
            ['lightning', 'Zaps the closest rival in front and makes them spin.'], ['shield', 'Blocks all damage for 5 seconds.'], ['turbo', 'A big burst of speed.']]
            .map(x => '<div><b>' + KZ.WEAPONS[x[0]].icon + ' ' + KZ.WEAPONS[x[0]].name + '</b>' + x[1] + '</div>').join('') + '</div>' +
          '<h3>Modes</h3><div class="wgrid">' + KZ.MODE_ORDER.map(id => '<div><b>' + KZ.MODES[id].icon + ' ' + KZ.MODES[id].name + '</b>' + KZ.MODES[id].desc + '</div>').join('') + '</div>' +
          '<h3>AI skill</h3><p><b>Beginner</b> drivers react slowly and aim loosely. <b>Intermediate</b> drivers lead their shots and dodge some rockets. <b>Advanced</b> drivers drift, dodge, use shields at the right moment and drop mines in your path.</p>';
      } else {
        const s = this.settings;
        b.innerHTML = '<h2>Settings</h2>' +
          '<label class="set">Graphics quality<select id="s-quality"><option value="auto">Auto</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low (fastest)</option></select></label>' +
          '<label class="set">Sound effects<input id="s-sound" type="checkbox"></label>' +
          '<label class="set">Music<input id="s-music" type="checkbox"></label>' +
          '<label class="set">Music volume<input id="s-musicvol" type="range" min="0" max="1" step="0.05"></label>' +
          '<label class="set">Volume<input id="s-volume" type="range" min="0" max="1" step="0.05"></label>' +
          '<label class="set">Auto-accelerate (touch)<input id="s-autogas" type="checkbox"></label>' +
          '<label class="set">Reduce motion (no camera shake)<input id="s-reduced" type="checkbox"></label>' +
          '<label class="set">Show FPS<input id="s-fps" type="checkbox"></label>' +
          '<p style="color:#5d6f92;font-weight:600">Progress is saved in this browser only.</p>';
        $('s-quality').value = s.quality;
        $('s-sound').checked = s.sound;
        $('s-music').checked = s.music;
        $('s-musicvol').value = s.musicVolume;
        $('s-volume').value = s.volume;
        $('s-autogas').checked = !!s.autoGas;
        $('s-reduced').checked = s.reducedMotion;
        $('s-fps').checked = s.showFps;
        const apply = () => {
          const q = $('s-quality').value;
          const qChanged = q !== s.quality;
          s.quality = q; s.sound = $('s-sound').checked; s.volume = +$('s-volume').value;
          s.music = $('s-music').checked; s.musicVolume = +$('s-musicvol').value;
          KZ.Audio.setMusic(s.music, s.musicVolume);
          s.autoGas = $('s-autogas').checked; s.reducedMotion = $('s-reduced').checked; s.showFps = $('s-fps').checked;
          KZ.Audio.on = s.sound; KZ.Audio.setVolume(s.volume);
          $('fps').classList.toggle('hidden', !s.showFps);
          if (qChanged) { this.scene3d.autoLow = false; this.scene3d.setQuality(); }
          this.save();
        };
        b.querySelectorAll('input,select').forEach(el => el.addEventListener('change', apply));
        $('s-volume').addEventListener('input', apply);
        $('s-musicvol').addEventListener('input', apply);
      }
      $('modal').classList.remove('hidden');
    }
    closeModal() { $('modal').classList.add('hidden'); }

    /* ---------------- HUD ---------------- */
    updateHud(dt) {
      const w = this.world, me = w.player;
      if (!me) return;
      // countdown
      if (w.countdown > 0) {
        const n = Math.ceil(w.countdown);
        if (n !== this.countBeep) { this.countBeep = n; KZ.Audio.play('beep'); $('center-msg').innerHTML = '<div class="big-msg">' + n + '</div>'; }
      } else if (this.countBeep > 0) {
        this.countBeep = 0;
        KZ.Audio.play('go');
        this.bigMsg('GO!', 'big');
      }
      const tEl = $('timer');
      tEl.textContent = U.fmtTime(w.timeLeft);
      tEl.classList.toggle('warn', w.timeLeft < 20 && !w.over);

      // respawn countdown
      if (!me.alive && !me.out && !w.over) {
        const left = Math.max(0, me.respawnAt - w.time);
        const cm = $('center-msg');
        if (!cm.querySelector('.big-msg')) cm.innerHTML = '<div class="mid-msg">Respawning in ' + left.toFixed(1) + '</div>';
      } else if (me.out && !w.over) {
        const cm = $('center-msg');
        if (!cm.firstChild) cm.innerHTML = '<div class="mid-msg">You are out! Spectating…</div>';
      }

      // hp & weapon
      const hp = Math.max(0, me.alive ? me.hp : 0);
      const bar = $('hp-bar').firstChild;
      bar.style.width = hp + '%';
      bar.className = hp > 60 ? '' : hp > 30 ? 'mid' : 'low';
      $('hp-text').textContent = me.shield > 0 ? '🛡️ ' + me.shield.toFixed(1) : Math.ceil(hp);
      const wkey = me.weapon ? me.weapon.type + me.weapon.ammo : null;
      if (wkey !== this.lastWeapon) {
        this.lastWeapon = wkey;
        const slot = $('weapon-slot');
        if (me.weapon) {
          const d = KZ.WEAPONS[me.weapon.type];
          $('weapon-icon').textContent = d.icon;
          $('weapon-name').textContent = d.name;
          $('weapon-ammo').textContent = d.ammo > 1 ? '× ' + me.weapon.ammo : '';
          slot.className = 'ready';
        } else {
          $('weapon-icon').textContent = '?';
          $('weapon-name').textContent = 'Grab a box!';
          $('weapon-ammo').textContent = '';
          slot.className = 'empty';
        }
      }

      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.2;
        this.renderBoard();
        const obj = $('objective');
        const m = w.mode.id;
        if (m === 'koth' && w.hill) obj.textContent = w.hill.owner ? (w.hill.owner === me ? '👑 You hold the hill!' : '👑 ' + w.hill.owner.name + ' holds the hill') : w.hill.contested ? '⚔️ Hill contested!' : '👑 Drive into the hill';
        else if (m === 'survival') obj.textContent = '❤️ Lives: ' + Math.max(0, me.lives);
        else if (m === 'coins') obj.textContent = '🪙 Coins: ' + me.coins;
        else if (m === 'team') obj.textContent = 'Team ' + KZ.TEAM_NAMES[me.team];
        else obj.textContent = '';
        let ms = '🏁 ' + me.kills + ' KO';
        if (me.streak >= 2) ms += ' · 🔥' + me.streak;
        $('my-stats').textContent = ms;
        if (this.settings.showFps) $('fps').textContent = Math.round(this.fps) + ' FPS';
      }
      this.miniT -= dt;
      if (this.miniT <= 0) { this.miniT = 0.1; this.drawMinimap(); }
    }

    renderBoard() {
      const w = this.world, me = w.player;
      const st = w.standings();
      let h = '';
      if (w.mode.teams) {
        h += '<div class="teams"><div style="background:' + U.hex(KZ.TEAM_COLORS[0]) + '">' + w.teamScore[0] + '</div><div style="background:' + U.hex(KZ.TEAM_COLORS[1]) + '">' + w.teamScore[1] + '</div></div>';
      }
      const val = k => w.mode.id === 'survival' ? '❤️' + Math.max(0, k.lives) : w.mode.id === 'coins' ? '🪙' + k.coins : Math.floor(k.score);
      const show = st.slice(0, 5);
      if (show.indexOf(me) < 0) show.push(me);
      for (const k of show) {
        h += '<div class="r' + (k === me ? ' me' : '') + (k.out ? ' out' : '') + '"><span><span class="dot" style="background:' + U.hex(k.color) + '"></span>' + (st.indexOf(k) + 1) + '. ' + U.esc(k.name) + '</span><span>' + val(k) + '</span></div>';
      }
      $('board').innerHTML = h;
    }

    drawMinimap() {
      const w = this.world, me = w.player;
      const cv = $('minimap'), g = cv.getContext('2d');
      const S = cv.width, ar = w.arena, k = S / (ar.size + 6);
      const X = x => S / 2 - x * k, Z = z => S / 2 - z * k; // mirrored so it matches the chase camera
      g.clearRect(0, 0, S, S);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(X(ar.half), Z(ar.half), ar.size * k, ar.size * k);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (const b of ar.boxes) if (b.kind !== 'border') g.fillRect(X(b.x + b.w / 2), Z(b.z + b.d / 2), b.w * k, b.d * k);
      g.fillStyle = 'rgba(120,190,255,0.6)';
      for (const d of ar.decks) g.fillRect(X(d.x + d.w / 2), Z(d.z + d.d / 2), d.w * k, d.d * k);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      for (const c of ar.circles) { g.beginPath(); g.arc(X(c.x), Z(c.z), Math.max(1.5, c.r * k), 0, U.TAU); g.fill(); }
      g.fillStyle = '#ffd23a';
      for (const b of w.boxes) if (b.active) g.fillRect(X(b.x) - 2.5, Z(b.z) - 2.5, 5, 5);
      for (const c of w.coins) { g.beginPath(); g.arc(X(c.x), Z(c.z), 2, 0, U.TAU); g.fill(); }
      if (w.hill) {
        g.strokeStyle = '#ffe066'; g.lineWidth = 2;
        g.beginPath(); g.arc(X(w.hill.x), Z(w.hill.z), w.hill.r * k, 0, U.TAU); g.stroke();
      }
      for (const o of w.karts) {
        if (!o.alive) continue;
        g.save();
        g.translate(X(o.x), Z(o.z));
        g.rotate(-o.a + Math.PI);
        g.fillStyle = U.hex(o.color);
        g.strokeStyle = o === me ? '#fff' : 'rgba(20,42,77,0.8)';
        g.lineWidth = o === me ? 2 : 1;
        g.beginPath();
        const s = o === me ? 6 : 4.5;
        g.moveTo(0, s); g.lineTo(s * 0.75, -s * 0.7); g.lineTo(-s * 0.75, -s * 0.7); g.closePath();
        g.fill(); g.stroke();
        g.restore();
      }
    }

    /* ---------------- loop ---------------- */
    loop(ts) {
      requestAnimationFrame(t => this.loop(t));
      if (!this.last) this.last = ts;
      let dt = (ts - this.last) / 1000;
      this.last = ts;
      if (dt <= 0) return;
      if (dt > 0.1) dt = 0.1;
      this.fps += (1 / dt - this.fps) * 0.05;
      const w = this.world;
      const menu = this.state === 'menu';
      if (this.state === 'playing' || this.state === 'over' || menu) {
        if (w.player && this.state === 'playing') {
          const c = this.input.read(this.settings.autoGas);
          Object.assign(w.player.ctl, c);
        } else if (w.player) {
          w.player.ctl.throttle = 0; w.player.ctl.fire = false;
        }
        w.step(dt);
        if (menu && w.over) this.startDemo();
      }
      let view = w.player || null;
      if (view && view.out) view = w.standings().find(k => !k.out) || view;
      this.scene3d.update(this.world, dt, menu ? null : view, menu);
      this.scene3d.render();
      if (this.state === 'playing' || this.state === 'paused') {
        this.updateHud(dt);
        const me = w.player;
        KZ.Audio.setEngine(this.state === 'playing' && me.alive && w.countdown <= 0, me.speed, me.turbo > 0, me.drifting, !me.onGround);
      }
      if (menu && this.pr && this.prKart) {
        this.prKart.rotation.y += dt * 0.8;
        this.pr.render(this.prScene, this.prCam);
      }
      // automatic quality
      if (this.settings.quality === 'auto' && this.state === 'playing' && !this.scene3d.autoLow) {
        if (this.fps < 38) this.lowT += dt; else this.lowT = Math.max(0, this.lowT - dt);
        if (this.lowT > 4) {
          this.scene3d.autoLow = true;
          this.scene3d.setQuality();
          this.toast('⚙️ Switched to fast graphics');
        }
      }
    }
  }

  function start() {
    if (!window.THREE) {
      const b = document.getElementById('boot');
      if (b) b.textContent = 'Could not load the 3D engine (three.js from cdn.jsdelivr.net). Check your connection and reload.';
      return;
    }
    try {
      const g = new Game();
      KZ.game = g;
      g.boot();
    } catch (e) {
      console.error(e);
      const b = document.getElementById('boot');
      if (b) b.textContent = 'Kartzooka failed to start: ' + e.message;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.KZ = window.KZ || {});
