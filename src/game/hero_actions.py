"""Hero-phase turn/movement/item actions: move, guide, pickup, share."""
from typing import Dict, List, Optional


class HeroActionsMixin:
    def get_active_player(self) -> Optional[Dict]:
        if not self.players or self.turn_player_idx >= len(self.players):
            return None
        return self.players[self.turn_player_idx]

    def check_turn(self, player_name: str) -> bool:
        ap = self.get_active_player()
        return ap is not None and ap["name"] == player_name and self.game_phase == "HeroPhase"

    def execute_move(self, player_name: str, target: str) -> bool:
        if not self.check_turn(player_name):
            return False

        state = self.heroes_state[player_name]
        current = state["location"]

        # Check if Cthulhu Phase 2 rules apply (player on Corpse City track cannot move on normal board)
        if "Cthulhu" in self.active_monsters:
            cth_state = self.monster_states["Cthulhu"]
            if cth_state["player_tracks"].get(player_name, -1) != -1:
                self.add_log(f"{player_name} is in Corpse City and must Advance to move forward.")
                return False

        # Explorer moves 1 extra path
        is_explorer = state["hero"] == "Explorer"
        adjacent = self.adjacency_list.get(current, [])

        valid = False
        if target in adjacent:
            valid = True
        elif is_explorer:
            # Explorer can move 2 spaces for 1 AP
            for n in adjacent:
                if target in self.adjacency_list.get(n, []):
                    valid = True
                    break

        if not valid or state["ap"] < 1:
            return False

        state["location"] = target
        state["ap"] -= 1
        self.add_log(f"{player_name} moved to {target}.")

        # Any Citizen standing with the hero passively follows along when the hero
        # moves - no extra action required. (Guide is still needed to pull/push a
        # Citizen to a location the hero isn't moving to themselves.)
        for cit_name, cit in self.citizens.items():
            if cit["active"] and cit["location"] == current:
                cit["location"] = target
                self.add_log(f"{cit_name} follows {player_name} to {target}.")
                if target == cit["safe"]:
                    cit["active"] = False
                    cit["location"] = "Rescued"
                    self.add_log(f"Legend {cit_name} has been rescued!")
                    if self.perk_deck:
                        perk = self.perk_deck.pop(0)
                        state["perks"].append(perk)
                        self.add_log(f"{player_name} received Perk Card: {perk['name']}.")

        return True

    def execute_guide(self, player_name: str, legend_name: str, target: str) -> bool:
        if not self.check_turn(player_name):
            return False

        state = self.heroes_state[player_name]
        current_loc = state["location"]
        adjacent_to_hero = self.adjacency_list.get(current_loc, [])

        # Check standard citizens
        cit = self.citizens.get(legend_name)
        if cit and cit["active"]:
            legend_loc = cit["location"]
            valid = False
            if legend_loc == current_loc:
                if target in adjacent_to_hero:
                    valid = True
            elif legend_loc in adjacent_to_hero:
                if target == current_loc:
                    valid = True

            if not valid or state["ap"] < 1:
                self.add_log(f"Invalid Guide action for {legend_name}.")
                return False

            cit["location"] = target
            state["ap"] -= 1
            self.add_log(f"{player_name} guided legend {legend_name} to {target}.")

            # Check safe zone
            if target == cit["safe"]:
                cit["active"] = False
                cit["location"] = "Rescued"
                self.add_log(f"Legend {legend_name} has been rescued!")
                if self.perk_deck:
                    perk = self.perk_deck.pop(0)
                    state["perks"].append(perk)
                    self.add_log(f"{player_name} received Perk Card: {perk['name']}.")
            return True

        # Check Yeti children
        y_state = self.monster_states.get("Yeti")
        child = next((c for c in y_state["children"] if f"Yeti Child {c['id']}" == legend_name and not c["rescued"]), None) if y_state else None
        if child:
            legend_loc = child["location"]
            valid = False
            if legend_loc == current_loc:
                if target in adjacent_to_hero:
                    valid = True
            elif legend_loc in adjacent_to_hero:
                if target == current_loc:
                    valid = True

            if not valid or state["ap"] < 1:
                self.add_log(f"Invalid Guide action for {legend_name}.")
                return False

            child["location"] = target
            state["ap"] -= 1
            self.add_log(f"{player_name} guided Yeti Child {child['id']} to {target}.")

            # Reaching the True Cave is not enough on its own - a separate Advance action
            # places the child on the Yeti's mat (two distinct actions, per the rules).
            true_cave_loc = self._get_true_lair_location("yeti")
            if target == true_cave_loc:
                self.add_log(f"Yeti Child {child['id']} has reached the Yeti's Cave! Advance there to place it on the mat.")
            return True

        self.add_log(f"Legend {legend_name} not found or not active.")
        return False

    def execute_pickup(self, player_name: str, item_ids: List[str]):
        if not self.check_turn(player_name):
            return False

        state = self.heroes_state[player_name]
        loc = state["location"]

        if state["ap"] < 1 or not item_ids:
            return False

        items_to_take = []
        for item_id in item_ids:
            found = None
            for item in self.items_on_board[loc]:
                if item["id"] == item_id:
                    found = item
                    break
            if not found:
                return False
            items_to_take.append(found)

        for item in items_to_take:
            self.items_on_board[loc].remove(item)
            state["items"].append(item)
            self.add_log(f"{player_name} picked up {item['name']} ({item['color']} {item['strength']}).")

        state["ap"] -= 1
        return items_to_take

    def execute_share(self, player_name: str, target_name: str, give_item_ids: List[str], take_item_ids: List[str]) -> bool:
        if not self.check_turn(player_name):
            return False

        h1 = self.heroes_state[player_name]
        h2 = self.heroes_state[target_name]

        # Share requires both heroes at the same location (unless a Perk card bypasses it)
        if h1["location"] != h2["location"] and not self.active_perks_limit.get("global_share", False):
            return False

        if h1["ap"] < 1:
            return False

        # Move items
        giving = []
        for iid in give_item_ids:
            item = next((i for i in h1["items"] if i["id"] == iid), None)
            if not item:
                return False
            giving.append(item)

        taking = []
        for iid in take_item_ids:
            item = next((i for i in h2["items"] if i["id"] == iid), None)
            if not item:
                return False
            taking.append(item)

        for item in giving:
            h1["items"].remove(item)
            h2["items"].append(item)
        for item in taking:
            h2["items"].remove(item)
            h1["items"].append(item)

        h1["ap"] -= 1
        self.add_log(f"{player_name} shared items with {target_name}.")
        return True
