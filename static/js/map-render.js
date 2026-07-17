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
    const invPanel = document.getElementById("gtab-btn-my-hero") || document.getElementById("gtab-btn-hero") || document.getElementById("player-inventory") || document.getElementById("sec-player");
    if (!invPanel) return;
    const screenEnd = invPanel.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.className = "flying-item-token";
    
    const colorMap = {
        blue: "#33ccff",
        purple: "#a64dff",
        green: "#33ff66"
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
        
        // Add a temporary landing ripple/glow in player inventory/tab button
        invPanel.style.transition = "box-shadow 0.3s, background-color 0.3s";
        invPanel.style.boxShadow = `0 0 25px ${circleColor}`;
        
        // Convert hex to semi-transparent rgba for background-color flash
        const hexToRgba = (hex, alpha) => {
            if (hex.startsWith("#")) {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
            return hex;
        };
        invPanel.style.backgroundColor = hexToRgba(circleColor, 0.2);
        
        setTimeout(() => {
            invPanel.style.boxShadow = "";
            invPanel.style.backgroundColor = "";
        }, 500);
    }, { once: true });
}

function triggerNodePulse(svgX, svgY, radius, pulseColor, strokeWidth = 3, scaleEnd = 3.5) {
    const pulseCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pulseCircle.setAttribute("cx", svgX.toString());
    pulseCircle.setAttribute("cy", svgY.toString());
    pulseCircle.setAttribute("r", radius.toString());
    pulseCircle.setAttribute("fill", "none");
    pulseCircle.setAttribute("stroke", pulseColor);
    pulseCircle.setAttribute("stroke-width", strokeWidth.toString());
    
    pulseCircle.style.transformBox = "fill-box";
    pulseCircle.style.transformOrigin = "center";
    pulseCircle.style.setProperty("--scale-end", scaleEnd.toString());
    pulseCircle.style.animation = "svgPulseScale 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards";
    
    if (elGameMap) {
        elGameMap.appendChild(pulseCircle);
        setTimeout(() => {
            pulseCircle.remove();
        }, 850);
    }
}

// Builds a neon LED-style glowing outline tracing ONLY the contour of the Terror
// Level placeholder — either a plain circle (radius `r`) or a custom polygon shape
// (array of [dx, dy] points relative to cx,cy) — leaving the entire interior empty
// so the level number printed on the board art shows through. Layered stroke glow
// (like CSS neon-text tricks) plus a bright segment that chases around the strip,
// matching the game's existing neon/glow visual language (hero token glows, pulses).
function createNeonRing(cx, cy, r = 28, polygonPoints = null) {
    const svgNS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "neon-ring-group");
    g.setAttribute("pointer-events", "none"); // purely decorative — never block dragging the hitbox/vertex handles underneath

    const usePolygon = polygonPoints && polygonPoints.length >= 3;
    const pointsAttr = usePolygon
        ? polygonPoints.map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`).join(" ")
        : null;

    let perimeter;
    if (usePolygon) {
        const abs = polygonPoints.map(([dx, dy]) => [cx + dx, cy + dy]);
        perimeter = 0;
        for (let i = 0; i < abs.length; i++) {
            const a = abs[i], b = abs[(i + 1) % abs.length];
            perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
        }
    } else {
        perimeter = 2 * Math.PI * r;
    }

    const makeShape = () => {
        if (usePolygon) {
            const p = document.createElementNS(svgNS, "polygon");
            p.setAttribute("pointer-events", "none");
            p.setAttribute("points", pointsAttr);
            return p;
        }
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("pointer-events", "none");
        c.setAttribute("cx", cx);
        c.setAttribute("cy", cy);
        c.setAttribute("r", r);
        return c;
    };

    // Layered glow, dark-crimson core hue, widest+softest at the bottom, tight+bright on top.
    // Each layer traces the FULL contour (not just a segment) so the whole shape reads as lit.
    const layers = [
        { width: 20, color: "#8c0f34", blur: 9, cls: "neon-outer-pulse" },
        { width: 12, color: "#b3123f", blur: 4.5, cls: "neon-mid-pulse" },
        { width: 5, color: "#e0567f", blur: 0.6, cls: "neon-core-pulse" }
    ];
    layers.forEach((layer, idx) => {
        const el = makeShape();
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", layer.color);
        el.setAttribute("stroke-width", layer.width);
        el.setAttribute("stroke-linejoin", "round");
        el.style.filter = `blur(${layer.blur}px)`;
        el.classList.add(layer.cls);
        el.style.animationDelay = `${-idx * 0.6}s`;
        g.appendChild(el);
    });

    // Bright segment chasing around the strip, like an addressable LED marquee
    const chase = makeShape();
    chase.setAttribute("fill", "none");
    chase.setAttribute("stroke", "#ffd9e3");
    chase.setAttribute("stroke-width", "4");
    chase.setAttribute("stroke-linecap", "round");
    const dashLen = Math.max(10, perimeter * 0.16);
    chase.setAttribute("stroke-dasharray", `${dashLen.toFixed(1)} ${Math.max(1, perimeter - dashLen).toFixed(1)}`);
    chase.style.filter = "drop-shadow(0 0 3px #ffd9e3) drop-shadow(0 0 6px #b3123f)";
    const anim = document.createElementNS(svgNS, "animate");
    anim.setAttribute("attributeName", "stroke-dashoffset");
    anim.setAttribute("from", "0");
    anim.setAttribute("to", `${-perimeter.toFixed(1)}`);
    anim.setAttribute("dur", "4.5s");
    anim.setAttribute("repeatCount", "indefinite");
    chase.appendChild(anim);
    g.appendChild(chase);

    return g;
}

function animateItemSpawn(item, locName) {
    const coord = gameState.node_coordinates[locName];
    if (!coord) return;
    
    const items = gameState.items_on_board[locName] || [];
    const index = items.findIndex(it => it.id === item.id);
    const offset = getItemOffset(index !== -1 ? index : 0, coord.r || 35);
    
    const targetSvgX = coord.x + offset.x;
    const targetSvgY = coord.y + offset.y;
    
    const screenEnd = getScreenCoordsOfSVGPoint(targetSvgX, targetSvgY);
    const cardPanel = document.getElementById("sec-monster-phase");
    if (!cardPanel) return;
    const screenStart = cardPanel.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.className = "flying-item-token";
    
    const colorMap = {
        blue: "#33ccff",
        purple: "#a64dff",
        green: "#33ff66"
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
        triggerNodePulse(targetSvgX, targetSvgY, 12, circleColor);
        fly.remove();
    }, { once: true });
}

function animateLairSpawn(locName) {
    const coord = gameState.node_coordinates[locName];
    if (!coord) return;
    
    const targetSvgX = coord.x;
    const targetSvgY = coord.y;
    const screenEnd = getScreenCoordsOfSVGPoint(targetSvgX, targetSvgY);
    const cardPanel = document.getElementById("sec-monster-phase");
    if (!cardPanel) return;
    const screenStart = cardPanel.getBoundingClientRect();
    
    const fly = document.createElement("div");
    fly.style.cssText = `
        position: fixed;
        left: ${screenStart.left + screenStart.width / 2 - 20}px;
        top: ${screenStart.top + screenStart.height / 2 - 14}px;
        width: 40px;
        height: 28px;
        background: url('/Images/Lair Tokens/lair_token_back.png') center/cover;
        border: 2px solid #fff;
        border-radius: 4px;
        z-index: 10000;
        pointer-events: none;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        opacity: 0;
        transform: scale(0.5);
        transition: left 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    top 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    transform 0.9s cubic-bezier(0.25, 1, 0.5, 1),
                    opacity 0.9s ease;
    `;
    document.body.appendChild(fly);
    
    requestAnimationFrame(() => requestAnimationFrame(() => {
        fly.style.left = `${screenEnd.left - 20}px`;
        fly.style.top = `${screenEnd.top - 14}px`;
        fly.style.transform = "scale(1)";
        fly.style.opacity = "1";
    }));
    
    fly.addEventListener("transitionend", () => {
        triggerNodePulse(targetSvgX, targetSvgY, 20, "#fff");
        fly.remove();
    }, { once: true });
}


function renderSVGMap() {
    const w = baseWidth / zoomLevel;
    const h = baseHeight / zoomLevel;
    elGameMap.setAttribute("viewBox", `${panX} ${panY} ${w} ${h}`);

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

    // Create pattern for Jiangshi face marker
    const patternJiangshi = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    patternJiangshi.setAttribute("id", "pattern-jiangshi");
    patternJiangshi.setAttribute("x", "0");
    patternJiangshi.setAttribute("y", "0");
    patternJiangshi.setAttribute("height", "1");
    patternJiangshi.setAttribute("width", "1");
    patternJiangshi.setAttribute("patternContentUnits", "objectBoundingBox");

    const imgJiangshi = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imgJiangshi.setAttribute("href", "/Images/Monsters/Jiangshi.png");
    imgJiangshi.setAttribute("x", "0");
    imgJiangshi.setAttribute("y", "0");
    imgJiangshi.setAttribute("height", "1");
    imgJiangshi.setAttribute("width", "1");
    imgJiangshi.setAttribute("preserveAspectRatio", "xMidYMid slice");

    patternJiangshi.appendChild(imgJiangshi);
    defs.appendChild(patternJiangshi);

    // Create pattern for Cthulhu face marker
    const patternCthulhu = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    patternCthulhu.setAttribute("id", "pattern-cthulhu");
    patternCthulhu.setAttribute("x", "0");
    patternCthulhu.setAttribute("y", "0");
    patternCthulhu.setAttribute("height", "1");
    patternCthulhu.setAttribute("width", "1");
    patternCthulhu.setAttribute("patternContentUnits", "objectBoundingBox");

    const imgCthulhu = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imgCthulhu.setAttribute("href", "/Images/Monsters/Cthulhu.png");
    imgCthulhu.setAttribute("x", "0");
    imgCthulhu.setAttribute("y", "0");
    imgCthulhu.setAttribute("height", "1");
    imgCthulhu.setAttribute("width", "1");
    imgCthulhu.setAttribute("preserveAspectRatio", "xMidYMid slice");

    patternCthulhu.appendChild(imgCthulhu);
    defs.appendChild(patternCthulhu);

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

    const lairImages = [
        { id: "pattern-lair-back", url: "/Images/Lair Tokens/lair_token_back.png" },
        { id: "pattern-lair-yeti", url: "/Images/Lair Tokens/yeti_lair_token.png" },
        { id: "pattern-lair-jiangshi", url: "/Images/Lair Tokens/jianshi_lair_token.png" },
        { id: "pattern-lair-blank", url: "/Images/Lair Tokens/blank_lair_token.png" }
    ];
    lairImages.forEach(lairImg => {
        const patLair = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patLair.setAttribute("id", lairImg.id);
        patLair.setAttribute("x", "0");
        patLair.setAttribute("y", "0");
        patLair.setAttribute("height", "1");
        patLair.setAttribute("width", "1");
        patLair.setAttribute("patternContentUnits", "objectBoundingBox");
        const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("href", lairImg.url);
        img.setAttribute("x", "0");
        img.setAttribute("y", "0");
        img.setAttribute("height", "1");
        img.setAttribute("width", "1");
        img.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patLair.appendChild(img);
        defs.appendChild(patLair);
    });

    // Create image patterns for heroes
    HEROES_LIST.forEach(heroClass => {
        const patHero = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patHero.setAttribute("id", `pattern-hero-${heroClass.replaceAll(" ", "_")}`);
        patHero.setAttribute("x", "0");
        patHero.setAttribute("y", "0");
        patHero.setAttribute("height", "1");
        patHero.setAttribute("width", "1");
        patHero.setAttribute("patternContentUnits", "objectBoundingBox");
        const imgHero = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imgHero.setAttribute("href", `/Images/Heroes/${heroClass} Image.png`);
        imgHero.setAttribute("x", "0");
        imgHero.setAttribute("y", "0");
        imgHero.setAttribute("height", "1");
        imgHero.setAttribute("width", "1");
        imgHero.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patHero.appendChild(imgHero);
        defs.appendChild(patHero);
    });

    // Create image patterns for citizens currently in play. Each citizen's "portrait"
    // (from server.py) is the real filename in Images/Citizens/ — names don't all
    // slugify cleanly (e.g. "Dr. Weir" -> dr_weir.png) and not every portrait is a
    // .png, so we never guess the path client-side.
    for (const citName in (gameState.citizens || {})) {
        const cit = gameState.citizens[citName];
        const portrait = cit.portrait || `${citName}.png`;
        const patCit = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
        patCit.setAttribute("id", `pattern-citizen-${citName.replaceAll(" ", "_")}`);
        patCit.setAttribute("x", "0");
        patCit.setAttribute("y", "0");
        patCit.setAttribute("height", "1");
        patCit.setAttribute("width", "1");
        patCit.setAttribute("patternContentUnits", "objectBoundingBox");
        const imgCit = document.createElementNS("http://www.w3.org/2000/svg", "image");
        imgCit.setAttribute("href", `/Images/Citizens/${portrait}`);
        imgCit.setAttribute("x", "0");
        imgCit.setAttribute("y", "0");
        imgCit.setAttribute("height", "1");
        imgCit.setAttribute("width", "1");
        imgCit.setAttribute("preserveAspectRatio", "xMidYMid slice");
        patCit.appendChild(imgCit);
        defs.appendChild(patCit);
    }

    elGameMap.appendChild(defs);

    // Create Background Map Image programmatically (namespace-safe)
    const bgImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
    bgImage.setAttribute("id", "game-map-image");
    const mapFile = gameState.selected_map || "Map.png";
    bgImage.setAttribute("href", `/Images/${mapFile}?v=2`);
    bgImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", `/Images/${mapFile}?v=2`);
    bgImage.setAttribute("x", "0");
    bgImage.setAttribute("y", "0");
    bgImage.setAttribute("width", "1304");
    bgImage.setAttribute("height", "1206");
    elGameMap.appendChild(bgImage);


    let fallbackX = 60;
    let fallbackY = 60;
    const checkLoc = (loc) => {
        if (loc && loc !== "Board" && !gameState.node_coordinates[loc]) {
            gameState.node_coordinates[loc] = {x: fallbackX, y: fallbackY, r: 28, type: "circle"};
            fallbackX += 80;
            if (fallbackX > 1200) { fallbackX = 60; fallbackY += 80; }
        }
    };
    if (gameState.items_on_board) Object.keys(gameState.items_on_board).forEach(checkLoc);
    if (gameState.heroes_state) Object.values(gameState.heroes_state).forEach(h => checkLoc(h.location));
    if (gameState.monster_locations) Object.values(gameState.monster_locations).forEach(checkLoc);
    if (gameState.citizens) Object.values(gameState.citizens).forEach(c => checkLoc(c.location));
    if (gameState.monster_states && gameState.monster_states["Yeti"]) {
        gameState.monster_states["Yeti"].children.forEach(c => checkLoc(c.location));
    }
    if (gameState.lair_tokens) {
        gameState.lair_tokens.forEach(t => checkLoc(t.location));
    }


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

    // Guide Mode: precompute step 1 (eligible legends) or step 2 (valid destinations)
    // once, outside the per-node loop below.
    let guideEligibleNames = [];
    let guideDestinations = [];
    if (selectedAction === "guide") {
        const guideMyState = gameState.heroes_state[playerName];
        const guideIsTurn = (gameState.players[gameState.turn_player_idx].name === playerName);
        if (guideMyState && guideIsTurn) {
            const guideAdjacent = adjList[guideMyState.location] || [];
            if (guideSelectedLegend) {
                guideDestinations = getGuideValidTargets(guideMyState.location, guideAdjacent, guideSelectedLegend);
            } else {
                guideEligibleNames = getEligibleGuideLegends(guideMyState.location, guideAdjacent).map(l => l.name);
            }
        }
    }

    // 2. Draw nodes (circles)
    for (const locName in coordinates) {
        const coord = coordinates[locName];

        // Highlight destinations if we are in MOVE mode
        const myState = gameState.heroes_state[playerName];
        const isTurn = (gameState.players[gameState.turn_player_idx].name === playerName);
        const adjacent = myState ? adjList[myState.location] : [];
        const isMoveTarget = (selectedAction === "move") && isTurn && (adjacent.includes(locName) || (myState.hero === "Explorer" && isDoubleJump(myState.location, locName)));
        const isGuideTarget = guideDestinations.includes(locName);
        const isMapPickerTarget = (selectedAction === "map_location_picker") && mapLocationPickerTargets && mapLocationPickerTargets.includes(locName);
        const isActiveDest = isMoveTarget || isGuideTarget || isMapPickerTarget;

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
        circle.setAttribute("class", `map-node ${isActiveDest ? "active-dest" : ""}`);
        
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
        } else if (isGuideTarget) {
            circle.addEventListener("click", (e) => {
                if (window.isDragging) return;
                sendMsg({ action: "guide", legend: guideSelectedLegend.name, target: locName });
                selectedAction = null;
                guideSelectedLegend = null;
            });
        } else if (isMapPickerTarget) {
            circle.addEventListener("click", (e) => {
                if (window.isDragging) return;
                const callback = mapLocationPickerCallback;
                selectedAction = null;
                mapLocationPickerTargets = null;
                mapLocationPickerCallback = null;
                if (callback) callback(locName);
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
            rect.setAttribute("class", `map-node ${isActiveDest ? "active-dest" : ""}`);
            
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
            } else if (isGuideTarget) {
                rect.addEventListener("click", (e) => {
                    if (window.isDragging) return;
                    sendMsg({ action: "guide", legend: guideSelectedLegend.name, target: locName });
                    selectedAction = null;
                    guideSelectedLegend = null;
                });
            } else if (isMapPickerTarget) {
                rect.addEventListener("click", (e) => {
                    if (window.isDragging) return;
                    const callback = mapLocationPickerCallback;
                    selectedAction = null;
                    mapLocationPickerTargets = null;
                    mapLocationPickerCallback = null;
                    if (callback) callback(locName);
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
            itemCircle.setAttribute("id", "map-item-" + item.id);
            itemCircle.setAttribute("cx", coord.x + offset.x);
            itemCircle.setAttribute("cy", coord.y + offset.y);
            itemCircle.setAttribute("r", 14);
            itemCircle.setAttribute("class", `token-item ${item.color.toLowerCase()}`);
            itemG.appendChild(itemCircle);

            const itemVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
            itemVal.setAttribute("x", coord.x + offset.x);
            itemVal.setAttribute("y", coord.y + offset.y + 4);
            itemVal.setAttribute("text-anchor", "middle");
            itemVal.setAttribute("class", "token-label");
            itemVal.textContent = item.strength;
            itemG.appendChild(itemVal);

            itemG.style.cursor = "pointer";
            itemG.addEventListener("mouseenter", (e) => showItemTooltip(e, item.name, item.artwork, item.color));
            itemG.addEventListener("mouseleave", () => hideItemTooltip());

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
            if (gameState.active_monsters.includes(monName) && gameState.monster_locations[monName] === locName) {
                characters.push({ type: "monster", name: monName, label: monName.charAt(0) });
            }
        }

        // Citizens
        for (const citName in gameState.citizens) {
            const cit = gameState.citizens[citName];
            if (cit.active && cit.location === locName) {
                characters.push({ type: "citizen", name: citName, label: "C", safe: cit.safe, portrait: cit.portrait });
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

        // Lair Tokens: a single shared pool of 4 (Yeti's Cave / Jiangshi's Moon Shrine / decoys)
        (gameState.lair_tokens || []).forEach((token, i) => {
            if (token.location === locName) {
                characters.push({ type: "lair", lair_type: token.type, name: `Lair Token ${i}`, is_true: token.type !== "blank", flipped: token.revealed });
            }
        });

        characters.forEach((char, index) => {
            const isYeti = (char.name === "Yeti");
            const isSphinx = (char.name === "Sphinx");
            const isJiangshi = (char.name === "Jiangshi");
            const isCthulhu = (char.name === "Cthulhu");
            const isYetiChild = char.name.startsWith("Yeti Child");
            const isLair = (char.type === "lair");
            const childId = isYetiChild ? char.name.replace("Yeti Child ", "") : null;
            const isCustomMonster = isYeti || isSphinx || isJiangshi || isCthulhu;
            const isFrenzyMonster = (char.type === "monster") && char.name === gameState.frenzy_marker;
            const isHero = (char.type === "hero");
            const isCitizen = (char.type === "citizen") && !isYetiChild;
            let charR;
            if (isCustomMonster) charR = 48;
            else if (isYetiChild) charR = 26;
            else if (isHero) charR = 34;
            else if (isLair) charR = 28;
            else if (isCitizen) charR = 26;
            else charR = 20;

            const offset = getCharOffset(index, characters.length, coord.r || 35);
            const charG = document.createElementNS("http://www.w3.org/2000/svg", "g");

            const charKey = `${char.type}-${char.name}`;
            const targetX = coord.x + offset.x;
            const targetY = coord.y + offset.y;

            const shapeType = isLair ? "rect" : "circle";
            const charShape = document.createElementNS("http://www.w3.org/2000/svg", shapeType);
            
            const lairW = 56;
            const lairH = 40;
            if (isLair) {
                charShape.setAttribute("width", lairW);
                charShape.setAttribute("height", lairH);
                charShape.setAttribute("rx", 3);
            } else {
                charShape.setAttribute("r", charR);
            }
            
            const setPos = (el, nx, ny) => {
                if (isLair) {
                    el.setAttribute("x", nx - lairW / 2);
                    el.setAttribute("y", ny - lairH / 2);
                } else {
                    el.setAttribute("cx", nx);
                    el.setAttribute("cy", ny);
                }
            };
            
            const lastPos = lastCharacterPositions[charKey];
            if (lastPos && (lastPos.x !== targetX || lastPos.y !== targetY)) {
                setPos(charShape, lastPos.x, lastPos.y);

                setTimeout(() => {
                    setPos(charShape, targetX, targetY);
                }, 20);

                // Draw glowing motion trail
                drawMovementTrail(lastPos.x, lastPos.y, targetX, targetY);
            } else {
                setPos(charShape, targetX, targetY);
            }

            lastCharacterPositions[charKey] = { x: targetX, y: targetY };
            
            if (isYeti) {
                charShape.setAttribute("class", "yeti-token");
                charShape.setAttribute("fill", "url(#pattern-yeti)");
                charShape.setAttribute("stroke", "#ff3366"); // Red border marks it as an enemy
                charShape.setAttribute("stroke-width", "4.5");
                charShape.setAttribute("filter", "drop-shadow(0 0 10px rgba(255,51,102,0.9)) drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isSphinx) {
                charShape.setAttribute("class", "sphinx-token");
                charShape.setAttribute("fill", "url(#pattern-sphinx)");
                charShape.setAttribute("stroke", "#ff3366"); // Red border marks it as an enemy
                charShape.setAttribute("stroke-width", "4.5");
                charShape.setAttribute("filter", "drop-shadow(0 0 10px rgba(255,51,102,0.9)) drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isJiangshi) {
                charShape.setAttribute("class", "jiangshi-token");
                charShape.setAttribute("fill", "url(#pattern-jiangshi)");
                charShape.setAttribute("stroke", "#ff3366"); // Red border marks it as an enemy
                charShape.setAttribute("stroke-width", "4.5");
                charShape.setAttribute("filter", "drop-shadow(0 0 10px rgba(255,51,102,0.9)) drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isCthulhu) {
                charShape.setAttribute("class", "cthulhu-token");
                charShape.setAttribute("fill", "url(#pattern-cthulhu)");
                charShape.setAttribute("stroke", "#ff3366"); // Red border marks it as an enemy
                charShape.setAttribute("stroke-width", "4.5");
                charShape.setAttribute("filter", "drop-shadow(0 0 10px rgba(255,51,102,0.9)) drop-shadow(0 2px 5px rgba(0,0,0,0.5))");
            } else if (isYetiChild) {
                const isGuideSource = guideEligibleNames.includes(char.name);
                const isGuideActive = guideSelectedLegend && guideSelectedLegend.name === char.name;
                charShape.setAttribute("class", `yeti-child-token ${isGuideSource ? "guide-source-pulse" : ""}`);
                charShape.setAttribute("fill", `url(#pattern-yeti-child-${childId})`);
                charShape.setAttribute("stroke", isGuideActive ? "#ffd533" : "#ffffff"); // White border, gold while chosen for Guide
                charShape.setAttribute("stroke-width", isGuideActive ? "3.5" : "2");
                if (!isGuideSource) {
                    charShape.setAttribute("filter", isGuideActive
                        ? "drop-shadow(0 0 10px rgba(255,213,51,0.9))"
                        : "drop-shadow(0 2px 4px rgba(0,0,0,0.4))");
                }
                if (isGuideSource) {
                    charShape.style.cursor = "pointer";
                    charShape.addEventListener("click", (e) => {
                        e.stopPropagation();
                        guideSelectedLegend = { name: char.name, loc: locName, type: "child" };
                        renderSVGMap();
                    });
                }
            } else if (isLair) {
                charShape.setAttribute("class", "lair-token");
                const getLairUrl = (type) => {
                    if (type === "yeti") return "url(#pattern-lair-yeti)";
                    if (type === "jiangshi") return "url(#pattern-lair-jiangshi)";
                    return "url(#pattern-lair-blank)";
                };
                const patId = char.flipped ? getLairUrl(char.lair_type) : "url(#pattern-lair-back)";
                charShape.setAttribute("fill", patId);
                charShape.setAttribute("stroke", char.flipped ? (char.is_true ? "#ffd533" : "#555") : "#fff");
                charShape.setAttribute("stroke-width", "2.5");
                charShape.setAttribute("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.4))");
                
                charShape.style.transformBox = "fill-box";
                charShape.style.transformOrigin = "center";
                charShape.style.transition = "transform 0.2s ease";
                charShape.style.cursor = "pointer";
                
                charShape.addEventListener("mouseenter", () => {
                    charShape.style.transform = "scale(1.8)";
                });
                charShape.addEventListener("mouseleave", () => {
                    charShape.style.transform = "scale(1)";
                });
                
                if (char.flipped) {
                    charShape.addEventListener("click", (e) => {
                        e.stopPropagation();
                        showLairImageModal(char.lair_type);
                    });
                }
            } else if (isHero) {
                const patId = `pattern-hero-${char.heroClass.replaceAll(" ", "_")}`;
                const isMe = (char.name === playerName);
                const isActiveTurn = (gameState.players[gameState.turn_player_idx].name === char.name);
                charShape.setAttribute("id", "map-hero-" + char.name.replace(/ /g, "_"));
                charShape.setAttribute("class", "hero-token");
                charShape.setAttribute("fill", `url(#${patId})`);
                charShape.setAttribute("stroke", (isMe || isActiveTurn) ? "#ffd533" : "#33ccff");
                charShape.setAttribute("stroke-width", (isMe || isActiveTurn) ? "3.5" : "2.5");
                charShape.setAttribute("filter", `drop-shadow(0 0 ${(isMe || isActiveTurn) ? 12 : 6}px ${(isMe || isActiveTurn) ? "rgba(255,213,51,0.9)" : "rgba(51,204,255,0.7)"})`);
                
                charShape.style.cursor = "pointer";
                charShape.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (isMe) {
                        const tabBtn = document.getElementById("gtab-btn-my-hero");
                        if (tabBtn && !tabBtn.classList.contains("active")) {
                            tabBtn.click();
                        }
                    } else {
                        const activeHeroes = Object.keys(gameState.heroes_state || {}).filter(name => name !== playerName);
                        const idx = activeHeroes.indexOf(char.name);
                        if (idx !== -1) {
                            currentHeroTabIndex = idx;
                            renderPlayerPanel();
                        }
                        const tabBtn = document.getElementById("gtab-btn-hero");
                        if (tabBtn && !tabBtn.classList.contains("active")) {
                            tabBtn.click();
                        }
                    }
                });
            } else if (isCitizen) {
                const patId = `pattern-citizen-${char.name.replaceAll(" ", "_")}`;
                const isGuideSource = guideEligibleNames.includes(char.name);
                const isGuideActive = guideSelectedLegend && guideSelectedLegend.name === char.name;
                charShape.setAttribute("class", `citizen-token ${isGuideSource ? "guide-source-pulse" : ""}`);
                charShape.setAttribute("fill", `url(#${patId})`);
                charShape.setAttribute("stroke", isGuideActive ? "#ffd533" : "#20e889");
                charShape.setAttribute("stroke-width", isGuideActive ? "3.5" : "2.5");
                if (!isGuideSource) {
                    charShape.setAttribute("filter", isGuideActive
                        ? "drop-shadow(0 0 10px rgba(255,213,51,0.9))"
                        : "drop-shadow(0 0 7px rgba(32,232,137,0.7))");
                }
                charShape.style.cursor = "pointer";
                charShape.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (isGuideSource) {
                        guideSelectedLegend = { name: char.name, loc: locName, type: "citizen" };
                        renderSVGMap();
                    } else {
                        showCitizenInfo(char.name, char.safe, char.portrait);
                    }
                });
            } else {
                // Generic fallback marker (no monster currently uses this — all 4 have portraits)
                charShape.setAttribute("class", `token-character char-${char.type}`);
            }

            if (char.type === "monster") {
                charShape.setAttribute("id", "map-monster-" + char.name.replace(/ /g, "_"));
                charShape.style.cursor = "pointer";
                charShape.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const active = gameState.active_monsters || [];
                    const defeated = gameState.defeated_monsters || [];
                    const allMonsters = [...active, ...defeated];
                    const idx = allMonsters.indexOf(char.name);
                    if (idx !== -1) {
                        currentMonsterTabIndex = idx;
                        renderMonstersStatusPanel();
                    }
                    const tabBtn = document.getElementById("gtab-btn-monsters");
                    if (tabBtn && !tabBtn.classList.contains("active")) {
                        tabBtn.click();
                    }
                });
            }
            // The monster currently holding the Frenzy marker is identified solely by the
            // ⚡ badge below - its token keeps the normal red "enemy" border/glow.

            charG.appendChild(charShape);

            if (isFrenzyMonster) {
                const badgeR = charR * 0.32;
                const badgeCx = targetX + charR * 0.72;
                const badgeCy = targetY - charR * 0.72;
                const badgeCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                badgeCircle.setAttribute("cx", badgeCx);
                badgeCircle.setAttribute("cy", badgeCy);
                badgeCircle.setAttribute("r", badgeR);
                badgeCircle.setAttribute("fill", "#1a0f2e");
                badgeCircle.setAttribute("stroke", "#ffd533");
                badgeCircle.setAttribute("stroke-width", "2");
                badgeCircle.setAttribute("class", "frenzy-marker-badge");
                charG.appendChild(badgeCircle);

                const badgeIcon = document.createElementNS("http://www.w3.org/2000/svg", "text");
                badgeIcon.setAttribute("x", badgeCx);
                badgeIcon.setAttribute("y", badgeCy + badgeR * 0.4);
                badgeIcon.setAttribute("text-anchor", "middle");
                badgeIcon.setAttribute("font-size", `${badgeR * 1.3}px`);
                badgeIcon.textContent = "⚡";
                charG.appendChild(badgeIcon);
            }

            // Render text label only for monsters without portrait images
            if (!isCustomMonster && !isYetiChild && !isHero && !isCitizen && !isLair) {
                const charVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
                charVal.setAttribute("text-anchor", "middle");
                charVal.setAttribute("fill", "#000");
                charVal.setAttribute("font-size", "14px");
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

    // ---------------------------------------------------------
    // Render Terror Track
    // ---------------------------------------------------------
    if (gameState.terror_level !== undefined) {
        const terrorTrackG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // Fallback formula (used only if the server hasn't sent calibrated coordinates yet)
        const slotSpacing = 82;
        const numSlots = 8;
        const trackStartX = 652 - (numSlots * slotSpacing) / 2 + (slotSpacing / 2) - 12;
        const trackY = 60;
        const terrorCoords = gameState.terror_track_coordinates;

        for (let i = 0; i <= 7; i++) {
            const slot = terrorCoords && terrorCoords[i];
            const slotX = slot ? slot.x : (trackStartX + i * slotSpacing);
            const slotY = slot ? slot.y : trackY;
            const slotR = (slot && slot.r) || 28;

            const slotPoints = (slot && slot.points && slot.points.length >= 3) ? slot.points : null;

            // Neon LED-style glow tracing only the contour of the current Terror Level
            // placeholder (custom polygon if one is defined, otherwise a plain circle),
            // leaving the center hollow so the level number underneath stays visible.
            if (gameState.terror_level === i) {
                const ring = createNeonRing(slotX, slotY, slotR, slotPoints);

                // If the Terror Level just increased, slide the ring in from its previous
                // slot (plus a glowing movement trail) instead of just popping into place.
                if (pendingTerrorTransitionFrom !== null && pendingTerrorTransitionFrom !== i) {
                    const fromSlot = terrorCoords && terrorCoords[pendingTerrorTransitionFrom];
                    if (fromSlot) {
                        const dx = fromSlot.x - slotX, dy = fromSlot.y - slotY;
                        ring.style.transform = `translate(${dx}px, ${dy}px)`;
                        requestAnimationFrame(() => requestAnimationFrame(() => {
                            ring.style.transition = "transform 0.8s cubic-bezier(0.25, 1, 0.3, 1)";
                            ring.style.transform = "translate(0px, 0px)";
                        }));
                        drawMovementTrail(fromSlot.x, fromSlot.y, slotX, slotY);
                    }
                }

                terrorTrackG.appendChild(ring);
            }
            
            // Add a draggable hitbox for the terror track slot
            const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            hitbox.setAttribute("cx", slotX);
            hitbox.setAttribute("cy", slotY);
            hitbox.setAttribute("r", slotR);
            hitbox.setAttribute("fill", "transparent");
            hitbox.setAttribute("class", "terror-hitbox");
            if (elGameMap.classList.contains("debug-hitboxes")) {
                hitbox.style.pointerEvents = "all";
                hitbox.style.cursor = "move";
                hitbox.setAttribute("stroke", "rgba(255, 255, 0, 0.8)");
                hitbox.setAttribute("stroke-width", "2");
            } else {
                hitbox.style.pointerEvents = "none";
            }
            hitbox.addEventListener("mousedown", (e) => {
                if (elGameMap.classList.contains("debug-hitboxes")) {
                    e.stopPropagation();
                    dragType = "terror";
                    dragLocName = i; // using index 0-7
                    window.isDragging = false;
                }
            });
            terrorTrackG.appendChild(hitbox);
        }
        pendingTerrorTransitionFrom = null;
        elGameMap.appendChild(terrorTrackG);
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
    // Orbit around node center outside transparent hitbox (accounts for the larger r=14 item token)
    const radius = nodeRadius - 11;
    const angle = (index * 60) * (Math.PI / 180);
    return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
    };
}

function getCharOffset(index, total, nodeRadius = 35) {
    // Arrange in center or slightly offset (spread out a bit more to fit the bigger tokens)
    if (total === 1) return { x: 0, y: 0 };
    const radius = nodeRadius * 0.48;
    const angle = (index * (360 / total)) * (Math.PI / 180);
    return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
    };
}


// Returns the citizens/Yeti children that can currently be picked as a Guide source:
// active, and either at the hero's own location or at a location adjacent to it.
function getEligibleGuideLegends(currentLoc, adjacent) {
    const eligible = [];
    for (const name in gameState.citizens) {
        const cit = gameState.citizens[name];
        if (cit.active && (cit.location === currentLoc || adjacent.includes(cit.location))) {
            eligible.push({ name: name, loc: cit.location, type: "citizen" });
        }
    }
    if (gameState.active_monsters.includes("Yeti") && gameState.monster_states["Yeti"]) {
        const y_state = gameState.monster_states["Yeti"];
        y_state.children.forEach(child => {
            if (!child.rescued && (child.location === currentLoc || adjacent.includes(child.location))) {
                eligible.push({ name: `Yeti Child ${child.id}`, loc: child.location, type: "child" });
            }
        });
    }
    return eligible;
}

// Given a chosen legend, returns the location(s) it can be guided to: any location
// adjacent to the hero if the legend is standing with the hero, or just the hero's
// own location if the legend is one step away — mirrors execute_guide on the server.
function getGuideValidTargets(currentLoc, adjacent, legend) {
    if (legend.loc === currentLoc) return adjacent;
    if (adjacent.includes(legend.loc)) return [currentLoc];
    return [];
}
