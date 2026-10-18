// ============================================================================
// PROYECTOS · pestaña PRESUPUESTO (hoja PRESUPUESTO de la plantilla).
// Tabla madre del proyecto: capítulos, subcapítulos e ítems con precio de venta
// y costos unitarios por tipo. Edición directa en la tabla (se guarda al salir
// de cada celda), filtro por categoría, ítems adicionales e importar/exportar.
// ============================================================================
(function (PCT) {
  // --------------------------------------------------------------------
  // Definición de columnas
  // --------------------------------------------------------------------
  // t: text | num | money (editables)   calc: valor calculado (solo lectura)
  const COL = {
    codigo: { l: "Ítem", f: "codigo", t: "text", w: "w-16" },
    descripcion: { l: "Descripción", f: "descripcion", t: "text", w: "min-w-[240px]" },
    unidad: { l: "Und", f: "unidad", t: "text", w: "w-14" },
    cantidad: { l: "Cant.", f: "cantidad", t: "num", w: "w-20" },
    pu_venta: { l: "PU venta", f: "pu_venta", t: "money", w: "w-28" },
    total_venta: { l: "Total venta", calc: (c) => c.totalVenta, fmt: "money" },
    cu_material: { l: "C.U. material (sin IVA)", f: "cu_material", t: "money", w: "w-28" },
    cu_mat_iva: { l: "C.U. material (con IVA)", calc: (c) => c.cuMatIva, fmt: "money" },
    tot_material: { l: "Total material", calc: (c) => c.totMaterial, fmt: "money" },
    cu_mano_obra: { l: "C.U. mano de obra", f: "cu_mano_obra", t: "money", w: "w-28" },
    tot_mo: { l: "Total mano de obra", calc: (c) => c.totMO, fmt: "money" },
    pu_contratista: { l: "PU contratista", f: "pu_contratista", t: "money", w: "w-28", nullable: true },
    tot_contratista: { l: "Total contratista", calc: (c) => c.totContratista, fmt: "money" },
    ahorro_mo: { l: "Ahorro vs presupuesto", calc: (c) => (c.totContratista === null ? null : c.totMO - c.totContratista), fmt: "money" },
    cu_transporte: { l: "C.U. transporte / otros", f: "cu_transporte", t: "money", w: "w-28" },
    tot_transp: { l: "Total transporte", calc: (c) => c.totTransp, fmt: "money" },
    concepto_alquiler: { l: "Concepto alquiler", f: "concepto_alquiler", t: "text", w: "w-36" },
    cu_alquiler: { l: "C.U. alquiler", f: "cu_alquiler", t: "money", w: "w-28" },
    tot_alq: { l: "Total alquiler", calc: (c) => c.totAlq, fmt: "money" },
    costo_total: { l: "Costo total", calc: (c) => c.costoTotal, fmt: "money" },
    margen: { l: "Margen $", calc: (c) => c.margen, fmt: "money" },
    margen_pct: { l: "Margen %", calc: (c) => c.margenPct, fmt: "pct" },
    es_adicional: { l: "Adic.", f: "es_adicional", t: "check", w: "w-12" },
  };

  const VISTAS = {
    general: {
      etiqueta: "General",
      cols: ["codigo", "descripcion", "unidad", "cantidad", "pu_venta", "total_venta", "cu_material", "cu_mat_iva", "cu_mano_obra", "cu_transporte", "concepto_alquiler", "cu_alquiler", "costo_total", "margen", "margen_pct", "pu_contratista", "es_adicional"],
      resumen: "total_venta",
    },
    material: { etiqueta: "Materiales y equipos", cols: ["codigo", "descripcion", "unidad", "cantidad", "cu_material", "cu_mat_iva", "tot_material"], resumen: "tot_material" },
    mo: { etiqueta: "Mano de obra", cols: ["codigo", "descripcion", "unidad", "cantidad", "cu_mano_obra", "tot_mo", "pu_contratista", "tot_contratista", "ahorro_mo"], resumen: "tot_mo" },
    transporte: { etiqueta: "Transporte y otros", cols: ["codigo", "descripcion", "unidad", "cantidad", "cu_transporte", "tot_transp"], resumen: "tot_transp" },
    alquiler: { etiqueta: "Alquileres", cols: ["codigo", "descripcion", "unidad", "cantidad", "concepto_alquiler", "cu_alquiler", "tot_alq"], resumen: "tot_alq" },
    adicionales: {
      etiqueta: "Adicionales",
      cols: ["codigo", "descripcion", "unidad", "cantidad", "pu_venta", "total_venta", "cu_material", "cu_mano_obra", "pu_contratista", "costo_total", "margen", "es_adicional"],
      resumen: "total_venta",
      soloAdicionales: true,
    },
  };

  const CLASE_CELDA =
    "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary";

  const fmtCalc = (valor, fmt) => {
    if (valor === null || valor === undefined) return "—";
    return fmt === "pct" ? PCT.fmtPct(valor) : formatoMoneda(valor);
  };

  PCT.renderPresupuesto = (root) => {
    let vista = "general";

    root.innerHTML = `
      <div class="space-y-4">
        <div id="pres-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-5"></div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div id="pres-vistas" class="flex flex-wrap gap-1.5"></div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" id="pres-plantilla" class="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">download</span> Plantilla</button>
            <label class="flex cursor-pointer items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">upload</span> Importar Excel<input type="file" id="pres-importar" accept=".xlsx,.xls" class="hidden" /></label>
            <button type="button" id="pres-exportar" class="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">table_view</span> Exportar</button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" data-nuevo="capitulo" class="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">+ Capítulo</button>
          <button type="button" data-nuevo="subcapitulo" class="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">+ Subcapítulo</button>
          <button type="button" data-nuevo="item" class="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">+ Ítem</button>
          <button type="button" data-nuevo="adicional" class="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200">+ Ítem adicional</button>
          <span class="text-xs text-gray-400">Los adicionales salen en obra y no estaban en el contrato: se avanzan y se cortan como cualquier ítem, pero no cambian el valor base del contrato.</span>
        </div>

        <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table class="min-w-full text-sm" id="pres-tabla">
            <thead class="sticky top-0 bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500"></thead>
            <tbody></tbody>
            <tfoot class="bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
          </table>
        </div>
      </div>`;

    const thead = root.querySelector("thead");
    const tbody = root.querySelector("tbody");
    const tfoot = root.querySelector("tfoot");

    // ------------------------------------------------------------------
    // KPIs
    // ------------------------------------------------------------------
    const pintarKpis = () => {
      const { base, adic } = PCT.resumenPresupuesto();
      const tarjeta = (titulo, valor, sub = "") => `
        <div class="rounded-xl border border-gray-200 bg-white p-3">
          <p class="text-[11px] font-semibold uppercase text-gray-500">${titulo}</p>
          <p class="mt-1 text-lg font-bold tabular-nums text-gray-900">${valor}</p>
          ${sub ? `<p class="text-xs text-gray-400">${sub}</p>` : ""}
        </div>`;
      root.querySelector("#pres-kpis").innerHTML =
        tarjeta("Venta (costo directo)", formatoMoneda(base.venta), `${base.n} ítems del contrato`) +
        tarjeta("Costo presupuestado", formatoMoneda(base.costo), `Mat. ${formatoMoneda(base.material)}`) +
        tarjeta("Margen bruto", formatoMoneda(base.margen), base.venta ? PCT.fmtPct(base.margen / base.venta) + " sobre la venta" : "") +
        tarjeta("Mano de obra", formatoMoneda(base.mo), `Transp. ${formatoMoneda(base.transp)} · Alq. ${formatoMoneda(base.alq)}`) +
        tarjeta("Adicionales (venta)", formatoMoneda(adic.venta), `${adic.n} ítems fuera de contrato`);
    };

    // ------------------------------------------------------------------
    // Vistas (chips)
    // ------------------------------------------------------------------
    const pintarVistas = () => {
      root.querySelector("#pres-vistas").innerHTML = Object.entries(VISTAS)
        .map(
          ([k, v]) =>
            `<button type="button" data-vista="${k}" class="rounded-full px-3 py-1.5 text-xs font-semibold ${
              k === vista ? "bg-primary text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }">${v.etiqueta}</button>`
        )
        .join("");
    };

    // ------------------------------------------------------------------
    // Tabla
    // ------------------------------------------------------------------
    const celdaEditable = (col, item) => {
      const v = item[col.f];
      if (col.t === "check") {
        return `<input type="checkbox" data-f="${col.f}" ${v ? "checked" : ""} class="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />`;
      }
      if (col.t === "money") {
        const txt = v === null || v === undefined ? "" : formatearMiles(v);
        return `<input data-f="${col.f}" data-t="money" inputmode="numeric" value="${txt}" class="input-moneda text-right tabular-nums ${CLASE_CELDA}" />`;
      }
      if (col.t === "num") {
        return `<input data-f="${col.f}" data-t="num" type="number" step="0.01" min="0" value="${v ?? 0}" class="text-right tabular-nums ${CLASE_CELDA}" />`;
      }
      return `<input data-f="${col.f}" data-t="text" value="${escapeHtml(v ?? "")}" class="${CLASE_CELDA}" />`;
    };

    const acciones = (item, idx, total) => `
      <td class="whitespace-nowrap px-1 text-right">
        <button data-acc="subir" ${idx === 0 ? "disabled" : ""} title="Subir" class="text-gray-400 hover:text-gray-800 disabled:opacity-30"><span class="material-symbols-outlined text-[16px]">arrow_upward</span></button>
        <button data-acc="bajar" ${idx === total - 1 ? "disabled" : ""} title="Bajar" class="text-gray-400 hover:text-gray-800 disabled:opacity-30"><span class="material-symbols-outlined text-[16px]">arrow_downward</span></button>
        <button data-acc="insertar" title="Insertar un ítem debajo" class="text-gray-400 hover:text-primary"><span class="material-symbols-outlined text-[16px]">playlist_add</span></button>
        <button data-acc="borrar" title="Eliminar" class="text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
      </td>`;

    const filasVisibles = () => {
      const v = VISTAS[vista];
      if (!v.soloAdicionales) return PCT.estado.items;
      return PCT.estado.items.filter((i) => i.tipo === "item" && i.es_adicional);
    };

    const pintarTabla = () => {
      const v = VISTAS[vista];
      const cols = v.cols.map((k) => COL[k]);
      thead.innerHTML = `<tr>${cols.map((c) => `<th class="px-2 py-2 ${c.w || ""} ${c.calc || c.t === "money" || c.t === "num" ? "text-right" : ""}">${c.l}</th>`).join("")}<th class="w-28"></th></tr>`;

      const items = filasVisibles();
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" class="px-4 py-10 text-center text-gray-400">${
          v.soloAdicionales
            ? "Aún no hay ítems adicionales. Usa «+ Ítem adicional» cuando salga trabajo fuera del contrato."
            : "El presupuesto está vacío. Agrega capítulos e ítems, o importa la plantilla de Excel."
        }</td></tr>`;
        tfoot.innerHTML = "";
        return;
      }

      tbody.innerHTML = items
        .map((item, idx) => {
          if (item.tipo !== "item") {
            const esCap = item.tipo === "capitulo";
            const span = cols.length - 1;
            return `
              <tr data-id="${item.id}" class="${esCap ? "bg-blue-100/70 font-bold" : "bg-blue-50/70 font-semibold"}">
                <td class="px-1">${celdaEditable(COL.codigo, item)}</td>
                <td colspan="${span}" class="px-1">
                  <div class="flex items-center gap-3">
                    <span class="text-[10px] font-bold uppercase text-primary">${esCap ? "Capítulo" : "Subcapítulo"}</span>
                    <div class="flex-1">${celdaEditable(COL.descripcion, item)}</div>
                    <span class="subtotal-cap whitespace-nowrap pr-2 text-xs tabular-nums text-gray-600"></span>
                  </div>
                </td>
                ${acciones(item, idx, items.length)}
              </tr>`;
          }
          return `
            <tr data-id="${item.id}" class="border-t border-gray-100 ${item.es_adicional ? "bg-amber-50/60" : ""}">
              ${cols
                .map((c) =>
                  c.calc
                    ? `<td class="px-2 text-right text-xs tabular-nums text-gray-700" data-calc="${v.cols.find((k) => COL[k] === c)}"></td>`
                    : `<td class="px-1">${celdaEditable(c, item)}</td>`
                )
                .join("")}
              ${acciones(item, idx, items.length)}
            </tr>`;
        })
        .join("");
      activarCamposMoneda(".input-moneda", tbody);
      actualizarCalculos();
    };

    // Actualiza celdas calculadas, subtotales de capítulo y totales SIN
    // reconstruir la tabla (así no se pierde el foco al tabular entre celdas).
    const actualizarCalculos = () => {
      const v = VISTAS[vista];
      const p = PCT.estado.proyecto;
      const porId = new Map(PCT.estado.items.map((i) => [i.id, i]));
      tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
        const item = porId.get(tr.dataset.id);
        if (!item) return;
        if (item.tipo === "item") {
          const c = PCT.calcItem(item, p);
          tr.querySelectorAll("[data-calc]").forEach((td) => {
            const col = COL[td.dataset.calc];
            td.textContent = fmtCalc(col.calc(c), col.fmt);
            if (td.dataset.calc === "margen" || td.dataset.calc === "margen_pct" || td.dataset.calc === "ahorro_mo") {
              const num = col.calc(c);
              td.classList.toggle("text-red-600", typeof num === "number" && num < 0);
            }
          });
        }
      });

      // Subtotales por capítulo/subcapítulo (según la vista activa)
      const todos = PCT.estado.items;
      todos.forEach((it, i) => {
        if (it.tipo === "item") return;
        let suma = 0;
        for (let j = i + 1; j < todos.length; j++) {
          const s = todos[j];
          if (s.tipo === "capitulo" || (it.tipo === "subcapitulo" && s.tipo === "subcapitulo")) break;
          if (s.tipo !== "item" || s.es_adicional) continue;
          const c = PCT.calcItem(s, p);
          suma += COL[v.resumen].calc(c) || 0;
        }
        const span = tbody.querySelector(`tr[data-id="${it.id}"] .subtotal-cap`);
        if (span) span.textContent = formatoMoneda(suma);
      });

      // Totales de la vista
      const t = { venta: 0, costo: 0, margen: 0, resumen: 0 };
      filasVisibles().forEach((it) => {
        const c = PCT.calcItem(it, p);
        if (!c) return;
        t.resumen += COL[v.resumen].calc(c) || 0;
        t.venta += c.totalVenta;
        t.costo += c.costoTotal;
        t.margen += c.margen;
      });
      const ncols = v.cols.length;
      tfoot.innerHTML = `<tr><td colspan="${Math.max(ncols - 1, 1)}" class="px-3 py-2 text-right uppercase">Total ${v.etiqueta}${v.soloAdicionales ? "" : " (incluye adicionales)"}</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(t.resumen)}</td><td></td></tr>`;
      pintarKpis();
    };

    // ------------------------------------------------------------------
    // Guardado de celdas
    // ------------------------------------------------------------------
    const refrescarProyecto = async () => {
      await PCT.recargarProyecto();
      PCT.emit("proyecto");
    };

    tbody.addEventListener("change", async (e) => {
      const inp = e.target;
      const tr = inp.closest("tr[data-id]");
      if (!tr || !inp.dataset.f) return;
      const item = PCT.estado.items.find((i) => i.id === tr.dataset.id);
      const campo = inp.dataset.f;
      let valor;
      if (inp.type === "checkbox") valor = inp.checked;
      else if (inp.dataset.t === "money") {
        valor = inp.value.trim() === "" && COL[Object.keys(COL).find((k) => COL[k].f === campo)].nullable ? null : valorMoneda(inp);
      } else if (inp.dataset.t === "num") valor = PCT.num(inp.value);
      else valor = inp.value.trim();

      if (campo === "descripcion" && !valor) {
        inp.value = item.descripcion;
        return mostrarAviso("La descripción no puede quedar vacía.", "error");
      }
      if (campo === "concepto_alquiler" || campo === "codigo") valor = valor || null;
      const { error } = await window.sb.from("presupuesto_items").update({ [campo]: valor }).eq("id", item.id);
      if (error) return manejarError(error, "No se pudo guardar el cambio");
      item[campo] = valor;
      if (campo === "es_adicional") {
        pintarTabla();
      } else {
        actualizarCalculos();
      }
      if (["cantidad", "pu_venta", "es_adicional"].includes(campo)) {
        await refrescarProyecto();
        await PCT.recargarEjec();
      }
    });

    // ------------------------------------------------------------------
    // Alta, movimiento y borrado de filas
    // ------------------------------------------------------------------
    const ordenFinal = () => (PCT.estado.items.length ? Math.max(...PCT.estado.items.map((i) => PCT.num(i.orden))) + 1 : 1);

    const crearFila = async (tipo, ordenNuevo, adicional = false) => {
      const nombres = { capitulo: "Nuevo capítulo", subcapitulo: "Nuevo subcapítulo", item: adicional ? "Ítem adicional" : "Nuevo ítem" };
      const fila = {
        proyecto_id: PCT.estado.proyecto.id,
        tipo,
        orden: ordenNuevo,
        descripcion: nombres[tipo],
        unidad: tipo === "item" ? "un" : null,
        cantidad: tipo === "item" ? 1 : 0,
        es_adicional: adicional,
      };
      const { data, error } = await window.sb.from("presupuesto_items").insert(fila).select().single();
      if (error) return manejarError(error, "No se pudo agregar la fila");
      await PCT.recargarItems();
      if (adicional && vista !== "adicionales" && vista !== "general") vista = "general";
      pintarVistas();
      pintarTabla();
      await refrescarProyecto();
      // llevar el foco a la descripción de la fila nueva
      const inp = tbody.querySelector(`tr[data-id="${data.id}"] [data-f="descripcion"]`);
      if (inp) {
        inp.scrollIntoView({ block: "center" });
        inp.focus();
        inp.select();
      }
    };

    root.querySelectorAll("[data-nuevo]").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.nuevo;
        if (k === "adicional") return crearFila("item", ordenFinal(), true);
        crearFila(k, ordenFinal(), false);
      })
    );

    const moverFila = async (item, dir) => {
      const lista = PCT.estado.items;
      const i = lista.findIndex((x) => x.id === item.id);
      const j = i + dir;
      if (j < 0 || j >= lista.length) return;
      const otro = lista[j];
      const a = PCT.num(item.orden);
      const b = PCT.num(otro.orden);
      const [r1, r2] = await Promise.all([
        window.sb.from("presupuesto_items").update({ orden: b }).eq("id", item.id),
        window.sb.from("presupuesto_items").update({ orden: a }).eq("id", otro.id),
      ]);
      if (r1.error || r2.error) return manejarError(r1.error || r2.error, "No se pudo mover la fila");
      await PCT.recargarItems();
      pintarTabla();
    };

    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-acc]");
      if (!btn) return;
      const tr = btn.closest("tr[data-id]");
      const item = PCT.estado.items.find((i) => i.id === tr.dataset.id);
      const acc = btn.dataset.acc;
      const lista = PCT.estado.items;
      const idx = lista.findIndex((x) => x.id === item.id);

      if (acc === "subir") return moverFila(item, -1);
      if (acc === "bajar") return moverFila(item, 1);

      if (acc === "insertar") {
        const sig = lista[idx + 1];
        const nuevo = sig ? (PCT.num(item.orden) + PCT.num(sig.orden)) / 2 : PCT.num(item.orden) + 1;
        return crearFila("item", nuevo, !!item.es_adicional);
      }

      if (acc === "borrar") {
        if (item.tipo === "item") {
          const e2 = PCT.ejecItem(item.id);
          if (PCT.num(e2.cant_ejecutada) > 0 || PCT.num(e2.cant_cortada_cliente) > 0 || PCT.num(e2.cant_cortada_mo) > 0) {
            return mostrarAviso("Este ítem ya tiene avance o cortes registrados: no se puede eliminar. Pon su cantidad en 0 si ya no aplica.", "error");
          }
        }
        const ok = await PCT.confirmar(
          "Eliminar fila",
          `¿Eliminar «${escapeHtml(item.descripcion)}»?${item.tipo !== "item" ? " Los ítems de este grupo NO se borran: quedan bajo el grupo anterior." : ""}`,
          "Eliminar",
          true
        );
        if (!ok) return;
        const { error } = await window.sb.from("presupuesto_items").delete().eq("id", item.id);
        if (error) return manejarError(error, "No se pudo eliminar");
        await PCT.recargarItems();
        pintarTabla();
        await refrescarProyecto();
      }
    });

    root.querySelector("#pres-vistas").addEventListener("click", (e) => {
      const b = e.target.closest("[data-vista]");
      if (!b) return;
      vista = b.dataset.vista;
      pintarVistas();
      pintarTabla();
    });

    // ------------------------------------------------------------------
    // Excel: plantilla, importar, exportar
    // ------------------------------------------------------------------
    const ENCABEZADOS = ["Tipo", "Ítem", "Descripción", "Und", "Cant.", "PU venta", "C.U. material (sin IVA)", "C.U. mano de obra", "C.U. transporte / otros", "Concepto alquiler", "C.U. alquiler", "PU contratista"];

    root.querySelector("#pres-plantilla").addEventListener("click", () => {
      descargarPlantillaExcel("Plantilla_Presupuesto_Pctronic.xlsx", ENCABEZADOS, [
        ["Capítulo", "1", "CCTV"],
        ["Ítem", "1.1", "Cámara domo IP 4MP", "un", 10, 850000, 520000, 60000, 15000, "", 0, 45000],
        ["Ítem", "1.2", "Cable UTP cat6", "m", 500, 4500, 2200, 800, 100, "", 0, 1500],
        ["Capítulo", "2", "Alquileres"],
        ["Ítem", "2.1", "Andamio certificado", "día", 5, 90000, 0, 0, 0, "Andamio", 30000, ""],
      ]);
    });

    root.querySelector("#pres-exportar").addEventListener("click", () => {
      const p = PCT.estado.proyecto;
      const filas = PCT.estado.items.map((i) => {
        if (i.tipo !== "item") return [i.tipo === "capitulo" ? "Capítulo" : "Subcapítulo", i.codigo || "", i.descripcion];
        const c = PCT.calcItem(i, p);
        return [
          i.es_adicional ? "Ítem (adicional)" : "Ítem", i.codigo || "", i.descripcion, i.unidad || "", PCT.num(i.cantidad), PCT.num(i.pu_venta),
          PCT.num(i.cu_material), PCT.num(i.cu_mano_obra), PCT.num(i.cu_transporte), i.concepto_alquiler || "", PCT.num(i.cu_alquiler),
          i.pu_contratista === null ? "" : PCT.num(i.pu_contratista), c.totalVenta, c.costoTotal, c.margen,
        ];
      });
      const datos = [[...ENCABEZADOS, "Total venta", "Costo total", "Margen $"], ...filas];
      const hoja = XLSX.utils.aoa_to_sheet(datos);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Presupuesto");
      XLSX.writeFile(libro, `Presupuesto_${(p.nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.xlsx`);
    });

    root.querySelector("#pres-importar").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      let resultado;
      try {
        const libro = await PCT.leerLibroExcel(file);
        resultado = PCT.parsearPresupuesto(libro);
      } catch (err) {
        return mostrarAviso(err.message, "error");
      }
      const { items, avisos } = resultado;
      if (!items.length) return mostrarAviso(avisos[0] || "No se encontraron renglones para importar.", "error");

      const caps = items.filter((i) => i.tipo !== "item").length;
      const hayEjecucion = [...PCT.estado.ejec.values()].some(
        (r) => PCT.num(r.cant_ejecutada) > 0 || PCT.num(r.cant_cortada_cliente) > 0 || PCT.num(r.cant_cortada_mo) > 0
      );
      const hayItems = PCT.estado.items.length > 0;

      const ejecutar = async (reemplazar) => {
        try {
          if (reemplazar) {
            const { error } = await window.sb.from("presupuesto_items").delete().eq("proyecto_id", PCT.estado.proyecto.id);
            if (error) throw error;
          }
          const desde = reemplazar ? 0 : Math.ceil(ordenFinal() - 1);
          await PCT.insertarItems(PCT.estado.proyecto.id, items, desde);
          await PCT.recargarItems();
          await PCT.recargarEjec();
          pintarTabla();
          await refrescarProyecto();
          mostrarAviso(`Se importaron ${items.length - caps} ítems y ${caps} capítulos.`, "exito");
        } catch (err) {
          manejarError(err, "No se pudo importar el presupuesto");
        }
      };

      if (!hayItems) return ejecutar(false);
      PCT.modal({
        titulo: "Importar presupuesto",
        html: `<p>El archivo trae <b>${items.length - caps} ítems</b> y ${caps} capítulos/subcapítulos. El proyecto ya tiene ${PCT.estado.items.length} filas en el presupuesto.</p>
          ${avisos.map((a) => `<p class="mt-2 text-xs text-gray-500">${escapeHtml(a)}</p>`).join("")}
          ${hayEjecucion ? `<p class="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Como ya hay avance o cortes registrados, solo se puede AGREGAR al final (reemplazar borraría ese historial).</p>` : ""}`,
        botones: [
          { texto: "Cancelar" },
          ...(hayEjecucion ? [] : [{ texto: "Reemplazar todo", clase: PCT.BTN_PELIGRO, onClick: () => ejecutar(true) }]),
          { texto: "Agregar al final", clase: PCT.BTN_PRIMARIO, onClick: () => ejecutar(false) },
        ],
      });
    });

    pintarVistas();
    pintarTabla();
  };
})(window.PCT);
