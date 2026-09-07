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

  function valorVisible(c, fila) {
    const v = fila[c.key];
    if (v === null || v === undefined || v === "") return "—";
    if (c.tipo === "porcentaje") return `${v}%`;
    if (c.tipo === "boolean") return v === true || v === "true" ? "Sí" : "No";
    if (c.tipo === "select") {
      const op = (c.opciones || []).find((o) => String(o.value) === String(v));
      return op ? op.label : v;
    }
    return v;
  }

  function celdaImagen(fila) {
    if (!cfg.campoImagen) return "";
    const url = fila[cfg.campoImagen.key];
    return `
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 bg-cover bg-center" ${url ? `style="background-image:url('${url}')"` : ""}>
            ${url ? "" : '<span class="material-symbols-outlined text-[18px] text-gray-300">image</span>'}
          </div>
          <label class="cursor-pointer text-xs font-semibold text-primary hover:underline">
            Subir
            <input type="file" accept="image/*" class="hidden input-imagen" data-id="${fila.id}" />
          </label>
        </div>
      </td>`;
  }

  function celdas(fila) {
    return (
      cfg.campos
        .filter((c) => c.enTabla !== false)
        .map((c) => `<td class="px-4 py-3">${escapeHtml(valorVisible(c, fila))}</td>`)
        .join("") + celdaImagen(fila)
    );
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const filtrados = !texto
      ? cache
      : cache.filter((f) =>
          cfg.campos.some((c) => typeof f[c.key] === "string" && f[c.key].toLowerCase().includes(texto))
        );

    const tbody = document.getElementById("tabla-catalogo");
    tbody.innerHTML = filtrados.length
      ? filtrados
          .map(
            (f) => `
        <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50 ${cfg.detalleUrl ? "cursor-pointer" : ""}" ${cfg.detalleUrl ? `data-detalle-id="${f.id}"` : ""}>
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
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="${cfg.campos.filter((c) => c.enTabla !== false).length + 1 + (cfg.campoImagen ? 1 : 0)}">Sin registros todavía.</td></tr>`;

    tbody.querySelectorAll(".btn-editar").forEach((btn) =>
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        abrirModal(cache.find((f) => f.id === btn.dataset.id));
      })
    );
    tbody.querySelectorAll(".btn-borrar").forEach((btn) =>
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!confirm("¿Borrar este registro?")) return;
        const { error } = await window.sb.from(cfg.tabla).delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar (puede que esté en uso en algún proyecto)");
        cargar();
      })
    );
    if (cfg.detalleUrl) {
      tbody.querySelectorAll("tr[data-detalle-id]").forEach((tr) =>
        tr.addEventListener("click", () => {
          const fila = cache.find((f) => f.id === tr.dataset.detalleId);
          if (fila) window.location.href = cfg.detalleUrl(fila);
        })
      );
    }
    if (cfg.campoImagen) {
      tbody.querySelectorAll(".input-imagen").forEach((input) =>
        input.addEventListener("click", (ev) => ev.stopPropagation())
      );
      tbody.querySelectorAll(".input-imagen").forEach((input) =>
        input.addEventListener("change", async (ev) => {
          const file = ev.target.files[0];
          if (!file) return;
          if (!file.type.startsWith("image/")) {
            mostrarAviso("Selecciona un archivo de imagen", "error");
            return;
          }
          const registroId = ev.target.dataset.id;
          const extension = (file.name.split(".").pop() || "png").toLowerCase();
          const ruta = `${registroId}/${cfg.campoImagen.key}.${extension}`;
          const { error: errorSubida } = await window.sb.storage
            .from(cfg.campoImagen.bucket)
            .upload(ruta, file, { upsert: true, cacheControl: "3600" });
          if (errorSubida) return manejarError(errorSubida, "No se pudo subir la imagen");
          const { data: publicUrlData } = window.sb.storage.from(cfg.campoImagen.bucket).getPublicUrl(ruta);
          const urlConVersion = `${publicUrlData.publicUrl}?v=${Date.now()}`;
          const { error: errorActualizar } = await window.sb
            .from(cfg.tabla)
            .update({ [cfg.campoImagen.key]: urlConVersion })
            .eq("id", registroId);
          if (errorActualizar) return manejarError(errorActualizar, "No se pudo guardar la imagen");
          mostrarAviso("Imagen actualizada", "exito");
          cargar();
        })
      );
    }
  }

  async function cargar() {
    const { data, error } = await window.sb.from(cfg.tabla).select("*").order(cfg.campos[0].key);
    if (error) return manejarError(error, "No se pudo cargar " + cfg.titulo.toLowerCase());
    cache = data || [];
    render();
  }

  function campoHtml(c, registro) {
    if (c.calculado) return "";
    const valorActual = registro?.[c.key];
    if (c.tipo === "select" || c.tipo === "boolean") {
      const opciones = (c.tipo === "boolean" ? [{ value: "true", label: "Sí" }, { value: "false", label: "No" }] : c.opciones || [])
        .map((op) => `<option value="${escapeHtml(op.value)}" ${String(valorActual) === String(op.value) ? "selected" : ""}>${escapeHtml(op.label)}</option>`)
        .join("");
      return `
      <div id="campo-wrap-${c.key}" data-show-if="${c.showIf ? escapeHtml(JSON.stringify(c.showIf)) : ""}">
        <label class="mb-1 block text-sm font-medium text-gray-700">${c.label}${c.requerido ? " *" : ""}</label>
        <select id="campo-${c.key}" ${c.requerido ? "required" : ""}
          class="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm">
          <option value="">Seleccionar…</option>
          ${opciones}
        </select>
      </div>`;
    }
    return `
      <div id="campo-wrap-${c.key}" data-show-if="${c.showIf ? escapeHtml(JSON.stringify(c.showIf)) : ""}">
        <label class="mb-1 block text-sm font-medium text-gray-700">${c.label}${c.requerido ? " *" : ""}</label>
        <input id="campo-${c.key}" type="${c.tipo || "text"}" ${c.requerido ? "required" : ""}
          class="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
          value="${escapeHtml(valorActual || "")}" />
      </div>`;
  }

  function actualizarVisibilidadCondicional() {
    cfg.campos.forEach((c) => {
      if (!c.showIf) return;
      const wrap = document.getElementById(`campo-wrap-${c.key}`);
      if (!wrap) return;
      const otroEl = document.getElementById(`campo-${c.showIf.key}`);
      const visible = otroEl && String(otroEl.value) === String(c.showIf.value);
      wrap.classList.toggle("hidden", !visible);
    });
  }

  function abrirModal(registro) {
    editandoId = registro?.id || null;
    document.getElementById("modal-titulo").textContent = registro ? `Editar ${cfg.titulo.slice(0, -1) || cfg.titulo}` : `Nuevo registro`;
    const cont = document.getElementById("modal-campos");
    cont.innerHTML = cfg.campos.map((c) => campoHtml(c, registro)).join("");

    // Conectar los campos que controlan visibilidad de otros (showIf).
    const controladores = new Set(cfg.campos.filter((c) => c.showIf).map((c) => c.showIf.key));
    controladores.forEach((key) => {
      const el = document.getElementById(`campo-${key}`);
      if (el) el.addEventListener("change", actualizarVisibilidadCondicional);
    });
    actualizarVisibilidadCondicional();

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

  const btnExportar = document.getElementById("btn-exportar");
  if (btnExportar && typeof XLSX !== "undefined") {
    btnExportar.addEventListener("click", () => {
      const columnas = cfg.campos.map((c) => c.label);
      const filas = cache.map((f) => cfg.campos.map((c) => valorVisible(c, f)));
      descargarPlantillaExcel(`${cfg.tabla}.xlsx`, columnas, filas);
    });
  }

  document.getElementById("modal-guardar").addEventListener("click", async () => {
    const payload = {};
    for (const c of cfg.campos) {
      if (c.calculado) continue;
      const wrap = document.getElementById(`campo-wrap-${c.key}`);
      const oculto = wrap && wrap.classList.contains("hidden");
      const el = document.getElementById(`campo-${c.key}`);
      if (oculto) {
        payload[c.key] = null;
        continue;
      }
      const valor = (el.value || "").trim();
      if (c.requerido && !valor) {
        return mostrarAviso(`El campo "${c.label}" es obligatorio`, "error");
      }
      if (c.tipo === "boolean") {
        payload[c.key] = valor === "" ? null : valor === "true";
      } else {
        payload[c.key] = valor || null;
      }
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
