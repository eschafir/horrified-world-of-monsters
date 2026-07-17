// ---------------------------------------------------------
// HERO SELECTION RENDERING (LOBBY)
// ---------------------------------------------------------

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

