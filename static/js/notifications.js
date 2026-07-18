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

// Same fly + flip-reveal mechanic as the Monster Card draw (see animateCardFly /
// buildCardHTML), aimed at the left side of the map - the deck morphs from its card-back
// into that spot, flips to reveal the perk's name/text for a moment, then shrinks away.
function animatePerkCardDraw(perkName, perkText) {
    const deckEl = document.querySelector(".perks-stack");
    const mapEl = document.getElementById("game-map");
    if (!mapEl) return;

    const deckRect = deckEl ? deckEl.getBoundingClientRect() : {
        left: window.innerWidth / 2 - 65,
        top: window.innerHeight / 2 - 90,
        width: 130,
        height: 180
    };
    const mapRect = mapEl.getBoundingClientRect();

    const destW = 160;
    const destH = 248;
    const destLeft = mapRect.left + 24;
    const destTop = mapRect.top + (mapRect.height - destH) / 2;

    const fly = document.createElement("div");
    fly.className = "perk-fly-overlay";
    fly.style.left = `${deckRect.left}px`;
    fly.style.top = `${deckRect.top}px`;
    fly.style.width = `${deckRect.width || 130}px`;
    fly.style.height = `${deckRect.height || 180}px`;
    fly.innerHTML = `
        <div class="perk-fly-flip-container">
            <div class="perk-fly-inner">
                <div class="perk-fly-back"><img src="/Images/Perk_Card.png" alt="Perk Card"></div>
                <div class="perk-fly-face">
                    <div class="perk-fly-name"></div>
                    <div class="perk-fly-text"></div>
                </div>
            </div>
        </div>
    `;
    fly.querySelector(".perk-fly-name").textContent = perkName;
    fly.querySelector(".perk-fly-text").textContent = perkText;
    document.body.appendChild(fly);

    playSynthPerkSound();

    // Fly & morph from the deck towards the left side of the map
    requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.left = `${destLeft}px`;
        fly.style.top = `${destTop}px`;
        fly.style.width = `${destW}px`;
        fly.style.height = `${destH}px`;
    }));

    fly.addEventListener("transitionend", () => {
        // Flip in place to reveal the perk's name/text, matching the Monster Card reveal
        const inner = fly.querySelector(".perk-fly-inner");
        if (inner) inner.classList.add("flipped");

        // Let the revealed card linger long enough to read, then fly towards the "My
        // Hero" tab while shrinking away - this points the player at where the perk
        // actually landed instead of just vanishing in place.
        setTimeout(() => {
            const heroTabEl = document.getElementById("gtab-btn-my-hero");
            const heroTabRect = heroTabEl ? heroTabEl.getBoundingClientRect() : null;

            fly.style.transition = "left 0.6s cubic-bezier(0.4,0,0.2,1), top 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.6s ease, transform 0.6s cubic-bezier(0.4,0,0.2,1)";
            if (heroTabRect) {
                fly.style.left = `${heroTabRect.left + heroTabRect.width / 2 - destW / 2}px`;
                fly.style.top = `${heroTabRect.top + heroTabRect.height / 2 - destH / 2}px`;
            }
            fly.style.opacity = "0";
            fly.style.transform = "scale(0.15)";
            setTimeout(() => fly.remove(), 620);
        }, 1800);
    }, { once: true });
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

// Diff-detects newly-resolved monster Power events (server-side power_events feed) and
// pops a toast for each new one, so a Terror bump or a missing item has a visible cause
// instead of just quietly happening off-screen.
function detectAndShowPowerEvents() {
    const events = (gameState && gameState.power_events) || [];
    if (!knownPowerEventIds) {
        knownPowerEventIds = new Set(events.map(e => e.id));
        return;
    }
    events.forEach(evt => {
        if (!knownPowerEventIds.has(evt.id)) {
            knownPowerEventIds.add(evt.id);
            showMonsterPowerToast(evt);
        }
    });
}

function showMonsterPowerToast(evt) {
    const accent = MONSTER_ACCENT_MAP[evt.monster] || { border: "rgba(255,51,102,0.6)", glow: "rgba(255,51,102,0.3)" };
    const portrait = MONSTER_PORTRAIT_MAP[evt.monster] || "";
    showEventToast({
        portraitSrc: portrait,
        alt: evt.monster,
        borderColor: accent.border,
        glowColor: accent.glow,
        title: `${evt.monster} &mdash; ${evt.power_name}`,
        text: evt.message,
    });
}

// Diff-detects newly-spawned citizens (server-side citizen_events feed) and pops a
// toast with the citizen's portrait so their arrival isn't easy to miss on the map.
function detectAndShowCitizenEvents() {
    const events = (gameState && gameState.citizen_events) || [];
    if (!knownCitizenEventIds) {
        knownCitizenEventIds = new Set(events.map(e => e.id));
        return;
    }
    events.forEach(evt => {
        if (!knownCitizenEventIds.has(evt.id)) {
            knownCitizenEventIds.add(evt.id);
            showCitizenSpawnToast(evt);
        }
    });
}

function showCitizenSpawnToast(evt) {
    const accent = { border: "rgba(90, 200, 140, 0.6)", glow: "rgba(90, 200, 140, 0.3)" };
    showEventToast({
        portraitSrc: evt.portrait ? `/Images/Citizens/${evt.portrait}` : "",
        alt: evt.citizen,
        borderColor: accent.border,
        glowColor: accent.glow,
        title: `${evt.citizen} &mdash; Citizen Spawned`,
        text: evt.message,
    });
}

// Diff-detects newly-resolved monster-vs-citizen dice rolls (server-side
// citizen_attack_events feed) and pops a small on-map marker with the die faces right
// where it happened - otherwise a citizen vanishing and Terror ticking up look like they
// came from nowhere unless you go dig through the log.
function detectAndShowCitizenAttackMarkers() {
    const events = (gameState && gameState.citizen_attack_events) || [];
    if (!knownCitizenAttackEventIds) {
        knownCitizenAttackEventIds = new Set(events.map(e => e.id));
        return;
    }
    events.forEach(evt => {
        if (!knownCitizenAttackEventIds.has(evt.id)) {
            knownCitizenAttackEventIds.add(evt.id);
            showCitizenAttackMarker(evt);
        }
    });
}

// Diff-detects a monster sweeping items off a board space (server-side
// item_discard_events feed) and animates them flying to the Discard Pile panel.
function detectAndShowItemDiscardAnimations() {
    const events = (gameState && gameState.item_discard_events) || [];
    if (!knownItemDiscardEventIds) {
        knownItemDiscardEventIds = new Set(events.map(e => e.id));
        return;
    }
    events.forEach(evt => {
        if (!knownItemDiscardEventIds.has(evt.id)) {
            knownItemDiscardEventIds.add(evt.id);
            showItemDiscardFlyAnimation(evt);
        }
    });
}

function showEventToast({ portraitSrc, alt, borderColor, glowColor, title, text, icon }) {
    const toast = document.createElement("div");
    toast.className = "monster-power-toast";
    toast.style.borderColor = borderColor;
    toast.style.boxShadow = `0 10px 30px rgba(0,0,0,0.6), 0 0 20px ${glowColor}`;
    const portraitInner = portraitSrc
        ? `<img src="${portraitSrc}" alt="${alt}">`
        : (icon ? `<span class="monster-power-toast-icon">${icon}</span>` : "");
    toast.innerHTML = `
        <div class="monster-power-toast-portrait" style="border-color:${borderColor};">
            ${portraitInner}
        </div>
        <div class="monster-power-toast-body">
            ${title ? `<div class="monster-power-toast-title">${title}</div>` : ""}
            <div class="monster-power-toast-text">${text}</div>
        </div>
    `;

    let host = document.getElementById("monster-power-toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "monster-power-toast-host";
        document.body.appendChild(host);
    }
    host.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        toast.classList.add("shown");
    }));

    setTimeout(() => {
        toast.classList.remove("shown");
        toast.classList.add("hiding");
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// Generic replacement for browser alert() popups (invalid actions, missing requirements,
// connection notices, etc.), so they match the same banner format as citizen/Power toasts
// instead of blocking the page with a native dialog.
function showAlertToast(message) {
    showEventToast({
        icon: "⚠️",
        alt: "Notice",
        borderColor: "rgba(255, 213, 51, 0.6)",
        glowColor: "rgba(255, 213, 51, 0.3)",
        title: "Notice",
        text: message,
    });
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

