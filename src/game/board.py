"""Board/item/location utilities, state serialization, and coordinate persistence."""
import random
import uuid
from typing import Dict, List, Optional

from src.data_loader import GREEK_LOCATION_MAP, MONSTER_CATALOG, save_map_coordinates


class BoardMixin:
    def spawn_item(self):
        if not self.item_bag:
            return
        item = self.item_bag.pop(0)
        item["id"] = str(uuid.uuid4())[:8]
        loc = self.get_safe_loc(item["location"])
        item["location"] = loc
        if loc not in self.items_on_board:
            self.items_on_board[loc] = []
        self.items_on_board[loc].append(item)

    def _draw_bagged_item(self) -> Optional[Dict]:
        """Pops one item from the bag without placing it on the board (e.g. Sphinx's
        locked starter cell, Cthulhu's controlled item)."""
        if not self.item_bag:
            return None
        item = self.item_bag.pop(0)
        item["id"] = str(uuid.uuid4())[:8]
        return item

    def get_safe_loc(self, loc: str) -> str:
        if not self.adjacency_list:
            return loc
        if loc in self.adjacency_list or loc in ["Board", "Defeated"]:
            return loc

        mapped = GREEK_LOCATION_MAP.get(loc, loc)
        if mapped in self.adjacency_list:
            return mapped

        return random.choice(list(self.adjacency_list.keys()))

    def _get_true_lair_location(self, kind: str) -> Optional[str]:
        """kind is 'yeti' or 'jiangshi'. Returns that Lair Token's location, if any."""
        token = next((t for t in self.lair_tokens if t["type"] == kind), None)
        return token["location"] if token else None

    def _bfs_distances(self, start: str) -> Dict[str, int]:
        """Shortest-path distance (in steps) from start to every reachable location."""
        distances = {start: 0}
        queue = [start]
        while queue:
            node = queue.pop(0)
            for neighbor in self.adjacency_list.get(node, []):
                if neighbor not in distances:
                    distances[neighbor] = distances[node] + 1
                    queue.append(neighbor)
        return distances

    def get_serializable_state(self) -> Dict:
        return {
            "room_code": self.room_code,
            "selected_map": self.selected_map,
            "game_started": self.game_started,
            "game_phase": self.game_phase,
            "game_start_time": self.game_start_time,
            "game_end_time": self.game_end_time,
            "terror_level": self.terror_level,
            "deck_count": len(self.deck),
            "active_monsters": self.active_monsters,
            "defeated_monsters": self.defeated_monsters,
            "selected_monsters": self.selected_monsters,
            "frenzy_marker": self.frenzy_marker,
            "power_events": self.power_events,
            "citizen_events": self.citizen_events,
            "citizen_attack_events": self.citizen_attack_events,
            "heroes_state": self.heroes_state,
            "items_on_board": self.items_on_board,
            "discarded_items": self.discarded_items,
            "citizens": {k: v for k, v in self.citizens.items() if v["active"] or v["location"] != "Board"},
            "monster_locations": self.monster_locations,
            "monster_states": self.monster_states,
            "lair_tokens": self.lair_tokens,
            "pending_dice_roll": self.pending_dice_roll,
            "pending_block_choice": self.pending_block_choice,
            "turn_player_idx": self.turn_player_idx,
            "current_card": self.current_card,
            "combat_rolls": self.combat_rolls,
            "log": self.log,
            "players": [{"name": p["name"], "hero": p["hero"], "is_host": p["is_host"]} for p in self.players],
            "node_coordinates": self.node_coordinates,
            "adjacency_list": self.adjacency_list,
            "terror_track_coordinates": self.terror_track_coordinates,
            "monster_catalog": MONSTER_CATALOG
        }

    def update_coordinates(self, coords: Dict, terror_coords: List = None, adjacency: Dict = None):
        if coords:
            self.node_coordinates = coords
        if terror_coords:
            self.terror_track_coordinates = terror_coords
        if adjacency:
            self.adjacency_list = adjacency
        save_map_coordinates(self.selected_map, self.node_coordinates, self.terror_track_coordinates, self.adjacency_list)
