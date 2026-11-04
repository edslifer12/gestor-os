"use strict";
const desktop = window.bpsDesktop;
let appSettings = { showSolicitante: true, theme: "light" };
const FIELD_IDS = [
  "solicitante",
  "numeroOS",
  "data",
  "nome",
  "telefone",
  "endereco",
  "bairro",
  "cidade",
  "tipo",
  "modelo",
  "defeito",
  "obs",
  "desconto",
];
const $ = (id) => document.getElementById(id);
const money = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
let saveTimer;
let revision = 0;
let busy = false;
let initialized = false;

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
async function request(method, ...args) {
  if (!desktop)
    throw Error(
      "Abra o aplicativo pelo atalho instalado ou pelo comando npm start.",
    );
  const result = await desktop[method](...args);
  if (!result || !result.ok)
    throw Error(result?.error || "Não foi possível concluir a operação.");
  return result.value;
}
async function runBusy(task) {
  if (busy) return;
  busy = true;
  $("osForm").inert = true;
  $("clientsPanel").inert = true;
  $("settingsPanel").inert = true;
  try {
    return await task();
  } catch (error) {
    showMessage(error.message);
  } finally {
    busy = false;
    $("osForm").inert = !initialized;
    $("clientsPanel").inert = !initialized;
    $("settingsPanel").inert = !initialized;
  }
}
function amountCents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return NaN;
  return Math.round(Number(value) * 100);
}
function addService(item = { descricao: "", qtd: "1", valor: "" }) {
  if ($("containerServicos").children.length >= 100) {
    showMessage("Limite de 100 serviços por OS.");
    return;
  }
  const row = document.createElement("div");
  row.className = "service-row";
  row.innerHTML =
    '<div class="description"><label>Descrição *</label><textarea class="descricao" required maxlength="10000" placeholder="Descreva o serviço realizado"></textarea></div><div><label>Qtd. *</label><input class="qtd" type="number" required min="1" max="9999" step="1" inputmode="numeric"></div><div><label>Valor (R$) *</label><input class="valor" type="number" required min="0" max="999999.99" step="0.01" inputmode="decimal" placeholder="0,00"></div><div><label>Subtotal</label><output class="subtotal">R$ 0,00</output></div><button type="button" class="remove" title="Remover serviço">×</button>';
  row.querySelector(".descricao").value = item.descricao;
  row.querySelector(".qtd").value = item.qtd;
  row.querySelector(".valor").value = item.valor;
  $("containerServicos").append(row);
  renumber();
  calculate();
  return row;
}
function renumber() {
  document.querySelectorAll(".service-row").forEach((row, index) => {
    ["descricao", "qtd", "valor"].forEach((key) => {
      const input = row.querySelector("." + key);
      input.id = `servico-${index + 1}-${key}`;
      input.previousElementSibling.htmlFor = input.id;
      input.setAttribute(
        "aria-label",
        `${input.previousElementSibling.textContent} — serviço ${index + 1}`,
      );
    });
    row
      .querySelector("output")
      .setAttribute("aria-label", `Subtotal do serviço ${index + 1}`);
    row
      .querySelector(".remove")
      .setAttribute("aria-label", `Remover serviço ${index + 1}`);
  });
}
function calculate() {
  let subtotal = 0;
  const rows = document.querySelectorAll(".service-row");
  rows.forEach((row) => {
    const quantity = Number(row.querySelector(".qtd").value);
    const priceField = row.querySelector(".valor");
    const cents = amountCents(priceField.value);
    priceField.setCustomValidity(
      priceField.value && !Number.isFinite(cents)
        ? "Informe um valor com até duas casas decimais, sem notação científica."
        : "",
    );
    const valid =
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      quantity <= 9999 &&
      Number.isFinite(cents) &&
      cents <= 99999999;
    const value = valid ? quantity * cents : 0;
    row.querySelector("output").textContent = money(value);
    subtotal += value;
  });
  const discountField = $("desconto");
  const discount = amountCents(discountField.value || "0");
  discountField.setCustomValidity(
    !Number.isFinite(discount)
      ? "Informe um desconto com até duas casas decimais."
      : discount > subtotal
        ? "O desconto não pode superar o subtotal dos serviços."
        : "",
  );
  $("quantidadeServicos").textContent = rows.length;
  $("subtotalGeral").textContent = money(subtotal);
  $("total").textContent = money(
    Math.max(0, subtotal - (Number.isFinite(discount) ? discount : 0)),
  );
  return { subtotal, discount, total: subtotal - discount };
}
function snapshot() {
  const fields = Object.fromEntries(FIELD_IDS.map((id) => [id, $(id).value]));
  const servicos = Array.from(
    document.querySelectorAll(".service-row"),
    (row) => ({
      descricao: row.querySelector(".descricao").value,
      qtd: row.querySelector(".qtd").value,
      valor: row.querySelector(".valor").value,
    }),
  );
  return { version: 3, fields, servicos, savedAt: new Date().toISOString() };
}
function showMessage(message) {
  $("message").textContent = message;
}
async function saveDraft() {
  clearTimeout(saveTimer);
  if (!initialized) return false;
  const savedRevision = revision;
  try {
    await request("saveDraft", snapshot());
    if (savedRevision === revision)
      $("saveStatus").textContent =
        "Rascunho salvo neste computador às " +
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }) +
        ".";
    return true;
  } catch (error) {
    $("saveStatus").textContent =
      "Falha ao salvar. Exporte um backup para preservar o preenchimento.";
    showMessage(error.message);
    return false;
  }
}
function scheduleSave() {
  revision++;
  $("saveStatus").textContent = "Salvando rascunho…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 350);
}
function checkDraft(value) {
  if (
    !value ||
    value.version !== 3 ||
    !value.fields ||
    typeof value.fields !== "object" ||
    !Array.isArray(value.servicos) ||
    value.servicos.length < 1 ||
    value.servicos.length > 100
  )
    throw Error("Formato de backup inválido.");
  value.fields.solicitante ??= "";
  const limits = {
    solicitante: 180,
    numeroOS: 60,
    data: 10,
    nome: 180,
    telefone: 30,
    endereco: 240,
    bairro: 100,
    cidade: 100,
    tipo: 100,
    modelo: 180,
    defeito: 6000,
    obs: 12000,
    desconto: 20,
  };
  for (const id of FIELD_IDS)
    if (
      typeof value.fields[id] !== "string" ||
      value.fields[id].length > limits[id]
    )
      throw Error("Campos de backup inválidos.");
  for (const item of value.servicos)
    if (
      !item ||
      typeof item.descricao !== "string" ||
      item.descricao.length > 10000 ||
      typeof item.qtd !== "string" ||
      item.qtd.length > 20 ||
      typeof item.valor !== "string" ||
      item.valor.length > 20
    )
      throw Error("Serviços de backup inválidos.");
  return value;
}
function restore(value) {
  checkDraft(value);
  FIELD_IDS.forEach((id) => ($(id).value = value.fields[id]));
  $("containerServicos").replaceChildren();
  value.servicos.forEach(addService);
  BPSPhone.apply($("telefone"));
  calculate();
}
async function resetForm() {
  const number = await request("nextNumber");
  $("osForm").reset();
  $("numeroOS").value = number;
  $("data").value = localDate();
  $("containerServicos").replaceChildren();
  addService();
  window.bpsClientsUI?.clearSelection();
  revision++;
  showMessage("");
  await saveDraft();
}
async function downloadBackup() {
  const result = await request("exportBackup", snapshot());
  showMessage(
    result.canceled
      ? "Exportação de backup cancelada."
      : "Backup salvo: " + result.fileName,
  );
}
function safeName(text) {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "OS"
  );
}
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function pdfSection(title) {
  const section = node("section", undefined, "pdf-section");
  section.append(node("h2", title));
  return section;
}
function appendData(section, entries) {
  const dl = node("dl", undefined, "pdf-data");
  entries.forEach(([title, value]) => {
    if (!value.trim()) return;
    const pair = node("div");
    pair.append(node("dt", title), node("dd", value.trim()));
    dl.append(pair);
  });
  section.append(dl);
}
function buildDocument() {
  const draft = snapshot();
  const f = draft.fields;
  const totals = calculate();
  const output = $("print-document");
  output.replaceChildren();
  const header = node("header", undefined, "pdf-header");
  const brand = document.querySelector(".brand-art").cloneNode(true);
  brand.querySelectorAll("[hidden]").forEach(element => element.remove());
  brand.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
  header.append(brand);
  const title = node("div", undefined, "pdf-title");
  title.append(node("h1", "ORDEM DE SERVIÇO"), node("p", f.numeroOS));
  title.append(node("p", "Data: " + f.data.split("-").reverse().join("/")));
  header.append(title);
  output.append(header);
  output.append(
    node(
      "div",
      companyContact(appSettings.company),
      "pdf-contact",
    ),
  );
  const client = pdfSection("Dados do cliente");
  appendData(client, [
    ["Cliente:", f.nome],
    ["Telefone:", f.telefone],
    ["Endereço:", f.endereco],
    ["Bairro:", f.bairro],
    ["Cidade:", f.cidade],
  ]);
  if (appSettings.showSolicitante && f.solicitante.trim())
    appendData(client, [["Solicitante:", f.solicitante]]);
  output.append(client);
  if ([f.tipo, f.modelo, f.defeito].some((v) => v.trim())) {
    const equip = pdfSection("Equipamento");
    appendData(equip, [
      ["Tipo:", f.tipo],
      ["Marca / modelo:", f.modelo],
      ["Defeito relatado:", f.defeito],
    ]);
    output.append(equip);
  }
  const services = pdfSection("Serviços prestados");
  const table = node("table", undefined, "pdf-table");
  const cols = node("colgroup");
  ["53%", "9%", "19%", "19%"].forEach((width) => {
    const col = node("col");
    col.style.width = width;
    cols.append(col);
  });
  table.append(cols);
  const thead = node("thead");
  const headings = node("tr");
  ["Descrição", "Qtd.", "Valor unitário", "Subtotal"].forEach((text) => {
    const th = node("th", text);
    th.scope = "col";
    headings.append(th);
  });
  thead.append(headings);
  table.append(thead);
  const tbody = node("tbody");
  draft.servicos.forEach((item) => {
    const cents = amountCents(item.valor),
      quantity = Number(item.qtd);
    const tr = node(
      "tr",
      undefined,
      item.descricao.length > 1200 ? "long-row" : undefined,
    );
    [
      item.descricao.trim(),
      item.qtd || "—",
      Number.isFinite(cents) ? money(cents) : "—",
      Number.isFinite(cents) && quantity > 0 ? money(quantity * cents) : "—",
    ].forEach((text) => tr.append(node("td", text)));
    tbody.append(tr);
  });
  table.append(tbody);
  services.append(table);
  output.append(services);
  const summary = node("div", undefined, "pdf-totals");
  [
    ["Subtotal:", totals.subtotal],
    ["Desconto:", totals.discount],
    ["TOTAL:", totals.total],
  ].forEach(([label, cents], index) => {
    const line = node(
      "div",
      undefined,
      index === 2 ? "grand-total" : undefined,
    );
    line.append(node("span", label), node("strong", money(cents)));
    summary.append(line);
  });
  output.append(summary);
  if (f.obs.trim()) {
    const obs = pdfSection("Observações");
    obs.append(node("p", f.obs.trim(), "pdf-observations"));
    output.append(obs);
  }
  const signatures = node("div", undefined, "pdf-signatures");
  signatures.append(node("div", "Responsável técnico"), node("div", "Cliente"));
  output.append(signatures);
  output.append(
    node("footer", (appSettings.company?.name || appSettings.company?.legalName || "Sua empresa") + " • " + f.numeroOS, "pdf-footer"),
  );
  return output;
}
async function generatePDF(event) {
  BPSPhone.apply($("telefone"));
  event.preventDefault();
  calculate();
  document
    .querySelectorAll(".descricao")
    .forEach((input) =>
      input.setCustomValidity(
        input.value.trim() ? "" : "Informe a descrição do serviço.",
      ),
    );
  $("nome").setCustomValidity(
    $("nome").value.trim() ? "" : "Informe o nome do cliente.",
  );
  $("numeroOS").setCustomValidity(
    $("numeroOS").value.trim() ? "" : "Informe o número da OS.",
  );
  if (!$("osForm").reportValidity()) return;
  await runBusy(async () => {
    clearTimeout(saveTimer);
    await saveDraft();
    buildDocument();
    await Promise.all(
      Array.from($("print-document").querySelectorAll("img"), (img) =>
        img.decode(),
      ),
    );
    const result = await request("exportPDF", snapshot());
    showMessage(
      result.canceled
        ? "Exportação de PDF cancelada."
        : "PDF salvo: " + result.fileName,
    );
  });
}
window.addEventListener("DOMContentLoaded", async () => {
  if (desktop)
    desktop.onCloseRequested(async () => {
      clearTimeout(saveTimer);
      try {
        await request("finishClose", initialized ? snapshot() : null);
      } catch (error) {
        showMessage(error.message);
      }
    });
  $("osForm").addEventListener("submit", generatePDF);
  $("osForm").addEventListener("input", (event) => {
    event.target.setCustomValidity?.("");
    if (event.target.id === "telefone") BPSPhone.apply(event.target);
    calculate();
    scheduleSave();
  });
  $("btnAdicionar").addEventListener("click", () => {
    const row = addService();
    if (row) row.querySelector("textarea").focus();
    scheduleSave();
  });
  $("containerServicos").addEventListener("click", (event) => {
    const button = event.target.closest(".remove");
    if (!button) return;
    runBusy(async () => {
      const row = button.closest(".service-row");
      const hasContent =
        row.querySelector(".descricao").value.trim() ||
        row.querySelector(".valor").value !== "";
      if (hasContent && !(await request("confirm", "remove-service"))) return;
      row.remove();
      if (!$("containerServicos").children.length) addService();
      renumber();
      calculate();
      scheduleSave();
    });
  });
  $("btnSalvar").addEventListener("click", () => runBusy(saveDraft));
  $("btnNova").addEventListener("click", () =>
    runBusy(async () => {
      if (await request("confirm", "new-order")) await resetForm();
    }),
  );
  $("btnExportar").addEventListener("click", () => runBusy(downloadBackup));
  $("btnPastaDados").addEventListener("click", () =>
    runBusy(() => request("openDataFolder")),
  );
  $("btnImportar").addEventListener("click", () =>
    runBusy(async () => {
      const result = await request("importBackup");
      if (result.canceled) return;
      const parsed = checkDraft(result.draft);
      if (!(await request("confirm", "restore-backup"))) return;
      restore(parsed);
      revision++;
      await saveDraft();
      showMessage("Backup restaurado. Confira os dados antes de emitir o PDF.");
    }),
  );
  try {
    const state = await request("getState");
    window.bpsSettingsUI?.apply(state.settings || { showSolicitante: true });
    window.bpsClientsUI?.setAvailable(!state.clientsError);
    if (state.draft) {
      restore(state.draft);
      $("saveStatus").textContent = "Rascunho recuperado deste computador.";
    } else {
      $("numeroOS").value = await request("nextNumber");
      $("data").value = localDate();
      addService();
    }
    initialized = true;
    $("osForm").inert = false;
    showMessage(
      [
        state.warning,
        state.clientsError
          ? "Cadastro de clientes indisponível: " + state.clientsError
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (!state.draft) await saveDraft();
  } catch (error) {
    showMessage(error.message + " Nenhum rascunho foi sobrescrito.");
    $("osForm").inert = true;
  }
});
