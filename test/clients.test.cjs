const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Clients } = require("../src/services/clients");
const phone = require("../src/renderer/phone");
const data = (nome = "João Silva", telefone = "31999991234") => ({
  nome,
  telefone,
  endereco: "Rua A, 100",
  bairro: "Centro",
  cidade: "Mariana — MG",
});
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bps-clients-"));
  const db = new Clients(dir);
  db.open();
  t.after(async () => {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { dir, db };
}
test("cadastros são persistidos em SQLite após fechar e reabrir", async (t) => {
  const { dir, db } = await setup(t);
  const row = db.create(data());
  db.close();
  db.open();
  assert.equal(db.get(row.id).nome, "João Silva");
  assert.equal(db.get(row.id).telefone, "(31) 99999-1234");
  const bytes = await fs.readFile(path.join(dir, "clients.sqlite"));
  assert.equal(bytes.subarray(0, 15).toString(), "SQLite format 3");
});
test("cliente pode ser editado e excluído sem deixar dados antigos na busca", async (t) => {
  const { db } = await setup(t);
  const row = db.create(data());
  db.update(row.id, data("Maria", "3133334444"));
  assert.equal(db.list({ query: "jo", prefix: true }).total, 0);
  assert.equal(
    db.list({ query: "ma", prefix: true }).items[0].telefone,
    "(31) 3333-4444",
  );
  db.delete(row.id);
  assert.equal(db.list().total, 0);
  assert.throws(() => db.get(row.id));
});
test("sugestões ignoram acentos e maiúsculas e buscam apenas o início do nome", async (t) => {
  const { db } = await setup(t);
  db.create(data("João"));
  db.create(data("José"));
  db.create(data("Ana Joana"));
  assert.equal(db.list({ query: "JO", prefix: true }).total, 2);
  assert.equal(db.list({ query: "joa", prefix: true }).items[0].nome, "João");
  assert.equal(db.list({ query: "jo", prefix: false }).total, 3);
});
test("nomes iguais continuam separados pelo identificador", async (t) => {
  const { db } = await setup(t);
  const a = db.create(data("Carlos", "31999991111")),
    b = db.create(data("Carlos", "31999992222"));
  assert.notEqual(a.id, b.id);
  assert.equal(db.list({ query: "Carl", prefix: true }).total, 2);
  db.delete(a.id);
  assert.equal(db.get(b.id).nome, "Carlos");
});
test("buscas tratam curingas e tentativas de SQL como texto", async (t) => {
  const { db } = await setup(t);
  db.create(data("100% Soluções"));
  db.create(data("Outro"));
  assert.equal(db.list({ query: "%" }).total, 1);
  assert.equal(db.list({ query: "'; DROP TABLE clients;--" }).total, 0);
  assert.equal(db.list().total, 2);
});
test("paginação retorna todos os clientes sem duplicar linhas", async (t) => {
  const { db } = await setup(t);
  for (let i = 0; i < 31; i++)
    db.create(data("Cliente " + String(i).padStart(2, "0")));
  const first = db.list({ limit: 25 }),
    second = db.list({ offset: 25, limit: 25 });
  assert.equal(first.total, 31);
  assert.equal(second.items.length, 6);
  assert.equal(
    new Set([...first.items, ...second.items].map((c) => c.id)).size,
    31,
  );
});
test("nome obrigatório, limites e telefone inválido são rejeitados", async (t) => {
  const { db } = await setup(t);
  assert.throws(() => db.create(data(" ")));
  assert.throws(() => db.create(data("A", "123")));
  assert.throws(() => db.create(data("A", "00123456789")));
  assert.throws(() => db.create(data("X".repeat(181))));
  assert.throws(() => db.list({ limit: 1000 }));
  assert.equal(db.list().total, 0);
});
test("formatação brasileira preserva fixo, celular e números com +55", () => {
  assert.equal(phone.format("31999991234"), "(31) 99999-1234");
  assert.equal(phone.format("3133334444"), "(31) 3333-4444");
  assert.equal(phone.format("+55 (31) 99999-1234"), "(31) 99999-1234");
  assert.equal(phone.format(""), "");
  assert.equal(phone.valid("123"), false);
  assert.equal(phone.valid(""), true);
  assert.equal(phone.valid("12345678901234"), false);
});
