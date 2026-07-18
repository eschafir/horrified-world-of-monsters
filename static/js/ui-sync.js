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
        renderMonsterSelectOptions();

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
        if (elBtnBackToMap) elBtnBackToMap.classList.toggle("hidden", !isHost);
    } else {
        // The game has started!
        elLobbyScreen.classList.add("hidden");
        elGameScreen.classList.remove("hidden");

        // Top Bar info
        document.getElementById("game-room-display").innerText = gameState.room_code;
        const turnPlayer = gameState.players[gameState.turn_player_idx].name;
        const elTurnDisplay = document.getElementById("game-turn-display");
        elTurnDisplay.innerText = turnPlayer;
        elTurnDisplay.classList.toggle("my-turn-active", turnPlayer === playerName);
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

        const elHudDiscardCount = document.getElementById("hud-discard-count");
        if (elHudDiscardCount) {
            elHudDiscardCount.innerText = (gameState.discarded_items || []).length;
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

        document.querySelectorAll(".btn-action").forEach(btn => {
            // Special Power is always 0 AP (Guardian/Investigator/Buccaneer/Fortune
            // Teller/Parapsychologist all say so in their own ability text) - it must
            // stay usable even at 0 AP, unlike every other action here.
            const requiresAp = btn.id !== "action-special";
            btn.disabled = !myTurn || (requiresAp && myState && myState.ap < 1);
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
                // The Fortune Teller's peeked card (if any) stays face-up for the rest
                // of the Hero Phase, and only flips back down once the Monster Phase
                // it was peeking ahead of actually begins.
                dismissFortuneTellerPeek();
            } else {
                secActions.classList.remove("active-phase");
                secMonsterPhase.classList.remove("active-phase");
            }
        }

        // Per-monster defeat sound (fires once per monster, the moment it newly appears
        // in defeated_monsters)
        detectAndPlayMonsterDefeatSounds();

        // Monster Power toast (e.g. Sphinx's Lethal Conundrum) so a sudden Terror bump
        // or missing item doesn't look like it came from nowhere.
        detectAndShowPowerEvents();

        // Citizen spawn toast, with the citizen's portrait, so their arrival is visible
        // beyond the map marker appearing.
        detectAndShowCitizenEvents();

        // Small on-map marker showing the actual dice roll wherever a monster just
        // attacked a citizen, so a vanished citizen / Terror bump isn't unexplained.
        detectAndShowCitizenAttackMarkers();

        // Items a monster sweeps off a board space fly to the Discard Pile instead of
        // just vanishing from items_on_board.
        detectAndShowItemDiscardAnimations();

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

        // The Monster Attack / block-choice modal keeps the map visible behind it
        // (no blur) so the player can see where the attack is actually happening,
        // unlike every other modal (item pickers, info panels, ...) which still blur
        // the board. Re-evaluated every render so it never leaks onto an unrelated
        // modal that opens after this one closes.
        elModalContainer.classList.toggle("modal-no-blur", !!(gameState.pending_dice_roll || gameState.pending_block_choice));

        // Handle Interactive Dice Roll. The permanent sidebar dice (#perm-die-0/1/2)
        // stay showing the last roll's result for the rest of the turn - only cleared
        // when the turn actually changes - instead of disappearing once a blocking
        // modal closes. The attacked player gets a small modal (reusing the app's
        // generic elModalContainer/elModalBody) to click through the roll; everyone
        // else just sees a toast banner while the permanent dice auto-reveal live, so
        // spectators watch the roll happen without a blocking popup of their own.
        function resetPermanentDice() {
            for (let i = 0; i < 3; i++) {
                const slot = document.getElementById(`perm-die-${i}`);
                if (slot) {
                    slot.style.borderColor = "rgba(255,255,255,0.1)";
                    slot.style.boxShadow = "none";
                    slot.style.opacity = "0.5";
                    slot.textContent = "";
                    slot.classList.remove("die-rolling");
                }
            }
        }

        if (lastTurnPlayerIdx !== gameState.turn_player_idx) {
            lastTurnPlayerIdx = gameState.turn_player_idx;
            resetPermanentDice();
        }

        if (gameState.pending_dice_roll) {
            const currentRollId = gameState.pending_dice_roll.id || `${gameState.pending_dice_roll.hero}_${gameState.pending_dice_roll.monster}_${gameState.pending_dice_roll.dice}_${Date.now()}`;
            const isMyRoll = (gameState.pending_dice_roll.hero === playerName);

            if (lastPendingDiceRollId !== currentRollId) {
                lastPendingDiceRollId = currentRollId;
                resetPermanentDice();

                if (isMyRoll) {
                    elModalBody.innerHTML = `
                        <div style="text-align:center; padding: 20px;">
                            <h2 style="color:#ff3366; margin-top:0; text-shadow: 0 0 10px rgba(255, 51, 102, 0.5);">Monster Attack!</h2>
                            <p style="font-size:1.1rem; color:#d4c8eb; margin: 15px 0;">${gameState.pending_dice_roll.monster} is attacking you!</p>
                            <p style="font-size:0.95rem; color:#b0a0cf; margin-bottom: 20px;">Click the dice below to roll them.</p>
                            <div id="modal-dice-container" style="display: flex; gap: 25px; justify-content: center; margin: 25px 0; min-height: 80px;"></div>
                        </div>
                    `;
                    elModalContainer.classList.remove("hidden");

                    const modalDiceContainer = document.getElementById("modal-dice-container");
                    let diceRolled = 0;

                    for (let i = 0; i < gameState.pending_dice_roll.dice; i++) {
                        const result = gameState.pending_dice_roll.results[i];

                        const permSlot = document.getElementById(`perm-die-${i}`);
                        if (permSlot) {
                            permSlot.style.borderColor = "gold";
                            permSlot.style.boxShadow = "0 0 10px gold";
                            permSlot.style.opacity = "1";
                            permSlot.textContent = "?";
                        }

                        const modalDie = document.createElement("div");
                        modalDie.className = "die-button";
                        modalDie.textContent = "?";
                        modalDiceContainer.appendChild(modalDie);

                        modalDie.onclick = () => {
                            if (modalDie.classList.contains("rolled")) return;

                            modalDie.classList.add("die-rolling");
                            if (permSlot) permSlot.classList.add("die-rolling");

                            setTimeout(() => {
                                modalDie.classList.remove("die-rolling");
                                modalDie.classList.add("rolled");
                                if (permSlot) {
                                    permSlot.classList.remove("die-rolling");
                                    permSlot.style.borderColor = "rgba(255,255,255,0.4)";
                                    permSlot.style.boxShadow = "none";
                                }

                                let char = "—";
                                if (result === "Hit") char = "💥";
                                else if (result === "Power") char = "❗";

                                modalDie.textContent = char;
                                if (permSlot) permSlot.textContent = char;

                                diceRolled++;
                                if (diceRolled === gameState.pending_dice_roll.dice) {
                                    const hits = gameState.pending_dice_roll.results.filter(r => r === "Hit").length;
                                    setTimeout(() => {
                                        if (hits === 0) {
                                            elModalContainer.classList.add("hidden");
                                            socket.send(JSON.stringify({ action: "finish_dice_roll" }));
                                        } else {
                                            showDamageSelection(hits);
                                        }
                                    }, 600);
                                }
                            }, 500); // 500ms rolling animation
                        };
                    }
                } else {
                    // Not my roll! Show a 3-second banner while the permanent dice
                    // reveal themselves live, one by one.
                    const div = document.createElement("div");
                    div.className = "glass";
                    div.style.cssText = "position:fixed; top:30px; left:50%; transform:translateX(-50%); padding:15px 30px; z-index:10000; color:#ff3366; font-size:1.2rem; border-radius:10px; box-shadow:0 0 20px rgba(255, 51, 102, 0.6);";
                    div.textContent = `${gameState.pending_dice_roll.monster} is attacking ${gameState.pending_dice_roll.hero}!`;
                    document.body.appendChild(div);
                    setTimeout(() => div.remove(), 3000);

                    for (let i = 0; i < gameState.pending_dice_roll.dice; i++) {
                        const permSlot = document.getElementById(`perm-die-${i}`);
                        if (permSlot) {
                            permSlot.style.borderColor = "gold";
                            permSlot.style.boxShadow = "0 0 10px gold";
                            permSlot.style.opacity = "1";
                            permSlot.textContent = "?";
                        }
                    }

                    let idx = 0;
                    const interval = setInterval(() => {
                        // Check if pending roll was somehow resolved early (e.g. they disconnected)
                        if (idx >= gameState.pending_dice_roll?.dice) {
                            clearInterval(interval);
                            return;
                        }
                        const permSlot = document.getElementById(`perm-die-${idx}`);
                        const result = gameState.pending_dice_roll.results[idx];
                        if (permSlot) {
                            permSlot.classList.add("die-rolling");
                            setTimeout(() => {
                                permSlot.classList.remove("die-rolling");
                                permSlot.style.borderColor = "rgba(255,255,255,0.4)";
                                permSlot.style.boxShadow = "none";

                                let char = "—";
                                if (result === "Hit") char = "💥";
                                else if (result === "Power") char = "❗";
                                permSlot.textContent = char;
                            }, 500);
                        }
                        idx++;
                    }, 800);
                }
            }
        } else if (gameState.pending_block_choice) {
            // A monster Power targeting a single hero directly (e.g. the Yeti's Snow
            // Blast) reuses the same generic modal's item-selection step, just with no
            // dice to roll first.
            lastPendingDiceRollId = "";
            const pending = gameState.pending_block_choice;

            if (pending.hero === playerName) {
                if (lastBlockChoiceId !== pending.id) {
                    lastBlockChoiceId = pending.id;
                    showDamageSelection(pending.hits, "finish_block_choice", `The ${pending.reason} targets you!`, pending.required_color);
                }
            } else if (lastBlockChoiceId !== pending.id) {
                lastBlockChoiceId = pending.id;
                const div = document.createElement("div");
                div.className = "glass";
                div.style.cssText = "position:fixed; top:30px; left:50%; transform:translateX(-50%); padding:15px 30px; z-index:10000; color:#ff3366; font-size:1.2rem; border-radius:10px; box-shadow:0 0 20px rgba(255, 51, 102, 0.6);";
                div.textContent = `${pending.reason}! ${pending.hero} is defending...`;
                document.body.appendChild(div);
                setTimeout(() => div.remove(), 3000);
            }
        } else {
            lastPendingDiceRollId = "";
            lastBlockChoiceId = "";
        }

        // Render Sidebar lists (Inventory)
        renderPlayerPanel();

        // finishAction lets this be reused for both a dice-roll's hits and a monster
        // Power that targets a single hero directly (e.g. the Yeti's Snow Blast) -
        // either way it's "select N items to block, or take the damage".
        function showDamageSelection(hits, finishAction = "finish_dice_roll", promptPrefix = null, requiredColor = null) {
            let html = `<div style="text-align:center; padding: 10px;">`;
            html += `<h2 style="color:#ff3366; margin-top:0; text-shadow: 0 0 10px rgba(255, 51, 102, 0.5);">Take Damage</h2>`;

            const colorNote = requiredColor ? ` Only ${requiredColor} items can block it.` : "";
            const desc = promptPrefix
                ? `${promptPrefix} Select ${hits} item${hits !== 1 ? "s" : ""} to discard and block it, or take the damage.${colorNote}`
                : `You took ${hits} hit${hits !== 1 ? "s" : ""}! Select ${hits} item${hits !== 1 ? "s" : ""} to discard and block it, or take the damage.${colorNote}`;

            html += `<p style="font-size:1.05rem; color:#d4c8eb;">${desc}</p>`;

            const myState = gameState.heroes_state[playerName];
            const eligibleItems = requiredColor ? myState.items.filter(i => i.color === requiredColor) : myState.items;
            let selectedIds = new Set();

            if (eligibleItems.length === 0) {
                const label = requiredColor ? `${requiredColor} items` : "items";
                html += `<p style="color: #ff3366; font-size: 1.1rem; margin:25px 0;">You have no ${label} to block the damage!</p>`;
            } else {
                html += `<div id="damage-items-container" style="display:flex; flex-wrap:wrap; justify-content:center; gap:12px; margin:25px 0;"></div>`;
            }

            html += `
                <hr style="border-color:rgba(255,255,255,0.05); margin: 20px 0;">
                <div style="display:flex; justify-content:center; gap:15px; margin-top:20px;">
                    <button class="btn btn-danger" id="btn-take-damage" style="font-size: 1.05rem;">Take Damage (Terror +1)</button>
                    <button class="btn btn-primary hidden" id="btn-block-damage" style="font-size: 1.05rem;">Block Damage</button>
                </div>
            </div>`;

            elModalBody.innerHTML = html;
            elModalContainer.classList.remove("hidden");

            const btnTake = document.getElementById("btn-take-damage");
            const btnBlock = document.getElementById("btn-block-damage");

            btnTake.onclick = () => {
                btnTake.disabled = true;
                btnTake.textContent = "Processing...";
                if (btnBlock) btnBlock.disabled = true;
                elModalContainer.classList.add("hidden");
                socket.send(JSON.stringify({ action: finishAction }));
            };

            if (eligibleItems.length > 0) {
                const itemsContainer = document.getElementById("damage-items-container");
                // Image + color-coded border, matching the item cards used everywhere
                // else (Pick Up modal, puzzle item pickers) so items are recognizable
                // at a glance instead of a plain colored square + text row.
                eligibleItems.forEach(item => {
                    const imgSrc = item.artwork ? `/assets/items/${item.artwork}` : "";
                    const colorHex = getItemColorHex(item.color);

                    const itemEl = document.createElement("div");
                    itemEl.className = "inventory-item glass";
                    itemEl.style.cssText = "width:84px; text-align:center; cursor:pointer; padding:10px 15px; border:2px solid transparent; border-radius:8px; transition:all 0.2s ease;";
                    itemEl.innerHTML = `
                        <div class="pickup-item-thumb" style="width:64px; height:64px; margin:0 auto 6px; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.05); border:3px solid ${colorHex}; display:flex; align-items:center; justify-content:center; transition: box-shadow 0.15s ease;">
                            ${imgSrc ? `<img src="${imgSrc}" alt="${item.name}" style="width:100%; height:100%; object-fit:contain;" onerror="this.parentElement.style.visibility='hidden'">` : ''}
                        </div>
                        <div style="font-size:0.68rem; color:#e5d9c8; line-height:1.2;">${item.name}</div>
                        <div style="font-size:0.65rem; color:#a491c3;"><strong>${item.strength}</strong></div>
                    `;
                    const thumb = itemEl.querySelector(".pickup-item-thumb");

                    itemEl.onclick = () => {
                        if (selectedIds.has(item.id)) {
                            selectedIds.delete(item.id);
                            itemEl.style.borderColor = "transparent";
                            itemEl.style.boxShadow = "none";
                            thumb.style.boxShadow = "none";
                        } else {
                            selectedIds.add(item.id);
                            itemEl.style.borderColor = "#ffcc00";
                            itemEl.style.boxShadow = "0 0 12px rgba(255, 204, 0, 0.4)";
                            thumb.style.boxShadow = "0 0 10px 2px rgba(255, 213, 51, 0.8)";
                        }

                        if (selectedIds.size >= hits) {
                            btnBlock.classList.remove("hidden");
                        } else {
                            btnBlock.classList.add("hidden");
                        }
                    };
                    itemsContainer.appendChild(itemEl);
                });

                btnBlock.onclick = () => {
                    btnBlock.disabled = true;
                    btnBlock.textContent = "Processing...";
                    btnTake.disabled = true;
                    elModalContainer.classList.add("hidden");
                    socket.send(JSON.stringify({ action: finishAction, item_ids: Array.from(selectedIds) }));
                };
            }
        }

        // Render turn status banner (whose turn, and their remaining AP) + AP counter bar
        renderTurnStatusBanner();
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
