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
let chosenHero = "The Guardian";
let dragType = null;
let dragLocName = null;

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

// Action point display
const elApDisplay = document.getElementById("action-points-left");

// ---------------------------------------------------------
// INITIALIZE EVENTS
// ---------------------------------------------------------

elBtnCreate.addEventListener("click", () => {
    setupConnection(true);
});

elBtnJoin.addEventListener("click", () => {
    setupConnection(false);
});

elBtnStart.addEventListener("click", () => {
    // Collect chosen monsters
    const monsters = [];
    if (document.getElementById("mon-yeti").checked) monsters.push("Yeti");
    if (document.getElementById("mon-jiangshi").checked) monsters.push("Jiangshi");
    if (document.getElementById("mon-sphinx").checked) monsters.push("Sphinx");
    if (document.getElementById("mon-cthulhu").checked) monsters.push("Cthulhu");
    
    if (monsters.length === 0) {
        alert("Please select at least one monster to face!");
        return;
    }
    
    sendMsg({
        action: "start_game",
        monsters: monsters
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
});

// Volume Slider Event Listener
document.getElementById("bg-music-volume").addEventListener("input", updateMusicVolume);

// ---------------------------------------------------------
// REAL-TIME WEBSOCKET MANAGEMENT
// ---------------------------------------------------------

function setupConnection(isHost) {
    playerName = elPlayerNameInput.value.trim();
    if (!playerName) {
        alert("Please enter your name!");
        return;
    }

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
        elWaitingView.classList.remove("hidden");
        elDisplayRoomCode.innerText = roomCode;
        renderHeroSelectOptions();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "state") {
            gameState = data.state;
            if (gameState.game_phase !== "MonsterPhase") {
                hasDrawnThisPhase = false;
            }
            detectAndAnimateSpawns();
            updateGameUI();
        }
    };

    socket.onerror = (err) => {
        console.error("Socket error: ", err);
    };

    socket.onclose = () => {
        alert("Disconnected from server. Reconnecting...");
    };
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

    HEROES_LIST.forEach(hero => {
        const data = heroData[hero];
        const card = document.createElement("div");
        card.className = `hero-card ${chosenHero === hero ? "selected" : ""}`;

        card.innerHTML = `
            <div class="hero-card-portrait">
                <img src="/Images/Heroes/${hero}.svg" alt="${hero}">
            </div>
            <div class="hero-card-name">${hero}</div>
            <div class="hero-card-ap">${data.ap} AP</div>
            <div class="hero-card-loc">&#128205; ${data.start}</div>
            <div class="hero-card-ability">${data.ability}</div>
        `;

        card.addEventListener("click", () => {
            chosenHero = hero;
            document.querySelectorAll(".hero-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            sendMsg({ action: "select_hero", hero: hero });
        });
        elHeroOptions.appendChild(card);
    });
}

// ---------------------------------------------------------
// GAME UI SYNC AND RENDER ENGINE
// ---------------------------------------------------------

function updateGameUI() {
    if (!gameState) return;

    if (!gameState.game_started) {
        // We are in Lobby Waiting view
        elLobbyScreen.classList.remove("hidden");
        elGameScreen.classList.add("hidden");

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

        // Toggle host setting view
        const me = gameState.players.find(p => p.name === playerName);
        if (me && me.is_host) {
            elHostSettings.classList.remove("hidden");
            elHostStartWrap.classList.remove("hidden");
        } else {
            elHostSettings.classList.add("hidden");
            elHostStartWrap.classList.add("hidden");
        }
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

        // Card Deck counters and states
        const elHudDeckCount = document.getElementById("hud-deck-count");
        if (elHudDeckCount) {
            elHudDeckCount.innerText = gameState.deck_count;
        }

        const elMonsterStack = document.querySelector(".monsters-stack");
        if (elMonsterStack) {
            if (gameState.deck_count === 0) {
                elMonsterStack.style.opacity = "0.3";
                elMonsterStack.style.pointerEvents = "none";
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

        // Render Sidebar lists (Inventory)
        renderPlayerPanel();

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

function renderPlayerPanel() {
    const myState = gameState.heroes_state[playerName];
    if (!myState) return;

    document.getElementById("player-panel-title").innerText = myState.hero;

    const portrait = document.getElementById("hero-tab-portrait");
    if (portrait) {
        portrait.src = `/Images/Heroes/${myState.hero}.svg`;
        portrait.alt = myState.hero;
    }
    
    let abilityDesc = "";
    if (myState.hero === "The Guardian") abilityDesc = "Guide: Move a hero at your location to adjacent (0 AP).";
    else if (myState.hero === "The Investigator") abilityDesc = "Special: Discard 2 items to take 1 from Discard Pile (0 AP).";
    else if (myState.hero === "The Buccaneer") abilityDesc = "Special: Discard 1 item at turn start to gain +4 AP (0 AP).";
    else if (myState.hero === "The Fortune Teller") abilityDesc = "Special: Peak at the top Monster card (0 AP).";
    else if (myState.hero === "The Parapsychologist") abilityDesc = "Special: Send items in hand to players anywhere (0 AP).";

    document.getElementById("player-ability").innerText = abilityDesc;

    const elInv = document.getElementById("player-inventory");
    elInv.innerHTML = "";
    
    if (myState.items.length === 0 && myState.perks.length === 0) {
        elInv.innerHTML = `<p style="font-size: 0.8rem; color: #a491c3; text-align: center;">Empty Inventory</p>`;
    } else {
        myState.items.forEach(item => {
            const row = document.createElement("div");
            row.className = `item-row ${item.color.toLowerCase()}`;
            row.innerHTML = `
                <span>${item.name}</span>
                <span class="item-val">${item.color} ${item.strength}</span>
            `;
            elInv.appendChild(row);
        });
        
        myState.perks.forEach(perk => {
            const row = document.createElement("div");
            row.className = `item-row perk-row`;
            row.style.cssText = "background: rgba(153, 51, 255, 0.15); border-left: 3px solid #9933ff; flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px;";
            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <strong style="color: #ffd533; font-size: 0.85rem; letter-spacing: 0.5px;">${perk.name}</strong>
                    <button class="btn-hud" style="font-size: 0.7rem; padding: 3px 8px; cursor: pointer;" onclick="playPerkCard('${perk.id}', '${perk.name}')">Play</button>
                </div>
                <div style="font-size: 0.75rem; color: #e0d0ff; line-height: 1.3;">${perk.text}</div>
            `;
            elInv.appendChild(row);
        });
    }
}

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
    const activationLines = Object.entries(card.activations)
        .map(([name, info]) => {
            const moves = Array.isArray(info) ? info[0] : info;
            const dice  = Array.isArray(info) ? info[1] : info;
            return `<span class="mp-activation">${name}: ${moves} move${moves !== 1 ? "s" : ""}, ${dice} die</span>`;
        }).join("");
    return `
        <div class="mp-flip-container">
            <div class="mp-card-inner${alreadyFlipped ? " flipped" : ""}" id="mp-card-inner">
                <div class="mp-card-back">
                    <img src="/Images/Monster_Card.png" alt="Monster Card">
                </div>
                <div class="mp-card-face">
                    <div class="mp-card-title">${card.name}</div>
                    <div class="mp-card-event">
                        <span class="mp-event-title">${card.event_title}</span>
                        <span class="mp-event-text">${card.event_text}</span>
                    </div>
                    <div class="mp-card-footer">
                        <span class="mp-spawn">&#9733; Spawns ${card.spawn}</span>
                        <div class="mp-activations">${activationLines}</div>
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

    if (gameState.active_monsters.length === 0) {
        elMonContainer.innerHTML = `<p style="font-size: 0.8rem; color: #ffd533; text-align: center;">All monsters defeated! Deal the final blow.</p>`;
        return;
    }

    const monsterPortraits = {
        "Yeti":     "/Images/Monsters/Yeti.png",
        "Sphinx":   "/Images/Monsters/Sphinx.png",
        "Jiangshi": "/Images/Monsters/Jiangshi.svg",
        "Cthulhu":  "/Images/Monsters/Cthulhu.svg"
    };
    const monsterAccents = {
        "Yeti":     { border: "rgba(51,204,255,0.6)",  glow: "rgba(51,204,255,0.3)"  },
        "Sphinx":   { border: "rgba(255,204,0,0.6)",   glow: "rgba(255,204,0,0.3)"   },
        "Jiangshi": { border: "rgba(255,51,102,0.6)",  glow: "rgba(255,51,102,0.3)"  },
        "Cthulhu":  { border: "rgba(153,51,255,0.6)",  glow: "rgba(153,51,255,0.3)"  }
    };

    gameState.active_monsters.forEach(m => {
        const card = document.createElement("div");
        card.className = "monster-status-card";

        const loc = (gameState.monster_locations && gameState.monster_locations[m]) || "Unknown";
        const portrait = monsterPortraits[m] || "";
        const accent = monsterAccents[m] || monsterAccents["Jiangshi"];

        let details = `
            <div class="monster-card-header">
                <div class="monster-card-portrait" style="border-color:${accent.border}; box-shadow: 0 0 9px ${accent.glow};">
                    ${portrait ? `<img src="${portrait}" alt="${m}">` : ""}
                </div>
                <div class="monster-card-info">
                    <h5>${m}</h5>
                    <div class="monster-card-loc">&#128205; ${loc}</div>
                </div>
            </div>
        `;
        
        if (m === "Yeti") {
            const y_state = gameState.monster_states["Yeti"];
            const kids_left = y_state.children.filter(c => !c.rescued).length;
            const found_lair = y_state.lairs.find(l => l.is_true && l.flipped);
            
            details += `
                <p style="font-size: 0.8rem; color: #b0a0cf;">Children Lost: <strong>${kids_left}</strong></p>
                <p style="font-size: 0.8rem; color: #b0a0cf;">True Lair: <strong>${found_lair ? found_lair.location : "Hidden"}</strong></p>
                <div class="monster-puzzle-grid">
            `;
            y_state.lairs.forEach((lair, i) => {
                details += `
                    <div class="puzzle-slot ${lair.flipped ? 'filled' : ''}" style="font-size: 0.7rem;">
                        ${lair.flipped ? (lair.is_true ? 'TRUE' : 'DECOY') : `Lair ${i+1}`}
                    </div>
                `;
            });
            details += `</div>`;
            
        } else if (m === "Jiangshi") {
            const js_state = gameState.monster_states["Jiangshi"];
            details += `
                <p style="font-size: 0.8rem; color: #b0a0cf;">Complete the 3-part sword puzzle to seal Jiangshi.</p>
                <div class="monster-puzzle-grid">
            `;
            js_state.slots.forEach(slot => {
                const reqClass = `req-${slot.color.toLowerCase()}`;
                details += `
                    <div class="puzzle-slot ${reqClass} ${slot.filled ? 'filled' : ''}" onclick="advanceJiangshi(${slot.id})">
                        ${slot.filled ? `Sealed (${slot.item.strength})` : `${slot.color} ${slot.req_strength}+`}
                    </div>
                `;
            });
            details += `</div>`;
            
        } else if (m === "Sphinx") {
            const sp_state = gameState.monster_states["Sphinx"];
            const current_sum = sp_state.slots.reduce((acc, slot) => acc + (slot.filled ? slot.item.strength : 0), 0);
            details += `
                <p style="font-size: 0.8rem; color: #b0a0cf;">Fill slots with Blue items to sum exactly 10 (Current: <strong>${current_sum}</strong>)</p>
                <div class="monster-puzzle-grid">
            `;
            sp_state.slots.forEach(slot => {
                details += `
                    <div class="puzzle-slot req-blue ${slot.filled ? 'filled' : ''}" onclick="advanceSphinx(${slot.id})">
                        ${slot.filled ? `${slot.item.strength}` : `Empty`}
                    </div>
                `;
            });
            details += `</div>`;
            
        } else if (m === "Cthulhu") {
            const cth_state = gameState.monster_states["Cthulhu"];
            if (cth_state.phase === 1) {
                details += `
                    <p style="font-size: 0.8rem; color: #b0a0cf;">Phase 1: Break 4 runes at The Void.</p>
                    <div class="monster-puzzle-grid">
                `;
                cth_state.runes.forEach(rune => {
                    const reqClass = rune.color !== "Any" ? `req-${rune.color.toLowerCase()}` : '';
                    details += `
                        <div class="puzzle-slot ${reqClass} ${rune.broken ? 'filled' : ''}" onclick="advanceCthulhuRune(${rune.id})">
                            ${rune.broken ? 'Broken' : `${rune.color} ${rune.req_strength}+`}
                        </div>
                    `;
                });
                details += `</div>`;
            } else {
                const trackPos = cth_state.player_tracks[playerName] ?? -1;
                const nextStepName = cth_state.corpse_city_track[trackPos + 1] ?? "Heart reached!";
                details += `
                    <p style="font-size: 0.8rem; color: #ffd533;">Phase 2: Traverse Corpse City!</p>
                    <p style="font-size: 0.8rem; color: #b0a0cf;">My step: <strong>${trackPos === -1 ? "Main Board" : cth_state.corpse_city_track[trackPos]}</strong></p>
                    ${trackPos < 3 ? `<button class="btn btn-secondary btn-small" onclick="advanceCthulhuTrack()" style="width:100%; margin-top:5px; font-size:0.75rem;">Advance to ${nextStepName}</button>` : ''}
                `;
            }
        }

        card.innerHTML = details;
        elMonContainer.appendChild(card);
    });
}

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
    const invPanel = document.getElementById("player-inventory") || document.getElementById("sec-player");
    if (!invPanel) return;
    const screenEnd = invPanel.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.className = "flying-item-token";
    
    const colorMap = {
        blue: "#33ccff",
        red: "#ff3366",
        yellow: "#ffd533"
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
    }, { once: true });
}

function triggerNodePulse(locName, pulseColor) {
    const coord = gameState.node_coordinates[locName];
    if (!coord) return;
    
    const pulseCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pulseCircle.setAttribute("cx", coord.x);
    pulseCircle.setAttribute("cy", coord.y);
    pulseCircle.setAttribute("r", coord.r || 35);
    pulseCircle.setAttribute("fill", "none");
    pulseCircle.setAttribute("stroke", pulseColor);
    pulseCircle.setAttribute("stroke-width", "4");
    pulseCircle.setAttribute("opacity", "0.9");
    
    const animR = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    animR.setAttribute("attributeName", "r");
    animR.setAttribute("from", coord.r || 35);
    animR.setAttribute("to", (coord.r || 35) + 40);
    animR.setAttribute("dur", "0.8s");
    animR.setAttribute("fill", "freeze");
    pulseCircle.appendChild(animR);

    const animOp = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    animOp.setAttribute("attributeName", "opacity");
    animOp.setAttribute("from", "0.9");
    animOp.setAttribute("to", "0");
    animOp.setAttribute("dur", "0.8s");
    animOp.setAttribute("fill", "freeze");
    pulseCircle.appendChild(animOp);
    
    if (elGameMap) {
        elGameMap.appendChild(pulseCircle);
        setTimeout(() => {
            pulseCircle.remove();
        }, 850);
    }
}

function animateItemSpawn(item, locName) {
    const coord = gameState.node_coordinates[locName];
    if (!coord) return;
    
    const screenEnd = getScreenCoordsOfSVGPoint(coord.x, coord.y);
    const cardPanel = document.getElementById("sec-monster-phase");
    if (!cardPanel) return;
    const screenStart = cardPanel.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.className = "flying-item-token";
    
    const colorMap = {
        blue: "#33ccff",
        red: "#ff3366",
        yellow: "#ffd533"
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
        triggerNodePulse(locName, circleColor);
        fly.remove();
    }, { once: true });
}

function detectAndAnimateSpawns() {
    if (!gameState || !gameState.items_on_board) return;
    
    if (!window.knownItemIds) {
        window.knownItemIds = new Set();
        for (const loc in gameState.items_on_board) {
            gameState.items_on_board[loc].forEach(item => window.knownItemIds.add(item.id));
        }
        for (const name in gameState.heroes_state) {
            gameState.heroes_state[name].items.forEach(item => window.knownItemIds.add(item.id));
        }
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
}

function renderSVGMap() {
    // Force the SVG viewBox to match the coordinate system of the new Map.png (1304x1206)
    elGameMap.setAttribute("viewBox", "0 0 1304 1206");

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
        imgHero.setAttribute("href", `/Images/Heroes/${heroClass}.svg`);
        imgHero.setAttribute("x", "0");
        imgHero.setAttribute("y", "0");
        imgHero.setAttribute("height", "1");
        imgHero.setAttribute("width", "1");
        imgHero.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patHero.appendChild(imgHero);
        defs.appendChild(patHero);
    });

    // Create image patterns for citizens
    const citizenNames = ["Delilah", "Mayor Finch", "Professor Higgins", "The Blacksmith", "The Drunkard"];
    citizenNames.forEach(citName => {
        const patCit = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patCit.setAttribute("id", `pattern-citizen-${citName.replaceAll(" ", "_")}`);
        patCit.setAttribute("x", "0");
        patCit.setAttribute("y", "0");
        patCit.setAttribute("height", "1");
        patCit.setAttribute("width", "1");
        patCit.setAttribute("patternContentUnits", "objectBoundingBox");
        const imgCit = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imgCit.setAttribute("href", `/Images/Citizens/${citName}.svg`);
        imgCit.setAttribute("x", "0");
        imgCit.setAttribute("y", "0");
        imgCit.setAttribute("height", "1");
        imgCit.setAttribute("width", "1");
        imgCit.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patCit.appendChild(imgCit);
        defs.appendChild(patCit);
    });

    elGameMap.appendChild(defs);

    // Create Background Map Image programmatically (namespace-safe)
    const bgImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
    bgImage.setAttribute("href", "/Images/Map.png?v=2");
    bgImage.setAttribute("x", "0");
    bgImage.setAttribute("y", "0");
    bgImage.setAttribute("width", "1304");
    bgImage.setAttribute("height", "1206");
    elGameMap.appendChild(bgImage);

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

    // 2. Draw nodes (circles)
    for (const locName in coordinates) {
        const coord = coordinates[locName];
        
        // Highlight destinations if we are in MOVE mode
        const myState = gameState.heroes_state[playerName];
        const isTurn = (gameState.players[gameState.turn_player_idx].name === playerName);
        const adjacent = myState ? adjList[myState.location] : [];
        const isMoveTarget = (selectedAction === "move") && isTurn && (adjacent.includes(locName) || (myState.hero === "Explorer" && isDoubleJump(myState.location, locName)));

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
        circle.setAttribute("class", `map-node ${isMoveTarget ? "active-dest" : ""}`);
        
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
            rect.setAttribute("class", `map-node ${isMoveTarget ? "active-dest" : ""}`);
            
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
            itemCircle.setAttribute("cx", coord.x + offset.x);
            itemCircle.setAttribute("cy", coord.y + offset.y);
            itemCircle.setAttribute("r", 10);
            itemCircle.setAttribute("class", `token-item ${item.color.toLowerCase()}`);
            itemG.appendChild(itemCircle);

            const itemVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
            itemVal.setAttribute("x", coord.x + offset.x);
            itemVal.setAttribute("y", coord.y + offset.y + 3);
            itemVal.setAttribute("text-anchor", "middle");
            itemVal.setAttribute("class", "token-label");
            itemVal.textContent = item.strength;
            itemG.appendChild(itemVal);

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
            if (gameState.monster_locations[monName] === locName) {
                characters.push({ type: "monster", name: monName, label: monName.charAt(0) });
            }
        }

        // Citizens
        for (const citName in gameState.citizens) {
            const cit = gameState.citizens[citName];
            if (cit.active && cit.location === locName) {
                characters.push({ type: "citizen", name: citName, label: "C", safe: cit.safe });
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

        characters.forEach((char, index) => {
            const isYeti = (char.name === "Yeti");
            const isSphinx = (char.name === "Sphinx");
            const isYetiChild = char.name.startsWith("Yeti Child");
            const childId = isYetiChild ? char.name.replace("Yeti Child ", "") : null;
            const isCustomMonster = isYeti || isSphinx;
            const isHero = (char.type === "hero");
            const isCitizen = (char.type === "citizen") && !isYetiChild;
            let charR;
            if (isCustomMonster) charR = 35;
            else if (isYetiChild) charR = 18;
            else if (isHero) charR = 24;
            else if (isCitizen) charR = 18;
            else charR = 14;

            const offset = getCharOffset(index, characters.length, coord.r || 35);
            const charG = document.createElementNS("http://www.w3.org/2000/svg", "g");

            const charKey = `${char.type}-${char.name}`;
            const targetX = coord.x + offset.x;
            const targetY = coord.y + offset.y;

            const charCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            charCircle.setAttribute("r", charR);
            
            const lastPos = lastCharacterPositions[charKey];
            if (lastPos && (lastPos.x !== targetX || lastPos.y !== targetY)) {
                charCircle.setAttribute("cx", lastPos.x);
                charCircle.setAttribute("cy", lastPos.y);

                setTimeout(() => {
                    charCircle.setAttribute("cx", targetX);
                    charCircle.setAttribute("cy", targetY);
                }, 20);

                // Draw glowing motion trail
                drawMovementTrail(lastPos.x, lastPos.y, targetX, targetY);
            } else {
                charCircle.setAttribute("cx", targetX);
                charCircle.setAttribute("cy", targetY);
            }

            lastCharacterPositions[charKey] = { x: targetX, y: targetY };
            
            if (isYeti) {
                charCircle.setAttribute("class", "yeti-token");
                charCircle.setAttribute("fill", "url(#pattern-yeti)");
                charCircle.setAttribute("stroke", "#ff3366"); // Bold neon crimson border
                charCircle.setAttribute("stroke-width", "2.5");
                charCircle.setAttribute("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isSphinx) {
                charCircle.setAttribute("class", "sphinx-token");
                charCircle.setAttribute("fill", "url(#pattern-sphinx)");
                charCircle.setAttribute("stroke", "#ffcc00"); // Golden border
                charCircle.setAttribute("stroke-width", "2.5");
                charCircle.setAttribute("filter", "drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isYetiChild) {
                charCircle.setAttribute("class", "yeti-child-token");
                charCircle.setAttribute("fill", `url(#pattern-yeti-child-${childId})`);
                charCircle.setAttribute("stroke", "#33ccff"); // Ice blue border
                charCircle.setAttribute("stroke-width", "2");
                charCircle.setAttribute("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.4))");
            } else if (isHero) {
                const patId = `pattern-hero-${char.heroClass.replaceAll(" ", "_")}`;
                const isMe = (char.name === playerName);
                const isActiveTurn = (gameState.players[gameState.turn_player_idx].name === char.name);
                charCircle.setAttribute("class", "hero-token");
                charCircle.setAttribute("fill", `url(#${patId})`);
                charCircle.setAttribute("stroke", (isMe || isActiveTurn) ? "#ffd533" : "#33ccff");
                charCircle.setAttribute("stroke-width", (isMe || isActiveTurn) ? "3.5" : "2.5");
                charCircle.setAttribute("filter", `drop-shadow(0 0 ${(isMe || isActiveTurn) ? 12 : 6}px ${(isMe || isActiveTurn) ? "rgba(255,213,51,0.9)" : "rgba(51,204,255,0.7)"})`);
            } else if (isCitizen) {
                const patId = `pattern-citizen-${char.name.replaceAll(" ", "_")}`;
                charCircle.setAttribute("class", "citizen-token");
                charCircle.setAttribute("fill", `url(#${patId})`);
                charCircle.setAttribute("stroke", "#20e889");
                charCircle.setAttribute("stroke-width", "2.5");
                charCircle.setAttribute("filter", "drop-shadow(0 0 7px rgba(32,232,137,0.7))");
                charCircle.style.cursor = "pointer";
                charCircle.addEventListener("click", (e) => {
                    e.stopPropagation();
                    showCitizenInfo(char.name, char.safe);
                });
            } else {
                // Remaining monsters without portrait images (Jiangshi, Cthulhu)
                charCircle.setAttribute("class", `token-character char-${char.type}`);
            }
            charG.appendChild(charCircle);

            // Render text label only for monsters without portrait images
            if (!isCustomMonster && !isYetiChild && !isHero && !isCitizen) {
                const charVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
                charVal.setAttribute("text-anchor", "middle");
                charVal.setAttribute("fill", "#000");
                charVal.setAttribute("font-size", "10px");
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
    // Orbit around node center outside transparent hitbox
    const radius = nodeRadius - 7;
    const angle = (index * 60) * (Math.PI / 180);
    return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
    };
}

function getCharOffset(index, total, nodeRadius = 35) {
    // Arrange in center or slightly offset
    if (total === 1) return { x: 0, y: 0 };
    const radius = nodeRadius * 0.43;
    const angle = (index * (360 / total)) * (Math.PI / 180);
    return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
    };
}

// ---------------------------------------------------------
// NODE INFORMATION MODAL
// ---------------------------------------------------------

function showNodeInfo(locName) {
    const coord = gameState.node_coordinates[locName];
    const items = gameState.items_on_board[locName] || [];
    
    let html = `<h3>${locName}</h3><hr style="border-color: rgba(255,255,255,0.05); margin: 10px 0;">`;
    
    if (items.length > 0) {
        html += `<p style="margin-bottom:8px;"><strong>Items at this location:</strong></p><ul style="list-style:none; padding-left:0;">`;
        items.forEach(item => {
            html += `<li style="padding: 6px; margin-bottom: 4px; border-radius: 4px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02)">
                ${item.name} (${item.color} ${item.strength})
            </li>`;
        });
        html += `</ul>`;
    } else {
        html += `<p>No items here.</p>`;
    }

    // Citizens / Monsters present
    const chars = [];
    for (const pName in gameState.heroes_state) {
        if (gameState.heroes_state[pName].location === locName) chars.push(`${pName} (${gameState.heroes_state[pName].hero})`);
    }
    for (const mName in gameState.monster_locations) {
        if (gameState.monster_locations[mName] === locName) chars.push(`<strong>${mName}</strong> (Monster)`);
    }
    for (const citName in gameState.citizens) {
        const cit = gameState.citizens[citName];
        if (cit.active && cit.location === locName) chars.push(`${citName} (Citizen, heading to ${cit.safe})`);
    }

    if (chars.length > 0) {
        html += `<p style="margin-top:12px;"><strong>Characters present:</strong></p><ul>`;
        chars.forEach(c => html += `<li>${c}</li>`);
        html += `</ul>`;
    }

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
}

function showCitizenInfo(citName, safeHaven) {
    elModalBody.innerHTML = `
        <div style="text-align: center; padding: 10px;">
            <h3 style="color: #ffd533; font-size: 1.5rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px;">${citName}</h3>
            <img src="/Images/Citizens/${citName}.svg" style="width: 120px; height: 120px; margin-bottom: 15px; filter: drop-shadow(0 0 10px rgba(32,232,137,0.7)); border-radius: 50%; border: 3px solid #20e889; object-fit: cover; background: rgba(255,255,255,0.05);">
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

// Guide action trigger
document.getElementById("action-guide").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    if (!myState) return;
    
    const currentLoc = myState.location;
    const adjacent = gameState.adjacency_list[currentLoc] || [];
    
    const eligibleLegends = [];
    
    // Check standard citizens/legends
    for (const name in gameState.citizens) {
        const cit = gameState.citizens[name];
        if (cit.active && (cit.location === currentLoc || adjacent.includes(cit.location))) {
            eligibleLegends.push({ name: name, loc: cit.location, type: 'citizen' });
        }
    }
    
    // Check Yeti children (legends)
    if (gameState.active_monsters.includes("Yeti") && gameState.monster_states["Yeti"]) {
        const y_state = gameState.monster_states["Yeti"];
        y_state.children.forEach(child => {
            if (!child.rescued && (child.location === currentLoc || adjacent.includes(child.location))) {
                eligibleLegends.push({ name: `Yeti Child ${child.id}`, loc: child.location, type: 'child' });
            }
        });
    }
    
    if (eligibleLegends.length === 0) {
        alert("There are no active Legends (citizens or Yeti children) at or adjacent to your location to guide.");
        return;
    }
    
    let html = `<h3>Guide Legend</h3><p>Choose a legend to guide to/from an adjacent location (1 AP)</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
    html += `<label style="display:block; margin-bottom:12px;">Choose Legend: <select id="guide-select-legend" style="width:100%; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px; margin-top:4px;" onchange="updateGuideTargetOptions()"></select></label>`;
    html += `<label style="display:block; margin-bottom:15px;">Target Location: <select id="guide-target-loc" style="width:100%; background:#1b152d; color:#fff; border:1px solid #4a3b70; padding:6px; border-radius:4px; margin-top:4px;"></select></label>`;
    html += `<button class="btn btn-primary" onclick="confirmGuideAction()" style="width:100%;">Guide Legend</button>`;
    
    elModalBody.innerHTML = html;
    
    const selLegend = document.getElementById("guide-select-legend");
    eligibleLegends.forEach((leg, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = `${leg.name} (at ${leg.loc})`;
        selLegend.appendChild(opt);
    });
    
    window.guideData = {
        legends: eligibleLegends,
        currentLoc: currentLoc,
        adjacent: adjacent
    };
    
    window.updateGuideTargetOptions = () => {
        const idx = document.getElementById("guide-select-legend").value;
        const leg = window.guideData.legends[idx];
        const selTarget = document.getElementById("guide-target-loc");
        selTarget.innerHTML = "";
        
        if (leg.loc === window.guideData.currentLoc) {
            window.guideData.adjacent.forEach(loc => {
                const opt = document.createElement("option");
                opt.value = loc;
                opt.textContent = loc;
                selTarget.appendChild(opt);
            });
        } else {
            const opt = document.createElement("option");
            opt.value = window.guideData.currentLoc;
            opt.textContent = window.guideData.currentLoc;
            selTarget.appendChild(opt);
        }
    };
    
    window.updateGuideTargetOptions();
    elModalContainer.classList.remove("hidden");
});

window.confirmGuideAction = () => {
    const idx = document.getElementById("guide-select-legend").value;
    const leg = window.guideData.legends[idx];
    const targetLoc = document.getElementById("guide-target-loc").value;
    
    sendMsg({
        action: "guide",
        legend: leg.name,
        target: targetLoc
    });
    
    elModalContainer.classList.add("hidden");
};

document.getElementById("action-pickup").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    const items = gameState.items_on_board[myState.location] || [];
    
    if (items.length === 0) {
        alert("No items to pick up at this location.");
        return;
    }

    // Modal to choose items
    let html = `<h3>Pick Up Items</h3><p style="font-size:0.85rem; color:#b0a0cf;">Select items to add to inventory (Max 4 total items)</p><hr style="border-color:rgba(255,255,255,0.05); margin: 10px 0;">`;
    items.forEach(item => {
        html += `
            <div style="margin: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                <span>${item.name} (${item.color} ${item.strength})</span>
                <button class="btn btn-secondary btn-small" onclick="triggerPickSingle('${item.id}')">Pick Up</button>
            </div>
        `;
    });

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
});

window.triggerPickSingle = (itemId) => {
    let fromLoc = null;
    let itemData = null;
    if (gameState && gameState.items_on_board) {
        for (const loc in gameState.items_on_board) {
            const found = gameState.items_on_board[loc].find(it => it.id === itemId);
            if (found) {
                fromLoc = loc;
                itemData = found;
                break;
            }
        }
    }

    if (fromLoc && itemData) {
        animateItemFly(fromLoc, itemData.color, itemData.strength, itemData.name);
    }

    sendMsg({
        action: "pickup",
        item_ids: [itemId]
    });
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

// Yeti advance
document.getElementById("action-advance").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    const loc = myState.location;
    
    // Check if Yeti lair can be flipped at this location
    if (gameState.active_monsters.includes("Yeti")) {
        const yeti_state = gameState.monster_states["Yeti"];
        const lairHere = yeti_state.lairs.find(l => l.location === loc && !l.flipped);
        if (lairHere) {
            sendMsg({
                action: "advance",
                monster: "Yeti",
                args: { type: "reveal_lair" }
            });
            return;
        }
    }
    
    alert("No advance challenge available at your current location.");
});

// Defeat action
document.getElementById("action-defeat").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    const loc = myState.location;
    
    // Check which monster is at my location
    let targetMonster = null;
    for (const monster in gameState.monster_locations) {
        if (gameState.monster_locations[monster] === loc) {
            targetMonster = monster;
            break;
        }
    }
    
    // Special check for Cthulhu Phase 2: player at Corpse City heart index 3 can defeat Cthulhu
    if (gameState.active_monsters.includes("Cthulhu")) {
        const cth_state = gameState.monster_states["Cthulhu"];
        if (cth_state.phase === 2 && cth_state.player_tracks[playerName] === 3) {
            targetMonster = "Cthulhu";
        }
    }

    if (!targetMonster) {
        alert("You must be at the same location as a monster to Defeat them!");
        return;
    }

    sendMsg({
        action: "defeat",
        monster: targetMonster
    });
});

// Reveal Lair action
document.getElementById("action-reveal").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    if (!myState) return;
    
    let hasLair = false;
    if (gameState.active_monsters.includes("Yeti") && gameState.monster_states["Yeti"]) {
        const lairs = gameState.monster_states["Yeti"].lairs;
        hasLair = lairs.some(l => l.location === myState.location && !l.flipped);
    }
    
    if (!hasLair) {
        alert("There is no unrevealed Yeti lair token at your current location.");
        return;
    }
    
    if (confirm(`Would you like to spend 1 AP to reveal the lair token at ${myState.location}?`)) {
        sendMsg({ action: "reveal_lair" });
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

window.advanceJiangshi = (slotId) => {
    const myState = gameState.heroes_state[playerName];
    if (myState.items.length === 0) {
        alert("You need items in inventory to Advance Jiangshi's seal.");
        return;
    }

    let html = `<h3>Advance Jiangshi (Slot ${slotId})</h3><p>Choose an item to discard to fill this slot</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
    myState.items.forEach(item => {
        html += `
            <div style="margin: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                <span>${item.name} (${item.color} ${item.strength})</span>
                <button class="btn btn-primary btn-small" onclick="confirmAdvanceJiangshi(${slotId}, '${item.id}')">Use Item</button>
            </div>
        `;
    });

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
};

window.confirmAdvanceJiangshi = (slotId, itemId) => {
    sendMsg({
        action: "advance",
        monster: "Jiangshi",
        args: { slot_id: slotId, item_id: itemId }
    });
    elModalContainer.classList.add("hidden");
};

window.advanceSphinx = (slotId) => {
    const myState = gameState.heroes_state[playerName];
    const blueItems = myState.items.filter(i => i.color === "Blue");
    if (blueItems.length === 0) {
        alert("Sphinx riddles require Blue items.");
        return;
    }

    let html = `<h3>Advance Sphinx (Slot ${slotId})</h3><p>Choose a Blue item to insert</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
    blueItems.forEach(item => {
        html += `
            <div style="margin: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                <span>${item.name} (Blue ${item.strength})</span>
                <button class="btn btn-primary btn-small" onclick="confirmAdvanceSphinx(${slotId}, '${item.id}')">Use Item</button>
            </div>
        `;
    });

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
};

window.confirmAdvanceSphinx = (slotId, itemId) => {
    sendMsg({
        action: "advance",
        monster: "Sphinx",
        args: { slot_id: slotId, item_id: itemId }
    });
    elModalContainer.classList.add("hidden");
};

window.advanceCthulhuRune = (runeId) => {
    const myState = gameState.heroes_state[playerName];
    if (myState.items.length === 0) {
        alert("You need items in inventory to shatter a rune.");
        return;
    }

    let html = `<h3>Break Cthulhu Rune</h3><p>Select item to break Rune ${runeId}</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
    myState.items.forEach(item => {
        html += `
            <div style="margin: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                <span>${item.name} (${item.color} ${item.strength})</span>
                <button class="btn btn-primary btn-small" onclick="confirmCthulhuRune(${runeId}, '${item.id}')">Break</button>
            </div>
        `;
    });

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
};

window.confirmCthulhuRune = (runeId, itemId) => {
    sendMsg({
        action: "advance",
        monster: "Cthulhu",
        args: { rune_id: runeId, item_id: itemId }
    });
    elModalContainer.classList.add("hidden");
};

window.advanceCthulhuTrack = () => {
    const myState = gameState.heroes_state[playerName];
    if (myState.items.length === 0) {
        alert("You need items in inventory to traverse Corpse City.");
        return;
    }

    let html = `<h3>Traverse Corpse City</h3><p>Choose item to discard and move to the next step</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
    myState.items.forEach(item => {
        html += `
            <div style="margin: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                <span>${item.name} (${item.color} ${item.strength})</span>
                <button class="btn btn-primary btn-small" onclick="confirmCthulhuTrack('${item.id}')">Use Item</button>
            </div>
        `;
    });

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
};

window.confirmCthulhuTrack = (itemId) => {
    sendMsg({
        action: "advance",
        monster: "Cthulhu",
        args: { item_id: itemId }
    });
    elModalContainer.classList.add("hidden");
};

// Press 'D' (case-insensitive) to toggle hitbox debug mode
document.addEventListener("keydown", (e) => {
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
    
    // Scale client coordinate to SVG viewBox space (1304 x 1206)
    const svgX = Math.round((e.clientX - rect.left) * (1304 / rect.width));
    const svgY = Math.round((e.clientY - rect.top) * (1206 / rect.height));

    // Clamp coordinates inside the SVG viewport
    const clampedX = Math.max(0, Math.min(1304, svgX));
    const clampedY = Math.max(0, Math.min(1206, svgY));

    if (dragType === "circle") {
        gameState.node_coordinates[dragLocName].x = clampedX;
        gameState.node_coordinates[dragLocName].y = clampedY;
    } else if (dragType === "rect") {
        gameState.node_coordinates[dragLocName].bx = clampedX;
        gameState.node_coordinates[dragLocName].by = clampedY;
    }

    renderSVGMap(); // Redraw everything in real-time!
});

document.addEventListener("mouseup", () => {
    if (dragLocName) {
        // Send updated coordinates to the server
        sendMsg({
            action: "update_coordinates",
            coordinates: gameState.node_coordinates
        });
        
        console.log(`Saved coordinates for ${dragLocName}:`, gameState.node_coordinates[dragLocName]);
        
        // Wait a split second to clear window.isDragging to block trailing click events
        setTimeout(() => {
            window.isDragging = false;
            dragType = null;
            dragLocName = null;
        }, 50);
    }
});
