"use strict";
const { contextBridge, ipcRenderer } = require("electron");
// Expose only fixed application operations. Never expose ipcRenderer itself.
contextBridge.exposeInMainWorld("bpsDesktop", {
  listClients: (options) => ipcRenderer.invoke("bps:clients-list", options),
  createClient: (data) => ipcRenderer.invoke("bps:clients-create", data),
  updateClient: (id, data) =>
    ipcRenderer.invoke("bps:clients-update", id, data),
  deleteClient: (id) => ipcRenderer.invoke("bps:clients-delete", id),
  chooseLogo: () => ipcRenderer.invoke("bps:choose-logo"),
  saveSettings: (settings) => ipcRenderer.invoke("bps:save-settings", settings),
  getState: () => ipcRenderer.invoke("bps:get-state"),
  nextNumber: () => ipcRenderer.invoke("bps:next-number"),
  saveDraft: (draft) => ipcRenderer.invoke("bps:save-draft", draft),
  exportPDF: (draft) => ipcRenderer.invoke("bps:export-pdf", draft),
  exportBackup: (draft) => ipcRenderer.invoke("bps:export-backup", draft),
  importBackup: () => ipcRenderer.invoke("bps:import-backup"),
  confirm: (kind) => ipcRenderer.invoke("bps:confirm", kind),
  openDataFolder: () => ipcRenderer.invoke("bps:open-data-folder"),
  finishClose: (draft) => ipcRenderer.invoke("bps:finish-close", draft),
  onCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("bps:prepare-close", listener);
    return () => ipcRenderer.removeListener("bps:prepare-close", listener);
  },
});
