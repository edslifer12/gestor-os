"use strict";
const phone = require("../renderer/phone");
const MAX_BYTES = 3 * 1024 * 1024;
const FIELD_LIMITS = Object.freeze({
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
});
function validateDraft(input) {
  if (
    !input ||
    input.version !== 3 ||
    !input.fields ||
    typeof input.fields !== "object" ||
    !Array.isArray(input.servicos) ||
    input.servicos.length < 1 ||
    input.servicos.length > 100
  )
    throw Error("Formato de rascunho ou backup inválido.");
  const fields = {};
  for (const [name, limit] of Object.entries(FIELD_LIMITS)) {
    const value =
      name === "solicitante" ? (input.fields[name] ?? "") : input.fields[name];
    if (typeof value !== "string" || value.length > limit)
      throw Error("Campo inválido no rascunho: " + name);
    fields[name] = value;
  }
  const servicos = input.servicos.map((item) => {
    if (
      !item ||
      typeof item.descricao !== "string" ||
      item.descricao.length > 10000 ||
      typeof item.qtd !== "string" ||
      item.qtd.length > 20 ||
      typeof item.valor !== "string" ||
      item.valor.length > 20
    )
      throw Error("Serviço inválido no rascunho.");
    return { descricao: item.descricao, qtd: item.qtd, valor: item.valor };
  });
  const result = {
    version: 3,
    fields,
    servicos,
    savedAt: new Date().toISOString(),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES)
    throw Error("O rascunho excede o limite de 3 MB.");
  return result;
}
function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw Error("Informe valores com até duas casas decimais.");
  return Math.round(Number(value) * 100);
}
function validateInvoice(input) {
  const draft = validateDraft(input),
    f = draft.fields;
  if (!phone.valid(f.telefone))
    throw Error(
      "Confira o telefone brasileiro com DDD ou deixe o campo vazio.",
    );
  if (!f.nome.trim() || !f.numeroOS.trim())
    throw Error("Informe cliente e número da OS.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data))
    throw Error("Informe a data do serviço.");
  const parsed = new Date(f.data + "T12:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== f.data
  )
    throw Error("Data do serviço inválida.");
  let subtotal = 0;
  for (const item of draft.servicos) {
    const quantity = Number(item.qtd),
      price = cents(item.valor);
    if (
      !item.descricao.trim() ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 9999 ||
      price > 99999999
    )
      throw Error("Verifique descrição, quantidade e valor dos serviços.");
    subtotal += quantity * price;
  }
  const discount = cents(f.desconto || "0");
  if (discount > subtotal)
    throw Error("O desconto não pode superar o subtotal.");
  return { draft, subtotal, discount, total: subtotal - discount };
}
function safeName(text) {
  // Windows also rejects device names such as CON and NUL.
  const clean =
    String(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "OS";
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(clean)
    ? "OS-" + clean
    : clean;
}
module.exports = { validateDraft, validateInvoice, safeName, MAX_BYTES };
