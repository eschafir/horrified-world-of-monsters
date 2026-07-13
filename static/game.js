// ---------------------------------------------------------
// GAME CLIENT STATE VARIABLES
// ---------------------------------------------------------

let socket = null;
let playerName = "";
let roomCode = "";
let gameState = null;
let selectedAction = null; // Track currently clicked action mode
let selectedItemsForAction = []; // Track item selections for trades/scaffold
let destinationNodeSelection = null; // Track movement target
let chosenHero = "Adventurer";
let dragType = null;
let dragLocName = null;

const HEROES_LIST = ["Adventurer", "Detective", "Explorer", "Scholar", "Tinkerer"];

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
const elBtnCreate = document.getElementById("btn-create");
const elBtnJoin = document.getElementById("btn-join");
const elBtnStart = document.getElementById("btn-start");
const elBtnShowPerks = document.getElementById("btn-show-perks");
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

// Sidebar Tabs
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
    HEROES_LIST.forEach(hero => {
        const card = document.createElement("div");
        card.className = `hero-card ${chosenHero === hero ? "selected" : ""}`;
        
        let desc = "";
        if (hero === "Adventurer") desc = "Can teleport to join any hero's location.";
        else if (hero === "Detective") desc = "Reveal secrets (lairs/deck top) for free.";
        else if (hero === "Explorer") desc = "Moves 1 extra step per Move action.";
        else if (hero === "Scholar") desc = "Discards items to draw Perk cards.";
        else if (hero === "Tinkerer") desc = "Combines items to add strengths.";

        card.innerHTML = `
            <h5>${hero}</h5>
            <p>${desc}</p>
        `;
        card.addEventListener("click", () => {
            chosenHero = hero;
            document.querySelectorAll(".hero-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            sendMsg({
                action: "select_hero",
                hero: hero
            });
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
                <span><strong>${p.name}</strong> as ${p.hero}</span>
                ${p.is_host ? '<span class="host-badge">Host</span>' : ''}
            `;
            elConnectedPlayers.appendChild(li);
        });

        // Toggle host setting view
        const me = gameState.players.find(p => p.name === playerName);
        if (me && me.is_host) {
            elHostSettings.classList.remove("hidden");
        } else {
            elHostSettings.classList.add("hidden");
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

        // Render Sidebar lists (Inventory)
        renderPlayerPanel();
        
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

    document.getElementById("player-panel-title").innerText = `My Hero: ${myState.hero}`;
    
    let abilityDesc = "";
    if (myState.hero === "Adventurer") abilityDesc = "Once per turn: Teleport to any hero's location (1 AP).";
    else if (myState.hero === "Detective") abilityDesc = "Once per turn: Reveal a lair or top deck card (0 AP).";
    else if (myState.hero === "Explorer") abilityDesc = "Passive: Move 1 extra step per Move action.";
    else if (myState.hero === "Scholar") abilityDesc = "Once per turn: Discard any item on the board to draw a Perk card (0 AP).";
    else if (myState.hero === "Tinkerer") abilityDesc = "Once per turn: Combine two items in hand to add their strength (0 AP).";

    document.getElementById("player-ability").innerText = abilityDesc;

    const elInv = document.getElementById("player-inventory");
    elInv.innerHTML = "";
    
    if (myState.items.length === 0) {
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
    }
}

function renderMonstersStatusPanel() {
    const elMonContainer = document.getElementById("monsters-status-container");
    elMonContainer.innerHTML = "";

    if (gameState.active_monsters.length === 0) {
        elMonContainer.innerHTML = `<p style="font-size: 0.8rem; color: #ffd533; text-align: center;">All monsters defeated! Deal the final blow.</p>`;
        return;
    }

    gameState.active_monsters.forEach(m => {
        const card = document.createElement("div");
        card.className = "monster-status-card glass";
        
        let details = `<h5>${m}</h5>`;
        
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
    
    // Scale volume: maximum gain of 0.15 is very peaceful and soft
    const slider = document.getElementById("bg-music-volume");
    const sliderVal = slider ? parseFloat(slider.value) / 100 : 0.2;
    bgGainNode.gain.setValueAtTime(sliderVal * 0.15, audioCtx.currentTime);
    bgGainNode.connect(audioCtx.destination);

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
        // Smooth transition to prevent audio popping
        bgGainNode.gain.linearRampToValueAtTime(val * 0.15, audioCtx.currentTime + 0.15);
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
    img.setAttribute("href", "/Images/Monsters/Yeti.jpg");
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
                characters.push({ type: "hero", name: pName, label: h.hero.charAt(0) });
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
                characters.push({ type: "citizen", name: citName, label: "C" });
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
            const isCustomMonster = isYeti || isSphinx;
            const charR = isCustomMonster ? 35 : 12; // Custom monsters are bigger (radius 35 vs 12)

            const offset = getCharOffset(index, characters.length, coord.r || 35);
            const charG = document.createElementNS("http://www.w3.org/2000/svg", "g");

            const charCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            charCircle.setAttribute("cx", coord.x + offset.x);
            charCircle.setAttribute("cy", coord.y + offset.y);
            charCircle.setAttribute("r", charR);
            
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
            } else {
                charCircle.setAttribute("class", `token-character char-${char.type}`);
            }
            charG.appendChild(charCircle);

            // Render text label only for standard (non-custom) tokens
            if (!isCustomMonster) {
                const charVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
                charVal.setAttribute("x", coord.x + offset.x);
                charVal.setAttribute("y", coord.y + offset.y + 4);
                charVal.setAttribute("text-anchor", "middle");
                charVal.setAttribute("fill", "#000");
                charVal.setAttribute("font-size", "10px");
                charVal.setAttribute("font-weight", "bold");
                charVal.textContent = char.label;
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

// ---------------------------------------------------------
// PLAYER ACTION TRIGGERS
// ---------------------------------------------------------

document.getElementById("action-move").addEventListener("click", () => {
    selectedAction = "move";
    gameState.log.push(">>> Click on adjacent node to Move!");
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

// Special power action
document.getElementById("action-special").addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    
    if (myState.hero === "Adventurer") {
        // Choose player to teleport to
        let html = `<h3>Adventurer Teleport</h3><p>Choose a hero to join at their location</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
        for (const name in gameState.heroes_state) {
            if (name !== playerName) {
                html += `<button class="btn btn-secondary" onclick="triggerSpecialAdventurer('${name}')" style="width:100%; margin-bottom:8px;">Join ${name} at ${gameState.heroes_state[name].location}</button>`;
            }
        }
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");
        
    } else if (myState.hero === "Detective") {
        // Choose to reveal deck or lair
        let html = `<h3>Detective Secret Intel</h3><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">
            <button class="btn btn-primary" onclick="triggerSpecialDetective('lair')" style="width:100%; margin-bottom:10px;">Reveal Next Lair Token</button>
            <button class="btn btn-secondary" onclick="triggerSpecialDetective('deck')" style="width:100%;">Peak Top Monster Deck Card</button>
        `;
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");
        
    } else if (myState.hero === "Scholar") {
        // Choose item on board to discard
        let html = `<h3>Scholar Archive Discard</h3><p>Select any item on the board to discard in exchange for a Perk Card</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
        let count = 0;
        for (const loc in gameState.items_on_board) {
            gameState.items_on_board[loc].forEach(item => {
                count++;
                html += `
                    <div style="margin: 8px 0; display:flex; justify-content:space-between; align-items:center;">
                        <span>${item.name} at ${loc}</span>
                        <button class="btn btn-secondary btn-small" onclick="triggerSpecialScholar('${item.id}', '${loc}')">Discard</button>
                    </div>
                `;
            });
        }
        if (count === 0) {
            html += `<p>No items currently on the board to discard.</p>`;
        }
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");
        
    } else if (myState.hero === "Tinkerer") {
        // Combine 2 items in inventory
        if (myState.items.length < 2) {
            alert("Tinkerer needs at least 2 items in inventory to combine.");
            return;
        }
        let html = `<h3>Tinkerer Modification</h3><p>Select 2 items to combine into 1 stronger item (Sum of strengths, max 5)</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
        myState.items.forEach(item => {
            html += `<label style="display:block; margin:6px 0;"><input type="checkbox" class="tinker-combine" value="${item.id}"> ${item.name} (${item.color} ${item.strength})</label>`;
        });
        html += `<button class="btn btn-primary" onclick="confirmTinker()" style="width:100%; margin-top:15px;">Combine Items</button>`;
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");
        
    } else {
        alert("Your hero has a passive special power and does not need to activate it.");
    }
});

// Special activation callback hooks
window.triggerSpecialAdventurer = (targetHero) => {
    sendMsg({ action: "special", args: { target_hero: targetHero } });
    elModalContainer.classList.add("hidden");
};
window.triggerSpecialDetective = (revealType) => {
    sendMsg({ action: "special", args: { type: revealType } });
    elModalContainer.classList.add("hidden");
};
window.triggerSpecialScholar = (itemId, location) => {
    sendMsg({ action: "special", args: { item_id: itemId, location: location } });
    elModalContainer.classList.add("hidden");
};
window.confirmTinker = () => {
    const checked = Array.from(document.querySelectorAll(".tinker-combine:checked")).map(el => el.value);
    if (checked.length !== 2) {
        alert("You must select exactly 2 items to combine!");
        return;
    }
    sendMsg({ action: "special", args: { item1_id: checked[0], item2_id: checked[1] } });
    elModalContainer.classList.add("hidden");
};

// End turn
document.getElementById("action-end-turn").addEventListener("click", () => {
    sendMsg({ action: "end_turn" });
});

// Perks display modal
elBtnShowPerks.addEventListener("click", () => {
    const myState = gameState.heroes_state[playerName];
    if (!myState) return;

    let html = `<h3>My Perk Cards</h3><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;
    if (myState.perks.length === 0) {
        html += `<p style="text-align:center;">You have no Perk cards.</p>`;
    } else {
        myState.perks.forEach(perk => {
            html += `
                <div class="glass-inner" style="padding:10px; margin-bottom:8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="color:#ffd533">${perk.name}</strong>
                        <p style="font-size:0.75rem; color:#b0a0cf; margin-top:2px;">${perk.text}</p>
                    </div>
                    <button class="btn btn-primary btn-small" onclick="playPerkCard('${perk.id}', '${perk.name}')">Play</button>
                </div>
            `;
        });
    }

    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");
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
