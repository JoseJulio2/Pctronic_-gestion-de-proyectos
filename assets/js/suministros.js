// ============================================================================
// Suministros: ventas de equipos/insumos sin instalación (oferta → notificación
// → recibo de insumos → cierre). Usado también en el panel de comité.
// ============================================================================

(async () => {
  await window.pctronicReady;

  let cache = [];
  let clientesCache = [];
  let empresasCache = [];
  let editandoId = null;

  const ESTADOS_SUMINISTRO = {
    en_curso: { label: "En Curso", clase: "bg-blue-100 text-blue-800" },
    cerrado: { label: "Cerrado", clase: "bg-green-100 text-green-800" },
    cancelado: { label: "Cancelado", clase: "bg-gray-200 text-gray-700" },
  };

  async function cargarSelects() {
    const [{ data: clientes }, { data: empresas }] = await Promise.all([
      window.sb.from("clientes").select("id, nombre").order("nombre"),
      window.sb.from("empresas").select("id, nombre").order("nombre"),
    ]);
    clientesCache = clientes || [];
    empresasCache = empresas || [];
    document.getElementById("s-cliente").innerHTML =
      `<option value="">Seleccionar cliente...</option>` +
      clientesCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
    document.getElementById("s-empresa").innerHTML =
      `<option value="">Seleccionar empresa...</option>` +
      empresasCache.map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join("");
  }

  async function cargar() {
    const { data, error } = await window.sb
      .from("suministros")
      .select("*, clientes(nombre), empresas(nombre)")
      .order("created_at", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar los suministros");
    cache = data || [];
    render();
  }

  function render() {
    const texto = document.getElementById("filtro-busqueda").value.trim().toLowerCase();
    const estado = document.getElementById("filtro-estado").value;

    const filtrados = cache.filter((s) => {
      const coincideTexto =
        !texto ||
        (s.clientes?.nombre || "").toLowerCase().includes(texto) ||
        (s.oferta || "").toLowerCase().includes(texto);
      const coincideEstado = !estado || s.estado === estado;
      return coincideTexto && coincideEstado;
    });

    const totalEnCurso = cache.filter((s) => s.estado === "en_curso").reduce((a, s) => a + Number(s.valor_venta || 0), 0);
    const totalCerrado = cache.filter((s) => s.estado === "cerrado").reduce((a, s) => a + Number(s.valor_venta || 0), 0);
    const totalGeneral = cache.reduce((a, s) => a + Number(s.valor_venta || 0), 0);
    document.getElementById("kpi-en-curso").textContent = formatoMoneda(totalEnCurso);
    document.getElementById("kpi-cerrado").textContent = formatoMoneda(totalCerrado);
    document.getElementById("kpi-total").textContent = formatoMoneda(totalGeneral);

    const tbody = document.getElementById("tabla-suministros");
    tbody.innerHTML = filtrados.length
      ? filtrados
          .map(
            (s) => `
      <tr class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
        <td class="px-4 py-3 font-medium">${escapeHtml(s.clientes?.nombre || "—")}</td>
        <td class="px-4 py-3">${escapeHtml(s.oferta || "—")}</td>
        <td class="px-4 py-3">${formatoFecha(s.fecha_notificacion)}</td>
        <td class="px-4 py-3">${formatoFecha(s.fecha_recibo_insumos)}</td>
        <td class="px-4 py-3">${formatoFecha(s.fecha_cierre)}</td>
        <td class="px-4 py-3 font-medium">${formatoMoneda(s.valor_venta)} ${s.iva_incluido ? "" : '<span class="text-[10px] text-gray-400">(+IVA)</span>'}</td>
        <td class="px-4 py-3">${badgeHtml(ESTADOS_SUMINISTRO, s.estado)}</td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <button class="btn-editar text-gray-400 hover:text-primary" data-id="${s.id}" title="Editar">
            <span class="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button class="btn-borrar text-gray-400 hover:text-red-600" data-id="${s.id}" title="Borrar">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </td>
      </tr>`
          )
          .join("")
      : `<tr><td class="px-4 py-8 text-center text-gray-400" colspan="8">No hay suministros para ese filtro.</td></tr>`;

    tbody.querySelectorAll(".btn-editar").forEach((btn) =>
      btn.addEventListener("click", () => abrirModal(cache.find((s) => s.id === btn.dataset.id)))
    );
    tbody.querySelectorAll(".btn-borrar").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar este suministro?")) return;
        const { error } = await window.sb.from("suministros").delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar");
        cargar();
      })
    );
  }

  function abrirModal(registro) {
    editandoId = registro?.id || null;
    document.getElementById("modal-titulo").textContent = registro ? "Editar Suministro" : "Nuevo Suministro";
    document.getElementById("s-cliente").value = registro?.cliente_id || "";
    document.getElementById("s-empresa").value = registro?.empresa_id || "";
    document.getElementById("s-oferta").value = registro?.oferta || "";
    document.getElementById("s-fecha-notificacion").value = registro?.fecha_notificacion || "";
    document.getElementById("s-fecha-recibo").value = registro?.fecha_recibo_insumos || "";
    document.getElementById("s-fecha-cierre").value = registro?.fecha_cierre || "";
    document.getElementById("s-estado").value = registro?.estado || "en_curso";
    establecerValorMoneda(document.getElementById("s-valor"), registro?.valor_venta || 0);
    document.getElementById("s-iva-incluido").checked = registro ? !!registro.iva_incluido : true;
    document.getElementById("s-notas").value = registro?.notas || "";

    document.getElementById("modal-suministro").classList.remove("hidden");
    document.getElementById("modal-suministro").classList.add("flex");
  }

  function cerrarModal() {
    document.getElementById("modal-suministro").classList.add("hidden");
    document.getElementById("modal-suministro").classList.remove("flex");
  }

  document.getElementById("btn-nuevo").addEventListener("click", () => abrirModal(null));
  document.getElementById("modal-cancelar").addEventListener("click", cerrarModal);
  document.getElementById("filtro-busqueda").addEventListener("input", render);
  document.getElementById("filtro-estado").addEventListener("change", render);

  document.getElementById("modal-guardar").addEventListener("click", async () => {
    const payload = {
      cliente_id: document.getElementById("s-cliente").value || null,
      empresa_id: document.getElementById("s-empresa").value || null,
      oferta: document.getElementById("s-oferta").value.trim() || null,
      fecha_notificacion: document.getElementById("s-fecha-notificacion").value || null,
      fecha_recibo_insumos: document.getElementById("s-fecha-recibo").value || null,
      fecha_cierre: document.getElementById("s-fecha-cierre").value || null,
      estado: document.getElementById("s-estado").value,
      valor_venta: valorMoneda(document.getElementById("s-valor")),
      iva_incluido: document.getElementById("s-iva-incluido").checked,
      notas: document.getElementById("s-notas").value.trim() || null,
    };
    const query = editandoId
      ? window.sb.from("suministros").update(payload).eq("id", editandoId)
      : window.sb.from("suministros").insert(payload);
    const { error } = await query;
    if (error) return manejarError(error, "No se pudo guardar");
    cerrarModal();
    mostrarAviso("Guardado correctamente", "exito");
    cargar();
  });

  document.getElementById("btn-exportar").addEventListener("click", () => {
    const columnas = ["Cliente", "Oferta", "Fecha Notificación", "Fecha Recibo Insumos", "Fecha Cierre", "Valor Venta", "IVA Incluido", "Estado"];
    const filas = cache.map((s) => [
      s.clientes?.nombre || "—",
      s.oferta || "",
      formatoFecha(s.fecha_notificacion),
      formatoFecha(s.fecha_recibo_insumos),
      formatoFecha(s.fecha_cierre),
      formatoMoneda(s.valor_venta),
      s.iva_incluido ? "Sí" : "No",
      (ESTADOS_SUMINISTRO[s.estado] || {}).label || s.estado,
    ]);
    descargarPlantillaExcel("suministros.xlsx", columnas, filas);
  });

  activarCamposMoneda();
  await cargarSelects();
  await cargar();
})();
