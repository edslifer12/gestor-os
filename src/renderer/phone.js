/* Shared by the renderer and the main process. No access to filesystem or Electron. */
(function (root) {
  "use strict";
  function digits(value) {
    let result = String(value || "").replace(/\D/g, "");
    if (
      (result.length === 12 || result.length === 13) &&
      result.startsWith("55")
    )
      result = result.slice(2);
    return result;
  }
  function format(value) {
    const number = digits(value);
    if (!number) return "";
    // Do not silently discard pasted digits: keep the invalid value available for correction.
    if (number.length > 11) return number;
    if (number.length < 3) return "(" + number;
    const local = number.slice(2),
      split = number.length > 10 ? 5 : 4;
    return (
      "(" +
      number.slice(0, 2) +
      ") " +
      local.slice(0, split) +
      (local.length > split ? "-" + local.slice(split) : "")
    );
  }
  function valid(value) {
    const number = digits(value);
    return !number || /^[1-9]\d{9,10}$/.test(number);
  }
  function apply(input) {
    const before = input.value;
    const cursor = input.selectionStart;
    const digitPosition = before
      .slice(0, cursor ?? before.length)
      .replace(/\D/g, "").length;
    const formatted = format(before);
    input.value = formatted;
    if (
      document.activeElement === input &&
      cursor !== null &&
      before !== formatted
    ) {
      let position = 0,
        seen = 0;
      while (position < formatted.length && seen < digitPosition) {
        if (/\d/.test(formatted[position])) seen++;
        position++;
      }
      // For country-code normalization, retain the cursor at the end of a pasted number.
      if (cursor === before.length) position = formatted.length;
      input.setSelectionRange(position, position);
    }
    input.setCustomValidity(
      valid(input.value)
        ? ""
        : "Informe DDD e telefone: (31) 99999-9999 ou (31) 3333-3333.",
    );
  }
  const api = Object.freeze({ digits, format, valid, apply });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BPSPhone = api;
})(typeof globalThis === "object" ? globalThis : this);
