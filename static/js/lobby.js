// ---------------------------------------------------------
// HERO & MONSTER SELECTION RENDERING (LOBBY)
// ---------------------------------------------------------

// Maps a monster catalog's "complexity" field to the select-card's difficulty badge.
// Complexity, origin_map, selectable, displayName, and summary all live in each
// monster's data/monsters/<name>.json - see CLAUDE.md - so adding a new monster never
// requires touching this table.
const COMPLEXITY_DIFF = {
    "Low": { label: "Easy", cls: "diff-easy" },
    "Medium": { label: "Medium", cls: "diff-medium" },
    "High": { label: "Hard", cls: "diff-hard" },
    "Very High": { label: "Very Hard", cls: "diff-vhard" }
};

function renderMonsterSelectOptions() {
    const elMonsterOptions = document.getElementById("monster-options");
    if (!elMonsterOptions) return;
    elMonsterOptions.innerHTML = "";

    const catalog = (gameState && gameState.monster_catalog) || {};
    // Scaffolded-but-not-yet-implemented monsters (empty phases, no Advance/Defeat logic)
    // are excluded from the picker entirely so a host can't start an uncompletable game.
    const monsterNames = Object.keys(catalog).filter(m => catalog[m].selectable !== false);

    const currentMap = gameState ? gameState.selected_map : "Map.png";
    const localMonsters = monsterNames.filter(m => catalog[m].origin_map === currentMap);
    const guestMonsters = monsterNames.filter(m => catalog[m].origin_map !== currentMap);

    const me = gameState && gameState.players && gameState.players.find(p => p.name === playerName);
    const isHost = !!(me && me.is_host);

    const renderMonsterCard = (monster, isLocal) => {
        const data = catalog[monster];
        const diff = COMPLEXITY_DIFF[data.complexity] || { label: data.complexity || "?", cls: "diff-medium" };
        const card = document.createElement("label");
        card.className = `monster-select-card monster-${monster.toLowerCase()}`;

        const isChecked = (gameState && gameState.selected_monsters && gameState.selected_monsters.includes(monster)) ? "checked" : "";
        const badge = isLocal ? `<span class="hero-local-badge" style="margin-bottom:8px; display:inline-block">Local Monster</span>` : `<span class="hero-guest-badge" style="margin-bottom:8px; display:inline-block">Guest Monster</span>`;

        card.innerHTML = `
            <input type="checkbox" id="mon-${monster.toLowerCase()}" value="${monster}" ${isChecked}>
            <div class="monster-select-portrait-wrap">
                <div class="monster-select-portrait">
                    <img src="/Images/Monsters/${monster}.png" alt="${monster}">
                </div>
                <button type="button" class="monster-select-info-btn" title="View ${monster} details" onclick="event.preventDefault(); event.stopPropagation(); showMonsterInfoModal('${monster}')">i</button>
            </div>
            ${badge}
            <div class="monster-select-name">${data.displayName || monster} (&#9889; ${getMonsterFrenzyLevel(monster)})</div>
            <div class="monster-select-diff ${diff.cls}">${diff.label}</div>
            <div class="monster-select-desc">${data.summary || data.objective || ""}</div>
        `;

        const cb = card.querySelector("input");
        cb.disabled = !isHost;
        cb.addEventListener("change", () => {
            if (!isHost) return;
            const selectedMonsters = Array.from(elMonsterOptions.querySelectorAll("input:checked")).map(el => el.value);
            sendMsg({ action: "select_monsters", monsters: selectedMonsters });
        });

        elMonsterOptions.appendChild(card);
    };

    localMonsters.forEach(m => renderMonsterCard(m, true));

    if (guestMonsters.length > 0) {
        const divider = document.createElement("div");
        divider.className = "hero-category-divider";
        divider.innerHTML = `<span>Guest Monsters</span>`;
        elMonsterOptions.appendChild(divider);
        guestMonsters.forEach(m => renderMonsterCard(m, false));
    }
}

function renderHeroSelectOptions() {
    elHeroOptions.innerHTML = "";

    const heroData = {
        "The Guardian":         { ap: 5, start: "Arcane Forge",        ability: "Guide a hero at your location to an adjacent space — no AP cost.", origin_map: "Map.png" },
        "The Investigator":     { ap: 4, start: "South Station",       ability: "Discard 2 items to retrieve any 1 item from the discard pile.", origin_map: "Map.png" },
        "The Buccaneer":        { ap: 3, start: "The Scuttled Siren",  ability: "Discard 1 item at turn start to gain +4 AP this turn.", origin_map: "Map.png" },
        "The Fortune Teller":   { ap: 4, start: "The Fool's Journey",  ability: "Peek at the top Monster Card for free, once per turn.", origin_map: "Map.png" },
        "The Parapsychologist": { ap: 4, start: "Weir's Observatory",  ability: "Send any item from your hand to any player anywhere on the board.", origin_map: "Map.png" },
        "Actor":                { ap: 4, start: "Agora",               ability: "Discard two Items to pick one Item from the discard pile and keep it.", origin_map: "map-greek.png" },
        "Hoplite":              { ap: 4, start: "Battlefield",         ability: "Place your Hero in a space with a Lair.", origin_map: "map-greek.png" },
        "Mariner":              { ap: 4, start: "Port",                ability: "Give any number of Items you have to another player.", origin_map: "map-greek.png" },
        "Musician":             { ap: 4, start: "Odeon",               ability: "Place your Hero in a space with a Legend.", origin_map: "map-greek.png" },
        "Ranger":               { ap: 4, start: "Forest of the Dryads",ability: "When the Terror Level increases, draw a Perk card. Ability is always in effect and does not take an action.", origin_map: "map-greek.png" },
        "Shepherd":             { ap: 4, start: "Vineyard",            ability: "Look at the top Monster card.", origin_map: "map-greek.png" },
        "Traveler":             { ap: 5, start: "Stables",             ability: "None", origin_map: "map-greek.png" }
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

    const currentMap = gameState ? gameState.selected_map : "Map.png";

    const localHeroes = HEROES_LIST.filter(hero => heroData[hero].origin_map === currentMap);
    const guestHeroes = HEROES_LIST.filter(hero => heroData[hero].origin_map !== currentMap);

    const renderHeroCard = (hero, isLocal) => {
        const data = heroData[hero];
        const takenByName = takenBy[hero];
        const card = document.createElement("div");
        card.className = `hero-card ${chosenHero === hero ? "selected" : ""} ${takenByName ? "taken" : ""}`;

        const heroBadge = isLocal ? `<span class="hero-local-badge">Local Hero</span>` : `<span class="hero-guest-badge">Guest Hero</span>`;

        card.innerHTML = `
            <div class="hero-card-portrait-wrap">
                <div class="hero-card-portrait">
                    <img src="/Images/Heroes/${hero} Image.png" alt="${hero}" onerror="this.src='/Images/Heroes/placeholder.png';">
                </div>
                <button type="button" class="hero-card-info-btn" title="View ${hero} card" onclick="event.stopPropagation(); showHeroCardModal('${hero}')">i</button>
            </div>
            <div class="hero-card-name">${hero}</div>
            <div class="hero-card-badges">${heroBadge}</div>
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
    };

    localHeroes.forEach(hero => renderHeroCard(hero, true));

    if (guestHeroes.length > 0) {
        const divider = document.createElement("div");
        divider.className = "hero-category-divider";
        divider.innerHTML = `<span>Guest Heroes</span>`;
        elHeroOptions.appendChild(divider);
        guestHeroes.forEach(hero => renderHeroCard(hero, false));
    }
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

