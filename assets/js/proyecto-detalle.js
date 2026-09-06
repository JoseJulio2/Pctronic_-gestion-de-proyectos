(async () => {
  await window.pctronicReady;

  const proyectoId = qs("id");
  if (!proyectoId) {
    window.location.href = "proyectos.html";
    return;
  }

  let proyecto = null;
  let contratistasCache = [];

  // --------------------------------------------------------------------
  // Tabs
  // --------------------------------------------------------------------
  function activarTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      const activo = btn.dataset.tab === tab;
      btn.classList.toggle("border-primary", activo);
      btn.classList.toggle("text-primary", activo);
      btn.classList.toggle("border-transparent", !activo);
      btn.classList.toggle("text-gray-500", !activo);
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.tabPanel !== tab);
    });
    history.replaceState(null, "", `?id=${proyectoId}&tab=${tab}`);
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activarTab(btn.dataset.tab));
  });

  const ETIQUETA_TIPO_ITEM = { MO: "Mano de Obra", MP: "Materiales", EQUIPO: "Equipos", ALQUILER: "Alquileres", OTRO: "Otro" };

  // --------------------------------------------------------------------
  // Encabezado
  // --------------------------------------------------------------------
  async function cargarProyecto() {
    const { data, error } = await window.sb
      .from("proyectos")
      .select("*, clientes(id, nombre), empresas(id, nombre)")
      .eq("id", proyectoId)
      .single();

    if (error) {
      manejarError(error, "No se pudo cargar el proyecto");
      return;
    }
    proyecto = data;
    document.title = `${proyecto.nombre} · Pctronic`;

    const tipos = (proyecto.tipo_proyecto || []).join(", ") || "—";

    document.getElementById("encabezado-proyecto").innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900">${escapeHtml(proyecto.nombre)}</h1>
          <p class="text-sm text-gray-500">Cliente: ${escapeHtml(proyecto.clientes?.nombre || "Sin asignar")} · Empresa: ${escapeHtml(proyecto.empresas?.nombre || "Sin asignar")}</p>
          <p class="text-xs text-gray-400">${escapeHtml(tipos)}</p>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right">
            <div class="mb-1 flex items-center gap-2">
              ${badgeHtml(ESTADOS_PROYECTO, proyecto.estado)}
              <span class="text-sm font-bold text-gray-900">${proyecto.avance_porcentaje || 0}%</span>
            </div>
            <div class="barra-progreso w-40"><span style="width:${proyecto.avance_porcentaje || 0}%"></span></div>
          </div>
          <button id="btn-editar-proyecto" class="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50" title="Editar estado / avance">
            <span class="material-symbols-outlined text-[20px]">edit</span>
          </button>
          <button id="btn-editar-contrato" class="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50" title="Editar valores del contrato">
            <span class="material-symbols-outlined text-[20px]">payments</span>
          </button>
        </div>
      </div>`;

    document.getElementById("btn-editar-proyecto").addEventListener("click", abrirModalEditar);
    document.getElementById("btn-editar-contrato").addEventListener("click", abrirModalContrato);

    renderResumen();
  }

  function abrirModalEditar() {
    const html = `
      <div id="modal-editar-proyecto" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
        <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
          <h3 class="mb-4 text-base font-bold text-gray-900">Editar Proyecto</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Estado</label>
              <select id="edit-estado" class="w-full rounded-lg border-gray-300 text-sm">
                <option value="sin_iniciar">Sin Iniciar</option>
                <option value="en_curso">En Curso</option>
                <option value="detenido">Detenido</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Avance (%)</label>
              <input id="edit-avance" type="number" min="0" max="100" class="w-full rounded-lg border-gray-300 text-sm" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Fin Estimado</label>
              <input id="edit-fin" type="date" class="w-full rounded-lg border-gray-300 text-sm" />
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button id="edit-cancelar" class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button id="edit-guardar" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">Guardar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
    document.getElementById("edit-estado").value = proyecto.estado;
    document.getElementById("edit-avance").value = proyecto.avance_porcentaje || 0;
    document.getElementById("edit-fin").value = proyecto.fecha_fin_estimada || "";

    const cerrar = () => document.getElementById("modal-editar-proyecto").remove();
    document.getElementById("edit-cancelar").addEventListener("click", cerrar);
    document.getElementById("edit-guardar").addEventListener("click", async () => {
      const { error } = await window.sb
        .from("proyectos")
        .update({
          estado: document.getElementById("edit-estado").value,
          avance_porcentaje: Number(document.getElementById("edit-avance").value || 0),
          fecha_fin_estimada: document.getElementById("edit-fin").value || null,
        })
        .eq("id", proyectoId);
      if (error) return manejarError(error, "No se pudo actualizar el proyecto");
      cerrar();
      mostrarAviso("Proyecto actualizado", "exito");
      cargarProyecto();
    });
  }

  function abrirModalContrato() {
    const html = `
      <div id="modal-contrato" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
        <div class="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
          <h3 class="mb-4 text-base font-bold text-gray-900">Valores del Contrato</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Tipo de contrato</label>
              <div class="flex gap-4 text-sm">
                <label class="flex items-center gap-1"><input type="radio" name="c-tipo-contrato" value="iva" class="text-primary" /> IVA simple</label>
                <label class="flex items-center gap-1"><input type="radio" name="c-tipo-contrato" value="aiu" class="text-primary" /> AIU</label>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Valor antes de impuestos (COP)</label>
              <input id="c-valor-antes" class="input-moneda w-full rounded-lg border-gray-300 text-sm" inputmode="numeric" />
            </div>
            <div id="c-bloque-iva">
              <label class="mb-1 block text-xs font-medium text-gray-700">IVA (%)</label>
              <input id="c-iva" type="number" min="0" step="0.5" class="w-full rounded-lg border-gray-300 text-sm" />
            </div>
            <div id="c-bloque-aiu" class="hidden grid grid-cols-3 gap-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-700">Administración (%)</label>
                <input id="c-admin" type="number" min="0" step="0.5" class="w-full rounded-lg border-gray-300 text-sm" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-700">Imprevistos (%)</label>
                <input id="c-imprev" type="number" min="0" step="0.5" class="w-full rounded-lg border-gray-300 text-sm" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-700">Utilidad (%)</label>
                <input id="c-util" type="number" min="0" step="0.5" class="w-full rounded-lg border-gray-300 text-sm" />
              </div>
            </div>
            <div class="rounded-lg bg-blue-50 p-3 text-sm">
              <span class="text-gray-600">Valor total del contrato: </span>
              <span id="c-preview-total" class="font-bold text-primary">$ 0</span>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button id="c-cancelar" class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button id="c-guardar" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">Guardar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);

    const radios = document.querySelectorAll('input[name="c-tipo-contrato"]');
    const bloqueIva = document.getElementById("c-bloque-iva");
    const bloqueAiu = document.getElementById("c-bloque-aiu");
    const campos = ["c-valor-antes", "c-iva", "c-admin", "c-imprev", "c-util"].map((id) => document.getElementById(id));

    function actualizarBloques() {
      const tipo = document.querySelector('input[name="c-tipo-contrato"]:checked')?.value || "iva";
      bloqueIva.classList.toggle("hidden", tipo !== "iva");
      bloqueAiu.classList.toggle("hidden", tipo !== "aiu");
      actualizarPreview();
    }
    function actualizarPreview() {
      const tipo = document.querySelector('input[name="c-tipo-contrato"]:checked')?.value || "iva";
      const base = valorMoneda(document.getElementById("c-valor-antes"));
      let total;
      if (tipo === "aiu") {
        const admin = Number(document.getElementById("c-admin").value || 0);
        const imprev = Number(document.getElementById("c-imprev").value || 0);
        const util = Number(document.getElementById("c-util").value || 0);
        total = base * (1 + (admin + imprev + util) / 100);
      } else {
        const iva = Number(document.getElementById("c-iva").value || 0);
        total = base * (1 + iva / 100);
      }
      document.getElementById("c-preview-total").textContent = formatoMoneda(total);
    }

    activarCamposMoneda(".input-moneda", document.getElementById("modal-contrato"));
    radios.forEach((r) => r.addEventListener("change", actualizarBloques));
    campos.forEach((el) => el.addEventListener("input", actualizarPreview));

    document.querySelector(`input[name="c-tipo-contrato"][value="${proyecto.tipo_contrato}"]`).checked = true;
    establecerValorMoneda(document.getElementById("c-valor-antes"), proyecto.valor_antes_impuestos || 0);
    document.getElementById("c-iva").value = proyecto.iva_porcentaje ?? 19;
    document.getElementById("c-admin").value = proyecto.administracion_porcentaje ?? 0;
    document.getElementById("c-imprev").value = proyecto.imprevistos_porcentaje ?? 0;
    document.getElementById("c-util").value = proyecto.utilidad_porcentaje ?? 0;
    actualizarBloques();

    const cerrar = () => document.getElementById("modal-contrato").remove();
    document.getElementById("c-cancelar").addEventListener("click", cerrar);
    document.getElementById("c-guardar").addEventListener("click", async () => {
      const tipo = document.querySelector('input[name="c-tipo-contrato"]:checked')?.value || "iva";
      const payload = {
        tipo_contrato: tipo,
        valor_antes_impuestos: valorMoneda(document.getElementById("c-valor-antes")),
        iva_porcentaje: Number(document.getElementById("c-iva").value || 0),
        administracion_porcentaje: Number(document.getElementById("c-admin").value || 0),
        imprevistos_porcentaje: Number(document.getElementById("c-imprev").value || 0),
        utilidad_porcentaje: Number(document.getElementById("c-util").value || 0),
      };
      const { error } = await window.sb.from("proyectos").update(payload).eq("id", proyectoId);
      if (error) return manejarError(error, "No se pudo actualizar el contrato");
      cerrar();
      mostrarAviso("Valores del contrato actualizados", "exito");
      cargarProyecto();
    });
  }

  // --------------------------------------------------------------------
  // RESUMEN
  // --------------------------------------------------------------------
  async function renderResumen() {
    const [{ data: facturas }, { data: compras }] = await Promise.all([
      window.sb.from("facturas").select("valor, estado").eq("proyecto_id", proyectoId),
      window.sb.from("compras").select("valor").eq("proyecto_id", proyectoId),
    ]);

    const totalFacturado = (facturas || []).reduce((a, f) => a + Number(f.valor || 0), 0);
    const totalComprado = (compras || []).reduce((a, c) => a + Number(c.valor || 0), 0);
    const utilidadEstimada = Number(proyecto.valor_total || 0) - totalComprado;

    const kpi = (icon, label, valor, color) => `
      <div class="rounded-xl border border-gray-200 bg-white p-4">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg ${color}">
            <span class="material-symbols-outlined text-[20px]">${icon}</span>
          </div>
          <div>
            <p class="text-xs font-medium text-gray-500">${label}</p>
            <p class="text-base font-bold text-gray-900">${valor}</p>
          </div>
        </div>
      </div>`;

    document.getElementById("resumen-kpis").innerHTML =
      kpi("payments", "Valor Total Contrato", formatoMoneda(proyecto.valor_total), "bg-blue-100 text-primary") +
      kpi("receipt_long", "Facturado", formatoMoneda(totalFacturado), "bg-green-100 text-green-700") +
      kpi("shopping_cart", "Comprado / Costos", formatoMoneda(totalComprado), "bg-amber-100 text-amber-700") +
      kpi("trending_up", "Utilidad Estimada", formatoMoneda(utilidadEstimada), utilidadEstimada >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700");

    document.getElementById("resumen-info").innerHTML = `
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Empresa</dt><dd class="font-medium">${escapeHtml(proyecto.empresas?.nombre || "—")}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Cliente</dt><dd class="font-medium">${escapeHtml(proyecto.clientes?.nombre || "—")}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Tipo de Proyecto</dt><dd class="font-medium">${escapeHtml((proyecto.tipo_proyecto || []).join(", ") || "—")}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Tipo de contrato</dt><dd class="font-medium">${proyecto.tipo_contrato === "aiu" ? "AIU" : "IVA simple"}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Fecha de Contrato</dt><dd class="font-medium">${formatoFecha(proyecto.fecha_contrato)}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Fecha de Inicio</dt><dd class="font-medium">${formatoFecha(proyecto.fecha_inicio)}</dd></div>
      <div class="flex justify-between"><dt class="text-gray-500">Fin Estimado</dt><dd class="font-medium">${formatoFecha(proyecto.fecha_fin_estimada)}</dd></div>
    `;
    document.getElementById("resumen-notas").textContent = proyecto.notas || "Sin notas registradas.";
  }

  // --------------------------------------------------------------------
  // PRESUPUESTO
  // --------------------------------------------------------------------
  let presupuestoCache = [];

  async function cargarContratistasSelectPresupuesto() {
    const { data } = await window.sb.from("contratistas").select("id, nombre").order("nombre");
    contratistasCache = data || [];
    const sel = document.getElementById("item-contratista");
    sel.innerHTML =
      `<option value="">— Ninguno —</option>` +
      contratistasCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
  }

  async function cargarPresupuesto() {
    const { data, error } = await window.sb
      .from("presupuesto_items")
      .select("*, contratistas(nombre)")
      .eq("proyecto_id", proyectoId)
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar el presupuesto");
    presupuestoCache = data || [];

    const totalPorTipo = (tipo) => presupuestoCache.filter((i) => i.tipo === tipo).reduce((a, i) => a + Number(i.valor_total), 0);
    const totalMO = totalPorTipo("MO");
    const totalMP = totalPorTipo("MP");
    const totalEquipo = totalPorTipo("EQUIPO");
    const totalAlquiler = totalPorTipo("ALQUILER");
    const totalOtro = totalPorTipo("OTRO");

    document.getElementById("presu-total-mo").textContent = formatoMoneda(totalMO);
    document.getElementById("presu-total-mp").textContent = formatoMoneda(totalMP);
    document.getElementById("presu-total-equipo").textContent = formatoMoneda(totalEquipo);
    document.getElementById("presu-total-alquiler").textContent = formatoMoneda(totalAlquiler);
    document.getElementById("presu-total-general").textContent = formatoMoneda(totalMO + totalMP + totalEquipo + totalAlquiler + totalOtro);

    document.getElementById("tabla-presupuesto").innerHTML = presupuestoCache.length
      ? presupuestoCache
          .map(
            (item) => `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="px-4 py-2.5">
            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${ETIQUETA_TIPO_ITEM[item.tipo] || item.tipo}</span>
            ${item.es_adicional ? '<span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Adicional</span>' : ""}
          </td>
          <td class="px-4 py-2.5">${escapeHtml(item.descripcion)}</td>
          <td class="px-4 py-2.5">${escapeHtml(item.unidad || "un")}</td>
          <td class="px-4 py-2.5">${item.cantidad}</td>
          <td class="px-4 py-2.5">${formatoMoneda(item.valor_unitario)}</td>
          <td class="px-4 py-2.5 font-medium">${formatoMoneda(item.valor_total)}</td>
          <td class="px-4 py-2.5">${escapeHtml(item.contratistas?.nombre || "—")}</td>
          <td class="px-4 py-2.5 text-right">
            <button class="btn-borrar-item text-gray-400 hover:text-red-600" data-id="${item.id}">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-6 text-center text-gray-400" colspan="8">Aún no has agregado renglones al presupuesto.</td></tr>`;

    document.querySelectorAll(".btn-borrar-item").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar este renglón del presupuesto?")) return;
        const { error } = await window.sb.from("presupuesto_items").delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar");
        cargarPresupuesto();
      })
    );
  }

  document.getElementById("form-presupuesto-item").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      proyecto_id: proyectoId,
      tipo: document.getElementById("item-tipo").value,
      descripcion: document.getElementById("item-descripcion").value.trim(),
      unidad: document.getElementById("item-unidad").value.trim() || "un",
      cantidad: Number(document.getElementById("item-cantidad").value || 1),
      valor_unitario: valorMoneda(document.getElementById("item-valor")),
      contratista_id: document.getElementById("item-contratista").value || null,
      es_adicional: document.getElementById("item-adicional").checked,
    };
    const { error } = await window.sb.from("presupuesto_items").insert(payload);
    if (error) return manejarError(error, "No se pudo agregar el renglón");
    e.target.reset();
    document.getElementById("item-cantidad").value = 1;
    cargarPresupuesto();
  });

  const COLUMNAS_PLANTILLA_PRESUPUESTO = ["tipo", "descripcion", "unidad", "cantidad", "valor_unitario", "contratista_nombre", "es_adicional"];

  document.getElementById("btn-plantilla-presupuesto").addEventListener("click", () => {
    descargarPlantillaExcel("plantilla_presupuesto.xlsx", COLUMNAS_PLANTILLA_PRESUPUESTO, [
      ["MO", "Instalación cableado UTP cat6a", "m", 100, 3500, "", "no"],
      ["MP", "Cable UTP cat6a", "m", 100, 2800, "", "no"],
    ]);
  });

  document.getElementById("input-importar-presupuesto").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const filas = await leerArchivoExcel(file);
      if (!filas.length) return mostrarAviso("El archivo no tiene filas para importar", "error");

      const payloads = filas
        .filter((f) => String(f.descripcion || "").trim())
        .map((f) => {
          const tipo = String(f.tipo || "OTRO").trim().toUpperCase();
          const nombreContratista = String(f.contratista_nombre || "").trim().toLowerCase();
          const contratista = contratistasCache.find((c) => c.nombre.toLowerCase() === nombreContratista);
          const adicionalTexto = String(f.es_adicional || "").trim().toLowerCase();
          return {
            proyecto_id: proyectoId,
            tipo: ["MO", "MP", "EQUIPO", "ALQUILER", "OTRO"].includes(tipo) ? tipo : "OTRO",
            descripcion: String(f.descripcion).trim(),
            unidad: String(f.unidad || "un").trim() || "un",
            cantidad: Number(f.cantidad || 1),
            valor_unitario: Number(f.valor_unitario || 0),
            contratista_id: contratista ? contratista.id : null,
            es_adicional: ["si", "sí", "true", "1", "yes"].includes(adicionalTexto),
          };
        });

      if (!payloads.length) return mostrarAviso("No se encontraron filas válidas (falta la descripción)", "error");

      const { error } = await window.sb.from("presupuesto_items").insert(payloads);
      if (error) return manejarError(error, "No se pudo importar el presupuesto");
      mostrarAviso(`${payloads.length} renglones importados`, "exito");
      cargarPresupuesto();
    } catch (err) {
      manejarError(err, "No se pudo leer el archivo Excel");
    } finally {
      e.target.value = "";
    }
  });

  // --------------------------------------------------------------------
  // FACTURACIÓN
  // --------------------------------------------------------------------
  async function cargarFacturas() {
    const { data, error } = await window.sb
      .from("facturas")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .order("fecha_emision", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar la facturación");

    const total = data.reduce((a, f) => a + Number(f.valor), 0);
    const pagado = data.filter((f) => f.estado === "pagada").reduce((a, f) => a + Number(f.valor), 0);
    document.getElementById("fact-total").textContent = formatoMoneda(total);
    document.getElementById("fact-pagado").textContent = formatoMoneda(pagado);
    document.getElementById("fact-pendiente").textContent = formatoMoneda(total - pagado);

    document.getElementById("tabla-facturas").innerHTML = data.length
      ? data
          .map(
            (f) => `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="px-4 py-2.5 font-medium">${escapeHtml(f.numero_factura || "—")}</td>
          <td class="px-4 py-2.5">${formatoFecha(f.fecha_emision)}</td>
          <td class="px-4 py-2.5">${formatoFecha(f.fecha_vencimiento)}</td>
          <td class="px-4 py-2.5 font-medium">${formatoMoneda(f.valor)}</td>
          <td class="px-4 py-2.5">
            <select class="select-estado-factura rounded-lg border-gray-300 text-xs" data-id="${f.id}">
              ${Object.entries(ESTADOS_FACTURA)
                .map(([val, info]) => `<option value="${val}" ${val === f.estado ? "selected" : ""}>${info.label}</option>`)
                .join("")}
            </select>
          </td>
          <td class="px-4 py-2.5 text-right">
            <button class="btn-borrar-factura text-gray-400 hover:text-red-600" data-id="${f.id}">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-6 text-center text-gray-400" colspan="6">No hay facturas registradas para este proyecto.</td></tr>`;

    document.querySelectorAll(".select-estado-factura").forEach((sel) =>
      sel.addEventListener("change", async () => {
        const { error } = await window.sb.from("facturas").update({ estado: sel.value }).eq("id", sel.dataset.id);
        if (error) return manejarError(error, "No se pudo actualizar el estado");
        cargarFacturas();
      })
    );
    document.querySelectorAll(".btn-borrar-factura").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar esta factura?")) return;
        const { error } = await window.sb.from("facturas").delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar");
        cargarFacturas();
      })
    );
  }

  document.getElementById("form-factura").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      proyecto_id: proyectoId,
      numero_factura: document.getElementById("factura-numero").value.trim() || null,
      valor: valorMoneda(document.getElementById("factura-valor")),
      fecha_emision: document.getElementById("factura-emision").value || new Date().toISOString().slice(0, 10),
      fecha_vencimiento: document.getElementById("factura-vencimiento").value || null,
      estado: document.getElementById("factura-estado").value,
    };
    const { error } = await window.sb.from("facturas").insert(payload);
    if (error) return manejarError(error, "No se pudo registrar la factura");
    e.target.reset();
    cargarFacturas();
  });

  // --------------------------------------------------------------------
  // COMPRAS
  // --------------------------------------------------------------------
  async function cargarProveedoresSelect() {
    const { data } = await window.sb.from("proveedores").select("id, nombre").order("nombre");
    const sel = document.getElementById("compra-proveedor");
    sel.innerHTML =
      `<option value="">Sin proveedor / caja menor</option>` +
      (data || []).map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join("");
  }

  async function cargarCompras() {
    const { data, error } = await window.sb
      .from("compras")
      .select("*, proveedores(nombre)")
      .eq("proyecto_id", proyectoId)
      .order("fecha", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar las compras");

    const total = data.reduce((a, c) => a + Number(c.valor), 0);
    document.getElementById("compras-total").textContent = formatoMoneda(total);

    const etiquetaCat = { materiales: "Materiales", mano_obra: "Mano de Obra", equipos: "Equipos", otros: "Otros" };

    document.getElementById("tabla-compras").innerHTML = data.length
      ? data
          .map(
            (c) => `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="px-4 py-2.5">${escapeHtml(c.descripcion)}</td>
          <td class="px-4 py-2.5">${escapeHtml(c.proveedores?.nombre || "—")}</td>
          <td class="px-4 py-2.5"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${etiquetaCat[c.categoria] || c.categoria}</span></td>
          <td class="px-4 py-2.5">${formatoFecha(c.fecha)}</td>
          <td class="px-4 py-2.5 font-medium">${formatoMoneda(c.valor)}</td>
          <td class="px-4 py-2.5 text-right">
            <button class="btn-borrar-compra text-gray-400 hover:text-red-600" data-id="${c.id}">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-6 text-center text-gray-400" colspan="6">No hay compras registradas para este proyecto.</td></tr>`;

    document.querySelectorAll(".btn-borrar-compra").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar esta compra?")) return;
        const { error } = await window.sb.from("compras").delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar");
        cargarCompras();
      })
    );
  }

  document.getElementById("form-compra").addEventListener("submit", async (e) => {
    e.preventDefault();
    const valorAntesIva = valorMoneda(document.getElementById("compra-valor"));
    const payload = {
      proyecto_id: proyectoId,
      proveedor_id: document.getElementById("compra-proveedor").value || null,
      categoria: document.getElementById("compra-categoria").value,
      descripcion: document.getElementById("compra-descripcion").value.trim(),
      valor_antes_iva: valorAntesIva,
      iva_porcentaje: Number(document.getElementById("compra-iva")?.value ?? 19),
      fecha: document.getElementById("compra-fecha").value || new Date().toISOString().slice(0, 10),
    };
    const { error } = await window.sb.from("compras").insert(payload);
    if (error) return manejarError(error, "No se pudo registrar la compra");
    e.target.reset();
    cargarCompras();
  });

  // --------------------------------------------------------------------
  // CONTRATISTAS
  // --------------------------------------------------------------------
  async function cargarContratistasSelect() {
    const { data } = await window.sb.from("contratistas").select("id, nombre").order("nombre");
    document.getElementById("contratista-select").innerHTML = (data || [])
      .map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`)
      .join("");
  }

  async function cargarContratistasProyecto() {
    const { data, error } = await window.sb
      .from("proyecto_contratistas")
      .select("*, contratistas(nombre, especialidad), cortes_pago(*)")
      .eq("proyecto_id", proyectoId)
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar los contratistas");

    const cont = document.getElementById("lista-contratistas");
    if (!data.length) {
      cont.innerHTML = `<p class="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-400">Aún no has vinculado contratistas a este proyecto.</p>`;
      return;
    }

    cont.innerHTML = data
      .map((pc) => {
        const cortes = pc.cortes_pago || [];
        const pagado = cortes.filter((c) => c.estado === "pagado").reduce((a, c) => a + Number(c.valor_neto), 0);
        const saldo = Number(pc.valor_contratado) - pagado;

        return `
        <div class="rounded-xl border border-gray-200 bg-white p-4" data-pc-id="${pc.id}">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="font-bold text-gray-900">${escapeHtml(pc.contratistas?.nombre || "—")}</p>
              <p class="text-xs text-gray-500">${escapeHtml(pc.contratistas?.especialidad || "")}</p>
            </div>
            <div class="flex gap-6 text-sm">
              <div><p class="text-xs text-gray-500">Contratado</p><p class="font-semibold">${formatoMoneda(pc.valor_contratado)}</p></div>
              <div><p class="text-xs text-gray-500">Pagado</p><p class="font-semibold text-green-600">${formatoMoneda(pagado)}</p></div>
              <div><p class="text-xs text-gray-500">Saldo</p><p class="font-semibold text-amber-600">${formatoMoneda(saldo)}</p></div>
            </div>
            <div class="flex items-center gap-2">
              <button class="btn-toggle-cortes rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Ver cortes de pago (${cortes.length})
              </button>
              <button class="btn-borrar-contratista text-gray-400 hover:text-red-600" title="Quitar del proyecto">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>

          <div class="hidden mt-4 border-t border-gray-100 pt-4 panel-cortes">
            <form class="form-corte mb-3 grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-700">Periodo inicio</label>
                <input type="date" class="corte-inicio w-full rounded-lg border-gray-300 text-xs" />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-700">Periodo fin</label>
                <input type="date" class="corte-fin w-full rounded-lg border-gray-300 text-xs" />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-700">Valor Bruto</label>
                <input class="corte-bruto input-moneda w-full rounded-lg border-gray-300 text-xs" inputmode="numeric" />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-700">Retenciones</label>
                <input class="corte-retenciones input-moneda w-full rounded-lg border-gray-300 text-xs" inputmode="numeric" />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-700">Estado</label>
                <select class="corte-estado w-full rounded-lg border-gray-300 text-xs">
                  <option value="en_tramite">En Trámite</option>
                  <option value="pagado">Pagado</option>
                  <option value="borrador">Borrador</option>
                </select>
              </div>
              <div class="sm:col-span-2">
                <button class="w-full rounded-lg bg-gray-900 px-2 py-1.5 text-xs font-semibold text-white hover:bg-gray-700">+ Generar Corte</button>
              </div>
            </form>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="text-gray-500">
                  <tr>
                    <th class="py-1.5 pr-3">Periodo</th>
                    <th class="py-1.5 pr-3">Bruto</th>
                    <th class="py-1.5 pr-3">Retenciones</th>
                    <th class="py-1.5 pr-3">Neto</th>
                    <th class="py-1.5 pr-3">Estado</th>
                    <th class="py-1.5"></th>
                  </tr>
                </thead>
                <tbody class="tabla-cortes">
                  ${
                    cortes.length
                      ? cortes
                          .map(
                            (c) => `
                    <tr class="border-t border-gray-50" data-corte-id="${c.id}">
                      <td class="py-1.5 pr-3">${formatoFecha(c.periodo_inicio)} – ${formatoFecha(c.periodo_fin)}</td>
                      <td class="py-1.5 pr-3">${formatoMoneda(c.valor_bruto)}</td>
                      <td class="py-1.5 pr-3">${formatoMoneda(c.retenciones)}</td>
                      <td class="py-1.5 pr-3 font-medium">${formatoMoneda(c.valor_neto)}</td>
                      <td class="py-1.5 pr-3">${badgeHtml(ESTADOS_CORTE, c.estado)}</td>
                      <td class="py-1.5 text-right">
                        <button class="btn-borrar-corte text-gray-400 hover:text-red-600">
                          <span class="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </td>
                    </tr>`
                          )
                          .join("")
                      : `<tr><td class="py-3 text-gray-400" colspan="6">Sin cortes registrados aún.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      })
      .join("");

    // Eventos por cada tarjeta
    cont.querySelectorAll("[data-pc-id]").forEach((card) => {
      const pcId = card.dataset.pcId;
      const contratistaObj = data.find((pc) => pc.id === pcId);

      card.querySelector(".btn-toggle-cortes").addEventListener("click", () => {
        card.querySelector(".panel-cortes").classList.toggle("hidden");
      });

      card.querySelector(".btn-borrar-contratista").addEventListener("click", async () => {
        if (!confirm("¿Quitar este contratista del proyecto? Se borrarán también sus cortes de pago.")) return;
        const { error } = await window.sb.from("proyecto_contratistas").delete().eq("id", pcId);
        if (error) return manejarError(error, "No se pudo quitar");
        cargarContratistasProyecto();
      });

      activarCamposMoneda(".input-moneda", card);
      const inputBruto = card.querySelector(".corte-bruto");
      const inputRetenciones = card.querySelector(".corte-retenciones");
      if (inputBruto && contratistaObj) {
        inputBruto.addEventListener("input", () => {
          const porcentaje = Number(contratistaObj.contratistas?.porcentaje_retencion || 0);
          const bruto = valorMoneda(inputBruto);
          establecerValorMoneda(inputRetenciones, Math.round(bruto * (porcentaje / 100)));
        });
      }

      card.querySelector(".form-corte").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
          proyecto_contratista_id: pcId,
          periodo_inicio: card.querySelector(".corte-inicio").value || null,
          periodo_fin: card.querySelector(".corte-fin").value || null,
          valor_bruto: valorMoneda(card.querySelector(".corte-bruto")),
          retenciones: valorMoneda(card.querySelector(".corte-retenciones")),
          estado: card.querySelector(".corte-estado").value,
        };
        const { error } = await window.sb.from("cortes_pago").insert(payload);
        if (error) return manejarError(error, "No se pudo generar el corte");
        cargarContratistasProyecto();
      });

      card.querySelectorAll(".btn-borrar-corte").forEach((btn) =>
        btn.addEventListener("click", async () => {
          if (!confirm("¿Borrar este corte de pago?")) return;
          const corteId = btn.closest("[data-corte-id]").dataset.corteId;
          const { error } = await window.sb.from("cortes_pago").delete().eq("id", corteId);
          if (error) return manejarError(error, "No se pudo borrar");
          cargarContratistasProyecto();
        })
      );
    });
  }

  document.getElementById("form-contratista").addEventListener("submit", async (e) => {
    e.preventDefault();
    const contratistaId = document.getElementById("contratista-select").value;
    if (!contratistaId) return mostrarAviso("Primero crea un contratista en el catálogo de Contratistas.", "error");

    const payload = {
      proyecto_id: proyectoId,
      contratista_id: contratistaId,
      valor_contratado: valorMoneda(document.getElementById("contratista-valor")),
    };
    const { error } = await window.sb.from("proyecto_contratistas").insert(payload);
    if (error) {
      if (String(error.message).includes("duplicate")) {
        manejarError({ message: "Ese contratista ya está vinculado a este proyecto." }, "");
      } else {
        manejarError(error, "No se pudo vincular el contratista");
      }
      return;
    }
    e.target.reset();
    cargarContratistasProyecto();
  });

  // --------------------------------------------------------------------
  // EJECUCIÓN / AVANCE DE OBRA
  // --------------------------------------------------------------------
  async function cargarCortesEjecucion() {
    const { data: cortes, error } = await window.sb
      .from("ejecucion_cortes")
      .select("*, ejecucion_items(*, presupuesto_items(*, contratistas(nombre))), ejecucion_generaciones(*)")
      .eq("proyecto_id", proyectoId)
      .order("numero_corte", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar la ejecución");

    const cont = document.getElementById("lista-cortes");
    if (!cortes.length) {
      cont.innerHTML = `<p class="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-400">Aún no has creado ningún corte de ejecución. Crea uno para registrar avances/instalaciones.</p>`;
      return;
    }

    cont.innerHTML = cortes.map((corte) => renderCorteCard(corte)).join("");

    cortes.forEach((corte) => conectarEventosCorte(corte));
  }

  function renderCorteCard(corte) {
    const items = corte.ejecucion_items || [];
    const totalCorte = items.reduce((a, i) => a + Number(i.valor_periodo || 0), 0);
    const yaFacturado = (corte.ejecucion_generaciones || []).some((g) => g.tipo === "factura");
    const contratistasEnCorte = [...new Set(items.map((i) => i.presupuesto_items?.contratista_id).filter(Boolean))];

    return `
    <div class="rounded-xl border border-gray-200 bg-white p-4" data-corte-card="${corte.id}">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-bold text-gray-900">Corte N° ${corte.numero_corte} — ${formatoFecha(corte.fecha_corte)}</p>
          <p class="text-xs text-gray-500">${escapeHtml(corte.descripcion || "")}</p>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right">
            <p class="text-xs text-gray-500">Valor total del corte</p>
            <p class="font-semibold text-primary">${formatoMoneda(totalCorte)}</p>
          </div>
          <button class="btn-toggle-corte rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            Ver / editar avances
          </button>
        </div>
      </div>

      <div class="hidden mt-4 border-t border-gray-100 pt-4 panel-corte">
        <p class="mb-2 text-xs text-gray-500">Ingresa la cantidad avanzada/instalada de cada renglón en este corte (puede incluir cantidades pactadas con el cliente).</p>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="text-gray-500">
              <tr>
                <th class="py-1.5 pr-3">Renglón</th>
                <th class="py-1.5 pr-3">Contratista</th>
                <th class="py-1.5 pr-3">Vlr. Unitario</th>
                <th class="py-1.5 pr-3">Cant. este corte</th>
                <th class="py-1.5 pr-3">Valor del corte</th>
              </tr>
            </thead>
            <tbody class="tabla-items-corte">
              ${presupuestoCache
                .map((pi) => {
                  const existente = items.find((i) => i.presupuesto_item_id === pi.id);
                  return `
                <tr data-presupuesto-item-id="${pi.id}">
                  <td class="py-1.5 pr-3">${escapeHtml(pi.descripcion)} <span class="text-gray-400">(${ETIQUETA_TIPO_ITEM[pi.tipo] || pi.tipo})</span></td>
                  <td class="py-1.5 pr-3">${escapeHtml(pi.contratistas?.nombre || "—")}</td>
                  <td class="py-1.5 pr-3">${formatoMoneda(pi.valor_unitario)}</td>
                  <td class="py-1.5 pr-3">
                    <input type="number" min="0" step="0.01" class="input-cantidad-corte w-24 rounded-lg border-gray-300 text-xs"
                      value="${existente ? existente.cantidad_periodo : ""}" placeholder="0" />
                  </td>
                  <td class="py-1.5 pr-3 valor-linea-corte">${formatoMoneda(existente ? existente.valor_periodo : 0)}</td>
                </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button class="btn-guardar-avances rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700">
            Guardar avances
          </button>
          <button class="btn-generar-factura rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-50" ${yaFacturado ? "disabled" : ""}>
            ${yaFacturado ? "Factura ya generada ✓" : "Generar factura al cliente"}
          </button>
          <button class="btn-generar-cortes-contratista rounded-lg border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50" ${contratistasEnCorte.length ? "" : "disabled"}>
            Generar cortes de pago a contratistas
          </button>
        </div>
      </div>
    </div>`;
  }

  function conectarEventosCorte(corte) {
    const card = document.querySelector(`[data-corte-card="${corte.id}"]`);
    if (!card) return;

    card.querySelector(".btn-toggle-corte").addEventListener("click", () => {
      card.querySelector(".panel-corte").classList.toggle("hidden");
    });

    card.querySelectorAll(".input-cantidad-corte").forEach((input) => {
      input.addEventListener("input", () => {
        const fila = input.closest("tr");
        const piId = fila.dataset.presupuestoItemId;
        const pi = presupuestoCache.find((p) => p.id === piId);
        const cantidad = Number(input.value || 0);
        fila.querySelector(".valor-linea-corte").textContent = formatoMoneda(cantidad * Number(pi?.valor_unitario || 0));
      });
    });

    card.querySelector(".btn-guardar-avances").addEventListener("click", async () => {
      const filas = card.querySelectorAll(".tabla-items-corte tr");
      const payloads = [];
      filas.forEach((fila) => {
        const piId = fila.dataset.presupuestoItemId;
        const cantidad = Number(fila.querySelector(".input-cantidad-corte").value || 0);
        if (cantidad <= 0) return;
        const pi = presupuestoCache.find((p) => p.id === piId);
        payloads.push({
          corte_id: corte.id,
          presupuesto_item_id: piId,
          cantidad_periodo: cantidad,
          valor_unitario_snapshot: Number(pi?.valor_unitario || 0),
        });
      });
      if (!payloads.length) return mostrarAviso("No ingresaste ninguna cantidad para guardar", "error");

      const { error } = await window.sb.from("ejecucion_items").upsert(payloads, { onConflict: "corte_id,presupuesto_item_id" });
      if (error) return manejarError(error, "No se pudo guardar los avances");
      mostrarAviso("Avances guardados", "exito");
      cargarCortesEjecucion();
    });

    card.querySelector(".btn-generar-factura").addEventListener("click", async () => {
      if (card.querySelector(".btn-generar-factura").disabled) return;
      const items = corte.ejecucion_items || [];
      const total = items.reduce((a, i) => a + Number(i.valor_periodo || 0), 0);
      if (total <= 0) return mostrarAviso("Este corte no tiene valor para facturar. Guarda avances primero.", "error");
      if (!confirm(`¿Generar una factura al cliente por ${formatoMoneda(total)} para el Corte N° ${corte.numero_corte}?`)) return;

      const { data: factura, error: errorFactura } = await window.sb
        .from("facturas")
        .insert({
          proyecto_id: proyectoId,
          numero_factura: `Corte ${corte.numero_corte}`,
          valor: total,
          fecha_emision: new Date().toISOString().slice(0, 10),
          estado: "pendiente",
          notas: `Generada automáticamente desde el Corte de Ejecución N° ${corte.numero_corte}`,
        })
        .select()
        .single();
      if (errorFactura) return manejarError(errorFactura, "No se pudo generar la factura");

      const { error: errorGen } = await window.sb.from("ejecucion_generaciones").insert({
        corte_id: corte.id,
        tipo: "factura",
        factura_id: factura.id,
      });
      if (errorGen) return manejarError(errorGen, "La factura se creó pero no se pudo registrar la generación");

      mostrarAviso("Factura generada correctamente", "exito");
      cargarCortesEjecucion();
      cargarFacturas();
    });

    card.querySelector(".btn-generar-cortes-contratista").addEventListener("click", async () => {
      if (card.querySelector(".btn-generar-cortes-contratista").disabled) return;
      const items = corte.ejecucion_items || [];
      const generadosPrevios = new Set(
        (corte.ejecucion_generaciones || [])
          .filter((g) => g.tipo === "corte_contratista")
          .map((g) => g.proyecto_contratista_id)
      );

      const porContratista = {};
      items.forEach((i) => {
        const contratistaId = i.presupuesto_items?.contratista_id;
        if (!contratistaId) return;
        porContratista[contratistaId] = (porContratista[contratistaId] || 0) + Number(i.valor_periodo || 0);
      });

      const contratistaIds = Object.keys(porContratista);
      if (!contratistaIds.length) return mostrarAviso("Ningún renglón de este corte tiene contratista asignado.", "error");

      if (!confirm(`¿Generar cortes de pago para ${contratistaIds.length} contratista(s) con base en este corte de ejecución?`)) return;

      let generados = 0;
      for (const contratistaId of contratistaIds) {
        const bruto = porContratista[contratistaId];
        if (bruto <= 0) continue;

        // Buscar o crear el vínculo proyecto_contratistas
        let { data: vinculo } = await window.sb
          .from("proyecto_contratistas")
          .select("id")
          .eq("proyecto_id", proyectoId)
          .eq("contratista_id", contratistaId)
          .maybeSingle();

        if (!vinculo) {
          const { data: nuevoVinculo, error: errVinculo } = await window.sb
            .from("proyecto_contratistas")
            .insert({ proyecto_id: proyectoId, contratista_id: contratistaId, valor_contratado: 0 })
            .select()
            .single();
          if (errVinculo) {
            manejarError(errVinculo, "No se pudo vincular el contratista al proyecto");
            continue;
          }
          vinculo = nuevoVinculo;
        }

        if (generadosPrevios.has(vinculo.id)) continue;

        const contratista = contratistasCache.find((c) => c.id === contratistaId);
        const { data: infoContratista } = await window.sb
          .from("contratistas")
          .select("porcentaje_retencion")
          .eq("id", contratistaId)
          .single();
        const porcentaje = Number(infoContratista?.porcentaje_retencion || 0);
        const retenciones = Math.round(bruto * (porcentaje / 100));

        const { data: nuevoCorte, error: errCorte } = await window.sb
          .from("cortes_pago")
          .insert({
            proyecto_contratista_id: vinculo.id,
            valor_bruto: bruto,
            retenciones,
            estado: "en_tramite",
          })
          .select()
          .single();
        if (errCorte) {
          manejarError(errCorte, "No se pudo generar el corte de pago");
          continue;
        }

        const { error: errGen } = await window.sb.from("ejecucion_generaciones").insert({
          corte_id: corte.id,
          tipo: "corte_contratista",
          corte_pago_id: nuevoCorte.id,
          proyecto_contratista_id: vinculo.id,
        });
        if (errGen) manejarError(errGen, "El corte de pago se creó pero no se pudo registrar la generación");
        generados++;
      }

      if (generados) mostrarAviso(`${generados} corte(s) de pago generado(s)`, "exito");
      else mostrarAviso("No se generó ningún corte nuevo (ya existían o el valor era cero)", "info");
      cargarCortesEjecucion();
      cargarContratistasProyecto();
    });
  }

  document.getElementById("btn-nuevo-corte").addEventListener("click", async () => {
    const { data: existentes } = await window.sb
      .from("ejecucion_cortes")
      .select("numero_corte")
      .eq("proyecto_id", proyectoId)
      .order("numero_corte", { ascending: false })
      .limit(1);
    const siguiente = existentes?.length ? existentes[0].numero_corte + 1 : 1;
    const descripcion = prompt(`Descripción para el Corte N° ${siguiente} (opcional):`, "") || null;
    const { error } = await window.sb.from("ejecucion_cortes").insert({
      proyecto_id: proyectoId,
      numero_corte: siguiente,
      descripcion,
    });
    if (error) return manejarError(error, "No se pudo crear el corte");
    mostrarAviso(`Corte N° ${siguiente} creado`, "exito");
    cargarCortesEjecucion();
  });

  // --------------------------------------------------------------------
  // Arranque
  // --------------------------------------------------------------------
  activarCamposMoneda();
  await cargarProyecto();
  await cargarContratistasSelectPresupuesto();
  await cargarPresupuesto();
  await Promise.all([
    cargarFacturas(),
    cargarProveedoresSelect().then(cargarCompras),
    cargarContratistasSelect().then(cargarContratistasProyecto),
    cargarCortesEjecucion(),
  ]);

  activarTab(qs("tab") || "resumen");
})();
