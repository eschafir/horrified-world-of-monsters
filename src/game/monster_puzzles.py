"""Per-monster Advance (puzzle progress) and Defeat logic. Each monster's mini-puzzle
and defeat condition is a completely different shape - read the relevant branch fully
before touching monster logic, don't assume symmetry between monsters."""
from typing import Dict

from src.pathfinding import find_shortest_path


class MonsterPuzzlesMixin:
    def _check_sphinx_solved(self, sp_state: Dict):
        grid = sp_state["grid"]
        if not all(c["filled"] for c in grid):
            sp_state["solved"] = False
            return
        num_cols = len(sp_state["col_targets"])
        num_rows = len(sp_state["row_targets"])
        row_sums = [
            sum(grid[r * num_cols + c]["item"]["strength"] for c in range(num_cols))
            for r in range(num_rows)
        ]
        col_sums = [
            sum(grid[r * num_cols + c]["item"]["strength"] for r in range(num_rows))
            for c in range(num_cols)
        ]
        was_solved = sp_state["solved"]
        sp_state["solved"] = (row_sums == sp_state["row_targets"] and col_sums == sp_state["col_targets"])
        if sp_state["solved"] and not was_solved:
            self.add_log("The Sphinx's riddle grid sums align — the riddle is answered!")

    def _enter_corpse_city(self, cth_state: Dict):
        cth_state["phase"] = 2
        cth_state["current_item"] = self._draw_bagged_item()
        self.monster_locations["Cthulhu"] = "Entrance"
        self.add_log("PORTAL FORCED OPEN! Cthulhu has retreated to the Corpse-City of R'lyeh!")

    def execute_advance(self, player_name: str, monster: str, args: Dict) -> bool:
        if not self.check_turn(player_name):
            return False

        h_state = self.heroes_state[player_name]
        if h_state["ap"] < 1:
            return False

        loc = h_state["location"]

        # Lair Token reveal: shared across Yeti's Cave and Jiangshi's Moon Shrine (only 4
        # tokens exist total, regardless of which of those two monsters are active).
        if args.get("type") == "reveal_lair":
            token = next((t for t in self.lair_tokens if t["location"] == loc and not t["revealed"]), None)
            if not token:
                return False
            item_ids = args.get("item_ids", [])
            items = [next((i for i in h_state["items"] if i["id"] == iid), None) for iid in item_ids]
            if not items or any(i is None for i in items) or sum(i["strength"] for i in items) < 3:
                self.add_log("Select items totaling strength 3+ to discard to reveal this Lair token.")
                return False
            for item in items:
                h_state["items"].remove(item)
                self.discarded_items.append(item)
            token["revealed"] = True
            h_state["ap"] -= 1
            total = sum(i["strength"] for i in items)
            names = ", ".join(i["name"] for i in items)
            label = {"yeti": "the TRUE Yeti Cave!", "jiangshi": "the TRUE Moon Shrine!", "blank": "a false trail."}[token["type"]]
            self.add_log(f"{player_name} discarded {names} (strength {total}) to reveal the Lair token at {loc}. It is {label}")
            return True

        if monster == "Siren":
            if loc != self.monster_locations["Siren"]:
                self.add_log(f"Must be at the Siren's location ({self.monster_locations['Siren']}) to Advance.")
                return False

            siren_state = self.monster_states["Siren"]
            action_type = args.get("type")

            if action_type == "pay":
                item_id = args.get("item_id")
                item = next((i for i in h_state["items"] if i["id"] == item_id), None)
                if not item or item["color"] != "Blue":
                    self.add_log("Must discard a Blue item to buy flips.")
                    return False
                h_state["items"].remove(item)
                self.discarded_items.append(item)
                h_state["ap"] -= 1
                siren_state["pending_flips"] += 2
                self.add_log(f"{player_name} spent {item['name']} to gain 2 tile flips.")
                return True

            elif action_type == "flip":
                square_id = args.get("square_id")
                sq = next((s for s in siren_state["squares"] if s["id"] == square_id), None)
                if not sq or sq["matched"] or sq["flipped"]:
                    return False

                if siren_state["pending_flips"] <= 0:
                    self.add_log("You have no pending flips. Spend a Blue item first.")
                    return False

                # If we have 2 mismatched tiles currently showing, unflip them now before flipping the new one
                if len(siren_state["currently_flipping"]) == 2:
                    for old_sq in siren_state["currently_flipping"]:
                        old_sq["flipped"] = False
                    siren_state["currently_flipping"] = []

                siren_state["pending_flips"] -= 1
                sq["flipped"] = True
                siren_state["currently_flipping"].append(sq)

                if len(siren_state["currently_flipping"]) == 2:
                    sq1, sq2 = siren_state["currently_flipping"]
                    if sq1["letter"] == sq2["letter"]:
                        sq1["matched"] = True
                        sq2["matched"] = True
                        siren_state["currently_flipping"] = []
                        self.add_log(f"{player_name} matched two {sq1['letter']} squares!")
                    else:
                        self.add_log(f"{player_name} flipped {sq2['letter']}, but it doesn't match {sq1['letter']}.")
                        # Signals the websocket handler to schedule a delayed unflip -
                        # execute_advance normally returns bool, this is the one case that
                        # returns a dict to request a follow-up timed action.
                        return {"action": "siren_delay", "sq1": sq1["id"], "sq2": sq2["id"]}
                else:
                    self.add_log(f"{player_name} flipped a Siren square: it's {sq['letter']}.")

                return True

            return False

        if monster == "Yeti":
            # Placing a Yeti Child on the mat is a second, distinct action from guiding it
            # to the True Cave: the child must already be standing there, unplaced.
            yeti_state = self.monster_states["Yeti"]
            true_cave_loc = self._get_true_lair_location("yeti")
            if not true_cave_loc or loc != true_cave_loc:
                self.add_log("Must be at the True Cave to place a Yeti Child on the mat.")
                return False

            child_id = args.get("child_id")
            child = next((c for c in yeti_state["children"] if c["id"] == child_id), None)
            if not child or child["rescued"] or child["location"] != true_cave_loc:
                self.add_log("That Yeti Child isn't waiting at the Cave to be placed.")
                return False

            child["rescued"] = True
            child["rescued_order"] = sum(1 for c in yeti_state["children"] if c["rescued_order"] is not None) + 1
            h_state["ap"] -= 1
            self.add_log(f"{player_name} placed Yeti Child {child['id']} on the Yeti's mat!")
            return True

        if monster == "Jiangshi":
            js_state = self.monster_states["Jiangshi"]

            shrine_token = next((t for t in self.lair_tokens if t["type"] == "jiangshi" and t["revealed"]), None)
            if not shrine_token or loc != shrine_token["location"]:
                self.add_log("Must be at the revealed Moon Shrine to work the Coin Sword.")
                return False

            slot_id = args.get("slot_id")
            item_id = args.get("item_id")
            slot = next((s for s in js_state["sword_slots"] if s["id"] == slot_id), None)
            if not slot or slot["filled"]:
                return False

            item = next((i for i in h_state["items"] if i["id"] == item_id), None)
            if not item or item["strength"] != slot["target_strength"]:
                self.add_log(f"Item strength must exactly match slot {slot_id}'s target ({slot['target_strength']}).")
                return False

            h_state["items"].remove(item)
            self._commit_item("Jiangshi", item)
            slot["filled"] = True
            slot["item"] = item
            h_state["ap"] -= 1
            self.add_log(f"{player_name} placed a strength-{item['strength']} Coin Sword token into slot {slot_id}.")
            return True

        elif monster == "Sphinx":
            sp_state = self.monster_states["Sphinx"]
            if loc != self.monster_locations["Sphinx"]:
                self.add_log(f"Must be at Sphinx's location ({self.monster_locations['Sphinx']}) to Advance.")
                return False

            action_type = args.get("type", "place")
            if action_type == "place":
                cell_id = args.get("cell_id")
                item_id = args.get("item_id")
                cell = next((c for c in sp_state["grid"] if c["id"] == cell_id), None)
                if not cell or cell["filled"]:
                    return False
                item = next((i for i in h_state["items"] if i["id"] == item_id), None)
                if not item:
                    return False
                h_state["items"].remove(item)
                self._commit_item("Sphinx", item)
                cell["filled"] = True
                cell["item"] = item
                h_state["ap"] -= 1
                self.add_log(f"{player_name} placed {item['name']} ({item['color']} {item['strength']}) into Sphinx grid cell {cell_id}.")
                self._check_sphinx_solved(sp_state)
                return True

            elif action_type == "clear":
                cell_id = args.get("cell_id")
                cost_item_id = args.get("cost_item_id")
                dest_cell_id = args.get("dest_cell_id")
                cell = next((c for c in sp_state["grid"] if c["id"] == cell_id), None)
                if not cell or not cell["filled"] or cell["locked"]:
                    return False
                cost_item = next((i for i in h_state["items"] if i["id"] == cost_item_id), None)
                if not cost_item:
                    return False

                h_state["items"].remove(cost_item)
                self.discarded_items.append(cost_item)
                moved_item = cell["item"]
                cell["filled"] = False
                cell["item"] = None

                dest_cell = next((c for c in sp_state["grid"] if c["id"] == dest_cell_id), None) if dest_cell_id is not None else None
                if dest_cell and not dest_cell["filled"]:
                    dest_cell["filled"] = True
                    dest_cell["item"] = moved_item
                else:
                    # Back to the hero's hand - no longer "on the Sphinx's tab", so it
                    # must not be swept into the discard pile when the Sphinx is defeated.
                    committed = self.committed_items.get("Sphinx", [])
                    if moved_item in committed:
                        committed.remove(moved_item)
                    h_state["items"].append(moved_item)

                h_state["ap"] -= 1
                self.add_log(f"{player_name} discarded {cost_item['name']} to rearrange the Sphinx's riddle grid.")
                self._check_sphinx_solved(sp_state)
                return True
            return False

        elif monster == "Cthulhu":
            cth_state = self.monster_states["Cthulhu"]
            if cth_state["phase"] == 1:
                action_type = args.get("type", "dial")

                if action_type == "lure":
                    if not cth_state["portal_open"]:
                        self.add_log("The portal isn't open yet — match all 3 dials first.")
                        return False
                    if loc != self.monster_locations["Cthulhu"]:
                        self.add_log("Must be at Cthulhu's location to lure it.")
                        return False
                    item_id = args.get("item_id")
                    item = next((i for i in h_state["items"] if i["id"] == item_id), None)
                    if not item or item["color"] != "Green":
                        self.add_log("Luring Cthulhu towards the Void requires a Green item.")
                        return False
                    h_state["items"].remove(item)
                    self.discarded_items.append(item)
                    h_state["ap"] -= 1
                    remaining = item["strength"]
                    cur = self.monster_locations["Cthulhu"]
                    while remaining > 0 and cur != "The Void":
                        nxt = find_shortest_path(cur, {"The Void"}, self.adjacency_list)
                        if not nxt or nxt == cur:
                            break
                        cur = nxt
                        remaining -= 1
                    self.monster_locations["Cthulhu"] = cur
                    self.add_log(f"{player_name} discarded {item['name']} to lure Cthulhu to {cur}.")
                    if cur == "The Void":
                        self._enter_corpse_city(cth_state)
                    return True

                if loc != self.get_safe_loc("The Void"):
                    self.add_log("Must be at The Void to rotate the dials.")
                    return False

                color = args.get("color")
                item_id = args.get("item_id")
                dial = next((d for d in cth_state["dials"] if d["color"] == color), None)
                if not dial or dial["progress"] >= dial["target"]:
                    return False

                item = next((i for i in h_state["items"] if i["id"] == item_id), None)
                if not item or item["color"] != color:
                    self.add_log(f"Rotating the {color} dial requires a {color} item.")
                    return False

                if dial["progress"] + item["strength"] > dial["target"]:
                    self.add_log(f"That would overshoot the {color} dial's target ({dial['target']}).")
                    return False

                h_state["items"].remove(item)
                self._commit_item("Cthulhu", item)
                dial["progress"] += item["strength"]
                h_state["ap"] -= 1
                self.add_log(f"{player_name} rotated the {color} dial to {dial['progress']}/{dial['target']}.")

                if all(d["progress"] == d["target"] for d in cth_state["dials"]):
                    cth_state["portal_open"] = True
                    self.add_log("The portal's runes align! Lure Cthulhu to The Void to force it through.")

                return True

            elif cth_state["phase"] == 2:
                color = args.get("color")
                item_id = args.get("item_id")
                if color not in ("Blue", "Green", "Purple"):
                    return False

                item = next((i for i in h_state["items"] if i["id"] == item_id), None)
                if not item or item["color"] != color:
                    self.add_log(f"Binding towards that tentacle requires a {color} item.")
                    return False

                target_strength = cth_state["current_item"]["strength"] if cth_state["current_item"] else 3
                progress = cth_state["bind_progress"].get(player_name)
                if not progress or progress["color"] != color:
                    progress = {"color": color, "progress": 0}

                h_state["items"].remove(item)
                self._commit_item("Cthulhu", item)
                progress["progress"] += item["strength"]
                h_state["ap"] -= 1

                if progress["progress"] >= target_strength:
                    track_idx = {"Blue": 0, "Green": 1, "Purple": 2}[color]
                    cth_state["player_tracks"][player_name] = track_idx
                    cth_state["manacles_placed"] = min(4, cth_state["manacles_placed"] + 1)
                    cth_state["bind_progress"].pop(player_name, None)
                    self.add_log(f"{player_name} bound a tentacle and stepped into {cth_state['corpse_city_track'][track_idx]}! ({cth_state['manacles_placed']}/4 manacles placed)")
                else:
                    cth_state["bind_progress"][player_name] = progress
                    self.add_log(f"{player_name} discarded {item['name']} towards binding a tentacle ({progress['progress']}/{target_strength}).")

                return True

        return False

    def execute_defeat(self, player_name: str, monster: str, args: Dict = None) -> bool:
        if not self.check_turn(player_name):
            return False

        h_state = self.heroes_state[player_name]
        if h_state["ap"] < 1:
            return False

        args = args or {}
        loc = h_state["location"]

        if monster == "Siren":
            siren_state = self.monster_states["Siren"]
            all_matched = all(sq["matched"] for sq in siren_state["squares"])
            hero_with_siren = (loc == self.monster_locations["Siren"])

            if not all_matched:
                self.add_log("All squares must be flipped and matched to silence the Siren.")
                return False
            if not hero_with_siren:
                self.add_log(f"Must be in the Siren's location ({self.monster_locations['Siren']}) to defeat her.")
                return False

            item_ids = args.get("item_ids", [])
            items = [next((i for i in h_state["items"] if i["id"] == iid), None) for iid in item_ids]

            if not items or any(i is None for i in items):
                return False

            if any(i["color"] != "Green" for i in items):
                self.add_log("Only Green items can be used to defeat the Siren.")
                return False

            if sum(i["strength"] for i in items) < 6:
                self.add_log("Must discard Green items with a total strength of 6 or more.")
                return False

            for item in items:
                h_state["items"].remove(item)
                self.discarded_items.append(item)
            self._sweep_committed_items("Siren")

            h_state["ap"] -= 1
            self.active_monsters.remove("Siren")
            self.defeated_monsters.append("Siren")
            self.monster_locations["Siren"] = "Defeated"
            self._reassign_frenzy_if_needed()
            self.add_log(f"{player_name} matched the Siren's tones and silenced her song! The Siren is defeated!")
            self.check_victory()
            return True

        if monster == "Yeti":
            y_state = self.monster_states["Yeti"]
            all_kids_placed = all(k["rescued"] for k in y_state["children"])
            hero_with_yeti = (loc == self.monster_locations["Yeti"])

            if not (all_kids_placed and hero_with_yeti):
                self.add_log("Defeat condition not met. All children must be placed on the mat, and the hero must be with the Yeti.")
                return False

            item_ids = args.get("item_ids", [])
            items = [next((i for i in h_state["items"] if i["id"] == iid), None) for iid in item_ids]
            if len(items) != 3 or any(i is None for i in items) or sorted(i["color"] for i in items) != ["Blue", "Green", "Purple"]:
                self.add_log("Calming the Yeti requires discarding exactly one Purple, one Green, and one Blue item.")
                return False

            for item in items:
                h_state["items"].remove(item)
                self.discarded_items.append(item)
            self._sweep_committed_items("Yeti")
            self.active_monsters.remove("Yeti")
            self.defeated_monsters.append("Yeti")
            self._reassign_frenzy_if_needed()
            h_state["ap"] -= 1
            self.add_log("THE YETI HAS BEEN CALMED! The children are safe and happy!")
            self.check_victory()
            return True

        elif monster == "Jiangshi":
            js_state = self.monster_states["Jiangshi"]
            all_filled = all(s["filled"] for s in js_state["sword_slots"])
            hero_here = (loc == self.monster_locations["Jiangshi"])

            if not (all_filled and hero_here):
                self.add_log("Defeat condition not met. Complete the Coin Sword and meet Jiangshi.")
                return False

            item_ids = args.get("item_ids", [])
            items = [next((i for i in h_state["items"] if i["id"] == iid), None) for iid in item_ids]
            if not items or any(i is None for i in items) or any(i["color"] != "Purple" for i in items):
                self.add_log("Dispossessing Jiangshi requires discarding Purple items.")
                return False
            total = sum(i["strength"] for i in items)
            if total < 9:
                self.add_log(f"Requires Purple items totaling 9+ strength (selected {total}).")
                return False

            for item in items:
                h_state["items"].remove(item)
                self.discarded_items.append(item)
            self._sweep_committed_items("Jiangshi")
            self.active_monsters.remove("Jiangshi")
            self.defeated_monsters.append("Jiangshi")
            self._reassign_frenzy_if_needed()
            h_state["ap"] -= 1
            self.add_log("THE JIANGSHI IS DISPOSSESSED! The hopping vampire is sealed.")
            self.check_victory()
            return True

        elif monster == "Sphinx":
            sp_state = self.monster_states["Sphinx"]
            hero_here = (loc == self.monster_locations["Sphinx"])

            if not (sp_state["solved"] and hero_here):
                self.add_log("Defeat condition not met. Solve the riddle grid and meet the Sphinx.")
                return False

            item_ids = args.get("item_ids", [])
            items = [next((i for i in h_state["items"] if i["id"] == iid), None) for iid in item_ids]
            if not items or any(i is None for i in items) or any(i["color"] != "Green" for i in items):
                self.add_log("Outwitting the Sphinx requires discarding Green items.")
                return False
            total = sum(i["strength"] for i in items)
            if total < 6:
                self.add_log(f"Requires Green items totaling 6+ strength (selected {total}).")
                return False

            for item in items:
                h_state["items"].remove(item)
                self.discarded_items.append(item)
            self._sweep_committed_items("Sphinx")
            self.active_monsters.remove("Sphinx")
            self.defeated_monsters.append("Sphinx")
            self._reassign_frenzy_if_needed()
            h_state["ap"] -= 1
            self.add_log("THE SPHINX IS OUTWITTED! The riddle-keeper vanishes.")
            self.check_victory()
            return True

        elif monster == "Cthulhu":
            cth_state = self.monster_states["Cthulhu"]
            if cth_state["phase"] != 2:
                self.add_log("You must first force Cthulhu into the Corpse-City of R'lyeh.")
                return False

            all_manacled = cth_state["manacles_placed"] >= 4
            all_entered = all(v != -1 for v in cth_state["player_tracks"].values())
            if not (all_manacled and all_entered):
                self.add_log("Defeat condition not met. All four tentacles must be manacled and every hero must be in R'lyeh.")
                return False

            item_ids = args.get("item_ids", [])
            items = [next((i for i in h_state["items"] if i["id"] == iid), None) for iid in item_ids]
            if any(i is None for i in items):
                return False
            needed = max(0, len(self.players) - 1)
            if len(items) < needed:
                self.add_log(f"Gather at least one item from each other hero via Share before sealing Cthulhu ({len(items)}/{needed}).")
                return False

            for item in items:
                h_state["items"].remove(item)
                self.discarded_items.append(item)
            self._sweep_committed_items("Cthulhu")
            self.active_monsters.remove("Cthulhu")
            self.defeated_monsters.append("Cthulhu")
            self._reassign_frenzy_if_needed()
            h_state["ap"] -= 1
            self.add_log("CTHULHU IS LOCKED AWAY IN R'LYEH... for now.")
            self.check_victory()
            return True

        return False
