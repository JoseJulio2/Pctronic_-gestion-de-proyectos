// ============================================================================
// PROYECTO NUEVO (solo administradores). Una sola pantalla: datos + parámetros,
// con opción de cargar todo desde el Excel de la cotización (o la plantilla v7).
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
  // Plantilla e importación
  // --------------------------------------------------------------------
  document.getElementById("btn-descargar-plantilla").addEventListener("click", () => PCT.descargarPlantillaCotizacion());

  // Si la cotización trae los dos totales (IVA pleno y AIU), se pregunta con
  // cuál aceptó el cliente. Devuelve "aiu" | "iva" | null (si cancela).
  const preguntarEsquema = (items, datos) =>
    new Promise((resolve) => {
      const cd = items.filter((i) => i.tipo === "item").reduce((s, i) => s + PCT.num(i.cantidad) * PCT.num(i.pu_venta), 0);
      const base = { iva_porcentaje: datos.iva_porcentaje ?? 19, administracion_porcentaje: datos.administracion_porcentaje ?? 0, imprevistos_porcentaje: datos.imprevistos_porcentaje ?? 0, utilidad_porcentaje: datos.utilidad_porcentaje ?? 0, anticipo_porcentaje: 0 };
      const tAiu = PCT.contrato({ ...base, tipo_contrato: "aiu" }, cd).total;
      const tIva = PCT.contrato({ ...base, tipo_contrato: "iva" }, cd).total;
      const opcion = (valor, titulo, detalle, total) => `
        <label class="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-primary">
          <input type="radio" name="esquema" value="${valor}" class="mt-1 text-primary focus:ring-primary" ${valor === "aiu" ? "checked" : ""} />
          <span class="flex-1"><b class="text-gray-900">${titulo}</b><br /><span class="text-xs text-gray-500">${detalle}</span></span>
          <b class="tabular-nums text-gray-900">${formatoMoneda(total)}</b>
        </label>`;
      let elegido = null;
      PCT.modal({
        titulo: "¿Con qué oferta aceptó el cliente?",
        html: `<p>La cotización trae dos totales sobre el mismo subtotal de <b>${formatoMoneda(cd)}</b>. Escoge cuál es el valor del contrato (lo puedes cambiar después en Inicio).</p>
          ${opcion("aiu", "AIU", `A ${base.administracion_porcentaje}% · I ${base.imprevistos_porcentaje}% · U ${base.utilidad_porcentaje}% · IVA ${base.iva_porcentaje}% solo sobre la utilidad`, tAiu)}
          ${opcion("iva", "IVA pleno", `IVA ${base.iva_porcentaje}% sobre todo el valor`, tIva)}`,
        botones: [
          { texto: "Cancelar", onClick: () => resolve(null) },
          {
            texto: "Usar esta oferta",
            clase: PCT.BTN_PRIMARIO,
            onClick: ({ el }) => {
              elegido = el.querySelector('input[name="esquema"]:checked')?.value || "aiu";
              resolve(elegido);
            },
          },
        ],
      });
    });

  document.getElementById("input-plantilla").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const caja = document.getElementById("resultado-importacion");
    caja.classList.remove("hidden");
    caja.innerHTML = `<span class="text-gray-500">Leyendo el archivo...</span>`;

    try {
      const libro = await PCT.leerLibroExcel(file);
      const inicio = PCT.parsearInicio(libro) || PCT.parsearEncabezadoCotizacion(libro);
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
      if (!inicio) avisos.push("No encontré los datos del proyecto (cliente, referencia...) en el archivo: solo se cargaron los ítems.");
      if (inicio?.descuento) avisos.push(`La cotización trae un descuento de ${PCT.fmtPct(inicio.descuento)}. La app todavía no lo aplica: ajusta los precios unitarios si el contrato quedó con descuento.`);
      if (inicio?.esquemas?.aiu && inicio?.esquemas?.iva) {
        const esquema = await preguntarEsquema(pres.items, datos);
        if (!esquema) {
          caja.classList.add("hidden");
          return;
        }
        datos.tipo_contrato = esquema;
      }
      if (datos.tipo_contrato === "iva") {
        datos.administracion_porcentaje = 0;
        datos.imprevistos_porcentaje = 0;
        datos.utilidad_porcentaje = 0;
      }

      // Conservar lo que ya se hubiera elegido en los selectores si el Excel no lo trae
      const actual = PCT.leerFormInicio(form);
      PCT.llenarFormInicio(form, { ...actual, ...datos, tipo_proyecto: actual.tipo_proyecto });

      importado = { items: pres.items, tarifas: inicio?.tarifas || [] };
      const caps = pres.items.filter((i) => i.tipo !== "item").length;
      caja.innerHTML = `
        <p class="font-semibold text-green-700">✔ Archivo leído</p>
        <ul class="mt-1 list-disc pl-5 text-gray-700">
          ${inicio ? `<li>Datos y parámetros del proyecto cargados en el formulario${datos.tipo_contrato ? ` (contrato ${datos.tipo_contrato === "aiu" ? "AIU" : "IVA pleno"})` : ""}.</li>` : ""}
          ${importado.tarifas.length ? `<li>${importado.tarifas.length} cargos de tarifas de técnicos.</li>` : ""}
          <li>${pres.items.length - caps} ítems y ${caps} capítulos/secciones de la cotización${pres.items.some((i) => i.pu_contratista !== null) ? " (con precios del contratista)" : ""}.</li>
        </ul>
        ${[...avisos, ...pres.avisos].map((a) => `<p class="mt-1 text-xs text-amber-700">⚠ ${escapeHtml(a)}</p>`).join("")}
        <p class="mt-2 text-xs text-gray-500">Revisa el formulario y pulsa «Crear proyecto». La cotización se guarda al crear.</p>`;
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
      window.location.href = `proyecto-detalle.html?id=${proyecto.id}&tab=cotizacion`;
    } catch (err) {
      manejarError(err, "No se pudo crear el proyecto");
      btn.disabled = false;
      btn.textContent = "Crear proyecto";
    }
  });
})();
