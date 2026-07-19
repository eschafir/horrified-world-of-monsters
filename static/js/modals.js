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
    } else if (lairType === "cerberus") {
        imgSrc = "/Images/Lair Tokens/cerberus_lair_token.png";
        title = "Underworld Door";
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

// Read-only browse of every item that's actually hit the discard pile - block-choice
// blocks, monster-Power/Perk costs, Defeat costs, and Advance costs. Items still sitting
// in a monster's Advance puzzle (a Sphinx grid cell, a Jiangshi sword slot, ...) don't
// show up here until that monster is defeated and its committed items get swept in.
function showDiscardPileModal() {
    const items = gameState.discarded_items || [];

    let html = `<div style="text-align:center;">`;
    html += `<h3>Discard Pile</h3><p style="font-size:0.8rem; color:#b0a0cf;">${items.length} item${items.length !== 1 ? "s" : ""} used or removed from play.</p><hr style="border-color: rgba(255,255,255,0.05); margin: 10px 0;">`;

    if (items.length > 0) {
        html += `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; max-height:360px; overflow-y:auto;">`;
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
        html += `<p style="color:#a491c3; font-style:italic;">The discard pile is empty.</p>`;
    }

    html += `<hr style="border-color: rgba(255,255,255,0.05); margin: 15px 0 10px 0;">`;
    html += `<button class="btn btn-secondary btn-small" onclick="elModalContainer.classList.add('hidden')">Close</button>`;
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

