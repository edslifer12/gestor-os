const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Storage } = require("../src/services/storage");
const {
  validateDraft,
  validateInvoice,
  safeName,
} = require("../src/services/validation");
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
    servicos: [{ descricao: "Serviço", qtd: "3", valor: "0.10" }],
  };
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bps-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new Storage(directory);
  await store.open();
  return { directory, store };
}
test("totais usam centavos e aceitam serviços gratuitos", () => {
  const d = draft();
  d.servicos.push({ descricao: "Cortesia", qtd: "1", valor: "0" });
  d.fields.desconto = "0.10";
  assert.equal(validateInvoice(d).total, 20);
});
test("dados inválidos não geram documento financeiro", () => {
  for (const mutate of [
    (d) => (d.fields.data = "2026-02-31"),
    (d) => (d.fields.nome = " "),
    (d) => (d.servicos[0].qtd = "0"),
    (d) => (d.servicos[0].qtd = "1.5"),
    (d) => (d.servicos[0].valor = "-1"),
    (d) => (d.servicos[0].valor = "1e2"),
    (d) => (d.fields.desconto = "1"),
  ]) {
    const d = draft();
    mutate(d);
    assert.throws(() => validateInvoice(d));
  }
});
test("backup aceita rascunho incompleto e rejeita estruturas inesperadas", () => {
  const d = draft();
  d.fields.nome = "";
  d.servicos[0].valor = "";
  d.fields.untrusted = "ignorado";
  assert.equal(validateDraft(d).fields.untrusted, undefined);
  assert.throws(() => validateDraft({ version: 3, fields: {}, servicos: [] }));
});
test("gravação sobrevive a reinício e preserva o contador", async (t) => {
  const { directory, store } = await fixture(t);
  const n = await store.nextNumber(new Date("2026-10-15T12:00:00"));
  const d = draft();
  d.fields.numeroOS = n;
  await store.saveDraft(d);
  const reopened = new Storage(directory);
  await reopened.open();
  assert.equal(reopened.getState().draft.fields.numeroOS, n);
  assert.match(
    await reopened.nextNumber(new Date("2026-10-15T12:00:00")),
    /^OS-2026-0002-/,
  );
});
test("gravações concorrentes mantêm a ordem sem truncar dados", async (t) => {
  const { directory, store } = await fixture(t);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) => {
      const d = draft();
      d.fields.nome = "Cliente " + i;
      return store.saveDraft(d);
    }),
  );
  const saved = JSON.parse(
    await fs.readFile(path.join(directory, "state.json"), "utf8"),
  );
  assert.equal(saved.draft.fields.nome, "Cliente 11");
  const numbers = await Promise.all(
    Array.from({ length: 10 }, () => store.nextNumber()),
  );
  assert.equal(new Set(numbers).size, 10);
});
test("corrupção do principal recupera a cópia anterior válida", async (t) => {
  const { directory, store } = await fixture(t);
  const d = draft();
  d.fields.nome = "Anterior";
  await store.saveDraft(d);
  d.fields.nome = "Atual";
  await store.saveDraft(d);
  await fs.writeFile(path.join(directory, "state.json"), "JSON danificado");
  const reopened = new Storage(directory);
  await reopened.open();
  assert.equal(reopened.getState().draft.fields.nome, "Anterior");
  assert.match(reopened.warning, /recuperada/);
  await reopened.saveDraft(reopened.getState().draft);
  assert.equal(
    JSON.parse(
      await fs.readFile(path.join(directory, "state.backup.json"), "utf8"),
    ).draft.fields.nome,
    "Anterior",
  );
});
test("corrupção das duas cópias não sobrescreve os arquivos", async (t) => {
  const { directory } = await fixture(t);
  for (const name of ["state.json", "state.backup.json"])
    await fs.writeFile(path.join(directory, name), "danificado");
  const reopened = new Storage(directory);
  await assert.rejects(reopened.open(), /preservados/);
  assert.equal(
    await fs.readFile(path.join(directory, "state.json"), "utf8"),
    "danificado",
  );
});
test("falha de gravação é reportada e uma nova tentativa pode salvar", async (t) => {
  const { store } = await fixture(t);
  const original = store.atomicWrite.bind(store);
  store.atomicWrite = async () => {
    throw Error("Disco indisponível");
  };
  await assert.rejects(store.saveDraft(draft()), /Disco indisponível/);
  assert.equal(store.getState().draft, null);
  store.atomicWrite = original;
  await store.saveDraft(draft());
  assert.equal(store.getState().draft.fields.nome, "Cliente Teste");
});
test("nomes sugeridos são compatíveis com caminhos Windows", () => {
  assert.equal(safeName("João / Cliente: teste"), "Joao-Cliente-teste");
  assert.equal(safeName("CON"), "OS-CON");
  assert.equal(safeName("../../"), "OS");
});

test("configuração persiste sem apagar solicitante ou demais dados da OS", async (t) => {
  const { directory, store } = await fixture(t);
  const d = draft();
  d.fields.solicitante = "Maria da recepção";
  await store.saveDraft(d);
  await store.saveSettings({ showSolicitante: false });
  const reopened = new Storage(directory);
  await reopened.open();
  assert.equal(reopened.getState().settings.showSolicitante, false);
  assert.equal(
    reopened.getState().draft.fields.solicitante,
    "Maria da recepção",
  );
  await reopened.saveSettings({ showSolicitante: true });
  assert.equal(reopened.getState().draft.fields.nome, "Cliente Teste");
});
test("estado e backup antigos migram sem exigir solicitante ou configuração", async (t) => {
  const { directory } = await fixture(t);
  await fs.writeFile(
    path.join(directory, "state.json"),
    JSON.stringify({
      format: 1,
      counter: { year: 2026, number: 3 },
      draft: draft(),
    }),
  );
  const store = new Storage(directory);
  await store.open();
  assert.equal(store.getState().settings.showSolicitante, true);
  assert.equal(store.getState().draft.fields.solicitante, "");
  assert.equal(validateDraft(draft()).fields.solicitante, "");
});
test("configuração inválida não altera a preferência salva", async (t) => {
  const { store } = await fixture(t);
  await store.saveSettings({ showSolicitante: false });
  assert.throws(() => store.saveSettings({ showSolicitante: "sim" }));
  assert.equal(store.getState().settings.showSolicitante, false);
});

test("tema escuro persiste junto da preferência de solicitante", async (t) => {
  const { directory, store } = await fixture(t);
  await store.saveDraft(draft());
  await store.saveSettings({ showSolicitante: false, theme: "dark" });
  const reopened = new Storage(directory);
  await reopened.open();
  assert.deepEqual(reopened.getState().settings, {
    showSolicitante: false,
    theme: "dark",
  });
  assert.equal(reopened.getState().draft.fields.nome, "Cliente Teste");
});
test("configuração da versão 4.2 recebe tema claro sem reativar solicitante", async (t) => {
  const { directory } = await fixture(t);
  await fs.writeFile(
    path.join(directory, "state.json"),
    JSON.stringify({
      format: 1,
      counter: { year: 2026, number: 5 },
      draft: draft(),
      settings: { showSolicitante: false },
    }),
  );
  const reopened = new Storage(directory);
  await reopened.open();
  assert.deepEqual(reopened.getState().settings, {
    showSolicitante: false,
    theme: "light",
  });
});
test("tema inválido e falha de gravação não substituem a preferência anterior", async (t) => {
  const { store } = await fixture(t);
  await store.saveSettings({ showSolicitante: true, theme: "dark" });
  assert.throws(
    () => store.saveSettings({ showSolicitante: true, theme: "invalid" }),
    /Tema inválido/,
  );
  store.atomicWrite = async () => {
    throw Error("Disco indisponível");
  };
  await assert.rejects(
    store.saveSettings({ showSolicitante: false, theme: "light" }),
  );
  assert.deepEqual(store.getState().settings, {
    showSolicitante: true,
    theme: "dark",
  });
});

test("empresa e logo persistem após reinício sem alterar rascunho e contador", async (t) => {
  const { directory, store } = await fixture(t);
  await store.saveDraft(draft());
  const number = await store.nextNumber(new Date(2026, 10, 4));
  const company = { name: "Empresa Teste", legalName: "Teste Ltda", document: "00.000.000/0001-00", phone: "(31) 99999-0000", email: "teste@example.com", address: "Rua Teste, 1", logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1kAAAAASUVORK5CYII=" };
  await store.saveSettings({ showSolicitante: false, theme: "dark", company });
  const reopened = new Storage(directory);
  await reopened.open();
  assert.deepEqual(reopened.getState().settings.company, company);
  assert.equal(reopened.getState().draft.fields.nome, "Cliente Teste");
  assert.match(await reopened.nextNumber(new Date(2026, 10, 4)), /OS-2026-0002-/);
  await reopened.saveSettings({ showSolicitante: false, theme: "dark", company: {...company, logo: ""} });
  assert.equal(reopened.getState().settings.company.logo, "");
});
test("logo externa, texto excessivo e dados malformados são rejeitados sem perder a configuração", async (t) => {
  const { store } = await fixture(t);
  const settings = {showSolicitante: true, theme: "light", company:{name:"Teste"}};
  await store.saveSettings(settings);
  for (const company of [{logo:"https://example.com/logo.png"}, {name:"a".repeat(121)}, {logo:"data:image/svg+xml;base64,AAAA"}, []]) {
    assert.throws(() => store.saveSettings({...settings, company}));
  }
  assert.equal(store.getState().settings.company.name, "Teste");
});
