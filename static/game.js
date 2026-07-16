// ---------------------------------------------------------
// GAME CLIENT STATE VARIABLES
// ---------------------------------------------------------

let socket = null;
let playerName = "";
let roomCode = "";
let gameState = null;
let selectedAction = null;
let lastDrawnCardId = null;
let isCardFlying = false;
let hasDrawnThisPhase = false;
let lastCharacterPositions = {};
let pendingCardData = null;
let selectedItemsForAction = []; // Track item selections for trades/scaffold
let destinationNodeSelection = null; // Track movement target
let guideSelectedLegend = null; // { name, loc, type } — the citizen/Yeti child chosen as the Guide source, on-map, step 2 of 2
let chosenHero = "The Guardian";
let dragType = null;
let dragLocName = null;
let lastGamePhaseSeen = null;
let lastPendingDiceRollId = "";
let intentionalDisconnect = false;
let lastTerrorLevel = null;
let pendingTerrorTransitionFrom = null; // consumed once by renderSVGMap to slide the neon ring from its old slot
let knownDefeatedMonsters = null; // Set of monster names already seen in defeated_monsters, to trigger a defeat sound only once

// Map Zoom & Pan State
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
const baseWidth = 1304;
const baseHeight = 1206;

// Side Panel Carousel Indices
let currentHeroTabIndex = 0;
let currentMonsterTabIndex = 0;

const HEROES_LIST = ["The Guardian", "The Investigator", "The Buccaneer", "The Fortune Teller", "The Parapsychologist"];

// ---------------------------------------------------------
// ELEMENT SELECTORS
// ---------------------------------------------------------

const elLobbyScreen = document.getElementById("lobby-screen");
const elGameScreen = document.getElementById("game-screen");
const elSetupView = document.getElementById("setup-view");
const elWaitingView = document.getElementById("waiting-view");
const elPlayerNameInput = document.getElementById("player-name");
const elRoomCodeInput = document.getElementById("room-code");
const elDisplayRoomCode = document.getElementById("display-room-code");
const elHeroOptions = document.getElementById("hero-options");
const elConnectedPlayers = document.getElementById("connected-players");
const elHostSettings = document.getElementById("host-settings");
const elHostStartWrap = document.getElementById("host-start-wrap");
const elBtnCreate = document.getElementById("btn-create");
const elBtnJoin = document.getElementById("btn-join");
const elBtnStart = document.getElementById("btn-start");

const elGameMap = document.getElementById("game-map");
const elLogBox = document.getElementById("game-log-box");
const elChatBox = document.getElementById("chat-box");
const elChatInput = document.getElementById("chat-input");
const elBtnChatSend = document.getElementById("btn-chat-send");
const elModalContainer = document.getElementById("modal-container");
const elModalBody = document.getElementById("modal-body");
const elCloseModal = document.querySelector(".close-modal");
const elBtnMainMenu = document.getElementById("btn-main-menu");
const elGameOverOverlay = document.getElementById("game-over-overlay");

// Action point display
const elApDisplay = document.getElementById("action-points-left");

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
        alert("Please enter your name!");
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
        alert("Please enter your name!");
        return;
    }
    setupConnection(false);
});

elBtnStart.addEventListener("click", () => {
    if (!gameState || !gameState.selected_monsters || gameState.selected_monsters.length === 0) {
        alert("Please select at least one monster to face!");
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
            alert("Room Code must be 4 characters!");
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
        alert("Disconnected from server. Reconnecting...");
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

// ---------------------------------------------------------
// HERO SELECTION RENDERING (LOBBY)
// ---------------------------------------------------------

function renderHeroSelectOptions() {
    elHeroOptions.innerHTML = "";

    const heroData = {
        "The Guardian":         { ap: 5, start: "Arcane Forge",        ability: "Guide a hero at your location to an adjacent space — no AP cost." },
        "The Investigator":     { ap: 4, start: "South Station",       ability: "Discard 2 items to retrieve any 1 item from the discard pile." },
        "The Buccaneer":        { ap: 3, start: "The Scuttled Siren",  ability: "Discard 1 item at turn start to gain +4 AP this turn." },
        "The Fortune Teller":   { ap: 4, start: "The Fool's Journey",  ability: "Peek at the top Monster Card for free, once per turn." },
        "The Parapsychologist": { ap: 4, start: "Weir's Observatory",  ability: "Send any item from your hand to any player anywhere on the board." }
    };

    // Heroes already claimed by other connected players can't be picked
    const takenBy = {};
    if (gameState && gameState.players) {
        gameState.players.forEach(p => {
            if (p.name !== playerName) {
                takenBy[p.hero] = p.name;
            }
        });
    }

    HEROES_LIST.forEach(hero => {
        const data = heroData[hero];
        const takenByName = takenBy[hero];
        const card = document.createElement("div");
        card.className = `hero-card ${chosenHero === hero ? "selected" : ""} ${takenByName ? "taken" : ""}`;

        card.innerHTML = `
            <div class="hero-card-portrait-wrap">
                <div class="hero-card-portrait">
                    <img src="/Images/Heroes/${hero} Image.png" alt="${hero}">
                </div>
                <button type="button" class="hero-card-info-btn" title="View ${hero} card" onclick="event.stopPropagation(); showHeroCardModal('${hero}')">i</button>
            </div>
            <div class="hero-card-name">${hero}</div>
            <div class="hero-card-ap">${data.ap} AP</div>
            <div class="hero-card-loc">&#128205; ${data.start}</div>
            <div class="hero-card-ability">${data.ability}</div>
            ${takenByName ? `<div class="hero-card-taken-label">Taken by ${takenByName}</div>` : ''}
        `;

        if (takenByName) {
            card.title = `${hero} is already taken by ${takenByName}`;
        } else {
            card.addEventListener("click", () => {
                chosenHero = hero;
                document.querySelectorAll(".hero-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                sendMsg({ action: "select_hero", hero: hero });
            });
        }
        elHeroOptions.appendChild(card);
    });
}

// In-world lore excerpts shown alongside a hero's Card image, sourced from found
// letters/journals — only heroes with a written entry appear here.
const HERO_LORE = {
    "The Guardian": {
        text: "Whooo originally created this beast of steel remains a mystery. It... or rather... they were discovered alongside the void. But it was under the guidance of Dr. Weir that the early stewards brought the Guardian to life, intending them to be this terrestrial plane's first line of defense. Is their penchant for the finer things something awoken by human meddling or a clue to the Guardian's origins?",
        signature: "Howard"
    },
    "The Fortune Teller": {
        text: "When artifacts defy science and even the Spindlewood Institute's prodding, whooo do you call but the Fortune Teller! This infuriates Dr. Weir, a fact that brings a smirk to my beak when I remember the Fortune Teller is the good doctor's daughter. When not rapt by an object's ghostly memory or some such vision, she runs The Fool's Journey, the best teahouse this side of the void.",
        signature: "Howard"
    },
    "The Parapsychologist": {
        text: "The Parapsychologist sees beyond the veil and digs under the surface to provide the stewards critical strategic information... all with the help of a little grub that wriggled its way from who knows where out of the void. The grub speaks to him, and the parapsychologist oft reminds me the grub is quite the wisecracker and not, indeed, a snack. Pity.",
        signature: "Howard"
    },
    "The Investigator": {
        text: "How lucky we are the Investigator 'retired' from public service to lend her expertise inside the Door of the world! The stories she tells of ancient vampires, cursed mummies, and vicious threats that cannot be perceived by the naked eye... Hooo! They could make even the most seasoned historian molt! (I admit I am not a fan of her companion. An unnerving countenance.)",
        signature: "Howard"
    },
    "The Buccaneer": {
        text: "Yohoohoo! When the stewards first dredged the siren from the lake bottom, they unwittingly freed the Buccaneer from a locked chest discovered below deck. According to reports, the dastardly specter erupted from his prison cursing his mutinous crew. Whooo would have guessed the Buccaneer would be the last pirate alive (sort of) to tell the tale!",
        signature: "Howard"
    }
};

window.showHeroCardModal = (heroName) => {
    const modalContentEl = elModalContainer.querySelector(".modal-content");
    const imgSrc = `/Images/Heroes/${heroName} Card.png`;
    const lore = HERO_LORE[heroName];

    if (lore) {
        if (modalContentEl) modalContentEl.classList.add("modal-wide");
        elModalBody.innerHTML = `
            <h2 style="margin-top:0;">${heroName}</h2>
            <div class="hero-lore-layout">
                <img src="${imgSrc}" alt="${heroName} Card" class="hero-lore-card-img">
                <div class="hero-lore-text-wrap">
                    <p class="hero-lore-text">${lore.text}</p>
                    <p class="hero-lore-signature">&mdash;${lore.signature}</p>
                </div>
            </div>
            <p style="text-align: center; color: #a491c3; font-size: 0.9rem; margin-top: 16px;">Close this window to continue.</p>
        `;
    } else {
        if (modalContentEl) modalContentEl.classList.remove("modal-wide");
        elModalBody.innerHTML = `
            <h2 style="margin-top:0;">${heroName}</h2>
            <div style="text-align: center; margin: 20px 0;">
                <img src="${imgSrc}" alt="${heroName} Card" style="max-width: 100%; max-height: 500px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            </div>
            <p style="text-align: center; color: #a491c3; font-size: 0.9rem;">Close this window to continue.</p>
        `;
    }
    elModalContainer.classList.remove("hidden");
};

window.showMonsterInfoModal = (monsterName) => {
    const modalContentEl = elModalContainer.querySelector(".modal-content");
    if (modalContentEl) modalContentEl.classList.remove("modal-wide");

    const catalog = (gameState && gameState.monster_catalog) || {};
    const entry = catalog[monsterName];
    if (!entry) {
        elModalBody.innerHTML = `<h2>${monsterName}</h2><p style="color:#a491c3;">No data available.</p>`;
        elModalContainer.classList.remove("hidden");
        return;
    }

    const portrait = MONSTER_PORTRAIT_MAP[monsterName] || "";
    const accent = MONSTER_ACCENT_MAP[monsterName] || { border: "rgba(255,51,102,0.6)", glow: "rgba(255,51,102,0.3)" };

    const symbolRow = (symbols) => {
        if (!symbols || !symbols.length) return "";
        const chips = symbols.map(s => {
            const hex = getSymbolColorHex(s.color);
            return `
                <div style="display:flex; align-items:center; gap:6px; padding:5px 10px; border-radius:16px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);">
                    <span style="width:14px; height:14px; border-radius:50%; background:${hex}; box-shadow:0 0 6px ${hex}; border:1.5px solid rgba(0,0,0,0.4); flex-shrink:0;"></span>
                    <span style="font-size:0.72rem; font-weight:600; color:#f0e8ff;">${s.symbol}</span>
                </div>`;
        }).join("");
        return `
            <div style="margin-bottom:12px;">
                <div style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#a491c3; margin-bottom:6px;">Reacts to</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${chips}</div>
            </div>`;
    };

    let html = `<div style="text-align:center;">`;

    // Header: portrait + name/tags side by side
    html += `
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:14px; text-align:left;">
            <div style="width:90px; height:90px; border-radius:50%; flex-shrink:0; overflow:hidden; border:3px solid ${accent.border}; box-shadow:0 0 18px ${accent.glow}; background:rgba(255,255,255,0.04);">
                ${portrait ? `<img src="${portrait}" alt="${entry.name}" style="width:100%; height:100%; object-fit:cover;">` : ""}
            </div>
            <div>
                <h2 style="margin:0 0 6px 0;">${entry.name}</h2>
                <div>
                    <span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:8px; background:rgba(255,255,255,0.06); color:#a491c3;">${entry.complexity} complexity</span>
                    ${entry.hasLair ? `<span style="font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:8px; background:rgba(255,255,255,0.06); color:#a491c3; margin-left:6px;">Hidden Lair</span>` : ""}
                </div>
            </div>
        </div>`;

    // Objective
    html += `
        <div style="text-align:left; padding:10px 12px; border-radius:8px; background:rgba(255,255,255,0.03); border-left:3px solid ${accent.border}; margin-bottom:14px;">
            <div style="font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#a491c3; margin-bottom:4px;">Objective</div>
            <p style="color:#e5d9c8; font-size:0.83rem; line-height:1.5; margin:0;">${entry.objective}</p>
        </div>`;

    (entry.phases || []).forEach(phase => {
        const symbols = phase.frenzySymbols || entry.frenzySymbols;
        html += `<hr style="border-color: rgba(255,255,255,0.08); margin: 14px 0;">`;
        if ((entry.phases || []).length > 1) {
            html += `<h4 style="margin:0 0 10px 0; color:#ffd533; text-align:left;">${phase.name}</h4>`;
        }

        html += symbolRow(symbols);

        (phase.powers || []).forEach(power => {
            html += `<div style="text-align:left; margin-bottom:10px; padding:8px 10px; border-radius:8px; background:rgba(255,51,102,0.08); border:1px solid rgba(255,51,102,0.25);">
                <div style="font-weight:700; color:#ff8899; font-size:0.8rem;">Power: ${power.name}</div>
                <div style="font-size:0.75rem; color:#e5d9c8; margin-top:2px;">${power.description}</div>
            </div>`;
        });

        if (phase.steps && phase.steps.length) {
            html += `<div style="text-align:left; margin-bottom:6px; font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#a491c3;">Steps</div>`;
            phase.steps.forEach(step => {
                const typeColor = step.type === "Defeat" ? "#ff3366" : "#33ccff";
                html += `
                    <div style="text-align:left; display:flex; gap:10px; margin-bottom:10px;">
                        <div style="width:22px; height:22px; border-radius:50%; background:rgba(255,255,255,0.06); border:1.5px solid ${accent.border}; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; color:#f0e8ff; flex-shrink:0;">${step.number}</div>
                        <div>
                            <div style="font-weight:700; font-size:0.8rem; color:#f0e8ff;">${step.title} <span style="font-size:0.62rem; font-weight:700; text-transform:uppercase; color:${typeColor};">(${step.type})</span></div>
                            <div style="font-size:0.75rem; color:#c9b8e0; margin-top:2px;">${step.description}</div>
                        </div>
                    </div>`;
            });
        }

        if (phase.notes && phase.notes.length) {
            html += `<ul style="text-align:left; font-size:0.7rem; color:#a491c3; margin:8px 0 0; padding-left:18px;">`;
            phase.notes.forEach(note => { html += `<li>${note}</li>`; });
            html += `</ul>`;
        }
    });

    html += `<p style="text-align: center; color: #a491c3; font-size: 0.85rem; margin-top: 16px;">Close this window to continue.</p>`;
    html += `</div>`;

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
};

// ---------------------------------------------------------
// GAME UI SYNC AND RENDER ENGINE
// ---------------------------------------------------------

function updateGameUI() {
    if (!gameState) return;

    if (gameState.selected_map) {
        applyThemeForMap(gameState.selected_map);
        const mapImage = document.getElementById("game-map-image");
        if (mapImage) {
            mapImage.setAttribute("href", `/Images/${gameState.selected_map}?v=2`);
            mapImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", `/Images/${gameState.selected_map}?v=2`);
        }
    }

    if (!gameState.game_started) {
        // We are in Lobby Waiting view
        elLobbyScreen.classList.remove("hidden");
        elGameScreen.classList.add("hidden");

        // Keep our local selection in sync with the server (e.g. the auto-assigned
        // default hero on join) and refresh the hero grid so newly-taken heroes
        // become disabled for everyone else in real time.
        const myPlayer = gameState.players.find(p => p.name === playerName);
        if (myPlayer) chosenHero = myPlayer.hero;
        renderHeroSelectOptions();
        


        // Sync player lists
        elConnectedPlayers.innerHTML = "";
        gameState.players.forEach(p => {
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="player-dot"></div>
                <div class="player-info">
                    <div class="player-name">${p.name}</div>
                    <div class="player-hero-tag">${p.hero}</div>
                </div>
                ${p.is_host ? '<span class="host-badge">Host</span>' : ''}
            `;
            elConnectedPlayers.appendChild(li);
        });

        // "Choose Monsters" is always visible so remote players can see the host's picks
        // and read each monster's info - only the checkboxes themselves are host-only.
        // "Begin Adventure" stays host-only.
        elHostSettings.classList.remove("hidden");
        const me = gameState.players.find(p => p.name === playerName);
        const isHost = !!(me && me.is_host);
        elHostStartWrap.classList.toggle("hidden", !isHost);
        elHostSettings.classList.toggle("read-only", !isHost);

        const selected = new Set(gameState.selected_monsters || []);
        Object.entries(MONSTER_CHECKBOX_IDS).forEach(([id, name]) => {
            const cb = document.getElementById(id);
            if (!cb) return;
            cb.checked = selected.has(name);
            cb.disabled = !isHost;
        });
    } else {
        // The game has started!
        elLobbyScreen.classList.add("hidden");
        elGameScreen.classList.remove("hidden");

        // Top Bar info
        document.getElementById("game-room-display").innerText = gameState.room_code;
        const turnPlayer = gameState.players[gameState.turn_player_idx].name;
        document.getElementById("game-turn-display").innerText = turnPlayer;
        document.getElementById("game-terror-val").innerText = gameState.terror_level;
        document.getElementById("terror-progress").style.width = `${gameState.terror_level * 10}%`;
        document.getElementById("game-deck-display").innerText = gameState.deck_count;

        // Terror Level increase: play a sting and queue a slide transition for the map's neon ring
        if (lastTerrorLevel !== null && gameState.terror_level > lastTerrorLevel) {
            playTerrorIncreaseSound();
            pendingTerrorTransitionFrom = lastTerrorLevel;
        }
        lastTerrorLevel = gameState.terror_level;

        // Card Deck counters and states
        const elHudDeckCount = document.getElementById("hud-deck-count");
        if (elHudDeckCount) {
            elHudDeckCount.innerText = gameState.deck_count;
        }

        const elMonsterStack = document.querySelector(".monsters-stack");
        if (elMonsterStack) {
            if (gameState.deck_count === 0) {
                elMonsterStack.style.opacity = "0.3";
                // Keep pointerEvents active so the user can click it to trigger the loss!
                elMonsterStack.style.pointerEvents = "auto";
            } else {
                elMonsterStack.style.opacity = "1";
                elMonsterStack.style.pointerEvents = "auto";
            }
        }

        // Sync Action buttons enabled/disabled
        const myTurn = (turnPlayer === playerName);
        const myState = gameState.heroes_state[playerName];
        elApDisplay.innerText = myState ? myState.ap : 0;

        document.querySelectorAll(".btn-action").forEach(btn => {
            btn.disabled = !myTurn || (myState && myState.ap < 1);
        });
        document.getElementById("action-end-turn").disabled = !myTurn;

        // Highlight active phase
        const secActions = document.getElementById("sec-actions");
        const secMonsterPhase = document.getElementById("sec-monster-phase");
        if (secActions && secMonsterPhase) {
            if (gameState.game_phase === "HeroPhase") {
                secActions.classList.add("active-phase");
                secMonsterPhase.classList.remove("active-phase");
            } else if (gameState.game_phase === "MonsterPhase") {
                secActions.classList.remove("active-phase");
                secMonsterPhase.classList.add("active-phase");
            } else {
                secActions.classList.remove("active-phase");
                secMonsterPhase.classList.remove("active-phase");
            }
        }

        // Per-monster defeat sound (fires once per monster, the moment it newly appears
        // in defeated_monsters)
        detectAndPlayMonsterDefeatSounds();

        // Game Over banner (Defeat or Victory)
        if (elGameOverOverlay) {
            const elGameOverBanner = document.querySelector(".game-over-banner");
            if (gameState.game_phase === "GameOverLose") {
                if (lastGamePhaseSeen !== "GameOverLose") {
                    playGameLostSound();
                }
                if (elGameOverBanner) elGameOverBanner.classList.remove("victory");
                document.getElementById("game-over-message").textContent = "Heroes failed to save the world.";
                elGameOverOverlay.classList.remove("hidden");
            } else if (gameState.game_phase === "GameOverWin") {
                if (lastGamePhaseSeen !== "GameOverWin") {
                    playGameWonSound();
                }
                if (elGameOverBanner) elGameOverBanner.classList.add("victory");
                document.getElementById("game-over-message").textContent = "Victory! All monsters have been defeated.";
                elGameOverOverlay.classList.remove("hidden");
            } else {
                elGameOverOverlay.classList.add("hidden");
            }
        }
        lastGamePhaseSeen = gameState.game_phase;

        // Handle Interactive Dice Roll
        const elDiceOverlay = document.getElementById("dice-modal-overlay");
        const btnFinishDice = document.getElementById("btn-finish-dice");
        if (elDiceOverlay) {
            if (gameState.pending_dice_roll) {
                // Generate a unique ID for this exact attack
                const currentRollId = gameState.pending_dice_roll.id || `${gameState.pending_dice_roll.hero}_${gameState.pending_dice_roll.monster}_${gameState.pending_dice_roll.dice}_${Date.now()}`;
                const isMyRoll = (gameState.pending_dice_roll.hero === playerName);
                const descEl = document.getElementById("dice-modal-desc");
                
                if (isMyRoll) {
                    descEl.textContent = `${gameState.pending_dice_roll.monster} is attacking you! Roll the dice!`;
                } else {
                    descEl.textContent = `${gameState.pending_dice_roll.monster} is attacking ${gameState.pending_dice_roll.hero}! Waiting for them to roll...`;
                }

                if (lastPendingDiceRollId !== currentRollId) {
                    lastPendingDiceRollId = currentRollId;
                    
                    const container = document.getElementById("dice-container");
                    container.innerHTML = "";
                    btnFinishDice.classList.add("hidden");
                    btnFinishDice.disabled = false;
                    btnFinishDice.onclick = null;
                    
                    let diceRolled = 0;
                    
                    gameState.pending_dice_roll.results.forEach((result, idx) => {
                        const die = document.createElement("div");
                        die.className = "die-button";
                        die.textContent = "?";
                        container.appendChild(die);
                        
                        if (isMyRoll) {
                            die.onclick = () => {
                                if (die.classList.contains("rolled")) return;
                                
                                die.classList.add("die-rolling");
                                setTimeout(() => {
                                    die.classList.remove("die-rolling");
                                    die.classList.add("rolled");
                                    if (result === "Hit") {
                                        die.textContent = "❗";
                                    } else if (result === "Power") {
                                        die.textContent = "💥";
                                    } else {
                                        die.textContent = "—";
                                    }
                                    
                                    diceRolled++;
                                    if (diceRolled === gameState.pending_dice_roll.dice) {
                                        const hits = gameState.pending_dice_roll.results.filter(r => r === "Hit").length;
                                        if (hits === 0) {
                                            btnFinishDice.textContent = "Continue";
                                            btnFinishDice.className = "btn btn-primary";
                                            btnFinishDice.classList.remove("hidden");
                                            btnFinishDice.onclick = () => {
                                                btnFinishDice.disabled = true;
                                                btnFinishDice.textContent = "Processing...";
                                                elDiceOverlay.classList.add("hidden");
                                                socket.send(JSON.stringify({ action: "finish_dice_roll" }));
                                            };
                                        } else {
                                            btnFinishDice.textContent = "Take Damage";
                                            btnFinishDice.className = "btn btn-danger";
                                            btnFinishDice.classList.remove("hidden");
                                            btnFinishDice.onclick = () => {
                                                showDamageSelection(hits);
                                            };
                                        }
                                    }
                                }, 500); // Wait for animation to finish
                            };
                        }
                    });
                }
                
                elDiceOverlay.classList.remove("hidden");
            } else {
                elDiceOverlay.classList.add("hidden");
                lastPendingDiceRollId = "";
                const existing = document.getElementById("btn-block-damage");
                if (existing) existing.remove();
            }
        }

        // Render Sidebar lists (Inventory)
        renderPlayerPanel();
        
        function showDamageSelection(hits) {
            const container = document.getElementById("dice-container");
            const descEl = document.getElementById("dice-modal-desc");
            const btnFinishDice = document.getElementById("btn-finish-dice");
            
            descEl.textContent = `You took ${hits} damage (!)! Select items with total strength >= ${hits} to block it, or take the damage.`;
            container.innerHTML = "";
            
            const myState = gameState.heroes_state[playerName];
            let selectedIds = new Set();
            
            if (myState.items.length === 0) {
                container.innerHTML = `<p style="color: #ff3366; font-size: 1.2rem;">You have no items to block the damage!</p>`;
            } else {
                const itemsDiv = document.createElement("div");
                itemsDiv.style.display = "flex";
                itemsDiv.style.gap = "10px";
                itemsDiv.style.flexWrap = "wrap";
                itemsDiv.style.justifyContent = "center";
                
                myState.items.forEach(item => {
                    const itemEl = document.createElement("div");
                    itemEl.className = "inventory-item";
                    itemEl.style.cursor = "pointer";
                    itemEl.style.padding = "10px";
                    itemEl.style.border = "2px solid transparent";
                    itemEl.style.borderRadius = "8px";
                    itemEl.innerHTML = `<div class="item-color-box ${item.color.toLowerCase()}"></div> 
                                        <span class="item-strength">${item.strength}</span> ${item.name}`;
                                        
                    itemEl.onclick = () => {
                        if (selectedIds.has(item.id)) {
                            selectedIds.delete(item.id);
                            itemEl.style.borderColor = "transparent";
                        } else {
                            selectedIds.add(item.id);
                            itemEl.style.borderColor = "#ffcc00";
                        }
                        updateDamageButtons();
                    };
                    itemsDiv.appendChild(itemEl);
                });
                container.appendChild(itemsDiv);
            }
            
            btnFinishDice.textContent = "Take Damage (Terror +1)";
            btnFinishDice.className = "btn btn-danger";
            btnFinishDice.onclick = () => {
                btnFinishDice.disabled = true;
                btnFinishDice.textContent = "Processing...";
                const existingBlockBtn = document.getElementById("btn-block-damage");
                if (existingBlockBtn) existingBlockBtn.disabled = true;
                const overlay = document.getElementById("dice-modal-overlay");
                if (overlay) overlay.classList.add("hidden");
                console.log("SENDING FINISH DICE ROLL TO SERVER NOW");
                socket.send(JSON.stringify({ action: "finish_dice_roll" }));
            };
            
            const existing = document.getElementById("btn-block-damage");
            if (existing) existing.remove();
            
            const btnBlock = document.createElement("button");
            btnBlock.id = "btn-block-damage";
            btnBlock.className = "btn btn-primary hidden";
            btnBlock.style.marginLeft = "15px";
            btnBlock.style.marginTop = "35px";
            btnBlock.style.fontSize = "1.1rem";
            btnBlock.style.padding = "12px 35px";
            btnBlock.textContent = "Block Damage";
            
            btnFinishDice.parentNode.appendChild(btnBlock);
            
            function updateDamageButtons() {
                let totalStr = 0;
                myState.items.forEach(i => {
                    if (selectedIds.has(i.id)) totalStr += i.strength;
                });
                
                if (totalStr >= hits) {
                    btnBlock.classList.remove("hidden");
                    btnBlock.onclick = () => {
                        btnBlock.disabled = true;
                        btnBlock.textContent = "Processing...";
                        btnFinishDice.disabled = true;
                        const overlay = document.getElementById("dice-modal-overlay");
                        if (overlay) overlay.classList.add("hidden");
                        socket.send(JSON.stringify({ action: "finish_dice_roll", item_ids: Array.from(selectedIds) }));
                    };
                } else {
                    btnBlock.classList.add("hidden");
                }
            }
        }

        // Render AP counter bar
        renderApCounterBar();

        // Render monster phase card
        renderMonsterPhasePanel();

        // Render Active Monsters & Challenges
        renderMonstersStatusPanel();

        // Render the Interactive SVG Map
        renderSVGMap();

        // Game logs & chat logs
        renderLogs();
    }
}

// ---------------------------------------------------------
// SIDEBAR RENDERING HELPER METHODS
// ---------------------------------------------------------

// Compact grid of small color-coded strength chips instead of a one-row-per-item list —
// inventories are unlimited now, so this keeps the hero panel from growing without bound.
// Hovering a chip instantly shows a custom tooltip (name + image) via showItemTooltip below,
// instead of relying on the browser's slow native title tooltip.
// Shared color lookup so an item's contour/border always reflects its color
// (Purple/Blue/Green) wherever its artwork is shown, for quick identification.
function getItemColorHex(color) {
    const map = { purple: "#a64dff", blue: "#33ccff", green: "#33ff66" };
    return map[(color || "").toLowerCase()] || "rgba(255, 255, 255, 0.3)";
}

// Perception Die symbol colors (distinct palette from item colors above) — used to badge
// each monster's portrait with the symbols it reacts to during the Monster Phase.
function getSymbolColorHex(color) {
    const map = {
        orange: "#ff8833", yellow: "#ffd533", green: "#33ff66", red: "#ff3366",
        teal: "#00e5cc", purple: "#a64dff", brown: "#a0764a", blue: "#33ccff"
    };
    return map[(color || "").toLowerCase()] || "rgba(255, 255, 255, 0.4)";
}

// Mirrors the server's _get_monster_symbols: Cthulhu's frenzySymbols live per-phase
// (only phase 1 has any), every other monster keeps them at the top level.
function getMonsterSymbols(name) {
    const entry = gameState.monster_catalog && gameState.monster_catalog[name];
    if (!entry) return [];
    if (entry.frenzySymbols && entry.frenzySymbols.length) return entry.frenzySymbols;
    const phase = (entry.phases || [])[0];
    return (phase && phase.frenzySymbols) || [];
}

// Fixed Perception Die symbol -> color mapping (each symbol always has the same color
// across every monster's frenzySymbols list) so a Monster Card's bare symbol name can be
// colored without needing to know which monster(s) it belongs to.
const SYMBOL_TO_COLOR = {
    Dagger: "Orange", Ghost: "Yellow", Tincture: "Green", Hand: "Red",
    Jewel: "Teal", Eye: "Purple", Gear: "Brown", Wrench: "Blue"
};

const MONSTER_PORTRAIT_MAP = {
    "Yeti":     "/Images/Monsters/Yeti.png",
    "Sphinx":   "/Images/Monsters/Sphinx.png",
    "Jiangshi": "/Images/Monsters/Jiangshi.png",
    "Cthulhu":  "/Images/Monsters/Cthulhu.png"
};

const MONSTER_ACCENT_MAP = {
    "Yeti":     { border: "rgba(51,204,255,0.6)",  glow: "rgba(51,204,255,0.3)"  },
    "Sphinx":   { border: "rgba(255,204,0,0.6)",   glow: "rgba(255,204,0,0.3)"   },
    "Jiangshi": { border: "rgba(255,51,102,0.6)",  glow: "rgba(255,51,102,0.3)"  },
    "Cthulhu":  { border: "rgba(153,51,255,0.6)",  glow: "rgba(153,51,255,0.3)"  }
};

// Generic multi-select item-card modal used for monster puzzle/defeat item costs
// (Yeti's one-of-each-color, Sphinx/Jiangshi's combined-strength thresholds, single-item
// picks for slots/dials, etc). validateFn(selectedItems) -> {valid, message}.
window.openItemPicker = ({ title, description, items, validateFn, onConfirm, confirmLabel }) => {
    let html = `<div style="text-align:center;">`;
    html += `<h3 style="margin-top:0;">${title}</h3>`;
    if (description) html += `<p style="font-size:0.8rem; color:#b0a0cf;">${description}</p>`;
    html += `<hr style="border-color:rgba(255,255,255,0.05); margin: 10px 0;">`;
    html += `<div id="item-picker-summary" style="font-size:0.78rem; color:#ffd533; min-height:1.2em; margin-bottom:6px;"></div>`;

    if (!items || items.length === 0) {
        html += `<p style="color:#a491c3; font-style:italic;">No eligible items.</p>`;
    } else {
        html += `<div id="item-picker-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px;">`;
        items.forEach(item => {
            const imgSrc = item.artwork ? `/assets/items/${item.artwork}` : "";
            const colorHex = getItemColorHex(item.color);
            html += `
                <label class="pickup-item-card" style="width:84px; text-align:center; cursor:pointer;">
                    <input type="checkbox" class="item-picker-checkbox" value="${item.id}" style="display:none;">
                    <div class="pickup-item-thumb" style="width:64px; height:64px; margin:0 auto 6px; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.05); border:3px solid ${colorHex}; display:flex; align-items:center; justify-content:center; transition: box-shadow 0.15s ease;">
                        ${imgSrc ? `<img src="${imgSrc}" alt="${item.name}" style="width:100%; height:100%; object-fit:contain;" onerror="this.parentElement.style.visibility='hidden'">` : ''}
                    </div>
                    <div style="font-size:0.68rem; color:#e5d9c8; line-height:1.2;">${item.name}</div>
                    <div style="font-size:0.65rem; color:#a491c3;"><strong>${item.strength}</strong></div>
                </label>
            `;
        });
        html += `</div>`;
    }

    html += `
        <hr style="border-color:rgba(255,255,255,0.05); margin: 15px 0 10px 0;">
        <div style="display:flex; justify-content:center; gap:10px;">
            <button class="btn btn-secondary btn-small" onclick="elModalContainer.classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary btn-small" id="item-picker-confirm" disabled>${confirmLabel || "Confirm"}</button>
        </div>
    `;
    html += `</div>`;

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");

    const checkboxes = Array.from(document.querySelectorAll(".item-picker-checkbox"));
    const confirmBtn = document.getElementById("item-picker-confirm");
    const summaryEl = document.getElementById("item-picker-summary");

    const updateCardHighlight = (cb) => {
        const thumb = cb.nextElementSibling;
        thumb.style.boxShadow = cb.checked ? "0 0 10px 2px rgba(255, 213, 51, 0.8)" : "none";
    };

    const refresh = () => {
        const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
        const selectedItems = items.filter(i => selectedIds.includes(i.id));
        const result = validateFn ? validateFn(selectedItems) : { valid: selectedItems.length > 0 };
        summaryEl.textContent = result.message || "";
        confirmBtn.disabled = !result.valid;
        confirmBtn.onclick = () => {
            elModalContainer.classList.add("hidden");
            onConfirm(selectedIds);
        };
    };

    checkboxes.forEach(cb => {
        cb.addEventListener("change", () => {
            updateCardHighlight(cb);
            refresh();
        });
    });
    refresh();
};

function buildItemChipsHtml(items, options = {}) {
    const { selectable = false, selectedIds = [] } = options;
    if (!items || items.length === 0) {
        return `<p style="font-size: 0.72rem; color: #a491c3; font-style: italic; margin: 4px 0;">No items</p>`;
    }
    let html = `<div class="item-chip-grid">`;
    items.forEach(item => {
        const isSelected = selectable && selectedIds.includes(item.id);
        const clickAttr = selectable ? ` onclick="toggleHeroItemSelection('${item.id}')"` : "";
        const safeName = item.name.replace(/'/g, "\\'");
        const artwork = item.artwork || "";
        html += `
            <div class="item-chip item-chip-${item.color.toLowerCase()} ${isSelected ? 'selected' : ''}"
                 onmouseenter="showItemTooltip(event, '${safeName}', '${artwork}', '${item.color}')"
                 onmouseleave="hideItemTooltip()"${clickAttr}>
                ${item.strength}
            </div>
        `;
    });
    html += `</div>`;
    return html;
}

// Instant hover tooltip for item chips: item name + its artwork, served from
// assets/items/{artwork} (per assets/data/item_definitions.json). Gracefully
// hides the image if it 404s.
let itemTooltipEl = null;

function showItemTooltip(e, name, artwork, color) {
    if (!itemTooltipEl) {
        itemTooltipEl = document.createElement("div");
        itemTooltipEl.id = "item-hover-tooltip";
        document.body.appendChild(itemTooltipEl);
    }
    const imgSrc = artwork ? `/assets/items/${artwork}` : `/assets/items/${name}.png`;
    itemTooltipEl.innerHTML = `
        <img src="${imgSrc}" alt="${name}" style="border-color: ${getItemColorHex(color)};" onerror="this.remove()">
        <div class="item-tooltip-name">${name}</div>
    `;
    itemTooltipEl.classList.add("visible");

    const rect = e.currentTarget.getBoundingClientRect();
    const tRect = itemTooltipEl.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tRect.width / 2;
    let top = rect.top - tRect.height - 10;
    if (top < 4) top = rect.bottom + 10;
    left = Math.max(4, Math.min(left, window.innerWidth - tRect.width - 4));
    itemTooltipEl.style.left = `${left}px`;
    itemTooltipEl.style.top = `${top}px`;
}

function hideItemTooltip() {
    if (itemTooltipEl) itemTooltipEl.classList.remove("visible");
}

function renderPlayerPanel() {
    const elMyHeroContainer = document.getElementById("my-hero-status-container");
    const elHeroesContainer = document.getElementById("heroes-status-container");
    
    // ------------------------------------
    // 1. RENDER CURRENT PLAYER'S HERO (My Hero)
    // ------------------------------------
    if (elMyHeroContainer) {
        elMyHeroContainer.innerHTML = "";
        const myState = gameState.heroes_state[playerName];
        if (myState) {
            const heroClass = myState.hero;
            const loc = myState.location;
            const portrait = `/Images/Heroes/${heroClass} Image.png`;
            
            let abilityDesc = "";
            if (heroClass === "The Guardian") abilityDesc = "Guide: Move a hero at your location to adjacent (0 AP).";
            else if (heroClass === "The Investigator") abilityDesc = "Special: Discard 2 items to take 1 from Discard Pile (0 AP).";
            else if (heroClass === "The Buccaneer") abilityDesc = "Special: Discard 1 item at turn start to gain +4 AP (0 AP).";
            else if (heroClass === "The Fortune Teller") abilityDesc = "Special: Peak at the top Monster card (0 AP).";
            else if (heroClass === "The Parapsychologist") abilityDesc = "Special: Send items in hand to players anywhere (0 AP).";

            const card = document.createElement("div");
            card.className = "hero-status-card me-card";
            card.style.width = "100%";

            const itemsHtml = buildItemChipsHtml(myState.items, { selectable: true, selectedIds: selectedItemsForAction });

            let perksHtml = "";
            if (myState.perks && myState.perks.length > 0) {
                myState.perks.forEach(perk => {
                    perksHtml += `
                        <div class="item-row perk-row" style="background: rgba(153, 51, 255, 0.15); border-left: 3px solid #9933ff; flex-direction: column; align-items: flex-start; gap: 4px; padding: 6px; width: 100%; margin: 3px 0;">
                            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                                <strong style="color: #ffd533; font-size: 0.8rem; letter-spacing: 0.5px;">${perk.name}</strong>
                                <button class="btn-hud" style="font-size: 0.65rem; padding: 2px 6px; cursor: pointer;" onclick="playPerkCard('${perk.id}', '${perk.name}')">Play</button>
                            </div>
                            <div style="font-size: 0.7rem; color: #e0d0ff; line-height: 1.2;">${perk.text}</div>
                        </div>
                    `;
                });
            }

            card.innerHTML = `
                <div class="hero-card-header" style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-bottom:8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom:8px; text-align:center;">
                    <div class="hero-card-portrait" style="width:120px; height:120px; border-radius:50%; border:3px solid #ffd533; box-shadow: 0 0 15px rgba(255,213,51,0.4); overflow:hidden; flex-shrink:0; margin:0;">
                        <img src="${portrait}" alt="${heroClass}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div style="width:100%; display:flex; flex-direction:column; align-items:center; gap:4px;">
                        <h5 style="margin:0; font-size:1rem; color:#fff; display:flex; align-items:center; justify-content:center; gap:5px; white-space:nowrap;">
                            <span>${heroClass}</span>
                            <span style="font-size:0.75rem; color:#ffd533; font-weight:bold;">(Me)</span>
                        </h5>
                        <div style="font-size:0.75rem; color:#b0a0cf; display:flex; align-items:center; justify-content:center; gap:6px; width:100%;">
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">&#128205; ${loc}</span>
                            <button class="btn btn-secondary btn-small" style="font-size:0.65rem; padding:2px 6px; flex-shrink:0;" onclick="locateHero('${playerName}')">Locate</button>
                        </div>
                    </div>
                </div>
                <div class="hero-card-body" style="display:flex; flex-direction:column; gap:6px;">
                    <p style="font-size: 0.72rem; color: #e0d0ff; margin:0; line-height:1.3; font-style:italic; text-align:center;">${abilityDesc}</p>
                    <div style="margin-top:4px;">
                        <div style="font-size: 0.72rem; font-weight:700; color:#a491c3; margin-bottom:4px;">Inventory (${myState.items.length}):</div>
                        ${itemsHtml}
                        ${perksHtml ? `<div style="font-size: 0.72rem; font-weight:700; color:#a491c3; margin:8px 0 4px;">Perks:</div><div style="display:flex; flex-direction:column; gap:2px; width:100%;">${perksHtml}</div>` : ''}
                    </div>
                </div>
            `;
            elMyHeroContainer.appendChild(card);
        }
    }

    // ------------------------------------
    // 2. RENDER OTHER HEROES (Heroes carousel)
    // ------------------------------------
    if (elHeroesContainer) {
        elHeroesContainer.innerHTML = "";
        
        const activeHeroes = Object.keys(gameState.heroes_state || {}).filter(name => name !== playerName);
        
        if (activeHeroes.length === 0) {
            elHeroesContainer.innerHTML = `<p style="font-size: 0.8rem; color: #a491c3; text-align: center; font-style: italic; margin-top: 10px;">No other heroes in the game</p>`;
            return;
        }

        if (currentHeroTabIndex >= activeHeroes.length) {
            currentHeroTabIndex = Math.max(0, activeHeroes.length - 1);
        }

        const pName = activeHeroes[currentHeroTabIndex];
        const hState = gameState.heroes_state[pName];
        const heroClass = hState.hero;
        const loc = hState.location;
        const portrait = `/Images/Heroes/${heroClass} Image.png`;
        
        let abilityDesc = "";
        if (heroClass === "The Guardian") abilityDesc = "Guide: Move a hero at your location to adjacent (0 AP).";
        else if (heroClass === "The Investigator") abilityDesc = "Special: Discard 2 items to take 1 from Discard Pile (0 AP).";
        else if (heroClass === "The Buccaneer") abilityDesc = "Special: Discard 1 item at turn start to gain +4 AP (0 AP).";
        else if (heroClass === "The Fortune Teller") abilityDesc = "Special: Peak at the top Monster card (0 AP).";
        else if (heroClass === "The Parapsychologist") abilityDesc = "Special: Send items in hand to players anywhere (0 AP).";

        const card = document.createElement("div");
        card.className = "hero-status-card";
        card.style.width = "100%";
        
        const itemsHtml = buildItemChipsHtml(hState.items);

        let perksHtml = "";
        if (hState.perks && hState.perks.length > 0) {
            hState.perks.forEach(perk => {
                perksHtml += `
                    <div class="item-row perk-row" style="background: rgba(153, 51, 255, 0.15); border-left: 3px solid #9933ff; flex-direction: column; align-items: flex-start; gap: 4px; padding: 6px; width: 100%; margin: 3px 0;">
                        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                            <strong style="color: #ffd533; font-size: 0.8rem; letter-spacing: 0.5px;">${perk.name}</strong>
                        </div>
                        <div style="font-size: 0.7rem; color: #e0d0ff; line-height: 1.2;">${perk.text}</div>
                    </div>
                `;
            });
        }

        card.innerHTML = `
            <div class="hero-card-header" style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-bottom:8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom:8px; text-align:center;">
                <div class="hero-card-portrait" style="width:120px; height:120px; border-radius:50%; border:3px solid rgba(51, 204, 255, 0.55); box-shadow: 0 0 15px rgba(51, 204, 255, 0.3); overflow:hidden; flex-shrink:0; margin:0;">
                    <img src="${portrait}" alt="${heroClass}" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div style="width:100%; display:flex; flex-direction:column; align-items:center; gap:3px;">
                    <h5 style="margin:0; font-size:1rem; color:#fff; display:flex; align-items:center; justify-content:center; gap:5px; white-space:nowrap;">
                        <span>${heroClass}</span>
                    </h5>
                    <div style="font-size:0.75rem; color:#a491c3;">
                        Controlled by: <strong style="color:#ffd533;">${pName}</strong>
                    </div>
                    <div style="font-size:0.75rem; color:#b0a0cf; display:flex; align-items:center; justify-content:center; gap:6px; width:100%; margin-top:2px;">
                        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">&#128205; ${loc}</span>
                        <button class="btn btn-secondary btn-small" style="font-size:0.65rem; padding:2px 6px; flex-shrink:0;" onclick="locateHero('${pName}')">Locate</button>
                    </div>
                </div>
            </div>
            <div class="hero-card-body" style="display:flex; flex-direction:column; gap:6px;">
                <p style="font-size: 0.72rem; color: #e0d0ff; margin:0; line-height:1.3; font-style:italic; text-align:center;">${abilityDesc}</p>
                <div style="margin-top:4px;">
                    <div style="font-size: 0.72rem; font-weight:700; color:#a491c3; margin-bottom:4px;">Inventory (${hState.items.length}):</div>
                    ${itemsHtml}
                    ${perksHtml ? `<div style="font-size: 0.72rem; font-weight:700; color:#a491c3; margin:8px 0 4px;">Perks:</div><div style="display:flex; flex-direction:column; gap:2px; width:100%;">${perksHtml}</div>` : ''}
                </div>
            </div>
        `;

        elHeroesContainer.appendChild(card);

        const controls = document.createElement("div");
        controls.className = "carousel-controls";
        controls.style.cssText = "display:flex; justify-content:space-between; align-items:center; width:100%; margin-top:10px; padding:0 4px;";
        controls.innerHTML = `
            <button class="carousel-circle-btn" onclick="navigateHeroTab(-1)">&larr;</button>
            <span style="font-size: 0.72rem; color: #a491c3; font-weight: 600; letter-spacing: 0.5px; user-select: none;">Hero ${currentHeroTabIndex + 1} of ${activeHeroes.length}</span>
            <button class="carousel-circle-btn" onclick="navigateHeroTab(1)">&rarr;</button>
        `;
        elHeroesContainer.appendChild(controls);
    }
}

window.navigateHeroTab = (dir) => {
    const activeHeroes = Object.keys(gameState.heroes_state || {}).filter(name => name !== playerName);
    const total = activeHeroes.length;
    if (total === 0) return;
    
    currentHeroTabIndex = (currentHeroTabIndex + dir + total) % total;
    renderPlayerPanel();
};

window.toggleHeroItemSelection = (itemId) => {
    if (selectedItemsForAction.includes(itemId)) {
        selectedItemsForAction = selectedItemsForAction.filter(id => id !== itemId);
    } else {
        selectedItemsForAction.push(itemId);
    }
    updateGameUI();
};

window.locateHero = (pName) => {
    const hState = gameState.heroes_state[pName];
    if (!hState) return;
    
    const locName = hState.location;
    const cth_track = gameState.monster_states && gameState.monster_states["Cthulhu"] && gameState.monster_states["Cthulhu"]["player_tracks"];
    let finalLocName = locName;
    if (cth_track && cth_track[pName] !== -1 && cth_track[pName] !== undefined) {
        const trackIdx = cth_track[pName];
        const trackNames = ["Entrance", "Gates of Madness", "Sea of Slumber", "Cthulhu's Heart"];
        if (trackIdx >= 0 && trackIdx < trackNames.length) {
            finalLocName = trackNames[trackIdx];
        }
    }

    const coord = gameState.node_coordinates[finalLocName];
    if (!coord) return;
    
    // Zoom navigation - only pan/zoom if already zoomed in
    if (zoomLevel > 1.0) {
        const w = baseWidth / zoomLevel;
        const h = baseHeight / zoomLevel;
        
        // Center camera on coordinates
        panX = coord.x - w / 2;
        panY = coord.y - h / 2;
        updateMapViewBox();
    }
    
    // Trigger double ring pulse effect
    triggerNodePulse(coord.x, coord.y, 35, "#ffd533", 4, 3.5);
    setTimeout(() => {
        triggerNodePulse(coord.x, coord.y, 55, "rgba(255, 213, 51, 0.6)", 3, 5.0);
    }, 150);
};

window.locateMonster = (monsterName) => {
    const locName = gameState.monster_locations && gameState.monster_locations[monsterName];
    if (!locName) return;

    const coord = gameState.node_coordinates[locName];
    if (!coord) return; // e.g. Cthulhu deep in Corpse City has no board coordinates

    // Pulse from the monster's actual rendered marker (its offset position within the
    // node, which shifts when sharing a location with heroes/citizens/other monsters)
    // rather than the node's center.
    const tokenEl = document.getElementById("map-monster-" + monsterName.replace(/ /g, "_"));
    const pulseX = tokenEl ? parseFloat(tokenEl.getAttribute("cx")) : coord.x;
    const pulseY = tokenEl ? parseFloat(tokenEl.getAttribute("cy")) : coord.y;

    // Zoom navigation - only pan/zoom if already zoomed in
    if (zoomLevel > 1.0) {
        const w = baseWidth / zoomLevel;
        const h = baseHeight / zoomLevel;

        // Center camera on coordinates
        panX = coord.x - w / 2;
        panY = coord.y - h / 2;
        updateMapViewBox();
    }

    // Trigger double ring pulse effect
    triggerNodePulse(pulseX, pulseY, 35, "#ffd533", 4, 3.5);
    setTimeout(() => {
        triggerNodePulse(pulseX, pulseY, 55, "rgba(255, 213, 51, 0.6)", 3, 5.0);
    }, 150);
};

function renderApCounterBar() {
    const el = document.getElementById("ap-counter-bar");
    if (!el) return;
    const myState = gameState.heroes_state[playerName];
    if (!myState) { el.innerHTML = ""; return; }

    const maxAp = myState.max_ap || 4;
    const apLeft = typeof myState.ap === "number" ? myState.ap : maxAp;
    const used = maxAp - apLeft;

    el.innerHTML = "";
    for (let i = 0; i < maxAp; i++) {
        const dot = document.createElement("div");
        dot.className = `ap-dot ${i < used ? "ap-dot-used" : "ap-dot-free"}`;
        el.appendChild(dot);
    }
}

function buildCardHTML(card, alreadyFlipped) {
    const attack = card.monster_attack || {};
    const symbolColor = attack.symbol ? getSymbolColorHex(SYMBOL_TO_COLOR[attack.symbol]) : null;

    return `
        <div class="mp-flip-container">
            <div class="mp-card-inner${alreadyFlipped ? " flipped" : ""}" id="mp-card-inner">
                <div class="mp-card-back">
                    <img src="/Images/Monster_Card.png" alt="Monster Card">
                </div>
                <div class="mp-card-face">
                    <div class="mp-card-title">
                        <span class="mp-card-name">${card.name}</span>
                        <span class="mp-spawn-badge" title="Items spawned">&#9733; ${card.spawn}</span>
                    </div>
                    <div class="mp-card-event">
                        <span class="mp-event-title">${card.event_title}</span>
                        <span class="mp-event-text">${card.event_text}</span>
                    </div>
                    <div class="mp-card-icons">
                        <span class="mp-icon-group" title="Frenzy: ${attack.frenzy ? "Yes" : "No"}">
                            <span class="mp-icon-frenzy-wrap">
                                <span class="mp-icon-bolt">&#9889;</span>
                                ${attack.frenzy ? "" : '<span class="mp-icon-cross">&times;</span>'}
                            </span>
                        </span>
                        <span class="mp-icon-group" title="Symbol: ${attack.symbol || "None"}">
                            ${attack.symbol
                                ? `<span class="mp-symbol-dot" style="background:${symbolColor}; box-shadow:0 0 5px ${symbolColor}"></span><span class="mp-icon-label">${attack.symbol}</span>`
                                : `<span class="mp-icon-label mp-icon-dim">&mdash;</span>`}
                        </span>
                        <span class="mp-icon-group" title="Move">
                            <span class="mp-icon-foot">&#128094;</span><span class="mp-icon-label">${attack.steps}</span>
                        </span>
                        <span class="mp-icon-group" title="Attack Dice">
                            <span class="mp-icon-dice">&#127922;</span><span class="mp-icon-label">${attack.dice}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>`;
}

function renderMonsterPhasePanel() {
    const section = document.getElementById("sec-monster-phase");
    if (!section) return;

    const activePlayer = gameState.players[gameState.turn_player_idx]?.name;
    const isMyTurn = (playerName === activePlayer);

    // Update deck glow based on whether a draw is needed
    const deckRight = document.querySelector(".deck-right");
    if (deckRight) {
        if (gameState.game_phase === "MonsterPhase" && isMyTurn && !isCardFlying && !hasDrawnThisPhase) {
            deckRight.classList.add("monster-phase-active");
        } else {
            deckRight.classList.remove("monster-phase-active");
        }
    }

    const card = gameState.current_card;

    if (!card) {
        if (!isCardFlying) {
            let drawHint = "";
            if (gameState.game_phase === "MonsterPhase") {
                drawHint = isMyTurn 
                    ? '<p class="phase-hint mp-draw-hint">&#9660; Click the Monster Deck to draw a card.</p>'
                    : `<p class="phase-hint">Waiting for ${activePlayer} to draw a Monster Card...</p>`;
            } else {
                drawHint = '<p class="phase-hint">After ending your turn, click the Monster Deck to draw a card.</p>';
            }
            section.innerHTML = `<h4>Monster Phase</h4>${drawHint}`;
            lastDrawnCardId = null;
        }
        return;
    }

    // Check if this is a new card that we haven't animated yet
    if (card.id !== lastDrawnCardId) {
        if (!isCardFlying) {
            isCardFlying = true;
            pendingCardData = card;
            lastDrawnCardId = card.id;

            playDrawCardSound();

            // Pre-render the card back in the panel so it's ready to flip on arrival
            section.innerHTML = `<h4>Monster Phase</h4><div class="mp-flip-container">
                <div class="mp-card-inner" id="mp-card-inner">
                    <div class="mp-card-back"><img src="/Images/Monster_Card.png" alt="Monster Card"></div>
                    <div class="mp-card-face"></div>
                </div>
            </div>`;

            const deckEl = document.querySelector(".deck-right");
            const panelEl = document.getElementById("sec-monster-phase");

            animateCardFly(deckEl, panelEl, () => {
                isCardFlying = false;
                document.querySelector(".deck-right")?.classList.remove("monster-phase-active");

                const currentCard = pendingCardData || gameState.current_card;
                pendingCardData = null;

                if (currentCard) {
                    section.innerHTML = `<h4>Monster Phase</h4>` + buildCardHTML(currentCard, false);
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        const inner = document.getElementById("mp-card-inner");
                        if (inner) inner.classList.add("flipped");
                    }));
                }
            });
            return;
        }
        lastDrawnCardId = card.id;
    }

    // If the card is in flight, store it but don't update the panel yet
    if (isCardFlying) {
        pendingCardData = card;
        return;
    }

    section.innerHTML = `<h4>Monster Phase</h4>` + buildCardHTML(card, true);
}

// ---- Card fly animation ----
function animateCardFly(sourceEl, targetEl, onComplete) {
    const src = sourceEl.getBoundingClientRect();
    const tgt = targetEl.getBoundingClientRect();

    const fly = document.createElement("div");
    fly.className = "flying-card";
    fly.style.cssText = `
        position:fixed; left:${src.left}px; top:${src.top}px;
        width:${src.width}px; height:${src.height}px;
        z-index:9999; pointer-events:none;
        border-radius:9px; overflow:hidden;
        box-shadow:0 20px 50px rgba(0,0,0,0.9), 0 0 30px rgba(153,51,255,0.5);
        transition:left 0.65s cubic-bezier(0.4,0,0.2,1),
                   top 0.65s cubic-bezier(0.4,0,0.2,1),
                   width 0.65s cubic-bezier(0.4,0,0.2,1),
                   height 0.65s cubic-bezier(0.4,0,0.2,1),
                   box-shadow 0.65s ease;
    `;
    fly.innerHTML = `<img src="/Images/Monster_Card.png" style="width:100%;height:100%;object-fit:cover;">`;
    document.body.appendChild(fly);

    const destW = 190;
    const destH = 295;

    requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.left   = `${tgt.left + (tgt.width - destW) / 2}px`;
        fly.style.top    = `${tgt.top + 36}px`;
        fly.style.width  = `${destW}px`;
        fly.style.height = `${destH}px`;
        fly.style.boxShadow = "0 8px 24px rgba(0,0,0,0.7), 0 0 18px rgba(153,51,255,0.4)";
    }));

    fly.addEventListener("transitionend", () => {
        fly.remove();
        onComplete();
    }, { once: true });
}

// ---- Monster Deck click: draw during Monster Phase ----
document.querySelector(".deck-right").addEventListener("click", () => {
    if (!gameState || gameState.game_phase !== "MonsterPhase") return;

    // Only the player whose turn just ended is allowed to draw the monster card!
    const activePlayer = gameState.players[gameState.turn_player_idx]?.name;
    if (playerName !== activePlayer) return;

    if (gameState.deck_count === 0) return;
    if (isCardFlying || hasDrawnThisPhase) return;

    isCardFlying = true;
    hasDrawnThisPhase = true;
    pendingCardData = null;

    playDrawCardSound();

    // Pre-render the card back in the panel so it's ready to flip on arrival
    const section = document.getElementById("sec-monster-phase");
    if (section) {
        section.innerHTML = `<h4>Monster Phase</h4><div class="mp-flip-container">
            <div class="mp-card-inner" id="mp-card-inner">
                <div class="mp-card-back"><img src="/Images/Monster_Card.png" alt="Monster Card"></div>
                <div class="mp-card-face"></div>
            </div>
        </div>`;
    }

    const deckEl = document.querySelector(".deck-right");
    const panelEl = document.getElementById("sec-monster-phase");

    sendMsg({ action: "draw_monster_card" });

    animateCardFly(deckEl, panelEl, () => {
        isCardFlying = false;
        document.querySelector(".deck-right")?.classList.remove("monster-phase-active");

        const card = pendingCardData || gameState.current_card;
        pendingCardData = null;

        if (card) {
            lastDrawnCardId = null; // force isNewCard on next render
            const s = document.getElementById("sec-monster-phase");
            if (s) {
                s.innerHTML = `<h4>Monster Phase</h4>` + buildCardHTML(card, false);
                lastDrawnCardId = card.id;
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    const inner = document.getElementById("mp-card-inner");
                    if (inner) inner.classList.add("flipped");
                }));
            }
        }
    });
});

function renderMonstersStatusPanel() {
    const elMonContainer = document.getElementById("monsters-status-container");
    elMonContainer.innerHTML = "";

    const active = gameState.active_monsters || [];
    const defeated = gameState.defeated_monsters || [];
    const allMonsters = [...active, ...defeated];

    if (allMonsters.length === 0) {
        elMonContainer.innerHTML = `<p style="font-size: 0.8rem; color: #ffd533; text-align: center;">All monsters defeated! Deal the final blow.</p>`;
        return;
    }

    if (currentMonsterTabIndex >= allMonsters.length) {
        currentMonsterTabIndex = Math.max(0, allMonsters.length - 1);
    }

    const m = allMonsters[currentMonsterTabIndex];
    const isDefeated = defeated.includes(m);
    const card = document.createElement("div");
    card.className = `monster-status-card ${isDefeated ? "defeated" : ""}`;

    const loc = (gameState.monster_locations && gameState.monster_locations[m]) || "Unknown";
    const portrait = MONSTER_PORTRAIT_MAP[m] || "";
    const accent = MONSTER_ACCENT_MAP[m] || { border: "rgba(255,51,102,0.6)", glow: "rgba(255,51,102,0.3)" };

    const frenzyValues = {
        "Yeti": 1,
        "Sphinx": 2,
        "Jiangshi": 3,
        "Cthulhu": 4
    };
    const fVal = frenzyValues[m] || 0;
    const isFrenzyHolder = (m === gameState.frenzy_marker);
    const symbolDots = getMonsterSymbols(m).map(s =>
        `<span title="${s.symbol} (${s.color})" style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${getSymbolColorHex(s.color)}; border:1.5px solid rgba(0,0,0,0.4); box-shadow:0 0 4px ${getSymbolColorHex(s.color)}99;"></span>`
    ).join("");

    let details = `
        <div class="monster-card-header" style="display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom:8px; margin-bottom:8px;">
            <div style="position:relative;">
                <div class="monster-card-portrait" style="width:120px; height:120px; border-radius:50%; border-color:${isFrenzyHolder ? '#ffd533' : accent.border}; box-shadow: 0 0 ${isFrenzyHolder ? '20px rgba(255,213,51,0.7)' : '15px ' + accent.glow}; margin:0;">
                    ${portrait ? `<img src="${portrait}" alt="${m}">` : ""}
                </div>
                ${symbolDots ? `<div style="position:absolute; bottom:-4px; left:50%; transform:translateX(-50%); display:flex; gap:4px; padding:3px 7px; background:rgba(10,5,20,0.85); border-radius:10px; border:1px solid rgba(255,255,255,0.1);">${symbolDots}</div>` : ''}
            </div>
            <div class="monster-card-info" style="width:100%;">
                <h5 style="margin:0 0 4px 0; font-size:1rem;">${m} <span class="monster-frenzy-badge" title="Frenzy Order: ${fVal}">⚡ ${fVal}</span></h5>
                ${isFrenzyHolder ? `<div style="font-size:0.7rem; font-weight:700; color:#1a0f2e; background:#ffd533; display:inline-block; padding:2px 9px; border-radius:9px; margin-bottom:4px; box-shadow:0 0 8px rgba(255,213,51,0.6);">⚡ FRENZY</div>` : ''}
                <div class="monster-card-loc" style="font-size:0.75rem; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">&#128205; ${loc}</span>
                    <button class="btn btn-secondary btn-small" style="font-size:0.65rem; padding:2px 6px; flex-shrink:0;" onclick="locateMonster('${m}')">Locate</button>
                </div>
            </div>
        </div>
    `;
    
    if (m === "Yeti") {
        const y_state = gameState.monster_states["Yeti"];
        const kids_left = y_state.children.filter(c => !c.rescued).length;
        const found_cave = (gameState.lair_tokens || []).find(t => t.type === "yeti" && t.revealed);
        const orderedChildren = [...y_state.children].sort((a, b) => (a.rescued_order || 99) - (b.rescued_order || 99));

        details += `
            <p style="font-size: 0.8rem; color: #b0a0cf;">Children Lost: <strong>${kids_left}</strong></p>
            <p style="font-size: 0.8rem; color: #b0a0cf;">True Cave: <strong>${found_cave ? found_cave.location : "Hidden"}</strong></p>
            <p style="font-size: 0.72rem; color: #a491c3;">Defeat: discard one Purple, one Green, and one Blue item at the Yeti's location.</p>
            <div class="monster-puzzle-grid">
        `;
        for (let i = 0; i < 3; i++) {
            const child = orderedChildren[i];
            const isHome = child && child.rescued;
            details += `
                <div class="puzzle-slot ${isHome ? 'filled' : ''}" style="height:56px; flex-direction:column; gap:2px; font-size:0.62rem;">
                    ${isHome
                        ? `<img src="/Images/Monsters/Yeti Child ${child.id}.png" alt="Yeti Child ${child.id}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:2px solid #ffd533;">
                           <span>Child ${child.id}</span>`
                        : `Empty`}
                </div>
            `;
        }
        details += `</div>`;

        const waitingAtCave = found_cave ? y_state.children.filter(c => !c.rescued && c.location === found_cave.location) : [];
        if (waitingAtCave.length) {
            details += `<div style="display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap;">
                <span style="font-size:0.68rem; color:#a491c3;">Waiting to be placed:</span>
                ${waitingAtCave.map(c => `
                    <button class="btn btn-secondary btn-small" style="font-size:0.65rem; padding:3px 8px;" onclick="placeYetiChild(${c.id})">Place Child ${c.id}</button>
                `).join("")}
            </div>`;
        }

    } else if (m === "Jiangshi") {
        const js_state = gameState.monster_states["Jiangshi"];
        const found_shrine = (gameState.lair_tokens || []).find(t => t.type === "jiangshi" && t.revealed);
        details += `
            <p style="font-size: 0.8rem; color: #b0a0cf;">Moon Shrine: <strong>${found_shrine ? found_shrine.location : "Hidden"}</strong></p>
            <p style="font-size: 0.72rem; color: #a491c3;">At the Shrine, discard an item matching a slot's strength. Defeat: discard 9+ combined Purple strength at Jiangshi's location.</p>
            <div class="monster-puzzle-grid">
        `;
        js_state.sword_slots.forEach(slot => {
            details += `
                <div class="puzzle-slot ${slot.filled ? 'filled' : ''}" ${slot.filled ? '' : `onclick="advanceJiangshi(${slot.id})"`}>
                    ${slot.filled ? `Sealed (${slot.item.strength})` : `Needs ${slot.target_strength}`}
                </div>
            `;
        });
        details += `</div>`;
        if (!found_shrine) {
            details += `<p style="font-size: 0.68rem; color: #a491c3; margin-top:6px;">Use Advance at an unexplored location to search for the Shrine.</p>`;
        }

    } else if (m === "Sphinx") {
        const sp_state = gameState.monster_states["Sphinx"];
        const numRows = sp_state.row_targets.length;
        const numCols = sp_state.col_targets.length;
        details += `
            <p style="font-size: 0.8rem; color: #b0a0cf;">${sp_state.solved ? '<strong style="color:#ffd533;">Riddle solved!</strong>' : 'Fill the grid so rows/columns match the targets shown.'}</p>
            <p style="font-size: 0.72rem; color: #a491c3;">Defeat: discard 6+ combined Green strength at the Sphinx's location.</p>
            <div style="display:grid; grid-template-columns: repeat(${numCols + 1}, 40px); grid-auto-rows: 40px; gap:4px; justify-content:center; align-items:center; margin: 10px auto;">
                <div></div>
        `;
        for (let col = 0; col < numCols; col++) {
            details += `<div style="text-align:center; font-size:0.68rem; color:#ffd533; font-weight:700;">${sp_state.col_targets[col]}</div>`;
        }
        for (let row = 0; row < numRows; row++) {
            details += `<div style="text-align:center; font-size:0.68rem; color:#ffd533; font-weight:700;">${sp_state.row_targets[row]}</div>`;
            for (let col = 0; col < numCols; col++) {
                const cell = sp_state.grid[row * numCols + col];
                const clickAttr = cell.filled
                    ? (cell.locked ? '' : `onclick="clearSphinxCell(${cell.id})"`)
                    : `onclick="advanceSphinx(${cell.id})"`;
                details += `
                    <div class="puzzle-slot req-blue ${cell.filled ? 'filled' : ''}" style="width:40px; height:40px;" ${clickAttr}>
                        ${cell.filled ? cell.item.strength : ''}
                    </div>
                `;
            }
        }
        details += `</div>`;

    } else if (m === "Cthulhu") {
        const cth_state = gameState.monster_states["Cthulhu"];
        if (cth_state.phase === 1) {
            details += `
                <p style="font-size: 0.8rem; color: #b0a0cf;">Rotate all 3 dials to their targets at The Void.</p>
                <div class="monster-puzzle-grid">
            `;
            cth_state.dials.forEach(dial => {
                const reqClass = `req-${dial.color.toLowerCase()}`;
                const matched = dial.progress >= dial.target;
                details += `
                    <div class="puzzle-slot ${reqClass} ${matched ? 'filled' : ''}" ${matched ? '' : `onclick="advanceCthulhuDial('${dial.color}')"`}>
                        ${dial.color}<br>${dial.progress}/${dial.target}
                    </div>
                `;
            });
            details += `</div>`;
            if (cth_state.portal_open) {
                details += `<button class="btn btn-secondary btn-small" onclick="lureCthulhu()" style="width:100%; margin-top:8px; font-size:0.75rem;">Lure Cthulhu to the Void</button>`;
            }
        } else {
            const trackPos = cth_state.player_tracks[playerName] ?? -1;
            const currentItem = cth_state.current_item;
            details += `
                <p style="font-size: 0.8rem; color: #ffd533;">Phase 2: R'lyeh — ${cth_state.manacles_placed}/4 tentacles manacled.</p>
                <p style="font-size: 0.8rem; color: #b0a0cf;">My step: <strong>${trackPos === -1 ? "Main Board" : cth_state.corpse_city_track[trackPos]}</strong></p>
                ${currentItem ? `<p style="font-size: 0.72rem; color: #a491c3;">Cthulhu controls: <strong>${currentItem.name}</strong> (${currentItem.color} ${currentItem.strength})</p>` : ''}
                <div style="display:flex; gap:6px; margin-top:6px;">
                    <button class="btn btn-secondary btn-small" style="flex:1; font-size:0.7rem;" onclick="bindCthulhuTentacle('Blue')">Bind Blue</button>
                    <button class="btn btn-secondary btn-small" style="flex:1; font-size:0.7rem;" onclick="bindCthulhuTentacle('Green')">Bind Green</button>
                    <button class="btn btn-secondary btn-small" style="flex:1; font-size:0.7rem;" onclick="bindCthulhuTentacle('Purple')">Bind Purple</button>
                </div>
                <p style="font-size: 0.68rem; color: #a491c3; margin-top:6px;">Defeat: once all manacled and everyone's in R'lyeh, gather items from each other hero via Share, then Defeat.</p>
            `;
        }
    }

    if (isDefeated) {
        details += `<div class="monster-defeated-banner">Defeated!</div>`;
    }

    card.innerHTML = details;
    elMonContainer.appendChild(card);

    const controls = document.createElement("div");
    controls.className = "carousel-controls";
    controls.style.cssText = "display:flex; justify-content:space-between; align-items:center; width:100%; margin-top:10px; padding:0 4px;";
    controls.innerHTML = `
        <button class="carousel-circle-btn" onclick="navigateMonsterTab(-1)">&larr;</button>
        <span style="font-size: 0.72rem; color: #a491c3; font-weight: 600; letter-spacing: 0.5px; user-select: none;">Monster ${currentMonsterTabIndex + 1} of ${allMonsters.length}</span>
        <button class="carousel-circle-btn" onclick="navigateMonsterTab(1)">&rarr;</button>
    `;
    elMonContainer.appendChild(controls);
}

window.navigateMonsterTab = (dir) => {
    const active = gameState.active_monsters || [];
    const defeated = gameState.defeated_monsters || [];
    const total = active.length + defeated.length;
    if (total === 0) return;
    
    currentMonsterTabIndex = (currentMonsterTabIndex + dir + total) % total;
    renderMonstersStatusPanel();
};

function renderLogs() {
    elLogBox.innerHTML = "";
    gameState.log.forEach(msg => {
        const p = document.createElement("p");
        p.innerText = msg;
        elLogBox.appendChild(p);
    });
    elLogBox.scrollTop = elLogBox.scrollHeight;
}

// ---------------------------------------------------------
// AUDIO SYNTHESIZER (HTML5 Web Audio API)
// ---------------------------------------------------------

let audioCtx = null;
let lastHoverSoundTime = 0;
let bgGainNode = null;
let droneOscs = [];
let melodyInterval = null;
let bgAudioElement = null;
let bgSourceNode = null;
let usingSynthesizedBackup = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Start background ambient music (low-volume detuned drones and bell arpeggiator)
function startBackgroundMusic() {
    initAudio();
    if (!audioCtx) return;
    if (bgGainNode) return; // Already running

    bgGainNode = audioCtx.createGain();
    
    // Scale volume: maximum gain of 0.3 for MP3 (keep it gentle)
    const slider = document.getElementById("bg-music-volume");
    const sliderVal = slider ? parseFloat(slider.value) / 100 : 0.2;
    bgGainNode.gain.setValueAtTime(sliderVal * 0.3, audioCtx.currentTime);
    bgGainNode.connect(audioCtx.destination);

    // Try playing the custom MP3 file first
    bgAudioElement = new Audio();
    bgAudioElement.src = "/Music/Background Music.mp3";
    bgAudioElement.loop = true;
    bgAudioElement.crossOrigin = "anonymous";

    // When the file is ready, attempt playback
    bgAudioElement.addEventListener("canplaythrough", () => {
        if (usingSynthesizedBackup) return;
        try {
            if (!bgSourceNode) {
                bgSourceNode = audioCtx.createMediaElementSource(bgAudioElement);
                bgSourceNode.connect(bgGainNode);
            }
            bgAudioElement.play().catch(err => {
                console.warn("Failed to play MP3 background track, falling back:", err);
                startSynthesizedBackup();
            });
        } catch (e) {
            console.warn("MediaElementSource connection failed, falling back:", e);
            startSynthesizedBackup();
        }
    });

    // Fallback if loading fails/network fails
    bgAudioElement.addEventListener("error", (err) => {
        console.warn("Error loading background MP3, falling back to synth:", err);
        startSynthesizedBackup();
    });

    // Trigger loading
    bgAudioElement.load();
}

function startSynthesizedBackup() {
    if (usingSynthesizedBackup) return;
    usingSynthesizedBackup = true;
    
    if (bgAudioElement) {
        try { bgAudioElement.pause(); } catch(e){}
    }

    const slider = document.getElementById("bg-music-volume");
    const sliderVal = slider ? parseFloat(slider.value) / 100 : 0.2;
    // Scale volume: maximum gain of 0.15 for synthesized audio
    bgGainNode.gain.setValueAtTime(sliderVal * 0.15, audioCtx.currentTime);

    // Detuned low drone oscillators (A2 at 110Hz, slightly detuned at 110.5Hz, E3 fifth at 165Hz)
    const frequencies = [110.00, 110.50, 165.00];
    frequencies.forEach(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        const oscGain = audioCtx.createGain();
        oscGain.gain.setValueAtTime(0.40, audioCtx.currentTime); // Soft individual volume (40% gain)

        osc.connect(oscGain);
        oscGain.connect(bgGainNode);
        osc.start();
        droneOscs.push(osc);
    });

    // Spooky pentatonic chime notes arpeggiator (slow distant bells)
    const bellNotes = [329.63, 392.00, 440.00, 493.88, 587.33]; // E4, G4, A4, B4, D5

    function playDistantBell() {
        if (!audioCtx || audioCtx.state === 'suspended') return;
        
        try {
            const bellOsc = audioCtx.createOscillator();
            const bellGain = audioCtx.createGain();
            const filterNode = audioCtx.createBiquadFilter();

            const freq = bellNotes[Math.floor(Math.random() * bellNotes.length)];
            bellOsc.type = "triangle";
            bellOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            filterNode.type = "lowpass";
            filterNode.frequency.setValueAtTime(400, audioCtx.currentTime); // Deep lowpass filter

            bellGain.gain.setValueAtTime(0, audioCtx.currentTime);
            bellGain.gain.linearRampToValueAtTime(0.60, audioCtx.currentTime + 1.5); // Warm slow attack (60% gain)
            bellGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 6.0); // Ring out 6s

            bellOsc.connect(filterNode);
            filterNode.connect(bellGain);
            bellGain.connect(bgGainNode);

            bellOsc.start();
            bellOsc.stop(audioCtx.currentTime + 6.0);
        } catch (e) {
            console.warn("Melody bell error:", e);
        }
    }

    playDistantBell();
    melodyInterval = setInterval(playDistantBell, 6500); // Trigger every 6.5s
}

// Update volume dynamically when slider is moved
function updateMusicVolume() {
    initAudio();
    if (!audioCtx) return;

    const slider = document.getElementById("bg-music-volume");
    if (!slider) return;
    const val = parseFloat(slider.value) / 100;

    if (bgGainNode) {
        // Use proper volume scale depending on active source
        const factor = usingSynthesizedBackup ? 0.15 : 0.3;
        bgGainNode.gain.linearRampToValueAtTime(val * factor, audioCtx.currentTime + 0.15);
    } else if (val > 0) {
        startBackgroundMusic();
    }
}

// Initialize on user clicks anywhere
document.addEventListener("click", () => {
    initAudio();
    startBackgroundMusic();
});

function playHoverSound() {
    initAudio();
    if (!audioCtx) return;

    const now = Date.now();
    if (now - lastHoverSoundTime < 200) return; // Throttle to max 1 sound per 200ms
    lastHoverSoundTime = now;

    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        const freq = 392.00; // Fixed G4 note (warm, mellow chime)

        osc.type = 'sine'; // Smooth pure tone
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        // Subtly soft chime envelope (volume peak at 1.2%)
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.010); // Peak at 10ms
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {
        console.warn("Web Audio API error:", e);
    }
}

// ---------------------------------------------------------
// SVG INTERACTIVE BOARD RENDERER
// ---------------------------------------------------------
function drawMovementTrail(fromX, fromY, toX, toY) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${fromX} ${fromY} L ${toX} ${toY}`);
    path.setAttribute("stroke", "#ffd533"); // glowing gold
    path.setAttribute("stroke-width", "4");
    path.setAttribute("stroke-dasharray", "8, 6");
    path.setAttribute("fill", "none");
    path.setAttribute("opacity", "0.8");
    path.setAttribute("filter", "url(#glow)");
    
    // Animate dasharray offset for moving dash effect
    const animDash = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    animDash.setAttribute("attributeName", "stroke-dashoffset");
    animDash.setAttribute("from", "0");
    animDash.setAttribute("to", "-30");
    animDash.setAttribute("dur", "0.6s");
    animDash.setAttribute("repeatCount", "indefinite");
    path.appendChild(animDash);

    // Animate opacity fade out
    const animOpacity = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    animOpacity.setAttribute("attributeName", "opacity");
    animOpacity.setAttribute("from", "0.8");
    animOpacity.setAttribute("to", "0");
    animOpacity.setAttribute("dur", "1.2s");
    animOpacity.setAttribute("fill", "freeze");
    path.appendChild(animOpacity);
    
    // Append to map right after background map image
    if (elGameMap) {
        const bgImg = elGameMap.querySelector("image");
        if (bgImg && bgImg.nextSibling) {
            elGameMap.insertBefore(path, bgImg.nextSibling);
        } else {
            elGameMap.insertBefore(path, elGameMap.firstChild);
        }
        setTimeout(() => {
            path.remove();
        }, 1200);
    }
}

function getScreenCoordsOfSVGPoint(svgX, svgY) {
    const svgEl = document.getElementById("game-map");
    if (!svgEl) return { left: 0, top: 0 };
    try {
        const pt = svgEl.createSVGPoint();
        pt.x = svgX;
        pt.y = svgY;
        const globalPt = pt.matrixTransform(svgEl.getScreenCTM());
        return {
            left: globalPt.x,
            top: globalPt.y
        };
    } catch(e) {
        console.warn("Error converting SVG point to screen coordinate:", e);
        return { left: 0, top: 0 };
    }
}

function animateItemFly(fromLoc, itemColor, itemLabel, itemName) {
    const coord = gameState.node_coordinates[fromLoc];
    if (!coord) return;
    
    const screenStart = getScreenCoordsOfSVGPoint(coord.x, coord.y);
    const invPanel = document.getElementById("gtab-btn-my-hero") || document.getElementById("gtab-btn-hero") || document.getElementById("player-inventory") || document.getElementById("sec-player");
    if (!invPanel) return;
    const screenEnd = invPanel.getBoundingClientRect();
    
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
    fly.textContent = itemLabel;
    
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
        
        // Add a temporary landing ripple/glow in player inventory/tab button
        invPanel.style.transition = "box-shadow 0.3s, background-color 0.3s";
        invPanel.style.boxShadow = `0 0 25px ${circleColor}`;
        
        // Convert hex to semi-transparent rgba for background-color flash
        const hexToRgba = (hex, alpha) => {
            if (hex.startsWith("#")) {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
            return hex;
        };
        invPanel.style.backgroundColor = hexToRgba(circleColor, 0.2);
        
        setTimeout(() => {
            invPanel.style.boxShadow = "";
            invPanel.style.backgroundColor = "";
        }, 500);
    }, { once: true });
}

function triggerNodePulse(svgX, svgY, radius, pulseColor, strokeWidth = 3, scaleEnd = 3.5) {
    const pulseCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pulseCircle.setAttribute("cx", svgX.toString());
    pulseCircle.setAttribute("cy", svgY.toString());
    pulseCircle.setAttribute("r", radius.toString());
    pulseCircle.setAttribute("fill", "none");
    pulseCircle.setAttribute("stroke", pulseColor);
    pulseCircle.setAttribute("stroke-width", strokeWidth.toString());
    
    pulseCircle.style.transformBox = "fill-box";
    pulseCircle.style.transformOrigin = "center";
    pulseCircle.style.setProperty("--scale-end", scaleEnd.toString());
    pulseCircle.style.animation = "svgPulseScale 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards";
    
    if (elGameMap) {
        elGameMap.appendChild(pulseCircle);
        setTimeout(() => {
            pulseCircle.remove();
        }, 850);
    }
}

// Builds a neon LED-style glowing outline tracing ONLY the contour of the Terror
// Level placeholder — either a plain circle (radius `r`) or a custom polygon shape
// (array of [dx, dy] points relative to cx,cy) — leaving the entire interior empty
// so the level number printed on the board art shows through. Layered stroke glow
// (like CSS neon-text tricks) plus a bright segment that chases around the strip,
// matching the game's existing neon/glow visual language (hero token glows, pulses).
function createNeonRing(cx, cy, r = 28, polygonPoints = null) {
    const svgNS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "neon-ring-group");
    g.setAttribute("pointer-events", "none"); // purely decorative — never block dragging the hitbox/vertex handles underneath

    const usePolygon = polygonPoints && polygonPoints.length >= 3;
    const pointsAttr = usePolygon
        ? polygonPoints.map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`).join(" ")
        : null;

    let perimeter;
    if (usePolygon) {
        const abs = polygonPoints.map(([dx, dy]) => [cx + dx, cy + dy]);
        perimeter = 0;
        for (let i = 0; i < abs.length; i++) {
            const a = abs[i], b = abs[(i + 1) % abs.length];
            perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
        }
    } else {
        perimeter = 2 * Math.PI * r;
    }

    const makeShape = () => {
        if (usePolygon) {
            const p = document.createElementNS(svgNS, "polygon");
            p.setAttribute("pointer-events", "none");
            p.setAttribute("points", pointsAttr);
            return p;
        }
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("pointer-events", "none");
        c.setAttribute("cx", cx);
        c.setAttribute("cy", cy);
        c.setAttribute("r", r);
        return c;
    };

    // Layered glow, dark-crimson core hue, widest+softest at the bottom, tight+bright on top.
    // Each layer traces the FULL contour (not just a segment) so the whole shape reads as lit.
    const layers = [
        { width: 20, color: "#8c0f34", blur: 9, cls: "neon-outer-pulse" },
        { width: 12, color: "#b3123f", blur: 4.5, cls: "neon-mid-pulse" },
        { width: 5, color: "#e0567f", blur: 0.6, cls: "neon-core-pulse" }
    ];
    layers.forEach((layer, idx) => {
        const el = makeShape();
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", layer.color);
        el.setAttribute("stroke-width", layer.width);
        el.setAttribute("stroke-linejoin", "round");
        el.style.filter = `blur(${layer.blur}px)`;
        el.classList.add(layer.cls);
        el.style.animationDelay = `${-idx * 0.6}s`;
        g.appendChild(el);
    });

    // Bright segment chasing around the strip, like an addressable LED marquee
    const chase = makeShape();
    chase.setAttribute("fill", "none");
    chase.setAttribute("stroke", "#ffd9e3");
    chase.setAttribute("stroke-width", "4");
    chase.setAttribute("stroke-linecap", "round");
    const dashLen = Math.max(10, perimeter * 0.16);
    chase.setAttribute("stroke-dasharray", `${dashLen.toFixed(1)} ${Math.max(1, perimeter - dashLen).toFixed(1)}`);
    chase.style.filter = "drop-shadow(0 0 3px #ffd9e3) drop-shadow(0 0 6px #b3123f)";
    const anim = document.createElementNS(svgNS, "animate");
    anim.setAttribute("attributeName", "stroke-dashoffset");
    anim.setAttribute("from", "0");
    anim.setAttribute("to", `${-perimeter.toFixed(1)}`);
    anim.setAttribute("dur", "4.5s");
    anim.setAttribute("repeatCount", "indefinite");
    chase.appendChild(anim);
    g.appendChild(chase);

    return g;
}

function animateItemSpawn(item, locName) {
    const coord = gameState.node_coordinates[locName];
    if (!coord) return;
    
    const items = gameState.items_on_board[locName] || [];
    const index = items.findIndex(it => it.id === item.id);
    const offset = getItemOffset(index !== -1 ? index : 0, coord.r || 35);
    
    const targetSvgX = coord.x + offset.x;
    const targetSvgY = coord.y + offset.y;
    
    const screenEnd = getScreenCoordsOfSVGPoint(targetSvgX, targetSvgY);
    const cardPanel = document.getElementById("sec-monster-phase");
    if (!cardPanel) return;
    const screenStart = cardPanel.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.className = "flying-item-token";
    
    const colorMap = {
        blue: "#33ccff",
        purple: "#a64dff",
        green: "#33ff66"
    };
    const circleColor = colorMap[item.color.toLowerCase()] || "#a491c3";

    fly.style.cssText = `
        position: fixed;
        left: ${screenStart.left + screenStart.width / 2 - 12}px;
        top: ${screenStart.top + screenStart.height / 2 - 12}px;
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
        opacity: 0;
        transform: scale(0.5);
        transition: left 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    top 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    transform 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    opacity 0.9s ease;
    `;
    fly.textContent = item.strength;
    
    const labelSpan = document.createElement("span");
    labelSpan.textContent = item.name;
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
        fly.style.left = `${screenEnd.left - 12}px`;
        fly.style.top = `${screenEnd.top - 12}px`;
        fly.style.transform = "scale(1.2)";
        fly.style.opacity = "1";
    }));
    
    fly.addEventListener("transitionend", () => {
        triggerNodePulse(targetSvgX, targetSvgY, 12, circleColor);
        fly.remove();
    }, { once: true });
}

function animateLairSpawn(locName) {
    const coord = gameState.node_coordinates[locName];
    if (!coord) return;
    
    const targetSvgX = coord.x;
    const targetSvgY = coord.y;
    const screenEnd = getScreenCoordsOfSVGPoint(targetSvgX, targetSvgY);
    const cardPanel = document.getElementById("sec-monster-phase");
    if (!cardPanel) return;
    const screenStart = cardPanel.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.style.cssText = `
        position: fixed;
        left: ${screenStart.left + screenStart.width / 2 - 20}px;
        top: ${screenStart.top + screenStart.height / 2 - 14}px;
        width: 40px;
        height: 28px;
        background: url('/Images/Lair Tokens/lair_token_back.png') center/cover;
        border: 2px solid #fff;
        border-radius: 4px;
        z-index: 10000;
        pointer-events: none;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        opacity: 0;
        transform: scale(0.5);
        transition: left 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    top 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    transform 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    opacity 0.9s ease;
    `;
    document.body.appendChild(fly);
    
    requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.left = `${screenEnd.left - 20}px`;
        fly.style.top = `${screenEnd.top - 14}px`;
        fly.style.transform = "scale(1)";
        fly.style.opacity = "1";
    }));
    
    fly.addEventListener("transitionend", () => {
        triggerNodePulse(targetSvgX, targetSvgY, 20, "#fff");
        fly.remove();
    }, { once: true });
}

function detectAndAnimatePerkCardDraws(newState) {
    if (!newState || !newState.heroes_state) return;

    if (!window.knownPerkIds) {
        window.knownPerkIds = new Set();
        
        // If the page is just loading, and game is already running (e.g. page refresh),
        // pre-populate knownPerkIds to prevent animating existing perks.
        const isMidGameRefresh = newState.game_started && (!gameState || gameState.game_started);
        if (isMidGameRefresh) {
            const myState = newState.heroes_state[playerName];
            if (myState && myState.perks) {
                myState.perks.forEach(perk => window.knownPerkIds.add(perk.id));
            }
            return;
        }
    }

    const myNewState = newState.heroes_state[playerName];
    if (myNewState && myNewState.perks) {
        myNewState.perks.forEach((perk, idx) => {
            if (!window.knownPerkIds.has(perk.id)) {
                window.knownPerkIds.add(perk.id);
                // Trigger animation with a slight delay per card if multiple are drawn
                setTimeout(() => {
                    animatePerkCardDraw(perk.name, perk.text);
                }, idx * 300);
            }
        });
    }
}

function animatePerkCardDraw(perkName, perkText) {
    const deckEl = document.querySelector(".perks-stack");
    const invEl = document.getElementById("gtab-btn-my-hero") || document.getElementById("gtab-btn-hero") || document.getElementById("player-inventory");
    if (!invEl) return;
    
    const deckRect = deckEl ? deckEl.getBoundingClientRect() : {
        left: window.innerWidth / 2 - 65,
        top: window.innerHeight / 2 - 90,
        width: 130,
        height: 180
    };
    const invRect = invEl.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.className = "flying-perk-card";
    fly.style.cssText = `
        position: fixed;
        left: ${deckRect.left + (deckRect.width || 0) / 2 - 65}px;
        top: ${deckRect.top + (deckRect.height || 0) / 2 - 90}px;
        width: 130px;
        height: 180px;
        background: url('/Images/Perk_Card.png') center/contain no-repeat;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.8), 0 0 15px rgba(153, 51, 255, 0.4);
        z-index: 100000;
        pointer-events: none;
        opacity: 0;
        transform: scale(0.3) rotate(-20deg);
        transition: left 1.4s cubic-bezier(0.25, 1, 0.3, 1),
                    top 1.4s cubic-bezier(0.25, 1, 0.3, 1),
                    transform 1.4s cubic-bezier(0.25, 1, 0.3, 1),
                    opacity 0.8s ease;
    `;
    
    fly.innerHTML = "";
    
    document.body.appendChild(fly);
    
    // Animate fly & reveal
    requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.left = `${invRect.left + invRect.width / 2 - 65}px`;
        fly.style.top = `${invRect.top + invRect.height / 2 - 90}px`;
        fly.style.transform = "scale(0.45) rotate(5deg)";
        fly.style.opacity = "1";
    }));
    
    // Staged shrink as it gets very close
    setTimeout(() => {
        fly.style.transform = "scale(0.1) rotate(0deg)";
        fly.style.opacity = "0";
    }, 1100);
    
    fly.addEventListener("transitionend", () => {
        fly.remove();
        
        // Add a temporary landing ripple/glow in player inventory/tab button
        invEl.style.transition = "box-shadow 0.3s, background-color 0.3s";
        invEl.style.boxShadow = "0 0 25px rgba(153, 51, 255, 0.8)";
        invEl.style.backgroundColor = "rgba(153, 51, 255, 0.25)";
        
        // Play simple synthesized perk sound
        playSynthPerkSound();

        setTimeout(() => {
            invEl.style.boxShadow = "";
            invEl.style.backgroundColor = "";
        }, 600);
    }, { once: true });
}

function playSynthPerkSound() {
    initAudio();
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio arcing upwards!
        freqs.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'triangle'; // Sweet flute/woodwind-like texture
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            
            gain.gain.setValueAtTime(0, now + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.015, now + idx * 0.08 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.5);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.5);
        });
    } catch(e) {
        console.warn("Web Audio API error playing perk sound:", e);
    }
}

// Sound effect played whenever any hero picks up an item
function playItemPickupSound() {
    try {
        const sfx = new Audio("/Music/pickup_item.wav");
        sfx.volume = 0.5;
        sfx.play().catch(e => console.warn("Pickup sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing pickup sound:", e);
    }
}

// Sound effect played whenever a Monster Card is drawn from the deck
function playDrawCardSound() {
    try {
        const sfx = new Audio("/Music/draw_card.mp3");
        sfx.volume = 0.5;
        sfx.play().catch(e => console.warn("Draw card sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing draw card sound:", e);
    }
}

// Sound effect played once when the heroes lose the game
function playGameLostSound() {
    try {
        const sfx = new Audio("/Music/game_lost.wav");
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn("Game lost sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing game lost sound:", e);
    }
}

function playGameWonSound() {
    try {
        const sfx = new Audio("/Music/Victory%20sound.wav");
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn("Victory sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing victory sound:", e);
    }
}

// Per-monster defeat sound files, keyed by monster name.
const MONSTER_DEFEAT_SOUNDS = {
    "Yeti": "/Music/Yeti%20dies.wav"
};

function playMonsterDefeatSound(monsterName) {
    const src = MONSTER_DEFEAT_SOUNDS[monsterName];
    if (!src) return;
    try {
        const sfx = new Audio(src);
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn(`${monsterName} defeat sound playback failed:`, e));
    } catch (e) {
        console.warn(`Error playing ${monsterName} defeat sound:`, e);
    }
}

// Diff-detects newly-defeated monsters against the previous snapshot and plays each
// one's defeat sound exactly once, the moment it appears in defeated_monsters.
function detectAndPlayMonsterDefeatSounds() {
    const defeated = (gameState && gameState.defeated_monsters) || [];
    if (!knownDefeatedMonsters) {
        knownDefeatedMonsters = new Set(defeated);
        return;
    }
    defeated.forEach(name => {
        if (!knownDefeatedMonsters.has(name)) {
            knownDefeatedMonsters.add(name);
            playMonsterDefeatSound(name);
        }
    });
}

// Sound effect played whenever the Terror Level increases
function playTerrorIncreaseSound() {
    try {
        const sfx = new Audio("/Music/Terror%20level%20increase.wav");
        sfx.volume = 0.6;
        sfx.play().catch(e => console.warn("Terror increase sound playback failed:", e));
    } catch (e) {
        console.warn("Error playing terror increase sound:", e);
    }
}



function detectAndAnimateSpawns() {
    if (!gameState || !gameState.items_on_board) return;
    
    if (!window.knownItemIds) {
        window.knownItemIds = new Set();
        window.knownLairs = new Set();
        for (const loc in gameState.items_on_board) {
            gameState.items_on_board[loc].forEach(item => window.knownItemIds.add(item.id));
        }
        for (const name in gameState.heroes_state) {
            gameState.heroes_state[name].items.forEach(item => window.knownItemIds.add(item.id));
        }
        (gameState.lair_tokens || []).forEach(l => window.knownLairs.add(l.location));
        return;
    }
    
    const newSpawns = [];
    for (const loc in gameState.items_on_board) {
        gameState.items_on_board[loc].forEach(item => {
            if (!window.knownItemIds.has(item.id)) {
                newSpawns.push({ item, loc });
                window.knownItemIds.add(item.id);
            }
        });
    }
    
    // Also track items in players' hands to prevent double detection
    for (const name in gameState.heroes_state) {
        gameState.heroes_state[name].items.forEach(item => {
            window.knownItemIds.add(item.id);
        });
    }
    
    newSpawns.forEach((spawn, idx) => {
        setTimeout(() => {
            animateItemSpawn(spawn.item, spawn.loc);
        }, idx * 350);
    });
    
    const lairs = gameState.lair_tokens || [];
    let lIdx = 0;
    lairs.forEach(l => {
        if (!window.knownLairs.has(l.location)) {
            window.knownLairs.add(l.location);
            setTimeout(() => { animateLairSpawn(l.location); }, (newSpawns.length + lIdx) * 350);
            lIdx++;
        }
    });
}

function renderSVGMap() {
    const w = baseWidth / zoomLevel;
    const h = baseHeight / zoomLevel;
    elGameMap.setAttribute("viewBox", `${panX} ${panY} ${w} ${h}`);

    // Clear board container
    elGameMap.innerHTML = "";

    // Create glow filter definition programmatically (namespace-safe)
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", "glow");
    filter.setAttribute("x", "-20%");
    filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%");
    filter.setAttribute("height", "140%");

    const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blur.setAttribute("stdDeviation", "8");
    blur.setAttribute("result", "blur");
    filter.appendChild(blur);

    const composite = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
    composite.setAttribute("in", "SourceGraphic");
    composite.setAttribute("in2", "blur");
    composite.setAttribute("operator", "over");
    filter.appendChild(composite);

    defs.appendChild(filter);

    // Create pattern for Yeti face marker
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.setAttribute("id", "pattern-yeti");
    pattern.setAttribute("x", "0");
    pattern.setAttribute("y", "0");
    pattern.setAttribute("height", "1");
    pattern.setAttribute("width", "1");
    pattern.setAttribute("patternContentUnits", "objectBoundingBox");

    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttribute("href", "/Images/Monsters/Yeti.png");
    img.setAttribute("x", "0");
    img.setAttribute("y", "0");
    img.setAttribute("height", "1");
    img.setAttribute("width", "1");
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");

    pattern.appendChild(img);
    defs.appendChild(pattern);

    // Create pattern for Sphinx face marker
    const patternSphinx = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    patternSphinx.setAttribute("id", "pattern-sphinx");
    patternSphinx.setAttribute("x", "0");
    patternSphinx.setAttribute("y", "0");
    patternSphinx.setAttribute("height", "1");
    patternSphinx.setAttribute("width", "1");
    patternSphinx.setAttribute("patternContentUnits", "objectBoundingBox");

    const imgSphinx = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imgSphinx.setAttribute("href", "/Images/Monsters/Sphinx.png");
    imgSphinx.setAttribute("x", "0");
    imgSphinx.setAttribute("y", "0");
    imgSphinx.setAttribute("height", "1");
    imgSphinx.setAttribute("width", "1");
    imgSphinx.setAttribute("preserveAspectRatio", "xMidYMid slice");

    patternSphinx.appendChild(imgSphinx);
    defs.appendChild(patternSphinx);

    // Create pattern for Jiangshi face marker
    const patternJiangshi = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    patternJiangshi.setAttribute("id", "pattern-jiangshi");
    patternJiangshi.setAttribute("x", "0");
    patternJiangshi.setAttribute("y", "0");
    patternJiangshi.setAttribute("height", "1");
    patternJiangshi.setAttribute("width", "1");
    patternJiangshi.setAttribute("patternContentUnits", "objectBoundingBox");

    const imgJiangshi = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imgJiangshi.setAttribute("href", "/Images/Monsters/Jiangshi.png");
    imgJiangshi.setAttribute("x", "0");
    imgJiangshi.setAttribute("y", "0");
    imgJiangshi.setAttribute("height", "1");
    imgJiangshi.setAttribute("width", "1");
    imgJiangshi.setAttribute("preserveAspectRatio", "xMidYMid slice");

    patternJiangshi.appendChild(imgJiangshi);
    defs.appendChild(patternJiangshi);

    // Create pattern for Cthulhu face marker
    const patternCthulhu = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    patternCthulhu.setAttribute("id", "pattern-cthulhu");
    patternCthulhu.setAttribute("x", "0");
    patternCthulhu.setAttribute("y", "0");
    patternCthulhu.setAttribute("height", "1");
    patternCthulhu.setAttribute("width", "1");
    patternCthulhu.setAttribute("patternContentUnits", "objectBoundingBox");

    const imgCthulhu = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imgCthulhu.setAttribute("href", "/Images/Monsters/Cthulhu.png");
    imgCthulhu.setAttribute("x", "0");
    imgCthulhu.setAttribute("y", "0");
    imgCthulhu.setAttribute("height", "1");
    imgCthulhu.setAttribute("width", "1");
    imgCthulhu.setAttribute("preserveAspectRatio", "xMidYMid slice");

    patternCthulhu.appendChild(imgCthulhu);
    defs.appendChild(patternCthulhu);

    // Create patterns for Yeti children face markers
    for (let i = 1; i <= 3; i++) {
        const patChild = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patChild.setAttribute("id", `pattern-yeti-child-${i}`);
        patChild.setAttribute("x", "0");
        patChild.setAttribute("y", "0");
        patChild.setAttribute("height", "1");
        patChild.setAttribute("width", "1");
        patChild.setAttribute("patternContentUnits", "objectBoundingBox");

        const imgChild = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imgChild.setAttribute("href", `/Images/Monsters/Yeti Child ${i}.png`);
        imgChild.setAttribute("x", "0");
        imgChild.setAttribute("y", "0");
        imgChild.setAttribute("height", "1");
        imgChild.setAttribute("width", "1");
        imgChild.setAttribute("preserveAspectRatio", "xMidYMid slice");

        patChild.appendChild(imgChild);
        defs.appendChild(patChild);
    }

    const lairImages = [
        { id: "pattern-lair-back", url: "/Images/Lair Tokens/lair_token_back.png" },
        { id: "pattern-lair-yeti", url: "/Images/Lair Tokens/yeti_lair_token.png" },
        { id: "pattern-lair-jiangshi", url: "/Images/Lair Tokens/jianshi_lair_token.png" },
        { id: "pattern-lair-blank", url: "/Images/Lair Tokens/blank_lair_token.png" }
    ];
    lairImages.forEach(lairImg => {
        const patLair = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patLair.setAttribute("id", lairImg.id);
        patLair.setAttribute("x", "0");
        patLair.setAttribute("y", "0");
        patLair.setAttribute("height", "1");
        patLair.setAttribute("width", "1");
        patLair.setAttribute("patternContentUnits", "objectBoundingBox");
        const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("href", lairImg.url);
        img.setAttribute("x", "0");
        img.setAttribute("y", "0");
        img.setAttribute("height", "1");
        img.setAttribute("width", "1");
        img.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patLair.appendChild(img);
        defs.appendChild(patLair);
    });

    // Create image patterns for heroes
    const heroClasses = ["The Guardian", "The Investigator", "The Buccaneer", "The Fortune Teller", "The Parapsychologist"];
    heroClasses.forEach(heroClass => {
        const patHero = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patHero.setAttribute("id", `pattern-hero-${heroClass.replaceAll(" ", "_")}`);
        patHero.setAttribute("x", "0");
        patHero.setAttribute("y", "0");
        patHero.setAttribute("height", "1");
        patHero.setAttribute("width", "1");
        patHero.setAttribute("patternContentUnits", "objectBoundingBox");
        const imgHero = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imgHero.setAttribute("href", `/Images/Heroes/${heroClass} Image.png`);
        imgHero.setAttribute("x", "0");
        imgHero.setAttribute("y", "0");
        imgHero.setAttribute("height", "1");
        imgHero.setAttribute("width", "1");
        imgHero.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patHero.appendChild(imgHero);
        defs.appendChild(patHero);
    });

    // Create image patterns for citizens currently in play. Each citizen's "portrait"
    // (from server.py) is the real filename in Images/Citizens/ — names don't all
    // slugify cleanly (e.g. "Dr. Weir" -> dr_weir.png) and not every portrait is a
    // .png, so we never guess the path client-side.
    for (const citName in (gameState.citizens || {})) {
        const cit = gameState.citizens[citName];
        const portrait = cit.portrait || `${citName}.png`;
        const patCit = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patCit.setAttribute("id", `pattern-citizen-${citName.replaceAll(" ", "_")}`);
        patCit.setAttribute("x", "0");
        patCit.setAttribute("y", "0");
        patCit.setAttribute("height", "1");
        patCit.setAttribute("width", "1");
        patCit.setAttribute("patternContentUnits", "objectBoundingBox");
        const imgCit = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imgCit.setAttribute("href", `/Images/Citizens/${portrait}`);
        imgCit.setAttribute("x", "0");
        imgCit.setAttribute("y", "0");
        imgCit.setAttribute("height", "1");
        imgCit.setAttribute("width", "1");
        imgCit.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patCit.appendChild(imgCit);
        defs.appendChild(patCit);
    }

    elGameMap.appendChild(defs);

    // Create Background Map Image programmatically (namespace-safe)
    const bgImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
    bgImage.setAttribute("id", "game-map-image");
    const mapFile = gameState.selected_map || "Map.png";
    bgImage.setAttribute("href", `/Images/${mapFile}?v=2`);
    bgImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", `/Images/${mapFile}?v=2`);
    bgImage.setAttribute("x", "0");
    bgImage.setAttribute("y", "0");
    bgImage.setAttribute("width", "1304");
    bgImage.setAttribute("height", "1206");
    elGameMap.appendChild(bgImage);

    // --- START INJECT FALLBACK COORDINATES ---
    let fallbackX = 60;
    let fallbackY = 60;
    const checkLoc = (loc) => {
        if (loc && loc !== "Board" && !gameState.node_coordinates[loc]) {
            gameState.node_coordinates[loc] = {x: fallbackX, y: fallbackY, r: 28, type: "circle"};
            fallbackX += 80;
            if (fallbackX > 1200) { fallbackX = 60; fallbackY += 80; }
        }
    };
    if (gameState.items_on_board) Object.keys(gameState.items_on_board).forEach(checkLoc);
    if (gameState.heroes_state) Object.values(gameState.heroes_state).forEach(h => checkLoc(h.location));
    if (gameState.monster_locations) Object.values(gameState.monster_locations).forEach(checkLoc);
    if (gameState.citizens) Object.values(gameState.citizens).forEach(c => checkLoc(c.location));
    if (gameState.monster_states && gameState.monster_states["Yeti"]) {
        gameState.monster_states["Yeti"].lairs.forEach(l => checkLoc(l.location));
        gameState.monster_states["Yeti"].children.forEach(c => checkLoc(c.location));
    }
    // --- END INJECT FALLBACK COORDINATES ---

    // 1. Draw paths (lines)
    const coordinates = gameState.node_coordinates;
    const adjList = gameState.adjacency_list;
    const drawnPairs = new Set();

    for (const startLoc in adjList) {
        const start = coordinates[startLoc];
        if (!start) continue;

        adjList[startLoc].forEach(endLoc => {
            const end = coordinates[endLoc];
            if (!end) return;

            // Prevent drawing lines twice
            const pairId = [startLoc, endLoc].sort().join("<->");
            if (!drawnPairs.has(pairId)) {
                drawnPairs.add(pairId);
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", start.x);
                line.setAttribute("y1", start.y);
                line.setAttribute("x2", end.x);
                line.setAttribute("y2", end.y);
                line.setAttribute("class", "map-link");
                elGameMap.appendChild(line);
            }
        });
    }

    // Guide Mode: precompute step 1 (eligible legends) or step 2 (valid destinations)
    // once, outside the per-node loop below.
    let guideEligibleNames = [];
    let guideDestinations = [];
    if (selectedAction === "guide") {
        const guideMyState = gameState.heroes_state[playerName];
        const guideIsTurn = (gameState.players[gameState.turn_player_idx].name === playerName);
        if (guideMyState && guideIsTurn) {
            const guideAdjacent = adjList[guideMyState.location] || [];
            if (guideSelectedLegend) {
                guideDestinations = getGuideValidTargets(guideMyState.location, guideAdjacent, guideSelectedLegend);
            } else {
                guideEligibleNames = getEligibleGuideLegends(guideMyState.location, guideAdjacent).map(l => l.name);
            }
        }
    }

    // 2. Draw nodes (circles)
    for (const locName in coordinates) {
        const coord = coordinates[locName];

        // Highlight destinations if we are in MOVE mode
        const myState = gameState.heroes_state[playerName];
        const isTurn = (gameState.players[gameState.turn_player_idx].name === playerName);
        const adjacent = myState ? adjList[myState.location] : [];
        const isMoveTarget = (selectedAction === "move") && isTurn && (adjacent.includes(locName) || (myState.hero === "Explorer" && isDoubleJump(myState.location, locName)));
        const isGuideTarget = guideDestinations.includes(locName);
        const isActiveDest = isMoveTarget || isGuideTarget;

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.addEventListener("mouseenter", () => {
            playHoverSound();
        });
        
        // 2a. Platform circle hitbox
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", coord.x);
        circle.setAttribute("cy", coord.y);
        const rVal = coord.r || 35;
        circle.setAttribute("r", rVal);
        circle.setAttribute("class", `map-node ${isActiveDest ? "active-dest" : ""}`);
        
        circle.addEventListener("mousedown", (e) => {
            if (elGameMap.classList.contains("debug-hitboxes")) {
                e.stopPropagation();
                dragType = "circle";
                dragLocName = locName;
                window.isDragging = false;
            }
        });

        circle.addEventListener("wheel", (e) => {
            if (elGameMap.classList.contains("debug-hitboxes")) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1 : -1;
                let currentR = coord.r || 35;
                currentR = Math.max(10, Math.min(100, currentR + delta));
                gameState.node_coordinates[locName].r = currentR;
                renderSVGMap();
                sendMsg({
                    action: "update_coordinates",
                    coordinates: gameState.node_coordinates
                });
            }
        }, { passive: false });

        if (isMoveTarget) {
            circle.addEventListener("click", (e) => {
                if (window.isDragging) return;
                sendMsg({ action: "move", target: locName });
                selectedAction = null;
            });
        } else if (isGuideTarget) {
            circle.addEventListener("click", (e) => {
                if (window.isDragging) return;
                sendMsg({ action: "guide", legend: guideSelectedLegend.name, target: locName });
                selectedAction = null;
                guideSelectedLegend = null;
            });
        } else {
            circle.addEventListener("click", (e) => {
                if (window.isDragging) return;
                showNodeInfo(locName);
            });
        }
        g.appendChild(circle);

        // 2b. Label banner rect hitbox (if coordinates exist)
        if (coord.bx !== undefined && coord.by !== undefined) {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const rectW = coord.rw || 150;
            const rectH = coord.rh || 34;
            rect.setAttribute("x", coord.bx - rectW / 2);
            rect.setAttribute("y", coord.by - rectH / 2);
            rect.setAttribute("width", rectW);
            rect.setAttribute("height", rectH);
            rect.setAttribute("rx", 6);
            rect.setAttribute("ry", 6);
            rect.setAttribute("class", `map-node ${isActiveDest ? "active-dest" : ""}`);
            
            rect.addEventListener("mousedown", (e) => {
                if (elGameMap.classList.contains("debug-hitboxes")) {
                    e.stopPropagation();
                    dragType = "rect";
                    dragLocName = locName;
                    window.isDragging = false;
                }
            });

            rect.addEventListener("wheel", (e) => {
                if (elGameMap.classList.contains("debug-hitboxes")) {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 2 : -2;
                    let rwVal = coord.rw || 150;
                    let rhVal = coord.rh || 34;
                    if (e.shiftKey) {
                        rhVal = Math.max(10, Math.min(100, rhVal + delta));
                    } else {
                        rwVal = Math.max(20, Math.min(300, rwVal + delta));
                    }
                    gameState.node_coordinates[locName].rw = rwVal;
                    gameState.node_coordinates[locName].rh = rhVal;
                    renderSVGMap();
                    sendMsg({
                        action: "update_coordinates",
                        coordinates: gameState.node_coordinates
                    });
                }
            }, { passive: false });

            if (isMoveTarget) {
                rect.addEventListener("click", (e) => {
                    if (window.isDragging) return;
                    sendMsg({ action: "move", target: locName });
                    selectedAction = null;
                });
            } else if (isGuideTarget) {
                rect.addEventListener("click", (e) => {
                    if (window.isDragging) return;
                    sendMsg({ action: "guide", legend: guideSelectedLegend.name, target: locName });
                    selectedAction = null;
                    guideSelectedLegend = null;
                });
            } else {
                rect.addEventListener("click", (e) => {
                    if (window.isDragging) return;
                    showNodeInfo(locName);
                });
            }
            g.appendChild(rect);
        }

        // Name text
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", coord.x);
        text.setAttribute("y", coord.y + 45);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "node-label");
        text.textContent = locName;
        g.appendChild(text);

        // 3. Render items stacked inside the node
        const items = gameState.items_on_board[locName] || [];
        items.forEach((item, index) => {
            const offset = getItemOffset(index, coord.r || 35);
            const itemG = document.createElementNS("http://www.w3.org/2000/svg", "g");

            const itemCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            itemCircle.setAttribute("id", "map-item-" + item.id);
            itemCircle.setAttribute("cx", coord.x + offset.x);
            itemCircle.setAttribute("cy", coord.y + offset.y);
            itemCircle.setAttribute("r", 14);
            itemCircle.setAttribute("class", `token-item ${item.color.toLowerCase()}`);
            itemG.appendChild(itemCircle);

            const itemVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
            itemVal.setAttribute("x", coord.x + offset.x);
            itemVal.setAttribute("y", coord.y + offset.y + 4);
            itemVal.setAttribute("text-anchor", "middle");
            itemVal.setAttribute("class", "token-label");
            itemVal.textContent = item.strength;
            itemG.appendChild(itemVal);

            itemG.style.cursor = "pointer";
            itemG.addEventListener("mouseenter", (e) => showItemTooltip(e, item.name, item.artwork, item.color));
            itemG.addEventListener("mouseleave", () => hideItemTooltip());

            g.appendChild(itemG);
        });

        // 4. Render Characters (Heroes, Monsters, Citizens)
        // Group everything in this node
        const characters = [];

        // Heroes
        for (const pName in gameState.heroes_state) {
            const h = gameState.heroes_state[pName];
            if (h.location === locName) {
                // If player is in Corpse City, don't show on board
                if (gameState.active_monsters.includes("Cthulhu")) {
                    const cth_track = gameState.monster_states["Cthulhu"].player_tracks[pName];
                    if (cth_track !== -1 && cth_track !== undefined) continue;
                }
                characters.push({ type: "hero", name: pName, heroClass: h.hero, label: h.hero.charAt(0) });
            }
        }

        // Monsters
        for (const monName in gameState.monster_locations) {
            if (gameState.active_monsters.includes(monName) && gameState.monster_locations[monName] === locName) {
                characters.push({ type: "monster", name: monName, label: monName.charAt(0) });
            }
        }

        // Citizens
        for (const citName in gameState.citizens) {
            const cit = gameState.citizens[citName];
            if (cit.active && cit.location === locName) {
                characters.push({ type: "citizen", name: citName, label: "C", safe: cit.safe, portrait: cit.portrait });
            }
        }

        // Yeti kids
        if (gameState.active_monsters.includes("Yeti")) {
            const y_state = gameState.monster_states["Yeti"];
            y_state.children.forEach(child => {
                if (!child.rescued && child.location === locName) {
                    characters.push({ type: "citizen", name: `Yeti Child ${child.id}`, label: `K${child.id}` });
                }
            });
        }

        // Lair Tokens: a single shared pool of 4 (Yeti's Cave / Jiangshi's Moon Shrine / decoys)
        (gameState.lair_tokens || []).forEach((token, i) => {
            if (token.location === locName) {
                characters.push({ type: "lair", lair_type: token.type, name: `Lair Token ${i}`, is_true: token.type !== "blank", flipped: token.revealed });
            }
        });

        characters.forEach((char, index) => {
            const isYeti = (char.name === "Yeti");
            const isSphinx = (char.name === "Sphinx");
            const isJiangshi = (char.name === "Jiangshi");
            const isCthulhu = (char.name === "Cthulhu");
            const isYetiChild = char.name.startsWith("Yeti Child");
            const isLair = (char.type === "lair");
            const childId = isYetiChild ? char.name.replace("Yeti Child ", "") : null;
            const isCustomMonster = isYeti || isSphinx || isJiangshi || isCthulhu;
            const isFrenzyMonster = (char.type === "monster") && char.name === gameState.frenzy_marker;
            const isHero = (char.type === "hero");
            const isCitizen = (char.type === "citizen") && !isYetiChild;
            let charR;
            if (isCustomMonster) charR = 48;
            else if (isYetiChild) charR = 26;
            else if (isHero) charR = 34;
            else if (isLair) charR = 28;
            else if (isCitizen) charR = 26;
            else charR = 20;

            const offset = getCharOffset(index, characters.length, coord.r || 35);
            const charG = document.createElementNS("http://www.w3.org/2000/svg", "g");

            const charKey = `${char.type}-${char.name}`;
            const targetX = coord.x + offset.x;
            const targetY = coord.y + offset.y;

            const shapeType = isLair ? "rect" : "circle";
            const charShape = document.createElementNS("http://www.w3.org/2000/svg", shapeType);
            
            const lairW = 56;
            const lairH = 40;
            if (isLair) {
                charShape.setAttribute("width", lairW);
                charShape.setAttribute("height", lairH);
                charShape.setAttribute("rx", 3);
            } else {
                charShape.setAttribute("r", charR);
            }
            
            const setPos = (el, nx, ny) => {
                if (isLair) {
                    el.setAttribute("x", nx - lairW / 2);
                    el.setAttribute("y", ny - lairH / 2);
                } else {
                    el.setAttribute("cx", nx);
                    el.setAttribute("cy", ny);
                }
            };
            
            const lastPos = lastCharacterPositions[charKey];
            if (lastPos && (lastPos.x !== targetX || lastPos.y !== targetY)) {
                setPos(charShape, lastPos.x, lastPos.y);

                setTimeout(() => {
                    setPos(charShape, targetX, targetY);
                }, 20);

                // Draw glowing motion trail
                drawMovementTrail(lastPos.x, lastPos.y, targetX, targetY);
            } else {
                setPos(charShape, targetX, targetY);
            }

            lastCharacterPositions[charKey] = { x: targetX, y: targetY };
            
            if (isYeti) {
                charShape.setAttribute("class", "yeti-token");
                charShape.setAttribute("fill", "url(#pattern-yeti)");
                charShape.setAttribute("stroke", "#ff3366"); // Bold neon crimson border
                charShape.setAttribute("stroke-width", "2.5");
                charShape.setAttribute("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isSphinx) {
                charShape.setAttribute("class", "sphinx-token");
                charShape.setAttribute("fill", "url(#pattern-sphinx)");
                charShape.setAttribute("stroke", "#ffcc00"); // Golden border
                charShape.setAttribute("stroke-width", "2.5");
                charShape.setAttribute("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isJiangshi) {
                charShape.setAttribute("class", "jiangshi-token");
                charShape.setAttribute("fill", "url(#pattern-jiangshi)");
                charShape.setAttribute("stroke", "#33ff99"); // Jade border, matching the Jade Sword theme
                charShape.setAttribute("stroke-width", "2.5");
                charShape.setAttribute("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isCthulhu) {
                charShape.setAttribute("class", "cthulhu-token");
                charShape.setAttribute("fill", "url(#pattern-cthulhu)");
                charShape.setAttribute("stroke", "#00e5cc"); // Abyssal teal border
                charShape.setAttribute("stroke-width", "2.5");
                charShape.setAttribute("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isYetiChild) {
                const isGuideSource = guideEligibleNames.includes(char.name);
                const isGuideActive = guideSelectedLegend && guideSelectedLegend.name === char.name;
                charShape.setAttribute("class", `yeti-child-token ${isGuideSource ? "guide-source-pulse" : ""}`);
                charShape.setAttribute("fill", `url(#pattern-yeti-child-${childId})`);
                charShape.setAttribute("stroke", isGuideActive ? "#ffd533" : "#33ccff"); // Ice blue border, gold while chosen for Guide
                charShape.setAttribute("stroke-width", isGuideActive ? "3.5" : "2");
                if (!isGuideSource) {
                    charShape.setAttribute("filter", isGuideActive
                        ? "drop-shadow(0 0 10px rgba(255,213,51,0.9))"
                        : "drop-shadow(0 2px 4px rgba(0,0,0,0.4))");
                }
                if (isGuideSource) {
                    charShape.style.cursor = "pointer";
                    charShape.addEventListener("click", (e) => {
                        e.stopPropagation();
                        guideSelectedLegend = { name: char.name, loc: locName, type: "child" };
                        renderSVGMap();
                    });
                }
            } else if (isLair) {
                charShape.setAttribute("class", "lair-token");
                const getLairUrl = (type) => {
                    if (type === "yeti") return "url(#pattern-lair-yeti)";
                    if (type === "jiangshi") return "url(#pattern-lair-jiangshi)";
                    return "url(#pattern-lair-blank)";
                };
                const patId = char.flipped ? getLairUrl(char.lair_type) : "url(#pattern-lair-back)";
                charShape.setAttribute("fill", patId);
                charShape.setAttribute("stroke", char.flipped ? (char.is_true ? "#ffd533" : "#555") : "#fff");
                charShape.setAttribute("stroke-width", "2.5");
                charShape.setAttribute("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.4))");
                
                charShape.style.transformBox = "fill-box";
                charShape.style.transformOrigin = "center";
                charShape.style.transition = "transform 0.2s ease";
                charShape.style.cursor = "pointer";
                
                charShape.addEventListener("mouseenter", () => {
                    charShape.style.transform = "scale(1.8)";
                });
                charShape.addEventListener("mouseleave", () => {
                    charShape.style.transform = "scale(1)";
                });
                
                if (char.flipped) {
                    charShape.addEventListener("click", (e) => {
                        e.stopPropagation();
                        showLairImageModal(char.lair_type);
                    });
                }
            } else if (isHero) {
                const patId = `pattern-hero-${char.heroClass.replaceAll(" ", "_")}`;
                const isMe = (char.name === playerName);
                const isActiveTurn = (gameState.players[gameState.turn_player_idx].name === char.name);
                charShape.setAttribute("id", "map-hero-" + char.name.replace(/ /g, "_"));
                charShape.setAttribute("class", "hero-token");
                charShape.setAttribute("fill", `url(#${patId})`);
                charShape.setAttribute("stroke", (isMe || isActiveTurn) ? "#ffd533" : "#33ccff");
                charShape.setAttribute("stroke-width", (isMe || isActiveTurn) ? "3.5" : "2.5");
                charShape.setAttribute("filter", `drop-shadow(0 0 ${(isMe || isActiveTurn) ? 12 : 6}px ${(isMe || isActiveTurn) ? "rgba(255,213,51,0.9)" : "rgba(51,204,255,0.7)"})`);
                
                charShape.style.cursor = "pointer";
                charShape.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (isMe) {
                        const tabBtn = document.getElementById("gtab-btn-my-hero");
                        if (tabBtn && !tabBtn.classList.contains("active")) {
                            tabBtn.click();
                        }
                    } else {
                        const activeHeroes = Object.keys(gameState.heroes_state || {}).filter(name => name !== playerName);
                        const idx = activeHeroes.indexOf(char.name);
                        if (idx !== -1) {
                            currentHeroTabIndex = idx;
                            renderPlayerPanel();
                        }
                        const tabBtn = document.getElementById("gtab-btn-hero");
                        if (tabBtn && !tabBtn.classList.contains("active")) {
                            tabBtn.click();
                        }
                    }
                });
            } else if (isCitizen) {
                const patId = `pattern-citizen-${char.name.replaceAll(" ", "_")}`;
                const isGuideSource = guideEligibleNames.includes(char.name);
                const isGuideActive = guideSelectedLegend && guideSelectedLegend.name === char.name;
                charShape.setAttribute("class", `citizen-token ${isGuideSource ? "guide-source-pulse" : ""}`);
                charShape.setAttribute("fill", `url(#${patId})`);
                charShape.setAttribute("stroke", isGuideActive ? "#ffd533" : "#20e889");
                charShape.setAttribute("stroke-width", isGuideActive ? "3.5" : "2.5");
                if (!isGuideSource) {
                    charShape.setAttribute("filter", isGuideActive
                        ? "drop-shadow(0 0 10px rgba(255,213,51,0.9))"
                        : "drop-shadow(0 0 7px rgba(32,232,137,0.7))");
                }
                charShape.style.cursor = "pointer";
                charShape.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (isGuideSource) {
                        guideSelectedLegend = { name: char.name, loc: locName, type: "citizen" };
                        renderSVGMap();
                    } else {
                        showCitizenInfo(char.name, char.safe, char.portrait);
                    }
                });
            } else {
                // Generic fallback marker (no monster currently uses this — all 4 have portraits)
                charShape.setAttribute("class", `token-character char-${char.type}`);
            }

            if (char.type === "monster") {
                charShape.setAttribute("id", "map-monster-" + char.name.replace(/ /g, "_"));
                charShape.style.cursor = "pointer";
                charShape.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const active = gameState.active_monsters || [];
                    const defeated = gameState.defeated_monsters || [];
                    const allMonsters = [...active, ...defeated];
                    const idx = allMonsters.indexOf(char.name);
                    if (idx !== -1) {
                        currentMonsterTabIndex = idx;
                        renderMonstersStatusPanel();
                    }
                    const tabBtn = document.getElementById("gtab-btn-monsters");
                    if (tabBtn && !tabBtn.classList.contains("active")) {
                        tabBtn.click();
                    }
                });
            }
            // The monster currently holding the Frenzy marker gets a pulsing gold ring,
            // overriding its normal border, so it's identifiable at a glance on the map.
            if (isFrenzyMonster) {
                charShape.classList.add("frenzy-marker-token");
                charShape.setAttribute("stroke", "#ffd533");
                charShape.setAttribute("stroke-width", "4");
                charShape.setAttribute("filter", "drop-shadow(0 0 10px rgba(255,213,51,0.9))");
            }

            charG.appendChild(charShape);

            if (isFrenzyMonster) {
                const badgeR = charR * 0.32;
                const badgeCx = targetX + charR * 0.72;
                const badgeCy = targetY - charR * 0.72;
                const badgeCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                badgeCircle.setAttribute("cx", badgeCx);
                badgeCircle.setAttribute("cy", badgeCy);
                badgeCircle.setAttribute("r", badgeR);
                badgeCircle.setAttribute("fill", "#1a0f2e");
                badgeCircle.setAttribute("stroke", "#ffd533");
                badgeCircle.setAttribute("stroke-width", "2");
                badgeCircle.setAttribute("class", "frenzy-marker-badge");
                charG.appendChild(badgeCircle);

                const badgeIcon = document.createElementNS("http://www.w3.org/2000/svg", "text");
                badgeIcon.setAttribute("x", badgeCx);
                badgeIcon.setAttribute("y", badgeCy + badgeR * 0.4);
                badgeIcon.setAttribute("text-anchor", "middle");
                badgeIcon.setAttribute("font-size", `${badgeR * 1.3}px`);
                badgeIcon.textContent = "⚡";
                charG.appendChild(badgeIcon);
            }

            // Render text label only for monsters without portrait images
            if (!isCustomMonster && !isYetiChild && !isHero && !isCitizen && !isLair) {
                const charVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
                charVal.setAttribute("text-anchor", "middle");
                charVal.setAttribute("fill", "#000");
                charVal.setAttribute("font-size", "14px");
                charVal.setAttribute("font-weight", "bold");
                charVal.textContent = char.label;

                if (lastPos && (lastPos.x !== targetX || lastPos.y !== targetY)) {
                    charVal.setAttribute("x", lastPos.x);
                    charVal.setAttribute("y", lastPos.y + 4);

                    setTimeout(() => {
                        charVal.setAttribute("x", targetX);
                        charVal.setAttribute("y", targetY + 4);
                    }, 20);
                } else {
                    charVal.setAttribute("x", targetX);
                    charVal.setAttribute("y", targetY + 4);
                }
                charG.appendChild(charVal);
            }

            // Tooltip / Title on hover
            const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title.textContent = `${char.name} (${char.type})`;
            charG.appendChild(title);

            g.appendChild(charG);
        });

        elGameMap.appendChild(g);
    }

    // ---------------------------------------------------------
    // Render Terror Track
    // ---------------------------------------------------------
    if (gameState.terror_level !== undefined) {
        const terrorTrackG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // Fallback formula (used only if the server hasn't sent calibrated coordinates yet)
        const slotSpacing = 82;
        const numSlots = 8;
        const trackStartX = 652 - (numSlots * slotSpacing) / 2 + (slotSpacing / 2) - 12;
        const trackY = 60;
        const terrorCoords = gameState.terror_track_coordinates;

        for (let i = 0; i <= 7; i++) {
            const slot = terrorCoords && terrorCoords[i];
            const slotX = slot ? slot.x : (trackStartX + i * slotSpacing);
            const slotY = slot ? slot.y : trackY;
            const slotR = (slot && slot.r) || 28;

            const slotPoints = (slot && slot.points && slot.points.length >= 3) ? slot.points : null;

            // Neon LED-style glow tracing only the contour of the current Terror Level
            // placeholder (custom polygon if one is defined, otherwise a plain circle),
            // leaving the center hollow so the level number underneath stays visible.
            if (gameState.terror_level === i) {
                const ring = createNeonRing(slotX, slotY, slotR, slotPoints);

                // If the Terror Level just increased, slide the ring in from its previous
                // slot (plus a glowing movement trail) instead of just popping into place.
                if (pendingTerrorTransitionFrom !== null && pendingTerrorTransitionFrom !== i) {
                    const fromSlot = terrorCoords && terrorCoords[pendingTerrorTransitionFrom];
                    if (fromSlot) {
                        const dx = fromSlot.x - slotX, dy = fromSlot.y - slotY;
                        ring.style.transform = `translate(${dx}px, ${dy}px)`;
                        requestAnimationFrame(() => requestAnimationFrame(() => {
                            ring.style.transition = "transform 0.8s cubic-bezier(0.25, 1, 0.3, 1)";
                            ring.style.transform = "translate(0px, 0px)";
                        }));
                        drawMovementTrail(fromSlot.x, fromSlot.y, slotX, slotY);
                    }
                }

                terrorTrackG.appendChild(ring);
            }
            
            // Add a draggable hitbox for the terror track slot
            const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            hitbox.setAttribute("cx", slotX);
            hitbox.setAttribute("cy", slotY);
            hitbox.setAttribute("r", slotR);
            hitbox.setAttribute("fill", "transparent");
            hitbox.setAttribute("class", "terror-hitbox");
            if (elGameMap.classList.contains("debug-hitboxes")) {
                hitbox.style.pointerEvents = "all";
                hitbox.style.cursor = "move";
                hitbox.setAttribute("stroke", "rgba(255, 255, 0, 0.8)");
                hitbox.setAttribute("stroke-width", "2");
            } else {
                hitbox.style.pointerEvents = "none";
            }
            hitbox.addEventListener("mousedown", (e) => {
                if (elGameMap.classList.contains("debug-hitboxes")) {
                    e.stopPropagation();
                    dragType = "terror";
                    dragLocName = i; // using index 0-7
                    window.isDragging = false;
                }
            });
            terrorTrackG.appendChild(hitbox);
        }
        pendingTerrorTransitionFrom = null;
        elGameMap.appendChild(terrorTrackG);
    }
}

// Explorer double jumps
function isDoubleJump(start, target) {
    const adj = gameState.adjacency_list[start] || [];
    for (let i = 0; i < adj.length; i++) {
        const subAdj = gameState.adjacency_list[adj[i]] || [];
        if (subAdj.includes(target)) return true;
    }
    return false;
}

function getItemOffset(index, nodeRadius = 35) {
    // Orbit around node center outside transparent hitbox (accounts for the larger r=14 item token)
    const radius = nodeRadius - 11;
    const angle = (index * 60) * (Math.PI / 180);
    return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
    };
}

function getCharOffset(index, total, nodeRadius = 35) {
    // Arrange in center or slightly offset (spread out a bit more to fit the bigger tokens)
    if (total === 1) return { x: 0, y: 0 };
    const radius = nodeRadius * 0.48;
    const angle = (index * (360 / total)) * (Math.PI / 180);
    return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
    };
}

// ---------------------------------------------------------
// MODALS & TOOLTIPS
// ---------------------------------------------------------

function showLairImageModal(lairType) {
    let imgSrc = "/Images/Lair Tokens/blank_lair_token.png";
    let title = "Decoy Lair";
    if (lairType === "yeti") {
        imgSrc = "/Images/Lair Tokens/yeti_lair_token.png";
        title = "Yeti Lair";
    } else if (lairType === "jiangshi") {
        imgSrc = "/Images/Lair Tokens/jianshi_lair_token.png";
        title = "Jiangshi Lair";
    }
    const html = `
        <h2 style="margin-top:0;">${title}</h2>
        <div style="text-align: center; margin: 20px 0;">
            <img src="${imgSrc}" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        </div>
        <p style="text-align: center; color: #a491c3; font-size: 0.9rem;">Close this window to continue.</p>
    `;
    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
}

// ---------------------------------------------------------
// NODE INFORMATION MODAL
// ---------------------------------------------------------

function showNodeInfo(locName) {
    const items = gameState.items_on_board[locName] || [];

    let html = `<div style="text-align:center;">`;
    html += `<h3>${locName}</h3><hr style="border-color: rgba(255,255,255,0.05); margin: 10px 0;">`;

    if (items.length > 0) {
        html += `<p style="margin-bottom:8px;"><strong>Items at this location:</strong></p>`;
        html += `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-bottom:14px;">`;
        items.forEach(item => {
            const imgSrc = item.artwork ? `/assets/items/${item.artwork}` : "";
            const colorHex = getItemColorHex(item.color);
            html += `
                <div style="width:84px; text-align:center;">
                    <div style="width:64px; height:64px; margin:0 auto 6px; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.05); border:3px solid ${colorHex}; box-shadow: 0 0 6px ${colorHex}66; display:flex; align-items:center; justify-content:center;">
                        ${imgSrc ? `<img src="${imgSrc}" alt="${item.name}" style="width:100%; height:100%; object-fit:contain;" onerror="this.parentElement.style.visibility='hidden'">` : ''}
                    </div>
                    <div style="font-size:0.68rem; color:#e5d9c8; line-height:1.2;">${item.name}</div>
                    <div style="font-size:0.65rem; color:#a491c3;"><strong>${item.strength}</strong></div>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<p style="color:#a491c3; font-style:italic;">No items here.</p>`;
    }

    // Characters present: heroes, active monsters, citizens, and Yeti children
    const chars = [];
    for (const pName in gameState.heroes_state) {
        const h = gameState.heroes_state[pName];
        if (h.location === locName) {
            chars.push({ img: `/Images/Heroes/${h.hero} Image.png`, label: pName, sub: h.hero });
        }
    }
    for (const mName in gameState.monster_locations) {
        if (gameState.active_monsters.includes(mName) && gameState.monster_locations[mName] === locName) {
            chars.push({ img: `/Images/Monsters/${mName}.png`, label: mName, sub: "Monster" });
        }
    }
    for (const citName in gameState.citizens) {
        const cit = gameState.citizens[citName];
        if (cit.active && cit.location === locName) {
            chars.push({ img: `/Images/Citizens/${cit.portrait || `${citName}.png`}`, label: citName, sub: `Heading to ${cit.safe}` });
        }
    }
    if (gameState.active_monsters.includes("Yeti") && gameState.monster_states["Yeti"]) {
        gameState.monster_states["Yeti"].children.forEach(child => {
            if (!child.rescued && child.location === locName) {
                chars.push({ img: `/Images/Monsters/Yeti Child ${child.id}.png`, label: `Yeti Child ${child.id}`, sub: "Legend" });
            }
        });
    }

    if (chars.length > 0) {
        html += `<p style="margin-bottom:8px;"><strong>Characters present:</strong></p>`;
        html += `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px;">`;
        chars.forEach(c => {
            html += `
                <div style="width:84px; text-align:center;">
                    <div style="width:64px; height:64px; margin:0 auto 6px; border-radius:50%; overflow:hidden; background:rgba(255,255,255,0.05); border:2px solid rgba(255,213,51,0.45);">
                        <img src="${c.img}" alt="${c.label}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.visibility='hidden'">
                    </div>
                    <div style="font-size:0.68rem; color:#f0e8ff; font-weight:600; line-height:1.2;">${c.label}</div>
                    <div style="font-size:0.62rem; color:#a491c3;">${c.sub}</div>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `</div>`;
    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
}

function showCitizenInfo(citName, safeHaven, portrait) {
    const imgSrc = `/Images/Citizens/${portrait || `${citName}.png`}`;
    elModalBody.innerHTML = `
        <div style="text-align: center; padding: 10px;">
            <h3 style="color: #ffd533; font-size: 1.5rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px;">${citName}</h3>
            <img src="${imgSrc}" style="width: 120px; height: 120px; margin-bottom: 15px; filter: drop-shadow(0 0 10px rgba(32,232,137,0.7)); border-radius: 50%; border: 3px solid #20e889; object-fit: cover; background: rgba(255,255,255,0.05);">
            <p style="font-size: 1.15rem; color: #e0d0ff;">
                Safe Haven: <br><strong style="color: #20e889; font-size: 1.3rem;">${safeHaven}</strong>
            </p>
            <button class="btn btn-secondary" style="margin-top: 20px;" onclick="document.getElementById('modal-container').classList.add('hidden')">Close</button>
        </div>
    `;
    elModalContainer.classList.remove("hidden");
}

// ---------------------------------------------------------
// PLAYER ACTION TRIGGERS
// ---------------------------------------------------------

document.getElementById("action-move").addEventListener("click", () => {
    selectedAction = "move";
    gameState.log.push(">>> Click on adjacent node to Move!");
    renderSVGMap();
});

// Returns the citizens/Yeti children that can currently be picked as a Guide source:
// active, and either at the hero's own location or at a location adjacent to it.
function getEligibleGuideLegends(currentLoc, adjacent) {
    const eligible = [];
    for (const name in gameState.citizens) {
        const cit = gameState.citizens[name];
        if (cit.active && (cit.location === currentLoc || adjacent.includes(cit.location))) {
            eligible.push({ name: name, loc: cit.location, type: "citizen" });
        }
    }
    if (gameState.active_monsters.includes("Yeti") && gameState.monster_states["Yeti"]) {
        const y_state = gameState.monster_states["Yeti"];
        y_state.children.forEach(child => {
            if (!child.rescued && (child.location === currentLoc || adjacent.includes(child.location))) {
                eligible.push({ name: `Yeti Child ${child.id}`, loc: child.location, type: "child" });
            }
        });
    }
    return eligible;
}

// Given a chosen legend, returns the location(s) it can be guided to: any location
// adjacent to the hero if the legend is standing with the hero, or just the hero's
// own location if the legend is one step away — mirrors execute_guide on the server.
function getGuideValidTargets(currentLoc, adjacent, legend) {
    if (legend.loc === currentLoc) return adjacent;
    if (adjacent.includes(legend.loc)) return [currentLoc];
    return [];
}

// Guide action trigger: toggles on-map Guide Mode (click here to cancel too).
// Step 1: click a highlighted citizen/Yeti child on the map to choose the legend.
// Step 2: click the highlighted destination node to send them there. No popup/modal.
document.getElementById("action-guide").addEventListener("click", () => {
    if (selectedAction === "guide") {
        selectedAction = null;
        guideSelectedLegend = null;
        renderSVGMap();
        return;
    }

    const myState = gameState.heroes_state[playerName];
    if (!myState) return;

    const currentLoc = myState.location;
    const adjacent = gameState.adjacency_list[currentLoc] || [];
    const eligibleLegends = getEligibleGuideLegends(currentLoc, adjacent);

    if (eligibleLegends.length === 0) {
        alert("There are no active Legends (citizens or Yeti children) at or adjacent to your location to guide.");
        return;
    }

    selectedAction = "guide";
    guideSelectedLegend = null;
    renderSVGMap();
});

document.getElementById("action-pickup").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    const items = gameState.items_on_board[myState.location] || [];
    
    if (items.length === 0) {
        alert("No items to pick up at this location.");
        return;
    }

    // Modal to choose items
    let html = `<div style="text-align:center;">`;
    html += `
        <h3>Pick Up Items</h3>
        <p style="font-size:0.85rem; color:#b0a0cf;">Select items to add to inventory</p>
        <hr style="border-color:rgba(255,255,255,0.05); margin: 10px 0;">
        <div id="pickup-items-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px;">
    `;

    items.forEach(item => {
        const imgSrc = item.artwork ? `/assets/items/${item.artwork}` : "";
        const colorHex = getItemColorHex(item.color);
        html += `
            <label class="pickup-item-card" style="width:84px; text-align:center; cursor:pointer;">
                <input type="checkbox" class="pickup-item-checkbox" value="${item.id}"
                       data-color="${item.color}" data-strength="${item.strength}" data-name="${item.name}"
                       style="display:none;">
                <div class="pickup-item-thumb" style="width:64px; height:64px; margin:0 auto 6px; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.05); border:3px solid ${colorHex}; display:flex; align-items:center; justify-content:center; transition: box-shadow 0.15s ease;">
                    ${imgSrc ? `<img src="${imgSrc}" alt="${item.name}" style="width:100%; height:100%; object-fit:contain;" onerror="this.parentElement.style.visibility='hidden'">` : ''}
                </div>
                <div style="font-size:0.68rem; color:#e5d9c8; line-height:1.2;">${item.name}</div>
                <div style="font-size:0.65rem; color:#a491c3;"><strong>${item.strength}</strong></div>
            </label>
        `;
    });

    html += `
        </div>
        <hr style="border-color:rgba(255,255,255,0.05); margin: 15px 0 10px 0;">
        <div style="display: flex; justify-content: space-between; align-items:center; gap: 10px;">
            <button class="btn btn-secondary btn-small" id="btn-pickup-all">Select All</button>
            <div style="display:flex; gap:10px;">
                <button class="btn btn-secondary btn-small" onclick="elModalContainer.classList.add('hidden')">Cancel</button>
                <button class="btn btn-primary btn-small" id="btn-confirm-pickup" disabled>Done</button>
            </div>
        </div>
    `;
    html += `</div>`;

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");

    // Add event listener to checkboxes to toggle the Done button + card highlight
    const checkboxes = document.querySelectorAll(".pickup-item-checkbox");
    const confirmBtn = document.getElementById("btn-confirm-pickup");
    const pickAllBtn = document.getElementById("btn-pickup-all");

    // The thumb's border color always shows the item's color; selection is shown as
    // an added gold glow on top, so both stay visible at once.
    const updateCardHighlight = (cb) => {
        const thumb = cb.nextElementSibling;
        thumb.style.boxShadow = cb.checked ? "0 0 10px 2px rgba(255, 213, 51, 0.8)" : "none";
    };

    confirmBtn.addEventListener("click", () => {
        triggerMultiplePickup(myState.location);
    });

    pickAllBtn.addEventListener("click", () => {
        checkboxes.forEach(cb => {
            cb.checked = true;
            updateCardHighlight(cb);
        });
        confirmBtn.disabled = (checkboxes.length === 0);
    });

    checkboxes.forEach(cb => {
        cb.addEventListener("change", () => {
            updateCardHighlight(cb);
            const checkedCount = document.querySelectorAll(".pickup-item-checkbox:checked").length;
            confirmBtn.disabled = (checkedCount === 0);
        });
    });
});

window.triggerMultiplePickup = (location) => {
    const checkboxes = document.querySelectorAll(".pickup-item-checkbox:checked");
    const itemIds = [];
    
    checkboxes.forEach((cb, idx) => {
        itemIds.push(cb.value);
        
        // Trigger cascading flying item animation
        setTimeout(() => {
            animateItemFly(location, cb.dataset.color, cb.dataset.strength, cb.dataset.name);
            playItemPickupSound();
        }, idx * 120);
    });

    if (itemIds.length > 0) {
        sendMsg({
            action: "pickup",
            item_ids: itemIds
        });
    }
    elModalContainer.classList.add("hidden");
};

document.getElementById("action-share").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    
    // Find if another hero is at same location
    const sharingHeroes = [];
    for (const name in gameState.heroes_state) {
        if (name !== playerName && gameState.heroes_state[name].location === myState.location) {
            sharingHeroes.push(name);
        }
    }

    if (sharingHeroes.length === 0) {
        alert("You must be at the same location as another hero to Share.");
        return;
    }

    const partner = sharingHeroes[0];
    const partnerItems = gameState.heroes_state[partner].items;
    
    let html = `<h3>Share Items with ${partner}</h3><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
    
    html += `<h5>My Items to Give:</h5>`;
    myState.items.forEach(item => {
        html += `<label style="display:block; margin:6px 0;"><input type="checkbox" class="share-give" value="${item.id}"> ${item.name} (${item.color} ${item.strength})</label>`;
    });

    html += `<h5 style="margin-top:15px;">Their Items to Take:</h5>`;
    partnerItems.forEach(item => {
        html += `<label style="display:block; margin:6px 0;"><input type="checkbox" class="share-take" value="${item.id}"> ${item.name} (${item.color} ${item.strength})</label>`;
    });

    html += `<button class="btn btn-primary" onclick="confirmShare('${partner}')" style="width:100%; margin-top:15px;">Confirm Trade</button>`;

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
});

window.confirmShare = (partner) => {
    const giveIds = Array.from(document.querySelectorAll(".share-give:checked")).map(el => el.value);
    const takeIds = Array.from(document.querySelectorAll(".share-take:checked")).map(el => el.value);
    
    sendMsg({
        action: "share",
        target: partner,
        give_ids: giveIds,
        take_ids: takeIds
    });
    elModalContainer.classList.add("hidden");
};

// Lair Token reveal (shared pool of 4: Yeti's Cave / Jiangshi's Moon Shrine / decoys)
document.getElementById("action-advance").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    const loc = myState.location;

    const tokenHere = (gameState.lair_tokens || []).find(t => t.location === loc && !t.revealed);
    if (tokenHere) {
        openItemPicker({
            title: "Reveal Lair Token",
            description: "Discard items totaling strength 3+ to reveal this Lair token.",
            items: myState.items,
            validateFn: (sel) => {
                const total = sel.reduce((a, i) => a + i.strength, 0);
                return { valid: sel.length > 0 && total >= 3, message: `Total strength: ${total} / 3` };
            },
            onConfirm: (ids) => sendMsg({ action: "advance", monster: "Lair", args: { type: "reveal_lair", item_ids: ids } })
        });
        return;
    }

    // Place a Yeti Child waiting at the (already revealed) True Cave onto the mat.
    if (gameState.active_monsters.includes("Yeti")) {
        const y_state = gameState.monster_states["Yeti"];
        const trueCave = (gameState.lair_tokens || []).find(t => t.type === "yeti" && t.revealed);
        if (trueCave && loc === trueCave.location) {
            const waitingChild = y_state.children.find(c => !c.rescued && c.location === loc);
            if (waitingChild) {
                placeYetiChild(waitingChild.id);
                return;
            }
        }
    }

    alert("No advance challenge available at your current location. (Puzzle slots and dials are worked by clicking them directly in the Monsters panel.)");
});

// Defeat action
document.getElementById("action-defeat").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    const loc = myState.location;

    // Check which monster is at my location
    let targetMonster = null;
    for (const monster in gameState.monster_locations) {
        if (gameState.active_monsters.includes(monster) && gameState.monster_locations[monster] === loc) {
            targetMonster = monster;
            break;
        }
    }

    // Special check for Cthulhu Phase 2: all tentacles manacled and every hero in R'lyeh
    if (gameState.active_monsters.includes("Cthulhu")) {
        const cth_state = gameState.monster_states["Cthulhu"];
        if (cth_state.phase === 2 && cth_state.manacles_placed >= 4 && Object.values(cth_state.player_tracks).every(v => v !== -1)) {
            targetMonster = "Cthulhu";
        }
    }

    if (!targetMonster) {
        alert("You must be at the same location as a monster (and meet its requirements) to Defeat them!");
        return;
    }

    if (targetMonster === "Yeti") {
        openItemPicker({
            title: "Calm the Yeti",
            description: "Discard exactly one Purple, one Green, and one Blue item.",
            items: myState.items.filter(i => ["Purple", "Green", "Blue"].includes(i.color)),
            validateFn: (sel) => {
                const colors = sel.map(i => i.color).sort();
                const valid = sel.length === 3 && JSON.stringify(colors) === JSON.stringify(["Blue", "Green", "Purple"]);
                return { valid, message: `Selected: ${colors.join(", ") || "none"}` };
            },
            onConfirm: (ids) => sendMsg({ action: "defeat", monster: "Yeti", args: { item_ids: ids } })
        });
        return;
    }

    if (targetMonster === "Jiangshi") {
        openItemPicker({
            title: "Dispossess the Jiangshi",
            description: "Discard Purple items totaling 9+ strength.",
            items: myState.items.filter(i => i.color === "Purple"),
            validateFn: (sel) => {
                const total = sel.reduce((a, i) => a + i.strength, 0);
                return { valid: sel.length > 0 && total >= 9, message: `Total strength: ${total} / 9` };
            },
            onConfirm: (ids) => sendMsg({ action: "defeat", monster: "Jiangshi", args: { item_ids: ids } })
        });
        return;
    }

    if (targetMonster === "Sphinx") {
        openItemPicker({
            title: "Outwit the Sphinx",
            description: "Discard Green items totaling 6+ strength.",
            items: myState.items.filter(i => i.color === "Green"),
            validateFn: (sel) => {
                const total = sel.reduce((a, i) => a + i.strength, 0);
                return { valid: sel.length > 0 && total >= 6, message: `Total strength: ${total} / 6` };
            },
            onConfirm: (ids) => sendMsg({ action: "defeat", monster: "Sphinx", args: { item_ids: ids } })
        });
        return;
    }

    if (targetMonster === "Cthulhu") {
        const needed = Math.max(0, Object.keys(gameState.heroes_state).length - 1);
        openItemPicker({
            title: "Seal Cthulhu Away",
            description: `Discard at least ${needed} item(s) gathered from other heroes (via Share).`,
            items: myState.items,
            validateFn: (sel) => ({ valid: sel.length >= needed, message: `Selected: ${sel.length} / ${needed}` }),
            onConfirm: (ids) => sendMsg({ action: "defeat", monster: "Cthulhu", args: { item_ids: ids } })
        });
        return;
    }
});

// Special power action
document.getElementById("action-special").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    if (!myState) return;

    if (myState.hero === "The Guardian") {
        const otherHeroes = [];
        for (const name in gameState.heroes_state) {
            if (name !== playerName && gameState.heroes_state[name].location === myState.location) {
                otherHeroes.push(name);
            }
        }
        const adjacent = gameState.adjacency_list[myState.location] || [];
        
        if (otherHeroes.length === 0) {
            alert("There are no other heroes at your location to Guide.");
            return;
        }
        let html = `<h3>The Guardian: Guide Hero</h3><p>Guide a hero at your location to an adjacent location (0 AP).</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
        html += `<label style="display:block; margin-bottom:8px;">Choose Hero: <select id="guardian-target-hero" style="width:100%; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px; margin-top:4px;">`;
        otherHeroes.forEach(name => {
            html += `<option value="${name}">${name} (${gameState.heroes_state[name].hero})</option>`;
        });
        html += `</select></label>`;
        html += `<label style="display:block; margin-bottom:15px;">Target Location: <select id="guardian-target-loc" style="width:100%; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px; margin-top:4px;">`;
        adjacent.forEach(loc => {
            html += `<option value="${loc}">${loc}</option>`;
        });
        html += `</select></label>`;
        html += `<button class="btn btn-primary" onclick="confirmGuardianGuide()" style="width:100%;">Guide Hero</button>`;
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");

    } else if (myState.hero === "The Investigator") {
        if (myState.items.length < 2) {
            alert("You must have at least 2 items in inventory to discard.");
            return;
        }
        const discList = gameState.discarded_items || [];
        if (discList.length === 0) {
            alert("The discard pile is currently empty! Use Investigator power once some items are discarded.");
            return;
        }
        let html = `<h3>The Investigator: Item Swap</h3><p>Discard 2 items from hand to retrieve 1 item from the discard pile (0 AP).</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
        html += `<h5>1. Select 2 items to discard:</h5>`;
        myState.items.forEach(item => {
            html += `<label style="display:block; margin:6px 0;"><input type="checkbox" class="investigator-discard" value="${item.id}"> ${item.name} (${item.color} ${item.strength})</label>`;
        });
        html += `<h5 style="margin-top:15px;">2. Select 1 item to retrieve:</h5>`;
        html += `<select id="investigator-claim" style="width:100%; margin-bottom:15px; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px;">`;
        discList.forEach(item => {
            html += `<option value="${item.id}">${item.name} (${item.color} ${item.strength})</option>`;
        });
        html += `</select>`;
        html += `<button class="btn btn-primary" onclick="confirmInvestigatorSwap()" style="width:100%;">Perform Swap</button>`;
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");

    } else if (myState.hero === "The Buccaneer") {
        if (myState.items.length === 0) {
            alert("You have no items to discard.");
            return;
        }
        let html = `<h3>The Buccaneer: Discard for Action</h3><p>Discard 1 item from your inventory to gain +4 AP this turn (0 AP).</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
        html += `<select id="buccaneer-discard" style="width:100%; margin-bottom:15px; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px;">`;
        myState.items.forEach(item => {
            html += `<option value="${item.id}">${item.name} (${item.color} ${item.strength})</option>`;
        });
        html += `</select>`;
        html += `<button class="btn btn-primary" onclick="confirmBuccaneerDiscard()" style="width:100%;">Discard Item</button>`;
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");

    } else if (myState.hero === "The Fortune Teller") {
        // Peak card is simple: send directly
        if (confirm("Would you like to use your Fortune Teller ability to peak at the top Monster card? (0 AP)")) {
            sendMsg({ action: "special", args: {} });
        }

    } else if (myState.hero === "The Parapsychologist") {
        if (myState.items.length === 0) {
            alert("You have no items to distribute.");
            return;
        }
        const otherPlayers = [];
        for (const name in gameState.heroes_state) {
            if (name !== playerName) {
                otherPlayers.push(name);
            }
        }
        if (otherPlayers.length === 0) {
            alert("There are no other players in the room to distribute items to.");
            return;
        }
        let html = `<h3>The Parapsychologist: Distribute Item</h3><p>Send an item from your hand to another player anywhere on the map (0 AP).</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
        html += `<label style="display:block; margin-bottom:8px;">Choose Item: <select id="para-item" style="width:100%; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px; margin-top:4px;">`;
        myState.items.forEach(item => {
            html += `<option value="${item.id}">${item.name} (${item.color} ${item.strength})</option>`;
        });
        html += `</select></label>`;
        html += `<label style="display:block; margin-bottom:15px;">Choose Recipient: <select id="para-target" style="width:100%; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px; margin-top:4px;">`;
        otherPlayers.forEach(name => {
            html += `<option value="${name}">${name} (${gameState.heroes_state[name].hero})</option>`;
        });
        html += `</select></label>`;
        html += `<button class="btn btn-primary" onclick="confirmParaDistribute()" style="width:100%;">Send Item</button>`;
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");
    }
});

// Special activation callback hooks
window.confirmGuardianGuide = () => {
    const targetHero = document.getElementById("guardian-target-hero").value;
    const targetLoc = document.getElementById("guardian-target-loc").value;
    sendMsg({ action: "special", args: { target_hero: targetHero, target_location: targetLoc } });
    elModalContainer.classList.add("hidden");
};
window.confirmInvestigatorSwap = () => {
    const checked = Array.from(document.querySelectorAll(".investigator-discard:checked")).map(el => el.value);
    if (checked.length !== 2) {
        alert("You must select exactly 2 items to discard!");
        return;
    }
    const claimId = document.getElementById("investigator-claim").value;
    sendMsg({ action: "special", args: { discard1_id: checked[0], discard2_id: checked[1], claim_id: claimId } });
    elModalContainer.classList.add("hidden");
};
window.confirmBuccaneerDiscard = () => {
    const discardId = document.getElementById("buccaneer-discard").value;
    sendMsg({ action: "special", args: { discard_id: discardId } });
    elModalContainer.classList.add("hidden");
};
window.confirmParaDistribute = () => {
    const itemId = document.getElementById("para-item").value;
    const target = document.getElementById("para-target").value;
    sendMsg({ action: "special", args: { item_id: itemId, target_hero: target } });
    elModalContainer.classList.add("hidden");
};

// End turn
document.getElementById("action-end-turn").addEventListener("click", () => {
    sendMsg({ action: "end_turn" });
});


window.playPerkCard = (perkId, perkName) => {
    // Perk specific arguments
    let args = {};
    if (perkName === "Swiftness") {
        const targetHero = prompt("Enter target hero name to move:");
        if (!targetHero) return;
        const destination = prompt("Enter destination location name:");
        if (!destination) return;
        args = { target_hero: targetHero, destination: destination };
    }

    sendMsg({
        action: "play_perk",
        perk_id: perkId,
        args: args
    });
    elModalContainer.classList.add("hidden");
};

// ---------------------------------------------------------
// MONSTER INTERACTIVE CHALLENGE ADVANCEMENTS
// ---------------------------------------------------------

// Guiding a Yeti Child to the True Cave and placing it on the mat are two separate
// actions - this is the second one (Advance), no items involved.
window.placeYetiChild = (childId) => {
    sendMsg({ action: "advance", monster: "Yeti", args: { type: "place_child", child_id: childId } });
};

window.advanceJiangshi = (slotId) => {
    const myState = gameState.heroes_state[playerName];
    const js_state = gameState.monster_states["Jiangshi"];
    const slot = js_state.sword_slots.find(s => s.id === slotId);
    const matching = myState.items.filter(i => i.strength === slot.target_strength);

    openItemPicker({
        title: `Coin Sword Slot ${slotId + 1}`,
        description: `Discard an item with strength exactly ${slot.target_strength} to fill this slot.`,
        items: matching,
        validateFn: (sel) => ({ valid: sel.length === 1, message: sel.length ? "" : "Select one item." }),
        onConfirm: (ids) => sendMsg({ action: "advance", monster: "Jiangshi", args: { slot_id: slotId, item_id: ids[0] } })
    });
};

window.advanceSphinx = (cellId) => {
    const myState = gameState.heroes_state[playerName];
    openItemPicker({
        title: `Riddle Grid Cell ${cellId + 1}`,
        description: "Place any item into this cell (kept, not discarded).",
        items: myState.items,
        validateFn: (sel) => ({ valid: sel.length === 1, message: sel.length ? "" : "Select one item." }),
        onConfirm: (ids) => sendMsg({ action: "advance", monster: "Sphinx", args: { type: "place", cell_id: cellId, item_id: ids[0] } })
    });
};

window.clearSphinxCell = (cellId) => {
    const myState = gameState.heroes_state[playerName];
    openItemPicker({
        title: "Rearrange the Riddle Grid",
        description: "Discard one of your own items as a cost to remove this cell's item.",
        items: myState.items,
        validateFn: (sel) => ({ valid: sel.length === 1, message: sel.length ? "" : "Select one item to discard." }),
        onConfirm: (ids) => sendMsg({ action: "advance", monster: "Sphinx", args: { type: "clear", cell_id: cellId, cost_item_id: ids[0] } })
    });
};

window.advanceCthulhuDial = (color) => {
    const myState = gameState.heroes_state[playerName];
    const cth_state = gameState.monster_states["Cthulhu"];
    const dial = cth_state.dials.find(d => d.color === color);
    const remaining = dial.target - dial.progress;
    const matching = myState.items.filter(i => i.color === color && i.strength <= remaining);

    openItemPicker({
        title: `Rotate the ${color} Dial`,
        description: `Progress ${dial.progress}/${dial.target}. Discard a ${color} item (strength up to ${remaining}) to rotate it.`,
        items: matching,
        validateFn: (sel) => ({ valid: sel.length === 1, message: sel.length ? "" : "Select one item." }),
        onConfirm: (ids) => sendMsg({ action: "advance", monster: "Cthulhu", args: { type: "dial", color: color, item_id: ids[0] } })
    });
};

window.lureCthulhu = () => {
    const myState = gameState.heroes_state[playerName];
    openItemPicker({
        title: "Lure Cthulhu to the Void",
        description: "Discard a Green item to move Cthulhu towards the Void, up to that item's strength in steps.",
        items: myState.items.filter(i => i.color === "Green"),
        validateFn: (sel) => ({ valid: sel.length === 1, message: sel.length ? "" : "Select one Green item." }),
        onConfirm: (ids) => sendMsg({ action: "advance", monster: "Cthulhu", args: { type: "lure", item_id: ids[0] } })
    });
};

window.bindCthulhuTentacle = (color) => {
    const myState = gameState.heroes_state[playerName];
    openItemPicker({
        title: `Bind Towards ${color}`,
        description: "Discard a matching-color item to progress this tentacle binding.",
        items: myState.items.filter(i => i.color === color),
        validateFn: (sel) => ({ valid: sel.length === 1, message: sel.length ? "" : "Select one item." }),
        onConfirm: (ids) => sendMsg({ action: "advance", monster: "Cthulhu", args: { color: color, item_id: ids[0] } })
    });
};


// Press \'D\' to toggle hitbox debug mode (drag location nodes or terror-slot
// placeholders into position). Ignored while typing in a text field.
document.addEventListener("keydown", (e) => {
    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

    if (e.key.toLowerCase() === "d") {
        elGameMap.classList.toggle("debug-hitboxes");
        
        console.log("Hitbox debug mode toggled.");
    }
});

// Drag and drop tracking for coordinate calibration
document.addEventListener("mousemove", (e) => {
    if (!dragLocName) return;
    window.isDragging = true;

    const rect = elGameMap.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Scale client coordinate to SVG viewBox space using inverse CTM (respects zoom/pan)
    const pt = elGameMap.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(elGameMap.getScreenCTM().inverse());
    const svgX = Math.round(svgPt.x);
    const svgY = Math.round(svgPt.y);

    // Clamp coordinates inside the SVG viewport
    const clampedX = Math.max(0, Math.min(1304, svgX));
    const clampedY = Math.max(0, Math.min(1206, svgY));

    if (dragType === "circle") {
        gameState.node_coordinates[dragLocName].x = clampedX;
        gameState.node_coordinates[dragLocName].y = clampedY;
    } else if (dragType === "rect") {
        gameState.node_coordinates[dragLocName].bx = clampedX;
        gameState.node_coordinates[dragLocName].by = clampedY;
    } else if (dragType === "terror") {
        if (!gameState.terror_track_coordinates) {
            gameState.terror_track_coordinates = [];
        }
        if (!gameState.terror_track_coordinates[dragLocName]) {
            gameState.terror_track_coordinates[dragLocName] = {x: 0, y: 0, r: 28};
        }
        gameState.terror_track_coordinates[dragLocName].x = clampedX;
        gameState.terror_track_coordinates[dragLocName].y = clampedY;
    }

    renderSVGMap(); // Redraw everything in real-time!
});

document.addEventListener("mouseup", () => {
    if (dragLocName) {
        // Send updated coordinates to the server
        sendMsg({
            action: "update_coordinates",
            coordinates: gameState.node_coordinates,
            terror_coordinates: gameState.terror_track_coordinates,
        adjacency: gameState.adjacency_list
        });

        console.log(`Saved coordinates for ${dragLocName}`);

        // Wait a split second to clear window.isDragging to block trailing click events
        setTimeout(() => {
            window.isDragging = false;
            dragType = null;
            dragLocName = null;
        }, 50);
    }
});

// ---- Zoom and Pan Controls for Game Board Map ----
function updateMapViewBox() {
    if (!elGameMap) return;
    const w = baseWidth / zoomLevel;
    const h = baseHeight / zoomLevel;
    
    // Clamp panning values
    const minX = -baseWidth * 0.4;
    const maxX = baseWidth * 1.4 - w;
    const minY = -baseHeight * 0.4;
    const maxY = baseHeight * 1.4 - h;
    
    panX = Math.max(minX, Math.min(maxX, panX));
    panY = Math.max(minY, Math.min(maxY, panY));
    
    elGameMap.setAttribute("viewBox", `${panX} ${panY} ${w} ${h}`);
}

let isPanningMap = false;
let startPanMouseX = 0;
let startPanMouseY = 0;
let startPanX = 0;
let startPanY = 0;

const initMapZoomPan = () => {
    const boardContainer = document.querySelector(".board-container");
    if (!boardContainer) return;
    
    // Zoom with mouse wheel
    boardContainer.addEventListener("wheel", (e) => {
        if (!elGameMap || elGameMap.classList.contains("debug-hitboxes")) return;
        e.preventDefault();
        
        const zoomFactor = 1.15;
        const oldZoom = zoomLevel;
        if (e.deltaY < 0) {
            zoomLevel = Math.min(5.0, zoomLevel * zoomFactor);
        } else {
            zoomLevel = Math.max(1.0, zoomLevel / zoomFactor);
        }
        
        if (zoomLevel === 1.0) {
            panX = 0;
            panY = 0;
        } else {
            const rect = elGameMap.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const svgMouseX = panX + (mouseX / rect.width) * (baseWidth / oldZoom);
            const svgMouseY = panY + (mouseY / rect.height) * (baseHeight / oldZoom);
            
            panX = svgMouseX - (mouseX / rect.width) * (baseWidth / zoomLevel);
            panY = svgMouseY - (mouseY / rect.height) * (baseHeight / zoomLevel);
        }
        
        updateMapViewBox();
    }, { passive: false });

    // Drag to Pan
    boardContainer.addEventListener("mousedown", (e) => {
        if (!elGameMap || elGameMap.classList.contains("debug-hitboxes")) return;
        
        const isBackground = e.target.tagName === "svg" || e.target.tagName === "image";
        if (e.button === 1 || e.button === 2 || (e.button === 0 && isBackground)) {
            isPanningMap = true;
            startPanMouseX = e.clientX;
            startPanMouseY = e.clientY;
            startPanX = panX;
            startPanY = panY;
            
            if (e.button === 2) {
                e.preventDefault();
            }
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isPanningMap || !elGameMap) return;
        
        const rect = elGameMap.getBoundingClientRect();
        const dx = e.clientX - startPanMouseX;
        const dy = e.clientY - startPanMouseY;
        
        const scaleX = (baseWidth / zoomLevel) / rect.width;
        const scaleY = (baseHeight / zoomLevel) / rect.height;
        
        panX = startPanX - dx * scaleX;
        panY = startPanY - dy * scaleY;
        
        updateMapViewBox();
    });

    window.addEventListener("mouseup", () => {
        isPanningMap = false;
    });

    boardContainer.addEventListener("contextmenu", (e) => {
        if (!elGameMap || !elGameMap.classList.contains("debug-hitboxes")) {
            e.preventDefault();
        }
    });
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMapZoomPan);
} else {
    initMapZoomPan();
}
