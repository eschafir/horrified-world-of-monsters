import json
import os
import random
import time
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

# Positions of the 8 Terror Level track placeholders (slot 0 = lowest terror).
# Draggable/calibratable in-client via Debug Mode ("D"), same workflow as NODE_COORDINATES.
# "points" (if present) is a custom polygon contour, as relative [dx, dy] offsets from
# (x, y), editable in-client via Polygon Shape Mode ("P"). Falls back to a circle of
# radius "r" when empty.
_TERROR_SLOT_SHAPE = [[12, 33], [30, -6], [18, 2], [32, -27], [-31, -28], [-17, 3], [-30, -6], [-13, 33]]
_TERROR_SLOT_ANCHORS = [
    {"x": 359, "y": 57, "r": 30},
    {"x": 437, "y": 59, "r": 31},
    {"x": 515, "y": 58, "r": 31},
    {"x": 599, "y": 57, "r": 32},
    {"x": 683, "y": 57, "r": 31},
    {"x": 764, "y": 57, "r": 32},
    {"x": 845, "y": 59, "r": 32},
    {"x": 928, "y": 59, "r": 32}
]
TERROR_TRACK_COORDS = [
    {**anchor, "points": [list(p) for p in _TERROR_SLOT_SHAPE]}
    for anchor in _TERROR_SLOT_ANCHORS
]

import copy
def load_map_coordinates(map_name):
    filename = f"static/coordinates_{map_name}.json"
    if os.path.exists(filename):
        try:
            with open(filename, "r") as f:
                data = json.load(f)
                return data.get("nodes", NODE_COORDINATES), data.get("terror", TERROR_TRACK_COORDS), data.get("adjacency", ADJACENCY_LIST)
        except:
            pass
    return copy.deepcopy(NODE_COORDINATES), copy.deepcopy(TERROR_TRACK_COORDS), copy.deepcopy(ADJACENCY_LIST)

def save_map_coordinates(map_name, nodes, terror, adjacency):
    filename = f"static/coordinates_{map_name}.json"
    try:
        with open(filename, "w") as f:
            json.dump({"nodes": nodes, "terror": terror, "adjacency": adjacency}, f, indent=4)
    except:
        pass

HERO_CLASSES = {
    "The Guardian": {"name": "The Guardian", "ap": 5, "start": "Arcane Forge", "ability": "You may use a Guide action on a Hero, with their permission. This does not take an action.", "origin_map": "Map.png"},
    "The Investigator": {"name": "The Investigator", "ap": 4, "start": "South Station", "ability": "Discard two items to pick one item from the discard pile and keep it.", "origin_map": "Map.png"},
    "The Buccaneer": {"name": "The Buccaneer", "ap": 3, "start": "The Scuttled Siren", "ability": "At the start of your turn, discard one item to gain +4 actions this turn (use only once per turn).", "origin_map": "Map.png"},
    "The Fortune Teller": {"name": "The Fortune Teller", "ap": 4, "start": "The Fool's Journey", "ability": "You may look at the top Monster card on your turn. This does not take an action.", "origin_map": "Map.png"},
    "The Parapsychologist": {"name": "The Parapsychologist", "ap": 4, "start": "Weir's Observatory", "ability": "You may distribute any items you have to other players.", "origin_map": "Map.png"},
    "Actor": {"name": "Actor", "ap": 4, "start": "Agora", "ability": "Discard two Items to pick one Item from the discard pile and keep it.", "origin_map": "map-greek.png"},
    "Hoplite": {"name": "Hoplite", "ap": 4, "start": "Battlefield", "ability": "Place your Hero in a space with a Lair.", "origin_map": "map-greek.png"},
    "Mariner": {"name": "Mariner", "ap": 4, "start": "Port", "ability": "Give any number of Items you have to another player.", "origin_map": "map-greek.png"},
    "Musician": {"name": "Musician", "ap": 4, "start": "Odeon", "ability": "Place your Hero in a space with a Legend.", "origin_map": "map-greek.png"},
    "Ranger": {"name": "Ranger", "ap": 4, "start": "Forest of the Dryads", "ability": "When the Terror Level increases, draw a Perk card. Ability is always in effect and does not take an action.", "origin_map": "map-greek.png"},
    "Shepherd": {"name": "Shepherd", "ap": 4, "start": "Vineyard", "ability": "Look at the top Monster card.", "origin_map": "map-greek.png"},
    "Traveler": {"name": "Traveler", "ap": 5, "start": "Stables", "ability": "None", "origin_map": "map-greek.png"}
}

# Item catalog + physical token pool are now data-driven, loaded from
# assets/data/item_definitions.json (the 30 unique items: name/category/artwork)
# and assets/data/item_tokens.json (the 60 physical tokens: which item, where it
# spawns, and its strength). Categories map onto the puzzle-facing "color" a
# monster's Advance requirements check against: Weapon=Purple, Arcane=Green,
# Mundane=Blue.
CATEGORY_COLOR_MAP = {"Weapon": "Purple", "Arcane": "Green", "Mundane": "Blue"}

# Fixed Frenzy order (lowest acts "first"/holds the marker by default): Yeti < Sphinx <
# Jiangshi < Cthulhu. Used both to seed active_monsters at game start and to hand the
# Frenzy marker off to the next-lowest active monster whenever its current holder is defeated.
FRENZY_ORDER = {"Yeti": 1, "Sphinx": 2, "Jiangshi": 3, "Cthulhu": 4}


def _load_items_pool() -> List[Dict]:
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "data")
    with open(os.path.join(data_dir, "item_definitions.json"), "r", encoding="utf-8") as f:
        definitions = {d["id"]: d for d in json.load(f)}
    with open(os.path.join(data_dir, "item_tokens.json"), "r", encoding="utf-8") as f:
        tokens = json.load(f)

    pool = []
    for token in tokens:
        definition = definitions[token["itemId"]]
        pool.append({
            "name": definition["name"],
            "color": CATEGORY_COLOR_MAP[definition["category"]],
            "category": definition["category"],
            "artwork": definition["artwork"],
            "strength": token["value"],
            "location": token["spawn"]
        })
    return pool


ITEMS_POOL = _load_items_pool()


def _load_monster_catalog() -> Dict[str, Dict]:
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "monsters")
    catalog = {}
    for fname in ("yeti.json", "sphinx.json", "jiangshi.json", "cthulhu.json"):
        with open(os.path.join(data_dir, fname), "r", encoding="utf-8") as f:
            data = json.load(f)
            catalog[data["name"]] = data
    return catalog


MONSTER_CATALOG = _load_monster_catalog()


def _get_monster_symbols(name: str) -> List[str]:
    """Frenzy symbols a monster currently reacts to (Cthulhu reads its active phase's list)."""
    entry = MONSTER_CATALOG.get(name)
    if not entry:
        return []
    if entry.get("frenzySymbols"):
        return [s["symbol"] for s in entry["frenzySymbols"]]
    phase = entry.get("phases", [{}])[0]
    return [s["symbol"] for s in phase.get("frenzySymbols", [])]


MONSTER_SYMBOLS: Dict[str, List[str]] = {name: _get_monster_symbols(name) for name in MONSTER_CATALOG}

# Each card's monster_attack.symbol matches against a monster's MONSTER_SYMBOLS (see
# MONSTER_CATALOG, loaded from src/monsters/*.json) to decide who acts; monster_attack.frenzy
# means "whoever currently holds the Frenzy marker acts". Both can independently apply to
# different monsters off the same card. steps/dice feed activate_monster/perform_attack as before.
MONSTER_CARDS = [
    {"id": "c1", "name": "Vital Energy", "spawn": 2, "event_title": "...", "event_text": "Each Hero and Villager moves 2 spaces toward the Purple Monster closest to them.", "event_type": "vital_energy", "monster_attack": {"frenzy": True, "symbol": "Gear", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c2", "name": "Awaiting the hunt", "spawn": 1, "event_title": "...", "event_text": "Each Orange Monster deals 1 damage to each Hero and Villager in their space.", "event_type": "awaiting_the_hunt", "monster_attack": {"frenzy": False, "symbol": "Eye", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c3", "name": "Descent into madness", "spawn": 0, "event_title": "...", "event_text": "Move each Jewel Monster to the closest Hero.", "event_type": "descent_into_madness", "monster_attack": {"frenzy": False, "symbol": "Tincture", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c4", "name": "Awaiting the hunt", "spawn": 1, "event_title": "...", "event_text": "Each Orange Monster deals 1 damage to each Hero and Villager in their space.", "event_type": "awaiting_the_hunt", "monster_attack": {"frenzy": False, "symbol": "Eye", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c5", "name": "Descent into madness", "spawn": 0, "event_title": "...", "event_text": "Move each Jewel Monster to the closest Hero.", "event_type": "descent_into_madness", "monster_attack": {"frenzy": False, "symbol": "Tincture", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c6", "name": "Call of the Siren", "spawn": 3, "event_title": "Morgan Appears", "event_text": "Spawn Citizen Morgan at Mary's Mill. Safe haven: The Fool's Journey.", "event_type": "spawn_morgan", "monster_attack": {"frenzy": True, "symbol": "Hand", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION
    {"id": "c7", "name": "Midnight Bells", "spawn": 3, "event_title": "Mari in Danger", "event_text": "Spawn Citizen Mari at The Fool's Journey. Safe haven: House of Dawn.", "event_type": "spawn_mari", "monster_attack": {"frenzy": True, "symbol": "Jewel", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION
    {"id": "c8", "name": "Destruction", "spawn": 1, "event_title": "...", "event_text": "Move each Eye Monster to the closest Lair location.", "event_type": "destruction", "monster_attack": {"frenzy": False, "symbol": "Gear", "steps": 2, "dice": 1}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c9", "name": "Celestial Empowerment", "spawn": 0, "event_title": "...", "event_text": "Move each Ghost Monster 3 spaces towards the Hero with the most items.", "event_type": "celestial_empowerment", "monster_attack": {"frenzy": True, "symbol": "Dagger", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c10", "name": "Celestial Empowerment", "spawn": 0, "event_title": "...", "event_text": "Move each Ghost Monster 3 spaces towards the Hero with the most items.", "event_type": "celestial_empowerment", "monster_attack": {"frenzy": True, "symbol": "Dagger", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c11", "name": "Destruction", "spawn": 1, "event_title": "...", "event_text": "Move each Eye Monster to the closest Lair location.", "event_type": "destruction", "monster_attack": {"frenzy": False, "symbol": "Gear", "steps": 2, "dice": 1}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c12", "name": "Echoes of the Past", "spawn": 3, "event_title": "Howard Appears", "event_text": "Spawn Citizen Howard at Stewards Spire. Safe haven: The Roaming Wolf.", "event_type": "spawn_howard", "monster_attack": {"frenzy": True, "symbol": "Tincture", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION
    {"id": "c13", "name": "Gyrocopter Search", "spawn": 3, "event_title": "...", "event_text": "Turn a revealed Lair face down, then mix up all facedown Lairs. Move the Frenzy Marker to the next Monster.", "event_type": "gyrocopter_search", "monster_attack": {"frenzy": True, "symbol": "Tincture", "steps": 3, "dice": 2}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c14", "name": "Nowhere to hide", "spawn": 2, "event_title": "...", "event_text": "Each Tincture Monster removes all items from the closest space containing items.", "event_type": "nowhere_to_hide", "monster_attack": {"frenzy": True, "symbol": "Jewel", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c15", "name": "Nowhere to hide", "spawn": 2, "event_title": "...", "event_text": "Each Tincture Monster removes all items from the closest space containing items.", "event_type": "nowhere_to_hide", "monster_attack": {"frenzy": True, "symbol": "Jewel", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c16", "name": "Whispers in the Dark", "spawn": 3, "event_title": "Ms. Spindlewood Vanishes", "event_text": "Spawn Ms. Spindlewood at House of Dusk.", "event_type": "spawn_spindlewood", "monster_attack": {"frenzy": True, "symbol": "Gear", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION
    {"id": "c17", "name": "Midnight Consultation", "spawn": 3, "event_title": "Dr. Weir Investigates", "event_text": "Spawn Dr. Weir at Skybound Galleon. Safe haven: Weir's Observatory.", "event_type": "spawn_weir", "monster_attack": {"frenzy": True, "symbol": "Jewel", "steps": 1, "dice": 1}}, ## <<--- ORIGINAL VERSION
    {"id": "c18", "name": "A Distant Melody", "spawn": 3, "event_title": "Shinya Wanders", "event_text": "Spawn Citizen Shinya at Arcane Forge. Safe haven: Steam Plant.", "event_type": "spawn_shinya", "monster_attack": {"frenzy": True, "symbol": "Ghost", "steps": 2, "dice": 1}}, ## <<--- ORIGINAL VERSION
    {"id": "c19", "name": "James & Betty", "spawn": 3, "event_title": "James & Betty Arrive", "event_text": "Spawn James & Betty at South Station. Safe haven: Door of the World.", "event_type": "spawn_james_betty", "monster_attack": {"frenzy": True, "symbol": "Dagger", "steps": 2, "dice": 2}}, ## <<--- ORIGINAL VERSION
    {"id": "c20", "name": "Vaughn", "spawn": 3, "event_title": "Citizen - Vaughn", "event_text": "Spawn Citizen Vaughn at House of Dawn. Safe haven: The Scuttled Siren.", "event_type": "spawn_vaughn", "monster_attack": {"frenzy": True, "symbol": "Eye", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION
    {"id": "c21", "name": "Forge Fire Flickers", "spawn": 3, "event_title": "Jennifer's Discovery", "event_text": "Spawn Citizen Jennifer at Clockwork Village. Safe haven: Stilt Town.", "event_type": "spawn_jennifer", "monster_attack": {"frenzy": True, "symbol": "Jewel", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION
    {"id": "c22", "name": "Stilted Silence", "spawn": 3, "event_title": "Raimi Stirs", "event_text": "Spawn Citizen Raimi at Thornvine Woods. Safe haven: Specter Trail Caravan.", "event_type": "spawn_raimi", "monster_attack": {"frenzy": True, "symbol": "Ghost", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION
    {"id": "c23", "name": "Deja Vu", "spawn": 0, "event_title": "...", "event_text": "For each Monster, draw and place an item token, and place the Monster in that item's space.", "event_type": "deja_vu", "monster_attack": {"frenzy": True, "symbol": "Eye", "steps": 1, "dice": 2}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c24", "name": "Aquatic Convergence", "spawn": 2, "event_title": "...", "event_text": "Move each Monster 2 spaces towards the closest Wrench Monster.", "event_type": "aquatic_convergence", "monster_attack": {"frenzy": False, "symbol": "Hand", "steps": 2, "dice": 1}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c25", "name": "Aquatic Convergence", "spawn": 2, "event_title": "...", "event_text": "Move each Monster 2 spaces towards the closest Wrench Monster.", "event_type": "aquatic_convergence", "monster_attack": {"frenzy": False, "symbol": "Hand", "steps": 2, "dice": 1}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c26", "name": "Vital Energy", "spawn": 2, "event_title": "...", "event_text": "Each Hero and Villager moves 2 spaces toward the Purple Monster closest to them.", "event_type": "vital_energy", "monster_attack": {"frenzy": True, "symbol": "Ghost", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c27", "name": "Whiteout", "spawn": 2, "event_title": "...", "event_text": "Each Hand Monster deals 1 damage to the closest Hero or Villager if they are within 3 spaces.", "event_type": "whiteout", "monster_attack": {"frenzy": False, "symbol": "Wrench", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c28", "name": "Whiteout", "spawn": 2, "event_title": "...", "event_text": "Each Hand Monster deals 1 damage to the closest Hero or Villager if they are within 3 spaces.", "event_type": "whiteout", "monster_attack": {"frenzy": False, "symbol": "Wrench", "steps": 1, "dice": 3}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c29", "name": "Folie a Deux", "spawn": 3, "event_title": "...", "event_text": "Each Monster moves 1 space toward the closest Hero. Move the Frenzy Marker to the next Monster.", "event_type": "folie_a_deux", "monster_attack": {"frenzy": True, "symbol": "Tincture", "steps": 3, "dice": 2}}, ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
    {"id": "c30", "name": "Provisions", "spawn": 1, "event_title": "...", "event_text": "Each player draws 1 item from the bag or discard pile and keeps it. Move each Villager 1 space toward their safe location.", "event_type": "provisions", "monster_attack": {"frenzy": False, "symbol": "Jewel", "steps": 1, "dice": 1}} ## <<--- ORIGINAL VERSION, NEED IMPLEMENTATION
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

def find_shortest_path(start: str, targets: Set[str], adjacency: Dict = None) -> Optional[str]:
    """Returns the next location on the shortest path towards any of the target nodes."""
    if not targets or start in targets:
        return start

    if adjacency is None:
        adjacency = ADJACENCY_LIST

    paths = {start: [[start]]}
    queue = [start]

    while queue:
        node = queue.pop(0)
        curr_len = len(paths[node][0])

        for neighbor in adjacency.get(node, []):
            if neighbor not in paths:
                paths[neighbor] = [p + [neighbor] for p in paths[node]]
                queue.append(neighbor)
            elif len(paths[neighbor][0]) == curr_len + 1:
                for p in paths[node]:
                    paths[neighbor].append(p + [neighbor])
                    
    target_dists = {t: len(paths[t][0]) for t in targets if t in paths}
    if not target_dists:
        return start
        
    min_dist = min(target_dists.values())
    best_targets = [t for t, d in target_dists.items() if d == min_dist]
    best_targets.sort()
    target = best_targets[0]
    
    target_paths = paths[target]
    target_paths.sort(key=lambda p: tuple(p))
    
    if len(target_paths[0]) > 1:
        return target_paths[0][1]
    return start

def get_best_monster_move(start: str, hero_targets: Set[str], citizen_targets: Set[str], adjacency: Dict = None) -> Optional[str]:
    """Finds best move, preferring heroes if equidistant."""
    if start in hero_targets or start in citizen_targets:
        return start

    if adjacency is None:
        adjacency = ADJACENCY_LIST

    paths = {start: [[start]]}
    queue = [start]

    while queue:
        node = queue.pop(0)
        curr_len = len(paths[node][0])

        for neighbor in adjacency.get(node, []):
            if neighbor not in paths:
                paths[neighbor] = [p + [neighbor] for p in paths[node]]
                queue.append(neighbor)
            elif len(paths[neighbor][0]) == curr_len + 1:
                for p in paths[node]:
                    paths[neighbor].append(p + [neighbor])

    hero_dists = {t: len(paths[t][0]) for t in hero_targets if t in paths}
    cit_dists = {t: len(paths[t][0]) for t in citizen_targets if t in paths}
    
    min_h = min(hero_dists.values()) if hero_dists else 999
    min_c = min(cit_dists.values()) if cit_dists else 999
    
    if min_h == 999 and min_c == 999:
        return start
        
    if min_h <= min_c:
        best_targets = [t for t, d in hero_dists.items() if d == min_h]
    else:
        best_targets = [t for t, d in cit_dists.items() if d == min_c]
        
    best_targets.sort()
    target = best_targets[0]
    
    target_paths = paths[target]
    target_paths.sort(key=lambda p: tuple(p))
    
    if len(target_paths[0]) > 1:
        return target_paths[0][1]
    return start

# ---------------------------------------------------------
# AUTHORITATIVE GAME STATE ENGINE
# ---------------------------------------------------------

class GameRoom:
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
        self.item_bag: List[Dict] = []
        self.perk_deck: List[Dict] = []
        self.active_monsters: List[str] = []
        self.defeated_monsters: List[str] = []
        self.selected_monsters: List[str] = ["Yeti", "Jiangshi"]  # lobby pick, host-controlled, visible to all
        self.pending_dice_roll = None
        self.roll_event = None
        self.pending_block_choice = None  # non-dice attack sources (e.g. a monster Power) that target one hero directly
        self.block_choice_event = None

        # Board entities
        self.heroes_state: Dict[str, Dict] = {} # player_name -> state
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
        self.active_perks_limit = {} # prevents double-use
        self.frenzy_marker = "" # which monster has frenzy token
        self.power_events: List[Dict] = []  # rolling feed of resolved monster Powers, for client-side toast notifications
        self.citizen_events: List[Dict] = []  # rolling feed of citizen spawns, for client-side toast notifications

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
        import copy
        self.item_bag = copy.deepcopy(ITEMS_POOL)
        random.shuffle(self.item_bag)
        self.discarded_items = []
        
        # Set up decks
        self.deck = copy.deepcopy(MONSTER_CARDS)
        random.shuffle(self.deck)
        self.discard = []
        self.perk_deck = list(PERK_CARDS)
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
            "Ms. Spindlewood": {"name": "Ms. Spindlewood", "location": "Board", "start": self.get_safe_loc("House of Dusk"), "safe": self.get_safe_loc("Spindlewood Institute"), "active": False, "portrait": "ms_spindlewood.png"}, ## <<--- ORIGINAL VERSION
            "Mari": {"name": "Mari", "location": "Board", "start": self.get_safe_loc("The Fool's Journey"), "safe": self.get_safe_loc("House of Dawn"), "active": False, "portrait": "Mari.png"},
            "Howard": {"name": "Howard", "location": "Board", "start": self.get_safe_loc("Stewards Spire"), "safe": self.get_safe_loc("The Roaming Wolf"), "active": False, "portrait": "Howard.png"},
            "Dr. Weir": {"name": "Dr. Weir", "location": "Board", "start": self.get_safe_loc("Skybound Galleon"), "safe": self.get_safe_loc("Weir's Observatory"), "active": False, "portrait": "dr_weir.png"}, ## <<--- ORIGINAL VERSION
            "Shinya": {"name": "Shinya", "location": "Board", "start": self.get_safe_loc("Arcane Forge"), "safe": self.get_safe_loc("Steam Plant"), "active": False, "portrait": "Shinya.png"}, ## <<--- ORIGINAL VERSION
            "James & Betty": {"name": "James & Betty", "location": "Board", "start": self.get_safe_loc("South Station"), "safe": self.get_safe_loc("Door of the World"), "active": False, "portrait": "James_Betty.png"}, ## <<--- ORIGINAL VERSION
            "Morgan": {"name": "Morgan", "location": "Board", "start": self.get_safe_loc("Mary's Mill"), "safe": self.get_safe_loc("The Fool's Journey"), "active": False, "portrait": "Morgan.png"}, ## <<--- ORIGINAL VERSION
            "Vaughn": {"name": "Vaughn", "location": "Board", "start": self.get_safe_loc("House of Dawn"), "safe": self.get_safe_loc("The Scuttled Siren"), "active": False, "portrait": "Vaughn.png"}, ## <<--- ORIGINAL VERSION
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
        self.monster_locations = {}
        self.monster_states = {}
        for monster in self.active_monsters:
            if monster == "Sphinx":
                self.monster_locations[monster] = self.get_safe_loc("Specter Trail Caravan")
            elif monster == "Jiangshi":
                self.monster_locations[monster] = self.get_safe_loc("House of Dusk")
            elif monster == "Cthulhu":
                self.monster_locations[monster] = self.get_safe_loc("The Void")
            else:
                self.monster_locations[monster] = self.get_safe_loc("The Roaming Wolf")
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
                    "player_tracks": {}, # player_name -> step index (-1 if on main board)
                    "current_item": None,
                    "manacles_placed": 0,
                    "bind_progress": {} # player_name -> {"color", "progress"}
                }
                for p in self.players:
                    self.monster_states["Cthulhu"]["player_tracks"][p["name"]] = -1

        if self.active_monsters:
            self.frenzy_marker = self.active_monsters[0]

        self.game_started = True
        self.game_start_time = time.time()
        self.game_end_time = None
        self.add_log("The game has begun! Protect the town and defeat the monsters.")

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
            
        greek_mapping = {
            "North Station": "Trading Post",
            "Specter Trail Caravan": "Temple of Athena",
            "Reviving Throne": "Temple of Hades",
            "Spindlewood Institute": "Mount Iliad",
            "Crossroads West": "Cross Roads",
            "Steam Plant": "Forest of the Dryads",
            "Crossroads Center": "Cross Roads",
            "Stilt Town": "Statue of Talos",
            "The Void": "Bay of Ghosts",
            "Skybound Galleon": "Lighthouse",
            "The Scuttled Siren": "Stables",
            "Clockwork Village": "Agora",
            "House of Dusk": "Temple of Nyx",
            "Arcane Forge": "Ruins",
            "The Fool's Journey": "Odeon",
            "Garden of the Risen": "Gaseous Swamp",
            "Stewards Spire": "Acropolis",
            "South Station": "Port",
            "Thornvine Woods": "Vineyards",
            "Crossroads East": "Cross Roads 2",
            "Weir's Observatory": "Gymnasium",
            "Mary's Mill": "Stadium",
            "Door of the World": "Necropolois",
            "The Roaming Wolf": "Battlefield",
            "House of Dawn": "Temple of Zeus"
        }
        mapped = greek_mapping.get(loc, loc)
        if mapped in self.adjacency_list:
            return mapped
            
        import random
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
            self.discarded_items.append(item)
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
                self.discarded_items.append(item)
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
                self.discarded_items.append(item)
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
            self.active_monsters.remove("Cthulhu")
            self.defeated_monsters.append("Cthulhu")
            self._reassign_frenzy_if_needed()
            h_state["ap"] -= 1
            self.add_log("CTHULHU IS LOCKED AWAY IN R'LYEH... for now.")
            self.check_victory()
            return True

        return False

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

    def _reassign_frenzy_if_needed(self):
        """If the monster currently holding the Frenzy marker is no longer active (e.g.
        it was just defeated), hand the marker to the next-lowest monster in Frenzy
        order (Yeti < Sphinx < Jiangshi < Cthulhu) that's still active."""
        if self.frenzy_marker in self.active_monsters:
            return
        if self.active_monsters:
            self.frenzy_marker = min(self.active_monsters, key=lambda m: FRENZY_ORDER.get(m, 99))
            self.add_log(f"The Frenzy marker moves to {self.frenzy_marker}.")
        else:
            self.frenzy_marker = ""

    def check_victory(self):
        if not self.active_monsters:
            self.game_phase = "GameOverWin"
            self.game_end_time = time.time()
            self.add_log("VICTORY! All monsters have been defeated. The town is safe!")

    def check_defeat(self, reason: str):
        self.game_phase = "GameOverLose"
        self.game_end_time = time.time()
        self.add_log(f"DEFEAT! {reason}")

    # ---------------------------------------------------------
    # MONSTER PHASE
    # ---------------------------------------------------------

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
            import traceback
            self.add_log(f"CRITICAL ERROR IN MONSTER PHASE: {str(e)} | {traceback.format_exc()}")
            print(f"CRITICAL ERROR IN MONSTER PHASE: {str(e)}\n{traceback.format_exc()}")
            # Attempt to recover the phase so the game isn't stuck forever
            if self.game_phase == "MonsterPhase":
                self.turn_player_idx = (self.turn_player_idx + 1) % len(self.players)
                self.game_phase = "HeroPhase"

        if broadcast_fn:
            await broadcast_fn()

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

    def _apply_direct_hit(self, hero_name: str):
        """Applies one unblockable-except-by-Security hit to a hero (used by attacks that
        have already resolved their block choice, and by monster Powers)."""
        if self.active_perks_limit.get("block_all_hits", False):
            return
        h_state = self.heroes_state[hero_name]
        self.terror_level = min(7, self.terror_level + 1)
        self.add_log(f"{hero_name} was DEFEATED by the attack!")
        self.check_terror()
        h_state["location"] = "Reviving Throne"
        self.add_log(f"{hero_name} respawns at Reviving Throne.")
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

        import uuid
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
        import uuid
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
            self.frenzy_marker = monster
            self.add_log(f"Power rolled {powers} time(s)! The Frenzy marker moves to {monster} and its Power activates {powers} time(s).")
            for _ in range(powers):
                await self.trigger_monster_power(monster, broadcast_fn)

        if broadcast_fn:
            await broadcast_fn()

    async def perform_attack_citizen(self, monster: str, citizen_name: str, dice: int, broadcast_fn=None):
        self.add_log(f"{monster} is attacking {citizen_name}!")

        hits = 0
        powers = 0
        for _ in range(dice):
            roll = random.choice(["Hit", "Hit", "Power", "Blank", "Blank", "Blank"])
            if roll == "Hit":
                hits += 1
            elif roll == "Power":
                powers += 1

        if hits > 0:
            self._defeat_citizen(citizen_name, monster=monster)
        else:
            self.add_log(f"The attack on {citizen_name} missed!")

        if powers > 0:
            self.frenzy_marker = monster
            self.add_log(f"Power rolled {powers} time(s)! The Frenzy marker moves to {monster} and its Power activates {powers} time(s).")
            for _ in range(powers):
                await self.trigger_monster_power(monster, broadcast_fn)

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

    async def send_event(self, room_code: str, event_data: dict):
        if room_code in self.rooms:
            data = json.dumps(event_data)
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


@app.get("/api/map")
def api_get_map(map: str = "Map.png"):
    nodes, terror, adjacency = load_map_coordinates(map)
    return {"nodes": nodes, "terror": terror, "adjacency": adjacency}

@app.post("/api/map")
async def api_save_map(request: Request):
    body = await request.json()
    map_name = body.get("map")
    data = body.get("data", {})
    save_map_coordinates(map_name, data.get("nodes", {}), data.get("terror", []), data.get("adjacency", {}))
    return {"status": "ok"}

@app.websocket("/ws/{room_code}/{player_name}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_name: str):
    await websocket.accept()
    room = room_manager.get_or_create_room(room_code)
    room_manager.websockets[room_code].append(websocket)
    
    player = next((p for p in room.players if p["name"] == player_name), None)
    if not player:
        is_host = len(room.players) == 0
        taken_heroes = {p["hero"] for p in room.players}
        default_hero = next((h for h in HERO_CLASSES if h not in taken_heroes), "The Guardian")
        player = {
            "name": player_name,
            "hero": default_hero,
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
                    taken_by_other = any(p["hero"] == hero and p["name"] != player_name for p in room.players)
                    if not taken_by_other:
                        player["hero"] = hero
                        room.add_log(f"{player_name} selected {hero}.")
                        
            elif action == "set_map":
                if player["is_host"] and not room.game_started:
                    room.selected_map = msg.get("map", "Map.png")
                    room.node_coordinates, room.terror_track_coordinates, room.adjacency_list = load_map_coordinates(room.selected_map)
                    room.add_log(f"Server actually set map to: {room.selected_map}")
                    
            elif action == "select_monsters":
                if player["is_host"] and not room.game_started:
                    monsters = msg.get("monsters", [])
                    if isinstance(monsters, list) and all(m in MONSTER_CATALOG for m in monsters):
                        room.selected_monsters = monsters
                        room.add_log(f"{player_name} set the monster line-up: {', '.join(monsters) if monsters else 'none'}.")

            elif action == "start_game":
                if player["is_host"] and not room.game_started:
                    monsters = room.selected_monsters
                    room.initialize_game(monsters)
                    
            elif action == "move":
                target = msg.get("target")
                room.execute_move(player_name, target)
                
            elif action == "guide":
                legend = msg.get("legend")
                target = msg.get("target")
                room.execute_guide(player_name, legend, target)
                
            elif action == "pickup":
                item_ids = msg.get("item_ids", [])
                picked_items = room.execute_pickup(player_name, item_ids)
                if picked_items:
                    await room_manager.send_event(room_code, {
                        "type": "item_pickup",
                        "player": player_name,
                        "location": room.heroes_state[player_name]["location"],
                        "items": [i["id"] for i in picked_items]
                    })
                
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
                args = msg.get("args", {})
                room.execute_defeat(player_name, monster, args)
                
            elif action == "finish_dice_roll":
                if room.pending_dice_roll and room.pending_dice_roll["hero"] == player_name:
                    room.pending_dice_roll["chosen_items"] = msg.get("item_ids")
                    if room.roll_event:
                        room.roll_event.set()

            elif action == "finish_block_choice":
                if room.pending_block_choice and room.pending_block_choice["hero"] == player_name:
                    room.pending_block_choice["chosen_items"] = msg.get("item_ids")
                    if room.block_choice_event:
                        room.block_choice_event.set()


            elif action == "special":
                args = msg.get("args", {})
                room.execute_special(player_name, args)
                
            elif action == "play_perk":
                perk_id = msg.get("perk_id")
                args = msg.get("args", {})
                room.execute_play_perk(player_name, perk_id, args)
                
            elif action == "end_turn":
                room.end_turn(player_name)

            elif action == "return_to_menu":
                # Only allow tearing down the room once the game has actually ended,
                # e.g. from the "Main Menu" button on the Game Over banner.
                if room.game_phase in ("GameOverLose", "GameOverWin"):
                    await room_manager.send_event(room_code, {"type": "room_closed"})
                    sockets_to_close = list(room_manager.websockets.get(room_code, []))
                    room_manager.rooms.pop(room_code, None)
                    room_manager.websockets.pop(room_code, None)
                    for ws in sockets_to_close:
                        try:
                            await ws.close()
                        except Exception:
                            pass
                    return

            elif action == "draw_monster_card":
                active_player = room.players[room.turn_player_idx]["name"]
                if player_name == active_player and room.game_phase == "MonsterPhase" and not getattr(room, "monster_phase_running", False):
                    room.monster_phase_running = True
                    async def _bcast():
                        await room_manager.broadcast_state(room_code)
                    async def run_with_lock():
                        try:
                            await room.run_monster_phase(_bcast)
                        finally:
                            room.monster_phase_running = False
                    asyncio.create_task(run_with_lock())

            elif action == "chat":
                text = msg.get("text")
                if text:
                    room.add_log(f"[{player_name}]: {text}")
                    
            elif action == "update_coordinates":
                coords = msg.get("coordinates")
                terror_coords = msg.get("terror_coordinates")
                adjacency = msg.get("adjacency")
                room.update_coordinates(coords, terror_coords, adjacency)

            await room_manager.broadcast_state(room_code)
            
    except WebSocketDisconnect:
        if room_code in room_manager.websockets and websocket in room_manager.websockets[room_code]:
            room_manager.websockets[room_code].remove(websocket)
        room.add_log(f"{player_name} disconnected from lobby.")
        await room_manager.broadcast_state(room_code)

# Serve Images
app.mount("/Images", StaticFiles(directory="Images"), name="images")
# Serve Music
app.mount("/Music", StaticFiles(directory="Music"), name="music")
# Serve item artwork + data (assets/items/*.png, assets/data/*.json)
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
# Serve Frontend static files
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
