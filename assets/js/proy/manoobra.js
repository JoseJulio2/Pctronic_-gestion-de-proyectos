// ============================================================================
// PROYECTOS · pestaña MANO DE OBRA (hoja MANO DE OBRA de la plantilla v7).
//   1) Contrato del contratista: por ítem, PU de mano de obra presupuestado
//      (cu_mano_obra) y PU pactado con el contratista (pu_contratista) → ahorro.
//   2) Cortes del contratista: se proponen desde lo que el Avance diario marcó
//      como ejecutado por 'contratista' y aún no se le ha cortado (esté pagado
//      o no). Valor = Σ cant × PU contratista; retención según el contratista
//      (persona natural declarante 4 %, no declarante 6 %, empresa 0 %).
//      Los PAGOS se registran como gastos (tipo 'Mano de obra contratista',
//      con corte_mo_id): Gastos sigue siendo la única fuente del dinero que sale.
//   3) Técnicos propios: una fila por técnico y día. Valor = valor_hora ×
//      (días × horas_día + horas_extra × (1 + recargo)).
// ============================================================================
(function (PCT) {
  const CLASE_INPUT = "block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-primary focus:ring-primary";
  const CELDA = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-xs tabular-nums hover:border-gray-300 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary";
  const TIPO_GASTO_MO = "Mano de obra contratista";

  PCT.renderManoObra = async (root) => {
    const p = () => PCT.estado.proyecto;
    const pid = PCT.estado.proyecto.id;
    let cortes = []; // cortes_mo
    let lineas = []; // cortes_mo_items
    let pagos = []; // gastos de mano de obra contratista
    let propia = []; // registro_mo_propia

    const soloItems = () => PCT.estado.items.filter((i) => i.tipo === "item");
    const itemPorId = (id) => PCT.estado.items.find((i) => i.id === id);
    const lineasDe = (corteId) => lineas.filter((l) => l.corte_id === corteId);
    const brutoDe = (corteId) => lineasDe(corteId).reduce((s, l) => s + PCT.num(l.cantidad) * PCT.num(l.pu_contratista_snapshot), 0);
    const pagadoDe = (corteId) => pagos.filter((g) => g.corte_mo_id === corteId).reduce((s, g) => s + PCT.num(g.valor_total), 0);
    const contratista = () => (p().contratista_principal_id ? { id: p().contratista_principal_id, ...(p().contratista || {}) } : null);
    const calcCorte = (c) => {
      const bruto = brutoDe(c.id);
      const retencion = bruto * (PCT.num(c.retencion_porcentaje) / 100);
      const pagado = pagadoDe(c.id);
      return { bruto, retencion, neto: bruto - retencion, pagado, saldo: bruto - pagado };
    };
    const tarifaPorId = (id) => PCT.estado.tarifas.find((t) => t.id === id);
    const valorPropia = (r) => {
      const t = tarifaPorId(r.tarifa_id);
      if (!t) return 0;
      const horasDia = r.horas_dia === null || r.horas_dia === undefined ? PCT.num(t.horas_dia) : PCT.num(r.horas_dia);
      const recargo = 1 + PCT.num(p().recargo_hora_extra_porcentaje) / 100;
      return PCT.num(t.valor_hora) * (PCT.num(r.dias) * horasDia + PCT.num(r.horas_extra) * recargo);
    };
    const horasPropia = (r) => {
      const t = tarifaPorId(r.tarifa_id);
      const horasDia = r.horas_dia === null || r.horas_dia === undefined ? PCT.num(t?.horas_dia) : PCT.num(r.horas_dia);
      return PCT.num(r.dias) * horasDia + PCT.num(r.horas_extra);
    };

    const cargar = async () => {
      const [c, g, r] = await Promise.all([
        window.sb.from("cortes_mo").select("*").eq("proyecto_id", pid).order("numero", { ascending: true }),
        window.sb.from("gastos").select("*").eq("proyecto_id", pid).eq("tipo", TIPO_GASTO_MO).order("fecha", { ascending: true }),
        window.sb.from("registro_mo_propia").select("*").eq("proyecto_id", pid).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (g.error) throw g.error;
      if (r.error) throw r.error;
      cortes = c.data || [];
      pagos = g.data || [];
      propia = r.data || [];
      const ids = cortes.map((x) => x.id);
      if (!ids.length) {
        lineas = [];
        return;
      }
      const l = await window.sb.from("cortes_mo_items").select("*").in("corte_id", ids);
      if (l.error) throw l.error;
      lineas = l.data || [];
    };

    const refrescar = async () => {
      await Promise.all([cargar(), PCT.recargarEjec(), PCT.recargarFinanzas()]);
      pintarTodo();
      PCT.emit("proyecto");
    };

    root.innerHTML = `
      <div class="space-y-5">
        <div id="mo-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"></div>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">Cortes del contratista</h3>
              <p id="mo-contratista" class="text-xs text-gray-500"></p>
            </div>
            <button id="mo-nuevo" class="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><span class="material-symbols-outlined text-[18px]">add</span> Nuevo corte</button>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-3 py-2">N°</th><th class="px-3 py-2">Fecha</th><th class="px-3 py-2">Cuenta de cobro</th><th class="px-3 py-2 text-right">Valor corte</th><th class="px-3 py-2 text-right">Retención</th><th class="px-3 py-2 text-right">Neto a girar</th><th class="px-3 py-2 text-right">Pagado</th><th class="px-3 py-2 text-right">Saldo</th><th class="px-3 py-2"></th></tr>
              </thead>
              <tbody id="mo-cortes"></tbody>
              <tfoot id="mo-cortes-total" class="bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3">
            <h3 class="text-base font-bold text-gray-900">Contrato del contratista</h3>
            <p class="text-xs text-gray-500">Por cada ítem: lo que se presupuestó de mano de obra y lo que se pactó con el contratista (por unidad). Haz clic en un precio para cambiarlo. El ejecutado sale del Avance diario (solo lo marcado como «Contratista»).</p>
          </div>
          <div class="max-h-[560px] overflow-auto rounded-lg border border-gray-100">
            <table class="min-w-full text-sm">
              <thead class="sticky top-0 z-10 bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-2 py-2">#</th><th class="px-2 py-2">Descripción</th><th class="px-2 py-2">Und</th><th class="px-2 py-2 text-right">Cant.</th><th class="px-2 py-2 text-right">PU MO presupuesto</th><th class="px-2 py-2 text-right">PU contratista</th><th class="px-2 py-2 text-right">Total presupuesto</th><th class="px-2 py-2 text-right">Total contratista</th><th class="px-2 py-2 text-right">Ahorro</th><th class="px-2 py-2 text-right">Ejecutado</th><th class="px-2 py-2 text-right">Cortado</th><th class="px-2 py-2 text-right">Por cortar</th></tr>
              </thead>
              <tbody id="mo-contrato"></tbody>
              <tfoot id="mo-contrato-total" class="sticky bottom-0 bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3">
            <h3 class="text-base font-bold text-gray-900">Técnicos propios</h3>
            <p class="text-xs text-gray-500">Una fila por técnico y día. El valor hora y las horas por día salen de las tarifas de la pestaña Inicio; deja «Horas/día» vacío para usar las del cargo.</p>
          </div>
          <form id="mo-form-propia" class="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 md:grid-cols-12 md:items-end"></form>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-2 py-2">Fecha</th><th class="px-2 py-2">Técnico</th><th class="px-2 py-2">Cargo</th><th class="px-2 py-2">Ítem / actividad</th><th class="px-2 py-2 text-right">Días</th><th class="px-2 py-2 text-right">Horas/día</th><th class="px-2 py-2 text-right">Horas extra</th><th class="px-2 py-2 text-right">Horas</th><th class="px-2 py-2 text-right">Valor</th><th class="px-2 py-2">Observaciones</th><th></th></tr>
              </thead>
              <tbody id="mo-propia"></tbody>
              <tfoot id="mo-propia-total" class="bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
        </div>
      </div>`;

    // ------------------------------------------------------------------
    // KPIs
    // ------------------------------------------------------------------
    const pintarKpis = () => {
      let ppto = 0;
      let contrato = 0;
      let ahorro = 0; // solo donde ya hay PU contratista
      let pptoConPrecio = 0;
      let conPrecio = 0;
      let ejecutadoContratista = 0;
      soloItems()
        .filter((i) => !i.es_adicional)
        .forEach((i) => {
          const totPpto = PCT.num(i.cantidad) * PCT.num(i.cu_mano_obra);
          ppto += totPpto;
          if (i.pu_contratista !== null && i.pu_contratista !== undefined) {
            const totContr = PCT.num(i.cantidad) * PCT.num(i.pu_contratista);
            contrato += totContr;
            ahorro += totPpto - totContr;
            pptoConPrecio += totPpto;
            conPrecio += 1;
          }
        });
      soloItems().forEach((i) => (ejecutadoContratista += PCT.num(PCT.ejecItem(i.id).cant_ejecutada_contratista) * PCT.num(i.pu_contratista)));
      const tot = cortes.map(calcCorte).reduce((s, x) => ({ bruto: s.bruto + x.bruto, pagado: s.pagado + x.pagado }), { bruto: 0, pagado: 0 });
      const costoPropia = propia.reduce((s, r) => s + valorPropia(r), 0);
      root.querySelector("#mo-kpis").innerHTML =
        PCT.tarjetaKpi("Presupuesto MO", formatoMoneda(ppto), "Cant. × PU MO presupuesto") +
        PCT.tarjetaKpi("Contrato contratista", formatoMoneda(contrato), "Cant. × PU contratista") +
        PCT.tarjetaKpi("Ahorro vs presupuesto", formatoMoneda(ahorro), !conPrecio ? "Aún sin precios del contratista" : pptoConPrecio ? `${PCT.fmtPct(ahorro / pptoConPrecio)} · ${conPrecio} ítems con precio` : `${conPrecio} ítems con precio, sin PU MO presupuesto`, ahorro > 0 ? "text-green-600" : ahorro < 0 ? "text-red-600" : "text-gray-900") +
        PCT.tarjetaKpi("Cortado al contratista", formatoMoneda(tot.bruto), `${cortes.length} cortes · ejecutado ${formatoMoneda(ejecutadoContratista)}`) +
        PCT.tarjetaKpi("Saldo por pagar", formatoMoneda(tot.bruto - tot.pagado), `Pagado ${formatoMoneda(tot.pagado)}`, tot.bruto - tot.pagado > 0 ? "text-amber-700" : "text-gray-900") +
        PCT.tarjetaKpi("Técnicos propios", formatoMoneda(costoPropia), `${PCT.fmtCant(propia.reduce((s, r) => s + horasPropia(r), 0))} horas`);
    };

    // ------------------------------------------------------------------
    // Cortes del contratista
    // ------------------------------------------------------------------
    const pintarCortes = () => {
      const k = contratista();
      root.querySelector("#mo-contratista").innerHTML = k
        ? `Contratista: <b>${escapeHtml(k.nombre || "")}</b> · retención ${PCT.num(k.porcentaje_retencion)}%. Cada corte propone lo que él ejecutó (Avance diario) y aún no se le ha cortado.`
        : `<span class="text-amber-700">Este proyecto no tiene contratista asignado. Asígnalo en la pestaña <b>Inicio</b> para poder hacerle cortes.</span>`;
      const tbody = root.querySelector("#mo-cortes");
      const filas = cortes.map((c) => ({ c, x: calcCorte(c) }));
      tbody.innerHTML = filas.length
        ? filas
            .map(
              ({ c, x }) => `<tr data-id="${c.id}" class="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
                <td class="px-3 py-2 font-semibold">${c.numero}</td>
                <td class="px-3 py-2">${formatoFecha(c.fecha)}</td>
                <td class="px-3 py-2 text-xs text-gray-600">${escapeHtml(c.numero_cuenta_cobro || "—")}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(x.bruto)}</td>
                <td class="px-3 py-2 text-right tabular-nums text-gray-500">${formatoMoneda(x.retencion)} <span class="text-[10px]">(${PCT.num(c.retencion_porcentaje)}%)</span></td>
                <td class="px-3 py-2 text-right font-semibold tabular-nums">${formatoMoneda(x.neto)}</td>
                <td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(x.pagado)}</td>
                <td class="px-3 py-2 text-right tabular-nums ${x.saldo > 0.5 ? "text-amber-700" : "text-green-600"}">${x.saldo > 0.5 ? formatoMoneda(x.saldo) : "Pagado"}</td>
                <td class="whitespace-nowrap px-3 py-2 text-right">
                  <button data-acc="ver" class="text-xs font-semibold text-primary hover:underline">Abrir</button>
                  <button data-acc="pdf" title="Corte en PDF" class="ml-2 text-gray-400 hover:text-gray-800"><span class="material-symbols-outlined text-[18px] align-middle">picture_as_pdf</span></button>
                </td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="9" class="py-8 text-center text-gray-400">Aún no hay cortes al contratista.</td></tr>`;
      const t = filas.reduce((s, { x }) => ({ bruto: s.bruto + x.bruto, ret: s.ret + x.retencion, neto: s.neto + x.neto, pagado: s.pagado + x.pagado, saldo: s.saldo + x.saldo }), { bruto: 0, ret: 0, neto: 0, pagado: 0, saldo: 0 });
      root.querySelector("#mo-cortes-total").innerHTML = filas.length
        ? `<tr><td colspan="3" class="px-3 py-2 uppercase">Total</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.bruto)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.ret)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.neto)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.pagado)}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(t.saldo)}</td><td></td></tr>`
        : "";
    };

    const resumenCorte = (bruto, retPct) => {
      const ret = bruto * (PCT.num(retPct) / 100);
      return PCT.htmlResumen([
        ["Valor del corte (PU contratista)", bruto],
        [`Retención (${PCT.num(retPct)}%)`, -ret],
        ["NETO A GIRAR AL CONTRATISTA", bruto - ret, "fuerte"],
      ]);
    };

    const abrirEditor = async (corte = null) => {
      const k = contratista();
      if (!corte && !k) return mostrarAviso("Asigna primero el contratista del proyecto en la pestaña Inicio.", "error");
      const propias = corte ? new Map(lineasDe(corte.id).map((l) => [l.presupuesto_item_id, PCT.num(l.cantidad)])) : new Map();
      const snap = corte ? new Map(lineasDe(corte.id).map((l) => [l.presupuesto_item_id, PCT.num(l.pu_contratista_snapshot)])) : new Map();
      const filas = soloItems().map((i) => {
        const e = PCT.ejecItem(i.id);
        const sinPrecio = i.pu_contratista === null || i.pu_contratista === undefined;
        return {
          item: i,
          ejecutado: PCT.num(e.cant_ejecutada_contratista),
          cortadoOtros: PCT.num(e.cant_cortada_mo) - PCT.num(propias.get(i.id)),
          precio: snap.has(i.id) ? snap.get(i.id) : PCT.num(i.pu_contratista),
          sinPrecio: sinPrecio && !snap.has(i.id),
        };
      });
      const iniciales = corte ? propias : new Map(filas.map((f) => [f.item.id, Math.max(0, Math.round((f.ejecutado - f.cortadoOtros) * 100) / 100)]));
      const numero = corte ? corte.numero : (cortes.length ? Math.max(...cortes.map((c) => c.numero)) : 0) + 1;
      const retPct = corte ? corte.retencion_porcentaje : PCT.num(k?.porcentaje_retencion);

      const ok = await PCT.editorCorte({
        titulo: corte ? `Corte al contratista N° ${numero} · editar cantidades` : `Nuevo corte al contratista N° ${numero}`,
        fecha: corte?.fecha || PCT.hoyISO(),
        extraHtml: `<div><label class="mb-1 block text-xs font-medium text-gray-700">N° cuenta de cobro</label><input id="ec-cuenta" value="${escapeHtml(corte?.numero_cuenta_cobro || "")}" class="${CLASE_INPUT}" /></div>`,
        filas,
        iniciales,
        resumen: (bruto) => resumenCorte(bruto, retPct),
        onGuardar: async ({ fecha, cantidades, el }) => {
          const sinPrecio = filas.filter((f) => f.sinPrecio && cantidades.get(f.item.id));
          if (sinPrecio.length) {
            throw new Error(`Hay ${sinPrecio.length} ítem(s) con cantidad pero sin PU contratista (${sinPrecio.map((f) => f.item.codigo || f.item.descripcion.slice(0, 20)).join(", ")}). Ponles precio en «Contrato del contratista».`);
          }
          const cuenta = el.querySelector("#ec-cuenta").value.trim() || null;
          let corteId = corte?.id;
          if (corte) {
            const { error } = await window.sb.from("cortes_mo").update({ fecha, numero_cuenta_cobro: cuenta }).eq("id", corte.id);
            if (error) throw error;
          } else {
            const { data, error } = await window.sb
              .from("cortes_mo")
              .insert({ proyecto_id: pid, numero, fecha, numero_cuenta_cobro: cuenta, contratista_id: k.id, retencion_porcentaje: retPct })
              .select()
              .single();
            if (error) throw error;
            corteId = data.id;
          }
          const existentes = new Map(lineasDe(corteId).map((l) => [l.presupuesto_item_id, l]));
          const upserts = [];
          const borrar = [];
          cantidades.forEach((v, itemId) => {
            const ex = existentes.get(itemId);
            if (!v) {
              if (ex) borrar.push(ex.id);
              return;
            }
            upserts.push({
              corte_id: corteId,
              presupuesto_item_id: itemId,
              cantidad: v,
              pu_contratista_snapshot: ex ? ex.pu_contratista_snapshot : PCT.num(itemPorId(itemId)?.pu_contratista),
            });
          });
          if (borrar.length) {
            const { error } = await window.sb.from("cortes_mo_items").delete().in("id", borrar);
            if (error) throw error;
          }
          if (upserts.length) {
            const { error } = await window.sb.from("cortes_mo_items").upsert(upserts, { onConflict: "corte_id,presupuesto_item_id" });
            if (error) throw error;
          }
        },
      });
      if (ok) {
        await refrescar();
        mostrarAviso(corte ? "Corte actualizado." : `Corte N° ${numero} al contratista creado.`, "exito");
      }
    };

    const descargarPdf = async (corte) => {
      const anteriores = new Map();
      cortes
        .filter((c) => c.numero < corte.numero)
        .forEach((c) => lineasDe(c.id).forEach((l) => anteriores.set(l.presupuesto_item_id, (anteriores.get(l.presupuesto_item_id) || 0) + PCT.num(l.cantidad))));
      const filas = lineasDe(corte.id)
        .map((l) => ({ l, i: itemPorId(l.presupuesto_item_id) }))
        .filter((x) => x.i)
        .sort((a, b) => PCT.num(a.i.orden) - PCT.num(b.i.orden))
        .map(({ l, i }) => ({ codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, contratado: i.cantidad, precio: l.pu_contratista_snapshot, anterior: anteriores.get(i.id) || 0, actual: l.cantidad }));
      const x = calcCorte(corte);
      const k = contratista();
      await PCT.pdfActa({
        titulo: `CORTE DE MANO DE OBRA N° ${corte.numero}`,
        subtitulo: `Contratista: ${k?.nombre || ""}${corte.numero_cuenta_cobro ? " · Cuenta de cobro " + corte.numero_cuenta_cobro : ""}`,
        proyecto: p(),
        corte,
        filas,
        encabezadoPrecio: "PU contratista",
        resumen: [
          ["Valor del corte", x.bruto],
          [`Retención (${PCT.num(corte.retencion_porcentaje)}%)`, -x.retencion],
          ["NETO A GIRAR", x.neto, "fuerte"],
        ],
        firmas: [`Contratista: ${k?.nombre || ""}`, `Aprobado por ${p().empresas?.nombre || "Pctronic"}`],
        nombreArchivo: `Corte_contratista_${corte.numero}_${(p().nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.pdf`,
      });
    };

    const abrirDetalle = (corte) => {
      const x = calcCorte(corte);
      const esUltimo = corte.numero === Math.max(...cortes.map((c) => c.numero));
      const pagosCorte = pagos.filter((g) => g.corte_mo_id === corte.id);
      const ret = PCT.num(corte.retencion_porcentaje);
      const m = PCT.modal({
        titulo: `Corte al contratista N° ${corte.numero} · ${formatoFecha(corte.fecha)}`,
        ancho: "max-w-3xl",
        html: `
          <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h4 class="mb-2 text-xs font-bold uppercase text-gray-500">Valor</h4>
              ${resumenCorte(x.bruto, ret)}
              <p class="mt-2 text-xs text-gray-400">${lineasDe(corte.id).length} ítems en este corte.</p>
              <div class="mt-3"><label class="mb-1 block text-xs font-medium">N° cuenta de cobro</label><input id="md-cuenta" value="${escapeHtml(corte.numero_cuenta_cobro || "")}" class="${CLASE_INPUT}" /></div>
            </div>
            <div>
              <h4 class="mb-2 text-xs font-bold uppercase text-gray-500">Pagos <span class="font-normal normal-case text-gray-400">(se guardan en Gastos)</span></h4>
              <ul class="divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">${
                pagosCorte.length
                  ? pagosCorte.map((g) => `<li class="flex items-center justify-between gap-2 px-3 py-2"><span class="text-xs text-gray-600">${formatoFecha(g.fecha)}${g.documento ? " · " + escapeHtml(g.documento) : ""}</span><span class="tabular-nums">${formatoMoneda(g.valor_total)}</span><button data-borrar-pago="${g.id}" class="text-gray-400 hover:text-red-600" title="Quitar pago"><span class="material-symbols-outlined text-[18px]">delete</span></button></li>`).join("")
                  : `<li class="px-3 py-3 text-xs text-gray-400">Sin pagos registrados.</li>`
              }</ul>
              <div class="mt-2 flex justify-between text-sm"><span class="text-gray-500">Saldo por pagar (valor bruto)</span><b class="tabular-nums ${x.saldo > 0.5 ? "text-amber-700" : "text-green-600"}">${formatoMoneda(Math.max(0, x.saldo))}</b></div>
              ${x.saldo > 0.5 ? `
              <div class="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
                <p class="text-xs font-semibold text-gray-700">Registrar pago</p>
                <div class="grid grid-cols-2 gap-2">
                  <div><label class="mb-1 block text-[11px]">Fecha</label><input id="md-pfecha" type="date" value="${PCT.hoyISO()}" class="${CLASE_INPUT}" /></div>
                  <div><label class="mb-1 block text-[11px]">Valor bruto que se paga</label><input id="md-pvalor" inputmode="numeric" class="input-moneda ${CLASE_INPUT}" /></div>
                </div>
                <p id="md-pneto" class="text-[11px] text-gray-500"></p>
                <button id="md-pagar" type="button" class="w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">Registrar pago</button>
              </div>` : ""}
            </div>
          </div>`,
        botones: [
          ...(esUltimo
            ? [{
                texto: "Eliminar corte",
                clase: "mr-auto rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50",
                onClick: async () => {
                  if (pagosCorte.length) {
                    mostrarAviso("Este corte tiene pagos registrados: quítalos primero.", "error");
                    return false;
                  }
                  const ok = await PCT.confirmar("Eliminar corte", `¿Eliminar el corte N° ${corte.numero} al contratista? Lo cortado vuelve a quedar por cortar.`, "Eliminar", true);
                  if (!ok) return false;
                  const { error } = await window.sb.from("cortes_mo").delete().eq("id", corte.id);
                  if (error) {
                    manejarError(error, "No se pudo eliminar el corte");
                    return false;
                  }
                  await refrescar();
                  mostrarAviso("Corte eliminado.", "exito");
                },
              }]
            : []),
          { texto: "Editar cantidades", onClick: () => abrirEditor(corte) },
          { texto: "PDF", onClick: () => (descargarPdf(corte), false) },
          {
            texto: "Guardar",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const { error } = await window.sb.from("cortes_mo").update({ numero_cuenta_cobro: el.querySelector("#md-cuenta").value.trim() || null }).eq("id", corte.id);
              if (error) {
                manejarError(error, "No se pudo guardar");
                return false;
              }
              await refrescar();
            },
          },
        ],
      });

      const inpValor = m.el.querySelector("#md-pvalor");
      if (inpValor) {
        activarCamposMoneda(".input-moneda", m.el);
        establecerValorMoneda(inpValor, Math.round(x.saldo));
        const neto = () => {
          const v = valorMoneda(inpValor);
          m.el.querySelector("#md-pneto").textContent = `Neto a girar al contratista: ${formatoMoneda(v * (1 - ret / 100))} · retención ${formatoMoneda(v * (ret / 100))}. En Gastos queda el valor bruto (es el costo real).`;
        };
        inpValor.addEventListener("input", neto);
        neto();
        m.el.querySelector("#md-pagar").addEventListener("click", async () => {
          const valor = valorMoneda(inpValor);
          const fecha = m.el.querySelector("#md-pfecha").value;
          if (valor <= 0 || !fecha) return mostrarAviso("Pon la fecha y un valor mayor que cero.", "error");
          const k = contratista();
          const { error } = await window.sb.from("gastos").insert({
            proyecto_id: pid,
            fecha,
            tipo: TIPO_GASTO_MO,
            proveedor_texto: k?.nombre || null,
            documento: corte.numero_cuenta_cobro || `Corte ${corte.numero}`,
            corte_mo_id: corte.id,
            descripcion: `Pago corte N° ${corte.numero} al contratista`,
            cantidad: 1,
            valor_unitario: valor,
            observaciones: ret ? `Retención ${ret}%: ${formatoMoneda(valor * (ret / 100))} · neto girado ${formatoMoneda(valor * (1 - ret / 100))}` : null,
          });
          if (error) return manejarError(error, "No se pudo registrar el pago");
          m.cerrar();
          await refrescar();
          mostrarAviso("Pago registrado en Gastos.", "exito");
        });
      }
      m.el.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-borrar-pago]");
        if (!b) return;
        const ok = await PCT.confirmar("Quitar pago", "¿Quitar este pago? También se borra de Gastos.", "Quitar", true);
        if (!ok) return;
        const { error } = await window.sb.from("gastos").delete().eq("id", b.dataset.borrarPago);
        if (error) return manejarError(error, "No se pudo quitar el pago");
        m.cerrar();
        await refrescar();
      });
    };

    root.querySelector("#mo-nuevo").addEventListener("click", () => abrirEditor(null));
    root.querySelector("#mo-cortes").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      const corte = cortes.find((c) => c.id === tr.dataset.id);
      if (e.target.closest('[data-acc="pdf"]')) return descargarPdf(corte);
      abrirDetalle(corte);
    });

    // ------------------------------------------------------------------
    // Contrato del contratista (PU MO presupuesto y PU contratista)
    // ------------------------------------------------------------------
    const pintarContrato = () => {
      const tbody = root.querySelector("#mo-contrato");
      const items = PCT.estado.items;
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="py-8 text-center text-gray-400">Primero llena la pestaña Cotización.</td></tr>`;
        root.querySelector("#mo-contrato-total").innerHTML = "";
        return;
      }
      const t = { ppto: 0, contr: 0, ahorro: 0 };
      tbody.innerHTML = items
        .map((i) => {
          if (i.tipo !== "item") {
            return `<tr class="${i.tipo === "capitulo" ? "bg-blue-100/70 font-bold" : "bg-blue-50/70 font-semibold"}"><td class="px-2 py-1.5 text-xs">${escapeHtml(i.codigo || "")}</td><td colspan="11" class="px-2 py-1.5 text-xs">${escapeHtml(i.descripcion)}</td></tr>`;
          }
          const q = PCT.num(i.cantidad);
          const tienePc = i.pu_contratista !== null && i.pu_contratista !== undefined;
          const totPpto = q * PCT.num(i.cu_mano_obra);
          const totContr = tienePc ? q * PCT.num(i.pu_contratista) : null;
          const ahorro = totContr === null ? null : totPpto - totContr;
          const e = PCT.ejecItem(i.id);
          const porCortar = PCT.num(e.pendiente_cortar_mo);
          if (!i.es_adicional) {
            t.ppto += totPpto;
            t.contr += totContr || 0;
            t.ahorro += ahorro || 0;
          }
          return `<tr data-id="${i.id}" class="border-t border-gray-100 ${i.es_adicional ? "bg-amber-50/60" : ""}">
            <td class="px-2 py-1 text-xs text-gray-500">${escapeHtml(i.codigo || "")}</td>
            <td class="min-w-[260px] px-2 py-1 text-xs text-gray-800"><span class="line-clamp-2" title="${escapeHtml(i.descripcion)}">${escapeHtml(i.descripcion)}</span></td>
            <td class="px-2 py-1 text-xs text-gray-500">${escapeHtml(i.unidad || "")}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums">${PCT.fmtCant(q)}</td>
            <td class="w-28 px-1 py-1"><input data-f="cu_mano_obra" inputmode="numeric" value="${PCT.num(i.cu_mano_obra) ? formatearMiles(i.cu_mano_obra) : ""}" placeholder="0" class="input-moneda ${CELDA}" /></td>
            <td class="w-28 px-1 py-1"><input data-f="pu_contratista" inputmode="numeric" value="${tienePc ? formatearMiles(i.pu_contratista) : ""}" placeholder="—" class="input-moneda ${CELDA}" /></td>
            <td class="px-2 py-1 text-right text-xs tabular-nums">${formatoMoneda(totPpto)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums">${totContr === null ? "—" : formatoMoneda(totContr)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums ${ahorro > 0 ? "text-green-600" : ahorro < 0 ? "text-red-600" : ""}">${ahorro === null ? "—" : formatoMoneda(ahorro)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums">${PCT.fmtCant(e.cant_ejecutada_contratista)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums">${PCT.fmtCant(e.cant_cortada_mo)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums ${porCortar > 0 ? "font-semibold text-amber-700" : "text-gray-400"}">${PCT.fmtCant(porCortar)}</td>
          </tr>`;
        })
        .join("");
      activarCamposMoneda(".input-moneda", tbody);
      root.querySelector("#mo-contrato-total").innerHTML = `<tr><td colspan="6" class="px-2 py-2 text-right uppercase">Total contrato (sin adicionales)</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(t.ppto)}</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(t.contr)}</td><td class="px-2 py-2 text-right tabular-nums ${t.ahorro > 0 ? "text-green-600" : t.ahorro < 0 ? "text-red-600" : ""}">${formatoMoneda(t.ahorro)}</td><td colspan="3"></td></tr>`;
    };

    root.querySelector("#mo-contrato").addEventListener("change", async (e) => {
      const inp = e.target;
      const tr = inp.closest("tr[data-id]");
      if (!tr || !inp.dataset.f) return;
      const item = itemPorId(tr.dataset.id);
      const campo = inp.dataset.f;
      const valor = campo === "pu_contratista" && inp.value.trim() === "" ? null : valorMoneda(inp);
      const { error } = await window.sb.from("presupuesto_items").update({ [campo]: valor }).eq("id", item.id);
      if (error) return manejarError(error, "No se pudo guardar el precio");
      item[campo] = valor;
      pintarContrato();
      pintarKpis();
    });

    // ------------------------------------------------------------------
    // Técnicos propios
    // ------------------------------------------------------------------
    const pintarFormPropia = () => {
      const tarifas = PCT.estado.tarifas;
      const nombres = [...new Set(propia.map((r) => r.tecnico))];
      root.querySelector("#mo-form-propia").innerHTML = tarifas.length
        ? `
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Fecha</label><input id="mp-fecha" type="date" value="${PCT.hoyISO()}" class="${CLASE_INPUT}" /></div>
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Técnico</label><input id="mp-tecnico" list="mp-nombres" placeholder="Nombre" class="${CLASE_INPUT}" /><datalist id="mp-nombres">${nombres.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("")}</datalist></div>
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Cargo</label><select id="mp-cargo" class="${CLASE_INPUT}">${tarifas.map((t) => `<option value="${t.id}">${escapeHtml(t.cargo)}</option>`).join("")}</select></div>
          <div class="md:col-span-2"><label class="mb-1 block text-[11px] font-medium text-gray-700">Ítem / actividad <span class="font-normal text-gray-400">(opcional)</span></label><select id="mp-item" class="${CLASE_INPUT}"><option value="">—</option>${soloItems().map((i) => `<option value="${i.id}">${escapeHtml(((i.codigo ? i.codigo + " · " : "") + i.descripcion).slice(0, 70))}</option>`).join("")}</select></div>
          <div><label class="mb-1 block text-[11px] font-medium text-gray-700">Días</label><input id="mp-dias" type="number" step="0.5" min="0" value="1" class="${CLASE_INPUT}" /></div>
          <div><label class="mb-1 block text-[11px] font-medium text-gray-700">Horas/día</label><input id="mp-horas" type="number" step="0.5" min="0" placeholder="cargo" class="${CLASE_INPUT}" /></div>
          <div><label class="mb-1 block text-[11px] font-medium text-gray-700">H. extra</label><input id="mp-extra" type="number" step="0.5" min="0" value="0" class="${CLASE_INPUT}" /></div>
          <div><button type="submit" class="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Agregar</button></div>
          <div class="col-span-2 md:col-span-12"><input id="mp-obs" placeholder="Observaciones (opcional)" class="${CLASE_INPUT}" /></div>`
        : `<p class="col-span-full text-sm text-amber-700">No hay tarifas de técnicos. Agrégalas en la pestaña <b>Inicio</b> para poder registrar horas.</p>`;
    };

    const pintarPropia = () => {
      const tbody = root.querySelector("#mo-propia");
      tbody.innerHTML = propia.length
        ? propia
            .map((r) => {
              const t = tarifaPorId(r.tarifa_id);
              const it = r.presupuesto_item_id ? itemPorId(r.presupuesto_item_id) : null;
              return `<tr data-id="${r.id}" class="border-t border-gray-100">
                <td class="px-2 py-1.5 text-xs">${formatoFecha(r.fecha)}</td>
                <td class="px-2 py-1.5 text-xs font-medium text-gray-800">${escapeHtml(r.tecnico)}</td>
                <td class="px-2 py-1.5 text-xs text-gray-600">${escapeHtml(t?.cargo || "(cargo eliminado)")}</td>
                <td class="px-2 py-1.5 text-xs text-gray-600"><span class="line-clamp-1">${it ? escapeHtml((it.codigo ? it.codigo + " · " : "") + it.descripcion) : "—"}</span></td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${PCT.fmtCant(r.dias)}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${r.horas_dia === null ? `<span class="text-gray-400">${PCT.fmtCant(t?.horas_dia)}</span>` : PCT.fmtCant(r.horas_dia)}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${PCT.fmtCant(r.horas_extra)}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums">${PCT.fmtCant(horasPropia(r))}</td>
                <td class="px-2 py-1.5 text-right text-xs font-semibold tabular-nums">${formatoMoneda(valorPropia(r))}</td>
                <td class="px-2 py-1.5 text-xs text-gray-500"><span class="line-clamp-1">${escapeHtml(r.observaciones || "")}</span></td>
                <td class="px-2 py-1.5 text-right"><button data-borrar class="text-gray-400 hover:text-red-600" title="Quitar"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="11" class="py-6 text-center text-gray-400">Sin horas registradas.</td></tr>`;
      root.querySelector("#mo-propia-total").innerHTML = propia.length
        ? `<tr><td colspan="7" class="px-2 py-2 text-right uppercase">Total</td><td class="px-2 py-2 text-right tabular-nums">${PCT.fmtCant(propia.reduce((s, r) => s + horasPropia(r), 0))}</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(propia.reduce((s, r) => s + valorPropia(r), 0))}</td><td colspan="2"></td></tr>`
        : "";
    };

    root.querySelector("#mo-form-propia").addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = (s) => root.querySelector(s);
      const tecnico = q("#mp-tecnico").value.trim();
      if (!tecnico) return mostrarAviso("Escribe el nombre del técnico.", "error");
      const horas = q("#mp-horas").value.trim();
      const fila = {
        proyecto_id: pid,
        fecha: q("#mp-fecha").value || PCT.hoyISO(),
        tecnico,
        tarifa_id: q("#mp-cargo").value || null,
        presupuesto_item_id: q("#mp-item").value || null,
        dias: PCT.num(q("#mp-dias").value),
        horas_dia: horas === "" ? null : PCT.num(horas),
        horas_extra: PCT.num(q("#mp-extra").value),
        observaciones: q("#mp-obs").value.trim() || null,
      };
      const { error } = await window.sb.from("registro_mo_propia").insert(fila);
      if (error) return manejarError(error, "No se pudo registrar");
      await cargar();
      pintarFormPropia();
      pintarPropia();
      pintarKpis();
      mostrarAviso("Horas registradas.", "exito");
    });
    root.querySelector("#mo-propia").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-borrar]");
      if (!b) return;
      const { error } = await window.sb.from("registro_mo_propia").delete().eq("id", b.closest("tr").dataset.id);
      if (error) return manejarError(error, "No se pudo quitar");
      await cargar();
      pintarPropia();
      pintarKpis();
    });

    const pintarTodo = () => {
      pintarKpis();
      pintarCortes();
      pintarContrato();
      pintarPropia();
    };

    try {
      await Promise.all([cargar(), PCT.recargarTarifas()]);
    } catch (err) {
      return manejarError(err, "No se pudo cargar la mano de obra");
    }
    pintarFormPropia();
    pintarTodo();
  };
})(window.PCT);
