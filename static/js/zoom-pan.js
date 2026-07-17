// ---- Zoom and Pan Controls for Game Board Map ----
function updateMapViewBox() {
    if (!elGameMap) return;
    const w = baseWidth / zoomLevel;
    const h = baseHeight / zoomLevel;
    
    // Clamp panning values
    const minX = -baseWidth * 0.4;
    const maxX = baseWidth * 1.4 - w;
    const minY = -baseHeight * 0.4;
    const maxY = baseHeight * 1.4 - h;
    
    panX = Math.max(minX, Math.min(maxX, panX));
    panY = Math.max(minY, Math.min(maxY, panY));
    
    elGameMap.setAttribute("viewBox", `${panX} ${panY} ${w} ${h}`);
}

let isPanningMap = false;
let startPanMouseX = 0;
let startPanMouseY = 0;
let startPanX = 0;
let startPanY = 0;

const initMapZoomPan = () => {
    const boardContainer = document.querySelector(".board-container");
    if (!boardContainer) return;
    
    // Zoom with mouse wheel
    boardContainer.addEventListener("wheel", (e) => {
        if (!elGameMap || elGameMap.classList.contains("debug-hitboxes")) return;
        e.preventDefault();
        
        const zoomFactor = 1.15;
        const oldZoom = zoomLevel;
        if (e.deltaY < 0) {
            zoomLevel = Math.min(5.0, zoomLevel * zoomFactor);
        } else {
            zoomLevel = Math.max(1.0, zoomLevel / zoomFactor);
        }
        
        if (zoomLevel === 1.0) {
            panX = 0;
            panY = 0;
        } else {
            const rect = elGameMap.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const svgMouseX = panX + (mouseX / rect.width) * (baseWidth / oldZoom);
            const svgMouseY = panY + (mouseY / rect.height) * (baseHeight / oldZoom);
            
            panX = svgMouseX - (mouseX / rect.width) * (baseWidth / zoomLevel);
            panY = svgMouseY - (mouseY / rect.height) * (baseHeight / zoomLevel);
        }
        
        updateMapViewBox();
    }, { passive: false });

    // Drag to Pan
    boardContainer.addEventListener("mousedown", (e) => {
        if (!elGameMap || elGameMap.classList.contains("debug-hitboxes")) return;
        
        const isBackground = e.target.tagName === "svg" || e.target.tagName === "image";
        if (e.button === 1 || e.button === 2 || (e.button === 0 && isBackground)) {
            isPanningMap = true;
            startPanMouseX = e.clientX;
            startPanMouseY = e.clientY;
            startPanX = panX;
            startPanY = panY;
            
            if (e.button === 2) {
                e.preventDefault();
            }
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isPanningMap || !elGameMap) return;
        
        const rect = elGameMap.getBoundingClientRect();
        const dx = e.clientX - startPanMouseX;
        const dy = e.clientY - startPanMouseY;
        
        const scaleX = (baseWidth / zoomLevel) / rect.width;
        const scaleY = (baseHeight / zoomLevel) / rect.height;
        
        panX = startPanX - dx * scaleX;
        panY = startPanY - dy * scaleY;
        
        updateMapViewBox();
    });

    window.addEventListener("mouseup", () => {
        isPanningMap = false;
    });

    boardContainer.addEventListener("contextmenu", (e) => {
        if (!elGameMap || !elGameMap.classList.contains("debug-hitboxes")) {
            e.preventDefault();
        }
    });
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMapZoomPan);
} else {
    initMapZoomPan();
}
