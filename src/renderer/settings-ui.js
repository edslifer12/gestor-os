"use strict";
function companyContact(company = {}) {
  return [company.legalName, company.document && "CPF/CNPJ: " + company.document,
    company.phone && "Telefone: " + company.phone, company.email, company.address].filter(Boolean).join(" | ");
}
window.addEventListener("DOMContentLoaded", () => {
  let pendingLogo = "";
  const companyKeys = ["name", "legalName", "document", "phone", "email", "address"];
  function preview() {
    $("logoPreview").hidden = !pendingLogo;
    if (pendingLogo) $("logoPreview").src = pendingLogo;
    else $("logoPreview").removeAttribute("src");
  }
  function apply(settings) {
    appSettings = {
      showSolicitante: settings.showSolicitante !== false,
      company: settings.company || {},
      theme: settings.theme === "dark" ? "dark" : "light",
    };
    const company = appSettings.company;
    const name = company.name || company.legalName || "Sua empresa";
    $("companyBrand").textContent = name;
    $("companyBrand").hidden = !!company.logo;
    $("companyLogo").hidden = !company.logo;
    if (company.logo) $("companyLogo").src = company.logo;
    else $("companyLogo").removeAttribute("src");
    $("companyLogo").alt = "Logo de " + name;
    $("companyFooter").textContent = name;
    $("companyContact").textContent = companyContact(company);
    companyKeys.forEach(key => $("company_" + key).value = company[key] || "");
    pendingLogo = company.logo || "";
    preview();
    document.documentElement.dataset.theme = appSettings.theme;
    $("themeSelect").value = appSettings.theme;
    $("showSolicitante").checked = appSettings.showSolicitante;
    $("solicitanteGroup").hidden = !appSettings.showSolicitante;
    if ($("print-document").childElementCount) buildDocument();
  }
  $("tabSettings").addEventListener("click", () => {
    if (busy) return;
    window.bpsClientsUI.setTab(false);
    $("osPanel").hidden = true;
    $("settingsPanel").hidden = false;
    $("tabOS").classList.remove("active");
    $("tabOS").removeAttribute("aria-current");
    $("tabSettings").classList.add("active");
    $("tabSettings").setAttribute("aria-current", "page");
    $("pageTitle").textContent = "Configurações";
  });
  function savePreference(company = appSettings.company) {
    const next = {
      company,
      showSolicitante: $("showSolicitante").checked,
      theme: $("themeSelect").value,
    };
    if (busy) {
      apply(appSettings);
      return;
    }
    runBusy(async () => {
      $("settingsStatus").textContent = "Salvando configuração…";
      try {
        const saved = await request("saveSettings", next);
        apply(saved);
        $("settingsStatus").textContent =
          "Configuração salva neste computador.";
      } catch (error) {
        apply(appSettings);
        $("settingsStatus").textContent =
          "Não foi possível salvar: " + error.message;
      }
    });
  }
  $("showSolicitante").addEventListener("change", () => savePreference());
  $("themeSelect").addEventListener("change", () => savePreference());
  $("companyForm").addEventListener("submit", event => {
    event.preventDefault();
    const company = Object.fromEntries(companyKeys.map(key => [key, $("company_" + key).value.trim()]));
    company.logo = pendingLogo;
    savePreference(company);
  });
  $("chooseLogo").addEventListener("click", () => runBusy(async () => {
    try {
      const result = await request("chooseLogo");
      if (!result.canceled) {
        pendingLogo = result.logo;
        preview();
        $("settingsStatus").textContent = "Logo selecionada. Clique em Salvar dados da empresa para aplicar.";
      }
    } catch(error) { $("settingsStatus").textContent = error.message; }
  }));
  $("removeLogo").addEventListener("click", () => {
    if (busy) return;
    pendingLogo = "";
    preview();
    $("settingsStatus").textContent = "Clique em Salvar dados da empresa para confirmar a remoção da logo.";
  });
  window.bpsSettingsUI = { apply };
});
