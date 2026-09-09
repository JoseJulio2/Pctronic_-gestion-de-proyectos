(async () => {
  const { session } = await window.pctronicReady;

  const TIPOS_PROYECTO = ["CCTV", "Control de Acceso", "Alarmas", "Cableado Estructurado", "Domótica", "Mantenimiento", "Otro"];
  const CATEGORIAS_COSTO = { MP: "Materiales", EQUIPO: "Equipos", ALQUILER: "Alquileres", OTRO: "Otro" };
  const CATEGORIAS_DOCUMENTO_LABEL = { contrato: "Contrato", cotizacion: "Cotización Final", planos: "Planos", polizas: "Pólizas", otro: "Otro" };

  let contratistasCache = [];
  let proyectoId = null;

  // --------------------------------------------------------------------
  // Tipo de proyecto (multi-selección con checkboxes)
  // --------------------------------------------------------------------
  const contTipos = document.getElementById("tipo-proyecto-checks");
  contTipos.innerHTML = TIPOS_PROYECTO.map(
    (t) => `
    <label class="flex items-center gap-1.5">
      <input type="checkbox" value="${t}" class="check-tipo-proyecto rounded border-gray-300 text-primary focus:ring-primary" />
      ${t}
    </label>`
  ).join("");

  // --------------------------------------------------------------------
  // Empresa / Cliente / Contratistas
  // --------------------------------------------------------------------
  const selectEmpresa = document.getElementById("empresa_id");
  const selectCliente = document.getElementById("cliente_id");

  async function cargarEmpresas() {
    const { data, error } = await window.sb.from("empresas").select("id, nombre").order("nombre");
    if (error) return manejarError(error, "No se pudieron cargar las empresas");
    selectEmpresa.innerHTML =
      `<option value="">Seleccionar empresa...</option>` +
      (data || []).map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join("");
  }

  async function cargarClientes(seleccionarId) {
    const { data, error } = await window.sb.from("clientes").select("id, nombre").order("nombre");
    if (error) return manejarError(error, "No se pudieron cargar los clientes");
    selectCliente.innerHTML =
      `<option value="">Seleccionar un cliente...</option>` +
      data.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
    if (seleccionarId) selectCliente.value = seleccionarId;
  }

  async function cargarContratistas() {
    const { data } = await window.sb.from("contratistas").select("id, nombre").order("nombre");
    contratistasCache = data || [];
  }

  await Promise.all([cargarEmpresas(), cargarClientes(), cargarContratistas()]);

  function opcionesContratistaHtml(seleccionadoId) {
    return (
      `<option value="">— Ninguno —</option>` +
      contratistasCache.map((c) => `<option value="${c.id}" ${c.id === seleccionadoId ? "selected" : ""}>${escapeHtml(c.nombre)}</option>`).join("")
    );
  }

  // --------------------------------------------------------------------
  // Ejecutor del proyecto: personal propio vs. contratista principal
  // --------------------------------------------------------------------
  const selectEjecutorTipo = document.getElementById("ejecutor_tipo");
  const bloqueContratistaPrincipal = document.getElementById("bloque-contratista-principal");
  const selectContratistaPrincipal = document.getElementById("contratista_principal_id");
  selectContratistaPrincipal.innerHTML = opcionesContratistaHtml(null);

  function actualizarBloqueEjecutor() {
    bloqueContratistaPrincipal.classList.toggle("hidden", selectEjecutorTipo.value !== "contratista");
  }
  selectEjecutorTipo.addEventListener("change", actualizarBloqueEjecutor);
  actualizarBloqueEjecutor();

  // Modal de cliente rápido
  const modal = document.getElementById("modal-cliente");
  document.getElementById("btn-nuevo-cliente").addEventListener("click", () => {
    document.getElementById("nuevo-cliente-nombre").value = "";
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });
  document.getElementById("btn-cancelar-cliente").addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });
  document.getElementById("btn-guardar-cliente").addEventListener("click", async () => {
    const nombre = document.getElementById("nuevo-cliente-nombre").value.trim();
    if (!nombre) return;
    const { data, error } = await window.sb.from("clientes").insert({ nombre }).select().single();
    if (error) return manejarError(error, "No se pudo crear el cliente");
    await cargarClientes(data.id);
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    mostrarAviso("Cliente creado", "exito");
  });

  // --------------------------------------------------------------------
  // Impuestos del contrato (IVA simple vs AIU)
  // --------------------------------------------------------------------
  const radiosContrato = document.querySelectorAll('input[name="tipo_contrato"]');
  const bloqueIva = document.getElementById("bloque-iva");
  const bloqueAiu = document.getElementById("bloque-aiu");
  const camposPorcentajes = ["iva_porcentaje", "administracion_porcentaje", "imprevistos_porcentaje", "utilidad_porcentaje"].map((id) =>
    document.getElementById(id)
  );

  function tipoContratoActual() {
    return document.querySelector('input[name="tipo_contrato"]:checked')?.value || "iva";
  }

  function actualizarBloquesContrato() {
    const tipo = tipoContratoActual();
    bloqueAiu.classList.toggle("hidden", tipo !== "aiu");
    document.getElementById("label-iva").textContent = tipo === "aiu" ? "IVA sobre la Utilidad (%)" : "IVA (%)";
    document.getElementById("nota-iva-aiu").classList.toggle("hidden", tipo !== "aiu");
    actualizarTotalesCotizacion();
  }
  radiosContrato.forEach((r) => r.addEventListener("change", actualizarBloquesContrato));
  camposPorcentajes.forEach((el) => el.addEventListener("input", actualizarTotalesCotizacion));
  actualizarBloquesContrato();

  // --------------------------------------------------------------------
  // Paso 1 → Paso 2 (crea o actualiza el proyecto)
  // --------------------------------------------------------------------
  function datosPaso1() {
    const tiposSeleccionados = [...document.querySelectorAll(".check-tipo-proyecto:checked")].map((c) => c.value);
    return {
      nombre: document.getElementById("nombre").value.trim(),
      empresa_id: selectEmpresa.value,
      cliente_id: selectCliente.value || null,
      tipo_proyecto: tiposSeleccionados,
      estado: document.getElementById("estado").value,
      numero_contrato: document.getElementById("numero_contrato").value.trim() || null,
      ejecutor_tipo: selectEjecutorTipo.value,
      contratista_principal_id: selectEjecutorTipo.value === "contratista" ? selectContratistaPrincipal.value || null : null,
      fecha_contrato: document.getElementById("fecha_contrato").value || null,
      fecha_inicio: document.getElementById("fecha_inicio").value || null,
      fecha_fin_estimada: document.getElementById("fecha_fin_estimada").value || null,
      tipo_contrato: tipoContratoActual(),
      iva_porcentaje: Number(document.getElementById("iva_porcentaje").value || 0),
      administracion_porcentaje: Number(document.getElementById("administracion_porcentaje").value || 0),
      imprevistos_porcentaje: Number(document.getElementById("imprevistos_porcentaje").value || 0),
      utilidad_porcentaje: Number(document.getElementById("utilidad_porcentaje").value || 0),
      notas: document.getElementById("notas").value.trim() || null,
    };
  }

  function irAPaso2() {
    document.getElementById("paso-1").classList.add("hidden");
    document.getElementById("paso-2").classList.remove("hidden");
    document.getElementById("paso-indicador-1").classList.remove("text-primary");
    document.getElementById("paso-indicador-1").classList.add("text-gray-400");
    document.getElementById("paso-indicador-1").querySelector("span").classList.remove("bg-primary", "text-white");
    document.getElementById("paso-indicador-1").querySelector("span").classList.add("bg-gray-200", "text-gray-500");
    document.getElementById("paso-indicador-2").classList.remove("text-gray-400");
    document.getElementById("paso-indicador-2").classList.add("text-primary");
    document.getElementById("paso-indicador-2").querySelector("span").classList.remove("bg-gray-200", "text-gray-500");
    document.getElementById("paso-indicador-2").querySelector("span").classList.add("bg-primary", "text-white");
    document.getElementById("paso2-nombre-proyecto").textContent = document.getElementById("nombre").value.trim();
  }

  document.getElementById("form-proyecto").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectEmpresa.value) return mostrarAviso("Selecciona a cuál de tus empresas pertenece el proyecto", "error");

    const btn = document.getElementById("btn-continuar-paso2");
    btn.disabled = true;
    const payload = datosPaso1();

    if (!proyectoId) {
      const { data, error } = await window.sb
        .from("proyectos")
        .insert({ ...payload, valor_antes_impuestos: 0, created_by: session.user.id })
        .select()
        .single();
      btn.disabled = false;
      if (error) return manejarError(error, "No se pudo crear el proyecto");
      proyectoId = data.id;
      irAPaso2();
      cargarTodoPaso2();
    } else {
      const { error } = await window.sb.from("proyectos").update(payload).eq("id", proyectoId);
      btn.disabled = false;
      if (error) return manejarError(error, "No se pudo actualizar el proyecto");
      mostrarAviso("Información general actualizada", "exito");
      irAPaso2();
    }
  });

  document.getElementById("btn-editar-paso1").addEventListener("click", () => {
    document.getElementById("paso-2").classList.add("hidden");
    document.getElementById("paso-1").classList.remove("hidden");
  });

  // --------------------------------------------------------------------
  // Subpestañas del Paso 2
  // --------------------------------------------------------------------
  function activarSubtab(tab) {
    document.querySelectorAll(".subtab-btn").forEach((btn) => {
      const activo = btn.dataset.subtab === tab;
      btn.classList.toggle("border-primary", activo);
      btn.classList.toggle("text-primary", activo);
      btn.classList.toggle("border-transparent", !activo);
      btn.classList.toggle("text-gray-500", !activo);
    });
    document.querySelectorAll("[data-subtab-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.subtabPanel !== tab);
    });
  }
  document.querySelectorAll(".subtab-btn").forEach((btn) => btn.addEventListener("click", () => activarSubtab(btn.dataset.subtab)));

  // ======================================================================
  // COTIZACIÓN
  // ======================================================================
  let cotizacionCache = [];

  function actualizarTotalesCotizacion() {
    const subtotal = cotizacionCache.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.precio_unitario || 0), 0);
    const tipo = tipoContratoActual();
    const iva = Number(document.getElementById("iva_porcentaje").value || 0);
    document.getElementById("cot-subtotal").textContent = formatoMoneda(subtotal);

    if (tipo === "aiu") {
      const admin = Number(document.getElementById("administracion_porcentaje").value || 0);
      const imprev = Number(document.getElementById("imprevistos_porcentaje").value || 0);
      const util = Number(document.getElementById("utilidad_porcentaje").value || 0);
      const valorAdmin = subtotal * (admin / 100);
      const valorImprev = subtotal * (imprev / 100);
      const valorUtil = subtotal * (util / 100);
      const valorIvaUtil = valorUtil * (iva / 100);
      const total = subtotal + valorAdmin + valorImprev + valorUtil + valorIvaUtil;
      document.getElementById("cot-bloque-iva").classList.add("hidden");
      document.getElementById("cot-bloque-aiu").classList.remove("hidden");
      document.getElementById("cot-valor-admin").textContent = formatoMoneda(valorAdmin);
      document.getElementById("cot-valor-imprev").textContent = formatoMoneda(valorImprev);
      document.getElementById("cot-valor-util").textContent = formatoMoneda(valorUtil);
      document.getElementById("cot-label-iva-util").textContent = `IVA sobre la Utilidad (${iva}%)`;
      document.getElementById("cot-valor-iva-util").textContent = formatoMoneda(valorIvaUtil);
      document.getElementById("cot-total").textContent = formatoMoneda(total);
    } else {
      const valorIva = subtotal * (iva / 100);
      const total = subtotal + valorIva;
      document.getElementById("cot-bloque-iva").classList.remove("hidden");
      document.getElementById("cot-bloque-aiu").classList.add("hidden");
      document.getElementById("cot-label-iva").textContent = `IVA (${iva}%)`;
      document.getElementById("cot-valor-iva").textContent = formatoMoneda(valorIva);
      document.getElementById("cot-label-iva-util").textContent = "IVA sobre la Utilidad";
      document.getElementById("cot-valor-iva-util").textContent = formatoMoneda(0);
      document.getElementById("cot-total").textContent = formatoMoneda(total);
    }
  }

  async function sincronizarValorContrato() {
    if (!proyectoId) return;
    const subtotal = cotizacionCache.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.precio_unitario || 0), 0);
    await window.sb.from("proyectos").update({ valor_antes_impuestos: subtotal }).eq("id", proyectoId);
  }

  function renderCotizacion() {
    const tbody = document.getElementById("tabla-cotizacion");
    tbody.innerHTML = cotizacionCache.length
      ? cotizacionCache
          .map(
            (r) => `
      <tr class="border-b border-gray-50 last:border-0" data-id="${r.id}">
        <td class="px-2 py-1.5"><input type="number" class="c-numero w-14 rounded-lg border-gray-300 text-xs" value="${r.numero ?? ""}" /></td>
        <td class="px-2 py-1.5"><input class="c-referencia w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.referencia || "")}" /></td>
        <td class="px-2 py-1.5"><input class="c-descripcion w-full min-w-[160px] rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.descripcion || "")}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="0.01" class="c-cantidad w-16 rounded-lg border-gray-300 text-xs" value="${r.cantidad}" /></td>
        <td class="px-2 py-1.5"><input class="c-unidad w-14 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.unidad || "")}" /></td>
        <td class="px-2 py-1.5"><input class="c-tiempo w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.tiempo_entrega || "")}" /></td>
        <td class="px-2 py-1.5"><input class="c-marca w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.marca || "")}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="100" class="c-precio w-24 rounded-lg border-gray-300 text-xs" value="${r.precio_unitario}" /></td>
        <td class="px-2 py-1.5 whitespace-nowrap font-medium c-subtotal">${formatoMoneda(r.cantidad * r.precio_unitario)}</td>
        <td class="px-2 py-1.5"><input class="c-observaciones w-32 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.observaciones || "")}" /></td>
        <td class="px-2 py-1.5 text-right">
          <button type="button" class="btn-borrar text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
        </td>
      </tr>`
          )
          .join("")
      : `<tr><td class="px-3 py-4 text-center text-gray-400" colspan="11">Sin renglones aún. Añade uno o importa la plantilla de Excel.</td></tr>`;

    tbody.querySelectorAll("tr[data-id]").forEach((tr) => conectarFilaCotizacion(tr));
    actualizarTotalesCotizacion();
  }

  function conectarFilaCotizacion(tr) {
    const id = tr.dataset.id;
    const fila = () => cotizacionCache.find((r) => r.id === id);

    async function guardar() {
      const r = fila();
      if (!r) return;
      const payload = {
        numero: r.numero === "" || r.numero === null ? null : Number(r.numero),
        referencia: r.referencia || null,
        descripcion: r.descripcion || "",
        cantidad: Number(r.cantidad) || 0,
        unidad: r.unidad || "un",
        tiempo_entrega: r.tiempo_entrega || null,
        marca: r.marca || null,
        precio_unitario: Number(r.precio_unitario) || 0,
        observaciones: r.observaciones || null,
      };
      const { error } = await window.sb.from("cotizacion_items").update(payload).eq("id", id);
      if (error) return manejarError(error, "No se pudo guardar el renglón de la cotización");
      tr.querySelector(".c-subtotal").textContent = formatoMoneda(payload.cantidad * payload.precio_unitario);
      actualizarTotalesCotizacion();
      sincronizarValorContrato();
    }

    const mapa = {
      ".c-numero": "numero",
      ".c-referencia": "referencia",
      ".c-descripcion": "descripcion",
      ".c-cantidad": "cantidad",
      ".c-unidad": "unidad",
      ".c-tiempo": "tiempo_entrega",
      ".c-marca": "marca",
      ".c-precio": "precio_unitario",
      ".c-observaciones": "observaciones",
    };
    Object.entries(mapa).forEach(([selector, campo]) => {
      const input = tr.querySelector(selector);
      input.addEventListener("change", () => {
        const r = fila();
        if (r) r[campo] = input.value;
        guardar();
      });
    });

    tr.querySelector(".btn-borrar").addEventListener("click", async () => {
      if (!confirm("¿Borrar este renglón de la cotización?")) return;
      const { error } = await window.sb.from("cotizacion_items").delete().eq("id", id);
      if (error) return manejarError(error, "No se pudo borrar");
      cotizacionCache = cotizacionCache.filter((r) => r.id !== id);
      renderCotizacion();
      sincronizarValorContrato();
    });
  }

  async function cargarCotizacion() {
    const { data, error } = await window.sb.from("cotizacion_items").select("*").eq("proyecto_id", proyectoId).order("numero").order("created_at");
    if (error) return manejarError(error, "No se pudo cargar la cotización");
    cotizacionCache = data || [];
    renderCotizacion();
  }

  document.getElementById("btn-plantilla-cotizacion").addEventListener("click", () => {
    descargarPlantillaExcel(
      "plantilla_cotizacion.xlsx",
      ["numero", "referencia", "descripcion", "cantidad", "unidad", "tiempo_entrega", "marca", "precio_unitario", "observaciones"],
      [[1, "REF-001", "Cámara domo 4MP", 10, "un", "8 días", "Dahua", 350000, ""]]
    );
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

  // ======================================================================
  // PRESUPUESTO DE COSTOS (Materiales / Equipos / Alquileres)
  // ======================================================================
  let costosCache = [];

  function renderCostos() {
    const tbody = document.getElementById("tabla-presupuesto-costos");
    tbody.innerHTML = costosCache.length
      ? costosCache
          .map(
            (r) => `
      <tr class="border-b border-gray-50 last:border-0" data-id="${r.id}">
        <td class="px-2 py-1.5"><input type="number" class="p-numero w-14 rounded-lg border-gray-300 text-xs" value="${r.numero ?? ""}" /></td>
        <td class="px-2 py-1.5">
          <select class="p-tipo w-full rounded-lg border-gray-300 text-xs">
            ${Object.entries(CATEGORIAS_COSTO).map(([val, label]) => `<option value="${val}" ${r.tipo === val ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </td>
        <td class="px-2 py-1.5"><input class="p-referencia w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.referencia || "")}" /></td>
        <td class="px-2 py-1.5"><input class="p-descripcion w-full min-w-[160px] rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.descripcion || "")}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="0.01" class="p-cantidad w-16 rounded-lg border-gray-300 text-xs" value="${r.cantidad}" /></td>
        <td class="px-2 py-1.5"><input class="p-unidad w-14 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.unidad || "")}" /></td>
        <td class="px-2 py-1.5"><input class="p-tiempo w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.tiempo_entrega || "")}" /></td>
        <td class="px-2 py-1.5"><input class="p-marca w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.marca || "")}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="100" class="p-precio w-24 rounded-lg border-gray-300 text-xs" value="${r.valor_unitario}" /></td>
        <td class="px-2 py-1.5 whitespace-nowrap font-medium p-subtotal">${formatoMoneda(r.cantidad * r.valor_unitario)}</td>
        <td class="px-2 py-1.5 text-right">
          <button type="button" class="btn-borrar text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
        </td>
      </tr>`
          )
          .join("")
      : `<tr><td class="px-3 py-4 text-center text-gray-400" colspan="11">Sin renglones aún. Añade uno o importa la plantilla de Excel.</td></tr>`;

    tbody.querySelectorAll("tr[data-id]").forEach((tr) => conectarFilaCostos(tr));
    const total = costosCache.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.valor_unitario || 0), 0);
    document.getElementById("total-presupuesto-costos").textContent = formatoMoneda(total);
  }

  function conectarFilaCostos(tr) {
    const id = tr.dataset.id;
    const fila = () => costosCache.find((r) => r.id === id);

    async function guardar() {
      const r = fila();
      if (!r) return;
      const payload = {
        tipo: r.tipo || "MP",
        numero: r.numero === "" || r.numero == null ? null : Number(r.numero),
        referencia: r.referencia || null,
        descripcion: r.descripcion || "",
        cantidad: Number(r.cantidad) || 0,
        unidad: r.unidad || "un",
        tiempo_entrega: r.tiempo_entrega || null,
        marca: r.marca || null,
        valor_unitario: Number(r.valor_unitario) || 0,
      };
      const { error } = await window.sb.from("presupuesto_items").update(payload).eq("id", id);
      if (error) return manejarError(error, "No se pudo guardar el renglón");
      tr.querySelector(".p-subtotal").textContent = formatoMoneda(payload.cantidad * payload.valor_unitario);
      renderCostosTotales();
    }
    function renderCostosTotales() {
      const total = costosCache.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.valor_unitario || 0), 0);
      document.getElementById("total-presupuesto-costos").textContent = formatoMoneda(total);
    }

    const mapa = {
      ".p-numero": "numero",
      ".p-tipo": "tipo",
      ".p-referencia": "referencia",
      ".p-descripcion": "descripcion",
      ".p-cantidad": "cantidad",
      ".p-unidad": "unidad",
      ".p-tiempo": "tiempo_entrega",
      ".p-marca": "marca",
      ".p-precio": "valor_unitario",
    };
    Object.entries(mapa).forEach(([selector, campo]) => {
      const input = tr.querySelector(selector);
      input.addEventListener("change", () => {
        const r = fila();
        if (r) r[campo] = input.value;
        guardar();
      });
    });

    tr.querySelector(".btn-borrar").addEventListener("click", async () => {
      if (!confirm("¿Borrar este renglón?")) return;
      const { error } = await window.sb.from("presupuesto_items").delete().eq("id", id);
      if (error) return manejarError(error, "No se pudo borrar");
      costosCache = costosCache.filter((r) => r.id !== id);
      renderCostos();
    });
  }

  async function cargarCostos() {
    const { data, error } = await window.sb
      .from("presupuesto_items")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .neq("tipo", "MO")
      .order("numero")
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar el presupuesto de costos");
    costosCache = data || [];
    renderCostos();
  }

  document.getElementById("btn-plantilla-costos").addEventListener("click", () => {
    descargarPlantillaExcel(
      "plantilla_presupuesto_costos.xlsx",
      ["tipo", "numero", "referencia", "descripcion", "cantidad", "unidad", "tiempo_entrega", "marca", "valor_unitario"],
      [["MP", 1, "REF-001", "Cable UTP cat6a", 500, "m", "3 días", "Genérico", 2800]]
    );
  });

  document.getElementById("input-importar-costos").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const filas = await leerArchivoExcel(file);
      if (!filas.length) return mostrarAviso("El archivo no tiene filas para importar", "error");
      const payloads = filas
        .filter((f) => String(f.descripcion || "").trim())
        .map((f) => {
          const tipo = String(f.tipo || "MP").trim().toUpperCase();
          return {
            proyecto_id: proyectoId,
            tipo: ["MP", "EQUIPO", "ALQUILER", "OTRO"].includes(tipo) ? tipo : "MP",
            numero: f.numero !== "" && f.numero != null ? Number(f.numero) : null,
            referencia: String(f.referencia || "").trim() || null,
            descripcion: String(f.descripcion).trim(),
            cantidad: Number(f.cantidad || 1),
            unidad: String(f.unidad || "un").trim() || "un",
            tiempo_entrega: String(f.tiempo_entrega || "").trim() || null,
            marca: String(f.marca || "").trim() || null,
            valor_unitario: Number(f.valor_unitario || 0),
          };
        });
      if (!payloads.length) return mostrarAviso("No se encontraron filas válidas (falta la descripción)", "error");
      const { error } = await window.sb.from("presupuesto_items").insert(payloads);
      if (error) return manejarError(error, "No se pudo importar el presupuesto");
      mostrarAviso(`${payloads.length} renglones importados`, "exito");
      await cargarCostos();
    } catch (err) {
      manejarError(err, "No se pudo leer el archivo Excel");
    } finally {
      e.target.value = "";
    }
  });

  // ======================================================================
  // PRESUPUESTO DE MANO DE OBRA
  // ======================================================================
  let moCache = [];

  function renderMO() {
    const tbody = document.getElementById("tabla-presupuesto-mo");
    tbody.innerHTML = moCache.length
      ? moCache
          .map(
            (r) => `
      <tr class="border-b border-gray-50 last:border-0" data-id="${r.id}">
        <td class="px-2 py-1.5"><input type="number" class="m-numero w-14 rounded-lg border-gray-300 text-xs" value="${r.numero ?? ""}" /></td>
        <td class="px-2 py-1.5"><input class="m-referencia w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.referencia || "")}" /></td>
        <td class="px-2 py-1.5"><input class="m-descripcion w-full min-w-[160px] rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.descripcion || "")}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="0.01" class="m-cantidad w-16 rounded-lg border-gray-300 text-xs" value="${r.cantidad}" /></td>
        <td class="px-2 py-1.5"><input class="m-unidad w-14 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.unidad || "")}" /></td>
        <td class="px-2 py-1.5"><input class="m-marca w-20 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.marca || "")}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="100" class="m-precio w-24 rounded-lg border-gray-300 text-xs" value="${r.valor_unitario}" /></td>
        <td class="px-2 py-1.5">
          <select class="m-contratista w-full rounded-lg border-gray-300 text-xs">${opcionesContratistaHtml(r.contratista_id)}</select>
        </td>
        <td class="px-2 py-1.5 whitespace-nowrap font-medium m-subtotal">${formatoMoneda(r.cantidad * r.valor_unitario)}</td>
        <td class="px-2 py-1.5 text-right">
          <button type="button" class="btn-borrar text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
        </td>
      </tr>`
          )
          .join("")
      : `<tr><td class="px-3 py-4 text-center text-gray-400" colspan="10">Sin renglones aún. Añade uno o importa la plantilla de Excel.</td></tr>`;

    tbody.querySelectorAll("tr[data-id]").forEach((tr) => conectarFilaMO(tr));
    const total = moCache.reduce((a, r) => a + Number(r.cantidad || 0) * Number(r.valor_unitario || 0), 0);
    document.getElementById("total-presupuesto-mo").textContent = formatoMoneda(total);
  }

  function conectarFilaMO(tr) {
    const id = tr.dataset.id;
    const fila = () => moCache.find((r) => r.id === id);

    async function guardar() {
      const r = fila();
      if (!r) return;
      const payload = {
        tipo: "MO",
        numero: r.numero === "" || r.numero == null ? null : Number(r.numero),
        referencia: r.referencia || null,
        descripcion: r.descripcion || "",
        cantidad: Number(r.cantidad) || 0,
        unidad: r.unidad || "un",
        marca: r.marca || null,
        valor_unitario: Number(r.valor_unitario) || 0,
        contratista_id: r.contratista_id || null,
      };
      const { error } = await window.sb.from("presupuesto_items").update(payload).eq("id", id);
      if (error) return manejarError(error, "No se pudo guardar el renglón");
      tr.querySelector(".m-subtotal").textContent = formatoMoneda(payload.cantidad * payload.valor_unitario);
      const total = moCache.reduce((a, x) => a + Number(x.cantidad || 0) * Number(x.valor_unitario || 0), 0);
      document.getElementById("total-presupuesto-mo").textContent = formatoMoneda(total);
    }

    const mapa = {
      ".m-numero": "numero",
      ".m-referencia": "referencia",
      ".m-descripcion": "descripcion",
      ".m-cantidad": "cantidad",
      ".m-unidad": "unidad",
      ".m-marca": "marca",
      ".m-precio": "valor_unitario",
      ".m-contratista": "contratista_id",
    };
    Object.entries(mapa).forEach(([selector, campo]) => {
      const input = tr.querySelector(selector);
      input.addEventListener("change", () => {
        const r = fila();
        if (r) r[campo] = input.value;
        guardar();
      });
    });

    tr.querySelector(".btn-borrar").addEventListener("click", async () => {
      if (!confirm("¿Borrar este renglón?")) return;
      const { error } = await window.sb.from("presupuesto_items").delete().eq("id", id);
      if (error) return manejarError(error, "No se pudo borrar");
      moCache = moCache.filter((r) => r.id !== id);
      renderMO();
    });
  }

  async function cargarMO() {
    const { data, error } = await window.sb
      .from("presupuesto_items")
      .select("*")
      .eq("proyecto_id", proyectoId)
      .eq("tipo", "MO")
      .order("numero")
      .order("created_at");
    if (error) return manejarError(error, "No se pudo cargar el presupuesto de mano de obra");
    moCache = data || [];
    renderMO();
  }

  document.getElementById("btn-plantilla-mo").addEventListener("click", () => {
    descargarPlantillaExcel(
      "plantilla_presupuesto_mano_obra.xlsx",
      ["numero", "referencia", "descripcion", "cantidad", "unidad", "marca", "valor_unitario", "contratista_nombre"],
      [[1, "REF-001", "Instalación cableado UTP cat6a", 500, "m", "", 3500, ""]]
    );
  });

  document.getElementById("input-importar-mo").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const filas = await leerArchivoExcel(file);
      if (!filas.length) return mostrarAviso("El archivo no tiene filas para importar", "error");
      const payloads = filas
        .filter((f) => String(f.descripcion || "").trim())
        .map((f) => {
          const nombreContratista = String(f.contratista_nombre || "").trim().toLowerCase();
          const contratista = contratistasCache.find((c) => c.nombre.toLowerCase() === nombreContratista);
          return {
            proyecto_id: proyectoId,
            tipo: "MO",
            numero: f.numero !== "" && f.numero != null ? Number(f.numero) : null,
            referencia: String(f.referencia || "").trim() || null,
            descripcion: String(f.descripcion).trim(),
            cantidad: Number(f.cantidad || 1),
            unidad: String(f.unidad || "un").trim() || "un",
            marca: String(f.marca || "").trim() || null,
            valor_unitario: Number(f.valor_unitario || 0),
            contratista_id: contratista ? contratista.id : null,
          };
        });
      if (!payloads.length) return mostrarAviso("No se encontraron filas válidas (falta la descripción)", "error");
      const { error } = await window.sb.from("presupuesto_items").insert(payloads);
      if (error) return manejarError(error, "No se pudo importar la mano de obra");
      mostrarAviso(`${payloads.length} renglones importados`, "exito");
      await cargarMO();
    } catch (err) {
      manejarError(err, "No se pudo leer el archivo Excel");
    } finally {
      e.target.value = "";
    }
  });

  // Botones "Añadir renglón"
  document.querySelectorAll(".btn-agregar-renglon").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = btn.dataset.target;
      if (target === "cotizacion") {
        const { data, error } = await window.sb
          .from("cotizacion_items")
          .insert({ proyecto_id: proyectoId, descripcion: "", cantidad: 1, unidad: "un", precio_unitario: 0 })
          .select()
          .single();
        if (error) return manejarError(error, "No se pudo añadir el renglón");
        cotizacionCache.push(data);
        renderCotizacion();
      } else if (target === "presupuesto-costos") {
        const { data, error } = await window.sb
          .from("presupuesto_items")
          .insert({ proyecto_id: proyectoId, tipo: "MP", descripcion: "", cantidad: 1, unidad: "un", valor_unitario: 0 })
          .select()
          .single();
        if (error) return manejarError(error, "No se pudo añadir el renglón");
        costosCache.push(data);
        renderCostos();
      } else if (target === "presupuesto-mo") {
        const { data, error } = await window.sb
          .from("presupuesto_items")
          .insert({ proyecto_id: proyectoId, tipo: "MO", descripcion: "", cantidad: 1, unidad: "un", valor_unitario: 0 })
          .select()
          .single();
        if (error) return manejarError(error, "No se pudo añadir el renglón");
        moCache.push(data);
        renderMO();
      }
    });
  });

  // ======================================================================
  // DOCUMENTOS
  // ======================================================================
  async function cargarDocumentos() {
    const { data, error } = await window.sb.from("documentos").select("*").eq("proyecto_id", proyectoId).order("created_at", { ascending: false });
    if (error) return manejarError(error, "No se pudo cargar los documentos");
    document.querySelectorAll("[data-doc-categoria]").forEach((card) => {
      const categoria = card.dataset.docCategoria;
      const lista = card.querySelector(".lista-docs");
      const docs = (data || []).filter((d) => d.categoria === categoria);
      lista.innerHTML = docs.length
        ? docs
            .map(
              (d) => `
        <li class="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1" data-doc-id="${d.id}">
          <a href="${d.url}" target="_blank" rel="noopener" class="truncate text-primary hover:underline">${escapeHtml(d.nombre_archivo)}</a>
          <button type="button" class="btn-borrar-doc shrink-0 text-gray-400 hover:text-red-600" data-id="${d.id}">
            <span class="material-symbols-outlined text-[14px]">delete</span>
          </button>
        </li>`
            )
            .join("")
        : `<li class="text-gray-400">Sin archivos aún.</li>`;
    });
    document.querySelectorAll(".btn-borrar-doc").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("¿Borrar este documento?")) return;
        const { error } = await window.sb.from("documentos").delete().eq("id", btn.dataset.id);
        if (error) return manejarError(error, "No se pudo borrar");
        cargarDocumentos();
      })
    );
  }

  document.querySelectorAll("[data-doc-categoria]").forEach((card) => {
    const categoria = card.dataset.docCategoria;
    card.querySelector(".input-doc").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ruta = `${proyectoId}/${Date.now()}_${file.name}`;
      const { error: errorSubida } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
      e.target.value = "";
      if (errorSubida) return manejarError(errorSubida, "No se pudo subir el documento");
      const { data: publicUrlData } = window.sb.storage.from("documentos").getPublicUrl(ruta);
      const { error: errorInsert } = await window.sb.from("documentos").insert({
        proyecto_id: proyectoId,
        categoria,
        nombre_archivo: file.name,
        url: publicUrlData.publicUrl,
        subido_por: session.user.id,
      });
      if (errorInsert) return manejarError(errorInsert, "El archivo se subió pero no se pudo registrar en la base de datos");
      mostrarAviso(`${CATEGORIAS_DOCUMENTO_LABEL[categoria] || categoria} subido`, "exito");
      cargarDocumentos();
    });
  });

  // --------------------------------------------------------------------
  // Finalizar
  // --------------------------------------------------------------------
  document.getElementById("btn-finalizar").addEventListener("click", async () => {
    if (!proyectoId) return;
    const btn = document.getElementById("btn-finalizar");
    btn.disabled = true;
    btn.textContent = "Guardando...";
    await sincronizarValorContrato();
    window.location.href = `proyecto-detalle.html?id=${proyectoId}`;
  });

  async function cargarTodoPaso2() {
    await Promise.all([cargarCotizacion(), cargarCostos(), cargarMO(), cargarDocumentos()]);
    activarSubtab("cotizacion");
  }
})();
