const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function boot() {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", checked: false, childElementCount: 0, events: {},
      addEventListener(name, callback) { this.events[name] = callback; },
      removeAttribute(name) { delete this[name]; },
    });
    return elements.get(id);
  };
  let job;
  const calls = [];
  const context = {
    $, appSettings: {}, busy: false,
    document: { documentElement: { dataset: {} } },
    window: { addEventListener: (_name, callback) => callback() },
    runBusy: (task) => (job = task()),
    request: async (method, value) => {
      if (method === "chooseLogo") return { canceled: false, logo: "nova-logo" };
      calls.push(structuredClone(value));
      if (context.failSave) throw Error("Disco indisponível");
      return structuredClone(value);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/renderer/settings-ui.js"), "utf8"), context);
  context.window.bpsSettingsUI.apply({
    theme: "light", showSolicitante: true,
    company: { name: "Empresa salva", phone: "31999991234", logo: "logo-salva" },
  });
  return {
    $, calls, context,
    async fire(id, event = "change") {
      $(id).events[event]({ preventDefault() {} });
      await job;
    },
  };
}

test("mudar tema ou solicitante preserva campos e logo pendentes sem publicá-los", async () => {
  const b = boot();
  b.$("company_name").value = "Empresa em edição";
  b.$("company_phone").value = "31988881234";
  await b.fire("chooseLogo", "click");
  b.$("themeSelect").value = "dark";
  await b.fire("themeSelect");
  b.$("showSolicitante").checked = false;
  await b.fire("showSolicitante");
  assert.equal(b.$("company_name").value, "Empresa em edição");
  assert.equal(b.$("company_phone").value, "31988881234");
  assert.equal(b.$("logoPreview").src, "nova-logo");
  assert.equal(b.$("companyBrand").textContent, "Empresa salva");
  assert.equal(b.$("companyLogo").src, "logo-salva");
  assert.equal(b.context.document.documentElement.dataset.theme, "dark");
  assert.equal(b.$("solicitanteGroup").hidden, true);
  assert.ok(b.calls.every(call => call.company.name === "Empresa salva" && call.company.logo === "logo-salva"));
  await b.fire("companyForm", "submit");
  assert.equal(b.calls.at(-1).company.logo, "nova-logo");
  assert.equal(b.calls.at(-1).company.name, "Empresa em edição");
  assert.equal(b.$("companyBrand").textContent, "Empresa em edição");
  assert.equal(b.$("companyLogo").src, "nova-logo");
});

test("remoção pendente de logo sobrevive à mudança de tema até salvar a empresa", async () => {
  const b = boot();
  await b.fire("removeLogo", "click");
  b.$("themeSelect").value = "dark";
  await b.fire("themeSelect");
  assert.equal(b.$("logoPreview").hidden, true);
  assert.equal(b.$("companyLogo").src, "logo-salva");
  await b.fire("companyForm", "submit");
  assert.equal(b.calls.at(-1).company.logo, "");
  assert.equal(b.$("companyLogo").hidden, true);
  assert.equal(b.$("companyBrand").hidden, false);
});

test("falha ao salvar preferência ou empresa mantém edição para nova tentativa", async () => {
  const b = boot();
  b.$("company_name").value = "Nova empresa";
  await b.fire("chooseLogo", "click");
  b.context.failSave = true;
  b.$("themeSelect").value = "dark";
  await b.fire("themeSelect");
  assert.equal(b.$("themeSelect").value, "light");
  assert.equal(b.$("company_name").value, "Nova empresa");
  await b.fire("companyForm", "submit");
  assert.match(b.$("settingsStatus").textContent, /Disco indisponível/);
  assert.equal(b.$("company_name").value, "Nova empresa");
  assert.equal(b.$("logoPreview").src, "nova-logo");
  assert.equal(b.$("companyLogo").src, "logo-salva");
  b.context.failSave = false;
  await b.fire("companyForm", "submit");
  assert.equal(b.$("companyBrand").textContent, "Nova empresa");
  assert.equal(b.$("companyLogo").src, "nova-logo");
});

test("preferência bloqueada por operação em andamento preserva edição", async () => {
  const b = boot();
  b.$("company_name").value = "Edição pendente";
  await b.fire("chooseLogo", "click");
  b.context.busy = true;
  b.$("themeSelect").value = "dark";
  await b.fire("themeSelect");
  assert.equal(b.calls.length, 0);
  assert.equal(b.$("themeSelect").value, "light");
  assert.equal(b.$("company_name").value, "Edição pendente");
  assert.equal(b.$("logoPreview").src, "nova-logo");
});
