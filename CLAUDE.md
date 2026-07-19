# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based multiplayer digital implementation of the board game **Horrified: World of Monsters**. Python/FastAPI authoritative game server + a single vanilla JS/HTML/CSS client talking over WebSockets. No build step, no frontend framework, no test suite.

## Running the server

```bash
pip install -r requirements.txt   # fastapi, uvicorn, websockets
python server.py
```

Then open `http://localhost:8000`. The server serves the API/WebSocket endpoints and mounts `static/` (client), `Images/`, `Music/`, and `assets/` directly — there is no build/bundle step. After editing any `static/js/*.js` file, `static/index.html`, or `static/style.css`, bump that file's own `?v=NN` cache-busting query string on its `<link>`/`<script>` tag in `static/index.html`, since the server sends `no-store` cache headers but browsers/proxies can still be sticky. Each `static/js/*.js` file has its own independent `?v=NN` — only bump the one(s) you actually changed.

There is no linter, formatter, or test suite configured in this repo — don't invent commands for them.

## Architecture

**Fully server-authoritative.** `src/game/` (the `GameRoom` class, assembled from mixins) owns all game state and rule enforcement; `static/js/*.js` is a thin render + input layer that never computes game logic locally except for cosmetic animation. Every player action (move, pick up item, advance a monster puzzle, defeat a monster, play a perk, etc.) is sent as a JSON WebSocket message and validated/applied server-side; the server then re-broadcasts the *entire* game state to all clients in the room, and the client just re-renders from that snapshot.

`server.py` is a ~10-line entrypoint: it imports the assembled FastAPI `app` from `src/app.py` and calls `uvicorn.run`. All actual code lives under `src/` (Python) and `data/` (JSON game data) — see below.

### Data (`data/`)

Every hardcoded game constant lives in JSON here instead of Python literals, loaded once at import time by `src/data_loader.py`:

- `data/heroes.json` — `HERO_CLASSES` (13 heroes: ap/start/ability per map).
- `data/monster_cards.json` — the 30 Monster Deck cards. Each has `event_type` (resolved in `src/game/monster_phase.py`'s `resolve_event`) and `monster_attack: {frenzy, symbol, steps, dice}`. **Only a subset of `event_type`s are actually implemented** (`yeti_cry`, `sphinx_gaze`, the `spawn_*` citizen events, `void_eruption`) — the rest (`vital_energy`, `awaiting_the_hunt`, `descent_into_madness`, `destruction`, `celestial_empowerment`, `gyrocopter_search`, `nowhere_to_hide`, `deja_vu`, `aquatic_convergence`, `whiteout`, `folie_a_deux`, `provisions`) silently no-op; see the comment at the top of `resolve_event`.
- `data/perk_cards.json` — `PERK_CARDS` (6 perks).
- `data/item_colors.json` — `CATEGORY_COLOR_MAP` (Weapon→Purple, Arcane→Green, Mundane→Blue), the puzzle-facing color Sphinx/Jiangshi/Cthulhu's Advance requirements check against.
- `data/frenzy_order.json` — `FRENZY_ORDER` (Yeti < Sphinx < Jiangshi < Cthulhu), used to seed `active_monsters` and hand off the Frenzy marker.
- `data/greek_location_map.json` — the Greek-map location alias table used by `get_safe_loc` (`src/game/board.py`) when the Greek map is active.
- `data/board/default_board.json` — fallback `{nodes, terror, adjacency}` seed (same shape as the per-map files below), used only if a per-map coordinates file doesn't exist yet.
- `data/board/coordinates_Map.png.json` / `data/board/coordinates_map-greek.png.json` — the **live**, calibratable per-map `{nodes, terror, adjacency}` data (SVG hit-box positions, terror-track slot positions, board graph), read/written by `load_map_coordinates`/`save_map_coordinates` in `src/data_loader.py`.
- `data/items/item_definitions.json` (30 unique items: name/category/artwork) + `data/items/item_tokens.json` (60 physical tokens: which item, spawn location, strength) — joined by `_load_items_pool()` into `ITEMS_POOL`. If you edit this data, keep the per-color strength distribution able to satisfy monster Advance/Defeat thresholds (Purple/Weapon tops out at 6, Green/Arcane at 4, Blue/Mundane at 3 — several thresholds are phrased as "discard Color N+" meaning *combined* strength of one or more discarded items of that color, since no single item reaches some of those numbers). Item artwork files themselves live in `assets/items/*.png` (served at `/assets/items/...`) and are unaffected by where the JSON lives.
- `data/monsters/{yeti,sphinx,jiangshi,cthulhu}.json` — each monster's flavor/rules text (objective, complexity, `hasLair`, per-phase `powers`/`steps`/`notes`), loaded by `_load_monster_catalog()` into `MONSTER_CATALOG` and broadcast to the client verbatim as `monster_catalog` (rendered by `showMonsterInfoModal` in `static/js/modals.js`). `_get_monster_symbols`/`MONSTER_SYMBOLS` derives each monster's current frenzy-symbol list from this catalog (Cthulhu reads phase 1's list; it has none in phase 2, so it can never be symbol-activated there).

`archive/` holds confirmed-dead files kept for reference rather than deleted: `archive/monsters_js_reference/{Monster,MonsterManager}.js` (an old ES-module design reference for the monster data model — nothing imports them; the JSON in `data/monsters/` is what's actually loaded) and `archive/stale_coordinates/{new_coordinates,terror_track_coordinates}.json` (superseded by `data/board/coordinates_{map}.json`, not read by any code path).

### Server (`src/`)

- `src/app.py` — the FastAPI app: no-cache middleware, the `/api/map` REST endpoints (used by `static/editor.html`'s calibration tool), and the single `/ws/{room_code}/{player_name}` WebSocket route that dispatches every player action onto the room's `GameRoom`.
- `src/room_manager.py` — `RoomManager`: one `GameRoom` per 4-letter room code, tracks the raw `WebSocket` connections per room, and `broadcast_state`/`send_event` push data to everyone in a room.
- `src/data_loader.py` — all data-loading/fallback logic described above, plus `load_map_coordinates`/`save_map_coordinates`.
- `src/pathfinding.py` — `find_shortest_path`/`get_best_monster_move`, the shared BFS used for monster/citizen auto-movement toward the nearest hero/citizen/child target (alphabetical tie-breaking for determinism).
- `src/game/` — `GameRoom`, assembled in `src/game/__init__.py` from mixins split **by concern**, not by monster (see below for why):
  - `lifecycle.py` — `__init__`, `initialize_game` (the big "start game" setup: decks/bag, hero placement, citizens, lair tokens, each active monster's bespoke `monster_states[monster]` shape), and the logging/toast helpers (`add_log`, `add_power_event`, `add_citizen_event`).
  - `board.py` — item/location utilities (`spawn_item`, `get_safe_loc`, `_bfs_distances`, ...), `get_serializable_state` (the full state payload sent to clients), and coordinate persistence (`update_coordinates`).
  - `hero_actions.py` — `execute_move`, `execute_guide`, `execute_pickup`, `execute_share`, all gated by `check_turn`.
  - `monster_puzzles.py` — `execute_advance`/`execute_defeat`, each with one `if/elif` branch per monster (Yeti/Jiangshi/Sphinx/Cthulhu) because every monster's mini-puzzle and defeat condition has a completely different shape — read the relevant branch fully before touching monster logic, don't assume symmetry between monsters. Yeti/Jiangshi each hide their key location (Cave / Moon Shrine) among 4 shared candidate locations (`lair_tokens`), revealed via a free 1-AP `execute_advance` action; Sphinx uses a 2x3 sum-grid; Cthulhu has two phases (`monster_states["Cthulhu"]["phase"]` 1 or 2) with entirely different mechanics (rotate 3 color `dials` to open the portal, then per-hero `bind_progress` toward manacling 4 tentacles in R'lyeh).
  - `special_abilities.py` — `execute_special` (per-hero-class branches) and `execute_play_perk` (per-perk-name branches) — an orthogonal axis to monster logic.
  - `monster_phase.py` — `end_turn`, `run_monster_phase` (draws a card, resolves its event, then activates the Frenzy-marker holder and every symbol-matched monster), `resolve_event`, `activate_monster` (movement-and-target-acquisition loop, with Yeti/Cthulhu-specific branches inlined amid otherwise-generic logic).
  - `combat.py` — `perform_attack`/`perform_attack_citizen` (dice roll → block-choice → hit resolution), `trigger_monster_power` (each monster's unique Power: Yeti's Snow Blast, Sphinx's Lethal Conundrum, Jiangshi's Drain Vital Energy, Cthulhu's Touch of Madness/Tentacles of Insanity), and `request_block_choice`/`_apply_direct_hit`/`_defeat_citizen`.
  - `frenzy.py` — `_reassign_frenzy_if_needed`, `check_victory`, `check_defeat`.

  **Why split by concern instead of by monster:** there's no per-monster class/strategy object — each monster's state shape is threaded through generic dispatcher methods (`execute_advance`, `execute_defeat`, `activate_monster`, `_apply_direct_hit`) that also contain shared/generic logic. Cthulhu especially leaks into methods outside its own puzzle logic: `execute_move` blocks normal movement while a hero is on its Corpse-City track, `activate_monster`'s movement loop has a Cthulhu-phase-2 branch inlined, and `_apply_direct_hit` resets Cthulhu's `player_tracks` on any hero defeat regardless of which monster attacked. Splitting by monster would require introducing real per-monster strategy objects — a deeper behavioral refactor, not just a file reorganization.

  Each `execute_*` method starts with `check_turn()` to enforce turn/phase ownership before mutating state. Nearly every async monster-phase method threads an optional `broadcast_fn` callback down from `src/app.py`'s websocket handler — keep that parameter consistent if you touch these methods.

- Combat dice faces are `Hit`/`Hit`/`Hit`/`Blank`/`Blank`/`Power`. Rolling `Power` during a monster's own attack moves `frenzy_marker` to that monster and calls `trigger_monster_power`.
- The monster turn (`run_monster_phase` → `resolve_event` → `activate_monster` → `perform_attack`/`perform_attack_citizen`) is async and uses `asyncio.sleep()` between steps purely so the client has time to animate each step; a `monster_phase_running` flag on the room (set in `src/app.py`) guards against a double-draw race from the client.

### Client (`static/js/*.js`)

Split from a single ~4800-line file into one file per concern, loaded via ordered `<script>` tags in `static/index.html` (classic scripts, no bundler, no `type="module"` — dozens of `onclick="..."` strings baked into server-rendered/innerHTML markup call these functions as bare globals, and switching to modules would require exporting every one of them explicitly). All files share one global scope, same as the original single file — the only real ordering constraints are: `state.js` first (other files' top-level `addEventListener` wiring reads its element selectors immediately) and `audio.js` before `websocket.js` (a volume-slider listener references `updateMusicVolume` by name at top level). Everything else resolves lazily at call time since cross-file function calls always happen inside event handlers/callbacks, never at top-level script-execution time.

- `state.js` — `gameState` (the single source of truth, replaced wholesale on every `{"type": "state", ...}` WebSocket message) plus every other top-level state variable, and all `document.getElementById`/`querySelector` element selectors.
- `audio.js` — all sound: the synthesized ambient background music/drone (Web Audio API, no audio files), plus every one-shot SFX player (`playItemPickupSound`, `playDrawCardSound`, `playGameLostSound`, `playGameWonSound`, `playMonsterDefeatSound`, `playTerrorIncreaseSound`, `playSynthPerkSound`).
- `websocket.js` — `setupConnection`, `sendMsg`, `sendChatMessage`, `returnToMainMenu`, and the lobby/chat/tab init event wiring.
- `lobby.js` — `renderHeroSelectOptions` (hero-pick cards) + `HERO_LORE`.
- `modals.js` — every info/lore modal: `showHeroCardModal`, `showMonsterInfoModal`, `showLairImageModal`, `showNodeInfo`, `showCitizenInfo`.
- `ui-sync.js` — `updateGameUI`, the orchestrator called from the WebSocket handler on every state broadcast; re-renders the whole HUD and delegates to the render functions in `sidebar.js`/`map-render.js`. Also owns the dice-roll/block-choice modal flow (`showDamageSelection`).
- `sidebar.js` — the hero/monster side-panel renderers (`renderPlayerPanel`, `renderMonsterPhasePanel`, `renderMonstersStatusPanel`, `renderApCounterBar`, `renderLogs`), the generic `openItemPicker` multi-select modal, and item-color/tooltip helpers.
- `notifications.js` — the diff-detection/toast subsystem: compares the new `gameState` against the previous snapshot and fires each one-shot toast/animation exactly once (monster defeats, Power events, citizen spawns, perk draws, item/lair spawns).
- `map-render.js` — `renderSVGMap` (rebuilds the entire interactive SVG board every render: nodes, banners, characters, items, monster markers, terror track) and its animation helpers (`animateItemFly`, `animateLairSpawn`, `createNeonRing`, ...), plus the Guide-target helpers `getEligibleGuideLegends`/`getGuideValidTargets`.
- `actions.js` — every `action-*` button click handler (move/guide/pickup/share/advance/defeat/special/end-turn), the monster-puzzle click handlers (`placeYetiChild`, `advanceSphinx`, `advanceCthulhuDial`, ...), and the debug-hitbox drag-calibration handlers (see below).
- `zoom-pan.js` — map zoom/pan controls and the `DOMContentLoaded` bootstrap (must load last, mirroring the original end-of-file behavior).

`gameState` is the single source of truth, replaced wholesale on every state message; `updateGameUI()` re-renders everything from it. Do not accumulate client-side game state outside of transient UI/animation bookkeeping (e.g. `selectedItemsForAction`, `destinationNodeSelection`). The various `animate*` functions are purely cosmetic diff-detection against the previous snapshot and never mutate `gameState`. A separate `item_pickup` WebSocket event (outside the main state broadcast) drives `animateRemoteItemPickup` so other players see a pickup animation without waiting for/inferring it from a state diff.

### Live layout calibration

`data/board/coordinates_{map}.json` (loaded via `load_map_coordinates` to override the `data/board/default_board.json` fallback) can be edited live: press `D` in the client to toggle debug mode, drag/scroll hitboxes on the map, and the client sends `update_coordinates` over the socket, which `GameRoom.update_coordinates` (`src/game/board.py`) applies in-memory and persists via `save_map_coordinates`. `static/editor.html`/`editor.js` is a separate, standalone calibration page hitting the `/api/map` REST endpoints (same underlying files, different UI) — if you change the map background image or node layout, use one of these flows rather than hand-editing coordinates.

## Adding a new hero/monster/perk

- Heroes: add an entry to `data/heroes.json` and to `HEROES_LIST` in `static/js/state.js`; special-ability behavior goes in `execute_special` (`src/game/special_abilities.py`) as a new `elif hero_class == "..."` branch.
- Monsters: adding a fifth monster means adding a `data/monsters/<name>.json` catalog entry (objective/complexity/hasLair/frenzySymbols/powers/steps/notes — read by `_load_monster_catalog()` in `src/data_loader.py`), its starting location logic and a `monster_states[name]` shape in `src/game/lifecycle.py`, branches in `execute_advance`/`execute_defeat` (`src/game/monster_puzzles.py`), `activate_monster` (`src/game/monster_phase.py`), and `trigger_monster_power` (`src/game/combat.py`), plus a monster-select card in `static/index.html` and rendering support in `renderMonstersStatusPanel`/`renderSVGMap` (`static/js/sidebar.js`/`static/js/map-render.js`).
- Perks: add to `data/perk_cards.json` and a branch in `execute_play_perk` (`src/game/special_abilities.py`).
- Locations: the `adjacency`/`nodes` keys in `data/board/coordinates_{map}.json` (or `data/board/default_board.json` for the fallback) must be updated together (use the debug-mode calibrator or `static/editor.html` for coordinates rather than guessing pixel values).
