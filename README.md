# Horrified: World of Monsters - Online Multiplayer Video Game

Welcome to the online web adaptation of the **Horrified: World of Monsters** board game! This game allows you to play cooperatively with your friends and family from different locations in real-time.

## Features

- **Cooperative Multiplayer:** Synchronized state across multiple web browsers in real-time using WebSockets.
- **Autoritative Game Logic:** Validation of moves, item pick-ups, citizen rescues, monster movement, and combat rolls handled securely by the backend server.
- **Sleek Premium UI:** A dark-themed, glassmorphic design featuring an interactive SVG game map, sideboards for active monster challenges, action controls, and real-time logs.
- **All 4 Monsters Implemented:** Face off against the Yeti, Jiangshi, Sphinx, and Cthulhu with custom puzzle-like mechanics.
- **All 5 Hero Classes:** Choose between the Adventurer, Detective, Explorer, Scholar, or Tinkerer, each with their signature ability.
- **Chat & System Logs:** Real-time chat system to coordinate strategies.

---

## How to Run the Game

The game runs inside a Conda environment with FastAPI and Uvicorn.

### Step 1: Activate the Environment (If needed)

The project has been configured to run in your `horrified` conda environment.

### Step 2: Start the Server

Run the server using your environment's python executable:
```bash
# From Z:\FIU\Projects\Horrified
conda activate horrified
python server.py
```
*(The server is currently running in the background for you!)*

### Step 3: Access and Play

1. Open your web browser and navigate to: **`http://localhost:8000`**
2. Enter your name and click **Create Room** to generate a 4-letter room code (e.g. `ABCD`).
3. Share the room code with your friends.
4. Have them go to `http://<your-ip-address>:8000` (or `http://localhost:8000` if on the same machine), enter their name and the room code, and click **Join Room**.
5. Select your heroes and monsters, then click **Start Video Game** to begin!

---

## Game Rules Summary

### 1. Hero Phase (Your Turn)
On your turn, you have a set number of **Action Points (AP)** (default is 4) to spend:
- **Move (1 AP):** Move along paths to adjacent locations. (Explorer can move up to 2 steps for 1 AP).
- **Pick Up (1 AP):** Take any number of items from your current location (up to your inventory limit of 4).
- **Guide (1 AP):** Move with a citizen at your location to an adjacent space. If you guide a citizen to their safe haven, they are rescued, and you draw a **Perk Card**!
- **Share (1 AP):** Trade items with another hero at your location.
- **Advance (1 AP):** Work on a monster's challenge (e.g., place items in the Jiangshi's sword, place blue items for the Sphinx, reveal Yeti lairs, or break Cthulhu's runes).
- **Defeat (1 AP):** Defeat a monster if all conditions on its mat are satisfied.
- **Special Ability (0 or 1 AP):** Trigger your hero's unique ability.

### 2. Monster Phase
After you end your turn:
1. New items are spawned from the bag.
2. An event card is drawn, resolving unique events or spawning citizens.
3. Active monsters move towards the closest hero or citizen and roll attack dice.
4. **Combat:** Discard items from your inventory to block damage. If a hero is hit with no items, they are defeated and respawn, raising the **Terror Level**. Citizens are instantly defeated if hit.

### 3. Victory & Defeat
- **Victory:** Defeat all selected monsters!
- **Defeat:** The Terror Level reaches 10, or the Monster Deck runs out of cards.
