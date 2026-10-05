/* Headless simulation test: node tests/sim.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global;
for (const f of ['util', 'config', 'map', 'world', 'ai']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f });
const KZ = global.KZ;
let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.error('  FAIL ' + m); } };

for (const map of KZ.MAP_ORDER) {
  const a = new KZ.Arena(KZ.MAPS[map]);
  check(a.spawns.length >= 9, map + ': spawns ' + a.spawns.length);
  for (const p of a.pickups) check(!a.solidAt(p.x, p.z, a.heightAt(p.x, p.z), 1), map + ': pickup inside solid ' + p.x + ',' + p.z);
  const deck = a.decks[0];
  const pth = a.findPath(a.spawns[0].x, a.spawns[0].z, deck.x, deck.z);
  check(pth && pth.length, map + ': no path to deck');
}

for (const mode of KZ.MODE_ORDER) for (const level of ['beginner', 'intermediate', 'advanced']) {
  const map = KZ.MAP_ORDER[(KZ.MODE_ORDER.indexOf(mode) + level.length) % KZ.MAP_ORDER.length];
  const w = new KZ.World({ mode, map, bots: 8, level, player: null, countdown: 0 });
  const stats = { fire: 0, kill: 0, pickup: 0, explosion: 0, coin: 0 };
  for (const e in stats) w.on(e, () => stats[e]++);
  const t0 = Date.now();
  let t = 0;
  while (t < 120 && !w.over) { w.step(1 / 60); t += 1 / 60; }
  for (const k of w.karts) {
    check(Number.isFinite(k.x) && Number.isFinite(k.z) && Number.isFinite(k.y), 'NaN kart');
    check(Math.abs(k.x) <= w.arena.half + 1 && Math.abs(k.z) <= w.arena.half + 1, 'kart outside arena ' + k.x.toFixed(1) + ',' + k.z.toFixed(1));
  }
  const ms = Date.now() - t0;
  const top = w.standings().slice(0, 3).map(k => k.name + ':' + Math.floor(k.score)).join(' ');
  console.log(`${mode.padEnd(8)} ${level.padEnd(12)} ${map.padEnd(7)} ${t.toFixed(0)}s ${ms}ms  fire=${stats.fire} pickups=${stats.pickup} boom=${stats.explosion} kills=${stats.kill} coins=${stats.coin} | ${top}${w.over ? ' | OVER' : ''}`);
  check(stats.pickup > 10, mode + '/' + level + ': bots should collect boxes');
  check(stats.kill > (level === 'beginner' ? 1 : 4), mode + '/' + level + ': bots should knock each other out');
}
console.log(fails ? fails + ' FAILURES' : 'All checks passed');
process.exit(fails ? 1 : 0);
