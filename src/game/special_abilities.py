"""Per-hero-class special abilities and per-perk-name Perk card effects."""
from typing import Dict


class SpecialAbilitiesMixin:
    def execute_special(self, player_name: str, args: Dict) -> bool:
        if not self.check_turn(player_name):
            return False

        h_state = self.heroes_state[player_name]
        hero_class = h_state["hero"]

        # The Parapsychologist can distribute items multiple times without locking ability_used
        if hero_class == "The Parapsychologist":
            target_hero_name = args.get("target_hero")
            item_id = args.get("item_id")

            if not target_hero_name or not item_id:
                return False

            target_hero = self.heroes_state.get(target_hero_name)
            item = next((i for i in h_state["items"] if i["id"] == item_id), None)

            if not target_hero or not item:
                return False

            h_state["items"].remove(item)
            target_hero["items"].append(item)
            self.add_log(f"The Parapsychologist distributed {item['name']} ({item['color']} {item['strength']}) to {target_hero_name}.")
            return True

        # For other heroes, check if already used
        if h_state["ability_used"]:
            self.add_log("Special ability already used this turn.")
            return False

        if hero_class == "The Guardian":
            target_hero_name = args.get("target_hero")
            target_loc = args.get("target_location")

            if not target_hero_name or not target_loc:
                return False

            target_hero = self.heroes_state.get(target_hero_name)
            if not target_hero:
                return False

            if target_hero["location"] != h_state["location"]:
                self.add_log("The Guardian must be in the same location as the guided hero.")
                return False

            adjacent = self.adjacency_list.get(h_state["location"], [])
            if target_loc not in adjacent:
                self.add_log(f"Target location {target_loc} is not adjacent.")
                return False

            target_hero["location"] = target_loc
            h_state["ability_used"] = True
            self.add_log(f"The Guardian guided {target_hero_name} to {target_loc} (0 AP).")
            return True

        elif hero_class == "The Investigator":
            discard1_id = args.get("discard1_id")
            discard2_id = args.get("discard2_id")
            claim_id = args.get("claim_id")

            if not discard1_id or not discard2_id or not claim_id:
                return False

            i1 = next((i for i in h_state["items"] if i["id"] == discard1_id), None)
            i2 = next((i for i in h_state["items"] if i["id"] == discard2_id), None)
            claim_item = next((i for i in self.discarded_items if i["id"] == claim_id), None)

            if not i1 or not i2 or not claim_item or i1 == i2:
                self.add_log("Invalid items selected for Investigator action.")
                return False

            h_state["items"].remove(i1)
            h_state["items"].remove(i2)
            self.discarded_items.append(i1)
            self.discarded_items.append(i2)

            self.discarded_items.remove(claim_item)
            h_state["items"].append(claim_item)

            h_state["ability_used"] = True
            self.add_log(f"The Investigator discarded {i1['name']} and {i2['name']} to retrieve {claim_item['name']} from the discard pile.")
            return True

        elif hero_class == "The Buccaneer":
            discard_id = args.get("discard_id")
            if not discard_id:
                return False

            item = next((i for i in h_state["items"] if i["id"] == discard_id), None)
            if not item:
                return False

            h_state["items"].remove(item)
            self.discarded_items.append(item)

            h_state["ap"] += 4
            h_state["max_ap"] += 4
            h_state["ability_used"] = True
            self.add_log(f"The Buccaneer discarded {item['name']} to gain +4 AP this turn.")
            return True

        elif hero_class == "The Fortune Teller":
            if self.deck:
                # The card's identity is sent privately to this player only (see the
                # "special" websocket handler) - the shared log deliberately doesn't
                # name it, so the peek stays a secret from the rest of the room.
                self.add_log(f"{player_name} peeked at the top Monster Card.")
                h_state["ability_used"] = True
                return True
            else:
                self.add_log("No cards left in the Monster deck.")
                return False

        return False

    def execute_play_perk(self, player_name: str, perk_id: str, args: Dict) -> bool:
        if self.game_phase != "HeroPhase":
            return False

        player_state = self.heroes_state.get(player_name)
        if not player_state:
            return False

        perk = next((p for p in player_state["perks"] if p["id"] == perk_id), None)
        if not perk:
            return False

        activated = False
        if perk["name"] == "Lunar Oscillator":
            item_id = args.get("discard_item_id")
            target_hero = args.get("target_hero")
            item = next((i for i in self.discarded_items if i["id"] == item_id), None)
            if target_hero in self.heroes_state and item:
                self.discarded_items.remove(item)
                self.heroes_state[target_hero]["items"].append(item)
                self.add_log(f"Perk (Lunar Oscillator) used: gave {item['name']} to {target_hero} from the discard pile.")
            self.skip_monster_phase = True
            self.add_log("Perk (Lunar Oscillator) activated: the next Monster Phase will be skipped.")
            activated = True

        elif perk["name"] == "Pulse Pummel":
            monster = args.get("monster")
            dest = args.get("target_location")
            if monster in self.active_monsters and dest in self.adjacency_list:
                distances = self._bfs_distances(self.monster_locations[monster])
                if distances.get(dest, 999) <= 4:
                    self.monster_locations[monster] = dest
                    self.add_log(f"Perk (Pulse Pummel) used: moved {monster} to {dest}.")
                    activated = True

        elif perk["name"] == "Neuro Stabilizer":
            active_p = self.get_active_player()
            if active_p:
                self.heroes_state[active_p["name"]]["ap"] += 2
                self.add_log(f"Perk (Neuro Stabilizer) activated: {active_p['name']} gains 2 additional actions.")
                activated = True

        elif perk["name"] == "Location Inverter":
            target_hero = args.get("target_hero")
            monster = args.get("monster")
            if target_hero in self.heroes_state and monster in self.active_monsters:
                hero_loc = self.heroes_state[target_hero]["location"]
                monster_loc = self.monster_locations[monster]
                self.heroes_state[target_hero]["location"] = monster_loc
                self.monster_locations[monster] = hero_loc
                self.add_log(f"Perk (Location Inverter) used: swapped {target_hero} and {monster}'s locations.")
                activated = True

        elif perk["name"] == "Ethereal Goggles":
            choice = args.get("choice")
            if choice == "reveal_lair":
                lair_loc = args.get("lair_location")
                token = next((t for t in self.lair_tokens if t["location"] == lair_loc and not t["revealed"]), None)
                if token:
                    token["revealed"] = True
                    self.add_log(f"Perk (Ethereal Goggles) used: revealed the Lair Token at {lair_loc}.")
                    activated = True
            elif choice == "move_monster":
                monster = args.get("monster")
                dest = args.get("target_location")
                if monster in self.active_monsters and dest in self.adjacency_list:
                    distances = self._bfs_distances(self.monster_locations[monster])
                    if distances.get(dest, 999) <= 3:
                        self.monster_locations[monster] = dest
                        self.add_log(f"Perk (Ethereal Goggles) used: moved {monster} to {dest}.")
                        activated = True

        elif perk["name"] == "Chronohelm":
            choice = args.get("choice")
            targets = args.get("targets", {})
            if choice == "monsters":
                pool = self.active_monsters
                loc_map = self.monster_locations
            elif choice == "heroes":
                pool = list(self.heroes_state.keys())
                loc_map = {h: self.heroes_state[h]["location"] for h in pool}
            else:
                pool = []
                loc_map = {}

            if pool and targets:
                valid = True
                for name, dest in targets.items():
                    if name not in pool or dest not in self.adjacency_list:
                        valid = False
                        break
                    distances = self._bfs_distances(loc_map[name])
                    if distances.get(dest, 999) > 2:
                        valid = False
                        break
                if valid:
                    for name, dest in targets.items():
                        if choice == "monsters":
                            self.monster_locations[name] = dest
                        else:
                            self.heroes_state[name]["location"] = dest
                    self.add_log(f"Perk (Chronohelm) used: moved each {'Monster' if choice == 'monsters' else 'Hero'} up to 2 spaces.")
                    activated = True

        elif perk["name"] == "Clockwork Companion":
            location = args.get("location")
            target_hero = args.get("target_hero")
            if target_hero in self.heroes_state and location in self.items_on_board:
                moved = self.items_on_board[location]
                if moved:
                    self.heroes_state[target_hero]["items"].extend(moved)
                    self.items_on_board[location] = []
                    self.add_log(f"Perk (Clockwork Companion) used: gave all {len(moved)} item(s) at {location} to {target_hero}.")
                    activated = True

        elif perk["name"] == "Pneumatic Jetpack":
            target_hero = args.get("target_hero")
            dest = args.get("target_location")
            if target_hero in self.heroes_state and dest in self.adjacency_list:
                self.heroes_state[target_hero]["location"] = dest
                self.add_log(f"Perk (Pneumatic Jetpack) used: placed {target_hero} at {dest}.")
                activated = True

        elif perk["name"] == "Ironclad Buggy":
            dest = args.get("target_location")
            hero_names = args.get("hero_names", [])
            has_hero_there = any(h["location"] == dest for h in self.heroes_state.values())
            if dest in self.adjacency_list and has_hero_there and hero_names:
                if all(h in self.heroes_state for h in hero_names):
                    for h in hero_names:
                        self.heroes_state[h]["location"] = dest
                    self.add_log(f"Perk (Ironclad Buggy) used: gathered {', '.join(hero_names)} at {dest}.")
                    activated = True

        elif perk["name"] == "Spectral Diverter":
            for _ in self.heroes_state:
                self.spawn_item()
            self.add_log(f"Perk (Spectral Diverter) activated: each player draws and places 1 item from the bag.")
            activated = True

        if activated:
            player_state["perks"].remove(perk)
            return True
        return False
