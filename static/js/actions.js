// ---------------------------------------------------------
// PLAYER ACTION TRIGGERS
// ---------------------------------------------------------

document.getElementById("action-move").addEventListener("click", () => {
    selectedAction = "move";
    gameState.log.push(">>> Click on adjacent node to Move!");
    renderSVGMap();
});

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
        showAlertToast("There are no active Legends (citizens or Yeti children) at or adjacent to your location to guide.");
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
        showAlertToast("No items to pick up at this location.");
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
        showAlertToast("You must be at the same location as another hero to Share.");
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

    showAlertToast("No advance challenge available at your current location. (Puzzle slots and dials are worked by clicking them directly in the Monsters panel.)");
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
        showAlertToast("You must be at the same location as a monster (and meet its requirements) to Defeat them!");
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
            showAlertToast("There are no other heroes at your location to Guide.");
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
            showAlertToast("You must have at least 2 items in inventory to discard.");
            return;
        }
        const discList = gameState.discarded_items || [];
        if (discList.length === 0) {
            showAlertToast("The discard pile is currently empty! Use Investigator power once some items are discarded.");
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
            showAlertToast("You have no items to discard.");
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
            showAlertToast("You have no items to distribute.");
            return;
        }
        const otherPlayers = [];
        for (const name in gameState.heroes_state) {
            if (name !== playerName) {
                otherPlayers.push(name);
            }
        }
        if (otherPlayers.length === 0) {
            showAlertToast("There are no other players in the room to distribute items to.");
            return;
        }

        window.paraSelectedItem = null;
        window.paraSelectedHero = null;

        let html = `<div style="text-align:center;">`;
        html += `<h3>The Parapsychologist: Distribute Item</h3><p style="font-size:0.85rem; color:#b0a0cf;">Send an item from your hand to another player anywhere on the map (0 AP).</p><hr style="border-color:rgba(255,255,255,0.05); margin:10px 0;">`;

        html += `<p style="margin-bottom:8px; text-align:left;"><strong>Choose Item:</strong></p>`;
        html += `<div id="para-item-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-bottom:16px;">`;
        myState.items.forEach(item => {
            const imgSrc = item.artwork ? `/assets/items/${item.artwork}` : "";
            const colorHex = getItemColorHex(item.color);
            html += `
                <div class="para-item-card" data-item-id="${item.id}" style="width:84px; text-align:center; cursor:pointer;">
                    <div class="para-item-thumb" style="width:64px; height:64px; margin:0 auto 6px; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.05); border:3px solid ${colorHex}; display:flex; align-items:center; justify-content:center; transition: box-shadow 0.15s ease;">
                        ${imgSrc ? `<img src="${imgSrc}" alt="${item.name}" style="width:100%; height:100%; object-fit:contain;" onerror="this.parentElement.style.visibility='hidden'">` : ''}
                    </div>
                    <div style="font-size:0.68rem; color:#e5d9c8; line-height:1.2;">${item.name}</div>
                    <div style="font-size:0.65rem; color:#a491c3;"><strong>${item.strength}</strong></div>
                </div>
            `;
        });
        html += `</div>`;

        html += `<p style="margin-bottom:8px; text-align:left;"><strong>Choose Recipient:</strong></p>`;
        html += `<div id="para-hero-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-bottom:20px;">`;
        otherPlayers.forEach(name => {
            const heroClass = gameState.heroes_state[name].hero;
            const portrait = `/Images/Heroes/${heroClass} Image.png`;
            html += `
                <div class="para-hero-card" data-hero-name="${name}" style="width:84px; text-align:center; cursor:pointer;">
                    <div class="para-hero-thumb" style="width:64px; height:64px; margin:0 auto 6px; border-radius:50%; overflow:hidden; background:rgba(255,255,255,0.05); border:3px solid rgba(255,255,255,0.2); transition: box-shadow 0.15s ease;">
                        <img src="${portrait}" alt="${heroClass}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='/Images/Heroes/placeholder.png';">
                    </div>
                    <div style="font-size:0.68rem; color:#e5d9c8; line-height:1.2;">${name}</div>
                    <div style="font-size:0.6rem; color:#a491c3;">${heroClass}</div>
                </div>
            `;
        });
        html += `</div>`;

        html += `<button id="para-send-btn" class="btn btn-primary" style="width:100%;" disabled>Select an item and a recipient</button>`;
        html += `</div>`;
        elModalBody.innerHTML = html;
        elModalContainer.classList.remove("hidden");

        const updateParaSendButton = () => {
            const btn = document.getElementById("para-send-btn");
            if (!btn) return;
            if (window.paraSelectedItem && window.paraSelectedHero) {
                btn.disabled = false;
                btn.textContent = "Send Item";
            } else {
                btn.disabled = true;
                btn.textContent = "Select an item and a recipient";
            }
        };

        document.querySelectorAll(".para-item-card").forEach(card => {
            card.onclick = () => {
                window.paraSelectedItem = card.dataset.itemId;
                document.querySelectorAll(".para-item-thumb").forEach(el => el.style.boxShadow = "none");
                card.querySelector(".para-item-thumb").style.boxShadow = "0 0 10px 2px rgba(255, 213, 51, 0.8)";
                updateParaSendButton();
            };
        });
        document.querySelectorAll(".para-hero-card").forEach(card => {
            card.onclick = () => {
                window.paraSelectedHero = card.dataset.heroName;
                document.querySelectorAll(".para-hero-thumb").forEach(el => el.style.boxShadow = "none");
                card.querySelector(".para-hero-thumb").style.boxShadow = "0 0 10px 2px rgba(255, 213, 51, 0.8)";
                updateParaSendButton();
            };
        });
        document.getElementById("para-send-btn").onclick = () => window.confirmParaDistribute();
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
        showAlertToast("You must select exactly 2 items to discard!");
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
    if (!window.paraSelectedItem || !window.paraSelectedHero) return;
    sendMsg({ action: "special", args: { item_id: window.paraSelectedItem, target_hero: window.paraSelectedHero } });
    elModalContainer.classList.add("hidden");
};

// End turn
document.getElementById("action-end-turn").addEventListener("click", () => {
    sendMsg({ action: "end_turn" });
});


function sendPlayPerk(perkId, args) {
    sendMsg({ action: "play_perk", perk_id: perkId, args: args || {} });
}

// Perk cards that need no target selection at all fire immediately; every other perk
// walks the player through a short chain of pickers (hero/monster/location/choice,
// all defined in sidebar.js) before sending the action, instead of a single free-text
// prompt() like the old Swiftness perk used to.
window.playPerkCard = (perkId, perkName) => {
    if (perkName === "Neuro Stabilizer" || perkName === "Spectral Diverter") {
        sendPlayPerk(perkId, {});
        elModalContainer.classList.add("hidden");
        return;
    }

    elModalContainer.classList.add("hidden");

    if (perkName === "Lunar Oscillator") {
        openItemPicker({
            title: "Lunar Oscillator",
            description: "Take 1 item from the discard pile to give to another player.",
            items: gameState.discarded_items || [],
            validateFn: (sel) => ({ valid: sel.length === 1, message: sel.length === 1 ? "" : "Select exactly 1 item." }),
            confirmLabel: "Next: Choose Recipient",
            onConfirm: (ids) => {
                openHeroPicker({
                    title: "Lunar Oscillator",
                    description: "Give the item to which player?",
                    excludeSelf: true,
                    onConfirm: (targetHero) => {
                        sendPlayPerk(perkId, { discard_item_id: ids[0], target_hero: targetHero });
                    }
                });
            }
        });

    } else if (perkName === "Pulse Pummel") {
        openMonsterPicker({
            title: "Pulse Pummel",
            description: "Choose a Monster to move up to 4 spaces.",
            onConfirm: (monster) => {
                const dist = clientBfsDistances(gameState.monster_locations[monster]);
                const locations = Object.keys(dist).filter(l => dist[l] >= 1 && dist[l] <= 4);
                openMapLocationPicker({
                    locations,
                    hint: `Click a highlighted node to move ${monster} there (up to 4 spaces away)!`,
                    onConfirm: (dest) => sendPlayPerk(perkId, { monster, target_location: dest })
                });
            }
        });

    } else if (perkName === "Location Inverter") {
        openHeroPicker({
            title: "Location Inverter",
            description: "Choose a Hero to swap with a Monster.",
            onConfirm: (targetHero) => {
                openMonsterPicker({
                    title: "Location Inverter",
                    description: `Swap ${targetHero} with which Monster?`,
                    onConfirm: (monster) => sendPlayPerk(perkId, { target_hero: targetHero, monster })
                });
            }
        });

    } else if (perkName === "Ethereal Goggles") {
        openChoicePicker({
            title: "Ethereal Goggles",
            description: "Choose one:",
            options: [
                { id: "reveal_lair", label: "Reveal a facedown Lair" },
                { id: "move_monster", label: "Move any Monster up to 3 spaces" }
            ],
            onConfirm: (choice) => {
                if (choice === "reveal_lair") {
                    const locations = (gameState.lair_tokens || []).filter(t => !t.revealed).map(t => t.location);
                    openLocationPicker({
                        title: "Ethereal Goggles",
                        description: "Reveal which facedown Lair?",
                        locations,
                        onConfirm: (lairLoc) => sendPlayPerk(perkId, { choice: "reveal_lair", lair_location: lairLoc })
                    });
                } else {
                    openMonsterPicker({
                        title: "Ethereal Goggles",
                        description: "Choose a Monster to move up to 3 spaces.",
                        onConfirm: (monster) => {
                            const dist = clientBfsDistances(gameState.monster_locations[monster]);
                            const locations = Object.keys(dist).filter(l => dist[l] >= 1 && dist[l] <= 3);
                            openLocationPicker({
                                title: "Ethereal Goggles",
                                description: `Move ${monster} to which space (up to 3 spaces away)?`,
                                locations,
                                onConfirm: (dest) => sendPlayPerk(perkId, { choice: "move_monster", monster, target_location: dest })
                            });
                        }
                    });
                }
            }
        });

    } else if (perkName === "Chronohelm") {
        openChoicePicker({
            title: "Chronohelm",
            description: "Choose one:",
            options: [
                { id: "monsters", label: "Move each Monster up to 2 spaces" },
                { id: "heroes", label: "Move each Hero up to 2 spaces" }
            ],
            onConfirm: (choice) => {
                const pool = choice === "monsters" ? (gameState.active_monsters || []) : Object.keys(gameState.heroes_state || {});
                const getLoc = (name) => choice === "monsters" ? gameState.monster_locations[name] : gameState.heroes_state[name].location;
                const targets = {};

                const pickNext = (idx) => {
                    if (idx >= pool.length) {
                        sendPlayPerk(perkId, { choice, targets });
                        return;
                    }
                    const name = pool[idx];
                    const dist = clientBfsDistances(getLoc(name));
                    const locations = Object.keys(dist).filter(l => dist[l] <= 2);
                    openLocationPicker({
                        title: "Chronohelm",
                        description: `Move ${name} up to 2 spaces (${idx + 1}/${pool.length}):`,
                        locations,
                        onConfirm: (dest) => {
                            targets[name] = dest;
                            pickNext(idx + 1);
                        }
                    });
                };
                pickNext(0);
            }
        });

    } else if (perkName === "Clockwork Companion") {
        const locations = Object.keys(gameState.items_on_board || {}).filter(l => (gameState.items_on_board[l] || []).length > 0);
        openLocationPicker({
            title: "Clockwork Companion",
            description: "Take all items from which space?",
            locations,
            onConfirm: (loc) => {
                openHeroPicker({
                    title: "Clockwork Companion",
                    description: `Give all items at ${loc} to which player?`,
                    onConfirm: (targetHero) => sendPlayPerk(perkId, { location: loc, target_hero: targetHero })
                });
            }
        });

    } else if (perkName === "Pneumatic Jetpack") {
        openHeroPicker({
            title: "Pneumatic Jetpack",
            description: "Choose a Hero to place anywhere on the board.",
            onConfirm: (targetHero) => {
                openLocationPicker({
                    title: "Pneumatic Jetpack",
                    description: `Place ${targetHero} at which space?`,
                    onConfirm: (dest) => sendPlayPerk(perkId, { target_hero: targetHero, target_location: dest })
                });
            }
        });

    } else if (perkName === "Ironclad Buggy") {
        const heroLocs = new Set(Object.values(gameState.heroes_state || {}).map(h => h.location));
        openLocationPicker({
            title: "Ironclad Buggy",
            description: "Choose a space that currently has a Hero.",
            locations: Array.from(heroLocs),
            onConfirm: (dest) => {
                openHeroPicker({
                    title: "Ironclad Buggy",
                    description: `Choose any number of Heroes to gather at ${dest}.`,
                    multiSelect: true,
                    confirmLabel: "Gather Heroes",
                    onConfirm: (heroNames) => sendPlayPerk(perkId, { target_location: dest, hero_names: heroNames })
                });
            }
        });
    }
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

