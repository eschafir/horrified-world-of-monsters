"""GameRoom: the authoritative per-room game engine, assembled from concern-based mixins.

Each mixin owns one slice of GameRoom's behavior (see individual files for detail); they
share state only through `self.*` attributes set up by LifecycleMixin.__init__. Monster
logic is split by *concern* (advance/defeat/phase/combat), not by monster, because
Cthulhu's two-phase state leaks into several otherwise-generic dispatchers (execute_move,
activate_monster, _apply_direct_hit) - see monster_puzzles.py and monster_phase.py.
"""
from src.game.board import BoardMixin
from src.game.combat import CombatMixin
from src.game.frenzy import FrenzyMixin
from src.game.hero_actions import HeroActionsMixin
from src.game.lifecycle import LifecycleMixin
from src.game.monster_phase import MonsterPhaseMixin
from src.game.monster_puzzles import MonsterPuzzlesMixin
from src.game.special_abilities import SpecialAbilitiesMixin


class GameRoom(
    LifecycleMixin,
    BoardMixin,
    HeroActionsMixin,
    MonsterPuzzlesMixin,
    SpecialAbilitiesMixin,
    MonsterPhaseMixin,
    CombatMixin,
    FrenzyMixin,
):
    pass
