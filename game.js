let mouseScreenX = 0;
let mouseScreenY = 0;
let brushSize = 1; // 1 = 10cm, 2 = 20cm, 3 = 30cm
let paintMode = "paint"; // "paint" or "erase"
let paintColor = "#777";   // default obstacle color
let eyedropperMode = false;
let isPainting = false;
let lastClickCell = null;
let dragStartCell = null;
let justDidShiftLine = false;
let lastPaintedCell = null;

// ===== VISIBILITY FLAGS =====
let showUI = true;
let showRuler = true;
let showGrid = true;
let showDrawing = true;
let showBackground = true;
let showVehicle = true;

// ===== UNDO / REDO =====
let undoStack = [];
let redoStack = [];
let currentStroke = null;

let bgWidthMeters = 20;
let backgroundImage = null;
let bgImageBase64 = null;
let bgScale = 1;
let bgOpacity = 0.5;
let gridOpacity = 0.2;
let pendingGridOpacity = 0.5;
let drawingOpacity = 1;
let cameraX = 0;
let cameraY = 0;
let lastFilename = "Layout_";
console.log("Parking Simulator Loaded");

// ===== CANVAS =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    updateUIOffsets();
}

resizeCanvas();
updateUIOffsets();
window.addEventListener("resize", resizeCanvas);

// ===== UI OFFSETS (avoid overlap with ruler + shortcut bar) =====
function updateUIOffsets(){

    const ui = document.getElementById("ui");
    const shortcutBar = document.getElementById("shortcutBar");
    const visibilityToggles = document.getElementById("visibilityToggles");

    if(!shortcutBar) return;

    const rulerHeightPx = 35; // ίδιο με drawTopRuler()
    const paddingPx = 10;
    const footerHeightPx = shortcutBar.offsetHeight;

    // Main left UI
    if(ui){
        ui.style.top = (rulerHeightPx + paddingPx) + "px";
        ui.style.bottom = (footerHeightPx + paddingPx) + "px";
    }

    // Bottom-right visibility toggles
    if(visibilityToggles){
        visibilityToggles.style.bottom = (footerHeightPx + paddingPx) + "px";
    }
}

// ===== WORLD SETTINGS =====
let cellSizeMeters = 0.1;   // default 10cm FIXED
let worldWidthMeters = 50;
let worldHeightMeters = 50;

let cellsX;
let cellsY;

let grid = [];

function rebuildWorld(){

    cellsX = Math.floor(worldWidthMeters / cellSizeMeters);
    cellsY = Math.floor(worldHeightMeters / cellSizeMeters);

    grid = [];

    for(let y=0; y<cellsY; y++){
        grid[y] = [];
        for(let x=0; x<cellsX; x++){
            grid[y][x] = 0;
        }
    }
}

function resizeWorld(newWidthMeters, newHeightMeters){

    const oldGrid = grid;
    const oldCellsX = cellsX;
    const oldCellsY = cellsY;

    const newCellsX = Math.floor(newWidthMeters / cellSizeMeters);
    const newCellsY = Math.floor(newHeightMeters / cellSizeMeters);

    // Δημιουργούμε νέο grid
    let newGrid = [];

    for(let y = 0; y < newCellsY; y++){
        newGrid[y] = [];
        for(let x = 0; x < newCellsX; x++){
            newGrid[y][x] = 0;
        }
    }

    // Υπολογίζουμε offset για συμμετρική μετατόπιση
    const offsetX = Math.floor((newCellsX - oldCellsX) / 2);
    const offsetY = Math.floor((newCellsY - oldCellsY) / 2);

    // Αντιγράφουμε παλιό grid στο νέο
    for(let y = 0; y < oldCellsY; y++){
        for(let x = 0; x < oldCellsX; x++){

            const newX = x + offsetX;
            const newY = y + offsetY;

            if(
                newX >= 0 && newX < newCellsX &&
                newY >= 0 && newY < newCellsY
            ){
                newGrid[newY][newX] = oldGrid[y][x];
            }
        }
    }

    // Ενημερώνουμε world
    worldWidthMeters = newWidthMeters;
    worldHeightMeters = newHeightMeters;

    cellsX = newCellsX;
    cellsY = newCellsY;

    grid = newGrid;
}

let zoom = 120; // pixels per meter (camera zoom)

// ===== MODE =====
let mode = "edit";

// ===== CAMERA MODE =====
let cameraMode = "free"; // "free" or "follow"

// ===== CAR DATA =====

const vehicleSpawn = {
    x: 6,
    y: 6,
    angle: Math.PI
};

let car = {

    // ===== Geometry Inputs =====
    wheelBase: 2.6,
    frontOverhang: 0.9,
    rearOverhang: 0.8,
    trackWidth: 1.55,      // rear track width
    bodyWidth: 1.80,
    turningCircle: 10.8,   // curb-to-curb

    color: "#ff4444",

    // ===== Performance =====
    acceleration: 4,
    topSpeed: 8,

    // ===== Derived (computed automatically) =====
    maxSteer: 0,
    rearRadius: 0,

    // ===== State =====
    x: vehicleSpawn.x,
    y: vehicleSpawn.y,
    angle: vehicleSpawn.angle,
    speed: 0,
    steer: 0
};

function computeSteeringFromTurningCircle(){

    const WB = car.wheelBase;
    const FO = car.frontOverhang;
    const BW = car.bodyWidth;

    const Rout = car.turningCircle / 2;           // outer front bumper corner radius
    const y = WB + FO;                            // front corner forward offset
    const halfBW = BW / 2;

    // safety: must be big enough to reach
    const underRoot = Rout*Rout - y*y;
    if(underRoot <= 0){
        car.rearRadius = 9999;
        car.maxSteer = 0;
        return;
    }

    const R = Math.sqrt(underRoot) - halfBW;      // rear axle center radius

    car.rearRadius = R;
    car.maxSteer = Math.atan(WB / R);
}

function updateCarStats(){

    const totalLength =
        car.rearOverhang +
        car.wheelBase +
        car.frontOverhang;

    document.getElementById("lengthStat").innerHTML =
        "Total Length: " + totalLength.toFixed(2) + " m";

    document.getElementById("widthStat").innerHTML =
        "Body Width: " + car.bodyWidth.toFixed(2) + " m";

    document.getElementById("wheelbaseStat").innerHTML =
        "Wheelbase: " + car.wheelBase.toFixed(2) + " m";

    document.getElementById("turningStat").innerHTML =
        "Max Steering: " +
        (car.maxSteer * 180 / Math.PI).toFixed(1) + "°";
}

document.getElementById("applyCarBtn").addEventListener("click", applyVehicle);

function applyVehicle(){

    car.wheelBase     = parseFloat(document.getElementById("wheelbaseInput").value);
    car.frontOverhang = parseFloat(document.getElementById("frontOverhangInput").value);
    car.rearOverhang  = parseFloat(document.getElementById("rearOverhangInput").value);
    car.trackWidth    = parseFloat(document.getElementById("trackWidthInput").value);
    car.bodyWidth     = parseFloat(document.getElementById("bodyWidthInput").value);
    car.turningCircle = parseFloat(document.getElementById("turningCircleInput").value);
    car.color = document.getElementById("carColorPicker").value;
    car.topSpeed = parseFloat(document.getElementById("topSpeedNumber").value);
    car.acceleration = parseFloat(document.getElementById("accelerationNumber").value);

    computeSteeringFromTurningCircle();
    updateCarStats();
}

computeSteeringFromTurningCircle();

updateCarStats();

rebuildWorld();

// load default
setMode("edit");

// ===== UI LOCK SYSTEM =====
// Enables or disables all configuration controls
function setUIEnabled(enabled){

    document.getElementById("worldWidthInput").disabled = !enabled;
    document.getElementById("worldHeightInput").disabled = !enabled;
    document.getElementById("gridSizeSelect").disabled = !enabled;
    document.getElementById("applyWorldBtn").disabled = !enabled;
    document.getElementById("scaleSlider").disabled = !enabled;
    document.getElementById("scaleNumber").disabled = !enabled;
    document.getElementById("opacitySlider").disabled = !enabled;
    document.getElementById("opacityNumber").disabled = !enabled;
    document.getElementById("imageLoader").disabled = !enabled;
    document.getElementById("paintBtn").disabled = !enabled;
    document.getElementById("eraseBtn").disabled = !enabled;
    document.getElementById("wheelbaseInput").disabled = !enabled;
    document.getElementById("frontOverhangInput").disabled = !enabled;
    document.getElementById("rearOverhangInput").disabled = !enabled;
    document.getElementById("trackWidthInput").disabled = !enabled;
    document.getElementById("bodyWidthInput").disabled = !enabled;
    document.getElementById("turningCircleInput").disabled = !enabled;
    document.getElementById("applyCarBtn").disabled = !enabled;
    document.getElementById("eraseAllBtn").disabled = !enabled;
    document.getElementById("colorPicker").disabled = !enabled;
    document.getElementById("carColorPicker").disabled = !enabled;
    document.getElementById("drawingOpacitySlider").disabled = !enabled;
    document.getElementById("drawingOpacityNumber").disabled = !enabled;
    document.getElementById("gridOpacitySlider").disabled = !enabled;
    document.getElementById("gridOpacityNumber").disabled = !enabled;
    document.getElementById("topSpeedSlider").disabled = !enabled;
    document.getElementById("topSpeedNumber").disabled = !enabled;
    document.getElementById("accelerationSlider").disabled = !enabled;
    document.getElementById("accelerationNumber").disabled = !enabled;

    // Camera buttons are controlled separately
    document.getElementById("freeCameraBtn").disabled = true;
    document.getElementById("followCameraBtn").disabled = true;
}

// ===== EXPORT LAYOUT =====
function exportLayout(){

    const saveData = {
        worldWidth: worldWidthMeters,
        worldHeight: worldHeightMeters,
        cellSize: cellSizeMeters,
        grid: grid,
        vehicle: {
            wheelBase: car.wheelBase,
            frontOverhang: car.frontOverhang,
            rearOverhang: car.rearOverhang,
            trackWidth: car.trackWidth,
            bodyWidth: car.bodyWidth,
            turningCircle: car.turningCircle,
            topSpeed: car.topSpeed,
            acceleration: car.acceleration
        },
        carColor: car.color,
        bgScale: bgScale,
        bgOpacity: bgOpacity,
        backgroundImage: bgImageBase64,
        gridOpacity: gridOpacity,
        drawingOpacity: drawingOpacity,
    };

    const json = JSON.stringify(saveData);
    const blob = new Blob([json], {type:"application/json"});
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
   
    // Ask user for filename
    let filename = prompt("Enter file name:", lastFilename);

    if(filename === null) return; // user pressed cancel

    filename = filename.trim();

    if(filename === ""){
        filename = "Layout_";
    }

    // ensure .json extension
    if(!filename.toLowerCase().endsWith(".json")){
        filename += ".json";
    }
    
    lastFilename = filename.replace(/\.json$/i, "");
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}

// ===== IMPORT LAYOUT =====
document.getElementById("layoutLoader").addEventListener("change", function(e){

    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(event){

        const data = JSON.parse(event.target.result);

        // Restore world settings
        worldWidthMeters = data.worldWidth;
        worldHeightMeters = data.worldHeight;
        cellSizeMeters = data.cellSize;

        document.getElementById("worldWidthInput").value = worldWidthMeters;
        document.getElementById("worldHeightInput").value = worldHeightMeters;
        document.getElementById("gridSizeSelect").value = cellSizeMeters;

        rebuildWorld();
        grid = data.grid;

        if(data.carColor){
            car.color = data.carColor;
            document.getElementById("carColorPicker").value = data.carColor;
        }

        // ===== Restore vehicle =====
        if(data.vehicle){

            car.wheelBase     = data.vehicle.wheelBase;
            car.frontOverhang = data.vehicle.frontOverhang;
            car.rearOverhang  = data.vehicle.rearOverhang;
            car.trackWidth    = data.vehicle.trackWidth;
            car.bodyWidth     = data.vehicle.bodyWidth;
            car.turningCircle = data.vehicle.turningCircle;

            // Update inputs
            document.getElementById("wheelbaseInput").value = car.wheelBase;
            document.getElementById("frontOverhangInput").value = car.frontOverhang;
            document.getElementById("rearOverhangInput").value = car.rearOverhang;
            document.getElementById("trackWidthInput").value = car.trackWidth;
            document.getElementById("bodyWidthInput").value = car.bodyWidth;
            document.getElementById("turningCircleInput").value = car.turningCircle;

            if(data.vehicle.topSpeed !== undefined){
                car.topSpeed = data.vehicle.topSpeed;
                document.getElementById("topSpeedSlider").value = car.topSpeed;
                document.getElementById("topSpeedNumber").value = car.topSpeed;
            }

            if(data.vehicle.acceleration !== undefined){
                car.acceleration = data.vehicle.acceleration;
                document.getElementById("accelerationSlider").value = car.acceleration;
                document.getElementById("accelerationNumber").value = car.acceleration;
            }

            computeSteeringFromTurningCircle();
            updateCarStats();
        }

        // Restore background scale & opacity
        bgScale = data.bgScale;
        bgOpacity = data.bgOpacity;

        document.getElementById("scaleSlider").value = bgScale;
        document.getElementById("scaleNumber").value = bgScale;

        document.getElementById("opacitySlider").value = bgOpacity;
        document.getElementById("opacityNumber").value = bgOpacity;

        // ===== Restore background image =====
        if(data.backgroundImage){

            bgImageBase64 = data.backgroundImage;

            const img = new Image();
            img.onload = function(){
                backgroundImage = img;
                updateRemoveBgButton(); // ✅ enable μετά το import
            };

            img.src = bgImageBase64;

        } else {

            // ✅ αν το layout ΔΕΝ έχει background, καθάρισε ό,τι υπάρχει
            backgroundImage = null;
            bgImageBase64 = null;

            const loader = document.getElementById("imageLoader");
            if(loader) loader.value = "";

            updateRemoveBgButton(); // ✅ disable
        }

        // Restore grid opacity
        if(data.gridOpacity !== undefined){
            gridOpacity = data.gridOpacity;
            pendingGridOpacity = data.gridOpacity;

            document.getElementById("gridOpacitySlider").value = data.gridOpacity;
            document.getElementById("gridOpacityNumber").value = data.gridOpacity;
        }

        // Restore drawing opacity
        if(data.drawingOpacity !== undefined){
            drawingOpacity = data.drawingOpacity;

            document.getElementById("drawingOpacitySlider").value = data.drawingOpacity;
            document.getElementById("drawingOpacityNumber").value = data.drawingOpacity;
        }
    };

    reader.readAsText(file);
});

// ===== STATUS BAR UPDATE =====
function updateStatusBar(){

    const modeEl = document.getElementById("modeStatus");
    const cameraEl = document.getElementById("cameraStatus");

    if(!modeEl || !cameraEl) return;

    // MODE
    if(mode === "edit"){
        modeEl.textContent = "EDIT";
        modeEl.style.color = "#ff9800"; // πορτοκαλί
    } else {
        modeEl.textContent = "PLAY";
        modeEl.style.color = "#4caf50"; // πράσινο
    }

    // CAMERA
    if(mode === "edit"){

        cameraEl.textContent = "FREE";
        cameraEl.classList.add("statusDisabled");

    }
    else{

        cameraEl.classList.remove("statusDisabled");

        if(cameraMode === "free"){
            cameraEl.textContent = "FREE";
            cameraEl.style.color = "#ff9800";
        } else {
            cameraEl.textContent = "FOLLOW";
            cameraEl.style.color = "#4caf50";
        }
    }
}

// ===== MODE SWITCH =====
function setMode(m){

    mode = m;

    if(mode === "edit"){
        setUIEnabled(true);   // unlock UI

        document.getElementById("freeCameraBtn").disabled = true;
        document.getElementById("followCameraBtn").disabled = true;
        cameraMode = "free"; // always free in edit
    } 
    else if(mode === "play"){
        setUIEnabled(false);  // lock UI

        document.getElementById("freeCameraBtn").disabled = false;
        document.getElementById("followCameraBtn").disabled = false;
    }

    updateStatusBar();
}

function applyWorldSettings(){

    const newWidth = parseFloat(document.getElementById("worldWidthInput").value);
    const newHeight = parseFloat(document.getElementById("worldHeightInput").value);

    resizeWorld(newWidth, newHeight);

    gridOpacity = pendingGridOpacity;

}

// ===== PAINT FUNCTION (Used by Click & Drag) =====
function paintAtCell(gx, gy){

    for(let by = 0; by < brushSize; by++){
        for(let bx = 0; bx < brushSize; bx++){

            const tx = gx + bx;
            const ty = gy + by;

            if(tx >= 0 && tx < cellsX && ty >= 0 && ty < cellsY){

                const previousValue = grid[ty][tx];
                let newValue = previousValue;

                if(paintMode === "paint"){
                    newValue = paintColor;
                }
                else if(paintMode === "erase"){
                    newValue = 0;
                }

                if(previousValue !== newValue){

                    if(currentStroke){
                        currentStroke.push({
                            x: tx,
                            y: ty,
                            prev: previousValue,
                            next: newValue
                        });
                    }

                    grid[ty][tx] = newValue;
                }
            }
        }
    }

    lastPaintedCell = { x: gx, y: gy };
}

function paintAtMouse(e){

    const rect = canvas.getBoundingClientRect();

    const mx = (e.clientX - rect.left - cameraX) / zoom;
    const my = (e.clientY - rect.top - cameraY) / zoom;

    const gx = Math.floor(mx / cellSizeMeters);
    const gy = Math.floor(my / cellSizeMeters);

    paintAtCell(gx, gy);
}

function drawLine(x0, y0, x1, y1){

    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);

    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;

    let err = dx - dy;

    while(true){

        paintAtCell(x0, y0);

        if(x0 === x1 && y0 === y1) break;

        let e2 = 2 * err;

        if(e2 > -dy){
            err -= dy;
            x0 += sx;
        }

        if(e2 < dx){
            err += dx;
            y0 += sy;
        }
    }
}

// ===== EDIT GRID (Click + Drag) =====

// Start painting
canvas.addEventListener("mousedown", function(e){

    // ===== EYEDROPPER LOGIC =====
    if(eyedropperMode){

        if(e.button !== 0){
            return; // ignore middle/right click
        }

        const rect = canvas.getBoundingClientRect();

        const mx = (e.clientX - rect.left - cameraX) / zoom;
        const my = (e.clientY - rect.top - cameraY) / zoom;

        const gx = Math.floor(mx / cellSizeMeters);
        const gy = Math.floor(my / cellSizeMeters);

        // Αν είναι εκτός grid
        if(gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length){
            eyedropperMode = false;
            canvas.style.cursor = "crosshair";
            return;
        }

        const pickedColor = grid[gy][gx];

        // Μόνο από βαμμένα κελιά
        if(pickedColor !== 0){

            paintColor = pickedColor;

            const colorInput = document.getElementById("colorPicker");
            if(colorInput){
                colorInput.value = paintColor;
            }

            eyedropperMode = false;
            canvas.style.cursor = "crosshair";
        }

        return;
    }

    if(mode !== "edit") return;
    if(e.button !== 0) return;

    currentStroke = [];
    redoStack = []; // new action clears redo history

    // Υπολογισμός grid cell
    const rect = canvas.getBoundingClientRect();

    const mx = (e.clientX - rect.left - cameraX) / zoom;
    const my = (e.clientY - rect.top - cameraY) / zoom;

    const gx = Math.floor(mx / cellSizeMeters);
    const gy = Math.floor(my / cellSizeMeters);

    // Αν υπάρχει προηγούμενο click και κρατάς Shift
    if(lastClickCell && e.shiftKey){

    drawLine(lastClickCell.x, lastClickCell.y, gx, gy);

    lastClickCell = { x: gx, y: gy };

    justDidShiftLine = true;

    } else {

        // Αποθήκευσε αυτό το click ως νέο start
        lastClickCell = { x: gx, y: gy };
        dragStartCell = { x: gx, y: gy };
        isPainting = true;
        paintAtCell(gx, gy);
    }

});

// Drag painting
canvas.addEventListener("mousemove", function(e){

    if(!isPainting) return;
    if(mode !== "edit") return;

    const rect = canvas.getBoundingClientRect();

    const mx = (e.clientX - rect.left - cameraX) / zoom;
    const my = (e.clientY - rect.top - cameraY) / zoom;

    let gx = Math.floor(mx / cellSizeMeters);
    let gy = Math.floor(my / cellSizeMeters);

    // Αν κρατάς Shift → axis lock
    if(e.shiftKey && dragStartCell){

        const dx = Math.abs(gx - dragStartCell.x);
        const dy = Math.abs(gy - dragStartCell.y);

        if(dx > dy){
            gy = dragStartCell.y; // lock horizontal
        } else {
            gx = dragStartCell.x; // lock vertical
        }
    }

    paintAtCell(gx, gy);
});

// ===== MOUSE TRACKING FOR BRUSH PREVIEW =====
canvas.addEventListener("mousemove", function(e){

    const rect = canvas.getBoundingClientRect();

    mouseScreenX = e.clientX - rect.left;
    mouseScreenY = e.clientY - rect.top;
});

// Stop painting
canvas.addEventListener("mouseup", function(e){

    if(mode !== "edit") return;

    isPainting = false;

    // Υπολογισμός cell στο οποίο τελείωσε το drag
    const rect = canvas.getBoundingClientRect();

    const mx = (e.clientX - rect.left - cameraX) / zoom;
    const my = (e.clientY - rect.top - cameraY) / zoom;

    const gx = Math.floor(mx / cellSizeMeters);
    const gy = Math.floor(my / cellSizeMeters);

    if(!justDidShiftLine && lastPaintedCell){
        lastClickCell = { 
            x: lastPaintedCell.x, 
            y: lastPaintedCell.y 
        };
    }

    // Push stroke to undo stack
    if(currentStroke && currentStroke.length > 0){
        undoStack.push(currentStroke);
    }

    currentStroke = null;

    justDidShiftLine = false;
});

canvas.addEventListener("mouseleave", function(e){

    isPainting = false;

    const rect = canvas.getBoundingClientRect();

    const mx = (e.clientX - rect.left - cameraX) / zoom;
    const my = (e.clientY - rect.top - cameraY) / zoom;

    const gx = Math.floor(mx / cellSizeMeters);
    const gy = Math.floor(my / cellSizeMeters);

    if(!justDidShiftLine && lastPaintedCell){
        lastClickCell = { 
            x: lastPaintedCell.x, 
            y: lastPaintedCell.y 
        };
    }

    justDidShiftLine = false;
});

// ===== CONTROLS =====
const keys = {};
document.addEventListener("keydown", e=>keys[e.key]=true);
document.addEventListener("keyup", e=>keys[e.key]=false);

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", function(e){

    // Αποφυγή repeat όταν κρατάς πατημένο
    if(e.repeat) return;

    const key = e.key.toLowerCase();

    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    // ===== UNDO (Cmd/Ctrl + Z) =====
    if(ctrlOrCmd && !e.shiftKey && key === "z"){
        e.preventDefault();
        
        if(undoStack.length > 0){

            const stroke = undoStack.pop();
            redoStack.push(stroke);

            for(const cell of stroke){
                grid[cell.y][cell.x] = cell.prev;
            }
        }
        return;
    }

    // ===== REDO (Cmd/Ctrl + Shift + Z) =====
    if(ctrlOrCmd && e.shiftKey && key === "z"){
        e.preventDefault();

        if(redoStack.length > 0){

            const stroke = redoStack.pop();
            undoStack.push(stroke);

            for(const cell of stroke){
                grid[cell.y][cell.x] = cell.next;
            }
        }
        return;
    }

    // Αν γράφουμε σε input, μην ενεργοποιούμε shortcuts
    const activeElement = document.activeElement;
    if(activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA"){
        return;
    }

    // ===== BRUSH SIZE +/- =====
    if(mode === "edit"){

        const select = document.getElementById("gridSizeSelect");
        const currentIndex = select.selectedIndex;
        const maxIndex = select.options.length - 1;

        // PLUS
        if(key === "+" || key === "="){

            if(currentIndex < maxIndex){
                select.selectedIndex = currentIndex + 1;
                select.dispatchEvent(new Event("change"));
            }
            return;
        }

        // MINUS
        if(key === "-"){

            if(currentIndex > 0){
                select.selectedIndex = currentIndex - 1;
                select.dispatchEvent(new Event("change"));
            }
            return;
        }
    }

    // M → Toggle Mode
    if(key === "m"){
        if(mode === "edit"){
            setMode("play");
        } else {
            setMode("edit");
        }
    }

    // C → Toggle Camera (μόνο σε Play)
    if(key === "c" && mode === "play"){
        if(cameraMode === "free"){
            cameraMode = "follow";
        } else {
            cameraMode = "free";
        }
        console.log("Camera Mode:", cameraMode);
        updateStatusBar();
    }

    // P → Paint (μόνο σε Edit)
    if(key === "p" && mode === "edit"){
        paintMode = "paint";
        updateToolUI();
    }

    // E → Erase (μόνο σε Edit)
    if(key === "e" && mode === "edit"){
        paintMode = "erase";
        updateToolUI();
    }

    // I → Eyedropper (μόνο σε Edit)
    if(key === "i" && mode === "edit"){
        eyedropperMode = true;
        canvas.style.cursor = "url('data:image/svg+xml;utf8,\
        <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\">\
        <circle cx=\"8\" cy=\"8\" r=\"2\" fill=\"rgb(0, 0, 0)\" stroke=\"white\" stroke-width=\"2\"/>\
        </svg>') 8 8, crosshair";
        console.log("Eyedropper mode ON");
        return;
    }

    // ESC → Cancel Eyedropper
    if(e.key === "Escape" && eyedropperMode){

        eyedropperMode = false;
        canvas.style.cursor = "crosshair";
        console.log("Eyedropper cancelled");

        return;
    }

    // R → Reset Vehicle (σε οποιοδήποτε mode)
    if(key === "r"){
        resetVehicle();
    }

    // Ctrl/Cmd + S → Save Layout
    if(ctrlOrCmd && key === "s"){

        e.preventDefault(); // prevent browser Save Page dialog
        exportLayout();
        return;
    }
});

// ===== CAMERA DRAG PAN =====
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener("mousedown", e=>{

    // Only middle mouse button (wheel)
    if(e.button !== 1) return;

    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

canvas.addEventListener("mouseup", ()=> isDragging=false);

canvas.addEventListener("mousemove", e=>{

    if(isDragging){

        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        cameraX += dx;
        cameraY += dy;

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }

});

// ===== CAMERA ZOOM =====
canvas.addEventListener("wheel", e=>{

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // world position before zoom
    const worldX = (mouseX - cameraX) / zoom;
    const worldY = (mouseY - cameraY) / zoom;

    const zoomIntensity = 0.001;
    const oldZoom = zoom;

    zoom += zoom * e.deltaY * -zoomIntensity;

    zoom = Math.max(20, Math.min(400, zoom));

    // adjust camera so mouse stays fixed
    cameraX = mouseX - worldX * zoom;
    cameraY = mouseY - worldY * zoom;
});

// ===== IMAGE LOADER =====
document.getElementById("imageLoader").addEventListener("change", function(e){

    const reader = new FileReader();

    reader.onload = function(event){

        bgImageBase64 = event.target.result;   // ✅ ΑΠΟΘΗΚΕΥΟΥΜΕ ΤΟ BASE64

        backgroundImage = new Image();
        backgroundImage.src = bgImageBase64;   // χρησιμοποιούμε το ίδιο string

        updateRemoveBgButton();
    };

    reader.readAsDataURL(e.target.files[0]);
});

// ===== REMOVE BACKGROUND IMAGE =====
const removeBgBtn = document.getElementById("removeBgBtn");

function updateRemoveBgButton(){
    if(!removeBgBtn) return;
    removeBgBtn.disabled = !(backgroundImage && bgImageBase64);
}

if(removeBgBtn){
    removeBgBtn.addEventListener("click", function(){

        openConfirmModal(
            "Remove background image?",
            "This will remove the background image from the canvas.",
            function(){

                // clear background
                backgroundImage = null;
                bgImageBase64 = null;

                // clear file input
                const loader = document.getElementById("imageLoader");
                if(loader) loader.value = "";

                updateRemoveBgButton();
            }
        );

    });
}

// ===== BACKGROUND CONTROLS =====

// Slider → ενημερώνει scale + number
document.getElementById("scaleSlider").addEventListener("input", function(e){
    bgScale = parseFloat(e.target.value);
    document.getElementById("scaleNumber").value = bgScale;
});

// Number → ενημερώνει scale + slider
document.getElementById("scaleNumber").addEventListener("input", function(e){
    bgScale = parseFloat(e.target.value);
    document.getElementById("scaleSlider").value = bgScale;
});

// Slider → ενημερώνει opacity + number
document.getElementById("opacitySlider").addEventListener("input", function(e){
    bgOpacity = parseFloat(e.target.value);
    document.getElementById("opacityNumber").value = bgOpacity.toFixed(2);
});

// Number → ενημερώνει opacity + slider
document.getElementById("opacityNumber").addEventListener("input", function(e){
    bgOpacity = parseFloat(e.target.value);
    document.getElementById("opacitySlider").value = bgOpacity;
});

// ===== BRUSH SIZE CHANGE =====
document.getElementById("gridSizeSelect").addEventListener("change", function(e){
    brushSize = parseInt(e.target.value);
});

// ===== TOOL BUTTONS =====
document.getElementById("paintBtn").addEventListener("click", function(){
    paintMode = "paint";
    updateToolUI();
});

document.getElementById("eraseBtn").addEventListener("click", function(){
    paintMode = "erase";
    updateToolUI();
});

document.getElementById("colorPicker").addEventListener("input", function(e){
    paintColor = e.target.value;
});

document.getElementById("drawingOpacitySlider")
.addEventListener("input", function(e){
    drawingOpacity = parseFloat(e.target.value);
    document.getElementById("drawingOpacityNumber").value = drawingOpacity;
});

document.getElementById("drawingOpacityNumber")
.addEventListener("input", function(e){
    drawingOpacity = parseFloat(e.target.value);
    document.getElementById("drawingOpacitySlider").value = drawingOpacity;
});

document.getElementById("gridOpacitySlider")
.addEventListener("input", function(e){
    pendingGridOpacity = parseFloat(e.target.value);
    document.getElementById("gridOpacityNumber").value = pendingGridOpacity;
});

document.getElementById("gridOpacityNumber")
.addEventListener("input", function(e){
    pendingGridOpacity = parseFloat(e.target.value);
    document.getElementById("gridOpacitySlider").value = pendingGridOpacity;
});

// ===== TOP SPEED CONTROLS =====
document.getElementById("topSpeedSlider")
.addEventListener("input", function(e){
    document.getElementById("topSpeedNumber").value = e.target.value;
});

document.getElementById("topSpeedNumber")
.addEventListener("input", function(e){
    document.getElementById("topSpeedSlider").value = e.target.value;
});

// ===== ACCELERATION CONTROLS =====
document.getElementById("accelerationSlider")
.addEventListener("input", function(e){
    document.getElementById("accelerationNumber").value = e.target.value;
});

document.getElementById("accelerationNumber")
.addEventListener("input", function(e){
    document.getElementById("accelerationSlider").value = e.target.value;
});

document.getElementById("resetVehicleBtn")
    .addEventListener("click", resetVehicle);

// ===== UPDATE TOOL UI =====
function updateToolUI(){

    const paintBtn = document.getElementById("paintBtn");
    const eraseBtn = document.getElementById("eraseBtn");

    paintBtn.classList.remove("toolActivePaint");
    eraseBtn.classList.remove("toolActiveErase");

    if(paintMode === "paint"){
        paintBtn.classList.add("toolActivePaint");
    }
    else if(paintMode === "erase"){
        eraseBtn.classList.add("toolActiveErase");
    }
}

// ===== GENERIC CONFIRM MODAL =====
const confirmModal   = document.getElementById("confirmModal");
const confirmTitle   = document.getElementById("confirmTitle");
const confirmText    = document.getElementById("confirmText");
const confirmYesBtn  = document.getElementById("confirmYesBtn");
const confirmNoBtn   = document.getElementById("confirmNoBtn");

let pendingConfirmAction = null;

function openConfirmModal(title, text, onConfirm){
    pendingConfirmAction = onConfirm;

    if(confirmTitle) confirmTitle.textContent = title || "Are you sure?";
    if(confirmText)  confirmText.textContent  = text  || "Do you want to proceed?";

    if(confirmModal) confirmModal.classList.remove("hidden");
}

function closeConfirmModal(){
    pendingConfirmAction = null;
    if(confirmModal) confirmModal.classList.add("hidden");
}

if(confirmYesBtn){
    confirmYesBtn.addEventListener("click", function(){
        if(typeof pendingConfirmAction === "function"){
            pendingConfirmAction();
        }
        closeConfirmModal();
    });
}

if(confirmNoBtn){
    confirmNoBtn.addEventListener("click", closeConfirmModal);
}

document.addEventListener("keydown", function(e){
    if(e.key === "Escape"){
        closeConfirmModal();
    }
});

// ===== ERASE ALL BUTTON (uses generic confirm modal) =====
const eraseAllBtn = document.getElementById("eraseAllBtn");

if (eraseAllBtn) {
    eraseAllBtn.addEventListener("click", function(){

        openConfirmModal(
            "Erase everything?",
            "This will clear all drawn obstacles from the grid.",
            function(){

                for(let y = 0; y < cellsY; y++){
                    for(let x = 0; x < cellsX; x++){
                        grid[y][x] = 0;
                    }
                }

            }
        );

    });
}

// ===== COLLISION =====
function checkCollision(x, y, angle){

    const BW = car.bodyWidth;
    const WB = car.wheelBase;
    const FO = car.frontOverhang;
    const RO = car.rearOverhang;

    // Rear axle is (0,0)
    const localCorners = [
        {x: -BW/2, y: -RO},          // rear left bumper
        {x:  BW/2, y: -RO},          // rear right bumper
        {x:  BW/2, y:  WB + FO},     // front right bumper
        {x: -BW/2, y:  WB + FO}      // front left bumper
    ];

    // Rotate to world space
    let worldCorners = localCorners.map(p => {

        const a = angle + Math.PI;

        return {
            x: x + p.x * Math.cos(a) - p.y * Math.sin(a),
            y: y + p.x * Math.sin(a) + p.y * Math.cos(a)
        };

    });

    // Determine bounding box of car
    let minX = Math.min(...worldCorners.map(p=>p.x));
    let maxX = Math.max(...worldCorners.map(p=>p.x));
    let minY = Math.min(...worldCorners.map(p=>p.y));
    let maxY = Math.max(...worldCorners.map(p=>p.y));

    let minGX = Math.floor(minX / cellSizeMeters);
    let maxGX = Math.floor(maxX / cellSizeMeters);
    let minGY = Math.floor(minY / cellSizeMeters);
    let maxGY = Math.floor(maxY / cellSizeMeters);

    for(let gy = minGY; gy <= maxGY; gy++){
        for(let gx = minGX; gx <= maxGX; gx++){

            if(gx < 0 || gx >= cellsX || gy < 0 || gy >= cellsY)
                return true;

            const cell = grid[gy][gx];

            if(cell !== 0){

                // grid cell bounds
                let cellMinX = gx * cellSizeMeters;
                let cellMaxX = cellMinX + cellSizeMeters;
                let cellMinY = gy * cellSizeMeters;
                let cellMaxY = cellMinY + cellSizeMeters;

                if(polygonIntersectsRect(worldCorners,
                    cellMinX, cellMinY,
                    cellMaxX, cellMaxY)){
                        return true;
                }
            }
        }
    }

    return false;
}

function polygonIntersectsRect(poly, minX, minY, maxX, maxY){

    // Check if any polygon point inside rect
    for(let p of poly){
        if(p.x >= minX && p.x <= maxX &&
           p.y >= minY && p.y <= maxY)
           return true;
    }

    // Check rect corners inside polygon
    let rectCorners = [
        {x:minX, y:minY},
        {x:maxX, y:minY},
        {x:maxX, y:maxY},
        {x:minX, y:maxY}
    ];

    for(let p of rectCorners){
        if(pointInPolygon(p, poly))
            return true;
    }

    return false;
}

function pointInPolygon(point, poly){

    let inside = false;

    for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){
        let xi = poly[i].x, yi = poly[i].y;
        let xj = poly[j].x, yj = poly[j].y;

        let intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

        if(intersect) inside = !inside;
    }

    return inside;
}

// ===== PHYSICS =====
function update(dt){

    if(mode !== "play") return;

    const accel = car.acceleration;
    const brake = 6;
    const steerSpeed = 2;
    const maxSpeed = car.topSpeed;

    // Steering
    if(keys["ArrowLeft"]) car.steer -= steerSpeed * dt;
    if(keys["ArrowRight"]) car.steer += steerSpeed * dt;

    car.steer = Math.max(-car.maxSteer, Math.min(car.maxSteer, car.steer));

    if(!keys["ArrowLeft"] && !keys["ArrowRight"])
        car.steer *= 0.9;

    // Acceleration
    if(keys["ArrowUp"]) {
        car.speed += accel * dt;
    }
    else if(keys["ArrowDown"]) {
        car.speed -= brake * dt;
    }
    else if(keys[" "]) {   // SPACE BRAKE
        car.speed *= 0.92;  // δυναμικό φρενάρισμα
    }
    else {
        car.speed *= 0.98;  // φυσικό ρολάρισμα
    }

    car.speed = Math.max(-maxSpeed, Math.min(maxSpeed, car.speed));

    // Bicycle model (rear axle reference)
    let nextAngle = car.angle;

    if(Math.abs(car.steer) > 0.001){
        nextAngle += (car.speed / car.wheelBase) *
            Math.tan(car.steer) * dt;
    }

    // ===== SUBSTEP + SWEEP MOVEMENT =====
    let totalMove = car.speed * dt;

    let steps = Math.ceil(Math.abs(totalMove) / 0.02); // 2cm per step
    if(steps < 1) steps = 1;

    let stepMove = totalMove / steps;
    let stepAngle = (nextAngle - car.angle) / steps;

    for(let i = 0; i < steps; i++){

        let prevX = car.x;
        let prevY = car.y;
        let prevAngle = car.angle;

        let testAngle = prevAngle + stepAngle;
        let testX = prevX + Math.sin(testAngle) * stepMove;
        let testY = prevY - Math.cos(testAngle) * stepMove;

        // Sweep between prev and test
        let sweepSteps = 5;

        for(let s = 1; s <= sweepSteps; s++){

            let t = s / sweepSteps;

            let lerpX = prevX + (testX - prevX) * t;
            let lerpY = prevY + (testY - prevY) * t;
            let lerpAngle = prevAngle + (testAngle - prevAngle) * t;

            if(checkCollision(lerpX, lerpY, lerpAngle)){
                car.speed = 0;
                return;
            }
        }

        car.x = testX;
        car.y = testY;
        car.angle = testAngle;
    }

    // ===== FOLLOW CAMERA CENTERING (GEOMETRIC CENTER) =====
    if(cameraMode === "follow" && mode === "play"){

        const totalLength =
            car.rearOverhang +
            car.wheelBase +
            car.frontOverhang;

        // Offset μπροστά από τον πίσω άξονα
        const centerOffset = totalLength / 2 - car.rearOverhang;

        // Υπολογίζουμε world θέση κέντρου αμαξιού
        const centerX = car.x + Math.sin(car.angle) * centerOffset;
        const centerY = car.y - Math.cos(car.angle) * centerOffset;

        cameraX = canvas.width / 2 - centerX * zoom;
        cameraY = canvas.height / 2 - centerY * zoom;
    }
}

// ===== RESET CAR POSITION =====
function resetVehicle(){

    car.x = vehicleSpawn.x;
    car.y = vehicleSpawn.y;
    car.angle = vehicleSpawn.angle;

    car.speed = 0;
    car.steer = 0;
}

// ===== DRAW GRID =====
function drawGridLines(){

    const worldWidthPx = worldWidthMeters * zoom;
    const worldHeightPx = worldHeightMeters * zoom;

    // ===== 10cm minor grid =====
    ctx.strokeStyle = `rgba(255,255,255,${gridOpacity * 0.3})`;
    ctx.lineWidth = 1;

    for(let x = 0; x <= worldWidthMeters; x += 0.1){
        ctx.beginPath();
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, worldHeightPx);
        ctx.stroke();
    }

    for(let y = 0; y <= worldHeightMeters; y += 0.1){
        ctx.beginPath();
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(worldWidthPx, y * zoom);
        ctx.stroke();
    }

    // ===== 50cm mid grid =====
    ctx.strokeStyle = `rgba(255,255,255,${gridOpacity * 0.6})`;
    ctx.lineWidth = 1;

    for(let x = 0; x <= worldWidthMeters; x += 0.5){
        ctx.beginPath();
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, worldHeightMeters * zoom);
        ctx.stroke();
    }

    for(let y = 0; y <= worldHeightMeters; y += 0.5){
        ctx.beginPath();
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(worldWidthMeters * zoom, y * zoom);
        ctx.stroke();
    }

    // ===== 1m major grid =====
    ctx.strokeStyle = `rgba(255,255,255,${gridOpacity})`;
    ctx.lineWidth = 1;

    for(let x = 0; x <= worldWidthMeters; x += 1){
        ctx.beginPath();
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, worldHeightPx);
        ctx.stroke();
    }

    for(let y = 0; y <= worldHeightMeters; y += 1){
        ctx.beginPath();
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(worldWidthPx, y * zoom);
        ctx.stroke();
    }
}

// ===== DRAW OBSTACLES =====
function drawDrawing(){

  for(let y=0; y<cellsY; y++){
    for(let x=0; x<cellsX; x++){

      if(grid[y][x] !== 0){

        ctx.save();
        ctx.globalAlpha = drawingOpacity;

        ctx.fillStyle = grid[y][x];

        ctx.fillRect(
          x * cellSizeMeters * zoom,
          y * cellSizeMeters * zoom,
          cellSizeMeters * zoom,
          cellSizeMeters * zoom
        );

        ctx.restore();
      }
    }
  }
}

// ===== DRAW CAR =====
function roundedRectPath(x, y, w, h, r){
    // clamp radius
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));

    // Path only (NO fill/stroke here)
    ctx.beginPath();

    // Native if available
    if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, r);
        return;
    }

    // Fallback: manual path
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawCar(){

    ctx.save();

    // Rear axle center is car.x, car.y
    ctx.translate(car.x * zoom, car.y * zoom);
    ctx.rotate(car.angle + Math.PI);

    const BW = car.bodyWidth;
    const WB = car.wheelBase;
    const FO = car.frontOverhang;
    const RO = car.rearOverhang;

    const widthPx  = BW * zoom;
    const rearPx   = RO * zoom;
    const frontPx  = (WB + FO) * zoom;

    // ===== Body (rounded + outline) =====
    const bodyX = -widthPx / 2;
    const bodyY = -rearPx;
    const bodyW = widthPx;
    const bodyH = rearPx + frontPx;

    // ΣΤΑΘΕΡΟ roundness (σε px) — δένει με zoom για να φαίνεται “ίδιο” σε scale
    const bodyRadiusPx = 0.1 * zoom;     // δοκίμασε 0.10–0.18

    roundedRectPath(bodyX, bodyY, bodyW, bodyH, bodyRadiusPx);

    // fill (το χρώμα που διαλέγει ο χρήστης)
    ctx.fillStyle = car.color;
    ctx.globalAlpha = 1;
    ctx.fill();

    // ΣΤΑΘΕΡΟ outline (ελαφρύ)
    ctx.save();
    ctx.globalAlpha = 1;               // πόσο “ελαφρύ” (0.15–0.35)
    ctx.strokeStyle = "#ffffff";          // ή π.χ. "rgba(255,255,255,0.25)" αν θες χωρίς globalAlpha
    ctx.lineWidth = Math.max(1, 0.02 * zoom); // scale με zoom (ή βάλ’ το σκέτο 2 για σταθερό px)
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();

    // ===== Rear Axle Debug Dot (optional) =====
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();

    // ===== Wheels =====
    const halfTrack = car.trackWidth / 2;

    drawWheel(-halfTrack, 0, 0);          // rear left
    drawWheel( halfTrack, 0, 0);          // rear right
    drawWheel(-halfTrack, WB, car.steer); // front left
    drawWheel( halfTrack, WB, car.steer); // front right

    ctx.restore();
}

function drawWheel(localX, localY, steerAngle){

    ctx.save();

    ctx.translate(localX * zoom, localY * zoom);
    ctx.rotate(steerAngle);

    const wheelWidth  = 0.35 * zoom;
    const wheelLength = 0.7 * zoom;
    const radius = 0.05 * zoom;

    roundedRectPath(
        -wheelWidth / 2,
        -wheelLength / 2,
        wheelWidth,
        wheelLength,
        radius
    );

    ctx.fillStyle = "#111";
    ctx.fill();

    ctx.lineWidth = Math.max(1, 0.02 * zoom);
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
}

// ===== RULER=====
function drawTopRuler(){

    const rulerHeight = 35;
    const centerX = canvas.width / 2;
    const pixelsPerMeter = zoom;

    let majorStep;
    let minorStep;
    let subMinorStep = null;   // 👈 νέο

    if (pixelsPerMeter < 30) {
        majorStep = 2;      // 5 meters
        minorStep = 1;      // 1 meter
    } 
    else if (pixelsPerMeter < 60) {
        majorStep = 1;      // 1 meter
        minorStep = 0.5;    // 0.5 meter
    } 
    else {
        majorStep = 0.5;    // 0.5 meter
        minorStep = 0.1;    // 10 cm

        if (pixelsPerMeter > 330) {
            subMinorStep = 0.02;   // 2 cm ticks
        }
    }

    // Background strip
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, rulerHeight);

    ctx.strokeStyle = "#888";
    ctx.fillStyle = "#ccc";
    ctx.lineWidth = 1;

    // Πόσα μέτρα χωράνε αριστερά/δεξιά;
    const metersVisible = Math.ceil(canvas.width / pixelsPerMeter / 2);

    // ===== SUB-MINOR TICKS (2cm) =====
    if (subMinorStep) {

        const subMetersVisible = metersVisible; // ίδιο range

        for (let m = -subMetersVisible; m <= subMetersVisible; m += subMinorStep) {

            const x = centerX + m * pixelsPerMeter;

            if (x < 0 || x > canvas.width) continue;

            // ΜΗΝ ζωγραφίζουμε εκεί που ήδη θα μπουν minor/major
            const isOnMinor = Math.abs((m / minorStep) - Math.round(m / minorStep)) < 0.0001;
            if (isOnMinor) continue;

            ctx.beginPath();
            ctx.moveTo(x, rulerHeight);
            ctx.lineTo(x, rulerHeight - 4);   // μικρότερο tick
            ctx.stroke();
        }
    }

    for (let m = -metersVisible; m <= metersVisible; m += minorStep) {

        const x = centerX + m * pixelsPerMeter;

        if (x < 0 || x > canvas.width) continue;

        const tickIndex = Math.round(m / minorStep);
        const majorEvery = Math.round(majorStep / minorStep);
        const isMajor = tickIndex % majorEvery === 0;

        ctx.beginPath();
        ctx.moveTo(x, rulerHeight);

        if (isMajor) {
            ctx.lineTo(x, rulerHeight - 15);   // Major tick
        } else {
            ctx.lineTo(x, rulerHeight - 8);    // Minor tick
        }

        ctx.stroke();

        if (isMajor || pixelsPerMeter > 230) {

            let value = Math.abs(m);

            let label = value.toFixed(2);
            label = label.replace(/\.00$/, '');
            label = label.replace(/(\.\d)0$/, '$1');

            ctx.font = "12px Arial";  // reset every time

            if (!label.includes('.')) {
                ctx.font = "bold 15px Arial";
            }

            ctx.textAlign = "center";
            ctx.fillText(label, x, 12);
        }
    }
}

// ===== DRAW =====
function draw(){

    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.save();

    ctx.translate(cameraX, cameraY);

    // ===== DRAW BACKGROUND PLAN (centered) =====
    if(showBackground && backgroundImage){

        ctx.save();
        ctx.globalAlpha = bgOpacity;

        let widthMeters = bgWidthMeters * bgScale;
        let aspect = backgroundImage.height / backgroundImage.width;
        let heightMeters = widthMeters * aspect;

        // Κέντρο του world σε μέτρα
        let worldCenterX = worldWidthMeters / 2;
        let worldCenterY = worldHeightMeters / 2;

        // Πάνω-αριστερή γωνία εικόνας
        let drawX = (worldCenterX - widthMeters / 2) * zoom;
        let drawY = (worldCenterY - heightMeters / 2) * zoom;

        ctx.drawImage(
            backgroundImage,
            drawX,
            drawY,
            widthMeters * zoom,
            heightMeters * zoom
        );

        ctx.restore();
    }

    if(showGrid) drawGridLines();
    if(showDrawing) drawDrawing();
    if(showVehicle) drawCar();

    // ===== BRUSH PREVIEW =====
    if(mode === "edit" && (paintMode === "paint" || paintMode === "erase")){

        // Screen → World (χωρίς διπλό camera offset)
        const worldX = (mouseScreenX - cameraX) / zoom;
        const worldY = (mouseScreenY - cameraY) / zoom;

        const gx = Math.floor(worldX / cellSizeMeters);
        const gy = Math.floor(worldY / cellSizeMeters);

        const brushSize = parseInt(document.getElementById("gridSizeSelect").value);

        ctx.save();
        ctx.globalAlpha = 0.25;

        for(let y = 0; y < brushSize; y++){
            for(let x = 0; x < brushSize; x++){

                const cellWorldX = (gx + x) * cellSizeMeters;
                const cellWorldY = (gy + y) * cellSizeMeters;

                const sizePx = cellSizeMeters * zoom;

                ctx.strokeStyle = "#ffffff";

                // ⚠️ ΔΕΝ βάζουμε cameraX / cameraY εδώ
                ctx.strokeRect(
                    cellWorldX * zoom,
                    cellWorldY * zoom,
                    sizePx,
                    sizePx
                );
            }
        }

        ctx.restore();
    }

    ctx.restore();

    if(showRuler) drawTopRuler();
}

// ===== LOOP =====
let last=0;

function loop(t){

    const dt=(t-last)/1000;
    last=t;

    update(dt);
    draw();

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// ===== CAMERA BUTTON EVENTS =====
document.getElementById("freeCameraBtn")
    .addEventListener("click", function(){
        cameraMode = "free";
        console.log("Camera Mode:", cameraMode);
        updateStatusBar();
    });

document.getElementById("followCameraBtn")
    .addEventListener("click", function(){
        cameraMode = "follow";
        console.log("Camera Mode:", cameraMode);
        updateStatusBar();
    });

// ===== VISIBILITY TOGGLES =====
const uiPanel = document.getElementById("ui");

const toggleUIBtn        = document.getElementById("toggleUIBtn");
const toggleRulerBtn     = document.getElementById("toggleRulerBtn");
const toggleGridBtn      = document.getElementById("toggleGridBtn");
const toggleDrawingBtn  = document.getElementById("toggleDrawingBtn");
const toggleBgBtn        = document.getElementById("toggleBgBtn");
const toggleVehicleBtn   = document.getElementById("toggleVehicleBtn");

function applyVisibility(){
    // UI panel
    if(uiPanel){
        uiPanel.style.display = showUI ? "block" : "none";
    }

    // Update button labels (αν υπάρχουν)
    if(toggleUIBtn)      toggleUIBtn.textContent = showUI ? "Hide UI" : "Show UI";
    if(toggleRulerBtn)   toggleRulerBtn.textContent = showRuler ? "Hide Ruler" : "Show Ruler";
    if(toggleGridBtn)    toggleGridBtn.textContent = showGrid ? "Hide Grid" : "Show Grid";
    if(toggleDrawingBtn) toggleDrawingBtn.textContent = showDrawing ? "Hide Drawing" : "Show Drawing";
    if(toggleBgBtn)      toggleBgBtn.textContent = showBackground ? "Hide BG" : "Show BG";
    if(toggleVehicleBtn) toggleVehicleBtn.textContent = showVehicle ? "Hide Vehicle" : "Show Vehicle";
}

// Button events
if(toggleUIBtn){
    toggleUIBtn.addEventListener("click", () => {
        showUI = !showUI;
        applyVisibility();
    });
}

if(toggleRulerBtn){
    toggleRulerBtn.addEventListener("click", () => {
        showRuler = !showRuler;
        applyVisibility();
    });
}

if(toggleGridBtn){
    toggleGridBtn.addEventListener("click", () => {
        showGrid = !showGrid;
        applyVisibility();
    });
}

if(toggleDrawingBtn){
  toggleDrawingBtn.addEventListener("click", () => {
    showDrawing = !showDrawing;
    applyVisibility();
  });
}

if(toggleBgBtn){
    toggleBgBtn.addEventListener("click", () => {
        showBackground = !showBackground;
        applyVisibility();
    });
}

if(toggleVehicleBtn){
    toggleVehicleBtn.addEventListener("click", () => {
        showVehicle = !showVehicle;
        applyVisibility();
    });
}

// Run once on load
applyVisibility();

updateToolUI();
updateRemoveBgButton();