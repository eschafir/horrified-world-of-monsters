# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based multiplayer digital implementation of the board game **Horrified: World of Monsters**. Python/FastAPI authoritative game server + a single vanilla JS/HTML/CSS client talking over WebSockets. No build step, no frontend framework, no test suite.

## Running the server

```bash
pip install -r requirements.txt   # fastapi, uvicorn, websockets
python server.py
```

Then open `http://localhost:8000`. The server serves the API/WebSocket endpoints and mounts `static/` (client), `Images/`, and `Music/` directly — there is no build/bundle step. After editing `static/game.js`, `static/index.html`, or `static/style.css`, bump the `?v=NN` cache-busting query string on the corresponding `<link>`/`<script>` tag in `static/index.html`, since the server sends `no-store` cache headers but browsers/proxies can still be sticky.

There is no linter, formatter, or test suite configured in this repo — don't invent commands for them.

## Architecture

**Fully server-authoritative.** `server.py` (`GameRoom` class) owns all game state and rule enforcement; `static/game.js` is a thin render + input layer that never computes game logic locally except for cosmetic animation. Every player action (move, pick up item, advance a monster puzzle, defeat a monster, play a perk, etc.) is sent as a JSON WebSocket message and validated/applied server-side; the server then re-broadcasts the *entire* game state to all clients in the room, and the client just re-renders from that snapshot.

### Server (`server.py`)

- `RoomManager` holds one `GameRoom` per 4-letter room code and tracks the raw `WebSocket` connections per room; `broadcast_state` pushes the full `get_serializable_state()` dict to everyone in a room after (almost) every message.
- `GameRoom` is the engine: player roster, `heroes_state`, `items_on_board`, `citizens`, `monster_locations`/`monster_states`, deck/discard piles, `terror_level`, `game_phase` (`Lobby` → `HeroPhase` → `MonsterPhase` → `GameOverWin`/`GameOverLose`), and the frenzy marker.
- Static game data lives in module-level constants: `ADJACENCY_LIST` (board graph), `NODE_COORDINATES` (SVG hit-box positions, overwritten by the live coordinate calibrator — see below), `HERO_CLASSES`, `MONSTER_CARDS`, `PERK_CARDS`. `ITEMS_POOL` is the exception — it's built at import time by `_load_items_pool()` joining `assets/data/item_definitions.json` (30 unique items: name/category/artwork) with `assets/data/item_tokens.json` (60 physical tokens: which item, spawn location, strength). Each item's `category` (`Weapon`/`Arcane`/`Mundane`) is mapped to the puzzle-facing `color` (`Purple`/`Green`/`Blue` respectively, via `CATEGORY_COLOR_MAP`) that Sphinx/Jiangshi/Cthulhu's Advance requirements check against — if you edit the JSON data, keep the per-color strength distribution able to satisfy those thresholds (Purple/Weapon tops out at 6, Green/Arcane at 4, Blue/Mundane at 3 — several defeat thresholds are phrased as "discard Color N+" meaning *combined* strength of one or more discarded items of that color, not a single item, since no single item reaches some of those numbers).
- `MONSTER_CATALOG` (built at import time by `_load_monster_catalog()`, reading `src/monsters/{yeti,sphinx,jiangshi,cthulhu}.json`) is the source of truth for each monster's flavor/rules text (objective, complexity, `hasLair`, per-phase `powers`/`steps`/`notes`) — it's broadcast to the client verbatim as `monster_catalog` and rendered by `showMonsterInfoModal` in `game.js`. `MONSTER_SYMBOLS` derives each monster's current frenzy-symbol list from that catalog (Cthulhu reads phase 1's list; it has none in phase 2, so it can never be symbol-activated there). `src/monsters/Monster.js`/`MonsterManager.js` are the original ES-module design reference for this data model — this project has no bundler, so their *data* (the JSON) is what's actually loaded, not the JS classes themselves.
- Each hero action is its own `execute_*` method (`execute_move`, `execute_guide`, `execute_pickup`, `execute_share`, `execute_advance`, `execute_defeat`, `execute_special`, `execute_play_perk`) and all start with `check_turn()` to enforce turn/phase ownership before mutating state. `execute_advance`/`execute_defeat` branch heavily on `monster` name because each monster (Yeti, Jiangshi, Sphinx, Cthulhu) has a completely different mini-puzzle and defeat condition tracked in its own `monster_states[name]` shape — read the relevant branch fully before touching monster logic, don't assume symmetry between monsters. Yeti/Jiangshi each hide their key location (Cave / Moon Shrine) among 4 candidates (`cave_candidates`/`shrine_candidates`), revealed via a free 1-AP `execute_advance` action; Sphinx uses a 2x2 sum-grid (`grid`/`row_targets`/`col_targets`); Cthulhu has two phases (`monster_states["Cthulhu"]["phase"]` 1 or 2) with entirely different mechanics (rotate 3 color `dials` to open the portal, then per-hero `bind_progress` toward manacling 4 tentacles in R'lyeh).
- Each Monster Card's `monster_attack: {frenzy, symbol, steps, dice}` decides who acts in `run_monster_phase`: `frenzy=True` means whoever currently holds `self.frenzy_marker` acts; `symbol` (one of the 8 Perception Die symbols, matched against `MONSTER_SYMBOLS`) means every active monster reacting to that symbol acts too — both can apply to different monsters off the same card. This replaced an older `activations: {MonsterName: (moves, dice)}` per-card dict; the previously-commented-out second `MONSTER_CARDS` block that used to sit below the active one *was* this `monster_attack` format and has since been merged into the live list.
- Combat dice faces are `Hit`/`Hit`/`Power`/`Blank`/`Blank`/`Blank` (renamed from `Frenzy` to avoid colliding with the Monster Card's `frenzy` flag). Rolling `Power` during a monster's own attack (`perform_attack`/`perform_attack_citizen`) moves `frenzy_marker` to that monster and calls `trigger_monster_power`, which runs that specific monster's unique Power from its catalog entry (Yeti's Snow Blast, Sphinx's Lethal Conundrum, Jiangshi's Drain Vital Energy, Cthulhu's Touch of Madness/Tentacles of Insanity depending on phase).
- The monster turn (`run_monster_phase` → `resolve_event` → `activate_monster` → `perform_attack`/`perform_attack_citizen`) is async and uses `asyncio.sleep()` between steps purely so the client has time to animate each step; a `monster_phase_running` flag on the room guards against a double-draw race from the client.
- `find_shortest_path` is a small BFS used for all monster/citizen auto-movement toward the nearest hero/citizen/child target, with alphabetical tie-breaking for determinism.

### Client (`static/game.js`)

Single ~3300-line file, no modules/bundler — organized top-to-bottom in the commented sections you'll see via the `// ----` banners: state vars → element selectors → event wiring → WebSocket handling → lobby rendering → player/hero panels → monster-phase card UI → audio (procedurally synthesized ambient music/SFX via Web Audio API, no audio files for effects) → map/board animations → SVG map rendering → info modals → action button handlers → zoom/pan controls.

- `gameState` is the single source of truth, replaced wholesale on every `{"type": "state", ...}` WebSocket message; `updateGameUI()` re-renders everything from it. Do not accumulate client-side game state outside of transient UI/animation bookkeeping (e.g. `selectedItemsForAction`, `destinationNodeSelection`).
- `renderSVGMap()` rebuilds the interactive SVG (nodes, banners, characters, items, monster markers) from `gameState.node_coordinates` / `adjacency_list`/board state every render; the various `animate*` functions (`animateItemFly`, `animateCardFly`, `animateLairSpawn`, `animatePerkCardDraw`, `animateRemoteItemPickup`, etc.) are purely cosmetic diff-detection against the previous snapshot and never mutate `gameState`.
- Action buttons (`action-move`, `action-guide`, `action-pickup`, ... in `static/index.html`) each open a selection flow (clicking map nodes/items/etc.) that ends by calling `sendMsg({action: ..., ...})` over the socket — the server is the only place these are actually validated.
- A separate `item_pickup` WebSocket event (outside the main state broadcast) drives `animateRemoteItemPickup` so other players see a pickup animation without waiting for/inferring it from a state diff.

### Live layout calibration

`static/new_coordinates.json` (loaded to override `NODE_COORDINATES`) can be edited live: press `D` in the client to toggle debug mode, drag/scroll hitboxes on the map, and the client sends `update_coordinates` over the socket, which `GameRoom.update_coordinates` applies in-memory and persists to `static/new_coordinates.json`. If you change the map background image or node layout, use this flow rather than hand-editing coordinates.

## Adding a new hero/monster/perk

- Heroes: add an entry to `HERO_CLASSES` in `server.py` (name, `ap`, `start` location, `ability` text) and to `HEROES_LIST` in `game.js`; special-ability behavior goes in `execute_special` in `server.py` as a new `elif hero_class == "..."` branch.
- Monsters: adding a fifth monster means adding a `src/monsters/<name>.json` catalog entry (objective/complexity/hasLair/frenzySymbols/powers/steps/notes — read by `_load_monster_catalog()`), its starting location logic, a `monster_states[name]` shape, and branches in `execute_advance`/`execute_defeat`/`activate_monster`/`trigger_monster_power` in `server.py`, plus a monster-select card in `static/index.html` and rendering support in `renderMonstersStatusPanel`/`renderSVGMap` in `game.js`.
- Perks: add to `PERK_CARDS` and a branch in `execute_play_perk`.
- Locations: `ADJACENCY_LIST` and `NODE_COORDINATES` must be updated together (use the debug-mode calibrator for coordinates rather than guessing pixel values).
