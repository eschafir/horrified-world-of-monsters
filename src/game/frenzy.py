"""Frenzy marker reassignment and victory/defeat detection."""
import time

from src.data_loader import FRENZY_ORDER


class FrenzyMixin:
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
