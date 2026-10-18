// ============================================================================
// PROYECTO NUEVO (solo administradores). Una sola pantalla: datos + parámetros,
// con opción de cargar todo desde la plantilla de Excel v7.
// ============================================================================
(async () => {
  const { session, profile } = await window.pctronicReady;

  // Crear proyectos es exclusivo del administrador. La base de datos también lo
  // exige (política RLS); aquí validamos primero para no mostrar un formulario
  // que no podría guardar.
  if (profile?.rol !== "admin") {
    mostrarAviso("Solo un administrador puede crear proyectos nuevos.", "error");
    window.location.href = "proyectos.html";
    return;
  }

  const form = document.getElementById("form-proyecto");
  document.getElementById("form-proyecto-campos").innerHTML = PCT.formInicioHtml();

  try {
    await PCT.cargarCatalogos();
  } catch (err) {
    return manejarError(err, "No se pudieron cargar empresas, clientes y contratistas");
  }
  PCT.llenarFormInicio(form, null);

  // Datos importados del Excel (se guardan al crear el proyecto)
  let importado = { items: [], tarifas: [] };

  // --------------------------------------------------------------------
  // Importar plantilla
  // --------------------------------------------------------------------
  document.getElementById("input-plantilla").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const caja = document.getElementById("resultado-importacion");
    caja.classList.remove("hidden");
    caja.innerHTML = `<span class="text-gray-500">Leyendo el archivo...</span>`;

    try {
      const libro = await PCT.leerLibroExcel(file);
      const inicio = PCT.parsearInicio(libro);
      let pres = { items: [], avisos: [] };
      try {
        pres = PCT.parsearPresupuesto(libro);
      } catch (errPres) {
        pres.avisos.push(errPres.message);
      }

      const avisos = [];
      const datos = { ...(inicio?.proyecto || {}) };

      const buscar = (lista, nombre) => lista.find((x) => PCT.norm(x.nombre) === PCT.norm(nombre));
      if (inicio?.clienteNombre) {
        const c = buscar(PCT.catalogos.clientes, inicio.clienteNombre);
        if (c) datos.cliente_id = c.id;
        else avisos.push(`El cliente «${inicio.clienteNombre}» no existe aún en Clientes: créalo y selecciónalo aquí.`);
      }
      if (inicio?.contratistaNombre) {
        const k = buscar(PCT.catalogos.contratistas, inicio.contratistaNombre);
        if (k) datos.contratista_principal_id = k.id;
        else avisos.push(`El contratista «${inicio.contratistaNombre}» no existe aún en Contratistas: créalo y selecciónalo aquí.`);
      }
      if (!inicio) avisos.push("El archivo no tiene hoja INICIO: solo se cargó el presupuesto.");

      // Conservar lo que ya se hubiera elegido en los selectores si el Excel no lo trae
      const actual = PCT.leerFormInicio(form);
      PCT.llenarFormInicio(form, { ...actual, ...datos, tipo_proyecto: actual.tipo_proyecto });

      importado = { items: pres.items, tarifas: inicio?.tarifas || [] };
      const caps = pres.items.filter((i) => i.tipo !== "item").length;
      caja.innerHTML = `
        <p class="font-semibold text-green-700">✔ Plantilla leída</p>
        <ul class="mt-1 list-disc pl-5 text-gray-700">
          ${inicio ? `<li>Datos y parámetros del proyecto cargados en el formulario.</li>` : ""}
          ${importado.tarifas.length ? `<li>${importado.tarifas.length} cargos de tarifas de técnicos.</li>` : ""}
          <li>${pres.items.length - caps} ítems y ${caps} capítulos/subcapítulos de presupuesto${pres.items.some((i) => i.pu_contratista !== null) ? " (con precios del contratista)" : ""}.</li>
        </ul>
        ${[...avisos, ...pres.avisos].map((a) => `<p class="mt-1 text-xs text-amber-700">⚠ ${escapeHtml(a)}</p>`).join("")}
        <p class="mt-2 text-xs text-gray-500">Revisa el formulario y pulsa «Crear proyecto». El presupuesto se guarda al crear.</p>`;
    } catch (err) {
      caja.innerHTML = `<p class="text-red-600">${escapeHtml(err.message || "No se pudo leer el archivo")}</p>`;
    }
  });

  // --------------------------------------------------------------------
  // Crear
  // --------------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = PCT.leerFormInicio(form);
    if (!payload.nombre) return mostrarAviso("El nombre del proyecto es obligatorio.", "error");
    if (!payload.empresa_id) return mostrarAviso("Selecciona la empresa propia del proyecto.", "error");

    const btn = document.getElementById("btn-crear");
    btn.disabled = true;
    btn.textContent = "Creando...";

    try {
      const { data: proyecto, error } = await window.sb
        .from("proyectos")
        .insert({ ...payload, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;

      const tarifas = importado.tarifas.length ? importado.tarifas : PCT.TARIFAS_EJEMPLO;
      const { error: errTarifas } = await window.sb
        .from("tarifas_tecnicos")
        .insert(tarifas.map((t) => ({ ...t, proyecto_id: proyecto.id })));
      if (errTarifas) throw errTarifas;

      if (importado.items.length) await PCT.insertarItems(proyecto.id, importado.items);

      mostrarAviso("Proyecto creado.", "exito");
      window.location.href = `proyecto-detalle.html?id=${proyecto.id}&tab=presupuesto`;
    } catch (err) {
      manejarError(err, "No se pudo crear el proyecto");
      btn.disabled = false;
      btn.textContent = "Crear proyecto";
    }
  });
})();
