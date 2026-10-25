// ============================================================================
// PROYECTOS · pestaña GASTOS (hoja GASTOS de la plantilla v7).
// ÚNICA fuente de todo el dinero que sale del proyecto: compras de material y
// equipos, suministros, alquileres, transporte y pagos al contratista. Una
// fila por ítem comprado o por pago, con su precio real. Igual que el Excel:
//   N° · Fecha · Tipo de gasto · Proveedor / contratista · Factura / OC ·
//   Ítem (opcional) · Descripción · Cantidad · Valor unitario · Valor total ·
//   Observaciones   (+ la factura adjunta)
// Valor total = cantidad (1 si está vacía) × valor unitario (lo calcula la BD).
// Los pagos al contratista se crean desde Mano de obra (corte_mo_id) y aquí
// solo se ven.
// ============================================================================
(function (PCT) {
  const TIPOS = ["Material", "Equipo", "Suministro", "Alquiler", "Transporte", "Mano de obra contratista"];
  const CATEGORIAS = [
    { nombre: "Materiales y equipos", tipos: ["Material", "Equipo", "Suministro"] },
    { nombre: "Mano de obra contratista", tipos: ["Mano de obra contratista"] },
    { nombre: "Transporte y otros", tipos: ["Transporte"] },
    { nombre: "Alquileres", tipos: ["Alquiler"] },
  ];
  const CELDA =
    "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary";
  const BTN_SEC = "flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50";

  PCT.renderGastos = async (root) => {
    const pid = PCT.estado.proyecto.id;
    let gastos = [];
    let proveedores = [];
    let cortesMO = new Map(); // id → numero (para mostrar "Corte N")
    let filtroTipo = "";
    let filtroTexto = "";

    const soloItems = () => PCT.estado.items.filter((i) => i.tipo === "item");
    const itemPorId = (id) => PCT.estado.items.find((i) => i.id === id);
    const proveedorPorId = (id) => proveedores.find((p) => p.id === id);
    const nombreProveedor = (g) => (g.proveedor_id ? proveedorPorId(g.proveedor_id)?.nombre || "" : g.proveedor_texto || "");
    const etiquetaItem = (i) => `${i.codigo ? i.codigo + " · " : ""}${i.descripcion}`.slice(0, 80);

    const cargar = async () => {
      const [g, p, c] = await Promise.all([
        window.sb.from("gastos").select("*").eq("proyecto_id", pid).order("fecha", { ascending: true }).order("created_at", { ascending: true }),
        window.sb.from("proveedores").select("id, nombre").order("nombre"),
        window.sb.from("cortes_mo").select("id, numero").eq("proyecto_id", pid),
      ]);
      if (g.error) throw g.error;
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      gastos = g.data || [];
      proveedores = p.data || [];
      cortesMO = new Map((c.data || []).map((x) => [x.id, x.numero]));
    };

    // Recalcula el margen del encabezado (lo gastado cambió)
    const avisarCambio = async () => {
      await PCT.recargarFinanzas();
      PCT.emit("proyecto");
    };

    root.innerHTML = `
      <div class="space-y-5">
        <div id="ga-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"></div>
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">Gastos del proyecto</h3>
              <p class="text-xs text-gray-500">Aquí se escribe TODO lo que sale, una sola vez: una fila por ítem comprado o por pago, con su precio real. Si un precio cambia, registra una compra nueva (no corrijas la vieja). Los pagos al contratista entran solos desde <b>Mano de obra</b>.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" id="ga-exportar" class="${BTN_SEC}"><span class="material-symbols-outlined text-[16px]">table_view</span> Exportar</button>
              <label class="${BTN_SEC} cursor-pointer"><span class="material-symbols-outlined text-[16px]">upload</span> Importar Excel<input type="file" id="ga-importar" accept=".xlsx,.xls" class="hidden" /></label>
              <button type="button" id="ga-nuevo" class="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><span class="material-symbols-outlined text-[18px]">add</span> Agregar gasto</button>
            </div>
          </div>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <select id="ga-filtro-tipo" class="rounded-lg border-gray-300 text-xs">
              <option value="">Todos los tipos</option>
              ${TIPOS.map((t) => `<option value="${t}">${t}</option>`).join("")}
            </select>
            <input id="ga-filtro-texto" type="search" placeholder="Buscar proveedor, factura, descripción..." class="w-72 rounded-lg border-gray-300 text-xs" />
            <span id="ga-conteo" class="text-xs text-gray-400"></span>
          </div>
          <div class="max-h-[640px] overflow-auto rounded-lg border border-gray-100">
            <table class="min-w-full text-sm">
              <thead class="sticky top-0 z-10 bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr>
                  <th class="px-2 py-2">N°</th><th class="px-2 py-2">Fecha</th><th class="px-2 py-2">Tipo de gasto</th><th class="px-2 py-2">Proveedor / contratista</th>
                  <th class="px-2 py-2">Factura / OC</th><th class="px-2 py-2">Ítem (opcional)</th><th class="px-2 py-2">Descripción</th><th class="px-2 py-2 text-right">Cantidad</th>
                  <th class="px-2 py-2 text-right">Valor unitario</th><th class="px-2 py-2 text-right">Valor total</th><th class="px-2 py-2">Observaciones</th><th class="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody id="ga-filas"></tbody>
              <tfoot id="ga-total" class="sticky bottom-0 bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
          <datalist id="ga-proveedores"></datalist>
        </div>
      </div>`;

    // ------------------------------------------------------------------
    // KPIs
    // ------------------------------------------------------------------
    const pintarKpis = () => {
      const total = gastos.reduce((s, g) => s + PCT.num(g.valor_total), 0);
      const porCat = (tipos) => gastos.filter((g) => tipos.includes(g.tipo)).reduce((s, g) => s + PCT.num(g.valor_total), 0);
      const costoMat = PCT.resumenPresupuesto().base.costo;
      const mat = porCat(CATEGORIAS[0].tipos);
      root.querySelector("#ga-kpis").innerHTML =
        PCT.tarjetaKpi("Total registrado", formatoMoneda(total), `${gastos.length} gastos`) +
        PCT.tarjetaKpi(
          "Materiales y equipos",
          formatoMoneda(mat),
          costoMat ? `${PCT.fmtPct(mat / costoMat)} del presupuesto (${formatoMoneda(costoMat)})` : "Sin presupuesto de costos",
          costoMat && mat > costoMat ? "text-red-600" : "text-gray-900"
        ) +
        PCT.tarjetaKpi("Mano de obra contratista", formatoMoneda(porCat(CATEGORIAS[1].tipos)), "Pagos de cortes") +
        PCT.tarjetaKpi("Transporte y otros", formatoMoneda(porCat(CATEGORIAS[2].tipos))) +
        PCT.tarjetaKpi("Alquileres", formatoMoneda(porCat(CATEGORIAS[3].tipos))) +
        PCT.tarjetaKpi("Sin factura adjunta", String(gastos.filter((g) => !g.factura_url).length), "Gastos sin soporte", gastos.some((g) => !g.factura_url) ? "text-amber-700" : "text-gray-900");
    };

    // ------------------------------------------------------------------
    // Tabla
    // ------------------------------------------------------------------
    const visibles = () => {
      const t = filtroTexto.trim().toLowerCase();
      return gastos
        .map((g, idx) => ({ g, n: idx + 1 }))
        .filter(({ g }) => !filtroTipo || g.tipo === filtroTipo)
        .filter(({ g }) => {
          if (!t) return true;
          const it = g.presupuesto_item_id ? itemPorId(g.presupuesto_item_id) : null;
          return [nombreProveedor(g), g.documento, g.descripcion, g.observaciones, it?.descripcion, it?.codigo].some((x) => String(x || "").toLowerCase().includes(t));
        });
    };

    const opcionesItems = (sel) =>
      `<option value="">—</option>` + soloItems().map((i) => `<option value="${i.id}" ${i.id === sel ? "selected" : ""}>${escapeHtml(etiquetaItem(i))}</option>`).join("");

    const filaHtml = ({ g, n }) => {
      const deCorte = !!g.corte_mo_id;
      const lectura = (txt, der = false) => `<span class="block px-1.5 py-1 text-xs text-gray-700 ${der ? "text-right tabular-nums" : ""}">${txt}</span>`;
      const factura = g.factura_url
        ? `<a href="${escapeHtml(g.factura_url)}" target="_blank" rel="noopener" title="Ver factura" class="text-primary hover:text-blue-800"><span class="material-symbols-outlined text-[18px] align-middle">description</span></a>
           <button data-acc="quitar-factura" title="Quitar factura" class="text-gray-300 hover:text-red-600"><span class="material-symbols-outlined text-[16px] align-middle">close</span></button>`
        : `<label title="Adjuntar factura" class="cursor-pointer text-gray-400 hover:text-primary"><span class="material-symbols-outlined text-[18px] align-middle">attach_file</span><input data-acc="adjuntar" type="file" class="hidden" /></label>`;
      if (deCorte) {
        // pago al contratista: se edita en Mano de obra
        return `<tr data-id="${g.id}" class="border-t border-gray-100 bg-gray-50/60">
          <td class="px-2 py-1 text-xs text-gray-500">${n}</td>
          <td class="px-2 py-1">${lectura(formatoFecha(g.fecha))}</td>
          <td class="px-2 py-1">${lectura(escapeHtml(g.tipo))}</td>
          <td class="px-2 py-1">${lectura(escapeHtml(nombreProveedor(g)))}</td>
          <td class="px-2 py-1">${lectura(escapeHtml(g.documento || ""))} <span class="ml-1 rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-800">Corte ${cortesMO.get(g.corte_mo_id) ?? ""}</span></td>
          <td class="px-2 py-1">${lectura("—")}</td>
          <td class="px-2 py-1">${lectura(escapeHtml(g.descripcion || ""))}</td>
          <td class="px-2 py-1">${lectura(PCT.fmtCant(g.cantidad ?? 1), true)}</td>
          <td class="px-2 py-1">${lectura(formatoMoneda(g.valor_unitario), true)}</td>
          <td class="px-2 py-1 text-right text-xs font-semibold tabular-nums">${formatoMoneda(g.valor_total)}</td>
          <td class="px-2 py-1"><span class="line-clamp-2 px-1.5 text-[11px] text-gray-500" title="${escapeHtml(g.observaciones || "")}">${escapeHtml(g.observaciones || "")}</span></td>
          <td class="whitespace-nowrap px-2 py-1 text-right">${factura}<span title="Se edita en la pestaña Mano de obra" class="ml-1 text-gray-300"><span class="material-symbols-outlined text-[16px] align-middle">lock</span></span></td>
        </tr>`;
      }
      return `<tr data-id="${g.id}" class="border-t border-gray-100">
        <td class="px-2 py-1 text-xs text-gray-500">${n}</td>
        <td class="w-32 px-1 py-1"><input data-f="fecha" type="date" value="${g.fecha || ""}" class="${CELDA}" /></td>
        <td class="w-40 px-1 py-1"><select data-f="tipo" class="${CELDA}">${TIPOS.filter((t) => t !== "Mano de obra contratista" || g.tipo === t).map((t) => `<option ${t === g.tipo ? "selected" : ""}>${t}</option>`).join("")}</select></td>
        <td class="w-44 px-1 py-1"><input data-f="proveedor" list="ga-proveedores" value="${escapeHtml(nombreProveedor(g))}" placeholder="Proveedor" class="${CELDA}" /></td>
        <td class="w-28 px-1 py-1"><input data-f="documento" value="${escapeHtml(g.documento || "")}" placeholder="FE-123" class="${CELDA}" /></td>
        <td class="w-48 px-1 py-1"><select data-f="presupuesto_item_id" class="${CELDA}">${opcionesItems(g.presupuesto_item_id)}</select></td>
        <td class="min-w-[200px] px-1 py-1"><input data-f="descripcion" value="${escapeHtml(g.descripcion || "")}" placeholder="Qué se compró / pagó" class="${CELDA}" /></td>
        <td class="w-20 px-1 py-1"><input data-f="cantidad" type="number" step="0.01" min="0" value="${g.cantidad ?? ""}" placeholder="1" class="${CELDA} text-right tabular-nums" /></td>
        <td class="w-28 px-1 py-1"><input data-f="valor_unitario" inputmode="numeric" value="${PCT.num(g.valor_unitario) ? formatearMiles(g.valor_unitario) : ""}" placeholder="0" class="input-moneda ${CELDA} text-right tabular-nums" /></td>
        <td class="px-2 py-1 text-right text-xs font-semibold tabular-nums" data-total>${formatoMoneda(g.valor_total)}</td>
        <td class="min-w-[160px] px-1 py-1"><input data-f="observaciones" value="${escapeHtml(g.observaciones || "")}" class="${CELDA}" /></td>
        <td class="whitespace-nowrap px-2 py-1 text-right">${factura}<button data-acc="borrar" title="Eliminar" class="ml-1 text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[18px] align-middle">delete</span></button></td>
      </tr>`;
    };

    const pintarTabla = () => {
      root.querySelector("#ga-proveedores").innerHTML = proveedores.map((p) => `<option value="${escapeHtml(p.nombre)}"></option>`).join("");
      const filas = visibles();
      const tbody = root.querySelector("#ga-filas");
      tbody.innerHTML = filas.length
        ? filas.map(filaHtml).join("")
        : `<tr><td colspan="12" class="py-10 text-center text-gray-400">${gastos.length ? "Ningún gasto coincide con el filtro." : "Aún no hay gastos. Usa «Agregar gasto» para registrar la primera compra o pago."}</td></tr>`;
      activarCamposMoneda(".input-moneda", tbody);
      const totalVisible = filas.reduce((s, { g }) => s + PCT.num(g.valor_total), 0);
      root.querySelector("#ga-total").innerHTML = filas.length
        ? `<tr><td colspan="9" class="px-2 py-2 text-right uppercase">${filtroTipo || filtroTexto ? "Total filtrado" : "Total registrado"}</td><td class="px-2 py-2 text-right tabular-nums">${formatoMoneda(totalVisible)}</td><td colspan="2"></td></tr>`
        : "";
      root.querySelector("#ga-conteo").textContent = filtroTipo || filtroTexto ? `${filas.length} de ${gastos.length} gastos` : "";
    };

    const pintar = () => {
      pintarKpis();
      pintarTabla();
    };

    // ------------------------------------------------------------------
    // Edición en la tabla (se guarda al salir de cada celda)
    // ------------------------------------------------------------------
    // Proveedor: si coincide con uno de la lista se liga (proveedor_id); si no,
    // se guarda como texto libre.
    const datosProveedor = (texto) => {
      const t = texto.trim();
      if (!t) return { proveedor_id: null, proveedor_texto: null };
      const p = proveedores.find((x) => PCT.norm(x.nombre) === PCT.norm(t));
      return p ? { proveedor_id: p.id, proveedor_texto: null } : { proveedor_id: null, proveedor_texto: t };
    };

    root.querySelector("#ga-filas").addEventListener("change", async (e) => {
      const inp = e.target;
      const tr = inp.closest("tr[data-id]");
      if (!tr) return;
      const g = gastos.find((x) => x.id === tr.dataset.id);
      if (!g) return;

      if (inp.dataset.acc === "adjuntar") return adjuntarFactura(g, inp.files[0]);
      if (!inp.dataset.f) return;

      const campo = inp.dataset.f;
      let datos;
      if (campo === "proveedor") datos = datosProveedor(inp.value);
      else if (campo === "valor_unitario") datos = { valor_unitario: valorMoneda(inp) };
      else if (campo === "cantidad") datos = { cantidad: inp.value.trim() === "" ? null : PCT.num(inp.value) };
      else if (campo === "fecha") {
        if (!inp.value) {
          inp.value = g.fecha;
          return mostrarAviso("La fecha no puede quedar vacía.", "error");
        }
        datos = { fecha: inp.value };
      } else datos = { [campo]: inp.value.trim() || null };

      const { data, error } = await window.sb.from("gastos").update(datos).eq("id", g.id).select().single();
      if (error) return manejarError(error, "No se pudo guardar el cambio");
      Object.assign(g, data);
      if (campo === "fecha") {
        gastos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
        pintarTabla();
      } else {
        const td = tr.querySelector("[data-total]");
        if (td) td.textContent = formatoMoneda(g.valor_total);
        const total = visibles().reduce((s, x) => s + PCT.num(x.g.valor_total), 0);
        const celdaTotal = root.querySelector("#ga-total td:nth-child(2)");
        if (celdaTotal) celdaTotal.textContent = formatoMoneda(total);
      }
      pintarKpis();
      if (["valor_unitario", "cantidad", "tipo"].includes(campo)) await avisarCambio();
    });

    root.querySelector("#ga-filas").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-acc]");
      if (!btn || btn.dataset.acc === "adjuntar") return;
      const tr = btn.closest("tr[data-id]");
      const g = gastos.find((x) => x.id === tr.dataset.id);
      if (btn.dataset.acc === "borrar") {
        const ok = await PCT.confirmar(
          "Eliminar gasto",
          `¿Eliminar el gasto «${escapeHtml(g.descripcion || g.documento || g.tipo)}» por ${formatoMoneda(g.valor_total)}?`,
          "Eliminar",
          true
        );
        if (!ok) return;
        const { error } = await window.sb.from("gastos").delete().eq("id", g.id);
        if (error) return manejarError(error, "No se pudo eliminar el gasto");
        gastos = gastos.filter((x) => x.id !== g.id);
        pintar();
        await avisarCambio();
      }
      if (btn.dataset.acc === "quitar-factura") {
        const { error } = await window.sb.from("gastos").update({ factura_url: null }).eq("id", g.id);
        if (error) return manejarError(error, "No se pudo quitar la factura");
        g.factura_url = null;
        pintar();
      }
    });

    const adjuntarFactura = async (g, file) => {
      if (!file) return;
      try {
        const ruta = `${pid}/gastos/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error: errSubida } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
        if (errSubida) throw errSubida;
        const url = window.sb.storage.from("documentos").getPublicUrl(ruta).data.publicUrl;
        const { error } = await window.sb.from("gastos").update({ factura_url: url }).eq("id", g.id);
        if (error) throw error;
        g.factura_url = url;
        pintar();
        mostrarAviso("Factura adjuntada.", "exito");
      } catch (err) {
        manejarError(err, "No se pudo adjuntar la factura");
      }
    };

    // ------------------------------------------------------------------
    // Agregar
    // ------------------------------------------------------------------
    root.querySelector("#ga-nuevo").addEventListener("click", async () => {
      // si hay un filtro de tipo, el gasto nuevo arranca con ese tipo
      const tipo = filtroTipo && filtroTipo !== "Mano de obra contratista" ? filtroTipo : "Material";
      const { data, error } = await window.sb.from("gastos").insert({ proyecto_id: pid, fecha: PCT.hoyISO(), tipo, valor_unitario: 0 }).select().single();
      if (error) return manejarError(error, "No se pudo agregar el gasto");
      gastos.push(data);
      gastos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
      filtroTexto = "";
      root.querySelector("#ga-filtro-texto").value = "";
      pintar();
      const inp = root.querySelector(`#ga-filas tr[data-id="${data.id}"] [data-f="proveedor"]`);
      if (inp) {
        inp.scrollIntoView({ block: "center" });
        inp.focus();
      }
    });

    // ------------------------------------------------------------------
    // Filtros
    // ------------------------------------------------------------------
    root.querySelector("#ga-filtro-tipo").addEventListener("change", (e) => {
      filtroTipo = e.target.value;
      pintarTabla();
    });
    root.querySelector("#ga-filtro-texto").addEventListener("input", (e) => {
      filtroTexto = e.target.value;
      pintarTabla();
    });

    // ------------------------------------------------------------------
    // Excel: mismas columnas que la hoja GASTOS de la plantilla v7
    // ------------------------------------------------------------------
    const ENCABEZADOS = ["N°", "Fecha", "Tipo de gasto", "Proveedor / contratista", "Factura / OC", "Ítem (opcional)", "Descripción", "Cantidad", "Valor unitario", "Valor total", "Observaciones", "Factura adjunta"];

    root.querySelector("#ga-exportar").addEventListener("click", () => {
      const filas = gastos.map((g, idx) => {
        const it = g.presupuesto_item_id ? itemPorId(g.presupuesto_item_id) : null;
        return [
          idx + 1, g.fecha, g.tipo, nombreProveedor(g), g.documento || "", it ? etiquetaItem(it) : "", g.descripcion || "",
          g.cantidad ?? "", PCT.num(g.valor_unitario), PCT.num(g.valor_total), g.observaciones || "", g.factura_url || "",
        ];
      });
      const total = gastos.reduce((s, g) => s + PCT.num(g.valor_total), 0);
      const hoja = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...filas, [], ["", "", "", "", "", "", "", "", "TOTAL REGISTRADO", total]]);
      hoja["!cols"] = [5, 11, 22, 26, 14, 34, 40, 9, 14, 14, 30, 30].map((wch) => ({ wch }));
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "GASTOS");
      XLSX.writeFile(libro, `Gastos_${(PCT.estado.proyecto.nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.xlsx`);
    });

    // Lee una hoja con esas columnas (la de la plantilla v7 o la exportada);
    // los encabezados se buscan por nombre.
    root.querySelector("#ga-importar").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      let filas;
      try {
        const libro = await PCT.leerLibroExcel(file);
        const nombreHoja = libro.SheetNames.find((n) => PCT.norm(n) === "gastos") || libro.SheetNames[0];
        filas = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { header: 1, defval: "", raw: true });
      } catch (err) {
        return mostrarAviso(err.message, "error");
      }
      const norm = (s) => PCT.norm(s).replace(/\s+/g, " ");
      const filaEnc = filas.findIndex((f) => f.some((c) => norm(c).startsWith("tipo de gasto")) && f.some((c) => norm(c).startsWith("valor unitario")));
      if (filaEnc < 0) return mostrarAviso('No encontré la tabla de gastos: busco encabezados «Tipo de gasto» y «Valor unitario».', "error");
      const col = {};
      filas[filaEnc].forEach((c, i) => {
        const h = norm(c);
        if (h === "fecha") col.fecha = i;
        else if (h.startsWith("tipo de gasto")) col.tipo = i;
        else if (h.startsWith("proveedor")) col.proveedor = i;
        else if (h.startsWith("factura / oc") || h.startsWith("factura/oc") || h === "documento") col.documento = i;
        else if (h.startsWith("item")) col.item = i;
        else if (h === "descripcion") col.descripcion = i;
        else if (h === "cantidad") col.cantidad = i;
        else if (h.startsWith("valor unitario")) col.vu = i;
        else if (h === "observaciones") col.obs = i;
      });
      const g = (f, k) => (col[k] === undefined ? "" : f[col[k]]);
      const aFecha = (v) => {
        if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
        if (typeof v === "number" && v > 20000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
        const s = String(v || "").trim();
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
      };
      const aNum = (v) => (typeof v === "number" ? v : PCT.num(String(v || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")));
      const buscarItem = (txt) => {
        const t = PCT.norm(txt);
        if (!t) return null;
        return soloItems().find((i) => PCT.norm(etiquetaItem(i)) === t || PCT.norm(i.codigo) === t || PCT.norm(i.descripcion) === t)?.id || null;
      };
      const nuevos = [];
      let omitidos = 0;
      for (let r = filaEnc + 1; r < filas.length; r++) {
        const f = filas[r];
        const tipoTxt = String(g(f, "tipo") || "").trim();
        const vu = aNum(g(f, "vu"));
        if (!tipoTxt && !vu) continue;
        const tipo = TIPOS.find((t) => PCT.norm(t) === PCT.norm(tipoTxt));
        if (!tipo || tipo === "Mano de obra contratista") {
          omitidos++;
          continue;
        }
        const cant = g(f, "cantidad");
        nuevos.push({
          proyecto_id: pid,
          fecha: aFecha(g(f, "fecha")) || PCT.hoyISO(),
          tipo,
          ...datosProveedor(String(g(f, "proveedor") || "")),
          documento: String(g(f, "documento") || "").trim() || null,
          presupuesto_item_id: buscarItem(g(f, "item")),
          descripcion: String(g(f, "descripcion") || "").trim() || null,
          cantidad: cant === "" || cant === null ? null : aNum(cant),
          valor_unitario: vu,
          observaciones: String(g(f, "obs") || "").trim() || null,
        });
      }
      if (!nuevos.length) return mostrarAviso("El archivo no trae gastos para importar.", "error");
      const total = nuevos.reduce((s, x) => s + (x.cantidad ?? 1) * x.valor_unitario, 0);
      const ok = await PCT.confirmar(
        "Importar gastos",
        `Se van a <b>agregar ${nuevos.length} gastos</b> por ${formatoMoneda(total)}.${omitidos ? ` ${omitidos} fila(s) se omiten (tipo vacío o «Mano de obra contratista»: esos pagos se registran desde Mano de obra).` : ""}`,
        "Agregar"
      );
      if (!ok) return;
      try {
        for (let i = 0; i < nuevos.length; i += 200) {
          const { error } = await window.sb.from("gastos").insert(nuevos.slice(i, i + 200));
          if (error) throw error;
        }
        await cargar();
        pintar();
        await avisarCambio();
        mostrarAviso(`Se importaron ${nuevos.length} gastos.`, "exito");
      } catch (err) {
        manejarError(err, "No se pudieron importar los gastos");
      }
    });

    root.querySelector("#ga-filas").innerHTML = `<tr><td colspan="12" class="py-6"><div class="skeleton h-10 rounded"></div></td></tr>`;
    try {
      await cargar();
    } catch (err) {
      return manejarError(err, "No se pudieron cargar los gastos");
    }
    pintar();
  };
})(window.PCT);
