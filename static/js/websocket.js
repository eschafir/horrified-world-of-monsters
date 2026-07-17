// ---------------------------------------------------------
// INITIALIZE EVENTS
// ---------------------------------------------------------

const elMapSelectView = document.getElementById("map-select-view");
const elBtnConfirmMap = document.getElementById("btn-confirm-map");

// Helper to toggle Greek theme
function applyThemeForMap(mapName) {
    const subtitle = document.getElementById("game-subtitle");
    if (mapName === "map-greek.png") {
        document.body.classList.add("greek-theme");
        if (subtitle) subtitle.innerText = "GREEK MONSTERS";
    } else {
        document.body.classList.remove("greek-theme");
        if (subtitle) subtitle.innerText = "WORLD OF MONSTERS";
    }
}

// Attach listeners to radio buttons immediately
document.querySelectorAll('input[name="map-choice"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        applyThemeForMap(e.target.value);
    });
});

elBtnCreate.addEventListener("click", () => {
    playerName = elPlayerNameInput.value.trim();
    if (!playerName) {
        showAlertToast("Please enter your name!");
        return;
    }
    elSetupView.classList.add("hidden");
    elMapSelectView.classList.remove("hidden");
    // Ensure theme matches default selected radio
    const chosenMap = document.querySelector('input[name="map-choice"]:checked').value;
    applyThemeForMap(chosenMap);
});

elBtnConfirmMap.addEventListener("click", () => {
    elMapSelectView.classList.add("hidden");
    setupConnection(true);
});

elBtnJoin.addEventListener("click", () => {
    playerName = elPlayerNameInput.value.trim();
    if (!playerName) {
        showAlertToast("Please enter your name!");
        return;
    }
    setupConnection(false);
});

elBtnStart.addEventListener("click", () => {
    if (!gameState || !gameState.selected_monsters || gameState.selected_monsters.length === 0) {
        showAlertToast("Please select at least one monster to face!");
        return;
    }
    sendMsg({ action: "start_game" });
});

// Only the host can change the monster line-up; every client's checkboxes are kept in
// sync with gameState.selected_monsters (see updateGameUI), so this just relays the
// host's own change back to the server to broadcast to everyone else.
const MONSTER_CHECKBOX_IDS = { "mon-yeti": "Yeti", "mon-jiangshi": "Jiangshi", "mon-sphinx": "Sphinx", "mon-cthulhu": "Cthulhu" };
Object.keys(MONSTER_CHECKBOX_IDS).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
        const me = gameState && gameState.players && gameState.players.find(p => p.name === playerName);
        if (!me || !me.is_host) return;
        const monsters = Object.entries(MONSTER_CHECKBOX_IDS)
            .filter(([cbId]) => document.getElementById(cbId).checked)
            .map(([, name]) => name);
        sendMsg({ action: "select_monsters", monsters: monsters });
    });
});

// Game duration timer (bottom-left sidebar, under Monster Phase). Ticks every second off
// the server-tracked game_start_time/game_end_time so it stays correct across reconnects
// and freezes once the game ends, rather than drifting as a purely local stopwatch.
function updateGameTimerDisplay() {
    const el = document.getElementById("game-timer-display");
    if (!el) return;

    if (!gameState || !gameState.game_started || !gameState.game_start_time) {
        el.textContent = "00:00";
        return;
    }

    const endTime = gameState.game_end_time || (Date.now() / 1000);
    const elapsed = Math.max(0, Math.floor(endTime - gameState.game_start_time));
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    const pad = (n) => String(n).padStart(2, "0");

    el.textContent = hours > 0
        ? `${hours}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
}
setInterval(updateGameTimerDisplay, 1000);

elBtnChatSend.addEventListener("click", sendChatMessage);
elChatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChatMessage();
});

// Game top tabs (Active Monsters / My Hero) — clicking active tab closes it
document.querySelectorAll(".game-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const panelId = btn.dataset.panel;
        const panel = document.getElementById(panelId);
        const isActive = btn.classList.contains("active");

        // Close all
        document.querySelectorAll(".game-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".game-top-panel").forEach(p => p.classList.add("hidden"));

        // If it wasn't active, open this one
        if (!isActive) {
            btn.classList.add("active");
            panel.classList.remove("hidden");
        }
    });
});

// Bottom log/chat panel toggle
document.getElementById("btn-toggle-log").addEventListener("click", () => {
    const panel = document.getElementById("bottom-log-panel");
    const arrow = document.getElementById("log-toggle-arrow");
    const isHidden = panel.classList.contains("hidden");
    panel.classList.toggle("hidden");
    arrow.textContent = isHidden ? "▼" : "▲";
});

// Log/Chat sub-tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.remove("hidden");
    });
});

elCloseModal.addEventListener("click", () => {
    elModalContainer.classList.add("hidden");
    elModalContainer.querySelector(".modal-content")?.classList.remove("modal-wide");
});

// Volume Slider Event Listener
document.getElementById("bg-music-volume").addEventListener("input", updateMusicVolume);

// Game Over banner "Main Menu" button: asks the server to destroy the room,
// then every client (including this one) returns to the lobby via "room_closed".
if (elBtnMainMenu) {
    elBtnMainMenu.addEventListener("click", () => {
        sendMsg({ action: "return_to_menu" });
    });
}

// ---------------------------------------------------------
// REAL-TIME WEBSOCKET MANAGEMENT
// ---------------------------------------------------------

function setupConnection(isHost) {
    if (isHost) {
        // Generate random 4-letter room code
        roomCode = "";
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (let i = 0; i < 4; i++) {
            roomCode += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    } else {
        roomCode = elRoomCodeInput.value.trim().toUpperCase();
        if (roomCode.length !== 4) {
            showAlertToast("Room Code must be 4 characters!");
            return;
        }
    }

    // Connect to local WebSocket
    const loc = window.location;
    const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${loc.host}/ws/${roomCode}/${playerName}`;
    
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        elSetupView.classList.add("hidden");
        elMapSelectView.classList.add("hidden");
        elWaitingView.classList.remove("hidden");
        elDisplayRoomCode.innerText = roomCode;
        renderHeroSelectOptions();
        
        if (isHost) {
            const chosenMap = document.querySelector('input[name="map-choice"]:checked').value;
            sendMsg({ action: "chat", text: `Host selected map: ${chosenMap}` });
            sendMsg({ action: "set_map", map: chosenMap });
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "state") {
            detectAndAnimatePerkCardDraws(data.state);
            gameState = data.state;
            if (gameState.game_phase !== "MonsterPhase") {
                hasDrawnThisPhase = false;
            }
            detectAndAnimateSpawns();
            updateGameUI();
        } else if (data.type === "item_pickup") {
            if (data.player !== playerName) {
                animateRemoteItemPickup(data.player, data.location, data.items);
            }
        } else if (data.type === "room_closed") {
            intentionalDisconnect = true;
            returnToMainMenu();
        }
    };

    socket.onerror = (err) => {
        console.error("Socket error: ", err);
    };

    socket.onclose = () => {
        if (intentionalDisconnect) {
            intentionalDisconnect = false;
            return;
        }
        showAlertToast("Disconnected from server. Reconnecting...");
    };
}

// Tears down the local session and returns to the lobby's setup screen.
// Called after the server confirms the room has been destroyed (see "room_closed").
function returnToMainMenu() {
    if (socket) {
        try { socket.close(); } catch (e) {}
    }
    socket = null;
    gameState = null;
    roomCode = "";
    hasDrawnThisPhase = false;
    lastDrawnCardId = null;
    lastGamePhaseSeen = null;

    elGameOverOverlay.classList.add("hidden");
    elGameScreen.classList.add("hidden");
    elLobbyScreen.classList.remove("hidden");
    elWaitingView.classList.add("hidden");
    elMapSelectView.classList.add("hidden");
    elSetupView.classList.remove("hidden");
    elRoomCodeInput.value = "";
}

function findItemInGameState(itemId) {
    if (!gameState) return null;
    if (gameState.items_on_board) {
        for (const loc in gameState.items_on_board) {
            const item = gameState.items_on_board[loc].find(i => i.id === itemId);
            if (item) return item;
        }
    }
    if (gameState.heroes_state) {
        for (const name in gameState.heroes_state) {
            const item = gameState.heroes_state[name].items.find(i => i.id === itemId);
            if (item) return item;
        }
    }
    return null;
}

function animateRemoteItemPickup(remotePlayerName, locationId, itemIds) {
    if (!gameState) return;

    const fallbackCoord = gameState.node_coordinates[locationId];

    const playerTokenEl = document.getElementById("map-hero-" + remotePlayerName.replace(/ /g, "_"));
    if (!playerTokenEl) return;
    const screenEnd = playerTokenEl.getBoundingClientRect();

    const targetSvgX = parseFloat(playerTokenEl.getAttribute("cx")) || (fallbackCoord && fallbackCoord.x) || 0;
    const targetSvgY = parseFloat(playerTokenEl.getAttribute("cy")) || (fallbackCoord && fallbackCoord.y) || 0;

    itemIds.forEach((itemId, idx) => {
        const item = findItemInGameState(itemId);
        const itemColor = item ? item.color : "blue";
        const itemStrength = item ? item.strength : "?";
        const itemName = item ? item.name : "Item";

        // Read the item marker's live position now, before the follow-up state
        // broadcast removes it from the board and re-renders the map.
        const itemEl = document.getElementById("map-item-" + itemId);
        let screenStart;
        if (itemEl) {
            const rect = itemEl.getBoundingClientRect();
            screenStart = { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 };
        } else if (fallbackCoord) {
            screenStart = getScreenCoordsOfSVGPoint(fallbackCoord.x, fallbackCoord.y);
        } else {
            return;
        }

        setTimeout(() => {
            playItemPickupSound();

            const fly = document.createElement("div");
            fly.className = "flying-item-token";

            const colorMap = {
                blue: "#33ccff",
                purple: "#a64dff",
                green: "#33ff66"
            };
            const circleColor = colorMap[itemColor.toLowerCase()] || "#a491c3";

            fly.style.cssText = `
                position: fixed;
                left: ${screenStart.left - 12}px;
                top: ${screenStart.top - 12}px;
                width: 24px;
                height: 24px;
                background: ${circleColor};
                border: 2px solid #fff;
                border-radius: 50%;
                color: #000;
                font-family: sans-serif;
                font-size: 11px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                pointer-events: none;
                box-shadow: 0 0 12px ${circleColor}, 0 4px 10px rgba(0,0,0,0.5);
                transition: left 0.7s cubic-bezier(0.25, 1, 0.5, 1),
                            top 0.7s cubic-bezier(0.25, 1, 0.5, 1),
                            transform 0.7s cubic-bezier(0.25, 1, 0.5, 1),
                            opacity 0.7s ease;
            `;
            fly.textContent = itemStrength;
            
            const labelSpan = document.createElement("span");
            labelSpan.textContent = itemName;
            labelSpan.style.cssText = `
                position: absolute;
                top: 28px;
                white-space: nowrap;
                background: rgba(27, 21, 45, 0.9);
                color: #e5d4ff;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 3px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            `;
            fly.appendChild(labelSpan);
            
            document.body.appendChild(fly);
            
            requestAnimationFrame(() => requestAnimationFrame(() => {
                fly.style.left = `${screenEnd.left + screenEnd.width / 2 - 12}px`;
                fly.style.top = `${screenEnd.top + screenEnd.height / 2 - 12}px`;
                fly.style.transform = "scale(0.8)";
                fly.style.opacity = "0.5";
            }));
            
            fly.addEventListener("transitionend", () => {
                fly.remove();
                triggerNodePulse(targetSvgX, targetSvgY, 16, circleColor, 2.5, 3.0);
            }, { once: true });
        }, idx * 150);
    });
}

function sendMsg(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

function sendChatMessage() {
    const text = elChatInput.value.trim();
    if (text) {
        sendMsg({ action: "chat", text: text });
        elChatInput.value = "";
    }
}

