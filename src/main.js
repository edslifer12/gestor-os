"use strict";
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
  nativeImage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { mkdirSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { Storage } = require("./services/storage");
const { Clients } = require("./services/clients");
const {
  validateDraft,
  validateInvoice,
  safeName,
  MAX_BYTES,
} = require("./services/validation");

app.setName("Gestor OS");
// Same data directory in development and after installing updates.
const dataDirectory = path.join(app.getPath("appData"), "BPS TEC OS");
mkdirSync(dataDirectory, { recursive: true });
app.setPath("userData", dataDirectory);
const rendererFile = path.join(__dirname, "renderer", "index.html");
const rendererURL = pathToFileURL(rendererFile).href;
let win,
  storage,
  startupError,
  clients,
  clientsError,
  allowClose = false,
  closing = false,
  closeTimer,
  pdfBusy = false,
  rendererGone = false;
const confirmations = {
  "remove-service": "Remover este serviço e seus valores?",
  "new-order":
    "Iniciar uma nova OS? O rascunho atual será substituído. Gere o PDF ou exporte um backup antes de continuar.",
  "restore-backup": "Restaurar este backup e substituir o rascunho atual?",
};
function trusted(event) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    event.senderFrame.url !== rendererURL
  )
    throw Error("Solicitação de origem inválida.");
}
function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    trusted(event);
    try {
      return { ok: true, value: await callback(...args) };
    } catch (error) {
      console.error(channel, error);
      return {
        ok: false,
        error: error.message || "Não foi possível concluir a operação.",
      };
    }
  });
}
function requireStorage() {
  if (startupError) throw startupError;
  return storage;
}
async function finishWindowClose() {
  clearTimeout(closeTimer);
  await storage?.flush();
  clients?.close();
  allowClose = true;
  win?.close();
}
async function askExitAfterFailure(message) {
  const result = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Rascunho não salvo",
    message,
    detail:
      "Você pode continuar no aplicativo para tentar salvar ou exportar um backup.",
    buttons: ["Continuar no aplicativo", "Sair sem salvar"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (result.response === 1) await finishWindowClose();
  else closing = false;
}
function registerHandlers() {
  handle("bps:get-state", () => ({
    ...requireStorage().getState(),
    clientsError: clientsError?.message || "",
  }));
  const requireClients = () => {
    if (clientsError) throw clientsError;
    return clients;
  };
  handle("bps:clients-list", (options) => requireClients().list(options));
  handle("bps:clients-create", (data) => requireClients().create(data));
  handle("bps:clients-update", (id, data) => requireClients().update(id, data));
  handle("bps:clients-delete", async (id) => {
    const client = requireClients().get(id);
    const answer = await dialog.showMessageBox(win, {
      type: "warning",
      title: "Excluir cliente",
      message: "Excluir o cadastro de " + client.nome + "?",
      detail: "Os dados já preenchidos na ordem de serviço serão mantidos.",
      buttons: ["Cancelar", "Excluir cliente"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer.response !== 1) return { canceled: true };
    requireClients().delete(id);
    return { canceled: false };
  });
  handle("bps:choose-logo", async () => {
    const selected = await dialog.showOpenDialog(win, {
      title: "Selecionar logo da empresa", properties: ["openFile"],
      filters: [{ name: "Imagem PNG ou JPEG", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
    const file = selected.filePaths[0];
    if ((await fs.stat(file)).size > 5 * 1024 * 1024) throw Error("A imagem deve ter até 5 MB.");
    const image = nativeImage.createFromBuffer(await fs.readFile(file));
    const size = image.getSize();
    if (image.isEmpty() || size.width > 4096 || size.height > 4096) throw Error("Use uma imagem PNG ou JPEG válida de até 4096 × 4096 pixels.");
    const resized = image.resize({ width: Math.min(size.width, 1200), quality: "best" });
    const logo = resized.toDataURL();
    if (logo.length > 2800000) throw Error("Imagem muito grande. Use uma logo de menor resolução.");
    return { canceled: false, logo };
  });
  handle("bps:save-settings", (settings) =>
    requireStorage().saveSettings(settings),
  );
  handle("bps:next-number", () => requireStorage().nextNumber());
  handle("bps:save-draft", (draft) => requireStorage().saveDraft(draft));
  handle("bps:confirm", async (kind) => {
    if (!Object.hasOwn(confirmations, kind))
      throw Error("Confirmação inválida.");
    const answer = await dialog.showMessageBox(win, {
      type: "question",
      title: "Gestor OS",
      message: confirmations[kind],
      buttons: ["Cancelar", "Confirmar"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    return answer.response === 1;
  });
  handle("bps:open-data-folder", async () => {
    const error = await shell.openPath(app.getPath("userData"));
    if (error) throw Error(error);
    return true;
  });
  handle("bps:export-backup", async (input) => {
    const draft = validateDraft(input);
    const selected = await dialog.showSaveDialog(win, {
      title: "Salvar backup do rascunho",
      defaultPath: path.join(
        app.getPath("documents"),
        safeName(draft.fields.numeroOS) + "-rascunho.json",
      ),
      filters: [{ name: "Backup de OS", extensions: ["json"] }],
    });
    if (selected.canceled || !selected.filePath) return { canceled: true };
    await fs.writeFile(
      selected.filePath,
      JSON.stringify(draft, null, 2),
      "utf8",
    );
    return { canceled: false, fileName: path.basename(selected.filePath) };
  });
  handle("bps:import-backup", async () => {
    const selected = await dialog.showOpenDialog(win, {
      title: "Restaurar backup do rascunho",
      properties: ["openFile"],
      filters: [{ name: "Backup de OS", extensions: ["json"] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
    if ((await fs.stat(selected.filePaths[0])).size > MAX_BYTES)
      throw Error("O backup deve ter até 3 MB.");
    const draft = validateDraft(
      JSON.parse(await fs.readFile(selected.filePaths[0], "utf8")),
    );
    return { canceled: false, draft };
  });
  handle("bps:export-pdf", async (input) => {
    if (pdfBusy) throw Error("Aguarde a exportação do PDF atual.");
    const { draft } = validateInvoice(input);
    pdfBusy = true;
    try {
      const selected = await dialog.showSaveDialog(win, {
        title: "Salvar ordem de serviço em PDF",
        defaultPath: path.join(
          app.getPath("documents"),
          safeName(draft.fields.numeroOS) +
            "-" +
            safeName(draft.fields.nome) +
            ".pdf",
        ),
        filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
      });
      if (selected.canceled || !selected.filePath) return { canceled: true };
      const buffer = await win.webContents.printToPDF({
        pageSize: "A4",
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
      });
      await fs.writeFile(selected.filePath, buffer);
      return { canceled: false, fileName: path.basename(selected.filePath) };
    } finally {
      pdfBusy = false;
    }
  });
  handle("bps:finish-close", async (draft) => {
    if (!closing) return false;
    clearTimeout(closeTimer);
    if (draft === null) {
      await finishWindowClose();
      return true;
    }
    try {
      await requireStorage().saveDraft(draft);
      await finishWindowClose();
      return true;
    } catch (error) {
      await askExitAfterFailure(error.message);
      return false;
    }
  });
}
async function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 1000,
    minWidth: 850,
    minHeight: 650,
    title: "Gestor OS",
    backgroundColor: "#f3f5f8",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.webContents.on("render-process-gone", () => {
    rendererGone = true;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.on("ready-to-show", () => win.show());
  win.on("close", (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    if (pdfBusy) {
      closing = false;
      dialog.showMessageBox(win, {
        type: "info",
        message: "Conclua ou cancele a exportação do PDF antes de fechar.",
      });
      return;
    }
    if (rendererGone) {
      askExitAfterFailure(
        "A interface não está respondendo. O último rascunho salvo permanece na pasta de dados.",
      );
      return;
    }
    win.webContents.send("bps:prepare-close");
    closeTimer = setTimeout(
      () =>
        askExitAfterFailure(
          "Não foi possível obter o preenchimento mais recente.",
        ),
      8000,
    );
  });
  await win.loadFile(rendererFile);
}
if (require("electron-squirrel-startup")) {
  app.quit();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      storage = new Storage(app.getPath("userData"));
      try {
        await storage.open();
      } catch (error) {
        startupError = error;
      }
      clients = new Clients(app.getPath("userData"));
      try {
        clients.open();
      } catch (error) {
        clientsError = error;
      }
      registerHandlers();
      await createWindow();
    })
    .catch((error) => {
      dialog.showErrorBox("Gestor OS", error.message);
      app.quit();
    });
  app.on("will-quit", () => clients?.close());
  app.on("window-all-closed", () => app.quit());
}
