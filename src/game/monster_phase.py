"""Monster phase orchestration: turn handoff, card draw/event resolution, and the
Frenzy-holder + symbol-matched monster activation loop."""
import asyncio
import random
import traceback
from typing import Dict, List, Optional, Set

from src.data_loader import MONSTER_COLORS, MONSTER_SYMBOLS
from src.pathfinding import find_shortest_path, get_best_monster_move


class MonsterPhaseMixin:
    def end_turn(self, player_name: str):
        if self.game_phase != "HeroPhase":
            return
        active_player = self.players[self.turn_player_idx]["name"]
        if player_name != active_player:
            return

        self.game_phase = "MonsterPhase"
        self.add_log(f"{player_name} ended their turn. Monster Phase begins!")
        self.heroes_state[player_name]["ability_used"] = False

        # If the deck is empty, they lose immediately at the start of the Monster Phase
        if not self.deck:
            self.check_defeat("Monster deck is empty!")
            return

        # Monster phase is now triggered by the player drawing the card manually

    async def run_monster_phase(self, broadcast_fn=None):
        self.monster_phase_running = True
        try:
            if self.skip_monster_phase:
                self.skip_monster_phase = False
                self.add_log("--- MONSTER PHASE SKIPPED (Lunar Oscillator) ---")
                self.turn_player_idx = (self.turn_player_idx + 1) % len(self.players)
                next_player = self.players[self.turn_player_idx]["name"]
                max_ap = self.heroes_state[next_player]["max_ap"]
                self.heroes_state[next_player]["ap"] = max_ap
                self.game_phase = "HeroPhase"
                self.add_log(f"It is now {next_player}'s turn! ({max_ap} AP)")
                if broadcast_fn:
                    await broadcast_fn()
                return

            self.add_log("--- MONSTER PHASE ---")

            if not self.deck:
                self.check_defeat("Monster deck is empty!")
                if broadcast_fn:
                    await broadcast_fn()
                return

            card = self.deck.pop()
            self.current_card = card
            self.discard.append(card)
            self.add_log(f"Drew Monster Card: {card['name']} (Spawns {card['spawn']} items)")

            if broadcast_fn:
                await broadcast_fn()

            for _ in range(card["spawn"]):
                self.spawn_item()

            await asyncio.sleep(1.5)

            await self.resolve_event(card, broadcast_fn)
            await asyncio.sleep(1.5)

            attack = card["monster_attack"]

            # Step 1: resolve the Frenzy flame first, if the card has one - the monster
            # currently holding the Frenzy marker moves/attacks.
            if attack["frenzy"] and self.frenzy_marker in self.active_monsters:
                await self.activate_monster(self.frenzy_marker, attack["steps"], attack["dice"], broadcast_fn)

            # Step 2: resolve the card's symbol - every active monster reacting to it
            # moves/attacks. If the Frenzy monster from Step 1 also matches this symbol,
            # it activates again here (a full second, independent movement + attack from
            # its new position) - this double-activation is intentional, not deduplicated.
            if attack["symbol"]:
                for name in self.active_monsters:
                    if attack["symbol"] in MONSTER_SYMBOLS.get(name, []):
                        await self.activate_monster(name, attack["steps"], attack["dice"], broadcast_fn)

            self.active_perks_limit.clear()

            if self.game_phase == "MonsterPhase":
                # Reset Buccaneer's max_ap back to 3 at turn start
                for p_name, h_st in self.heroes_state.items():
                    if h_st["hero"] == "The Buccaneer":
                        h_st["max_ap"] = 3

                self.turn_player_idx = (self.turn_player_idx + 1) % len(self.players)
                next_player = self.players[self.turn_player_idx]["name"]
                max_ap = self.heroes_state[next_player]["max_ap"]
                self.heroes_state[next_player]["ap"] = max_ap
                self.game_phase = "HeroPhase"
                self.add_log(f"It is now {next_player}'s turn! ({max_ap} AP)")

        except Exception as e:
            self.add_log(f"CRITICAL ERROR IN MONSTER PHASE: {str(e)} | {traceback.format_exc()}")
            print(f"CRITICAL ERROR IN MONSTER PHASE: {str(e)}\n{traceback.format_exc()}")
            # Attempt to recover the phase so the game isn't stuck forever
            if self.game_phase == "MonsterPhase":
                self.turn_player_idx = (self.turn_player_idx + 1) % len(self.players)
                self.game_phase = "HeroPhase"

        if broadcast_fn:
            await broadcast_fn()

    async def resolve_event(self, card: Dict, broadcast_fn=None):
        ev = card["event_type"]
        self.add_log(f"Event: {card['event_title']} - {card['event_text']}")

        if ev == "yeti_cry":
            if "Yeti" in self.active_monsters:
                yeti_loc = self.monster_locations["Yeti"]
                y_state = self.monster_states["Yeti"]
                child_locs = {c["location"] for c in y_state["children"] if not c["rescued"]}
                if child_locs:
                    for _ in range(2):
                        step = find_shortest_path(yeti_loc, child_locs, self.adjacency_list)
                        if step and step != yeti_loc:
                            yeti_loc = step
                            self.monster_locations["Yeti"] = yeti_loc
                            self.add_log(f"Yeti moved towards crying child, now at {yeti_loc}.")

        elif ev == "sphinx_gaze":
            for p_name, h_state in self.heroes_state.items():
                if "Crossroads" in h_state["location"] or "Cross Roads" in h_state["location"]:
                    h_state["ap"] = max(0, h_state["ap"] - 1)
                    self.add_log(f"{p_name} was caught in Sphinx's gaze and loses 1 AP.")

        elif ev == "spawn_morgan":
            self.citizens["Morgan"]["active"] = True
            self.citizens["Morgan"]["location"] = self.citizens["Morgan"]["start"]
            msg = "Citizen Morgan has arrived at Mary's Mill."
            self.add_log(msg)
            self.add_citizen_event("Morgan", msg)

        elif ev == "spawn_mari":
            self.citizens["Mari"]["active"] = True
            self.citizens["Mari"]["location"] = self.citizens["Mari"]["start"]
            msg = "Citizen Mari has arrived at The Fool's Journey."
            self.add_log(msg)
            self.add_citizen_event("Mari", msg)

        elif ev == "spawn_howard":
            self.citizens["Howard"]["active"] = True
            self.citizens["Howard"]["location"] = self.citizens["Howard"]["start"]
            msg = "Citizen Howard has arrived at Stewards Spire"
            self.add_log(msg)
            self.add_citizen_event("Howard", msg)

        elif ev == "spawn_spindlewood":
            self.citizens["Ms. Spindlewood"]["active"] = True
            self.citizens["Ms. Spindlewood"]["location"] = self.citizens["Ms. Spindlewood"]["start"]
            msg = "Ms. Spindlewood has arrived at House of Dusk."
            self.add_log(msg)
            self.add_citizen_event("Ms. Spindlewood", msg)

        elif ev == "spawn_weir":
            self.citizens["Dr. Weir"]["active"] = True
            self.citizens["Dr. Weir"]["location"] = self.citizens["Dr. Weir"]["start"]
            msg = "Dr. Weir has arrived at Skybound Galleon."
            self.add_log(msg)
            self.add_citizen_event("Dr. Weir", msg)

        elif ev == "spawn_shinya":
            self.citizens["Shinya"]["active"] = True
            self.citizens["Shinya"]["location"] = self.citizens["Shinya"]["start"]
            msg = "Citizen Shinya has arrived at Arcane Forge."
            self.add_log(msg)
            self.add_citizen_event("Shinya", msg)

        elif ev == "spawn_james_betty":
            self.citizens["James & Betty"]["active"] = True
            self.citizens["James & Betty"]["location"] = self.citizens["James & Betty"]["start"]
            msg = "James & Betty have arrived at South Station."
            self.add_log(msg)
            self.add_citizen_event("James & Betty", msg)

        elif ev == "spawn_vaughn":
            self.citizens["Vaughn"]["active"] = True
            self.citizens["Vaughn"]["location"] = self.citizens["Vaughn"]["start"]
            msg = "Citizen Vaughn has arrived at House of Dawn."
            self.add_log(msg)
            self.add_citizen_event("Vaughn", msg)

        elif ev == "spawn_jennifer":
            self.citizens["Jennifer"]["active"] = True
            self.citizens["Jennifer"]["location"] = self.citizens["Jennifer"]["start"]
            msg = "Citizen Jennifer has arrived at Clockwork Village."
            self.add_log(msg)
            self.add_citizen_event("Jennifer", msg)

        elif ev == "spawn_raimi":
            self.citizens["Raimi"]["active"] = True
            self.citizens["Raimi"]["location"] = self.citizens["Raimi"]["start"]
            msg = "Citizen Raimi has arrived at Thornvine Woods."
            self.add_log(msg)
            self.add_citizen_event("Raimi", msg)

        elif ev == "void_eruption":
            if "Cthulhu" in self.active_monsters:
                self.terror_level = min(7, self.terror_level + 1)
                self.add_log("The Void opens wider! Terror Level increases by 1.")
                self.check_terror()
            else:
                self.spawn_item()

        elif ev == "vital_energy":
            purple_locs = {self.monster_locations[m] for m in self._monsters_of_color("Purple")}
            if purple_locs:
                for h_name, h_state in self.heroes_state.items():
                    new_loc = self._step_toward(h_state["location"], purple_locs, 2)
                    if new_loc != h_state["location"]:
                        h_state["location"] = new_loc
                        self.add_log(f"{h_name} is drawn 2 spaces toward danger, now at {new_loc}.")
                for c_name, cit in self.citizens.items():
                    if cit["active"] and cit["location"] not in ("Board", "Rescued", "Defeated"):
                        new_loc = self._step_toward(cit["location"], purple_locs, 2)
                        if new_loc != cit["location"]:
                            cit["location"] = new_loc
                            self.add_log(f"{c_name} is drawn 2 spaces toward danger, now at {new_loc}.")
            else:
                self.add_log("Vital Energy has no effect - no Purple Monster is active.")

        elif ev == "awaiting_the_hunt":
            for m in self._monsters_of_color("Orange"):
                m_loc = self.monster_locations[m]
                co_heroes = [h for h, st in self.heroes_state.items() if st["location"] == m_loc]
                co_citizens = [c for c, cit in self.citizens.items() if cit["active"] and cit["location"] == m_loc]
                for h_name in co_heroes:
                    blocked = False
                    if self.heroes_state[h_name]["items"]:
                        blocked = await self.request_block_choice(h_name, 1, "Awaiting the Hunt", broadcast_fn)
                    if not blocked:
                        self._apply_direct_hit(h_name)
                        msg = f"Awaiting the Hunt! {m} strikes {h_name}."
                        self.add_log(msg)
                        self.add_power_event(m, "Awaiting the Hunt", msg)
                for c_name in co_citizens:
                    self._defeat_citizen(c_name, monster=m)

        elif ev == "descent_into_madness":
            hero_locs = {st["location"] for st in self.heroes_state.values()}
            for m in self._monsters_of_color("Teal"):
                old = self.monster_locations[m]
                new = self._step_toward(old, hero_locs, len(self.adjacency_list))
                if new != old:
                    self.monster_locations[m] = new
                    self.add_log(f"{m} slips into madness, drawn all the way to {new}.")

        elif ev == "destruction":
            lair_locs = {t["location"] for t in self.lair_tokens}
            for m in self._monsters_of_color("Purple"):
                old = self.monster_locations[m]
                new = self._step_toward(old, lair_locs, len(self.adjacency_list))
                if new != old:
                    self.monster_locations[m] = new
                    self.add_log(f"{m} is drawn back to its Lair, now at {new}.")

        elif ev == "celestial_empowerment":
            target_hero = self._hero_with_most_items()
            if target_hero:
                target_loc = {self.heroes_state[target_hero]["location"]}
                for m in self._monsters_of_color("Yellow"):
                    old = self.monster_locations[m]
                    new = self._step_toward(old, target_loc, 3)
                    if new != old:
                        self.monster_locations[m] = new
                        self.add_log(f"{m} is empowered, drawn 3 spaces toward {target_hero}, now at {new}.")

        elif ev == "gyrocopter_search":
            revealed = [t for t in self.lair_tokens if t.get("revealed")]
            if revealed:
                flipped = random.choice(revealed)
                flipped["revealed"] = False
                self.add_log(f"The Lair Token at {flipped['location']} is turned face down again.")
            facedown = [t for t in self.lair_tokens if not t.get("revealed")]
            if len(facedown) > 1:
                types = [t["type"] for t in facedown]
                random.shuffle(types)
                for token, new_type in zip(facedown, types):
                    token["type"] = new_type
                self.add_log("The facedown Lair Tokens have been mixed up.")
            self._advance_frenzy_marker()

        elif ev == "nowhere_to_hide":
            for m in self._monsters_of_color("Green"):
                distances = self._bfs_distances(self.monster_locations[m])
                candidates = [(d, loc) for loc, d in distances.items() if self.items_on_board.get(loc)]
                if candidates:
                    candidates.sort(key=lambda c: (c[0], c[1]))
                    _, target_loc = candidates[0]
                    removed = self.items_on_board[target_loc]
                    self.discarded_items.extend(removed)
                    self.items_on_board[target_loc] = []
                    self.add_item_discard_event(m, target_loc, removed)
                    msg = f"{m} sweeps through {target_loc}, removing {len(removed)} item(s)."
                    self.add_log(msg)
                    self.add_power_event(m, "Nowhere to Hide", msg)

        elif ev == "deja_vu":
            for m in list(self.active_monsters):
                item = self._draw_bagged_item()
                if not item:
                    continue
                loc = self.get_safe_loc(item["location"])
                item["location"] = loc
                self.items_on_board.setdefault(loc, []).append(item)
                self.monster_locations[m] = loc
                self.add_log(f"{m} is drawn to {item['name']} at {loc}.")

        elif ev == "aquatic_convergence":
            blue_locs = {self.monster_locations[m] for m in self._monsters_of_color("Blue")}
            if blue_locs:
                for m in list(self.active_monsters):
                    old = self.monster_locations[m]
                    new = self._step_toward(old, blue_locs, 2)
                    if new != old:
                        self.monster_locations[m] = new
                        self.add_log(f"{m} converges toward the Blue Monster, now at {new}.")
            else:
                self.add_log("Aquatic Convergence has no effect - no Blue Monster is active.")

        elif ev == "whiteout":
            for m in self._monsters_of_color("Red"):
                distances = self._bfs_distances(self.monster_locations[m])
                candidates = []
                for h_name, h_state in self.heroes_state.items():
                    candidates.append((distances.get(h_state["location"], 999), h_name, "hero"))
                for c_name, cit in self.citizens.items():
                    if cit["active"] and cit["location"] not in ("Board", "Rescued", "Defeated"):
                        candidates.append((distances.get(cit["location"], 999), c_name, "citizen"))
                if not candidates:
                    continue
                candidates.sort(key=lambda c: (c[0], 0 if c[2] == "hero" else 1, c[1]))
                dist, target_name, kind = candidates[0]
                if dist > 3:
                    continue
                if kind == "hero":
                    blocked = False
                    if self.heroes_state[target_name]["items"]:
                        blocked = await self.request_block_choice(target_name, 1, "Whiteout", broadcast_fn)
                    if not blocked:
                        self._apply_direct_hit(target_name)
                        msg = f"Whiteout! {m} strikes {target_name}."
                        self.add_log(msg)
                        self.add_power_event(m, "Whiteout", msg)
                else:
                    self._defeat_citizen(target_name, monster=m)

        elif ev == "folie_a_deux":
            hero_locs = {st["location"] for st in self.heroes_state.values()}
            for m in list(self.active_monsters):
                old = self.monster_locations[m]
                new = self._step_toward(old, hero_locs, 1)
                if new != old:
                    self.monster_locations[m] = new
                    self.add_log(f"{m} moves 1 space toward the nearest Hero, now at {new}.")
            self._advance_frenzy_marker()

        elif ev == "provisions":
            for h_name, h_state in self.heroes_state.items():
                item = self._draw_bagged_item()
                if not item and self.discarded_items:
                    item = self.discarded_items.pop(0)
                if not item:
                    continue
                h_state["items"].append(item)
                self.add_log(f"{h_name} draws {item['name']} ({item['color']} {item['strength']}) from Provisions.")
            for c_name, cit in self.citizens.items():
                if cit["active"] and cit["location"] not in ("Board", "Rescued", "Defeated"):
                    new_loc = self._step_toward(cit["location"], {cit["safe"]}, 1)
                    if new_loc != cit["location"]:
                        if new_loc == cit["safe"]:
                            cit["active"] = False
                            cit["location"] = "Rescued"
                            self.add_log(f"Legend {c_name} has been rescued by Provisions!")
                        else:
                            cit["location"] = new_loc
                            self.add_log(f"{c_name} moves 1 space toward safety, now at {new_loc}.")

    def _monsters_of_color(self, color: str) -> List[str]:
        """Active monsters whose Perception Die reacts to this color - Monster Card event
        text refers to monsters by color (e.g. "Each Orange Monster...")."""
        return [m for m in self.active_monsters if color in MONSTER_COLORS.get(m, [])]

    def _hero_with_most_items(self) -> Optional[str]:
        if not self.heroes_state:
            return None
        return max(sorted(self.heroes_state.keys()), key=lambda h: len(self.heroes_state[h]["items"]))

    def _step_toward(self, start: str, targets: Set[str], steps: int) -> str:
        """Moves `start` up to `steps` spaces along the shortest path towards the nearest
        of `targets`, stopping early once reached. Used for event-driven (non-combat)
        repositioning of monsters/heroes/citizens - actual attacks, if any, are left to
        the card's normal monster_attack resolution that follows event resolution."""
        loc = start
        for _ in range(steps):
            if not targets or loc in targets:
                break
            nxt = find_shortest_path(loc, targets, self.adjacency_list)
            if not nxt or nxt == loc:
                break
            loc = nxt
        return loc

    def check_terror(self):
        if self.terror_level >= 7:
            self.check_defeat("Terror Level has reached maximum (7)!")

    async def activate_monster(self, name: str, moves: int, dice: int, broadcast_fn=None):
        self.add_log(f"Monster {name} is activating: Moves {moves}, Dice {dice}.")

        for _ in range(moves):
            current_loc = self.monster_locations[name]

            hero_targets = set()
            citizen_targets = set()

            for h_state in self.heroes_state.values():
                if name == "Cthulhu" and self.monster_states["Cthulhu"]["phase"] == 2:
                    track_pos = self.monster_states["Cthulhu"]["player_tracks"]
                    player_indices = [v for k, v in track_pos.items() if v != -1]
                    if player_indices:
                        max_idx = max(player_indices)
                        c_loc = self.monster_locations["Cthulhu"]
                        c_idx = self.monster_states["Cthulhu"]["corpse_city_track"].index(c_loc) if c_loc in self.monster_states["Cthulhu"]["corpse_city_track"] else 0
                        if max_idx > c_idx:
                            self.monster_locations["Cthulhu"] = self.monster_states["Cthulhu"]["corpse_city_track"][c_idx + 1]
                            self.add_log(f"Cthulhu moves forward in Corpse City to {self.monster_locations['Cthulhu']}.")
                        break
                else:
                    if "Cthulhu" in self.active_monsters:
                        if self.monster_states["Cthulhu"]["player_tracks"].get(h_state.get("name", ""), -1) != -1:
                            continue
                    hero_targets.add(h_state["location"])

            for cit in self.citizens.values():
                if cit["active"] and cit["location"] not in ["Board", "Rescued"]:
                    citizen_targets.add(cit["location"])

            if name == "Yeti":
                y_state = self.monster_states["Yeti"]
                for child in y_state["children"]:
                    if not child["rescued"]:
                        citizen_targets.add(child["location"])

            if not hero_targets and not citizen_targets:
                break

            if name == "Cthulhu" and self.monster_states["Cthulhu"]["phase"] == 2:
                break

            # STOP IMMEDIATELY IF ON A TARGET
            if current_loc in hero_targets or current_loc in citizen_targets:
                break

            next_step = get_best_monster_move(current_loc, hero_targets, citizen_targets, self.adjacency_list)
            if next_step and next_step != current_loc:
                self.monster_locations[name] = next_step
                self.add_log(f"{name} moved to {next_step}.")

                # Broadcast after each move step so players see the monster walking
                if broadcast_fn:
                    await broadcast_fn()
                await asyncio.sleep(0.5)

        curr_loc = self.monster_locations[name]

        if name == "Cthulhu" and self.monster_states["Cthulhu"]["phase"] == 2:
            c_loc = self.monster_locations["Cthulhu"]
            c_idx = self.monster_states["Cthulhu"]["corpse_city_track"].index(c_loc)
            attack_targets = [k for k, v in self.monster_states["Cthulhu"]["player_tracks"].items() if v == c_idx]
            if attack_targets:
                await self.perform_attack(name, attack_targets[0], dice, broadcast_fn)
            return

        target_hero = None
        for p_name, h_state in self.heroes_state.items():
            if h_state["location"] == curr_loc:
                target_hero = p_name
                break

        if target_hero:
            await self.perform_attack(name, target_hero, dice, broadcast_fn)
        else:
            # Yeti's children are never attacked by any monster, including the Yeti itself.
            target_citizen = None
            for cit_name, cit in self.citizens.items():
                if cit["active"] and cit["location"] == curr_loc:
                    target_citizen = cit_name
                    break
            if target_citizen:
                await self.perform_attack_citizen(name, target_citizen, dice, broadcast_fn)
