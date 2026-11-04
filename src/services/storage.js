"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateDraft, MAX_BYTES } = require("./validation");
function settingsValue(input = { showSolicitante: true }) {
  if (!input || typeof input.showSolicitante !== "boolean")
    throw Error("Configuração de solicitante inválida.");
  const theme = input.theme ?? "light";
  if (!["light", "dark"].includes(theme)) throw Error("Tema inválido.");
  const settings = { showSolicitante: input.showSolicitante, theme };
  if (input.company !== undefined) {
    const source = input.company;
    if (!source || typeof source !== "object" || Array.isArray(source)) throw Error("Dados da empresa inválidos.");
    const company = {};
    for (const [key, max] of Object.entries({name:120, legalName:160, document:30, phone:30, email:160, address:300})) {
      const value = source[key] ?? "";
      if (typeof value !== "string" || value.length > max) throw Error("Campo da empresa inválido: " + key);
      company[key] = value.trim();
    }
    const logo = source.logo ?? "";
    if (typeof logo !== "string" || logo.length > 2800000 || (logo && !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(logo))) throw Error("Logo inválida. Selecione uma imagem pelo aplicativo.");
    company.logo = logo;
    settings.company = company;
  }
  return settings;
}
class Storage {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, "state.json");
    this.backup = path.join(directory, "state.backup.json");
    this.state = null;
    this.warning = "";
    this.tail = Promise.resolve();
  }
  async open() {
    await fs.mkdir(this.directory, { recursive: true });
    const failures = [];
    for (const file of [this.file, this.backup]) {
      try {
        if ((await fs.stat(file)).size > MAX_BYTES + 2900000)
          throw Error("Arquivo de dados muito grande.");
        const raw = JSON.parse(await fs.readFile(file, "utf8"));
        if (
          raw.format !== 1 ||
          !raw.counter ||
          !Number.isSafeInteger(raw.counter.year) ||
          !Number.isSafeInteger(raw.counter.number) ||
          raw.counter.number < 0
        )
          throw Error("Arquivo de dados inválido.");
        this.state = {
          settings: settingsValue(raw.settings),
          format: 1,
          counter: { year: raw.counter.year, number: raw.counter.number },
          draft: raw.draft === null ? null : validateDraft(raw.draft),
        };
        if (file === this.backup)
          this.warning =
            "A cópia anterior dos dados foi recuperada. Confira o atendimento e importe seu backup mais recente se necessário.";
        return;
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.every((e) => e.code === "ENOENT")) {
      this.state = {
        format: 1,
        counter: { year: 0, number: 0 },
        draft: null,
        settings: settingsValue(),
      };
      return;
    }
    throw Error(
      "Os arquivos de dados não puderam ser lidos. Eles foram preservados. Feche o aplicativo e recupere uma cópia de segurança antes de continuar.",
    );
  }
  async atomicWrite(file, text) {
    const temporary = file + "." + crypto.randomUUID() + ".tmp";
    let handle;
    try {
      handle = await fs.open(temporary, "wx", 0o600);
      await handle.writeFile(text, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, file);
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(temporary).catch(() => {});
    }
  }
  transaction(change) {
    const job = this.tail.then(async () => {
      if (!this.state) throw Error("Armazenamento indisponível.");
      const next = structuredClone(this.state);
      const result = change(next);
      // Backup contains the previously validated state, never unreadable disk bytes.
      await this.atomicWrite(this.backup, JSON.stringify(this.state, null, 2));
      await this.atomicWrite(this.file, JSON.stringify(next, null, 2));
      this.state = next;
      return result;
    });
    this.tail = job.catch(() => {});
    return job;
  }
  getState() {
    if (!this.state) throw Error("Armazenamento indisponível.");
    return {
      draft: structuredClone(this.state.draft),
      warning: this.warning,
      settings: structuredClone(this.state.settings),
    };
  }
  saveSettings(input) {
    const settings = settingsValue(input);
    return this.transaction((next) => {
      next.settings = settings;
      return structuredClone(settings);
    });
  }
  saveDraft(input) {
    const draft = validateDraft(input);
    return this.transaction((next) => {
      next.draft = draft;
      return { savedAt: draft.savedAt };
    });
  }
  nextNumber(now = new Date()) {
    return this.transaction((next) => {
      const year = now.getFullYear();
      next.counter = {
        year,
        number: next.counter.year === year ? next.counter.number + 1 : 1,
      };
      if (!Number.isSafeInteger(next.counter.number))
        throw Error("Limite da numeração atingido.");
      return `OS-${year}-${String(next.counter.number).padStart(4, "0")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    });
  }
  async flush() {
    await this.tail;
  }
}
module.exports = { Storage };
