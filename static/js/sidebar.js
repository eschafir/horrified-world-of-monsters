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

// Mirrors getMonsterSymbols' top-level-then-phase-1-fallback pattern: most monsters
// carry frenzyLevel at the top of their catalog entry, but Cthulhu only has it per-phase
// (phase 1 = 4, phase 2 = 0), matching the server's _get_monster_symbols() convention.
function getMonsterFrenzyLevel(name) {
    const entry = gameState.monster_catalog && gameState.monster_catalog[name];
    if (!entry) return 0;
    if (typeof entry.frenzyLevel === "number") return entry.frenzyLevel;
    const phase = (entry.phases || [])[0];
    return (phase && phase.frenzyLevel) || 0;
}

// The monster's currently-relevant Power (name + description), so it can be read
// straight from its in-game status card. Cthulhu has a different Power per phase
// (Touch of Madness in Phase 1, Tentacles of Insanity in Phase 2); every other monster
// only has one phase.
function getMonsterCurrentPower(name) {
    const entry = gameState.monster_catalog && gameState.monster_catalog[name];
    if (!entry || !entry.phases || !entry.phases.length) return null;
    let phase = entry.phases[0];
    if (name === "Cthulhu") {
        const cthPhase = gameState.monster_states && gameState.monster_states["Cthulhu"] && gameState.monster_states["Cthulhu"].phase;
        phase = entry.phases.find(p => p.id === cthPhase) || phase;
    }
    return (phase.powers && phase.powers[0]) || null;
}

// Fixed Perception Die symbol -> color mapping (each symbol always has the same color
// across every monster's frenzySymbols list) so a Monster Card's bare symbol name can be
// colored without needing to know which monster(s) it belongs to.
const SYMBOL_TO_COLOR = {
    Dagger: "Orange", Ghost: "Yellow", Tincture: "Green", Hand: "Red",
    Jewel: "Teal", Eye: "Purple", Gear: "Brown", Wrench: "Blue"
};

// Every color name a Monster Card's event_text can reference (e.g. "Each Yellow
// Monster..."). Replaced with a small colored dot in buildCardHTML below so the color
// reads visually instead of as plain text - the word is kept as a hover tooltip.
const EVENT_TEXT_COLOR_WORDS = ["Orange", "Yellow", "Green", "Red", "Teal", "Purple", "Brown", "Blue"];

function formatEventTextWithColorIcons(text) {
    if (!text) return text;
    let result = text;
    EVENT_TEXT_COLOR_WORDS.forEach(color => {
        const hex = getSymbolColorHex(color);
        const icon = `<span class="mp-inline-color-dot" style="background:${hex}; box-shadow:0 0 4px ${hex};" title="${color}"></span>`;
        result = result.replace(new RegExp(`\\b${color}\\b`, "g"), icon);
    });
    return result;
}

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
    "Cthulhu":  { border: "rgba(153,51,255,0.6)",  glow: "rgba(153,51,255,0.3)"  },
    "Siren":    { border: "rgba(51,255,204,0.6)",  glow: "rgba(51,255,204,0.3)"  }
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

// Shortest-path distances from `start`, client-side mirror of the server's
// _bfs_distances - used to constrain Perk card location pickers (e.g. "move up to N
// spaces") to only the reachable/legal set instead of the whole board.
function clientBfsDistances(start) {
    const distances = { [start]: 0 };
    const queue = [start];
    const adj = gameState.adjacency_list || {};
    while (queue.length) {
        const node = queue.shift();
        (adj[node] || []).forEach(n => {
            if (!(n in distances)) {
                distances[n] = distances[node] + 1;
                queue.push(n);
            }
        });
    }
    return distances;
}

// On-map Hero/Monster picker: glows eligible tokens directly on the SVG board (the same
// gold guide-source-pulse used by the Guide action) and resolves via a click there,
// instead of a portrait-grid modal. Used by every Perk card that targets a Hero or
// Monster. Single-select resolves immediately; multi-select (Ironclad Buggy) toggles
// selection and requires the Confirm button on the floating bar.
window.openMapEntityPicker = ({ entityType, names, hint, multiSelect, confirmLabel, onConfirm }) => {
    elModalContainer.classList.add("hidden");
    mapEntityPickerType = entityType;
    mapEntityPickerNames = names || [];
    mapEntityPickerCallback = onConfirm;
    mapEntityPickerMultiSelect = !!multiSelect;
    mapEntityPickerSelected = new Set();
    gameState.log.push(`>>> ${hint || `Click a highlighted ${entityType} on the map!`}`);
    renderSVGMap();
    showPerkPickerBar(multiSelect ? (confirmLabel || "Confirm") : null);
};

window.closeMapEntityPicker = () => {
    mapEntityPickerType = null;
    mapEntityPickerNames = null;
    mapEntityPickerCallback = null;
    mapEntityPickerMultiSelect = false;
    mapEntityPickerSelected = null;
};

// On-map location picker: highlights `locations` directly on the SVG board (same
// active-dest styling as Move/Guide) and resolves via a click there, instead of a modal
// list. Used by Perk cards that pick a board space (starting with Pulse Pummel).
window.openMapLocationPicker = ({ locations, hint, onConfirm }) => {
    elModalContainer.classList.add("hidden");
    mapLocationPickerTargets = locations || [];
    mapLocationPickerCallback = onConfirm;
    selectedAction = "map_location_picker";
    gameState.log.push(`>>> ${hint || "Click a highlighted node on the map to choose the target!"}`);
    renderSVGMap();
    showPerkPickerBar(null);
};

// Floating bar shown for every step of an on-map Perk flow (both entity and location
// pickers), so there's always a visible way out - Play used to have no cancel path once
// a picker opened. Shows a live selection count + Confirm only while multi-selecting;
// otherwise it's just a "click a highlighted target" reminder + Cancel.
function showPerkPickerBar(confirmLabel) {
    hidePerkPickerBar();
    const bar = document.createElement("div");
    bar.id = "map-picker-confirm-bar";
    bar.innerHTML = confirmLabel
        ? `
            <span id="map-picker-confirm-count">0 selected</span>
            <button class="btn btn-primary btn-small" id="map-picker-confirm-btn" disabled>${confirmLabel}</button>
            <button class="btn btn-secondary btn-small" onclick="window.cancelPerkFlow()">Cancel</button>
        `
        : `
            <span>Choose a target on the map, or cancel</span>
            <button class="btn btn-secondary btn-small" onclick="window.cancelPerkFlow()">Cancel</button>
        `;
    document.body.appendChild(bar);
    if (confirmLabel) {
        document.getElementById("map-picker-confirm-btn").onclick = () => {
            const callback = mapEntityPickerCallback;
            const selected = Array.from(mapEntityPickerSelected || []);
            closeMapEntityPicker();
            hidePerkPickerBar();
            renderSVGMap();
            if (callback) callback(selected);
        };
    }
}

function hidePerkPickerBar() {
    const bar = document.getElementById("map-picker-confirm-bar");
    if (bar) bar.remove();
}

function updateMapPickerConfirmBar() {
    const countEl = document.getElementById("map-picker-confirm-count");
    const btnEl = document.getElementById("map-picker-confirm-btn");
    if (!countEl || !btnEl || !mapEntityPickerSelected) return;
    countEl.textContent = `${mapEntityPickerSelected.size} selected`;
    btnEl.disabled = mapEntityPickerSelected.size === 0;
}

// Aborts an in-progress Perk flow from any step (item/choice modal, on-map entity pick,
// or on-map location pick) and clears every bit of picker state so the map goes back to
// normal - the single "way out" this feature was missing.
window.cancelPerkFlow = () => {
    selectedAction = null;
    mapLocationPickerTargets = null;
    mapLocationPickerCallback = null;
    closeMapEntityPicker();
    hidePerkPickerBar();
    elModalContainer.classList.add("hidden");
    renderSVGMap();
};

// Two-option choice picker, used by "Choose one:" Perk cards (Ethereal Goggles, Chronohelm).
window.openChoicePicker = ({ title, description, options, onConfirm }) => {
    let html = `<div style="text-align:center;">`;
    html += `<h3 style="margin-top:0;">${title}</h3>`;
    if (description) html += `<p style="font-size:0.8rem; color:#b0a0cf;">${description}</p>`;
    html += `<hr style="border-color:rgba(255,255,255,0.05); margin: 10px 0;">`;
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
    options.forEach(opt => {
        html += `<button class="btn btn-primary choice-picker-btn" data-choice="${opt.id}" style="width:100%;">${opt.label}</button>`;
    });
    html += `</div>`;
    html += `<hr style="border-color:rgba(255,255,255,0.05); margin: 15px 0 10px 0;">`;
    html += `<button class="btn btn-secondary btn-small" onclick="window.cancelPerkFlow()">Cancel</button>`;
    html += `</div>`;
    elModalBody.innerHTML = html;
    elModalContainer.classList.remove("hidden");

    document.querySelectorAll(".choice-picker-btn").forEach(btn => {
        btn.onclick = () => {
            elModalContainer.classList.add("hidden");
            onConfirm(btn.dataset.choice);
        };
    });
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
            const canPlayPerks = gameState.game_phase === "HeroPhase";
            if (myState.perks && myState.perks.length > 0) {
                myState.perks.forEach(perk => {
                    perksHtml += `
                        <div class="item-row perk-row" style="background: rgba(153, 51, 255, 0.15); border-left: 3px solid #9933ff; flex-direction: column; align-items: flex-start; gap: 4px; padding: 6px; width: 100%; margin: 3px 0;">
                            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                                <strong style="color: #ffd533; font-size: 0.8rem; letter-spacing: 0.5px;">${perk.name}</strong>
                                <button class="btn-hud" style="font-size: 0.65rem; padding: 2px 6px; cursor: ${canPlayPerks ? "pointer" : "not-allowed"};" ${canPlayPerks ? "" : "disabled title=\"Perks can only be played during the Hero Phase\""} onclick="playPerkCard('${perk.id}', '${perk.name}')">Play</button>
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

// Prominent "whose turn is it" banner at the top of the action panel - right where the
// player is already looking to click an action button, unlike the small HUD chip at the
// top of the map. Shows the acting player's remaining AP either way, so watching a
// remote player's turn isn't a black box.
function renderTurnStatusBanner() {
    const el = document.getElementById("turn-status-banner");
    if (!el || !gameState || !gameState.players || !gameState.players.length) return;

    const activePlayer = gameState.players[gameState.turn_player_idx];
    if (!activePlayer) { el.innerHTML = ""; return; }

    const activeState = gameState.heroes_state[activePlayer.name];
    const maxAp = activeState ? (activeState.max_ap || 4) : 4;
    const ap = activeState && typeof activeState.ap === "number" ? activeState.ap : maxAp;
    const isMyTurn = activePlayer.name === playerName;

    if (isMyTurn) {
        el.className = "turn-status-banner my-turn";
        el.innerHTML = `
            <span class="turn-status-icon">⚡</span>
            <span class="turn-status-text">YOUR TURN</span>
            <span class="turn-status-ap">${ap}/${maxAp} AP</span>
        `;
    } else {
        const heroClass = activeState ? activeState.hero : "";
        el.className = "turn-status-banner other-turn";
        el.innerHTML = `
            <span class="turn-status-icon">⏳</span>
            <span class="turn-status-text">${activePlayer.name}'s Turn${heroClass ? ` <span class="turn-status-hero">(${heroClass})</span>` : ""}</span>
            <span class="turn-status-ap">${ap}/${maxAp} AP left</span>
        `;
    }
}

function renderApCounterBar() {
    const el = document.getElementById("ap-counter-bar");
    if (!el) return;
    const activePlayer = gameState.players[gameState.turn_player_idx];
    const activeState = activePlayer ? gameState.heroes_state[activePlayer.name] : null;
    if (!activeState) { el.innerHTML = ""; return; }

    const maxAp = activeState.max_ap || 4;
    const apLeft = typeof activeState.ap === "number" ? activeState.ap : maxAp;
    const used = maxAp - apLeft;

    el.innerHTML = "";
    for (let i = 0; i < maxAp; i++) {
        const dot = document.createElement("div");
        dot.className = `ap-dot ${i < used ? "ap-dot-used" : "ap-dot-free"}`;
        el.appendChild(dot);
    }
}

function buildCardHTML(card, alreadyFlipped, innerId = "mp-card-inner") {
    const attack = card.monster_attack || {};
    const symbolColor = attack.symbol ? getSymbolColorHex(SYMBOL_TO_COLOR[attack.symbol]) : null;

    return `
        <div class="mp-flip-container">
            <div class="mp-card-inner${alreadyFlipped ? " flipped" : ""}" id="${innerId}">
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
                        <span class="mp-event-text">${formatEventTextWithColorIcons(card.event_text)}</span>
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

// The Fortune Teller's peek: flips the top Monster Card face-up right at the deck
// itself (not the Monster Phase panel - this card hasn't actually been drawn) and
// stays face-up - no auto-dismiss, no click-to-dismiss. It only flips back down once
// the Monster Phase actually begins (see dismissFortuneTellerPeek, called from
// updateGameUI). Doesn't touch gameState/current_card at all, since the peek never
// advances the deck.
function showFortuneTellerPeekCard(card) {
    const deckEl = document.querySelector(".monsters-stack");
    if (!deckEl) return;
    const rect = deckEl.getBoundingClientRect();

    // Only one peek card at a time.
    dismissFortuneTellerPeek();

    const overlay = document.createElement("div");
    overlay.className = "ft-peek-overlay";
    overlay.style.left = `${rect.left + rect.width / 2}px`;
    overlay.style.top = `${rect.top + rect.height / 2}px`;
    overlay.innerHTML = buildCardHTML(card, false, "ft-peek-card-inner");
    document.body.appendChild(overlay);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const inner = document.getElementById("ft-peek-card-inner");
        if (inner) inner.classList.add("flipped");
    }));
}

// Flips the peeked card back down and removes it - called once the Monster Phase
// begins (or immediately, if a second peek somehow starts before the first was closed).
function dismissFortuneTellerPeek() {
    const overlay = document.querySelector(".ft-peek-overlay");
    if (!overlay) return;
    const inner = document.getElementById("ft-peek-card-inner");
    if (inner) inner.classList.remove("flipped");
    setTimeout(() => overlay.remove(), 650);
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
    if (fortuneTellerPeekActive) {
        fortuneTellerPeekActive = false;
        document.querySelector(".monsters-stack")?.classList.remove("fortune-teller-glow");
        sendMsg({ action: "special", args: {} });
        return;
    }

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
    const portrait = MONSTER_PORTRAIT_MAP[m] || `/Images/Monsters/${m}.png`;
    const accent = MONSTER_ACCENT_MAP[m] || { border: "rgba(255,51,102,0.6)", glow: "rgba(255,51,102,0.3)" };

    const fVal = getMonsterFrenzyLevel(m);
    const isFrenzyHolder = (m === gameState.frenzy_marker);
    const symbolDots = getMonsterSymbols(m).map(s =>
        `<span title="${s.symbol} (${s.color})" style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${getSymbolColorHex(s.color)}; border:1.5px solid rgba(0,0,0,0.4); box-shadow:0 0 4px ${getSymbolColorHex(s.color)}99;"></span>`
    ).join("");
    const currentPower = getMonsterCurrentPower(m);

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

    if (currentPower) {
        details += `
            <div style="text-align:left; margin-bottom:10px; padding:8px 10px; border-radius:8px; background:rgba(255,51,102,0.08); border:1px solid rgba(255,51,102,0.25);">
                <div style="font-weight:700; color:#ff8899; font-size:0.75rem;">Power: ${currentPower.name}</div>
                <div style="font-size:0.7rem; color:#e5d9c8; margin-top:2px;">${currentPower.description}</div>
            </div>
        `;
    }

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
    } else if (m === "Siren") {
        const siren_state = gameState.monster_states["Siren"];
        details += `
            <p style="font-size: 0.72rem; color: #a491c3;">Spend Blue Items to flip squares. Match Greek letters to keep them face up. Once all 8 are face up, discard 6+ combined Green strength at the Siren's location to defeat.</p>
            <div class="monster-puzzle-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
        `;
        siren_state.squares.forEach(sq => {
            const isFlipped = sq.flipped || sq.matched;
            // Map full Greek names to actual Greek symbols
            const greekChar = {"Alpha": "Α", "Beta": "Β", "Gamma": "Γ", "Delta": "Δ"}[sq.letter] || sq.letter[0];
            details += `
                <div class="puzzle-slot ${sq.matched ? 'filled' : ''}" style="height:44px; flex: unset; background: ${isFlipped ? 'rgba(255, 255, 255, 0.08)' : 'rgba(51, 153, 255, 0.15)'}; border: 1px solid ${isFlipped ? 'rgba(255, 255, 255, 0.2)' : 'rgba(51, 153, 255, 0.4)'}; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: all 0.2s ease; cursor: ${!isFlipped ? 'pointer' : 'default'};" ${!isFlipped ? `onclick="flipSirenSquare(${sq.id})"` : ''} ${!isFlipped ? `onmouseover="this.style.transform='translateY(-2px) scale(1.03)'; this.style.background='rgba(51, 153, 255, 0.25)';" onmouseout="this.style.transform='none'; this.style.background='rgba(51, 153, 255, 0.15)';"` : ''}>
                    ${isFlipped ? `<strong style="color:#f0e8ff; font-size:1.2rem; text-shadow: 0 0 8px rgba(255,255,255,0.4);">${greekChar}</strong>` : `<span style="opacity: 0.4; font-size: 0.9rem;">?</span>`}
                </div>
            `;
        });
        details += `</div>`;
        details += `<p style="font-size: 0.68rem; color: #a491c3; margin-top:6px;">Pending flips: <strong>${siren_state.pending_flips}</strong> &mdash; select 1 Blue item in your hero tab, then Advance to buy 2 more.</p>`;
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

