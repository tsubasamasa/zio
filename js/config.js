/* Kartzooka.io — tuning, weapons, modes, AI, garage catalog */
(function (KZ) {
  'use strict';

  KZ.CFG = {
    KART_R: 1.5,
    MAX_SPEED: 24,
    ACCEL: 22,
    BRAKE: 40,
    REV_MAX: 10,
    REV_ACCEL: 16,
    DRAG: 5,
    TURN: 2.55,
    GRIP: 9,
    DRIFT_GRIP: 2.4,
    DRIFT_TURN: 1.45,
    GRAVITY: 32,
    STEP: 0.75,
    HP: 100,
    RESPAWN: 2.6,
    SPAWN_SHIELD: 2.2,
    BOX_RESPAWN: 5,
    MATCH_TIME: 180
  };

  // Every weapon is cartoon-style: hits make karts pop and respawn
  KZ.WEAPONS = {
    rocket: { name: 'Rocket', icon: '🚀', ammo: 1, cd: 0.3, color: 0xff5a36, weight: 14, desc: 'Flies straight. One direct hit knocks a kart out.' },
    triple: { name: 'Triple Rocket', icon: '🎆', ammo: 3, cd: 0.32, color: 0xff8a2a, weight: 9, desc: 'Three rockets in a row.' },
    homing: { name: 'Homing Missile', icon: '🎯', ammo: 1, cd: 0.3, color: 0xff3d7a, weight: 9, desc: 'Locks on to the nearest rival in front.' },
    mega: { name: 'Mega Rocket', icon: '☄️', ammo: 1, cd: 0.3, color: 0xb04dff, weight: 5, desc: 'Slow, huge rocket with a giant blast.' },
    minigun: { name: 'Machine Gun', icon: '🔫', ammo: 36, cd: 0.075, color: 0xffd23a, weight: 11, desc: 'Hold fire for a stream of bullets.' },
    freeze: { name: 'Freeze Ray', icon: '❄️', ammo: 2, cd: 0.45, color: 0x7fe3ff, weight: 8, desc: 'Ice blast that freezes a rival in place.' },
    punch: { name: 'Boxing Glove', icon: '🥊', ammo: 2, cd: 0.5, color: 0xff3d3d, weight: 8, desc: 'Spring-loaded punch. Sends close rivals flying.' },
    mine: { name: 'Mines', icon: '🔴', ammo: 3, cd: 0.4, color: 0xe8313a, weight: 9, desc: 'Drops behind you. Three per box.' },
    oil: { name: 'Oil Slick', icon: '🛢️', ammo: 2, cd: 0.4, color: 0x34284a, weight: 7, desc: 'Leaves a slick puddle that spins karts out.' },
    bomb: { name: 'Time Bomb', icon: '💣', ammo: 1, cd: 0.3, color: 0x2b2b3a, weight: 8, desc: 'Lobbed ahead, explodes after a short fuse.' },
    lightning: { name: 'Lightning', icon: '⚡', ammo: 1, cd: 0.3, color: 0x7fd8ff, weight: 7, desc: 'Zaps the closest rival in front and makes them spin.' },
    shield: { name: 'Shield', icon: '🛡️', ammo: 1, cd: 0.3, color: 0x55d0ff, weight: 8, desc: 'Blocks all damage for 5 seconds.' },
    turbo: { name: 'Turbo', icon: '🔥', ammo: 1, cd: 0.3, color: 0xffa020, weight: 7, desc: 'A big burst of speed.' }
  };

  KZ.MODES = {
    ffa: { id: 'ffa', name: 'Deathmatch', icon: '💥', desc: 'Everyone for themselves. Most knockouts in 3 minutes wins.', time: 180, teams: false },
    team: { id: 'team', name: 'Team Battle', icon: '🤝', desc: 'Red vs Blue. Team knockouts add up. No friendly fire.', time: 180, teams: true },
    survival: { id: 'survival', name: 'Last Kart Standing', icon: '🏆', desc: 'Three lives each. Lose them all and you are out. Be the last one driving.', time: 300, teams: false, lives: 3 },
    koth: { id: 'koth', name: 'King of the Hill', icon: '👑', desc: 'Hold the glowing zone alone to score. The hill moves every 35 seconds.', time: 180, teams: false },
    coins: { id: 'coins', name: 'Coin Rush', icon: '🪙', desc: 'Grab coins. Knock out rivals to make them drop half of theirs.', time: 180, teams: false }
  };
  KZ.MODE_ORDER = ['ffa', 'team', 'survival', 'koth', 'coins'];

  KZ.LEVELS = {
    beginner: { name: 'Beginner', reaction: 0.5, aimTol: 0.28, lead: 0.1, evade: 0.1, smart: 0.25, speed: 0.86, jitter: 0.3, drift: false, avoidMines: false, pads: 0.2 },
    intermediate: { name: 'Intermediate', reaction: 0.28, aimTol: 0.15, lead: 0.6, evade: 0.5, smart: 0.6, speed: 0.95, jitter: 0.1, drift: true, avoidMines: true, pads: 0.6 },
    advanced: { name: 'Advanced', reaction: 0.13, aimTol: 0.07, lead: 1, evade: 0.92, smart: 0.95, speed: 1, jitter: 0.03, drift: true, avoidMines: true, pads: 1 }
  };

  // AI personalities add variety on top of the skill level
  KZ.PERSONALITIES = {
    brawler: { name: 'Brawler', chase: 1.3, keepDist: 6, boxes: 0.9, leader: 0.2, mineLove: 0.5 },
    hunter: { name: 'Hunter', chase: 1.1, keepDist: 18, boxes: 1, leader: 1, mineLove: 0.6 },
    collector: { name: 'Collector', chase: 0.7, keepDist: 22, boxes: 1.4, leader: 0.3, mineLove: 0.8 },
    trickster: { name: 'Trickster', chase: 0.9, keepDist: 14, boxes: 1.1, leader: 0.5, mineLove: 1.5 }
  };

  KZ.KART_COLORS = [0xff3b3b, 0x2e86ff, 0x2fd84f, 0xffc61a, 0xa64dff, 0xff7a12, 0x14d8cf, 0xff4fae, 0xf7f7f7, 0x2a2c38];
  KZ.TEAM_COLORS = [0xff3b3b, 0x2e86ff];
  KZ.TEAM_NAMES = ['Red', 'Blue'];

  KZ.BOT_NAMES = ['Turbo', 'Zippy', 'Nitro', 'Blaze', 'Rocket Rae', 'Max Speed', 'Drift King', 'Bolt', 'Skidmark', 'Vroom', 'Pixel',
    'Comet', 'Lucky', 'Bumper', 'Sparky', 'Dash', 'Ace', 'Flash', 'Gizmo', 'Chomp', 'Nova', 'Tank', 'Jet', 'Rusty', 'Ziggy',
    'Mango', 'Kiwi', 'Popcorn', 'Noodle', 'Biscuit', 'Waffles', 'Pickles'];

  /* ---------- economy ---------- */
  KZ.ECON = { perKO: 10, perCoin: 2, win: 40, top3: 20, play: 8, streak3: 15 };

  /* ---------- garage catalog ----------
     unlock: { coins } (buy in shop) or { stat, n } (earn by playing) */
  KZ.GARAGE = {
    character: [
      { id: 'kid', name: 'Kid Racer', unlock: null },
      { id: 'fox', name: 'Foxy', unlock: { coins: 150 } },
      { id: 'bear', name: 'Bruno Bear', unlock: { coins: 200 } },
      { id: 'cat', name: 'Kitty Kat', unlock: { stat: 'kills', n: 15 } },
      { id: 'robot', name: 'Robo-7', unlock: { coins: 350 } },
      { id: 'frog', name: 'Hopper', unlock: { stat: 'matches', n: 10 } },
      { id: 'alien', name: 'Zorp', unlock: { coins: 500 } },
      { id: 'penguin', name: 'Pengo', unlock: { stat: 'wins', n: 5 } },
      { id: 'panda', name: 'Bamboo', unlock: { coins: 650 } }
    ],
    kart: [
      { id: 'classic', name: 'Classic', unlock: null },
      { id: 'speedster', name: 'Speedster', unlock: { coins: 250 } },
      { id: 'monster', name: 'Monster', unlock: { stat: 'kills', n: 40 } },
      { id: 'buggy', name: 'Dune Buggy', unlock: { coins: 400 } },
      { id: 'rocketcar', name: 'Rocket Car', unlock: { stat: 'wins', n: 10 } }
    ],
    hat: [
      { id: 'helmet', name: 'Helmet', unlock: null },
      { id: 'cap', name: 'Cap', unlock: null },
      { id: 'tophat', name: 'Top Hat', unlock: { coins: 100 } },
      { id: 'horns', name: 'Viking', unlock: { stat: 'kills', n: 25 } },
      { id: 'crown', name: 'Crown', unlock: { stat: 'wins', n: 3 } },
      { id: 'party', name: 'Party Hat', unlock: { coins: 120 } },
      { id: 'cowboy', name: 'Cowboy', unlock: { coins: 220 } },
      { id: 'halo', name: 'Halo', unlock: { stat: 'bestStreak', n: 5 } },
      { id: 'propeller', name: 'Propeller', unlock: { coins: 300 } }
    ],
    paint: [
      { id: 'gloss', name: 'Gloss', unlock: null },
      { id: 'matte', name: 'Matte', unlock: null },
      { id: 'metal', name: 'Metallic', unlock: { coins: 180 } },
      { id: 'neon', name: 'Neon Glow', unlock: { coins: 350 } },
      { id: 'gold', name: 'Solid Gold', unlock: { stat: 'wins', n: 15 } },
      { id: 'candy', name: 'Candy Stripe', unlock: { coins: 450 } }
    ],
    trail: [
      { id: 'none', name: 'No Trail', unlock: null },
      { id: 'fire', name: 'Fire', unlock: { coins: 150 } },
      { id: 'rainbow', name: 'Rainbow', unlock: { coins: 400 } },
      { id: 'stars', name: 'Stardust', unlock: { stat: 'kills', n: 60 } },
      { id: 'hearts', name: 'Hearts', unlock: { coins: 250 } },
      { id: 'bubbles', name: 'Bubbles', unlock: { stat: 'matches', n: 25 } }
    ]
  };
  KZ.GARAGE_TABS = [['character', 'Driver'], ['kart', 'Kart'], ['hat', 'Hat'], ['paint', 'Paint'], ['trail', 'Trail']];
  KZ.STAT_LABEL = { kills: 'Knock out {n} rivals', wins: 'Win {n} matches', matches: 'Play {n} matches', bestStreak: 'Get a {n}-KO streak' };

  KZ.TRAILS = {
    none: null,
    fire: [0xffd040, 0xff7a1a, 0xff3d1a],
    rainbow: [0xff3b3b, 0xff9a1a, 0xffe03a, 0x3ddc5a, 0x2e9bff, 0xa64dff],
    stars: [0xffffff, 0xfff3a0, 0xbfe9ff],
    hearts: [0xff4fae, 0xff7ac8, 0xffb3d9],
    bubbles: [0x9fe6ff, 0xd8f6ff, 0x6fd0ff]
  };
})(window.KZ = window.KZ || {});
