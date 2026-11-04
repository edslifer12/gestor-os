"use strict";
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const phone = require("../renderer/phone");
const limits = {
  nome: 180,
  telefone: 30,
  endereco: 240,
  bairro: 100,
  cidade: 100,
};
function key(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
function validate(input) {
  if (!input || typeof input !== "object")
    throw Error("Dados do cliente inválidos.");
  const result = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof input[field] !== "string" || input[field].length > limit)
      throw Error("Campo inválido: " + field);
    result[field] = input[field].trim();
  }
  if (!result.nome) throw Error("Informe o nome do cliente.");
  if (!phone.valid(result.telefone))
    throw Error("Informe um telefone brasileiro com DDD e 10 ou 11 dígitos.");
  result.telefone = phone.format(result.telefone);
  return result;
}
function idValue(id) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
    throw Error("Identificador de cliente inválido.");
  return id;
}
class Clients {
  constructor(directory) {
    this.directory = directory;
    this.db = null;
  }
  open() {
    fs.mkdirSync(this.directory, { recursive: true });
    this.db = new DatabaseSync(path.join(this.directory, "clients.sqlite"));
    try {
      this.db.exec(
        "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
      );
      const version = this.db.prepare("PRAGMA user_version").get().user_version;
      if (version > 1)
        throw Error(
          "Banco de clientes criado por uma versão mais recente. Abra a versão mais recente do aplicativo.",
        );
      this.db.exec(`CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, name_key TEXT NOT NULL,
        telefone TEXT NOT NULL, endereco TEXT NOT NULL, bairro TEXT NOT NULL, cidade TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS clients_name_idx ON clients(name_key);
      PRAGMA user_version=1;`);
      const integrity = this.db.prepare("PRAGMA quick_check").get().quick_check;
      if (integrity !== "ok")
        throw Error(
          "Não foi possível verificar a integridade do banco de clientes. Preserve o arquivo e recupere um backup.",
        );
    } catch (error) {
      this.close();
      throw error;
    }
  }
  get(id) {
    const row = this.db
      .prepare(
        "SELECT id,nome,telefone,endereco,bairro,cidade,created_at,updated_at FROM clients WHERE id=?",
      )
      .get(idValue(id));
    if (!row) throw Error("Cliente não encontrado.");
    return { ...row };
  }
  list(options = {}) {
    const { query = "", offset = 0, limit = 25, prefix = false } = options;
    if (
      typeof query !== "string" ||
      query.length > 180 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      typeof prefix !== "boolean"
    )
      throw Error("Parâmetros de busca inválidos.");
    const escaped = key(query).replace(/[\\%_]/g, "\\$&");
    const pattern = (prefix ? "" : "%") + escaped + "%";
    const total = this.db
      .prepare(
        "SELECT count(*) AS total FROM clients WHERE name_key LIKE ? ESCAPE '\\'",
      )
      .get(pattern).total;
    const items = this.db
      .prepare(
        "SELECT id,nome,telefone,endereco,bairro,cidade,created_at,updated_at FROM clients WHERE name_key LIKE ? ESCAPE '\\' ORDER BY name_key,id LIMIT ? OFFSET ?",
      )
      .all(pattern, limit, offset)
      .map((row) => ({ ...row }));
    return { items, total, offset, limit };
  }
  create(input) {
    const data = validate(input),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO clients (id,nome,name_key,telefone,endereco,bairro,cidade,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        data.nome,
        key(data.nome),
        data.telefone,
        data.endereco,
        data.bairro,
        data.cidade,
        now,
        now,
      );
    return this.get(id);
  }
  update(id, input) {
    idValue(id);
    const data = validate(input);
    this.get(id);
    this.db
      .prepare(
        "UPDATE clients SET nome=?,name_key=?,telefone=?,endereco=?,bairro=?,cidade=?,updated_at=? WHERE id=?",
      )
      .run(
        data.nome,
        key(data.nome),
        data.telefone,
        data.endereco,
        data.bairro,
        data.cidade,
        new Date().toISOString(),
        id,
      );
    return this.get(id);
  }
  delete(id) {
    this.get(id);
    this.db.prepare("DELETE FROM clients WHERE id=?").run(id);
    return true;
  }
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
module.exports = { Clients, validateClient: validate };
