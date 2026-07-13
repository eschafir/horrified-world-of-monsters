# Horrified: World of Monsters - Online

A web-based multiplayer digital implementation of the board game **Horrified: World of Monsters**, built for seamless zero-install online play with friends.

---

## 🌟 Key Features

* **Interactive Full-Screen Board**: High-resolution SVG map container overlaid with click-to-move locations and detail-modals.
* **Procedural Ambient Soundtrack**: Smooth, spooky background music synthesized in real-time using the browser's native **HTML5 Web Audio API**—no heavy audio assets required!
* **Consonant Hover Melodies**: Interacting with map locations triggers custom synthesized chimes dynamically tuned to G4 (`392Hz`) with a soft `25ms` attack peak for satisfying tactile feedback.
* **Glow & Zoom Boss Markers**: High-fidelity custom circles for the **Yeti** and **Sphinx** containing circular crops of official artwork, which smoothly scale up to `2.2x` on hover with drop-shadow glows.
* **3D Stacked Card Decks**: Realistic visual decks for Perks (landscape) and Monsters (portrait) with real-time remaining-count badges and automated opacity dimming when empty.
* **FastAPI Backend**: Authoritative Python game server driving synchronized turns, actions, item bags, and chat logs over WebSockets.

---

## 🛠️ Installation & Setup

This game requires **Python 3.10** and a Conda environment.

### 1. Environment Setup
```bash
# Activate your Conda environment
conda activate horrified

# Install required packages
pip install fastapi uvicorn pydantic
```

### 2. Run the Server
Launch the authoritative game server from the project root:
```bash
python server.py
```

### 3. Open the Client
Once Uvicorn starts, open your web browser and navigate to:
```url
http://localhost:8000
```
Enter your name, create or join a room code, and start playing!

---

## ⚙️ Layout Calibration (Debug Mode)

The client includes a built-in real-time coordinate calibrator to align SVG hitboxes to any new background illustration layout:

1. Press **`D`** on your keyboard to toggle **Debug Mode** (lights up hitboxes in semi-transparent green/red).
2. **Move**: Click and drag any circle (platform) or rectangle (banner) to position it.
3. **Resize Circle**: Hover over a green circle and **scroll the mouse wheel** to adjust the radius (`r`).
4. **Resize Rectangle**: Hover over a red rectangle and **scroll the mouse wheel** to adjust the width (`rw`). Hold **`Shift` + scroll** to adjust the height (`rh`).
5. **Auto-Save**: The updated layout automatically broadcasts to the server on mouse release and saves to `static/new_coordinates.json`.
