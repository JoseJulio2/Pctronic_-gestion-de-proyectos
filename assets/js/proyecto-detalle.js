(async () => {
  await window.pctronicReady;

  const proyectoId = qs("id");
  if (!proyectoId) {
    window.location.href = "proyectos.html";
    return;
  }

  let proyecto = null;

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

  // --------------------------------------------------------------------
  // Encabezado
  // --------------------------------------------------------------------
  async function cargarProyecto() {
    const { data, error } = await window.sb
      .from("proyectos")
      .select("*, clientes(id, nombre)")
      .eq("id", proyectoId)
      .single();

    if (error) {
      manejarError(error, "No se pudo cargar el proyecto");
      return;
    }
    proyecto = data;
    document.title = `${proyecto.nombre} · Pctronic`;

    document.getElementById("encabezado-proyecto").innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-gray-900">${escapeHtml(proyecto.nombre)}</h1>
          <p class="text-sm text-gray-500">Cliente: ${escapeHtml(proyecto.clientes?.nombre || "Sin asignar")}</p>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right">
            <div class="mb-1 flex items-center gap-2">
              ${badgeHtml(ESTADOS_PROYECTO, proyecto.estado)}
              <span class="text-sm font-bold text-gray-900">${proyecto.avance_porcentaje || 0}%</span>
            </div>
            <div class="barra-progreso w-40"><span style="width:${proyecto.avance_porcentaje || 0}%"></span></div>
          </div>
          <button id="btn-editar-proyecto" class="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50" title="Editar">
            <span class="material-symbols-outlined text-[20px]">edit</span>
          </button>
        </div>
      </div>`;

    document.getElementById("btn-editar-proyecto").addEventListener("click", abrirModalEditar);

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
              <label class="mb-1 block text-xs font-medium text-gray-700">Valor Total (COP)</label>
              <input id="edit-valor" type="number" min="0" step="1000" class="w-full rounded-lg border-gray-300 text-sm" />
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
    document.getElementById("edit-valor").value = proyecto.valor_total || 0;
    document.getElementById("edit-fin").value = proyecto.fecha_fin_estimada || "";

    const cerrar = () => document.getElementById("modal-editar-proyecto").remove();
    document.getElementById("edit-cancelar").addEventListener("click", cerrar);
    document.getElementById("edit-guardar").addEventListener("click", async () => {
      const { error } = await window.sb
        .from("proyectos")
        .update({
          estado: document.getElementById("edit-estado").value,
          avance_porcentaje: Number(document.getElementById("edit-avance").value || 0),
          valor_total: Number(document.getElementById("edit-valor").value || 0),
          fecha_fin_estimada: document.getElementById("edit-fin").value || null,
        })
        .eq("id", proyectoId);
      if (error) return manejarError(error, "No se pudo actualizar el proyecto");
      cerrar();
      mostrarAviso("Proyecto actualizado", "exito");
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
      kpi("payments", "Valor Total", formatoMoneda(proyecto.valor_total), "bg-blue-100 text-primary") +
      kpi("receipt_long", "Facturado", formatoMoneda(totalFacturado), "bg-green-100 text-green-700") +
      kpi("shopping_cart", "Comprado / Costos", formatoMoneda(totalComprado), "bg-amber-100 text-amber-700") +
      kpi("trending_up", "Utilidad Estimada", formatoMoneda(utilidadEstimada), utilidadEstimada >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700");

    document.getElementById("resumen-info").innerHTML = `
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Cliente</dt><dd class="font-medium">${escapeHtml(proyecto.clientes?.nombre || "—")}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Tipo de Proyecto</dt><dd class="font-medium">${escapeHtml(proyecto.tipo_proyecto || "—")}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Fecha de Contrato</dt><dd class="font-medium">${formatoFecha(proyecto.fecha_contrato)}</dd></div>
      <div class="flex justify-between border-b border-gray-50 pb-2"><dt class="text-gray-500">Fecha de Inicio</dt><dd class="font-medium">${formatoFecha(proyecto.fecha_inicio)}</dd></div>
      <div class="flex justify-between"><dt class="text-gray-500">Fin Estimado</dt><dd class="font-medium">${formatoFecha(proyecto.fecha_fin_estimada)}</dd></div>
    `;
    document.getElementById("resumen-notas").textContent = proyecto.notas || "Sin notas registradas.";
  }

  // --------------------------------------------------------------------
  // PRESUPUESTO
  // --------------------------------------------------------------------
  async function cargarPresupuesto() {
    const { data, error } = await window.sb
      .from("presupuesto_items")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar el presupuesto");

    const totalMP = data.filter((i) => i.tipo === "MP").reduce((a, i) => a + Number(i.valor_total), 0);
    const totalMO = data.filter((i) => i.tipo === "MO").reduce((a, i) => a + Number(i.valor_total), 0);
    const totalOtro = data.filter((i) => i.tipo === "OTRO").reduce((a, i) => a + Number(i.valor_total), 0);

    document.getElementById("presu-total-mp").textContent = formatoMoneda(totalMP);
    document.getElementById("presu-total-mo").textContent = formatoMoneda(totalMO);
    document.getElementById("presu-total-general").textContent = formatoMoneda(totalMP + totalMO + totalOtro);

    const etiquetaTipo = { MP: "Materiales", MO: "Mano de Obra", OTRO: "Otro" };

    document.getElementById("tabla-presupuesto").innerHTML = data.length
      ? data
          .map(
            (item) => `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="px-4 py-2.5"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${etiquetaTipo[item.tipo]}</span></td>
          <td class="px-4 py-2.5">${escapeHtml(item.descripcion)}</td>
          <td class="px-4 py-2.5">${item.cantidad}</td>
          <td class="px-4 py-2.5">${formatoMoneda(item.valor_unitario)}</td>
          <td class="px-4 py-2.5 font-medium">${formatoMoneda(item.valor_total)}</td>
          <td class="px-4 py-2.5 text-right">
            <button class="btn-borrar-item text-gray-400 hover:text-red-600" data-id="${item.id}">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-6 text-center text-gray-400" colspan="6">Aún no has agregado renglones al presupuesto.</td></tr>`;

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
      cantidad: Number(document.getElementById("item-cantidad").value || 1),
      valor_unitario: Number(document.getElementById("item-valor").value || 0),
    };
    const { error } = await window.sb.from("presupuesto_items").insert(payload);
    if (error) return manejarError(error, "No se pudo agregar el renglón");
    e.target.reset();
    document.getElementById("item-cantidad").value = 1;
    cargarPresupuesto();
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
      valor: Number(document.getElementById("factura-valor").value || 0),
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

    const etiquetaCat = { materiales: "Materiales", mano_obra: "Mano de Obra", otros: "Otros" };

    document.getElementById("tabla-compras").innerHTML = data.length
      ? data
          .map(
            (c) => `
        <tr class="border-b border-gray-50 last:border-0">
          <td class="px-4 py-2.5">${escapeHtml(c.descripcion)}</td>
          <td class="px-4 py-2.5">${escapeHtml(c.proveedores?.nombre || "—")}</td>
          <td class="px-4 py-2.5"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${etiquetaCat[c.categoria]}</span></td>
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
    const payload = {
      proyecto_id: proyectoId,
      proveedor_id: document.getElementById("compra-proveedor").value || null,
      categoria: document.getElementById("compra-categoria").value,
      descripcion: document.getElementById("compra-descripcion").value.trim(),
      valor: Number(document.getElementById("compra-valor").value || 0),
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
                <input type="number" min="0" step="1000" class="corte-bruto w-full rounded-lg border-gray-300 text-xs" />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-700">Retenciones</label>
                <input type="number" min="0" step="1000" value="0" class="corte-retenciones w-full rounded-lg border-gray-300 text-xs" />
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

      card.querySelector(".btn-toggle-cortes").addEventListener("click", () => {
        card.querySelector(".panel-cortes").classList.toggle("hidden");
      });

      card.querySelector(".btn-borrar-contratista").addEventListener("click", async () => {
        if (!confirm("¿Quitar este contratista del proyecto? Se borrarán también sus cortes de pago.")) return;
        const { error } = await window.sb.from("proyecto_contratistas").delete().eq("id", pcId);
        if (error) return manejarError(error, "No se pudo quitar");
        cargarContratistasProyecto();
      });

      card.querySelector(".form-corte").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
          proyecto_contratista_id: pcId,
          periodo_inicio: card.querySelector(".corte-inicio").value || null,
          periodo_fin: card.querySelector(".corte-fin").value || null,
          valor_bruto: Number(card.querySelector(".corte-bruto").value || 0),
          retenciones: Number(card.querySelector(".corte-retenciones").value || 0),
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
      valor_contratado: Number(document.getElementById("contratista-valor").value || 0),
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
  // Arranque
  // --------------------------------------------------------------------
  await cargarProyecto();
  await Promise.all([
    cargarPresupuesto(),
    cargarFacturas(),
    cargarProveedoresSelect().then(cargarCompras),
    cargarContratistasSelect().then(cargarContratistasProyecto),
  ]);

  activarTab(qs("tab") || "resumen");
})();
