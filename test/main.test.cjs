const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
function draft() {
  return {
    version: 3,
    fields: {
      numeroOS: "OS-2026-0001",
      data: "2026-10-15",
      nome: "Cliente Teste",
      telefone: "",
      endereco: "",
      bairro: "",
      cidade: "",
      tipo: "",
      modelo: "",
      defeito: "",
      obs: "",
      desconto: "0",
    },
    servicos: [{ descricao: "Serviço de teste", qtd: "1", valor: "150" }],
  };
}
async function boot(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bps-main-"));
  let shutdown = () => {};
  t.after(async () => {
    shutdown();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const handlers = new Map(),
    paths = { appData: directory, documents: directory };
  let window, resolveStarted;
  const started = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  const options = {
    save: { canceled: true },
    open: { canceled: true },
    answer: 1,
    pdfFailure: false,
    pdfCalls: 0,
  };
  class Window extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      window = this;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        mainFrame: { url: "" },
        session: {
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {},
        },
        setWindowOpenHandler() {},
        send(channel) {
          options.sent = channel;
        },
        printToPDF: async (value) => {
          options.pdfCalls++;
          options.pdfOptions = value;
          if (options.pdfFailure) throw Error("Impressão indisponível");
          return Buffer.from("%PDF-simulado");
        },
      });
    }
    async loadFile(file) {
      this.webContents.mainFrame.url = pathToFileURL(file).href;
      resolveStarted();
    }
    close() {
      options.closed = true;
    }
    show() {}
    isMinimized() {
      return false;
    }
    focus() {}
  }
  const app = new EventEmitter();
  Object.assign(app, {
    setName() {},
    setPath(key, value) {
      assert.equal(require("node:fs").existsSync(value), true);
      paths[key] = value;
    },
    getPath: (key) => paths[key],
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit() {},
  });
  shutdown = () => app.emit("will-quit");
  const electron = {
    app,
    BrowserWindow: Window,
    Menu: { setApplicationMenu() {} },
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    shell: { openPath: async () => "" },
    dialog: {
      showSaveDialog: async () => options.save,
      showOpenDialog: async () => options.open,
      showMessageBox: async () => ({ response: options.answer }),
      showErrorBox: (_title, message) => {
        throw Error(message);
      },
    },
  };
  const main = path.resolve(__dirname, "../src/main.js"),
    realRequire = createRequire(main);
  const context = {
    require: (name) =>
      name === "electron"
        ? electron
        : name === "electron-squirrel-startup"
          ? false
          : realRequire(name),
    __dirname: path.dirname(main),
    process,
    console: { error() {} },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(await fs.readFile(main, "utf8"), context, {
    filename: main,
  });
  await started;
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
  const invoke = (name, ...args) => handlers.get(name)(event, ...args);
  return { directory, paths, window, options, handlers, event, invoke };
}
test("processo principal usa janela isolada e rejeita outro remetente", async (t) => {
  const b = await boot(t);
  assert.equal(b.window.config.webPreferences.nodeIntegration, false);
  assert.equal(b.window.config.webPreferences.contextIsolation, true);
  assert.equal(b.window.config.webPreferences.sandbox, true);
  await assert.rejects(
    b.handlers.get("bps:get-state")({ ...b.event, sender: {} }),
    /origem inválida/,
  );
});
test("PDF cancelado não imprime; PDF confirmado usa A4, fundos e tamanho CSS", async (t) => {
  const b = await boot(t);
  const canceled = await b.invoke("bps:export-pdf", draft());
  assert.equal(canceled.value.canceled, true);
  assert.equal(b.options.pdfCalls, 0);
  b.options.save = {
    canceled: false,
    filePath: path.join(b.directory, "ordem.pdf"),
  };
  const result = await b.invoke("bps:export-pdf", draft());
  assert.equal(result.ok, true);
  assert.equal(b.options.pdfOptions.printBackground, true);
  assert.equal(b.options.pdfOptions.preferCSSPageSize, true);
  assert.equal(b.options.pdfOptions.pageSize, "A4");
  assert.equal(
    await fs.readFile(b.options.save.filePath, "utf8"),
    "%PDF-simulado",
  );
});
test("falha no PDF é informada e permite uma nova exportação", async (t) => {
  const b = await boot(t);
  b.options.save = {
    canceled: false,
    filePath: path.join(b.directory, "ordem.pdf"),
  };
  b.options.pdfFailure = true;
  assert.equal((await b.invoke("bps:export-pdf", draft())).ok, false);
  b.options.pdfFailure = false;
  assert.equal((await b.invoke("bps:export-pdf", draft())).ok, true);
});
test("backup é salvo e lido em arquivo pelo processo principal", async (t) => {
  const b = await boot(t);
  const file = path.join(b.directory, "backup.json");
  b.options.save = { canceled: false, filePath: file };
  assert.equal((await b.invoke("bps:export-backup", draft())).ok, true);
  b.options.open = { canceled: false, filePaths: [file] };
  const restored = await b.invoke("bps:import-backup");
  assert.equal(restored.value.draft.fields.nome, "Cliente Teste");
  await fs.writeFile(file, "inválido");
  assert.equal((await b.invoke("bps:import-backup")).ok, false);
});
test("fechamento espera o preenchimento mais recente e salva antes de fechar", async (t) => {
  const b = await boot(t);
  let prevented = false;
  b.window.emit("close", {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(b.options.sent, "bps:prepare-close");
  const d = draft();
  d.fields.nome = "Última alteração";
  await b.invoke("bps:finish-close", d);
  assert.equal(b.options.closed, true);
  const saved = JSON.parse(
    await fs.readFile(path.join(b.paths.userData, "state.json"), "utf8"),
  );
  assert.equal(saved.draft.fields.nome, "Última alteração");
});

test("handlers gerenciam clientes no SQLite e respeitam cancelamento da exclusão", async (t) => {
  const b = await boot(t);
  const data = {
    nome: "João Silva",
    telefone: "31999991234",
    endereco: "Rua A",
    bairro: "Centro",
    cidade: "Mariana",
  };
  const created = await b.invoke("bps:clients-create", data);
  assert.equal(created.ok, true);
  const id = created.value.id;
  assert.equal(
    (await b.invoke("bps:clients-list", { query: "jo", prefix: true })).value
      .total,
    1,
  );
  assert.equal(
    (await b.invoke("bps:clients-update", id, { ...data, nome: "Maria" })).value
      .nome,
    "Maria",
  );
  b.options.answer = 0;
  assert.equal((await b.invoke("bps:clients-delete", id)).value.canceled, true);
  assert.equal((await b.invoke("bps:clients-list", {})).value.total, 1);
  b.options.answer = 1;
  assert.equal(
    (await b.invoke("bps:clients-delete", id)).value.canceled,
    false,
  );
  assert.equal((await b.invoke("bps:clients-list", {})).value.total, 0);
});
