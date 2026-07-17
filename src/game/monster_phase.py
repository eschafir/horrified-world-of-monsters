"""Monster phase orchestration: turn handoff, card draw/event resolution, and the
Frenzy-holder + symbol-matched monster activation loop."""
import asyncio
import traceback
from typing import Dict

from src.data_loader import MONSTER_SYMBOLS
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

            await self.resolve_event(card)
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

    async def resolve_event(self, card: Dict):
        # NOTE: several event_types below have no branch and silently no-op - these are
        # the cards still marked "NEED IMPLEMENTATION" in the original design: vital_energy,
        # awaiting_the_hunt, descent_into_madness, destruction, celestial_empowerment,
        # gyrocopter_search, nowhere_to_hide, deja_vu, aquatic_convergence, whiteout,
        # folie_a_deux, provisions. Only the branches below (yeti_cry, sphinx_gaze, the
        # spawn_* citizen events, and void_eruption) are actually implemented.
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
