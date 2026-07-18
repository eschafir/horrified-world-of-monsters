"""Room construction, logging/toast helpers, and initialize_game (the "start game" setup)."""
import copy
import random
import time
import uuid
from typing import Dict, List, Optional

from src.data_loader import FRENZY_ORDER, HERO_CLASSES, ITEMS_POOL, MONSTER_CARDS, MONSTER_CATALOG, PERK_CARDS, load_map_coordinates


class LifecycleMixin:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.selected_map = "Map.png"
        self.node_coordinates, self.terror_track_coordinates, self.adjacency_list = load_map_coordinates(self.selected_map)
        self.players: List[Dict] = []  # list of {"sid": str, "name": str, "hero": str, "is_host": bool, "ws": WebSocket}
        self.game_started = False
        self.terror_level = 0
        self.deck: List[Dict] = []
        self.discard: List[Dict] = []
        self.discarded_items: List[Dict] = []
        self.committed_items: Dict[str, List[Dict]] = {}  # monster -> items invested in its Advance puzzle, not yet discarded
        self.item_bag: List[Dict] = []
        self.perk_deck: List[Dict] = []
        self.active_monsters: List[str] = []
        self.defeated_monsters: List[str] = []
        self.selected_monsters: List[str] = ["Yeti", "Jiangshi"]  # lobby pick, host-controlled, visible to all
        self.pending_dice_roll = None
        self.roll_event = None
        self.pending_block_choice = None  # non-dice attack sources (e.g. a monster Power) that target one hero directly
        self.block_choice_event = None
        self.skip_monster_phase = False  # set by the Lunar Oscillator Perk card

        # Board entities
        self.heroes_state: Dict[str, Dict] = {}  # player_name -> state
        self.items_on_board: Dict[str, List[Dict]] = {loc: [] for loc in self.adjacency_list.keys()}
        self.citizens: Dict[str, Dict] = {}
        self.monster_locations: Dict[str, str] = {}
        self.monster_states: Dict[str, Dict] = {}
        self.lair_tokens: List[Dict] = []

        self.turn_player_idx = 0
        self.game_phase = "Lobby"
        self.current_card: Optional[Dict] = None
        self.combat_rolls: List[str] = []
        self.log: List[str] = []
        self.game_start_time: Optional[float] = None  # Unix timestamp, set once the game actually starts
        self.game_end_time: Optional[float] = None  # set once GameOverWin/GameOverLose is reached, freezes the timer
        self.active_perks_limit = {}  # prevents double-use
        self.frenzy_marker = ""  # which monster has frenzy token
        self.power_events: List[Dict] = []  # rolling feed of resolved monster Powers, for client-side toast notifications
        self.citizen_events: List[Dict] = []  # rolling feed of citizen spawns, for client-side toast notifications
        self.citizen_attack_events: List[Dict] = []  # rolling feed of monster-vs-citizen dice rolls, for an on-map marker
        self.item_discard_events: List[Dict] = []  # rolling feed of a monster clearing items off the map, for a fly-to-discard-pile animation

    def add_log(self, msg: str):
        self.log.append(msg)
        if len(self.log) > 50:
            self.log.pop(0)

    def add_power_event(self, monster: str, power_name: str, message: str):
        """Records a resolved monster Power so the client can show a toast, instead of
        players just noticing missing items or a Terror bump with no visible cause."""
        self.power_events.append({
            "id": str(uuid.uuid4())[:8],
            "monster": monster,
            "power_name": power_name,
            "message": message
        })
        if len(self.power_events) > 20:
            self.power_events.pop(0)

    def add_citizen_event(self, citizen_name: str, message: str):
        """Records a citizen spawn so the client can show a toast with its portrait."""
        portrait = self.citizens.get(citizen_name, {}).get("portrait", f"{citizen_name}.png")
        self.citizen_events.append({
            "id": str(uuid.uuid4())[:8],
            "citizen": citizen_name,
            "portrait": portrait,
            "message": message
        })
        if len(self.citizen_events) > 20:
            self.citizen_events.pop(0)

    def add_citizen_attack_event(self, monster: str, citizen_name: str, location: str, rolls: list, hit: bool):
        """Records a monster's dice roll against a citizen, with where it happened, so the
        client can pop a small on-map marker there - a Terror bump and a vanished citizen
        are otherwise silent, with no visible cause other than digging through the log."""
        self.citizen_attack_events.append({
            "id": str(uuid.uuid4())[:8],
            "monster": monster,
            "citizen": citizen_name,
            "location": location,
            "rolls": rolls,
            "hit": hit,
        })
        if len(self.citizen_attack_events) > 20:
            self.citizen_attack_events.pop(0)

    def add_item_discard_event(self, monster: str, location: str, items: list):
        """Records a monster sweeping items off a board space straight into the discard
        pile, so the client can animate them flying there instead of just vanishing."""
        self.item_discard_events.append({
            "id": str(uuid.uuid4())[:8],
            "monster": monster,
            "location": location,
            "items": items,
        })
        if len(self.item_discard_events) > 20:
            self.item_discard_events.pop(0)

    def _get_monster_home_location(self, monster: str) -> Optional[str]:
        """The monster's own starting location, in its origin map's terms, read from its
        catalog's phase-1 PlaceMonster setup step (falls back to None if absent, e.g. a
        scaffolded-but-not-yet-implemented monster with no setup data)."""
        entry = MONSTER_CATALOG.get(monster)
        if not entry:
            return None
        phases = entry.get("phases") or [{}]
        for step in phases[0].get("setup", []):
            if step.get("action") == "PlaceMonster" and step.get("locations"):
                return step["locations"][0]
        return None

    def initialize_game(self, chosen_monsters: List[str]):
        self.active_monsters = sorted(chosen_monsters, key=lambda m: FRENZY_ORDER.get(m, 99))
        self.terror_level = 0
        self.defeated_monsters = []
        self.game_phase = "HeroPhase"
        self.turn_player_idx = 0
        self.combat_rolls = []
        self.log = []
        self.current_card = None

        # Set up item bag
        self.item_bag = copy.deepcopy(ITEMS_POOL)
        random.shuffle(self.item_bag)
        self.discarded_items = []
        self.committed_items = {}

        # Set up decks
        self.deck = copy.deepcopy(MONSTER_CARDS)
        random.shuffle(self.deck)
        self.discard = []
        # Each Perk card is duplicated once (10 unique -> 20 physical cards in the deck).
        # Every copy gets a unique instance id so a hand holding both copies of the same
        # Perk can still unambiguously reference either one.
        self.perk_deck = copy.deepcopy(PERK_CARDS) + copy.deepcopy(PERK_CARDS)
        for i, card in enumerate(self.perk_deck):
            card["id"] = f"{card['id']}-{i}"
        random.shuffle(self.perk_deck)

        # Reset locations
        self.items_on_board = {loc: [] for loc in self.adjacency_list.keys()}

        # Spawn initial 12 items
        for _ in range(12):
            self.spawn_item()

        # Initialize heroes
        self.heroes_state = {}

        # Determine local heroes not in use
        used_heroes = [p["hero"] for p in self.players]
        unused_local_heroes = [h for h, cfg in HERO_CLASSES.items() if cfg.get("origin_map", "Map.png") == self.selected_map and h not in used_heroes]
        unused_local_locations = [HERO_CLASSES[h]["start"] for h in unused_local_heroes]

        for p in self.players:
            hero_class = p["hero"]
            config = HERO_CLASSES[hero_class]

            is_guest = (config.get("origin_map", "Map.png") != self.selected_map)
            if is_guest and unused_local_locations:
                start_loc = random.choice(unused_local_locations)
                unused_local_locations.remove(start_loc)
            else:
                start_loc = config["start"]

            starting_perk = [self.perk_deck.pop(0)] if self.perk_deck else []
            self.heroes_state[p["name"]] = {
                "name": p["name"],
                "hero": hero_class,
                "location": self.get_safe_loc(start_loc),
                "items": [],
                "perks": starting_perk,
                "ap": config["ap"],
                "max_ap": config["ap"],
                "ability_used": False
            }

        # Initialize citizens. "portrait" points at the actual filename in
        # Images/Citizens/ (names don't all slugify cleanly, e.g. "Dr. Weir" ->
        # dr_weir.png, and Raimi's art is a .jpg), so the client never has to guess.
        self.citizens = {
            "Ms. Spindlewood": {"name": "Ms. Spindlewood", "location": "Board", "start": self.get_safe_loc("House of Dusk"), "safe": self.get_safe_loc("Spindlewood Institute"), "active": False, "portrait": "ms_spindlewood.png"},
            "Mari": {"name": "Mari", "location": "Board", "start": self.get_safe_loc("The Fool's Journey"), "safe": self.get_safe_loc("House of Dawn"), "active": False, "portrait": "Mari.png"},
            "Howard": {"name": "Howard", "location": "Board", "start": self.get_safe_loc("Stewards Spire"), "safe": self.get_safe_loc("The Roaming Wolf"), "active": False, "portrait": "Howard.png"},
            "Dr. Weir": {"name": "Dr. Weir", "location": "Board", "start": self.get_safe_loc("Skybound Galleon"), "safe": self.get_safe_loc("Weir's Observatory"), "active": False, "portrait": "dr_weir.png"},
            "Shinya": {"name": "Shinya", "location": "Board", "start": self.get_safe_loc("Arcane Forge"), "safe": self.get_safe_loc("Steam Plant"), "active": False, "portrait": "Shinya.png"},
            "James & Betty": {"name": "James & Betty", "location": "Board", "start": self.get_safe_loc("South Station"), "safe": self.get_safe_loc("Door of the World"), "active": False, "portrait": "James_Betty.png"},
            "Morgan": {"name": "Morgan", "location": "Board", "start": self.get_safe_loc("Mary's Mill"), "safe": self.get_safe_loc("The Fool's Journey"), "active": False, "portrait": "Morgan.png"},
            "Vaughn": {"name": "Vaughn", "location": "Board", "start": self.get_safe_loc("House of Dawn"), "safe": self.get_safe_loc("The Scuttled Siren"), "active": False, "portrait": "Vaughn.png"},
            "Jennifer": {"name": "Jennifer", "location": "Board", "start": self.get_safe_loc("Clockwork Village"), "safe": self.get_safe_loc("Stilt Town"), "active": False, "portrait": "Jennifer.png"},
            "Raimi": {"name": "Raimi", "location": "Board", "start": self.get_safe_loc("Thornvine Woods"), "safe": self.get_safe_loc("Specter Trail Caravan"), "active": False, "portrait": "Raimi.jpg"}
        }

        # Lair Tokens: a single shared pool of 4 fixed board locations. Exactly one hides
        # the true Yeti Cave (if Yeti is active), one hides the true Jiangshi Moon Shrine
        # (if Jiangshi is active), and the rest are blank decoys - matching the physical
        # Lair Token art (yeti/jiangshi/blank backs). Only ever 4 tokens total, regardless
        # of which of those two monsters are in play.
        self.lair_tokens = []
        if "Yeti" in self.active_monsters or "Jiangshi" in self.active_monsters:
            lair_locs = ["Spindlewood Institute", "Garden of the Risen", "Thornvine Woods", "Door of the World"]
            random.shuffle(lair_locs)
            lair_types = []
            if "Yeti" in self.active_monsters:
                lair_types.append("yeti")
            if "Jiangshi" in self.active_monsters:
                lair_types.append("jiangshi")
            while len(lair_types) < 4:
                lair_types.append("blank")
            random.shuffle(lair_types)
            self.lair_tokens = [
                {"location": lair_locs[i], "type": lair_types[i], "revealed": False}
                for i in range(4)
            ]
            print(f"DEBUG - Lair Tokens: {[(t['location'], t['type']) for t in self.lair_tokens]}")

        # Initialize monster states

        # Guest monsters (whose catalog origin_map differs from the selected map) spawn
        # at the home location of a local monster that isn't currently in play, mirroring
        # how guest heroes use an unused local hero's start location (see hero setup above).
        unused_local_monster_locations = [
            loc for loc in (
                self._get_monster_home_location(m) for m, cat in MONSTER_CATALOG.items()
                if cat.get("origin_map", "Map.png") == self.selected_map
                and cat.get("selectable", True)
                and m not in self.active_monsters
            ) if loc
        ]

        self.monster_locations = {}
        self.monster_states = {}
        for monster in self.active_monsters:
            home_loc = self._get_monster_home_location(monster) or "The Roaming Wolf"
            is_guest = MONSTER_CATALOG.get(monster, {}).get("origin_map", "Map.png") != self.selected_map
            if is_guest and unused_local_monster_locations:
                start_loc = random.choice(unused_local_monster_locations)
                unused_local_monster_locations.remove(start_loc)
            else:
                start_loc = home_loc
            self.monster_locations[monster] = self.get_safe_loc(start_loc)
            if monster == "Yeti":

                child_locs = [self.get_safe_loc("House of Dusk"), self.get_safe_loc("Thornvine Woods"), self.get_safe_loc("Stewards Spire")]
                random.shuffle(child_locs)
                self.monster_states["Yeti"] = {
                    "children": [
                        {"id": 1, "location": child_locs[0], "rescued": False, "rescued_order": None},
                        {"id": 2, "location": child_locs[1], "rescued": False, "rescued_order": None},
                        {"id": 3, "location": child_locs[2], "rescued": False, "rescued_order": None}
                    ]
                }
            elif monster == "Jiangshi":

                # The Coin Sword pattern: 3 slots, each filled by discarding an item whose
                # strength exactly matches that slot's target.
                self.monster_states["Jiangshi"] = {
                    "sword_slots": [
                        {"id": 0, "target_strength": 2, "filled": False, "item": None},
                        {"id": 1, "target_strength": 3, "filled": False, "item": None},
                        {"id": 2, "target_strength": 4, "filled": False, "item": None}
                    ]
                }
            elif monster == "Sphinx":
                # 2x3 riddle grid (2 rows, 3 columns): row/column sums must match the
                # printed targets exactly. Cell 0 is auto-filled and locked at setup, per
                # the Sphinx's rules.
                starter_item = self._draw_bagged_item()
                grid = [{"id": i, "filled": False, "item": None, "locked": False} for i in range(6)]
                if starter_item:
                    grid[0] = {"id": 0, "filled": True, "item": starter_item, "locked": True}
                    self._commit_item("Sphinx", starter_item)
                self.monster_states["Sphinx"] = {
                    "grid": grid,
                    "row_targets": [11, 10],
                    "col_targets": [7, 5, 9],
                    "solved": False
                }
            elif monster == "Cthulhu":
                # Cthulhu has two phases. Phase 1: rotate 3 color dials (cumulative discarded
                # strength) to their targets to open the portal, then lure Cthulhu to the Void.
                self.monster_states["Cthulhu"] = {
                    "phase": 1,
                    "dials": [
                        {"color": "Purple", "target": 9, "progress": 0},
                        {"color": "Green", "target": 6, "progress": 0},
                        {"color": "Blue", "target": 6, "progress": 0}
                    ],
                    "portal_open": False,
                    # Corpse City steps
                    "corpse_city_track": ["Entrance", "Gates of Madness", "Sea of Slumber", "Cthulhu's Heart"],
                    "player_tracks": {},  # player_name -> step index (-1 if on main board)
                    "current_item": None,
                    "manacles_placed": 0,
                    "bind_progress": {}  # player_name -> {"color", "progress"}
                }
                for p in self.players:
                    self.monster_states["Cthulhu"]["player_tracks"][p["name"]] = -1
            elif monster == "Siren":
                # Greek letters for the matching game (4 pairs = 8 squares)
                letters = ["Alpha", "Beta", "Gamma", "Delta", "Alpha", "Beta", "Gamma", "Delta"]
                random.shuffle(letters)
                self.monster_states["Siren"] = {
                    "squares": [
                        {"id": i, "letter": letter, "flipped": False, "matched": False}
                        for i, letter in enumerate(letters)
                    ],
                    "currently_flipping": [],
                    "pending_flips": 0
                }

        if self.active_monsters:
            self.frenzy_marker = self.active_monsters[0]

        self.game_started = True
        self.game_start_time = time.time()
        self.game_end_time = None
        self.add_log("The game has begun! Protect the town and defeat the monsters.")
