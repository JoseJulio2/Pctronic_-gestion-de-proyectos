// ============================================================================
// PROYECTOS · pestaña GASTOS.
// ÚNICA fuente de todo el dinero que sale del proyecto. Registro GENERAL por
// gasto o factura (decisión de Jose, oct. 2026): fecha, tipo, proveedor,
// N° de factura, concepto, valor total y el soporte. La factura es OPCIONAL:
// también se pagan cosas sin factura (N° y archivo pueden ir vacíos). No se
// registra ítem por ítem: el detalle de compras por ítem vendrá del módulo de
// Compras, que más adelante se conectará con el proyecto.
// En la BD (tabla gastos): documento = N° factura, descripcion = concepto,
// valor_unitario = valor total y cantidad = null (valor_total = 1 × valor).
// Los pagos al contratista se crean desde Mano de obra (corte_mo_id) y aquí
// solo se ven.
// ============================================================================
(function (PCT) {
  const TIPO_MO = "Mano de obra contratista";
  const TIPOS = ["Material", "Equipo", "Suministro", "Alquiler", "Transporte", TIPO_MO];
  const TIPOS_EDITABLES = TIPOS.filter((t) => t !== TIPO_MO);
  const CATEGORIAS = [
    { nombre: "Materiales y equipos", tipos: ["Material", "Equipo", "Suministro"] },
    { nombre: "Mano de obra contratista", tipos: [TIPO_MO] },
    { nombre: "Transporte y otros", tipos: ["Transporte"] },
    { nombre: "Alquileres", tipos: ["Alquiler"] },
  ];
  const CLASE_INPUT = "block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-primary focus:ring-primary";
  const BTN_SEC = "flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50";

  PCT.renderGastos = async (root) => {
    const pid = PCT.estado.proyecto.id;
    let gastos = [];
    let proveedores = [];
    let cortesMO = new Map(); // id → número de corte
    let filtroTipo = "";
    let filtroTexto = "";

    const proveedorPorId = (id) => proveedores.find((p) => p.id === id);
    const nombreProveedor = (g) => (g.proveedor_id ? proveedorPorId(g.proveedor_id)?.nombre || "" : g.proveedor_texto || "");
    const ordenar = () => gastos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));

    const cargar = async () => {
      const [g, p, c] = await Promise.all([
        window.sb.from("gastos").select("*").eq("proyecto_id", pid),
        window.sb.from("proveedores").select("id, nombre").order("nombre"),
        window.sb.from("cortes_mo").select("id, numero").eq("proyecto_id", pid),
      ]);
      if (g.error) throw g.error;
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      gastos = g.data || [];
      ordenar();
      proveedores = p.data || [];
      cortesMO = new Map((c.data || []).map((x) => [x.id, x.numero]));
    };

    // Lo gastado cambió → recalcula el margen del encabezado
    const avisarCambio = async () => {
      await PCT.recargarFinanzas();
      PCT.emit("proyecto");
    };

    // Proveedor: si coincide con uno de Proveedores se liga; si no, texto libre
    const datosProveedor = (texto) => {
      const t = String(texto || "").trim();
      if (!t) return { proveedor_id: null, proveedor_texto: null };
      const p = proveedores.find((x) => PCT.norm(x.nombre) === PCT.norm(t));
      return p ? { proveedor_id: p.id, proveedor_texto: null } : { proveedor_id: null, proveedor_texto: t };
    };

    const subirArchivo = async (file) => {
      const ruta = `${pid}/gastos/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
      if (error) throw error;
      return window.sb.storage.from("documentos").getPublicUrl(ruta).data.publicUrl;
    };

    root.innerHTML = `
      <div class="space-y-5">
        <div id="ga-kpis" class="${PCT.CLASE_PANEL_KPIS}"></div>
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">Gastos del proyecto</h3>
              <p class="text-xs text-gray-500">Registra cada gasto una sola vez: tipo, proveedor, concepto y valor. Si tiene factura, pon su número y adjunta el archivo (es opcional: también se pagan cosas sin factura). Los pagos al contratista entran solos desde <b>Mano de obra</b>.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" id="ga-exportar" class="${BTN_SEC}"><span class="material-symbols-outlined text-[16px]">table_view</span> Exportar</button>
              <label class="${BTN_SEC} cursor-pointer"><span class="material-symbols-outlined text-[16px]">upload</span> Importar Excel<input type="file" id="ga-importar" accept=".xlsx,.xls" class="hidden" /></label>
              <button type="button" id="ga-nuevo" class="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><span class="material-symbols-outlined text-[18px]">add</span> Agregar gasto o factura</button>
            </div>
          </div>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <select id="ga-filtro-tipo" class="rounded-lg border-gray-300 text-xs">
              <option value="">Todos los tipos</option>
              ${TIPOS.map((t) => `<option value="${t}">${t}</option>`).join("")}
            </select>
            <input id="ga-filtro-texto" type="search" placeholder="Buscar proveedor, factura o concepto..." class="w-72 rounded-lg border-gray-300 text-xs" />
            <span id="ga-conteo" class="text-xs text-gray-400"></span>
          </div>
          <div class="overflow-x-auto rounded-lg border border-gray-100">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr>
                  <th class="px-3 py-2">Fecha</th><th class="px-3 py-2">Tipo</th><th class="px-3 py-2">Proveedor</th><th class="px-3 py-2">N° factura</th>
                  <th class="px-3 py-2">Concepto</th><th class="px-3 py-2 text-right">Valor</th><th class="px-3 py-2 text-center">Soporte</th><th class="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody id="ga-filas"></tbody>
              <tfoot id="ga-total" class="bg-gray-50 text-xs font-bold text-gray-800"></tfoot>
            </table>
          </div>
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
      const conSoporte = gastos.filter((g) => g.factura_url).length;
      root.querySelector("#ga-kpis").innerHTML =
        PCT.tarjetaKpi("Total gastado", formatoMoneda(total), `${gastos.length} gastos`) +
        PCT.tarjetaKpi(
          "Materiales y equipos",
          formatoMoneda(mat),
          costoMat ? `${PCT.fmtPct(mat / costoMat)} del presupuesto (${formatoMoneda(costoMat)})` : "Sin presupuesto de costos",
          costoMat && mat > costoMat ? "text-red-600" : "text-gray-900"
        ) +
        PCT.tarjetaKpi("Mano de obra contratista", formatoMoneda(porCat(CATEGORIAS[1].tipos)), "Pagos de cortes") +
        PCT.tarjetaKpi("Transporte y otros", formatoMoneda(porCat(CATEGORIAS[2].tipos))) +
        PCT.tarjetaKpi("Alquileres", formatoMoneda(porCat(CATEGORIAS[3].tipos))) +
        PCT.tarjetaKpi("Con soporte adjunto", `${conSoporte} de ${gastos.length}`, "Factura o recibo adjunto");
    };

    // ------------------------------------------------------------------
    // Tabla
    // ------------------------------------------------------------------
    const visibles = () => {
      const t = filtroTexto.trim().toLowerCase();
      return gastos
        .filter((g) => !filtroTipo || g.tipo === filtroTipo)
        .filter((g) => !t || [nombreProveedor(g), g.documento, g.descripcion, g.observaciones].some((x) => String(x || "").toLowerCase().includes(t)));
    };

    const pintarTabla = () => {
      const filas = visibles();
      root.querySelector("#ga-filas").innerHTML = filas.length
        ? filas
            .map((g) => {
              const deCorte = !!g.corte_mo_id;
              const archivo = g.factura_url
                ? `<a href="${escapeHtml(g.factura_url)}" target="_blank" rel="noopener" title="Ver soporte" class="text-primary hover:text-blue-800"><span class="material-symbols-outlined text-[20px] align-middle">description</span></a>`
                : `<span class="text-xs text-gray-300">—</span>`;
              return `<tr data-id="${g.id}" class="border-t border-gray-100 ${deCorte ? "bg-gray-50/60" : "cursor-pointer hover:bg-gray-50"}">
                <td class="whitespace-nowrap px-3 py-2 text-xs">${formatoFecha(g.fecha)}</td>
                <td class="px-3 py-2 text-xs">${escapeHtml(g.tipo)}</td>
                <td class="px-3 py-2 text-xs font-medium text-gray-800">${escapeHtml(nombreProveedor(g) || "—")}</td>
                <td class="px-3 py-2 text-xs">${escapeHtml(g.documento || "—")}${deCorte ? ` <span class="ml-1 rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-800">Corte ${cortesMO.get(g.corte_mo_id) ?? ""}</span>` : ""}</td>
                <td class="px-3 py-2 text-xs text-gray-600"><span class="line-clamp-2" title="${escapeHtml([g.descripcion, g.observaciones].filter(Boolean).join(" · "))}">${escapeHtml(g.descripcion || "")}${g.observaciones ? `<span class="text-gray-400"> · ${escapeHtml(g.observaciones)}</span>` : ""}</span></td>
                <td class="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">${formatoMoneda(g.valor_total)}</td>
                <td class="px-3 py-2 text-center">${archivo}</td>
                <td class="whitespace-nowrap px-3 py-2 text-right">${
                  deCorte
                    ? `<span title="Se edita en la pestaña Mano de obra" class="text-gray-300"><span class="material-symbols-outlined text-[18px] align-middle">lock</span></span>`
                    : `<button data-acc="editar" title="Editar" class="text-gray-400 hover:text-primary"><span class="material-symbols-outlined text-[18px] align-middle">edit</span></button>
                       <button data-acc="borrar" title="Eliminar" class="ml-1 text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[18px] align-middle">delete</span></button>`
                }</td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="8" class="py-10 text-center text-gray-400">${gastos.length ? "Ningún gasto coincide con el filtro." : "Aún no hay gastos. Usa «Agregar gasto o factura» para registrar el primero."}</td></tr>`;
      const total = filas.reduce((s, g) => s + PCT.num(g.valor_total), 0);
      root.querySelector("#ga-total").innerHTML = filas.length
        ? `<tr><td colspan="5" class="px-3 py-2 text-right uppercase">${filtroTipo || filtroTexto ? "Total filtrado" : "Total gastado"}</td><td class="px-3 py-2 text-right tabular-nums">${formatoMoneda(total)}</td><td colspan="2"></td></tr>`
        : "";
      root.querySelector("#ga-conteo").textContent = filtroTipo || filtroTexto ? `${filas.length} de ${gastos.length}` : "";
    };

    const pintar = () => {
      pintarKpis();
      pintarTabla();
    };

    // ------------------------------------------------------------------
    // Agregar / editar factura (formulario)
    // ------------------------------------------------------------------
    const abrirFormulario = (g = null) => {
      const valorActual = g ? PCT.num(g.valor_total) : 0;
      const tipoInicial = g?.tipo || (filtroTipo && filtroTipo !== TIPO_MO ? filtroTipo : "Material");
      const m = PCT.modal({
        titulo: g ? "Editar gasto" : "Agregar gasto o factura",
        ancho: "max-w-xl",
        html: `
          <div class="grid grid-cols-2 gap-3">
            <div><label class="mb-1 block text-xs font-medium text-gray-700">Fecha *</label><input id="gf-fecha" type="date" value="${g?.fecha || PCT.hoyISO()}" class="${CLASE_INPUT}" /></div>
            <div><label class="mb-1 block text-xs font-medium text-gray-700">Tipo de gasto *</label><select id="gf-tipo" class="${CLASE_INPUT}">${TIPOS_EDITABLES.map((t) => `<option ${t === tipoInicial ? "selected" : ""}>${t}</option>`).join("")}</select></div>
            <div class="col-span-2"><label class="mb-1 block text-xs font-medium text-gray-700">Proveedor</label><input id="gf-proveedor" list="gf-proveedores" value="${escapeHtml(g ? nombreProveedor(g) : "")}" placeholder="Escoge de la lista o escribe el nombre" class="${CLASE_INPUT}" /><datalist id="gf-proveedores">${proveedores.map((p) => `<option value="${escapeHtml(p.nombre)}"></option>`).join("")}</datalist></div>
            <div><label class="mb-1 block text-xs font-medium text-gray-700">N° de factura <span class="font-normal text-gray-400">(si tiene)</span></label><input id="gf-factura" value="${escapeHtml(g?.documento || "")}" placeholder="Vacío si no hay factura" class="${CLASE_INPUT}" /></div>
            <div><label class="mb-1 block text-xs font-medium text-gray-700">Valor total *</label><input id="gf-valor" inputmode="numeric" class="input-moneda ${CLASE_INPUT}" /></div>
            <div class="col-span-2"><label class="mb-1 block text-xs font-medium text-gray-700">Concepto</label><input id="gf-concepto" value="${escapeHtml(g?.descripcion || "")}" placeholder="Ej. Compra de cable y tubería" class="${CLASE_INPUT}" /></div>
            <div class="col-span-2"><label class="mb-1 block text-xs font-medium text-gray-700">Observaciones</label><input id="gf-obs" value="${escapeHtml(g?.observaciones || "")}" class="${CLASE_INPUT}" /></div>
            <div class="col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-700">Soporte <span class="font-normal text-gray-400">(opcional: factura, recibo o foto)</span></label>
              ${g?.factura_url ? `<p class="mb-1 text-xs">Actual: <a href="${escapeHtml(g.factura_url)}" target="_blank" rel="noopener" class="text-primary hover:underline">ver archivo</a> <label class="ml-2 text-gray-500"><input id="gf-quitar" type="checkbox" class="rounded border-gray-300" /> quitarlo</label></p>` : ""}
              <input id="gf-archivo" type="file" accept="application/pdf,image/*" class="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-blue-100" />
            </div>
          </div>`,
        botones: [
          { texto: "Cancelar" },
          {
            texto: g ? "Guardar" : "Agregar",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const q = (s) => el.querySelector(s);
              const fecha = q("#gf-fecha").value;
              const valor = valorMoneda(q("#gf-valor"));
              if (!fecha) return mostrarAviso("Pon la fecha.", "error"), false;
              if (valor <= 0) return mostrarAviso("Pon el valor de la factura.", "error"), false;
              const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === (g ? "Guardar" : "Agregar"));
              if (btn) btn.disabled = true;
              try {
                const datos = {
                  fecha,
                  tipo: q("#gf-tipo").value,
                  ...datosProveedor(q("#gf-proveedor").value),
                  documento: q("#gf-factura").value.trim() || null,
                  descripcion: q("#gf-concepto").value.trim() || null,
                  observaciones: q("#gf-obs").value.trim() || null,
                  cantidad: null,
                  valor_unitario: valor,
                  presupuesto_item_id: null,
                };
                const file = q("#gf-archivo").files[0];
                if (file) datos.factura_url = await subirArchivo(file);
                else if (q("#gf-quitar")?.checked) datos.factura_url = null;
                const res = g
                  ? await window.sb.from("gastos").update(datos).eq("id", g.id)
                  : await window.sb.from("gastos").insert({ proyecto_id: pid, ...datos });
                if (res.error) throw res.error;
                await cargar();
                pintar();
                await avisarCambio();
                mostrarAviso(g ? "Gasto actualizado." : "Gasto registrado.", "exito");
              } catch (err) {
                if (btn) btn.disabled = false;
                manejarError(err, "No se pudo guardar el gasto");
                return false;
              }
            },
          },
        ],
      });
      activarCamposMoneda(".input-moneda", m.el);
      if (valorActual) establecerValorMoneda(m.el.querySelector("#gf-valor"), valorActual);
      m.el.querySelector(g ? "#gf-valor" : "#gf-proveedor").focus();
    };

    root.querySelector("#ga-nuevo").addEventListener("click", () => abrirFormulario(null));

    root.querySelector("#ga-filas").addEventListener("click", async (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (!tr || e.target.closest("a")) return;
      const g = gastos.find((x) => x.id === tr.dataset.id);
      if (!g || g.corte_mo_id) return;
      if (e.target.closest('[data-acc="borrar"]')) {
        const ok = await PCT.confirmar(
          "Eliminar gasto",
          `¿Eliminar el gasto${g.documento ? " (factura " + escapeHtml(g.documento) + ")" : ""} de ${escapeHtml(nombreProveedor(g) || g.tipo)} por ${formatoMoneda(g.valor_total)}?`,
          "Eliminar",
          true
        );
        if (!ok) return;
        const { error } = await window.sb.from("gastos").delete().eq("id", g.id);
        if (error) return manejarError(error, "No se pudo eliminar el gasto");
        gastos = gastos.filter((x) => x.id !== g.id);
        pintar();
        await avisarCambio();
        return;
      }
      abrirFormulario(g); // clic en la fila o en el lápiz
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
    // Excel
    // ------------------------------------------------------------------
    const ENCABEZADOS = ["Fecha", "Tipo de gasto", "Proveedor", "N° factura", "Concepto", "Valor", "Observaciones", "Soporte"];

    root.querySelector("#ga-exportar").addEventListener("click", () => {
      const filas = [...gastos]
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((g) => [g.fecha, g.tipo, nombreProveedor(g), g.documento || "", g.descripcion || "", PCT.num(g.valor_total), g.observaciones || "", g.factura_url || ""]);
      const total = gastos.reduce((s, g) => s + PCT.num(g.valor_total), 0);
      const hoja = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...filas, [], ["", "", "", "", "TOTAL GASTADO", total]]);
      hoja["!cols"] = [11, 22, 28, 14, 40, 14, 30, 30].map((wch) => ({ wch }));
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "GASTOS");
      XLSX.writeFile(libro, `Gastos_${(PCT.estado.proyecto.nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.xlsx`);
    });

    // Importa una lista de facturas. Los encabezados se buscan por nombre.
    // También entiende la hoja GASTOS de la plantilla v7 (Cantidad × Valor unitario).
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
      const filaEnc = filas.findIndex((f) => f.some((c) => norm(c).startsWith("tipo")) && f.some((c) => norm(c).startsWith("valor")));
      if (filaEnc < 0) return mostrarAviso("No encontré la tabla: busco encabezados «Tipo de gasto» y «Valor».", "error");
      const col = {};
      filas[filaEnc].forEach((c, i) => {
        const h = norm(c);
        if (h === "fecha") col.fecha = i;
        else if (h.startsWith("tipo")) col.tipo = i;
        else if (h.startsWith("proveedor")) col.proveedor = i;
        else if (h.startsWith("n° factura") || h.startsWith("no. factura") || h.startsWith("factura")) col.documento = i;
        else if (h === "concepto" || h === "descripcion") col.concepto = i;
        else if (h === "cantidad") col.cantidad = i;
        else if (h.startsWith("valor unitario")) col.vu = i;
        else if (h === "valor" || h.startsWith("valor total")) col.valor = i;
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
      const nuevos = [];
      let omitidos = 0;
      for (let r = filaEnc + 1; r < filas.length; r++) {
        const f = filas[r];
        const tipoTxt = String(g(f, "tipo") || "").trim();
        // valor: columna Valor, o Cantidad × Valor unitario (hoja de la plantilla v7)
        let valor = aNum(g(f, "valor"));
        if (!valor && col.vu !== undefined) {
          const cant = g(f, "cantidad");
          valor = (cant === "" || cant === null ? 1 : aNum(cant)) * aNum(g(f, "vu"));
        }
        if (!tipoTxt && !valor) continue;
        const tipo = TIPOS.find((t) => PCT.norm(t) === PCT.norm(tipoTxt));
        if (!tipo || tipo === TIPO_MO || valor <= 0) {
          omitidos++;
          continue;
        }
        nuevos.push({
          proyecto_id: pid,
          fecha: aFecha(g(f, "fecha")) || PCT.hoyISO(),
          tipo,
          ...datosProveedor(g(f, "proveedor")),
          documento: String(g(f, "documento") || "").trim() || null,
          descripcion: String(g(f, "concepto") || "").trim() || null,
          observaciones: String(g(f, "obs") || "").trim() || null,
          cantidad: null,
          valor_unitario: valor,
        });
      }
      if (!nuevos.length) return mostrarAviso("El archivo no trae gastos para importar.", "error");
      const total = nuevos.reduce((s, x) => s + x.valor_unitario, 0);
      const ok = await PCT.confirmar(
        "Importar gastos",
        `Se van a <b>agregar ${nuevos.length} gastos</b> por ${formatoMoneda(total)}.${omitidos ? ` ${omitidos} fila(s) se omiten (sin tipo o sin valor, o de «Mano de obra contratista»: esos pagos se registran desde Mano de obra).` : ""}`,
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

    root.querySelector("#ga-filas").innerHTML = `<tr><td colspan="8" class="py-6"><div class="skeleton h-10 rounded"></div></td></tr>`;
    try {
      await cargar();
    } catch (err) {
      return manejarError(err, "No se pudieron cargar los gastos");
    }
    pintar();
  };
})(window.PCT);
