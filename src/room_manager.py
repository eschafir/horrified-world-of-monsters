"""Multi-room socket manager: tracks one GameRoom + its live WebSocket connections per
room code, and pushes serialized state / one-off events to everyone in a room."""
import json
from typing import Dict, List

from fastapi import WebSocket

from src.game import GameRoom


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
