(async () => {
  const { profile } = await window.pctronicReady;

  // Crear proyectos es una acción exclusiva del administrador (el enlace
  // viene oculto por defecto en el HTML; aquí solo se muestra si aplica).
  if (profile?.rol === "admin") {
    document.getElementById("link-nuevo-proyecto")?.classList.remove("hidden");
    document.getElementById("link-nuevo-proyecto")?.classList.add("flex");
  }

  let proyectosCache = [];

  async function cargar() {
    const { data, error } = await window.sb
      .from("proyectos")
      .select("id, nombre, estado, avance_porcentaje, valor_total, fecha_fin_estimada, clientes(nombre)")
      .order("created_at", { ascending: false });

    if (error) return manejarError(error, "No se pudieron cargar los proyectos");
    proyectosCache = data || [];
    render();
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const estado = document.getElementById("filtro-estado").value;

    const filtrados = proyectosCache.filter((p) => {
      const coincideTexto =
        !texto ||
        p.nombre.toLowerCase().includes(texto) ||
        (p.clientes?.nombre || "").toLowerCase().includes(texto);
      const coincideEstado = !estado || p.estado === estado;
      return coincideTexto && coincideEstado;
    });

    const tbody = document.getElementById("tabla-proyectos");

    if (!filtrados.length) {
      tbody.innerHTML = `<tr><td class="px-5 py-8 text-center text-gray-400" colspan="6">
        No se encontraron proyectos con ese filtro.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtrados
      .map(
        (p) => `
      <tr class="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50" data-id="${p.id}">
        <td class="px-5 py-3">
          <span class="font-medium text-gray-900">${escapeHtml(p.nombre)}</span>
          <p class="text-xs text-gray-500">${escapeHtml(p.clientes?.nombre || "Sin cliente asignado")}</p>
        </td>
        <td class="px-5 py-3">${badgeHtml(ESTADOS_PROYECTO, p.estado)}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-2">
            <div class="barra-progreso w-24"><span style="width:${p.avance_porcentaje || 0}%"></span></div>
            <span class="text-xs text-gray-500">${p.avance_porcentaje || 0}%</span>
          </div>
        </td>
        <td class="px-5 py-3 font-medium">${formatoMoneda(p.valor_total)}</td>
        <td class="px-5 py-3 text-gray-500">${formatoFecha(p.fecha_fin_estimada)}</td>
        <td class="px-5 py-3 text-right">
          <span class="text-sm font-semibold text-primary">Ver →</span>
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", () => {
        window.location.href = `proyecto-detalle.html?id=${tr.dataset.id}`;
      })
    );
  }

  document.getElementById("filtro-busqueda").addEventListener("input", render);
  document.getElementById("filtro-estado").addEventListener("change", render);

  cargar();
})();
