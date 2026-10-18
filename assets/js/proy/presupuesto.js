// ============================================================================
// PROYECTOS · pestañas COTIZACIÓN y PRESUPUESTO DE COSTOS.
// Las dos leen la misma tabla madre (presupuesto_items), ítem por ítem:
//   · Cotización: lo que se le ofreció al cliente (referencia, marca, cantidad,
//     precio unitario...). De aquí sale el valor del contrato. Aquí se agregan,
//     mueven y borran filas.
//   · Presupuesto de costos: el costo de material/equipos de cada ítem de la
//     cotización y el margen. El cliente nunca ve estas columnas. (La mano de
//     obra va en la Fase 3; transporte y alquiler salen de Gastos.)
// Importar / exportar usan la plantilla de cotización de Pctronic
// (docs/Plantilla_Cotizacion_Pctronic.xlsx); la de costos le agrega columnas.
// Edición directa en la tabla (se guarda al salir de cada celda).
// ============================================================================
(function (PCT) {
  // --------------------------------------------------------------------
  // Definición de columnas
  // --------------------------------------------------------------------
  // t: text | num | money | check (editables)   calc: valor calculado
  const COL = {
    codigo: { l: "#", f: "codigo", t: "text", w: "w-14" },
    referencia: { l: "Referencia", f: "referencia", t: "text", w: "w-28" },
    descripcion: { l: "Descripción", f: "descripcion", t: "text", w: "min-w-[260px]" },
    marca: { l: "Marca", f: "marca", t: "text", w: "w-24" },
    unidad: { l: "Und", f: "unidad", t: "text", w: "w-14" },
    cantidad: { l: "Cant.", f: "cantidad", t: "num", w: "w-20" },
    tiempo_entrega: { l: "Tiempo de entrega", f: "tiempo_entrega", t: "text", w: "w-24" },
    pu_venta: { l: "Precio unitario", f: "pu_venta", t: "money", w: "w-28" },
    total_venta: { l: "Subtotal", calc: (c) => c.totalVenta, fmt: "money" },
    observaciones: { l: "Observaciones", f: "observaciones", t: "text", w: "min-w-[160px]" },
    cu_material: { l: "C.U. material (sin IVA)", f: "cu_material", t: "money", w: "w-28" },
    cu_mat_iva: { l: "C.U. material (con IVA)", calc: (c) => c.cuMatIva, fmt: "money" },
    costo_total: { l: "Costo total", calc: (c) => c.costoTotal, fmt: "money" },
    margen: { l: "Margen $", calc: (c) => c.margen, fmt: "money" },
    margen_pct: { l: "Margen %", calc: (c) => c.margenPct, fmt: "pct" },
    es_adicional: { l: "Adic.", f: "es_adicional", t: "check", w: "w-12" },
  };

  const COLS_COTIZACION = ["codigo", "referencia", "descripcion", "marca", "unidad", "cantidad", "tiempo_entrega", "pu_venta", "total_venta", "observaciones", "es_adicional"];

  const MODOS = {
    cotizacion: {
      vistas: {
        cotizacion: { etiqueta: "Cotización", cols: COLS_COTIZACION, resumen: "total_venta" },
        adicionales: { etiqueta: "Adicionales", cols: COLS_COTIZACION, resumen: "total_venta", soloAdicionales: true },
      },
      editaFilas: true,
      // en la cotización todo es editable
      soloLectura: new Set(),
    },
    costos: {
      vistas: {
        costos: {
          etiqueta: "Costos",
          cols: ["codigo", "descripcion", "unidad", "cantidad", "total_venta", "cu_material", "cu_mat_iva", "costo_total", "margen", "margen_pct"],
          resumen: "costo_total",
        },
      },
      editaFilas: false,
      // lo que viene de la cotización se cambia en la pestaña Cotización
      soloLectura: new Set(["codigo", "descripcion", "unidad", "cantidad", "pu_venta", "es_adicional"]),
    },
  };

  const CLASE_CELDA =
    "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary";

  const fmtCalc = (valor, fmt) => {
    if (valor === null || valor === undefined) return "—";
    return fmt === "pct" ? PCT.fmtPct(valor) : formatoMoneda(valor);
  };

  PCT.renderCotizacion = (root) => renderTabla(root, "cotizacion");
  PCT.renderCostos = (root) => renderTabla(root, "costos");

  function renderTabla(root, modo) {
    const M = MODOS[modo];
    const VISTAS = M.vistas;
    let vista = Object.keys(VISTAS)[0];

    const btnBarra = "flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50";
    const barraExcel =
      modo === "cotizacion"
        ? `<button type="button" id="pres-plantilla" class="${btnBarra}"><span class="material-symbols-outlined text-[16px]">download</span> Plantilla</button>
           <label class="${btnBarra} cursor-pointer"><span class="material-symbols-outlined text-[16px]">upload</span> Importar cotización<input type="file" id="pres-importar" accept=".xlsx,.xls" class="hidden" /></label>
           <button type="button" id="pres-exportar" class="${btnBarra}"><span class="material-symbols-outlined text-[16px]">table_view</span> Exportar</button>`
        : `<button type="button" id="pres-exportar" class="${btnBarra}"><span class="material-symbols-outlined text-[16px]">table_view</span> Exportar costos (plantilla)</button>
           <label class="${btnBarra} cursor-pointer"><span class="material-symbols-outlined text-[16px]">upload</span> Importar costos<input type="file" id="pres-importar" accept=".xlsx,.xls" class="hidden" /></label>`;

    const barraFilas = M.editaFilas
      ? `<div class="flex flex-wrap items-center gap-2">
          <button type="button" data-nuevo="capitulo" class="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">+ Capítulo</button>
          <button type="button" data-nuevo="subcapitulo" class="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">+ Subcapítulo</button>
          <button type="button" data-nuevo="item" class="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">+ Ítem</button>
          <button type="button" data-nuevo="adicional" class="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200">+ Ítem adicional</button>
          <span class="text-xs text-gray-400">Los adicionales salen en obra y no estaban en el contrato: se avanzan y se cortan como cualquier ítem, pero no cambian el valor base del contrato.</span>
        </div>`
      : `<p class="text-xs text-gray-500">El costo de material y equipos de cada ítem de la Cotización (la mano de obra va en la Fase 3). El cliente no ve esta información. Para agregar o quitar ítems, o cambiar cantidades y precios de venta, ve a la pestaña <b>Cotización</b>. Para llenar los costos en Excel: <b>Exportar costos</b>, llena la columna «C.U. material» y vuelve a <b>Importar costos</b>.</p>`;

    root.innerHTML = `
      <div class="space-y-4">
        <div id="pres-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-5"></div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div id="pres-vistas" class="flex flex-wrap gap-1.5"></div>
          <div class="flex flex-wrap items-center gap-2">${barraExcel}</div>
        </div>

        ${barraFilas}

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
    const tarjeta = (titulo, valor, sub = "") => `
      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-[11px] font-semibold uppercase text-gray-500">${titulo}</p>
        <p class="mt-1 text-lg font-bold tabular-nums text-gray-900">${valor}</p>
        ${sub ? `<p class="text-xs text-gray-400">${sub}</p>` : ""}
      </div>`;

    const pintarKpis = () => {
      const { base, adic } = PCT.resumenPresupuesto();
      const p = PCT.estado.proyecto;
      let html;
      if (modo === "cotizacion") {
        const c = PCT.contrato(p, base.venta);
        const aiu = p.tipo_contrato === "aiu";
        html =
          tarjeta("Subtotal cotización", formatoMoneda(base.venta), `${base.n} ítems · costo directo`) +
          (aiu
            ? tarjeta("A + I + U", formatoMoneda(c.admin + c.imprev + c.util), `A ${p.administracion_porcentaje}% · I ${p.imprevistos_porcentaje}% · U ${p.utilidad_porcentaje}%`)
            : tarjeta(`IVA (${p.iva_porcentaje}%)`, formatoMoneda(c.iva), "IVA pleno sobre todo el valor")) +
          (aiu ? tarjeta(`IVA sobre utilidad (${p.iva_porcentaje}%)`, formatoMoneda(c.iva)) : tarjeta("Ingreso sin IVA", formatoMoneda(c.ingreso))) +
          tarjeta("Valor del contrato", formatoMoneda(c.total), aiu ? "Esquema AIU" : "Esquema IVA pleno") +
          tarjeta("Adicionales", formatoMoneda(adic.venta), `${adic.n} ítems fuera de contrato`);
      } else {
        const sinCosto = PCT.estado.items.filter((i) => i.tipo === "item" && !i.es_adicional && PCT.calcItem(i, p).costoTotal === 0).length;
        const colorMargen = base.margen > 0 ? "text-green-600" : base.margen < 0 ? "text-red-600" : "";
        html =
          tarjeta("Venta (costo directo)", formatoMoneda(base.venta), `${base.n} ítems de la cotización`) +
          tarjeta("Costo presupuestado", formatoMoneda(base.costo), "Materiales y equipos") +
          tarjeta("Margen bruto", `<span class="${colorMargen}">${formatoMoneda(base.margen)}</span>`, "Venta − costo") +
          tarjeta("Margen %", `<span class="${colorMargen}">${base.venta ? PCT.fmtPct(base.margen / base.venta) : "—"}</span>`, "Sobre la venta") +
          tarjeta("Ítems sin costo", String(sinCosto), sinCosto ? "Faltan costos por llenar" : "Todos tienen costo");
      }
      root.querySelector("#pres-kpis").innerHTML = html;
    };

    // ------------------------------------------------------------------
    // Vistas (chips)
    // ------------------------------------------------------------------
    const pintarVistas = () => {
      // con una sola vista no hace falta mostrar los botones
      if (Object.keys(VISTAS).length < 2) return (root.querySelector("#pres-vistas").innerHTML = "");
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
    const celdaLectura = (col, item) => {
      const v = item[col.f];
      let txt;
      if (col.t === "check") txt = v ? "Sí" : "";
      else if (col.t === "money") txt = v === null || v === undefined ? "" : formatoMoneda(v);
      else if (col.t === "num") txt = PCT.fmtCant(v);
      else txt = escapeHtml(v ?? "");
      const der = col.t === "money" || col.t === "num" ? "text-right tabular-nums" : "";
      return `<span class="block px-1.5 py-1 text-xs text-gray-700 ${der}">${txt}</span>`;
    };

    const celdaEditable = (key, item) => {
      const col = COL[key];
      if (M.soloLectura.has(key)) return celdaLectura(col, item);
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

    const acciones = (idx, total) =>
      M.editaFilas
        ? `<td class="whitespace-nowrap px-1 text-right">
            <button data-acc="subir" ${idx === 0 ? "disabled" : ""} title="Subir" class="text-gray-400 hover:text-gray-800 disabled:opacity-30"><span class="material-symbols-outlined text-[16px]">arrow_upward</span></button>
            <button data-acc="bajar" ${idx === total - 1 ? "disabled" : ""} title="Bajar" class="text-gray-400 hover:text-gray-800 disabled:opacity-30"><span class="material-symbols-outlined text-[16px]">arrow_downward</span></button>
            <button data-acc="insertar" title="Insertar un ítem debajo" class="text-gray-400 hover:text-primary"><span class="material-symbols-outlined text-[16px]">playlist_add</span></button>
            <button data-acc="borrar" title="Eliminar" class="text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
          </td>`
        : "";

    const filasVisibles = () => {
      const v = VISTAS[vista];
      if (!v.soloAdicionales) return PCT.estado.items;
      return PCT.estado.items.filter((i) => i.tipo === "item" && i.es_adicional);
    };

    const pintarTabla = () => {
      const v = VISTAS[vista];
      const cols = v.cols.map((k) => COL[k]);
      thead.innerHTML = `<tr>${cols.map((c) => `<th class="px-2 py-2 ${c.w || ""} ${c.calc || c.t === "money" || c.t === "num" ? "text-right" : ""}">${c.l}</th>`).join("")}${M.editaFilas ? `<th class="w-28"></th>` : ""}</tr>`;

      const items = filasVisibles();
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" class="px-4 py-10 text-center text-gray-400">${
          v.soloAdicionales
            ? "Aún no hay ítems adicionales. Usa «+ Ítem adicional» cuando salga trabajo fuera del contrato."
            : modo === "cotizacion"
              ? "La cotización está vacía. Agrega capítulos e ítems, o importa el Excel de la cotización."
              : "Todavía no hay ítems. Primero llena la pestaña Cotización."
        }</td></tr>`;
        tfoot.innerHTML = "";
        pintarKpis();
        return;
      }

      tbody.innerHTML = items
        .map((item, idx) => {
          if (item.tipo !== "item") {
            const esCap = item.tipo === "capitulo";
            const span = cols.length - 1;
            return `
              <tr data-id="${item.id}" class="${esCap ? "bg-blue-100/70 font-bold" : "bg-blue-50/70 font-semibold"}">
                <td class="px-1">${celdaEditable("codigo", item)}</td>
                <td colspan="${span}" class="px-1">
                  <div class="flex items-center gap-3">
                    <span class="text-[10px] font-bold uppercase text-primary">${esCap ? "Capítulo" : "Subcapítulo"}</span>
                    <div class="flex-1">${celdaEditable("descripcion", item)}</div>
                    <span class="subtotal-cap whitespace-nowrap pr-2 text-xs tabular-nums text-gray-600"></span>
                  </div>
                </td>
                ${acciones(idx, items.length)}
              </tr>`;
          }
          return `
            <tr data-id="${item.id}" class="border-t border-gray-100 ${item.es_adicional ? "bg-amber-50/60" : ""}">
              ${v.cols
                .map((k) =>
                  COL[k].calc
                    ? `<td class="px-2 text-right text-xs tabular-nums text-gray-700" data-calc="${k}"></td>`
                    : `<td class="px-1">${celdaEditable(k, item)}</td>`
                )
                .join("")}
              ${acciones(idx, items.length)}
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
        if (!item || item.tipo !== "item") return;
        const c = PCT.calcItem(item, p);
        tr.querySelectorAll("[data-calc]").forEach((td) => {
          const col = COL[td.dataset.calc];
          const num = col.calc(c);
          td.textContent = fmtCalc(num, col.fmt);
          if (["margen", "margen_pct"].includes(td.dataset.calc)) {
            td.classList.toggle("text-red-600", typeof num === "number" && num < 0);
            td.classList.toggle("text-green-600", typeof num === "number" && num > 0);
          }
        });
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
          suma += COL[v.resumen].calc(PCT.calcItem(s, p)) || 0;
        }
        const span = tbody.querySelector(`tr[data-id="${it.id}"] .subtotal-cap`);
        if (span) span.textContent = formatoMoneda(suma);
      });

      // Total de la vista
      let total = 0;
      filasVisibles().forEach((it) => {
        const c = PCT.calcItem(it, p);
        if (c) total += COL[v.resumen].calc(c) || 0;
      });
      const ncols = v.cols.length;
      tfoot.innerHTML = `<tr><td colspan="${Math.max(ncols - 1, 1)}" class="px-3 py-2 text-right uppercase">Total ${v.etiqueta}${v.soloAdicionales ? "" : " (incluye adicionales)"}</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(total)}</td>${M.editaFilas ? "<td></td>" : ""}</tr>`;
      pintarKpis();
    };

    // ------------------------------------------------------------------
    // Guardado de celdas
    // ------------------------------------------------------------------
    const refrescarProyecto = async () => {
      await PCT.recargarProyecto();
      PCT.emit("proyecto");
    };

    const CAMPOS_TEXTO_OPCIONAL = ["codigo", "referencia", "marca", "tiempo_entrega", "observaciones"];

    tbody.addEventListener("change", async (e) => {
      const inp = e.target;
      const tr = inp.closest("tr[data-id]");
      if (!tr || !inp.dataset.f) return;
      const item = PCT.estado.items.find((i) => i.id === tr.dataset.id);
      const campo = inp.dataset.f;
      const col = COL[Object.keys(COL).find((k) => COL[k].f === campo)];
      let valor;
      if (inp.type === "checkbox") valor = inp.checked;
      else if (inp.dataset.t === "money") valor = inp.value.trim() === "" && col.nullable ? null : valorMoneda(inp);
      else if (inp.dataset.t === "num") valor = PCT.num(inp.value);
      else valor = inp.value.trim();

      if (campo === "descripcion" && !valor) {
        inp.value = item.descripcion;
        return mostrarAviso("La descripción no puede quedar vacía.", "error");
      }
      if (CAMPOS_TEXTO_OPCIONAL.includes(campo)) valor = valor || null;
      const { error } = await window.sb.from("presupuesto_items").update({ [campo]: valor }).eq("id", item.id);
      if (error) return manejarError(error, "No se pudo guardar el cambio");
      item[campo] = valor;
      if (campo === "es_adicional") pintarTabla();
      else actualizarCalculos();
      if (["cantidad", "pu_venta", "es_adicional"].includes(campo)) {
        await refrescarProyecto();
        await PCT.recargarEjec();
      }
    });

    // ------------------------------------------------------------------
    // Alta, movimiento y borrado de filas (solo en Cotización)
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
    // Excel: siempre con la plantilla de cotización de Pctronic
    // ------------------------------------------------------------------
    const exportar = async (conCostos) => {
      const btn = root.querySelector("#pres-exportar");
      btn.disabled = true;
      try {
        await PCT.exportarCotizacionExcel(PCT.estado.proyecto, PCT.estado.items, { conCostos });
      } catch (err) {
        manejarError(err, "No se pudo exportar");
      } finally {
        btn.disabled = false;
      }
    };

    if (modo === "cotizacion") {
      root.querySelector("#pres-plantilla").addEventListener("click", () => PCT.descargarPlantillaCotizacion());
      root.querySelector("#pres-exportar").addEventListener("click", () => exportar(false));

      root.querySelector("#pres-importar").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        let resultado;
        try {
          resultado = PCT.parsearPresupuesto(await PCT.leerLibroExcel(file));
        } catch (err) {
          return mostrarAviso(err.message, "error");
        }
        const { items, avisos } = resultado;
        if (!items.length) return mostrarAviso(avisos[0] || "No se encontraron renglones para importar.", "error");

        const caps = items.filter((i) => i.tipo !== "item").length;
        const hayEjecucion = [...PCT.estado.ejec.values()].some(
          (r) => PCT.num(r.cant_ejecutada) > 0 || PCT.num(r.cant_cortada_cliente) > 0 || PCT.num(r.cant_cortada_mo) > 0
        );

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
            mostrarAviso(`Se importaron ${items.length - caps} ítems y ${caps} capítulos.${avisos.length ? " " + avisos.join(" ") : ""}`, avisos.length ? "info" : "exito");
          } catch (err) {
            manejarError(err, "No se pudo importar la cotización");
          }
        };

        if (!PCT.estado.items.length) return ejecutar(false);
        PCT.modal({
          titulo: "Importar cotización",
          html: `<p>El archivo trae <b>${items.length - caps} ítems</b> y ${caps} capítulos/subcapítulos. El proyecto ya tiene ${PCT.estado.items.length} filas en la cotización.</p>
            ${avisos.map((a) => `<p class="mt-2 text-xs text-gray-500">${escapeHtml(a)}</p>`).join("")}
            ${hayEjecucion ? `<p class="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Como ya hay avance o cortes registrados, solo se puede AGREGAR al final (reemplazar borraría ese historial).</p>` : ""}`,
          botones: [
            { texto: "Cancelar" },
            ...(hayEjecucion ? [] : [{ texto: "Reemplazar todo", clase: PCT.BTN_PELIGRO, onClick: () => ejecutar(true) }]),
            { texto: "Agregar al final", clase: PCT.BTN_PRIMARIO, onClick: () => ejecutar(false) },
          ],
        });
      });
    } else {
      // Exportar costos (la plantilla con los ítems y la columna C.U. material)
      // → llenar en Excel → importar costos. Se cruzan por # y descripción.
      root.querySelector("#pres-exportar").addEventListener("click", () => exportar(true));

      root.querySelector("#pres-importar").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        let res;
        try {
          res = PCT.parsearPresupuesto(await PCT.leerLibroExcel(file));
        } catch (err) {
          return mostrarAviso(err.message, "error");
        }
        if (!res.columnas.includes("cu_material")) {
          return mostrarAviso("El archivo no trae la columna «C.U. material (sin IVA)». Usa «Exportar costos (plantilla)», llénala y vuelve a importarla.", "error");
        }
        const clave = (codigo, desc) => `${PCT.norm(codigo)}|${PCT.norm(desc).replace(/\s+/g, " ")}`;
        const porClave = new Map();
        PCT.estado.items.filter((i) => i.tipo === "item").forEach((i) => porClave.set(clave(i.codigo, i.descripcion), i));
        const cambios = [];
        let sinPareja = 0;
        res.items
          .filter((i) => i.tipo === "item")
          .forEach((f) => {
            const it = porClave.get(clave(f.codigo, f.descripcion));
            if (!it) return sinPareja++;
            if (PCT.num(it.cu_material) !== f.cu_material) cambios.push({ id: it.id, datos: { cu_material: f.cu_material } });
          });
        if (!cambios.length) {
          return mostrarAviso(
            sinPareja ? "Ningún renglón del archivo coincide con los ítems de la cotización (se cruzan por # y descripción)." : "Los costos del archivo son iguales a los que ya tiene el proyecto.",
            sinPareja ? "error" : "info"
          );
        }
        try {
          for (const c of cambios) {
            const { error } = await window.sb.from("presupuesto_items").update(c.datos).eq("id", c.id);
            if (error) throw error;
          }
          await PCT.recargarItems();
          pintarTabla();
          mostrarAviso(`Se actualizaron los costos de ${cambios.length} ítems.${sinPareja ? ` ${sinPareja} renglones del archivo no coincidieron con ningún ítem.` : ""}`, sinPareja ? "info" : "exito");
        } catch (err) {
          manejarError(err, "No se pudieron importar los costos");
        }
      });
    }

    pintarVistas();
    pintarTabla();
  }
})(window.PCT);
