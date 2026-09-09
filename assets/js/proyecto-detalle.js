(async () => {
  const { session } = await window.pctronicReady;

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
      .select("*, clientes(id, nombre), empresas(id, nombre, logo_url)")
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
            <div class="rounded-lg bg-gray-50 p-3 text-sm">
              <span class="text-gray-600">Valor antes de impuestos (Subtotal de la Cotización): </span>
              <span class="font-semibold text-gray-900">${formatoMoneda(proyecto.valor_antes_impuestos || 0)}</span>
              <p class="mt-1 text-xs text-gray-400">Se calcula solo desde la pestaña Cotización. Aquí solo defines el tipo de contrato y los porcentajes.</p>
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
    const campos = ["c-iva", "c-admin", "c-imprev", "c-util"].map((id) => document.getElementById(id));

    function actualizarBloques() {
      const tipo = document.querySelector('input[name="c-tipo-contrato"]:checked')?.value || "iva";
      bloqueIva.classList.toggle("hidden", tipo !== "iva");
      bloqueAiu.classList.toggle("hidden", tipo !== "aiu");
      actualizarPreview();
    }
    function actualizarPreview() {
      const tipo = document.querySelector('input[name="c-tipo-contrato"]:checked')?.value || "iva";
      const base = Number(proyecto.valor_antes_impuestos || 0);
      const iva = Number(document.getElementById("c-iva").value || 0);
      let total;
      if (tipo === "aiu") {
        const admin = Number(document.getElementById("c-admin").value || 0);
        const imprev = Number(document.getElementById("c-imprev").value || 0);
        const util = Number(document.getElementById("c-util").value || 0);
        total = base * (1 + (admin + imprev + util) / 100) + base * (util / 100) * (iva / 100);
      } else {
        total = base * (1 + iva / 100);
      }
      document.getElementById("c-preview-total").textContent = formatoMoneda(total);
    }

    radios.forEach((r) => r.addEventListener("change", actualizarBloques));
    campos.forEach((el) => el.addEventListener("input", actualizarPreview));

    document.querySelector(`input[name="c-tipo-contrato"][value="${proyecto.tipo_contrato}"]`).checked = true;
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
    const [{ data: facturas }, { data: compras }, { data: vinculos }] = await Promise.all([
      window.sb.from("facturas").select("valor, estado").eq("proyecto_id", proyectoId),
      window.sb.from("compras").select("valor").eq("proyecto_id", proyectoId),
      window.sb.from("proyecto_contratistas").select("cortes_pago(valor_neto)").eq("proyecto_id", proyectoId),
    ]);

    const totalFacturado = (facturas || []).reduce((a, f) => a + Number(f.valor || 0), 0);
    const totalComprado = (compras || []).reduce((a, c) => a + Number(c.valor || 0), 0);
    const totalPagadoContratistas = (vinculos || []).reduce(
      (a, v) => a + (v.cortes_pago || []).reduce((a2, c) => a2 + Number(c.valor_neto || 0), 0),
      0
    );
    const costosTotales = totalComprado + totalPagadoContratistas;
    const valorTotalContrato = Number(proyecto.valor_total || 0);
    const utilidadEstimada = valorTotalContrato - costosTotales;
    // Margen bruto = (Valor total del contrato − Costos totales) ÷ Valor total del contrato
    const margenBruto = valorTotalContrato > 0 ? (utilidadEstimada / valorTotalContrato) * 100 : 0;

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
      kpi("shopping_cart", "Costos (compras + contratistas)", formatoMoneda(costosTotales), "bg-amber-100 text-amber-700") +
      kpi("trending_up", "Utilidad Estimada", formatoMoneda(utilidadEstimada), utilidadEstimada >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700") +
      kpi("percent", "Margen Bruto", `${margenBruto.toFixed(1)}%`, margenBruto >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700");

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
  // COTIZACIÓN (lado venta — alimenta el valor del contrato y el Corte de Obra)
  // --------------------------------------------------------------------
  let cotizacionCache = [];

  function actualizarTotalesCotizacion() {
    const subtotal = cotizacionCache.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.precio_unitario || 0), 0);
    const tipo = proyecto?.tipo_contrato || "iva";
    const iva = Number(proyecto?.iva_porcentaje || 0);
    document.getElementById("cot-subtotal").textContent = formatoMoneda(subtotal);

    if (tipo === "aiu") {
      const admin = Number(proyecto?.administracion_porcentaje || 0);
      const imprev = Number(proyecto?.imprevistos_porcentaje || 0);
      const util = Number(proyecto?.utilidad_porcentaje || 0);
      const valorAdmin = subtotal * (admin / 100);
      const valorImprev = subtotal * (imprev / 100);
      const valorUtil = subtotal * (util / 100);
      const valorIvaUtil = valorUtil * (iva / 100);
      document.getElementById("cot-bloque-iva").classList.add("hidden");
      document.getElementById("cot-bloque-aiu").classList.remove("hidden");
      document.getElementById("cot-valor-admin").textContent = formatoMoneda(valorAdmin);
      document.getElementById("cot-valor-imprev").textContent = formatoMoneda(valorImprev);
      document.getElementById("cot-valor-util").textContent = formatoMoneda(valorUtil);
      document.getElementById("cot-label-iva-util").textContent = `IVA sobre la Utilidad (${iva}%)`;
      document.getElementById("cot-valor-iva-util").textContent = formatoMoneda(valorIvaUtil);
      document.getElementById("cot-total").textContent = formatoMoneda(subtotal + valorAdmin + valorImprev + valorUtil + valorIvaUtil);
    } else {
      const valorIva = subtotal * (iva / 100);
      document.getElementById("cot-bloque-iva").classList.remove("hidden");
      document.getElementById("cot-bloque-aiu").classList.add("hidden");
      document.getElementById("cot-label-iva").textContent = `IVA (${iva}%)`;
      document.getElementById("cot-valor-iva").textContent = formatoMoneda(valorIva);
      document.getElementById("cot-label-iva-util").textContent = "IVA sobre la Utilidad";
      document.getElementById("cot-valor-iva-util").textContent = formatoMoneda(0);
      document.getElementById("cot-total").textContent = formatoMoneda(subtotal + valorIva);
    }
  }

  async function sincronizarValorContrato() {
    const subtotal = cotizacionCache.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.precio_unitario || 0), 0);
    const { error } = await window.sb.from("proyectos").update({ valor_antes_impuestos: subtotal }).eq("id", proyectoId);
    if (!error && proyecto) proyecto.valor_antes_impuestos = subtotal;
  }

  function renderCotizacion() {
    document.getElementById("tabla-cotizacion").innerHTML = cotizacionCache.length
      ? cotizacionCache
          .map(
            (item) => `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="px-3 py-2.5">${item.numero ?? "—"}</td>
          <td class="px-3 py-2.5">${escapeHtml(item.referencia || "—")}</td>
          <td class="px-3 py-2.5">${escapeHtml(item.descripcion)}</td>
          <td class="px-3 py-2.5">${item.cantidad}</td>
          <td class="px-3 py-2.5">${escapeHtml(item.unidad || "un")}</td>
          <td class="px-3 py-2.5">${escapeHtml(item.tiempo_entrega || "—")}</td>
          <td class="px-3 py-2.5">${escapeHtml(item.marca || "—")}</td>
          <td class="px-3 py-2.5">${formatoMoneda(item.precio_unitario)}</td>
          <td class="px-3 py-2.5 font-medium">${formatoMoneda(item.subtotal)}</td>
          <td class="px-3 py-2.5 text-xs text-gray-500">${escapeHtml(item.observaciones || "—")}</td>
          <td class="px-3 py-2.5 text-right">
            <button class="btn-borrar-cotizacion text-gray-400 hover:text-red-600" data-id="${item.id}">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-3 py-6 text-center text-gray-400" colspan="11">Aún no has agregado renglones a la cotización.</td></tr>`;

    document.querySelectorAll(".btn-borrar-cotizacion").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar este renglón de la cotización?")) return;
        const { error } = await window.sb.from("cotizacion_items").delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar");
        await cargarCotizacion();
        sincronizarValorContrato();
      })
    );
    actualizarTotalesCotizacion();
  }

  async function cargarCotizacion() {
    const { data, error } = await window.sb.from("cotizacion_items").select("*").eq("proyecto_id", proyectoId).order("numero").order("created_at");
    if (error) return manejarError(error, "No se pudo cargar la cotización");
    cotizacionCache = data || [];
    renderCotizacion();
  }

  document.getElementById("form-cotizacion-item").addEventListener("submit", async (e) => {
    e.preventDefault();
    const numeroTxt = document.getElementById("cot-item-numero").value;
    const payload = {
      proyecto_id: proyectoId,
      numero: numeroTxt === "" ? null : Number(numeroTxt),
      referencia: document.getElementById("cot-item-referencia").value.trim() || null,
      descripcion: document.getElementById("cot-item-descripcion").value.trim(),
      cantidad: Number(document.getElementById("cot-item-cantidad").value || 1),
      unidad: document.getElementById("cot-item-unidad").value.trim() || "un",
      tiempo_entrega: document.getElementById("cot-item-tiempo").value.trim() || null,
      marca: document.getElementById("cot-item-marca").value.trim() || null,
      precio_unitario: valorMoneda(document.getElementById("cot-item-precio")),
      observaciones: document.getElementById("cot-item-observaciones").value.trim() || null,
    };
    const { error } = await window.sb.from("cotizacion_items").insert(payload);
    if (error) return manejarError(error, "No se pudo agregar el renglón");
    e.target.reset();
    document.getElementById("cot-item-cantidad").value = 1;
    await cargarCotizacion();
    sincronizarValorContrato();
  });

  const COLUMNAS_PLANTILLA_COTIZACION = [
    "numero",
    "referencia",
    "descripcion",
    "cantidad",
    "unidad",
    "tiempo_entrega",
    "marca",
    "precio_unitario",
    "observaciones",
  ];

  document.getElementById("btn-plantilla-cotizacion").addEventListener("click", () => {
    descargarPlantillaExcel("plantilla_cotizacion.xlsx", COLUMNAS_PLANTILLA_COTIZACION, [
      [1, "REF-001", "Cámara domo 4MP", 10, "un", "8 días", "Dahua", 350000, ""],
    ]);
  });

  document.getElementById("input-importar-cotizacion").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const filas = await leerArchivoExcel(file);
      if (!filas.length) return mostrarAviso("El archivo no tiene filas para importar", "error");
      const payloads = filas
        .filter((f) => String(f.descripcion || "").trim())
        .map((f) => ({
          proyecto_id: proyectoId,
          numero: f.numero !== "" && f.numero != null ? Number(f.numero) : null,
          referencia: String(f.referencia || "").trim() || null,
          descripcion: String(f.descripcion).trim(),
          cantidad: Number(f.cantidad || 1),
          unidad: String(f.unidad || "un").trim() || "un",
          tiempo_entrega: String(f.tiempo_entrega || "").trim() || null,
          marca: String(f.marca || "").trim() || null,
          precio_unitario: Number(f.precio_unitario || 0),
          observaciones: String(f.observaciones || "").trim() || null,
        }));
      if (!payloads.length) return mostrarAviso("No se encontraron filas válidas (falta la descripción)", "error");
      const { error } = await window.sb.from("cotizacion_items").insert(payloads);
      if (error) return manejarError(error, "No se pudo importar la cotización");
      mostrarAviso(`${payloads.length} renglones importados`, "exito");
      await cargarCotizacion();
      sincronizarValorContrato();
    } catch (err) {
      manejarError(err, "No se pudo leer el archivo Excel");
    } finally {
      e.target.value = "";
    }
  });

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

  // Suma, por categoría, lo realmente ejecutado hasta la fecha para calcular
  // el % de presupuesto gastado. Mano de Obra (MO) se mide con lo avanzado en
  // los Cortes de Contratista (ejecucion_items); Materiales/Equipos/Alquiler/
  // Otro se miden con las Compras reales registradas para el proyecto.
  async function calcularEjecutadoPorTipo() {
    const acumulado = {};

    const { data: cortes } = await window.sb.from("ejecucion_cortes").select("id").eq("proyecto_id", proyectoId);
    const corteIds = (cortes || []).map((c) => c.id);
    if (corteIds.length) {
      const { data: items } = await window.sb
        .from("ejecucion_items")
        .select("valor_periodo, item_tipo")
        .in("corte_id", corteIds)
        .eq("item_tipo", "mano_obra");
      acumulado.MO = (items || []).reduce((a, i) => a + Number(i.valor_periodo || 0), 0);
    }

    const { data: compras } = await window.sb.from("compras").select("valor, categoria").eq("proyecto_id", proyectoId);
    const CATEGORIA_COMPRA_A_TIPO = { materiales: "MP", equipos: "EQUIPO", alquiler: "ALQUILER", otros: "OTRO" };
    (compras || []).forEach((c) => {
      const tipo = CATEGORIA_COMPRA_A_TIPO[c.categoria];
      if (!tipo) return; // compras categoría 'mano_obra' no aplica aquí (la MO se mide por Cortes)
      acumulado[tipo] = (acumulado[tipo] || 0) + Number(c.valor || 0);
    });

    return acumulado;
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
    const totalGeneral = totalMO + totalMP + totalEquipo + totalAlquiler + totalOtro;

    document.getElementById("presu-total-mo").textContent = formatoMoneda(totalMO);
    document.getElementById("presu-total-mp").textContent = formatoMoneda(totalMP);
    document.getElementById("presu-total-equipo").textContent = formatoMoneda(totalEquipo);
    document.getElementById("presu-total-alquiler").textContent = formatoMoneda(totalAlquiler);
    document.getElementById("presu-total-otro").textContent = formatoMoneda(totalOtro);
    document.getElementById("presu-total-general").textContent = formatoMoneda(totalGeneral);

    const ejecutadoPorTipo = await calcularEjecutadoPorTipo();
    const pintarPct = (sufijo, ejecutado, presupuestado) => {
      const pct = presupuestado > 0 ? Math.min(100, Math.round((ejecutado / presupuestado) * 100)) : 0;
      const barra = document.getElementById(`presu-pct-${sufijo}`);
      const texto = document.getElementById(`presu-pct-${sufijo}-txt`);
      if (barra) barra.style.width = `${pct}%`;
      if (texto) texto.textContent = `${pct}%`;
    };
    pintarPct("mo", ejecutadoPorTipo.MO || 0, totalMO);
    pintarPct("mp", ejecutadoPorTipo.MP || 0, totalMP);
    pintarPct("equipo", ejecutadoPorTipo.EQUIPO || 0, totalEquipo);
    pintarPct("alquiler", ejecutadoPorTipo.ALQUILER || 0, totalAlquiler);
    pintarPct("otro", ejecutadoPorTipo.OTRO || 0, totalOtro);
    const totalEjecutado = Object.values(ejecutadoPorTipo).reduce((a, v) => a + v, 0);
    pintarPct("general", totalEjecutado, totalGeneral);

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

    const etiquetaCat = { equipos: "Equipos", mano_obra: "Mano de Obra", materiales: "Materiales", alquiler: "Alquiler", otros: "Otros" };

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
                <input class="corte-bruto input-moneda w-full rounded-lg border-gray-300 text-xs" inputmode="decimal" />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-700">Retenciones</label>
                <input class="corte-retenciones input-moneda w-full rounded-lg border-gray-300 text-xs" inputmode="decimal" />
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
  let todosLosCortesCache = [];

  async function cargarCortesEjecucion() {
    const { data: cortes, error } = await window.sb
      .from("ejecucion_cortes")
      .select("*, ejecucion_items(*, cotizacion_items(*), presupuesto_items(*, contratistas(nombre))), ejecucion_generaciones(*)")
      .eq("proyecto_id", proyectoId)
      .order("numero_corte", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar la ejecución");

    todosLosCortesCache = cortes || [];
    const cont = document.getElementById("lista-cortes");
    if (!cortes.length) {
      cont.innerHTML = `<p class="rounded-xl border border-dashed border-gray-300 p-6 text-center text-gray-400">Aún no has creado ningún corte de obra. Crea uno para registrar avances/instalaciones.</p>`;
      return;
    }

    cont.innerHTML = cortes.map((corte) => renderCorteCard(corte, cortes)).join("");

    cortes.forEach((corte) => conectarEventosCorte(corte));
  }

  // Cantidad acumulada ejecutada de un renglón hasta (e incluyendo) el corte dado,
  // sumando todos los cortes con numero_corte <= corte.numero_corte.
  // itemTipo: 'cotizacion' (Corte de Obra) | 'mano_obra' (Corte de Contratista)
  function acumuladoHasta(itemId, itemTipo, corte, todosLosCortes) {
    const campo = itemTipo === "cotizacion" ? "cotizacion_item_id" : "presupuesto_item_id";
    return todosLosCortes
      .filter((c) => c.numero_corte <= corte.numero_corte)
      .reduce((acc, c) => {
        const item = (c.ejecucion_items || []).find((i) => i.item_tipo === itemTipo && i[campo] === itemId);
        return acc + Number(item?.cantidad_periodo || 0);
      }, 0);
  }

  function renderCorteCard(corte, todosLosCortes) {
    const items = corte.ejecucion_items || [];
    const itemsObra = items.filter((i) => i.item_tipo === "cotizacion");
    const itemsMO = items.filter((i) => i.item_tipo === "mano_obra");
    const totalObra = itemsObra.reduce((a, i) => a + Number(i.valor_periodo || 0), 0);
    const yaFacturado = (corte.ejecucion_generaciones || []).some((g) => g.tipo === "factura");
    const moDelPresupuesto = presupuestoCache.filter((pi) => pi.tipo === "MO");
    const contratistasEnCorte = [...new Set(itemsMO.map((i) => i.presupuesto_items?.contratista_id).filter(Boolean))];

    const filaObra = (ci) => {
      const existente = itemsObra.find((i) => i.cotizacion_item_id === ci.id);
      const acumulado = acumuladoHasta(ci.id, "cotizacion", corte, todosLosCortes);
      const pendiente = Number(ci.cantidad) - acumulado;
      return `
      <tr data-cotizacion-item-id="${ci.id}" data-item-tipo="cotizacion" data-ejecucion-item-id="${existente ? existente.id : ""}">
        <td class="py-1.5 pr-3">${escapeHtml(ci.descripcion)}</td>
        <td class="py-1.5 pr-3">${ci.cantidad} ${escapeHtml(ci.unidad || "")}</td>
        <td class="py-1.5 pr-3">${acumulado} ${escapeHtml(ci.unidad || "")}</td>
        <td class="py-1.5 pr-3 ${pendiente < 0 ? "text-red-600 font-semibold" : ""}">${pendiente} ${escapeHtml(ci.unidad || "")}</td>
        <td class="py-1.5 pr-3">${formatoMoneda(ci.precio_unitario)}</td>
        <td class="py-1.5 pr-3">
          <input type="number" min="0" step="0.01" class="input-cantidad-corte w-24 rounded-lg border-gray-300 text-xs"
            value="${existente ? existente.cantidad_periodo : ""}" placeholder="0" data-valor-unitario="${ci.precio_unitario}" />
        </td>
        <td class="py-1.5 pr-3 valor-linea-corte">${formatoMoneda(existente ? existente.valor_periodo : 0)}</td>
      </tr>`;
    };

    const filaMO = (pi) => {
      const existente = itemsMO.find((i) => i.presupuesto_item_id === pi.id);
      const acumulado = acumuladoHasta(pi.id, "mano_obra", corte, todosLosCortes);
      const pendiente = Number(pi.cantidad) - acumulado;
      return `
      <tr data-presupuesto-item-id="${pi.id}" data-item-tipo="mano_obra" data-ejecucion-item-id="${existente ? existente.id : ""}">
        <td class="py-1.5 pr-3">${escapeHtml(pi.descripcion)}</td>
        <td class="py-1.5 pr-3">${escapeHtml(pi.contratistas?.nombre || "—")}</td>
        <td class="py-1.5 pr-3">${pi.cantidad} ${escapeHtml(pi.unidad || "")}</td>
        <td class="py-1.5 pr-3">${acumulado} ${escapeHtml(pi.unidad || "")}</td>
        <td class="py-1.5 pr-3 ${pendiente < 0 ? "text-red-600 font-semibold" : ""}">${pendiente} ${escapeHtml(pi.unidad || "")}</td>
        <td class="py-1.5 pr-3">${formatoMoneda(pi.valor_unitario)}</td>
        <td class="py-1.5 pr-3">
          <input type="number" min="0" step="0.01" class="input-cantidad-corte w-24 rounded-lg border-gray-300 text-xs"
            value="${existente ? existente.cantidad_periodo : ""}" placeholder="0" data-valor-unitario="${pi.valor_unitario}" />
        </td>
        <td class="py-1.5 pr-3 valor-linea-corte">${formatoMoneda(existente ? existente.valor_periodo : 0)}</td>
      </tr>`;
    };

    return `
    <div class="rounded-xl border border-gray-200 bg-white p-4" data-corte-card="${corte.id}">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-bold text-gray-900">Corte de Obra N° ${corte.numero_corte} — ${formatoFecha(corte.fecha_corte)}</p>
          <p class="text-xs text-gray-500">${escapeHtml(corte.descripcion || "")}</p>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right">
            <p class="text-xs text-gray-500">Valor de este corte (Obra)</p>
            <p class="font-semibold text-primary">${formatoMoneda(totalObra)}</p>
          </div>
          <button class="btn-toggle-corte rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            Ver / editar avances
          </button>
        </div>
      </div>

      <div class="hidden mt-4 border-t border-gray-100 pt-4 panel-corte">
        <p class="mb-1 text-xs font-bold uppercase text-gray-500">Avance de Obra (Cotización → Factura Cliente)</p>
        <p class="mb-2 text-xs text-gray-500">Cantidades iniciales (de la cotización), acumulado ejecutado, pendiente y lo ejecutado en este corte.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="text-gray-500">
              <tr>
                <th class="py-1.5 pr-3">Renglón</th>
                <th class="py-1.5 pr-3">Cant. Inicial</th>
                <th class="py-1.5 pr-3">Ejecutado Acum.</th>
                <th class="py-1.5 pr-3">Pendiente</th>
                <th class="py-1.5 pr-3">Vlr. Unitario</th>
                <th class="py-1.5 pr-3">Cant. este corte</th>
                <th class="py-1.5 pr-3">Valor del corte</th>
              </tr>
            </thead>
            <tbody class="tabla-items-corte-obra">
              ${
                cotizacionCache.length
                  ? cotizacionCache.map(filaObra).join("")
                  : `<tr><td class="py-3 text-gray-400" colspan="7">Este proyecto no tiene renglones de cotización.</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <p class="mb-1 mt-5 text-xs font-bold uppercase text-gray-500">Avance de Mano de Obra (Contratistas)</p>
        <p class="mb-2 text-xs text-gray-500">Cantidades iniciales (presupuesto de mano de obra), acumulado, pendiente y lo ejecutado en este corte.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="text-gray-500">
              <tr>
                <th class="py-1.5 pr-3">Renglón</th>
                <th class="py-1.5 pr-3">Contratista</th>
                <th class="py-1.5 pr-3">Cant. Inicial</th>
                <th class="py-1.5 pr-3">Ejecutado Acum.</th>
                <th class="py-1.5 pr-3">Pendiente</th>
                <th class="py-1.5 pr-3">Vlr. Unitario</th>
                <th class="py-1.5 pr-3">Cant. este corte</th>
                <th class="py-1.5 pr-3">Valor del corte</th>
              </tr>
            </thead>
            <tbody class="tabla-items-corte-mo">
              ${
                moDelPresupuesto.length
                  ? moDelPresupuesto.map(filaMO).join("")
                  : `<tr><td class="py-3 text-gray-400" colspan="8">Este proyecto no tiene renglones de mano de obra.</td></tr>`
              }
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
          <button class="btn-pdf-corte-cliente rounded-lg border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <span class="material-symbols-outlined align-middle text-[14px]">picture_as_pdf</span> Acta (Cliente)
          </button>
          ${
            contratistasEnCorte
              .map(
                (cid) => `
          <button class="btn-pdf-corte-contratista rounded-lg border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50" data-contratista-id="${cid}">
            <span class="material-symbols-outlined align-middle text-[14px]">picture_as_pdf</span> Acta (${escapeHtml(contratistasCache.find((c) => c.id === cid)?.nombre || "Contratista")})
          </button>`
              )
              .join("")
          }
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
        const cantidad = Number(input.value || 0);
        const valorUnitario = Number(input.dataset.valorUnitario || 0);
        fila.querySelector(".valor-linea-corte").textContent = formatoMoneda(cantidad * valorUnitario);
      });
    });

    card.querySelector(".btn-guardar-avances").addEventListener("click", async () => {
      // No usamos upsert(onConflict:...) porque el índice único de esta tabla
      // es parcial (solo aplica a cotizacion_item_id o a presupuesto_item_id
      // según el renglón) y Postgres no permite usarlo como objetivo de
      // ON CONFLICT sin repetir su condición — así que actualizamos por id si
      // el renglón ya existía, o insertamos uno nuevo si no.
      const filas = [
        ...card.querySelectorAll(".tabla-items-corte-obra tr[data-cotizacion-item-id]"),
        ...card.querySelectorAll(".tabla-items-corte-mo tr[data-presupuesto-item-id]"),
      ];
      const actualizaciones = [];
      const inserciones = [];
      filas.forEach((fila) => {
        const inputCantidad = fila.querySelector(".input-cantidad-corte");
        const cantidad = Number(inputCantidad?.value || 0);
        if (cantidad <= 0) return;
        const valorUnitarioSnapshot = Number(inputCantidad.dataset.valorUnitario || 0);
        const ejecucionItemId = fila.dataset.ejecucionItemId;
        if (ejecucionItemId) {
          actualizaciones.push(
            window.sb
              .from("ejecucion_items")
              .update({ cantidad_periodo: cantidad, valor_unitario_snapshot: valorUnitarioSnapshot })
              .eq("id", ejecucionItemId)
          );
        } else {
          const itemTipo = fila.dataset.itemTipo;
          inserciones.push({
            corte_id: corte.id,
            item_tipo: itemTipo,
            cotizacion_item_id: itemTipo === "cotizacion" ? fila.dataset.cotizacionItemId : null,
            presupuesto_item_id: itemTipo === "mano_obra" ? fila.dataset.presupuestoItemId : null,
            cantidad_periodo: cantidad,
            valor_unitario_snapshot: valorUnitarioSnapshot,
          });
        }
      });
      if (!actualizaciones.length && !inserciones.length) return mostrarAviso("No ingresaste ninguna cantidad para guardar", "error");

      const resultados = await Promise.all([
        ...actualizaciones,
        inserciones.length ? window.sb.from("ejecucion_items").insert(inserciones) : Promise.resolve({ error: null }),
      ]);
      const error = resultados.find((r) => r.error)?.error;
      if (error) return manejarError(error, "No se pudo guardar los avances");
      mostrarAviso("Avances guardados", "exito");
      cargarCortesEjecucion();
    });

    card.querySelector(".btn-generar-factura").addEventListener("click", async () => {
      if (card.querySelector(".btn-generar-factura").disabled) return;
      const items = (corte.ejecucion_items || []).filter((i) => i.item_tipo === "cotizacion");
      const total = items.reduce((a, i) => a + Number(i.valor_periodo || 0), 0);
      if (total <= 0) return mostrarAviso("Este corte no tiene valor de Obra para facturar. Guarda avances primero.", "error");
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
      const items = (corte.ejecucion_items || []).filter((i) => i.item_tipo === "mano_obra");
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

    const btnPdfCliente = card.querySelector(".btn-pdf-corte-cliente");
    if (btnPdfCliente) {
      btnPdfCliente.addEventListener("click", () => {
        if (typeof generarActaCortePDF !== "function") return mostrarAviso("El generador de PDF aún no está disponible", "error");
        generarActaCortePDF({
          proyecto,
          corte,
          todosLosCortes: todosLosCortesCache,
          items: cotizacionCache.map((ci) => ({
            id: ci.id,
            descripcion: ci.descripcion,
            unidad: ci.unidad,
            cantidad: ci.cantidad,
            valor_unitario: ci.precio_unitario,
            valor_total: ci.subtotal,
          })),
          itemTipo: "cotizacion",
          valorContratoTotal: Number(proyecto.valor_total || 0),
          variante: "cliente",
        });
      });
    }

    card.querySelectorAll(".btn-pdf-corte-contratista").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof generarActaCortePDF !== "function") return mostrarAviso("El generador de PDF aún no está disponible", "error");
        const contratistaId = btn.dataset.contratistaId;
        const itemsContratista = presupuestoCache.filter((pi) => pi.tipo === "MO" && pi.contratista_id === contratistaId);
        generarActaCortePDF({
          proyecto,
          corte,
          todosLosCortes: todosLosCortesCache,
          items: itemsContratista.map((pi) => ({
            id: pi.id,
            descripcion: pi.descripcion,
            unidad: pi.unidad,
            cantidad: pi.cantidad,
            valor_unitario: pi.valor_unitario,
            valor_total: pi.valor_total,
          })),
          itemTipo: "mano_obra",
          valorContratoTotal: itemsContratista.reduce((a, pi) => a + Number(pi.valor_total || 0), 0),
          variante: "contratista",
          contratistaId,
          contratistasCache,
        });
      });
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
  // TAREAS (Ejecución estilo Asana: Kanban + Gantt) — alimentan el % de avance
  // --------------------------------------------------------------------
  let tareasCache = [];
  const ESTADOS_TAREA = { todo: "Por Hacer", en_progreso: "En Progreso", revision: "Revisión", hecho: "Hecho" };
  const GANTT_PX_POR_DIA = 26;
  let ganttDragState = null;

  async function cargarTareas() {
    const { data, error } = await window.sb
      .from("tareas")
      .select("*, cotizacion_items(descripcion, subtotal)")
      .eq("proyecto_id", proyectoId)
      .order("orden");
    if (error) return manejarError(error, "No se pudo cargar las tareas");
    tareasCache = data || [];
    renderKanban();
    renderGantt();
  }

  function tarjetaTareaHtml(t) {
    return `
      <div class="tarea-card cursor-move rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-sm" draggable="true" data-tarea-id="${t.id}">
        <p class="font-semibold text-gray-800">${escapeHtml(t.titulo)}</p>
        ${t.cotizacion_items?.descripcion ? `<p class="mt-0.5 text-[11px] text-gray-400">Vinculada a: ${escapeHtml(t.cotizacion_items.descripcion)}</p>` : ""}
        <div class="mt-1.5 flex items-center justify-between text-[11px] text-gray-400">
          <span>${t.fecha_inicio ? formatoFecha(t.fecha_inicio) : "—"} → ${t.fecha_fin ? formatoFecha(t.fecha_fin) : "—"}</span>
          <button class="btn-borrar-tarea text-gray-300 hover:text-red-600" data-id="${t.id}">
            <span class="material-symbols-outlined text-[14px]">delete</span>
          </button>
        </div>
      </div>`;
  }

  function renderKanban() {
    Object.keys(ESTADOS_TAREA).forEach((estado) => {
      const lista = document.querySelector(`.kanban-lista[data-estado="${estado}"]`);
      if (!lista) return;
      const tareasEstado = tareasCache.filter((t) => t.estado === estado);
      lista.innerHTML = tareasEstado.length
        ? tareasEstado.map(tarjetaTareaHtml).join("")
        : `<p class="p-2 text-center text-[11px] text-gray-300">Sin tareas</p>`;
    });

    document.querySelectorAll(".tarea-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", card.dataset.tareaId);
        card.classList.add("opacity-40");
      });
      card.addEventListener("dragend", () => card.classList.remove("opacity-40"));
      card.querySelector(".btn-borrar-tarea").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("¿Borrar esta tarea?")) return;
        const { error } = await window.sb.from("tareas").delete().eq("id", card.dataset.tareaId);
        if (error) return manejarError(error, "No se pudo borrar la tarea");
        cargarTareas();
        cargarProyecto();
      });
    });

    document.querySelectorAll(".kanban-lista").forEach((lista) => {
      lista.addEventListener("dragover", (e) => e.preventDefault());
      lista.addEventListener("drop", async (e) => {
        e.preventDefault();
        const tareaId = e.dataTransfer.getData("text/plain");
        const nuevoEstado = lista.dataset.estado;
        const tarea = tareasCache.find((t) => t.id === tareaId);
        if (!tarea || tarea.estado === nuevoEstado) return;
        const { error } = await window.sb.from("tareas").update({ estado: nuevoEstado }).eq("id", tareaId);
        if (error) return manejarError(error, "No se pudo mover la tarea");
        cargarTareas();
        cargarProyecto();
      });
    });
  }

  function renderGantt() {
    const cont = document.getElementById("gantt-contenedor");
    if (!cont) return;
    const conFechas = tareasCache.filter((t) => t.fecha_inicio && t.fecha_fin);
    if (!conFechas.length) {
      cont.style.minWidth = "";
      cont.innerHTML = `<p class="p-6 text-center text-sm text-gray-400">Asigna fecha de inicio y fin a tus tareas para verlas aquí.</p>`;
      return;
    }

    const soloFecha = (f) => new Date(f + "T00:00:00");
    const fechas = conFechas.flatMap((t) => [soloFecha(t.fecha_inicio), soloFecha(t.fecha_fin)]);
    const minFecha = new Date(Math.min(...fechas));
    minFecha.setDate(minFecha.getDate() - 2);
    const maxFecha = new Date(Math.max(...fechas));
    maxFecha.setDate(maxFecha.getDate() + 3);
    const totalDias = Math.max(7, Math.round((maxFecha - minFecha) / 86400000));
    const anchoTimeline = totalDias * GANTT_PX_POR_DIA;
    const diasDesde = (fecha) => Math.round((soloFecha(fecha) - minFecha) / 86400000);

    let reglaHtml = "";
    for (let d = 0; d <= totalDias; d += 7) {
      const fecha = new Date(minFecha);
      fecha.setDate(fecha.getDate() + d);
      reglaHtml += `<div class="absolute top-0 h-full border-l border-gray-100 text-[10px] text-gray-400" style="left:${d * GANTT_PX_POR_DIA}px">
        <span class="pl-1">${fecha.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })}</span>
      </div>`;
    }

    const colorEstado = { hecho: "bg-green-500", en_progreso: "bg-blue-500", revision: "bg-amber-500", todo: "bg-gray-400" };

    const filasHtml = conFechas
      .map((t) => {
        const left = diasDesde(t.fecha_inicio) * GANTT_PX_POR_DIA;
        const width = Math.max(GANTT_PX_POR_DIA, (diasDesde(t.fecha_fin) - diasDesde(t.fecha_inicio) + 1) * GANTT_PX_POR_DIA);
        return `
        <div class="relative flex h-10 items-center border-t border-gray-50">
          <div class="sticky left-0 z-10 w-[190px] shrink-0 truncate bg-white pr-2 text-xs font-medium text-gray-700">${escapeHtml(t.titulo)}</div>
          <div class="relative h-full flex-1" style="min-width:${anchoTimeline}px">
            <div class="gantt-barra absolute flex items-center overflow-hidden rounded-md px-2 text-[11px] font-medium text-white ${colorEstado[t.estado] || "bg-gray-400"}"
              style="top:5px; left:${left}px; width:${width}px; height:30px;" data-tarea-id="${t.id}">
              <span class="truncate">${escapeHtml(t.titulo)}</span>
              <div class="gantt-resize absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/10"></div>
            </div>
          </div>
        </div>`;
      })
      .join("");

    cont.style.minWidth = `${anchoTimeline + 190}px`;
    cont.innerHTML = `
      <div class="relative flex h-6">
        <div class="sticky left-0 z-10 w-[190px] shrink-0 bg-white"></div>
        <div class="relative h-6 flex-1" style="min-width:${anchoTimeline}px">${reglaHtml}</div>
      </div>
      ${filasHtml}`;

    document.querySelectorAll(".gantt-barra").forEach((barra) => {
      const resizeHandle = barra.querySelector(".gantt-resize");
      barra.addEventListener("mousedown", (e) => {
        if (e.target === resizeHandle) return;
        ganttDragState = { tipo: "mover", tareaId: barra.dataset.tareaId, inicioX: e.clientX, leftOriginal: barra.offsetLeft };
        e.preventDefault();
      });
      resizeHandle.addEventListener("mousedown", (e) => {
        ganttDragState = { tipo: "resize", tareaId: barra.dataset.tareaId, inicioX: e.clientX, widthOriginal: barra.offsetWidth };
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  // Un único listener global de mousemove/mouseup para todo el Gantt (evita
  // acumular listeners en `document` cada vez que se vuelve a renderizar).
  document.addEventListener("mousemove", (e) => {
    if (!ganttDragState) return;
    const barra = document.querySelector(`.gantt-barra[data-tarea-id="${ganttDragState.tareaId}"]`);
    if (!barra) return;
    const dx = e.clientX - ganttDragState.inicioX;
    if (ganttDragState.tipo === "mover") {
      barra.style.left = `${Math.max(0, ganttDragState.leftOriginal + dx)}px`;
    } else {
      barra.style.width = `${Math.max(GANTT_PX_POR_DIA, ganttDragState.widthOriginal + dx)}px`;
    }
  });

  document.addEventListener("mouseup", async () => {
    if (!ganttDragState) return;
    const estado = ganttDragState;
    ganttDragState = null;
    const barra = document.querySelector(`.gantt-barra[data-tarea-id="${estado.tareaId}"]`);
    const tarea = tareasCache.find((t) => t.id === estado.tareaId);
    if (!barra || !tarea) return;

    if (estado.tipo === "mover") {
      const dx = parseInt(barra.style.left, 10) - estado.leftOriginal;
      const diasMovidos = Math.round(dx / GANTT_PX_POR_DIA);
      if (diasMovidos === 0) return;
      const nuevaInicio = new Date(tarea.fecha_inicio + "T00:00:00");
      nuevaInicio.setDate(nuevaInicio.getDate() + diasMovidos);
      const nuevaFin = new Date(tarea.fecha_fin + "T00:00:00");
      nuevaFin.setDate(nuevaFin.getDate() + diasMovidos);
      const { error } = await window.sb
        .from("tareas")
        .update({ fecha_inicio: nuevaInicio.toISOString().slice(0, 10), fecha_fin: nuevaFin.toISOString().slice(0, 10) })
        .eq("id", tarea.id);
      if (error) manejarError(error, "No se pudo mover la tarea");
      cargarTareas();
    } else {
      const dx = parseInt(barra.style.width, 10) - estado.widthOriginal;
      const diasCambio = Math.round(dx / GANTT_PX_POR_DIA);
      if (diasCambio === 0) return;
      const nuevaFin = new Date(tarea.fecha_fin + "T00:00:00");
      nuevaFin.setDate(nuevaFin.getDate() + diasCambio);
      const inicio = new Date(tarea.fecha_inicio + "T00:00:00");
      if (nuevaFin < inicio) return cargarTareas();
      const { error } = await window.sb.from("tareas").update({ fecha_fin: nuevaFin.toISOString().slice(0, 10) }).eq("id", tarea.id);
      if (error) manejarError(error, "No se pudo cambiar la duración");
      cargarTareas();
    }
  });

  function actualizarBotonesVistaTarea(vista) {
    const kanbanBtn = document.getElementById("btn-vista-kanban");
    const ganttBtn = document.getElementById("btn-vista-gantt");
    kanbanBtn.classList.toggle("bg-white", vista === "kanban");
    kanbanBtn.classList.toggle("shadow-sm", vista === "kanban");
    kanbanBtn.classList.toggle("text-gray-800", vista === "kanban");
    ganttBtn.classList.toggle("bg-white", vista === "gantt");
    ganttBtn.classList.toggle("shadow-sm", vista === "gantt");
    ganttBtn.classList.toggle("text-gray-800", vista === "gantt");
  }
  document.getElementById("btn-vista-kanban").addEventListener("click", () => {
    document.getElementById("vista-kanban").classList.remove("hidden");
    document.getElementById("vista-gantt").classList.add("hidden");
    actualizarBotonesVistaTarea("kanban");
  });
  document.getElementById("btn-vista-gantt").addEventListener("click", () => {
    document.getElementById("vista-kanban").classList.add("hidden");
    document.getElementById("vista-gantt").classList.remove("hidden");
    actualizarBotonesVistaTarea("gantt");
  });
  actualizarBotonesVistaTarea("kanban");

  function abrirModalTarea() {
    const opcionesCotizacion = cotizacionCache
      .map((ci) => `<option value="${ci.id}">${escapeHtml(ci.descripcion)} (${formatoMoneda(ci.subtotal)})</option>`)
      .join("");
    const html = `
      <div id="modal-tarea" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
        <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
          <h3 class="mb-4 text-base font-bold text-gray-900">Nueva Tarea</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Título *</label>
              <input id="t-titulo" class="w-full rounded-lg border-gray-300 text-sm" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Descripción</label>
              <textarea id="t-descripcion" rows="2" class="w-full rounded-lg border-gray-300 text-sm"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-700">Fecha inicio</label>
                <input id="t-inicio" type="date" class="w-full rounded-lg border-gray-300 text-sm" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-700">Fecha fin</label>
                <input id="t-fin" type="date" class="w-full rounded-lg border-gray-300 text-sm" />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Renglón de la cotización (define su peso en el % de avance)</label>
              <select id="t-cotizacion-item" class="w-full rounded-lg border-gray-300 text-sm">
                <option value="">— Ninguno (usar peso manual) —</option>
                ${opcionesCotizacion}
              </select>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Peso manual (si no eliges renglón)</label>
              <input id="t-peso-manual" type="number" min="0" step="0.01" value="1" class="w-full rounded-lg border-gray-300 text-sm" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Estado</label>
              <select id="t-estado" class="w-full rounded-lg border-gray-300 text-sm">
                ${Object.entries(ESTADOS_TAREA)
                  .map(([val, label]) => `<option value="${val}">${label}</option>`)
                  .join("")}
              </select>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button id="t-cancelar" class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button id="t-guardar" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">Crear Tarea</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
    const cerrar = () => document.getElementById("modal-tarea").remove();
    document.getElementById("t-cancelar").addEventListener("click", cerrar);
    document.getElementById("t-guardar").addEventListener("click", async () => {
      const titulo = document.getElementById("t-titulo").value.trim();
      if (!titulo) return mostrarAviso("El título es obligatorio", "error");
      const payload = {
        proyecto_id: proyectoId,
        titulo,
        descripcion: document.getElementById("t-descripcion").value.trim() || null,
        fecha_inicio: document.getElementById("t-inicio").value || null,
        fecha_fin: document.getElementById("t-fin").value || null,
        cotizacion_item_id: document.getElementById("t-cotizacion-item").value || null,
        peso_manual: Number(document.getElementById("t-peso-manual").value || 1),
        estado: document.getElementById("t-estado").value,
        orden: tareasCache.length,
      };
      const { error } = await window.sb.from("tareas").insert(payload);
      if (error) return manejarError(error, "No se pudo crear la tarea");
      cerrar();
      mostrarAviso("Tarea creada", "exito");
      cargarTareas();
      cargarProyecto();
    });
  }
  document.getElementById("btn-nueva-tarea").addEventListener("click", () => abrirModalTarea());

  // --------------------------------------------------------------------
  // DOCUMENTOS
  // --------------------------------------------------------------------
  const CATEGORIAS_DOCUMENTO = {
    contrato: "Contrato",
    cotizacion: "Cotización Final",
    planos: "Planos",
    polizas: "Pólizas",
    orden_compra: "Orden de Compra",
    acta_entrega: "Acta de Entrega",
    corte: "Corte",
    otro: "Otro",
  };
  let documentosCache = [];
  let filtroDocumentoCategoria = "";

  function renderFiltroDocumentos() {
    const cont = document.getElementById("filtro-documentos-categoria");
    const opciones = [["", "Todos"], ...Object.entries(CATEGORIAS_DOCUMENTO)];
    cont.innerHTML = opciones
      .map(
        ([val, label]) => `
      <button class="btn-filtro-doc rounded-full border px-3 py-1 text-xs font-semibold ${
        filtroDocumentoCategoria === val ? "border-primary bg-blue-50 text-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"
      }" data-cat="${val}">${label}</button>`
      )
      .join("");
    cont.querySelectorAll(".btn-filtro-doc").forEach((btn) =>
      btn.addEventListener("click", () => {
        filtroDocumentoCategoria = btn.dataset.cat;
        renderFiltroDocumentos();
        renderTablaDocumentos();
      })
    );
  }

  function renderTablaDocumentos() {
    const filtrados = filtroDocumentoCategoria ? documentosCache.filter((d) => d.categoria === filtroDocumentoCategoria) : documentosCache;
    document.getElementById("tabla-documentos").innerHTML = filtrados.length
      ? filtrados
          .map(
            (d) => `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="px-4 py-2.5"><a href="${d.url}" target="_blank" rel="noopener" class="font-medium text-primary hover:underline">${escapeHtml(d.nombre_archivo)}</a></td>
          <td class="px-4 py-2.5"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${CATEGORIAS_DOCUMENTO[d.categoria] || d.categoria}</span></td>
          <td class="px-4 py-2.5 text-xs text-gray-500">${formatoFecha(d.created_at)}</td>
          <td class="px-4 py-2.5 text-right">
            <button class="btn-borrar-documento text-gray-400 hover:text-red-600" data-id="${d.id}">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-6 text-center text-gray-400" colspan="4">No hay documentos en esta categoría.</td></tr>`;

    document.querySelectorAll(".btn-borrar-documento").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar este documento?")) return;
        const { error } = await window.sb.from("documentos").delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar");
        cargarDocumentos();
      })
    );
  }

  async function cargarDocumentos() {
    const { data, error } = await window.sb
      .from("documentos")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .order("created_at", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar los documentos");
    documentosCache = data || [];
    renderFiltroDocumentos();
    renderTablaDocumentos();
  }

  function abrirModalSubirDocumento(file) {
    const opciones = Object.entries(CATEGORIAS_DOCUMENTO)
      .map(([val, label]) => `<option value="${val}">${label}</option>`)
      .join("");
    const html = `
      <div id="modal-documento" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
        <div class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
          <h3 class="mb-3 text-base font-bold text-gray-900">Subir Documento</h3>
          <p class="mb-3 truncate text-sm text-gray-500">${escapeHtml(file.name)}</p>
          <label class="mb-1 block text-xs font-medium text-gray-700">Categoría</label>
          <select id="doc-categoria" class="mb-4 w-full rounded-lg border-gray-300 text-sm">${opciones}</select>
          <div class="flex justify-end gap-2">
            <button id="doc-cancelar" class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button id="doc-subir" class="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">Subir</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
    const cerrar = () => {
      document.getElementById("modal-documento")?.remove();
      document.getElementById("input-subir-documento").value = "";
    };
    document.getElementById("doc-cancelar").addEventListener("click", cerrar);
    document.getElementById("doc-subir").addEventListener("click", async () => {
      const categoria = document.getElementById("doc-categoria").value;
      const btn = document.getElementById("doc-subir");
      btn.disabled = true;
      btn.textContent = "Subiendo...";
      const ruta = `${proyectoId}/${Date.now()}_${file.name}`;
      const { error: errorSubida } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
      if (errorSubida) {
        manejarError(errorSubida, "No se pudo subir el documento");
        btn.disabled = false;
        btn.textContent = "Subir";
        return;
      }
      const { data: publicUrlData } = window.sb.storage.from("documentos").getPublicUrl(ruta);
      const { error: errorInsert } = await window.sb.from("documentos").insert({
        proyecto_id: proyectoId,
        categoria,
        nombre_archivo: file.name,
        url: publicUrlData.publicUrl,
        subido_por: session.user.id,
      });
      if (errorInsert) {
        manejarError(errorInsert, "El archivo se subió pero no se pudo registrar en la base de datos");
        btn.disabled = false;
        btn.textContent = "Subir";
        return;
      }
      mostrarAviso("Documento subido", "exito");
      cerrar();
      cargarDocumentos();
    });
  }

  document.getElementById("input-subir-documento").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    abrirModalSubirDocumento(file);
  });

  // --------------------------------------------------------------------
  // Arranque
  // --------------------------------------------------------------------
  activarCamposMoneda();
  await cargarProyecto();
  await cargarContratistasSelectPresupuesto();
  await Promise.all([cargarCotizacion(), cargarPresupuesto()]);
  await Promise.all([
    cargarFacturas(),
    cargarProveedoresSelect().then(cargarCompras),
    cargarContratistasSelect().then(cargarContratistasProyecto),
    cargarCortesEjecucion(),
    cargarTareas(),
    cargarDocumentos(),
  ]);

  activarTab(qs("tab") || "resumen");
})();
