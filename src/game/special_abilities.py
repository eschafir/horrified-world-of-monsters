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
                top_card = self.deck[-1]
                self.add_log(f"[The Fortune Teller] Peaked at the top Monster Card: {top_card['name']} (Spawns {top_card['spawn']} items).")
                h_state["ability_used"] = True
                return True
            else:
                self.add_log("No cards left in the Monster deck.")
                return False

        return False

    def execute_play_perk(self, player_name: str, perk_id: str, args: Dict) -> bool:
        if self.game_phase not in ["HeroPhase", "MonsterPhase"]:
            return False

        player_state = self.heroes_state.get(player_name)
        if not player_state:
            return False

        perk = next((p for p in player_state["perks"] if p["id"] == perk_id), None)
        if not perk:
            return False

        activated = False
        if perk["name"] == "Swiftness":
            target_hero = args.get("target_hero")
            dest = args.get("destination")
            if target_hero in self.heroes_state and dest in self.adjacency_list:
                self.heroes_state[target_hero]["location"] = dest
                self.add_log(f"Perk (Swiftness) used: Moved {target_hero} to {dest}.")
                activated = True

        elif perk["name"] == "Security":
            self.active_perks_limit["block_all_hits"] = True
            self.add_log("Perk (Security) activated: The next attack's hits will be ignored.")
            activated = True

        elif perk["name"] == "Search":
            self.spawn_item()
            self.spawn_item()
            self.add_log(f"Perk (Search) activated: Spawned 2 items at {player_state['location']}.")
            activated = True

        elif perk["name"] == "Share":
            self.active_perks_limit["global_share"] = True
            self.add_log("Perk (Share) activated: Trade items with anyone anywhere on the board.")
            activated = True

        elif perk["name"] == "Insight":
            if len(self.deck) >= 3:
                top3 = [self.deck.pop() for _ in range(3)]
                top3.reverse()
                self.deck.extend(top3)
                self.add_log("Perk (Insight) activated: Rearranged top 3 cards of Monster Deck.")
                activated = True

        elif perk["name"] == "Restoration":
            active_p = self.get_active_player()
            if active_p:
                self.heroes_state[active_p["name"]]["ap"] = 4
                self.add_log(f"Perk (Restoration) activated: {active_p['name']}'s AP restored to 4.")
                activated = True

        if activated:
            player_state["perks"].remove(perk)
            return True
        return False
