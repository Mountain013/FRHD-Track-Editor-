const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let isDirty = false;
let currentFilePath = null;
let currentFileName = null;
let fileToOpenOnStartup = null;

// Determine if track file was passed as CLI argument
function getFilePathFromArgs(argv) {
    for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];
        if (arg && !arg.startsWith('--') && !arg.startsWith('-') && fs.existsSync(arg)) {
            const ext = path.extname(arg).toLowerCase();
            if (ext === '.txt' || ext === '.frhd') {
                return path.resolve(arg);
            }
        }
    }
    return null;
}

if (process.argv.length > 1) {
    fileToOpenOnStartup = getFilePathFromArgs(process.argv);
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            const file = getFilePathFromArgs(commandLine);
            if (file) {
                openTrackByPath(file);
            }
        }
    });
}

function updateWindowTitle() {
    if (!mainWindow) return;
    const dirtyMark = isDirty ? '• ' : '';
    const fileLabel = currentFileName ? `${currentFileName} - ` : '';
    const title = `${dirtyMark}${fileLabel}Track Studio`;
    mainWindow.setTitle(title);
    if (process.platform === 'darwin') {
        mainWindow.setDocumentEdited(isDirty);
    }
}

async function openTrackByPath(filePath) {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        currentFilePath = filePath;
        currentFileName = path.basename(filePath);
        isDirty = false;
        updateWindowTitle();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('track:open-data', {
                filePath,
                filename: currentFileName,
                content
            });
        }
    } catch (err) {
        dialog.showErrorBox('Failed to Open Track', err.message);
    }
}

function createMainWindow() {
    const isMac = process.platform === 'darwin';

    const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
    const hasIcon = fs.existsSync(iconPath);

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 960,
        minHeight: 640,
        title: 'Track Studio',
        icon: hasIcon ? iconPath : undefined,
        backgroundColor: '#F0E3CE',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    // Build application menu
    buildMenu();

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        updateWindowTitle();
        if (fileToOpenOnStartup) {
            openTrackByPath(fileToOpenOnStartup);
            fileToOpenOnStartup = null;
        }
    });

    // Handle close with unsaved changes
    mainWindow.on('close', async (e) => {
        if (isDirty) {
            e.preventDefault();
            const choice = dialog.showMessageBoxSync(mainWindow, {
                type: 'warning',
                buttons: ['Save Track', "Don't Save", 'Cancel'],
                defaultId: 0,
                cancelId: 2,
                title: 'Unsaved Changes',
                message: 'You have unsaved changes in your track. Do you want to save before closing?'
            });

            if (choice === 0) {
                // Trigger save in renderer
                mainWindow.webContents.send('menu:action', 'save-track-then-close');
            } else if (choice === 1) {
                isDirty = false;
                mainWindow.destroy();
            }
            // choice === 2: Cancel, do nothing
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function buildMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about', label: 'About Track Studio' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: '&File',
            submenu: [
                {
                    label: '&New Track',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow?.webContents.send('menu:action', 'new-track')
                },
                {
                    label: '&Open Track...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => mainWindow?.webContents.send('menu:action', 'open-track')
                },
                { type: 'separator' },
                {
                    label: '&Save / Export Track...',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => mainWindow?.webContents.send('menu:action', 'save-track')
                },
                {
                    label: 'Save &PNG Snapshot... (Ctrl+Shift+S)',
                    click: () => mainWindow?.webContents.send('menu:action', 'save-png')
                },
                { type: 'separator' },
                {
                    label: 'Import Object Database...',
                    click: () => mainWindow?.webContents.send('menu:action', 'import-objects')
                },
                {
                    label: 'Export Object Database...',
                    click: () => mainWindow?.webContents.send('menu:action', 'export-objects')
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit', label: 'E&xit' }
            ]
        },
        {
            label: '&Edit',
            submenu: [
                {
                    label: '&Undo (Ctrl+Z)',
                    click: () => mainWindow?.webContents.send('menu:action', 'undo')
                },
                {
                    label: '&Redo (Ctrl+Y)',
                    click: () => mainWindow?.webContents.send('menu:action', 'redo')
                },
                { type: 'separator' },
                {
                    label: 'Cut Selection (Ctrl+X)',
                    click: () => mainWindow?.webContents.send('menu:action', 'cut')
                },
                {
                    label: 'Copy Selection (Ctrl+C)',
                    click: () => mainWindow?.webContents.send('menu:action', 'copy')
                },
                {
                    label: 'Paste Selection (Ctrl+V)',
                    click: () => mainWindow?.webContents.send('menu:action', 'paste')
                },
                {
                    label: 'Delete Selection (Del)',
                    click: () => mainWindow?.webContents.send('menu:action', 'delete')
                },
                { type: 'separator' },
                {
                    label: 'Save Selection as Object',
                    click: () => mainWindow?.webContents.send('menu:action', 'save-selection-object')
                }
            ]
        },
        {
            label: '&View',
            submenu: [
                {
                    label: '&Fit Track to View',
                    accelerator: 'CmdOrCtrl+F',
                    click: () => mainWindow?.webContents.send('menu:action', 'fit-view')
                },
                {
                    label: '&Reset Camera',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => mainWindow?.webContents.send('menu:action', 'reset-camera')
                },
                { type: 'separator' },
                {
                    label: 'Toggle &Dark Mode',
                    click: () => mainWindow?.webContents.send('menu:action', 'toggle-theme')
                },
                {
                    label: 'Toggle &Grid',
                    accelerator: 'CmdOrCtrl+G',
                    click: () => mainWindow?.webContents.send('menu:action', 'toggle-grid')
                },
                {
                    label: 'Toggle &Radar View (N)',
                    click: () => mainWindow?.webContents.send('menu:action', 'toggle-minimap')
                },
                {
                    label: 'Toggle &Zen Focus Mode (\\)',
                    accelerator: 'CmdOrCtrl+\\',
                    click: () => mainWindow?.webContents.send('menu:action', 'toggle-zen')
                },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: '&Mode & Tools',
            submenu: [
                {
                    label: 'Rotate Mode: Manual / Hybrid / Automation (Tab)',
                    click: () => mainWindow?.webContents.send('menu:action', 'toggle-mode')
                },
                {
                    label: 'Switch Layer: Physics / Scenery (L)',
                    click: () => mainWindow?.webContents.send('menu:action', 'toggle-layer')
                },
                { type: 'separator' },
                { label: 'Line Tool (Q)', click: () => mainWindow?.webContents.send('menu:action', 'tool-line') },
                { label: 'Line+ Tool (W)', click: () => mainWindow?.webContents.send('menu:action', 'tool-line+') },
                { label: 'Curve / Ramp Tool (R)', click: () => mainWindow?.webContents.send('menu:action', 'tool-curve') },
                { label: 'Bridge Tool (B)', click: () => mainWindow?.webContents.send('menu:action', 'tool-bridge') },
                { label: 'Brush Tool (A)', click: () => mainWindow?.webContents.send('menu:action', 'tool-brush') },
                { label: 'Eraser Tool (E)', click: () => mainWindow?.webContents.send('menu:action', 'tool-eraser') },
                { label: 'Polygon Tool (P)', click: () => mainWindow?.webContents.send('menu:action', 'tool-polygon') },
                { label: 'Circle Tool (O)', click: () => mainWindow?.webContents.send('menu:action', 'tool-circle') },
                { label: 'Perspective Box Tool (U)', click: () => mainWindow?.webContents.send('menu:action', 'tool-box') },
                { label: 'Select Tool (S)', click: () => mainWindow?.webContents.send('menu:action', 'tool-select') },
                { label: 'Modify Vertices Tool (M)', click: () => mainWindow?.webContents.send('menu:action', 'tool-modify') },
                { type: 'separator' },
                { label: 'Tube Tool — Hybrid (T)', click: () => mainWindow?.webContents.send('menu:action', 'tool-tube') },
                { label: 'Fill Tool — Hybrid (F)', click: () => mainWindow?.webContents.send('menu:action', 'tool-fill') },
                { label: 'Gradient Tool — Hybrid (G)', click: () => mainWindow?.webContents.send('menu:action', 'tool-gradient') },
                { label: 'Text Tool — Hybrid (X)', click: () => mainWindow?.webContents.send('menu:action', 'tool-text') }
            ]
        },
        {
            label: '&Help',
            submenu: [
                {
                    label: 'Shortcuts & &Tips (F1)',
                    click: () => mainWindow?.webContents.send('menu:action', 'open-help')
                },
                {
                    label: '&Object Database',
                    click: () => mainWindow?.webContents.send('menu:action', 'open-objects')
                },
                {
                    label: '&Settings',
                    click: () => mainWindow?.webContents.send('menu:action', 'open-settings')
                },
                { type: 'separator' },
                {
                    label: 'About Track Studio',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Track Studio',
                            message: 'Track Studio for Free Rider HD',
                            detail: `Version: ${app.getVersion()}\nPlatform: ${process.platform} (${process.arch})\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChromium: ${process.versions.chrome}\n\nA powerful desktop track editor, procedural generator, and pattern maker for Free Rider HD tracks.`
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// -------------------------------------------------------------
// IPC Handlers
// -------------------------------------------------------------

ipcMain.handle('dialog:openTrack', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Free Rider HD Track',
        filters: [
            { name: 'FRHD Track Files (*.txt, *.frhd)', extensions: ['txt', 'frhd'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const content = await fs.promises.readFile(filePath, 'utf8');
    currentFilePath = filePath;
    currentFileName = path.basename(filePath);
    isDirty = false;
    updateWindowTitle();

    return {
        canceled: false,
        filePath,
        filename: currentFileName,
        content
    };
});

ipcMain.handle('track:openByPath', async (_event, filePath) => {
    if (!fs.existsSync(filePath)) {
        return { canceled: true, error: 'File not found' };
    }
    await openTrackByPath(filePath);
    return { canceled: false, filePath, filename: path.basename(filePath) };
});

ipcMain.handle('dialog:saveTrack', async (_event, { content, defaultName }) => {
    if (!mainWindow) return { canceled: true };
    const defaultPath = currentFilePath || path.join(app.getPath('documents'), defaultName || 'modified_track.txt');

    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Free Rider HD Track',
        defaultPath,
        filters: [
            { name: 'FRHD Track File (*.txt)', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (result.canceled || !result.filePath) {
        return { canceled: true };
    }

    await fs.promises.writeFile(result.filePath, content, 'utf8');
    currentFilePath = result.filePath;
    currentFileName = path.basename(result.filePath);
    isDirty = false;
    updateWindowTitle();

    return {
        canceled: false,
        filePath: result.filePath,
        filename: currentFileName
    };
});

ipcMain.handle('dialog:savePng', async (_event, { dataUrl, defaultName }) => {
    if (!mainWindow) return { canceled: true };
    const defaultPath = path.join(app.getPath('pictures'), defaultName || `track_${Date.now()}.png`);

    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Track Image (PNG)',
        defaultPath,
        filters: [
            { name: 'PNG Image (*.png)', extensions: ['png'] }
        ]
    });

    if (result.canceled || !result.filePath) {
        return { canceled: true };
    }

    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.promises.writeFile(result.filePath, buffer);

    return {
        canceled: false,
        filePath: result.filePath
    };
});

ipcMain.handle('dialog:importObjects', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Object Database',
        filters: [
            { name: 'JSON Files (*.json)', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
    }

    const content = await fs.promises.readFile(result.filePaths[0], 'utf8');
    return {
        canceled: false,
        filePath: result.filePaths[0],
        content
    };
});

ipcMain.handle('dialog:exportObjects', async (_event, { jsonString, defaultName }) => {
    if (!mainWindow) return { canceled: true };
    const defaultPath = path.join(app.getPath('documents'), defaultName || 'trackstudio_objects.json');

    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Object Database',
        defaultPath,
        filters: [
            { name: 'JSON File (*.json)', extensions: ['json'] }
        ]
    });

    if (result.canceled || !result.filePath) {
        return { canceled: true };
    }

    await fs.promises.writeFile(result.filePath, jsonString, 'utf8');
    return {
        canceled: false,
        filePath: result.filePath
    };
});

ipcMain.on('app:setDirty', (_event, { isDirty: dirty, filename }) => {
    isDirty = Boolean(dirty);
    if (filename) currentFileName = filename;
    updateWindowTitle();
});

ipcMain.handle('app:getInfo', () => {
    return {
        name: app.name,
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch
    };
});

// macOS open-file event (e.g. drop on dock or double click file)
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow && mainWindow.webContents) {
        openTrackByPath(filePath);
    } else {
        fileToOpenOnStartup = filePath;
    }
});

app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
