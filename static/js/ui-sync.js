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

        // Monster Power toast (e.g. Sphinx's Lethal Conundrum) so a sudden Terror bump
        // or missing item doesn't look like it came from nowhere.
        detectAndShowPowerEvents();

        // Citizen spawn toast, with the citizen's portrait, so their arrival is visible
        // beyond the map marker appearing.
        detectAndShowCitizenEvents();

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
                const titleEl = document.getElementById("dice-modal-title");
                if (titleEl) titleEl.textContent = "Monster Attack!";

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
                                        die.textContent = "💥";
                                    } else if (result === "Power") {
                                        die.textContent = "❗";
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
            } else if (gameState.pending_block_choice) {
                // A monster Power targeting a single hero directly (e.g. the Yeti's Snow
                // Blast) reuses this same overlay's item-selection step, just with no
                // dice to roll first.
                lastPendingDiceRollId = "";
                const pending = gameState.pending_block_choice;
                const titleEl = document.getElementById("dice-modal-title");
                const descEl = document.getElementById("dice-modal-desc");

                if (pending.hero === playerName) {
                    if (lastBlockChoiceId !== pending.id) {
                        lastBlockChoiceId = pending.id;
                        if (titleEl) titleEl.textContent = `${pending.reason}!`;
                        showDamageSelection(pending.hits, "finish_block_choice", `The ${pending.reason} targets you!`);
                    }
                } else {
                    lastBlockChoiceId = "";
                    if (titleEl) titleEl.textContent = `${pending.reason}!`;
                    if (descEl) descEl.textContent = `${pending.hero} is defending against the ${pending.reason}...`;
                    document.getElementById("dice-container").innerHTML = "";
                    btnFinishDice.classList.add("hidden");
                    const existingBlockBtn = document.getElementById("btn-block-damage");
                    if (existingBlockBtn) existingBlockBtn.remove();
                }
                elDiceOverlay.classList.remove("hidden");
            } else {
                elDiceOverlay.classList.add("hidden");
                lastPendingDiceRollId = "";
                lastBlockChoiceId = "";
                const existing = document.getElementById("btn-block-damage");
                if (existing) existing.remove();
            }
        }

        // Render Sidebar lists (Inventory)
        renderPlayerPanel();
        
        // finishAction lets this be reused for both a dice-roll's hits and a monster
        // Power that targets a single hero directly (e.g. the Yeti's Snow Blast) -
        // either way it's "select N items to block, or take the damage".
        function showDamageSelection(hits, finishAction = "finish_dice_roll", promptPrefix = null) {
            const container = document.getElementById("dice-container");
            const descEl = document.getElementById("dice-modal-desc");
            const btnFinishDice = document.getElementById("btn-finish-dice");

            descEl.textContent = promptPrefix
                ? `${promptPrefix} Select ${hits} item${hits !== 1 ? "s" : ""} to discard and block it, or take the damage.`
                : `You took ${hits} hit${hits !== 1 ? "s" : ""}! Select ${hits} item${hits !== 1 ? "s" : ""} to discard and block it, or take the damage.`;
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

                // Image + color-coded border, matching the item cards used everywhere
                // else (Pick Up modal, puzzle item pickers) so items are recognizable
                // at a glance instead of a plain colored square + text row.
                myState.items.forEach(item => {
                    const imgSrc = item.artwork ? `/assets/items/${item.artwork}` : "";
                    const colorHex = getItemColorHex(item.color);

                    const itemEl = document.createElement("div");
                    itemEl.className = "inventory-item";
                    itemEl.style.cssText = "width:84px; text-align:center; cursor:pointer;";
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
                            thumb.style.boxShadow = "none";
                        } else {
                            selectedIds.add(item.id);
                            thumb.style.boxShadow = "0 0 10px 2px rgba(255, 213, 51, 0.8)";
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
                socket.send(JSON.stringify({ action: finishAction }));
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
                // One item per Hit rolled - strength no longer matters for blocking.
                if (selectedIds.size >= hits) {
                    btnBlock.classList.remove("hidden");
                    btnBlock.onclick = () => {
                        btnBlock.disabled = true;
                        btnBlock.textContent = "Processing...";
                        btnFinishDice.disabled = true;
                        const overlay = document.getElementById("dice-modal-overlay");
                        if (overlay) overlay.classList.add("hidden");
                        socket.send(JSON.stringify({ action: finishAction, item_ids: Array.from(selectedIds) }));
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
