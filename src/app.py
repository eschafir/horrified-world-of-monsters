"""FastAPI app: no-cache middleware, static mounts, the /api/map REST endpoints (used by
static/editor.html's calibration tool), and the single WebSocket route that dispatches
every player action onto the room's GameRoom instance."""
import asyncio
import json

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from src.data_loader import HERO_CLASSES, MONSTER_CATALOG, load_map_coordinates, save_map_coordinates
from src.room_manager import room_manager

app = FastAPI()


@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


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
                result = room.execute_advance(player_name, monster, args)
                # execute_advance normally returns bool; the Siren's tile-flip mismatch
                # case returns a dict signaling a delayed follow-up (auto-unflip after 5s).
                if isinstance(result, dict) and result.get("action") == "siren_delay":
                    async def _delayed_siren_unflip(sq1_id, sq2_id):
                        await asyncio.sleep(5)
                        siren_state = room.monster_states.get("Siren")
                        if not siren_state:
                            return
                        sq1 = next((s for s in siren_state["squares"] if s["id"] == sq1_id), None)
                        sq2 = next((s for s in siren_state["squares"] if s["id"] == sq2_id), None)
                        if sq1 and sq2 and not sq1["matched"] and not sq2["matched"]:
                            sq1["flipped"] = False
                            sq2["flipped"] = False
                            if sq1 in siren_state["currently_flipping"]:
                                siren_state["currently_flipping"].remove(sq1)
                            if sq2 in siren_state["currently_flipping"]:
                                siren_state["currently_flipping"].remove(sq2)
                            await room_manager.broadcast_state(room_code)

                    asyncio.create_task(_delayed_siren_unflip(result["sq1"], result["sq2"]))

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
# Serve item artwork (assets/items/*.png)
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
# Serve Frontend static files
app.mount("/", StaticFiles(directory="static", html=True), name="static")
