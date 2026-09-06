(async () => {
  await window.pctronicReady;

  let cache = [];

  async function cargarEmpresasFiltro() {
    const { data } = await window.sb.from("empresas").select("id, nombre").order("nombre");
    const sel = document.getElementById("filtro-empresa");
    sel.innerHTML =
      `<option value="">Empresa: Todas</option>` +
      (data || []).map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join("");
  }

  async function cargar() {
    const { data, error } = await window.sb
      .from("facturas")
      .select("*, proyectos(id, nombre, empresa_id, empresas(nombre))")
      .order("fecha_emision", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar la facturación");
    cache = data || [];
    render();
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const estado = document.getElementById("filtro-estado").value;
    const empresaId = document.getElementById("filtro-empresa").value;

    const filtradas = cache.filter((f) => {
      const coincideTexto =
        !texto ||
        (f.proyectos?.nombre || "").toLowerCase().includes(texto) ||
        (f.numero_factura || "").toLowerCase().includes(texto);
      const coincideEstado = !estado || f.estado === estado;
      const coincideEmpresa = !empresaId || f.proyectos?.empresa_id === empresaId;
      return coincideTexto && coincideEstado && coincideEmpresa;
    });

    const total = filtradas.reduce((a, f) => a + Number(f.valor), 0);
    const pagado = filtradas.filter((f) => f.estado === "pagada").reduce((a, f) => a + Number(f.valor), 0);
    document.getElementById("kpi-total").textContent = formatoMoneda(total);
    document.getElementById("kpi-pagado").textContent = formatoMoneda(pagado);
    document.getElementById("kpi-pendiente").textContent = formatoMoneda(total - pagado);

    const tbody = document.getElementById("tabla-facturas");
    tbody.innerHTML = filtradas.length
      ? filtradas
          .map(
            (f) => `
        <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
          <td class="px-4 py-3 text-gray-600">${escapeHtml(f.proyectos?.empresas?.nombre || "—")}</td>
          <td class="px-4 py-3">
            <a href="proyecto-detalle.html?id=${f.proyectos?.id}&tab=facturacion" class="font-medium text-gray-900 hover:text-primary">
              ${escapeHtml(f.proyectos?.nombre || "—")}
            </a>
          </td>
          <td class="px-4 py-3">${escapeHtml(f.numero_factura || "—")}</td>
          <td class="px-4 py-3">${formatoFecha(f.fecha_emision)}</td>
          <td class="px-4 py-3">${formatoFecha(f.fecha_vencimiento)}</td>
          <td class="px-4 py-3 font-medium">${formatoMoneda(f.valor)}</td>
          <td class="px-4 py-3">${badgeHtml(ESTADOS_FACTURA, f.estado)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="7">No hay facturas para ese filtro.</td></tr>`;
  }

  document.getElementById("filtro-busqueda").addEventListener("input", render);
  document.getElementById("filtro-estado").addEventListener("change", render);
  document.getElementById("filtro-empresa").addEventListener("change", render);

  await cargarEmpresasFiltro();
  cargar();
})();
