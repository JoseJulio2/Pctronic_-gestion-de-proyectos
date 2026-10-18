// ============================================================================
// PROYECTO · página de detalle: encabezado, pestañas y arranque.
// Cada pestaña vive en assets/js/proy/*.js y se vuelve a dibujar cada vez que
// se abre, así siempre muestra los datos más recientes.
// ============================================================================
(async () => {
  const { session, profile } = await window.pctronicReady;
  PCT.usuarioId = session?.user?.id || null;
  PCT.esAdmin = profile?.rol === "admin";

  const proyectoId = qs("id");
  if (!proyectoId) {
    window.location.href = "proyectos.html";
    return;
  }

  try {
    await Promise.all([PCT.cargarTodo(proyectoId), PCT.cargarCatalogos()]);
  } catch (err) {
    document.getElementById("encabezado-proyecto").innerHTML = `<p class="text-sm text-red-600">No se pudo cargar el proyecto: ${escapeHtml(err.message || "error desconocido")}</p>`;
    return;
  }

  // --------------------------------------------------------------------
  // Pestañas. `listo:false` = fase siguiente (se muestra, pero aún sin contenido)
  // --------------------------------------------------------------------
  const TABS = [
    { id: "resumen", label: "Resumen", listo: true },
    { id: "inicio", label: "Inicio", listo: true },
    { id: "cotizacion", label: "Cotización", listo: true },
    { id: "costos", label: "Presupuesto de costos", listo: true },
    { id: "avance", label: "Avance diario", listo: true },
    { id: "cronograma", label: "Cronograma", listo: false, fase: "Fase 4" },
    { id: "cortes", label: "Cortes cliente", listo: true },
    { id: "mano_obra", label: "Mano de obra", listo: true },
    { id: "gastos", label: "Gastos", listo: false, fase: "Fase 3" },
    { id: "materiales", label: "Materiales", listo: false, fase: "Fase 4" },
    { id: "documentos", label: "Documentos", listo: true },
  ];
  let tabActiva = null;

  // --------------------------------------------------------------------
  // Encabezado
  // --------------------------------------------------------------------
  const pintarEncabezado = () => {
    const p = PCT.estado.proyecto;
    const av = PCT.avanceFisico();
    const mg = PCT.margenActual();
    const colorMg = mg.margen > 0 ? "text-green-600" : mg.margen < 0 ? "text-red-600" : "text-gray-900";
    document.getElementById("encabezado-proyecto").innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-xl font-bold text-gray-900">${escapeHtml(p.nombre)}</h1>
            ${badgeHtml(ESTADOS_PROYECTO, p.estado)}
          </div>
          <p class="mt-1 text-sm text-gray-500">
            ${escapeHtml(p.clientes?.nombre || "Sin cliente")} ${p.ciudad ? "· " + escapeHtml(p.ciudad) : ""}
            ${p.numero_contrato ? "· Contrato " + escapeHtml(p.numero_contrato) : ""}
            ${p.empresas?.nombre ? "· " + escapeHtml(p.empresas.nombre) : ""}
          </p>
        </div>
        <div class="grid w-full grid-cols-1 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div class="px-4 py-3">
            <p class="text-[11px] font-semibold uppercase text-gray-500">Avance físico real</p>
            <p class="mt-0.5 text-lg font-bold tabular-nums text-gray-900">${PCT.fmtPct(av.pct)}</p>
            <div class="barra-progreso mt-1.5"><span style="width:${Math.round(av.pct * 100)}%"></span></div>
          </div>
          <div class="px-4 py-3" title="Facturado (cortes de cliente, sin IVA) menos gastado (Gastos)">
            <p class="text-[11px] font-semibold uppercase text-gray-500">Margen bruto actual</p>
            <p class="mt-0.5 text-lg font-bold tabular-nums ${colorMg}">${formatoMoneda(mg.margen)}${mg.pct !== null ? ` <span class="text-xs font-semibold">${PCT.fmtPct(mg.pct)}</span>` : ""}</p>
            <p class="mt-0.5 truncate text-[11px] text-gray-400">Facturado ${formatoMoneda(mg.facturado)} · Gastado ${formatoMoneda(mg.gastado)}</p>
          </div>
          <div class="px-4 py-3">
            <p class="text-[11px] font-semibold uppercase text-gray-500">Valor del contrato</p>
            <p class="mt-0.5 text-lg font-bold tabular-nums text-gray-900">${formatoMoneda(p.valor_total)}</p>
            <p class="mt-0.5 text-[11px] text-gray-400">${p.tipo_contrato === "aiu" ? "Esquema AIU" : "IVA pleno"}</p>
          </div>
        </div>
      </div>`;
  };

  // --------------------------------------------------------------------
  // Resumen
  // --------------------------------------------------------------------
  const renderResumen = (root) => {
    const p = PCT.estado.proyecto;
    const c = PCT.contrato();
    const { base } = PCT.resumenPresupuesto();
    const av = PCT.avanceFisico();
    const kpi = (t, v, s = "") => `<div class="rounded-xl border border-gray-200 bg-white p-4"><p class="text-[11px] font-semibold uppercase text-gray-500">${t}</p><p class="mt-1 text-xl font-bold tabular-nums text-gray-900">${v}</p>${s ? `<p class="mt-1 text-xs text-gray-400">${s}</p>` : ""}</div>`;
    const fila = (k, v) => `<div class="flex justify-between gap-4 py-1.5"><dt class="text-gray-500">${k}</dt><dd class="text-right font-medium text-gray-900">${v || "—"}</dd></div>`;
    const margenPpto = c.ingreso - base.costo;
    root.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          ${kpi("Valor del contrato", formatoMoneda(c.total), `Ingreso sin IVA ${formatoMoneda(c.ingreso)}`)}
          ${kpi("Avance físico real", PCT.fmtPct(av.pct), "Desde el avance diario")}
          ${kpi("Costo presupuestado", formatoMoneda(base.costo), `Materiales y equipos · ${base.n} ítems`)}
          ${kpi("Margen bruto presupuestado", formatoMoneda(margenPpto), c.ingreso ? PCT.fmtPct(margenPpto / c.ingreso) + " del ingreso" : "")}
          ${kpi("Anticipo", formatoMoneda(c.anticipo), `${p.anticipo_porcentaje}% pactado · recibido ${formatoMoneda(p.anticipo_recibido)}`)}
        </div>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <h3 class="mb-2 font-bold text-gray-900">Información general</h3>
            <dl class="divide-y divide-gray-50 text-sm">
              ${fila("Cliente", escapeHtml(p.clientes?.nombre || ""))}
              ${fila("Empresa", escapeHtml(p.empresas?.nombre || ""))}
              ${fila("Ciudad", escapeHtml(p.ciudad || ""))}
              ${fila("Cotización", escapeHtml([p.numero_cotizacion, p.fecha_cotizacion ? formatoFecha(p.fecha_cotizacion) : ""].filter(Boolean).join(" · ")))}
              ${fila("Contrato", escapeHtml(p.numero_contrato || ""))}
              ${fila("Inicio de obra", p.fecha_inicio ? formatoFecha(p.fecha_inicio) : "")}
              ${fila("Fin contractual", p.fecha_fin_estimada ? formatoFecha(p.fecha_fin_estimada) : "")}
              ${fila("Director de proyecto", escapeHtml(p.director_proyecto || ""))}
              ${fila("Comercial", escapeHtml(p.comercial_responsable || ""))}
              ${fila("Contratista de mano de obra", escapeHtml(p.contratista?.nombre || "Personal propio"))}
              ${fila("Tipo de proyecto", escapeHtml((p.tipo_proyecto || []).join(", ")))}
              ${fila("Tipo de contrato", p.tipo_contrato === "aiu" ? `AIU (A ${p.administracion_porcentaje}% · I ${p.imprevistos_porcentaje}% · U ${p.utilidad_porcentaje}%)` : "IVA pleno")}
            </dl>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <h3 class="mb-2 font-bold text-gray-900">Notas</h3>
            <p class="whitespace-pre-line text-sm text-gray-600">${escapeHtml(p.notas || "—")}</p>
          </div>
        </div>
      </div>`;
  };

  const renderProximamente = (root, tab) => {
    root.innerHTML = `
      <div class="mx-auto max-w-md rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <span class="material-symbols-outlined text-[40px] text-gray-300">construction</span>
        <h3 class="mt-2 text-base font-bold text-gray-900">${escapeHtml(tab.label)}</h3>
        <p class="mt-1 text-sm text-gray-500">Esta pestaña se construye en la <b>${tab.fase}</b> del rediseño de Proyectos. Mientras tanto, la Cotización y el Avance diario ya quedan listos para alimentarla.</p>
      </div>`;
  };

  // --------------------------------------------------------------------
  // Navegación entre pestañas
  // --------------------------------------------------------------------
  const pintarTabs = () => {
    document.getElementById("tabs-nav").innerHTML = TABS.map(
      (t) => `<button data-tab="${t.id}" class="whitespace-nowrap border-b-2 px-1 py-3 ${
        t.id === tabActiva ? "border-primary text-primary" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
      } ${t.listo ? "" : "opacity-60"}">${t.label}${t.listo ? "" : ` <span class="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">${t.fase}</span>`}</button>`
    ).join("");
  };

  const activarTab = async (id) => {
    if (id === "presupuesto") id = "cotizacion"; // enlaces viejos
    const tab = TABS.find((t) => t.id === id) || TABS[0];
    tabActiva = tab.id;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab.id);
    window.history.replaceState({}, "", url);
    pintarTabs();
    pintarEncabezado();
    const root = document.getElementById("panel-tab");
    root.innerHTML = `<div class="skeleton h-40 rounded-xl"></div>`;
    try {
      // siempre con datos frescos (otras personas pueden estar registrando avance)
      await Promise.all([PCT.recargarProyecto(), PCT.recargarItems(), PCT.recargarEjec(), PCT.recargarFinanzas()]);
      pintarEncabezado();
      root.innerHTML = "";
      if (!tab.listo) return renderProximamente(root, tab);
      if (tab.id === "resumen") return renderResumen(root);
      if (tab.id === "inicio") return PCT.renderInicio(root);
      if (tab.id === "cotizacion") return PCT.renderCotizacion(root);
      if (tab.id === "costos") return PCT.renderCostos(root);
      if (tab.id === "avance") return await PCT.renderAvance(root);
      if (tab.id === "cortes") return await PCT.renderCortes(root);
      if (tab.id === "mano_obra") return await PCT.renderManoObra(root);
      if (tab.id === "documentos") return await PCT.renderDocumentos(root);
    } catch (err) {
      manejarError(err, "No se pudo abrir la pestaña");
    }
  };

  document.getElementById("tabs-nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) activarTab(b.dataset.tab);
  });

  // El encabezado refleja de inmediato cualquier cambio en el proyecto
  PCT.on("proyecto", pintarEncabezado);
  PCT.on("ejec", pintarEncabezado);

  document.title = `${PCT.estado.proyecto.nombre} · Pctronic`;
  activarTab(qs("tab") || "resumen");
})();
