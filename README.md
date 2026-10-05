# Kartzooka.io

Cartoon kart battles in the browser. Grab the glowing **?** boxes, fire rockets, drop mines, zap rivals with lightning and be the last kart driving. It plays fully offline against AI drivers.

- **No install, no server.** Open `index.html` (double-click works) or host the folder anywhere, for example GitHub Pages.
- **Only one external host:** `cdn.jsdelivr.net`, which serves the 3D engine (three.js r159), the optional Baloo 2 font and the game's own CSS/JS from the `tsubasamasa/zio` repository (`https://cdn.jsdelivr.net/gh/tsubasamasa/zio@main/`). Keep `css/` and `js/` at the root of that repository so the links in `index.html` resolve.
- **English only. Desktop and mobile.**

## Modes
| Mode | Goal |
| --- | --- |
| Deathmatch | Most knockouts in 3 minutes |
| Team Battle | Red vs Blue, team knockouts add up, no friendly fire |
| Last Kart Standing | 3 lives each, last kart driving wins |
| King of the Hill | Hold the glowing zone alone to score; it moves every 35 s |
| Coin Rush | Collect coins; knocked-out karts drop half of theirs |

Each match has 1–8 AI rivals at **Beginner**, **Intermediate**, **Advanced** or **Mixed** skill.

## Arenas
Sunny Park, Dusty Canyon, Frosty Fort (slippery ice), Candy Kingdom and Lava Isle. Lava pools burn karts that drive through them.
Every arena has ramps, raised decks, **boost pads** and **jump pads**, plus its own ambient effects: leaves, dust, snow, sparkles or embers.

## Weapons (13)
Rocket, Triple Rocket, Homing Missile, Mega Rocket, Machine Gun, Freeze Ray, Boxing Glove, Mines, Oil Slick, Time Bomb, Lightning, Shield and Turbo.
Holding drift through a turn charges a mini speed boost.

## Garage & shop
- Every match earns coins: knockouts, wins, top-3 finishes, KO streaks and coins collected in Coin Rush.
- Spend coins in the garage, or unlock items by playing. For example, "Knock out 25 rivals" unlocks the Viking hat.
- 9 drivers: Kid, Fox, Bear, Cat, Robot, Frog, Alien, Penguin, Panda.
- 5 karts: Classic, Speedster, Monster, Dune Buggy, Rocket Car.
- 9 hats, 6 paints (Gloss, Matte, Metallic, Neon, Gold, Candy) and 6 boost trails.
- Progress and coins are saved in the browser (localStorage).

## Controls
| Input | Action |
| --- | --- |
| W / ↑, S / ↓ | Gas, brake/reverse |
| A D / ← → | Steer |
| Space | Fire / use item |
| Shift | Drift |
| Esc / M | Pause / mute |
| Touch | Drag on the left half to steer (auto-gas on), FIRE and DRIFT buttons on the right |
| Gamepad | Left stick, RT/LT, A fire, B drift |

## AI
Skill levels:
- **Beginner:** slow reactions, loose aim.
- **Intermediate:** leads its shots and dodges some rockets.
- **Advanced:** drifts, dodges incoming rockets, raises its shield at the right moment, lays mines and oil in your path, uses boost pads and steers around hazards.

Each bot also gets a personality and small random quirks, so no two drive the same:
- **Brawler** gets up close.
- **Hunter** goes after the leader.
- **Collector** grabs boxes and coins.
- **Trickster** loves traps.

Ranged weapons make bots keep their distance instead of ramming. All bots find their way around ramps, obstacles and lava with an A* navigation grid.

## Audio
All audio is synthesized in the browser, with no audio files to download. It includes:
- an engine with simulated gear shifts
- tire screech while drifting
- wind at speed
- an effect for every weapon and pickup
- an upbeat chiptune music loop, which you can switch off or turn down in Settings

## Files
```
index.html          menu, HUD, overlays
css/style.css       cartoon UI theme, responsive + touch layout
js/util.js          helpers
js/config.js        physics tuning, weapons, modes, AI levels
js/map.js           arenas, ramps/decks height field, collisions, A* navigation
js/world.js         simulation: karts, weapons, pickups, modes (no rendering)
js/ai.js            AI drivers
js/platform.js      storage, synthesized audio, keyboard/touch/gamepad input
js/models.js        smooth procedural 3D models
js/effects.js       explosions, smoke, sparks, lightning
js/render.js        three.js scene and chase camera
js/main.js          game controller and HUD
tests/              headless simulation test + browser smoke test
```

## Tests
```bash
node tests/sim.test.js
THREE_PATH=/path/to/three.min.js NODE_PATH=$(npm root -g) node tests/browser.test.js
```
