"""Loads every hardcoded game constant from data/*.json instead of Python literals.

Also owns the two live-coordinate persistence helpers (load/save_map_coordinates),
since they read/write the same data/board/ directory these constants seed as a
fallback from.
"""
import copy
import json
import os
from typing import Dict, List

_SRC_DIR = os.path.dirname(os.path.abspath(__file__))
_BASE_DIR = os.path.dirname(_SRC_DIR)
DATA_DIR = os.path.join(_BASE_DIR, "data")


def _load_json(relpath: str):
    with open(os.path.join(DATA_DIR, relpath), "r", encoding="utf-8") as f:
        return json.load(f)


HERO_CLASSES: Dict[str, Dict] = _load_json("heroes.json")
MONSTER_CARDS: List[Dict] = _load_json("monster_cards.json")
PERK_CARDS: List[Dict] = _load_json("perk_cards.json")
CATEGORY_COLOR_MAP: Dict[str, str] = _load_json("item_colors.json")
FRENZY_ORDER: Dict[str, int] = _load_json("frenzy_order.json")
GREEK_LOCATION_MAP: Dict[str, str] = _load_json("greek_location_map.json")

_default_board = _load_json("board/default_board.json")
NODE_COORDINATES: Dict[str, Dict] = _default_board["nodes"]
TERROR_TRACK_COORDS: List[Dict] = _default_board["terror"]
ADJACENCY_LIST: Dict[str, List[str]] = _default_board["adjacency"]


def load_map_coordinates(map_name: str):
    filename = os.path.join(DATA_DIR, "board", f"coordinates_{map_name}.json")
    if os.path.exists(filename):
        try:
            with open(filename, "r") as f:
                data = json.load(f)
                return data.get("nodes", NODE_COORDINATES), data.get("terror", TERROR_TRACK_COORDS), data.get("adjacency", ADJACENCY_LIST)
        except Exception:
            pass
    return copy.deepcopy(NODE_COORDINATES), copy.deepcopy(TERROR_TRACK_COORDS), copy.deepcopy(ADJACENCY_LIST)


def save_map_coordinates(map_name: str, nodes: Dict, terror: List, adjacency: Dict):
    filename = os.path.join(DATA_DIR, "board", f"coordinates_{map_name}.json")
    try:
        with open(filename, "w") as f:
            json.dump({"nodes": nodes, "terror": terror, "adjacency": adjacency}, f, indent=4)
    except Exception:
        pass


def _load_items_pool() -> List[Dict]:
    items_dir = os.path.join(DATA_DIR, "items")
    with open(os.path.join(items_dir, "item_definitions.json"), "r", encoding="utf-8") as f:
        definitions = {d["id"]: d for d in json.load(f)}
    with open(os.path.join(items_dir, "item_tokens.json"), "r", encoding="utf-8") as f:
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


ITEMS_POOL: List[Dict] = _load_items_pool()


def _load_monster_catalog() -> Dict[str, Dict]:
    """Auto-discovers every monster catalog file in data/monsters/, so adding a new
    monster (playable or scaffolded-but-not-yet-selectable) only requires dropping in a
    JSON file here - no loader code change needed."""
    monsters_dir = os.path.join(DATA_DIR, "monsters")
    catalog = {}
    for fname in sorted(os.listdir(monsters_dir)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(monsters_dir, fname), "r", encoding="utf-8") as f:
            data = json.load(f)
            catalog[data["name"]] = data
    return catalog


MONSTER_CATALOG: Dict[str, Dict] = _load_monster_catalog()


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


def _get_monster_colors(name: str) -> List[str]:
    """Perception Die colors a monster currently reacts to (same source list as
    MONSTER_SYMBOLS, just keyed by each symbol's color instead of its name) - Monster
    Card event text refers to monsters by either name ("Ghost Monster") or color
    ("Orange Monster") interchangeably."""
    entry = MONSTER_CATALOG.get(name)
    if not entry:
        return []
    if entry.get("frenzySymbols"):
        return [s["color"] for s in entry["frenzySymbols"]]
    phase = entry.get("phases", [{}])[0]
    return [s["color"] for s in phase.get("frenzySymbols", [])]


MONSTER_COLORS: Dict[str, List[str]] = {name: _get_monster_colors(name) for name in MONSTER_CATALOG}
