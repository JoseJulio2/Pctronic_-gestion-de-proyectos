// ============================================================================
// PROYECTOS · pestaña AVANCE DIARIO.
// Aquí se registra, día a día, lo que realmente se ejecutó en obra:
//   · Bitácora: un comentario por día (qué se hizo, novedades...).
//   · Avance por ítem: TODOS los ítems de la cotización en una tabla, con lo
//     ejecutado este día, el acumulado y el % de avance; los tres se pueden
//     mover a mano. Cada cambio queda registrado como cantidad ejecutada en el
//     día elegido (avance_items), a nombre del contratista o del personal propio.
// El peso de cada ítem (su valor / costo directo) se usa por dentro para el
// AVANCE FÍSICO REAL del proyecto, pero no se muestra aquí (ya se ve en otras
// pestañas). El avance no depende de cortes, facturas ni pagos, y de él se
// alimentan los cortes del cliente y del contratista.
// ============================================================================
(function (PCT) {
  const CLASE_INPUT = "block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-primary focus:ring-primary";

  const sumaDias = (iso, n) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fechaLarga = (iso) =>
    new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  PCT.renderAvance = async (root) => {
    const pid = PCT.estado.proyecto.id;
    let fecha = PCT.hoyISO();
    let registros = []; // avance_registros
    let avItems = []; // avance_items de TODO el proyecto

    const soloItems = () => PCT.estado.items.filter((i) => i.tipo === "item");
    const itemPorId = (id) => PCT.estado.items.find((i) => i.id === id);

    const cargarAvance = async () => {
      const [r, a] = await Promise.all([
        window.sb.from("avance_registros").select("*").eq("proyecto_id", pid).order("fecha", { ascending: true }),
        window.sb.from("avance_items").select("*").eq("proyecto_id", pid).order("created_at", { ascending: true }),
      ]);
      if (r.error) throw r.error;
      if (a.error) throw a.error;
      registros = r.data || [];
      avItems = a.data || [];
    };

    // Recarga todo lo que cambia cuando se registra avance (sin redibujar la
    // bitácora, para no perder un comentario que se esté escribiendo)
    const refrescarTodo = async () => {
      await Promise.all([cargarAvance(), PCT.recargarEjec(), PCT.recargarProyecto()]);
      pintarResumen();
      pintarTablaAvance();
      pintarLateral();
      PCT.emit("proyecto");
      PCT.emit("ejec");
    };

    root.innerHTML = `
      <div class="space-y-5">
        <div id="av-kpis" class="${PCT.CLASE_PANEL_KPIS}"></div>
        <!-- Las tarjetas de la derecha toman la altura de la de la izquierda
             (y hacen scroll por dentro) para que no queden huecos -->
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div class="lg:col-span-2" id="av-dia"></div>
          <div class="relative" id="av-dias"></div>
        </div>
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div class="lg:col-span-2" id="av-curva"></div>
          <div class="relative" id="av-capitulos"></div>
        </div>
        <div id="av-items"></div>
      </div>`;

    // ------------------------------------------------------------------
    // KPIs
    // ------------------------------------------------------------------
    const pintarResumen = () => {
      const av = PCT.avanceFisico();
      let sinCortarCliente = 0;
      let porCortarMO = 0;
      let sinPrecioContratista = 0;
      soloItems().forEach((i) => {
        const e = PCT.ejecItem(i.id);
        sinCortarCliente += Math.max(0, PCT.num(e.pendiente_cortar_cliente)) * PCT.num(i.pu_venta);
        const pendMO = Math.max(0, PCT.num(e.pendiente_cortar_mo));
        if (pendMO > 0) {
          if (i.pu_contratista === null || i.pu_contratista === undefined) sinPrecioContratista += 1;
          else porCortarMO += pendMO * PCT.num(i.pu_contratista);
        }
      });
      const t = (titulo, valor, sub = "") => `
        <div class="${PCT.CLASE_CELDA_KPI}">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">${titulo}</p>
          <p class="mt-1 text-lg font-bold tabular-nums text-gray-900">${valor}</p>
          ${sub}
        </div>`;
      root.querySelector("#av-kpis").innerHTML =
        t(
          "Avance físico real",
          PCT.fmtPct(av.pct),
          `<div class="barra-progreso mt-2"><span style="width:${Math.round(av.pct * 100)}%"></span></div>
           <p class="mt-1 text-[11px] text-gray-400">Valor ejecutado / costo directo del contrato</p>`
        ) +
        t("Valor ejecutado", formatoMoneda(av.ejecBase), `<p class="mt-1 text-[11px] text-gray-400">de ${formatoMoneda(av.cd)} (costo directo)</p>`) +
        t("Adicionales ejecutados", formatoMoneda(av.ejecAdic), `<p class="mt-1 text-[11px] text-gray-400">Fuera del contrato base</p>`) +
        t("Ejecutado sin cortar al cliente", formatoMoneda(sinCortarCliente), `<p class="mt-1 text-[11px] text-gray-400">Costo directo, antes de AIU</p>`) +
        t(
          "Por cortar al contratista",
          formatoMoneda(porCortarMO),
          `<p class="mt-1 text-[11px] ${sinPrecioContratista ? "text-amber-600" : "text-gray-400"}">${
            sinPrecioContratista ? `${sinPrecioContratista} ítem(s) sin PU contratista` : "Ejecutado por él y aún no cortado"
          }</p>`
        );
    };

    // ------------------------------------------------------------------
    // Registro del día: bitácora + tabla de avance por ítem
    // ------------------------------------------------------------------
    const registroDelDia = () => registros.find((r) => r.fecha === fecha) || null;
    const redondear = (n) => Math.round(n * 100) / 100;
    let ejecutorElegido = PCT.estado.proyecto.contratista_principal_id ? "contratista" : "propio";
    let filtro = "";

    // Cantidad registrada este día para un ítem (todas las líneas del día)
    const delDia = (itemId) => {
      const reg = registroDelDia();
      if (!reg) return 0;
      return avItems.filter((a) => a.registro_id === reg.id && a.presupuesto_item_id === itemId).reduce((s, a) => s + PCT.num(a.cantidad), 0);
    };

    const filaTabla = (i) => {
      if (i.tipo !== "item") {
        const esCap = i.tipo === "capitulo";
        const pct = esCap ? PCT.avanceDeCapitulo(i.id) : null;
        return `<tr class="grupo ${esCap ? "bg-blue-100/70 font-bold" : "bg-blue-50/70 font-semibold"}">
          <td class="px-2 py-1.5 text-xs">${escapeHtml(i.codigo || "")}</td>
          <td colspan="5" class="px-2 py-1.5 text-xs text-gray-800">${escapeHtml(i.descripcion)}</td>
          <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-600">${pct === null ? "" : PCT.fmtPct(pct, 0)}</td>
        </tr>`;
      }
      const contratada = PCT.num(i.cantidad);
      const acum = PCT.num(PCT.ejecItem(i.id).cant_ejecutada);
      const dia = delDia(i.id);
      const pct = contratada ? acum / contratada : null;
      const exceso = pct !== null && pct > 1;
      const texto = `${i.codigo || ""} ${i.descripcion}`.toLowerCase();
      const celda = "w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-right text-xs tabular-nums focus:border-primary focus:ring-1 focus:ring-primary";
      return `<tr data-id="${i.id}" data-texto="${escapeHtml(texto)}" class="fila-item border-t border-gray-100 ${i.es_adicional ? "bg-amber-50/60" : ""}">
        <td class="px-2 py-1 text-xs text-gray-500">${escapeHtml(i.codigo || "")}</td>
        <td class="min-w-[320px] px-2 py-1 text-xs text-gray-800"><span class="line-clamp-2" title="${escapeHtml(i.descripcion)}">${escapeHtml(i.descripcion)}</span>${i.es_adicional ? ` <span class="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">ADICIONAL</span>` : ""}</td>
        <td class="px-2 py-1 text-xs text-gray-500">${escapeHtml(i.unidad || "")}</td>
        <td class="px-2 py-1 text-right text-xs tabular-nums text-gray-600">${PCT.fmtCant(contratada)}</td>
        <td class="w-24 px-1 py-1"><input data-campo="dia" type="number" step="0.01" value="${dia ? redondear(dia) : ""}" placeholder="0" class="${celda}" /></td>
        <td class="w-24 px-1 py-1"><input data-campo="acum" type="number" step="0.01" min="0" value="${redondear(acum)}" class="${celda}" /></td>
        <td class="w-36 px-1 py-1">
          <div class="flex items-center gap-1">
            <input data-campo="pct" type="number" step="1" min="0" value="${pct === null ? "" : redondear(pct * 100)}" ${contratada ? "" : "disabled"} class="${celda} ${exceso ? "text-amber-700" : ""}" />
            <span class="text-[10px] text-gray-400">%</span>
          </div>
          <div class="barra-progreso mt-1"><span style="width:${Math.round(Math.min(1, pct || 0) * 100)}%"></span></div>
        </td>
      </tr>`;
    };

    const pintarTablaAvance = () => {
      const tbody = root.querySelector("#av-tabla tbody");
      if (!tbody) return;
      const items = PCT.estado.items;
      tbody.innerHTML = items.length
        ? items.map(filaTabla).join("")
        : `<tr><td colspan="7" class="py-8 text-center text-sm text-gray-400">Primero llena la pestaña Cotización.</td></tr>`;
      aplicarFiltro();
    };

    const aplicarFiltro = () => {
      const f = filtro.trim().toLowerCase();
      root.querySelectorAll("#av-tabla tbody tr").forEach((tr) => {
        if (tr.classList.contains("grupo")) tr.classList.toggle("hidden", !!f);
        else if (tr.dataset.texto !== undefined) tr.classList.toggle("hidden", !!f && !tr.dataset.texto.includes(f));
      });
    };

    const pintarDia = () => {
      const reg = registroDelDia();
      const comentario = [reg?.observaciones, reg?.novedades].filter(Boolean).join("\n\n");

      root.querySelector("#av-dia").innerHTML = `
        <div class="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5">
          <h3 class="mb-3 text-base font-bold text-gray-900">Bitácora</h3>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <button id="av-ayer" class="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50" title="Día anterior"><span class="material-symbols-outlined text-[18px]">chevron_left</span></button>
            <input id="av-fecha" type="date" value="${fecha}" class="rounded-lg border-gray-300 text-sm" />
            <button id="av-manana" class="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50" title="Día siguiente"><span class="material-symbols-outlined text-[18px]">chevron_right</span></button>
            <button id="av-hoy" class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Hoy</button>
            <p class="ml-auto text-sm font-semibold capitalize text-gray-700">${fechaLarga(fecha)}</p>
          </div>
          <label for="av-comentario" class="mb-1 block text-xs font-medium text-gray-700">Comentarios del día</label>
          <textarea id="av-comentario" rows="6" placeholder="Qué se hizo hoy, personal en obra, novedades, pendientes con el cliente..." class="${CLASE_INPUT} min-h-[140px] flex-1 resize-none">${escapeHtml(comentario)}</textarea>
          <div class="mt-2 flex items-center justify-between gap-3">
            <span class="text-xs text-gray-400">${reg && comentario ? "Este día ya tiene comentario." : "Sin comentario este día."}</span>
            <button id="av-guardar-bitacora" class="rounded-lg border border-primary px-4 py-1.5 text-xs font-semibold text-primary hover:bg-blue-50">Guardar comentario</button>
          </div>
        </div>`;

      root.querySelector("#av-items").innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">Avance por ítem</h3>
              <p class="text-xs text-gray-500">Mueve lo de <b>este día</b>, el <b>acumulado</b> o el <b>%</b> de cualquier ítem. El cambio queda registrado el <b>${formatoFecha(fecha)}</b>.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <label class="text-xs text-gray-600">Ejecutó
                <select id="av-ejecutor" class="ml-1 rounded-lg border-gray-300 text-xs">
                  <option value="contratista" ${ejecutorElegido === "contratista" ? "selected" : ""}>Contratista</option>
                  <option value="propio" ${ejecutorElegido === "propio" ? "selected" : ""}>Personal propio</option>
                </select>
              </label>
              <input id="av-buscar" type="search" value="${escapeHtml(filtro)}" placeholder="Buscar ítem..." class="w-44 rounded-lg border-gray-300 text-xs" />
            </div>
          </div>
          <div class="max-h-[640px] overflow-auto rounded-lg border border-gray-100">
            <table id="av-tabla" class="min-w-full text-sm">
              <thead class="sticky top-0 z-10 bg-gray-50 text-left text-[11px] font-semibold uppercase text-gray-500">
                <tr><th class="px-2 py-2">#</th><th class="px-2 py-2">Descripción</th><th class="px-2 py-2">Und</th><th class="px-2 py-2 text-right">Contratado</th><th class="px-2 py-2 text-right">Este día</th><th class="px-2 py-2 text-right">Acumulado</th><th class="px-2 py-2">% avance</th></tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <button id="av-nuevo-adicional" type="button" class="mt-2 text-xs font-semibold text-amber-700 hover:underline">¿Trabajo fuera del contrato? Crear ítem adicional</button>
        </div>`;

      pintarTablaAvance();
      conectarDia();
    };

    // Deja en `nuevoTotalDia` lo ejecutado este día para el ítem: ajusta la
    // línea del ejecutor elegido (las del otro ejecutor no se tocan).
    const fijarDelDia = async (item, nuevoTotalDia) => {
      const acum = PCT.num(PCT.ejecItem(item.id).cant_ejecutada);
      const diaActual = delDia(item.id);
      nuevoTotalDia = redondear(nuevoTotalDia);
      if (redondear(acum - diaActual + nuevoTotalDia) < 0) {
        mostrarAviso("El acumulado no puede quedar negativo.", "error");
        return pintarTablaAvance();
      }
      if (redondear(nuevoTotalDia - diaActual) === 0) return pintarTablaAvance();
      const reg = await asegurarRegistro();
      const lineas = avItems.filter((a) => a.registro_id === reg.id && a.presupuesto_item_id === item.id);
      const propia = lineas.find((a) => a.ejecutor === ejecutorElegido);
      const otras = lineas.filter((a) => a !== propia).reduce((s, a) => s + PCT.num(a.cantidad), 0);
      const nueva = redondear(nuevoTotalDia - otras);
      let res;
      if (propia) {
        res = nueva === 0
          ? await window.sb.from("avance_items").delete().eq("id", propia.id)
          : await window.sb.from("avance_items").update({ cantidad: nueva }).eq("id", propia.id);
      } else if (nueva !== 0) {
        res = await window.sb.from("avance_items").insert({ registro_id: reg.id, proyecto_id: pid, presupuesto_item_id: item.id, cantidad: nueva, ejecutor: ejecutorElegido });
      }
      if (res?.error) throw res.error;
      await refrescarTodo();
    };

    const conectarDia = () => {
      const q = (s) => root.querySelector(s);

      // navegación de fecha
      const irA = (iso) => {
        if (!iso) return;
        fecha = iso;
        pintarDia();
        pintarLateral();
      };
      q("#av-fecha").addEventListener("change", (e) => irA(e.target.value));
      q("#av-ayer").addEventListener("click", () => irA(sumaDias(fecha, -1)));
      q("#av-manana").addEventListener("click", () => irA(sumaDias(fecha, 1)));
      q("#av-hoy").addEventListener("click", () => irA(PCT.hoyISO()));

      // bitácora: un solo comentario por día
      q("#av-guardar-bitacora").addEventListener("click", async () => {
        try {
          await asegurarRegistro({ observaciones: q("#av-comentario").value.trim() || null, novedades: null });
          await cargarAvance();
          pintarLateral();
          mostrarAviso("Comentario guardado.", "exito");
        } catch (err) {
          manejarError(err, "No se pudo guardar el comentario");
        }
      });

      q("#av-ejecutor").addEventListener("change", (e) => (ejecutorElegido = e.target.value));
      q("#av-buscar").addEventListener("input", (e) => {
        filtro = e.target.value;
        aplicarFiltro();
      });

      // mover el avance de un ítem
      q("#av-tabla").addEventListener("change", async (e) => {
        const inp = e.target;
        const tr = inp.closest("tr[data-id]");
        if (!tr || !inp.dataset.campo) return;
        const item = itemPorId(tr.dataset.id);
        if (!item) return;
        // para devolver el foco a donde iba el usuario tras redibujar
        const sig = document.activeElement?.closest?.("tr[data-id]") ? { id: document.activeElement.closest("tr[data-id]").dataset.id, campo: document.activeElement.dataset.campo } : null;
        const valor = PCT.num(inp.value);
        const acum = PCT.num(PCT.ejecItem(item.id).cant_ejecutada);
        const dia = delDia(item.id);
        let nuevoDia;
        if (inp.dataset.campo === "dia") nuevoDia = valor;
        else if (inp.dataset.campo === "acum") nuevoDia = dia + (valor - acum);
        else nuevoDia = dia + ((valor / 100) * PCT.num(item.cantidad) - acum);
        try {
          await fijarDelDia(item, nuevoDia);
        } catch (err) {
          manejarError(err, "No se pudo registrar el avance");
        }
        if (sig?.campo) root.querySelector(`#av-tabla tr[data-id="${sig.id}"] [data-campo="${sig.campo}"]`)?.focus();
      });

      q("#av-nuevo-adicional").addEventListener("click", abrirModalAdicional);
    };

    // Crea (o actualiza) la bitácora del día y devuelve la fila
    const asegurarRegistro = async (campos = {}) => {
      const existente = registroDelDia();
      if (existente && !Object.keys(campos).length) return existente;
      const fila = { proyecto_id: pid, fecha, ...(PCT.usuarioId ? { created_by: PCT.usuarioId } : {}), ...campos };
      const { data, error } = await window.sb
        .from("avance_registros")
        .upsert(fila, { onConflict: "proyecto_id,fecha" })
        .select()
        .single();
      if (error) throw error;
      if (!registros.find((r) => r.id === data.id)) registros.push(data);
      return data;
    };

    // ------------------------------------------------------------------
    // Ítem adicional (trabajo que sale en obra fuera del contrato)
    // ------------------------------------------------------------------
    const abrirModalAdicional = () => {
      const m = PCT.modal({
        titulo: "Nuevo ítem adicional",
        ancho: "max-w-xl",
        html: `
          <p class="mb-3 text-xs text-gray-500">Se agrega a la Cotización marcado como ADICIONAL. Podrás avanzarlo aquí y cortarlo al cliente y al contratista como cualquier otro ítem; no cambia el valor base del contrato.</p>
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2"><label class="mb-1 block text-xs font-medium">Descripción *</label><input id="ad-desc" class="${CLASE_INPUT}" /></div>
            <div><label class="mb-1 block text-xs font-medium">Unidad</label><input id="ad-und" value="un" class="${CLASE_INPUT}" /></div>
            <div><label class="mb-1 block text-xs font-medium">Cantidad estimada</label><input id="ad-cant" type="number" step="0.01" min="0" value="1" class="${CLASE_INPUT}" /></div>
            <div><label class="mb-1 block text-xs font-medium">PU de venta (cliente)</label><input id="ad-pu" inputmode="numeric" class="input-moneda ${CLASE_INPUT}" /></div>
            <div><label class="mb-1 block text-xs font-medium">PU contratista <span class="font-normal text-gray-400">(opcional)</span></label><input id="ad-puc" inputmode="numeric" class="input-moneda ${CLASE_INPUT}" /></div>
          </div>`,
        botones: [
          { texto: "Cancelar" },
          {
            texto: "Crear ítem",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const desc = el.querySelector("#ad-desc").value.trim();
              if (!desc) {
                mostrarAviso("Escribe la descripción del adicional.", "error");
                return false;
              }
              const pucTxt = el.querySelector("#ad-puc").value.trim();
              const orden = PCT.estado.items.length ? Math.max(...PCT.estado.items.map((i) => PCT.num(i.orden))) + 1 : 1;
              const { data, error } = await window.sb
                .from("presupuesto_items")
                .insert({
                  proyecto_id: pid, tipo: "item", orden, descripcion: desc, es_adicional: true,
                  unidad: el.querySelector("#ad-und").value.trim() || "un",
                  cantidad: PCT.num(el.querySelector("#ad-cant").value),
                  pu_venta: valorMoneda(el.querySelector("#ad-pu")),
                  pu_contratista: pucTxt ? valorMoneda(el.querySelector("#ad-puc")) : null,
                })
                .select()
                .single();
              if (error) {
                manejarError(error, "No se pudo crear el adicional");
                return false;
              }
              await Promise.all([PCT.recargarItems(), PCT.recargarEjec()]);
              pintarDia();
              const inp = root.querySelector(`#av-tabla tr[data-id="${data.id}"] [data-campo="dia"]`);
              inp?.scrollIntoView({ block: "center" });
              inp?.focus();
              mostrarAviso("Adicional creado. Ahora registra su cantidad ejecutada en la tabla.", "exito");
            },
          },
        ],
      });
      activarCamposMoneda(".input-moneda", m.el);
      m.el.querySelector("#ad-desc").focus();
    };

    // ------------------------------------------------------------------
    // Lateral: curva S de avance real, avance por capítulo, historial
    // ------------------------------------------------------------------
    const curvaAcumulada = () => {
      // % acumulado del proyecto al cierre de cada día con registros
      const porRegistro = new Map(registros.map((r) => [r.id, r.fecha]));
      const ordenados = [...avItems].sort((a, b) => (porRegistro.get(a.registro_id) || "").localeCompare(porRegistro.get(b.registro_id) || ""));
      const cum = new Map();
      const dias = new Map();
      const cd = PCT.avanceFisico().cd;
      ordenados.forEach((a) => {
        const it = itemPorId(a.presupuesto_item_id);
        const f = porRegistro.get(a.registro_id);
        if (!it || !f || it.es_adicional) return;
        cum.set(it.id, (cum.get(it.id) || 0) + PCT.num(a.cantidad));
        let total = 0;
        cum.forEach((q, id) => {
          const x = itemPorId(id);
          total += Math.min(q, PCT.num(x.cantidad)) * PCT.num(x.pu_venta);
        });
        dias.set(f, cd ? total / cd : 0);
      });
      return [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };

    const svgCurva = (puntos) => {
      if (!puntos.length) return `<p class="py-6 text-center text-sm text-gray-400">La curva aparece cuando registres el primer avance.</p>`;
      const W = 420, H = 150, L = 34, R = 8, T = 8, B = 22;
      const t0 = new Date(puntos[0][0] + "T12:00:00").getTime();
      const t1 = new Date(puntos[puntos.length - 1][0] + "T12:00:00").getTime();
      const span = Math.max(t1 - t0, 86400000);
      const x = (iso) => L + ((new Date(iso + "T12:00:00").getTime() - t0) / span) * (W - L - R);
      const y = (v) => T + (1 - Math.min(1, v)) * (H - T - B);
      const linea = [[puntos[0][0], 0], ...puntos].map(([f, v], i) => `${i ? "L" : "M"}${x(f).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      const grid = [0, 0.25, 0.5, 0.75, 1]
        .map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="#e5e7eb" stroke-width="1" /><text x="${L - 5}" y="${y(g) + 3}" text-anchor="end" font-size="9" fill="#9ca3af">${g * 100}%</text>`)
        .join("");
      const ultimo = puntos[puntos.length - 1];
      return `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Curva de avance físico real acumulado">
        ${grid}
        <path d="${linea}" fill="none" stroke="#135bec" stroke-width="2" stroke-linejoin="round" />
        <circle cx="${x(ultimo[0])}" cy="${y(ultimo[1])}" r="3.5" fill="#135bec" />
        <text x="${L}" y="${H - 6}" font-size="9" fill="#6b7280">${formatoFecha(puntos[0][0])}</text>
        <text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="9" fill="#6b7280">${formatoFecha(ultimo[0])}</text>
      </svg>`;
    };

    const pintarLateral = () => {
      // por capítulo
      const caps = PCT.estado.items.filter((i) => i.tipo === "capitulo");
      const filasCap = caps.length
        ? caps
            .map((c) => {
              const pct = PCT.avanceDeCapitulo(c.id);
              return `<div class="py-1.5"><div class="flex items-baseline justify-between text-xs"><span class="truncate pr-2 font-medium text-gray-700">${escapeHtml((c.codigo ? c.codigo + " · " : "") + c.descripcion)}</span><span class="tabular-nums text-gray-500">${PCT.fmtPct(pct, 0)}</span></div><div class="barra-progreso mt-1"><span style="width:${Math.round(pct * 100)}%"></span></div></div>`;
            })
            .join("")
        : `<p class="py-3 text-sm text-gray-400">Agrega capítulos a la Cotización para ver el avance por capítulo.</p>`;

      // historial (más reciente primero)
      const valorPorRegistro = new Map();
      avItems.forEach((a) => {
        const it = itemPorId(a.presupuesto_item_id);
        valorPorRegistro.set(a.registro_id, (valorPorRegistro.get(a.registro_id) || 0) + PCT.num(a.cantidad) * PCT.num(it?.pu_venta));
      });
      const hist = [...registros].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 30);
      const filasHist = hist.length
        ? hist
            .map(
              (r) => `<tr data-fecha="${r.fecha}" class="cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${r.fecha === fecha ? "bg-blue-50" : ""}">
                <td class="py-1.5 pr-2 text-xs font-medium text-gray-800">${formatoFecha(r.fecha)}</td>
                <td class="py-1.5 pr-2 text-xs text-gray-500"><span class="line-clamp-1" title="${escapeHtml([r.observaciones, r.novedades].filter(Boolean).join(" · "))}">${escapeHtml([r.observaciones, r.novedades].filter(Boolean).join(" · ") || "—")}</span></td>
                <td class="py-1.5 text-right text-xs tabular-nums text-gray-700">${formatoMoneda(valorPorRegistro.get(r.id) || 0)}</td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="3" class="py-4 text-center text-sm text-gray-400">Sin días registrados.</td></tr>`;

      // tarjeta lateral: en pantalla grande ocupa justo la altura de la fila
      const lateral = (titulo, cuerpo, sub = "") => `
        <div class="flex max-h-80 flex-col rounded-xl border border-gray-200 bg-white p-5 lg:absolute lg:inset-0 lg:max-h-none">
          <div class="mb-2 flex items-baseline justify-between gap-2"><h3 class="text-base font-bold text-gray-900">${titulo}</h3>${sub}</div>
          <div class="min-h-0 flex-1 overflow-y-auto">${cuerpo}</div>
        </div>`;
      const pctTotal = PCT.avanceFisico().pct;
      root.querySelector("#av-curva").innerHTML = `
        <div class="h-full rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-2 flex items-baseline justify-between"><h3 class="text-base font-bold text-gray-900">Curva de avance real</h3><span class="text-sm font-bold tabular-nums text-primary">${PCT.fmtPct(pctTotal)}</span></div>
          ${svgCurva(curvaAcumulada())}
        </div>`;
      root.querySelector("#av-capitulos").innerHTML = lateral("Avance por capítulo", filasCap, `<span class="text-xs text-gray-400">${caps.length} capítulos</span>`);
      root.querySelector("#av-dias").innerHTML = lateral(
        "Días registrados",
        `<table class="w-full"><tbody id="av-historial">${filasHist}</tbody></table>`,
        `<span class="text-xs text-gray-400">${registros.length} días</span>`
      );
      root.querySelector("#av-historial").addEventListener("click", (e) => {
        const tr = e.target.closest("tr[data-fecha]");
        if (!tr) return;
        fecha = tr.dataset.fecha;
        pintarDia();
        pintarLateral();
      });
    };

    // ------------------------------------------------------------------
    // Arranque
    // ------------------------------------------------------------------
    root.querySelector("#av-dia").innerHTML = `<div class="skeleton h-72 rounded-xl"></div>`;
    try {
      await cargarAvance();
    } catch (err) {
      return manejarError(err, "No se pudo cargar el avance diario");
    }
    pintarResumen();
    pintarDia();
    pintarLateral();
  };
})(window.PCT);
