// ============================================================================
// PROYECTOS · formulario de datos y parámetros (hoja INICIO) + pestaña Inicio.
// El mismo formulario se usa al CREAR el proyecto y al EDITARlo después.
// ============================================================================
(function (PCT) {
  const TIPOS_PROYECTO = ["CCTV", "Control de Acceso", "Alarmas", "Cableado Estructurado", "Domótica", "Mantenimiento", "Otro"];
  const CLASE_INPUT =
    "block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm";

  // Tarifas de ejemplo de la plantilla (el usuario las reemplaza por las reales)
  PCT.TARIFAS_EJEMPLO = [
    { cargo: "Técnico electricista", valor_hora: 12000, horas_dia: 8 },
    { cargo: "Técnico de redes / CCTV", valor_hora: 12000, horas_dia: 8 },
    { cargo: "Auxiliar técnico", valor_hora: 8500, horas_dia: 8 },
    { cargo: "Supervisor / Ingeniero residente", valor_hora: 25000, horas_dia: 8 },
  ];

  const campo = (id, etiqueta, control, ayuda = "", extra = "") => `
    <div class="${extra}">
      <label class="mb-1 block text-sm font-medium text-gray-700" for="${id}">${etiqueta}</label>
      ${control}
      ${ayuda ? `<p class="mt-1 text-xs text-gray-400">${ayuda}</p>` : ""}
    </div>`;
  const input = (id, tipo = "text", attrs = "") => `<input id="${id}" type="${tipo}" ${attrs} class="${CLASE_INPUT}" />`;
  const pct = (id, ayuda, etiqueta) =>
    campo(id, etiqueta, `<div class="relative">${input(id, "number", 'min="0" step="0.001" inputmode="decimal"')}<span class="pointer-events-none absolute inset-y-0 right-8 flex items-center text-xs text-gray-400">%</span></div>`, ayuda);

  PCT.formInicioHtml = () => `
    <div class="space-y-6">
      <div>
        <h3 class="mb-3 text-base font-bold text-gray-900">Datos del proyecto</h3>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${campo("f_nombre", "Nombre del proyecto *", input("f_nombre", "text", "required"), "", "sm:col-span-2 lg:col-span-3")}
          ${campo("f_empresa_id", "Empresa (propia) *", `<select id="f_empresa_id" required class="${CLASE_INPUT}"></select>`)}
          ${campo("f_cliente_id", "Cliente", `<select id="f_cliente_id" class="${CLASE_INPUT}"></select>`)}
          ${campo("f_ciudad", "Ciudad", input("f_ciudad"))}
          ${campo("f_numero_cotizacion", "N° cotización / referencia", input("f_numero_cotizacion"))}
          ${campo("f_fecha_cotizacion", "Fecha de cotización", input("f_fecha_cotizacion", "date"))}
          ${campo("f_numero_contrato", "N° de contrato", input("f_numero_contrato", "text", 'placeholder="Ej. CT-2026-014"'))}
          ${campo("f_fecha_contrato", "Fecha de contrato", input("f_fecha_contrato", "date"))}
          ${campo("f_fecha_inicio", "Fecha de inicio de obra", input("f_fecha_inicio", "date"))}
          ${campo("f_fecha_fin_estimada", "Fecha fin contractual", input("f_fecha_fin_estimada", "date"))}
          ${campo("f_director_proyecto", "Director de proyecto", input("f_director_proyecto"))}
          ${campo("f_comercial_responsable", "Comercial responsable", input("f_comercial_responsable"))}
          ${campo(
            "f_contratista_principal_id",
            "Contratista de mano de obra",
            `<select id="f_contratista_principal_id" class="${CLASE_INPUT}"></select>`,
            "Déjalo vacío si el proyecto lo hace solo personal propio."
          )}
          ${campo(
            "f_estado",
            "Estado del proyecto",
            `<select id="f_estado" class="${CLASE_INPUT}">
              <option value="sin_iniciar">Sin iniciar</option>
              <option value="en_curso">En curso</option>
              <option value="detenido">Detenido</option>
              <option value="finalizado">Finalizado</option>
            </select>`
          )}
          <div class="sm:col-span-2 lg:col-span-3">
            <label class="mb-1 block text-sm font-medium text-gray-700">Tipo de proyecto (puedes elegir varios)</label>
            <div id="f_tipos" class="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-gray-200 p-3 text-sm">
              ${TIPOS_PROYECTO.map(
                (t) => `<label class="flex items-center gap-1.5"><input type="checkbox" value="${t}" class="f-tipo rounded border-gray-300 text-primary focus:ring-primary" /> ${t}</label>`
              ).join("")}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 class="mb-3 text-base font-bold text-gray-900">Parámetros financieros</h3>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          ${campo(
            "f_tipo_contrato",
            "Tipo de contrato",
            `<select id="f_tipo_contrato" class="${CLASE_INPUT}"><option value="aiu">AIU (IVA sobre la utilidad)</option><option value="iva">IVA simple</option></select>`,
            "", "sm:col-span-2"
          )}
          ${pct("f_iva_porcentaje", "En AIU se cobra sobre la utilidad.", "IVA")}
          ${campo(
            "f_iva_materiales",
            "¿Sumar IVA al costo de materiales?",
            `<select id="f_iva_materiales" class="${CLASE_INPUT}"><option value="1">Sí</option><option value="0">No</option></select>`,
            "En AIU el IVA de las compras es costo."
          )}
          <div class="aiu-only">${pct("f_administracion_porcentaje", "Sobre costo directo de venta.", "Administración (A)")}</div>
          <div class="aiu-only">${pct("f_imprevistos_porcentaje", "", "Imprevistos (I)")}</div>
          <div class="aiu-only">${pct("f_utilidad_porcentaje", "", "Utilidad (U)")}</div>
          ${pct("f_anticipo_porcentaje", "Se amortiza en cada acta.", "Anticipo pactado")}
          ${campo("f_anticipo_recibido", "Anticipo recibido ($)", `<input id="f_anticipo_recibido" inputmode="numeric" class="input-moneda ${CLASE_INPUT}" />`, "Digítalo cuando entre.")}
          ${pct("f_impuestos_porcentaje", "Sobre costo directo.", "Impuestos")}
          ${pct("f_polizas_porcentaje", "Sobre total del contrato.", "Pólizas")}
          ${pct("f_legales_porcentaje", "Sobre costo directo.", "Gastos legales")}
          ${pct("f_recargo_hora_extra_porcentaje", "Para horas extra de técnicos propios.", "Recargo hora extra")}
        </div>
      </div>

      <div>
        ${campo("f_notas", "Notas", `<textarea id="f_notas" rows="3" class="${CLASE_INPUT}"></textarea>`)}
      </div>
    </div>`;

  const opciones = (lista, vacio) =>
    `<option value="">${vacio}</option>` +
    lista.map((x) => `<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join("");

  // Llena los selectores y (si hay) los valores del proyecto en el formulario
  PCT.llenarFormInicio = (root, p = null) => {
    const q = (id) => root.querySelector("#" + id);
    const cat = PCT.catalogos;
    q("f_empresa_id").innerHTML = opciones(cat.empresas, "Seleccionar empresa...");
    q("f_cliente_id").innerHTML = opciones(cat.clientes, "Seleccionar un cliente...");
    q("f_contratista_principal_id").innerHTML = opciones(cat.contratistas, "Sin contratista (personal propio)");
    activarCamposMoneda(".input-moneda", root);

    const valores = {
      f_nombre: p?.nombre ?? "",
      f_empresa_id: p?.empresa_id ?? (cat.empresas.length === 1 ? cat.empresas[0].id : ""),
      f_cliente_id: p?.cliente_id ?? "",
      f_ciudad: p?.ciudad ?? "",
      f_numero_cotizacion: p?.numero_cotizacion ?? "",
      f_fecha_cotizacion: p?.fecha_cotizacion ?? "",
      f_numero_contrato: p?.numero_contrato ?? "",
      f_fecha_contrato: p?.fecha_contrato ?? "",
      f_fecha_inicio: p?.fecha_inicio ?? "",
      f_fecha_fin_estimada: p?.fecha_fin_estimada ?? "",
      f_director_proyecto: p?.director_proyecto ?? "",
      f_comercial_responsable: p?.comercial_responsable ?? "",
      f_contratista_principal_id: p?.contratista_principal_id ?? "",
      f_estado: p?.estado ?? "sin_iniciar",
      f_tipo_contrato: p?.tipo_contrato ?? "aiu",
      f_iva_porcentaje: p?.iva_porcentaje ?? 19,
      f_iva_materiales: p ? (p.iva_materiales ? "1" : "0") : "1",
      f_administracion_porcentaje: p?.administracion_porcentaje ?? 8,
      f_imprevistos_porcentaje: p?.imprevistos_porcentaje ?? 3,
      f_utilidad_porcentaje: p?.utilidad_porcentaje ?? 5,
      f_anticipo_porcentaje: p?.anticipo_porcentaje ?? 30,
      f_impuestos_porcentaje: p?.impuestos_porcentaje ?? 5.1,
      f_polizas_porcentaje: p?.polizas_porcentaje ?? 1.5,
      f_legales_porcentaje: p?.legales_porcentaje ?? 0.1,
      f_recargo_hora_extra_porcentaje: p?.recargo_hora_extra_porcentaje ?? 25,
      f_notas: p?.notas ?? "",
    };
    Object.entries(valores).forEach(([id, v]) => {
      const el = q(id);
      if (el) el.value = v;
    });
    establecerValorMoneda(q("f_anticipo_recibido"), p?.anticipo_recibido || 0);
    const tipos = new Set(p?.tipo_proyecto || []);
    root.querySelectorAll(".f-tipo").forEach((c) => (c.checked = tipos.has(c.value)));

    const alternarAiu = () => {
      const esAiu = q("f_tipo_contrato").value === "aiu";
      root.querySelectorAll(".aiu-only").forEach((d) => d.classList.toggle("hidden", !esAiu));
    };
    q("f_tipo_contrato").addEventListener("change", alternarAiu);
    alternarAiu();
  };

  // Lee el formulario y devuelve las columnas de `proyectos`
  PCT.leerFormInicio = (root) => {
    const q = (id) => root.querySelector("#" + id);
    const txt = (id) => q(id).value.trim() || null;
    const n = (id) => PCT.num(q(id).value);
    const esAiu = q("f_tipo_contrato").value === "aiu";
    const contratista = q("f_contratista_principal_id").value || null;
    return {
      nombre: q("f_nombre").value.trim(),
      empresa_id: q("f_empresa_id").value || null,
      cliente_id: q("f_cliente_id").value || null,
      ciudad: txt("f_ciudad"),
      numero_cotizacion: txt("f_numero_cotizacion"),
      fecha_cotizacion: q("f_fecha_cotizacion").value || null,
      numero_contrato: txt("f_numero_contrato"),
      fecha_contrato: q("f_fecha_contrato").value || null,
      fecha_inicio: q("f_fecha_inicio").value || null,
      fecha_fin_estimada: q("f_fecha_fin_estimada").value || null,
      director_proyecto: txt("f_director_proyecto"),
      comercial_responsable: txt("f_comercial_responsable"),
      contratista_principal_id: contratista,
      ejecutor_tipo: contratista ? "contratista" : "personal_propio",
      estado: q("f_estado").value,
      tipo_proyecto: [...root.querySelectorAll(".f-tipo:checked")].map((c) => c.value),
      tipo_contrato: q("f_tipo_contrato").value,
      iva_porcentaje: n("f_iva_porcentaje"),
      iva_materiales: q("f_iva_materiales").value === "1",
      administracion_porcentaje: esAiu ? n("f_administracion_porcentaje") : 0,
      imprevistos_porcentaje: esAiu ? n("f_imprevistos_porcentaje") : 0,
      utilidad_porcentaje: esAiu ? n("f_utilidad_porcentaje") : 0,
      anticipo_porcentaje: n("f_anticipo_porcentaje"),
      anticipo_recibido: valorMoneda(q("f_anticipo_recibido")),
      impuestos_porcentaje: n("f_impuestos_porcentaje"),
      polizas_porcentaje: n("f_polizas_porcentaje"),
      legales_porcentaje: n("f_legales_porcentaje"),
      recargo_hora_extra_porcentaje: n("f_recargo_hora_extra_porcentaje"),
      notas: txt("f_notas"),
    };
  };

  // --------------------------------------------------------------------
  // Pestaña INICIO del proyecto
  // --------------------------------------------------------------------
  PCT.renderInicio = (root) => {
    root.innerHTML = `
      <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div class="space-y-5 xl:col-span-2">
          <form id="form-inicio" class="rounded-xl border border-gray-200 bg-white p-5">
            <div id="form-inicio-campos"></div>
            <div class="mt-5 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              <span id="inicio-estado" class="text-xs text-gray-400"></span>
              <button type="submit" class="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Guardar cambios</button>
            </div>
          </form>

          <div class="rounded-xl border border-gray-200 bg-white p-5">
            <div class="mb-1 flex items-center justify-between">
              <h3 class="text-base font-bold text-gray-900">Tarifas de técnicos propios</h3>
              <button id="btn-tarifa-nueva" type="button" class="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                <span class="material-symbols-outlined text-[16px]">add</span> Agregar cargo
              </button>
            </div>
            <p class="mb-3 text-xs text-amber-700">Los valores iniciales son de EJEMPLO: reemplázalos por las tarifas reales de la empresa.</p>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="text-left text-xs uppercase text-gray-500">
                  <tr><th class="py-2 pr-3">Cargo</th><th class="py-2 pr-3">Valor hora</th><th class="py-2 pr-3">Horas / día</th><th class="py-2 pr-3">Valor día</th><th></th></tr>
                </thead>
                <tbody id="tabla-tarifas"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div id="panel-contrato" class="h-fit rounded-xl border border-gray-200 bg-white p-5"></div>
      </div>`;

    const form = root.querySelector("#form-inicio");
    root.querySelector("#form-inicio-campos").innerHTML = PCT.formInicioHtml();
    PCT.llenarFormInicio(form, PCT.estado.proyecto);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = PCT.leerFormInicio(form);
      if (!payload.nombre) return mostrarAviso("El nombre del proyecto es obligatorio.", "error");
      if (!payload.empresa_id) return mostrarAviso("Selecciona la empresa propia del proyecto.", "error");
      const { error } = await window.sb.from("proyectos").update(payload).eq("id", PCT.estado.proyecto.id);
      if (error) return manejarError(error, "No se pudo guardar el proyecto");
      await PCT.recargarProyecto();
      mostrarAviso("Proyecto actualizado.", "exito");
      PCT.emit("proyecto");
      pintarContrato();
    });

    const pintarContrato = () => {
      const c = PCT.contrato();
      const p = PCT.estado.proyecto;
      const fila = (t, v, fuerte = false) =>
        `<div class="flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? "border-t border-gray-200 pt-2.5 font-bold text-gray-900" : "text-gray-600"}"><dt>${t}</dt><dd class="tabular-nums">${formatoMoneda(v)}</dd></div>`;
      root.querySelector("#panel-contrato").innerHTML = `
        <h3 class="mb-1 text-base font-bold text-gray-900">Valor del contrato <span class="text-xs font-normal text-gray-400">(calculado)</span></h3>
        <p class="mb-3 text-xs text-gray-400">Sale solo de los ítems del Presupuesto. No se digita.</p>
        <dl class="text-sm">
          ${fila("Costo directo (valor de venta)", c.cd)}
          ${p.tipo_contrato === "aiu" ? fila(`Administración (${p.administracion_porcentaje}%)`, c.admin) + fila(`Imprevistos (${p.imprevistos_porcentaje}%)`, c.imprev) + fila(`Utilidad (${p.utilidad_porcentaje}%)`, c.util) : ""}
          ${fila(p.tipo_contrato === "aiu" ? `IVA sobre utilidad (${p.iva_porcentaje}%)` : `IVA (${p.iva_porcentaje}%)`, c.iva)}
          ${fila("TOTAL CONTRATO", c.total, true)}
        </dl>
        <dl class="mt-4 border-t border-dashed border-gray-200 pt-3 text-sm">
          ${fila("Ingreso sin IVA", c.ingreso)}
          ${fila(`Anticipo pactado (${p.anticipo_porcentaje}%)`, c.anticipo)}
          ${fila("Anticipo recibido", PCT.num(p.anticipo_recibido))}
        </dl>`;
    };
    pintarContrato();

    // ---- Tarifas ----
    const tbody = root.querySelector("#tabla-tarifas");
    const pintarTarifas = () => {
      const t = PCT.estado.tarifas;
      if (!t.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-gray-400">Sin cargos. Agrega al menos uno para registrar horas de técnicos propios.</td></tr>`;
        return;
      }
      tbody.innerHTML = t
        .map(
          (r) => `
        <tr data-id="${r.id}" class="border-t border-gray-100">
          <td class="py-1.5 pr-3"><input data-campo="cargo" value="${escapeHtml(r.cargo)}" class="${CLASE_INPUT}" /></td>
          <td class="py-1.5 pr-3"><input data-campo="valor_hora" inputmode="numeric" value="${formatearMiles(r.valor_hora)}" class="input-moneda ${CLASE_INPUT}" /></td>
          <td class="py-1.5 pr-3"><input data-campo="horas_dia" type="number" min="0" step="0.5" value="${r.horas_dia}" class="${CLASE_INPUT}" /></td>
          <td class="py-1.5 pr-3 tabular-nums text-gray-600 val-dia">${formatoMoneda(PCT.num(r.valor_hora) * PCT.num(r.horas_dia))}</td>
          <td class="py-1.5 text-right"><button data-borrar class="text-gray-400 hover:text-red-600" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>
        </tr>`
        )
        .join("");
      activarCamposMoneda(".input-moneda", tbody);
    };
    pintarTarifas();

    tbody.addEventListener("change", async (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const inp = e.target;
      const campoDb = inp.dataset.campo;
      const valor = campoDb === "valor_hora" ? valorMoneda(inp) : campoDb === "cargo" ? inp.value.trim() : PCT.num(inp.value);
      if (campoDb === "cargo" && !valor) return mostrarAviso("El cargo no puede quedar vacío.", "error");
      const { error } = await window.sb.from("tarifas_tecnicos").update({ [campoDb]: valor }).eq("id", tr.dataset.id);
      if (error) return manejarError(error, "No se pudo guardar la tarifa");
      const fila = PCT.estado.tarifas.find((x) => x.id === tr.dataset.id);
      if (fila) fila[campoDb] = valor;
      tr.querySelector(".val-dia").textContent = formatoMoneda(PCT.num(fila.valor_hora) * PCT.num(fila.horas_dia));
    });
    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-borrar]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      const { error } = await window.sb.from("tarifas_tecnicos").delete().eq("id", id);
      if (error) return manejarError(error, "No se pudo eliminar la tarifa");
      await PCT.recargarTarifas();
      pintarTarifas();
    });
    root.querySelector("#btn-tarifa-nueva").addEventListener("click", async () => {
      const { error } = await window.sb
        .from("tarifas_tecnicos")
        .insert({ proyecto_id: PCT.estado.proyecto.id, cargo: "Nuevo cargo", valor_hora: 0, horas_dia: 8 });
      if (error) return manejarError(error, "No se pudo agregar el cargo");
      await PCT.recargarTarifas();
      pintarTarifas();
    });
  };
})(window.PCT);
