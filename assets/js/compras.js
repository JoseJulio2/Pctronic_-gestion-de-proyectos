(async () => {
  await window.pctronicReady;

  let cache = [];
  const etiquetaCat = { materiales: "Materiales", mano_obra: "Mano de Obra", otros: "Otros" };

  async function cargar() {
    const { data, error } = await window.sb
      .from("compras")
      .select("*, proyectos(id, nombre), proveedores(nombre)")
      .order("fecha", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar las compras");
    cache = data || [];
    render();
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const categoria = document.getElementById("filtro-categoria").value;

    const filtradas = cache.filter((c) => {
      const coincideTexto =
        !texto ||
        (c.proyectos?.nombre || "").toLowerCase().includes(texto) ||
        (c.descripcion || "").toLowerCase().includes(texto);
      const coincideCategoria = !categoria || c.categoria === categoria;
      return coincideTexto && coincideCategoria;
    });

    document.getElementById("kpi-total").textContent = formatoMoneda(
      filtradas.reduce((a, c) => a + Number(c.valor), 0)
    );

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
          <td class="px-4 py-3">${formatoFecha(c.fecha)}</td>
          <td class="px-4 py-3 font-medium">${formatoMoneda(c.valor)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="6">No hay compras para ese filtro.</td></tr>`;
  }

  document.getElementById("filtro-busqueda").addEventListener("input", render);
  document.getElementById("filtro-categoria").addEventListener("change", render);

  cargar();
})();
