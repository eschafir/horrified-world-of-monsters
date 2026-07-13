import json
import random
import uuid
import asyncio
from typing import Dict, List, Set, Optional, Tuple
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# ---------------------------------------------------------
# GAME CONFIGURATION CONSTANTS
# ---------------------------------------------------------

ADJACENCY_LIST = {
    "North Station": ["Specter Trail Caravan"],
    "Specter Trail Caravan": ["North Station", "Spindlewood Institute", "Crossroads Center", "Reviving Throne"],
    "Reviving Throne": ["Specter Trail Caravan"],
    "Spindlewood Institute": ["Specter Trail Caravan", "Steam Plant", "Crossroads West"],
    "Crossroads West": ["Spindlewood Institute", "Skybound Galleon", "Steam Plant"],
    "Steam Plant": ["Crossroads West", "Spindlewood Institute", "Crossroads Center", "Stilt Town"],
    "Crossroads Center": ["Steam Plant", "Specter Trail Caravan", "Mary's Mill"],
    "Stilt Town": ["Steam Plant", "The Void"],
    "The Void": ["Skybound Galleon", "Thornvine Woods", "Stilt Town"],
    "Skybound Galleon": ["Crossroads West", "The Void", "The Scuttled Siren"],
    "The Scuttled Siren": ["Skybound Galleon", "Clockwork Village", "Garden of the Risen"],
    "Clockwork Village": ["House of Dusk", "Arcane Forge", "The Fool's Journey", "The Scuttled Siren"],
    "House of Dusk": ["Clockwork Village"],
    "Arcane Forge": ["Clockwork Village"],
    "The Fool's Journey": ["Clockwork Village", "Garden of the Risen"],
    "Garden of the Risen": ["The Fool's Journey", "The Scuttled Siren", "Stewards Spire"],
    "Stewards Spire": ["Thornvine Woods", "Crossroads East", "Garden of the Risen", "South Station"],
    "South Station": ["Stewards Spire"],
    "Thornvine Woods": ["The Void", "Stewards Spire"],
    "Crossroads East": ["Weir's Observatory", "Mary's Mill", "Stewards Spire"],
    "Weir's Observatory": ["Crossroads East"],
    "Mary's Mill": ["Crossroads Center", "Door of the World", "House of Dawn", "Crossroads East"],
    "Door of the World": ["Mary's Mill", "The Roaming Wolf"],
    "The Roaming Wolf": ["Door of the World", "House of Dawn"],
    "House of Dawn": ["Mary's Mill", "The Roaming Wolf"]
}

# Thematic positions for nodes and banners on the new Map.png layout (1304x1206)
NODE_COORDINATES = {
    "The Void": {"x": 648, "y": 641, "bx": 612, "by": 735, "r": 100, "rw": 80, "rh": 34},
    "North Station": {"x": 267, "y": 136, "bx": 231, "by": 214, "r": 83, "rw": 106, "rh": 34},
    "Specter Trail Caravan": {"x": 498, "y": 250, "bx": 493, "by": 163, "rw": 96, "rh": 34, "r": 99},
    "Reviving Throne": {"x": 705, "y": 173, "bx": 599, "by": 143, "rw": 80, "rh": 34, "r": 91},
    "Spindlewood Institute": {"x": 128, "y": 349, "bx": 200, "by": 439, "rw": 98, "rh": 34, "r": 94},
    "Crossroads West": {"x": 348, "y": 494, "bx": 289, "by": 523, "rw": 96, "rh": 34, "r": 72},
    "Steam Plant": {"x": 546, "y": 425, "bx": 535, "by": 541, "r": 88, "rw": 102, "rh": 34},
    "Crossroads Center": {"x": 768, "y": 328, "bx": 777, "by": 368, "rw": 96, "rh": 34, "r": 60},
    "Stilt Town": {"x": 828, "y": 489, "bx": 843, "by": 580, "rw": 96, "rh": 34, "r": 94},
    "Skybound Galleon": {"x": 280, "y": 656, "bx": 132, "by": 570, "r": 78, "rw": 88, "rh": 34},
    "The Scuttled Siren": {"x": 652, "y": 865, "bx": 717, "by": 921, "r": 90, "rw": 96, "rh": 34},
    "Clockwork Village": {"x": 371, "y": 925, "bx": 374, "by": 806, "rw": 96, "rh": 34, "r": 100},
    "House of Dusk": {"x": 137, "y": 791, "bx": 147, "by": 898, "rw": 110, "rh": 34, "r": 90},
    "Arcane Forge": {"x": 157, "y": 1086, "bx": 149, "by": 1179, "r": 73, "rw": 120, "rh": 34},
    "The Fool's Journey": {"x": 469, "y": 1120, "bx": 513, "by": 1189, "r": 92, "rw": 138, "rh": 34},
    "Garden of the Risen": {"x": 806, "y": 1081, "bx": 821, "by": 1189, "r": 100, "rw": 150, "rh": 34},
    "Stewards Spire": {"x": 1046, "y": 931, "bx": 1154, "by": 992, "rw": 82, "rh": 34, "r": 75},
    "South Station": {"x": 1094, "y": 1114, "bx": 1103, "by": 1191, "r": 100, "rw": 110, "rh": 34},
    "Thornvine Woods": {"x": 869, "y": 807, "bx": 870, "by": 925, "rw": 90, "rh": 34, "r": 100},
    "Crossroads East": {"x": 1017, "y": 601, "bx": 963, "by": 656, "r": 72, "rw": 96, "rh": 34},
    "Weir's Observatory": {"x": 1188, "y": 683, "bx": 1192, "by": 759, "r": 89},
    "Mary's Mill": {"x": 957, "y": 363, "bx": 896, "by": 389, "rw": 94, "rh": 34, "r": 75},
    "Door of the World": {"x": 988, "y": 167, "bx": 889, "by": 143, "rw": 82, "rh": 34, "r": 82},
    "The Roaming Wolf": {"x": 1149, "y": 243, "bx": 1149, "by": 147, "rw": 118, "rh": 34, "r": 88},
    "House of Dawn": {"x": 1141, "y": 443, "bx": 1142, "by": 524, "r": 92, "rw": 112, "rh": 34}
}

HERO_CLASSES = {
    "Adventurer": {"name": "Adventurer", "ap": 4, "start": "Crossroads Center", "ability": "Move to any hero's space for 1 AP."},
    "Detective": {"name": "Detective", "ap": 4, "start": "Spindlewood Institute", "ability": "Reveal a Lair or top card of deck for 0 AP (once/turn)."},
    "Explorer": {"name": "Explorer", "ap": 4, "start": "Crossroads West", "ability": "Move 1 extra space per Move action."},
    "Scholar": {"name": "Scholar", "ap": 4, "start": "Steam Plant", "ability": "Discard any item on the board to draw a Perk card (once/turn)."},
    "Tinkerer": {"name": "Tinkerer", "ap": 4, "start": "Clockwork Village", "ability": "Combine two items in hand to add their strengths (once/turn)."}
}

ITEMS_POOL = [
    # Red items (Physical/Weapons)
    {"name": "Crowbar", "color": "Red", "strength": 3, "location": "Steam Plant"},
    {"name": "Iron Hammer", "color": "Red", "strength": 4, "location": "Arcane Forge"},
    {"name": "Old Pistol", "color": "Red", "strength": 5, "location": "House of Dusk"},
    {"name": "Harpoon", "color": "Red", "strength": 4, "location": "The Scuttled Siren"},
    {"name": "Heavy Chain", "color": "Red", "strength": 3, "location": "Stilt Town"},
    {"name": "Steel Sword", "color": "Red", "strength": 5, "location": "Arcane Forge"},
    {"name": "Rope", "color": "Red", "strength": 2, "location": "North Station"},
    {"name": "Shovel", "color": "Red", "strength": 2, "location": "Mary's Mill"},
    {"name": "Shield", "color": "Red", "strength": 3, "location": "Crossroads West"},
    {"name": "Pickaxe", "color": "Red", "strength": 4, "location": "South Station"},
    {"name": "Matches", "color": "Red", "strength": 1, "location": "Specter Trail Caravan"},
    {"name": "Axe", "color": "Red", "strength": 4, "location": "Thornvine Woods"},
    {"name": "Net", "color": "Red", "strength": 2, "location": "The Scuttled Siren"},
    {"name": "Brass Knuckles", "color": "Red", "strength": 3, "location": "Crossroads Center"},
    {"name": "Crossbow", "color": "Red", "strength": 5, "location": "Stewards Spire"},

    # Blue items (Intellectual/Science)
    {"name": "Ancient Map", "color": "Blue", "strength": 3, "location": "Spindlewood Institute"},
    {"name": "Journal", "color": "Blue", "strength": 2, "location": "Spindlewood Institute"},
    {"name": "Compass", "color": "Blue", "strength": 2, "location": "Skybound Galleon"},
    {"name": "Sextant", "color": "Blue", "strength": 3, "location": "Weir's Observatory"},
    {"name": "Telescope", "color": "Blue", "strength": 4, "location": "Weir's Observatory"},
    {"name": "Strange Formula", "color": "Blue", "strength": 4, "location": "Steam Plant"},
    {"name": "Magnifying Glass", "color": "Blue", "strength": 1, "location": "Crossroads West"},
    {"name": "Decoded Rune", "color": "Blue", "strength": 5, "location": "Door of the World"},
    {"name": "Clockwork Gear", "color": "Blue", "strength": 3, "location": "Clockwork Village"},
    {"name": "History Book", "color": "Blue", "strength": 3, "location": "Mary's Mill"},
    {"name": "Research Notes", "color": "Blue", "strength": 4, "location": "Spindlewood Institute"},
    {"name": "Blueprints", "color": "Blue", "strength": 3, "location": "Steam Plant"},
    {"name": "Astrolabe", "color": "Blue", "strength": 5, "location": "Weir's Observatory"},
    {"name": "Pocket Watch", "color": "Blue", "strength": 2, "location": "Clockwork Village"},
    {"name": "Medical Kit", "color": "Blue", "strength": 4, "location": "House of Dawn"},

    # Yellow items (Spiritual/Mystic)
    {"name": "Holy Water", "color": "Yellow", "strength": 4, "location": "Reviving Throne"},
    {"name": "Sacred Amulet", "color": "Yellow", "strength": 5, "location": "Reviving Throne"},
    {"name": "Incense Burner", "color": "Yellow", "strength": 2, "location": "House of Dusk"},
    {"name": "Silver Bell", "color": "Yellow", "strength": 3, "location": "Garden of the Risen"},
    {"name": "Tome of Souls", "color": "Yellow", "strength": 5, "location": "Reviving Throne"},
    {"name": "Tarot Cards", "color": "Yellow", "strength": 2, "location": "The Fool's Journey"},
    {"name": "Crystal Ball", "color": "Yellow", "strength": 4, "location": "The Fool's Journey"},
    {"name": "Mystic Herbs", "color": "Yellow", "strength": 2, "location": "Thornvine Woods"},
    {"name": "Ankh", "color": "Yellow", "strength": 3, "location": "Door of the World"},
    {"name": "Wolfsbane", "color": "Yellow", "strength": 4, "location": "The Roaming Wolf"},
    {"name": "Golden Chalice", "color": "Yellow", "strength": 5, "location": "Garden of the Risen"},
    {"name": "Old Key", "color": "Yellow", "strength": 1, "location": "Crossroads Center"},
    {"name": "Phial of Light", "color": "Yellow", "strength": 4, "location": "House of Dawn"},
    {"name": "Runestone", "color": "Yellow", "strength": 3, "location": "The Void"},
    {"name": "Spirit Lantern", "color": "Yellow", "strength": 3, "location": "Garden of the Risen"}
]

MONSTER_CARDS = [
    {"id": "c1", "name": "Eerily Quiet", "spawn": 1, "event_title": "Calm Before the Storm", "event_text": "Nothing happens... yet.", "event_type": "none", "activations": {"Yeti": (1, 1), "Sphinx": (1, 1)}},
    {"id": "c2", "name": "A Cry in the Dark", "spawn": 2, "event_title": "Lost Children", "event_text": "Yeti children cry out. If Yeti is active, he moves 2 spaces towards the nearest child.", "event_type": "yeti_cry", "activations": {"Yeti": (2, 2)}},
    {"id": "c3", "name": "The Stars Align", "spawn": 2, "event_title": "Sphinx's Gaze", "event_text": "The Sphinx projects a psychic wave. All players at Crossroads locations lose 1 AP on their next turn.", "event_type": "sphinx_gaze", "activations": {"Sphinx": (2, 2)}},
    {"id": "c4", "name": "A Hopping Terror", "spawn": 1, "event_title": "Jiangshi Outbreak", "event_text": "Jiangshi gains 1 extra movement this phase.", "event_type": "jiangshi_speedup", "activations": {"Jiangshi": (2, 2)}},
    {"id": "c5", "name": "Void Eruption", "spawn": 3, "event_title": "The Void Widens", "event_text": "Increase the Terror Level by 1 if Cthulhu is active; otherwise spawn an item at The Void.", "event_type": "void_eruption", "activations": {"Cthulhu": (1, 2)}},
    {"id": "c6", "name": "Call of the Siren", "spawn": 2, "event_title": "Delilah Appears", "event_text": "Spawn Citizen Delilah at The Scuttled Siren. Safe haven: Mary's Mill.", "event_type": "spawn_delilah", "activations": {"Jiangshi": (1, 1), "Cthulhu": (1, 2)}},
    {"id": "c7", "name": "Midnight Bells", "spawn": 1, "event_title": "Mayor Finch in Danger", "event_text": "Spawn Citizen Mayor Finch at North Station. Safe haven: House of Dawn.", "event_type": "spawn_mayor", "activations": {"Yeti": (1, 2), "Sphinx": (1, 1)}},
    {"id": "c8", "name": "Frenzy!", "spawn": 2, "event_title": "Madness Spreads", "event_text": "The active monster (indicated by current frenzy state) moves 2 spaces and attacks with +1 die.", "event_type": "frenzy", "activations": {"Frenzy": (2, 3)}},
    {"id": "c9", "name": "Heavy Fog", "spawn": 1, "event_title": "Reduced Visibility", "event_text": "All heroes cannot use special abilities on their next turn.", "event_type": "no_abilities", "activations": {"Yeti": (1, 1), "Jiangshi": (1, 1)}},
    {"id": "c10", "name": "Exhaustion", "spawn": 2, "event_title": "Fatigue", "event_text": "The active player must discard 1 item of strength 2+ or lose 2 action points next turn.", "event_type": "exhaustion", "activations": {"Sphinx": (1, 2), "Cthulhu": (1, 1)}},
    {"id": "c11", "name": "Portal Resonance", "spawn": 2, "event_title": "Aura of the Deep", "event_text": "Cthulhu rolls +1 attack die if he attacks inside The Void.", "event_type": "cthulhu_res", "activations": {"Cthulhu": (2, 2)}},
    {"id": "c12", "name": "Echoes of the Past", "spawn": 1, "event_title": "Professor Higgins Appears", "event_text": "Spawn Citizen Professor Higgins at Spindlewood Institute. Safe haven: Weir's Observatory.", "event_type": "spawn_higgins", "activations": {"Sphinx": (2, 1), "Jiangshi": (1, 2)}},
    {"id": "c13", "name": "Tonic of Youth", "spawn": 2, "event_title": "Health Tonic", "event_text": "Draw 1 Perk card and give it to the player with the fewest items.", "event_type": "tonic", "activations": {"Yeti": (1, 1), "Cthulhu": (1, 1)}},
    {"id": "c14", "name": "Tidal Wave", "spawn": 1, "event_title": "Flooding Path", "event_text": "The path between Skybound Galleon and Scuttled Siren is blocked for movement this turn.", "event_type": "blocked_path", "activations": {"Jiangshi": (2, 1)}},
    {"id": "c15", "name": "Sudden Tempest", "spawn": 2, "event_title": "Scattering Winds", "event_text": "Move all items at Steam Plant to adjacent locations.", "event_type": "scatter_items", "activations": {"Yeti": (2, 1), "Sphinx": (1, 2)}}
]

PERK_CARDS = [
    {"id": "p1", "name": "Swiftness", "text": "Move any hero up to 3 spaces for free."},
    {"id": "p2", "name": "Security", "text": "Ignore all hits from one attack."},
    {"id": "p3", "name": "Search", "text": "Draw 2 items from the bag and place them in your current location."},
    {"id": "p4", "name": "Share", "text": "Trade items between any two heroes anywhere on the board."},
    {"id": "p5", "name": "Insight", "text": "Look at the top 3 cards of the Monster Deck and rearrange them."},
    {"id": "p6", "name": "Restoration", "text": "Set the active player's AP back to 4."}
]

# ---------------------------------------------------------
# PATHFINDING HELPER (BFS)
# ---------------------------------------------------------

def find_shortest_path(start: str, targets: Set[str]) -> Optional[str]:
    """Returns the next location on the shortest path towards any of the target nodes."""
    if not targets or start in targets:
        return start
    
    queue = [[start]]
    visited = {start}
    shortest_paths = []
    min_len = 999
    
    while queue:
        path = queue.pop(0)
        node = path[-1]
        
        if len(path) > min_len:
            break
            
        if node in targets:
            shortest_paths.append(path)
            min_len = len(path)
            continue
            
        for neighbor in ADJACENCY_LIST.get(node, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(path + [neighbor])
                
    if not shortest_paths:
        return start
        
    # Sort paths alphabetically to keep path choice deterministic
    shortest_paths.sort(key=lambda p: (len(p), p[-1]))
    best_path = shortest_paths[0]
    
    if len(best_path) > 1:
        return best_path[1]
    return start

# ---------------------------------------------------------
# AUTHORITATIVE GAME STATE ENGINE
# ---------------------------------------------------------

class GameRoom:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.players: List[Dict] = []  # list of {"sid": str, "name": str, "hero": str, "is_host": bool, "ws": WebSocket}
        self.game_started = False
        self.terror_level = 0
        self.deck: List[Dict] = []
        self.discard: List[Dict] = []
        self.item_bag: List[Dict] = []
        self.perk_deck: List[Dict] = []
        self.active_monsters: List[str] = []
        
        # Board entities
        self.heroes_state: Dict[str, Dict] = {} # player_name -> state
        self.items_on_board: Dict[str, List[Dict]] = {loc: [] for loc in ADJACENCY_LIST.keys()}
        self.citizens: Dict[str, Dict] = {}
        self.monster_locations: Dict[str, str] = {}
        self.monster_states: Dict[str, Dict] = {}
        
        self.turn_player_idx = 0
        self.game_phase = "Lobby"
        self.current_card: Optional[Dict] = None
        self.combat_rolls: List[str] = []
        self.log: List[str] = []
        self.active_perks_limit = {} # prevents double-use
        self.frenzy_marker = "" # which monster has frenzy token

    def add_log(self, msg: str):
        self.log.append(msg)
        if len(self.log) > 50:
            self.log.pop(0)

    def initialize_game(self, chosen_monsters: List[str]):
        self.active_monsters = chosen_monsters
        self.terror_level = 0
        self.game_phase = "HeroPhase"
        self.turn_player_idx = 0
        self.combat_rolls = []
        self.log = []
        self.current_card = None
        
        # Set up item bag
        self.item_bag = list(ITEMS_POOL)
        random.shuffle(self.item_bag)
        
        # Set up decks
        self.deck = list(MONSTER_CARDS)
        random.shuffle(self.deck)
        self.discard = []
        self.perk_deck = list(PERK_CARDS)
        random.shuffle(self.perk_deck)
        
        # Reset locations
        self.items_on_board = {loc: [] for loc in ADJACENCY_LIST.keys()}
        
        # Spawn initial 12 items
        for _ in range(12):
            self.spawn_item()
            
        # Initialize heroes
        self.heroes_state = {}
        for p in self.players:
            hero_class = p["hero"]
            config = HERO_CLASSES[hero_class]
            self.heroes_state[p["name"]] = {
                "name": p["name"],
                "hero": hero_class,
                "location": config["start"],
                "items": [],
                "perks": [],
                "ap": config["ap"],
                "max_ap": config["ap"],
                "ability_used": False
            }
            
        # Initialize citizens
        self.citizens = {
            "Delilah": {"name": "Delilah", "location": "Board", "start": "The Scuttled Siren", "safe": "Mary's Mill", "active": False},
            "Mayor Finch": {"name": "Mayor Finch", "location": "Board", "start": "North Station", "safe": "House of Dawn", "active": False},
            "Professor Higgins": {"name": "Professor Higgins", "location": "Board", "start": "Spindlewood Institute", "safe": "Weir's Observatory", "active": False},
            "The Blacksmith": {"name": "The Blacksmith", "location": "Board", "start": "Arcane Forge", "safe": "Steam Plant", "active": False},
            "The Drunkard": {"name": "The Drunkard", "location": "Board", "start": "The Roaming Wolf", "safe": "Specter Trail Caravan", "active": False}
        }

        # Initialize monster states
        self.monster_locations = {}
        self.monster_states = {}
        for monster in self.active_monsters:
            if monster == "Sphinx":
                self.monster_locations[monster] = "Specter Trail Caravan"
            else:
                self.monster_locations[monster] = "The Roaming Wolf"
            if monster == "Yeti":
                # Lair tokens
                lairs = [
                    {"location": "Crossroads West", "is_true": False, "flipped": False},
                    {"location": "Specter Trail Caravan", "is_true": False, "flipped": False},
                    {"location": "House of Dusk", "is_true": True, "flipped": False}
                ]
                random.shuffle(lairs)
                child_locs = ["House of Dusk", "Thornvine Woods", "Stewards Spire"]
                random.shuffle(child_locs)
                self.monster_states["Yeti"] = {
                    "lairs": lairs,
                    "children": [
                        {"id": 1, "location": child_locs[0], "rescued": False},
                        {"id": 2, "location": child_locs[1], "rescued": False},
                        {"id": 3, "location": child_locs[2], "rescued": False}
                    ]
                }
            elif monster == "Jiangshi":
                # The polyomino sword layout (3 slots that need Yellow/Red items)
                self.monster_states["Jiangshi"] = {
                    "slots": [
                        {"id": 0, "color": "Red", "req_strength": 3, "filled": False, "item": None},
                        {"id": 1, "color": "Yellow", "req_strength": 3, "filled": False, "item": None},
                        {"id": 2, "color": "Yellow", "req_strength": 4, "filled": False, "item": None}
                    ]
                }
            elif monster == "Sphinx":
                # The 3-item math riddle grid. Sum must equal exactly 10 using Blue items.
                self.monster_states["Sphinx"] = {
                    "slots": [
                        {"id": 0, "filled": False, "item": None},
                        {"id": 1, "filled": False, "item": None},
                        {"id": 2, "filled": False, "item": None}
                    ],
                    "target_sum": 10
                }
            elif monster == "Cthulhu":
                # Cthulhu has two phases
                self.monster_states["Cthulhu"] = {
                    "phase": 1,
                    "runes": [
                        {"id": 0, "color": "Red", "req_strength": 3, "broken": False},
                        {"id": 1, "color": "Blue", "req_strength": 3, "broken": False},
                        {"id": 2, "color": "Yellow", "req_strength": 3, "broken": False},
                        {"id": 3, "color": "Any", "req_strength": 5, "broken": False}
                    ],
                    # Corpse City steps
                    "corpse_city_track": ["Entrance", "Gates of Madness", "Sea of Slumber", "Cthulhu's Heart"],
                    "player_tracks": {} # player_name -> step index (-1 if on main board)
                }
                for p in self.players:
                    self.monster_states["Cthulhu"]["player_tracks"][p["name"]] = -1

        if self.active_monsters:
            self.frenzy_marker = self.active_monsters[0]
            
        self.game_started = True
        self.add_log("The game has begun! Protect the town and defeat the monsters.")

    def spawn_item(self):
        if not self.item_bag:
            return
        item = self.item_bag.pop(0)
        item["id"] = str(uuid.uuid4())[:8]
        loc = item["location"]
        self.items_on_board[loc].append(item)

    def get_serializable_state(self) -> Dict:
        return {
            "room_code": self.room_code,
            "game_started": self.game_started,
            "game_phase": self.game_phase,
            "terror_level": self.terror_level,
            "deck_count": len(self.deck),
            "active_monsters": self.active_monsters,
            "frenzy_marker": self.frenzy_marker,
            "heroes_state": self.heroes_state,
            "items_on_board": self.items_on_board,
            "citizens": {k: v for k, v in self.citizens.items() if v["active"] or v["location"] != "Board"},
            "monster_locations": self.monster_locations,
            "monster_states": self.monster_states,
            "turn_player_idx": self.turn_player_idx,
            "current_card": self.current_card,
            "combat_rolls": self.combat_rolls,
            "log": self.log,
            "players": [{"name": p["name"], "hero": p["hero"], "is_host": p["is_host"]} for p in self.players],
            "node_coordinates": NODE_COORDINATES,
            "adjacency_list": ADJACENCY_LIST
        }

    def update_coordinates(self, coords: Dict):
        global NODE_COORDINATES
        NODE_COORDINATES = coords
        try:
            import json
            with open("static/new_coordinates.json", "w") as f:
                json.dump(coords, f, indent=4)
        except Exception as e:
            print("Error saving coordinates:", e)

    # ---------------------------------------------------------
    # HERO PHASE ACTIONS
    # ---------------------------------------------------------

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
        adjacent = ADJACENCY_LIST.get(current, [])
        
        valid = False
        if target in adjacent:
            valid = True
        elif is_explorer:
            # Explorer can move 2 spaces for 1 AP
            for n in adjacent:
                if target in ADJACENCY_LIST.get(n, []):
                    valid = True
                    break
                    
        if not valid or state["ap"] < 1:
            return False
            
        state["location"] = target
        state["ap"] -= 1
        self.add_log(f"{player_name} moved to {target}.")
        
        # Guide active citizens along with the hero
        for cit_name, cit in self.citizens.items():
            if cit["active"] and cit["location"] == current:
                cit["location"] = target
                self.add_log(f"{player_name} guided citizen {cit_name} to {target}.")
                # Check safe zone
                if target == cit["safe"]:
                    cit["active"] = False
                    cit["location"] = "Rescued"
                    self.add_log(f"Citizen {cit_name} has been rescued!")
                    # Draw a Perk card
                    if self.perk_deck:
                        perk = self.perk_deck.pop(0)
                        state["perks"].append(perk)
                        self.add_log(f"{player_name} received Perk Card: {perk['name']}.")
                        
        return True

    def execute_pickup(self, player_name: str, item_ids: List[str]) -> bool:
        if not self.check_turn(player_name):
            return False
            
        state = self.heroes_state[player_name]
        loc = state["location"]
        
        # Max inventory size is 4
        if len(state["items"]) + len(item_ids) > 4:
            self.add_log(f"{player_name} cannot carry more than 4 items.")
            return False
            
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
        return True

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
            
        # Perform check on inventory limits
        if len(h1["items"]) - len(give_item_ids) + len(take_item_ids) > 4:
            return False
        if len(h2["items"]) - len(take_item_ids) + len(give_item_ids) > 4:
            return False
            
        # Move items
        giving = []
        for iid in give_item_ids:
            item = next((i for i in h1["items"] if i["id"] == iid), None)
            if not item: return False
            giving.append(item)
            
        taking = []
        for iid in take_item_ids:
            item = next((i for i in h2["items"] if i["id"] == iid), None)
            if not item: return False
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

    def execute_advance(self, player_name: str, monster: str, args: Dict) -> bool:
        if not self.check_turn(player_name):
            return False
            
        h_state = self.heroes_state[player_name]
        if h_state["ap"] < 1:
            return False
            
        loc = h_state["location"]
        
        if monster == "Yeti":
            action_type = args.get("type")
            if action_type == "reveal_lair":
                yeti_state = self.monster_states["Yeti"]
                for lair in yeti_state["lairs"]:
                    if lair["location"] == loc and not lair["flipped"]:
                        lair["flipped"] = True
                        h_state["ap"] -= 1
                        is_true = lair["is_true"]
                        self.add_log(f"{player_name} flipped the lair token at {loc}. It is {'the TRUE lair!' if is_true else 'a DECOY.'}")
                        return True
            return False
            
        elif monster == "Jiangshi":
            slot_id = args.get("slot_id")
            item_id = args.get("item_id")
            
            if loc != self.monster_locations["Jiangshi"]:
                self.add_log(f"Must be at Jiangshi's location ({self.monster_locations['Jiangshi']}) to Advance.")
                return False
                
            js_state = self.monster_states["Jiangshi"]
            slot = next((s for s in js_state["slots"] if s["id"] == slot_id), None)
            if not slot or slot["filled"]:
                return False
                
            item = next((i for i in h_state["items"] if i["id"] == item_id), None)
            if not item:
                return False
                
            if item["color"] != slot["color"] or item["strength"] < slot["req_strength"]:
                self.add_log(f"Item does not meet requirements for slot {slot_id}.")
                return False
                
            h_state["items"].remove(item)
            slot["filled"] = True
            slot["item"] = item
            h_state["ap"] -= 1
            self.add_log(f"{player_name} placed {item['name']} onto Jiangshi's sword slot {slot_id}.")
            return True
            
        elif monster == "Sphinx":
            slot_id = args.get("slot_id")
            item_id = args.get("item_id")
            
            if loc != self.monster_locations["Sphinx"]:
                self.add_log(f"Must be at Sphinx's location ({self.monster_locations['Sphinx']}) to Advance.")
                return False
                
            sp_state = self.monster_states["Sphinx"]
            slot = next((s for s in sp_state["slots"] if s["id"] == slot_id), None)
            if not slot or slot["filled"]:
                return False
                
            item = next((i for i in h_state["items"] if i["id"] == item_id), None)
            if not item or item["color"] != "Blue":
                self.add_log("Sphinx riddles require Blue items.")
                return False
                
            h_state["items"].remove(item)
            slot["filled"] = True
            slot["item"] = item
            h_state["ap"] -= 1
            
            self.add_log(f"{player_name} placed {item['name']} (Blue {item['strength']}) into Sphinx riddle slot {slot_id}.")
            return True
            
        elif monster == "Cthulhu":
            cth_state = self.monster_states["Cthulhu"]
            if cth_state["phase"] == 1:
                if loc != "The Void":
                    self.add_log("Must be at The Void to break runes.")
                    return False
                    
                rune_id = args.get("rune_id")
                item_id = args.get("item_id")
                
                rune = next((r for r in cth_state["runes"] if r["id"] == rune_id), None)
                if not rune or rune["broken"]:
                    return False
                    
                item = next((i for i in h_state["items"] if i["id"] == item_id), None)
                if not item:
                    return False
                    
                valid = False
                if rune["color"] == "Any":
                    valid = item["strength"] >= rune["req_strength"]
                else:
                    valid = (item["color"] == rune["color"]) and (item["strength"] >= rune["req_strength"])
                    
                if not valid:
                    self.add_log("Item doesn't satisfy rune requirement.")
                    return False
                    
                h_state["items"].remove(item)
                rune["broken"] = True
                h_state["ap"] -= 1
                self.add_log(f"{player_name} shattered Rune {rune_id} using {item['name']}.")
                
                if all(r["broken"] for r in cth_state["runes"]):
                    cth_state["phase"] = 2
                    self.add_log("PORTAL DESTROYED! Cthulhu has retreated to the Corpse-City of R'lyeh!")
                    self.monster_locations["Cthulhu"] = "Entrance"
                    
                return True
                
            elif cth_state["phase"] == 2:
                track_idx = cth_state["player_tracks"].get(player_name, -1)
                next_idx = track_idx + 1
                
                if next_idx >= len(cth_state["corpse_city_track"]):
                    self.add_log("Already at Cthulhu's heart! Perform the Defeat action.")
                    return False
                    
                item_id = args.get("item_id")
                item = next((i for i in h_state["items"] if i["id"] == item_id), None)
                if not item:
                    return False
                    
                req_color = ""
                req_strength = 0
                if next_idx == 0:
                    req_color = "Blue"
                    req_strength = 3
                elif next_idx == 1:
                    req_color = "Yellow"
                    req_strength = 4
                elif next_idx == 2:
                    req_color = "Red"
                    req_strength = 5
                    
                if item["color"] != req_color or item["strength"] < req_strength:
                    self.add_log(f"Required {req_color} {req_strength}+ to advance, but used {item['color']} {item['strength']}.")
                    return False
                    
                h_state["items"].remove(item)
                cth_state["player_tracks"][player_name] = next_idx
                h_state["ap"] -= 1
                self.add_log(f"{player_name} advanced to Step {next_idx} ({cth_state['corpse_city_track'][next_idx]}) in Corpse City.")
                return True

        return False

    def execute_defeat(self, player_name: str, monster: str) -> bool:
        if not self.check_turn(player_name):
            return False
            
        h_state = self.heroes_state[player_name]
        if h_state["ap"] < 1:
            return False
            
        loc = h_state["location"]
        
        if monster == "Yeti":
            y_state = self.monster_states["Yeti"]
            true_lair_loc = next((l["location"] for l in y_state["lairs"] if l["is_true"]), None)
            if not true_lair_loc:
                return False
                
            all_kids_here = all(k["location"] == true_lair_loc for k in y_state["children"])
            yeti_here = (self.monster_locations["Yeti"] == true_lair_loc)
            hero_here = (loc == true_lair_loc)
            
            if all_kids_here and yeti_here and hero_here:
                self.active_monsters.remove("Yeti")
                h_state["ap"] -= 1
                self.add_log("THE YETI HAS BEEN DEFEATED! The children are safe and happy!")
                self.check_victory()
                return True
            else:
                self.add_log("Defeat condition not met. Yeti, children, and hero must all be at the True Lair.")
                return False
                
        elif monster == "Jiangshi":
            js_state = self.monster_states["Jiangshi"]
            all_filled = all(s["filled"] for s in js_state["slots"])
            hero_here = (loc == self.monster_locations["Jiangshi"])
            
            if all_filled and hero_here:
                self.active_monsters.remove("Jiangshi")
                h_state["ap"] -= 1
                self.add_log("THE JIANGSHI IS BANISHED! The hopping vampire is sealed.")
                self.check_victory()
                return True
            else:
                self.add_log("Defeat condition not met. Seal all 3 slots and meet Jiangshi.")
                return False
                
        elif monster == "Sphinx":
            sp_state = self.monster_states["Sphinx"]
            all_filled = all(s["filled"] for s in sp_state["slots"])
            current_sum = sum(s["item"]["strength"] for s in sp_state["slots"] if s["filled"])
            hero_here = (loc == self.monster_locations["Sphinx"])
            
            if all_filled and current_sum == sp_state["target_sum"] and hero_here:
                self.active_monsters.remove("Sphinx")
                h_state["ap"] -= 1
                self.add_log("THE SPHINX SOLVED! The riddle has been cracked and the Sphinx vanishes.")
                self.check_victory()
                return True
            else:
                self.add_log(f"Defeat condition not met. Fill all 3 slots to sum exactly 10 (Current sum: {current_sum}).")
                return False
                
        elif monster == "Cthulhu":
            cth_state = self.monster_states["Cthulhu"]
            if cth_state["phase"] == 2:
                track_idx = cth_state["player_tracks"].get(player_name, -1)
                if track_idx == 3:  # Cthulhu's Heart
                    strong_red = next((i for i in h_state["items"] if i["color"] == "Red" and i["strength"] >= 5), None)
                    if strong_red:
                        h_state["items"].remove(strong_red)
                        self.active_monsters.remove("Cthulhu")
                        h_state["ap"] -= 1
                        self.add_log("CTHULHU BANISHED TO THE VOID! The doorway is sealed forever!")
                        self.check_victory()
                        return True
                    else:
                        self.add_log("Requires a Red item of Strength 5+ to defeat Cthulhu.")
                        return False
            self.add_log("You must traverse to Cthulhu's Heart in Corpse City.")
            return False

        return False

    def execute_special(self, player_name: str, args: Dict) -> bool:
        if not self.check_turn(player_name):
            return False
            
        h_state = self.heroes_state[player_name]
        hero_class = h_state["hero"]
        
        if h_state["ability_used"]:
            self.add_log("Ability already used this turn.")
            return False
            
        if hero_class == "Adventurer":
            target_hero = args.get("target_hero")
            if target_hero and target_hero in self.heroes_state:
                if h_state["ap"] < 1: return False
                target_loc = self.heroes_state[target_hero]["location"]
                h_state["location"] = target_loc
                h_state["ap"] -= 1
                h_state["ability_used"] = True
                self.add_log(f"{player_name} used Adventurer teleport to join {target_hero} at {target_loc}.")
                return True
                
        elif hero_class == "Detective":
            reveal_type = args.get("type")
            if reveal_type == "lair":
                yeti_state = self.monster_states.get("Yeti")
                if yeti_state:
                    unflipped_lairs = [l for l in yeti_state["lairs"] if not l["flipped"]]
                    if unflipped_lairs:
                        lair = unflipped_lairs[0]
                        self.add_log(f"[Detective Secret Intel] The lair at {lair['location']} is {'the TRUE lair!' if lair['is_true'] else 'a DECOY.'}")
                        h_state["ability_used"] = True
                        return True
            elif reveal_type == "deck":
                if self.deck:
                    top_card = self.deck[-1]
                    self.add_log(f"[Detective Secret Intel] The top card of the Monster Deck is: {top_card['name']}")
                    h_state["ability_used"] = True
                    return True
                    
        elif hero_class == "Scholar":
            item_id = args.get("item_id")
            loc = args.get("location")
            if loc and item_id and loc in self.items_on_board:
                item = next((i for i in self.items_on_board[loc] if i["id"] == item_id), None)
                if item:
                    self.items_on_board[loc].remove(item)
                    if self.perk_deck:
                        perk = self.perk_deck.pop(0)
                        h_state["perks"].append(perk)
                        self.add_log(f"{player_name} discarded {item['name']} from {loc} and drew Perk: {perk['name']}.")
                    h_state["ability_used"] = True
                    return True
                    
        elif hero_class == "Tinkerer":
            i1_id = args.get("item1_id")
            i2_id = args.get("item2_id")
            i1 = next((i for i in h_state["items"] if i["id"] == i1_id), None)
            i2 = next((i for i in h_state["items"] if i["id"] == i2_id), None)
            if i1 and i2:
                combined_strength = min(5, i1["strength"] + i2["strength"])
                h_state["items"].remove(i1)
                h_state["items"].remove(i2)
                combo_item = {
                    "id": f"combo_{str(uuid.uuid4())[:4]}",
                    "name": f"Modified {i1['name']}",
                    "color": i1["color"],
                    "strength": combined_strength,
                    "location": h_state["location"]
                }
                h_state["items"].append(combo_item)
                h_state["ability_used"] = True
                self.add_log(f"{player_name} combined {i1['name']} and {i2['name']} into a Strength {combined_strength} {i1['color']} item!")
                return True
                
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
            if target_hero in self.heroes_state and dest in ADJACENCY_LIST:
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

    def check_victory(self):
        if not self.active_monsters:
            self.game_phase = "GameOverWin"
            self.add_log("VICTORY! All monsters have been defeated. The town is safe!")

    def check_defeat(self, reason: str):
        self.game_phase = "GameOverLose"
        self.add_log(f"DEFEAT! {reason}")

    # ---------------------------------------------------------
    # MONSTER PHASE
    # ---------------------------------------------------------

    def end_turn(self, player_name: str):
        if not self.check_turn(player_name):
            return
            
        self.game_phase = "MonsterPhase"
        self.add_log(f"{player_name} ended their turn. Entering Monster Phase...")
        
        self.heroes_state[player_name]["ability_used"] = False
        
        asyncio.create_task(self.run_monster_phase())

    async def run_monster_phase(self):
        if not self.deck:
            self.check_defeat("The Monster Card Deck has been exhausted!")
            return
            
        card = self.deck.pop()
        self.current_card = card
        self.discard.append(card)
        self.add_log(f"Drew Monster Card: {card['name']} (Spawns {card['spawn']} items)")
        
        for _ in range(card["spawn"]):
            self.spawn_item()
            
        await asyncio.sleep(2)
        
        await self.resolve_event(card)
        await asyncio.sleep(2)
        
        for name, move_info in card["activations"].items():
            if name == "Frenzy":
                active_monster = self.frenzy_marker
                if active_monster in self.active_monsters:
                    await self.activate_monster(active_monster, move_info[0], move_info[1])
            elif name in self.active_monsters:
                await self.activate_monster(name, move_info[0], move_info[1])
                
        self.active_perks_limit.clear()
        
        if self.game_phase == "MonsterPhase":
            self.turn_player_idx = (self.turn_player_idx + 1) % len(self.players)
            next_player = self.players[self.turn_player_idx]["name"]
            max_ap = self.heroes_state[next_player]["max_ap"]
            self.heroes_state[next_player]["ap"] = max_ap
            self.game_phase = "HeroPhase"
            self.add_log(f"It is now {next_player}'s turn! ({max_ap} AP)")

    async def resolve_event(self, card: Dict):
        ev = card["event_type"]
        self.add_log(f"Event: {card['event_title']} - {card['event_text']}")
        
        if ev == "yeti_cry":
            if "Yeti" in self.active_monsters:
                yeti_loc = self.monster_locations["Yeti"]
                y_state = self.monster_states["Yeti"]
                child_locs = {c["location"] for c in y_state["children"] if not c["rescued"]}
                if child_locs:
                    for _ in range(2):
                        step = find_shortest_path(yeti_loc, child_locs)
                        if step and step != yeti_loc:
                            yeti_loc = step
                            self.monster_locations["Yeti"] = yeti_loc
                            self.add_log(f"Yeti moved towards crying child, now at {yeti_loc}.")
                            
        elif ev == "sphinx_gaze":
            for p_name, h_state in self.heroes_state.items():
                if "Crossroads" in h_state["location"]:
                    h_state["ap"] = max(0, h_state["ap"] - 1)
                    self.add_log(f"{p_name} was caught in Sphinx's gaze and loses 1 AP.")
                    
        elif ev == "spawn_delilah":
            self.citizens["Delilah"]["active"] = True
            self.citizens["Delilah"]["location"] = self.citizens["Delilah"]["start"]
            self.add_log("Citizen Delilah has arrived at The Scuttled Siren.")
            
        elif ev == "spawn_mayor":
            self.citizens["Mayor Finch"]["active"] = True
            self.citizens["Mayor Finch"]["location"] = self.citizens["Mayor Finch"]["start"]
            self.add_log("Citizen Mayor Finch has arrived at North Station.")
            
        elif ev == "spawn_higgins":
            self.citizens["Professor Higgins"]["active"] = True
            self.citizens["Professor Higgins"]["location"] = self.citizens["Professor Higgins"]["start"]
            self.add_log("Citizen Professor Higgins has arrived at Spindlewood Institute.")
            
        elif ev == "void_eruption":
            if "Cthulhu" in self.active_monsters:
                self.terror_level = min(10, self.terror_level + 1)
                self.add_log("The Void opens wider! Terror Level increases by 1.")
                self.check_terror()
            else:
                self.spawn_item()

    def check_terror(self):
        if self.terror_level >= 10:
            self.check_defeat("Terror Level has reached maximum (10)!")

    async def activate_monster(self, name: str, moves: int, dice: int):
        self.add_log(f"Monster {name} is activating: Moves {moves}, Dice {dice}.")
        
        for _ in range(moves):
            current_loc = self.monster_locations[name]
            
            targets = set()
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
                    targets.add(h_state["location"])
                    
            for cit in self.citizens.values():
                if cit["active"] and cit["location"] not in ["Board", "Rescued"]:
                    targets.add(cit["location"])
                    
            if name == "Yeti":
                y_state = self.monster_states["Yeti"]
                for child in y_state["children"]:
                    if not child["rescued"]:
                        targets.add(child["location"])

            if not targets:
                break
                
            if name == "Cthulhu" and self.monster_states["Cthulhu"]["phase"] == 2:
                break
                
            next_step = find_shortest_path(current_loc, targets)
            if next_step and next_step != current_loc:
                self.monster_locations[name] = next_step
                self.add_log(f"{name} moved to {next_step}.")
                await asyncio.sleep(0.5)
                
        curr_loc = self.monster_locations[name]
        
        if name == "Cthulhu" and self.monster_states["Cthulhu"]["phase"] == 2:
            c_loc = self.monster_locations["Cthulhu"]
            c_idx = self.monster_states["Cthulhu"]["corpse_city_track"].index(c_loc)
            attack_targets = [k for k, v in self.monster_states["Cthulhu"]["player_tracks"].items() if v == c_idx]
            if attack_targets:
                await self.perform_attack(name, attack_targets[0], dice)
            return

        target_hero = None
        for p_name, h_state in self.heroes_state.items():
            if h_state["location"] == curr_loc:
                target_hero = p_name
                break
                
        if target_hero:
            await self.perform_attack(name, target_hero, dice)
        else:
            target_citizen = None
            for cit_name, cit in self.citizens.items():
                if cit["active"] and cit["location"] == curr_loc:
                    target_citizen = cit_name
                    break
            if target_citizen:
                await self.perform_attack_citizen(name, target_citizen, dice)

    async def perform_attack(self, monster: str, hero_name: str, dice: int):
        self.add_log(f"{monster} is attacking {hero_name}!")
        self.combat_rolls = []
        
        if self.active_perks_limit.get("block_all_hits", False):
            self.add_log(f"Security Perk blocked all damage from the attack on {hero_name}.")
            return

        hits = 0
        frenzies = 0
        
        for _ in range(dice):
            roll = random.choice(["Hit", "Hit", "Frenzy", "Blank", "Blank", "Blank"])
            self.combat_rolls.append(roll)
            if roll == "Hit":
                hits += 1
            elif roll == "Frenzy":
                frenzies += 1
                
        self.add_log(f"Roll results: {', '.join(self.combat_rolls)} (Hits: {hits}, Frenzy: {frenzies})")
        
        if frenzies > 0:
            current_frenzy_idx = self.active_monsters.index(self.frenzy_marker) if self.frenzy_marker in self.active_monsters else 0
            self.frenzy_marker = self.active_monsters[(current_frenzy_idx + 1) % len(self.active_monsters)]
            self.add_log(f"Frenzy rolled! The Frenzy marker moves to {self.frenzy_marker}.")
            
        if hits > 0:
            h_state = self.heroes_state[hero_name]
            
            for _ in range(hits):
                if h_state["items"]:
                    h_state["items"].sort(key=lambda i: i["strength"])
                    discarded = h_state["items"].pop(0)
                    self.add_log(f"{hero_name} discarded {discarded['name']} to absorb 1 Hit.")
                else:
                    self.terror_level = min(10, self.terror_level + 1)
                    self.add_log(f"{hero_name} has NO items left to block the hit and is DEFEATED!")
                    self.check_terror()
                    
                    h_state["location"] = HERO_CLASSES[h_state["hero"]]["start"]
                    if "Cthulhu" in self.active_monsters:
                        self.monster_states["Cthulhu"]["player_tracks"][hero_name] = -1
                    break

    async def perform_attack_citizen(self, monster: str, citizen_name: str, dice: int):
        self.add_log(f"{monster} is attacking citizen {citizen_name}!")
        
        hits = 0
        for _ in range(dice):
            roll = random.choice(["Hit", "Hit", "Frenzy", "Blank", "Blank", "Blank"])
            if roll == "Hit":
                hits += 1
                
        if hits > 0:
            self.citizens[citizen_name]["active"] = False
            self.citizens[citizen_name]["location"] = "Defeated"
            self.terror_level = min(10, self.terror_level + 1)
            self.add_log(f"Citizen {citizen_name} has been DEFEATED by {monster}! Terror Level increases.")
            self.check_terror()
        else:
            self.add_log(f"{monster} missed the attack on citizen {citizen_name}.")

# ---------------------------------------------------------
# MULTI-ROOM SOCKET MANAGER
# ---------------------------------------------------------

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, GameRoom] = {}
        self.websockets: Dict[str, List[WebSocket]] = {}

    def get_or_create_room(self, room_code: str) -> GameRoom:
        if room_code not in self.rooms:
            self.rooms[room_code] = GameRoom(room_code)
            self.websockets[room_code] = []
        return self.rooms[room_code]

    async def broadcast_state(self, room_code: str):
        if room_code in self.rooms:
            room = self.rooms[room_code]
            data = json.dumps({"type": "state", "state": room.get_serializable_state()})
            
            dead_sockets = []
            for ws in self.websockets[room_code]:
                try:
                    await ws.send_text(data)
                except Exception:
                    dead_sockets.append(ws)
                    
            for ws in dead_sockets:
                self.websockets[room_code].remove(ws)

room_manager = RoomManager()

# ---------------------------------------------------------
# FASTAPI ENDPOINTS
# ---------------------------------------------------------

@app.websocket("/ws/{room_code}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_name: str):
    await websocket.accept()
    room = room_manager.get_or_create_room(room_code)
    room_manager.websockets[room_code].append(websocket)
    
    player = next((p for p in room.players if p["name"] == player_name), None)
    if not player:
        is_host = len(room.players) == 0
        player = {
            "name": player_name,
            "hero": "Adventurer",
            "is_host": is_host,
            "ws": websocket
        }
        room.players.append(player)
        room.add_log(f"{player_name} joined the room.")
    else:
        player["ws"] = websocket
        room.add_log(f"{player_name} reconnected.")
        
    await room_manager.broadcast_state(room_code)
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            action = msg.get("action")
            
            if action == "select_hero":
                hero = msg.get("hero")
                if hero in HERO_CLASSES and not room.game_started:
                    player["hero"] = hero
                    room.add_log(f"{player_name} selected {hero}.")
                    
            elif action == "start_game":
                if player["is_host"] and not room.game_started:
                    monsters = msg.get("monsters", ["Yeti", "Sphinx"])
                    room.initialize_game(monsters)
                    
            elif action == "move":
                target = msg.get("target")
                room.execute_move(player_name, target)
                
            elif action == "pickup":
                item_ids = msg.get("item_ids", [])
                room.execute_pickup(player_name, item_ids)
                
            elif action == "share":
                target = msg.get("target")
                give_ids = msg.get("give_ids", [])
                take_ids = msg.get("take_ids", [])
                room.execute_share(player_name, target, give_ids, take_ids)
                
            elif action == "advance":
                monster = msg.get("monster")
                args = msg.get("args", {})
                room.execute_advance(player_name, monster, args)
                
            elif action == "defeat":
                monster = msg.get("monster")
                room.execute_defeat(player_name, monster)
                
            elif action == "special":
                args = msg.get("args", {})
                room.execute_special(player_name, args)
                
            elif action == "play_perk":
                perk_id = msg.get("perk_id")
                args = msg.get("args", {})
                room.execute_play_perk(player_name, perk_id, args)
                
            elif action == "end_turn":
                room.end_turn(player_name)
                
            elif action == "chat":
                text = msg.get("text")
                if text:
                    room.add_log(f"[{player_name}]: {text}")
                    
            elif action == "update_coordinates":
                coords = msg.get("coordinates")
                if coords:
                    room.update_coordinates(coords)
                    
            await room_manager.broadcast_state(room_code)
            
    except WebSocketDisconnect:
        if room_code in room_manager.websockets and websocket in room_manager.websockets[room_code]:
            room_manager.websockets[room_code].remove(websocket)
        room.add_log(f"{player_name} disconnected from lobby.")
        await room_manager.broadcast_state(room_code)

# Serve Images
app.mount("/Images", StaticFiles(directory="Images"), name="images")
# Serve Frontend static files
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
