let mapData = { nodes: {}, terror: [], adjacency: {} };
let selectedMap = "Map.png";
let selectedNode = null;
let isTerrorNode = false;
let dragNode = null;
let isDragging = false;

const elMapSelect = document.getElementById("map-select");
const elMapImage = document.getElementById("game-map-image");
const elSvg = document.getElementById("game-map");
const elBtnLoad = document.getElementById("btn-load");
const elBtnSave = document.getElementById("btn-save");
const elToast = document.getElementById("toast");

const elEditorPanel = document.getElementById("editor-panel");
const elEmptyPanel = document.getElementById("empty-panel");
const elNodeName = document.getElementById("node-name");
const elBtnRename = document.getElementById("btn-rename");
const elBtnDelete = document.getElementById("btn-delete");
const elNodeRadius = document.getElementById("node-radius");
const elConnPanel = document.getElementById("connections-panel");
const elConnList = document.getElementById("conn-list");
const elConnSelect = document.getElementById("conn-select");
const elBtnConnect = document.getElementById("btn-connect");
const elBtnAddLoc = document.getElementById("btn-add-loc");

elBtnLoad.addEventListener("click", loadMap);
elBtnSave.addEventListener("click", saveMap);
elMapSelect.addEventListener("change", () => {
    selectedMap = elMapSelect.value;
    elMapImage.setAttribute("href", `/Images/${selectedMap}?v=2`);
});

async function loadMap() {
    selectedMap = elMapSelect.value;
    elMapImage.setAttribute("href", `/Images/${selectedMap}?v=2`);
    try {
        const res = await fetch(`/api/map?map=${encodeURIComponent(selectedMap)}`);
        mapData = await res.json();
        if (!mapData.adjacency) mapData.adjacency = {};
        selectNode(null);
        renderSvg();
    } catch (e) {
        alert("Failed to load map data.");
    }
}

async function saveMap() {
    try {
        const res = await fetch("/api/map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ map: selectedMap, data: mapData })
        });
        if (res.ok) {
            showToast();
        } else {
            alert("Failed to save map data.");
        }
    } catch (e) {
        alert("Failed to save map data.");
    }
}

function showToast() {
    elToast.style.display = "block";
    setTimeout(() => { elToast.style.display = "none"; }, 2000);
}

function renderSvg() {
    // Clear everything except the background image
    while (elSvg.lastChild && elSvg.lastChild.id !== "game-map-image") {
        elSvg.removeChild(elSvg.lastChild);
    }
    
    const svgNS = "http://www.w3.org/2000/svg";
    
    // Draw Connections
    const drawn = new Set();
    for (const start in mapData.adjacency) {
        const s = mapData.nodes[start];
        if (!s) continue;
        mapData.adjacency[start].forEach(endNode => {
            const e = mapData.nodes[endNode];
            if (!e) return;
            const pair = [start, endNode].sort().join("-");
            if (!drawn.has(pair)) {
                drawn.add(pair);
                const line = document.createElementNS(svgNS, "line");
                line.setAttribute("x1", s.x); line.setAttribute("y1", s.y);
                line.setAttribute("x2", e.x); line.setAttribute("y2", e.y);
                line.setAttribute("class", "map-link");
                elSvg.appendChild(line);
            }
        });
    }
    
    // Draw Nodes
    for (const name in mapData.nodes) {
        const node = mapData.nodes[name];
        let shape;
        if (node.type === "rect") {
            shape = document.createElementNS(svgNS, "rect");
            shape.setAttribute("x", node.x); shape.setAttribute("y", node.y);
            shape.setAttribute("width", node.width); shape.setAttribute("height", node.height);
        } else {
            shape = document.createElementNS(svgNS, "circle");
            shape.setAttribute("cx", node.x); shape.setAttribute("cy", node.y);
            shape.setAttribute("r", node.r || 28);
        }
        shape.setAttribute("class", `map-node ${selectedNode === name && !isTerrorNode ? "selected" : ""}`);
        
        shape.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            dragNode = name;
            isTerrorNode = false;
            selectNode(name, false);
        });
        elSvg.appendChild(shape);
    }
    
    // Draw Terror Track
    const terrorCoords = mapData.terror;
    if (terrorCoords) {
        for (let i = 0; i <= 7; i++) {
            const slot = terrorCoords[i] || {x: 652, y: 60, r: 28};
            const shape = document.createElementNS(svgNS, "circle");
            shape.setAttribute("cx", slot.x);
            shape.setAttribute("cy", slot.y);
            shape.setAttribute("r", slot.r || 28);
            shape.setAttribute("class", `map-node ${selectedNode === i && isTerrorNode ? "selected" : ""}`);
            
            shape.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                dragNode = i;
                isTerrorNode = true;
                selectNode(i, true);
            });
            elSvg.appendChild(shape);
        }
    }
}

elSvg.addEventListener("mousemove", (e) => {
    if (dragNode !== null) {
        isDragging = true;
        const pt = elSvg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const svgPt = pt.matrixTransform(elSvg.getScreenCTM().inverse());
        const x = Math.round(svgPt.x);
        const y = Math.round(svgPt.y);
        
        if (isTerrorNode) {
            if (!mapData.terror[dragNode]) mapData.terror[dragNode] = {x:0, y:0, r:28};
            mapData.terror[dragNode].x = x;
            mapData.terror[dragNode].y = y;
        } else {
            if (mapData.nodes[dragNode].type === "rect") {
                mapData.nodes[dragNode].x = x;
                mapData.nodes[dragNode].y = y;
            } else {
                mapData.nodes[dragNode].x = x;
                mapData.nodes[dragNode].y = y;
            }
        }
        renderSvg();
    }
});

document.addEventListener("mouseup", () => {
    if (dragNode !== null) {
        setTimeout(() => {
            isDragging = false;
            dragNode = null;
        }, 50);
    }
});

function selectNode(name, isTerror = false) {
    selectedNode = name;
    isTerrorNode = isTerror;
    
    if (name === null) {
        elEditorPanel.style.display = "none";
        elEmptyPanel.style.display = "block";
        return;
    }
    
    elEditorPanel.style.display = "block";
    elEmptyPanel.style.display = "none";
    
    elNodeName.value = isTerror ? `Terror Slot ${name}` : name;
    elBtnRename.disabled = isTerror;
    elBtnDelete.disabled = isTerror;
    
    if (isTerror) {
        elConnPanel.style.display = "none";
        const node = mapData.terror[name];
        elNodeRadius.value = node.r || 28;
    } else {
        elConnPanel.style.display = "block";
        const node = mapData.nodes[name];
        elNodeRadius.value = node.r || (node.type === "rect" ? node.width : 28);
        
        // Populate Connections
        elConnList.innerHTML = "";
        const conns = mapData.adjacency[name] || [];
        conns.forEach(c => {
            const div = document.createElement("div");
            div.className = "conn-item";
            div.innerHTML = `<span>${c}</span> <button onclick="removeConnection('${name}', '${c}')">X</button>`;
            elConnList.appendChild(div);
        });
        
        elConnSelect.innerHTML = '<option value="">-- Add Connection --</option>';
        Object.keys(mapData.nodes).forEach(n => {
            if (n !== name && !conns.includes(n)) {
                const opt = document.createElement("option");
                opt.value = n;
                opt.innerText = n;
                elConnSelect.appendChild(opt);
            }
        });
    }
    
    renderSvg();
}

elNodeRadius.addEventListener("change", () => {
    if (selectedNode === null) return;
    const r = parseInt(elNodeRadius.value, 10);
    if (!isNaN(r)) {
        if (isTerrorNode) {
            mapData.terror[selectedNode].r = r;
        } else {
            const n = mapData.nodes[selectedNode];
            if (n.type === "rect") { n.width = r; n.height = r; } else { n.r = r; }
        }
        renderSvg();
    }
});

elBtnRename.addEventListener("click", () => {
    if (isTerrorNode || selectedNode === null) return;
    const newName = elNodeName.value.trim();
    if (!newName || newName === selectedNode) return;
    if (mapData.nodes[newName]) return alert("Name exists!");
    
    mapData.nodes[newName] = { ...mapData.nodes[selectedNode] };
    delete mapData.nodes[selectedNode];
    
    if (mapData.adjacency[selectedNode]) {
        mapData.adjacency[newName] = [...mapData.adjacency[selectedNode]];
        delete mapData.adjacency[selectedNode];
    }
    for (const k in mapData.adjacency) {
        const arr = mapData.adjacency[k];
        const idx = arr.indexOf(selectedNode);
        if (idx !== -1) arr[idx] = newName;
    }
    
    selectNode(newName, false);
});

elBtnDelete.addEventListener("click", () => {
    if (isTerrorNode || selectedNode === null) return;
    delete mapData.nodes[selectedNode];
    delete mapData.adjacency[selectedNode];
    for (const k in mapData.adjacency) {
        mapData.adjacency[k] = mapData.adjacency[k].filter(n => n !== selectedNode);
    }
    selectNode(null);
});

elBtnConnect.addEventListener("click", () => {
    if (isTerrorNode || selectedNode === null) return;
    const target = elConnSelect.value;
    if (!target) return;
    
    if (!mapData.adjacency[selectedNode]) mapData.adjacency[selectedNode] = [];
    if (!mapData.adjacency[target]) mapData.adjacency[target] = [];
    
    mapData.adjacency[selectedNode].push(target);
    mapData.adjacency[target].push(selectedNode);
    selectNode(selectedNode, false);
});

window.removeConnection = function(n1, n2) {
    if (mapData.adjacency[n1]) mapData.adjacency[n1] = mapData.adjacency[n1].filter(n => n !== n2);
    if (mapData.adjacency[n2]) mapData.adjacency[n2] = mapData.adjacency[n2].filter(n => n !== n1);
    selectNode(selectedNode, false);
};

elBtnAddLoc.addEventListener("click", () => {
    let i = 1;
    while (mapData.nodes[`Location ${i}`]) i++;
    const name = `Location ${i}`;
    mapData.nodes[name] = {x: 652, y: 603, r: 28, type: "circle"};
    mapData.adjacency[name] = [];
    selectNode(name, false);
});

// Load standard initially
setTimeout(() => loadMap(), 100);
