(async () => {
  await window.pctronicReady;

  let cache = [];
  let ultimasFiltradas = [];
  const etiquetaCat = { equipos: "Equipos", mano_obra: "Mano de Obra", materiales: "Materiales", alquiler: "Alquiler", otros: "Otros" };

  const ahora = new Date();
  document.getElementById("kpi-mes-label").textContent =
    `Total Comprado ${ahora.toLocaleDateString("es-CO", { month: "long" })}`;
  document.getElementById("kpi-anio-label").textContent = `Total Comprado ${ahora.getFullYear()}`;

  async function cargar() {
    const { data, error } = await window.sb
      .from("compras")
      .select("*, proyectos(id, nombre), proveedores(nombre), presupuesto_items(descripcion)")
      .order("fecha", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar las compras");
    cache = data || [];
    render();
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const categoria = document.getElementById("filtro-categoria").value;
    const mes = document.getElementById("filtro-mes").value; // "YYYY-MM" o ""

    const filtradas = cache.filter((c) => {
      const coincideTexto =
        !texto ||
        (c.proyectos?.nombre || "").toLowerCase().includes(texto) ||
        (c.descripcion || "").toLowerCase().includes(texto);
      const coincideCategoria = !categoria || c.categoria === categoria;
      const coincideMes = !mes || String(c.fecha || "").slice(0, 7) === mes;
      return coincideTexto && coincideCategoria && coincideMes;
    });
    ultimasFiltradas = filtradas;

    document.getElementById("kpi-total").textContent = formatoMoneda(
      filtradas.reduce((a, c) => a + Number(c.valor), 0)
    );

    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();
    const totalMes = cache
      .filter((c) => {
        const f = new Date(c.fecha + "T00:00:00");
        return f.getMonth() === mesActual && f.getFullYear() === anioActual;
      })
      .reduce((a, c) => a + Number(c.valor), 0);
    const totalAnio = cache
      .filter((c) => new Date(c.fecha + "T00:00:00").getFullYear() === anioActual)
      .reduce((a, c) => a + Number(c.valor), 0);
    document.getElementById("kpi-mes").textContent = formatoMoneda(totalMes);
    document.getElementById("kpi-anio").textContent = formatoMoneda(totalAnio);

    const tbody = document.getElementById("tabla-compras");
    tbody.innerHTML = filtradas.length
      ? filtradas
          .map(
            (c) => `
        <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
          <td class="px-4 py-3">
            <a href="proyecto-detalle.html?id=${c.proyectos?.id}&tab=compras" class="font-medium text-gray-900 hover:text-primary">
              ${escapeHtml(c.proyectos?.nombre || "—")}
            </a>
          </td>
          <td class="px-4 py-3">${escapeHtml(c.descripcion)}</td>
          <td class="px-4 py-3">${escapeHtml(c.proveedores?.nombre || "—")}</td>
          <td class="px-4 py-3"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${etiquetaCat[c.categoria]}</span></td>
          <td class="px-4 py-3">
            ${c.factura_url ? `<a href="${c.factura_url}" target="_blank" rel="noopener" class="font-medium text-primary hover:underline">${escapeHtml(c.numero_factura || "Ver factura")}</a>` : escapeHtml(c.numero_factura || "—")}
          </td>
          <td class="px-4 py-3">${formatoFecha(c.fecha)}</td>
          <td class="px-4 py-3 font-medium">${formatoMoneda(c.valor)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="7">No hay compras para ese filtro.</td></tr>`;
  }

  document.getElementById("filtro-busqueda").addEventListener("input", render);
  document.getElementById("filtro-categoria").addEventListener("change", render);
  document.getElementById("filtro-mes").addEventListener("change", render);

  const COLUMNAS_EXPORT = ["Proyecto", "Descripción", "Proveedor", "Categoría", "N° Factura", "Fecha", "Valor"];
  function filasExport() {
    return ultimasFiltradas.map((c) => [
      c.proyectos?.nombre || "—",
      c.descripcion || "",
      c.proveedores?.nombre || "—",
      etiquetaCat[c.categoria] || c.categoria,
      c.numero_factura || "—",
      formatoFecha(c.fecha),
      formatoMoneda(c.valor),
    ]);
  }

  document.getElementById("btn-exportar-excel").addEventListener("click", () => {
    if (!ultimasFiltradas.length) return mostrarAviso("No hay compras para exportar con este filtro", "error");
    descargarPlantillaExcel("compras.xlsx", COLUMNAS_EXPORT, filasExport());
  });
  document.getElementById("btn-exportar-pdf").addEventListener("click", () => {
    if (!ultimasFiltradas.length) return mostrarAviso("No hay compras para exportar con este filtro", "error");
    const mes = document.getElementById("filtro-mes").value;
    generarPdfTabla({
      titulo: "Compras y Costos",
      subtitulo: mes ? `Mes: ${mes}` : "Todas las fechas",
      columnas: COLUMNAS_EXPORT,
      filas: filasExport(),
      nombreArchivo: "compras.pdf",
    });
  });

  cargar();
})();
