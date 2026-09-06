// ============================================================================
// Página de detalle con contactos múltiples (Clientes / Proveedores).
// Cada página define window.DETALLE_CONFIG antes de cargar este archivo:
//   {
//     tablaPadre: 'clientes', tablaHija: 'clientes_contactos', fk: 'cliente_id',
//     titulo: 'Cliente', volverHref: 'clientes.html',
//     tiposContacto: [{value, label}, ...],
//   }
// ============================================================================

(async () => {
  await window.pctronicReady;

  const cfg = window.DETALLE_CONFIG;
  const id = qs("id");
  let padre = null;
  let contactos = [];
  let editandoContactoId = null;

  if (!id) {
    window.location.href = cfg.volverHref;
    return;
  }

  async function cargarPadre() {
    const { data, error } = await window.sb.from(cfg.tablaPadre).select("*").eq("id", id).single();
    if (error || !data) {
      mostrarAviso(`No se encontró ${cfg.titulo.toLowerCase()}`, "error");
      window.location.href = cfg.volverHref;
      return;
    }
    padre = data;
    document.getElementById("detalle-nombre").textContent = padre.nombre;
    document.getElementById("campo-padre-nombre").value = padre.nombre || "";
    document.getElementById("campo-padre-nit").value = padre.nit || "";
    document.getElementById("campo-padre-notas").value = padre.notas || "";
    if (cfg.campoExtra) {
      const el = document.getElementById(`campo-padre-${cfg.campoExtra.key}`);
      if (el) el.value = padre[cfg.campoExtra.key] || "";
    }
  }

  async function cargarContactos() {
    const { data, error } = await window.sb
      .from(cfg.tablaHija)
      .select("*")
      .eq(cfg.fk, id)
      .order("nombre");
    if (error) return manejarError(error, "No se pudieron cargar los contactos");
    contactos = data || [];
    renderContactos();
  }

  function etiquetaTipo(valor) {
    const t = cfg.tiposContacto.find((t) => t.value === valor);
    return t ? t.label : valor;
  }

  function renderContactos() {
    const tbody = document.getElementById("tabla-contactos");
    tbody.innerHTML = contactos.length
      ? contactos
          .map(
            (c) => `
        <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
          <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(c.nombre)}</td>
          <td class="px-4 py-3">${escapeHtml(c.cargo || "—")}</td>
          <td class="px-4 py-3">${escapeHtml(etiquetaTipo(c.tipo_contacto))}</td>
          <td class="px-4 py-3">${escapeHtml(c.telefono || "—")}</td>
          <td class="px-4 py-3">${escapeHtml(c.email || "—")}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button class="btn-editar-contacto text-gray-400 hover:text-primary" data-id="${c.id}" title="Editar">
              <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button class="btn-borrar-contacto text-gray-400 hover:text-red-600" data-id="${c.id}" title="Borrar">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="6">Sin contactos registrados todavía.</td></tr>`;

    tbody.querySelectorAll(".btn-editar-contacto").forEach((btn) =>
      btn.addEventListener("click", () => abrirModalContacto(contactos.find((c) => c.id === btn.dataset.id)))
    );
    tbody.querySelectorAll(".btn-borrar-contacto").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar este contacto?")) return;
        const { error } = await window.sb.from(cfg.tablaHija).delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar el contacto");
        cargarContactos();
      })
    );
  }

  function abrirModalContacto(contacto) {
    editandoContactoId = contacto?.id || null;
    document.getElementById("modal-contacto-titulo").textContent = contacto ? "Editar contacto" : "Nuevo contacto";
    document.getElementById("campo-contacto-nombre").value = contacto?.nombre || "";
    document.getElementById("campo-contacto-cargo").value = contacto?.cargo || "";
    document.getElementById("campo-contacto-telefono").value = contacto?.telefono || "";
    document.getElementById("campo-contacto-email").value = contacto?.email || "";
    const selectTipo = document.getElementById("campo-contacto-tipo");
    selectTipo.innerHTML = cfg.tiposContacto
      .map((t) => `<option value="${t.value}" ${contacto?.tipo_contacto === t.value ? "selected" : ""}>${t.label}</option>`)
      .join("");
    document.getElementById("modal-contacto").classList.remove("hidden");
    document.getElementById("modal-contacto").classList.add("flex");
  }

  function cerrarModalContacto() {
    document.getElementById("modal-contacto").classList.add("hidden");
    document.getElementById("modal-contacto").classList.remove("flex");
  }

  document.getElementById("btn-nuevo-contacto").addEventListener("click", () => abrirModalContacto(null));
  document.getElementById("modal-contacto-cancelar").addEventListener("click", cerrarModalContacto);

  document.getElementById("modal-contacto-guardar").addEventListener("click", async () => {
    const nombre = document.getElementById("campo-contacto-nombre").value.trim();
    if (!nombre) return mostrarAviso("El nombre del contacto es obligatorio", "error");
    const payload = {
      [cfg.fk]: id,
      nombre,
      cargo: document.getElementById("campo-contacto-cargo").value.trim() || null,
      tipo_contacto: document.getElementById("campo-contacto-tipo").value,
      telefono: document.getElementById("campo-contacto-telefono").value.trim() || null,
      email: document.getElementById("campo-contacto-email").value.trim() || null,
    };
    const query = editandoContactoId
      ? window.sb.from(cfg.tablaHija).update(payload).eq("id", editandoContactoId)
      : window.sb.from(cfg.tablaHija).insert(payload);
    const { error } = await query;
    if (error) return manejarError(error, "No se pudo guardar el contacto");
    cerrarModalContacto();
    mostrarAviso("Contacto guardado", "exito");
    cargarContactos();
  });

  document.getElementById("btn-guardar-padre").addEventListener("click", async () => {
    const payload = {
      nombre: document.getElementById("campo-padre-nombre").value.trim(),
      nit: document.getElementById("campo-padre-nit").value.trim() || null,
      notas: document.getElementById("campo-padre-notas").value.trim() || null,
    };
    if (!payload.nombre) return mostrarAviso("El nombre es obligatorio", "error");
    if (cfg.campoExtra) {
      payload[cfg.campoExtra.key] = document.getElementById(`campo-padre-${cfg.campoExtra.key}`).value.trim() || null;
    }
    const { error } = await window.sb.from(cfg.tablaPadre).update(payload).eq("id", id);
    if (error) return manejarError(error, "No se pudo guardar");
    mostrarAviso("Datos guardados", "exito");
    cargarPadre();
  });

  await cargarPadre();
  await cargarContactos();
})();
