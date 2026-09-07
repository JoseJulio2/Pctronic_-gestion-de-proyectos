(async () => {
  const { session } = await window.pctronicReady;

  const TIPOS_PROYECTO = ["CCTV", "Control de Acceso", "Alarmas", "Cableado Estructurado", "Domótica", "Mantenimiento", "Otro"];
  const ETIQUETA_TIPO_ITEM = { MO: "Mano de Obra", MP: "Materiales", EQUIPO: "Equipos", ALQUILER: "Alquileres", OTRO: "Otro" };

  let contratistasCache = [];
  let renglonesPresupuesto = [];

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
  // Empresa / Cliente
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
  // Valor del contrato: IVA vs AIU + campo de dinero con separador de miles
  // --------------------------------------------------------------------
  activarCamposMoneda();

  const radiosContrato = document.querySelectorAll('input[name="tipo_contrato"]');
  const bloqueIva = document.getElementById("bloque-iva");
  const bloqueAiu = document.getElementById("bloque-aiu");
  const camposContrato = [
    "valor_antes_impuestos",
    "iva_porcentaje",
    "administracion_porcentaje",
    "imprevistos_porcentaje",
    "utilidad_porcentaje",
  ].map((id) => document.getElementById(id));

  function tipoContratoActual() {
    return document.querySelector('input[name="tipo_contrato"]:checked')?.value || "iva";
  }

  function actualizarBloquesContrato() {
    const tipo = tipoContratoActual();
    // El bloque de IVA se mantiene siempre visible: en AIU el IVA aplica
    // solo sobre la Utilidad, así que sigue siendo necesario.
    bloqueAiu.classList.toggle("hidden", tipo !== "aiu");
    document.getElementById("label-iva").textContent = tipo === "aiu" ? "IVA sobre la Utilidad (%)" : "IVA (%)";
    document.getElementById("nota-iva-aiu").classList.toggle("hidden", tipo !== "aiu");
    actualizarPreviewContrato();
  }

  function actualizarPreviewContrato() {
    const tipo = tipoContratoActual();
    const base = valorMoneda(document.getElementById("valor_antes_impuestos"));
    const iva = Number(document.getElementById("iva_porcentaje").value || 0);
    let total;
    if (tipo === "aiu") {
      const admin = Number(document.getElementById("administracion_porcentaje").value || 0);
      const imprev = Number(document.getElementById("imprevistos_porcentaje").value || 0);
      const util = Number(document.getElementById("utilidad_porcentaje").value || 0);
      // valor_total = base*(1+(A+I+U)/100) + base*(U/100)*(IVA/100)  → IVA solo sobre la Utilidad.
      total = base * (1 + (admin + imprev + util) / 100) + base * (util / 100) * (iva / 100);
    } else {
      total = base * (1 + iva / 100);
    }
    document.getElementById("preview-valor-total").textContent = formatoMoneda(total);
  }

  radiosContrato.forEach((r) => r.addEventListener("change", actualizarBloquesContrato));
  camposContrato.forEach((el) => el.addEventListener("input", actualizarPreviewContrato));
  actualizarBloquesContrato();

  // --------------------------------------------------------------------
  // Presupuesto inicial (tabla editable en memoria)
  // --------------------------------------------------------------------
  function opcionesContratistaHtml(seleccionadoId) {
    return (
      `<option value="">— Ninguno —</option>` +
      contratistasCache.map((c) => `<option value="${c.id}" ${c.id === seleccionadoId ? "selected" : ""}>${escapeHtml(c.nombre)}</option>`).join("")
    );
  }

  function renderPresupuestoInicial() {
    const tbody = document.getElementById("tabla-presupuesto-inicial");
    tbody.innerHTML = renglonesPresupuesto.length
      ? renglonesPresupuesto
          .map(
            (r, idx) => `
      <tr class="border-b border-gray-50 last:border-0" data-idx="${idx}">
        <td class="px-2 py-1.5">
          <select class="r-tipo w-full rounded-lg border-gray-300 text-xs">
            ${Object.entries(ETIQUETA_TIPO_ITEM).map(([val, label]) => `<option value="${val}" ${r.tipo === val ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </td>
        <td class="px-2 py-1.5"><input class="r-descripcion w-full rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.descripcion)}" /></td>
        <td class="px-2 py-1.5"><input class="r-unidad w-16 rounded-lg border-gray-300 text-xs" value="${escapeHtml(r.unidad)}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="0.01" class="r-cantidad w-20 rounded-lg border-gray-300 text-xs" value="${r.cantidad}" /></td>
        <td class="px-2 py-1.5"><input type="number" min="0" step="100" class="r-valor w-28 rounded-lg border-gray-300 text-xs" value="${r.valor_unitario}" /></td>
        <td class="px-2 py-1.5 whitespace-nowrap text-xs font-medium">${formatoMoneda(r.cantidad * r.valor_unitario)}</td>
        <td class="px-2 py-1.5 text-right">
          <button type="button" class="btn-borrar-renglon text-gray-400 hover:text-red-600">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </td>
      </tr>`
          )
          .join("")
      : `<tr><td class="px-3 py-4 text-center text-xs text-gray-400" colspan="7">Sin renglones. Puedes crear el proyecto igual y añadir el presupuesto después.</td></tr>`;

    const total = renglonesPresupuesto.reduce((a, r) => a + r.cantidad * r.valor_unitario, 0);
    document.getElementById("total-presupuesto-inicial").textContent = formatoMoneda(total);

    tbody.querySelectorAll("tr[data-idx]").forEach((tr) => {
      const idx = Number(tr.dataset.idx);
      tr.querySelector(".r-tipo").addEventListener("change", (e) => (renglonesPresupuesto[idx].tipo = e.target.value));
      tr.querySelector(".r-descripcion").addEventListener("input", (e) => (renglonesPresupuesto[idx].descripcion = e.target.value));
      tr.querySelector(".r-unidad").addEventListener("input", (e) => (renglonesPresupuesto[idx].unidad = e.target.value));
      tr.querySelector(".r-cantidad").addEventListener("input", (e) => {
        renglonesPresupuesto[idx].cantidad = Number(e.target.value || 0);
        renderPresupuestoInicial();
      });
      tr.querySelector(".r-valor").addEventListener("input", (e) => {
        renglonesPresupuesto[idx].valor_unitario = Number(e.target.value || 0);
        renderPresupuestoInicial();
      });
      tr.querySelector(".btn-borrar-renglon").addEventListener("click", () => {
        renglonesPresupuesto.splice(idx, 1);
        renderPresupuestoInicial();
      });
    });
  }

  document.getElementById("btn-agregar-renglon").addEventListener("click", () => {
    renglonesPresupuesto.push({ tipo: "MO", descripcion: "", unidad: "un", cantidad: 1, valor_unitario: 0, contratista_id: null, es_adicional: false });
    renderPresupuestoInicial();
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

      filas
        .filter((f) => String(f.descripcion || "").trim())
        .forEach((f) => {
          const tipo = String(f.tipo || "OTRO").trim().toUpperCase();
          const nombreContratista = String(f.contratista_nombre || "").trim().toLowerCase();
          const contratista = contratistasCache.find((c) => c.nombre.toLowerCase() === nombreContratista);
          const adicionalTexto = String(f.es_adicional || "").trim().toLowerCase();
          renglonesPresupuesto.push({
            tipo: ["MO", "MP", "EQUIPO", "ALQUILER", "OTRO"].includes(tipo) ? tipo : "OTRO",
            descripcion: String(f.descripcion).trim(),
            unidad: String(f.unidad || "un").trim() || "un",
            cantidad: Number(f.cantidad || 1),
            valor_unitario: Number(f.valor_unitario || 0),
            contratista_id: contratista ? contratista.id : null,
            es_adicional: ["si", "sí", "true", "1", "yes"].includes(adicionalTexto),
          });
        });
      renderPresupuestoInicial();
      mostrarAviso("Renglones importados. Revísalos antes de crear el proyecto.", "exito");
    } catch (err) {
      manejarError(err, "No se pudo leer el archivo Excel");
    } finally {
      e.target.value = "";
    }
  });

  renderPresupuestoInicial();

  // --------------------------------------------------------------------
  // Guardar proyecto
  // --------------------------------------------------------------------
  document.getElementById("form-proyecto").addEventListener("submit", async (e) => {
    e.preventDefault();

    const tiposSeleccionados = [...document.querySelectorAll(".check-tipo-proyecto:checked")].map((c) => c.value);
    if (!selectEmpresa.value) return mostrarAviso("Selecciona a cuál de tus empresas pertenece el proyecto", "error");

    const btn = document.getElementById("btn-guardar");
    btn.disabled = true;
    btn.textContent = "Guardando...";

    const payload = {
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
      valor_antes_impuestos: valorMoneda(document.getElementById("valor_antes_impuestos")),
      iva_porcentaje: Number(document.getElementById("iva_porcentaje").value || 0),
      administracion_porcentaje: Number(document.getElementById("administracion_porcentaje").value || 0),
      imprevistos_porcentaje: Number(document.getElementById("imprevistos_porcentaje").value || 0),
      utilidad_porcentaje: Number(document.getElementById("utilidad_porcentaje").value || 0),
      notas: document.getElementById("notas").value.trim() || null,
      created_by: session.user.id,
    };

    const { data, error } = await window.sb.from("proyectos").insert(payload).select().single();

    if (error) {
      manejarError(error, "No se pudo crear el proyecto");
      btn.disabled = false;
      btn.textContent = "Crear Proyecto";
      return;
    }

    const renglonesValidos = renglonesPresupuesto.filter((r) => r.descripcion.trim());
    if (renglonesValidos.length) {
      const payloadsPresupuesto = renglonesValidos.map((r) => ({
        proyecto_id: data.id,
        tipo: r.tipo,
        descripcion: r.descripcion.trim(),
        unidad: r.unidad || "un",
        cantidad: r.cantidad || 1,
        valor_unitario: r.valor_unitario || 0,
        contratista_id: r.contratista_id || null,
        es_adicional: !!r.es_adicional,
      }));
      const { error: errorPresupuesto } = await window.sb.from("presupuesto_items").insert(payloadsPresupuesto);
      if (errorPresupuesto) {
        mostrarAviso("El proyecto se creó, pero hubo un error al guardar el presupuesto inicial: " + errorPresupuesto.message, "error");
      }
    }

    window.location.href = `proyecto-detalle.html?id=${data.id}`;
  });
})();
