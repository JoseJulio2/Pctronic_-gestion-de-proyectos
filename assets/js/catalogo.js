// ============================================================================
// Módulo genérico de catálogo (Clientes / Contratistas / Proveedores).
// Cada página define window.CATALOGO_CONFIG antes de cargar este archivo:
//   { tabla: 'clientes', titulo: 'Clientes', campos: [{key,label,tipo,requerido}] }
// ============================================================================

(async () => {
  await window.pctronicReady;

  const cfg = window.CATALOGO_CONFIG;
  let cache = [];
  let editandoId = null;

  function celdas(fila) {
    return cfg.campos
      .map((c) => `<td class="px-4 py-3">${escapeHtml(fila[c.key] || "—")}</td>`)
      .join("");
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const filtrados = !texto
      ? cache
      : cache.filter((f) => cfg.campos.some((c) => (f[c.key] || "").toLowerCase().includes(texto)));

    const tbody = document.getElementById("tabla-catalogo");
    tbody.innerHTML = filtrados.length
      ? filtrados
          .map(
            (f) => `
        <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
          ${celdas(f)}
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button class="btn-editar text-gray-400 hover:text-primary" data-id="${f.id}" title="Editar">
              <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button class="btn-borrar text-gray-400 hover:text-red-600" data-id="${f.id}" title="Borrar">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="${cfg.campos.length + 1}">Sin registros todavía.</td></tr>`;

    tbody.querySelectorAll(".btn-editar").forEach((btn) =>
      btn.addEventListener("click", () => abrirModal(cache.find((f) => f.id === btn.dataset.id)))
    );
    tbody.querySelectorAll(".btn-borrar").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar este registro?")) return;
        const { error } = await window.sb.from(cfg.tabla).delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar (puede que esté en uso en algún proyecto)");
        cargar();
      })
    );
  }

  async function cargar() {
    const { data, error } = await window.sb.from(cfg.tabla).select("*").order(cfg.campos[0].key);
    if (error) return manejarError(error, "No se pudo cargar " + cfg.titulo.toLowerCase());
    cache = data || [];
    render();
  }

  function abrirModal(registro) {
    editandoId = registro?.id || null;
    document.getElementById("modal-titulo").textContent = registro ? `Editar ${cfg.titulo.slice(0, -1) || cfg.titulo}` : `Nuevo registro`;
    const cont = document.getElementById("modal-campos");
    cont.innerHTML = cfg.campos
      .map(
        (c) => `
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">${c.label}${c.requerido ? " *" : ""}</label>
        <input id="campo-${c.key}" type="${c.tipo || "text"}" ${c.requerido ? "required" : ""}
          class="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
          value="${escapeHtml(registro?.[c.key] || "")}" />
      </div>`
      )
      .join("");
    document.getElementById("modal-catalogo").classList.remove("hidden");
    document.getElementById("modal-catalogo").classList.add("flex");
  }

  function cerrarModal() {
    document.getElementById("modal-catalogo").classList.add("hidden");
    document.getElementById("modal-catalogo").classList.remove("flex");
  }

  document.getElementById("btn-nuevo").addEventListener("click", () => abrirModal(null));
  document.getElementById("modal-cancelar").addEventListener("click", cerrarModal);
  document.getElementById("filtro-busqueda").addEventListener("input", render);

  document.getElementById("modal-guardar").addEventListener("click", async () => {
    const payload = {};
    for (const c of cfg.campos) {
      payload[c.key] = document.getElementById(`campo-${c.key}`).value.trim() || null;
    }
    if (cfg.campos[0].requerido !== false && !payload[cfg.campos[0].key]) {
      return mostrarAviso(`El campo "${cfg.campos[0].label}" es obligatorio`, "error");
    }

    const query = editandoId
      ? window.sb.from(cfg.tabla).update(payload).eq("id", editandoId)
      : window.sb.from(cfg.tabla).insert(payload);

    const { error } = await query;
    if (error) return manejarError(error, "No se pudo guardar");
    cerrarModal();
    mostrarAviso("Guardado correctamente", "exito");
    cargar();
  });

  cargar();
})();
