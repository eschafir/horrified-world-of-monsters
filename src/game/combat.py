"""Hit/dice/Power resolution: direct hits, citizen defeats, block-choice pauses, monster
Powers, and the dice-roll attack flow against heroes and citizens."""
import asyncio
import random
import uuid


class CombatMixin:
    def _apply_direct_hit(self, hero_name: str):
        """Applies one unblockable-except-by-Security hit to a hero (used by attacks that
        have already resolved their block choice, and by monster Powers)."""
        if self.active_perks_limit.get("block_all_hits", False):
            return
        h_state = self.heroes_state[hero_name]
        self.terror_level = min(7, self.terror_level + 1)
        self.add_log(f"{hero_name} was DEFEATED by the attack!")
        self.check_terror()
        # get_safe_loc resolves this through the Greek-map location table when needed,
        # instead of always respawning at the American map's literal "Reviving Throne".
        respawn_loc = self.get_safe_loc("Reviving Throne")
        h_state["location"] = respawn_loc
        self.add_log(f"{hero_name} respawns at {respawn_loc}.")
        if "Cthulhu" in self.active_monsters:
            self.monster_states["Cthulhu"]["player_tracks"][hero_name] = -1

    def _defeat_citizen(self, citizen_name: str, monster: str = None):
        self.citizens[citizen_name]["active"] = False
        self.citizens[citizen_name]["location"] = "Defeated"
        self.add_log(f"Citizen {citizen_name} was DEFEATED by the attack!")
        self.terror_level = min(7, self.terror_level + 1)
        self.check_terror()
        if monster:
            self.add_power_event(monster, "Citizen Defeated", f"{citizen_name} was defeated by the {monster}!")

    async def request_block_choice(self, hero_name: str, hits: int, reason: str, broadcast_fn=None) -> bool:
        """Pauses to let hero_name pick item(s) to block `hits` hit(s) from a non-dice
        attack source (e.g. a monster Power). Returns True if the hit was blocked."""
        if self.active_perks_limit.get("block_all_hits", False):
            return True

        self.pending_block_choice = {
            "id": str(uuid.uuid4()),
            "hero": hero_name,
            "hits": hits,
            "reason": reason,
        }
        if self.block_choice_event is None:
            self.block_choice_event = asyncio.Event()
        self.block_choice_event.clear()

        if broadcast_fn:
            await broadcast_fn()

        # Block this async task until the player sends finish_block_choice
        await self.block_choice_event.wait()

        chosen_items = self.pending_block_choice.get("chosen_items")
        self.pending_block_choice = None

        h_state = self.heroes_state[hero_name]
        matched_items = []
        if chosen_items is not None:
            for i_id in chosen_items:
                item = next((i for i in h_state["items"] if i["id"] == i_id), None)
                if item and item not in matched_items:
                    matched_items.append(item)

        if chosen_items is not None and len(matched_items) >= hits:
            for item in matched_items:
                h_state["items"].remove(item)
                self.discarded_items.append(item)
                self.add_log(f"{hero_name} discarded {item['name']} to block the {reason}.")
            return True
        return False

    async def trigger_monster_power(self, monster: str, broadcast_fn=None):
        if monster == "Yeti":
            yeti_loc = self.monster_locations["Yeti"]
            distances = self._bfs_distances(yeti_loc)

            candidates = []  # (distance, name, kind) - only the single closest target is struck
            for hero_name, h_state in self.heroes_state.items():
                if h_state["location"] != yeti_loc:
                    candidates.append((distances.get(h_state["location"], 999), hero_name, "hero"))
            for cit_name, cit in self.citizens.items():
                if cit["active"] and cit["location"] not in ("Board", "Rescued", "Defeated") and cit["location"] != yeti_loc:
                    candidates.append((distances.get(cit["location"], 999), cit_name, "citizen"))

            if candidates:
                # Nearest first; ties (same location) prefer Heroes over Citizens, then alphabetical
                candidates.sort(key=lambda c: (c[0], 0 if c[2] == "hero" else 1, c[1]))
                _, target_name, kind = candidates[0]
                if kind == "hero":
                    blocked = False
                    if self.heroes_state[target_name]["items"]:
                        blocked = await self.request_block_choice(target_name, 1, "Snow Blast", broadcast_fn)
                    if blocked:
                        msg = f"Snow Blast! {target_name} blocked the freezing wind by discarding an item."
                    else:
                        self._apply_direct_hit(target_name)
                        msg = f"Snow Blast! {target_name} (closest to the Yeti) is struck by freezing wind."
                else:
                    self._defeat_citizen(target_name)
                    msg = f"Snow Blast! {target_name} (closest to the Yeti) is struck by freezing wind."
            else:
                msg = "Snow Blast has no effect — everyone is with the Yeti."
            self.add_log(msg)
            self.add_power_event("Yeti", "Snow Blast", msg)

        elif monster == "Sphinx":
            all_items = [(h_name, item) for h_name, h_state in self.heroes_state.items() for item in h_state["items"]]
            pair = None
            for i in range(len(all_items)):
                for j in range(i + 1, len(all_items)):
                    if all_items[i][1]["strength"] == all_items[j][1]["strength"]:
                        if pair is None or all_items[i][1]["strength"] < pair[0][1]["strength"]:
                            pair = (all_items[i], all_items[j])
            if pair:
                for h_name, item in pair:
                    self.heroes_state[h_name]["items"].remove(item)
                    self.discarded_items.append(item)
                msg = f"Lethal Conundrum! {pair[0][0]} and {pair[1][0]} discard matching strength-{pair[0][1]['strength']} items."
                self.add_log(msg)
                self.add_power_event("Sphinx", "Lethal Conundrum", msg)
            else:
                self.terror_level = min(7, self.terror_level + 1)
                self.check_terror()
                msg = "Lethal Conundrum! No matching items to sacrifice — Terror Level increases by 1."
                self.add_log(msg)
                self.add_power_event("Sphinx", "Lethal Conundrum", msg)

        elif monster == "Jiangshi" and self.players:
            next_idx = (self.turn_player_idx + 1) % len(self.players)
            next_player = self.players[next_idx]["name"]
            self.monster_locations["Jiangshi"] = self.heroes_state[next_player]["location"]
            self.add_log(f"Drain Vital Energy! Jiangshi is drawn to {next_player}'s location.")

        elif monster == "Cthulhu":
            cth_state = self.monster_states["Cthulhu"]
            if cth_state["phase"] == 1:
                if len(self.deck) > 5:
                    discarded = self.deck.pop()
                    self.discard.append(discarded)
                    self.add_log(f"Touch of Madness! The top Monster Card ({discarded['name']}) is discarded.")
                else:
                    self.terror_level = min(7, self.terror_level + 1)
                    self.check_terror()
                    self.add_log("Touch of Madness! The Monster deck is too thin to risk — Terror Level increases by 1.")
            else:
                old_item = cth_state["current_item"]
                cth_state["current_item"] = self._draw_bagged_item()
                if old_item:
                    self.discarded_items.append(old_item)
                new_item = cth_state["current_item"]
                if new_item:
                    track_idx = {"Blue": 0, "Green": 1, "Purple": 2}.get(new_item["color"])
                    struck = []
                    for hero_name, h_state in self.heroes_state.items():
                        if cth_state["player_tracks"].get(hero_name, -1) != track_idx:
                            continue
                        block_item = next((i for i in h_state["items"] if i["color"] == new_item["color"]), None)
                        if block_item:
                            h_state["items"].remove(block_item)
                            self.discarded_items.append(block_item)
                            self.add_log(f"{hero_name} discards {block_item['name']} to block the tentacles.")
                        else:
                            self._apply_direct_hit(hero_name)
                            struck.append(hero_name)
                    self.add_log(f"Tentacles of Insanity! Cthulhu now controls {new_item['name']} ({new_item['color']} {new_item['strength']}).")

        if broadcast_fn:
            await broadcast_fn()

    async def perform_attack(self, monster: str, hero_name: str, dice: int, broadcast_fn=None):
        self.add_log(f"{monster} is attacking {hero_name}!")
        self.combat_rolls = []

        if self.active_perks_limit.get("block_all_hits", False):
            self.add_log(f"Security Perk blocked all damage from the attack on {hero_name}.")
            return

        hits = 0
        powers = 0

        for _ in range(dice):
            roll = random.choice(["Hit", "Hit", "Power", "Blank", "Blank", "Blank"])
            self.combat_rolls.append(roll)
            if roll == "Hit":
                hits += 1
            elif roll == "Power":
                powers += 1

        # Pause and wait for player to roll dice on the frontend
        if dice > 0:
            self.pending_dice_roll = {
                "id": str(uuid.uuid4()),
                "hero": hero_name,
                "monster": monster,
                "dice": dice,
                "results": self.combat_rolls
            }
            if self.roll_event is None:
                self.roll_event = asyncio.Event()
            self.roll_event.clear()

            if broadcast_fn:
                await broadcast_fn()

            # Block this async task until the player sends finish_dice_roll
            await self.roll_event.wait()

            chosen_items = self.pending_dice_roll.get("chosen_items")
            self.pending_dice_roll = None

        self.add_log(f"Roll results: {', '.join(self.combat_rolls)} (Hits: {hits}, Power: {powers})")

        if hits > 0:
            h_state = self.heroes_state[hero_name]

            # One item per Hit rolled blocks the attack entirely - strength doesn't
            # matter, only having enough items to discard.
            matched_items = []
            if chosen_items is not None:
                for i_id in chosen_items:
                    item = next((i for i in h_state["items"] if i["id"] == i_id), None)
                    if item and item not in matched_items:
                        matched_items.append(item)

            if chosen_items is not None and len(matched_items) >= hits:
                for item in matched_items:
                    h_state["items"].remove(item)
                    self.discarded_items.append(item)
                    self.add_log(f"{hero_name} discarded {item['name']} to block the attack.")
            else:
                if chosen_items is not None:
                    self.add_log(f"Not enough items selected to block {hits} hit(s) - the attack lands.")
                self._apply_direct_hit(hero_name)

        if powers > 0:
            self.add_log(f"Power rolled {powers} time(s)! {monster}'s Power activates {powers} time(s).")
            for _ in range(powers):
                await self.trigger_monster_power(monster, broadcast_fn)

        if broadcast_fn:
            await broadcast_fn()

    async def perform_attack_citizen(self, monster: str, citizen_name: str, dice: int, broadcast_fn=None):
        self.add_log(f"{monster} is attacking {citizen_name}!")
        attack_loc = self.citizens[citizen_name]["location"]

        hits = 0
        powers = 0
        rolls = []
        for _ in range(dice):
            roll = random.choice(["Hit", "Hit", "Power", "Blank", "Blank", "Blank"])
            rolls.append(roll)
            if roll == "Hit":
                hits += 1
            elif roll == "Power":
                powers += 1

        self.add_citizen_attack_event(monster, citizen_name, attack_loc, rolls, hits > 0)

        if hits > 0:
            self._defeat_citizen(citizen_name, monster=monster)
        else:
            self.add_log(f"The attack on {citizen_name} missed!")

        if powers > 0:
            self.add_log(f"Power rolled {powers} time(s)! {monster}'s Power activates {powers} time(s).")
            for _ in range(powers):
                await self.trigger_monster_power(monster, broadcast_fn)
