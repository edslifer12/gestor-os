"use strict";
window.addEventListener("DOMContentLoaded", () => {
  let editingId = null,
    selectedId = null,
    available = true;
  let pageOffset = 0,
    listToken = 0,
    searchToken = 0,
    searchTimer,
    listTimer;
  let results = [],
    active = -1;
  const clientIds = {
    nome: "clienteNome",
    telefone: "clienteTelefone",
    endereco: "clienteEndereco",
    bairro: "clienteBairro",
    cidade: "clienteCidade",
  };
  function notify(text) {
    $("clientesMessage").textContent = text;
  }
  function hideSuggestions() {
    searchToken++;
    clearTimeout(searchTimer);
    results = [];
    active = -1;
    $("clienteSugestoes").hidden = true;
    $("clienteSugestoes").replaceChildren();
    $("nome").setAttribute("aria-expanded", "false");
    $("nome").removeAttribute("aria-activedescendant");
  }
  function clearSelection() {
    selectedId = null;
    hideSuggestions();
    $("clienteSelecionado").textContent =
      "Digite o nome para buscar um cliente cadastrado ou preencha um novo atendimento.";
  }
  function setTab(clientsTab) {
    $("settingsPanel").hidden = true;
    $("tabSettings").classList.remove("active");
    $("tabSettings").removeAttribute("aria-current");
    hideSuggestions();
    $("osPanel").hidden = clientsTab;
    $("clientsPanel").hidden = !clientsTab;
    $("tabOS").classList.toggle("active", !clientsTab);
    $("tabClientes").classList.toggle("active", clientsTab);
    $("tabOS").toggleAttribute("aria-current", !clientsTab);
    $("tabClientes").toggleAttribute("aria-current", clientsTab);
    if (clientsTab) $("tabClientes").setAttribute("aria-current", "page");
    else $("tabOS").setAttribute("aria-current", "page");
    $("pageTitle").textContent = clientsTab ? "Clientes" : "Ordem de serviço";
    if (clientsTab) loadClients();
  }
  function selectClient(client) {
    for (const name of Object.keys(clientIds)) $(name).value = client[name];
    BPSPhone.apply($("telefone"));
    selectedId = client.id;
    hideSuggestions();
    $("clienteSelecionado").textContent =
      "Cliente selecionado: " +
      client.nome +
      ". Os dados foram copiados para esta OS.";
    calculate();
    scheduleSave();
  }
  function highlight(index) {
    active = index;
    Array.from($("clienteSugestoes").children).forEach((option, i) =>
      option.setAttribute("aria-selected", String(i === index)),
    );
    if (index >= 0) {
      const option = $("clienteSugestoes").children[index];
      $("nome").setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else $("nome").removeAttribute("aria-activedescendant");
  }
  async function suggest() {
    const query = $("nome").value.trim(),
      token = ++searchToken;
    if (!available || !query) {
      hideSuggestions();
      return;
    }
    try {
      const response = await request("listClients", {
        query,
        prefix: true,
        limit: 8,
        offset: 0,
      });
      if (token !== searchToken || $("osPanel").hidden || busy) return;
      results = response.items;
      active = -1;
      const panel = $("clienteSugestoes");
      panel.replaceChildren();
      results.forEach((client, index) => {
        const option = node("div", undefined, "suggestion");
        option.id = "cliente-option-" + index;
        option.role = "option";
        option.setAttribute("aria-selected", "false");
        option.append(
          node("strong", client.nome),
          node(
            "span",
            [client.telefone, client.cidade, client.endereco]
              .filter(Boolean)
              .join(" · ") || "Sem telefone e endereço",
          ),
        );
        option.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          selectClient(client);
        });
        panel.append(option);
      });
      if (!results.length) {
        hideSuggestions();
        $("clienteSelecionado").textContent =
          "Nenhum cadastro encontrado. Você pode preencher o atendimento normalmente.";
        return;
      }
      panel.hidden = false;
      $("nome").setAttribute("aria-expanded", "true");
    } catch (error) {
      hideSuggestions();
      $("clienteSelecionado").textContent =
        "Não foi possível consultar os clientes: " + error.message;
    }
  }
  function resetClientForm() {
    editingId = null;
    $("clientForm").reset();
    $("clienteTelefone").setCustomValidity("");
    $("clientFormTitle").textContent = "Novo cliente";
    $("btnSalvarCliente").textContent = "Cadastrar cliente";
    $("btnCancelarCliente").textContent = "Limpar";
  }
  function editClient(client) {
    editingId = client.id;
    for (const [key, id] of Object.entries(clientIds))
      $(id).value = client[key];
    BPSPhone.apply($("clienteTelefone"));
    $("clientFormTitle").textContent = "Editar cliente";
    $("btnSalvarCliente").textContent = "Salvar alterações";
    $("btnCancelarCliente").textContent = "Cancelar edição";
    $("clienteNome").focus();
    notify("Editando o cadastro de " + client.nome + ".");
  }
  async function clientAction(task) {
    if (busy) return;
    busy = true;
    $("clientForm").inert = true;
    $("osForm").inert = true;
    $("clientRows").inert = true;
    try {
      return await task();
    } catch (error) {
      notify(error.message);
    } finally {
      busy = false;
      $("clientForm").inert = false;
      $("osForm").inert = !initialized;
      $("clientRows").inert = false;
    }
  }
  async function loadClients() {
    if (!available) {
      notify(
        "Cadastro indisponível. Confira a mensagem de inicialização do aplicativo.",
      );
      return;
    }
    const token = ++listToken;
    try {
      const response = await request("listClients", {
        query: $("buscaClientes").value,
        offset: pageOffset,
        limit: 25,
        prefix: false,
      });
      if (token !== listToken) return;
      if (pageOffset > 0 && !response.items.length) {
        pageOffset = Math.max(0, pageOffset - 25);
        return loadClients();
      }
      $("clientRows").replaceChildren();
      response.items.forEach((client) => {
        const tr = node("tr"),
          nameCell = node("td"),
          contact = node("td"),
          actions = node("td", undefined, "table-actions");
        nameCell.append(
          node("strong", client.nome),
          node(
            "span",
            [client.endereco, client.bairro].filter(Boolean).join(" · "),
            "cell-detail",
          ),
        );
        contact.append(
          node("span", client.telefone || "Sem telefone"),
          node("span", client.cidade, "cell-detail"),
        );
        const use = node("button", "Usar na OS", "button outline small");
        use.type = "button";
        use.addEventListener("click", () => {
          selectClient(client);
          setTab(false);
        });
        const edit = node("button", "Editar", "button plain small");
        edit.type = "button";
        edit.setAttribute("aria-label", "Editar " + client.nome);
        edit.addEventListener("click", () => editClient(client));
        const remove = node("button", "Excluir", "button danger small");
        remove.type = "button";
        remove.setAttribute("aria-label", "Excluir " + client.nome);
        remove.addEventListener("click", () =>
          clientAction(async () => {
            const result = await request("deleteClient", client.id);
            if (result.canceled) return;
            if (editingId === client.id) resetClientForm();
            if (selectedId === client.id) {
              selectedId = null;
              $("clienteSelecionado").textContent =
                "Cadastro excluído. Os dados deste atendimento foram mantidos.";
            }
            notify("Cliente excluído.");
            await loadClients();
          }),
        );
        actions.append(use, edit, remove);
        tr.append(nameCell, contact, actions);
        $("clientRows").append(tr);
      });
      if (!response.items.length) {
        const row = node("tr"),
          cell = node("td", "Nenhum cliente encontrado.");
        cell.colSpan = 3;
        row.append(cell);
        $("clientRows").append(row);
      }
      $("clientCount").textContent =
        response.total + " cliente(s) encontrado(s).";
      $("clientPage").textContent = response.total
        ? pageOffset +
          1 +
          "–" +
          Math.min(pageOffset + 25, response.total) +
          " de " +
          response.total
        : "";
      $("clientesAnterior").disabled = pageOffset === 0;
      $("clientesProximo").disabled = pageOffset + 25 >= response.total;
    } catch (error) {
      notify(error.message);
    }
  }
  $("nome").parentElement.classList.add("name-search");
  $("nome").addEventListener("input", () => {
    if (selectedId) {
      ["telefone", "endereco", "bairro", "cidade"].forEach(
        (id) => ($(id).value = ""),
      );
    }
    selectedId = null;
    hideSuggestions();
    $("clienteSelecionado").textContent = "Buscando clientes cadastrados…";
    searchTimer = setTimeout(suggest, 150);
  });
  $("nome").addEventListener("focus", () => {
    if ($("nome").value.trim()) suggest();
  });
  $("nome").addEventListener("keydown", (event) => {
    if ($("clienteSugestoes").hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hideSuggestions();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight(Math.min(active + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight(Math.max(0, active - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0) selectClient(results[active]);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".name-search")) hideSuggestions();
  });
  $("nome").addEventListener("blur", () => setTimeout(hideSuggestions, 150));
  ["telefone", "endereco", "bairro", "cidade"].forEach((id) =>
    $(id).addEventListener("input", () => {
      if (selectedId) {
        selectedId = null;
        $("clienteSelecionado").textContent =
          "Dados personalizados para este atendimento. O cadastro original foi mantido.";
      }
    }),
  );
  $("tabOS").addEventListener("click", () => {
    if (!busy) setTab(false);
  });
  $("tabClientes").addEventListener("click", () => {
    if (!busy) setTab(true);
  });
  $("clienteTelefone").addEventListener("input", (event) =>
    BPSPhone.apply(event.target),
  );
  $("clienteNome").addEventListener("input", (event) =>
    event.target.setCustomValidity(""),
  );
  $("clientForm").addEventListener("submit", (event) => {
    event.preventDefault();
    BPSPhone.apply($("clienteTelefone"));
    $("clienteNome").setCustomValidity(
      $("clienteNome").value.trim() ? "" : "Informe o nome do cliente.",
    );
    if (!$("clientForm").reportValidity()) return;
    clientAction(async () => {
      const data = Object.fromEntries(
        Object.entries(clientIds).map(([key, id]) => [key, $(id).value]),
      );
      const wasEditing = Boolean(editingId);
      if (editingId) await request("updateClient", editingId, data);
      else await request("createClient", data);
      resetClientForm();
      notify(
        wasEditing
          ? "Cadastro atualizado. Os dados da OS em andamento foram mantidos."
          : "Cliente cadastrado.",
      );
      pageOffset = 0;
      await loadClients();
    });
  });
  $("btnCancelarCliente").addEventListener("click", () => {
    resetClientForm();
    notify("");
  });
  $("buscaClientes").addEventListener("input", () => {
    pageOffset = 0;
    listToken++;
    clearTimeout(listTimer);
    listTimer = setTimeout(loadClients, 180);
  });
  $("clientesAnterior").addEventListener("click", () => {
    pageOffset = Math.max(0, pageOffset - 25);
    loadClients();
  });
  $("clientesProximo").addEventListener("click", () => {
    pageOffset += 25;
    loadClients();
  });
  window.bpsClientsUI = {
    clearSelection,
    setAvailable: (value) => {
      available = value;
      $("clientForm").inert = !value;
    },
    setTab,
  };
});
