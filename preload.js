const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,

    // File operations
    openTrack: () => ipcRenderer.invoke('dialog:openTrack'),
    openTrackByPath: (filePath) => ipcRenderer.invoke('track:openByPath', filePath),
    saveTrack: (content, defaultName) => ipcRenderer.invoke('dialog:saveTrack', { content, defaultName }),
    savePng: (dataUrl, defaultName) => ipcRenderer.invoke('dialog:savePng', { dataUrl, defaultName }),
    importObjects: () => ipcRenderer.invoke('dialog:importObjects'),
    exportObjects: (jsonString, defaultName) => ipcRenderer.invoke('dialog:exportObjects', { jsonString, defaultName }),

    // App state
    setDirty: (isDirty, filename) => ipcRenderer.send('app:setDirty', { isDirty, filename }),
    getAppInfo: () => ipcRenderer.invoke('app:getInfo'),

    // Menu events from main process
    onMenuAction: (callback) => {
        const handler = (_event, action, payload) => callback(action, payload);
        ipcRenderer.on('menu:action', handler);
        return () => ipcRenderer.removeListener('menu:action', handler);
    },

    // File opened via OS (double-click, command-line arg, or drag-and-drop)
    onOpenTrackData: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('track:open-data', handler);
        return () => ipcRenderer.removeListener('track:open-data', handler);
    }
});
