(async () => {
  await window.pctronicReady;

  function kpiCard(icon, label, valor, color) {
    return `
    <div class="rounded-xl border border-gray-200 bg-white p-4">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg ${color}">
          <span class="material-symbols-outlined text-[20px]">${icon}</span>
        </div>
        <div>
          <p class="text-xs font-medium text-gray-500">${label}</p>
          <p class="text-lg font-bold text-gray-900">${valor}</p>
        </div>
      </div>
    </div>`;
  }

  try {
    const { data: proyectos, error: errProyectos } = await window.sb
      .from("proyectos")
      .select("id, nombre, estado, avance_porcentaje, valor_total, created_at")
      .order("created_at", { ascending: false });
    if (errProyectos) throw errProyectos;

    const activos = proyectos.filter((p) => p.estado === "en_curso");
    const valorEnCurso = activos.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);

    const { data: facturas, error: errFacturas } = await window.sb
      .from("facturas")
      .select("id, valor, estado, fecha_vencimiento, proyecto_id, proyectos(nombre)")
      .in("estado", ["pendiente", "vencida"])
      .order("fecha_vencimiento", { ascending: true });
    if (errFacturas) throw errFacturas;

    const totalPendiente = facturas.reduce((acc, f) => acc + Number(f.valor || 0), 0);

    document.getElementById("kpi-cards").innerHTML =
      kpiCard("folder_open", "Proyectos Activos", activos.length, "bg-blue-100 text-primary") +
      kpiCard("payments", "Valor en Ejecución", formatoMoneda(valorEnCurso), "bg-green-100 text-green-700") +
      kpiCard("receipt_long", "Facturas Pendientes", facturas.length, "bg-amber-100 text-amber-700") +
      kpiCard("account_balance_wallet", "Por Cobrar", formatoMoneda(totalPendiente), "bg-red-100 text-red-700");

    const filaProyecto = (p) => `
      <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
        <td class="px-5 py-3">
          <a href="proyecto-detalle.html?id=${p.id}" class="font-medium text-gray-900 hover:text-primary">${escapeHtml(p.nombre)}</a>
        </td>
        <td class="px-5 py-3">${badgeHtml(ESTADOS_PROYECTO, p.estado)}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-2">
            <div class="barra-progreso w-24"><span style="width:${p.avance_porcentaje || 0}%"></span></div>
            <span class="text-xs text-gray-500">${p.avance_porcentaje || 0}%</span>
          </div>
        </td>
        <td class="px-5 py-3 font-medium">${formatoMoneda(p.valor_total)}</td>
      </tr>`;

    const tbodyP = document.getElementById("tabla-proyectos-recientes");
    tbodyP.innerHTML = proyectos.length
      ? proyectos.slice(0, 6).map(filaProyecto).join("")
      : `<tr><td class="px-5 py-6 text-gray-400" colspan="4">Aún no has creado proyectos. <a class="text-primary font-semibold" href="proyecto-nuevo.html">Crea el primero →</a></td></tr>`;

    const filaFactura = (f) => `
      <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
        <td class="px-5 py-3">
          <a href="proyecto-detalle.html?id=${f.proyecto_id}" class="font-medium text-gray-900 hover:text-primary">${escapeHtml(f.proyectos?.nombre || "—")}</a>
        </td>
        <td class="px-5 py-3">${escapeHtml(f.numero_factura || "—")}</td>
        <td class="px-5 py-3">${formatoFecha(f.fecha_vencimiento)}</td>
        <td class="px-5 py-3 font-medium">${formatoMoneda(f.valor)}</td>
      </tr>`;

    const tbodyF = document.getElementById("tabla-facturas-pendientes");
    tbodyF.innerHTML = facturas.length
      ? facturas.slice(0, 6).map(filaFactura).join("")
      : `<tr><td class="px-5 py-6 text-gray-400" colspan="4">No hay facturas pendientes por cobrar.</td></tr>`;
  } catch (error) {
    manejarError(error, "No se pudo cargar el panel principal");
  }
})();
