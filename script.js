// ==========================================
// STATE & VARIABLES
// ==========================================
let physicsLines = [];
let originalSceneryLines = [];
let sceneryLines = [];
let powerupsStr = ""; let metadataStr = "";

let appMode = 'manual';
const HYBRID_TOOLS = new Set(['tube', 'fill', 'gradient', 'text', 'rockBrush']);
let rockBrushSize = 45;
let rockBrushRoughness = 0.5;
let rockBrushType = 'random';
let isRockBrushPainting = false;
let lastRockBrushPos = null;
let currentRockBrushStrokeHulls = [];
const MODE_CYCLE = ['manual', 'hybrid', 'auto'];
let isLoadingSettings = false;
let suppressNextContextMenu = false;
let rightDownScreenPos = null;

function isInputFocused(target = document.activeElement) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
    if (tag === 'INPUT') {
        const t = (target.type || 'text').toLowerCase();
        return !['checkbox', 'radio', 'range', 'button', 'color', 'submit', 'reset'].includes(t);
    }
    return false;
}

function setLayerIcon(el, kind) {
    if (!el) return;
    const svgs = {
        'eye-open': '<svg class="mono-icon-sm" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
        'eye-closed': '<svg class="mono-icon-sm" viewBox="0 0 24 24"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 18c-6.5 0-10-6-10-6a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.2 10.2 0 0 1 12 4c6.5 0 10 6 10 6a18.5 18.5 0 0 1-2.16 3.19"/><line x1="2" y1="2" x2="22" y2="22"/></svg>',
        'lock': '<svg class="mono-icon-sm" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
        'unlock': '<svg class="mono-icon-sm" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/></svg>'
    };
    if (svgs[kind]) el.innerHTML = svgs[kind];
}
let currentTool = 'line';
let isDrawing = false;
let dragMode = null;
let lastMouseX = 0, lastMouseY = 0;
let isSpaceDown = false;
let isShiftDown = false;
let currentLine = [];
let mousePos = { x: 0, y: 0 };
let lastMaskX = 0, lastMaskY = 0;

let physicsVersion = 0;
let trackVersion = 0;
function bumpTrackVersion() { trackVersion++; }
function bumpPhysics() { physicsVersion++; trackVersion++; }

const polyBBoxCache = new WeakMap();
/**
 * Return the cached axis-aligned bounding box for a polyline.
 */
function getPolyBBox(poly) {
    let bb = polyBBoxCache.get(poly);
    if (bb) return bb;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < poly.length; i++) {
        const pt = poly[i];
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
    }
    bb = { minX, maxX, minY, maxY };
    polyBBoxCache.set(poly, bb);
    return bb;
}
function invalidatePolyBBox(poly) {
    if (poly) polyBBoxCache.delete(poly);
}
function clonePolysFast(arr) {
    return arr.map(poly => poly.map(pt => ({ x: pt.x, y: pt.y })));
}
/**
 * Copy-on-write replace a single polyline inside its layer array so structural undo snapshots stay immutable.
 */
function cowReplacePoly(poly, layer) {
    const arr = layer === 'physics' ? physicsLines : sceneryLines;
    const idx = arr.indexOf(poly);
    if (idx === -1) return poly;
    const cloned = clonePoints(poly);
    arr[idx] = cloned;
    return cloned;
}
/**
 * Check whether a target layer ('physics' | 'scenery' | 'both') is locked. Optionally warns via toast.
 */
function isLayerLocked(layer, warn = true) {
    if (layer === 'physics' && physicsLocked) {
        if (warn) toast('Physics layer is locked!', 'error', 1500);
        return true;
    }
    if (layer === 'scenery' && sceneryLocked) {
        if (warn) toast('Scenery layer is locked!', 'error', 1500);
        return true;
    }
    if (layer === 'both' && physicsLocked && sceneryLocked) {
        if (warn) toast('Both layers are locked!', 'error', 1500);
        return true;
    }
    return false;
}

let sceneryDirty = false;
let isDirty = false;

let shapeState = 'idle';
let shapeCenter = { x: 0, y: 0 };
let shapeRadius = 0;
let shapeRotation = 0;

let selectedVertex = null;
let symmetryMode = false;

// Layer Manager State
let physicsVisible = true;
let sceneryVisible = true;
let physicsLocked = false;
let sceneryLocked = false;
let sceneryOpacity = 1.0;

// Curve / Ramp Tool State
let curveState = 'idle';
let curveStart = null;
let curveControl = null;
let curveEnd = null;

// Eraser Tool State
let lastEraserPos = null;
let eraserErasedAny = false;

// Bridge Tool State
let bridgeState = 'idle'; // 'idle' | 'setting_end'
let bridgeStart = null;
let bridgeStartTangent = null;
let bridgeEnd = null;
let bridgeEndTangent = null;

// Tube Tool State
let tubeSpine = [];
let isTubeDrawing = false;

// Gradient Tool State
let isGradDragging = false;
let gradStart = null;
let gradEnd = null;
let gradClipCache = null;
let gradPreviewLines = [];

// Reference Image State
const refImage = {
    img: null,
    name: '',
    visible: true,
    locked: false,
    opacity: 0.45,
    scale: 1.0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
};
let isRefImgDragMode = false;
let refImgDragStart = null;
let refImgStartPos = null;

// Perspective Grid State
const perspectiveGrid = {
    visible: false,
    locked: false,
    mode: '2pt',       // '1pt' | '2pt' | '3pt' | 'iso'
    snapMode: 'angle', // 'none' | 'grid' | 'angle'
    axisLock: 'auto',  // 'auto' | 'vp1' | 'vp2' | 'vp3'
    snapConeDeg: 12,
    followCamera: false,
    vp1: { x: -450, y: 0 },
    vp2: { x: 450, y: 0 },
    vp3: { x: 0, y: 650 },
    isoAngle: 30,
    density: 16,
    opacity: 0.45,
};
let perspBookmarks = [];
let lastPerspCamX = 0, lastPerspCamY = 0;
let isPerspEditMode = false;
let hoveredPerspHandle = null;
let dragPerspHandle = null; // 'vp1' | 'vp2' | 'vp3' | 'horizon'
let perspDragLast = null;
let activePerspGuideRay = null;
const perspShadePoint = { x: 0, y: -250 };
let isPickingShadePoint = false;
let hoveredShadeHandle = false;
let boxState = 'idle'; // 'idle' | 'front' | 'depth'
let boxAnchor = null;
let boxFrontQuad = null;
let boxFullCorners = null;
let angleLockStep = 0; // 0 = Off, 15 = 15°, 45 = 45°
let activeAngleGuide = null;
let vertexSnapshotPending = false;

// UI & Desktop Extensions
let isZenMode = false;
let isMinimapVisible = true;
let minimapTransform = null;
let isMinimapDragging = false;
let minimapCacheCanvas = null;
let minimapCacheKey = '';
let autoSaveMinutes = 2;
let autoSaveTimer = null;
let recentTracks = [];

let selectionBoxes = { add: [], subtract: [] };
let selLayer = 'both';
let selDragState = null;
let selMoveStart = null;
let selMoveDelta = { x: 0, y: 0 };
let selection = {
    fragments: [],
    livePolys: null,
    bbox: null,
    polyCount: 0,
    pointCount: 0,
};

let clipboardFragments = null;

let placementState = {
    active: false,
    object: null,
    cursor: { x: 0, y: 0 },
};

const canvas = document.getElementById('trackCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');
let camX = 0, camY = 0, zoom = 0.5;
let viewW = 0, viewH = 0, dpr = 1;

const maskGrid = new Map();
let currentMaskColor = 'green';
const maskBinSize = 2;
const activeMaskColors = new Set(['green', 'blue', 'purple', 'red']);
const MASK_COLORS = { green: 'rgba(76, 175, 80, 0.6)', blue: 'rgba(33, 150, 243, 0.6)', purple: 'rgba(156, 39, 176, 0.6)', red: 'rgba(244, 67, 54, 0.6)' };

let cachedMaskGrid = null;
let cachedMaskPhysicsVersion = -1;

let cachedOutline = null;
let cachedOutlineState = "";

// ==========================================
// HISTORY
// ==========================================
const undoHistory = [];
const future = [];
let isRestoringHistory = false;
const HISTORY_LIMIT = 80;

function takeSnapshot() {
    // Structural-sharing snapshot: arrays of polyline refs (copy-on-write protects in-place edits)
    return {
        physics: physicsLines.slice(),
        originalScenery: originalSceneryLines.slice(),
        scenery: sceneryLines.slice(),
        masks: Array.from(maskGrid.entries()),
        physicsVersion,
        sceneryDirty,
        powerups: powerupsStr,
        metadata: metadataStr,
    };
}

let currentLoadedFileName = 'track.txt';

function snapshot() {
    if (isRestoringHistory) return;
    isDirty = true;
    if (window.electronAPI && window.electronAPI.setDirty) {
        window.electronAPI.setDirty(true, currentLoadedFileName);
    }
    undoHistory.push(takeSnapshot());
    if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
    future.length = 0;
    updateHistoryButtons();
}

function restoreSnapshot(snap) {
    isRestoringHistory = true;
    try {
        physicsLines = snap.physics.slice();
        originalSceneryLines = snap.originalScenery.slice();
        sceneryLines = snap.scenery.slice();
        maskGrid.clear();
        for (const [k, v] of snap.masks) maskGrid.set(k, v);
        bumpPhysics();
        sceneryDirty = !!snap.sceneryDirty;
        powerupsStr = snap.powerups || "";
        metadataStr = snap.metadata || "";
        selectedVertex = null;
        clearSelection();
        updatePreviewBadge();
        draw();
    } finally {
        isRestoringHistory = false;
    }
}

function undo() {
    if (undoHistory.length === 0) return;
    future.push(takeSnapshot());
    const snap = undoHistory.pop();
    restoreSnapshot(snap);
    updateHistoryButtons();
    toast('Undo', 'info', 1000);
}

function redo() {
    if (future.length === 0) return;
    undoHistory.push(takeSnapshot());
    const snap = future.pop();
    restoreSnapshot(snap);
    updateHistoryButtons();
    toast('Redo', 'info', 1000);
}

function updateHistoryButtons() {
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) u.disabled = undoHistory.length === 0;
    if (r) r.disabled = future.length === 0;

    const hudU = document.getElementById('hudUndoBtn');
    const hudR = document.getElementById('hudRedoBtn');
    if (hudU) hudU.disabled = undoHistory.length === 0;
    if (hudR) hudR.disabled = future.length === 0;
}

// ==========================================
// TOASTS
// ==========================================
function toast(msg, kind = 'info', duration = 3000) {
    const box = document.getElementById('toastContainer');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 320);
    }, duration);
}

function showUndoToast(msg, undoFn, duration = 5000) {
    const box = document.getElementById('toastContainer');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast info';
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    const btn = document.createElement('button');
    btn.textContent = 'Undo';
    btn.addEventListener('click', () => { undoFn(); el.remove(); });
    el.appendChild(btn);
    box.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 320);
    }, duration);
}

// ==========================================
// SETTINGS PERSISTENCE
// ==========================================
const SETTINGS_KEY = 'trackstudio.settings.v1';
const themeCheckbox = document.getElementById('themeToggleCheckbox');

let savedTheme = 'light';
try { savedTheme = localStorage.getItem('theme') || 'light'; } catch(e) {}
if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeCheckbox.checked = true;
}

themeCheckbox.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', themeCheckbox.checked);
    try { localStorage.setItem('theme', themeCheckbox.checked ? 'dark' : 'light'); } catch(e) {}
    saveSettings();
    drawPatternPreview();
});

function saveSettings() {
    if (isLoadingSettings) return;
    try {
        const scriptParams = {};
        document.querySelectorAll('#scriptParams input, #scriptParams select').forEach(el => {
            if (el.id && el.id.indexOf('param_') === 0) {
                scriptParams[el.id] = el.type === 'checkbox' ? el.checked : el.value;
            }
        });
        const s = {
            appMode,
            currentTool,
            drawLayer: document.getElementById('drawLayer').value,
            selLayer,
            snapToGrid: document.getElementById('snapToGridToggle').checked,
            gridSize: document.getElementById('gridSizeSelect').value,
            showGrid: document.getElementById('gridToggle').checked,
            showSpawnDot: document.getElementById('spawnDotToggle')?.checked ?? true,
            useMask: document.getElementById('useMaskToggle').checked,
            maskMode: document.getElementById('maskModeToggle').checked,
            maskTool: document.getElementById('maskToolSelect').value,
            brushSize: document.getElementById('brushSize').value,
            activeMaskColors: Array.from(activeMaskColors),
            currentMaskColor,
            scriptSelect: document.getElementById('scriptSelect').value,
            scriptParams,
            liveUpdate: document.getElementById('liveUpdate').checked,
            symmetry: symmetryMode,
            objView: currentObjView,
            lineType: document.getElementById('lineType').value,
            minStrokeLen: document.getElementById('minStrokeLen').value,
            pointSpacing: document.getElementById('pointSpacing').value,
            patternScale: document.getElementById('patternScale').value,
            noiseCoverage: document.getElementById('noiseCoverage').value,
            noiseSeed: document.getElementById('noiseSeed').value,
            theme: document.body.classList.contains('dark-mode') ? 'dark' : 'light',
            activeSideTab,
            isSidebarCollapsed,
            autoSaveMinutes,
            isMinimapVisible,
            sceneryOpacity,
            physicsVisible,
            sceneryVisible,
            physicsLocked,
            sceneryLocked,
            curveSegments: document.getElementById('curveSegments')?.value || 16,
            disableQuickAccess: document.getElementById('disableQuickAccessCheckbox')?.checked || false,
            eraserRadius: document.getElementById('eraserRadius')?.value || 20,
            eraserMode: document.getElementById('eraserMode')?.value || 'original',
            eraserLayerTarget: document.getElementById('eraserLayerTarget')?.value || 'both',
            angleLockStep,
            bridgeTension: document.getElementById('bridgeTension')?.value || 1.0,
            bridgeSteps: document.getElementById('bridgeSteps')?.value || 16,
            tubeWidth: document.getElementById('tubeWidth')?.value || 60,
            tubeJitterToggle: document.getElementById('tubeJitterToggle')?.checked ?? true,
            tubeJitter: document.getElementById('tubeJitter')?.value || 5,
            fillMode: document.getElementById('fillMode')?.value || 'full',
            fillDensity: document.getElementById('fillDensity')?.value || 3,
            fillRotation: document.getElementById('fillRotation')?.value || 0,
            fillSlant: document.getElementById('fillSlant')?.value || 0,
            gradType: document.getElementById('gradType')?.value || 'linear',
            gradStyle: document.getElementById('gradStyle')?.value || 'lines',
            gradStartSpacing: document.getElementById('gradStartSpacing')?.value || 3,
            gradEndSpacing: document.getElementById('gradEndSpacing')?.value || 45,
            gradFalloff: document.getElementById('gradFalloff')?.value || 'easeOut',
            gradClipMode: document.getElementById('gradClipMode')?.value || 'auto',
            gradSpanWidth: document.getElementById('gradSpanWidth')?.value || 220,
            gradInvert: document.getElementById('gradInvertToggle')?.checked || false,
            textToolValue: document.getElementById('textToolValue')?.value || 'TRACK',
            textToolSize: document.getElementById('textToolSize')?.value || 48,
            textToolSpacing: document.getElementById('textToolSpacing')?.value || 1.15,
            textToolStyle: document.getElementById('textToolStyle')?.value || 'stroke',
            refImgOpacity: refImage.opacity,
            refImgScale: refImage.scale,
            refImgVisible: refImage.visible,
            perspectiveGrid: {
                visible: perspectiveGrid.visible,
                locked: perspectiveGrid.locked,
                mode: perspectiveGrid.mode,
                snapMode: perspectiveGrid.snapMode,
                axisLock: perspectiveGrid.axisLock,
                snapConeDeg: perspectiveGrid.snapConeDeg,
                followCamera: perspectiveGrid.followCamera,
                vp1: { ...perspectiveGrid.vp1 },
                vp2: { ...perspectiveGrid.vp2 },
                vp3: { ...perspectiveGrid.vp3 },
                isoAngle: perspectiveGrid.isoAngle,
                density: perspectiveGrid.density,
                opacity: perspectiveGrid.opacity,
            },
            perspBookmarks,
            perspShadePoint: { x: perspShadePoint.x, y: perspShadePoint.y },
            boxFacesMode: document.getElementById('boxFacesMode')?.value || 'exterior',
            fillPerspAxis: document.getElementById('fillPerspAxis')?.value || 'none',
            gradPerspAxis: document.getElementById('gradPerspAxis')?.value || 'none',
            optSmoothToggle: document.getElementById('optSmoothToggle')?.checked || false,
            optSmoothPasses: document.getElementById('optSmoothPasses')?.value || 2,
            hudQuickActions: {
                cave: document.getElementById('toggleHudCave')?.checked ?? true,
                circle: document.getElementById('toggleHudCircle')?.checked ?? true,
                edgeShadow: document.getElementById('toggleHudEdgeShadow')?.checked ?? true,
                smooth: document.getElementById('toggleHudSmooth')?.checked ?? true,
                fillGaps: document.getElementById('toggleHudFillGaps')?.checked ?? true,
                reduce: document.getElementById('toggleHudReduce')?.checked ?? true,
                rollers: document.getElementById('toggleHudRollers')?.checked ?? true,
                rocks: document.getElementById('toggleHudRocks')?.checked ?? true,
            },
            rockBrushSize,
            rockBrushRoughness,
            rockBrushType,
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) { /* ignore */ }
}

function loadSettings() {
    isLoadingSettings = true;
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (typeof s.snapToGrid === 'boolean') document.getElementById('snapToGridToggle').checked = s.snapToGrid;
        if (s.gridSize) document.getElementById('gridSizeSelect').value = s.gridSize;
        if (typeof s.showGrid === 'boolean') document.getElementById('gridToggle').checked = s.showGrid;
        if (typeof s.showSpawnDot === 'boolean') {
            const sd = document.getElementById('spawnDotToggle');
            if (sd) sd.checked = s.showSpawnDot;
        }
        if (typeof s.useMask === 'boolean') document.getElementById('useMaskToggle').checked = s.useMask;
        if (typeof s.maskMode === 'boolean') {
            document.getElementById('maskModeToggle').checked = s.maskMode;
            if (s.maskMode) container.classList.add('mask-active');
        }
        if (s.maskTool) document.getElementById('maskToolSelect').value = s.maskTool;
        if (s.brushSize) {
            document.getElementById('brushSize').value = s.brushSize;
            document.getElementById('brushSizeVal').textContent = s.brushSize;
        }
        if (Array.isArray(s.activeMaskColors)) {
            activeMaskColors.clear();
            for (const c of s.activeMaskColors) activeMaskColors.add(c);
            document.querySelectorAll('.mask-filter').forEach(el => { el.checked = activeMaskColors.has(el.value); });
        }
        if (s.currentMaskColor) {
            currentMaskColor = s.currentMaskColor;
            const radio = document.querySelector('input[name="maskColor"][value="' + s.currentMaskColor + '"]');
            if (radio) radio.checked = true;
        }
        if (s.scriptSelect) document.getElementById('scriptSelect').value = s.scriptSelect;
        buildUI();
        if (s.scriptParams) {
            for (const id in s.scriptParams) {
                const el = document.getElementById(id);
                if (!el) continue;
                if (el.type === 'checkbox') el.checked = s.scriptParams[id];
                else {
                    el.value = s.scriptParams[id];
                    const valEl = document.getElementById(id.replace('param_', 'val_'));
                    if (valEl) valEl.textContent = s.scriptParams[id];
                }
            }
        }
        if (typeof s.liveUpdate === 'boolean') document.getElementById('liveUpdate').checked = s.liveUpdate;
        if (typeof s.symmetry === 'boolean') {
            symmetryMode = s.symmetry;
            document.getElementById('symmetryToggle').checked = s.symmetry;
        }
        if (s.drawLayer) document.getElementById('drawLayer').value = s.drawLayer;
        if (s.selLayer) { selLayer = s.selLayer; document.getElementById('selLayerSelect').value = s.selLayer; }
        if (s.objView) currentObjView = s.objView;
        if (s.lineType) document.getElementById('lineType').value = s.lineType;
        if (s.minStrokeLen !== undefined) {
            document.getElementById('minStrokeLen').value = s.minStrokeLen;
            document.getElementById('minStrokeLenVal').textContent = s.minStrokeLen;
        }
        if (s.pointSpacing !== undefined) {
            document.getElementById('pointSpacing').value = s.pointSpacing;
            document.getElementById('pointSpacingVal').textContent = s.pointSpacing;
        }
        if (s.patternScale !== undefined) {
            document.getElementById('patternScale').value = s.patternScale;
            document.getElementById('patternScaleVal').textContent = parseFloat(s.patternScale).toFixed(2);
        }
        if (s.noiseCoverage !== undefined) {
            document.getElementById('noiseCoverage').value = s.noiseCoverage;
            document.getElementById('noiseCoverageVal').textContent = s.noiseCoverage;
        }
        if (s.noiseSeed !== undefined) {
            document.getElementById('noiseSeed').value = s.noiseSeed;
            document.getElementById('noiseSeedVal').textContent = s.noiseSeed;
        }
        if (s.theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeCheckbox.checked = true;
        }
        if (s.autoSaveMinutes !== undefined) {
            autoSaveMinutes = parseInt(s.autoSaveMinutes);
            const sel = document.getElementById('autoSaveIntervalSelect');
            if (sel) sel.value = autoSaveMinutes;
        }
        if (typeof s.isSidebarCollapsed === 'boolean') {
            isSidebarCollapsed = s.isSidebarCollapsed;
            toggleSidebarCollapse(isSidebarCollapsed);
        }
        if (typeof s.isMinimapVisible === 'boolean') {
            isMinimapVisible = s.isMinimapVisible;
            toggleMinimap(isMinimapVisible);
        }
        if (s.sceneryOpacity !== undefined) {
            sceneryOpacity = parseFloat(s.sceneryOpacity);
            const el = document.getElementById('sceneryOpacity');
            if (el) el.value = Math.round(sceneryOpacity * 100);
            const valEl = document.getElementById('sceneryOpacityVal');
            if (valEl) valEl.textContent = Math.round(sceneryOpacity * 100);
        }
        if (typeof s.physicsVisible === 'boolean') {
            physicsVisible = s.physicsVisible;
            const visP = document.getElementById('layerVisPhysics');
            if (visP) { visP.classList.toggle('active', physicsVisible); setLayerIcon(visP, physicsVisible ? 'eye-open' : 'eye-closed'); }
        }
        if (typeof s.sceneryVisible === 'boolean') {
            sceneryVisible = s.sceneryVisible;
            const visS = document.getElementById('layerVisScenery');
            if (visS) { visS.classList.toggle('active', sceneryVisible); setLayerIcon(visS, sceneryVisible ? 'eye-open' : 'eye-closed'); }
        }
        if (typeof s.physicsLocked === 'boolean') {
            physicsLocked = s.physicsLocked;
            const lockP = document.getElementById('layerLockPhysics');
            if (lockP) { lockP.classList.toggle('locked', physicsLocked); setLayerIcon(lockP, physicsLocked ? 'lock' : 'unlock'); }
        }
        if (typeof s.sceneryLocked === 'boolean') {
            sceneryLocked = s.sceneryLocked;
            const lockS = document.getElementById('layerLockScenery');
            if (lockS) { lockS.classList.toggle('locked', sceneryLocked); setLayerIcon(lockS, sceneryLocked ? 'lock' : 'unlock'); }
        }
        if (s.curveSegments) {
            const cs = document.getElementById('curveSegments');
            if (cs) cs.value = s.curveSegments;
            const csv = document.getElementById('curveSegmentsVal');
            if (csv) csv.textContent = s.curveSegments;
        }
        if (s.eraserRadius !== undefined) {
            const er = document.getElementById('eraserRadius');
            if (er) er.value = s.eraserRadius;
            const erv = document.getElementById('eraserRadiusVal');
            if (erv) erv.textContent = s.eraserRadius;
        }
        if (s.eraserMode) {
            const em = document.getElementById('eraserMode');
            if (em) em.value = s.eraserMode;
        }
        if (s.eraserLayerTarget) {
            const elt = document.getElementById('eraserLayerTarget');
            if (elt) elt.value = s.eraserLayerTarget;
        }
        if ([0, 15, 45].includes(s.angleLockStep)) {
            angleLockStep = s.angleLockStep;
        }
        if (s.bridgeTension !== undefined) {
            const el = document.getElementById('bridgeTension');
            if (el) el.value = s.bridgeTension;
            const val = document.getElementById('bridgeTensionVal');
            if (val) val.textContent = s.bridgeTension;
        }
        if (s.bridgeSteps !== undefined) {
            const el = document.getElementById('bridgeSteps');
            if (el) el.value = s.bridgeSteps;
            const val = document.getElementById('bridgeStepsVal');
            if (val) val.textContent = s.bridgeSteps;
        }
        if (s.tubeWidth !== undefined) {
            const el = document.getElementById('tubeWidth');
            if (el) el.value = s.tubeWidth;
            const val = document.getElementById('tubeWidthVal');
            if (val) val.textContent = s.tubeWidth;
        }
        if (typeof s.tubeJitterToggle === 'boolean') {
            const el = document.getElementById('tubeJitterToggle');
            if (el) el.checked = s.tubeJitterToggle;
            const row = document.getElementById('tubeJitterRow');
            if (row) row.style.display = s.tubeJitterToggle ? 'block' : 'none';
        }
        if (s.tubeJitter !== undefined) {
            const el = document.getElementById('tubeJitter');
            if (el) el.value = s.tubeJitter;
            const val = document.getElementById('tubeJitterVal');
            if (val) val.textContent = s.tubeJitter;
        }
        if (s.fillMode) {
            const el = document.getElementById('fillMode');
            if (el) el.value = s.fillMode;
        }
        if (s.fillDensity !== undefined) {
            const el = document.getElementById('fillDensity');
            if (el) el.value = s.fillDensity;
            const val = document.getElementById('fillDensityVal');
            if (val) val.textContent = s.fillDensity;
        }
        if (s.fillRotation !== undefined) {
            const el = document.getElementById('fillRotation');
            if (el) el.value = s.fillRotation;
            const val = document.getElementById('fillRotationVal');
            if (val) val.textContent = s.fillRotation;
        }
        if (s.fillSlant !== undefined) {
            const el = document.getElementById('fillSlant');
            if (el) el.value = s.fillSlant;
            const val = document.getElementById('fillSlantVal');
            if (val) val.textContent = s.fillSlant;
        }
        if (s.gradType) { const el = document.getElementById('gradType'); if (el) el.value = s.gradType; }
        if (s.gradStyle) { const el = document.getElementById('gradStyle'); if (el) el.value = s.gradStyle; }
        if (s.gradStartSpacing !== undefined) {
            const el = document.getElementById('gradStartSpacing'); if (el) el.value = s.gradStartSpacing;
            const v = document.getElementById('gradStartSpacingVal'); if (v) v.textContent = s.gradStartSpacing;
        }
        if (s.gradEndSpacing !== undefined) {
            const el = document.getElementById('gradEndSpacing'); if (el) el.value = s.gradEndSpacing;
            const v = document.getElementById('gradEndSpacingVal'); if (v) v.textContent = s.gradEndSpacing;
        }
        if (s.gradFalloff) { const el = document.getElementById('gradFalloff'); if (el) el.value = s.gradFalloff; }
        if (s.gradClipMode) { const el = document.getElementById('gradClipMode'); if (el) el.value = s.gradClipMode; }
        if (s.gradSpanWidth !== undefined) {
            const el = document.getElementById('gradSpanWidth'); if (el) el.value = s.gradSpanWidth;
            const v = document.getElementById('gradSpanWidthVal'); if (v) v.textContent = s.gradSpanWidth;
        }
        if (typeof s.gradInvert === 'boolean') { const el = document.getElementById('gradInvertToggle'); if (el) el.checked = s.gradInvert; }
        if (s.textToolValue !== undefined) { const el = document.getElementById('textToolValue'); if (el) el.value = s.textToolValue; }
        if (s.textToolSize !== undefined) {
            const el = document.getElementById('textToolSize'); if (el) el.value = s.textToolSize;
            const v = document.getElementById('textToolSizeVal'); if (v) v.textContent = s.textToolSize;
        }
        if (s.textToolSpacing !== undefined) {
            const el = document.getElementById('textToolSpacing'); if (el) el.value = s.textToolSpacing;
            const v = document.getElementById('textToolSpacingVal'); if (v) v.textContent = parseFloat(s.textToolSpacing).toFixed(2);
        }
        if (s.textToolStyle) { const el = document.getElementById('textToolStyle'); if (el) el.value = s.textToolStyle; }
        if (s.refImgOpacity !== undefined) {
            refImage.opacity = parseFloat(s.refImgOpacity) || 0.45;
            const el = document.getElementById('refImgOpacity'); if (el) el.value = Math.round(refImage.opacity * 100);
            const v = document.getElementById('refImgOpacityVal'); if (v) v.textContent = Math.round(refImage.opacity * 100);
        }
        if (s.refImgScale !== undefined) {
            refImage.scale = parseFloat(s.refImgScale) || 1.0;
            const el = document.getElementById('refImgScale'); if (el) el.value = refImage.scale;
            const v = document.getElementById('refImgScaleVal'); if (v) v.textContent = refImage.scale.toFixed(2);
        }
        if (typeof s.refImgVisible === 'boolean') {
            refImage.visible = s.refImgVisible;
            const visR = document.getElementById('refImgVisBtn');
            if (visR) { visR.classList.toggle('active', refImage.visible); setLayerIcon(visR, refImage.visible ? 'eye-open' : 'eye-closed'); }
        }
        if (s.perspectiveGrid && typeof s.perspectiveGrid === 'object') {
            const p = s.perspectiveGrid;
            if (typeof p.visible === 'boolean') perspectiveGrid.visible = p.visible;
            if (typeof p.locked === 'boolean') perspectiveGrid.locked = p.locked;
            if (['1pt', '2pt', '3pt', 'iso'].includes(p.mode)) perspectiveGrid.mode = p.mode;
            if (['none', 'grid', 'angle'].includes(p.snapMode)) perspectiveGrid.snapMode = p.snapMode;
            if (['auto', 'vp1', 'vp2', 'vp3'].includes(p.axisLock)) perspectiveGrid.axisLock = p.axisLock;
            if (Number.isFinite(p.snapConeDeg)) perspectiveGrid.snapConeDeg = p.snapConeDeg;
            if (typeof p.followCamera === 'boolean') perspectiveGrid.followCamera = p.followCamera;
            if (p.vp1 && Number.isFinite(p.vp1.x) && Number.isFinite(p.vp1.y)) perspectiveGrid.vp1 = { x: p.vp1.x, y: p.vp1.y };
            if (p.vp2 && Number.isFinite(p.vp2.x) && Number.isFinite(p.vp2.y)) perspectiveGrid.vp2 = { x: p.vp2.x, y: p.vp2.y };
            if (p.vp3 && Number.isFinite(p.vp3.x) && Number.isFinite(p.vp3.y)) perspectiveGrid.vp3 = { x: p.vp3.x, y: p.vp3.y };
            if (Number.isFinite(p.isoAngle)) perspectiveGrid.isoAngle = p.isoAngle;
            if (Number.isFinite(p.density)) perspectiveGrid.density = p.density;
            if (Number.isFinite(p.opacity)) perspectiveGrid.opacity = p.opacity;
        }
        if (Array.isArray(s.perspBookmarks)) {
            perspBookmarks = s.perspBookmarks.filter(b => b && b.name && b.vp1);
        }
        if (s.boxFacesMode) { const el = document.getElementById('boxFacesMode'); if (el) el.value = s.boxFacesMode; }
        if (s.fillPerspAxis) { const el = document.getElementById('fillPerspAxis'); if (el) el.value = s.fillPerspAxis; }
        if (s.gradPerspAxis) { const el = document.getElementById('gradPerspAxis'); if (el) el.value = s.gradPerspAxis; }
        if (s.perspShadePoint && Number.isFinite(s.perspShadePoint.x) && Number.isFinite(s.perspShadePoint.y)) {
            perspShadePoint.x = s.perspShadePoint.x;
            perspShadePoint.y = s.perspShadePoint.y;
        }
        if (typeof syncPerspUI === 'function') syncPerspUI();
        if (typeof updateAngleLockUI === 'function') updateAngleLockUI();
        if (typeof s.optSmoothToggle === 'boolean') {
            const el = document.getElementById('optSmoothToggle');
            if (el) el.checked = s.optSmoothToggle;
        }
        if (s.optSmoothPasses !== undefined) {
            const el = document.getElementById('optSmoothPasses');
            if (el) el.value = s.optSmoothPasses;
            const val = document.getElementById('optSmoothPassesVal');
            if (val) val.textContent = s.optSmoothPasses;
        }
        if (s.hudQuickActions) {
            const h = s.hudQuickActions;
            if (typeof h.cave === 'boolean') { const el = document.getElementById('toggleHudCave'); if (el) el.checked = h.cave; }
            if (typeof h.circle === 'boolean') { const el = document.getElementById('toggleHudCircle'); if (el) el.checked = h.circle; }
            if (typeof h.edgeShadow === 'boolean') { const el = document.getElementById('toggleHudEdgeShadow'); if (el) el.checked = h.edgeShadow; }
            if (typeof h.smooth === 'boolean') { const el = document.getElementById('toggleHudSmooth'); if (el) el.checked = h.smooth; }
            if (typeof h.fillGaps === 'boolean') { const el = document.getElementById('toggleHudFillGaps'); if (el) el.checked = h.fillGaps; }
            if (typeof h.reduce === 'boolean') { const el = document.getElementById('toggleHudReduce'); if (el) el.checked = h.reduce; }
            if (typeof h.rollers === 'boolean') { const el = document.getElementById('toggleHudRollers'); if (el) el.checked = h.rollers; }
            if (typeof h.rocks === 'boolean') { const el = document.getElementById('toggleHudRocks'); if (el) el.checked = h.rocks; }
            updateHudActionVisibility();
        }
        if (s.rockBrushSize !== undefined) rockBrushSize = s.rockBrushSize;
        if (s.rockBrushRoughness !== undefined) rockBrushRoughness = s.rockBrushRoughness;
        if (s.rockBrushType !== undefined) rockBrushType = s.rockBrushType;
        if (typeof s.disableQuickAccess === 'boolean') {
            const chk = document.getElementById('disableQuickAccessCheckbox');
            if (chk) chk.checked = s.disableQuickAccess;
            const hud = document.getElementById('canvasHud');
            if (hud) hud.style.display = s.disableQuickAccess ? 'none' : 'flex';
        }
        if (s.currentTool) {
            currentTool = s.currentTool === 'camera' ? 'line' : s.currentTool;
        }
        if (s.activeSideTab) {
            switchSideTab(s.activeSideTab);
        }
        if (s.appMode && MODE_CYCLE.includes(s.appMode)) {
            setAppMode(s.appMode);
        } else if (s.currentTool && s.activeSideTab !== 'panel-auto') {
            setAppMode(HYBRID_TOOLS.has(currentTool) ? 'hybrid' : 'manual');
        } else {
            updateToolUI();
        }
        updateBrushSizeRow();
        document.getElementById('toolVal').textContent =
            document.getElementById('maskToolSelect').options[document.getElementById('maskToolSelect').selectedIndex].text;
    } catch (e) {
        console.warn('Failed to load settings', e);
    } finally {
        isLoadingSettings = false;
    }
}

// ==========================================
// MODALS
// ==========================================
function setupModal(btnId, modalId, closeId) {
    const btn = document.getElementById(btnId);
    const mdl = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeId);
    if (!btn || !mdl) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mdl.style.display = 'block';
        if (modalId === 'objectsModal') { refreshObjectList(); }
    });
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); mdl.style.display = 'none'; });
    mdl.addEventListener('click', (e) => { if (e.target === mdl) mdl.style.display = 'none'; });
}

setupModal('settingsBtn', 'settingsModal', 'settingsClose');
setupModal('helpBtn', 'helpModal', 'helpClose');
setupModal('objectsBtn', 'objectsModal', 'objectsClose');

document.getElementById('gridToggle').addEventListener('change', () => { saveSettings(); draw(); });
const spawnDotEl = document.getElementById('spawnDotToggle');
if (spawnDotEl) spawnDotEl.addEventListener('change', () => { saveSettings(); draw(); });

// ==========================================
// SIDEBAR ICON TABS (PROPOSAL B)
// ==========================================
let activeSideTab = 'panel-file';
let isSidebarCollapsed = false;

function switchSideTab(targetPanelId) {
    activeSideTab = targetPanelId;
    document.querySelectorAll('.side-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-side-tab') === targetPanelId);
    });
    document.querySelectorAll('.side-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === targetPanelId);
    });

    // Auto-expand if clicked while collapsed
    if (isSidebarCollapsed && !isLoadingSettings) {
        toggleSidebarCollapse(false);
    }

    // Keep appMode in sync if user selects Manual, Hybrid, or Auto tab
    if (targetPanelId === 'panel-tools' && appMode !== 'manual') {
        setAppMode('manual');
    } else if (targetPanelId === 'panel-hybrid' && appMode !== 'hybrid') {
        setAppMode('hybrid');
    } else if (targetPanelId === 'panel-auto' && appMode !== 'auto') {
        setAppMode('auto');
    }

    saveSettings();
}

function toggleSidebarCollapse(forceState) {
    if (typeof forceState === 'boolean') {
        isSidebarCollapsed = forceState;
    } else {
        isSidebarCollapsed = !isSidebarCollapsed;
    }
    document.body.classList.toggle('sidebar-collapsed', isSidebarCollapsed);

    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (toggleBtn) {
        toggleBtn.innerHTML = isSidebarCollapsed
            ? '<svg class="mono-icon-sm" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>'
            : '<svg class="mono-icon-sm" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';
        toggleBtn.title = isSidebarCollapsed ? 'Expand Sidebar (Ctrl+[)' : 'Collapse Sidebar (Ctrl+[)';
    }

    const statusBtn = document.getElementById('statusSidebarBtn');
    if (statusBtn) statusBtn.classList.toggle('active', !isSidebarCollapsed);

    resizeCanvas();
    setTimeout(resizeCanvas, 260);
    draw();
    saveSettings();
}

function setupSidebarTabs() {
    document.querySelectorAll('.side-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-side-tab');
            if (target) switchSideTab(target);
        });
    });
}

// ==========================================
// MODE & TOOL TOGGLES
// ==========================================
function rotateAppMode() {
    const idx = MODE_CYCLE.indexOf(appMode);
    const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    setAppMode(next);
}

function setAppMode(newMode) {
    if (!MODE_CYCLE.includes(newMode)) newMode = 'manual';
    appMode = newMode;
    resetDrawingState();
    clearSelection();

    const modeLabels = { manual: 'Manual', hybrid: 'Hybrid', auto: 'Automation' };
    const modeLabel = modeLabels[appMode] || 'Manual';

    const hudManual = document.getElementById('hudManualGroup');
    const hudHybrid = document.getElementById('hudHybridGroup');
    const hudAuto = document.getElementById('hudAutoGroup');
    const hudModeBtn = document.getElementById('hudModeBtn');
    const hudModeText = document.getElementById('hudModeText');

    if (hudModeText) hudModeText.textContent = modeLabel;
    if (hudModeBtn) {
        hudModeBtn.classList.toggle('hybrid-mode', appMode === 'hybrid');
        hudModeBtn.classList.toggle('auto-mode', appMode === 'auto');
        hudModeBtn.title = `Mode: ${modeLabel} (Click to rotate: Manual → Hybrid → Automation)`;
    }

    // Ensure currentTool matches the selected interactive mode
    if (appMode === 'hybrid' && !HYBRID_TOOLS.has(currentTool)) {
        currentTool = 'tube';
    } else if (appMode === 'manual' && (HYBRID_TOOLS.has(currentTool) || currentTool === 'camera')) {
        currentTool = 'line';
    }
    document.querySelectorAll('.tool-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tool') === currentTool);
    });

    // Also sync the active sidebar tab if currently viewing one of the 3 mode tabs
    const currentActivePanel = document.querySelector('.side-panel.active')?.id;
    const modePanels = { manual: 'panel-tools', hybrid: 'panel-hybrid', auto: 'panel-auto' };
    if (['panel-tools', 'panel-hybrid', 'panel-auto'].includes(currentActivePanel)) {
        const expectedPanel = modePanels[appMode];
        if (expectedPanel && currentActivePanel !== expectedPanel) {
            switchSideTab(expectedPanel);
        }
    }

    if (hudManual) hudManual.style.display = appMode === 'manual' ? 'flex' : 'none';
    if (hudHybrid) hudHybrid.style.display = appMode === 'hybrid' ? 'flex' : 'none';
    if (hudAuto) hudAuto.style.display = appMode === 'auto' ? 'flex' : 'none';

    if (appMode === 'auto') {
        container.classList.remove('manual-active');
    } else {
        const maskChk = document.getElementById('maskModeToggle');
        if (maskChk) maskChk.checked = false;
        container.classList.remove('mask-active');
        container.classList.add('manual-active');
    }
    updatePatternHud();
    updateToolUI();
    updateStatusBar();
    saveSettings();
    draw();
}

function updateHudActionVisibility() {
    const map = {
        toggleHudCave: 'hudBtnCave',
        toggleHudCircle: 'hudBtnCircle',
        toggleHudRocks: 'hudBtnRocks',
        toggleHudEdgeShadow: 'hudBtnEdgeShadow',
        toggleHudSmooth: 'hudBtnSmooth',
        toggleHudFillGaps: 'hudBtnFillGaps',
        toggleHudReduce: 'hudBtnReduce',
        toggleHudRollers: 'hudBtnRollers'
    };
    for (const [chkId, btnId] of Object.entries(map)) {
        const chk = document.getElementById(chkId);
        const btn = document.getElementById(btnId);
        if (btn && chk) {
            btn.style.display = chk.checked ? 'inline-flex' : 'none';
        }
    }
}

function executeHudAction(action) {
    if (action === 'rocks') {
        if (isLayerLocked('scenery')) return;
        snapshot();
        runRockClusterGen({
            approach: document.getElementById('param_approach')?.value || 'staggered',
            seed: parseInt(document.getElementById('param_seed')?.value) || Math.floor(Math.random() * 9000 + 100),
            clusterWidth: parseFloat(document.getElementById('param_clusterWidth')?.value) || 1200,
            peakHeight: parseFloat(document.getElementById('param_peakHeight')?.value) || 280,
            rockCount: parseInt(document.getElementById('param_rockCount')?.value) || 45,
            roughness: parseFloat(document.getElementById('param_roughness')?.value) || 0.5,
            pebbleRatio: parseFloat(document.getElementById('param_pebbleRatio')?.value) || 30,
            layerTarget: 'scenery',
            removegray: false
        }, false);
        toast('Rock cluster generated! ✓', 'success', 2500);
        return;
    }
    if (action === 'cave' || action === 'circle' || action === 'edgeShadow') {
        if (physicsLines.length === 0) {
            toast('Cannot generate: no physics track exists!', 'error', 2000);
            return;
        }
        if (isLayerLocked('scenery')) return;
        snapshot();
        if (action === 'cave') {
            runCaveGen({
                seed: parseInt(document.getElementById('param_seed')?.value) || 42,
                density: parseInt(document.getElementById('param_density')?.value) || 60,
                removegray: document.getElementById('param_removegray')?.checked ?? false
            });
            toast('Cave texture generated and applied! ✓', 'success', 2500);
        } else if (action === 'circle') {
            runCircleGen({
                seed: parseInt(document.getElementById('param_seed')?.value) || 42,
                circular: 80,
                density: parseInt(document.getElementById('param_density')?.value) || 60,
                thickness: 4, multi: true, falloff: true, organic: true, jitter: true,
                removegray: false
            });
            toast('Circle texture generated and applied! ✓', 'success', 2500);
        } else {
            runEdgeShadowGen({
                seed: parseInt(document.getElementById('param_seed')?.value) || 42,
                depth: parseInt(document.getElementById('param_depth')?.value) || 65,
                density: parseInt(document.getElementById('param_density')?.value) || 70,
                style: document.getElementById('param_style')?.value || 'stipple',
                topBias: document.getElementById('param_topBias')?.checked ?? true,
                removegray: document.getElementById('param_removegray')?.checked ?? false
            });
            toast('Edge-hugging shadow generated and applied! ✓', 'success', 2500);
        }
        originalSceneryLines = clonePolysFast(sceneryLines);
        sceneryDirty = false;
        bumpTrackVersion();
        updatePreviewBadge();
        draw();
    }
    else if (action === 'smooth') {
        const targetLayer = document.getElementById('drawLayer')?.value || 'physics';
        if (isLayerLocked(targetLayer)) return;
        let smoothedCount = 0;
        const passes = parseInt(document.getElementById('optSmoothPasses')?.value) || 2;
        
        snapshot();
        if (targetLayer === 'physics' || targetLayer === 'both') {
            physicsLines = physicsLines.map(poly => {
                if (poly.length >= 3) {
                    smoothedCount++;
                    return chaikinSmoothPolyline(poly, passes);
                }
                return poly;
            });
            bumpPhysics();
        }
        if (targetLayer === 'scenery' || targetLayer === 'both') {
            sceneryLines = sceneryLines.map(poly => {
                if (poly.length >= 3) {
                    smoothedCount++;
                    return chaikinSmoothPolyline(poly, passes);
                }
                return poly;
            });
            originalSceneryLines = clonePolysFast(sceneryLines);
            bumpTrackVersion();
        }
        updateStatusBar();
        drawMinimap();
        draw();
        if (smoothedCount > 0) {
            toast(`Smoothed ${smoothedCount} track line${smoothedCount > 1 ? 's' : ''} (${passes} passes)! ✓`, 'success', 2500);
        } else {
            toast('No multi-point lines found to smooth.', 'info', 2000);
        }
    }
    else if (action === 'fill-gaps') {
        const weldDist = parseFloat(document.getElementById('optGapDistance')?.value) || 2.5;
        const targetLayer = document.getElementById('drawLayer')?.value || 'physics';
        if (isLayerLocked(targetLayer)) return;
        let welded = 0;

        snapshot();
        if (targetLayer === 'physics' || targetLayer === 'both') {
            physicsLines = clonePolysFast(physicsLines);
            welded += weldGapsInPolylines(physicsLines, weldDist);
            bumpPhysics();
        }
        if (targetLayer === 'scenery' || targetLayer === 'both') {
            sceneryLines = clonePolysFast(sceneryLines);
            welded += weldGapsInPolylines(sceneryLines, weldDist);
            originalSceneryLines = clonePolysFast(sceneryLines);
            bumpTrackVersion();
        }
        updateStatusBar();
        drawMinimap();
        draw();
        if (welded > 0) {
            toast(`Welded ${welded} loose gaps! ✓`, 'success', 2500);
        } else {
            toast('No loose track gaps detected within tolerance.', 'info', 2000);
        }
    }
    else if (action === 'reduce') {
        const tol = parseFloat(document.getElementById('optTolerance')?.value) || 1.5;
        const targetLayer = document.getElementById('drawLayer')?.value || 'physics';
        if (isLayerLocked(targetLayer)) return;
        const origPhys = countPolylineSegments(physicsLines);
        const origScen = countPolylineSegments(sceneryLines);

        snapshot();
        if (targetLayer === 'physics' || targetLayer === 'both') {
            const res = cleanPolylines(physicsLines);
            physicsLines = res.polylines.map(p => simplifyRDP(p, tol));
            bumpPhysics();
        }
        if (targetLayer === 'scenery' || targetLayer === 'both') {
            const res = cleanPolylines(sceneryLines);
            sceneryLines = res.polylines.map(p => simplifyRDP(p, tol));
            originalSceneryLines = clonePolysFast(sceneryLines);
            bumpTrackVersion();
        }
        updateStatusBar();
        drawMinimap();
        draw();
        const newPhys = countPolylineSegments(physicsLines);
        const newScen = countPolylineSegments(sceneryLines);
        const diff = (origPhys + origScen) - (newPhys + newScen);
        if (diff > 0) {
            toast(`Reduced track by ${diff} segments! ✓`, 'success', 2500);
        } else {
            toast('Track is already fully optimized.', 'info', 2000);
        }
    }
    else if (action === 'rollers') {
        const isScen = (document.getElementById('drawLayer')?.value === 'scenery');
        if (isLayerLocked(isScen ? 'scenery' : 'physics')) return;
        snapshot();
        const p = {
            seed: Math.floor(Math.random() * 9999) + 1,
            length: 2000,
            wavelength: 320,
            amplitude: 65,
            randomizer: 75,
            slope: 0,
            scenery: isScen
        };
        runRollersGen(p, false);
        bumpTrackVersion();
    }
}

function getEraserRadiusScreen() {
    const el = document.getElementById('eraserRadius');
    return el ? (parseFloat(el.value) || 20) : 20;
}

function getEraserRadiusWorld() {
    return getEraserRadiusScreen() / zoom;
}

function getEraserMode() {
    const el = document.getElementById('eraserMode');
    return el ? el.value : 'original';
}

function updateEraserCursor() {
    if (appMode !== 'auto' && currentTool === 'eraser') {
        const r = Math.round(getEraserRadiusScreen());
        const size = Math.min(128, Math.max(16, (r + 2) * 2));
        const center = Math.round(size / 2);
        const curR = Math.max(2, Math.min(r, center - 2));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${curR}" fill="none" stroke="%23E85D35" stroke-width="1.5" stroke-dasharray="3,2"/><circle cx="${center}" cy="${center}" r="1.5" fill="%23E85D35"/></svg>`;
        container.style.cursor = `url("data:image/svg+xml,${svg}") ${center} ${center}, crosshair`;
    }
}

function setRefImgDragMode(enabled) {
    isRefImgDragMode = !!enabled && !!refImage.img && !refImage.locked;
    if (isRefImgDragMode && isPerspEditMode) setPerspEditMode(false);
    const btn = document.getElementById('refImgDragBtn');
    if (btn) btn.classList.toggle('active', isRefImgDragMode);
    applyToolCursor();
    draw();
}

function setPerspEditMode(enabled) {
    isPerspEditMode = !!enabled && perspectiveGrid.visible && !perspectiveGrid.locked && perspectiveGrid.mode !== 'iso';
    if (!isPerspEditMode) hoveredPerspHandle = null;
    if (isPerspEditMode && isRefImgDragMode) setRefImgDragMode(false);
    const btn = document.getElementById('perspEditBtn');
    if (btn) btn.classList.toggle('active', isPerspEditMode);
    applyToolCursor();
    draw();
}

/**
 * Return true when Automation mode is active with the Perspective Shadow script selected.
 */
function isPerspShadowScriptActive() {
    return appMode === 'auto' && document.getElementById('scriptSelect')?.value === 'perspShadow';
}

/**
 * Toggle interactive canvas point picking for the Perspective Shadow origin.
 */
function setPickShadePointMode(enabled) {
    isPickingShadePoint = !!enabled;
    if (isPickingShadePoint && !perspectiveGrid.visible) {
        perspectiveGrid.visible = true;
        if (typeof syncPerspUI === 'function') syncPerspUI();
    }
    syncPerspShadePointUI();
    applyToolCursor();
    draw();
}

/**
 * Keep the Perspective Shadow origin UI inputs and pick button synced with perspShadePoint.
 */
function syncPerspShadePointUI() {
    const xEl = document.getElementById('perspShadeXInput');
    const yEl = document.getElementById('perspShadeYInput');
    const pickBtn = document.getElementById('perspShadePickBtn');
    if (xEl && document.activeElement !== xEl) xEl.value = Math.round(perspShadePoint.x);
    if (yEl && document.activeElement !== yEl) yEl.value = Math.round(perspShadePoint.y);
    if (pickBtn) {
        pickBtn.classList.toggle('active', isPickingShadePoint);
        pickBtn.textContent = isPickingShadePoint ? 'Click Grid… (Esc)' : 'Pick Point on Grid';
    }
}

function applyToolCursor() {
    if (isSpaceDown) {
        container.style.cursor = 'grab';
    } else if (dragMode === 'perspHandle' || dragMode === 'shadePoint') {
        container.style.cursor = 'grabbing';
    } else if ((isPerspEditMode && hoveredPerspHandle) || (isPerspShadowScriptActive() && hoveredShadeHandle)) {
        container.style.cursor = 'grab';
    } else if (isPickingShadePoint) {
        container.style.cursor = 'crosshair';
    } else if (isRefImgDragMode || isPerspEditMode) {
        container.style.cursor = 'move';
    } else if (currentTool === 'eraser') {
        updateEraserCursor();
    } else if (currentTool === 'modify') {
        container.style.cursor = 'pointer';
    } else {
        container.style.cursor = 'crosshair';
    }
}

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isRefImgDragMode) setRefImgDragMode(false);
        if (isPerspEditMode) setPerspEditMode(false);
        const nextTool = btn.getAttribute('data-tool');
        const targetMode = HYBRID_TOOLS.has(nextTool) ? 'hybrid' : 'manual';
        currentTool = nextTool;
        if (appMode !== targetMode) {
            setAppMode(targetMode);
        }
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tool') === currentTool));
        resetDrawingState();
        selectedVertex = null;
        if (currentTool !== 'select') clearSelection();
        saveSettings();

        applyToolCursor();
        updateToolUI();
        draw();
    });
});

function updateBrushSizeRow() {
    const row = document.getElementById('brushSizeRow');
    if (!row) return;
    row.style.display = document.getElementById('maskToolSelect').value === 'brush' ? 'block' : 'none';
}

function updateFillSettingsVisibility() {
    const mode = document.getElementById('fillMode')?.value || 'full';
    const rotRow = document.getElementById('fillRotationRow');
    const slantRow = document.getElementById('fillSlantRow');
    const perspRow = document.getElementById('fillPerspAxisRow');
    const densityLabel = document.getElementById('fillDensityLabel');
    const densityInput = document.getElementById('fillDensity');

    if (mode === 'full') {
        if (rotRow) rotRow.style.display = 'none';
        if (slantRow) slantRow.style.display = 'none';
        if (perspRow) perspRow.style.display = 'none';
        if (densityLabel) densityLabel.textContent = 'Fill Spacing (Solid):';
        if (densityInput) { densityInput.min = '2'; densityInput.max = '25'; }
    } else if (mode === 'grid') {
        if (rotRow) rotRow.style.display = 'block';
        if (slantRow) slantRow.style.display = 'block';
        if (perspRow) perspRow.style.display = 'block';
        if (densityLabel) densityLabel.textContent = 'Grid Spacing:';
        if (densityInput) { densityInput.min = '6'; densityInput.max = '100'; }
    } else if (mode === 'lines') {
        if (rotRow) rotRow.style.display = 'block';
        if (slantRow) slantRow.style.display = 'block';
        if (perspRow) perspRow.style.display = 'block';
        if (densityLabel) densityLabel.textContent = 'Line Spacing:';
        if (densityInput) { densityInput.min = '4'; densityInput.max = '100'; }
    }
}

function updateToolOptionsBar() {
    const bar = document.getElementById('toolOptionsBar');
    if (!bar) return;

    if (appMode === 'auto') {
        bar.style.display = 'none';
        bar.innerHTML = '';
        return;
    }

    let html = '';

    if (currentTool === 'eraser') {
        const radius = document.getElementById('eraserRadius')?.value || 20;
        const mode = document.getElementById('eraserMode')?.value || 'original';
        const layerTgt = document.getElementById('eraserLayerTarget')?.value || 'both';
        html = `
            <div class="tool-opt-group">
                <label>Radius: <span class="tool-opt-val" id="optBarEraserRadiusVal">${radius}px</span></label>
                <input type="range" id="optBarEraserRadius" min="4" max="150" step="1" value="${radius}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Mode:</label>
                <select id="optBarEraserMode">
                    <option value="original" ${mode === 'original' ? 'selected' : ''}>Original</option>
                    <option value="trim" ${mode === 'trim' ? 'selected' : ''}>Trim</option>
                    <option value="full" ${mode === 'full' ? 'selected' : ''}>Full</option>
                </select>
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Layer:</label>
                <select id="optBarEraserLayer">
                    <option value="both" ${layerTgt === 'both' ? 'selected' : ''}>Both</option>
                    <option value="active" ${layerTgt === 'active' ? 'selected' : ''}>Active</option>
                    <option value="physics" ${layerTgt === 'physics' ? 'selected' : ''}>Physics</option>
                    <option value="scenery" ${layerTgt === 'scenery' ? 'selected' : ''}>Scenery</option>
                </select>
            </div>
            <span class="tool-opt-hint">([ / ] radius)</span>
        `;
    } else if (currentTool === 'curve') {
        const steps = document.getElementById('curveSegments')?.value || 16;
        html = `
            <div class="tool-opt-group">
                <label>Smoothness: <span class="tool-opt-val" id="optBarCurveStepsVal">${steps} steps</span></label>
                <input type="range" id="optBarCurveSteps" min="4" max="64" step="2" value="${steps}">
            </div>
            <span class="tool-opt-hint">(3 clicks: start, arch, land)</span>
        `;
    } else if (currentTool === 'bridge') {
        const tension = document.getElementById('bridgeTension')?.value || 1.0;
        const steps = document.getElementById('bridgeSteps')?.value || 16;
        html = `
            <div class="tool-opt-group">
                <label>Tension: <span class="tool-opt-val" id="optBarBridgeTensionVal">${tension}×</span></label>
                <input type="range" id="optBarBridgeTension" min="0.2" max="2.5" step="0.1" value="${tension}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Steps: <span class="tool-opt-val" id="optBarBridgeStepsVal">${steps}</span></label>
                <input type="range" id="optBarBridgeSteps" min="6" max="48" step="2" value="${steps}">
            </div>
            <span class="tool-opt-hint">(Click 2 endpoints)</span>
        `;
    } else if (currentTool === 'tube') {
        const width = document.getElementById('tubeWidth')?.value || 60;
        const jitter = document.getElementById('tubeJitterToggle')?.checked ?? true;
        const jitterAmt = document.getElementById('tubeJitter')?.value || 5;
        html = `
            <div class="tool-opt-group">
                <label>Width: <span class="tool-opt-val" id="optBarTubeWidthVal">${width}px</span></label>
                <input type="range" id="optBarTubeWidth" min="20" max="160" step="5" value="${width}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label style="cursor:pointer;"><input type="checkbox" id="optBarTubeJitterToggle" ${jitter ? 'checked' : ''} style="width:auto; margin:0;"> Jitter (±<span id="optBarTubeJitterVal">${jitterAmt}</span>px)</label>
            </div>
            <span class="tool-opt-hint">(Right-click to finish)</span>
        `;
    } else if (currentTool === 'fill') {
        const mode = document.getElementById('fillMode')?.value || 'full';
        const density = document.getElementById('fillDensity')?.value || 3;
        const rot = document.getElementById('fillRotation')?.value || 0;
        const slant = document.getElementById('fillSlant')?.value || 0;
        const fPersp = document.getElementById('fillPerspAxis')?.value || 'none';
        html = `
            <div class="tool-opt-group">
                <label>Fill:</label>
                <select id="optBarFillMode">
                    <option value="full" ${mode === 'full' ? 'selected' : ''}>Full</option>
                    <option value="grid" ${mode === 'grid' ? 'selected' : ''}>Grid</option>
                    <option value="lines" ${mode === 'lines' ? 'selected' : ''}>Lines</option>
                </select>
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Spacing: <span class="tool-opt-val" id="optBarFillDensityVal">${density}px</span></label>
                <input type="range" id="optBarFillDensity" min="${mode === 'full' ? 2 : (mode === 'grid' ? 6 : 4)}" max="${mode === 'full' ? 25 : 100}" step="1" value="${density}">
            </div>
            ${mode !== 'full' ? `
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Persp:</label>
                <select id="optBarFillPersp">
                    <option value="none" ${fPersp === 'none' ? 'selected' : ''}>Angle</option>
                    <option value="vp1" ${fPersp === 'vp1' ? 'selected' : ''}>VP1</option>
                    <option value="vp2" ${fPersp === 'vp2' ? 'selected' : ''}>VP2</option>
                    <option value="vp3" ${fPersp === 'vp3' ? 'selected' : ''}>VP3</option>
                    <option value="iso" ${fPersp === 'iso' ? 'selected' : ''}>Iso</option>
                </select>
            </div>
            ${fPersp === 'none' ? `
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Rot: <span class="tool-opt-val" id="optBarFillRotVal">${rot}°</span></label>
                <input type="range" id="optBarFillRot" min="-180" max="180" step="5" value="${rot}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Slant: <span class="tool-opt-val" id="optBarFillSlantVal">${slant}°</span></label>
                <input type="range" id="optBarFillSlant" min="-60" max="60" step="1" value="${slant}">
            </div>` : ''}
            ` : ''}
            <span class="tool-opt-hint">(Click inside closed shape)</span>
        `;
    } else if (currentTool === 'gradient') {
        const gType = document.getElementById('gradType')?.value || 'linear';
        const gStyle = document.getElementById('gradStyle')?.value || 'lines';
        const gStart = document.getElementById('gradStartSpacing')?.value || 3;
        const gEnd = document.getElementById('gradEndSpacing')?.value || 45;
        const gClip = document.getElementById('gradClipMode')?.value || 'auto';
        const gPersp = document.getElementById('gradPerspAxis')?.value || 'none';
        const gInvert = document.getElementById('gradInvertToggle')?.checked || false;
        html = `
            <div class="tool-opt-group">
                <label>Type:</label>
                <select id="optBarGradType">
                    <option value="linear" ${gType === 'linear' ? 'selected' : ''}>Linear</option>
                    <option value="radial" ${gType === 'radial' ? 'selected' : ''}>Radial</option>
                </select>
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Style:</label>
                <select id="optBarGradStyle">
                    <option value="lines" ${gStyle === 'lines' ? 'selected' : ''}>Lines</option>
                    <option value="broken" ${gStyle === 'broken' ? 'selected' : ''}>Broken</option>
                    <option value="stipple" ${gStyle === 'stipple' ? 'selected' : ''}>Stipple</option>
                    <option value="cross" ${gStyle === 'cross' ? 'selected' : ''}>Cross</option>
                </select>
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Start: <span class="tool-opt-val" id="optBarGradStartVal">${gStart}px</span></label>
                <input type="range" id="optBarGradStart" min="2" max="20" step="1" value="${gStart}">
            </div>
            <div class="tool-opt-group">
                <label>End: <span class="tool-opt-val" id="optBarGradEndVal">${gEnd}px</span></label>
                <input type="range" id="optBarGradEnd" min="15" max="120" step="5" value="${gEnd}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Persp:</label>
                <select id="optBarGradPersp">
                    <option value="none" ${gPersp === 'none' ? 'selected' : ''}>Std</option>
                    <option value="vp1" ${gPersp === 'vp1' ? 'selected' : ''}>VP1</option>
                    <option value="vp2" ${gPersp === 'vp2' ? 'selected' : ''}>VP2</option>
                    <option value="vp3" ${gPersp === 'vp3' ? 'selected' : ''}>VP3</option>
                    <option value="iso" ${gPersp === 'iso' ? 'selected' : ''}>Iso</option>
                </select>
            </div>
            <div class="tool-opt-group">
                <label>Clip:</label>
                <select id="optBarGradClip">
                    <option value="auto" ${gClip === 'auto' ? 'selected' : ''}>Auto Shape</option>
                    <option value="free" ${gClip === 'free' ? 'selected' : ''}>Free Span</option>
                </select>
            </div>
            <div class="tool-opt-group">
                <label style="cursor:pointer;"><input type="checkbox" id="optBarGradInvert" ${gInvert ? 'checked' : ''} style="width:auto; margin:0;"> Invert</label>
            </div>
        `;
    } else if (currentTool === 'text') {
        const txtVal = (document.getElementById('textToolValue')?.value || 'TRACK').replace(/"/g, '&quot;');
        const txtSize = document.getElementById('textToolSize')?.value || 48;
        const txtStyle = document.getElementById('textToolStyle')?.value || 'stroke';
        html = `
            <div class="tool-opt-group">
                <label>Text:</label>
                <input type="text" id="optBarTextValue" value="${txtVal}" maxlength="40">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Size: <span class="tool-opt-val" id="optBarTextSizeVal">${txtSize}px</span></label>
                <input type="range" id="optBarTextSize" min="12" max="200" step="2" value="${txtSize}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Style:</label>
                <select id="optBarTextStyle">
                    <option value="stroke" ${txtStyle === 'stroke' ? 'selected' : ''}>Single</option>
                    <option value="bold" ${txtStyle === 'bold' ? 'selected' : ''}>Bold</option>
                </select>
            </div>
            <span class="tool-opt-hint">(Click canvas to stamp)</span>
        `;
    } else if (currentTool === 'rockBrush') {
        html = `
            <div class="tool-opt-group">
                <label>Size: <span class="tool-opt-val" id="optBarRockSizeVal">${rockBrushSize}px</span></label>
                <input type="range" id="optBarRockSize" min="15" max="150" step="1" value="${rockBrushSize}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Roughness: <span class="tool-opt-val" id="optBarRockRoughnessVal">${rockBrushRoughness.toFixed(2)}</span></label>
                <input type="range" id="optBarRockRoughness" min="0" max="1" step="0.05" value="${rockBrushRoughness}">
            </div>
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Style:</label>
                <select id="optBarRockStyle">
                    <option value="random" ${rockBrushType === 'random' ? 'selected' : ''}>Random</option>
                    <option value="boulder" ${rockBrushType === 'boulder' ? 'selected' : ''}>Boulder</option>
                    <option value="crag" ${rockBrushType === 'crag' ? 'selected' : ''}>Crag / Spire</option>
                    <option value="slab" ${rockBrushType === 'slab' ? 'selected' : ''}>Slab</option>
                    <option value="pebble" ${rockBrushType === 'pebble' ? 'selected' : ''}>Pebble</option>
                </select>
            </div>
            <span class="tool-opt-hint">(Click: stamp · Drag: paint · Alt: physics)</span>
        `;
    } else if (['line', 'line+', 'brush'].includes(currentTool)) {
        const lineType = document.getElementById('lineType')?.value || 'solid';
        const scale = document.getElementById('patternScale')?.value || 1;
        html = `
            <div class="tool-opt-group">
                <label>Pattern:</label>
                <select id="optBarLineType">
                    <option value="solid" ${lineType === 'solid' ? 'selected' : ''}>Solid</option>
                    <option value="dashes" ${lineType === 'dashes' ? 'selected' : ''}>Dashes</option>
                    <option value="dots" ${lineType === 'dots' ? 'selected' : ''}>Dots</option>
                    <option value="noisy" ${lineType === 'noisy' ? 'selected' : ''}>Noisy</option>
                </select>
            </div>
            ${lineType !== 'solid' ? `
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Scale: <span class="tool-opt-val" id="optBarPatternScaleVal">${parseFloat(scale).toFixed(2)}×</span></label>
                <input type="range" id="optBarPatternScale" min="0.25" max="3" step="0.05" value="${scale}">
            </div>
            ` : ''}
            ${currentTool === 'brush' ? `
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <label>Spacing: <span class="tool-opt-val" id="optBarBrushSpacingVal">${document.getElementById('pointSpacing')?.value || 8}px</span></label>
                <input type="range" id="optBarBrushSpacing" min="0" max="50" step="1" value="${document.getElementById('pointSpacing')?.value || 8}">
            </div>
            ` : ''}
            <span class="tool-opt-hint">(Alt: force solid)</span>
        `;
    } else if (currentTool === 'polygon') {
        const sides = document.getElementById('polySides')?.value || 6;
        html = `
            <div class="tool-opt-group">
                <label>Sides: <span class="tool-opt-val" id="optBarPolySidesVal">${sides}</span></label>
                <input type="range" id="optBarPolySides" min="3" max="32" step="1" value="${sides}">
            </div>
            <span class="tool-opt-hint">(Click center, drag radius)</span>
        `;
    } else if (currentTool === 'circle') {
        html = `<span class="tool-opt-hint">Circle: Click center, drag radius to create.</span>`;
    } else if (currentTool === 'box') {
        const bMode = document.getElementById('boxFacesMode')?.value || 'exterior';
        html = `
            <div class="tool-opt-group">
                <label>Edges:</label>
                <select id="optBarBoxFaces">
                    <option value="exterior" ${bMode === 'exterior' ? 'selected' : ''}>Visible Exterior</option>
                    <option value="wireframe" ${bMode === 'wireframe' ? 'selected' : ''}>Full Wireframe</option>
                </select>
            </div>
            <span class="tool-opt-hint">(3 clicks: corner, front face, depth)</span>
        `;
    } else if (currentTool === 'select') {
        const has = selection.fragments.length > 0;
        html = `
            <div class="tool-opt-group">
                <label>Target:</label>
                <select id="optBarSelLayer">
                    <option value="both" ${selLayer === 'both' ? 'selected' : ''}>Both</option>
                    <option value="physics" ${selLayer === 'physics' ? 'selected' : ''}>Physics</option>
                    <option value="scenery" ${selLayer === 'scenery' ? 'selected' : ''}>Scenery</option>
                </select>
            </div>
            ${has ? `
            <div class="tool-opt-sep"></div>
            <div class="tool-opt-group">
                <button class="tool-opt-btn" id="optBarSelRotM90" title="Rotate -90°">-90°</button>
                <button class="tool-opt-btn" id="optBarSelRotP90" title="Rotate +90°">+90°</button>
                <button class="tool-opt-btn" id="optBarSelFlipX" title="Flip Horizontal">Flip X</button>
                <button class="tool-opt-btn" id="optBarSelFlipY" title="Flip Vertical">Flip Y</button>
                <button class="tool-opt-btn" id="optBarSelToPhys" title="Move to Physics Layer">→ Phys</button>
                <button class="tool-opt-btn" id="optBarSelToScen" title="Move to Scenery Layer">→ Scen</button>
                <button class="tool-opt-btn" id="optBarSelDelete" title="Delete Selection">Del</button>
            </div>
            ` : '<span class="tool-opt-hint">(Drag box · Del: erase · Ctrl+C: copy)</span>'}
        `;
    } else if (currentTool === 'modify') {
        html = `<span class="tool-opt-hint">Modify: Click vertex to drag · Del: delete vertex</span>`;
    }

    if (html.trim()) {
        bar.innerHTML = html;
        bar.style.display = 'flex';
        bindToolOptionsBarEvents();
    } else {
        bar.style.display = 'none';
        bar.innerHTML = '';
    }
}

function bindToolOptionsBarEvents() {
    // Eraser sync
    const erRadius = document.getElementById('optBarEraserRadius');
    if (erRadius) {
        erRadius.addEventListener('input', (e) => {
            const main = document.getElementById('eraserRadius');
            const val = document.getElementById('eraserRadiusVal');
            const barVal = document.getElementById('optBarEraserRadiusVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value + 'px';
            updateEraserCursor();
            draw();
        });
        erRadius.addEventListener('change', saveSettings);
    }
    const erMode = document.getElementById('optBarEraserMode');
    if (erMode) {
        erMode.addEventListener('change', (e) => {
            const main = document.getElementById('eraserMode');
            if (main) main.value = e.target.value;
            saveSettings();
        });
    }
    const erLayer = document.getElementById('optBarEraserLayer');
    if (erLayer) {
        erLayer.addEventListener('change', (e) => {
            const main = document.getElementById('eraserLayerTarget');
            if (main) main.value = e.target.value;
            saveSettings();
        });
    }

    // Curve sync
    const crvSteps = document.getElementById('optBarCurveSteps');
    if (crvSteps) {
        crvSteps.addEventListener('input', (e) => {
            const main = document.getElementById('curveSegments');
            const val = document.getElementById('curveSegmentsVal');
            const barVal = document.getElementById('optBarCurveStepsVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value + ' steps';
        });
        crvSteps.addEventListener('change', saveSettings);
    }

    // Bridge sync
    const brTension = document.getElementById('optBarBridgeTension');
    if (brTension) {
        brTension.addEventListener('input', (e) => {
            const main = document.getElementById('bridgeTension');
            const val = document.getElementById('bridgeTensionVal');
            const barVal = document.getElementById('optBarBridgeTensionVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = parseFloat(e.target.value).toFixed(1);
            if (barVal) barVal.textContent = parseFloat(e.target.value).toFixed(1) + '×';
        });
        brTension.addEventListener('change', saveSettings);
    }
    const brSteps = document.getElementById('optBarBridgeSteps');
    if (brSteps) {
        brSteps.addEventListener('input', (e) => {
            const main = document.getElementById('bridgeSteps');
            const val = document.getElementById('bridgeStepsVal');
            const barVal = document.getElementById('optBarBridgeStepsVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value;
        });
        brSteps.addEventListener('change', saveSettings);
    }

    // Tube sync
    const tbWidth = document.getElementById('optBarTubeWidth');
    if (tbWidth) {
        tbWidth.addEventListener('input', (e) => {
            const main = document.getElementById('tubeWidth');
            const val = document.getElementById('tubeWidthVal');
            const barVal = document.getElementById('optBarTubeWidthVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value + 'px';
        });
        tbWidth.addEventListener('change', saveSettings);
    }
    const tbJitter = document.getElementById('optBarTubeJitterToggle');
    if (tbJitter) {
        tbJitter.addEventListener('change', (e) => {
            const main = document.getElementById('tubeJitterToggle');
            if (main) main.checked = e.target.checked;
            saveSettings();
        });
    }

    // Fill sync
    const flMode = document.getElementById('optBarFillMode');
    if (flMode) {
        flMode.addEventListener('change', (e) => {
            const main = document.getElementById('fillMode');
            if (main) {
                main.value = e.target.value;
                updateFillSettingsVisibility();
            }
            updateToolOptionsBar();
            saveSettings();
        });
    }
    const flDensity = document.getElementById('optBarFillDensity');
    if (flDensity) {
        flDensity.addEventListener('input', (e) => {
            const main = document.getElementById('fillDensity');
            const val = document.getElementById('fillDensityVal');
            const barVal = document.getElementById('optBarFillDensityVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value + 'px';
        });
        flDensity.addEventListener('change', saveSettings);
    }
    const flRot = document.getElementById('optBarFillRot');
    if (flRot) {
        flRot.addEventListener('input', (e) => {
            const main = document.getElementById('fillRotation');
            const val = document.getElementById('fillRotationVal');
            const barVal = document.getElementById('optBarFillRotVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value + '°';
        });
        flRot.addEventListener('change', saveSettings);
    }
    const flSlant = document.getElementById('optBarFillSlant');
    if (flSlant) {
        flSlant.addEventListener('input', (e) => {
            const main = document.getElementById('fillSlant');
            const val = document.getElementById('fillSlantVal');
            const barVal = document.getElementById('optBarFillSlantVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value + '°';
        });
        flSlant.addEventListener('change', saveSettings);
    }
    const flPersp = document.getElementById('optBarFillPersp');
    if (flPersp) {
        flPersp.addEventListener('change', (e) => {
            const main = document.getElementById('fillPerspAxis');
            if (main) main.value = e.target.value;
            updateToolOptionsBar();
            saveSettings();
        });
    }
    const optBoxFaces = document.getElementById('optBarBoxFaces');
    if (optBoxFaces) {
        optBoxFaces.addEventListener('change', (e) => {
            const main = document.getElementById('boxFacesMode');
            if (main) main.value = e.target.value;
            saveSettings();
        });
    }

    // Line Pattern sync
    const optLineType = document.getElementById('optBarLineType');
    if (optLineType) {
        optLineType.addEventListener('change', (e) => {
            const main = document.getElementById('lineType');
            if (main) main.value = e.target.value;
            updateToolUI();
            updateToolOptionsBar();
            saveSettings();
            draw();
        });
    }
    const optPatternScale = document.getElementById('optBarPatternScale');
    if (optPatternScale) {
        optPatternScale.addEventListener('input', (e) => {
            const main = document.getElementById('patternScale');
            const val = document.getElementById('patternScaleVal');
            const barVal = document.getElementById('optBarPatternScaleVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = parseFloat(e.target.value).toFixed(2);
            if (barVal) barVal.textContent = parseFloat(e.target.value).toFixed(2) + '×';
            updatePatternHud();
            drawPatternPreview();
        });
        optPatternScale.addEventListener('change', saveSettings);
    }
    const optBrushSpacing = document.getElementById('optBarBrushSpacing');
    if (optBrushSpacing) {
        optBrushSpacing.addEventListener('input', (e) => {
            const main = document.getElementById('pointSpacing');
            const val = document.getElementById('pointSpacingVal');
            const barVal = document.getElementById('optBarBrushSpacingVal');
            if (main) main.value = e.target.value;
            if (val) val.textContent = e.target.value;
            if (barVal) barVal.textContent = e.target.value + 'px';
        });
        optBrushSpacing.addEventListener('change', saveSettings);
    }

    // Polygon sync
    const optPolySides = document.getElementById('optBarPolySides');
    if (optPolySides) {
        optPolySides.addEventListener('input', (e) => {
            const main = document.getElementById('polySides');
            const barVal = document.getElementById('optBarPolySidesVal');
            if (main) main.value = e.target.value;
            if (barVal) barVal.textContent = e.target.value;
        });
        optPolySides.addEventListener('change', saveSettings);
    }

    // Select target layer sync & transform buttons
    const optSelLayer = document.getElementById('optBarSelLayer');
    if (optSelLayer) {
        optSelLayer.addEventListener('change', (e) => {
            selLayer = e.target.value;
            const main = document.getElementById('selLayerSelect');
            if (main) main.value = e.target.value;
            saveSettings();
            draw();
        });
    }
    const selBind = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    selBind('optBarSelRotM90', () => rotateSelection(-90));
    selBind('optBarSelRotP90', () => rotateSelection(90));
    selBind('optBarSelFlipX', () => flipSelection('x'));
    selBind('optBarSelFlipY', () => flipSelection('y'));
    selBind('optBarSelToPhys', () => convertSelectionLayer('physics'));
    selBind('optBarSelToScen', () => convertSelectionLayer('scenery'));
    selBind('optBarSelDelete', deleteSelection);

    // Gradient sync
    const syncGradSel = (barId, mainId) => {
        const el = document.getElementById(barId);
        if (el) el.addEventListener('change', (e) => {
            const m = document.getElementById(mainId);
            if (m) m.value = e.target.value;
            if (mainId === 'gradClipMode') updateGradientSettingsVisibility();
            saveSettings();
        });
    };
    syncGradSel('optBarGradType', 'gradType');
    syncGradSel('optBarGradStyle', 'gradStyle');
    syncGradSel('optBarGradClip', 'gradClipMode');
    syncGradSel('optBarGradPersp', 'gradPerspAxis');

    const syncGradRange = (barId, barValId, mainId, mainValId, suffix = 'px') => {
        const el = document.getElementById(barId);
        if (el) {
            el.addEventListener('input', (e) => {
                const m = document.getElementById(mainId);
                const mv = document.getElementById(mainValId);
                const bv = document.getElementById(barValId);
                if (m) m.value = e.target.value;
                if (mv) mv.textContent = e.target.value;
                if (bv) bv.textContent = e.target.value + suffix;
            });
            el.addEventListener('change', saveSettings);
        }
    };
    syncGradRange('optBarGradStart', 'optBarGradStartVal', 'gradStartSpacing', 'gradStartSpacingVal');
    syncGradRange('optBarGradEnd', 'optBarGradEndVal', 'gradEndSpacing', 'gradEndSpacingVal');

    const optGradInv = document.getElementById('optBarGradInvert');
    if (optGradInv) {
        optGradInv.addEventListener('change', (e) => {
            const m = document.getElementById('gradInvertToggle');
            if (m) m.checked = e.target.checked;
            saveSettings();
        });
    }

    // Text tool sync
    const optTxtVal = document.getElementById('optBarTextValue');
    if (optTxtVal) {
        optTxtVal.addEventListener('input', (e) => {
            const m = document.getElementById('textToolValue');
            if (m) m.value = e.target.value;
            draw();
        });
        optTxtVal.addEventListener('change', saveSettings);
    }
    const optTxtSize = document.getElementById('optBarTextSize');
    if (optTxtSize) {
        optTxtSize.addEventListener('input', (e) => {
            const m = document.getElementById('textToolSize');
            const mv = document.getElementById('textToolSizeVal');
            const bv = document.getElementById('optBarTextSizeVal');
            if (m) m.value = e.target.value;
            if (mv) mv.textContent = e.target.value;
            if (bv) bv.textContent = e.target.value + 'px';
            draw();
        });
        optTxtSize.addEventListener('change', saveSettings);
    }
    const optTxtStyle = document.getElementById('optBarTextStyle');
    if (optTxtStyle) {
        optTxtStyle.addEventListener('change', (e) => {
            const m = document.getElementById('textToolStyle');
            if (m) m.value = e.target.value;
            saveSettings();
            draw();
        });
    }

    // Rock Brush sync
    const optRockSize = document.getElementById('optBarRockSize');
    if (optRockSize) {
        optRockSize.addEventListener('input', (e) => {
            rockBrushSize = parseInt(e.target.value) || 45;
            const bv = document.getElementById('optBarRockSizeVal');
            if (bv) bv.textContent = rockBrushSize + 'px';
            draw();
        });
        optRockSize.addEventListener('change', saveSettings);
    }
    const optRockRoughness = document.getElementById('optBarRockRoughness');
    if (optRockRoughness) {
        optRockRoughness.addEventListener('input', (e) => {
            rockBrushRoughness = parseFloat(e.target.value) || 0.5;
            const bv = document.getElementById('optBarRockRoughnessVal');
            if (bv) bv.textContent = rockBrushRoughness.toFixed(2);
        });
        optRockRoughness.addEventListener('change', saveSettings);
    }
    const optRockStyle = document.getElementById('optBarRockStyle');
    if (optRockStyle) {
        optRockStyle.addEventListener('change', (e) => {
            rockBrushType = e.target.value;
            saveSettings();
        });
    }
}

function updateGradientSettingsVisibility() {
    const clipMode = document.getElementById('gradClipMode')?.value || 'auto';
    const spanRow = document.getElementById('gradSpanWidthRow');
    if (spanRow) spanRow.style.display = clipMode === 'free' ? 'block' : 'none';
}

function updateToolUI() {
    const patternTools = ['line', 'line+', 'brush', 'polygon', 'circle', 'box', 'fill', 'gradient', 'text'];
    const showPattern = patternTools.includes(currentTool);
    const patternSettingsEl = document.getElementById('patternSettings');
    if (patternSettingsEl) {
        const targetSlot = document.getElementById(HYBRID_TOOLS.has(currentTool) ? 'hybridPatternSlot' : 'manualPatternSlot');
        if (targetSlot && patternSettingsEl.parentElement !== targetSlot) {
            targetSlot.appendChild(patternSettingsEl);
        }
        patternSettingsEl.style.display = showPattern ? 'block' : 'none';
    }
    document.getElementById('polySidesRow').style.display = currentTool === 'polygon' ? 'block' : 'none';
    document.getElementById('pointSpacingRow').style.display = currentTool === 'brush' ? 'block' : 'none';
    document.getElementById('selectSettings').style.display = currentTool === 'select' ? 'block' : 'none';
    const boxSettings = document.getElementById('boxSettings');
    if (boxSettings) boxSettings.style.display = currentTool === 'box' ? 'block' : 'none';
    const curveSettings = document.getElementById('curveSettings');
    if (curveSettings) curveSettings.style.display = currentTool === 'curve' ? 'block' : 'none';
    const eraserSettings = document.getElementById('eraserSettings');
    if (eraserSettings) eraserSettings.style.display = currentTool === 'eraser' ? 'block' : 'none';
    const bridgeSettings = document.getElementById('bridgeSettings');
    if (bridgeSettings) bridgeSettings.style.display = currentTool === 'bridge' ? 'block' : 'none';
    const tubeSettings = document.getElementById('tubeSettings');
    if (tubeSettings) tubeSettings.style.display = currentTool === 'tube' ? 'block' : 'none';
    const fillSettings = document.getElementById('fillSettings');
    if (fillSettings) fillSettings.style.display = currentTool === 'fill' ? 'block' : 'none';
    const gradientSettings = document.getElementById('gradientSettings');
    if (gradientSettings) gradientSettings.style.display = currentTool === 'gradient' ? 'block' : 'none';
    const textSettings = document.getElementById('textSettings');
    if (textSettings) textSettings.style.display = currentTool === 'text' ? 'block' : 'none';
    updateFillSettingsVisibility();
    updateGradientSettingsVisibility();

    const lineType = document.getElementById('lineType').value;
    document.getElementById('patternScaleRow').style.display = (showPattern && lineType !== 'solid') ? 'block' : 'none';
    document.getElementById('noiseCoverageRow').style.display = (showPattern && lineType === 'noisy') ? 'block' : 'none';
    document.getElementById('noiseSeedRow').style.display = (showPattern && lineType === 'noisy') ? 'block' : 'none';

    document.querySelectorAll('.hud-btn[data-hud-tool]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-hud-tool') === currentTool);
    });

    applyToolCursor();
    updatePatternHud();
    drawPatternPreview();
    updateToolOptionsBar();
    updateStatusBar();
}

function updatePatternHud() {
    const hud = document.getElementById('patternHud');
    if (!hud) return;
    const patternTools = ['line', 'line+', 'brush', 'polygon', 'circle', 'fill', 'gradient', 'text'];
    const lineType = document.getElementById('lineType').value;
    if (appMode === 'auto' || !patternTools.includes(currentTool) || lineType === 'solid') {
        hud.style.display = 'none';
        return;
    }
    const scale = parseFloat(document.getElementById('patternScale').value).toFixed(2);
    let text = lineType.charAt(0).toUpperCase() + lineType.slice(1) + ' · ' + scale + '×';
    if (lineType === 'noisy') text += ' · ' + document.getElementById('noiseCoverage').value + '%';
    hud.textContent = text;
    hud.style.display = 'block';
}

function drawPatternPreview() {
    const cvs = document.getElementById('patternPreview');
    if (!cvs) return;
    const c = cvs.getContext('2d');
    const w = cvs.width, h = cvs.height;
    c.clearRect(0, 0, w, h);

    const style = getComputedStyle(document.body);
    const bgColor = style.getPropertyValue('--input-bg').trim() || '#fff';
    const dl = document.getElementById('drawLayer');
    const inkColor = (dl && dl.value === 'scenery') ? '#AAAAAA' : '#000000';

    c.fillStyle = bgColor;
    c.fillRect(0, 0, w, h);

    const lineType = document.getElementById('lineType').value;
    const scale = parseFloat(document.getElementById('patternScale').value) || 1;
    const coverage = parseFloat(document.getElementById('noiseCoverage').value);
    const seed = parseFloat(document.getElementById('noiseSeed').value);

    const baseY = h / 2;
    const testLine = [{ x: 8, y: baseY }, { x: w - 8, y: baseY }];
    let fragments;
    if (lineType === 'solid') fragments = [testLine];
    else fragments = applyLinePattern(testLine, lineType, scale, coverage, seed);

    c.strokeStyle = inkColor;
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const frag of fragments) {
        if (frag.length < 2) continue;
        c.beginPath();
        c.moveTo(frag[0].x, frag[0].y);
        for (let i = 1; i < frag.length; i++) c.lineTo(frag[i].x, frag[i].y);
        c.stroke();
    }
}

function resetDrawingState() {
    isDrawing = false;
    currentLine = [];
    shapeState = 'idle';
    boxState = 'idle';
    boxAnchor = null;
    boxFrontQuad = null;
    boxFullCorners = null;
    curveState = 'idle';
    curveStart = null;
    curveControl = null;
    curveEnd = null;
    bridgeState = 'idle';
    bridgeStart = null;
    bridgeStartTangent = null;
    bridgeEnd = null;
    bridgeEndTangent = null;
    tubeSpine = [];
    isTubeDrawing = false;
    isGradDragging = false;
    gradStart = null;
    gradEnd = null;
    gradClipCache = null;
    gradPreviewLines = [];
    selDragState = null;
    selMoveStart = null;
    selMoveDelta = { x: 0, y: 0 };
    dragMode = null;
    activePerspGuideRay = null;
    activeAngleGuide = null;
    draw();
}

document.getElementById('tabNav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn || appMode !== 'auto') return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.getAttribute('data-target')).classList.add('active');
});

// ==========================================
// HOTKEYS
// ==========================================
window.addEventListener('keydown', (e) => {
    isShiftDown = e.shiftKey;
    if (isInputFocused(e.target)) return;

    if (e.ctrlKey || e.metaKey) {
        const ck = e.key.toLowerCase();
        if (ck === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (ck === 'y') { e.preventDefault(); redo(); return; }
        if (ck === 's' && e.shiftKey) {
            e.preventDefault();
            if (currentTool === 'select' && selection.fragments.length > 0) saveSelectionAsObject();
            else savePngSnapshot();
            return;
        }
        if (ck === 's' && !e.shiftKey) { e.preventDefault(); exportTrackToFile(); return; }
        if (ck === 'o') { e.preventDefault(); promptOpenTrack(); return; }
        if (ck === 'n') { e.preventDefault(); handleNewTrack(); return; }
        if (ck === '[') { e.preventDefault(); toggleSidebarCollapse(); return; }
        if (ck === 'x' && currentTool === 'select' && selection.fragments.length > 0) { e.preventDefault(); copySelection(); deleteSelection(); return; }
        if (ck === 'c' && currentTool === 'select' && selection.fragments.length > 0) { e.preventDefault(); copySelection(); return; }
        if (ck === 'v' && currentTool === 'select' && clipboardFragments) { e.preventDefault(); pasteSelection(); return; }
        return;
    }

    if (e.altKey) return;

    if (e.key === 'Tab') {
        e.preventDefault();
        rotateAppMode();
        return;
    }

    if (e.key === '?' || e.key === 'F1' || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault();
        const hm = document.getElementById('helpModal');
        hm.style.display = hm.style.display === 'block' ? 'none' : 'block';
        return;
    }

    if (e.key === '\\') { e.preventDefault(); toggleZenMode(); return; }
    if (e.key.toLowerCase() === 'n') { e.preventDefault(); toggleMinimap(); return; }

    if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        const slider = document.getElementById('eraserRadius');
        if (slider) {
            let val = parseInt(slider.value) || 20;
            const delta = e.shiftKey ? 10 : 2;
            val += (e.key === ']' ? delta : -delta);
            val = Math.max(4, Math.min(150, val));
            slider.value = val;
            const valSpan = document.getElementById('eraserRadiusVal');
            if (valSpan) valSpan.textContent = val;
            updateEraserCursor();
            saveSettings();
            draw();
            toast('Eraser Radius: ' + val + 'px', 'info', 800);
        }
        return;
    }

    if (e.code === 'Space') { e.preventDefault(); isSpaceDown = true; container.style.cursor = 'grab'; }

    if (appMode !== 'auto') {
        const k = e.key.toLowerCase();
        if (k === 'q') clickTool('line');
        else if (k === 'w') clickTool('line+');
        else if (k === 'r') clickTool('curve');
        else if (k === 'b') clickTool('bridge');
        else if (k === 't') clickTool('tube');
        else if (k === 'a') clickTool('brush');
        else if (k === 'e') clickTool('eraser');
        else if (k === 'f') clickTool('fill');
        else if (k === 'g') clickTool('gradient');
        else if (k === 'x') clickTool('text');
        else if (k === 'k') clickTool('rockBrush');
        else if (k === 'p') clickTool('polygon');
        else if (k === 'o') clickTool('circle');
        else if (k === 'u') clickTool('box');
        else if (k === 's' || k === 'v') clickTool('select');
        else if (k === 'm') clickTool('modify');
        else if (k === 'l') {
            const dl = document.getElementById('drawLayer');
            dl.value = dl.value === 'physics' ? 'scenery' : 'physics';
            dl.dispatchEvent(new Event('change'));
        }
        else if (e.key === 'Escape') {
            if (isPerspEditMode) { setPerspEditMode(false); return; }
            if (isRefImgDragMode) { setRefImgDragMode(false); return; }
            if (placementState.active) cancelPlacement();
            else if (curveState !== 'idle' || bridgeState !== 'idle' || isTubeDrawing || isGradDragging) resetDrawingState();
            else if (currentTool === 'select' && selection.fragments.length > 0) clearSelection();
            else resetDrawingState();
        }
        else if (e.key === 'Enter') {
            if (currentTool === 'tube' && isTubeDrawing && tubeSpine.length >= 2) {
                bakeTubeWalls(e.altKey);
                isTubeDrawing = false;
                tubeSpine = [];
                draw();
            }
        }
        else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (currentTool === 'modify' && selectedVertex) { e.preventDefault(); deleteSelectedVertex(); }
            else if (currentTool === 'select' && selection.fragments.length > 0) { e.preventDefault(); deleteSelection(); }
        }
    } else {
        if (e.key === 'Escape') {
            if (isPickingShadePoint) { setPickShadePointMode(false); return; }
            if (placementState.active) cancelPlacement();
            else if (document.getElementById('maskModeToggle').checked) {
                document.getElementById('maskModeToggle').checked = false;
                container.classList.remove('mask-active');
                saveSettings();
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    isShiftDown = e.shiftKey;
    if (e.code === 'Space') {
        isSpaceDown = false;
        applyToolCursor();
    } else if (e.key === 'Shift' && currentTool === 'text') {
        draw();
    }
});

window.addEventListener('blur', () => {
    isSpaceDown = false;
    isShiftDown = false;
    applyToolCursor();
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    }
});

function clickTool(toolName) {
    if (toolName === 'camera') toolName = 'line';
    const targetMode = HYBRID_TOOLS.has(toolName) ? 'hybrid' : 'manual';
    if (appMode !== targetMode) {
        setAppMode(targetMode);
    }
    const btn = document.querySelector('.tool-btn[data-tool="' + toolName + '"]');
    if (btn) btn.click();
}

// ==========================================
// CODEC & MATH
// ==========================================
const ALPHABET = "0123456789abcdefghijklmnopqrstuv";
const ENC = {}; const DEC = {};
for (let i = 0; i < ALPHABET.length; i++) { ENC[i] = ALPHABET[i]; DEC[ALPHABET[i]] = i; }

function dec(s) { let sign = 1; if (s.startsWith('-')) { sign = -1; s = s.substring(1); } let n = 0; for (let i = 0; i < s.length; i++) n = n * 32 + DEC[s[i]]; return sign * n; }
function enc(v) { v = Math.round(v); if (v === 0) return "0"; let sign = v < 0 ? "-" : ""; v = Math.abs(v); let out = ""; while (v > 0) { out = ENC[v % 32] + out; v = Math.floor(v / 32); } return sign + out; }
function parseSection(text) {
    let out = [];
    if (!text) return out;
    for (const chunk of text.split(',')) {
        let toks = chunk.trim().split(/\s+/);
        if (toks.length < 2) continue;
        if (toks.length % 2 !== 0) toks.pop();
        let pts = [];
        for (let i = 0; i < toks.length; i += 2) {
            const x = dec(toks[i]);
            const y = dec(toks[i+1]);
            if (isFinite(x) && isFinite(y)) pts.push({ x, y });
        }
        if (pts.length > 0) out.push(pts);
    }
    return out;
}
function encodeSection(polys) { return polys.map(poly => poly.map(p => enc(p.x) + ' ' + enc(p.y)).join(' ')).join(','); }

function getRNG(seed) { let a = seed; return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
function randomUniform(rng, min, max) { return min + rng() * (max - min); }
function randInt(rng, min, max) { return Math.floor(randomUniform(rng, min, max + 1)); }
function hash2d(x, y, seed) { let v = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453; return ((v % 1) + 1) % 1; }
function smoothNoise(x, y, seed) { let x0 = Math.floor(x), x1 = x0 + 1; let y0 = Math.floor(y), y1 = y0 + 1; let fx = x - x0, fy = y - y0; let sx = fx * fx * (3 - 2 * fx); let sy = fy * fy * (3 - 2 * fy); let n00 = hash2d(x0, y0, seed), n10 = hash2d(x1, y0, seed); let n01 = hash2d(x0, y1, seed), n11 = hash2d(x1, y1, seed); let nx0 = n00 * (1 - sx) + n10 * sx; let nx1 = n01 * (1 - sx) + n11 * sx; return nx0 * (1 - sy) + nx1 * sy; }
function fbm(x, y, seed, octaves = 3) {
    let v = 0, amp = 1, freq = 1, total_amp = 0;
    for (let i = 0; i < octaves; i++) { v += smoothNoise(x * freq, y * freq, seed) * amp; total_amp += amp; amp *= 0.5; freq *= 2.0; }
    return v / total_amp;
}
function getGradient(x, y, seed, scale) { let eps = 4.0; let hx = fbm((x + eps) * scale, y * scale, seed) - fbm((x - eps) * scale, y * scale, seed); let hy = fbm(x * scale, (y + eps) * scale, seed) - fbm(x * scale, (y - eps) * scale, seed); return Math.atan2(hy, hx) + Math.PI / 2.0; }
function pointLineDist(px, py, x0, y0, x1, y1) { let dx = x1 - x0, dy = y1 - y0; let L2 = dx * dx + dy * dy; if (L2 === 0) return Math.hypot(px - x0, py - y0); let t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2)); return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)); }
function simplifyRDP(pts, epsilon) { if (pts.length < 3) return pts; let dmax = 0, index = 0, end = pts.length - 1; for (let i = 1; i < end; i++) { let d = pointLineDist(pts[i].x, pts[i].y, pts[0].x, pts[0].y, pts[end].x, pts[end].y); if (d > dmax) { index = i; dmax = d; } } if (dmax > epsilon) { let rec1 = simplifyRDP(pts.slice(0, index + 1), epsilon); let rec2 = simplifyRDP(pts.slice(index), epsilon); return rec1.slice(0, -1).concat(rec2); } else { return [pts[0], pts[end]]; } }

function clonePoints(pts) { return pts.map(p => ({ x: p.x, y: p.y })); }

function signedArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        a += p0.x * p1.y - p1.x * p0.y;
    }
    return a / 2;
}

// ==========================================
// LINE PATTERNS
// ==========================================
function pointAtArclength(poly, cum, t) {
    if (t <= 0) return { x: poly[0].x, y: poly[0].y };
    const total = cum[cum.length - 1];
    if (t >= total) return { x: poly[poly.length - 1].x, y: poly[poly.length - 1].y };
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= t) lo = mid; else hi = mid;
    }
    const segLen = cum[hi] - cum[lo];
    const f = segLen > 0 ? (t - cum[lo]) / segLen : 0;
    return {
        x: poly[lo].x + (poly[hi].x - poly[lo].x) * f,
        y: poly[lo].y + (poly[hi].y - poly[lo].y) * f,
    };
}

function extractSubPolyline(poly, cum, t0, t1) {
    if (t1 <= t0) return null;
    const out = [pointAtArclength(poly, cum, t0)];
    for (let i = 1; i < poly.length - 1; i++) {
        if (cum[i] > t0 && cum[i] < t1) out.push({ x: poly[i].x, y: poly[i].y });
    }
    out.push(pointAtArclength(poly, cum, t1));
    return out;
}

function applyLinePattern(poly, type, scale, coverage, seed) {
    if (!poly || poly.length < 2) return poly ? [poly] : [];
    if (type === 'solid') return [poly];

    const cum = [0];
    for (let i = 1; i < poly.length; i++) {
        cum[i] = cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    }
    const total = cum[cum.length - 1];
    if (total < 0.001) return [poly];

    const fragments = [];

    if (type === 'dashes' || type === 'dots') {
        const onLen = (type === 'dashes' ? 14 : 2) * scale;
        const offLen = (type === 'dashes' ? 8 : 6) * scale;
        const cycle = onLen + offLen;
        let pos = 0;
        while (pos < total) {
            const end = Math.min(pos + onLen, total);
            const frag = extractSubPolyline(poly, cum, pos, end);
            if (frag && frag.length >= 2) fragments.push(frag);
            pos += cycle;
        }
    } else if (type === 'noisy') {
        if (coverage >= 100) return [poly];
        if (coverage <= 0) return [];
        const T = 1 - coverage / 100;
        const noiseScale = 0.02 / scale;
        const step = Math.max(0.75, 1.5 * scale);

        const samples = [{ x: poly[0].x, y: poly[0].y }];
        for (let i = 1; i < poly.length; i++) {
            const p0 = poly[i - 1], p1 = poly[i];
            const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const n = Math.max(1, Math.ceil(dist / step));
            for (let s = 1; s <= n; s++) {
                const f = s / n;
                samples.push({ x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f });
            }
        }

        const mask = [];
        for (const p of samples) {
            const nVal = fbm(p.x * noiseScale, p.y * noiseScale, seed, 2);
            mask.push(nVal > T);
        }

        const maxGapSamples = 2;
        for (let i = 1; i < mask.length - 1; i++) {
            if (!mask[i]) {
                let gapEnd = i;
                while (gapEnd < mask.length && !mask[gapEnd]) gapEnd++;
                const gapLen = gapEnd - i;
                if (gapLen <= maxGapSamples && mask[i - 1] && (gapEnd === mask.length || mask[gapEnd])) {
                    for (let j = i; j < gapEnd; j++) mask[j] = true;
                }
                i = gapEnd - 1;
            }
        }

        let current = [];
        for (let i = 0; i < samples.length; i++) {
            if (mask[i]) {
                current.push(samples[i]);
            } else {
                if (current.length >= 2) fragments.push(current);
                current = [];
            }
        }
        if (current.length >= 2) fragments.push(current);
    }

    return fragments;
}

function polylineLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
}

function getPatternSettings(altKey) {
    return {
        lineType: document.getElementById('lineType').value,
        scale: parseFloat(document.getElementById('patternScale').value) || 1,
        coverage: parseFloat(document.getElementById('noiseCoverage').value),
        seed: parseFloat(document.getElementById('noiseSeed').value),
        minLen: parseFloat(document.getElementById('minStrokeLen').value) || 0,
        bypass: !!altKey,
    };
}

function fragmentPointsWithPattern(rawPoints, altKey) {
    if (!rawPoints || rawPoints.length < 2) return null;
    const s = getPatternSettings(altKey);
    const totalLen = polylineLength(rawPoints);
    if (s.minLen > 0 && totalLen < s.minLen) {
        toast('Stroke too short (min ' + s.minLen + ')', 'info', 1200);
        return null;
    }
    const pts = rawPoints.length > 2 ? simplifyRDP(rawPoints, 0.6) : rawPoints.map(p => ({ x: p.x, y: p.y }));
    if (pts.length < 2) return null;

    let fragments;
    if (s.bypass || s.lineType === 'solid') fragments = [pts];
    else fragments = applyLinePattern(pts, s.lineType, s.scale, s.coverage, s.seed);

    const minFragLen = Math.max(1.5, 2 / s.scale);
    fragments = fragments.filter(f => polylineLength(f) >= minFragLen);
    if (fragments.length === 0) return null;
    return fragments;
}

function commitFragments(fragments) {
    if (!fragments || fragments.length === 0) return false;
    let allFragments = fragments;
    if (symmetryMode) {
        allFragments = allFragments.concat(fragments.map(f => f.map(p => ({ x: -p.x, y: p.y }))));
    }
    snapshot();
    const layer = document.getElementById('drawLayer').value;
    for (const frag of allFragments) {
        if (layer === 'physics') { physicsLines.push(clonePoints(frag)); bumpPhysics(); }
        else { const c = clonePoints(frag); originalSceneryLines.push(clonePoints(frag)); sceneryLines.push(c); }
    }
    bumpTrackVersion();
    updatePreviewBadge();
    draw();
    return true;
}

function commitDrawnStroke(rawPoints, altKey) {
    const fragments = fragmentPointsWithPattern(rawPoints, altKey);
    return commitFragments(fragments);
}

// ==========================================
// SELECTION — GEOMETRY HELPERS
// ==========================================
function normalizeBox(b) {
    return {
        minX: Math.min(b.x1, b.x2), maxX: Math.max(b.x1, b.x2),
        minY: Math.min(b.y1, b.y2), maxY: Math.max(b.y1, b.y2),
    };
}

function clipSegmentToRect(p0, p1, r) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    let t0 = 0, t1 = 1;
    const checks = [
        { p: -dx, q: p0.x - r.minX },
        { p: dx, q: r.maxX - p0.x },
        { p: -dy, q: p0.y - r.minY },
        { p: dy, q: r.maxY - p0.y },
    ];
    for (const c of checks) {
        if (c.p === 0) {
            if (c.q < 0) return null;
        } else {
            const t = c.q / c.p;
            if (c.p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
            else { if (t < t0) return null; if (t < t1) t1 = t; }
        }
    }
    return { t0, t1 };
}

function segmentInUnion(p0, p1, rects) {
    const ivs = [];
    for (const r of rects) {
        const c = clipSegmentToRect(p0, p1, r);
        if (c) ivs.push([c.t0, c.t1]);
    }
    if (ivs.length === 0) return [];
    ivs.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of ivs) {
        if (merged.length === 0) { merged.push([iv[0], iv[1]]); continue; }
        const last = merged[merged.length - 1];
        if (iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
        else merged.push([iv[0], iv[1]]);
    }
    return merged;
}

function subtractIntervals(base, sub) {
    let result = base;
    for (const s of sub) {
        const next = [];
        for (const [a, b] of result) {
            if (b <= s[0] || a >= s[1]) next.push([a, b]);
            else {
                if (a < s[0]) next.push([a, s[0]]);
                if (b > s[1]) next.push([s[1], b]);
            }
        }
        result = next;
    }
    return result;
}

function clipPolylineSplit(poly, addRects, subRects) {
    const insideFrags = [];
    const outsideFrags = [];
    let current = null;
    let currentState = null;

    function finalize() {
        if (current && current.length >= 2) {
            if (currentState === 'inside') insideFrags.push(current);
            else if (currentState === 'outside') outsideFrags.push(current);
        }
        current = null;
        currentState = null;
    }

    for (let i = 0; i < poly.length - 1; i++) {
        const p0 = poly[i], p1 = poly[i + 1];
        let ivs = segmentInUnion(p0, p1, addRects);
        if (subRects.length > 0) {
            const sub = segmentInUnion(p0, p1, subRects);
            ivs = subtractIntervals(ivs, sub);
        }
        let outIv = [[0, 1]];
        for (const iv of ivs) outIv = subtractIntervals(outIv, [iv]);

        const parts = [];
        for (const iv of ivs) parts.push({ t0: iv[0], t1: iv[1], state: 'inside' });
        for (const iv of outIv) parts.push({ t0: iv[0], t1: iv[1], state: 'outside' });
        parts.sort((a, b) => a.t0 - b.t0);

        for (const part of parts) {
            const pA = { x: p0.x + (p1.x - p0.x) * part.t0, y: p0.y + (p1.y - p0.y) * part.t0 };
            const pB = { x: p0.x + (p1.x - p0.x) * part.t1, y: p0.y + (p1.y - p0.y) * part.t1 };
            if (currentState !== part.state) {
                finalize();
                current = [pA, pB];
                currentState = part.state;
            } else {
                if (!current) current = [pA, pB];
                else current.push(pB);
            }
        }
    }
    finalize();
    return { inside: insideFrags, outside: outsideFrags };
}

// ==========================================
// SELECTION — STATE & REFRESH
// ==========================================
function clearSelection() {
    selectionBoxes.add.length = 0;
    selectionBoxes.subtract.length = 0;
    selDragState = null;
    selMoveStart = null;
    selMoveDelta = { x: 0, y: 0 };
    selection.fragments = [];
    selection.livePolys = null;
    selection.bbox = null;
    selection.polyCount = 0;
    selection.pointCount = 0;
    updateSelectionUI();
    draw();
}

function refreshSelection() {
    const addRects = selectionBoxes.add.map(normalizeBox);
    const subRects = selectionBoxes.subtract.map(normalizeBox);
    const fragments = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const layers = [];
    if (selLayer === 'physics' || selLayer === 'both') layers.push({ name: 'physics', lines: physicsLines });
    if (selLayer === 'scenery' || selLayer === 'both') layers.push({ name: 'scenery', lines: sceneryLines });

    for (const layer of layers) {
        for (const poly of layer.lines) {
            if (poly.length < 2) continue;
            const res = clipPolylineSplit(poly, addRects, subRects);
            for (const pts of res.inside) {
                fragments.push({ layer: layer.name, points: pts, srcPoly: poly });
                for (const p of pts) {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                }
            }
        }
    }

    selection.livePolys = null;
    selection.fragments = fragments;
    selection.polyCount = fragments.length;
    selection.pointCount = fragments.reduce((n, f) => n + f.points.length, 0);
    selection.bbox = fragments.length > 0 ? { minX, minY, maxX, maxY } : null;
    updateSelectionUI();
}

function updateSelectionUI() {
    const has = selection.fragments.length > 0;
    const ids = [
        'selDeleteBtn', 'selCopyBtn', 'selSaveObjBtn',
        'selRotM90Btn', 'selRotApplyBtn', 'selRotP90Btn',
        'selScaleApplyBtn', 'selFlipXBtn', 'selFlipYBtn',
        'selToPhysicsBtn', 'selToSceneryBtn',
        'selPerspSkewBtn', 'selProjVp1Btn', 'selProjVp2Btn',
        'selExtrudeVp1Btn', 'selExtrudeVp2Btn', 'selExtrudeVp3Btn',
        'selArrayVp1Btn', 'selArrayVp2Btn'
    ];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.disabled = !has;
    }
    const pill = document.getElementById('selectionPill');
    if (has) {
        pill.style.display = 'flex';
        document.getElementById('selectionPillText').textContent =
            selection.polyCount + (selection.polyCount === 1 ? ' polyline · ' : ' polylines · ') +
            selection.pointCount + ' pts';
    } else {
        pill.style.display = 'none';
    }
    if (currentTool === 'select') updateToolOptionsBar();
}

// ==========================================
// SELECTION — ACTIONS & TRANSFORMS
// ==========================================
function applySelectionEdit(addRects, subRects, layerFilter) {
    const modify = (arr) => {
        let changed = false;
        for (let i = arr.length - 1; i >= 0; i--) {
            const poly = arr[i];
            if (poly.length < 2) continue;
            const res = clipPolylineSplit(poly, addRects, subRects);
            if (res.inside.length > 0) {
                arr.splice.apply(arr, [i, 1].concat(res.outside));
                changed = true;
            }
        }
        return changed;
    };
    if (layerFilter === 'physics' || layerFilter === 'both') {
        if (modify(physicsLines)) bumpPhysics();
    }
    if (layerFilter === 'scenery' || layerFilter === 'both') {
        modify(originalSceneryLines);
        if (modify(sceneryLines)) bumpTrackVersion();
    }
}

function removeSelectedFromTrack() {
    if (selection.livePolys && selection.livePolys.length > 0) {
        const refSet = new Set(selection.livePolys);
        let physRemoved = false;
        let scenRemoved = false;
        for (let i = physicsLines.length - 1; i >= 0; i--) {
            if (refSet.has(physicsLines[i])) {
                physicsLines.splice(i, 1);
                physRemoved = true;
            }
        }
        for (let i = sceneryLines.length - 1; i >= 0; i--) {
            if (refSet.has(sceneryLines[i])) { sceneryLines.splice(i, 1); scenRemoved = true; }
        }
        for (let i = originalSceneryLines.length - 1; i >= 0; i--) {
            if (refSet.has(originalSceneryLines[i])) originalSceneryLines.splice(i, 1);
        }
        if (physRemoved) bumpPhysics();
        else if (scenRemoved) bumpTrackVersion();
    } else {
        const addRects = selectionBoxes.add.map(normalizeBox);
        const subRects = selectionBoxes.subtract.map(normalizeBox);
        applySelectionEdit(addRects, subRects, selLayer);
    }
}

function hasLockedSelectionLayer(overrideLayer = null) {
    const hasPhys = selection.fragments.some(f => f.layer === 'physics');
    const hasScen = selection.fragments.some(f => f.layer === 'scenery');
    if (hasPhys && isLayerLocked('physics')) return true;
    if (hasScen && isLayerLocked('scenery')) return true;
    if (overrideLayer && isLayerLocked(overrideLayer)) return true;
    return false;
}

function commitTransformedSelection(pointTransformFn, overrideLayer = null) {
    if (selection.fragments.length === 0) return;
    if (hasLockedSelectionLayer(overrideLayer)) return;
    snapshot();

    const oldFragments = selection.fragments.map(f => ({
        layer: overrideLayer || f.layer,
        points: f.points.map(p => pointTransformFn({ x: p.x, y: p.y }))
    }));

    removeSelectedFromTrack();
    selectionBoxes.add.length = 0;
    selectionBoxes.subtract.length = 0;

    const newLivePolys = [];
    const newFragments = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const f of oldFragments) {
        const roundedPts = f.points.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
        for (const p of roundedPts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        if (f.layer === 'physics') {
            physicsLines.push(roundedPts);
            newLivePolys.push(roundedPts);
            newFragments.push({ layer: 'physics', points: roundedPts, srcPoly: roundedPts });
            bumpPhysics();
        } else {
            const origCopy = clonePoints(roundedPts);
            originalSceneryLines.push(origCopy);
            sceneryLines.push(roundedPts);
            newLivePolys.push(roundedPts);
            newLivePolys.push(origCopy);
            newFragments.push({ layer: 'scenery', points: roundedPts, srcPoly: roundedPts });
        }
    }

    bumpTrackVersion();
    selection.livePolys = newLivePolys;
    selection.fragments = newFragments;
    selection.polyCount = newFragments.length;
    selection.pointCount = newFragments.reduce((n, f) => n + f.points.length, 0);
    selection.bbox = newFragments.length > 0 ? { minX, minY, maxX, maxY } : null;
    updatePreviewBadge();
    updateSelectionUI();
    draw();
}

function rotateSelection(degrees) {
    if (!selection.bbox || selection.fragments.length === 0) return;
    const cx = (selection.bbox.minX + selection.bbox.maxX) / 2;
    const cy = (selection.bbox.minY + selection.bbox.maxY) / 2;
    const rad = degrees * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    commitTransformedSelection(p => {
        const dx = p.x - cx, dy = p.y - cy;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    });
    toast(`Rotated selection by ${degrees}°`, 'info', 1200);
}

function scaleSelection(factor) {
    if (!selection.bbox || selection.fragments.length === 0) return;
    const cx = (selection.bbox.minX + selection.bbox.maxX) / 2;
    const cy = (selection.bbox.minY + selection.bbox.maxY) / 2;
    commitTransformedSelection(p => ({
        x: cx + (p.x - cx) * factor,
        y: cy + (p.y - cy) * factor
    }));
    toast(`Scaled selection ×${factor.toFixed(2)}`, 'info', 1200);
}

function flipSelection(axis) {
    if (!selection.bbox || selection.fragments.length === 0) return;
    const cx = (selection.bbox.minX + selection.bbox.maxX) / 2;
    const cy = (selection.bbox.minY + selection.bbox.maxY) / 2;
    commitTransformedSelection(p => axis === 'x'
        ? { x: cx - (p.x - cx), y: p.y }
        : { x: p.x, y: cy - (p.y - cy) }
    );
    toast(`Flipped selection ${axis.toUpperCase()}`, 'info', 1200);
}

function convertSelectionLayer(targetLayer) {
    if (selection.fragments.length === 0) return;
    commitTransformedSelection(p => p, targetLayer);
    toast(`Moved selection to ${targetLayer.toUpperCase()} layer`, 'success', 1500);
}

/**
 * Apply perspective trapezoid taper & shear to selected fragments based on percentage (-70..70).
 */
function skewSelection(skewPct) {
    if (!selection.bbox || selection.fragments.length === 0) return;
    const b = selection.bbox;
    const w = Math.max(1, b.maxX - b.minX);
    const cy = (b.minY + b.maxY) / 2;
    const tAmt = skewPct / 100;
    commitTransformedSelection(p => {
        const u = (p.x - b.minX) / w; // 0 left .. 1 right
        const scaleY = tAmt >= 0 ? (1 - tAmt * u) : (1 + tAmt * (1 - u));
        const shearY = (u - 0.5) * w * tAmt * 0.25;
        return {
            x: p.x,
            y: cy + (p.y - cy) * Math.max(0.15, scaleY) + shearY
        };
    });
    toast(`Applied perspective skew (${skewPct}%)`, 'info', 1200);
}

/**
 * Project selected fragments toward a vanishing point ('vp1' | 'vp2') so vertical height tapers cleanly along depth.
 */
function projectSelectionToVP(vpKey) {
    if (!selection.bbox || selection.fragments.length === 0) return;
    const vp = perspectiveGrid[vpKey] || perspectiveGrid.vp1;
    const b = selection.bbox;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const w = Math.max(1, b.maxX - b.minX);
    const towardRight = vp.x >= cx;
    const nearX = towardRight ? b.minX : b.maxX;
    const nearDist = Math.max(20, Math.abs(vp.x - nearX));

    commitTransformedSelection(p => {
        const u = towardRight ? (p.x - b.minX) / w : (b.maxX - p.x) / w;
        const distFromVp = Math.max(10, Math.abs(vp.x - p.x));
        const ratio = Math.min(1.0, Math.max(0.12, distFromVp / nearDist));
        const targetY = vp.y + (p.y - vp.y) * ratio;
        return {
            x: nearX + (towardRight ? 1 : -1) * (u * w * (0.45 + 0.55 * ratio)),
            y: cy + (targetY - cy) * 0.92 + (vp.y - cy) * (1 - ratio) * 0.65
        };
    });
    toast(`Projected selection toward ${vpKey.toUpperCase()}`, 'info', 1400);
}

/**
 * Extrude selected fragments into 3D perspective depth toward a vanishing point, vertical, or iso axis.
 */
function extrudeSelection(target, depth = 60) {
    if (!selection.bbox || selection.fragments.length === 0) return;
    if (hasLockedSelectionLayer()) return;
    snapshot();

    const cx = (selection.bbox.minX + selection.bbox.maxX) / 2;
    const cy = (selection.bbox.minY + selection.bbox.maxY) / 2;
    const mapPoint = (pt) => {
        if (target === 'vp3' && perspectiveGrid.mode === 'iso') {
            const rad = (perspectiveGrid.isoAngle * Math.PI) / 180;
            return { x: Math.round(pt.x + Math.cos(rad) * depth), y: Math.round(pt.y - Math.sin(rad) * depth) };
        }
        if (target === 'vp3' && perspectiveGrid.mode !== '3pt') {
            return { x: pt.x, y: Math.round(pt.y + depth) };
        }
        const vp = perspectiveGrid[target] || perspectiveGrid.vp1;
        const cenDist = Math.max(60, Math.hypot(vp.x - cx, vp.y - cy));
        const t = Math.min(0.85, depth / cenDist);
        return {
            x: Math.round(pt.x + (vp.x - pt.x) * t),
            y: Math.round(pt.y + (vp.y - pt.y) * t)
        };
    };

    let added = 0;
    const emit = (layer, pts) => {
        if (pts.length < 2) return;
        if (layer === 'physics') {
            physicsLines.push(pts);
            bumpPhysics();
        } else {
            originalSceneryLines.push(clonePoints(pts));
            sceneryLines.push(pts);
        }
        added++;
    };

    for (const f of selection.fragments) {
        if (!f.points || f.points.length < 2) continue;
        const backPts = f.points.map(mapPoint);
        emit(f.layer, backPts);
        if (symmetryMode) emit(f.layer, backPts.map(p => ({ x: -p.x, y: p.y })));

        const stride = f.points.length <= 8 ? 1 : Math.max(1, Math.floor(f.points.length / 8));
        for (let i = 0; i < f.points.length; i++) {
            if (i === 0 || i === f.points.length - 1 || i % stride === 0) {
                const rib = [{ x: Math.round(f.points[i].x), y: Math.round(f.points[i].y) }, backPts[i]];
                emit(f.layer, rib);
                if (symmetryMode) emit(f.layer, rib.map(p => ({ x: -p.x, y: p.y })));
            }
        }
    }

    bumpTrackVersion();
    updatePreviewBadge();
    updateStatusBar();
    drawMinimap();
    draw();
    toast(`Extruded selection (+${added} strokes)`, 'success', 1600);
}

/**
 * Repeat selected fragments toward a vanishing point with 1/z projective foreshortening.
 */
function arraySelectionTowardVP(vpKey, count = 4, stepPct = 40) {
    if (!selection.bbox || selection.fragments.length === 0) return;
    if (hasLockedSelectionLayer()) return;
    const vp = perspectiveGrid[vpKey] || perspectiveGrid.vp1;
    const r = Math.max(0.08, stepPct / 100);
    snapshot();

    let added = 0;
    for (let k = 1; k < count; k++) {
        const s = 1 / (1 + k * r);
        for (const f of selection.fragments) {
            if (!f.points || f.points.length < 2) continue;
            const copyPts = f.points.map(p => ({
                x: Math.round(vp.x + (p.x - vp.x) * s),
                y: Math.round(vp.y + (p.y - vp.y) * s)
            }));
            const emitLayer = (pts) => {
                if (f.layer === 'physics') { physicsLines.push(pts); bumpPhysics(); }
                else { originalSceneryLines.push(clonePoints(pts)); sceneryLines.push(pts); }
                added++;
            };
            emitLayer(copyPts);
            if (symmetryMode) emitLayer(copyPts.map(p => ({ x: -p.x, y: p.y })));
        }
    }

    bumpTrackVersion();
    updatePreviewBadge();
    updateStatusBar();
    drawMinimap();
    draw();
    toast(`Created ${count - 1} foreshortened copies toward ${vpKey.toUpperCase()} (+${added})`, 'success', 1600);
}

function deleteSelection() {
    if (selection.fragments.length === 0) return;
    if (hasLockedSelectionLayer()) return;
    snapshot();
    removeSelectedFromTrack();
    clearSelection();
    updatePreviewBadge();
    draw();
    toast('Deleted selection.', 'success', 1500);
}

function copySelection() {
    if (selection.fragments.length === 0) return;
    const cx = selection.bbox ? (selection.bbox.minX + selection.bbox.maxX) / 2 : 0;
    const cy = selection.bbox ? (selection.bbox.minY + selection.bbox.maxY) / 2 : 0;
    clipboardFragments = selection.fragments.map(f => ({
        layer: f.layer,
        points: f.points.map(p => ({ x: p.x - cx, y: p.y - cy })),
    }));
    toast('Copied ' + clipboardFragments.length + ' fragment(s).', 'success', 1500);
}

function pasteSelection() {
    if (!clipboardFragments || clipboardFragments.length === 0) return;
    const unlocked = clipboardFragments.filter(f => !(f.layer === 'physics' ? physicsLocked : sceneryLocked));
    if (unlocked.length === 0) {
        toast('Target layer(s) are locked!', 'error', 1500);
        return;
    }
    if (unlocked.length < clipboardFragments.length) {
        toast('Skipped locked layer fragments when pasting.', 'info', 1800);
    }
    snapshot();
    const atX = placementState.active ? placementState.cursor.x : camX;
    const atY = placementState.active ? placementState.cursor.y : camY;
    
    let toPaste = unlocked;
    if (symmetryMode) {
        toPaste = toPaste.concat(unlocked.map(f => ({
            layer: f.layer,
            points: f.points.map(p => ({ x: -p.x, y: p.y }))
        })));
    }

    for (const f of toPaste) {
        const pts = f.points.map(p => ({ x: p.x + atX, y: p.y + atY }));
        if (f.layer === 'physics') { physicsLines.push(pts); bumpPhysics(); }
        else { originalSceneryLines.push(clonePoints(pts)); sceneryLines.push(pts); bumpTrackVersion(); }
    }
    updatePreviewBadge();
    draw();
    toast('Pasted ' + toPaste.length + ' fragment(s).', 'success', 1500);
}

function saveSelectionAsObject() {
    if (selection.fragments.length === 0) { toast('No selection to save.', 'error'); return; }
    const layers = new Set(selection.fragments.map(f => f.layer));
    const layerLabel = layers.size > 1 ? 'Mixed' : (layers.has('physics') ? 'Physics' : 'Scenery');
    const defaultName = layerLabel + ' Object ' + (objects.length + 1);

    const modal = document.getElementById('saveObjectModal');
    const nameInput = document.getElementById('saveObjectNameInput');
    const tagsInput = document.getElementById('saveObjectTagsInput');
    const statsEl = document.getElementById('saveObjectStats');

    if (nameInput) nameInput.value = defaultName;
    if (tagsInput) tagsInput.value = '';
    if (statsEl) {
        statsEl.textContent = `${selection.fragments.length} line fragment(s) · ${layerLabel} layer`;
    }
    if (modal) {
        modal.style.display = 'block';
        if (nameInput) {
            setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
        }
    }
}

function confirmSaveObject() {
    if (selection.fragments.length === 0) {
        toast('No selection to save.', 'error');
        const modal = document.getElementById('saveObjectModal');
        if (modal) modal.style.display = 'none';
        return;
    }
    const nameInput = document.getElementById('saveObjectNameInput');
    const tagsInput = document.getElementById('saveObjectTagsInput');
    const layers = new Set(selection.fragments.map(f => f.layer));
    const layerLabel = layers.size > 1 ? 'Mixed' : (layers.has('physics') ? 'Physics' : 'Scenery');
    const defaultName = layerLabel + ' Object ' + (objects.length + 1);

    const rawName = (nameInput?.value || '').trim() || defaultName;
    const finalName = getUniqueName(rawName);
    const tagsStr = tagsInput?.value || '';
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);

    const result = createObjectFromFragments(finalName, tags, selection.fragments);
    if (result) {
        const modal = document.getElementById('saveObjectModal');
        if (modal) modal.style.display = 'none';
        toast('Saved object "' + finalName + '"', 'success', 2500);
        refreshObjectList();
    }
}

// ==========================================
// OBJECT DATABASE
// ==========================================
const OBJECTS_KEY = 'trackstudio.objects.v1';
let objects = [];
let currentObjView = 'grid';

function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function normalizeObject(o) {
    if (!o || typeof o !== 'object') return null;
    if (!Array.isArray(o.polylines)) return null;
    o.polylines = o.polylines.filter(p => p && Array.isArray(p.points) && p.points.length >= 2 && p.points.every(pt => typeof pt.x === 'number' && typeof pt.y === 'number' && isFinite(pt.x) && isFinite(pt.y)));
    if (o.polylines.length === 0) return null;
    if (typeof o.id !== 'string') o.id = newId();
    if (typeof o.name !== 'string') o.name = 'Unnamed Object';
    if (!Array.isArray(o.tags)) o.tags = [];
    return o;
}

function loadObjects() {
    try {
        const data = localStorage.getItem(OBJECTS_KEY);
        if (!data) { objects = []; return; }
        const parsed = JSON.parse(data);
        objects = (Array.isArray(parsed) ? parsed : []).map(normalizeObject).filter(o => o !== null);
    } catch (e) { console.warn('Failed to load objects', e); objects = []; }
}

function saveObjects() {
    try {
        localStorage.setItem(OBJECTS_KEY, JSON.stringify(objects));
        refreshObjectList();
        return true;
    } catch (e) {
        toast(e.name === 'QuotaExceededError' ? 'Storage full — delete some objects.' : 'Save failed: ' + e.message, 'error', 5000);
        return false;
    }
}

function getUniqueName(base, excludeId) {
    const names = new Set(objects.filter(o => o.id !== excludeId).map(o => o.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(base + ' (' + i + ')')) i++;
    return base + ' (' + i + ')';
}

function createObjectFromFragments(name, tags, fragments) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of fragments) {
        for (const p of f.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
    }
    if (!isFinite(minX)) return null;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const polylines = fragments.map(f => ({
        layer: f.layer,
        points: f.points.map(p => ({ x: p.x - cx, y: p.y - cy })),
    }));

    const obj = {
        id: newId(),
        name: name,
        tags: tags || [],
        createdAt: Date.now(),
        polylines,
        thumbnail: renderObjectThumbnail(polylines),
    };
    objects.push(obj);
    if (!saveObjects()) { objects.pop(); return null; }
    return obj;
}

function renderObjectThumbnail(polylines) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);

    let maxR = 1;
    for (const poly of polylines) {
        for (const p of poly.points) maxR = Math.max(maxR, Math.abs(p.x), Math.abs(p.y));
    }
    const scale = (size * 0.42) / maxR;

    g.translate(size / 2, size / 2);
    g.scale(scale, scale);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    for (const poly of polylines) {
        if (poly.points.length < 2) continue;
        g.strokeStyle = poly.layer === 'physics' ? '#000000' : '#AAAAAA';
        g.lineWidth = 2 / scale;
        g.beginPath();
        g.moveTo(poly.points[0].x, poly.points[0].y);
        for (let i = 1; i < poly.points.length; i++) g.lineTo(poly.points[i].x, poly.points[i].y);
        g.stroke();
    }
    return c.toDataURL('image/png');
}

function refreshObjectList() {
    const list = document.getElementById('objList');
    list.className = 'obj-list ' + currentObjView;
    const searchTerm = (document.getElementById('objSearch').value || '').toLowerCase();
    const layerFilter = document.getElementById('objLayerFilter').value;
    const tagFilter = (document.getElementById('objTagFilter').value || '').toLowerCase();

    let filtered = objects.slice();
    if (searchTerm) filtered = filtered.filter(o => o.name.toLowerCase().indexOf(searchTerm) >= 0);
    if (layerFilter) {
        filtered = filtered.filter(o => {
            const layers = new Set(o.polylines.map(p => p.layer));
            if (layerFilter === 'mixed') return layers.size > 1;
            if (layerFilter === 'physics') return layers.size === 1 && layers.has('physics');
            if (layerFilter === 'scenery') return layers.size === 1 && layers.has('scenery');
            return true;
        });
    }
    if (tagFilter) filtered = filtered.filter(o => o.tags.some(t => t.toLowerCase().indexOf(tagFilter) >= 0));

    list.innerHTML = '';
    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'obj-empty';
        empty.textContent = objects.length === 0 ? 'No objects yet — select something and click "Save as Object".' : 'No objects match your filters.';
        list.appendChild(empty);
    } else {
        for (const obj of filtered) {
            try { list.appendChild(renderObjectItem(obj)); } catch(e) { console.warn('Failed to render object', obj, e); }
        }
    }

    document.getElementById('objCount').textContent = objects.length;
    document.getElementById('objSize').textContent = formatBytes(new Blob([localStorage.getItem(OBJECTS_KEY) || '']).size);
    document.getElementById('objViewToggle').textContent = currentObjView === 'grid' ? 'Grid' : 'List';
}

function renderObjectItem(obj) {
    const item = document.createElement('div');
    item.className = 'obj-item';

    const img = document.createElement('img');
    img.className = 'obj-item-thumb';
    img.src = obj.thumbnail || '';
    img.alt = obj.name;
    item.appendChild(img);

    const main = document.createElement('div');
    main.className = 'obj-item-main';
    const name = document.createElement('div');
    name.className = 'obj-item-name';
    name.textContent = obj.name;
    main.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'obj-item-meta';
    const layers = new Set(obj.polylines.map(p => p.layer));
    const layerLabel = layers.size > 1 ? 'Mixed' : (layers.has('physics') ? 'Physics' : 'Scenery');
    const ptCount = obj.polylines.reduce((n, p) => n + p.points.length, 0);
    meta.textContent = layerLabel + ' · ' + obj.polylines.length + ' poly · ' + ptCount + ' pts';
    main.appendChild(meta);

    if (obj.tags && obj.tags.length) {
        const tags = document.createElement('div');
        tags.className = 'obj-item-tags';
        for (const t of obj.tags) {
            const tag = document.createElement('span');
            tag.className = 'obj-tag';
            tag.textContent = t;
            tags.appendChild(tag);
        }
        main.appendChild(tags);
    }
    item.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'obj-item-actions';
    actions.appendChild(mkActionBtn('Insert', 'accent-btn', () => { startPlacement(obj); }));
    actions.appendChild(mkActionBtn('Edit', 'primary-btn', () => { renameObject(obj); }));
    actions.appendChild(mkActionBtn('Export', 'primary-btn', () => { exportObject(obj); }));
    actions.appendChild(mkActionBtn('Delete', 'danger-btn', () => { deleteObjectWithUndo(obj.id); }));
    item.appendChild(actions);

    return item;
}

function mkActionBtn(label, cls, fn) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
}

function renameObject(obj) {
    const name = window.prompt('Rename object:', obj.name);
    if (name === null || !name.trim()) return;
    const oldName = obj.name;
    const oldTags = obj.tags;
    obj.name = getUniqueName(name.trim(), obj.id);
    const tagsStr = window.prompt('Tags (comma-separated):', (obj.tags || []).join(', '));
    if (tagsStr !== null) obj.tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
    if (!saveObjects()) { obj.name = oldName; obj.tags = oldTags; }
}

function deleteObjectWithUndo(id) {
    const idx = objects.findIndex(o => o.id === id);
    if (idx < 0) return;
    const deleted = objects[idx];
    objects.splice(idx, 1);
    if (!saveObjects()) { objects.splice(idx, 0, deleted); return; }
    showUndoToast('Deleted "' + deleted.name + '"', () => {
        objects.splice(Math.min(idx, objects.length), 0, deleted);
        saveObjects();
    });
}

function exportObject(obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(obj.name) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function sanitizeFilename(n) { return n.replace(/[^a-z0-9\-_ ]/gi, '_').slice(0, 60) || 'object'; }

function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
}

// ==========================================
// OBJECT PLACEMENT
// ==========================================
function startPlacement(obj) {
    placementState.active = true;
    placementState.object = obj;
    placementState.cursor = { x: camX, y: camY };
    document.getElementById('objectsModal').style.display = 'none';
    container.style.cursor = 'crosshair';
    toast('Click canvas to place "' + obj.name + '" — Esc cancels.', 'info', 3000);
    draw();
}

function cancelPlacement() {
    placementState.active = false;
    placementState.object = null;
    applyToolCursor();
    draw();
}

function commitPlacement(atX, atY) {
    if (!placementState.active || !placementState.object) return;
    const obj = placementState.object;
    const unlockedPolys = obj.polylines.filter(p => !(p.layer === 'physics' ? physicsLocked : sceneryLocked));
    if (unlockedPolys.length === 0) {
        toast('Cannot place object: target layer(s) are locked!', 'error', 1500);
        return;
    }
    snapshot();
    
    let toPlace = unlockedPolys;
    if (symmetryMode) {
        toPlace = toPlace.concat(unlockedPolys.map(p => ({
            layer: p.layer,
            points: p.points.map(pt => ({ x: -pt.x, y: pt.y }))
        })));
    }

    for (const poly of toPlace) {
        const pts = poly.points.map(p => ({ x: p.x + atX, y: p.y + atY }));
        if (poly.layer === 'physics') { physicsLines.push(pts); bumpPhysics(); }
        else { originalSceneryLines.push(clonePoints(pts)); sceneryLines.push(pts); bumpTrackVersion(); }
    }
    updatePreviewBadge();
    const name = obj.name;
    cancelPlacement();
    draw();
    toast('Placed "' + name + '"', 'success', 1500);
}

// ==========================================
// RESIZE
// ==========================================
function resizeCanvas() {
    const parentW = canvas.parentElement.clientWidth;
    const parentH = canvas.parentElement.clientHeight;
    if (parentW <= 0 || parentH <= 0) return;
    dpr = window.devicePixelRatio || 1;
    viewW = parentW;
    viewH = parentH;
    canvas.width = Math.round(parentW * dpr);
    canvas.height = Math.round(parentH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
}

// ==========================================
// MOUSE / WORLD COORDS
// ==========================================
function getWorldMouse(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    return { x: camX + mouseX / zoom, y: camY + mouseY / zoom };
}

// ==========================================
// PERSPECTIVE GRID & SNAPPING ENGINE
// ==========================================
let perspHoverSnapPt = null;

function getPerspHorizonFrame() {
    const p1 = perspectiveGrid.vp1;
    const p2 = perspectiveGrid.vp2;
    if (perspectiveGrid.mode === '1pt') {
        return { p1, p2: { x: p1.x + 1, y: p1.y }, dx: 1, dy: 0, len: 900, ux: 1, uy: 0, nx: 0, ny: 1 };
    }
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
        return { p1, p2, dx: 1, dy: 0, len: 1, ux: 1, uy: 0, nx: 0, ny: 1 };
    }
    const ux = dx / len;
    const uy = dy / len;
    return { p1, p2, dx, dy, len, ux, uy, nx: -uy, ny: ux };
}

function getPerspGridSteps() {
    const d = Math.max(6, perspectiveGrid.density || 16);
    if (perspectiveGrid.mode === 'iso') {
        const sx = Math.max(20, Math.round(960 / d));
        const rad = (perspectiveGrid.isoAngle * Math.PI) / 180;
        const k = Math.tan(rad);
        return { d, dTheta: Math.PI / d, vStep: sx, isoSx: sx, isoSy: sx * k, isoK: k };
    }
    const frame = getPerspHorizonFrame();
    const baseSpan = perspectiveGrid.mode === '1pt' ? 960 : Math.max(320, frame.len);
    const vStep = Math.max(30, Math.round(baseSpan / Math.max(4, d * 0.6)));
    return { d, dTheta: Math.PI / d, vStep, frame };
}

function clipInfiniteLineToBox(px, py, dx, dy, minX, maxX, minY, maxY) {
    let t0 = -Infinity, t1 = Infinity;
    const checkBound = (p, d) => {
        if (Math.abs(d) < 1e-9) return p >= 0;
        const r = -p / d;
        if (d > 0) { if (r > t0) t0 = r; }
        else { if (r < t1) t1 = r; }
        return true;
    };
    if (!checkBound(px - minX, dx) || !checkBound(maxX - px, -dx)) return null;
    if (!checkBound(py - minY, dy) || !checkBound(maxY - py, -dy)) return null;
    if (t0 > t1 || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
    return [
        { x: px + t0 * dx, y: py + t0 * dy },
        { x: px + t1 * dx, y: py + t1 * dy }
    ];
}

function closestPointOnInfLine(pt, lx, ly, ux, uy) {
    const t = (pt.x - lx) * ux + (pt.y - ly) * uy;
    const qx = lx + t * ux, qy = ly + t * uy;
    return { x: qx, y: qy, dist: Math.hypot(pt.x - qx, pt.y - qy) };
}

function intersectInfLines(l1, l2) {
    const det = l1.ux * l2.uy - l1.uy * l2.ux;
    if (Math.abs(det) < 1e-6) return null;
    const dx = l2.px - l1.px;
    const dy = l2.py - l1.py;
    const t = (dx * l2.uy - dy * l2.ux) / det;
    return { x: l1.px + t * l1.ux, y: l1.py + t * l1.uy };
}

function getActiveStrokeOrigin() {
    if (appMode === 'auto') return null;
    if ((currentTool === 'line' || currentTool === 'line+') && isDrawing && currentLine.length > 0) {
        return currentLine[currentLine.length - 1];
    }
    if (currentTool === 'tube' && isTubeDrawing && tubeSpine.length > 0) {
        return tubeSpine[tubeSpine.length - 1];
    }
    if (currentTool === 'curve' && curveState === 'setting_end' && curveStart) {
        return curveStart;
    }
    if (currentTool === 'bridge' && bridgeState === 'setting_end' && bridgeStart) {
        return bridgeStart;
    }
    if (currentTool === 'gradient' && isGradDragging && gradStart) {
        return gradStart;
    }
    return null;
}

function snapToPerspGrid(pos) {
    const maxInterDist = 18 / zoom;
    const maxLineDist = 12 / zoom;
    const info = getPerspGridSteps();

    if (perspectiveGrid.mode === 'iso') {
        const { isoSx: sx, isoSy: sy, isoK: k } = info;
        if (sy < 1) return null;
        let bestInter = null;
        let bestInterD = maxInterDist;

        // Check nearby triangular lattice intersections directly
        const colApprox = Math.round(pos.x / sx);
        for (let col = colApprox - 1; col <= colApprox + 1; col++) {
            const vx = col * sx;
            const parity = ((col % 2) + 2) % 2;
            const rowApprox = Math.round(pos.y / sy);
            for (let row = rowApprox - 2; row <= rowApprox + 2; row++) {
                if ((((row % 2) + 2) % 2) !== parity) continue;
                const vy = row * sy;
                const d = Math.hypot(pos.x - vx, pos.y - vy);
                if (d < bestInterD) { bestInterD = d; bestInter = { x: vx, y: vy }; }
            }
        }
        if (bestInter) return { x: Math.round(bestInter.x), y: Math.round(bestInter.y) };

        // Fall back to nearest isometric spoke/vertical line
        const rad = (perspectiveGrid.isoAngle * Math.PI) / 180;
        const cA = Math.cos(rad), sA = Math.sin(rad);
        const candidates = [];
        const vCol = Math.round(pos.x / sx);
        candidates.push({ px: vCol * sx, py: 0, ux: 0, uy: 1 });
        const mPos = Math.round((pos.y - k * pos.x) / (2 * sy));
        candidates.push({ px: 0, py: 2 * mPos * sy, ux: cA, uy: sA });
        const nNeg = Math.round((pos.y + k * pos.x) / (2 * sy));
        candidates.push({ px: 0, py: 2 * nNeg * sy, ux: cA, uy: -sA });

        let bestLinePt = null, bestLineD = maxLineDist;
        for (const ln of candidates) {
            const p = closestPointOnInfLine(pos, ln.px, ln.py, ln.ux, ln.uy);
            if (p.dist < bestLineD) { bestLineD = p.dist; bestLinePt = p; }
        }
        return bestLinePt ? { x: Math.round(bestLinePt.x), y: Math.round(bestLinePt.y) } : null;
    }

    const { dTheta, vStep, frame } = info;
    const families = [];
    const addVpFamily = (vp, famIdx) => {
        const a = Math.atan2(pos.y - vp.y, pos.x - vp.x);
        const idx0 = Math.floor(a / dTheta);
        const lines = [];
        for (const idx of [idx0, idx0 + 1]) {
            const ang = idx * dTheta;
            lines.push({ px: vp.x, py: vp.y, ux: Math.cos(ang), uy: Math.sin(ang), fam: famIdx });
        }
        families.push(lines);
    };

    addVpFamily(perspectiveGrid.vp1, 0);
    if (perspectiveGrid.mode === '2pt' || perspectiveGrid.mode === '3pt') {
        addVpFamily(perspectiveGrid.vp2, 1);
    }
    if (perspectiveGrid.mode === '3pt') {
        addVpFamily(perspectiveGrid.vp3, 2);
    } else if (perspectiveGrid.mode === '1pt') {
        const gx = perspectiveGrid.vp1.x + Math.round((pos.x - perspectiveGrid.vp1.x) / vStep) * vStep;
        const gy = perspectiveGrid.vp1.y + Math.round((pos.y - perspectiveGrid.vp1.y) / vStep) * vStep;
        families.push([{ px: gx, py: 0, ux: 0, uy: 1, fam: 3 }]);
        families.push([{ px: 0, py: gy, ux: 1, uy: 0, fam: 4 }]);
    } else if (perspectiveGrid.mode === '2pt') {
        const midX = (frame.p1.x + frame.p2.x) * 0.5;
        const midY = (frame.p1.y + frame.p2.y) * 0.5;
        const tProj = (pos.x - midX) * frame.ux + (pos.y - midY) * frame.uy;
        const tSnap = Math.round(tProj / vStep) * vStep;
        families.push([{ px: midX + tSnap * frame.ux, py: midY + tSnap * frame.uy, ux: frame.nx, uy: frame.ny, fam: 3 }]);
    }
    // Always include horizon line for intersections
    families.push([{ px: frame.p1.x, py: frame.p1.y, ux: frame.ux, uy: frame.uy, fam: 5 }]);

    let bestInter = null, bestInterD = maxInterDist;
    for (let i = 0; i < families.length; i++) {
        for (let j = i + 1; j < families.length; j++) {
            for (const l1 of families[i]) {
                for (const l2 of families[j]) {
                    const ix = intersectInfLines(l1, l2);
                    if (!ix) continue;
                    const d = Math.hypot(pos.x - ix.x, pos.y - ix.y);
                    if (d < bestInterD) { bestInterD = d; bestInter = ix; }
                }
            }
        }
    }
    if (bestInter) return { x: Math.round(bestInter.x), y: Math.round(bestInter.y) };

    let bestLinePt = null, bestLineD = maxLineDist;
    for (const fam of families) {
        for (const ln of fam) {
            const p = closestPointOnInfLine(pos, ln.px, ln.py, ln.ux, ln.uy);
            if (p.dist < bestLineD) { bestLineD = p.dist; bestLinePt = p; }
        }
    }
    return bestLinePt ? { x: Math.round(bestLinePt.x), y: Math.round(bestLinePt.y) } : null;
}

function snapToPerspAngle(pos, origin) {
    if (!origin) {
        activePerspGuideRay = null;
        return null;
    }
    const vx = pos.x - origin.x;
    const vy = pos.y - origin.y;
    const dist = Math.hypot(vx, vy);
    if (dist < 2) {
        activePerspGuideRay = null;
        return null;
    }

    const axes = [];
    const addVpAxis = (vp, label, key) => {
        const dx = vp.x - origin.x;
        const dy = vp.y - origin.y;
        const l = Math.hypot(dx, dy);
        if (l >= 2) axes.push({ ux: dx / l, uy: dy / l, vp, label, key });
    };

    if (perspectiveGrid.mode === 'iso') {
        const rad = (perspectiveGrid.isoAngle * Math.PI) / 180;
        axes.push({ ux: 0, uy: 1, vp: null, label: 'VERT', key: 'vp3' });
        axes.push({ ux: Math.cos(rad), uy: Math.sin(rad), vp: null, label: `+${perspectiveGrid.isoAngle}°`, key: 'vp1' });
        axes.push({ ux: Math.cos(rad), uy: -Math.sin(rad), vp: null, label: `-${perspectiveGrid.isoAngle}°`, key: 'vp2' });
    } else if (perspectiveGrid.mode === '1pt') {
        addVpAxis(perspectiveGrid.vp1, 'VP1', 'vp1');
        axes.push({ ux: 1, uy: 0, vp: null, label: 'HORIZ', key: 'vp2' });
        axes.push({ ux: 0, uy: 1, vp: null, label: 'VERT', key: 'vp3' });
    } else if (perspectiveGrid.mode === '2pt') {
        addVpAxis(perspectiveGrid.vp1, 'VP1', 'vp1');
        addVpAxis(perspectiveGrid.vp2, 'VP2', 'vp2');
        const frame = getPerspHorizonFrame();
        axes.push({ ux: frame.nx, uy: frame.ny, vp: null, label: 'VERT', key: 'vp3' });
    } else if (perspectiveGrid.mode === '3pt') {
        addVpAxis(perspectiveGrid.vp1, 'VP1', 'vp1');
        addVpAxis(perspectiveGrid.vp2, 'VP2', 'vp2');
        addVpAxis(perspectiveGrid.vp3, 'VP3', 'vp3');
    }

    const lockKey = perspectiveGrid.axisLock || 'auto';
    const candidateAxes = lockKey !== 'auto' ? axes.filter(a => a.key === lockKey) : axes;
    const pool = candidateAxes.length > 0 ? candidateAxes : axes;
    const coneDeg = lockKey !== 'auto' ? 88 : (perspectiveGrid.snapConeDeg || 12);
    let bestAxis = null;
    let bestAngle = (coneDeg * Math.PI) / 180;
    for (const ax of pool) {
        const dot = vx * ax.ux + vy * ax.uy;
        const cross = Math.abs(vx * ax.uy - vy * ax.ux);
        const angle = Math.atan2(cross, Math.abs(dot));
        if (angle < bestAngle) {
            bestAngle = angle;
            bestAxis = { ...ax, proj: dot };
        }
    }

    if (!bestAxis) {
        activePerspGuideRay = null;
        return null;
    }

    const snapped = {
        x: Math.round(origin.x + bestAxis.proj * bestAxis.ux),
        y: Math.round(origin.y + bestAxis.proj * bestAxis.uy)
    };
    activePerspGuideRay = {
        origin: { x: origin.x, y: origin.y },
        target: snapped,
        ux: bestAxis.ux,
        uy: bestAxis.uy,
        vp: bestAxis.vp,
        label: bestAxis.label
    };
    return snapped;
}

function snapToAngleStep(pos, origin, stepDeg) {
    if (!origin || !stepDeg) return null;
    const dx = pos.x - origin.x;
    const dy = pos.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return null;
    const stepRad = (stepDeg * Math.PI) / 180;
    const snappedAng = Math.round(Math.atan2(dy, dx) / stepRad) * stepRad;
    const ux = Math.cos(snappedAng);
    const uy = Math.sin(snappedAng);
    const snapped = {
        x: Math.round(origin.x + dist * ux),
        y: Math.round(origin.y + dist * uy)
    };
    const deg = Math.round((snappedAng * 180) / Math.PI);
    activeAngleGuide = {
        origin: { x: origin.x, y: origin.y },
        target: snapped,
        ux, uy,
        label: `${deg}°`
    };
    return snapped;
}

function snapPoint(pos, isShift, originOverride = null) {
    let snapRadius = 20 / zoom;
    let snapped = { x: pos.x, y: pos.y };
    let closestDist = snapRadius;
    activePerspGuideRay = null;
    activeAngleGuide = null;

    if (isShift) {
        const allLines = physicsLines.concat(sceneryLines);
        for (const poly of allLines) {
            if (poly.length === 0) continue;
            for (const pt of [poly[0], poly[poly.length - 1]]) {
                const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
                if (d < closestDist) { closestDist = d; snapped = { x: pt.x, y: pt.y }; }
            }
        }
        if (closestDist < snapRadius) return snapped;
    }

    if (perspectiveGrid.visible && perspectiveGrid.snapMode !== 'none') {
        if (perspectiveGrid.snapMode === 'angle') {
            const origin = originOverride || getActiveStrokeOrigin();
            const angSnap = snapToPerspAngle(pos, origin);
            if (angSnap) return angSnap;
        } else if (perspectiveGrid.snapMode === 'grid') {
            const gSnap = snapToPerspGrid(pos);
            if (gSnap) return gSnap;
        }
    }

    if (angleLockStep > 0 || isShift) {
        const origin = originOverride || getActiveStrokeOrigin();
        if (origin) {
            const step = angleLockStep > 0 ? angleLockStep : 15;
            const angSnap = snapToAngleStep(pos, origin, step);
            if (angSnap) return angSnap;
        }
    }

    if (document.getElementById('snapToGridToggle').checked) {
        const g = parseInt(document.getElementById('gridSizeSelect').value);
        snapped.x = Math.round(pos.x / g) * g;
        snapped.y = Math.round(pos.y / g) * g;
    }
    return snapped;
}

// ==========================================
// RENDERING
// ==========================================
let drawPending = false;
function draw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => { drawPending = false; render(); });
}

function drawGrid() {
    if (!document.getElementById('gridToggle').checked) return;
    const minX = camX - (viewW / 2) / zoom;
    const maxX = camX + (viewW / 2) / zoom;
    const minY = camY - (viewH / 2) / zoom;
    const maxY = camY + (viewH / 2) / zoom;
    let gSize = parseInt(document.getElementById('gridSizeSelect').value) || 10;
    // Adaptive grid step at low zoom so sub-pixel lines don't saturate or slow down rendering
    while (gSize * zoom < 6) gSize *= 2;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
    for (let x = Math.floor(minX / gSize) * gSize; x <= maxX; x += gSize) { ctx.moveTo(x, minY); ctx.lineTo(x, maxY); }
    for (let y = Math.floor(minY / gSize) * gSize; y <= maxY; y += gSize) { ctx.moveTo(minX, y); ctx.lineTo(maxX, y); }
    ctx.stroke();
}

function drawPerspectiveGrid() {
    if (!perspectiveGrid.visible) return;
    const minX = camX - (viewW / 2) / zoom;
    const maxX = camX + (viewW / 2) / zoom;
    const minY = camY - (viewH / 2) / zoom;
    const maxY = camY + (viewH / 2) / zoom;
    const op = perspectiveGrid.opacity;
    const info = getPerspGridSteps();

    ctx.save();
    ctx.lineWidth = 1 / zoom;

    const strokeRay = (px, py, dx, dy) => {
        const seg = clipInfiniteLineToBox(px, py, dx, dy, minX, maxX, minY, maxY);
        if (seg) {
            ctx.moveTo(seg[0].x, seg[0].y);
            ctx.lineTo(seg[1].x, seg[1].y);
        }
    };

    const lockKey = perspectiveGrid.snapMode === 'angle' ? (perspectiveGrid.axisLock || 'auto') : 'auto';
    const axisAlpha = (key, base) => {
        if (lockKey === 'auto') return base;
        return lockKey === key ? Math.min(0.95, base * 1.35) : base * 0.3;
    };

    if (perspectiveGrid.mode === 'iso') {
        let { isoSx: sx, isoSy: sy, isoK: k } = info;
        while (sx * zoom < 10) { sx *= 2; sy *= 2; }
        if (sy >= 1) {
            const rad = (perspectiveGrid.isoAngle * Math.PI) / 180;
            const cA = Math.cos(rad), sA = Math.sin(rad);

            // Vertical axis lines
            ctx.beginPath();
            ctx.strokeStyle = `rgba(60, 65, 75, ${axisAlpha('vp3', op * 0.45)})`;
            for (let x = Math.floor(minX / sx) * sx; x <= maxX; x += sx) {
                ctx.moveTo(x, minY); ctx.lineTo(x, maxY);
            }
            ctx.stroke();

            // +Angle lines
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 49, 83, ${axisAlpha('vp1', op * 0.65)})`;
            const mMin = Math.floor((Math.min(minY - k * maxX, minY - k * minX)) / (2 * sy)) - 1;
            const mMax = Math.ceil((Math.max(maxY - k * minX, maxY - k * maxX)) / (2 * sy)) + 1;
            for (let m = mMin; m <= mMax; m++) {
                strokeRay(0, 2 * m * sy, cA, sA);
            }
            ctx.stroke();

            // -Angle lines
            ctx.beginPath();
            ctx.strokeStyle = `rgba(204, 119, 34, ${axisAlpha('vp2', op * 0.65)})`;
            const nMin = Math.floor((Math.min(minY + k * minX, minY + k * maxX)) / (2 * sy)) - 1;
            const nMax = Math.ceil((Math.max(maxY + k * maxX, maxY + k * minX)) / (2 * sy)) + 1;
            for (let n = nMin; n <= nMax; n++) {
                strokeRay(0, 2 * n * sy, cA, -sA);
            }
            ctx.stroke();
        }
        ctx.restore();
        return;
    }

    let { d, dTheta, vStep, frame } = info;
    while (vStep * zoom < 10) vStep *= 2;

    // 1. VP1 radial rays (Prussian blue)
    ctx.beginPath();
    ctx.strokeStyle = `rgba(0, 49, 83, ${axisAlpha('vp1', op * 0.65)})`;
    for (let i = 0; i < d; i++) {
        const ang = i * dTheta;
        strokeRay(perspectiveGrid.vp1.x, perspectiveGrid.vp1.y, Math.cos(ang), Math.sin(ang));
    }
    ctx.stroke();

    // 2. VP2 radial rays (2-Pt / 3-Pt, Burnt ochre)
    if (perspectiveGrid.mode === '2pt' || perspectiveGrid.mode === '3pt') {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(204, 119, 34, ${axisAlpha('vp2', op * 0.65)})`;
        for (let i = 0; i < d; i++) {
            const ang = i * dTheta;
            strokeRay(perspectiveGrid.vp2.x, perspectiveGrid.vp2.y, Math.cos(ang), Math.sin(ang));
        }
        ctx.stroke();
    }

    // 3. Third axis: orthogonal grid (1-Pt), verticals (2-Pt), or VP3 rays (3-Pt)
    ctx.beginPath();
    ctx.strokeStyle = `rgba(65, 70, 80, ${axisAlpha('vp3', op * 0.45)})`;
    if (perspectiveGrid.mode === '1pt') {
        const ox = perspectiveGrid.vp1.x, oy = perspectiveGrid.vp1.y;
        const kxMin = Math.floor((minX - ox) / vStep), kxMax = Math.ceil((maxX - ox) / vStep);
        for (let k = kxMin; k <= kxMax; k++) {
            const x = ox + k * vStep;
            ctx.moveTo(x, minY); ctx.lineTo(x, maxY);
        }
        const kyMin = Math.floor((minY - oy) / vStep), kyMax = Math.ceil((maxY - oy) / vStep);
        for (let k = kyMin; k <= kyMax; k++) {
            const y = oy + k * vStep;
            ctx.moveTo(minX, y); ctx.lineTo(maxX, y);
        }
    } else if (perspectiveGrid.mode === '2pt') {
        const midX = (frame.p1.x + frame.p2.x) * 0.5;
        const midY = (frame.p1.y + frame.p2.y) * 0.5;
        const corners = [
            { x: minX, y: minY }, { x: maxX, y: minY },
            { x: minX, y: maxY }, { x: maxX, y: maxY }
        ];
        let tMin = Infinity, tMax = -Infinity;
        for (const c of corners) {
            const t = (c.x - midX) * frame.ux + (c.y - midY) * frame.uy;
            if (t < tMin) tMin = t;
            if (t > tMax) tMax = t;
        }
        const kMin = Math.floor(tMin / vStep), kMax = Math.ceil(tMax / vStep);
        for (let k = kMin; k <= kMax; k++) {
            const t = k * vStep;
            strokeRay(midX + t * frame.ux, midY + t * frame.uy, frame.nx, frame.ny);
        }
    } else if (perspectiveGrid.mode === '3pt') {
        for (let i = 0; i < d; i++) {
            const ang = i * dTheta;
            strokeRay(perspectiveGrid.vp3.x, perspectiveGrid.vp3.y, Math.cos(ang), Math.sin(ang));
        }
    }
    ctx.stroke();

    // 4. Horizon line (subtle dashed)
    const hSeg = clipInfiniteLineToBox(frame.p1.x, frame.p1.y, frame.ux, frame.uy, minX, maxX, minY, maxY);
    if (hSeg) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 49, 83, ${Math.min(0.95, op + 0.25)})`;
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([8 / zoom, 5 / zoom]);
        ctx.moveTo(hSeg[0].x, hSeg[0].y);
        ctx.lineTo(hSeg[1].x, hSeg[1].y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.restore();
}

function drawActivePerspGuide() {
    if (appMode === 'auto') return;

    // Perspective Angle-snap live lock ray highlight
    if (perspectiveGrid.visible && perspectiveGrid.snapMode === 'angle' && activePerspGuideRay) {
        const g = activePerspGuideRay;
        const minX = camX - (viewW / 2) / zoom;
        const maxX = camX + (viewW / 2) / zoom;
        const minY = camY - (viewH / 2) / zoom;
        const maxY = camY + (viewH / 2) / zoom;
        const seg = clipInfiniteLineToBox(g.origin.x, g.origin.y, g.ux, g.uy, minX, maxX, minY, maxY);
        ctx.save();
        if (seg) {
            ctx.strokeStyle = 'rgba(0, 49, 83, 0.55)';
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.beginPath();
            ctx.moveTo(seg[0].x, seg[0].y);
            ctx.lineTo(seg[1].x, seg[1].y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.fillStyle = '#003153';
        ctx.beginPath();
        ctx.arc(g.target.x, g.target.y, 4.5 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `700 ${Math.max(10, Math.round(11 / zoom))}px "JetBrains Mono", monospace`;
        ctx.fillText(g.label, g.target.x + 8 / zoom, g.target.y - 8 / zoom);
        ctx.restore();
    }

    // Standard Ortho / Angle-lock live guide ray
    if (activeAngleGuide) {
        const g = activeAngleGuide;
        const minX = camX - (viewW / 2) / zoom;
        const maxX = camX + (viewW / 2) / zoom;
        const minY = camY - (viewH / 2) / zoom;
        const maxY = camY + (viewH / 2) / zoom;
        const seg = clipInfiniteLineToBox(g.origin.x, g.origin.y, g.ux, g.uy, minX, maxX, minY, maxY);
        ctx.save();
        if (seg) {
            ctx.strokeStyle = 'rgba(232, 93, 53, 0.45)';
            ctx.lineWidth = 1.25 / zoom;
            ctx.setLineDash([5 / zoom, 4 / zoom]);
            ctx.beginPath();
            ctx.moveTo(seg[0].x, seg[0].y);
            ctx.lineTo(seg[1].x, seg[1].y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.fillStyle = '#E85D35';
        ctx.beginPath();
        ctx.arc(g.target.x, g.target.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Perspective Grid-snap hover/rubber-band target reticle
    if (perspectiveGrid.visible && (perspectiveGrid.snapMode === 'grid' || isPickingShadePoint) && perspHoverSnapPt) {
        ctx.save();
        ctx.strokeStyle = isPickingShadePoint ? '#CC7722' : '#003153';
        ctx.lineWidth = 1.75 / zoom;
        ctx.beginPath();
        ctx.arc(perspHoverSnapPt.x, perspHoverSnapPt.y, 5.5 / zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * Render the draggable Shade Source handle on canvas when Perspective Shadow is active or picking.
 */
function drawPerspShadeHandle() {
    if (!isPerspShadowScriptActive() && !isPickingShadePoint) return;
    const x = perspShadePoint.x;
    const y = perspShadePoint.y;
    const isHov = hoveredShadeHandle || dragMode === 'shadePoint';
    const r = 9 / zoom;
    const rayIn = 12 / zoom;
    const rayOut = 19 / zoom;

    ctx.save();
    ctx.strokeStyle = isHov ? '#E85D35' : '#CC7722';
    ctx.fillStyle = isHov ? '#FFF4EA' : '#FFFFFF';
    ctx.lineWidth = (isHov ? 2.6 : 2) / zoom;

    // Sunburst rays around handle
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(x + Math.cos(a) * rayIn, y + Math.sin(a) * rayIn);
        ctx.lineTo(x + Math.cos(a) * rayOut, y + Math.sin(a) * rayOut);
    }
    ctx.stroke();

    // Center sun disc
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isHov ? '#E85D35' : '#CC7722';
    ctx.beginPath();
    ctx.arc(x, y, 3.2 / zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `700 ${Math.max(10, Math.round(11 / zoom))}px "JetBrains Mono", monospace`;
    ctx.fillText(`SHADE (${Math.round(x)}, ${Math.round(y)})`, x + rayOut + 4 / zoom, y - r * 0.6);

    if (isPickingShadePoint && mousePos) {
        const target = (perspectiveGrid.visible && snapToPerspGrid(mousePos)) || snapPoint(mousePos, isShiftDown);
        ctx.strokeStyle = 'rgba(204, 119, 34, 0.75)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.arc(target.x, target.y, 11 / zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

/**
 * Draw a compact floating length & angle HUD near the cursor during active segment drawing.
 */
function drawLiveMeasureBadge() {
    if (appMode === 'auto' || !mousePos) return;
    let origin = null;
    let target = mousePos;
    let prefix = '';

    if (isDrawing && currentLine.length > 0 && (currentTool === 'line' || currentTool === 'line+')) {
        origin = currentLine[currentLine.length - 1];
    } else if (curveState === 'setting_end' && curveStart) {
        origin = curveStart;
        target = curveEnd || mousePos;
        prefix = 'Span ';
    } else if (bridgeState === 'setting_end' && bridgeStart) {
        origin = bridgeStart;
        target = bridgeEnd || mousePos;
    } else if (currentTool === 'tube' && isTubeDrawing && tubeSpine.length > 0) {
        origin = tubeSpine[tubeSpine.length - 1];
    } else if (dragMode === 'gradientDrag' && gradStart) {
        origin = gradStart;
        target = gradEnd || mousePos;
    } else if ((currentTool === 'polygon' || currentTool === 'circle') && shapeState === 'radius') {
        origin = shapeCenter;
        prefix = 'R:';
    }

    if (!origin) return;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const len = Math.round(Math.hypot(dx, dy));
    if (len < 2) return;
    const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    const label = `${prefix}${len}px · ${deg}°`;

    ctx.save();
    const fontSize = 11 / zoom;
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    const padX = 5 / zoom;
    const padY = 3 / zoom;
    const tw = ctx.measureText(label).width;
    const bx = target.x + 12 / zoom;
    const by = target.y + 14 / zoom;
    const bw = tw + padX * 2;
    const bh = 16 / zoom;

    ctx.fillStyle = 'rgba(13, 13, 21, 0.86)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(240, 227, 206, 0.5)';
    ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + padX, by + bh / 2 + padY * 0.1);
    ctx.restore();
}

function getPerspHandleList() {
    if (!perspectiveGrid.visible || !isPerspEditMode || perspectiveGrid.locked || perspectiveGrid.mode === 'iso') {
        return [];
    }
    const handles = [{ id: 'vp1', label: 'VP1', x: perspectiveGrid.vp1.x, y: perspectiveGrid.vp1.y, color: '#003153' }];
    if (perspectiveGrid.mode === '2pt' || perspectiveGrid.mode === '3pt') {
        handles.push({ id: 'vp2', label: 'VP2', x: perspectiveGrid.vp2.x, y: perspectiveGrid.vp2.y, color: '#CC7722' });
        handles.push({
            id: 'horizon',
            label: 'HORIZON',
            x: (perspectiveGrid.vp1.x + perspectiveGrid.vp2.x) * 0.5,
            y: (perspectiveGrid.vp1.y + perspectiveGrid.vp2.y) * 0.5,
            color: '#0D0D15'
        });
    } else if (perspectiveGrid.mode === '1pt') {
        handles.push({
            id: 'horizon',
            label: 'HORIZON',
            x: perspectiveGrid.vp1.x + 140 / zoom,
            y: perspectiveGrid.vp1.y,
            color: '#0D0D15'
        });
    }
    if (perspectiveGrid.mode === '3pt') {
        handles.push({ id: 'vp3', label: 'VP3', x: perspectiveGrid.vp3.x, y: perspectiveGrid.vp3.y, color: '#2A4056' });
    }
    return handles;
}

function drawPerspectiveHandles() {
    const handles = getPerspHandleList();
    if (handles.length === 0) return;

    ctx.save();
    const r = 8 / zoom;
    const arm = 14 / zoom;
    ctx.font = `700 ${Math.max(10, Math.round(11 / zoom))}px "JetBrains Mono", monospace`;

    for (const h of handles) {
        const isHov = (hoveredPerspHandle === h.id || dragPerspHandle === h.id);
        ctx.strokeStyle = isHov ? '#E85D35' : h.color;
        ctx.fillStyle = isHov ? '#FFF5EE' : '#FFFFFF';
        ctx.lineWidth = (isHov ? 2.75 : 2) / zoom;
        if (h.id === 'horizon') {
            ctx.beginPath();
            ctx.moveTo(h.x, h.y - r);
            ctx.lineTo(h.x + r, h.y);
            ctx.lineTo(h.x, h.y + r);
            ctx.lineTo(h.x - r, h.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(h.x - arm, h.y); ctx.lineTo(h.x + arm, h.y);
            ctx.moveTo(h.x, h.y - arm); ctx.lineTo(h.x, h.y + arm);
            ctx.stroke();
        }
        ctx.fillStyle = h.color;
        ctx.fillText(h.label, h.x + r + 5 / zoom, h.y - r);
    }
    ctx.restore();
}

function computeSelectionBoxOutline() {
    const stateStr = JSON.stringify(selectionBoxes) + zoom;
    if (cachedOutline && cachedOutlineState === stateStr) return cachedOutline;
    cachedOutlineState = stateStr;

    const rectsAdd = selectionBoxes.add.map(normalizeBox);
    const rectsSub = selectionBoxes.subtract.map(normalizeBox);
    if (rectsAdd.length === 0) { cachedOutline = { loops: [] }; return cachedOutline; }

    const cellSize = Math.max(1.5, 3 / zoom);
    const region = new Set();
    for (const r of rectsAdd) {
        const cx1 = Math.floor(r.minX / cellSize), cx2 = Math.ceil(r.maxX / cellSize);
        const cy1 = Math.floor(r.minY / cellSize), cy2 = Math.ceil(r.maxY / cellSize);
        for (let cx = cx1; cx < cx2; cx++) for (let cy = cy1; cy < cy2; cy++) region.add(cx + ',' + cy);
    }
    for (const r of rectsSub) {
        const cx1 = Math.floor(r.minX / cellSize), cx2 = Math.ceil(r.maxX / cellSize);
        const cy1 = Math.floor(r.minY / cellSize), cy2 = Math.ceil(r.maxY / cellSize);
        for (let cx = cx1; cx < cx2; cx++) for (let cy = cy1; cy < cy2; cy++) region.delete(cx + ',' + cy);
    }

    const outgoing = new Map();
    for (const key of region) {
        const parts = key.split(',');
        const x = Number(parts[0]), y = Number(parts[1]);
        if (!region.has(x + ',' + (y - 1))) outgoing.set(x + ',' + y, { x: x + 1, y });
        if (!region.has((x + 1) + ',' + y)) outgoing.set((x + 1) + ',' + y, { x: x + 1, y: y + 1 });
        if (!region.has(x + ',' + (y + 1))) outgoing.set((x + 1) + ',' + (y + 1), { x, y: y + 1 });
        if (!region.has((x - 1) + ',' + y)) outgoing.set(x + ',' + (y + 1), { x, y });
    }
    const loops = [];
    const visited = new Set();
    for (const startKey of outgoing.keys()) {
        if (visited.has(startKey)) continue;
        const loop = [];
        let curKey = startKey;
        while (!visited.has(curKey) && outgoing.has(curKey)) {
            visited.add(curKey);
            const parts = curKey.split(',');
            const cx = Number(parts[0]), cy = Number(parts[1]);
            loop.push({ x: cx * cellSize, y: cy * cellSize });
            const n = outgoing.get(curKey);
            curKey = n.x + ',' + n.y;
        }
        if (loop.length >= 3) loops.push(loop);
    }
    cachedOutline = { loops };
    return cachedOutline;
}

function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    if (refImage.img && refImage.visible) {
        const w = refImage.width * refImage.scale;
        const h = refImage.height * refImage.scale;
        const rx = refImage.x - w / 2;
        const ry = refImage.y - h / 2;
        ctx.save();
        ctx.globalAlpha = refImage.opacity;
        ctx.drawImage(refImage.img, rx, ry, w, h);
        if (isRefImgDragMode) {
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = '#E85D35';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.strokeRect(rx, ry, w, h);
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    if (perspectiveGrid.followCamera && (camX !== lastPerspCamX || camY !== lastPerspCamY)) {
        const cdx = camX - lastPerspCamX;
        const cdy = camY - lastPerspCamY;
        perspectiveGrid.vp1.x = Math.round(perspectiveGrid.vp1.x + cdx);
        perspectiveGrid.vp1.y = Math.round(perspectiveGrid.vp1.y + cdy);
        perspectiveGrid.vp2.x = Math.round(perspectiveGrid.vp2.x + cdx);
        perspectiveGrid.vp2.y = Math.round(perspectiveGrid.vp2.y + cdy);
        perspectiveGrid.vp3.x = Math.round(perspectiveGrid.vp3.x + cdx);
        perspectiveGrid.vp3.y = Math.round(perspectiveGrid.vp3.y + cdy);
        if (typeof syncPerspUI === 'function') syncPerspUI();
    }
    lastPerspCamX = camX;
    lastPerspCamY = camY;

    drawGrid();
    drawPerspectiveGrid();

    const useMask = document.getElementById('useMaskToggle').checked;
    for (const [key, color] of maskGrid.entries()) {
        const parts = key.split(',');
        const cx = Number(parts[0]), cy = Number(parts[1]);
        ctx.globalAlpha = (!useMask || activeMaskColors.has(color)) ? 1.0 : 0.2;
        ctx.fillStyle = MASK_COLORS[color];
        ctx.fillRect(cx * maskBinSize, cy * maskBinSize, maskBinSize, maskBinSize);
    }
    ctx.globalAlpha = 1.0;

    // Free Rider HD line parity: base 2.0 world thickness, min 0.5 screen pixels
    const frhdLW = Math.max(2, 0.5 / zoom);
    const sceneryLW = frhdLW;
    const physicsLW = frhdLW;
    const cullPad = frhdLW * 2 + 4 / zoom;
    const vMinX = camX - (viewW / 2) / zoom - cullPad;
    const vMaxX = camX + (viewW / 2) / zoom + cullPad;
    const vMinY = camY - (viewH / 2) / zoom - cullPad;
    const vMaxY = camY + (viewH / 2) / zoom + cullPad;

    const isPreview = sceneryDirty;
    if (sceneryVisible) {
        ctx.save();
        ctx.globalAlpha = sceneryOpacity;
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth = sceneryLW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (isPreview) ctx.setLineDash([6 / zoom, 3 / zoom]);
        for (const poly of sceneryLines) {
            if (poly.length < 2) continue;
            const bb = getPolyBBox(poly);
            if (bb.maxX < vMinX || bb.minX > vMaxX || bb.maxY < vMinY || bb.minY > vMaxY) continue;
            ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }

    if (physicsVisible) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = physicsLW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const poly of physicsLines) {
            if (poly.length < 2) continue;
            const bb = getPolyBBox(poly);
            if (bb.maxX < vMinX || bb.minX > vMaxX || bb.maxY < vMinY || bb.minY > vMaxY) continue;
            ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
            ctx.stroke();
        }
    }

    if (symmetryMode) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth = sceneryLW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const poly of sceneryLines) {
            if (poly.length < 2) continue;
            const bb = getPolyBBox(poly);
            if (-bb.minX < vMinX || -bb.maxX > vMaxX || bb.maxY < vMinY || bb.minY > vMaxY) continue;
            ctx.beginPath(); ctx.moveTo(-poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) ctx.lineTo(-poly[i].x, poly[i].y);
            ctx.stroke();
        }
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = physicsLW;
        for (const poly of physicsLines) {
            if (poly.length < 2) continue;
            const bb = getPolyBBox(poly);
            if (-bb.minX < vMinX || -bb.maxX > vMaxX || bb.maxY < vMinY || bb.minY > vMaxY) continue;
            ctx.beginPath(); ctx.moveTo(-poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) ctx.lineTo(-poly[i].x, poly[i].y);
            ctx.stroke();
        }
        ctx.restore();
    }

    if (document.getElementById('spawnDotToggle')?.checked ?? true) {
        ctx.fillStyle = '#E85D35';
        ctx.beginPath(); ctx.arc(0, 0, 10 / zoom, 0, Math.PI * 2); ctx.fill();
    }

    if (symmetryMode) {
        ctx.strokeStyle = 'rgba(232, 93, 53, 0.75)';
        ctx.lineWidth = Math.max(1.5, 2 / zoom);
        ctx.setLineDash([8 / zoom, 6 / zoom]);
        ctx.beginPath();
        const minY = camY - (viewH / 2) / zoom;
        const maxY = camY + (viewH / 2) / zoom;
        ctx.moveTo(0, minY); ctx.lineTo(0, maxY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.save();
        ctx.fillStyle = 'rgba(232, 93, 53, 0.85)';
        ctx.font = (14 / zoom) + "px 'Cinzel', serif";
        ctx.fillText('mirror', 6 / zoom, camY);
        ctx.restore();
    }

    if (selectionBoxes.add.length > 0 || selDragState) {
        const outline = computeSelectionBoxOutline();
        ctx.save();
        ctx.fillStyle = 'rgba(0, 140, 200, 0.10)';
        ctx.strokeStyle = 'rgba(0, 140, 200, 0.85)';
        ctx.lineWidth = Math.max(1.2, 1.8 / zoom);
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        if (outline.loops) {
            for (const loop of outline.loops) {
                ctx.beginPath();
                ctx.moveTo(loop[0].x, loop[0].y);
                for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i].x, loop[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
        if (selDragState) {
            const dx0 = Math.min(selDragState.x0, selDragState.x1);
            const dx1 = Math.max(selDragState.x0, selDragState.x1);
            const dy0 = Math.min(selDragState.y0, selDragState.y1);
            const dy1 = Math.max(selDragState.y0, selDragState.y1);
            ctx.setLineDash([4 / zoom, 4 / zoom]);
            ctx.strokeStyle = selDragState.mode === 'sub' ? 'rgba(244, 67, 54, 0.9)' : 'rgba(0, 140, 200, 0.9)';
            ctx.beginPath();
            ctx.rect(dx0, dy0, dx1 - dx0, dy1 - dy0);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }

    if (selection.fragments.length > 0) {
        const dx = dragMode === 'moveSelection' ? selMoveDelta.x : 0;
        const dy = dragMode === 'moveSelection' ? selMoveDelta.y : 0;
        ctx.strokeStyle = dragMode === 'moveSelection' ? '#2196F3' : '#E85D35';
        ctx.lineWidth = Math.max(2, 2.5 / zoom);
        ctx.lineCap = 'round';
        for (const frag of selection.fragments) {
            if (frag.points.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(frag.points[0].x + dx, frag.points[0].y + dy);
            for (let i = 1; i < frag.points.length; i++) ctx.lineTo(frag.points[i].x + dx, frag.points[i].y + dy);
            ctx.stroke();
        }
        if (selection.bbox) {
            const b = selection.bbox;
            ctx.strokeStyle = dragMode === 'moveSelection' ? 'rgba(33, 150, 243, 0.75)' : 'rgba(232, 93, 53, 0.6)';
            ctx.lineWidth = 1.2 / zoom;
            ctx.setLineDash([5 / zoom, 4 / zoom]);
            ctx.beginPath();
            ctx.rect(b.minX + dx, b.minY + dy, b.maxX - b.minX, b.maxY - b.minY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    if (placementState.active && placementState.object) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const poly of placementState.object.polylines) {
            if (poly.points.length < 2) continue;
            ctx.strokeStyle = poly.layer === 'physics' ? '#000000' : '#AAAAAA';
            ctx.lineWidth = frhdLW;
            ctx.beginPath();
            ctx.moveTo(poly.points[0].x + placementState.cursor.x, poly.points[0].y + placementState.cursor.y);
            for (let i = 1; i < poly.points.length; i++) {
                ctx.lineTo(poly.points[i].x + placementState.cursor.x, poly.points[i].y + placementState.cursor.y);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    if (selectedVertex) {
        const pt = selectedVertex.poly[selectedVertex.index];
        if (pt) {
            ctx.fillStyle = '#E85D35';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 6 / zoom, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        }
    }

    if (isDrawing && currentLine.length > 0) {
        let renderFrags = [currentLine];
        if (currentTool === 'brush' && currentLine.length <= 800) {
            const lt = document.getElementById('lineType').value;
            if (lt !== 'solid') {
                const s = getPatternSettings(false);
                renderFrags = applyLinePattern(currentLine, s.lineType, s.scale, s.coverage, s.seed);
            }
        }
        ctx.strokeStyle = '#E85D35';
        ctx.lineWidth = 2 / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const frag of renderFrags) {
            if (frag.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(frag[0].x, frag[0].y);
            for (let i = 1; i < frag.length; i++) ctx.lineTo(frag[i].x, frag[i].y);
            ctx.stroke();
        }

        if (symmetryMode && currentLine.length > 0) {
            ctx.globalAlpha = 0.4;
            ctx.setLineDash([4 / zoom, 4 / zoom]);
            ctx.beginPath();
            ctx.moveTo(-currentLine[0].x, currentLine[0].y);
            for (let i = 1; i < currentLine.length; i++) ctx.lineTo(-currentLine[i].x, currentLine[i].y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }

        const last = currentLine[currentLine.length - 1];
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#E85D35';
        for (const pt of currentLine) { ctx.beginPath(); ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2); ctx.fill(); }
    }

    drawShapePreview();
    drawBoxPreview();

    if (appMode !== 'auto' && currentTool === 'eraser' && mousePos) {
        const rWorld = getEraserRadiusWorld();
        ctx.save();
        ctx.strokeStyle = '#E85D35';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, rWorld, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = '#E85D35';
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 2 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    if (appMode !== 'auto' && currentTool === 'rockBrush' && mousePos) {
        ctx.save();
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, rockBrushSize, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 2 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    if (appMode === 'auto' && document.getElementById('maskModeToggle').checked && !dragMode) {
        const size = parseInt(document.getElementById('brushSize').value) / 2;
        ctx.strokeStyle = 'rgba(232, 93, 53, 0.7)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, size, 0, Math.PI * 2);
        ctx.stroke();
    }

    drawCurvePreview();
    drawBridgePreview();
    drawTubePreview();
    drawGradientPreview();
    drawTextPreview();
    drawActivePerspGuide();
    drawPerspectiveHandles();
    drawPerspShadeHandle();
    drawLiveMeasureBadge();
    ctx.restore();

    document.getElementById('statScenery').textContent = sceneryLines.length;
    document.getElementById('statPhysics').textContent = physicsLines.length;
    updateStatusBar();
    drawMinimap();
}

function drawShapePreview() {
    if (shapeState === 'idle') return;
    const sides = currentTool === 'circle'
        ? Math.max(24, Math.floor(shapeRadius / 10))
        : Math.max(3, Math.min(50, parseInt(document.getElementById('polySides').value) || 6));
    ctx.strokeStyle = '#E85D35';
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
        const angle = shapeRotation + (2 * Math.PI * i) / sides - Math.PI / 2;
        const x = shapeCenter.x + Math.cos(angle) * shapeRadius;
        const y = shapeCenter.y + Math.sin(angle) * shapeRadius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (symmetryMode) {
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const angle = shapeRotation + (2 * Math.PI * i) / sides - Math.PI / 2;
            const x = -shapeCenter.x - Math.cos(angle) * shapeRadius;
            const y = shapeCenter.y + Math.sin(angle) * shapeRadius;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
    }
    ctx.fillStyle = '#E85D35';
    ctx.beginPath(); ctx.arc(shapeCenter.x, shapeCenter.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
    if (shapeState === 'radius') {
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.beginPath(); ctx.moveTo(shapeCenter.x, shapeCenter.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke();
        ctx.setLineDash([]);
    }
}

function getPerspAxisVec(pt, kind) {
    if (perspectiveGrid.mode === 'iso') {
        const rad = (perspectiveGrid.isoAngle * Math.PI) / 180;
        if (kind === 'a1') return { ux: Math.cos(rad), uy: -Math.sin(rad) };
        if (kind === 'a2') return { ux: Math.cos(rad), uy: Math.sin(rad) };
        return { ux: 0, uy: 1 };
    }
    if (perspectiveGrid.mode === '1pt') {
        if (kind === 'a1') return { ux: 1, uy: 0 };
        if (kind === 'av') return { ux: 0, uy: 1 };
        const dx = perspectiveGrid.vp1.x - pt.x, dy = perspectiveGrid.vp1.y - pt.y;
        const d = Math.hypot(dx, dy) || 1;
        return { ux: dx / d, uy: dy / d };
    }
    if (kind === 'a1') {
        const dx = perspectiveGrid.vp1.x - pt.x, dy = perspectiveGrid.vp1.y - pt.y;
        const d = Math.hypot(dx, dy) || 1;
        return { ux: dx / d, uy: dy / d };
    }
    if (kind === 'a2') {
        const dx = perspectiveGrid.vp2.x - pt.x, dy = perspectiveGrid.vp2.y - pt.y;
        const d = Math.hypot(dx, dy) || 1;
        return { ux: dx / d, uy: dy / d };
    }
    if (perspectiveGrid.mode === '3pt') {
        const dx = perspectiveGrid.vp3.x - pt.x, dy = perspectiveGrid.vp3.y - pt.y;
        const d = Math.hypot(dx, dy) || 1;
        return { ux: dx / d, uy: dy / d };
    }
    const frame = getPerspHorizonFrame();
    return { ux: frame.nx, uy: frame.ny };
}

function intersectBoxRays(pA, uA, pB, uB, fbX, fbY) {
    const ix = intersectInfLines({ px: pA.x, py: pA.y, ux: uA.ux, uy: uA.uy }, { px: pB.x, py: pB.y, ux: uB.ux, uy: uB.uy });
    if (!ix || Math.hypot(ix.x - pA.x, ix.y - pA.y) > 8000) return { x: fbX, y: fbY };
    return ix;
}

function computeBoxFrontQuad(p0, target) {
    const u1 = getPerspAxisVec(p0, 'a1');
    const uv = getPerspAxisVec(p0, 'av');
    const det = u1.ux * uv.uy - u1.uy * uv.ux;
    if (Math.abs(det) < 1e-4) {
        return [p0, { x: target.x, y: p0.y }, target, { x: p0.x, y: target.y }];
    }
    const dx = target.x - p0.x, dy = target.y - p0.y;
    const s1 = (dx * uv.uy - dy * uv.ux) / det;
    const sv = (u1.ux * dy - u1.uy * dx) / det;
    const p1 = { x: p0.x + s1 * u1.ux, y: p0.y + s1 * u1.uy };
    const p3 = { x: p0.x + sv * uv.ux, y: p0.y + sv * uv.uy };
    const u1p3 = getPerspAxisVec(p3, 'a1');
    const uvp1 = getPerspAxisVec(p1, 'av');
    const p2 = intersectBoxRays(p3, u1p3, p1, uvp1, p1.x + sv * uv.ux, p1.y + sv * uv.uy);
    return [p0, p1, p2, p3];
}

function computeBox3DCorners(frontQuad, cursor) {
    const [p0, p1, p2, p3] = frontQuad;
    const u2 = getPerspAxisVec(p0, 'a2');
    const depth = (cursor.x - p0.x) * u2.ux + (cursor.y - p0.y) * u2.uy;
    const q0 = { x: p0.x + depth * u2.ux, y: p0.y + depth * u2.uy };
    const dx = q0.x - p0.x, dy = q0.y - p0.y;

    const u1q0 = getPerspAxisVec(q0, 'a1');
    const uvp0 = getPerspAxisVec(q0, 'av');
    const u2p1 = getPerspAxisVec(p1, 'a2');
    const u2p2 = getPerspAxisVec(p2, 'a2');
    const u2p3 = getPerspAxisVec(p3, 'a2');

    const q1 = intersectBoxRays(q0, u1q0, p1, u2p1, p1.x + dx, p1.y + dy);
    const q3 = intersectBoxRays(q0, uvp0, p3, u2p3, p3.x + dx, p3.y + dy);
    const uvq1 = getPerspAxisVec(q1, 'av');
    const q2 = intersectBoxRays(q1, uvq1, p2, u2p2, p2.x + dx, p2.y + dy);

    const rnd = (pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y) });
    return [p0, p1, p2, p3, q0, q1, q2, q3].map(rnd);
}

function pointIn2DTriangle(p, a, b, c) {
    const s = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
    const hasNeg = (d1 < -1) || (d2 < -1) || (d3 < -1);
    const hasPos = (d1 > 1) || (d2 > 1) || (d3 > 1);
    return !(hasNeg && hasPos);
}

function getBoxEdges(verts, facesMode) {
    const edgePairs = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    let hiddenIdx = -1;
    if (facesMode === 'exterior') {
        for (let i = 0; i < 8; i++) {
            const p = verts[i];
            let inside = false;
            for (let a = 0; a < 8 && !inside; a++) if (a !== i) {
                for (let b = a + 1; b < 8 && !inside; b++) if (b !== i) {
                    for (let c = b + 1; c < 8 && !inside; c++) if (c !== i) {
                        if (pointIn2DTriangle(p, verts[a], verts[b], verts[c])) inside = true;
                    }
                }
            }
            if (inside) { hiddenIdx = i; break; }
        }
    }
    return edgePairs
        .filter(([a, b]) => hiddenIdx === -1 || (a !== hiddenIdx && b !== hiddenIdx))
        .map(([a, b]) => [verts[a], verts[b]]);
}

function drawBoxPreview() {
    if (currentTool !== 'box' || boxState === 'idle' || !boxAnchor) return;
    ctx.save();
    ctx.strokeStyle = '#E85D35';
    ctx.lineWidth = 2 / zoom;
    ctx.lineCap = 'round';

    const drawQuad = (q, dash) => {
        ctx.setLineDash(dash ? [5 / zoom, 4 / zoom] : []);
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
        ctx.closePath();
        ctx.stroke();
    };

    if (boxState === 'front' && boxFrontQuad) {
        drawQuad(boxFrontQuad, true);
    } else if (boxState === 'depth' && boxFullCorners) {
        const mode = document.getElementById('boxFacesMode')?.value || 'exterior';
        const edges = getBoxEdges(boxFullCorners, mode);
        ctx.setLineDash([]);
        for (const [a, b] of edges) {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
    }
    ctx.fillStyle = '#E85D35';
    ctx.beginPath(); ctx.arc(boxAnchor.x, boxAnchor.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function finalizeBox(altKey) {
    if (!boxFullCorners) { boxState = 'idle'; return; }
    const mode = document.getElementById('boxFacesMode')?.value || 'exterior';
    const rawEdges = getBoxEdges(boxFullCorners, mode);
    const frags = [];
    const settings = getPatternSettings(altKey);
    for (const seg of rawEdges) {
        if (Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y) < 2) continue;
        if (settings.bypass || settings.lineType === 'solid') {
            frags.push(seg);
        } else {
            frags.push(...applyLinePattern(seg, settings.lineType, settings.scale, settings.coverage, settings.seed));
        }
    }
    if (frags.length > 0 && commitFragments(frags)) {
        toast(`Stamped perspective box (+${frags.length} edges)`, 'success', 1400);
    }
    boxState = 'idle';
    boxAnchor = null;
    boxFrontQuad = null;
    boxFullCorners = null;
    draw();
}

function drawCurvePreview() {
    if (curveState === 'idle' || !curveStart) return;
    const steps = parseInt(document.getElementById('curveSegments')?.value) || 16;
    ctx.save();

    if (curveState === 'setting_end' && curveEnd) {
        // Step 1: Choosing End point. Render dashed chord from Start to End
        ctx.strokeStyle = 'rgba(232, 93, 53, 0.6)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(curveStart.x, curveStart.y);
        ctx.lineTo(curveEnd.x, curveEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Start anchor and End cursor anchor
        ctx.fillStyle = '#E85D35';
        ctx.beginPath();
        ctx.arc(curveStart.x, curveStart.y, 4 / zoom, 0, Math.PI * 2);
        ctx.arc(curveEnd.x, curveEnd.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
    } else if (curveState === 'setting_apex' && curveEnd && curveControl) {
        // Step 2: Bending the ramp. Draw tangent arm guides to apex
        ctx.strokeStyle = 'rgba(232, 93, 53, 0.4)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(curveStart.x, curveStart.y);
        ctx.lineTo(curveControl.x, curveControl.y);
        ctx.lineTo(curveEnd.x, curveEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Start and end anchors
        ctx.fillStyle = '#0D0D15';
        ctx.beginPath();
        ctx.arc(curveStart.x, curveStart.y, 4 / zoom, 0, Math.PI * 2);
        ctx.arc(curveEnd.x, curveEnd.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();

        // Apex pull handle
        ctx.fillStyle = '#E85D35';
        ctx.beginPath();
        ctx.arc(curveControl.x, curveControl.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();

        // Smooth Quadratic Bézier Curve preview
        ctx.strokeStyle = '#E85D35';
        ctx.lineWidth = 3 / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const cx = mt * mt * curveStart.x + 2 * mt * t * curveControl.x + t * t * curveEnd.x;
            const cy = mt * mt * curveStart.y + 2 * mt * t * curveControl.y + t * t * curveEnd.y;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function findNearestEndpoint(pos, maxDistWorld) {
    if (!pos) return null;
    let bestDist = maxDistWorld !== undefined ? maxDistWorld : (25 / zoom);
    let best = null;

    const allPolys = [];
    if (physicsVisible) physicsLines.forEach(p => allPolys.push({ poly: p, layer: 'physics' }));
    if (sceneryVisible) sceneryLines.forEach(p => allPolys.push({ poly: p, layer: 'scenery' }));

    for (const item of allPolys) {
        const p = item.poly;
        if (!p || p.length < 2) continue;

        // Start endpoint p[0]
        const dStart = Math.hypot(p[0].x - pos.x, p[0].y - pos.y);
        if (dStart < bestDist) {
            bestDist = dStart;
            const segLen = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
            best = {
                pt: { x: p[0].x, y: p[0].y },
                tangent: { x: (p[0].x - p[1].x) / segLen, y: (p[0].y - p[1].y) / segLen },
                poly: p,
                isStart: true,
                layer: item.layer
            };
        }

        // End endpoint p[p.length - 1]
        const lastIdx = p.length - 1;
        const dEnd = Math.hypot(p[lastIdx].x - pos.x, p[lastIdx].y - pos.y);
        if (dEnd < bestDist) {
            bestDist = dEnd;
            const segLen = Math.hypot(p[lastIdx].x - p[lastIdx - 1].x, p[lastIdx].y - p[lastIdx - 1].y) || 1;
            best = {
                pt: { x: p[lastIdx].x, y: p[lastIdx].y },
                tangent: { x: (p[lastIdx].x - p[lastIdx - 1].x) / segLen, y: (p[lastIdx].y - p[lastIdx - 1].y) / segLen },
                poly: p,
                isStart: false,
                layer: item.layer
            };
        }
    }
    return best;
}

function computeBridgePoints(p0, t0, p1, t1, tension, steps) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return [{ x: Math.round(p0.x), y: Math.round(p0.y) }, { x: Math.round(p1.x), y: Math.round(p1.y) }];

    const chordX = dx / d;
    const chordY = dy / d;

    let v0x = t0 ? t0.x : chordX;
    let v0y = t0 ? t0.y : chordY;
    let v1x = t1 ? t1.x : chordX;
    let v1y = t1 ? t1.y : chordY;

    // Ensure tangents flow along the chord direction (prevent reverse loops)
    if (v0x * chordX + v0y * chordY < -0.05) {
        v0x = -v0x; v0y = -v0y;
    }
    if (v1x * chordX + v1y * chordY < -0.05) {
        v1x = -v1x; v1y = -v1y;
    }

    const scale = d * (tension || 1.0) * 0.5;
    const m0x = v0x * scale, m0y = v0y * scale;
    const m1x = v1x * scale, m1y = v1y * scale;

    const numSteps = Math.max(4, steps || 16);
    const pts = [];
    for (let i = 0; i <= numSteps; i++) {
        const t = i / numSteps;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        const x = h00 * p0.x + h10 * m0x + h01 * p1.x + h11 * m1x;
        const y = h00 * p0.y + h10 * m0y + h01 * p1.y + h11 * m1y;
        pts.push({ x: Math.round(x), y: Math.round(y) });
    }
    return pts;
}

function drawBridgePreview() {
    if (currentTool !== 'bridge') return;
    ctx.save();
    const nearEp = findNearestEndpoint(mousePos, 25 / zoom);

    if (bridgeState === 'idle') {
        if (nearEp) {
            ctx.strokeStyle = '#E85D35';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(nearEp.pt.x, nearEp.pt.y, 8 / zoom, 0, Math.PI * 2);
            ctx.stroke();

            // Tangent guide arrow
            ctx.setLineDash([3 / zoom, 3 / zoom]);
            ctx.beginPath();
            ctx.moveTo(nearEp.pt.x, nearEp.pt.y);
            ctx.lineTo(nearEp.pt.x + nearEp.tangent.x * 25 / zoom, nearEp.pt.y + nearEp.tangent.y * 25 / zoom);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    } else if (bridgeState === 'setting_end' && bridgeStart) {
        // Draw bridge start anchor
        ctx.fillStyle = '#E85D35';
        ctx.beginPath();
        ctx.arc(bridgeStart.x, bridgeStart.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();

        const targetPos = nearEp ? nearEp.pt : mousePos;
        const targetTan = nearEp ? nearEp.tangent : null;

        if (nearEp) {
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2.5 / zoom;
            ctx.beginPath();
            ctx.arc(nearEp.pt.x, nearEp.pt.y, 9 / zoom, 0, Math.PI * 2);
            ctx.stroke();
        }

        const tension = parseFloat(document.getElementById('bridgeTension')?.value) || 1.0;
        const steps = parseInt(document.getElementById('bridgeSteps')?.value) || 16;
        const pts = computeBridgePoints(bridgeStart, bridgeStartTangent, targetPos, targetTan, tension, steps);

        // Dashed preview spline
        ctx.strokeStyle = '#E85D35';
        ctx.lineWidth = 2.5 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
            else ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

function generateTubeWalls(spine, width, jitterAmount, useJitter) {
    if (!spine || spine.length < 2) return { top: [], bottom: [] };
    const denseSpine = [];
    for (let i = 0; i < spine.length - 1; i++) {
        const pA = spine[i], pB = spine[i + 1];
        const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        const sub = Math.max(1, Math.round(dist / 25));
        for (let s = 0; s < sub; s++) {
            const t = s / sub;
            denseSpine.push({
                x: pA.x + (pB.x - pA.x) * t,
                y: pA.y + (pB.y - pA.y) * t
            });
        }
    }
    denseSpine.push(spine[spine.length - 1]);

    const segNormals = [];
    for (let i = 0; i < denseSpine.length - 1; i++) {
        const dx = denseSpine[i + 1].x - denseSpine[i].x;
        const dy = denseSpine[i + 1].y - denseSpine[i].y;
        const len = Math.hypot(dx, dy) || 1;
        segNormals.push({ x: -dy / len, y: dx / len });
    }

    const halfW = (width || 60) / 2;
    const topWall = [];
    const bottomWall = [];

    for (let k = 0; k < denseSpine.length; k++) {
        let nx, ny;
        if (k === 0) {
            nx = segNormals[0].x; ny = segNormals[0].y;
        } else if (k === denseSpine.length - 1) {
            nx = segNormals[segNormals.length - 1].x; ny = segNormals[segNormals.length - 1].y;
        } else {
            const ax = segNormals[k - 1].x + segNormals[k].x;
            const ay = segNormals[k - 1].y + segNormals[k].y;
            const normLen = Math.hypot(ax, ay) || 1;
            nx = ax / normLen; ny = ay / normLen;
        }

        const jitTop = useJitter ? (Math.random() * 2 - 1) * (jitterAmount || 5) : 0;
        const jitBot = useJitter ? (Math.random() * 2 - 1) * (jitterAmount || 5) : 0;
        const wTop = halfW + jitTop;
        const wBot = halfW + jitBot;

        topWall.push({
            x: Math.round(denseSpine[k].x + nx * wTop),
            y: Math.round(denseSpine[k].y + ny * wTop)
        });
        bottomWall.push({
            x: Math.round(denseSpine[k].x - nx * wBot),
            y: Math.round(denseSpine[k].y - ny * wBot)
        });
    }

    return { top: topWall, bottom: bottomWall };
}

function drawTubePreview() {
    if (currentTool !== 'tube' || !isTubeDrawing || tubeSpine.length === 0) return;
    const tempSpine = tubeSpine.slice();
    if (mousePos) tempSpine.push(mousePos);
    if (tempSpine.length < 2) return;

    const width = parseFloat(document.getElementById('tubeWidth')?.value) || 60;
    const walls = generateTubeWalls(tempSpine, width, 0, false);

    ctx.save();
    // Center spine dashed
    ctx.strokeStyle = 'rgba(232, 93, 53, 0.4)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.beginPath();
    for (let i = 0; i < tempSpine.length; i++) {
        if (i === 0) ctx.moveTo(tempSpine[i].x, tempSpine[i].y);
        else ctx.lineTo(tempSpine[i].x, tempSpine[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Nodes
    ctx.fillStyle = '#E85D35';
    for (const pt of tubeSpine) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
    }

    // Walls preview
    ctx.strokeStyle = '#E85D35';
    ctx.lineWidth = 2.5 / zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (walls.top.length >= 2) {
        ctx.beginPath();
        for (let i = 0; i < walls.top.length; i++) {
            if (i === 0) ctx.moveTo(walls.top[i].x, walls.top[i].y);
            else ctx.lineTo(walls.top[i].x, walls.top[i].y);
        }
        ctx.stroke();
    }

    if (walls.bottom.length >= 2) {
        ctx.beginPath();
        for (let i = 0; i < walls.bottom.length; i++) {
            if (i === 0) ctx.moveTo(walls.bottom[i].x, walls.bottom[i].y);
            else ctx.lineTo(walls.bottom[i].x, walls.bottom[i].y);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function bakeTubeWalls(altKey) {
    if (tubeSpine.length < 2) return;
    const width = parseFloat(document.getElementById('tubeWidth')?.value) || 60;
    const useJitter = document.getElementById('tubeJitterToggle')?.checked ?? true;
    const jitter = parseFloat(document.getElementById('tubeJitter')?.value) || 5;
    const walls = generateTubeWalls(tubeSpine, width, jitter, useJitter);
    if (walls.top.length >= 2 && walls.bottom.length >= 2) {
        const topFrags = fragmentPointsWithPattern(walls.top, altKey) || [walls.top];
        const botFrags = fragmentPointsWithPattern(walls.bottom, altKey) || [walls.bottom];
        commitFragments([...topFrags, ...botFrags]);
    }
}

// ==========================================
// MASK LOGIC
// ==========================================
class MaskGrid {
    constructor(physics, binSize) {
        this.binSize = binSize;
        this.solid = new Set();
        for (const poly of physics) {
            for (let i = 0; i < poly.length - 1; i++) {
                const x0 = poly[i].x, y0 = poly[i].y, x1 = poly[i+1].x, y1 = poly[i+1].y;
                const dist = Math.hypot(x1 - x0, y1 - y0);
                const steps = Math.floor(dist / (binSize / 2)) + 1;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
                    this.solid.add(Math.floor(px / binSize) + ',' + Math.floor(py / binSize));
                }
            }
        }
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (const poly of physics) for (const pt of poly) {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        }
        this.startX = Math.floor(minX / binSize) - 2; this.endX = Math.floor(maxX / binSize) + 2;
        this.startY = Math.floor(minY / binSize) - 2; this.endY = Math.floor(maxY / binSize) + 2;
    }
}

function getMaskGrid() {
    if (cachedMaskPhysicsVersion !== physicsVersion) {
        cachedMaskGrid = new MaskGrid(physicsLines, maskBinSize);
        cachedMaskPhysicsVersion = physicsVersion;
    }
    return cachedMaskGrid;
}

function checkMask(px, py) {
    if (!document.getElementById('useMaskToggle').checked || maskGrid.size === 0) return true;
    const cx = Math.floor(px / maskBinSize), cy = Math.floor(py / maskBinSize);
    const c = maskGrid.get(cx + ',' + cy);
    return c !== undefined && activeMaskColors.has(c);
}

function scanlineFloodFill(startX, startY, color) {
    const grid = getMaskGrid();
    const startCx = Math.floor(startX / maskBinSize);
    const startCy = Math.floor(startY / maskBinSize);
    if (grid.solid.has(startCx + ',' + startCy)) return;
    const stack = [[startCx, startCy]];
    const visited = new Set();
    const maxFillCells = 50000;
    while (stack.length > 0) {
        if (visited.size > maxFillCells) { toast("Flood fill exceeded size limit.", 'error'); return; }
        const c = stack.pop();
        const x = c[0], y = c[1];
        if (x < grid.startX || x > grid.endX || y < grid.startY || y > grid.endY) continue;
        const key = x + ',' + y;
        if (visited.has(key) || grid.solid.has(key)) continue;
        let leftX = x;
        while (leftX > grid.startX && !visited.has((leftX - 1) + ',' + y) && !grid.solid.has((leftX - 1) + ',' + y)) leftX--;
        let rightX = x;
        while (rightX < grid.endX && !visited.has((rightX + 1) + ',' + y) && !grid.solid.has((rightX + 1) + ',' + y)) rightX++;
        for (let i = leftX; i <= rightX; i++) {
            const fk = i + ',' + y;
            visited.add(fk);
            if (color === 'eraser') maskGrid.delete(fk); else maskGrid.set(fk, color);
            if (!visited.has(i + ',' + (y - 1)) && !grid.solid.has(i + ',' + (y - 1))) stack.push([i, y - 1]);
            if (!visited.has(i + ',' + (y + 1)) && !grid.solid.has(i + ',' + (y + 1))) stack.push([i, y + 1]);
        }
    }
    draw();
}

function paintMask(worldX, worldY, isClick) {
    const tool = document.getElementById('maskToolSelect').value;
    const color = currentMaskColor;
    if (tool === 'brush') {
        const size = parseInt(document.getElementById('brushSize').value);
        const radius = size / 2;
        const minCx = Math.floor((worldX - radius) / maskBinSize), maxCx = Math.floor((worldX + radius) / maskBinSize);
        const minCy = Math.floor((worldY - radius) / maskBinSize), maxCy = Math.floor((worldY + radius) / maskBinSize);
        for (let cx = minCx; cx <= maxCx; cx++) for (let cy = minCy; cy <= maxCy; cy++) {
            const px = cx * maskBinSize, py = cy * maskBinSize;
            if (Math.hypot(px - worldX, py - worldY) <= radius) {
                const k = cx + ',' + cy;
                if (color === 'eraser') maskGrid.delete(k); else maskGrid.set(k, color);
            }
        }
        draw();
    } else if (tool === 'fill') {
        if (isClick) scanlineFloodFill(worldX, worldY, color);
    }
}

document.querySelectorAll('input[name="maskColor"]').forEach(el => el.addEventListener('change', (e) => { currentMaskColor = e.target.value; saveSettings(); }));
document.querySelectorAll('.mask-filter').forEach(el => el.addEventListener('change', (e) => {
    if (e.target.checked) activeMaskColors.add(e.target.value); else activeMaskColors.delete(e.target.value);
    saveSettings(); draw();
    if (document.getElementById('liveUpdate').checked) executeScript(true);
}));
document.getElementById('maskToolSelect').addEventListener('change', (e) => {
    document.getElementById('toolVal').textContent = e.target.options[e.target.selectedIndex].text;
    updateBrushSizeRow(); saveSettings();
});
document.getElementById('brushSize').addEventListener('input', (e) => { document.getElementById('brushSizeVal').textContent = e.target.value; saveSettings(); });
document.getElementById('clearMaskBtn').addEventListener('click', () => { snapshot(); maskGrid.clear(); draw(); });
document.getElementById('maskModeToggle').addEventListener('change', (e) => {
    if (e.target.checked) container.classList.add('mask-active'); else container.classList.remove('mask-active');
    saveSettings();
});
document.getElementById('useMaskToggle').addEventListener('change', () => { saveSettings(); draw(); if (document.getElementById('liveUpdate').checked) executeScript(true); });

// ==========================================
// GENERATORS
// ==========================================
function deduplicate(scenery, gridSize, threshold) {
    const occupied = new Set(); const result = [];
    for (const poly of scenery) {
        if (poly.length < 2) continue;
        let hits = 0, misses = 0; const sampled = [];
        for (let i = 0; i < poly.length - 1; i++) {
            const p0 = poly[i], p1 = poly[i+1];
            const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const steps = Math.max(1, Math.floor(dist / gridSize));
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const px = p0.x + (p1.x - p0.x) * t, py = p0.y + (p1.y - p0.y) * t;
                const cx = Math.floor(px / gridSize), cy = Math.floor(py / gridSize);
                const key = cx + "," + cy;
                if (occupied.has(key)) hits++; else misses++;
                sampled.push(key);
            }
        }
        const total = hits + misses;
        if (total === 0 || (hits / total) > threshold) continue;
        result.push(poly);
        for (const key of sampled) occupied.add(key);
    }
    return result;
}

function runCleaner(params) {
    if (originalSceneryLines.length === 0) { toast('No original scenery to clean.', 'error'); return; }
    const simplified = originalSceneryLines.map(poly => {
        if (!checkMask(poly[0].x, poly[0].y)) return poly;
        return simplifyRDP(poly, params.simplify);
    });
    sceneryLines = deduplicate(simplified, params.grid, params.overlap);
    sceneryDirty = true; updatePreviewBadge(); draw();
}

function runCircleGen(p) {
    if (physicsLines.length === 0) return;
    const rng = getRNG(p.seed);
    const noiseSeed = p.seed;

    if (p.density <= 0) {
        sceneryLines = p.removegray ? [] : JSON.parse(JSON.stringify(originalSceneryLines));
        sceneryDirty = true; updatePreviewBadge(); draw(); return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const poly of physicsLines) {
        for (const pt of poly) {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        }
    }
    if (!isFinite(minX)) return;

    const pad = 24;
    minX -= pad; maxX += pad;
    minY -= pad; maxY += pad;
    const boxW = maxX - minX, boxH = maxY - minY;
    if (boxW <= 0 || boxH <= 0) return;

    // Adaptive typed-array grid scales smoothly to very large circles without memory bloat
    const maxDim = Math.max(boxW, boxH);
    let binSize = Math.max(2, Math.min(8, Math.ceil(maxDim / 600)));
    while ((Math.ceil(boxW / binSize) * Math.ceil(boxH / binSize)) > 1500000) binSize += 2;
    const cols = Math.ceil(boxW / binSize);
    const rows = Math.ceil(boxH / binSize);
    const totalCells = cols * rows;

    // 0 = unvisited, 1 = solid wall, 2 = exterior air, >=3 = interior component
    const grid = new Uint8Array(totalCells);

    for (const poly of physicsLines) {
        for (let i = 0; i < poly.length - 1; i++) {
            const x0 = poly[i].x - minX, y0 = poly[i].y - minY;
            const x1 = poly[i + 1].x - minX, y1 = poly[i + 1].y - minY;
            const dist = Math.hypot(x1 - x0, y1 - y0);
            const steps = Math.ceil(dist / (binSize * 0.45)) || 1;
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const cx = Math.floor((x0 + (x1 - x0) * t) / binSize);
                const cy = Math.floor((y0 + (y1 - y0) * t) / binSize);
                if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy * cols + cx] = 1;
            }
            // Seal endpoints with 1-cell margin to eliminate diagonal leaks on curved arcs
            for (const pt of [poly[i], poly[i + 1]]) {
                const ecx = Math.floor((pt.x - minX) / binSize);
                const ecy = Math.floor((pt.y - minY) / binSize);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = ecx + dx, ny = ecy + dy;
                        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) grid[ny * cols + nx] = 1;
                    }
                }
            }
        }
    }

    // Flood-fill exterior air starting from padded bounding borders
    const queue = new Int32Array(totalCells);
    let qHead = 0, qTail = 0;
    const seedAir = (cx, cy) => {
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return;
        const idx = cy * cols + cx;
        if (grid[idx] === 0) { grid[idx] = 2; queue[qTail++] = idx; }
    };
    for (let cx = 0; cx < cols; cx++) { seedAir(cx, 0); seedAir(cx, rows - 1); }
    for (let cy = 0; cy < rows; cy++) { seedAir(0, cy); seedAir(cols - 1, cy); }

    while (qHead < qTail) {
        const idx = queue[qHead++];
        const cx = idx % cols, cy = (idx / cols) | 0;
        if (cx > 0 && grid[idx - 1] === 0) { grid[idx - 1] = 2; queue[qTail++] = idx - 1; }
        if (cx + 1 < cols && grid[idx + 1] === 0) { grid[idx + 1] = 2; queue[qTail++] = idx + 1; }
        if (cy > 0 && grid[idx - cols] === 0) { grid[idx - cols] = 2; queue[qTail++] = idx - cols; }
        if (cy + 1 < rows && grid[idx + cols] === 0) { grid[idx + cols] = 2; queue[qTail++] = idx + cols; }
    }

    // Extract enclosed connected regions into typed region descriptors (no string Set allocations)
    const compId = new Int32Array(totalCells);
    const regions = [];
    let nextCompId = 1;

    for (let idx = 0; idx < totalCells; idx++) {
        if (grid[idx] !== 0 || compId[idx] !== 0) continue;
        const cid = nextCompId++;
        compId[idx] = cid;
        qHead = 0; qTail = 0;
        queue[qTail++] = idx;

        let count = 0;
        let sumCx = 0, sumCy = 0;
        let cminX = Infinity, cmaxX = -Infinity, cminY = Infinity, cmaxY = -Infinity;

        while (qHead < qTail) {
            const cur = queue[qHead++];
            const cx = cur % cols, cy = (cur / cols) | 0;
            count++;
            sumCx += cx; sumCy += cy;
            if (cx < cminX) cminX = cx; if (cx > cmaxX) cmaxX = cx;
            if (cy < cminY) cminY = cy; if (cy > cmaxY) cmaxY = cy;

            if (cx > 0 && grid[cur - 1] === 0 && compId[cur - 1] === 0) { compId[cur - 1] = cid; queue[qTail++] = cur - 1; }
            if (cx + 1 < cols && grid[cur + 1] === 0 && compId[cur + 1] === 0) { compId[cur + 1] = cid; queue[qTail++] = cur + 1; }
            if (cy > 0 && grid[cur - cols] === 0 && compId[cur - cols] === 0) { compId[cur - cols] = cid; queue[qTail++] = cur - cols; }
            if (cy + 1 < rows && grid[cur + cols] === 0 && compId[cur + cols] === 0) { compId[cur + cols] = cid; queue[qTail++] = cur + cols; }
        }

        if (count > 20) {
            regions.push({ cid, count, sumCx, sumCy, cminX, cmaxX, cminY, cmaxY });
        }
    }

    const newScenery = [];
    const densityRatio = p.density / 100;
    const basePitch = 24.0 - 20.0 * densityRatio;
    const numArms = p.multi ? 3 : 1;

    for (const reg of regions) {
        const cxWorld = (reg.sumCx / reg.count + 0.5) * binSize + minX;
        const cyWorld = (reg.sumCy / reg.count + 0.5) * binSize + minY;
        if (!checkMask(cxWorld, cyWorld)) continue;

        const w = reg.cmaxX - reg.cminX + 1;
        const h = reg.cmaxY - reg.cminY + 1;
        const areaRatio = reg.count / (w * h);
        const aspectRatio = Math.min(w, h) / Math.max(w, h);
        const score = (areaRatio / (Math.PI / 4)) * aspectRatio * 100;
        if (score < p.circular) continue;

        const maxRadius = Math.max(w, h) * binSize * 0.55;
        // Scale spiral pitch & noise frequency gently for large circles so entire radius fills cleanly
        const sizeScale = Math.max(1, Math.sqrt(Math.max(1, maxRadius / 180)));
        const pitch = basePitch * sizeScale;
        const noiseScale = 0.03 / sizeScale;
        const arcStep = Math.max(1.5, Math.min(8.0, maxRadius / 85));

        for (let arm = 0; arm < numArms; arm++) {
            const thetaStart = (2 * Math.PI / numArms) * arm;
            for (let tIdx = 0; tIdx < p.thickness; tIdx++) {
                const thickOff = (tIdx - (p.thickness - 1) / 2.0) * 2.5 * Math.min(2.0, sizeScale);
                let pts = [];
                let t = thetaStart;
                let iter = 0;
                const maxIter = 120000;
                while (iter++ < maxIter) {
                    const baseR = (pitch / (2 * Math.PI)) * (t - thetaStart) + thickOff;
                    if (baseR > maxRadius * 1.2) break;
                    if (baseR < 0) { t += arcStep / 5.0; continue; }
                    const baseX = cxWorld + Math.cos(t) * baseR;
                    const baseY = cyWorld + Math.sin(t) * baseR;
                    const aw = (fbm(baseX * noiseScale * 1.5, baseY * noiseScale * 1.5, noiseSeed) - 0.5) * 0.4;
                    const tW = t + aw;
                    const nV = fbm(baseX * noiseScale, baseY * noiseScale, noiseSeed) - 0.5;
                    let amp = pitch * 1.5;
                    if (p.falloff) amp *= (1.0 + (1.0 - (baseR / maxRadius)) * 1.5);
                    const r = baseR + nV * amp;
                    const x = cxWorld + Math.cos(tW) * r;
                    const y = cyWorld + Math.sin(tW) * r;
                    const gx = Math.floor((x - minX) / binSize);
                    const gy = Math.floor((y - minY) / binSize);
                    if (gx >= 0 && gx < cols && gy >= 0 && gy < rows && compId[gy * cols + gx] === reg.cid) {
                        pts.push({ x, y });
                    } else {
                        if (pts.length >= 3) newScenery.push(pts);
                        pts = [];
                    }
                    t += arcStep / Math.max(r, 5.0);
                }
                if (pts.length >= 3) newScenery.push(pts);
            }
        }
    }

    const finalLines = [];
    for (const line of newScenery) {
        let segments = [line];
        if (p.organic) {
            segments = [];
            let drawing = true, remaining = randomUniform(rng, 10, 35);
            let cur = [line[0]];
            for (let i = 0; i < line.length - 1; i++) {
                const p0 = line[i], p1 = line[i + 1];
                const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
                let u = 0;
                while (u < segLen - 1e-9) {
                    const step = Math.min(remaining, segLen - u);
                    u += step;
                    const px = p0.x + (p1.x - p0.x) * (u / segLen);
                    const py = p0.y + (p1.y - p0.y) * (u / segLen);
                    if (drawing) cur.push({ x: px, y: py });
                    remaining -= step;
                    if (remaining <= 1e-9) {
                        if (drawing) {
                            if (cur.length >= 2 && rng() > 0.3) segments.push(cur);
                            drawing = false; remaining = randomUniform(rng, 5, 15);
                        } else {
                            drawing = true; cur = [{ x: px, y: py }]; remaining = randomUniform(rng, 10, 35);
                        }
                    }
                }
            }
            if (drawing && cur.length >= 2 && rng() > 0.3) segments.push(cur);
        }
        if (p.jitter) {
            for (const seg of segments) {
                finalLines.push(seg);
                finalLines.push(seg.map(pt => ({ x: pt.x + randomUniform(rng, -1, 1), y: pt.y + randomUniform(rng, -1, 1) })));
            }
        } else finalLines.push.apply(finalLines, segments);
    }

    if (!p.removegray) sceneryLines = originalSceneryLines.concat(finalLines);
    else sceneryLines = finalLines;
    sceneryDirty = true; updatePreviewBadge(); draw();
}

class EnclosureGrid {
    constructor(physics, binSize) {
        this.binSize = binSize;
        this.solid = new Set();
        this.air = new Set();
        for (const poly of physics) {
            for (let i = 0; i < poly.length - 1; i++) {
                const x0 = poly[i].x, y0 = poly[i].y, x1 = poly[i+1].x, y1 = poly[i+1].y;
                const dist = Math.hypot(x1 - x0, y1 - y0);
                const steps = Math.floor(dist / (binSize / 2)) + 1;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
                    this.solid.add(Math.floor(px / binSize) + ',' + Math.floor(py / binSize));
                }
            }
        }
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (const poly of physics) for (const pt of poly) {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        }
        this.startX = Math.floor(minX / binSize) - 2; this.endX = Math.floor(maxX / binSize) + 2;
        this.startY = Math.floor(minY / binSize) - 2; this.endY = Math.floor(maxY / binSize) + 2;
        let queue = []; let head = 0;
        for (let x = this.startX; x <= this.endX; x++) { queue.push([x, this.startY]); queue.push([x, this.endY]); }
        for (let y = this.startY; y <= this.endY; y++) { queue.push([this.startX, y]); queue.push([this.endX, y]); }
        this._floodFill(queue);
        const spawnKey = '0,0';
        if (!this.solid.has(spawnKey) && !this.air.has(spawnKey)) this._floodFill([[0, 0]]);
    }
    _floodFill(queue) {
        let head = 0;
        while (head < queue.length) {
            const c = queue[head++]; const cx = c[0], cy = c[1]; const k = cx + ',' + cy;
            if (this.solid.has(k) || this.air.has(k)) continue;
            this.air.add(k);
            if (cx + 1 <= this.endX) queue.push([cx + 1, cy]);
            if (cx - 1 >= this.startX) queue.push([cx - 1, cy]);
            if (cy + 1 <= this.endY) queue.push([cx, cy + 1]);
            if (cy - 1 >= this.startY) queue.push([cx, cy - 1]);
        }
    }
    isEnclosed(px, py) {
        const cx = Math.floor(px / this.binSize), cy = Math.floor(py / this.binSize);
        const k = cx + ',' + cy;
        return !this.solid.has(k) && !this.air.has(k);
    }
}

function runCaveGen(p) {
    if (physicsLines.length === 0) return;
    const grid = new EnclosureGrid(physicsLines, maskBinSize);
    const densityRatio = p.density / 100.0;
    const scale = 0.02;
    const step = 20.0 - 16.0 * densityRatio;
    const noiseThreshold = 1.0 - densityRatio;
    const spawnProb = densityRatio;

    if (p.density <= 0) {
        sceneryLines = p.removegray ? [] : JSON.parse(JSON.stringify(originalSceneryLines));
        sceneryDirty = true; updatePreviewBadge(); draw(); return;
    }

    const rng = getRNG(p.seed);
    const noiseSeed = p.seed;
    const newScenery = [];
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const poly of physicsLines) for (const pt of poly) {
        if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    }
    const half = step / 2.0;
    for (let gx = Math.floor(minX); gx <= maxX; gx += step) for (let gy = Math.floor(minY); gy <= maxY; gy += step) {
        const px = gx + randomUniform(rng, -half, half);
        const py = gy + randomUniform(rng, -half, half);
        if (!grid.isEnclosed(px, py)) continue;
        if (!checkMask(px, py)) continue;
        const n = fbm(px * scale, py * scale, noiseSeed);
        if (n > noiseThreshold && rng() < spawnProb) {
            const pts = [{ x: px, y: py }];
            let x = px, y = py;
            const maxSteps = randInt(rng, 5, 10 + Math.floor(30 * densityRatio));
            const maxLen = randomUniform(rng, 40.0, 40.0 + 160.0 * densityRatio);
            for (let i = 0; i < maxSteps; i++) {
                let angle = getGradient(x, y, noiseSeed, scale);
                angle += randomUniform(rng, -0.3, 0.3);
                const stepSize = randomUniform(rng, 4.0, 8.0);
                const nx = x + Math.cos(angle) * stepSize;
                const ny = y + Math.sin(angle) * stepSize;
                if (!grid.isEnclosed(nx, ny) || !checkMask(nx, ny)) {
                    let lowX = x, lowY = y, highX = nx, highY = ny;
                    for (let b = 0; b < 4; b++) {
                        const midX = (lowX + highX) / 2, midY = (lowY + highY) / 2;
                        if (grid.isEnclosed(midX, midY) && checkMask(midX, midY)) { lowX = midX; lowY = midY; }
                        else { highX = midX; highY = midY; }
                    }
                    pts.push({ x: lowX, y: lowY });
                    break;
                }
                x = nx; y = ny;
                pts.push({ x, y });
                if (Math.hypot(x - px, y - py) > maxLen) break;
            }
            if (pts.length >= 3) {
                for (let j = 0; j < 2; j++) {
                    newScenery.push(pts.map(pt => ({ x: pt.x + randomUniform(rng, -1.5, 1.5), y: pt.y + randomUniform(rng, -1.5, 1.5) })));
                }
            }
        }
    }
    if (!p.removegray) sceneryLines = originalSceneryLines.concat(newScenery);
    else sceneryLines = newScenery;
    sceneryDirty = true; updatePreviewBadge(); draw();
}

// ==========================================
// SCRIPT CONFIG
// ==========================================
const scriptConfig = {
    cleaner: { name: "Texture Cleaner", params: { simplify: { type: "range", min: 0, max: 2, step: 0.1, value: 0.5, label: "Simplify Tolerance" }, overlap: { type: "range", min: 0, max: 1, step: 0.05, value: 0.6, label: "Overlap Threshold" }, grid: { type: "range", min: 1, max: 10, step: 1, value: 4, label: "Grid Size" } }, run: runCleaner },
    circle: { name: "Circle Generator", params: { seed: { type: "range", min: 1, max: 100, step: 1, value: 42, label: "Seed" }, circular: { type: "range", min: 0, max: 100, step: 1, value: 80, label: "Circularity" }, density: { type: "range", min: 0, max: 100, step: 1, value: 60, label: "Density" }, thickness: { type: "range", min: 1, max: 8, step: 1, value: 4, label: "Thickness" }, multi: { type: "checkbox", value: true, label: "Multi-Arm" }, falloff: { type: "checkbox", value: true, label: "Density Falloff" }, organic: { type: "checkbox", value: true, label: "Organic Dashes" }, jitter: { type: "checkbox", value: true, label: "Line Jitter" }, removegray: { type: "checkbox", value: false, label: "Remove Existing Scenery" } }, run: runCircleGen },
    cave: { name: "Cave Generator", params: { seed: { type: "range", min: 1, max: 100, step: 1, value: 42, label: "Seed" }, density: { type: "range", min: 0, max: 100, step: 1, value: 60, label: "Density" }, removegray: { type: "checkbox", value: false, label: "Remove Existing Scenery" } }, run: runCaveGen },
    edgeShadow: {
        name: "Edge-Hugging Shadow",
        params: {
            seed: { type: "range", min: 1, max: 500, step: 1, value: 42, label: "Seed" },
            style: { type: "select", value: "stipple", label: "Shadow Style", options: [{ value: "stipple", label: "Stipple Grain" }, { value: "broken", label: "Broken Contours" }, { value: "hatch", label: "Hatch Falloff" }] },
            depth: { type: "range", min: 15, max: 200, step: 5, value: 65, label: "Shadow Depth (px)" },
            density: { type: "range", min: 10, max: 100, step: 5, value: 70, label: "Density (%)" },
            topBias: { type: "checkbox", value: true, label: "Overhang / Ceiling Bias" },
            removegray: { type: "checkbox", value: false, label: "Remove Existing Scenery" }
        },
        run: runEdgeShadowGen
    },
    perspShadow: {
        name: "Perspective Shadow",
        params: {
            originPoint: { type: "point", label: "Shade Source Point" },
            shadowMode: {
                type: "select", value: "cast", label: "Shadow Behavior",
                options: [
                    { value: "cast", label: "Cast Shadows (Ray Occlusion)" },
                    { value: "surface", label: "Surface Shade (Inward Terrain)" },
                    { value: "combined", label: "Combined (Cast + Surface)" }
                ]
            },
            axisMode: {
                type: "select", value: "auto", label: "Perspective Direction",
                options: [
                    { value: "auto", label: "Auto (From Grid + Point)" },
                    { value: "radial", label: "Radial (From Point)" },
                    { value: "vp1", label: "Converge Along VP1" },
                    { value: "vp2", label: "Converge Along VP2" },
                    { value: "vp3", label: "Vertical / VP3" },
                    { value: "iso", label: "Isometric Axis" }
                ]
            },
            style: {
                type: "select", value: "hatch", label: "Shadow Style",
                options: [
                    { value: "hatch", label: "Perspective Hatch" },
                    { value: "broken", label: "Broken Contours" },
                    { value: "stipple", label: "Stipple Grain" }
                ]
            },
            length: { type: "range", min: 20, max: 500, step: 10, value: 180, label: "Shadow Length (px)" },
            density: { type: "range", min: 10, max: 100, step: 5, value: 70, label: "Density (%)" },
            falloff: { type: "range", min: 0, max: 100, step: 5, value: 55, label: "Soft Falloff (%)" },
            seed: { type: "range", min: 1, max: 500, step: 1, value: 42, label: "Seed" },
            includeScenery: { type: "checkbox", value: false, label: "Cast From Scenery Too" },
            selectionOnly: { type: "checkbox", value: false, label: "Selection Only (If Selected)" },
            removegray: { type: "checkbox", value: false, label: "Remove Existing Scenery" }
        },
        run: runPerspShadowGen
    },
    vectorizer: {
        name: "Image Vectorizer",
        params: {
            style: { type: "select", value: "edges", label: "Vector Style", options: [{ value: "edges", label: "Edge Contours" }, { value: "hatch", label: "Brightness Hatching" }, { value: "both", label: "Contours + Hatching" }] },
            threshold: { type: "range", min: 20, max: 235, step: 5, value: 120, label: "Contrast Threshold" },
            spacing: { type: "range", min: 3, max: 20, step: 1, value: 6, label: "Detail / Scan Spacing" },
            simplify: { type: "range", min: 0.5, max: 8.0, step: 0.5, value: 2.0, label: "Simplification (RDP)" },
            removegray: { type: "checkbox", value: false, label: "Replace Existing Scenery" }
        },
        run: runImageVectorizer
    },
    rollers: {
        name: "Rhythm Rollers Generator",
        params: {
            seed: { type: "range", min: 1, max: 1000, step: 1, value: 42, label: "Seed" },
            length: { type: "range", min: 400, max: 5000, step: 100, value: 2000, label: "Total Length (px)" },
            wavelength: { type: "range", min: 120, max: 800, step: 20, value: 320, label: "Roller Wavelength" },
            amplitude: { type: "range", min: 20, max: 200, step: 5, value: 65, label: "Roller Height (Amplitude)" },
            randomizer: { type: "range", min: 0, max: 100, step: 5, value: 70, label: "Randomizer Variation (%)" },
            slope: { type: "range", min: -20, max: 20, step: 1, value: 0, label: "Track Incline (%)" },
            scenery: { type: "checkbox", value: false, label: "Generate as Scenery Layer" }
        },
        run: runRollersGen
    },
    rocks: {
        name: "Rock Cluster Generator",
        params: {
            genType: {
                type: "select", value: "weatheredGranite", label: "Rock Formation Style",
                options: [
                    { value: "weatheredGranite", label: "Weathered Granite (Reference Match: Spires, Slabs & Monoliths)" },
                    { value: "whalebackSpline", label: "Hybrid Whaleback & Spline (Curved Ramps & Asymmetric Domes)" },
                    { value: "splineCurvature", label: "Compound Bezier Splines (Inflected Curves & Varying Curvature)" },
                    { value: "asymmLame", label: "Asymmetric Superellipses (Lamé Power Curves)" },
                    { value: "whaleback", label: "Whaleback & Roche Moutonnée (Glaciated Outcrops)" },
                    { value: "deepHarmonics", label: "Multi-Harmonic Polar Cam (High-Amplitude Lobes)" },
                    { value: "harmonicField", label: "Harmonic Topographic Field (Continuous Ridge)" }
                ]
            },
            rockCount: { type: "range", min: 10, max: 120, step: 5, value: 48, label: "Rock Count" },
            clusterWidth: { type: "range", min: 300, max: 3000, step: 50, value: 1200, label: "Cluster Width (px)" },
            peakHeight: { type: "range", min: 50, max: 600, step: 10, value: 260, label: "Peak Height (px)" },
            roughness: { type: "range", min: 0, max: 1, step: 0.05, value: 0.35, label: "Rock Roughness" },
            pebbleRatio: { type: "range", min: 0, max: 80, step: 5, value: 0, label: "Pebble / Scree (%)" },
            creases: { type: "checkbox", value: false, label: "3D Facets & Creases" },
            layerTarget: {
                type: "select", value: "scenery", label: "Target Layer",
                options: [
                    { value: "scenery", label: "Scenery Layer (Decoration)" },
                    { value: "physics", label: "Physics Layer (Rideable Outcrop)" }
                ]
            },
            seed: { type: "range", min: 1, max: 1000, step: 1, value: 42, label: "Seed" },
            removegray: { type: "checkbox", value: false, label: "Remove Existing Scenery" }
        },
        run: runRockClusterGen
    }
};

function runEdgeShadowGen(p) {
    if (physicsLines.length === 0) return;
    const rng = getRNG(p.seed || 42);
    const depth = Math.max(15, p.depth || 65);
    const densityRatio = Math.max(0.05, Math.min(1.0, (p.density || 70) / 100));
    const style = p.style || 'stipple';
    const topBias = !!p.topBias;

    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const poly of physicsLines) {
        for (const pt of poly) {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        }
    }
    const pad = 20;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const w = maxX - minX, h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    let bin = Math.max(3, Math.min(6, Math.ceil(Math.max(w, h) / 480)));
    while ((Math.ceil(w / bin) * Math.ceil(h / bin)) > 900000) bin += 1;
    const cols = Math.ceil(w / bin);
    const rows = Math.ceil(h / bin);
    const total = cols * rows;

    const state = new Uint8Array(total); // 0=unknown/interior, 1=wall, 2=air
    const dist = new Int16Array(total);
    dist.fill(-1);

    // 1. Rasterize physics walls
    for (const poly of physicsLines) {
        for (let i = 0; i < poly.length - 1; i++) {
            const x0 = poly[i].x - minX, y0 = poly[i].y - minY;
            const x1 = poly[i + 1].x - minX, y1 = poly[i + 1].y - minY;
            const segLen = Math.hypot(x1 - x0, y1 - y0);
            const steps = Math.ceil(segLen / (bin * 0.5)) || 1;
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const cx = Math.floor((x0 + (x1 - x0) * t) / bin);
                const cy = Math.floor((y0 + (y1 - y0) * t) / bin);
                if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
                    const idx = cy * cols + cx;
                    state[idx] = 1;
                    dist[idx] = 0;
                }
            }
        }
    }

    // 2. Flood-fill exterior air from borders + spawn (0,0)
    const queue = new Int32Array(total);
    let qHead = 0, qTail = 0;
    const seedAir = (cx, cy) => {
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return;
        const idx = cy * cols + cx;
        if (state[idx] === 0) { state[idx] = 2; queue[qTail++] = idx; }
    };
    for (let cx = 0; cx < cols; cx++) { seedAir(cx, 0); seedAir(cx, rows - 1); }
    for (let cy = 0; cy < rows; cy++) { seedAir(0, cy); seedAir(cols - 1, cy); }
    seedAir(Math.floor((0 - minX) / bin), Math.floor((0 - minY) / bin));

    while (qHead < qTail) {
        const idx = queue[qHead++];
        const cx = idx % cols, cy = (idx / cols) | 0;
        if (cx > 0 && state[idx - 1] === 0) { state[idx - 1] = 2; queue[qTail++] = idx - 1; }
        if (cx + 1 < cols && state[idx + 1] === 0) { state[idx + 1] = 2; queue[qTail++] = idx + 1; }
        if (cy > 0 && state[idx - cols] === 0) { state[idx - cols] = 2; queue[qTail++] = idx - cols; }
        if (cy + 1 < rows && state[idx + cols] === 0) { state[idx + cols] = 2; queue[qTail++] = idx + cols; }
    }

    // 3. Multi-source BFS inward from walls to build distance field (also track nearest wall Y for overhang bias)
    const wallSrcY = new Int16Array(total);
    qHead = 0; qTail = 0;
    for (let idx = 0; idx < total; idx++) {
        if (state[idx] === 1) {
            queue[qTail++] = idx;
            wallSrcY[idx] = (idx / cols) | 0;
        }
    }
    const maxCells = Math.ceil(depth / bin) + 1;
    while (qHead < qTail) {
        const idx = queue[qHead++];
        const dNext = dist[idx] + 1;
        if (dNext > maxCells) continue;
        const cx = idx % cols, cy = (idx / cols) | 0;
        const srcY = wallSrcY[idx];
        const checkNbr = (nIdx) => {
            if (state[nIdx] === 0 && dist[nIdx] === -1) {
                dist[nIdx] = dNext;
                wallSrcY[nIdx] = srcY;
                queue[qTail++] = nIdx;
            }
        };
        if (cx > 0) checkNbr(idx - 1);
        if (cx + 1 < cols) checkNbr(idx + 1);
        if (cy > 0) checkNbr(idx - cols);
        if (cy + 1 < rows) checkNbr(idx + cols);
    }

    const newLines = [];
    const evalCellStrength = (idx, cx, cy) => {
        if (state[idx] !== 0 || dist[idx] <= 0) return 0;
        const dWorld = dist[idx] * bin;
        let localDepth = depth;
        if (topBias) {
            const dyFromWall = cy - wallSrcY[idx];
            // Hanging downward below a ceiling gets deeper shadow
            localDepth *= dyFromWall > 0 ? 1.25 : 0.65;
        }
        if (dWorld > localDepth) return 0;
        const t = dWorld / localDepth;
        return Math.pow(1 - t, 1.45) * densityRatio;
    };

    if (style === 'stipple') {
        const step = Math.max(4, Math.round(9 - densityRatio * 4));
        for (let wy = minY + bin; wy < maxY - bin; wy += step) {
            for (let wx = minX + bin; wx < maxX - bin; wx += step) {
                const jx = wx + (rng() - 0.5) * step;
                const jy = wy + (rng() - 0.5) * step;
                const cx = Math.floor((jx - minX) / bin);
                const cy = Math.floor((jy - minY) / bin);
                if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
                const s = evalCellStrength(cy * cols + cx, cx, cy);
                if (s <= 0.02 || !checkMask(jx, jy)) continue;
                if (rng() < s) {
                    const ang = rng() * Math.PI * 2;
                    const len = 1.5 + rng() * 3.5 * s;
                    newLines.push([
                        { x: Math.round(jx), y: Math.round(jy) },
                        { x: Math.round(jx + Math.cos(ang) * len), y: Math.round(jy + Math.sin(ang) * len) }
                    ]);
                }
            }
        }
    } else if (style === 'broken') {
        // Broken contour bands along fixed inward distance rings
        const ringStep = Math.max(4, Math.round(12 - densityRatio * 6));
        const angle = -Math.PI / 6;
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        for (let wy = minY; wy <= maxY; wy += ringStep) {
            let cur = [];
            for (let wx = minX; wx <= maxX; wx += 4) {
                const cx = Math.floor((wx - minX) / bin);
                const cy = Math.floor((wy - minY) / bin);
                if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
                    if (cur.length >= 2) newLines.push(cur);
                    cur = [];
                    continue;
                }
                const s = evalCellStrength(cy * cols + cx, cx, cy);
                const n = fbm(wx * 0.04, wy * 0.04, (p.seed || 42) + 7, 2);
                if (s > 0.05 && n < s * 1.15 && checkMask(wx, wy)) {
                    const jy = wy + (fbm(wx * 0.05, wy * 0.05, p.seed || 42, 2) - 0.5) * 3;
                    cur.push({ x: Math.round(wx), y: Math.round(jy) });
                } else {
                    if (cur.length >= 2) newLines.push(cur);
                    cur = [];
                }
            }
            if (cur.length >= 2) newLines.push(cur);
        }
        // Subtle second tilted pass near edges
        for (let u = -w; u <= w + h; u += ringStep * 1.3) {
            let cur = [];
            for (let v = -h; v <= w + h; v += 4) {
                const wx = minX + u * cosA - v * sinA;
                const wy = minY + u * sinA + v * cosA;
                const cx = Math.floor((wx - minX) / bin);
                const cy = Math.floor((wy - minY) / bin);
                if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
                    if (cur.length >= 2) newLines.push(cur);
                    cur = [];
                    continue;
                }
                const s = evalCellStrength(cy * cols + cx, cx, cy);
                if (s > 0.35 && rng() < s && checkMask(wx, wy)) {
                    cur.push({ x: Math.round(wx), y: Math.round(wy) });
                } else {
                    if (cur.length >= 2) newLines.push(cur);
                    cur = [];
                }
            }
            if (cur.length >= 2) newLines.push(cur);
        }
    } else {
        // Hatch falloff angled 45°
        const hatchPitch = Math.max(3, Math.round(11 - densityRatio * 7));
        const diagMin = minX + minY, diagMax = maxX + maxY;
        for (let d = diagMin; d <= diagMax; d += hatchPitch) {
            let cur = [];
            for (let wx = minX; wx <= maxX; wx += 3) {
                const wy = d - wx;
                const cx = Math.floor((wx - minX) / bin);
                const cy = Math.floor((wy - minY) / bin);
                if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
                    if (cur.length >= 2) newLines.push(cur);
                    cur = [];
                    continue;
                }
                const s = evalCellStrength(cy * cols + cx, cx, cy);
                if (s > 0.04 && (rng() < s * 1.2) && checkMask(wx, wy)) {
                    cur.push({ x: Math.round(wx), y: Math.round(wy) });
                } else {
                    if (cur.length >= 2) newLines.push(cur);
                    cur = [];
                }
            }
            if (cur.length >= 2) newLines.push(cur);
        }
    }

    if (!p.removegray) sceneryLines = originalSceneryLines.concat(newLines);
    else sceneryLines = newLines;
    sceneryDirty = true;
    bumpTrackVersion();
    updatePreviewBadge();
    draw();
}

/**
 * Generate perspective-aligned cast or directional surface shadows originating from perspShadePoint.
 */
function runPerspShadowGen(p, isPreview) {
    const useSel = !!p.selectionOnly && selection.fragments.length > 0;
    const occluders = [];
    if (useSel) {
        for (const f of selection.fragments) {
            if (f.points && f.points.length >= 2) occluders.push(f.points);
        }
    } else {
        for (const poly of physicsLines) if (poly.length >= 2) occluders.push(poly);
        if (p.includeScenery) {
            for (const poly of originalSceneryLines) if (poly.length >= 2) occluders.push(poly);
        }
    }
    if (occluders.length === 0) return;

    const rng = getRNG(p.seed || 42);
    const length = Math.max(20, p.length || 180);
    const densityRatio = Math.max(0.05, Math.min(1.0, (p.density || 70) / 100));
    const softness = Math.max(0, Math.min(1, (p.falloff ?? 55) / 100));
    const falloffPow = 0.25 + softness * 1.95;
    const style = p.style || 'hatch';
    const shadowMode = p.shadowMode || 'cast';
    const rawAxis = p.axisMode || 'auto';
    const ox = perspShadePoint.x;
    const oy = perspShadePoint.y;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0, ptCnt = 0;
    for (const poly of occluders) {
        for (const pt of poly) {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
            sumX += pt.x; sumY += pt.y; ptCnt++;
        }
    }
    if (!isFinite(minX) || ptCnt === 0) return;
    const cenX = sumX / ptCnt;
    const cenY = sumY / ptCnt;

    const pad = length + 30;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const w = maxX - minX, h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    let bin = Math.max(3, Math.min(8, Math.ceil(Math.max(w, h) / 460)));
    while ((Math.ceil(w / bin) * Math.ceil(h / bin)) > 750000) bin += 1;
    const cols = Math.ceil(w / bin);
    const rows = Math.ceil(h / bin);
    const total = cols * rows;

    const wallGrid = new Uint8Array(total);
    const shadowBuf = new Float32Array(total);

    for (const poly of occluders) {
        for (let i = 0; i < poly.length - 1; i++) {
            const x0 = poly[i].x - minX, y0 = poly[i].y - minY;
            const x1 = poly[i + 1].x - minX, y1 = poly[i + 1].y - minY;
            const segLen = Math.hypot(x1 - x0, y1 - y0);
            const steps = Math.ceil(segLen / (bin * 0.5)) || 1;
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const cx = Math.floor((x0 + (x1 - x0) * t) / bin);
                const cy = Math.floor((y0 + (y1 - y0) * t) / bin);
                if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
                    wallGrid[cy * cols + cx] = 1;
                }
            }
        }
    }

    // Resolve effective direction mode & perspective focal/vector parameters
    let effAxis = rawAxis;
    if (effAxis === 'auto') {
        if (perspectiveGrid.mode === 'iso') effAxis = 'iso';
        else effAxis = 'radial';
    }

    const getFocalTarget = () => {
        if (effAxis === 'vp1') return perspectiveGrid.vp1;
        if (effAxis === 'vp2') return perspectiveGrid.vp2;
        if (effAxis === 'vp3') return perspectiveGrid.vp3;
        return { x: ox, y: oy };
    };

    const getIsoDir = () => {
        const rad = (perspectiveGrid.isoAngle * Math.PI) / 180;
        const candidates = [
            { ux: Math.cos(rad), uy: Math.sin(rad) },
            { ux: Math.cos(rad), uy: -Math.sin(rad) },
            { ux: 0, uy: 1 }
        ];
        const lvx = cenX - ox, lvy = cenY - oy;
        let best = candidates[0], bestScore = -1;
        for (const c of candidates) {
            const dot = lvx * c.ux + lvy * c.uy;
            const sc = Math.abs(dot);
            if (sc > bestScore) {
                bestScore = sc;
                best = dot >= 0 ? c : { ux: -c.ux, uy: -c.uy };
            }
        }
        return best;
    };

    const isoVec = effAxis === 'iso' ? getIsoDir() : null;
    const focalPt = getFocalTarget();
    // Sign multiplier (+1 = away from focalPt, -1 = toward focalPt) chosen by shade point side
    let focalSign = 1;
    if (effAxis === 'vp1' || effAxis === 'vp2' || effAxis === 'vp3') {
        const fdx = cenX - focalPt.x, fdy = cenY - focalPt.y;
        const ldx = cenX - ox, ldy = cenY - oy;
        focalSign = (fdx * ldx + fdy * ldy) >= 0 ? 1 : -1;
    }

    const getCastDir = (px, py) => {
        if (isoVec) return isoVec;
        const target = effAxis === 'radial' ? { x: ox, y: oy } : focalPt;
        const dx = (px - target.x) * (effAxis === 'radial' ? 1 : focalSign);
        const dy = (py - target.y) * (effAxis === 'radial' ? 1 : focalSign);
        const d = Math.hypot(dx, dy);
        if (d < 1e-4) {
            const fbX = cenX - ox, fbY = cenY - oy;
            const fl = Math.hypot(fbX, fbY) || 1;
            return { ux: fbX / fl, uy: fbY / fl };
        }
        return { ux: dx / d, uy: dy / d };
    };

    // 1. Cast Shadow Ray-March Pass
    if (shadowMode === 'cast' || shadowMode === 'combined') {
        const sampStep = Math.max(bin * 0.7, 3);
        const rayStep = Math.max(2, bin * 0.75);
        for (const poly of occluders) {
            for (let i = 0; i < poly.length - 1; i++) {
                const a = poly[i], b = poly[i + 1];
                const segLen = Math.hypot(b.x - a.x, b.y - a.y);
                if (segLen < 0.5) continue;
                const nSamp = Math.max(1, Math.ceil(segLen / sampStep));
                for (let s = 0; s <= nSamp; s++) {
                    const t = s / nSamp;
                    const sx = a.x + (b.x - a.x) * t;
                    const sy = a.y + (b.y - a.y) * t;
                    const dir = getCastDir(sx, sy);
                    for (let d = rayStep; d <= length; d += rayStep) {
                        const wx = sx + dir.ux * d;
                        const wy = sy + dir.uy * d;
                        const cx = Math.floor((wx - minX) / bin);
                        const cy = Math.floor((wy - minY) / bin);
                        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) break;
                        const idx = cy * cols + cx;
                        const ratio = Math.max(0, 1 - d / length);
                        const str = Math.pow(ratio, falloffPow) * densityRatio;
                        if (d > bin * 1.9 && wallGrid[idx] === 1) {
                            const contact = Math.min(1, str * 1.15);
                            if (contact > shadowBuf[idx]) shadowBuf[idx] = contact;
                            break;
                        }
                        if (str > shadowBuf[idx]) shadowBuf[idx] = str;
                    }
                }
            }
        }
    }

    // 2. Directional Inward Surface Pass (optional surface or combined mode)
    if (shadowMode === 'surface' || shadowMode === 'combined') {
        const surfState = new Uint8Array(total);
        const dist = new Int16Array(total);
        const srcX = new Int16Array(total);
        const srcY = new Int16Array(total);
        dist.fill(-1);
        for (let idx = 0; idx < total; idx++) {
            if (wallGrid[idx]) { surfState[idx] = 1; dist[idx] = 0; }
        }
        const queue = new Int32Array(total);
        let qHead = 0, qTail = 0;
        const seedAir = (cx, cy) => {
            if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return;
            const idx = cy * cols + cx;
            if (surfState[idx] === 0) { surfState[idx] = 2; queue[qTail++] = idx; }
        };
        for (let cx = 0; cx < cols; cx++) { seedAir(cx, 0); seedAir(cx, rows - 1); }
        for (let cy = 0; cy < rows; cy++) { seedAir(0, cy); seedAir(cols - 1, cy); }
        seedAir(Math.floor((0 - minX) / bin), Math.floor((0 - minY) / bin));
        while (qHead < qTail) {
            const idx = queue[qHead++];
            const cx = idx % cols, cy = (idx / cols) | 0;
            if (cx > 0 && surfState[idx - 1] === 0) { surfState[idx - 1] = 2; queue[qTail++] = idx - 1; }
            if (cx + 1 < cols && surfState[idx + 1] === 0) { surfState[idx + 1] = 2; queue[qTail++] = idx + 1; }
            if (cy > 0 && surfState[idx - cols] === 0) { surfState[idx - cols] = 2; queue[qTail++] = idx - cols; }
            if (cy + 1 < rows && surfState[idx + cols] === 0) { surfState[idx + cols] = 2; queue[qTail++] = idx + cols; }
        }

        qHead = 0; qTail = 0;
        for (let idx = 0; idx < total; idx++) {
            if (surfState[idx] === 1) {
                queue[qTail++] = idx;
                srcX[idx] = idx % cols;
                srcY[idx] = (idx / cols) | 0;
            }
        }
        const maxCells = Math.ceil(length / bin) + 1;
        while (qHead < qTail) {
            const idx = queue[qHead++];
            const dNext = dist[idx] + 1;
            if (dNext > maxCells) continue;
            const cx = idx % cols, cy = (idx / cols) | 0;
            const sx0 = srcX[idx], sy0 = srcY[idx];
            const checkNbr = (nIdx) => {
                if (surfState[nIdx] === 0 && dist[nIdx] === -1) {
                    dist[nIdx] = dNext;
                    srcX[nIdx] = sx0;
                    srcY[nIdx] = sy0;
                    queue[qTail++] = nIdx;
                }
            };
            if (cx > 0) checkNbr(idx - 1);
            if (cx + 1 < cols) checkNbr(idx + 1);
            if (cy > 0) checkNbr(idx - cols);
            if (cy + 1 < rows) checkNbr(idx + cols);
        }

        for (let idx = 0; idx < total; idx++) {
            if (surfState[idx] !== 0 || dist[idx] <= 0) continue;
            const dWorld = dist[idx] * bin;
            if (dWorld > length) continue;
            const cx = idx % cols, cy = (idx / cols) | 0;
            const wx = minX + cx * bin, wy = minY + cy * bin;
            const inDx = cx - srcX[idx], inDy = cy - srcY[idx];
            const inL = Math.hypot(inDx, inDy) || 1;
            const dir = getCastDir(wx, wy);
            const alignment = Math.max(0.15, (inDx / inL) * dir.ux + (inDy / inL) * dir.uy);
            const str = Math.pow(Math.max(0, 1 - dWorld / length), falloffPow) * densityRatio * alignment;
            if (str > shadowBuf[idx]) shadowBuf[idx] = str;
        }
    }

    const sampleShadow = (wx, wy) => {
        const cx = Math.floor((wx - minX) / bin);
        const cy = Math.floor((wy - minY) / bin);
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return 0;
        return shadowBuf[cy * cols + cx];
    };

    const newLines = [];
    const emitAlongRay = (pA, pB, useBroken) => {
        const dx = pB.x - pA.x, dy = pB.y - pA.y;
        const rLen = Math.hypot(dx, dy);
        if (rLen < 3) return;
        const ux = dx / rLen, uy = dy / rLen;
        let cur = [];
        for (let d = 0; d <= rLen; d += 3) {
            const wx = pA.x + ux * d;
            const wy = pA.y + uy * d;
            // Avoid an ink blob right on top of focal point when point is inside box
            if (!isoVec && Math.hypot(wx - focalPt.x, wy - focalPt.y) < 10) {
                if (cur.length >= 2) newLines.push(cur);
                cur = [];
                continue;
            }
            const s = sampleShadow(wx, wy);
            let keep = s > 0.04 && checkMask(wx, wy);
            if (keep) {
                if (useBroken) {
                    const n = fbm(wx * 0.045, wy * 0.045, (p.seed || 42) + 11, 2);
                    keep = n < s * 1.15;
                } else {
                    keep = s > 0.25 || rng() < s * 1.6;
                }
            }
            if (keep) {
                cur.push({ x: Math.round(wx), y: Math.round(wy) });
            } else {
                if (cur.length >= 2) newLines.push(cur);
                cur = [];
            }
        }
        if (cur.length >= 2) newLines.push(cur);
    };

    if (style === 'stipple') {
        const step = Math.max(4, Math.round(9 - densityRatio * 4));
        for (let wy = minY + bin; wy < maxY - bin; wy += step) {
            for (let wx = minX + bin; wx < maxX - bin; wx += step) {
                const jx = wx + (rng() - 0.5) * step;
                const jy = wy + (rng() - 0.5) * step;
                const s = sampleShadow(jx, jy);
                if (s <= 0.03 || !checkMask(jx, jy)) continue;
                if (rng() < s) {
                    const dir = getCastDir(jx, jy);
                    const len = 1.5 + rng() * 4.0 * s;
                    newLines.push([
                        { x: Math.round(jx), y: Math.round(jy) },
                        { x: Math.round(jx + dir.ux * len), y: Math.round(jy + dir.uy * len) }
                    ]);
                }
            }
        }
    } else {
        const pitch = Math.max(3, Math.round(11 - densityRatio * 7));
        const useBroken = style === 'broken';
        if (isoVec) {
            const perpX = -isoVec.uy, perpY = isoVec.ux;
            const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: minX, y: maxY }, { x: maxX, y: maxY }];
            let tMin = Infinity, tMax = -Infinity;
            for (const c of corners) {
                const t = c.x * perpX + c.y * perpY;
                if (t < tMin) tMin = t; if (t > tMax) tMax = t;
            }
            for (let t = tMin; t <= tMax; t += pitch) {
                const seg = clipInfiniteLineToBox(t * perpX, t * perpY, isoVec.ux, isoVec.uy, minX, maxX, minY, maxY);
                if (seg) emitAlongRay(seg[0], seg[1], useBroken);
            }
        } else {
            // Sweep perspective hatch rays cleanly through perimeter edges facing away from focalPt
            const boxMidX = (minX + maxX) * 0.5, boxMidY = (minY + maxY) * 0.5;
            if (Math.hypot(focalPt.x - boxMidX, focalPt.y - boxMidY) > 12000) {
                const dir = getCastDir(boxMidX, boxMidY);
                const perpX = -dir.uy, perpY = dir.ux;
                const diag = Math.hypot(w, h) * 0.6;
                for (let t = -diag; t <= diag; t += pitch) {
                    const seg = clipInfiniteLineToBox(boxMidX + t * perpX, boxMidY + t * perpY, dir.ux, dir.uy, minX, maxX, minY, maxY);
                    if (seg) emitAlongRay(seg[0], seg[1], useBroken);
                }
            } else {
                const emitToEdgePt = (ex, ey) => {
                    const seg = clipInfiniteLineToBox(focalPt.x, focalPt.y, ex - focalPt.x, ey - focalPt.y, minX, maxX, minY, maxY);
                    if (!seg) return;
                    // Clamp near endpoint at focalPt when focalPt sits inside the box
                    let pA = seg[0], pB = seg[1];
                    const dotDir = (pB.x - pA.x) * (ex - focalPt.x) + (pB.y - pA.y) * (ey - focalPt.y);
                    if (dotDir < 0) { const tmp = pA; pA = pB; pB = tmp; }
                    if (focalPt.x >= minX && focalPt.x <= maxX && focalPt.y >= minY && focalPt.y <= maxY) {
                        pA = { x: focalPt.x, y: focalPt.y };
                    }
                    emitAlongRay(pA, pB, useBroken);
                };
                if (focalPt.y > minY) for (let x = minX; x <= maxX; x += pitch) emitToEdgePt(x, minY);
                if (focalPt.y < maxY) for (let x = minX; x <= maxX; x += pitch) emitToEdgePt(x, maxY);
                if (focalPt.x > minX) for (let y = minY; y <= maxY; y += pitch) emitToEdgePt(minX, y);
                if (focalPt.x < maxX) for (let y = minY; y <= maxY; y += pitch) emitToEdgePt(maxX, y);
            }
        }
    }

    if (!p.removegray) sceneryLines = originalSceneryLines.concat(newLines);
    else sceneryLines = newLines;
    sceneryDirty = true;
    bumpTrackVersion();
    updatePreviewBadge();
    updateStatusBar();
    drawMinimap();
    draw();
    if (!isPreview) toast(`Generated ${newLines.length} perspective shadow strokes ✓`, 'success', 2200);
}

function runImageVectorizer(p, isPreview) {
    if (!refImage.img) {
        if (!isPreview) toast('Load a Reference Image in the Layers tab first!', 'info', 3000);
        return;
    }

    const maxDim = 320;
    const aspect = refImage.width / Math.max(1, refImage.height);
    let cw, ch;
    if (aspect >= 1) {
        cw = Math.min(maxDim, Math.max(40, Math.round(refImage.width)));
        ch = Math.max(20, Math.round(cw / aspect));
    } else {
        ch = Math.min(maxDim, Math.max(40, Math.round(refImage.height)));
        cw = Math.max(20, Math.round(ch * aspect));
    }

    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    const octx = off.getContext('2d');
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, cw, ch);
    octx.drawImage(refImage.img, 0, 0, cw, ch);
    const imgData = octx.getImageData(0, 0, cw, ch).data;

    const lum = new Float32Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) {
        const idx = i * 4;
        const a = imgData[idx + 3] / 255;
        const r = imgData[idx] * a + 255 * (1 - a);
        const g = imgData[idx + 1] * a + 255 * (1 - a);
        const b = imgData[idx + 2] * a + 255 * (1 - a);
        lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const worldW = refImage.width * refImage.scale;
    const worldH = refImage.height * refImage.scale;
    const worldLeft = refImage.x - worldW / 2;
    const worldTop = refImage.y - worldH / 2;
    const toWorld = (px, py) => ({
        x: Math.round(worldLeft + (px / cw) * worldW),
        y: Math.round(worldTop + (py / ch) * worldH)
    });

    const style = p.style || 'edges';
    const thresh = p.threshold || 120;
    const spacing = Math.max(2, p.spacing || 6);
    const simplifyTol = Math.max(0.5, p.simplify || 2.0);
    const generated = [];

    if (style === 'edges' || style === 'both') {
        const edgeMap = new Uint8Array(cw * ch);
        const edgeThresh = Math.max(25, (255 - thresh) * 1.2 + 30);
        for (let y = 1; y < ch - 1; y++) {
            for (let x = 1; x < cw - 1; x++) {
                const i = y * cw + x;
                const gx = -lum[i - cw - 1] + lum[i - cw + 1] - 2 * lum[i - 1] + 2 * lum[i + 1] - lum[i + cw - 1] + lum[i + cw + 1];
                const gy = -lum[i - cw - 1] - 2 * lum[i - cw] - lum[i - cw + 1] + lum[i + cw - 1] + 2 * lum[i + cw] + lum[i + cw + 1];
                if (Math.hypot(gx, gy) >= edgeThresh) edgeMap[i] = 1;
            }
        }
        const visited = new Uint8Array(cw * ch);
        const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
        for (let y = 1; y < ch - 1; y++) {
            for (let x = 1; x < cw - 1; x++) {
                const startIdx = y * cw + x;
                if (!edgeMap[startIdx] || visited[startIdx]) continue;
                const chain = [];
                let cx = x, cy = y;
                while (true) {
                    const idx = cy * cw + cx;
                    visited[idx] = 1;
                    chain.push(toWorld(cx, cy));
                    let foundNext = false;
                    for (const [dx, dy] of dirs) {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx > 0 && nx < cw - 1 && ny > 0 && ny < ch - 1) {
                            const nIdx = ny * cw + nx;
                            if (edgeMap[nIdx] && !visited[nIdx]) {
                                cx = nx; cy = ny; foundNext = true;
                                break;
                            }
                        }
                    }
                    if (!foundNext) break;
                }
                if (chain.length >= 3) {
                    const simp = simplifyRDP(chain, simplifyTol);
                    if (simp.length >= 2 && polylineLength(simp) >= 3) {
                        generated.push(simp);
                    }
                }
            }
        }
    }

    if (style === 'hatch' || style === 'both') {
        const pxStep = Math.max(2, Math.round(spacing * (cw / Math.max(1, worldW))));
        const step = Math.max(2, pxStep);
        for (let y = 0; y < ch; y += step) {
            let runStart = -1;
            for (let x = 0; x <= cw; x++) {
                const isDark = x < cw && lum[y * cw + x] < thresh;
                if (isDark && runStart === -1) runStart = x;
                else if (!isDark && runStart !== -1) {
                    if (x - runStart >= 2) {
                        const p0 = toWorld(runStart, y);
                        const p1 = toWorld(x - 1, y);
                        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) >= 2) generated.push([p0, p1]);
                    }
                    runStart = -1;
                }
            }
        }
        // Cross-hatch pass on darkest shadows
        const darkThresh = thresh * 0.45;
        for (let x = 0; x < cw; x += step) {
            let runStart = -1;
            for (let y = 0; y <= ch; y++) {
                const isDark = y < ch && lum[y * cw + x] < darkThresh;
                if (isDark && runStart === -1) runStart = y;
                else if (!isDark && runStart !== -1) {
                    if (y - runStart >= 2) {
                        const p0 = toWorld(x, runStart);
                        const p1 = toWorld(x, y - 1);
                        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) >= 2) generated.push([p0, p1]);
                    }
                    runStart = -1;
                }
            }
        }
    }

    if (!p.removegray) sceneryLines = originalSceneryLines.concat(generated);
    else sceneryLines = generated;
    sceneryDirty = true;
    updatePreviewBadge();
    draw();
    if (!isPreview) toast(`Vectorized ${generated.length} scenery strokes! ✓`, 'success', 2500);
}

let lastRollerPolyline = null;

function runRollersGen(p, isPreview) {
    const isScen = !!p.scenery;
    let targetLayer = isScen ? sceneryLines : physicsLines;

    if (isPreview && lastRollerPolyline) {
        const idx = targetLayer.indexOf(lastRollerPolyline);
        if (idx !== -1) targetLayer.splice(idx, 1);
        lastRollerPolyline = null;
    }

    let startX = 0, startY = 0;
    if (targetLayer.length > 0) {
        let maxX = -Infinity, bestPt = null;
        for (const poly of targetLayer) {
            for (const pt of poly) {
                if (pt.x > maxX) {
                    maxX = pt.x;
                    bestPt = pt;
                }
            }
        }
        if (bestPt) {
            startX = bestPt.x;
            startY = bestPt.y;
        }
    } else {
        startX = Math.round(camX - (p.length || 2000) / 4);
        startY = Math.round(camY);
    }

    const seed = p.seed || 42;
    const length = p.length || 2000;
    const wavelength = p.wavelength || 320;
    const amplitude = p.amplitude || 65;
    const randomizer = p.randomizer !== undefined ? p.randomizer : 70;
    const rFactor = Math.max(0, Math.min(100, randomizer)) / 100;
    const slopeFactor = (p.slope || 0) / 100;

    // Seeded PRNG
    let s = (seed || 42) & 0xffffffff;
    function rand() {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return (s >>> 0) / 4294967296;
    }

    // Step 1: Synthesize discrete terrain anchors (alternating crests & troughs with organic variation)
    const anchors = [{ x: 0, y: 0, m: 0 }];
    let curX = 0;
    let isPeak = true;

    while (curX < length + wavelength * 1.5) {
        // Individual half-wavelength variation: +/- 70% * rFactor
        const widthJitter = (rand() * 2 - 1) * 0.70 * rFactor;
        let halfW = (wavelength / 2) * (1 + widthJitter);
        halfW = Math.max(50, halfW);

        let targetY = 0;
        if (isPeak) {
            // Peak amplitude variation: +/- 85% * rFactor
            const heightJitter = (rand() * 2 - 1) * 0.85 * rFactor;
            const h = amplitude * Math.max(0.20, 1 + heightJitter);
            targetY = -h;

            const featRoll = rand();
            if (rFactor >= 0.35 && featRoll < 0.20) {
                // Feature: Tabletop plateau
                const platW = halfW * (0.3 + rand() * 0.25);
                curX += (halfW - platW / 2);
                anchors.push({ x: curX, y: targetY, m: 0 });
                curX += platW;
                anchors.push({ x: curX, y: targetY, m: 0 });
                isPeak = false;
                continue;
            } else if (rFactor >= 0.50 && featRoll >= 0.20 && featRoll < 0.35) {
                // Feature: Camel-hump / Double roller
                const midH = h * (0.70 + rand() * 0.20);
                const saddleY = -(h * (0.40 + rand() * 0.15));
                curX += halfW * 0.45;
                anchors.push({ x: curX, y: targetY, m: 0 });
                curX += halfW * 0.40;
                anchors.push({ x: curX, y: saddleY, m: 0 });
                curX += halfW * 0.45;
                anchors.push({ x: curX, y: -midH, m: 0 });
                isPeak = false;
                continue;
            }
        } else {
            // Valley dip variation: +/- 30% amplitude
            const dip = (rand() * 2 - 1) * (amplitude * 0.30 * rFactor);
            targetY = dip;
        }

        // Macro terrain rolling swell
        const macroY = Math.sin((curX / Math.max(length, 1200)) * Math.PI * 2) * (amplitude * 0.30 * rFactor);
        targetY += macroY;

        curX += halfW;
        anchors.push({ x: curX, y: targetY, m: 0 });
        isPeak = !isPeak;
    }

    // Step 2: Enforce rideability slope cap between successive anchors (|dy/dx| <= 0.85)
    for (let i = 1; i < anchors.length; i++) {
        const dx = anchors[i].x - anchors[i - 1].x;
        const maxDy = dx * 0.85;
        const dy = anchors[i].y - anchors[i - 1].y;
        if (Math.abs(dy) > maxDy) {
            anchors[i].y = anchors[i - 1].y + Math.sign(dy) * maxDy;
        }
    }

    // Step 3: Compute smooth cubic Hermite tangents with zero-derivative crests/troughs
    const n = anchors.length;
    for (let i = 1; i < n - 1; i++) {
        const dx1 = anchors[i].x - anchors[i - 1].x;
        const dy1 = anchors[i].y - anchors[i - 1].y;
        const dx2 = anchors[i + 1].x - anchors[i].x;
        const dy2 = anchors[i + 1].y - anchors[i].y;
        const s1 = dy1 / (dx1 || 1);
        const s2 = dy2 / (dx2 || 1);
        if (s1 * s2 <= 0) {
            anchors[i].m = 0; // Local extremum: flat crest or trough
        } else {
            anchors[i].m = Math.max(-0.85, Math.min(0.85, (s1 + s2) / 2));
        }
    }
    anchors[0].m = 0;
    anchors[n - 1].m = 0;

    // Step 4: Dense track point sampling along the spline with slope & micro-grain
    const dx = 14;
    const totalPts = Math.ceil(length / dx);
    const pts = [];
    let segIdx = 0;

    for (let i = 0; i <= totalPts; i++) {
        const currentSampleX = i * dx;
        while (segIdx < n - 2 && anchors[segIdx + 1].x < currentSampleX) {
            segIdx++;
        }
        const p0 = anchors[segIdx];
        const p1 = anchors[segIdx + 1];
        const segDx = p1.x - p0.x || 1;
        const t = Math.max(0, Math.min(1, (currentSampleX - p0.x) / segDx));

        // Cubic Hermite basis
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        let yInterp = h00 * p0.y + h10 * segDx * p0.m + h01 * p1.y + h11 * segDx * p1.m;

        // Subtle micro-grain jitter when randomizer is active
        if (rFactor > 0.2) {
            const micro = Math.sin(currentSampleX * 0.15 + seed) * (1.5 * rFactor);
            yInterp += micro;
        }

        const finalX = Math.round(startX + currentSampleX);
        const finalY = Math.round(startY + yInterp + currentSampleX * slopeFactor);
        pts.push({ x: finalX, y: finalY });
    }

    targetLayer.push(pts);
    lastRollerPolyline = pts;

    if (isScen) {
        originalSceneryLines = JSON.parse(JSON.stringify(sceneryLines));
        sceneryDirty = false;
    } else {
        bumpPhysics();
    }
    updateStatusBar();
    drawMinimap();
    draw();
    if (!isPreview) toast(`Generated ${totalPts + 1} organic roller points (${length}px)`, 'success', 2500);
}

// ==========================================
// ROCK CLUSTER & ROCK BRUSH ENGINE
// ==========================================

function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getSegIntersection(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-7) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
    if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
        return {
            x: p1.x + t * d1x,
            y: p1.y + t * d1y,
            t: Math.max(0, Math.min(1, t)),
            u: Math.max(0, Math.min(1, u))
        };
    }
    return null;
}

function stitchSegments(segments) {
    if (!segments || segments.length === 0) return [];
    const pool = segments.map(s => ({
        p1: { x: Math.round(s.p1.x), y: Math.round(s.p1.y) },
        p2: { x: Math.round(s.p2.x), y: Math.round(s.p2.y) },
        used: false
    })).filter(s => s.p1.x !== s.p2.x || s.p1.y !== s.p2.y);

    const polylines = [];
    for (let i = 0; i < pool.length; i++) {
        if (pool[i].used) continue;
        pool[i].used = true;
        let chain = [pool[i].p1, pool[i].p2];
        let extended = true;
        while (extended) {
            extended = false;
            const tail = chain[chain.length - 1];
            for (let j = 0; j < pool.length; j++) {
                if (pool[j].used) continue;
                const d1 = Math.hypot(pool[j].p1.x - tail.x, pool[j].p1.y - tail.y);
                const d2 = Math.hypot(pool[j].p2.x - tail.x, pool[j].p2.y - tail.y);
                if (d1 <= 2) {
                    chain.push(pool[j].p2);
                    pool[j].used = true;
                    extended = true;
                    break;
                } else if (d2 <= 2) {
                    chain.push(pool[j].p1);
                    pool[j].used = true;
                    extended = true;
                    break;
                }
            }
        }
        if (chain.length >= 2) polylines.push(chain);
    }
    return polylines;
}

function distPtToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lSq = dx * dx + dy * dy;
    if (lSq < 1e-4) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function clipPolylineAgainstOccluders(poly, occluders, minFragLen = 18, groundY = null) {
    if (!occluders || occluders.length === 0) {
        return [poly.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))];
    }
    const origPerim = polylineLength(poly);
    const rawSegments = [];
    for (let i = 0; i < poly.length - 1; i++) {
        let segs = [{ p1: poly[i], p2: poly[i + 1] }];
        for (const occ of occluders) {
            const nextSegs = [];
            for (const seg of segs) {
                const ts = [0, 1];
                for (let k = 0; k < occ.length - 1; k++) {
                    const hit = getSegIntersection(seg.p1, seg.p2, occ[k], occ[k + 1]);
                    if (hit && hit.t > 0.001 && hit.t < 0.999) ts.push(hit.t);
                }
                ts.sort((a, b) => a - b);
                for (let m = 0; m < ts.length - 1; m++) {
                    const tA = ts[m], tB = ts[m + 1];
                    if (tB - tA < 0.005) continue;
                    const subP1 = { x: seg.p1.x + (seg.p2.x - seg.p1.x) * tA, y: seg.p1.y + (seg.p2.y - seg.p1.y) * tA };
                    const subP2 = { x: seg.p1.x + (seg.p2.x - seg.p1.x) * tB, y: seg.p1.y + (seg.p2.y - seg.p1.y) * tB };
                    const midX = (subP1.x + subP2.x) * 0.5, midY = (subP1.y + subP2.y) * 0.5;
                    if (!pointInPoly(midX, midY, occ)) {
                        nextSegs.push({ p1: subP1, p2: subP2 });
                    }
                }
            }
            segs = nextSegs;
            if (segs.length === 0) break;
        }
        for (const s of segs) rawSegments.push(s);
    }

    const stitched = stitchSegments(rawSegments);
    const validChains = [];
    let totalLen = 0;

    for (const chain of stitched) {
        if (chain.length < 2) continue;
        const len = polylineLength(chain);
        if (len < minFragLen) continue; // Prune micro-fragments & nubs (< 18px)

        // Prune tiny closed loops / specks (e.g. at ground level)
        const dStartEnd = Math.hypot(chain[0].x - chain[chain.length - 1].x, chain[0].y - chain[chain.length - 1].y);
        if (dStartEnd < 4) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const pt of chain) {
                if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
            }
            const boxW = maxX - minX, boxH = maxY - minY;
            if (boxW < 16 && boxH < 14) continue;
        }

        // Clearance filter: Ensure this chain extends >= 8.5px away from occluder boundaries
        // Eliminates parallel "echo" double-line slivers that merely hug an occluder
        if (occluders && occluders.length > 0) {
            let maxClearance = 0;
            for (const pt of chain) {
                let minDistToAnyEdge = Infinity;
                for (const occ of occluders) {
                    for (let k = 0; k < occ.length - 1; k++) {
                        const d = distPtToSegment(pt.x, pt.y, occ[k].x, occ[k].y, occ[k + 1].x, occ[k + 1].y);
                        if (d < minDistToAnyEdge) minDistToAnyEdge = d;
                    }
                }
                if (minDistToAnyEdge > maxClearance) maxClearance = minDistToAnyEdge;
            }
            if (maxClearance < 8.5) continue;
        }

        totalLen += len;
        validChains.push(chain);
    }

    // If total visible perimeter is negligible (< 26px or < 14% of rock), drop rock completely to prevent clutter
    if (totalLen < Math.max(26, origPerim * 0.14)) {
        return [];
    }

    return validChains;
}

function createRockHull(center, rx, ry, roughness, style, rng, groundY = null) {
    if (groundY !== null) {
        // Ground-anchored rock: Guaranteed watertight overhead arc rooted at groundY
        const verts = style === 'pebble' ? 14 : (style === 'spire' || style === 'crag' ? 26 : 20);
        const pts = [];
        const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2, p3 = rng() * Math.PI * 2;

        const leftRx = rx * (0.85 + rng() * 0.25);
        const rightRx = rx * (0.85 + rng() * 0.25);

        // Overhead arc from left ground contact to right ground contact
        for (let i = 0; i <= verts; i++) {
            const u = i / verts; // 0 to 1
            const th = Math.PI * (1 - u); // PI (left) down to 0 (right)

            // Shape modulation
            let rNorm = 1.0;
            if (style === 'spire') {
                const peakClump = Math.sin(u * Math.PI);
                rNorm += 0.28 * Math.pow(peakClump, 1.8);
            } else if (style === 'crag') {
                const shoulder = Math.sin(u * Math.PI * 2);
                rNorm += 0.15 * shoulder;
            }

            const harm = 0.14 * Math.sin(2 * th + p1) + 0.08 * Math.sin(3 * th + p2) + 0.05 * Math.sin(5 * th + p3);
            const noise = (rng() - 0.5) * roughness * 0.85;
            const rScale = Math.max(0.3, rNorm + harm + noise);

            const curRx = u < 0.5 ? leftRx : rightRx;
            const vx = center.x - Math.cos(u * Math.PI) * curRx * (0.9 + 0.1 * rScale);
            // Rise above groundY
            const vy = groundY - Math.sin(u * Math.PI) * ry * rScale * 1.5;

            pts.push({ x: Math.round(vx), y: Math.round(Math.min(groundY, vy)) });
        }

        // Close along the ground baseline
        pts.push({ x: pts[0].x, y: groundY });
        return pts;
    }

    const verts = style === 'pebble' ? 14 : (style === 'spire' || style === 'crag' ? 28 : 22);
    const pts = [];
    const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2, p3 = rng() * Math.PI * 2;

    for (let i = 0; i < verts; i++) {
        const th = (i / verts) * Math.PI * 2;
        let rNorm = 1.0;
        if (style === 'spire' || style === 'crag') {
            const topFactor = Math.sin(th);
            rNorm += (topFactor > 0 ? 0.25 : -0.22) * Math.abs(topFactor);
        } else if (style === 'slab') {
            rNorm += 0.15 * Math.cos(2 * th);
        }

        const harm = 0.18 * Math.sin(2 * th + p1) + 0.10 * Math.sin(3 * th + p2) + 0.06 * Math.sin(5 * th + p3);
        const noise = (rng() - 0.5) * roughness * 0.85;
        const rScale = Math.max(0.25, rNorm + harm + noise);

        let vx = center.x + Math.cos(th) * rx * rScale;
        let vy = center.y + Math.sin(th) * ry * rScale;
        pts.push({ x: Math.round(vx), y: Math.round(vy) });
    }
    pts.push({ x: pts[0].x, y: pts[0].y });
    return pts;
}

function createOrganicStone(center, rx, ry, roughness, style, rng) {
    const verts = style === 'pebble' ? 14 : (style === 'spire' ? 24 : 18);
    const pts = [];
    const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2, p3 = rng() * Math.PI * 2;

    const scaleTop = 0.9 + rng() * 0.25;
    const scaleBottom = 0.85 + rng() * 0.25;
    const scaleLeft = 0.9 + rng() * 0.2;
    const scaleRight = 0.9 + rng() * 0.2;

    for (let i = 0; i < verts; i++) {
        const th = (i / verts) * Math.PI * 2;
        let rNorm = 1.0;

        if (style === 'spire') {
            const sinT = Math.sin(th);
            if (sinT < 0) {
                rNorm += 0.25 * Math.abs(sinT);
            } else {
                rNorm += 0.15 * sinT;
            }
        } else if (style === 'crag') {
            rNorm += 0.18 * Math.cos(2 * th + p1);
        } else if (style === 'slab') {
            rNorm += 0.20 * Math.abs(Math.cos(th));
        }

        const harm = 0.12 * Math.sin(2 * th + p1) + 0.08 * Math.sin(3 * th + p2) + 0.05 * Math.sin(5 * th + p3);
        const noise = (rng() - 0.5) * roughness * 0.6;
        const r = Math.max(0.3, rNorm + harm + noise);

        const qx = Math.cos(th) >= 0 ? scaleRight : scaleLeft;
        const qy = Math.sin(th) >= 0 ? scaleBottom : scaleTop;

        const vx = center.x + Math.cos(th) * rx * r * qx;
        const vy = center.y + Math.sin(th) * ry * r * qy;
        pts.push({ x: Math.round(vx), y: Math.round(vy) });
    }
    pts.push({ x: pts[0].x, y: pts[0].y });
    return pts;
}

function createFacetedMassif(center, rx, ry, roughness, rng) {
    const n = 6 + Math.floor(rng() * 3);
    const pts = [];
    const rot = rng() * Math.PI * 2;
    const p1 = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
        const th = rot + (i / n) * Math.PI * 2;
        const sinT = Math.sin(th);
        const taper = (sinT < 0) ? (1.0 + 0.22 * Math.abs(sinT)) : 1.0;
        const harm = 0.12 * Math.sin(2 * th + p1);
        const noise = (rng() - 0.5) * roughness * 0.5;
        const r = (0.85 + harm + noise) * taper;
        pts.push({
            x: Math.round(center.x + Math.cos(th) * rx * r),
            y: Math.round(center.y + Math.sin(th) * ry * r)
        });
    }
    pts.push({ x: pts[0].x, y: pts[0].y });
    return pts;
}

function sliceAndSealGroundPolygon(rawPoly, groundY, baseMode, filletRadius = 10) {
    const pts = rawPoly.slice(0);
    if (pts.length > 0) {
        const p0 = pts[0], pLast = pts[pts.length - 1];
        if (p0.x !== pLast.x || p0.y !== pLast.y) {
            pts.push({ x: p0.x, y: p0.y });
        }
    }

    const maxRawY = Math.max(...pts.map(p => p.y));
    if (maxRawY <= groundY && baseMode !== 'filletFlat') {
        return pts;
    }

    // Sutherland-Hodgman style clip to y <= groundY
    const n = pts.length - 1;
    const clipped = [];
    for (let i = 0; i < n; i++) {
        const curr = pts[i];
        const next = pts[i + 1];
        const currAbove = curr.y <= groundY;
        const nextAbove = next.y <= groundY;

        if (currAbove) {
            clipped.push({ x: curr.x, y: curr.y });
            if (!nextAbove) {
                const t = (groundY - curr.y) / (next.y - curr.y);
                clipped.push({ x: curr.x + t * (next.x - curr.x), y: groundY, isGroundContact: true });
            }
        } else if (nextAbove) {
            const t = (groundY - curr.y) / (next.y - curr.y);
            clipped.push({ x: curr.x + t * (next.x - curr.x), y: groundY, isGroundContact: true });
        }
    }

    if (clipped.length < 3) return pts;

    let result = [];
    const len = clipped.length;
    for (let i = 0; i < len; i++) {
        const curr = clipped[i];
        if (curr.isGroundContact && baseMode === 'filletFlat') {
            const prev = clipped[(i - 1 + len) % len];
            const next = clipped[(i + 1) % len];
            const v1x = prev.x - curr.x, v1y = prev.y - curr.y;
            const v2x = next.x - curr.x, v2y = next.y - curr.y;
            const d1 = Math.hypot(v1x, v1y), d2 = Math.hypot(v2x, v2y);
            if (d1 > 4 && d2 > 4) {
                const r = Math.min(filletRadius, d1 * 0.40, d2 * 0.40);
                const pA = { x: curr.x + (v1x / d1) * r, y: curr.y + (v1y / d1) * r };
                const pB = { x: curr.x + (v2x / d2) * r, y: curr.y + (v2y / d2) * r };
                const steps = 3;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const u = 1 - t;
                    const fx = u * u * pA.x + 2 * u * t * curr.x + t * t * pB.x;
                    const fy = u * u * pA.y + 2 * u * t * curr.y + t * t * pB.y;
                    result.push({ x: Math.round(fx * 10) / 10, y: Math.round(fy * 10) / 10 });
                }
                continue;
            }
        }
        result.push({ x: Math.round(curr.x * 10) / 10, y: Math.round(curr.y * 10) / 10 });
    }

    if (result.length > 0) {
        const p0 = result[0], pLast = result[result.length - 1];
        if (p0.x !== pLast.x || p0.y !== pLast.y) {
            result.push({ x: p0.x, y: p0.y });
        }
    }
    return result;
}

function sampleSpline(pts, numSamples) {
    if (pts.length < 3) return pts.slice();
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(n - 1, i + 2)];
        const steps = Math.max(3, Math.round(numSamples / (n - 1)));
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const t2 = t * t, t3 = t2 * t;
            const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            out.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
        }
    }
    out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return out;
}

// Reference-Match Archetype Generator: Weathered Granite (Spires, Slabs, Leaning Blocks, Pillows)
function genWeatheredGraniteRock(center, rx, ry, archetype, roughness, groundY, rng, enableCreases) {
    const dir = rng() > 0.5 ? 1 : -1;
    let hull = [];
    let crease = null;

    if (archetype === 'spire') {
        // 1. Tall vertical monolith / spire / pinnacle (like the prominent peak next to biker)
        const bL = { x: center.x - rx * (0.85 + rng() * 0.15), y: groundY + 5 };
        const lowShoulder = {
            x: center.x - dir * rx * (0.62 + rng() * 0.12),
            y: center.y - ry * (0.22 + rng() * 0.10)
        };
        const midRamp = {
            x: center.x - dir * rx * (0.30 + rng() * 0.10),
            y: center.y - ry * (0.60 + rng() * 0.10)
        };
        const crownW = Math.max(6, rx * (0.18 + rng() * 0.06));
        const apexX = center.x + dir * rx * (0.05 + rng() * 0.15);
        const apexY = center.y - ry * (1.00 + rng() * 0.08);
        const apexL = { x: apexX - crownW, y: apexY + 3 };
        const apex = { x: apexX, y: apexY };
        const apexR = { x: apexX + crownW, y: apexY + 3 };
        const highShoulder = {
            x: center.x + dir * rx * (0.32 + rng() * 0.10),
            y: center.y - ry * (0.58 + rng() * 0.10)
        };
        const lowHip = {
            x: center.x + dir * rx * (0.65 + rng() * 0.12),
            y: center.y - ry * (0.24 + rng() * 0.10)
        };
        const bR = { x: center.x + rx * (0.85 + rng() * 0.15), y: groundY + 5 };

        let keyPts = dir === 1
            ? [bL, lowShoulder, midRamp, apexL, apex, apexR, highShoulder, lowHip, bR]
            : [bL, lowHip, highShoulder, apexL, apex, apexR, midRamp, lowShoulder, bR];

        const splinePts = sampleSpline(keyPts, 32);
        splinePts.push({ x: splinePts[0].x, y: splinePts[0].y });
        hull = sliceAndSealGroundPolygon(splinePts, groundY, 'filletFlat', 12 + rng() * 6);

        if (enableCreases && rng() > 0.45) {
            crease = sampleSpline([
                { x: apex.x, y: apex.y },
                { x: apex.x - dir * 10, y: center.y - ry * 0.3 },
                { x: apex.x - dir * 18, y: groundY }
            ], 10);
        }
    } else if (archetype === 'flatSlab') {
        // 2. Broad, low-profile horizontal shelf / slab (stepping ledges and foundation)
        const topTilt = (rng() - 0.5) * ry * 0.12;
        const bL = { x: center.x - rx * (0.95 + rng() * 0.05), y: groundY + 5 };
        const shoulderL = { x: center.x - rx * 0.90, y: center.y - ry * 0.82 };
        const topL = { x: center.x - rx * 0.48, y: center.y - ry * 0.95 + topTilt };
        const topMid = { x: center.x, y: center.y - ry * 0.98 };
        const topR = { x: center.x + rx * 0.48, y: center.y - ry * 0.95 - topTilt };
        const shoulderR = { x: center.x + rx * 0.90, y: center.y - ry * 0.80 };
        const bR = { x: center.x + rx * (0.95 + rng() * 0.05), y: groundY + 5 };

        const splinePts = sampleSpline([bL, shoulderL, topL, topMid, topR, shoulderR, bR], 30);
        splinePts.push({ x: splinePts[0].x, y: splinePts[0].y });
        hull = sliceAndSealGroundPolygon(splinePts, groundY, 'filletFlat', 12 + rng() * 6);

        if (enableCreases && rng() > 0.5) {
            crease = sampleSpline([
                { x: shoulderL.x + 8, y: shoulderL.y },
                { x: center.x, y: center.y - ry * 0.65 },
                { x: shoulderR.x - 8, y: shoulderR.y }
            ], 12);
        }
    } else if (archetype === 'leaningBlock') {
        // 3. Tilted trapezoidal block with asymmetric shoulder (dominant in central massif)
        const bL = { x: center.x - rx * (0.92 + rng() * 0.08), y: groundY + 5 };
        const slopeStoss = { x: center.x - dir * rx * 0.55, y: center.y - ry * 0.35 };
        const crownW = rx * (0.16 + rng() * 0.06);
        const apexX = center.x - dir * rx * 0.16;
        const apexY = center.y - ry * (1.00 + rng() * 0.08);
        const highApexL = { x: apexX - crownW, y: apexY + 2 };
        const highApex = { x: apexX, y: apexY };
        const highApexR = { x: apexX + crownW, y: apexY + 2 };
        const broadCrown = { x: center.x + dir * rx * 0.38, y: center.y - ry * (0.80 + rng() * 0.10) };
        const steepDrop = { x: center.x + dir * rx * 0.78, y: center.y - ry * (0.30 + rng() * 0.12) };
        const bR = { x: center.x + rx * (0.92 + rng() * 0.08), y: groundY + 5 };

        let keyPts = dir === 1
            ? [bL, slopeStoss, highApexL, highApex, highApexR, broadCrown, steepDrop, bR]
            : [bL, steepDrop, broadCrown, highApexL, highApex, highApexR, slopeStoss, bR];

        const splinePts = sampleSpline(keyPts, 28);
        splinePts.push({ x: splinePts[0].x, y: splinePts[0].y });
        hull = sliceAndSealGroundPolygon(splinePts, groundY, 'filletFlat', 12 + rng() * 6);

        if (enableCreases && rng() > 0.5) {
            crease = sampleSpline([
                { x: highApex.x, y: highApex.y },
                { x: highApex.x + dir * 12, y: center.y - ry * 0.25 },
                { x: highApex.x + dir * 20, y: groundY }
            ], 12);
        }
    } else {
        // 4. pillowBoulder: sub-rectangular squircle boulder with softened corners
        const nx = 2.4 + rng() * 0.6;
        const ny = 2.6 + rng() * 0.8;
        const verts = 28;
        const pts = [];
        for (let i = 0; i < verts; i++) {
            const th = (i / verts) * Math.PI * 2;
            const cosT = Math.cos(th), sinT = Math.sin(th);
            const rNorm = Math.pow(
                Math.pow(Math.abs(cosT), 2 / nx) + Math.pow(Math.abs(sinT), 2 / ny),
                -0.5
            );
            const pert = 1.0 + roughness * 0.12 * Math.sin(3 * th + rng() * 2);
            pts.push({
                x: center.x + cosT * rx * rNorm * pert,
                y: center.y + sinT * ry * rNorm * pert
            });
        }
        pts.push({ x: pts[0].x, y: pts[0].y });
        hull = sliceAndSealGroundPolygon(pts, groundY, 'filletFlat', 10 + rng() * 6);

        if (enableCreases && rng() > 0.55) {
            crease = [
                { x: center.x - rx * 0.3, y: center.y - ry * 0.5 },
                { x: center.x + rx * 0.2, y: center.y + ry * 0.1 }
            ];
        }
    }

    return { hull, crease };
}

// Mode 1: Compound Bezier Curvature Splines
function genSplineCurvatureHull(center, rx, ry, roughness, groundY, rng, enableCreases) {
    const dir = rng() > 0.5 ? 1 : -1;
    const crestX = center.x + dir * rx * (0.20 + rng() * 0.25);
    const crestY = center.y - ry * (0.95 + rng() * 0.15);

    const bL = { x: center.x - rx * (0.92 + rng() * 0.08), y: groundY + 5 };
    const rampShoulder = {
        x: center.x - dir * rx * (0.45 + rng() * 0.15),
        y: center.y - ry * (0.45 + rng() * 0.15)
    };
    const apex = { x: crestX, y: crestY };
    const steepHip = {
        x: crestX + dir * rx * (0.35 + rng() * 0.15),
        y: center.y - ry * (0.15 + rng() * 0.25)
    };
    const hollow = {
        x: crestX + dir * rx * (0.38 + rng() * 0.10) - dir * (6 + rng() * 8),
        y: center.y + ry * (0.25 + rng() * 0.15)
    };
    const bR = { x: center.x + rx * (0.92 + rng() * 0.08), y: groundY + 5 };

    let keyPts = dir === 1 ? [bL, rampShoulder, apex, steepHip, hollow, bR] : [bL, hollow, steepHip, apex, rampShoulder, bR];
    const splinePts = sampleSpline(keyPts, 28);
    splinePts.push({ x: splinePts[0].x, y: splinePts[0].y });
    const hull = sliceAndSealGroundPolygon(splinePts, groundY, 'filletFlat', 12 + rng() * 6);

    let crease = null;
    if (enableCreases && rng() > 0.35) {
        crease = sampleSpline([
            { x: apex.x, y: apex.y },
            { x: apex.x - dir * 12 + (rng() - 0.5) * 8, y: center.y + ry * 0.1 },
            { x: apex.x - dir * 20 + (rng() - 0.5) * 12, y: groundY }
        ], 12);
    }
    return { hull, crease };
}

// Mode 2: Asymmetric Superellipses & Lamé Curves
function genAsymmLameHull(center, rx, ry, roughness, groundY, rng, enableCreases) {
    const dir = rng() > 0.5 ? 1 : -1;
    const skew = dir * (0.22 + rng() * 0.15);
    const ny = 2.6 + rng() * 0.8;
    const nxLeft = dir === 1 ? 1.6 : 2.4;
    const nxRight = dir === 1 ? 2.4 : 1.6;

    const verts = 32;
    const rawPts = [];
    for (let i = 0; i < verts; i++) {
        const th = (i / verts) * Math.PI * 2;
        const sinT = Math.sin(th);
        const cosT = Math.cos(th);
        const nx = cosT < 0 ? nxLeft : nxRight;

        const cosPart = Math.pow(Math.abs(cosT), 2 / nx);
        const sinPart = Math.pow(Math.abs(sinT), 2 / ny);
        const rNorm = Math.pow(cosPart + sinPart, -0.5);

        let vx = cosT * rx * rNorm;
        let vy = sinT * ry * rNorm;

        const uY = (vy + ry) / (2 * ry);
        vx += skew * uY * uY * rx;

        rawPts.push({ x: center.x + vx, y: center.y + vy });
    }
    rawPts.push({ x: rawPts[0].x, y: rawPts[0].y });
    const hull = sliceAndSealGroundPolygon(rawPts, groundY, 'filletFlat', 12 + rng() * 6);

    let crease = null;
    if (enableCreases && rng() > 0.35) {
        const apexX = center.x + skew * rx * 0.3;
        const apexY = center.y - ry;
        crease = [
            { x: apexX, y: apexY },
            { x: apexX - dir * 15, y: center.y + ry * 0.15 },
            { x: apexX - dir * 25, y: groundY }
        ];
    }
    return { hull, crease };
}

// Mode 3: Whaleback & Roche Moutonnée
function genWhalebackHull(center, rx, ry, roughness, groundY, rng, enableCreases) {
    const dir = rng() > 0.5 ? 1 : -1;
    const bL = { x: center.x - rx * 0.95, y: groundY + 5 };
    const ramp1 = { x: center.x - dir * rx * 0.65, y: center.y - ry * 0.20 };
    const ramp2 = { x: center.x - dir * rx * 0.25, y: center.y - ry * 0.65 };
    const crown = { x: center.x + dir * rx * 0.20, y: center.y - ry * 1.02 };
    const leeBench = { x: center.x + dir * rx * 0.60, y: center.y - ry * 0.35 };
    const leeDrop = { x: center.x + dir * rx * 0.85, y: center.y + ry * 0.15 };
    const bR = { x: center.x + rx * 0.95, y: groundY + 5 };

    let keyPts = dir === 1 ? [bL, ramp1, ramp2, crown, leeBench, leeDrop, bR] : [bL, leeDrop, leeBench, crown, ramp2, ramp1, bR];
    const splinePts = sampleSpline(keyPts, 32);
    splinePts.push({ x: splinePts[0].x, y: splinePts[0].y });
    const hull = sliceAndSealGroundPolygon(splinePts, groundY, 'filletFlat', 14 + rng() * 6);

    let crease = null;
    if (enableCreases && rng() > 0.35) {
        crease = sampleSpline([
            { x: crown.x, y: crown.y },
            { x: crown.x + dir * 10, y: center.y - ry * 0.25 },
            { x: crown.x + dir * 18, y: groundY }
        ], 12);
    }
    return { hull, crease };
}

// Mode 4: Multi-Harmonic Polar Cam Curves (High Amplitude)
function genDeepHarmonicsHull(center, rx, ry, roughness, groundY, rng, enableCreases) {
    const verts = 32;
    const rawPts = [];
    const phi1 = rng() * Math.PI * 2;
    const phi2 = rng() * Math.PI * 2;
    const phi3 = rng() * Math.PI * 2;
    const peakTh = -Math.PI / 2 + (rng() - 0.5) * 0.6;

    for (let i = 0; i < verts; i++) {
        const th = (i / verts) * Math.PI * 2;
        const h1 = 0.32 * Math.cos(th - peakTh);
        const h2 = 0.18 * Math.sin(2 * th + phi1);
        const h3 = 0.15 * Math.cos(3 * th + phi2);
        const h5 = 0.08 * Math.sin(5 * th + phi3);
        const rNorm = Math.max(0.45, 1.0 + h1 + h2 + h3 + h5);

        const vx = center.x + Math.cos(th) * rx * rNorm;
        const vy = center.y + Math.sin(th) * ry * rNorm;
        rawPts.push({ x: vx, y: vy });
    }
    rawPts.push({ x: rawPts[0].x, y: rawPts[0].y });
    const hull = sliceAndSealGroundPolygon(rawPts, groundY, 'filletFlat', 12 + rng() * 6);

    let crease = null;
    if (enableCreases && rng() > 0.4) {
        crease = createInternalRidgeCrease(hull, rng);
    }
    return { hull, crease };
}

// Mode 5: Hybrid Whaleback & Compound Splines
function genWhalebackSplineHull(center, rx, ry, roughness, groundY, rng, enableCreases) {
    const dir = rng() > 0.5 ? 1 : -1;
    const bL = { x: center.x - rx * (0.95 + rng() * 0.05), y: groundY + 5 };
    const rampLow = { x: center.x - dir * rx * 0.68, y: center.y - ry * (0.15 + rng() * 0.10) };
    const rampMid = { x: center.x - dir * rx * 0.30, y: center.y - ry * (0.60 + rng() * 0.10) };
    const crown = { x: center.x + dir * rx * (0.15 + rng() * 0.15), y: center.y - ry * (1.00 + rng() * 0.08) };
    const leeShoulder = { x: center.x + dir * rx * (0.55 + rng() * 0.10), y: center.y - ry * (0.40 + rng() * 0.15) };
    const hollow = {
        x: center.x + dir * rx * (0.75 + rng() * 0.08) - dir * (5 + rng() * 6),
        y: center.y + ry * (0.15 + rng() * 0.10)
    };
    const bR = { x: center.x + rx * (0.95 + rng() * 0.05), y: groundY + 5 };

    let keyPts = dir === 1 ? [bL, rampLow, rampMid, crown, leeShoulder, hollow, bR] : [bL, hollow, leeShoulder, crown, rampMid, rampLow, bR];
    const splinePts = sampleSpline(keyPts, 32);
    splinePts.push({ x: splinePts[0].x, y: splinePts[0].y });
    const hull = sliceAndSealGroundPolygon(splinePts, groundY, 'filletFlat', 14 + rng() * 6);

    let crease = null;
    if (enableCreases && rng() > 0.35) {
        crease = sampleSpline([
            { x: crown.x, y: crown.y },
            { x: crown.x - dir * 12 + (rng() - 0.5) * 6, y: center.y - ry * 0.15 },
            { x: crown.x - dir * 18 + (rng() - 0.5) * 8, y: groundY }
        ], 14);
    }
    return { hull, crease };
}

function createDiverseHarmonicHull(center, rx, ry, roughness, archetype, baseMode, groundY, rng) {
    const verts = 24;
    const rawPts = [];
    const phi = rng() * Math.PI * 2;
    const phi2 = rng() * Math.PI * 2;

    let apexU = 0.5;
    if (archetype === 'leaningLeft') apexU = 0.28 + rng() * 0.10;
    else if (archetype === 'leaningRight') apexU = 0.62 + rng() * 0.10;
    else if (archetype === 'slab') apexU = 0.50;
    else if (archetype === 'wedge') apexU = 0.45 + (rng() - 0.5) * 0.20;

    for (let i = 0; i < verts; i++) {
        const th = (i / verts) * Math.PI * 2;
        let rNorm = 1.0;

        if (archetype === 'slab') {
            const sinT = Math.sin(th);
            if (sinT < 0) {
                rNorm = 0.85 + 0.12 * Math.cos(4 * th + phi);
            } else {
                rNorm = 0.95;
            }
        } else if (archetype === 'leaningLeft' || archetype === 'leaningRight') {
            rNorm = 1.0 + 0.28 * Math.cos(th - (apexU - 0.5) * Math.PI);
        } else if (archetype === 'wedge') {
            rNorm = 1.0 + 0.18 * Math.cos(3 * th + phi) + 0.10 * Math.sin(5 * th + phi2);
        } else {
            rNorm = 1.0 + 0.08 * Math.sin(2 * th + phi);
        }

        const noise = (rng() - 0.5) * roughness * 0.35;
        const r = Math.max(0.4, rNorm + noise);
        const vx = center.x + Math.cos(th) * rx * r;
        const vy = center.y + Math.sin(th) * ry * r;
        rawPts.push({ x: vx, y: vy });
    }

    rawPts.push({ x: rawPts[0].x, y: rawPts[0].y });

    if (baseMode === 'filletFlat') {
        const minY = Math.min(...rawPts.map(p => p.y));
        const maxY = Math.max(...rawPts.map(p => p.y));
        const targetBottom = groundY + 8 + rng() * 6;
        const scaleY = (targetBottom - minY) / (maxY - minY);
        for (const pt of rawPts) {
            pt.y = minY + (pt.y - minY) * scaleY;
        }
        return sliceAndSealGroundPolygon(rawPts, groundY, 'filletFlat', 10 + rng() * 6);
    } else {
        return sliceAndSealGroundPolygon(rawPts, groundY, 'curved', 0);
    }
}

function createInternalRidgeCrease(hull, rng) {
    let apexIdx = 0;
    let minApexY = Infinity;
    for (let i = 0; i < hull.length; i++) {
        if (hull[i].y < minApexY) {
            minApexY = hull[i].y;
            apexIdx = i;
        }
    }
    const apex = hull[apexIdx];

    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of hull) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    const hSpan = maxY - minApexY;
    const wSpan = maxX - minX;
    if (hSpan < 55 || wSpan < 65) return null;

    const crease = [apex];
    const steps = 3 + Math.floor(rng() * 2);
    let curX = apex.x;
    let curY = apex.y;
    const driftDir = rng() > 0.5 ? 1 : -1;

    for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        curY = apex.y + hSpan * t * (0.65 + rng() * 0.15);
        curX = apex.x + driftDir * wSpan * (0.08 * s + (rng() - 0.5) * 0.08);
        crease.push({ x: Math.round(curX * 10) / 10, y: Math.round(curY * 10) / 10 });
    }

    return crease;
}

function clipConvexPolyHalfPlane(poly, mx, my, nx, ny) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const cur = poly[i];
        const next = poly[(i + 1) % poly.length];
        const dCur = (cur.x - mx) * nx + (cur.y - my) * ny;
        const dNext = (next.x - mx) * nx + (next.y - my) * ny;
        if (dCur <= 1e-4) {
            out.push(cur);
        }
        if ((dCur <= 0 && dNext > 0) || (dCur > 0 && dNext <= 0)) {
            const t = dCur / (dCur - dNext);
            out.push({
                x: cur.x + (next.x - cur.x) * t,
                y: cur.y + (next.y - cur.y) * t
            });
        }
    }
    return out;
}

function stampSingleRock(pos, altKey) {
    const isPhysics = (document.getElementById('drawLayer')?.value === 'physics') || altKey;
    const targetLayer = isPhysics ? physicsLines : sceneryLines;

    let style = rockBrushType;
    if (style === 'random') {
        const styles = ['boulder', 'boulder', 'crag', 'slab', 'pebble'];
        style = styles[Math.floor(Math.random() * styles.length)];
    }

    const rng = Math.random;
    const rx = rockBrushSize * (style === 'pebble' ? (0.35 + rng() * 0.15) : (0.85 + rng() * 0.3));
    const ry = style === 'crag'
        ? rx * (1.6 + rng() * 0.6)
        : (style === 'slab' ? rx * (0.45 + rng() * 0.2) : rx * (0.85 + rng() * 0.3));

    const effectiveRoughness = (rockBrushRoughness || 0.5) * 0.20;
    const hull = createRockHull(pos, rx, ry, effectiveRoughness, style, rng, null);

    const clippedPolys = clipPolylineAgainstOccluders(hull, currentRockBrushStrokeHulls);
    for (const poly of clippedPolys) {
        if (poly.length >= 2) targetLayer.push(poly);
    }

    currentRockBrushStrokeHulls.push(hull);
    lastRockBrushPos = { x: pos.x, y: pos.y };

    if (isPhysics) bumpPhysics();
    else bumpTrackVersion();
    updateStatusBar();
    drawMinimap();
    draw();
}

function runRockClusterGen(p, isPreview) {
    const isPhysics = (p.layerTarget === 'physics');
    let targetLayer = isPhysics ? physicsLines : sceneryLines;

    if (p.removegray) {
        if (isPhysics) physicsLines.length = 0;
        else sceneryLines.length = 0;
    }

    const seed = parseInt(p.seed) || 42;
    const rng = getRNG(seed);
    const clusterWidth = parseFloat(p.clusterWidth) || parseFloat(p.spanWidth) || 1200;
    const peakHeight = parseFloat(p.peakHeight) || 260;
    const rockCount = parseInt(p.rockCount) || 45;
    const rawRoughness = parseFloat(p.roughness) ?? 0.5;
    const roughness = rawRoughness * 0.20;
    const pebbleRatio = (parseFloat(p.pebbleRatio) || 0) / 100;
    const enableCreases = (p.creases !== undefined) ? !!p.creases : true;
    const genType = p.genType || p.approach || 'whalebackSpline';

    // Determine cluster center X and ground baseline Y
    let xCenter = camX;
    let groundY = 500;

    if (selection.fragments.length > 0) {
        let minX = Infinity, maxX = -Infinity, sumY = 0, countY = 0;
        for (const frag of selection.fragments) {
            const poly = frag.poly;
            for (let i = frag.startIndex; i <= frag.endIndex && i < poly.length; i++) {
                const pt = poly[i];
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                sumY += pt.y; countY++;
            }
        }
        if (countY > 0) {
            xCenter = (minX + maxX) / 2;
            groundY = sumY / countY;
        }
    } else {
        // Look for ground lines under cluster span using continuous segment interpolation
        const halfW = clusterWidth / 2;
        let groundPts = [];
        const checkLines = physicsLines.length > 0 ? physicsLines : sceneryLines;
        for (const poly of checkLines) {
            for (let i = 0; i < poly.length - 1; i++) {
                const p1 = poly[i], p2 = poly[i + 1];
                const minSx = Math.min(p1.x, p2.x), maxSx = Math.max(p1.x, p2.x);
                if (maxSx >= xCenter - halfW && minSx <= xCenter + halfW) {
                    if (minSx <= xCenter && maxSx >= xCenter && maxSx > minSx) {
                        const t = (xCenter - p1.x) / (p2.x - p1.x);
                        groundPts.push(p1.y + t * (p2.y - p1.y));
                    }
                    const xL = Math.max(minSx, xCenter - halfW);
                    const tL = (maxSx === minSx) ? 0.5 : (xL - p1.x) / (p2.x - p1.x);
                    groundPts.push(p1.y + tL * (p2.y - p1.y));

                    const xR = Math.min(maxSx, xCenter + halfW);
                    const tR = (maxSx === minSx) ? 0.5 : (xR - p1.x) / (p2.x - p1.x);
                    groundPts.push(p1.y + tR * (p2.y - p1.y));
                }
            }
        }
        if (groundPts.length > 0) {
            groundPts.sort((a, b) => a - b);
            groundY = groundPts[Math.floor(groundPts.length * 0.75)];
        } else {
            groundY = Math.round(camY + 150);
        }
    }

    const rocks = [];

    if (genType === 'weatheredGranite') {
        // Reference Match Outcrop: Spires, Slabs, Leaning Blocks & Pillows
        function getGraniteElevation(u) {
            const spirePeak = Math.exp(-Math.pow((u - 0.23) / 0.05, 2)) * 0.92;
            const centralPeak = Math.exp(-Math.pow((u - 0.52) / 0.16, 2)) * 1.05;
            const rightShoulder = Math.exp(-Math.pow((u - 0.75) / 0.14, 2)) * 0.45;
            const baseCurve = Math.sin(Math.PI * Math.max(0, Math.min(1, u))) * 0.35;
            return Math.max(0.18, spirePeak + centralPeak + rightShoulder + baseCurve);
        }

        // 1. Foundation stratum: broad low-profile flat slabs along baseline (ground stones)
        const foundationCount = Math.max(8, Math.round(clusterWidth / 120));
        for (let i = 0; i < foundationCount; i++) {
            const u = (i + 0.5 + (rng() - 0.5) * 0.30) / foundationCount;
            const cx = xCenter + (u - 0.5) * clusterWidth * 0.98;
            const rx = 75 + rng() * 40;
            const ry = 16 + rng() * 8;
            const cy = groundY - ry * 0.85;
            const { hull, crease } = genWeatheredGraniteRock({ x: cx, y: cy }, rx, ry, 'flatSlab', roughness, groundY, rng, false);
            rocks.push({ hull, crease, baseDepth: 3, cx, cy });
        }

        // 2. Tiers: background peaks, midground ridge massifs, foreground stepping ledges
        const bgCount = Math.max(5, Math.round(rockCount * 0.22));
        const midCount = Math.max(8, Math.round(rockCount * 0.38));
        const fgCount = Math.max(10, Math.round(rockCount * 0.40));

        // Background Peaks (Tier 0: depth 0)
        for (let i = 0; i < bgCount; i++) {
            const u = (i + 0.5 + (rng() - 0.5) * 0.35) / bgCount;
            const cx = xCenter + (u - 0.5) * clusterWidth * 0.94;
            const macroH = peakHeight * getGraniteElevation(u);
            const pH = macroH * (0.95 + rng() * 0.25);

            let arch = 'leaningBlock';
            let rx = 50 + rng() * 20;
            let ry = pH * 0.42;

            // Spire zone on left flank (near u = 0.23)
            if (Math.abs(u - 0.23) < 0.08) {
                arch = 'spire';
                rx = 32 + rng() * 10;
                ry = pH * (0.42 + rng() * 0.08);
            } else if (Math.abs(u - 0.52) < 0.10 && rng() > 0.4) {
                arch = 'spire';
                rx = 38 + rng() * 12;
                ry = pH * (0.40 + rng() * 0.08);
            } else if (rng() > 0.55) {
                arch = 'pillowBoulder';
                rx = 52 + rng() * 20;
                ry = pH * 0.40;
            }

            const cy = groundY - ry * 0.95;
            const { hull, crease } = genWeatheredGraniteRock({ x: cx, y: cy }, rx, ry, arch, roughness, groundY, rng, enableCreases);
            rocks.push({ hull, crease, baseDepth: 0, cx, cy });
        }

        // Midground Ridge (Tier 1: depth 1)
        for (let i = 0; i < midCount; i++) {
            const u = (i + 0.5 + (rng() - 0.5) * 0.35) / midCount;
            const cx = xCenter + (u - 0.5) * clusterWidth * 0.94;
            const macroH = peakHeight * getGraniteElevation(u) * 0.78;
            const pH = macroH * (0.85 + rng() * 0.25);

            let arch = 'leaningBlock';
            let rx = 48 + rng() * 25;
            let ry = pH * 0.38;

            // Bike saddle shelf zone near u = 0.31
            if (Math.abs(u - 0.31) < 0.07) {
                arch = 'flatSlab';
                rx = 70 + rng() * 25;
                ry = 26 + rng() * 10;
            } else if (u > 0.68) {
                arch = rng() > 0.4 ? 'pillowBoulder' : 'leaningBlock';
                rx = 42 + rng() * 20;
                ry = pH * 0.35;
            } else if (rng() > 0.5) {
                arch = 'flatSlab';
                rx = 65 + rng() * 25;
                ry = pH * 0.32;
            }

            const cy = groundY - ry * 0.95;
            const { hull, crease } = genWeatheredGraniteRock({ x: cx, y: cy }, rx, ry, arch, roughness, groundY, rng, enableCreases);
            rocks.push({ hull, crease, baseDepth: 1, cx, cy });
        }

        // Foreground Ledges & Interlocking Front Blocks (Tier 2: depth 2)
        for (let i = 0; i < fgCount; i++) {
            const u = (i + 0.5 + (rng() - 0.5) * 0.35) / fgCount;
            const cx = xCenter + (u - 0.5) * clusterWidth * 0.96;
            const macroH = peakHeight * getGraniteElevation(u) * 0.52;
            const pH = macroH * (0.85 + rng() * 0.25);

            const roll = rng();
            let arch = 'flatSlab';
            let rx = 58 + rng() * 25;
            let ry = Math.max(18, pH * 0.32);

            if (roll > 0.65) {
                arch = 'pillowBoulder';
                rx = 38 + rng() * 18;
                ry = Math.max(20, pH * 0.35);
            } else if (roll > 0.35) {
                arch = 'leaningBlock';
                rx = 45 + rng() * 20;
                ry = Math.max(22, pH * 0.38);
            }

            const cy = groundY - ry * 0.95;
            const { hull, crease } = genWeatheredGraniteRock({ x: cx, y: cy }, rx, ry, arch, roughness, groundY, rng, enableCreases);
            rocks.push({ hull, crease, baseDepth: 2, cx, cy });
        }

        // Scree / minor base stones (only if pebbleRatio > 0)
        if (pebbleRatio > 0.05) {
            const numScree = Math.max(4, Math.round(rockCount * pebbleRatio));
            for (let i = 0; i < numScree; i++) {
                const u = (i + 0.5 + (rng() - 0.5) * 0.40) / numScree;
                const cx = xCenter + (u - 0.5) * clusterWidth * 0.98;
                const rx = 14 + rng() * 12;
                const ry = 8 + rng() * 6;
                const cy = groundY - ry * 0.85;
                const { hull, crease } = genWeatheredGraniteRock({ x: cx, y: cy }, rx, ry, 'pillowBoulder', roughness, groundY, rng, false);
                rocks.push({ hull, crease, baseDepth: 4, cx, cy });
            }
        }
    } else if (genType !== 'harmonicField') {
        const phi1 = rng() * Math.PI * 2;
        const phi2 = rng() * Math.PI * 2;
        function getElevation(u) {
            const bell = Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
            const wave1 = 0.30 * Math.sin(u * Math.PI * 2 + phi1);
            const wave2 = 0.15 * Math.cos(u * Math.PI * 4 + phi2);
            return Math.max(0.25, (0.55 + wave1 + wave2) * Math.pow(bell, 0.6));
        }

        let hullGen = genWhalebackSplineHull;
        if (genType === 'splineCurvature') hullGen = genSplineCurvatureHull;
        else if (genType === 'asymmLame') hullGen = genAsymmLameHull;
        else if (genType === 'whaleback') hullGen = genWhalebackHull;
        else if (genType === 'deepHarmonics') hullGen = genDeepHarmonicsHull;

        // Foundation stratum: broad low-profile bedrock whaleback slabs along horizon
        const foundationCount = Math.max(7, Math.round(clusterWidth / 140));
        for (let i = 0; i < foundationCount; i++) {
            const u = (i + 0.5 + (rng() - 0.5) * 0.25) / foundationCount;
            const cx = xCenter + (u - 0.5) * clusterWidth * 0.96;
            const rx = 90 + rng() * 45;
            const ry = 20 + rng() * 10;
            const cy = groundY - ry * 0.85;
            const { hull, crease } = hullGen({ x: cx, y: cy }, rx, ry, roughness, groundY, rng, false);
            rocks.push({ hull, crease, baseDepth: 3, cx, cy });
        }

        // Tiers: background peaks, midground massifs, foreground ledge blocks
        const tiers = [
            { depth: 0, count: Math.max(5, Math.round(rockCount * 0.22)), hFactor: 1.05, rxMin: 85, rxMax: 125 },
            { depth: 1, count: Math.max(7, Math.round(rockCount * 0.32)), hFactor: 0.80, rxMin: 70, rxMax: 105 },
            { depth: 2, count: Math.max(9, Math.round(rockCount * 0.38)), hFactor: 0.55, rxMin: 55, rxMax: 85 }
        ];

        for (const t of tiers) {
            for (let i = 0; i < t.count; i++) {
                const u = (i + 0.5 + (rng() - 0.5) * 0.35) / t.count;
                const cx = xCenter + (u - 0.5) * clusterWidth * 0.94;
                const macroH = peakHeight * getElevation(u) * t.hFactor;
                const pH = macroH * (0.85 + rng() * 0.30);
                const rx = t.rxMin + rng() * (t.rxMax - t.rxMin);
                const ry = pH * 0.55;
                const cy = groundY - ry * 0.95;
                const { hull, crease } = hullGen({ x: cx, y: cy }, rx, ry, roughness, groundY, rng, enableCreases);
                rocks.push({ hull, crease, baseDepth: t.depth, cx, cy });
            }
        }

        // Minor pebble / scree (only if pebbleRatio > 0)
        if (pebbleRatio > 0.05) {
            const numScree = Math.max(4, Math.round(rockCount * pebbleRatio));
            for (let i = 0; i < numScree; i++) {
                const u = (i + 0.5 + (rng() - 0.5) * 0.40) / numScree;
                const cx = xCenter + (u - 0.5) * clusterWidth * 0.98;
                const rx = 14 + rng() * 12;
                const ry = 8 + rng() * 6;
                const cy = groundY - ry * 0.85;
                const { hull, crease } = hullGen({ x: cx, y: cy }, rx, ry, roughness, groundY, rng, false);
                rocks.push({ hull, crease, baseDepth: 4, cx, cy });
            }
        }
    } else {
        // Macro-elevation field creates authentic continuous ridgelines and mountain saddles
        const phi1 = rng() * Math.PI * 2;
        const phi2 = rng() * Math.PI * 2;
        function getElevation(u) {
            const wave1 = 0.35 * Math.sin(u * Math.PI * 2 + phi1);
            const wave2 = 0.18 * Math.cos(u * Math.PI * 4 + phi2);
            const wave3 = 0.10 * Math.sin(u * Math.PI * 6);
            return Math.max(0.25, 0.65 + wave1 + wave2 + wave3);
        }

        const archetypes = ['slab', 'leaningLeft', 'leaningRight', 'wedge', 'dome'];

        const tiers = [
            { depth: 0, count: Math.max(4, Math.round(clusterWidth / 260)), hFactor: 1.05, rxMin: 85, rxMax: 125, base: 'curved', addCrease: true },
            { depth: 1, count: Math.max(6, Math.round(rockCount * 0.20)), hFactor: 0.78, rxMin: 70, rxMax: 105, base: 'curved', addCrease: true },
            { depth: 2, count: Math.max(8, Math.round(rockCount * 0.28)), hFactor: 0.52, rxMin: 55, rxMax: 85, base: 'filletFlat', addCrease: false },
            { depth: 3, count: Math.max(10, Math.round(rockCount * 0.35)), hFactor: 0.30, rxMin: 35, rxMax: 65, base: 'filletFlat', addCrease: false }
        ];

        for (const t of tiers) {
            for (let i = 0; i < t.count; i++) {
                const u = (i + 0.5 + (rng() - 0.5) * 0.35) / t.count;
                const cx = xCenter + (u - 0.5) * clusterWidth * 0.94;
                const macroH = peakHeight * getElevation(u) * t.hFactor;
                const pH = macroH * (0.85 + rng() * 0.30);
                const rx = t.rxMin + rng() * (t.rxMax - t.rxMin);
                const ry = pH * 0.55;
                const cy = groundY - ry * 0.95;
                const arch = archetypes[Math.floor(rng() * archetypes.length)];
                const baseMode = (t.base === 'filletFlat' && rng() > 0.35) ? 'filletFlat' : 'curved';
                const hull = createDiverseHarmonicHull({ x: cx, y: cy }, rx, ry, roughness, arch, baseMode, groundY, rng);

                let crease = null;
                if (enableCreases && t.addCrease && (arch === 'leaningLeft' || arch === 'leaningRight' || arch === 'wedge' || rng() > 0.4)) {
                    crease = createInternalRidgeCrease(hull, rng);
                }

                rocks.push({ hull, crease, baseDepth: t.depth, cx, cy });
            }
        }

        // Scree / Talus fringe based on pebbleRatio slider
        if (pebbleRatio > 0.05) {
            const numScree = Math.max(6, Math.round(rockCount * pebbleRatio * 1.2));
            for (let i = 0; i < numScree; i++) {
                const u = (i + 0.5 + (rng() - 0.5) * 0.45) / numScree;
                const cx = xCenter + (u - 0.5) * clusterWidth * 0.98;
                const rx = 10 + rng() * 12;
                const ry = 6 + rng() * 8;
                const cy = groundY - ry * (0.75 + rng() * 0.20);
                const arch = rng() > 0.5 ? 'slab' : 'dome';
                const baseMode = rng() > 0.3 ? 'filletFlat' : 'curved';
                const hull = createDiverseHarmonicHull({ x: cx, y: cy }, rx, ry, 0.40, arch, baseMode, groundY, rng);
                rocks.push({ hull, crease: null, baseDepth: 4, cx, cy });
            }
        }
    }

    // Unbiased depth jitter (eliminates directional left-occluding-right bias)
    for (const r of rocks) {
        const rawDepth = (r.effectiveDepth !== undefined) ? r.effectiveDepth :
                         (r.depth !== undefined) ? r.depth : (r.baseDepth || 0);
        r.effectiveDepth = rawDepth + (rng() - 0.5) * 0.88;
    }
    rocks.sort((a, b) => b.effectiveDepth - a.effectiveDepth);

    const groundOccluder = [
        { x: -50000, y: groundY + 0.5 },
        { x: 50000, y: groundY + 0.5 },
        { x: 50000, y: groundY + 10000 },
        { x: -50000, y: groundY + 10000 },
        { x: -50000, y: groundY + 0.5 }
    ];

    const occluders = [groundOccluder];
    const generatedPolys = [];
    for (const r of rocks) {
        const isScree = (r.baseDepth >= 4);
        const minFrag = isScree ? 5 : 10;
        const perims = clipPolylineAgainstOccluders(r.hull, occluders, minFrag, groundY);
        for (const p of perims) {
            if (p.length >= 2) {
                // T-junction endpoint snapping: snap to groundY or nearest occluder edge
                for (const endIdx of [0, p.length - 1]) {
                    const pt = p[endIdx];
                    if (Math.abs(pt.y - groundY) < 5.0) {
                        pt.y = groundY;
                    } else {
                        for (const occ of occluders) {
                            for (let k = 0; k < occ.length - 1; k++) {
                                const p1 = occ[k], p2 = occ[k + 1];
                                const d = distPtToSegment(pt.x, pt.y, p1.x, p1.y, p2.x, p2.y);
                                if (d < 6.0) {
                                    const dx = p2.x - p1.x, dy = p2.y - p1.y;
                                    const lenSq = dx * dx + dy * dy;
                                    if (lenSq > 1e-4) {
                                        let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
                                        t = Math.max(0, Math.min(1, t));
                                        pt.x = Math.round((p1.x + t * dx) * 10) / 10;
                                        pt.y = Math.round((p1.y + t * dy) * 10) / 10;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
                generatedPolys.push(p);
            }
        }
        if (r.crease && r.crease.length >= 2) {
            const clippedCreases = clipPolylineAgainstOccluders(r.crease, occluders, 10, groundY);
            for (const cc of clippedCreases) {
                if (cc.length >= 2) generatedPolys.push(cc);
            }
        }
        occluders.push(r.hull);
    }

    for (const p of generatedPolys) {
        targetLayer.push(p);
    }

    if (isPhysics) {
        bumpPhysics();
    } else {
        originalSceneryLines = JSON.parse(JSON.stringify(sceneryLines));
        sceneryDirty = false;
        bumpTrackVersion();
    }

    updateStatusBar();
    drawMinimap();
    draw();

    if (!isPreview) {
        toast(`Generated ${rocks.length} rocks with ${generatedPolys.length} strokes! ✓`, 'success', 2500);
    }
}

let liveUpdateTimeout = null;

function buildUI() {
    const container = document.getElementById('scriptParams');
    container.innerHTML = "";
    const script = scriptConfig[document.getElementById('scriptSelect').value];
    if (!script) return;
    for (const key in script.params) {
        const config = script.params[key];
        const row = document.createElement('div');
        row.className = config.type === 'checkbox' ? 'param-row checkbox-row' : 'param-row';
        if (config.type === 'range') {
            const input = document.createElement('input');
            input.id = 'param_' + key;
            const label = document.createElement('label');
            label.innerHTML = '<span>' + config.label + '</span> <span id="val_' + key + '">' + config.value + '</span>';
            row.appendChild(label);
            input.type = 'range'; input.min = config.min; input.max = config.max; input.step = config.step; input.value = config.value;
            (function (k) {
                input.addEventListener('input', (e) => {
                    document.getElementById('val_' + k).textContent = e.target.value;
                    saveSettings();
                    if (document.getElementById('liveUpdate').checked) {
                        clearTimeout(liveUpdateTimeout);
                        liveUpdateTimeout = setTimeout(() => executeScript(true), 150);
                    }
                });
            })(key);
            row.appendChild(input);
        } else if (config.type === 'select') {
            const label = document.createElement('label');
            label.textContent = config.label;
            const select = document.createElement('select');
            select.id = 'param_' + key;
            for (const opt of config.options) {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                if (opt.value === config.value) o.selected = true;
                select.appendChild(o);
            }
            select.addEventListener('change', () => {
                saveSettings();
                if (document.getElementById('liveUpdate').checked) {
                    clearTimeout(liveUpdateTimeout);
                    liveUpdateTimeout = setTimeout(() => executeScript(true), 100);
                }
            });
            row.appendChild(label);
            row.appendChild(select);
        } else if (config.type === 'checkbox') {
            const input = document.createElement('input');
            input.id = 'param_' + key;
            input.type = 'checkbox'; input.checked = config.value;
            const label = document.createElement('label');
            label.textContent = config.label; label.style.cursor = 'pointer';
            label.addEventListener('click', () => input.click());
            input.addEventListener('change', () => { 
                saveSettings(); 
                if (document.getElementById('liveUpdate').checked) {
                    clearTimeout(liveUpdateTimeout);
                    liveUpdateTimeout = setTimeout(() => executeScript(true), 150);
                }
            });
            row.appendChild(input); row.appendChild(label);
        } else if (config.type === 'point') {
            const label = document.createElement('label');
            label.textContent = config.label;
            row.appendChild(label);

            const coordsRow = document.createElement('div');
            coordsRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';
            const mkCoordInput = (id, axis, val) => {
                const sp = document.createElement('span');
                sp.textContent = axis.toUpperCase() + ':';
                sp.style.cssText = 'font-size:0.75rem; font-weight:700;';
                const inp = document.createElement('input');
                inp.type = 'number'; inp.id = id; inp.step = 10; inp.value = Math.round(val);
                inp.style.cssText = 'flex:1; margin:0; padding:4px 6px; font-size:0.78rem;';
                inp.addEventListener('input', () => {
                    const num = parseFloat(inp.value);
                    if (!Number.isFinite(num)) return;
                    perspShadePoint[axis] = Math.round(num);
                    saveSettings();
                    draw();
                    if (document.getElementById('liveUpdate').checked) {
                        clearTimeout(liveUpdateTimeout);
                        liveUpdateTimeout = setTimeout(() => executeScript(true), 150);
                    }
                });
                coordsRow.appendChild(sp);
                coordsRow.appendChild(inp);
            };
            mkCoordInput('perspShadeXInput', 'x', perspShadePoint.x);
            mkCoordInput('perspShadeYInput', 'y', perspShadePoint.y);
            row.appendChild(coordsRow);

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex; gap:5px; align-items:center;';
            const pickBtn = document.createElement('button');
            pickBtn.type = 'button';
            pickBtn.id = 'perspShadePickBtn';
            pickBtn.className = 'primary-btn';
            pickBtn.style.cssText = 'flex:2; padding:5px 6px; font-size:0.72rem; margin:0;';
            pickBtn.textContent = isPickingShadePoint ? 'Click Grid… (Esc)' : 'Pick Point on Grid';
            pickBtn.classList.toggle('active', isPickingShadePoint);
            pickBtn.addEventListener('click', () => setPickShadePointMode(!isPickingShadePoint));
            btnRow.appendChild(pickBtn);

            const snapOriginTo = (tx, ty, msg) => {
                perspShadePoint.x = Math.round(tx);
                perspShadePoint.y = Math.round(ty);
                setPickShadePointMode(false);
                syncPerspShadePointUI();
                saveSettings();
                if (document.getElementById('liveUpdate').checked) executeScript(true);
                else draw();
                toast(msg, 'info', 1200);
            };
            const vp1Btn = document.createElement('button');
            vp1Btn.type = 'button'; vp1Btn.className = 'primary-btn';
            vp1Btn.textContent = 'VP1'; vp1Btn.title = 'Snap Shade Point to VP1';
            vp1Btn.style.cssText = 'flex:0.7; padding:5px 4px; font-size:0.7rem; margin:0;';
            vp1Btn.addEventListener('click', () => snapOriginTo(perspectiveGrid.vp1.x, perspectiveGrid.vp1.y, 'Shade point set to VP1'));
            btnRow.appendChild(vp1Btn);

            const vp2Btn = document.createElement('button');
            vp2Btn.type = 'button'; vp2Btn.className = 'primary-btn';
            vp2Btn.textContent = 'VP2'; vp2Btn.title = 'Snap Shade Point to VP2';
            vp2Btn.style.cssText = 'flex:0.7; padding:5px 4px; font-size:0.7rem; margin:0;';
            vp2Btn.addEventListener('click', () => snapOriginTo(perspectiveGrid.vp2.x, perspectiveGrid.vp2.y, 'Shade point set to VP2'));
            btnRow.appendChild(vp2Btn);

            row.appendChild(btnRow);
        }
        container.appendChild(row);
    }
}

function executeScript(skipSnapshot) {
    const scriptKey = document.getElementById('scriptSelect').value;
    if (physicsLines.length === 0 && scriptKey !== 'rollers' && scriptKey !== 'vectorizer' && scriptKey !== 'rocks') {
        if (!skipSnapshot) toast('No track loaded.', 'error');
        return;
    }
    const isScenTarget = scriptKey === 'rollers'
        ? document.getElementById('param_isScenery')?.checked
        : (scriptKey === 'rocks'
            ? document.getElementById('param_layerTarget')?.value !== 'physics'
            : true);
    if (!skipSnapshot && isLayerLocked(isScenTarget ? 'scenery' : 'physics')) return;
    const params = {};
    const script = scriptConfig[scriptKey];
    if (!script) return;
    for (const key in script.params) {
        const config = script.params[key];
        if (config.type === 'point') continue;
        const el = document.getElementById('param_' + key);
        if (!el) continue;
        if (config.type === 'checkbox') params[key] = el.checked;
        else if (config.type === 'select') params[key] = el.value;
        else params[key] = parseFloat(el.value);
    }
    if (!skipSnapshot) snapshot();
    script.run(params, skipSnapshot);
    bumpTrackVersion();
}

document.getElementById('scriptSelect').addEventListener('change', () => {
    if (isPickingShadePoint) setPickShadePointMode(false);
    buildUI();
    saveSettings();
    draw();
});
document.getElementById('runScriptBtn').addEventListener('click', () => executeScript(false));
document.getElementById('liveUpdate').addEventListener('change', saveSettings);

document.getElementById('applySceneryBtn').addEventListener('click', () => {
    if (physicsLines.length === 0 && sceneryLines.length === 0) { toast('No lines to apply!', 'error'); return; }
    snapshot();
    originalSceneryLines = clonePolysFast(sceneryLines);
    sceneryDirty = false; bumpTrackVersion(); updatePreviewBadge();
    toast('Scenery applied.', 'success'); draw();
});

document.getElementById('resetSceneryBtn').addEventListener('click', () => {
    if (isLayerLocked('scenery')) return;
    snapshot();
    sceneryLines = clonePolysFast(originalSceneryLines);
    sceneryDirty = false; bumpTrackVersion(); updatePreviewBadge(); draw();
});

// ==========================================
// FILE LOADING / EXPORT & DESKTOP INTEGRATION
// ==========================================

let currentLoadedFilePath = null;

function loadTrackData(rawText, fileName, filePath = null) {
    if (!rawText || typeof rawText !== 'string') return;
    snapshot();
    const parts = rawText.trim().split('#');
    physicsLines = parseSection(parts[0]);
    originalSceneryLines = parseSection(parts[1]);
    sceneryLines = JSON.parse(JSON.stringify(originalSceneryLines));
    powerupsStr = parts[2] || ""; metadataStr = parts[3] || "";
    bumpPhysics(); sceneryDirty = false;
    isDirty = false;
    currentLoadedFileName = fileName || 'track.txt';
    currentLoadedFilePath = filePath || null;
    if (window.electronAPI && window.electronAPI.setDirty) {
        window.electronAPI.setDirty(false, currentLoadedFileName);
    }
    maskGrid.clear();
    clearSelection();
    updatePreviewBadge();
    fitToView();
    if (typeof addRecentTrack === 'function') addRecentTrack(currentLoadedFileName, currentLoadedFilePath, rawText);
    toast('Loaded ' + physicsLines.length + ' physics / ' + originalSceneryLines.length + ' scenery.', 'success');
}

function getTrackExportString() {
    return encodeSection(physicsLines) + "#" + encodeSection(sceneryDirty ? originalSceneryLines : sceneryLines) + "#" + powerupsStr + "#" + metadataStr;
}

async function exportTrackToFile() {
    if (physicsLines.length === 0 && sceneryLines.length === 0) { toast('No track lines to save!', 'error'); return false; }
    const outStr = getTrackExportString();

    if (window.electronAPI && window.electronAPI.saveTrack) {
        try {
            const res = await window.electronAPI.saveTrack(outStr, currentLoadedFileName || 'modified_track.txt');
            if (res && !res.canceled) {
                isDirty = false;
                currentLoadedFileName = res.filename;
                currentLoadedFilePath = res.filePath;
                if (window.electronAPI.setDirty) window.electronAPI.setDirty(false, currentLoadedFileName);
                if (typeof addRecentTrack === 'function') addRecentTrack(currentLoadedFileName, res.filePath);
                toast('Track saved to ' + res.filename, 'success', 2500);
                return true;
            }
            return false;
        } catch (err) {
            toast('Save failed: ' + err.message, 'error', 4000);
            return false;
        }
    } else {
        const blob = new Blob([outStr], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = currentLoadedFileName || 'modified_track.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        isDirty = false;
        return true;
    }
}

async function savePngSnapshot() {
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tCtx.drawImage(canvas, 0, 0);

        const defaultPngName = (currentLoadedFileName ? currentLoadedFileName.replace(/\.[^/.]+$/, "") : 'track') + '_' + Date.now() + '.png';

        if (window.electronAPI && window.electronAPI.savePng) {
            const dataUrl = tempCanvas.toDataURL('image/png');
            const res = await window.electronAPI.savePng(dataUrl, defaultPngName);
            if (res && !res.canceled) {
                toast('PNG saved to ' + (res.filePath ? res.filePath.split(/[\\/]/).pop() : 'disk'), 'success', 2000);
            }
        } else {
            tempCanvas.toBlob((blob) => {
                if (!blob) { toast('Failed to generate PNG.', 'error'); return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = defaultPngName;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1500);
                toast('PNG exported.', 'success', 1500);
            }, 'image/png');
        }
    } catch (err) {
        toast('PNG export failed: ' + err.message, 'error', 4000);
    }
}

async function promptOpenTrack() {
    if (window.electronAPI && window.electronAPI.openTrack) {
        const res = await window.electronAPI.openTrack();
        if (res && !res.canceled && res.content) {
            loadTrackData(res.content, res.filename, res.filePath);
        }
    } else {
        document.getElementById('fileInput').click();
    }
}

function handleNewTrack() {
    if (isDirty && (physicsLines.length > 0 || sceneryLines.length > 0)) {
        if (!confirm('Discard unsaved changes and start a new track?')) return;
    }
    snapshot();
    physicsLines = [];
    originalSceneryLines = [];
    sceneryLines = [];
    powerupsStr = "";
    metadataStr = "";
    bumpPhysics();
    sceneryDirty = false;
    isDirty = false;
    currentLoadedFileName = 'untitled.txt';
    currentLoadedFilePath = null;
    if (window.electronAPI && window.electronAPI.setDirty) {
        window.electronAPI.setDirty(false, currentLoadedFileName);
    }
    maskGrid.clear();
    clearSelection();
    updatePreviewBadge();
    resetView();
    draw();
    toast('New track started.', 'success', 1500);
}

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        loadTrackData(event.target.result, file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
});

document.getElementById('exportBtn').addEventListener('click', () => {
    exportTrackToFile();
});

document.getElementById('savePngBtn').addEventListener('click', () => {
    savePngSnapshot();
});

document.getElementById('validateBtn').addEventListener('click', () => {
    const issues = [];
    if (physicsLines.length === 0) issues.push('No physics lines.');
    for (const poly of physicsLines) {
        if (poly.length < 2) issues.push('Physics polyline has only ' + poly.length + ' point(s).');
        for (const pt of poly) {
            if (!isFinite(pt.x) || !isFinite(pt.y)) { issues.push('Non-finite coordinate detected.'); break; }
        }
    }
    if (issues.length === 0) toast('Track looks valid ✓', 'success', 2500);
    else toast(issues.slice(0, 3).join(' · '), 'error', 5000);
});

// ==========================================
// CAMERA
// ==========================================
function fitToView() {
    const allPts = [];
    for (const poly of physicsLines) for (const pt of poly) allPts.push(pt);
    for (const poly of sceneryLines) for (const pt of poly) allPts.push(pt);
    if (allPts.length === 0) { camX = 0; camY = 0; zoom = 0.5; }
    else {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const pt of allPts) {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        }
        const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
        const margin = 1.15;
        zoom = Math.min(viewW / (w * margin), viewH / (h * margin));
        zoom = Math.max(0.02, Math.min(zoom, 5));
        camX = (minX + maxX) / 2; camY = (minY + maxY) / 2;
    }
    document.getElementById('zoomVal').textContent = zoom.toFixed(2); draw();
}

function setZoom(nextZoom) {
    zoom = Math.max(0.02, Math.min(10, nextZoom));
    const zv = document.getElementById('zoomVal');
    if (zv) zv.textContent = zoom.toFixed(2);
    draw();
}

function resetView() {
    camX = 0;
    camY = 0;
    setZoom(0.5);
}

document.getElementById('fitViewBtn').addEventListener('click', fitToView);
document.getElementById('resetViewBtn').addEventListener('click', resetView);

// ==========================================
// SHAPE / FILL
// ==========================================
function finalizeShape(altKey) {
    if (shapeRadius < 5) { shapeState = 'idle'; draw(); return; }
    const sides = currentTool === 'circle'
        ? Math.max(24, Math.floor(shapeRadius / 10))
        : Math.max(3, Math.min(50, parseInt(document.getElementById('polySides').value) || 6));
    const points = [];
    for (let i = 0; i < sides; i++) {
        const angle = shapeRotation + (2 * Math.PI * i) / sides - Math.PI / 2;
        points.push({ x: shapeCenter.x + Math.cos(angle) * shapeRadius, y: shapeCenter.y + Math.sin(angle) * shapeRadius });
    }
    points.push({ x: points[0].x, y: points[0].y });
    const fragments = fragmentPointsWithPattern(points, altKey);
    if (fragments) commitFragments(fragments);
    shapeState = 'idle';
    draw();
}

function clipHatchLinesToTrackSegments(boundarySegmentsOrRegion, isInsideCheck, angleRad, density, isFullMode, maybeRegion) {
    let boundarySegments = boundarySegmentsOrRegion;
    let insideFn = isInsideCheck;
    let region = maybeRegion;

    if (boundarySegmentsOrRegion && boundarySegmentsOrRegion.boundarySegments) {
        boundarySegments = boundarySegmentsOrRegion.boundarySegments;
        insideFn = boundarySegmentsOrRegion.isInsideCheck;
        region = boundarySegmentsOrRegion;
    }
    if (!boundarySegments || boundarySegments.length === 0) return [];

    const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
    const nx = -sinA, ny = cosA;

    // Normal projection bounds derived directly from the filled region if available
    let minP = Infinity, maxP = -Infinity;
    if (region && region.rMinX !== undefined) {
        const corners = [
            { x: region.rMinX, y: region.rMinY },
            { x: region.rMaxX, y: region.rMinY },
            { x: region.rMaxX, y: region.rMaxY },
            { x: region.rMinX, y: region.rMaxY }
        ];
        for (const c of corners) {
            const p = c.x * nx + c.y * ny;
            if (p < minP) minP = p;
            if (p > maxP) maxP = p;
        }
    } else {
        for (const seg of boundarySegments) {
            const p1 = seg[0].x * nx + seg[0].y * ny;
            const p2 = seg[1].x * nx + seg[1].y * ny;
            if (p1 < minP) minP = p1; if (p1 > maxP) maxP = p1;
            if (p2 < minP) minP = p2; if (p2 > maxP) maxP = p2;
        }
    }

    const span = maxP - minP;
    if (span < 0.5) return [];

    const d = Math.max(1, density);
    const results = [];

    let startP, endP;
    if (isFullMode) {
        startP = minP + Math.min(1.0, d * 0.5);
        endP = maxP - 0.2;
    } else {
        const offset = (span % d) / 2;
        startP = minP + (offset >= 0.5 ? offset : d * 0.5);
        endP = maxP - 0.2;
    }

    const round2 = v => Math.round(v * 100) / 100;

    const bxMin = region ? region.rMinX - 8 : -Infinity;
    const bxMax = region ? region.rMaxX + 8 : Infinity;
    const byMin = region ? region.rMinY - 8 : -Infinity;
    const byMax = region ? region.rMaxY + 8 : Infinity;
    const step = Math.max(0.6, region && region.binSize ? region.binSize * 0.75 : 1.0);

    for (let p = startP; p <= endP; p += d) {
        const ox = p * nx, oy = p * ny;

        // Clip the infinite scanline to the region bounding box
        let tBoxMin = -50000, tBoxMax = 50000;
        if (region) {
            if (Math.abs(cosA) > 1e-6) {
                const t1 = (bxMin - ox) / cosA;
                const t2 = (bxMax - ox) / cosA;
                tBoxMin = Math.max(tBoxMin, Math.min(t1, t2));
                tBoxMax = Math.min(tBoxMax, Math.max(t1, t2));
            } else {
                if (ox < bxMin || ox > bxMax) continue;
            }

            if (Math.abs(sinA) > 1e-6) {
                const t1 = (byMin - oy) / sinA;
                const t2 = (byMax - oy) / sinA;
                tBoxMin = Math.max(tBoxMin, Math.min(t1, t2));
                tBoxMax = Math.min(tBoxMax, Math.max(t1, t2));
            } else {
                if (oy < byMin || oy > byMax) continue;
            }
            if (tBoxMin >= tBoxMax) continue;
        }

        // Exact vector hits with boundary segments
        const hits = [];
        for (const seg of boundarySegments) {
            const v1 = seg[0], v2 = seg[1];
            const edx = v2.x - v1.x, edy = v2.y - v1.y;
            const denom = cosA * edy - sinA * edx;
            if (Math.abs(denom) < 1e-7) continue;
            const t = ((v1.x - ox) * edy - (v1.y - oy) * edx) / denom;
            const u = ((v1.x - ox) * sinA - (v1.y - oy) * cosA) / denom;
            if (u >= -1e-4 && u <= 1 + 1e-4) {
                hits.push(t);
            }
        }
        hits.sort((a, b) => a - b);

        // March along the ray to discover contiguous inside spans without bridging across empty space
        let inSpan = false;
        let spanStart = tBoxMin;
        let t = tBoxMin;

        while (t <= tBoxMax) {
            const wx = ox + t * cosA;
            const wy = oy + t * sinA;
            const curIn = insideFn(wx, wy);

            if (!inSpan && curIn) {
                inSpan = true;
                // Refine entry boundary with binary search (3 steps)
                let tL = t - step, tR = t;
                for (let k = 0; k < 3; k++) {
                    const tM = (tL + tR) * 0.5;
                    if (insideFn(ox + tM * cosA, oy + tM * sinA)) tR = tM;
                    else tL = tM;
                }
                spanStart = tR;
            } else if (inSpan && !curIn) {
                inSpan = false;
                // Refine exit boundary with binary search (3 steps)
                let tL = t - step, tR = t;
                for (let k = 0; k < 3; k++) {
                    const tM = (tL + tR) * 0.5;
                    if (insideFn(ox + tM * cosA, oy + tM * sinA)) tL = tM;
                    else tR = tM;
                }
                const spanEnd = tL;

                // Snap spanStart and spanEnd to nearest exact vector boundary hits if close (within 4.5px)
                let snapStart = spanStart, snapEnd = spanEnd;
                let bestDistStart = 4.5;
                let bestDistEnd = 4.5;
                for (const h of hits) {
                    const dS = Math.abs(h - spanStart);
                    if (dS < bestDistStart) { bestDistStart = dS; snapStart = h; }
                    const dE = Math.abs(h - spanEnd);
                    if (dE < bestDistEnd) { bestDistEnd = dE; snapEnd = h; }
                }

                if (snapEnd - snapStart >= 0.5) {
                    results.push([
                        { x: round2(ox + snapStart * cosA), y: round2(oy + snapStart * sinA) },
                        { x: round2(ox + snapEnd * cosA), y: round2(oy + snapEnd * sinA) }
                    ]);
                }
            }
            t += step;
        }

        if (inSpan) {
            const spanEnd = tBoxMax;
            let snapStart = spanStart, snapEnd = spanEnd;
            let bestDistStart = 4.5;
            let bestDistEnd = 4.5;
            for (const h of hits) {
                const dS = Math.abs(h - spanStart);
                if (dS < bestDistStart) { bestDistStart = dS; snapStart = h; }
                const dE = Math.abs(h - spanEnd);
                if (dE < bestDistEnd) { bestDistEnd = dE; snapEnd = h; }
            }
            if (snapEnd - snapStart >= 0.5) {
                results.push([
                    { x: round2(ox + snapStart * cosA), y: round2(oy + snapStart * sinA) },
                    { x: round2(ox + snapEnd * cosA), y: round2(oy + snapEnd * sinA) }
                ]);
            }
        }
    }

    return results;
}

/**
 * Compute enclosed raster + exact boundary segments for a seed point.
 * Shared by both Fill Area and Gradient (auto-clip) tools.
 */
function computeEnclosedRegion(startX, startY, preferDirection = null) {
    const candidateLines = [];
    if (!physicsLocked) candidateLines.push(...physicsLines);
    if (!sceneryLocked) candidateLines.push(...sceneryLines);
    if (candidateLines.length === 0) return { error: 'No track lines exist to form a shape.' };

    const allCandidateSegments = [];
    for (const poly of candidateLines) {
        for (let i = 0; i < poly.length - 1; i++) {
            allCandidateSegments.push([poly[i], poly[i + 1]]);
        }
    }

    // Limit search to segments within a generous area around the seed point to keep resolution high
    const searchRadius = 2500;
    const allSegments = allCandidateSegments.filter(s => {
        const minSx = Math.min(s[0].x, s[1].x), maxSx = Math.max(s[0].x, s[1].x);
        const minSy = Math.min(s[0].y, s[1].y), maxSy = Math.max(s[0].y, s[1].y);
        return !(maxSx < startX - searchRadius || minSx > startX + searchRadius ||
                 maxSy < startY - searchRadius || minSy > startY + searchRadius);
    });
    if (allSegments.length === 0) return { error: 'No track lines near clicked point.' };

    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    for (const seg of allSegments) {
        for (const pt of seg) {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        }
    }

    const pad = 24;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const boxW = maxX - minX, boxH = maxY - minY;
    if (boxW <= 0 || boxH <= 0) return { error: 'Invalid shape bounds.' };

    const maxDim = Math.max(boxW, boxH);
    // 1px per cell for shapes up to 350px; 2px for medium shapes up to 1200px; 3-4px only for gigantic shapes
    let binSize = maxDim <= 350 ? 1 : Math.max(1, Math.min(4, Math.ceil(maxDim / 600)));
    while ((Math.ceil(boxW / binSize) * Math.ceil(boxH / binSize)) > 2000000) binSize += 1;
    const cols = Math.ceil(boxW / binSize);
    const rows = Math.ceil(boxH / binSize);
    const grid = new Uint8Array(cols * rows);

    // Exact Bresenham supercover rasterization without artificial 3x3 vertex dilation
    for (const seg of allSegments) {
        const x0 = seg[0].x - minX, y0 = seg[0].y - minY;
        const x1 = seg[1].x - minX, y1 = seg[1].y - minY;
        let cx0 = Math.floor(x0 / binSize), cy0 = Math.floor(y0 / binSize);
        const cx1 = Math.floor(x1 / binSize), cy1 = Math.floor(y1 / binSize);

        const dx = Math.abs(cx1 - cx0), dy = Math.abs(cy1 - cy0);
        const sx = cx0 < cx1 ? 1 : -1, sy = cy0 < cy1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (cx0 >= 0 && cx0 < cols && cy0 >= 0 && cy0 < rows) {
                grid[cy0 * cols + cx0] = 1;
            }
            if (cx0 === cx1 && cy0 === cy1) break;
            const e2 = 2 * err;
            let stepX = false, stepY = false;
            if (e2 > -dy) { err -= dy; cx0 += sx; stepX = true; }
            if (e2 < dx) { err += dx; cy0 += sy; stepY = true; }
            // Diagonal step: mark orthogonal corner to prevent 4-connected leakage
            if (stepX && stepY) {
                if (cx0 >= 0 && cx0 < cols && (cy0 - sy) >= 0 && (cy0 - sy) < rows) {
                    grid[(cy0 - sy) * cols + cx0] = 1;
                }
            }
        }
    }

    // Candidate seed points to test for flood-fill (handles clicking directly on edge lines or near perimeter)
    const rawCandidates = [];
    let hasPreferDir = false;
    let pUx = 0, pUy = 0;
    if (preferDirection) {
        const pdx = preferDirection.dx !== undefined ? preferDirection.dx : (preferDirection.x || 0);
        const pdy = preferDirection.dy !== undefined ? preferDirection.dy : (preferDirection.y || 0);
        const pdLen = Math.hypot(pdx, pdy);
        if (pdLen > 1e-3) {
            hasPreferDir = true;
            pUx = pdx / pdLen;
            pUy = pdy / pdLen;
        }
    }

    // Direct seed
    const directCx = Math.floor((startX - minX) / binSize);
    const directCy = Math.floor((startY - minY) / binSize);
    if (directCx >= 1 && directCx < cols - 1 && directCy >= 1 && directCy < rows - 1) {
        if (grid[directCy * cols + directCx] === 0) {
            rawCandidates.push({ x: startX, y: startY, direct: true });
        }
    }

    // Find nearby boundary segments to generate candidates on both sides of the edge line
    const nearbySegs = [];
    for (const seg of allSegments) {
        const v1 = seg[0], v2 = seg[1];
        const segDx = v2.x - v1.x, segDy = v2.y - v1.y;
        const lSq = segDx * segDx + segDy * segDy;
        if (lSq < 1e-4) continue;
        const t = Math.max(0, Math.min(1, ((startX - v1.x) * segDx + (startY - v1.y) * segDy) / lSq));
        const projX = v1.x + t * segDx, projY = v1.y + t * segDy;
        const dSq = (startX - projX) * (startX - projX) + (startY - projY) * (startY - projY);
        if (dSq <= 625) { // within 25px
            nearbySegs.push({ seg, projX, projY, dSq, segDx, segDy, len: Math.sqrt(lSq) });
        }
    }
    nearbySegs.sort((a, b) => a.dSq - b.dSq);

    // If drag direction is present, add points stepping along the drag vector
    if (hasPreferDir) {
        for (const dist of [2, 5, 10, 18, 30, 50]) {
            rawCandidates.push({ x: startX + pUx * dist, y: startY + pUy * dist, score: 1000 - dist });
        }
    }

    // Add candidate points offset on both normal sides of the nearest boundary segments
    for (const ns of nearbySegs.slice(0, 6)) {
        const nx = -ns.segDy / ns.len;
        const ny = ns.segDx / ns.len;
        for (const dist of [2, 4, 8, 14, 22]) {
            const ptA = { x: ns.projX + nx * dist, y: ns.projY + ny * dist };
            const ptB = { x: ns.projX - nx * dist, y: ns.projY - ny * dist };

            if (hasPreferDir) {
                const dotA = (ptA.x - startX) * pUx + (ptA.y - startY) * pUy;
                const dotB = (ptB.x - startX) * pUx + (ptB.y - startY) * pUy;
                ptA.score = dotA * 50 - Math.hypot(ptA.x - startX, ptA.y - startY);
                ptB.score = dotB * 50 - Math.hypot(ptB.x - startX, ptB.y - startY);
            } else {
                ptA.score = -Math.hypot(ptA.x - startX, ptA.y - startY);
                ptB.score = -Math.hypot(ptB.x - startX, ptB.y - startY);
            }
            rawCandidates.push(ptA);
            rawCandidates.push(ptB);
        }
    }

    // If direct cell was on a line, also add small 8-connected neighborhood offsets around it
    if (directCx >= 0 && directCx < cols && directCy >= 0 && directCy < rows && grid[directCy * cols + directCx] === 1) {
        for (let r = 1; r <= 8; r++) {
            for (let dy = -r; dy <= r; dy += r) {
                for (let dx = -r; dx <= r; dx += r) {
                    if (dx === 0 && dy === 0) continue;
                    const wx = startX + dx * binSize;
                    const wy = startY + dy * binSize;
                    const score = hasPreferDir ? ((wx - startX) * pUx + (wy - startY) * pUy) * 20 : -Math.hypot(dx, dy);
                    rawCandidates.push({ x: wx, y: wy, score });
                }
            }
        }
    }

    // Sort candidates: direct seed first, then highest score
    rawCandidates.sort((a, b) => {
        if (a.direct) return -1;
        if (b.direct) return 1;
        return (b.score || 0) - (a.score || 0);
    });

    // Deduplicate candidate grid cell indices
    const candidateCells = [];
    const seenIndices = new Set();
    for (const cand of rawCandidates) {
        const cx = Math.floor((cand.x - minX) / binSize);
        const cy = Math.floor((cand.y - minY) / binSize);
        if (cx < 1 || cx >= cols - 1 || cy < 1 || cy >= rows - 1) continue;
        const idx = cy * cols + cx;
        if (grid[idx] !== 0 || seenIndices.has(idx)) continue;
        seenIndices.add(idx);
        candidateCells.push({ cx, cy, idx });
    }

    if (candidateCells.length === 0) {
        return { error: 'Clicked directly on a line. Click inside or drag into the shape.' };
    }

    const queue = new Int32Array(cols * rows);
    let foundEnclosed = false;
    let rMinX = Infinity, rMaxX = -Infinity, rMinY = Infinity, rMaxY = -Infinity;
    let filledCount = 0;

    for (const cand of candidateCells) {
        if (grid[cand.idx] !== 0) continue;
        let head = 0, tail = 0;
        grid[cand.idx] = 2;
        queue[tail++] = cand.idx;
        let leaked = false;
        rMinX = Infinity; rMaxX = -Infinity; rMinY = Infinity; rMaxY = -Infinity;

        while (head < tail) {
            const idx = queue[head++];
            const cx = idx % cols;
            const cy = (idx / cols) | 0;
            const wx = minX + cx * binSize, wy = minY + cy * binSize;
            if (wx < rMinX) rMinX = wx; if (wx > rMaxX) rMaxX = wx;
            if (wy < rMinY) rMinY = wy; if (wy > rMaxY) rMaxY = wy;
            if (cx <= 1 || cx >= cols - 2 || cy <= 1 || cy >= rows - 2) {
                leaked = true;
                break;
            }
            const left = idx - 1; if (grid[left] === 0) { grid[left] = 2; queue[tail++] = left; }
            const right = idx + 1; if (grid[right] === 0) { grid[right] = 2; queue[tail++] = right; }
            const up = idx - cols; if (grid[up] === 0) { grid[up] = 2; queue[tail++] = up; }
            const down = idx + cols; if (grid[down] === 0) { grid[down] = 2; queue[tail++] = down; }
        }

        if (leaked) {
            // Revert cells visited by this leaking candidate so subsequent candidates can test
            for (let i = 0; i < tail; i++) {
                grid[queue[i]] = 0;
            }
            continue;
        }

        if (tail >= 1) {
            filledCount = tail;
            foundEnclosed = true;
            break;
        }
    }

    if (!foundEnclosed) {
        return { error: 'Shape is not fully enclosed (check for gaps in perimeter lines).' };
    }

    const boundarySegments = allSegments.filter(seg => {
        const sx0 = Math.min(seg[0].x, seg[1].x), sx1 = Math.max(seg[0].x, seg[1].x);
        const sy0 = Math.min(seg[0].y, seg[1].y), sy1 = Math.max(seg[0].y, seg[1].y);
        if (sx1 < rMinX - 8 || sx0 > rMaxX + 8 || sy1 < rMinY - 8 || sy0 > rMaxY + 8) return false;

        // Verify segment actually borders the filled area (grid === 2)
        const segLen = Math.hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
        const steps = Math.max(2, Math.ceil(segLen / Math.max(1, binSize)));
        for (let s = 0; s <= steps; s++) {
            const wx = seg[0].x + (seg[1].x - seg[0].x) * (s / steps);
            const wy = seg[0].y + (seg[1].y - seg[0].y) * (s / steps);
            const scx = Math.floor((wx - minX) / binSize);
            const scy = Math.floor((wy - minY) / binSize);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = scx + dx, ny = scy + dy;
                    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny * cols + nx] === 2) {
                        return true;
                    }
                }
            }
        }
        return false;
    });
    if (boundarySegments.length < 2) return { error: 'Cannot find boundary edges for filled area.' };

    function isInsideCheck(wx, wy) {
        const cx = Math.floor((wx - minX) / binSize);
        const cy = Math.floor((wy - minY) / binSize);
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return false;
        const val = grid[cy * cols + cx];
        if (val === 2) return true;
        // If on boundary wall (1), check if immediately adjacent to filled area (2)
        if (val === 1) {
            return (cx > 0 && grid[cy * cols + cx - 1] === 2) ||
                   (cx + 1 < cols && grid[cy * cols + cx + 1] === 2) ||
                   (cy > 0 && grid[(cy - 1) * cols + cx] === 2) ||
                   (cy + 1 < rows && grid[(cy + 1) * cols + cx] === 2);
        }
        return false;
    }

    return { boundarySegments, isInsideCheck, rMinX, rMaxX, rMinY, rMaxY, minX, maxX, minY, maxY, binSize, cols, rows, grid, error: null };
}

/**
 * Generate clipped line segments inside an enclosed region aligned with a perspective VP or isometric axis.
 */
function clipPerspFillToRegion(region, axisKey, pitch) {
    const results = [];
    const { rMinX, rMaxX, rMinY, rMaxY } = region;
    const pad = Math.max(8, pitch * 2);
    const minX = rMinX - pad, maxX = rMaxX + pad, minY = rMinY - pad, maxY = rMaxY + pad;

    if (axisKey === 'iso' || (axisKey === 'vp3' && perspectiveGrid.mode !== '3pt')) {
        const angleRad = axisKey === 'iso'
            ? (-perspectiveGrid.isoAngle * Math.PI) / 180
            : Math.PI / 2;
        return clipHatchLinesToTrackSegments(region.boundarySegments, region.isInsideCheck, angleRad, pitch, false, region);
    }

    const fp = perspectiveGrid[axisKey] || perspectiveGrid.vp1;
    const boxMidX = (minX + maxX) * 0.5, boxMidY = (minY + maxY) * 0.5;
    const dist = Math.hypot(boxMidX - fp.x, boxMidY - fp.y);

    if (dist > 12000) {
        const ang = Math.atan2(boxMidY - fp.y, boxMidX - fp.x);
        return clipHatchLinesToTrackSegments(region.boundarySegments, region.isInsideCheck, ang, pitch, false, region);
    }

    // Check if vanishing point is inside bounding box
    const insideBox = fp.x >= minX && fp.x <= maxX && fp.y >= minY && fp.y <= maxY;

    if (insideBox) {
        // Full 360-degree fan from focal point
        const maxR = Math.hypot(maxX - minX, maxY - minY);
        const stepAng = Math.max(0.015, (pitch * 1.5) / maxR);
        for (let a = 0; a < 2 * Math.PI; a += stepAng) {
            const dx = Math.cos(a), dy = Math.sin(a);
            const seg = clipInfiniteLineToBox(fp.x, fp.y, dx, dy, minX, maxX, minY, maxY);
            if (seg) {
                let [pA, pB] = seg;
                const dDot = (pB.x - pA.x) * dx + (pB.y - pA.y) * dy;
                if (dDot < 0) { const tmp = pA; pA = pB; pB = tmp; }
                pA = { x: fp.x, y: fp.y };
                results.push(...clipSingleSegmentToRegion(pA, pB, region));
            }
        }
    } else {
        // Angular sweep covering the exact cone subtended by the region's bounding box
        const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: minX, y: maxY },
            { x: maxX, y: maxY }
        ];
        const baseAngle = Math.atan2(boxMidY - fp.y, boxMidX - fp.x);
        const normAngle = a => {
            let diff = a - baseAngle;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            return diff;
        };

        let minRel = Infinity, maxRel = -Infinity;
        for (const c of corners) {
            const a = Math.atan2(c.y - fp.y, c.x - fp.x);
            const rel = normAngle(a);
            if (rel < minRel) minRel = rel;
            if (rel > maxRel) maxRel = rel;
        }

        const dAngle = Math.max(1e-4, Math.max(1, pitch) / dist);
        for (let a = minRel; a <= maxRel; a += dAngle) {
            const ang = baseAngle + a;
            const dx = Math.cos(ang), dy = Math.sin(ang);
            const seg = clipInfiniteLineToBox(fp.x, fp.y, dx, dy, minX, maxX, minY, maxY);
            if (seg) {
                results.push(...clipSingleSegmentToRegion(seg[0], seg[1], region));
            }
        }
    }

    return results;
}

function fillArea(startX, startY, altKey) {
    const activeLayer = document.getElementById('drawLayer').value;
    if (isLayerLocked(activeLayer)) return;
    const region = computeEnclosedRegion(startX, startY);
    if (region.error) {
        toast('Cannot fill: ' + region.error, 'info', 3000);
        return;
    }

    const fillMode = document.getElementById('fillMode')?.value || 'full';
    const fillDensity = Math.max(1, parseFloat(document.getElementById('fillDensity')?.value) || (fillMode === 'full' ? 3 : 20));
    const fillRotation = parseFloat(document.getElementById('fillRotation')?.value) || 0;
    const fillSlant = parseFloat(document.getElementById('fillSlant')?.value) || 0;
    const fillPerspAxis = document.getElementById('fillPerspAxis')?.value || 'none';

    const segments = [];
    if (fillMode === 'full') {
        segments.push(...clipHatchLinesToTrackSegments(region.boundarySegments, region.isInsideCheck, 0, fillDensity, true, region));
    } else if (fillPerspAxis !== 'none') {
        segments.push(...clipPerspFillToRegion(region, fillPerspAxis, fillDensity));
        if (fillMode === 'grid') {
            const secondAxis = fillPerspAxis === 'vp1' ? (perspectiveGrid.mode === '1pt' ? 'vp3' : 'vp2') : (fillPerspAxis === 'vp2' ? 'vp3' : 'vp1');
            if (fillPerspAxis === 'iso') {
                const a2 = (perspectiveGrid.isoAngle * Math.PI) / 180;
                segments.push(...clipHatchLinesToTrackSegments(region.boundarySegments, region.isInsideCheck, a2, fillDensity, false, region));
            } else {
                segments.push(...clipPerspFillToRegion(region, secondAxis, fillDensity));
            }
        }
    } else if (fillMode === 'lines') {
        const aRad = (fillRotation + fillSlant) * Math.PI / 180;
        segments.push(...clipHatchLinesToTrackSegments(region.boundarySegments, region.isInsideCheck, aRad, fillDensity, false, region));
    } else if (fillMode === 'grid') {
        const a1 = fillRotation * Math.PI / 180;
        const a2 = (fillRotation + 90 + fillSlant) * Math.PI / 180;
        segments.push(...clipHatchLinesToTrackSegments(region.boundarySegments, region.isInsideCheck, a1, fillDensity, false, region));
        segments.push(...clipHatchLinesToTrackSegments(region.boundarySegments, region.isInsideCheck, a2, fillDensity, false, region));
    }

    if (segments.length === 0) {
        toast('Fill pattern generated 0 segments inside shape.', 'warning', 2500);
        return;
    }

    const settings = getPatternSettings(altKey);
    const finalPolylines = [];
    for (const seg of segments) {
        if (settings.bypass || settings.lineType === 'solid') {
            finalPolylines.push(seg);
        } else {
            const frags = applyLinePattern(seg, settings.lineType, settings.scale, settings.coverage, settings.seed);
            for (const f of frags) {
                if (polylineLength(f) >= 0.5) finalPolylines.push(f);
            }
        }
    }

    if (finalPolylines.length === 0) {
        toast('Fill produced no visible line fragments.', 'warning', 2000);
        return;
    }

    snapshot();
    const layer = document.getElementById('drawLayer').value;
    let toAdd = finalPolylines;
    if (symmetryMode) {
        toAdd = toAdd.concat(finalPolylines.map(f => f.map(p => ({ x: -p.x, y: p.y }))));
    }

    if (layer === 'physics') {
        physicsLines.push(...toAdd.map(f => clonePoints(f)));
        bumpPhysics();
    } else {
        const cloned = toAdd.map(f => clonePoints(f));
        originalSceneryLines.push(...cloned.map(f => clonePoints(f)));
        sceneryLines.push(...cloned);
    }

    updateStatusBar();
    drawMinimap();
    draw();
    toast(`Filled shape (${fillMode.toUpperCase()}): +${toAdd.length} strokes ✓`, 'success', 2500);
}

// ==========================================
// GRADIENT TOOL ENGINE
// ==========================================
function evalGradientFalloff(t, curve, invert) {
    let ct = Math.max(0, Math.min(1, t));
    if (invert) ct = 1 - ct;
    let d = 1 - ct;
    if (curve === 'easeOut') d = d * d;
    else if (curve === 'easeIn') d = 1 - ct * ct;
    return Math.max(0, Math.min(1, d));
}

/** Clip a single finite segment [pA, pB] to an enclosed region using ray-segment hits. */
function clipSingleSegmentToRegion(pA, pB, region) {
    if (!region || region.error) return [[pA, pB]];
    const dx = pB.x - pA.x, dy = pB.y - pA.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return [];
    const cosA = dx / len, sinA = dy / len;
    const ox = pA.x, oy = pA.y;

    const hits = [];
    for (const seg of region.boundarySegments) {
        const v1 = seg[0], v2 = seg[1];
        const edx = v2.x - v1.x, edy = v2.y - v1.y;
        const denom = cosA * edy - sinA * edx;
        if (Math.abs(denom) < 1e-7) continue;
        const t = ((v1.x - ox) * edy - (v1.y - oy) * edx) / denom;
        const u = ((v1.x - ox) * sinA - (v1.y - oy) * cosA) / denom;
        if (u >= -1e-4 && u <= 1 + 1e-4) hits.push(t);
    }
    hits.sort((a, b) => a - b);

    const round2 = v => Math.round(v * 100) / 100;
    const step = Math.max(0.6, region.binSize ? region.binSize * 0.75 : 1.0);
    const out = [];

    let inSpan = false;
    let spanStart = 0;
    let t = 0;

    while (t <= len) {
        const wx = ox + t * cosA;
        const wy = oy + t * sinA;
        const curIn = region.isInsideCheck(wx, wy);

        if (!inSpan && curIn) {
            inSpan = true;
            let tL = Math.max(0, t - step), tR = t;
            for (let k = 0; k < 3; k++) {
                const tM = (tL + tR) * 0.5;
                if (region.isInsideCheck(ox + tM * cosA, oy + tM * sinA)) tR = tM;
                else tL = tM;
            }
            spanStart = tR;
        } else if (inSpan && !curIn) {
            inSpan = false;
            let tL = Math.max(0, t - step), tR = t;
            for (let k = 0; k < 3; k++) {
                const tM = (tL + tR) * 0.5;
                if (region.isInsideCheck(ox + tM * cosA, oy + tM * sinA)) tL = tM;
                else tR = tM;
            }
            const spanEnd = tL;

            let snapStart = spanStart, snapEnd = spanEnd;
            let bestDistStart = 4.5, bestDistEnd = 4.5;
            for (const h of hits) {
                const dS = Math.abs(h - spanStart);
                if (dS < bestDistStart) { bestDistStart = dS; snapStart = h; }
                const dE = Math.abs(h - spanEnd);
                if (dE < bestDistEnd) { bestDistEnd = dE; snapEnd = h; }
            }

            if (snapEnd - snapStart >= 0.5) {
                out.push([
                    { x: round2(ox + snapStart * cosA), y: round2(oy + snapStart * sinA) },
                    { x: round2(ox + snapEnd * cosA), y: round2(oy + snapEnd * sinA) }
                ]);
            }
        }
        t += step;
    }

    if (inSpan) {
        const spanEnd = len;
        let snapStart = spanStart, snapEnd = spanEnd;
        let bestDistStart = 4.5, bestDistEnd = 4.5;
        for (const h of hits) {
            const dS = Math.abs(h - spanStart);
            if (dS < bestDistStart) { bestDistStart = dS; snapStart = h; }
            const dE = Math.abs(h - spanEnd);
            if (dE < bestDistEnd) { bestDistEnd = dE; snapEnd = h; }
        }
        if (snapEnd - snapStart >= 0.5) {
            out.push([
                { x: round2(ox + snapStart * cosA), y: round2(oy + snapStart * sinA) },
                { x: round2(ox + snapEnd * cosA), y: round2(oy + snapEnd * sinA) }
            ]);
        }
    }

    return out;
}

function getGradientSettings() {
    return {
        type: document.getElementById('gradType')?.value || 'linear',
        style: document.getElementById('gradStyle')?.value || 'lines',
        startSpacing: Math.max(1, parseFloat(document.getElementById('gradStartSpacing')?.value) || 3),
        endSpacing: Math.max(8, parseFloat(document.getElementById('gradEndSpacing')?.value) || 45),
        falloff: document.getElementById('gradFalloff')?.value || 'easeOut',
        clipMode: document.getElementById('gradClipMode')?.value || 'auto',
        spanWidth: Math.max(20, parseFloat(document.getElementById('gradSpanWidth')?.value) || 220),
        perspAxis: document.getElementById('gradPerspAxis')?.value || 'none',
        invert: !!document.getElementById('gradInvertToggle')?.checked,
    };
}

function generateGradientPolylines(p0, p1, opts, region) {
    const dragDx = p1.x - p0.x, dragDy = p1.y - p0.y;
    const dragLen = Math.hypot(dragDx, dragDy);
    if (dragLen < 6) return [];

    const hasClip = !!(opts.clipMode === 'auto' && region && !region.error);
    const rng = getRNG(Math.round(Math.abs(p0.x * 13 + p0.y * 31 + dragLen)) || 42);
    const lines = [];

    const emitOrClip = (segA, segB) => {
        if (hasClip) {
            lines.push(...clipSingleSegmentToRegion(segA, segB, region));
        } else {
            lines.push([{ x: Math.round(segA.x), y: Math.round(segA.y) }, { x: Math.round(segB.x), y: Math.round(segB.y) }]);
        }
    };

    const emitBrokenSegment = (segA, segB, density) => {
        if (density <= 0.02) return;
        const clipped = hasClip ? clipSingleSegmentToRegion(segA, segB, region) : [[segA, segB]];
        for (const [cA, cB] of clipped) {
            const len = Math.hypot(cB.x - cA.x, cB.y - cA.y);
            if (len < 2) continue;
            if (density > 0.92) {
                lines.push([{ x: Math.round(cA.x), y: Math.round(cA.y) }, { x: Math.round(cB.x), y: Math.round(cB.y) }]);
                continue;
            }
            const segStep = Math.max(4, Math.round(6 + density * 12));
            let s = 0;
            while (s < len) {
                const drawLen = Math.min(len - s, 2 + density * segStep * (0.5 + rng()));
                if (rng() < Math.pow(density, 0.85)) {
                    const t0 = s / len, t1 = (s + drawLen) / len;
                    lines.push([
                        { x: Math.round(cA.x + (cB.x - cA.x) * t0), y: Math.round(cA.y + (cB.y - cA.y) * t0) },
                        { x: Math.round(cA.x + (cB.x - cA.x) * t1), y: Math.round(cA.y + (cB.y - cA.y) * t1) }
                    ]);
                }
                s += drawLen + (2 + (1 - density) * 14 * rng());
            }
        }
    };

    if (opts.type === 'linear') {
        const ux = dragDx / dragLen, uy = dragDy / dragLen;
        const nx = -uy, ny = ux;
        let halfSpan = opts.spanWidth / 2;
        if (hasClip) {
            halfSpan = Math.max(halfSpan, Math.hypot(region.rMaxX - region.rMinX, region.rMaxY - region.rMinY));
        }

        if (opts.style === 'stipple') {
            const cell = Math.max(4, opts.startSpacing * 1.4);
            const stepsAlong = Math.ceil(dragLen / cell);
            const stepsAcross = Math.ceil((halfSpan * 2) / cell);
            for (let i = 0; i <= stepsAlong; i++) {
                const t = i / Math.max(1, stepsAlong);
                const d = evalGradientFalloff(t, opts.falloff, opts.invert);
                if (d < 0.03) continue;
                const along = t * dragLen;
                for (let j = -Math.floor(stepsAcross / 2); j <= Math.floor(stepsAcross / 2); j++) {
                    const across = j * cell + (rng() - 0.5) * cell;
                    const px = p0.x + ux * along + nx * across;
                    const py = p0.y + uy * along + ny * across;
                    if (hasClip && !region.isInsideCheck(px, py)) continue;
                    if (rng() < Math.pow(d, 1.3)) {
                        const ang = Math.atan2(ny, nx) + (rng() - 0.5) * 0.6;
                        const len = 1.5 + rng() * 3.0 * d;
                        lines.push([
                            { x: Math.round(px), y: Math.round(py) },
                            { x: Math.round(px + Math.cos(ang) * len), y: Math.round(py + Math.sin(ang) * len) }
                        ]);
                    }
                }
            }
        } else if (opts.perspAxis && opts.perspAxis !== 'none') {
            // Perspective-aligned progressive strokes converging toward chosen VP / Iso axis
            const ux = dragDx / dragLen, uy = dragDy / dragLen;
            const nx = -uy, ny = ux;
            const fp = perspectiveGrid[opts.perspAxis] || perspectiveGrid.vp1;
            const isoRad = (perspectiveGrid.isoAngle * Math.PI) / 180;
            const isoU = { ux: Math.cos(isoRad), uy: -Math.sin(isoRad) };
            let pos = 0, iter = 0;
            while (pos <= dragLen && iter++ < 400) {
                const t = pos / dragLen;
                const d = evalGradientFalloff(t, opts.falloff, opts.invert);
                const spacing = opts.endSpacing - (opts.endSpacing - opts.startSpacing) * d;
                const cx = p0.x + ux * pos, cy = p0.y + uy * pos;
                let dir = isoU;
                if (opts.perspAxis !== 'iso') {
                    const rx = fp.x - cx, ry = fp.y - cy;
                    const rl = Math.hypot(rx, ry);
                    dir = rl > 2 ? { ux: rx / rl, uy: ry / rl } : { ux: nx, uy: ny };
                }
                const segA = { x: cx - dir.ux * halfSpan, y: cy - dir.uy * halfSpan };
                const segB = { x: cx + dir.ux * halfSpan, y: cy + dir.uy * halfSpan };
                if (opts.style === 'broken') emitBrokenSegment(segA, segB, d);
                else emitOrClip(segA, segB);
                pos += Math.max(2, spacing);
            }
        } else {
            // Parallel scanlines spaced progressively from startSpacing to endSpacing
            let pos = 0;
            let iter = 0;
            while (pos <= dragLen && iter++ < 400) {
                const t = pos / dragLen;
                const d = evalGradientFalloff(t, opts.falloff, opts.invert);
                const spacing = opts.endSpacing - (opts.endSpacing - opts.startSpacing) * d;
                const cx = p0.x + ux * pos;
                const cy = p0.y + uy * pos;
                const segA = { x: cx - nx * halfSpan, y: cy - ny * halfSpan };
                const segB = { x: cx + nx * halfSpan, y: cy + ny * halfSpan };
                if (opts.style === 'broken') {
                    emitBrokenSegment(segA, segB, d);
                } else {
                    emitOrClip(segA, segB);
                }
                pos += Math.max(2, spacing);
            }

            if (opts.style === 'cross') {
                // Orthogonal second pass that fades out over the denser half
                const crossMaxDist = opts.invert ? dragLen : dragLen * 0.65;
                const crossStart = opts.invert ? dragLen * 0.35 : 0;
                const crossStep = Math.max(4, opts.startSpacing * 2);
                for (let across = -halfSpan; across <= halfSpan; across += crossStep) {
                    const bx = p0.x + nx * across;
                    const by = p0.y + ny * across;
                    const segA = { x: bx + ux * crossStart, y: by + uy * crossStart };
                    const segB = { x: bx + ux * crossMaxDist, y: by + uy * crossMaxDist };
                    // Break along density dynamically
                    const clips = hasClip ? clipSingleSegmentToRegion(segA, segB, region) : [[segA, segB]];
                    for (const [cA, cB] of clips) {
                        const clen = Math.hypot(cB.x - cA.x, cB.y - cA.y);
                        if (clen < 2) continue;
                        let s = 0;
                        while (s < clen) {
                            const wx = cA.x + (cB.x - cA.x) * (s / clen);
                            const wy = cA.y + (cB.y - cA.y) * (s / clen);
                            const proj = ((wx - p0.x) * ux + (wy - p0.y) * uy) / dragLen;
                            const d = evalGradientFalloff(proj, opts.falloff, opts.invert);
                            const chunk = Math.min(clen - s, 8 + d * 18);
                            if (d > 0.25 && rng() < d * 1.1) {
                                const t0 = s / clen, t1 = (s + chunk) / clen;
                                lines.push([
                                    { x: Math.round(cA.x + (cB.x - cA.x) * t0), y: Math.round(cA.y + (cB.y - cA.y) * t0) },
                                    { x: Math.round(cA.x + (cB.x - cA.x) * t1), y: Math.round(cA.y + (cB.y - cA.y) * t1) }
                                ]);
                            }
                            s += chunk + (1 - d) * 10;
                        }
                    }
                }
            }
        }
    } else {
        // RADIAL GRADIENT: centered at p0, radius = dragLen
        if (opts.style === 'stipple') {
            const cell = Math.max(4, opts.startSpacing * 1.5);
            for (let dy = -dragLen; dy <= dragLen; dy += cell) {
                for (let dx = -dragLen; dx <= dragLen; dx += cell) {
                    const px = p0.x + dx + (rng() - 0.5) * cell;
                    const py = p0.y + dy + (rng() - 0.5) * cell;
                    const r = Math.hypot(px - p0.x, py - p0.y);
                    if (r > dragLen) continue;
                    if (hasClip && !region.isInsideCheck(px, py)) continue;
                    const d = evalGradientFalloff(r / dragLen, opts.falloff, opts.invert);
                    if (rng() < Math.pow(d, 1.35)) {
                        const ang = Math.atan2(py - p0.y, px - p0.x) + Math.PI / 2;
                        const len = 1.5 + rng() * 3.0 * d;
                        lines.push([
                            { x: Math.round(px), y: Math.round(py) },
                            { x: Math.round(px + Math.cos(ang) * len), y: Math.round(py + Math.sin(ang) * len) }
                        ]);
                    }
                }
            }
        } else {
            // Concentric contour rings whose spacing increases outward
            let r = Math.max(3, opts.startSpacing);
            let iter = 0;
            while (r <= dragLen && iter++ < 300) {
                const t = r / dragLen;
                const d = evalGradientFalloff(t, opts.falloff, opts.invert);
                const spacing = opts.endSpacing - (opts.endSpacing - opts.startSpacing) * d;
                const sides = Math.max(16, Math.min(72, Math.round((2 * Math.PI * r) / 10)));
                let poly = [];
                for (let i = 0; i <= sides; i++) {
                    const ang = (2 * Math.PI * i) / sides;
                    const px = p0.x + Math.cos(ang) * r;
                    const py = p0.y + Math.sin(ang) * r;
                    const inside = !hasClip || region.isInsideCheck(px, py);
                    const keep = opts.style === 'broken' ? (inside && rng() < Math.pow(d, 0.75)) : inside;
                    if (keep) {
                        poly.push({ x: Math.round(px), y: Math.round(py) });
                    } else {
                        if (poly.length >= 2) lines.push(poly);
                        poly = [];
                    }
                }
                if (poly.length >= 2) lines.push(poly);
                r += Math.max(2, spacing);
            }
            if (opts.style === 'cross') {
                // Radial spokes fading outward
                const spokeCount = Math.max(8, Math.round(36 * (10 / opts.startSpacing)));
                for (let k = 0; k < spokeCount; k++) {
                    const ang = (2 * Math.PI * k) / spokeCount;
                    const endR = opts.invert ? dragLen : dragLen * 0.7;
                    const startR = opts.invert ? dragLen * 0.3 : 2;
                    emitBrokenSegment(
                        { x: p0.x + Math.cos(ang) * startR, y: p0.y + Math.sin(ang) * startR },
                        { x: p0.x + Math.cos(ang) * endR, y: p0.y + Math.sin(ang) * endR },
                        0.75
                    );
                }
            }
        }
    }

    return lines;
}

function drawGradientPreview() {
    if (!isGradDragging || !gradStart || !gradEnd) return;
    ctx.save();
    ctx.strokeStyle = '#E85D35';
    ctx.lineWidth = 2 / zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const poly of gradPreviewLines) {
        if (poly.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.stroke();
    }

    // Guide vector / circle overlay
    const opts = getGradientSettings();
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 1.6 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(gradStart.x, gradStart.y);
    ctx.lineTo(gradEnd.x, gradEnd.y);
    ctx.stroke();
    if (opts.type === 'radial') {
        const rad = Math.hypot(gradEnd.x - gradStart.x, gradEnd.y - gradStart.y);
        ctx.beginPath();
        ctx.arc(gradStart.x, gradStart.y, rad, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#2196F3';
    ctx.beginPath(); ctx.arc(gradStart.x, gradStart.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(gradEnd.x, gradEnd.y, 4 / zoom, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function commitGradient(p0, p1, altKey) {
    const activeLayer = document.getElementById('drawLayer').value;
    if (isLayerLocked(activeLayer)) return;
    const opts = getGradientSettings();
    let region = null;
    if (opts.clipMode === 'auto') {
        if (gradClipCache && !gradClipCache.error) {
            region = gradClipCache;
        } else {
            const dragDir = { dx: p1.x - p0.x, dy: p1.y - p0.y };
            region = computeEnclosedRegion(p0.x, p0.y, dragDir);
        }
    }
    const rawLines = generateGradientPolylines(p0, p1, opts, region);
    if (rawLines.length === 0) {
        toast('Drag a longer distance to generate gradient lines.', 'info', 1800);
        return;
    }

    const settings = getPatternSettings(altKey);
    const finalPolylines = [];
    for (const seg of rawLines) {
        if (settings.bypass || settings.lineType === 'solid' || seg.length < 2) {
            finalPolylines.push(seg);
        } else {
            const frags = applyLinePattern(seg, settings.lineType, settings.scale, settings.coverage, settings.seed);
            for (const f of frags) {
                if (polylineLength(f) >= 1.5) finalPolylines.push(f);
            }
        }
    }

    if (finalPolylines.length === 0) return;

    snapshot();
    const layer = document.getElementById('drawLayer').value;
    let toAdd = finalPolylines;
    if (symmetryMode) {
        toAdd = toAdd.concat(finalPolylines.map(f => f.map(p => ({ x: -p.x, y: p.y }))));
    }

    if (layer === 'physics') {
        physicsLines.push(...toAdd.map(f => clonePoints(f)));
        bumpPhysics();
    } else {
        const cloned = toAdd.map(f => clonePoints(f));
        originalSceneryLines.push(...cloned.map(f => clonePoints(f)));
        sceneryLines.push(...cloned);
        bumpTrackVersion();
    }
    updatePreviewBadge();
    drawMinimap();
    draw();
    toast(`Gradient (${opts.type} · ${opts.style}): +${toAdd.length} strokes ✓`, 'success', 2000);
}

// ==========================================
// TEXT-TO-LINES VECTOR FONT ENGINE
// ==========================================
// Normalized stroke glyphs on x in [0, 0.7], y in [0, 1] (top=0, bottom=1)
const VECTOR_FONT = {
    'A': [[[0,1],[0.35,0],[0.7,1]], [[0.14,0.62],[0.56,0.62]]],
    'B': [[[0,1],[0,0],[0.5,0],[0.65,0.12],[0.65,0.38],[0.5,0.48],[0,0.48]], [[0.5,0.48],[0.68,0.6],[0.68,0.88],[0.5,1],[0,1]]],
    'C': [[[0.68,0.2],[0.5,0],[0.2,0],[0,0.2],[0,0.8],[0.2,1],[0.5,1],[0.68,0.8]]],
    'D': [[[0,1],[0,0],[0.45,0],[0.68,0.22],[0.68,0.78],[0.45,1],[0,1]]],
    'E': [[[0.65,0],[0,0],[0,1],[0.65,1]], [[0,0.48],[0.48,0.48]]],
    'F': [[[0.65,0],[0,0],[0,1]], [[0,0.48],[0.48,0.48]]],
    'G': [[[0.68,0.2],[0.5,0],[0.2,0],[0,0.2],[0,0.8],[0.2,1],[0.5,1],[0.68,0.8],[0.68,0.52],[0.38,0.52]]],
    'H': [[[0,0],[0,1]], [[0.68,0],[0.68,1]], [[0,0.48],[0.68,0.48]]],
    'I': [[[0.15,0],[0.55,0]], [[0.35,0],[0.35,1]], [[0.15,1],[0.55,1]]],
    'J': [[[0.58,0],[0.58,0.8],[0.42,1],[0.18,1],[0.04,0.82]]],
    'K': [[[0,0],[0,1]], [[0.66,0],[0,0.55],[0.68,1]]],
    'L': [[[0,0],[0,1],[0.65,1]]],
    'M': [[[0,1],[0,0],[0.35,0.58],[0.7,0],[0.7,1]]],
    'N': [[[0,1],[0,0],[0.68,1],[0.68,0]]],
    'O': [[[0.2,0],[0.5,0],[0.68,0.2],[0.68,0.8],[0.5,1],[0.2,1],[0,0.8],[0,0.2],[0.2,0]]],
    'P': [[[0,1],[0,0],[0.5,0],[0.68,0.14],[0.68,0.38],[0.5,0.52],[0,0.52]]],
    'Q': [[[0.2,0],[0.5,0],[0.68,0.2],[0.68,0.8],[0.5,1],[0.2,1],[0,0.8],[0,0.2],[0.2,0]], [[0.42,0.72],[0.7,1.02]]],
    'R': [[[0,1],[0,0],[0.5,0],[0.66,0.14],[0.66,0.38],[0.5,0.5],[0,0.5]], [[0.38,0.5],[0.68,1]]],
    'S': [[[0.65,0.16],[0.5,0],[0.18,0],[0.02,0.16],[0.02,0.34],[0.18,0.46],[0.5,0.54],[0.66,0.68],[0.66,0.86],[0.5,1],[0.18,1],[0.02,0.84]]],
    'T': [[[0,0],[0.7,0]], [[0.35,0],[0.35,1]]],
    'U': [[[0,0],[0,0.8],[0.18,1],[0.5,1],[0.68,0.8],[0.68,0]]],
    'V': [[[0,0],[0.35,1],[0.7,0]]],
    'W': [[[0,0],[0.16,1],[0.35,0.42],[0.54,1],[0.7,0]]],
    'X': [[[0,0],[0.68,1]], [[0.68,0],[0,1]]],
    'Y': [[[0,0],[0.35,0.5],[0.7,0]], [[0.35,0.5],[0.35,1]]],
    'Z': [[[0,0],[0.68,0],[0,1],[0.68,1]]],
    '0': [[[0.2,0],[0.5,0],[0.66,0.2],[0.66,0.8],[0.5,1],[0.2,1],[0.04,0.8],[0.04,0.2],[0.2,0]], [[0.12,0.85],[0.58,0.15]]],
    '1': [[[0.18,0.18],[0.38,0],[0.38,1]], [[0.16,1],[0.6,1]]],
    '2': [[[0.04,0.2],[0.2,0],[0.5,0],[0.66,0.18],[0.66,0.38],[0.04,1],[0.68,1]]],
    '3': [[[0.06,0.14],[0.22,0],[0.5,0],[0.66,0.16],[0.66,0.36],[0.48,0.48],[0.3,0.48]], [[0.48,0.48],[0.68,0.64],[0.68,0.84],[0.5,1],[0.22,1],[0.04,0.84]]],
    '4': [[[0.52,1],[0.52,0],[0.02,0.68],[0.7,0.68]]],
    '5': [[[0.64,0],[0.08,0],[0.06,0.44],[0.48,0.44],[0.66,0.58],[0.66,0.84],[0.48,1],[0.18,1],[0.04,0.86]]],
    '6': [[[0.58,0.06],[0.36,0],[0.16,0.1],[0.04,0.34],[0.04,0.84],[0.2,1],[0.5,1],[0.66,0.84],[0.66,0.62],[0.5,0.48],[0.2,0.48],[0.04,0.62]]],
    '7': [[[0.04,0],[0.68,0],[0.24,1]]],
    '8': [[[0.2,0],[0.5,0],[0.64,0.14],[0.64,0.34],[0.48,0.48],[0.22,0.48],[0.06,0.34],[0.06,0.14],[0.2,0]], [[0.22,0.48],[0.04,0.64],[0.04,0.84],[0.2,1],[0.5,1],[0.66,0.84],[0.66,0.64],[0.48,0.48]]],
    '9': [[[0.64,0.38],[0.48,0.52],[0.2,0.52],[0.04,0.38],[0.04,0.16],[0.2,0],[0.48,0],[0.64,0.16],[0.64,0.72],[0.48,0.96],[0.2,1],[0.08,0.92]]],
    '!': [[[0.35,0],[0.35,0.68]], [[0.35,0.88],[0.35,1]]],
    '?': [[[0.08,0.2],[0.22,0],[0.48,0],[0.62,0.18],[0.62,0.36],[0.35,0.54],[0.35,0.7]], [[0.35,0.9],[0.35,1]]],
    '.': [[[0.32,0.92],[0.38,0.92],[0.38,1],[0.32,1],[0.32,0.92]]],
    ',': [[[0.36,0.88],[0.36,0.98],[0.24,1.12]]],
    '-': [[[0.14,0.5],[0.56,0.5]]],
    '+': [[[0.35,0.24],[0.35,0.76]], [[0.1,0.5],[0.6,0.5]]],
    '/': [[[0.08,1],[0.62,0]]],
    ':': [[[0.32,0.28],[0.38,0.28],[0.38,0.36],[0.32,0.36]], [[0.32,0.78],[0.38,0.78],[0.38,0.86],[0.32,0.86]]],
    '(': [[[0.5,0],[0.24,0.25],[0.24,0.75],[0.5,1]]],
    ')': [[[0.2,0],[0.46,0.25],[0.46,0.75],[0.2,1]]],
    ' ': []
};

function generateTextPolylines(anchorX, anchorY) {
    const raw = (document.getElementById('textToolValue')?.value || '').toUpperCase();
    if (!raw.trim()) return [];
    const size = Math.max(10, parseFloat(document.getElementById('textToolSize')?.value) || 48);
    const spacingMul = parseFloat(document.getElementById('textToolSpacing')?.value) || 1.15;
    const style = document.getElementById('textToolStyle')?.value || 'stroke';

    const charAdvance = size * 0.85 * spacingMul;
    const totalW = Math.max(size * 0.7, (raw.length - 1) * charAdvance + size * 0.7);
    const startX = anchorX - totalW / 2;
    const startY = anchorY - size / 2;

    const polylines = [];
    for (let idx = 0; idx < raw.length; idx++) {
        const ch = raw[idx];
        const strokes = VECTOR_FONT[ch];
        if (!strokes) continue;
        const ox = startX + idx * charAdvance;
        for (const stroke of strokes) {
            if (stroke.length < 2) continue;
            const pts = stroke.map(pt => ({
                x: Math.round(ox + pt[0] * size),
                y: Math.round(startY + pt[1] * size)
            }));
            polylines.push(pts);
            if (style === 'bold') {
                const offset = Math.max(1.5, size * 0.04);
                polylines.push(stroke.map(pt => ({
                    x: Math.round(ox + pt[0] * size + offset),
                    y: Math.round(startY + pt[1] * size + offset * 0.4)
                })));
            }
        }
    }
    return polylines;
}

function drawTextPreview() {
    if (appMode === 'auto' || currentTool !== 'text' || !mousePos) return;
    const snapped = snapPoint(mousePos, isShiftDown);
    const polylines = generateTextPolylines(snapped.x, snapped.y);
    if (polylines.length === 0) return;

    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = '#E85D35';
    ctx.lineWidth = Math.max(2, 0.5 / zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    for (const poly of polylines) {
        if (poly.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.stroke();
    }
    ctx.restore();
}

function commitTextStamp(pos, altKey) {
    const polylines = generateTextPolylines(pos.x, pos.y);
    if (polylines.length === 0) {
        toast('Enter text in the Text tool settings first!', 'info', 2000);
        return;
    }
    const settings = getPatternSettings(altKey);
    const finalPolys = [];
    for (const poly of polylines) {
        if (settings.bypass || settings.lineType === 'solid') {
            finalPolys.push(poly);
        } else {
            const frags = applyLinePattern(poly, settings.lineType, settings.scale, settings.coverage, settings.seed);
            for (const f of frags) {
                if (polylineLength(f) >= 1.5) finalPolys.push(f);
            }
        }
    }
    if (finalPolys.length > 0 && commitFragments(finalPolys)) {
        toast(`Stamped text: +${finalPolys.length} strokes ✓`, 'success', 1500);
    }
}

// ==========================================
// MODIFY (VERTEX EDITING)
// ==========================================
function findNearestVertex(pos) {
    let best = null;
    let bestDist = 12 / zoom;
    if (!physicsLocked) {
        for (const poly of physicsLines) for (let i = 0; i < poly.length; i++) {
            const d = Math.hypot(poly[i].x - pos.x, poly[i].y - pos.y);
            if (d < bestDist) { bestDist = d; best = { poly, index: i, layer: 'physics' }; }
        }
    }
    if (!sceneryLocked) {
        for (const poly of sceneryLines) for (let i = 0; i < poly.length; i++) {
            const d = Math.hypot(poly[i].x - pos.x, poly[i].y - pos.y);
            if (d < bestDist) { bestDist = d; best = { poly, index: i, layer: 'scenery' }; }
        }
    }
    return best;
}

function deleteSelectedVertex() {
    if (!selectedVertex) return;
    const layer = selectedVertex.layer;
    if (isLayerLocked(layer)) return;
    snapshot();
    const poly = cowReplacePoly(selectedVertex.poly, layer);
    const index = selectedVertex.index;
    let oldPoint = null;
    if (index >= 0 && index < poly.length) {
        oldPoint = poly[index];
        poly.splice(index, 1);
        invalidatePolyBBox(poly);
        if (poly.length < 2) {
            const arr = layer === 'physics' ? physicsLines : sceneryLines;
            const idx = arr.indexOf(poly);
            if (idx >= 0) arr.splice(idx, 1);
        }
        if (layer === 'scenery') {
            for (let i = originalSceneryLines.length - 1; i >= 0; i--) {
                const op = originalSceneryLines[i];
                let matchIdx = op.findIndex(p => p.x === oldPoint.x && p.y === oldPoint.y);
                if (matchIdx !== -1) {
                    const clonedOp = clonePoints(op);
                    clonedOp.splice(matchIdx, 1);
                    if (clonedOp.length < 2) originalSceneryLines.splice(i, 1);
                    else originalSceneryLines[i] = clonedOp;
                    break;
                }
            }
        }
    }
    if (layer === 'physics') bumpPhysics();
    else bumpTrackVersion();
    selectedVertex = null; updatePreviewBadge(); draw();
}

// ==========================================
// MOUSE INTERACTION & CONTEXT MENU
// ==========================================
const ctxMenu = document.getElementById('canvasContextMenu');

function hideContextMenu() {
    if (ctxMenu) ctxMenu.style.display = 'none';
}

function showContextMenu(e) {
    if (!ctxMenu) return;
    e.preventDefault();
    // Refresh dynamic state labels inside context menu before displaying
    const snapOn = !!document.getElementById('snapToGridToggle')?.checked;
    const snapLbl = document.getElementById('ctxSnapLabel');
    if (snapLbl) snapLbl.textContent = snapOn ? 'Snap to Grid: ON' : 'Snap to Grid: OFF';
    const snapItem = ctxMenu.querySelector('[data-action="snap-point"]');
    if (snapItem) snapItem.classList.toggle('active-item', snapOn);

    const perspLbl = document.getElementById('ctxPerspLabel');
    const perspState = !perspectiveGrid.visible ? 'OFF' : perspectiveGrid.snapMode.toUpperCase();
    if (perspLbl) perspLbl.textContent = `Perspective: ${perspState}`;
    const perspItem = ctxMenu.querySelector('[data-action="persp-cycle"]');
    if (perspItem) perspItem.classList.toggle('active-item', perspectiveGrid.visible);

    ctxMenu.style.display = 'block';
    const menuW = ctxMenu.offsetWidth || 210;
    const menuH = ctxMenu.offsetHeight || 360;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 10;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 10;
    ctxMenu.style.left = Math.max(10, x) + 'px';
    ctxMenu.style.top = Math.max(10, y) + 'px';
}

canvas.addEventListener('contextmenu', (e) => {
    // Only open context menu on canvas if not dragging or cancelling/finishing a tool stroke
    if (
        suppressNextContextMenu ||
        isDrawing ||
        curveState !== 'idle' ||
        bridgeState !== 'idle' ||
        isTubeDrawing ||
        isGradDragging ||
        shapeState !== 'idle' ||
        boxState !== 'idle' ||
        placementState.active
    ) {
        suppressNextContextMenu = false;
        e.preventDefault();
        return;
    }
    showContextMenu(e);
});

window.addEventListener('click', (e) => {
    if (ctxMenu && !ctxMenu.contains(e.target)) {
        hideContextMenu();
    }
});

// Setup context menu action dispatch
if (ctxMenu) {
    ctxMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item) return;
        const action = item.getAttribute('data-action');
        hideContextMenu();
        handleContextMenuAction(action);
    });
}

function handleContextMenuAction(action) {
    switch (action) {
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'toggle-layer': {
            const dl = document.getElementById('drawLayer');
            if (dl) {
                dl.value = dl.value === 'physics' ? 'scenery' : 'physics';
                dl.dispatchEvent(new Event('change'));
            }
            break;
        }
        case 'snap-point': {
            const st = document.getElementById('snapToGridToggle');
            if (st) {
                st.checked = !st.checked;
                saveSettings();
                toast('Snap to Grid: ' + (st.checked ? 'ON' : 'OFF'), 'info', 1500);
            }
            break;
        }
        case 'persp-cycle': {
            if (!perspectiveGrid.visible) {
                perspectiveGrid.visible = true;
                perspectiveGrid.snapMode = 'angle';
            } else if (perspectiveGrid.snapMode === 'angle') {
                perspectiveGrid.snapMode = 'grid';
            } else if (perspectiveGrid.snapMode === 'grid') {
                perspectiveGrid.snapMode = 'none';
            } else {
                perspectiveGrid.visible = false;
            }
            if (typeof syncPerspUI === 'function') syncPerspUI();
        if (typeof updateAngleLockUI === 'function') updateAngleLockUI();
            saveSettings();
            draw();
            const label = !perspectiveGrid.visible ? 'OFF' : perspectiveGrid.snapMode.toUpperCase();
            toast('Perspective: ' + label, 'info', 1500);
            break;
        }
        case 'tool-line': clickTool('line'); break;
        case 'tool-curve': clickTool('curve'); break;
        case 'tool-eraser': clickTool('eraser'); break;
        case 'tool-fill': clickTool('fill'); break;
        case 'tool-select': clickTool('select'); break;
        case 'fit-view': {
            const fitBtn = document.getElementById('fitViewBtn');
            if (fitBtn) fitBtn.click();
            break;
        }
        case 'toggle-zen': toggleZenMode(); break;
    }
}

canvas.addEventListener('mousedown', (e) => {
    isShiftDown = e.shiftKey;
    if (e.button === 2) {
        rightDownScreenPos = { x: e.clientX, y: e.clientY };
        suppressNextContextMenu = false;
    }

    if (placementState.active) {
        if (e.button === 0) {
            const pos = getWorldMouse(e);
            commitPlacement(pos.x, pos.y);
            e.preventDefault();
        } else if (e.button === 2) {
            suppressNextContextMenu = true;
            cancelPlacement();
        }
        return;
    }

    if (isPerspEditMode && e.button === 0 && !perspectiveGrid.locked) {
        const pos = getWorldMouse(e);
        const handles = getPerspHandleList();
        const hitR = 16 / zoom;
        for (const h of handles) {
            if (Math.hypot(pos.x - h.x, pos.y - h.y) <= hitR) {
                dragMode = 'perspHandle';
                dragPerspHandle = h.id;
                perspDragLast = { x: pos.x, y: pos.y };
                return;
            }
        }
    }

    if (isRefImgDragMode && e.button === 0 && refImage.img && !refImage.locked) {
        const pos = getWorldMouse(e);
        dragMode = 'refImg';
        refImgDragStart = { x: pos.x, y: pos.y };
        refImgStartPos = { x: refImage.x, y: refImage.y };
        return;
    }

    const isPan = e.button === 1 || (e.button === 0 && isSpaceDown);
    if (isPan) {
        dragMode = 'pan'; lastMouseX = e.clientX; lastMouseY = e.clientY; return;
    }

    if (appMode !== 'auto') {
        let pos = getWorldMouse(e);
        pos = snapPoint(pos, e.shiftKey);

        const activeLayer = document.getElementById('drawLayer').value;
        if (['line', 'line+', 'brush', 'fill', 'gradient', 'text', 'polygon', 'circle', 'box', 'curve', 'bridge', 'tube'].includes(currentTool)) {
            if (activeLayer === 'physics' && physicsLocked) {
                toast('Physics layer is locked!', 'error', 1500);
                return;
            }
            if (activeLayer === 'scenery' && sceneryLocked) {
                toast('Scenery layer is locked!', 'error', 1500);
                return;
            }
        }

        if (currentTool === 'select') {
            if (e.button === 0) {
                if (selection.fragments.length > 0 && selection.bbox && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    const b = selection.bbox;
                    const pad = 8 / zoom;
                    if (pos.x >= b.minX - pad && pos.x <= b.maxX + pad && pos.y >= b.minY - pad && pos.y <= b.maxY + pad) {
                        dragMode = 'moveSelection';
                        selMoveStart = { x: pos.x, y: pos.y };
                        selMoveDelta = { x: 0, y: 0 };
                        draw();
                        return;
                    }
                }
                const mode = e.shiftKey ? 'sub' : (e.ctrlKey || e.metaKey ? 'add-keep' : 'add');
                if (mode === 'add') { selectionBoxes.add.length = 0; selectionBoxes.subtract.length = 0; }
                selDragState = { x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y, mode: mode === 'sub' ? 'sub' : 'add', ctrl: mode === 'add-keep' };
                dragMode = 'selectBox';
                draw();
            }
            return;
        }

        if (currentTool === 'curve') {
            if (e.button === 0) {
                if (curveState === 'idle') {
                    curveStart = pos;
                    curveEnd = pos;
                    curveControl = pos;
                    curveState = 'setting_end';
                } else if (curveState === 'setting_end') {
                    curveEnd = pos;
                    curveControl = pos;
                    curveState = 'setting_apex';
                } else if (curveState === 'setting_apex') {
                    curveControl = pos;
                    const steps = parseInt(document.getElementById('curveSegments')?.value) || 16;
                    const pts = [];
                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const mt = 1 - t;
                        const cx = mt * mt * curveStart.x + 2 * mt * t * curveControl.x + t * t * curveEnd.x;
                        const cy = mt * mt * curveStart.y + 2 * mt * t * curveControl.y + t * t * curveEnd.y;
                        pts.push({ x: Math.round(cx), y: Math.round(cy) });
                    }
                    commitDrawnStroke(pts, e.altKey);
                    curveState = 'idle';
                    curveStart = null;
                    curveControl = null;
                    curveEnd = null;
                }
                draw();
            } else if (e.button === 2) {
                if (curveState !== 'idle') suppressNextContextMenu = true;
                curveState = 'idle';
                curveStart = null;
                curveControl = null;
                curveEnd = null;
                draw();
            }
            return;
        }

        if (currentTool === 'bridge') {
            if (e.button === 0) {
                const nearEp = findNearestEndpoint(pos, 25 / zoom);
                if (bridgeState === 'idle') {
                    bridgeStart = nearEp ? nearEp.pt : pos;
                    bridgeStartTangent = nearEp ? nearEp.tangent : null;
                    bridgeEnd = bridgeStart;
                    bridgeState = 'setting_end';
                } else if (bridgeState === 'setting_end') {
                    bridgeEnd = nearEp ? nearEp.pt : pos;
                    bridgeEndTangent = nearEp ? nearEp.tangent : null;
                    const tension = parseFloat(document.getElementById('bridgeTension')?.value) || 1.0;
                    const steps = parseInt(document.getElementById('bridgeSteps')?.value) || 16;
                    const pts = computeBridgePoints(bridgeStart, bridgeStartTangent, bridgeEnd, bridgeEndTangent, tension, steps);
                    commitDrawnStroke(pts, e.altKey);
                    bridgeState = 'idle';
                    bridgeStart = null;
                    bridgeStartTangent = null;
                    bridgeEnd = null;
                    bridgeEndTangent = null;
                }
                draw();
            } else if (e.button === 2) {
                if (bridgeState !== 'idle') suppressNextContextMenu = true;
                bridgeState = 'idle';
                bridgeStart = null;
                bridgeStartTangent = null;
                bridgeEnd = null;
                bridgeEndTangent = null;
                draw();
            }
            return;
        }

        if (currentTool === 'tube') {
            if (e.button === 0) {
                if (!isTubeDrawing) {
                    isTubeDrawing = true;
                    tubeSpine = [pos];
                } else {
                    tubeSpine.push(pos);
                }
                dragMode = 'tubeDrag';
                draw();
            } else if (e.button === 2) {
                if (isTubeDrawing) suppressNextContextMenu = true;
                if (isTubeDrawing && tubeSpine.length >= 2) {
                    bakeTubeWalls(e.altKey);
                }
                isTubeDrawing = false;
                tubeSpine = [];
                draw();
            }
            return;
        }

        if (currentTool === 'line' || currentTool === 'line+') {
            if (e.button === 0) {
                if (!isDrawing) { isDrawing = true; currentLine = [pos]; }
                else {
                    currentLine.push(pos);
                    if (currentTool === 'line') {
                        commitDrawnStroke(currentLine, e.altKey);
                        isDrawing = false; currentLine = [];
                    }
                }
                draw();
            } else if (e.button === 2) {
                if (isDrawing) suppressNextContextMenu = true;
                if (isDrawing && currentLine.length >= 2) commitDrawnStroke(currentLine, e.altKey);
                isDrawing = false; currentLine = []; draw();
            }
        } else if (currentTool === 'brush') {
            if (e.button === 0) { isDrawing = true; currentLine = [pos]; }
            else if (e.button === 2 && isDrawing) {
                suppressNextContextMenu = true;
                isDrawing = false;
                currentLine = [];
                draw();
            }
        } else if (currentTool === 'eraser') {
            if (e.button === 0) {
                snapshot();
                dragMode = 'eraser';
                lastEraserPos = { x: pos.x, y: pos.y };
                eraserErasedAny = false;
                if (eraseAt(pos)) {
                    eraserErasedAny = true;
                }
            }
        } else if (currentTool === 'fill') {
            if (e.button === 0) { fillArea(pos.x, pos.y, e.altKey); }
        } else if (currentTool === 'gradient') {
            if (e.button === 0) {
                const opts = getGradientSettings();
                isGradDragging = true;
                gradStart = { x: pos.x, y: pos.y };
                gradEnd = { x: pos.x, y: pos.y };
                gradClipCache = opts.clipMode === 'auto' ? computeEnclosedRegion(pos.x, pos.y) : null;
                gradPreviewLines = [];
                dragMode = 'gradientDrag';
                draw();
            } else if (e.button === 2 && isGradDragging) {
                suppressNextContextMenu = true;
                resetDrawingState();
            }
        } else if (currentTool === 'text') {
            if (e.button === 0) {
                commitTextStamp(pos, e.altKey);
            }
        } else if (currentTool === 'rockBrush') {
            if (e.button === 0) {
                snapshot();
                dragMode = 'rockBrushDrag';
                isRockBrushPainting = true;
                currentRockBrushStrokeHulls = [];
                stampSingleRock(pos, e.altKey);
            }
        } else if (currentTool === 'polygon' || currentTool === 'circle') {
            if (e.button === 0) {
                if (shapeState === 'idle') { shapeCenter = pos; shapeRadius = 0; shapeRotation = 0; shapeState = 'radius'; }
                else if (shapeState === 'radius') { shapeState = 'rotation'; if (currentTool === 'circle') { finalizeShape(e.altKey); } }
                else if (shapeState === 'rotation') { finalizeShape(e.altKey); }
                draw();
            } else if (e.button === 2 && shapeState !== 'idle') {
                suppressNextContextMenu = true;
                shapeState = 'idle';
                draw();
            }
        } else if (currentTool === 'box') {
            if (e.button === 0) {
                if (boxState === 'idle') {
                    boxAnchor = pos;
                    boxFrontQuad = computeBoxFrontQuad(boxAnchor, pos);
                    boxFullCorners = null;
                    boxState = 'front';
                } else if (boxState === 'front') {
                    boxFrontQuad = computeBoxFrontQuad(boxAnchor, pos);
                    boxFullCorners = computeBox3DCorners(boxFrontQuad, pos);
                    boxState = 'depth';
                } else if (boxState === 'depth') {
                    boxFullCorners = computeBox3DCorners(boxFrontQuad, pos);
                    finalizeBox(e.altKey);
                }
                draw();
            } else if (e.button === 2 && boxState !== 'idle') {
                suppressNextContextMenu = true;
                boxState = 'idle';
                boxAnchor = null;
                boxFrontQuad = null;
                boxFullCorners = null;
                draw();
            }
        } else if (currentTool === 'modify') {
            if (e.button === 0) {
                const hit = findNearestVertex(pos);
                if (hit) { selectedVertex = hit; dragMode = 'vertex'; vertexSnapshotPending = true; draw(); }
                else { selectedVertex = null; vertexSnapshotPending = false; draw(); }
            }
        }
    } else {
        if (isPickingShadePoint) {
            if (e.button === 0) {
                const rawPos = getWorldMouse(e);
                const snapped = (perspectiveGrid.visible && snapToPerspGrid(rawPos)) || snapPoint(rawPos, e.shiftKey);
                perspShadePoint.x = Math.round(snapped.x);
                perspShadePoint.y = Math.round(snapped.y);
                setPickShadePointMode(false);
                syncPerspShadePointUI();
                saveSettings();
                if (document.getElementById('liveUpdate')?.checked) executeScript(true);
                else draw();
                toast(`Shade point set to (${perspShadePoint.x}, ${perspShadePoint.y})`, 'info', 1400);
            } else if (e.button === 2) {
                suppressNextContextMenu = true;
                setPickShadePointMode(false);
            }
            return;
        }
        if (e.button === 0) {
            if (isPerspShadowScriptActive() && !document.getElementById('maskModeToggle').checked) {
                const pos = getWorldMouse(e);
                if (Math.hypot(pos.x - perspShadePoint.x, pos.y - perspShadePoint.y) <= 18 / zoom) {
                    dragMode = 'shadePoint';
                    applyToolCursor();
                    return;
                }
            }
            if (document.getElementById('maskModeToggle').checked) {
                const pos = getWorldMouse(e); snapshot(); paintMask(pos.x, pos.y, true); dragMode = 'mask';
                lastMaskX = pos.x; lastMaskY = pos.y;
            } else { dragMode = 'pan'; lastMouseX = e.clientX; lastMouseY = e.clientY; }
        } else if (e.button === 2) { dragMode = 'pan'; lastMouseX = e.clientX; lastMouseY = e.clientY; }
    }
});

window.addEventListener('mouseup', (e) => {
    isShiftDown = e.shiftKey;
    if (e.button === 2 && rightDownScreenPos) {
        if (Math.hypot(e.clientX - rightDownScreenPos.x, e.clientY - rightDownScreenPos.y) > 5) {
            suppressNextContextMenu = true;
        }
        rightDownScreenPos = null;
    }
    if (dragMode === 'pan' && (e.button === 1 || e.button === 0 || e.button === 2)) {
        dragMode = null;
        applyToolCursor();
        draw();
        return;
    }
    if (e.button !== 0) return;

    if (dragMode === 'perspHandle') {
        dragMode = null;
        dragPerspHandle = null;
        perspDragLast = null;
        if (typeof syncPerspUI === 'function') syncPerspUI();
        applyToolCursor();
        saveSettings();
        draw();
        return;
    }
    if (dragMode === 'shadePoint') {
        dragMode = null;
        syncPerspShadePointUI();
        applyToolCursor();
        saveSettings();
        if (document.getElementById('liveUpdate')?.checked) executeScript(true);
        else draw();
        return;
    }
    if (dragMode === 'refImg') {
        dragMode = null;
        refImgDragStart = null;
        refImgStartPos = null;
        draw();
        return;
    }
    if (dragMode === 'moveSelection' && selMoveStart) {
        const dx = selMoveDelta.x, dy = selMoveDelta.y;
        dragMode = null;
        selMoveStart = null;
        selMoveDelta = { x: 0, y: 0 };
        if (Math.hypot(dx, dy) >= 0.5) {
            commitTransformedSelection(p => ({ x: p.x + dx, y: p.y + dy }));
            toast('Moved selection.', 'info', 1000);
        } else {
            draw();
        }
        return;
    }
    if (dragMode === 'rockBrushDrag') {
        dragMode = null;
        isRockBrushPainting = false;
        lastRockBrushPos = null;
        currentRockBrushStrokeHulls = [];
        draw();
        return;
    }
    if (dragMode === 'gradientDrag' && isGradDragging) {
        dragMode = null;
        const p0 = gradStart, p1 = gradEnd;
        isGradDragging = false;
        gradStart = null;
        gradEnd = null;
        gradPreviewLines = [];
        if (p0 && p1) commitGradient(p0, p1, e.altKey);
        gradClipCache = null;
        draw();
        return;
    }
    if (appMode !== 'auto' && currentTool === 'brush' && isDrawing) {
        if (currentLine.length >= 2) commitDrawnStroke(currentLine, e.altKey);
        isDrawing = false; currentLine = []; draw();
    }
    if (dragMode === 'selectBox' && selDragState) {
        const dx = Math.abs(selDragState.x1 - selDragState.x0);
        const dy = Math.abs(selDragState.y1 - selDragState.y0);
        if (dx > 3 / zoom || dy > 3 / zoom) {
            const box = { x1: selDragState.x0, y1: selDragState.y0, x2: selDragState.x1, y2: selDragState.y1 };
            if (selDragState.mode === 'sub') selectionBoxes.subtract.push(box);
            else selectionBoxes.add.push(box);
            refreshSelection();
        } else {
            if (!selDragState.ctrl) clearSelection();
        }
        selDragState = null;
        draw();
    }
    if (dragMode === 'eraser') {
        if (!eraserErasedAny) {
            undoHistory.pop();
        }
        lastEraserPos = null;
    }
    if (dragMode === 'tubeDrag') {
        dragMode = null;
        if (tubeSpine.length >= 3 || (tubeSpine.length === 2 && Math.hypot(tubeSpine[1].x - tubeSpine[0].x, tubeSpine[1].y - tubeSpine[0].y) > 20)) {
            bakeTubeWalls(e.altKey);
            isTubeDrawing = false;
            tubeSpine = [];
            draw();
        }
        return;
    }
    dragMode = null;
    vertexSnapshotPending = false;
    activePerspGuideRay = null;
    activeAngleGuide = null;
    if (currentTool !== 'modify') selectedVertex = null;
    draw();
});

window.addEventListener('mousemove', (e) => {
    isShiftDown = e.shiftKey;
    mousePos = getWorldMouse(e);

    const sc = document.getElementById('statusCoords');
    if (sc) sc.textContent = 'X: ' + Math.round(mousePos.x) + '  Y: ' + Math.round(mousePos.y);

    const sm = document.getElementById('statusMeasure');
    if (sm) {
        if (isDrawing && currentLine.length > 0) {
            const p0 = currentLine[currentLine.length - 1];
            const dx = mousePos.x - p0.x, dy = mousePos.y - p0.y;
            const len = Math.hypot(dx, dy);
            const deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
            sm.textContent = `Len: ${Math.round(len)}px  ∠ ${deg}°`;
        } else if (curveState === 'setting_end' && curveStart) {
            const dx = mousePos.x - curveStart.x, dy = mousePos.y - curveStart.y;
            const len = Math.hypot(dx, dy);
            const deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
            sm.textContent = `Span: ${Math.round(len)}px  ∠ ${deg}°`;
        } else if (curveState === 'setting_apex' && curveStart && curveEnd) {
            const midX = (curveStart.x + curveEnd.x) / 2;
            const midY = (curveStart.y + curveEnd.y) / 2;
            const dist = Math.hypot(mousePos.x - midX, mousePos.y - midY);
            sm.textContent = `Apex Arch: ${Math.round(dist)}px`;
        } else if (currentTool === 'bridge' && bridgeState === 'setting_end' && bridgeStart) {
            const dx = mousePos.x - bridgeStart.x, dy = mousePos.y - bridgeStart.y;
            const len = Math.hypot(dx, dy);
            const deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
            sm.textContent = `Bridge: ${Math.round(len)}px  ∠ ${deg}°`;
        } else if (currentTool === 'tube' && isTubeDrawing && tubeSpine.length > 0) {
            const p0 = tubeSpine[tubeSpine.length - 1];
            const dx = mousePos.x - p0.x, dy = mousePos.y - p0.y;
            const len = Math.hypot(dx, dy);
            const deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
            sm.textContent = `Tube: ${Math.round(len)}px  ∠ ${deg}°`;
        } else if (dragMode === 'gradientDrag' && gradStart) {
            const dx = mousePos.x - gradStart.x, dy = mousePos.y - gradStart.y;
            const len = Math.hypot(dx, dy);
            const deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
            sm.textContent = `Grad: ${Math.round(len)}px  ∠ ${deg}°`;
        } else if (dragMode === 'moveSelection') {
            sm.textContent = `Move Δ: ${Math.round(selMoveDelta.x)}, ${Math.round(selMoveDelta.y)}`;
        } else {
            sm.textContent = 'Len: 0px  ∠ 0°';
        }
    }

    if (placementState.active) { placementState.cursor = { x: mousePos.x, y: mousePos.y }; draw(); return; }

    if (!dragMode) {
        perspHoverSnapPt = null;
        if (isPickingShadePoint && perspectiveGrid.visible) {
            perspHoverSnapPt = snapToPerspGrid(mousePos);
            draw();
            return;
        }
        if (isPerspShadowScriptActive() && !document.getElementById('maskModeToggle').checked) {
            const hov = Math.hypot(mousePos.x - perspShadePoint.x, mousePos.y - perspShadePoint.y) <= 18 / zoom;
            if (hov !== hoveredShadeHandle) {
                hoveredShadeHandle = hov;
                applyToolCursor();
                draw();
            }
        } else if (hoveredShadeHandle) {
            hoveredShadeHandle = false;
            applyToolCursor();
        }
        if (isPerspEditMode && !perspectiveGrid.locked) {
            const handles = getPerspHandleList();
            const hitR = 16 / zoom;
            let nextHover = null;
            for (const h of handles) {
                if (Math.hypot(mousePos.x - h.x, mousePos.y - h.y) <= hitR) { nextHover = h.id; break; }
            }
            if (nextHover !== hoveredPerspHandle) {
                hoveredPerspHandle = nextHover;
                applyToolCursor();
                draw();
            }
        }
        const updateGridReticle = (pt) => {
            if (perspectiveGrid.visible && perspectiveGrid.snapMode === 'grid' && appMode !== 'auto') {
                perspHoverSnapPt = snapToPerspGrid(pt);
            }
        };
        if (curveState === 'setting_end') {
            curveEnd = snapPoint(mousePos, e.shiftKey, curveStart);
            updateGridReticle(mousePos);
            draw();
            return;
        } else if (curveState === 'setting_apex') {
            curveControl = snapPoint(mousePos, e.shiftKey);
            updateGridReticle(mousePos);
            draw();
            return;
        } else if (bridgeState === 'setting_end') {
            const nearEp = findNearestEndpoint(snapPoint(mousePos, e.shiftKey, bridgeStart), 25 / zoom);
            bridgeEnd = nearEp ? nearEp.pt : snapPoint(mousePos, e.shiftKey, bridgeStart);
            updateGridReticle(mousePos);
            draw();
            return;
        } else if (currentTool === 'bridge') {
            draw();
        } else if (currentTool === 'tube' && isTubeDrawing) {
            mousePos = snapPoint(mousePos, e.shiftKey);
            updateGridReticle(mousePos);
            draw();
        }

        if (isDrawing) {
            const rawMouse = mousePos;
            const snapped = snapPoint(rawMouse, e.shiftKey);
            updateGridReticle(rawMouse);
            if (currentTool === 'brush') {
                const spacing = parseFloat(document.getElementById('pointSpacing').value) || 0;
                if (spacing <= 0 || currentLine.length === 0 ||
                    Math.hypot(snapped.x - currentLine[currentLine.length - 1].x,
                               snapped.y - currentLine[currentLine.length - 1].y) >= spacing) {
                    currentLine.push(snapped);
                    draw();
                }
            } else {
                mousePos = snapped;
                draw();
            }
        } else if (shapeState === 'radius') {
            const snapped = snapPoint(mousePos, e.shiftKey);
            updateGridReticle(mousePos);
            shapeRadius = Math.hypot(snapped.x - shapeCenter.x, snapped.y - shapeCenter.y); draw();
        } else if (shapeState === 'rotation') {
            shapeRotation = Math.atan2(mousePos.y - shapeCenter.y, mousePos.x - shapeCenter.x); draw();
        } else if (currentTool === 'box' && boxState !== 'idle' && boxAnchor) {
            const snapped = snapPoint(mousePos, e.shiftKey, boxAnchor);
            updateGridReticle(mousePos);
            if (boxState === 'front') boxFrontQuad = computeBoxFrontQuad(boxAnchor, snapped);
            else if (boxState === 'depth' && boxFrontQuad) boxFullCorners = computeBox3DCorners(boxFrontQuad, snapped);
            draw();
        } else if (perspectiveGrid.visible && perspectiveGrid.snapMode === 'grid' && appMode !== 'auto') {
            perspHoverSnapPt = snapToPerspGrid(mousePos);
            draw();
        } else if (currentTool === 'modify' || currentTool === 'eraser' || currentTool === 'text' || currentTool === 'rockBrush') { draw(); }
        return;
    }

    if (dragMode === 'rockBrushDrag' && isRockBrushPainting) {
        if (!lastRockBrushPos || Math.hypot(mousePos.x - lastRockBrushPos.x, mousePos.y - lastRockBrushPos.y) >= rockBrushSize * 0.65) {
            stampSingleRock(mousePos, e.altKey);
        }
        return;
    }

    if (dragMode === 'shadePoint') {
        const snapped = (perspectiveGrid.visible && (perspectiveGrid.snapMode === 'grid' || e.shiftKey) && snapToPerspGrid(mousePos))
            || snapPoint(mousePos, e.shiftKey);
        perspShadePoint.x = Math.round(snapped.x);
        perspShadePoint.y = Math.round(snapped.y);
        syncPerspShadePointUI();
        if (document.getElementById('liveUpdate')?.checked) {
            clearTimeout(liveUpdateTimeout);
            liveUpdateTimeout = setTimeout(() => executeScript(true), 60);
        }
        draw();
        return;
    }

    if (dragMode === 'perspHandle' && dragPerspHandle && perspDragLast) {
        const dx = mousePos.x - perspDragLast.x;
        const dy = mousePos.y - perspDragLast.y;
        perspDragLast = { x: mousePos.x, y: mousePos.y };
        if (dragPerspHandle === 'vp1') {
            perspectiveGrid.vp1.x = Math.round(mousePos.x);
            perspectiveGrid.vp1.y = Math.round(mousePos.y);
            if (e.shiftKey && (perspectiveGrid.mode === '2pt' || perspectiveGrid.mode === '3pt')) {
                perspectiveGrid.vp1.y = perspectiveGrid.vp2.y;
            }
        } else if (dragPerspHandle === 'vp2') {
            perspectiveGrid.vp2.x = Math.round(mousePos.x);
            perspectiveGrid.vp2.y = Math.round(mousePos.y);
            if (e.shiftKey) perspectiveGrid.vp2.y = perspectiveGrid.vp1.y;
        } else if (dragPerspHandle === 'vp3') {
            perspectiveGrid.vp3.x = Math.round(mousePos.x);
            perspectiveGrid.vp3.y = Math.round(mousePos.y);
        } else if (dragPerspHandle === 'horizon') {
            perspectiveGrid.vp1.y = Math.round(perspectiveGrid.vp1.y + dy);
            perspectiveGrid.vp2.y = Math.round(perspectiveGrid.vp2.y + dy);
        }
        if (typeof syncPerspUI === 'function') syncPerspUI();
        draw();
        return;
    }

    if (dragMode === 'refImg' && refImgDragStart && refImgStartPos) {
        refImage.x = refImgStartPos.x + (mousePos.x - refImgDragStart.x);
        refImage.y = refImgStartPos.y + (mousePos.y - refImgDragStart.y);
        draw();
        return;
    }

    if (dragMode === 'moveSelection' && selMoveStart) {
        let dx = mousePos.x - selMoveStart.x;
        let dy = mousePos.y - selMoveStart.y;
        if (e.shiftKey || document.getElementById('snapToGridToggle').checked) {
            const g = parseInt(document.getElementById('gridSizeSelect').value) || 10;
            dx = Math.round(dx / g) * g;
            dy = Math.round(dy / g) * g;
        }
        selMoveDelta = { x: dx, y: dy };
        draw();
        return;
    }

    if (dragMode === 'gradientDrag' && isGradDragging && gradStart) {
        gradEnd = snapPoint(mousePos, e.shiftKey);
        const opts = getGradientSettings();
        if (opts.clipMode === 'auto') {
            const dragDist = Math.hypot(gradEnd.x - gradStart.x, gradEnd.y - gradStart.y);
            if ((!gradClipCache || gradClipCache.error) && dragDist >= 4) {
                const dragDir = { dx: gradEnd.x - gradStart.x, dy: gradEnd.y - gradStart.y };
                const resolved = computeEnclosedRegion(gradStart.x, gradStart.y, dragDir);
                if (resolved && !resolved.error) gradClipCache = resolved;
            }
        }
        gradPreviewLines = generateGradientPolylines(gradStart, gradEnd, opts, gradClipCache);
        draw();
        return;
    }

    if (dragMode === 'tubeDrag') {
        const snapped = snapPoint(mousePos, e.shiftKey);
        const last = tubeSpine[tubeSpine.length - 1];
        if (!last || Math.hypot(snapped.x - last.x, snapped.y - last.y) >= 12) {
            tubeSpine.push(snapped);
            draw();
        }
        return;
    }

    if (dragMode === 'eraser' && lastEraserPos) {
        const rWorld = getEraserRadiusWorld();
        const curPos = mousePos;
        const dx = curPos.x - lastEraserPos.x;
        const dy = curPos.y - lastEraserPos.y;
        const dist = Math.hypot(dx, dy);
        const maxStep = Math.max(2, rWorld * 0.4);
        const steps = Math.max(1, Math.ceil(dist / maxStep));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const stepPt = {
                x: lastEraserPos.x + dx * t,
                y: lastEraserPos.y + dy * t
            };
            if (eraseAt(stepPt)) {
                eraserErasedAny = true;
            }
        }
        lastEraserPos = { x: curPos.x, y: curPos.y };
        draw();
    }
    else if (dragMode === 'mask') {
        const tool = document.getElementById('maskToolSelect').value;
        if (tool === 'fill') {
            // Do nothing
        } else {
            const size = parseInt(document.getElementById('brushSize').value);
            const dist = Math.hypot(mousePos.x - lastMaskX, mousePos.y - lastMaskY);
            const steps = Math.max(1, Math.ceil(dist / (size / 4)));
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                paintMask(lastMaskX + (mousePos.x - lastMaskX) * t, lastMaskY + (mousePos.y - lastMaskY) * t, false);
            }
            lastMaskX = mousePos.x; lastMaskY = mousePos.y;
        }
    }
    else if (dragMode === 'selectBox' && selDragState) { selDragState.x1 = mousePos.x; selDragState.y1 = mousePos.y; draw(); }
    else if (dragMode === 'vertex' && selectedVertex) {
        const origPoly = selectedVertex.poly;
        const pt = origPoly[selectedVertex.index];
        if (pt) {
            const adj = origPoly.length > 1
                ? (selectedVertex.index > 0 ? origPoly[selectedVertex.index - 1] : origPoly[selectedVertex.index + 1])
                : null;
            const snapped = snapPoint(mousePos, e.shiftKey, adj);
            const newX = Math.round(snapped.x);
            const newY = Math.round(snapped.y);
            if (newX === pt.x && newY === pt.y) return;

            if (vertexSnapshotPending) {
                snapshot();
                vertexSnapshotPending = false;
                selectedVertex.poly = cowReplacePoly(origPoly, selectedVertex.layer);
            }

            const curPoly = selectedVertex.poly;
            const curPt = curPoly[selectedVertex.index];
            const oldX = curPt.x, oldY = curPt.y;
            curPt.x = newX; curPt.y = newY;
            invalidatePolyBBox(curPoly);
            if (selectedVertex.layer === 'physics') bumpPhysics(); else { sceneryDirty = true; bumpTrackVersion(); }
            
            if (selectedVertex.layer === 'scenery') {
                for (let i = originalSceneryLines.length - 1; i >= 0; i--) {
                    const op = originalSceneryLines[i];
                    let matchIdx = op.findIndex(p => p.x === oldX && p.y === oldY);
                    if (matchIdx !== -1) {
                        const clonedOp = clonePoints(op);
                        clonedOp[matchIdx].x = newX;
                        clonedOp[matchIdx].y = newY;
                        originalSceneryLines[i] = clonedOp;
                        break;
                    }
                }
            }
            
            updatePreviewBadge(); draw();
        }
    } else if (dragMode === 'pan') {
        camX -= (e.clientX - lastMouseX) / zoom;
        camY -= (e.clientY - lastMouseY) / zoom;
        lastMouseX = e.clientX; lastMouseY = e.clientY; draw();
    }
});

// ==========================================
// ERASER MODES & ENGINE
// ==========================================
function trimSegmentAgainstCircle(p0, p1, cx, cy, r) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) {
        return Math.hypot(p0.x - cx, p0.y - cy) <= r ? [] : [[{ x: p0.x, y: p0.y }, { x: p1.x, y: p1.y }]];
    }

    const fx = p0.x - cx;
    const fy = p0.y - cy;
    const a = lenSq;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;

    if (disc <= 0) {
        if (fx * fx + fy * fy <= r * r) return [];
        return [[{ x: p0.x, y: p0.y }, { x: p1.x, y: p1.y }]];
    }

    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    const inStart = Math.max(0, t1);
    const inEnd = Math.min(1, t2);

    if (inStart >= inEnd) {
        return [[{ x: p0.x, y: p0.y }, { x: p1.x, y: p1.y }]];
    }

    const pieces = [];
    if (inStart > 1e-4) {
        const ptA = { x: p0.x, y: p0.y };
        const ptB = { x: p0.x + inStart * dx, y: p0.y + inStart * dy };
        if (Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y) >= 0.5) {
            pieces.push([ptA, ptB]);
        }
    }
    if (inEnd < 1 - 1e-4) {
        const ptA = { x: p0.x + inEnd * dx, y: p0.y + inEnd * dy };
        const ptB = { x: p1.x, y: p1.y };
        if (Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y) >= 0.5) {
            pieces.push([ptA, ptB]);
        }
    }
    return pieces;
}

function trimPolylineAgainstCircle(poly, cx, cy, r) {
    if (poly.length < 2) return [];
    const resultPolys = [];
    let currentLine = [];

    for (let i = 0; i < poly.length - 1; i++) {
        const p0 = poly[i];
        const p1 = poly[i + 1];
        const pieces = trimSegmentAgainstCircle(p0, p1, cx, cy, r);

        if (pieces.length === 0) {
            if (currentLine.length >= 2) resultPolys.push(currentLine);
            currentLine = [];
        } else if (pieces.length === 1) {
            const seg = pieces[0];
            const pStart = seg[0];
            const pEnd = seg[1];
            if (currentLine.length > 0) {
                const last = currentLine[currentLine.length - 1];
                if (Math.hypot(last.x - pStart.x, last.y - pStart.y) < 0.05) {
                    currentLine.push(pEnd);
                } else {
                    if (currentLine.length >= 2) resultPolys.push(currentLine);
                    currentLine = [pStart, pEnd];
                }
            } else {
                currentLine = [pStart, pEnd];
            }
            if (Math.hypot(pEnd.x - p1.x, pEnd.y - p1.y) >= 0.05) {
                if (currentLine.length >= 2) resultPolys.push(currentLine);
                currentLine = [];
            }
        } else {
            const seg1 = pieces[0];
            const seg2 = pieces[1];
            if (currentLine.length > 0) {
                const last = currentLine[currentLine.length - 1];
                if (Math.hypot(last.x - seg1[0].x, last.y - seg1[0].y) < 0.05) {
                    currentLine.push(seg1[1]);
                } else {
                    if (currentLine.length >= 2) resultPolys.push(currentLine);
                    currentLine = [seg1[0], seg1[1]];
                }
            } else {
                currentLine = [seg1[0], seg1[1]];
            }
            if (currentLine.length >= 2) resultPolys.push(currentLine);
            currentLine = [seg2[0], seg2[1]];
        }
    }

    if (currentLine.length >= 2) {
        resultPolys.push(currentLine);
    }
    return resultPolys;
}

function eraseOriginalAt(lines, pos, radius) {
    let erased = false;
    for (let i = lines.length - 1; i >= 0; i--) {
        const poly = lines[i];
        let anyNear = false;
        for (const pt of poly) {
            if (Math.hypot(pt.x - pos.x, pt.y - pos.y) <= radius) { anyNear = true; break; }
        }
        if (!anyNear) {
            for (let j = 0; j < poly.length - 1; j++) {
                if (pointLineDist(pos.x, pos.y, poly[j].x, poly[j].y, poly[j + 1].x, poly[j + 1].y) <= radius) {
                    anyNear = true; break;
                }
            }
        }
        if (!anyNear) continue;

        const parts = [];
        let current = [];
        for (let j = 0; j < poly.length - 1; j++) {
            const a = poly[j], b = poly[j + 1];
            const hit = Math.hypot(a.x - pos.x, a.y - pos.y) <= radius ||
                        Math.hypot(b.x - pos.x, b.y - pos.y) <= radius ||
                        pointLineDist(pos.x, pos.y, a.x, a.y, b.x, b.y) <= radius;
            if (hit) {
                if (current.length >= 2) parts.push(current);
                current = [];
            } else {
                if (current.length === 0) current.push(a);
                current.push(b);
            }
        }
        if (current.length >= 2) parts.push(current);
        lines.splice(i, 1, ...parts);
        erased = true;
    }
    return erased;
}

function eraseTrimAt(lines, pos, radius) {
    let erased = false;
    for (let i = lines.length - 1; i >= 0; i--) {
        const poly = lines[i];
        let anyNear = false;
        for (const pt of poly) {
            if (Math.hypot(pt.x - pos.x, pt.y - pos.y) <= radius) { anyNear = true; break; }
        }
        if (!anyNear) {
            for (let j = 0; j < poly.length - 1; j++) {
                if (pointLineDist(pos.x, pos.y, poly[j].x, poly[j].y, poly[j + 1].x, poly[j + 1].y) <= radius) {
                    anyNear = true; break;
                }
            }
        }
        if (!anyNear) continue;

        const trimmed = trimPolylineAgainstCircle(poly, pos.x, pos.y, radius);
        lines.splice(i, 1, ...trimmed);
        erased = true;
    }
    return erased;
}

function eraseFullAt(lines, pos, radius) {
    const touchedIndices = [];
    for (let i = 0; i < lines.length; i++) {
        const poly = lines[i];
        let touched = false;
        for (const pt of poly) {
            if (Math.hypot(pt.x - pos.x, pt.y - pos.y) <= radius) { touched = true; break; }
        }
        if (!touched) {
            for (let j = 0; j < poly.length - 1; j++) {
                if (pointLineDist(pos.x, pos.y, poly[j].x, poly[j].y, poly[j + 1].x, poly[j + 1].y) <= radius) {
                    touched = true; break;
                }
            }
        }
        if (touched) touchedIndices.push(i);
    }

    if (touchedIndices.length === 0) return false;

    // Spatial hash grid to find all connected polylines transitively
    const cellSize = 25;
    const grid = new Map();
    for (let i = 0; i < lines.length; i++) {
        const poly = lines[i];
        for (const pt of poly) {
            const key = Math.floor(pt.x / cellSize) + ',' + Math.floor(pt.y / cellSize);
            let cell = grid.get(key);
            if (!cell) { cell = []; grid.set(key, cell); }
            cell.push(i);
        }
    }

    const toDelete = new Set(touchedIndices);
    const queue = [...touchedIndices];
    const SNAP_DIST_SQ = 3.0 * 3.0; // 3px connection threshold

    while (queue.length > 0) {
        const currIdx = queue.pop();
        const poly = lines[currIdx];
        for (const pt of poly) {
            const gx = Math.floor(pt.x / cellSize);
            const gy = Math.floor(pt.y / cellSize);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const cell = grid.get((gx + dx) + ',' + (gy + dy));
                    if (!cell) continue;
                    for (const candIdx of cell) {
                        if (toDelete.has(candIdx)) continue;
                        const candPoly = lines[candIdx];
                        let isConn = false;
                        for (const cpt of candPoly) {
                            const d2 = (pt.x - cpt.x) ** 2 + (pt.y - cpt.y) ** 2;
                            if (d2 <= SNAP_DIST_SQ) { isConn = true; break; }
                        }
                        if (isConn) {
                            toDelete.add(candIdx);
                            queue.push(candIdx);
                        }
                    }
                }
            }
        }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
        if (toDelete.has(i)) {
            lines.splice(i, 1);
        }
    }
    return true;
}

function eraseAt(pos) {
    const target = document.getElementById('eraserLayerTarget')?.value || 'both';
    const activeLayer = document.getElementById('drawLayer').value;
    const radius = getEraserRadiusWorld();
    const mode = getEraserMode();

    const doPhysics = (target === 'both' || target === 'physics' || (target === 'active' && activeLayer === 'physics')) && !physicsLocked;
    const doScenery = (target === 'both' || target === 'scenery' || (target === 'active' && activeLayer === 'scenery')) && !sceneryLocked;

    const runMode = (lines) => {
        if (mode === 'original') return eraseOriginalAt(lines, pos, radius);
        if (mode === 'trim') return eraseTrimAt(lines, pos, radius);
        if (mode === 'full') return eraseFullAt(lines, pos, radius);
        return false;
    };

    let erased = false;
    if (doPhysics && runMode(physicsLines)) {
        bumpPhysics();
        erased = true;
    }
    if (doScenery && runMode(sceneryLines)) {
        originalSceneryLines = clonePolysFast(sceneryLines);
        bumpTrackVersion();
        erased = true;
    }

    if (erased) {
        updatePreviewBadge();
        draw();
    }
    return erased;
}

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const wx = camX + mx / zoom, wy = camY + my / zoom;
    const nextZ = zoom * (e.deltaY > 0 ? 0.9 : 1.1);
    zoom = Math.max(0.02, Math.min(nextZ, 10));
    camX = wx - mx / zoom; camY = wy - my / zoom;
    setZoom(zoom);
}, { passive: false });

// ==========================================
// MISC HANDLERS
// ==========================================
function updatePreviewBadge() {
    const b = document.getElementById('previewBadge');
    if (!b) return;
    b.style.display = sceneryDirty ? 'block' : 'none';
}

document.getElementById('symmetryToggle').addEventListener('change', (e) => {
    symmetryMode = e.target.checked;
    saveSettings(); draw();
    toast(symmetryMode ? 'Symmetry ON — axis at x = 0' : 'Symmetry OFF', 'info', 1800);
});
document.getElementById('snapToGridToggle').addEventListener('change', saveSettings);
document.getElementById('gridSizeSelect').addEventListener('change', saveSettings);
document.getElementById('drawLayer').addEventListener('change', () => {
    saveSettings();
    if (currentTool === 'select') clearSelection();
});

// Select tool actions
document.getElementById('selLayerSelect').addEventListener('change', (e) => {
    selLayer = e.target.value; saveSettings();
    if (selectionBoxes.add.length > 0) refreshSelection();
    draw();
});
document.getElementById('selDeleteBtn').addEventListener('click', deleteSelection);
document.getElementById('selCopyBtn').addEventListener('click', copySelection);
document.getElementById('selSaveObjBtn').addEventListener('click', saveSelectionAsObject);
document.getElementById('selectionPillClear').addEventListener('click', clearSelection);

// Pattern UI
document.getElementById('lineType').addEventListener('change', () => {
    updateToolUI();
    saveSettings();
});

['minStrokeLen', 'pointSpacing', 'patternScale', 'noiseCoverage', 'noiseSeed'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        const valEl = document.getElementById(id + 'Val');
        if (valEl) {
            valEl.textContent = (id === 'patternScale')
                ? parseFloat(document.getElementById(id).value).toFixed(2)
                : document.getElementById(id).value;
        }
        updatePatternHud();
        drawPatternPreview();
        saveSettings();
    });
});

// Object DB filters
document.getElementById('objSearch').addEventListener('input', refreshObjectList);
document.getElementById('objLayerFilter').addEventListener('change', refreshObjectList);
document.getElementById('objTagFilter').addEventListener('input', refreshObjectList);
document.getElementById('objViewToggle').addEventListener('click', () => {
    currentObjView = currentObjView === 'grid' ? 'list' : 'grid';
    saveSettings(); refreshObjectList();
});
function processImportedObjects(data) {
    const incoming = Array.isArray(data) ? data : [data];
    let added = 0;
    for (const o of incoming) {
        const no = normalizeObject(o);
        if (!no) continue;
        no.id = newId();
        no.name = getUniqueName(no.name);
        objects.push(no); added++;
    }
    if (added > 0) {
        if (saveObjects()) {
            toast('Imported ' + added + ' object(s).', 'success');
            refreshObjectList();
        } else {
            objects.splice(objects.length - added, added);
        }
    } else {
        toast('No valid objects found in file.', 'error');
    }
}

async function handleImportObjects() {
    if (window.electronAPI && window.electronAPI.importObjects) {
        try {
            const res = await window.electronAPI.importObjects();
            if (res && !res.canceled && res.content) {
                const data = JSON.parse(res.content);
                processImportedObjects(data);
            }
        } catch (err) {
            toast('Import failed: ' + err.message, 'error', 4000);
        }
    } else {
        document.getElementById('objImportInput').click();
    }
}

async function handleExportObjects() {
    if (objects.length === 0) { toast('No objects to export.', 'error'); return; }
    const jsonStr = JSON.stringify(objects, null, 2);
    if (window.electronAPI && window.electronAPI.exportObjects) {
        try {
            const res = await window.electronAPI.exportObjects(jsonStr, 'trackstudio_objects.json');
            if (res && !res.canceled) {
                toast('Exported ' + objects.length + ' object(s).', 'success', 2000);
            }
        } catch (err) {
            toast('Export failed: ' + err.message, 'error', 4000);
        }
    } else {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'trackstudio_objects.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast('Exported ' + objects.length + ' object(s).', 'success');
    }
}

document.getElementById('objImportBtn').addEventListener('click', handleImportObjects);
document.getElementById('objImportInput').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            processImportedObjects(data);
        } catch (err) { toast('Import failed: ' + err.message, 'error', 4000); }
    };
    reader.readAsText(file);
    e.target.value = '';
});
document.getElementById('objExportAllBtn').addEventListener('click', handleExportObjects);
document.getElementById('objClearAllBtn').addEventListener('click', () => {
    if (objects.length === 0) return;
    if (!confirm('Delete all ' + objects.length + ' objects?')) return;
    const backup = objects.slice();
    objects = [];
    saveObjects();
    showUndoToast('Cleared all objects', () => {
        objects = backup.concat(objects);
        saveObjects();
    }, 8000);
});

// ==========================================
// INIT
// ==========================================
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
loadObjects();
buildUI();
loadSettings();
refreshObjectList();
updatePreviewBadge();
document.getElementById('zoomVal').textContent = zoom.toFixed(2);
updateBrushSizeRow();
updateToolUI();
updateHistoryButtons();
updateSelectionUI();

(function bindHistoryButtons() {
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) u.addEventListener('click', undo);
    if (r) r.addEventListener('click', redo);

    const hudU = document.getElementById('hudUndoBtn');
    const hudR = document.getElementById('hudRedoBtn');
    if (hudU) hudU.addEventListener('click', undo);
    if (hudR) hudR.addEventListener('click', redo);
})();

window.addEventListener('beforeunload', (e) => {
    if (isDirty && physicsLines.length > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes.';
        return e.returnValue;
    }
});

// ==========================================
// DRAG AND DROP TRACK FILE
// ==========================================
(function setupDragAndDrop() {
    const overlay = document.getElementById('dropOverlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
            dragCounter++;
            if (overlay) overlay.style.display = 'flex';
        }
    });

    window.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    window.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            if (overlay) overlay.style.display = 'none';
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        if (overlay) overlay.style.display = 'none';

        const files = e.dataTransfer ? e.dataTransfer.files : null;
        if (!files || files.length === 0) return;

        const file = files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'txt' || ext === 'frhd') {
            const reader = new FileReader();
            reader.onload = (ev) => {
                loadTrackData(ev.target.result, file.name);
            };
            reader.readAsText(file);
        } else if (ext === 'json') {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    processImportedObjects(data);
                } catch (err) {
                    toast('JSON parse error: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        } else {
            toast('Please drop a .txt, .frhd, or .json file.', 'error', 3000);
        }
    });
})();

// ==========================================
// ELECTRON IPC & MENU INTEGRATION
// ==========================================
if (window.electronAPI) {
    window.electronAPI.onMenuAction((action) => {
        if (isInputFocused() && (action.startsWith('tool-') || ['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'toggle-mode', 'toggle-layer', 'toggle-minimap'].includes(action))) {
            return;
        }
        switch (action) {
            case 'new-track':
                handleNewTrack();
                break;
            case 'open-track':
                promptOpenTrack();
                break;
            case 'save-track':
                exportTrackToFile();
                break;
            case 'save-track-then-close':
                exportTrackToFile().then((saved) => {
                    if (saved) window.close();
                });
                break;
            case 'save-png':
                savePngSnapshot();
                break;
            case 'import-objects':
                handleImportObjects();
                break;
            case 'export-objects':
                handleExportObjects();
                break;
            case 'undo':
                undo();
                break;
            case 'redo':
                redo();
                break;
            case 'cut':
                if (currentTool === 'select' && selection.fragments.length > 0) {
                    copySelection();
                    deleteSelection();
                }
                break;
            case 'copy':
                if (currentTool === 'select' && selection.fragments.length > 0) copySelection();
                break;
            case 'paste':
                if (clipboardFragments) pasteSelection();
                break;
            case 'delete':
                if (currentTool === 'modify' && selectedVertex) deleteSelectedVertex();
                else if (currentTool === 'select' && selection.fragments.length > 0) deleteSelection();
                break;
            case 'save-selection-object':
                if (selection.fragments.length > 0) saveSelectionAsObject();
                break;
            case 'fit-view':
                fitToView();
                break;
            case 'reset-camera':
                resetView();
                break;
            case 'toggle-theme': {
                const tc = document.getElementById('themeToggleCheckbox');
                tc.checked = !tc.checked;
                tc.dispatchEvent(new Event('change'));
                break;
            }
            case 'toggle-grid': {
                const gc = document.getElementById('gridToggle');
                gc.checked = !gc.checked;
                gc.dispatchEvent(new Event('change'));
                break;
            }
            case 'toggle-mode':
                rotateAppMode();
                break;
            case 'toggle-layer': {
                const dl = document.getElementById('drawLayer');
                dl.value = dl.value === 'physics' ? 'scenery' : 'physics';
                dl.dispatchEvent(new Event('change'));
                break;
            }
            case 'tool-line': clickTool('line'); break;
            case 'tool-line+': clickTool('line+'); break;
            case 'tool-curve': clickTool('curve'); break;
            case 'tool-bridge': clickTool('bridge'); break;
            case 'tool-brush': clickTool('brush'); break;
            case 'tool-eraser': clickTool('eraser'); break;
            case 'tool-polygon': clickTool('polygon'); break;
            case 'tool-circle': clickTool('circle'); break;
            case 'tool-box': clickTool('box'); break;
            case 'tool-select': clickTool('select'); break;
            case 'tool-modify': clickTool('modify'); break;
            case 'tool-tube': clickTool('tube'); break;
            case 'tool-fill': clickTool('fill'); break;
            case 'tool-gradient': clickTool('gradient'); break;
            case 'tool-text': clickTool('text'); break;
            case 'tool-rockBrush': clickTool('rockBrush'); break;
            case 'toggle-zen':
                toggleZenMode();
                break;
            case 'toggle-minimap':
                toggleMinimap();
                break;
            case 'open-help': {
                const hm = document.getElementById('helpModal');
                hm.style.display = hm.style.display === 'block' ? 'none' : 'block';
                break;
            }
            case 'open-objects':
                document.getElementById('objectsBtn').click();
                break;
            case 'open-settings':
                document.getElementById('settingsBtn').click();
                break;
        }
    });

    window.electronAPI.onOpenTrackData((data) => {
        if (data && data.content) {
            loadTrackData(data.content, data.filename, data.filePath);
        }
    });
}

// ==========================================
// STATUS BAR & RADAR VIEW (MINI-MAP)
// ==========================================
function updateStatusBar() {
    const statP = document.getElementById('statPhysics');
    const statS = document.getElementById('statScenery');
    const physCount = physicsLines.length;
    const scenCount = sceneryLines.length;
    if (statP) statP.textContent = physCount;
    if (statS) statS.textContent = scenCount;

    const ss = document.getElementById('statusStats');
    if (ss) ss.textContent = `P:${physCount} | S:${scenCount}`;

    const zv = document.getElementById('statusZoomVal');
    if (zv) zv.textContent = Math.round(zoom * 100) + '%';

    const st = document.getElementById('statusTool');
    if (st) {
        if (appMode === 'auto') {
            const maskActive = document.getElementById('maskModeToggle')?.checked;
            st.textContent = maskActive ? 'MASK' : 'AUTO';
        } else {
            st.textContent = `${currentTool.toUpperCase()}`;
        }
    }

    const sl = document.getElementById('statusLayer');
    const activeLayer = document.getElementById('drawLayer')?.value || 'physics';
    if (sl) sl.textContent = activeLayer === 'physics' ? 'Physics' : 'Scenery';
}

function drawMinimap() {
    if (!isMinimapVisible) return;
    const miniCanvas = document.getElementById('minimapCanvas');
    if (!miniCanvas) return;
    const mCtx = miniCanvas.getContext('2d');
    const mW = miniCanvas.width;
    const mH = miniCanvas.height;

    const totalLines = physicsLines.length + sceneryLines.length;
    const linesEl = document.getElementById('minimapLines');
    if (linesEl) linesEl.textContent = totalLines + ' lines';

    const posEl = document.getElementById('minimapPos');
    if (posEl) posEl.textContent = `${Math.round(camX)}, ${Math.round(camY)}`;

    const isDark = document.body.classList.contains('dark-mode');
    const cacheKey = `${mW}x${mH}|${isDark ? 1 : 0}|${physicsVisible ? 1 : 0}|${sceneryVisible ? 1 : 0}|${physicsLines.length}|${sceneryLines.length}|${trackVersion}`;

    if (!minimapCacheCanvas) {
        minimapCacheCanvas = document.createElement('canvas');
    }
    if (minimapCacheCanvas.width !== mW || minimapCacheCanvas.height !== mH) {
        minimapCacheCanvas.width = mW;
        minimapCacheCanvas.height = mH;
        minimapCacheKey = '';
    }

    if (minimapCacheKey !== cacheKey) {
        minimapCacheKey = cacheKey;
        const cCtx = minimapCacheCanvas.getContext('2d');
        cCtx.clearRect(0, 0, mW, mH);
        cCtx.fillStyle = isDark ? '#1C1C1F' : '#FAF6ED';
        cCtx.fillRect(0, 0, mW, mH);

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const expand = (poly) => {
            const bb = getPolyBBox(poly);
            if (bb.minX < minX) minX = bb.minX;
            if (bb.maxX > maxX) maxX = bb.maxX;
            if (bb.minY < minY) minY = bb.minY;
            if (bb.maxY > maxY) maxY = bb.maxY;
        };
        if (physicsVisible) physicsLines.forEach(expand);
        if (sceneryVisible) sceneryLines.forEach(expand);

        if (!isFinite(minX) || totalLines === 0) {
            minimapTransform = null;
            cCtx.fillStyle = 'rgba(128, 128, 128, 0.45)';
            cCtx.font = '10px sans-serif';
            cCtx.textAlign = 'center';
            cCtx.fillText('Empty Track', mW / 2, mH / 2);
        } else {
            const pad = 80;
            minX -= pad; maxX += pad; minY -= pad; maxY += pad;
            const rangeX = Math.max(200, maxX - minX);
            const rangeY = Math.max(150, maxY - minY);
            const scale = Math.min((mW - 12) / rangeX, (mH - 12) / rangeY);
            const midX = (minX + maxX) / 2;
            const midY = (minY + maxY) / 2;

            const toMiniX = (x) => (x - midX) * scale + mW / 2;
            const toMiniY = (y) => (y - midY) * scale + mH / 2;

            if (sceneryVisible) {
                cCtx.strokeStyle = isDark ? '#7E8290' : '#AAAAAA';
                cCtx.lineWidth = 1;
                cCtx.lineCap = 'round';
                cCtx.lineJoin = 'round';
                cCtx.beginPath();
                for (const poly of sceneryLines) {
                    if (poly.length < 2) continue;
                    cCtx.moveTo(toMiniX(poly[0].x), toMiniY(poly[0].y));
                    for (let i = 1; i < poly.length; i++) cCtx.lineTo(toMiniX(poly[i].x), toMiniY(poly[i].y));
                }
                cCtx.stroke();
            }

            if (physicsVisible) {
                cCtx.strokeStyle = isDark ? '#F0E3CE' : '#000000';
                cCtx.lineWidth = 1.2;
                cCtx.lineCap = 'round';
                cCtx.lineJoin = 'round';
                cCtx.beginPath();
                for (const poly of physicsLines) {
                    if (poly.length < 2) continue;
                    cCtx.moveTo(toMiniX(poly[0].x), toMiniY(poly[0].y));
                    for (let i = 1; i < poly.length; i++) cCtx.lineTo(toMiniX(poly[i].x), toMiniY(poly[i].y));
                }
                cCtx.stroke();
            }

            minimapTransform = { scale, midX, midY, minX, maxX, minY, maxY };
        }
    }

    mCtx.clearRect(0, 0, mW, mH);
    mCtx.drawImage(minimapCacheCanvas, 0, 0);

    if (!minimapTransform) return;
    const { scale, midX, midY } = minimapTransform;
    const viewWorldW = viewW / zoom;
    const viewWorldH = viewH / zoom;
    const vx0 = (camX - viewWorldW / 2 - midX) * scale + mW / 2;
    const vy0 = (camY - viewWorldH / 2 - midY) * scale + mH / 2;
    const vx1 = (camX + viewWorldW / 2 - midX) * scale + mW / 2;
    const vy1 = (camY + viewWorldH / 2 - midY) * scale + mH / 2;

    mCtx.strokeStyle = '#E85D35';
    mCtx.lineWidth = 1.5;
    mCtx.fillStyle = 'rgba(232, 93, 53, 0.15)';
    const rw = Math.max(4, vx1 - vx0);
    const rh = Math.max(4, vy1 - vy0);
    mCtx.fillRect(vx0, vy0, rw, rh);
    mCtx.strokeRect(vx0, vy0, rw, rh);
}

function setupMinimapInteraction() {
    const miniCanvas = document.getElementById('minimapCanvas');
    if (!miniCanvas) return;

    function handleMinimapNav(e) {
        if (!minimapTransform) return;
        const rect = miniCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const mW = miniCanvas.width;
        const mH = miniCanvas.height;
        const worldX = (mx - mW / 2) / minimapTransform.scale + minimapTransform.midX;
        const worldY = (my - mH / 2) / minimapTransform.scale + minimapTransform.midY;
        camX = Math.round(worldX);
        camY = Math.round(worldY);
        draw();
    }

    miniCanvas.addEventListener('mousedown', (e) => {
        isMinimapDragging = true;
        handleMinimapNav(e);
    });

    window.addEventListener('mousemove', (e) => {
        if (isMinimapDragging) handleMinimapNav(e);
    });

    window.addEventListener('mouseup', () => {
        isMinimapDragging = false;
    });
}

function toggleMinimap(forceState) {
    if (typeof forceState === 'boolean') {
        isMinimapVisible = forceState;
    } else {
        isMinimapVisible = !isMinimapVisible;
    }
    const container = document.getElementById('minimapContainer');
    if (container) container.style.display = isMinimapVisible ? 'block' : 'none';
    const statusBtn = document.getElementById('statusMinimapBtn');
    if (statusBtn) statusBtn.classList.toggle('active', isMinimapVisible);
    const chk = document.getElementById('minimapToggleCheckbox');
    if (chk) chk.checked = isMinimapVisible;
    if (isMinimapVisible) drawMinimap();
    saveSettings();
}

function toggleZenMode(forceState) {
    if (typeof forceState === 'boolean') {
        isZenMode = forceState;
    } else {
        isZenMode = !isZenMode;
    }
    document.body.classList.toggle('zen-mode', isZenMode);

    // Keep top toolbar open and toggle Zen button active state
    const hudZen = document.getElementById('hudZenBtn');
    if (hudZen) hudZen.classList.toggle('active', isZenMode);
    const statusZen = document.getElementById('statusZenBtn');
    if (statusZen) statusZen.classList.toggle('active', isZenMode);
    const topZen = document.getElementById('zenBtn');
    if (topZen) topZen.classList.toggle('active', isZenMode);

    const isHudDisabled = document.getElementById('disableQuickAccessCheckbox')?.checked;
    const hud = document.getElementById('canvasHud');
    if (hud && !isHudDisabled) {
        hud.style.display = 'flex';
    }

    resizeCanvas();
    setTimeout(resizeCanvas, 260);
    draw();
}

// ==========================================
// LAYER MANAGER & HUD
// ==========================================
function setupLayerManager() {
    const visP = document.getElementById('layerVisPhysics');
    const lockP = document.getElementById('layerLockPhysics');
    const visS = document.getElementById('layerVisScenery');
    const lockS = document.getElementById('layerLockScenery');
    const opacS = document.getElementById('sceneryOpacity');
    const opacVal = document.getElementById('sceneryOpacityVal');
    const drawSel = document.getElementById('drawLayerSelect');
    const mainDrawSel = document.getElementById('drawLayer');

    if (visP) {
        visP.addEventListener('click', () => {
            physicsVisible = !physicsVisible;
            visP.classList.toggle('active', physicsVisible);
            setLayerIcon(visP, physicsVisible ? 'eye-open' : 'eye-closed');
            draw();
            saveSettings();
        });
    }

    if (lockP) {
        lockP.addEventListener('click', () => {
            physicsLocked = !physicsLocked;
            lockP.classList.toggle('locked', physicsLocked);
            setLayerIcon(lockP, physicsLocked ? 'lock' : 'unlock');
            saveSettings();
        });
    }

    if (visS) {
        visS.addEventListener('click', () => {
            sceneryVisible = !sceneryVisible;
            visS.classList.toggle('active', sceneryVisible);
            setLayerIcon(visS, sceneryVisible ? 'eye-open' : 'eye-closed');
            draw();
            saveSettings();
        });
    }

    if (lockS) {
        lockS.addEventListener('click', () => {
            sceneryLocked = !sceneryLocked;
            lockS.classList.toggle('locked', sceneryLocked);
            setLayerIcon(lockS, sceneryLocked ? 'lock' : 'unlock');
            saveSettings();
        });
    }

    if (opacS) {
        opacS.addEventListener('input', () => {
            sceneryOpacity = parseInt(opacS.value) / 100;
            if (opacVal) opacVal.textContent = opacS.value;
            draw();
        });
        opacS.addEventListener('change', saveSettings);
    }

    if (drawSel && mainDrawSel) {
        drawSel.addEventListener('change', () => {
            mainDrawSel.value = drawSel.value;
            mainDrawSel.dispatchEvent(new Event('change'));
        });
        mainDrawSel.addEventListener('change', () => {
            drawSel.value = mainDrawSel.value;
            updateHudLayer();
            updateStatusBar();
        });
    }

    const hudLayerBtn = document.getElementById('hudLayerBtn');
    if (hudLayerBtn && mainDrawSel) {
        hudLayerBtn.addEventListener('click', () => {
            mainDrawSel.value = mainDrawSel.value === 'physics' ? 'scenery' : 'physics';
            mainDrawSel.dispatchEvent(new Event('change'));
        });
    }
}

function updateHudLayer() {
    const val = document.getElementById('drawLayer')?.value || 'physics';
    const dot = document.getElementById('hudLayerDot');
    const txt = document.getElementById('hudLayerText');
    if (dot) dot.className = `hud-dot ${val}`;
    if (txt) txt.textContent = val === 'physics' ? 'Physics' : 'Scenery';
}

function setupFloatingHud() {
    document.querySelectorAll('.hud-btn[data-hud-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.getAttribute('data-hud-tool');
            clickTool(tool);
        });
    });

    const hudModeBtn = document.getElementById('hudModeBtn');
    if (hudModeBtn) hudModeBtn.addEventListener('click', rotateAppMode);

    document.querySelectorAll('.hud-action-btn[data-hud-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-hud-action');
            executeHudAction(action);
        });
    });

    ['toggleHudCave', 'toggleHudCircle', 'toggleHudEdgeShadow', 'toggleHudSmooth', 'toggleHudFillGaps', 'toggleHudReduce', 'toggleHudRollers'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                updateHudActionVisibility();
                saveSettings();
            });
        }
    });

    const zenBtn = document.getElementById('hudZenBtn');
    if (zenBtn) zenBtn.addEventListener('click', () => toggleZenMode());

    const topZenBtn = document.getElementById('zenBtn');
    if (topZenBtn) topZenBtn.addEventListener('click', () => toggleZenMode());

    const statusZenBtn = document.getElementById('statusZenBtn');
    if (statusZenBtn) statusZenBtn.addEventListener('click', () => toggleZenMode());

    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', () => toggleSidebarCollapse());

    const statusSidebarBtn = document.getElementById('statusSidebarBtn');
    if (statusSidebarBtn) statusSidebarBtn.addEventListener('click', () => toggleSidebarCollapse());

    const qkChk = document.getElementById('disableQuickAccessCheckbox');
    if (qkChk) {
        qkChk.addEventListener('change', (e) => {
            const hud = document.getElementById('canvasHud');
            if (hud) hud.style.display = e.target.checked ? 'none' : 'flex';
            saveSettings();
        });
    }

    const statusMiniBtn = document.getElementById('statusMinimapBtn');
    if (statusMiniBtn) statusMiniBtn.addEventListener('click', () => toggleMinimap());

    const miniToggleBtn = document.getElementById('minimapToggleBtn');
    if (miniToggleBtn) miniToggleBtn.addEventListener('click', () => toggleMinimap());

    const miniFitBtn = document.getElementById('minimapFitBtn');
    if (miniFitBtn) miniFitBtn.addEventListener('click', fitToView);

    const miniChk = document.getElementById('minimapToggleCheckbox');
    if (miniChk) miniChk.addEventListener('change', (e) => toggleMinimap(e.target.checked));

    const zIn = document.getElementById('statusZoomIn');
    if (zIn) zIn.addEventListener('click', () => setZoom(zoom * 1.25));
    const zOut = document.getElementById('statusZoomOut');
    if (zOut) zOut.addEventListener('click', () => setZoom(zoom / 1.25));
    const zVal = document.getElementById('statusZoomVal');
    if (zVal) zVal.addEventListener('click', () => setZoom(1.0));

    const statusPerspBtn = document.getElementById('statusPerspBtn');
    if (statusPerspBtn) statusPerspBtn.addEventListener('click', () => handleContextMenuAction('persp-cycle'));

    const statusAngleBtn = document.getElementById('statusAngleBtn');
    if (statusAngleBtn) {
        statusAngleBtn.addEventListener('click', () => {
            const cycle = [0, 15, 45];
            angleLockStep = cycle[(cycle.indexOf(angleLockStep) + 1) % cycle.length];
            updateAngleLockUI();
            saveSettings();
            toast('Angle Lock: ' + (angleLockStep ? angleLockStep + '°' : 'OFF'), 'info', 1200);
        });
    }

    const optRun = document.getElementById('runOptimizerBtn');
    if (optRun) optRun.addEventListener('click', runTrackOptimizer);
    const optApply = document.getElementById('applyOptimizerBtn');
    if (optApply) optApply.addEventListener('click', applyTrackOptimizer);

    const optTol = document.getElementById('optTolerance');
    if (optTol) optTol.addEventListener('input', (e) => {
        const el = document.getElementById('optToleranceVal');
        if (el) el.textContent = e.target.value;
    });

    const optGap = document.getElementById('optGapDistance');
    if (optGap) optGap.addEventListener('input', (e) => {
        const el = document.getElementById('optGapDistanceVal');
        if (el) el.textContent = e.target.value;
    });

    const autoSaveSel = document.getElementById('autoSaveIntervalSelect');
    if (autoSaveSel) {
        autoSaveSel.addEventListener('change', (e) => {
            autoSaveMinutes = parseInt(e.target.value) || 0;
            initAutoSave();
            saveSettings();
        });
    }

    const curveSeg = document.getElementById('curveSegments');
    if (curveSeg) {
        curveSeg.addEventListener('input', (e) => {
            const v = document.getElementById('curveSegmentsVal');
            if (v) v.textContent = e.target.value;
        });
    }

    const erRadius = document.getElementById('eraserRadius');
    if (erRadius) {
        erRadius.addEventListener('input', (e) => {
            const v = document.getElementById('eraserRadiusVal');
            if (v) v.textContent = e.target.value;
            updateEraserCursor();
            saveSettings();
            draw();
        });
    }

    const erMode = document.getElementById('eraserMode');
    if (erMode) {
        erMode.addEventListener('change', () => {
            saveSettings();
        });
    }
    const erLayer = document.getElementById('eraserLayerTarget');
    if (erLayer) {
        erLayer.addEventListener('change', () => {
            updateToolOptionsBar();
            saveSettings();
        });
    }

    const bTen = document.getElementById('bridgeTension');
    if (bTen) {
        bTen.addEventListener('input', (e) => {
            const v = document.getElementById('bridgeTensionVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
            draw();
        });
    }

    const bSteps = document.getElementById('bridgeSteps');
    if (bSteps) {
        bSteps.addEventListener('input', (e) => {
            const v = document.getElementById('bridgeStepsVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
            draw();
        });
    }

    const tWidth = document.getElementById('tubeWidth');
    if (tWidth) {
        tWidth.addEventListener('input', (e) => {
            const v = document.getElementById('tubeWidthVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
            draw();
        });
    }

    const tJitTog = document.getElementById('tubeJitterToggle');
    if (tJitTog) {
        tJitTog.addEventListener('change', (e) => {
            const row = document.getElementById('tubeJitterRow');
            if (row) row.style.display = e.target.checked ? 'block' : 'none';
            saveSettings();
            draw();
        });
    }

    const tJit = document.getElementById('tubeJitter');
    if (tJit) {
        tJit.addEventListener('input', (e) => {
            const v = document.getElementById('tubeJitterVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
            draw();
        });
    }

    const fillModeEl = document.getElementById('fillMode');
    if (fillModeEl) {
        fillModeEl.addEventListener('change', () => {
            const m = fillModeEl.value;
            const dens = document.getElementById('fillDensity');
            const densVal = document.getElementById('fillDensityVal');
            const rot = document.getElementById('fillRotation');
            const rotVal = document.getElementById('fillRotationVal');
            if (dens && densVal) {
                if (m === 'full') { dens.value = 3; densVal.textContent = '3'; }
                else if (m === 'grid') { dens.value = 20; densVal.textContent = '20'; }
                else if (m === 'lines') { dens.value = 15; densVal.textContent = '15'; }
            }
            if (rot && rotVal && m === 'lines' && rot.value === '0') {
                rot.value = 45; rotVal.textContent = '45';
            }
            updateFillSettingsVisibility();
            saveSettings();
        });
    }

    const fillDensityEl = document.getElementById('fillDensity');
    if (fillDensityEl) {
        fillDensityEl.addEventListener('input', (e) => {
            const v = document.getElementById('fillDensityVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
        });
    }

    const fillRotEl = document.getElementById('fillRotation');
    if (fillRotEl) {
        fillRotEl.addEventListener('input', (e) => {
            const v = document.getElementById('fillRotationVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
        });
    }

    const fillSlantEl = document.getElementById('fillSlant');
    if (fillSlantEl) {
        fillSlantEl.addEventListener('input', (e) => {
            const v = document.getElementById('fillSlantVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
        });
    }

    const optSmoothTog = document.getElementById('optSmoothToggle');
    if (optSmoothTog) {
        optSmoothTog.addEventListener('change', () => {
            saveSettings();
        });
    }

    const optSmoothP = document.getElementById('optSmoothPasses');
    if (optSmoothP) {
        optSmoothP.addEventListener('input', (e) => {
            const v = document.getElementById('optSmoothPassesVal');
            if (v) v.textContent = e.target.value;
            saveSettings();
        });
    }

    const saveConfirm = document.getElementById('saveObjectConfirmBtn');
    if (saveConfirm) saveConfirm.addEventListener('click', confirmSaveObject);
    const saveCancel = document.getElementById('saveObjectCancelBtn');
    if (saveCancel) saveCancel.addEventListener('click', () => {
        const modal = document.getElementById('saveObjectModal');
        if (modal) modal.style.display = 'none';
    });
    const saveClose = document.getElementById('saveObjectClose');
    if (saveClose) saveClose.addEventListener('click', () => {
        const modal = document.getElementById('saveObjectModal');
        if (modal) modal.style.display = 'none';
    });
    const nameInp = document.getElementById('saveObjectNameInput');
    if (nameInp) nameInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmSaveObject(); }
    });
    const tagInp = document.getElementById('saveObjectTagsInput');
    if (tagInp) tagInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmSaveObject(); }
    });

    // Selection Transform & Layer Swap bindings
    const selRotR = document.getElementById('selRotateRange');
    if (selRotR) selRotR.addEventListener('input', (e) => {
        const v = document.getElementById('selRotateVal');
        if (v) v.textContent = e.target.value;
    });
    const selRotM90 = document.getElementById('selRotM90Btn');
    if (selRotM90) selRotM90.addEventListener('click', () => rotateSelection(-90));
    const selRotP90 = document.getElementById('selRotP90Btn');
    if (selRotP90) selRotP90.addEventListener('click', () => rotateSelection(90));
    const selRotApp = document.getElementById('selRotApplyBtn');
    if (selRotApp) selRotApp.addEventListener('click', () => {
        const deg = parseFloat(document.getElementById('selRotateRange')?.value) || 0;
        if (deg !== 0) rotateSelection(deg);
    });

    const selScR = document.getElementById('selScaleRange');
    if (selScR) selScR.addEventListener('input', (e) => {
        const v = document.getElementById('selScaleVal');
        if (v) v.textContent = parseFloat(e.target.value).toFixed(2);
    });
    const selScApp = document.getElementById('selScaleApplyBtn');
    if (selScApp) selScApp.addEventListener('click', () => {
        const fac = parseFloat(document.getElementById('selScaleRange')?.value) || 1.0;
        if (Math.abs(fac - 1.0) > 0.001) scaleSelection(fac);
    });
    const selFlipX = document.getElementById('selFlipXBtn');
    if (selFlipX) selFlipX.addEventListener('click', () => flipSelection('x'));
    const selFlipY = document.getElementById('selFlipYBtn');
    if (selFlipY) selFlipY.addEventListener('click', () => flipSelection('y'));
    const selToPhys = document.getElementById('selToPhysicsBtn');
    if (selToPhys) selToPhys.addEventListener('click', () => convertSelectionLayer('physics'));
    const selToScen = document.getElementById('selToSceneryBtn');
    if (selToScen) selToScen.addEventListener('click', () => convertSelectionLayer('scenery'));
    const selSkewR = document.getElementById('selPerspSkewRange');
    if (selSkewR) selSkewR.addEventListener('input', (e) => {
        const v = document.getElementById('selPerspSkewVal');
        if (v) v.textContent = e.target.value;
    });
    const selSkewBtn = document.getElementById('selPerspSkewBtn');
    if (selSkewBtn) selSkewBtn.addEventListener('click', () => {
        const pct = parseFloat(document.getElementById('selPerspSkewRange')?.value) || 0;
        if (pct !== 0) skewSelection(pct);
    });
    const selProj1 = document.getElementById('selProjVp1Btn');
    if (selProj1) selProj1.addEventListener('click', () => projectSelectionToVP('vp1'));
    const selProj2 = document.getElementById('selProjVp2Btn');
    if (selProj2) selProj2.addEventListener('click', () => projectSelectionToVP('vp2'));

    const selExtD = document.getElementById('selExtrudeDepth');
    if (selExtD) selExtD.addEventListener('input', (e) => {
        const v = document.getElementById('selExtrudeDepthVal');
        if (v) v.textContent = e.target.value;
    });
    const getExtDepth = () => parseFloat(document.getElementById('selExtrudeDepth')?.value) || 60;
    const selExt1 = document.getElementById('selExtrudeVp1Btn');
    if (selExt1) selExt1.addEventListener('click', () => extrudeSelection('vp1', getExtDepth()));
    const selExt2 = document.getElementById('selExtrudeVp2Btn');
    if (selExt2) selExt2.addEventListener('click', () => extrudeSelection('vp2', getExtDepth()));
    const selExt3 = document.getElementById('selExtrudeVp3Btn');
    if (selExt3) selExt3.addEventListener('click', () => extrudeSelection('vp3', getExtDepth()));

    const selArrC = document.getElementById('selArrayCount');
    if (selArrC) selArrC.addEventListener('input', (e) => {
        const v = document.getElementById('selArrayCountVal');
        if (v) v.textContent = e.target.value;
    });
    const selArrS = document.getElementById('selArrayStep');
    if (selArrS) selArrS.addEventListener('input', (e) => {
        const v = document.getElementById('selArrayStepVal');
        if (v) v.textContent = e.target.value;
    });
    const getArrParams = () => ({
        count: parseInt(document.getElementById('selArrayCount')?.value) || 4,
        step: parseFloat(document.getElementById('selArrayStep')?.value) || 40
    });
    const selArr1 = document.getElementById('selArrayVp1Btn');
    if (selArr1) selArr1.addEventListener('click', () => { const a = getArrParams(); arraySelectionTowardVP('vp1', a.count, a.step); });
    const selArr2 = document.getElementById('selArrayVp2Btn');
    if (selArr2) selArr2.addEventListener('click', () => { const a = getArrParams(); arraySelectionTowardVP('vp2', a.count, a.step); });

    // Reference Image Overlay bindings
    const refInput = document.getElementById('refImgInput');
    const refDragBtn = document.getElementById('refImgDragBtn');
    const refCenterBtn = document.getElementById('refImgCenterBtn');
    const refClearBtn = document.getElementById('refImgClearBtn');
    const refVisBtn = document.getElementById('refImgVisBtn');
    const refLockBtn = document.getElementById('refImgLockBtn');
    const refOpac = document.getElementById('refImgOpacity');
    const refScale = document.getElementById('refImgScale');

    function syncRefImgButtons() {
        const loaded = !!refImage.img;
        if (refDragBtn) refDragBtn.disabled = !loaded || refImage.locked;
        if (refCenterBtn) refCenterBtn.disabled = !loaded;
        if (refClearBtn) refClearBtn.disabled = !loaded;
    }

    if (refInput) {
        refInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    refImage.img = img;
                    refImage.name = file.name;
                    refImage.width = img.naturalWidth || img.width;
                    refImage.height = img.naturalHeight || img.height;
                    refImage.x = camX;
                    refImage.y = camY;
                    refImage.visible = true;
                    if (refVisBtn) { refVisBtn.classList.add('active'); setLayerIcon(refVisBtn, 'eye-open'); }
                    syncRefImgButtons();
                    draw();
                    toast(`Loaded reference image (${refImage.width}×${refImage.height})`, 'success', 2000);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    if (refVisBtn) {
        refVisBtn.addEventListener('click', () => {
            refImage.visible = !refImage.visible;
            refVisBtn.classList.toggle('active', refImage.visible);
            setLayerIcon(refVisBtn, refImage.visible ? 'eye-open' : 'eye-closed');
            saveSettings();
            draw();
        });
    }
    if (refLockBtn) {
        refLockBtn.addEventListener('click', () => {
            refImage.locked = !refImage.locked;
            refLockBtn.classList.toggle('locked', refImage.locked);
            setLayerIcon(refLockBtn, refImage.locked ? 'lock' : 'unlock');
            if (refImage.locked && isRefImgDragMode) setRefImgDragMode(false);
            syncRefImgButtons();
        });
    }
    if (refDragBtn) {
        refDragBtn.addEventListener('click', () => {
            setRefImgDragMode(!isRefImgDragMode);
        });
    }
    if (refCenterBtn) {
        refCenterBtn.addEventListener('click', () => {
            if (!refImage.img) return;
            refImage.x = camX;
            refImage.y = camY;
            draw();
        });
    }
    if (refClearBtn) {
        refClearBtn.addEventListener('click', () => {
            refImage.img = null;
            refImage.name = '';
            if (refInput) refInput.value = '';
            setRefImgDragMode(false);
            syncRefImgButtons();
            draw();
        });
    }
    if (refOpac) {
        refOpac.addEventListener('input', (e) => {
            refImage.opacity = parseInt(e.target.value) / 100;
            const v = document.getElementById('refImgOpacityVal');
            if (v) v.textContent = e.target.value;
            draw();
        });
        refOpac.addEventListener('change', saveSettings);
    }
    if (refScale) {
        refScale.addEventListener('input', (e) => {
            refImage.scale = parseFloat(e.target.value) || 1.0;
            const v = document.getElementById('refImgScaleVal');
            if (v) v.textContent = refImage.scale.toFixed(2);
            draw();
        });
        refScale.addEventListener('change', saveSettings);
    }
    syncRefImgButtons();

    // Perspective Grid bindings
    setupPerspectiveGrid();

    // Gradient sidebar controls
    const bindSimpleChange = (id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
            updateGradientSettingsVisibility();
            if (currentTool === 'gradient') updateToolOptionsBar();
            saveSettings();
        });
    };
    ['gradType', 'gradStyle', 'gradFalloff', 'gradClipMode', 'gradPerspAxis', 'gradInvertToggle', 'boxFacesMode', 'fillPerspAxis'].forEach(bindSimpleChange);

    const bindGradSlider = (id, valId) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                const v = document.getElementById(valId);
                if (v) v.textContent = e.target.value;
                if (currentTool === 'gradient') updateToolOptionsBar();
            });
            el.addEventListener('change', saveSettings);
        }
    };
    bindGradSlider('gradStartSpacing', 'gradStartSpacingVal');
    bindGradSlider('gradEndSpacing', 'gradEndSpacingVal');
    bindGradSlider('gradSpanWidth', 'gradSpanWidthVal');

    // Text tool sidebar controls
    const txtInp = document.getElementById('textToolValue');
    if (txtInp) {
        txtInp.addEventListener('input', () => {
            if (currentTool === 'text') updateToolOptionsBar();
            draw();
        });
        txtInp.addEventListener('change', saveSettings);
    }
    const txtSize = document.getElementById('textToolSize');
    if (txtSize) {
        txtSize.addEventListener('input', (e) => {
            const v = document.getElementById('textToolSizeVal');
            if (v) v.textContent = e.target.value;
            if (currentTool === 'text') updateToolOptionsBar();
            draw();
        });
        txtSize.addEventListener('change', saveSettings);
    }
    const txtSp = document.getElementById('textToolSpacing');
    if (txtSp) {
        txtSp.addEventListener('input', (e) => {
            const v = document.getElementById('textToolSpacingVal');
            if (v) v.textContent = parseFloat(e.target.value).toFixed(2);
            draw();
        });
        txtSp.addEventListener('change', saveSettings);
    }
    const txtSty = document.getElementById('textToolStyle');
    if (txtSty) {
        txtSty.addEventListener('change', () => {
            if (currentTool === 'text') updateToolOptionsBar();
            saveSettings();
            draw();
        });
    }
}

// ==========================================
// TRACK OPTIMIZER
// ==========================================
let pendingOptimizedTrack = null;

function getSqDist(p1, p2) {
    const dx = p1.x - p2.x, dy = p1.y - p2.y;
    return dx * dx + dy * dy;
}

function weldGapsInPolylines(polylines, threshold) {
    const sqThresh = threshold * threshold;
    let weldedCount = 0;
    const endpoints = [];
    polylines.forEach((poly, polyIdx) => {
        if (poly.length < 2) return;
        endpoints.push({ pt: poly[0], polyIdx, isStart: true });
        endpoints.push({ pt: poly[poly.length - 1], polyIdx, isStart: false });
    });

    for (let i = 0; i < endpoints.length; i++) {
        for (let j = i + 1; j < endpoints.length; j++) {
            const ep1 = endpoints[i];
            const ep2 = endpoints[j];
            if (ep1.polyIdx === ep2.polyIdx) continue;
            const d = getSqDist(ep1.pt, ep2.pt);
            if (d > 0 && d <= sqThresh) {
                const avgX = Math.round((ep1.pt.x + ep2.pt.x) / 2);
                const avgY = Math.round((ep1.pt.y + ep2.pt.y) / 2);
                ep1.pt.x = avgX; ep1.pt.y = avgY;
                ep2.pt.x = avgX; ep2.pt.y = avgY;
                weldedCount++;
            }
        }
    }
    return weldedCount;
}

function cleanPolylines(polylines) {
    const seen = new Set();
    const result = [];
    let purgedCount = 0;
    for (const poly of polylines) {
        if (poly.length < 2) { purgedCount++; continue; }
        const clean = [poly[0]];
        for (let i = 1; i < poly.length; i++) {
            const prev = clean[clean.length - 1];
            const cur = poly[i];
            if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= 1) {
                clean.push(cur);
            } else {
                purgedCount++;
            }
        }
        if (clean.length < 2) { purgedCount++; continue; }
        const key = clean.map(p => `${p.x},${p.y}`).join(';');
        const revKey = clean.slice().reverse().map(p => `${p.x},${p.y}`).join(';');
        if (seen.has(key) || seen.has(revKey)) {
            purgedCount++;
            continue;
        }
        seen.add(key);
        result.push(clean);
    }
    return { polylines: result, purgedCount };
}

function chaikinSmoothPolyline(points, passes) {
    if (!points || points.length < 3) return points;
    let pts = points;
    const numPasses = Math.max(1, Math.min(4, passes || 2));
    for (let p = 0; p < numPasses; p++) {
        const out = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i];
            const p1 = pts[i + 1];
            const qa = {
                x: Math.round(0.75 * p0.x + 0.25 * p1.x),
                y: Math.round(0.75 * p0.y + 0.25 * p1.y)
            };
            const qb = {
                x: Math.round(0.25 * p0.x + 0.75 * p1.x),
                y: Math.round(0.25 * p0.y + 0.75 * p1.y)
            };
            out.push(qa, qb);
        }
        out.push(pts[pts.length - 1]);
        pts = out;
    }
    return pts;
}

function countPolylineSegments(polys) {
    return polys.reduce((acc, p) => acc + Math.max(0, p.length - 1), 0);
}

function runTrackOptimizer() {
    const doSimplify = document.getElementById('optSimplifyToggle').checked;
    const tolerance = parseFloat(document.getElementById('optTolerance').value) || 1.5;
    const doWeld = document.getElementById('optGapWeldToggle').checked;
    const weldDist = parseFloat(document.getElementById('optGapDistance').value) || 2.5;
    const doPurge = document.getElementById('optPurgeMicroToggle').checked;
    const doSmooth = document.getElementById('optSmoothToggle')?.checked;
    const smoothPasses = parseInt(document.getElementById('optSmoothPasses')?.value) || 2;
    const targetLayer = document.getElementById('optTargetLayer').value;

    const optPhysics = targetLayer === 'both' || targetLayer === 'physics';
    const optScenery = targetLayer === 'both' || targetLayer === 'scenery';

    let newPhys = JSON.parse(JSON.stringify(physicsLines));
    let newScen = JSON.parse(JSON.stringify(sceneryLines));

    const origPhysSegs = countPolylineSegments(physicsLines);
    const origScenSegs = countPolylineSegments(sceneryLines);
    const origPhysStrokes = physicsLines.length;
    const origScenStrokes = sceneryLines.length;
    let gapsWelded = 0;
    let purgedCount = 0;
    let smoothedCount = 0;

    if (doPurge) {
        if (optPhysics) {
            const res = cleanPolylines(newPhys);
            newPhys = res.polylines;
            purgedCount += res.purgedCount;
        }
        if (optScenery) {
            const res = cleanPolylines(newScen);
            newScen = res.polylines;
            purgedCount += res.purgedCount;
        }
    }

    if (doWeld) {
        if (optPhysics) gapsWelded += weldGapsInPolylines(newPhys, weldDist);
        if (optScenery) gapsWelded += weldGapsInPolylines(newScen, weldDist);
    }

    if (doSimplify) {
        if (optPhysics) {
            newPhys = newPhys.map(poly => simplifyRDP(poly, tolerance));
        }
        if (optScenery) {
            newScen = newScen.map(poly => simplifyRDP(poly, tolerance));
        }
    }

    if (doSmooth) {
        if (optPhysics) {
            newPhys = newPhys.map(poly => {
                if (poly.length >= 3) {
                    smoothedCount++;
                    return chaikinSmoothPolyline(poly, smoothPasses);
                }
                return poly;
            });
        }
        if (optScenery) {
            newScen = newScen.map(poly => {
                if (poly.length >= 3) {
                    smoothedCount++;
                    return chaikinSmoothPolyline(poly, smoothPasses);
                }
                return poly;
            });
        }
    }

    pendingOptimizedTrack = {
        physics: newPhys,
        scenery: newScen,
        sceneryOriginal: JSON.parse(JSON.stringify(newScen))
    };

    const newPhysSegs = countPolylineSegments(newPhys);
    const newScenSegs = countPolylineSegments(newScen);
    const newPhysStrokes = newPhys.length;
    const newScenStrokes = newScen.length;
    const physSegDiff = origPhysSegs - newPhysSegs;
    const scenSegDiff = origScenSegs - newScenSegs;

    const resBox = document.getElementById('optimizerResultBox');
    const resContent = document.getElementById('optimizerResultContent');
    if (resBox && resContent) {
        resBox.style.display = 'block';
        resContent.innerHTML = `
            <div style="font-weight:700; margin-bottom:6px; color:var(--accent-orange);">Analysis Complete:</div>
            <div>• Physics Segments: <b>${origPhysSegs}</b> → <b>${newPhysSegs}</b> ${physSegDiff > 0 ? `(-${physSegDiff})` : ''}</div>
            <div>• Scenery Segments: <b>${origScenSegs}</b> → <b>${newScenSegs}</b> ${scenSegDiff > 0 ? `(-${scenSegDiff})` : ''}</div>
            <div>• Total Strokes: <b>${origPhysStrokes + origScenStrokes}</b> → <b>${newPhysStrokes + newScenStrokes}</b></div>
            <div>• Gaps Snag-Welded: <b>${gapsWelded}</b></div>
            <div>• Micro-lines/Dupes Purged: <b>${purgedCount}</b></div>
            ${doSmooth ? `<div>• Tracks Smoothed (Chaikin): <b>${smoothedCount}</b> (${smoothPasses} pass${smoothPasses > 1 ? 'es' : ''})</div>` : ''}
        `;
    }
    toast('Optimization preview ready.', 'info', 2000);
}

function applyTrackOptimizer() {
    if (!pendingOptimizedTrack) return;
    const targetLayer = document.getElementById('optTargetLayer')?.value || 'both';
    if (targetLayer === 'physics' && isLayerLocked('physics')) return;
    if (targetLayer === 'scenery' && isLayerLocked('scenery')) return;
    if (targetLayer === 'both' && (physicsLocked || sceneryLocked)) {
        if (physicsLocked && sceneryLocked) { isLayerLocked('both'); return; }
        toast('Skipped locked layer in optimizer apply.', 'info', 1800);
    }
    snapshot();
    if (!physicsLocked && (targetLayer === 'both' || targetLayer === 'physics')) {
        physicsLines = pendingOptimizedTrack.physics;
        bumpPhysics();
    }
    if (!sceneryLocked && (targetLayer === 'both' || targetLayer === 'scenery')) {
        sceneryLines = pendingOptimizedTrack.scenery;
        originalSceneryLines = pendingOptimizedTrack.sceneryOriginal;
        sceneryDirty = false;
        bumpTrackVersion();
    }
    clearSelection();
    updatePreviewBadge();
    draw();
    toast('Optimization applied successfully! ✓', 'success', 3000);
    const resBox = document.getElementById('optimizerResultBox');
    if (resBox) resBox.style.display = 'none';
    pendingOptimizedTrack = null;
}

// ==========================================
// AUTO-SAVE & RECOVERY
// ==========================================
function initAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    if (autoSaveMinutes <= 0) {
        const as = document.getElementById('statusAutosave');
        if (as) as.textContent = 'Auto-save: Off';
        return;
    }

    const intervalMs = autoSaveMinutes * 60 * 1000;
    autoSaveTimer = setInterval(() => {
        if (isDirty && (physicsLines.length > 0 || sceneryLines.length > 0)) {
            performAutoSave();
        }
    }, intervalMs);

    const as = document.getElementById('statusAutosave');
    if (as) as.textContent = `Auto-save: ${autoSaveMinutes}m`;
}

function performAutoSave() {
    try {
        const outStr = getTrackExportString();
        const payload = {
            track: outStr,
            filename: currentLoadedFileName || 'track.txt',
            timestamp: Date.now()
        };
        localStorage.setItem('trackstudio_autosave', JSON.stringify(payload));
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const as = document.getElementById('statusAutosave');
        if (as) as.textContent = `Auto-saved at ${timeStr}`;
    } catch (e) {
        console.warn('Auto-save failed', e);
    }
}

function checkAutoSaveRecovery() {
    try {
        const raw = localStorage.getItem('trackstudio_autosave');
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft && draft.track && physicsLines.length === 0 && sceneryLines.length === 0) {
            const timeAgo = Math.round((Date.now() - draft.timestamp) / 60000);
            const timeLabel = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.round(timeAgo / 60)}h ago`;
            showUndoToast(`Draft found (${draft.filename || 'track'} from ${timeLabel})`, () => {
                loadTrackData(draft.track, draft.filename);
                toast('Restored autosaved draft.', 'success');
            }, 10000);
        }
    } catch (e) {}
}

// ==========================================
// RECENT TRACKS
// ==========================================
function loadRecentTracks() {
    try {
        recentTracks = JSON.parse(localStorage.getItem('trackstudio_recent_tracks') || '[]');
        renderRecentTracks();
    } catch (e) {
        recentTracks = [];
    }
}

function addRecentTrack(name, filePath, content) {
    if (!name) return;
    recentTracks = recentTracks.filter(t => t.name !== name && (!filePath || t.path !== filePath));
    const safeContent = (!filePath && content && content.length < 200000) ? content : null;
    recentTracks.unshift({ name, path: filePath || '', content: safeContent, time: Date.now() });
    if (recentTracks.length > 8) recentTracks.pop();
    try {
        localStorage.setItem('trackstudio_recent_tracks', JSON.stringify(recentTracks));
    } catch (e) {
        console.warn('Failed to store recent tracks to localStorage', e);
    }
    renderRecentTracks();
}

function renderRecentTracks() {
    const list = document.getElementById('recentTracksList');
    const sec = document.getElementById('recentTracksSection');
    if (!list || !sec) return;
    if (recentTracks.length === 0) {
        sec.style.display = 'none';
        return;
    }
    sec.style.display = 'block';
    list.innerHTML = '';
    recentTracks.forEach(t => {
        const item = document.createElement('div');
        item.className = 'recent-track-item';
        item.textContent = t.name;
        item.title = t.path || t.name;
        item.addEventListener('click', async () => {
            if (t.path && window.electronAPI && window.electronAPI.openTrackByPath) {
                window.electronAPI.openTrackByPath(t.path);
            } else if (t.content) {
                loadTrackData(t.content, t.name);
            } else {
                toast(`Open ${t.name} from File dialog`, 'info', 2000);
            }
        });
        list.appendChild(item);
    });
}

function syncPerspUI() {
    const visBtn = document.getElementById('perspVisBtn');
    const lockBtn = document.getElementById('perspLockBtn');
    const modeSel = document.getElementById('perspModeSelect');
    const snapSel = document.getElementById('perspSnapSelect');
    const axisLockRow = document.getElementById('perspAxisLockRow');
    const axisLockSel = document.getElementById('perspAxisLockSelect');
    const coneRow = document.getElementById('perspSnapConeRow');
    const coneInput = document.getElementById('perspSnapCone');
    const coneVal = document.getElementById('perspSnapConeVal');
    const followChk = document.getElementById('perspFollowCamToggle');
    const editBtn = document.getElementById('perspEditBtn');
    const spreadRow = document.getElementById('perspSpreadRow');
    const spreadInput = document.getElementById('perspSpread');
    const spreadVal = document.getElementById('perspSpreadVal');
    const isoRow = document.getElementById('perspIsoAngleRow');
    const isoInput = document.getElementById('perspIsoAngle');
    const isoVal = document.getElementById('perspIsoAngleVal');
    const densInput = document.getElementById('perspDensity');
    const densVal = document.getElementById('perspDensityVal');
    const opInput = document.getElementById('perspOpacity');
    const opVal = document.getElementById('perspOpacityVal');
    const coordsBox = document.getElementById('perspCoordsBox');
    const vp1Row = document.getElementById('perspVp1Row');
    const vp2Row = document.getElementById('perspVp2Row');
    const vp3Row = document.getElementById('perspVp3Row');

    const m = perspectiveGrid.mode;
    if (visBtn) {
        visBtn.classList.toggle('active', perspectiveGrid.visible);
        setLayerIcon(visBtn, perspectiveGrid.visible ? 'eye-open' : 'eye-closed');
    }
    if (lockBtn) {
        lockBtn.classList.toggle('locked', perspectiveGrid.locked);
        setLayerIcon(lockBtn, perspectiveGrid.locked ? 'lock' : 'unlock');
    }
    if (modeSel) modeSel.value = m;
    if (snapSel) snapSel.value = perspectiveGrid.snapMode;
    if (axisLockRow) axisLockRow.style.display = perspectiveGrid.snapMode === 'angle' ? 'flex' : 'none';
    if (axisLockSel) axisLockSel.value = perspectiveGrid.axisLock || 'auto';
    if (coneRow) coneRow.style.display = (perspectiveGrid.snapMode === 'angle' && perspectiveGrid.axisLock === 'auto') ? 'block' : 'none';
    if (coneInput) coneInput.value = perspectiveGrid.snapConeDeg || 12;
    if (coneVal) coneVal.textContent = perspectiveGrid.snapConeDeg || 12;
    if (followChk) followChk.checked = !!perspectiveGrid.followCamera;
    if (editBtn) {
        editBtn.disabled = !perspectiveGrid.visible || perspectiveGrid.locked || m === 'iso';
        editBtn.classList.toggle('active', isPerspEditMode && !editBtn.disabled);
        if (editBtn.disabled && isPerspEditMode) {
            isPerspEditMode = false;
            applyToolCursor();
        }
    }

    const showSpread = m === '2pt' || m === '3pt';
    if (spreadRow) spreadRow.style.display = showSpread ? 'block' : 'none';
    const spreadDist = Math.round(Math.hypot(perspectiveGrid.vp2.x - perspectiveGrid.vp1.x, perspectiveGrid.vp2.y - perspectiveGrid.vp1.y));
    if (spreadInput) spreadInput.value = Math.min(3000, Math.max(200, spreadDist));
    if (spreadVal) spreadVal.textContent = spreadDist;

    if (isoRow) isoRow.style.display = m === 'iso' ? 'block' : 'none';
    if (isoInput) isoInput.value = perspectiveGrid.isoAngle;
    if (isoVal) isoVal.textContent = perspectiveGrid.isoAngle;

    if (densInput) densInput.value = perspectiveGrid.density;
    if (densVal) densVal.textContent = perspectiveGrid.density;
    const opPct = Math.round(perspectiveGrid.opacity * 100);
    if (opInput) opInput.value = opPct;
    if (opVal) opVal.textContent = opPct;

    if (coordsBox) coordsBox.style.display = m === 'iso' ? 'none' : 'block';
    if (vp1Row) vp1Row.style.display = m === 'iso' ? 'none' : 'flex';
    if (vp2Row) vp2Row.style.display = (m === '2pt' || m === '3pt') ? 'flex' : 'none';
    if (vp3Row) vp3Row.style.display = m === '3pt' ? 'flex' : 'none';

    const setCoord = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = Math.round(v); };
    setCoord('perspVp1X', perspectiveGrid.vp1.x);
    setCoord('perspVp1Y', perspectiveGrid.vp1.y);
    setCoord('perspVp2X', perspectiveGrid.vp2.x);
    setCoord('perspVp2Y', perspectiveGrid.vp2.y);
    setCoord('perspVp3X', perspectiveGrid.vp3.x);
    setCoord('perspVp3Y', perspectiveGrid.vp3.y);

    const statusPerspBtn = document.getElementById('statusPerspBtn');
    if (statusPerspBtn) {
        const snapShort = perspectiveGrid.snapMode === 'none' ? 'Guide' : (perspectiveGrid.snapMode === 'angle' ? 'Ang' : 'Grid');
        statusPerspBtn.textContent = perspectiveGrid.visible
            ? `${m.toUpperCase()}·${snapShort}`
            : 'Persp:Off';
        statusPerspBtn.classList.toggle('active', perspectiveGrid.visible);
    }
}

/**
 * Sync the status bar Angle Lock pill text & active state.
 */
function updateAngleLockUI() {
    const btn = document.getElementById('statusAngleBtn');
    if (!btn) return;
    btn.textContent = angleLockStep > 0 ? `${angleLockStep}°` : 'Ang:Off';
    btn.classList.toggle('active', angleLockStep > 0);
}

function centerPerspectiveVPs() {
    const span = Math.max(200, Math.round((viewW / zoom) * 0.42));
    const cx = Math.round(camX), cy = Math.round(camY);
    if (perspectiveGrid.mode === '1pt') {
        perspectiveGrid.vp1 = { x: cx, y: cy };
    } else {
        perspectiveGrid.vp1 = { x: cx - span, y: cy };
        perspectiveGrid.vp2 = { x: cx + span, y: cy };
        perspectiveGrid.vp3 = { x: cx, y: cy + Math.round((viewH / zoom) * 0.65) };
    }
    syncPerspUI();
    saveSettings();
    draw();
}

const BUILTIN_PERSP_PRESETS = [
    { id: 'builtin:2pt-classic', label: 'Preset: 2-Point Classic', mode: '2pt', vp1: { x: -450, y: 0 }, vp2: { x: 450, y: 0 }, vp3: { x: 0, y: 650 }, isoAngle: 30 },
    { id: 'builtin:1pt-tunnel', label: 'Preset: 1-Point Tunnel', mode: '1pt', vp1: { x: 0, y: 0 }, vp2: { x: 450, y: 0 }, vp3: { x: 0, y: 650 }, isoAngle: 30 },
    { id: 'builtin:3pt-worms', label: 'Preset: 3-Point Worm-Eye', mode: '3pt', vp1: { x: -500, y: 80 }, vp2: { x: 500, y: 80 }, vp3: { x: 0, y: -620 }, isoAngle: 30 },
    { id: 'builtin:3pt-birds', label: 'Preset: 3-Point Bird-Eye', mode: '3pt', vp1: { x: -500, y: -100 }, vp2: { x: 500, y: -100 }, vp3: { x: 0, y: 650 }, isoAngle: 30 },
    { id: 'builtin:iso-30', label: 'Preset: Isometric 30°', mode: 'iso', vp1: { x: -450, y: 0 }, vp2: { x: 450, y: 0 }, vp3: { x: 0, y: 650 }, isoAngle: 30 }
];

function refreshPerspPresets(selectId = null) {
    const sel = document.getElementById('perspPresetSelect');
    const delBtn = document.getElementById('perspDeleteBookmarkBtn');
    if (!sel) return;
    const prev = selectId || sel.value;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = '-- Presets & Bookmarks --';
    sel.appendChild(ph);

    for (const p of BUILTIN_PERSP_PRESETS) {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.label;
        sel.appendChild(o);
    }
    perspBookmarks.forEach((bm, idx) => {
        const o = document.createElement('option');
        o.value = 'bm:' + idx;
        o.textContent = `★ ${bm.name} (${bm.mode.toUpperCase()})`;
        sel.appendChild(o);
    });
    if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
    if (delBtn) delBtn.style.display = sel.value.startsWith('bm:') ? 'inline-block' : 'none';
}

function setupPerspectiveGrid() {
    const visBtn = document.getElementById('perspVisBtn');
    const lockBtn = document.getElementById('perspLockBtn');
    const modeSel = document.getElementById('perspModeSelect');
    const snapSel = document.getElementById('perspSnapSelect');
    const axisLockSel = document.getElementById('perspAxisLockSelect');
    const coneInput = document.getElementById('perspSnapCone');
    const followChk = document.getElementById('perspFollowCamToggle');
    const editBtn = document.getElementById('perspEditBtn');
    const levelBtn = document.getElementById('perspLevelBtn');
    const centerBtn = document.getElementById('perspCenterBtn');
    const resetBtn = document.getElementById('perspResetBtn');
    const presetSel = document.getElementById('perspPresetSelect');
    const saveBmBtn = document.getElementById('perspSaveBookmarkBtn');
    const delBmBtn = document.getElementById('perspDeleteBookmarkBtn');
    const bmNameInput = document.getElementById('perspBookmarkName');
    const spreadEl = document.getElementById('perspSpread');
    const isoEl = document.getElementById('perspIsoAngle');
    const densEl = document.getElementById('perspDensity');
    const opEl = document.getElementById('perspOpacity');

    if (visBtn) {
        visBtn.addEventListener('click', () => {
            perspectiveGrid.visible = !perspectiveGrid.visible;
            if (!perspectiveGrid.visible && isPerspEditMode) setPerspEditMode(false);
            syncPerspUI();
            saveSettings();
            draw();
        });
    }
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            perspectiveGrid.locked = !perspectiveGrid.locked;
            if (perspectiveGrid.locked && isPerspEditMode) setPerspEditMode(false);
            syncPerspUI();
            saveSettings();
            draw();
        });
    }
    if (modeSel) {
        modeSel.addEventListener('change', (e) => {
            perspectiveGrid.mode = e.target.value;
            perspectiveGrid.visible = true;
            if (perspectiveGrid.mode === 'iso' && isPerspEditMode) setPerspEditMode(false);
            syncPerspUI();
            saveSettings();
            draw();
        });
    }
    if (snapSel) {
        snapSel.addEventListener('change', (e) => {
            perspectiveGrid.snapMode = e.target.value;
            if (perspectiveGrid.snapMode !== 'none') perspectiveGrid.visible = true;
            syncPerspUI();
            saveSettings();
            draw();
        });
    }
    if (axisLockSel) {
        axisLockSel.addEventListener('change', (e) => {
            perspectiveGrid.axisLock = e.target.value;
            perspectiveGrid.visible = true;
            if (perspectiveGrid.snapMode !== 'angle') perspectiveGrid.snapMode = 'angle';
            syncPerspUI();
            saveSettings();
            draw();
        });
    }
    if (coneInput) {
        coneInput.addEventListener('input', (e) => {
            perspectiveGrid.snapConeDeg = parseInt(e.target.value) || 12;
            syncPerspUI();
        });
        coneInput.addEventListener('change', saveSettings);
    }
    if (followChk) {
        followChk.addEventListener('change', (e) => {
            perspectiveGrid.followCamera = e.target.checked;
            lastPerspCamX = camX;
            lastPerspCamY = camY;
            saveSettings();
        });
    }
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            setPerspEditMode(!isPerspEditMode);
        });
    }
    if (levelBtn) {
        levelBtn.addEventListener('click', () => {
            const avgY = Math.round((perspectiveGrid.vp1.y + perspectiveGrid.vp2.y) * 0.5);
            perspectiveGrid.vp1.y = avgY;
            perspectiveGrid.vp2.y = avgY;
            syncPerspUI();
            saveSettings();
            draw();
            toast(`Horizon leveled (Y = ${avgY})`, 'info', 1200);
        });
    }
    if (centerBtn) {
        centerBtn.addEventListener('click', () => {
            perspectiveGrid.visible = true;
            centerPerspectiveVPs();
            toast('Perspective VPs centered in view.', 'info', 1400);
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            perspectiveGrid.vp1 = { x: -450, y: 0 };
            perspectiveGrid.vp2 = { x: 450, y: 0 };
            perspectiveGrid.vp3 = { x: 0, y: 650 };
            perspectiveGrid.isoAngle = 30;
            perspectiveGrid.density = 16;
            perspectiveGrid.axisLock = 'auto';
            syncPerspUI();
            saveSettings();
            draw();
        });
    }
    const applyPresetCfg = (cfg) => {
        if (!cfg) return;
        perspectiveGrid.visible = true;
        perspectiveGrid.mode = cfg.mode;
        perspectiveGrid.vp1 = { ...cfg.vp1 };
        perspectiveGrid.vp2 = { ...cfg.vp2 };
        perspectiveGrid.vp3 = { ...cfg.vp3 };
        if (cfg.isoAngle !== undefined) perspectiveGrid.isoAngle = cfg.isoAngle;
        if (cfg.density !== undefined) perspectiveGrid.density = cfg.density;
        syncPerspUI();
        saveSettings();
        draw();
    };
    if (presetSel) {
        presetSel.addEventListener('change', () => {
            const val = presetSel.value;
            if (delBmBtn) delBmBtn.style.display = val.startsWith('bm:') ? 'inline-block' : 'none';
            if (val.startsWith('builtin:')) {
                const p = BUILTIN_PERSP_PRESETS.find(x => x.id === val);
                if (p) applyPresetCfg(p);
            } else if (val.startsWith('bm:')) {
                const idx = parseInt(val.slice(3), 10);
                if (perspBookmarks[idx]) applyPresetCfg(perspBookmarks[idx]);
            }
        });
    }
    if (saveBmBtn) {
        saveBmBtn.addEventListener('click', () => {
            const rawName = (bmNameInput?.value || '').trim();
            const name = rawName || `Scene ${perspBookmarks.length + 1} (${Math.round(camX)},${Math.round(camY)})`;
            const entry = {
                name,
                mode: perspectiveGrid.mode,
                vp1: { ...perspectiveGrid.vp1 },
                vp2: { ...perspectiveGrid.vp2 },
                vp3: { ...perspectiveGrid.vp3 },
                isoAngle: perspectiveGrid.isoAngle,
                density: perspectiveGrid.density
            };
            perspBookmarks.push(entry);
            if (bmNameInput) bmNameInput.value = '';
            refreshPerspPresets('bm:' + (perspBookmarks.length - 1));
            saveSettings();
            toast(`Saved grid bookmark "${name}"`, 'success', 1500);
        });
    }
    if (delBmBtn) {
        delBmBtn.addEventListener('click', () => {
            const val = presetSel?.value || '';
            if (!val.startsWith('bm:')) return;
            const idx = parseInt(val.slice(3), 10);
            if (idx >= 0 && idx < perspBookmarks.length) {
                const removed = perspBookmarks.splice(idx, 1)[0];
                refreshPerspPresets('');
                saveSettings();
                toast(`Removed bookmark "${removed.name}"`, 'info', 1400);
            }
        });
    }
    refreshPerspPresets();
    if (spreadEl) {
        spreadEl.addEventListener('input', (e) => {
            const targetSpan = parseFloat(e.target.value) || 900;
            const midX = (perspectiveGrid.vp1.x + perspectiveGrid.vp2.x) * 0.5;
            const midY = (perspectiveGrid.vp1.y + perspectiveGrid.vp2.y) * 0.5;
            const dx = perspectiveGrid.vp2.x - perspectiveGrid.vp1.x;
            const dy = perspectiveGrid.vp2.y - perspectiveGrid.vp1.y;
            const curLen = Math.hypot(dx, dy) || 1;
            const ux = dx / curLen, uy = dy / curLen;
            perspectiveGrid.vp1 = { x: Math.round(midX - ux * targetSpan * 0.5), y: Math.round(midY - uy * targetSpan * 0.5) };
            perspectiveGrid.vp2 = { x: Math.round(midX + ux * targetSpan * 0.5), y: Math.round(midY + uy * targetSpan * 0.5) };
            syncPerspUI();
            draw();
        });
        spreadEl.addEventListener('change', saveSettings);
    }
    if (isoEl) {
        isoEl.addEventListener('input', (e) => {
            perspectiveGrid.isoAngle = parseInt(e.target.value) || 30;
            syncPerspUI();
            draw();
        });
        isoEl.addEventListener('change', saveSettings);
    }
    if (densEl) {
        densEl.addEventListener('input', (e) => {
            perspectiveGrid.density = parseInt(e.target.value) || 16;
            syncPerspUI();
            draw();
        });
        densEl.addEventListener('change', saveSettings);
    }
    if (opEl) {
        opEl.addEventListener('input', (e) => {
            perspectiveGrid.opacity = (parseInt(e.target.value) || 45) / 100;
            syncPerspUI();
            draw();
        });
        opEl.addEventListener('change', saveSettings);
    }

    const bindCoord = (id, targetVp, axis) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            const num = parseFloat(el.value);
            if (!Number.isFinite(num)) return;
            perspectiveGrid[targetVp][axis] = Math.round(num);
            const spreadDist = Math.round(Math.hypot(perspectiveGrid.vp2.x - perspectiveGrid.vp1.x, perspectiveGrid.vp2.y - perspectiveGrid.vp1.y));
            const spreadInput = document.getElementById('perspSpread');
            const spreadVal = document.getElementById('perspSpreadVal');
            if (spreadInput) spreadInput.value = Math.min(3000, Math.max(200, spreadDist));
            if (spreadVal) spreadVal.textContent = spreadDist;
            draw();
        });
        el.addEventListener('change', saveSettings);
    };
    bindCoord('perspVp1X', 'vp1', 'x');
    bindCoord('perspVp1Y', 'vp1', 'y');
    bindCoord('perspVp2X', 'vp2', 'x');
    bindCoord('perspVp2Y', 'vp2', 'y');
    bindCoord('perspVp3X', 'vp3', 'x');
    bindCoord('perspVp3Y', 'vp3', 'y');

    syncPerspUI();
}

// Initialize desktop & GUI extensions
setupSidebarTabs();
setupLayerManager();
setupFloatingHud();
setupMinimapInteraction();
loadRecentTracks();
initAutoSave();
checkAutoSaveRecovery();
lastPerspCamX = camX;
lastPerspCamY = camY;
setAppMode(appMode);
updateAngleLockUI();
updateHudActionVisibility();
updateStatusBar();
updateHudLayer();
drawMinimap();
