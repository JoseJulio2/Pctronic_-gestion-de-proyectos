// ============================================================================
// PROYECTOS · pestaña AVANCE DIARIO.
// Aquí se registra, día a día, lo que realmente se ejecutó en obra: cantidades
// por ítem del presupuesto (incluidos los adicionales), quién lo ejecutó
// (contratista o personal propio) y la bitácora del día (clima, observaciones,
// novedades). De este registro sale el AVANCE FÍSICO REAL del proyecto — no
// depende de cortes, facturas ni pagos — y de él se alimentan los cortes del
// cliente y del contratista.
// ============================================================================
(function (PCT) {
  const CLIMAS = ["Soleado", "Parcialmente nublado", "Nublado", "Lluvia", "Lluvia fuerte", "Tormenta eléctrica"];
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

    const etiquetaItem = (i) => `${i.codigo ? i.codigo + " · " : ""}${i.descripcion}${i.es_adicional ? " (ADICIONAL)" : ""}`;
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

    // Recarga todo lo que cambia cuando se registra avance
    const refrescarTodo = async () => {
      await Promise.all([cargarAvance(), PCT.recargarEjec(), PCT.recargarProyecto()]);
      pintarResumen();
      pintarDia();
      pintarLateral();
      PCT.emit("proyecto");
      PCT.emit("ejec");
    };

    root.innerHTML = `
      <div class="space-y-5">
        <div id="av-kpis" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"></div>
        <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <div class="space-y-4 xl:col-span-3" id="av-dia"></div>
          <div class="space-y-4 xl:col-span-2" id="av-lateral"></div>
        </div>
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
      const t = (titulo, valor, sub = "", extra = "") => `
        <div class="rounded-xl border border-gray-200 bg-white p-4 ${extra}">
          <p class="text-[11px] font-semibold uppercase text-gray-500">${titulo}</p>
          <p class="mt-1 text-xl font-bold tabular-nums text-gray-900">${valor}</p>
          ${sub}
        </div>`;
      root.querySelector("#av-kpis").innerHTML =
        t(
          "Avance físico real",
          PCT.fmtPct(av.pct),
          `<div class="barra-progreso mt-2"><span style="width:${Math.round(av.pct * 100)}%"></span></div>
           <p class="mt-1 text-[11px] text-gray-400">Valor ejecutado / costo directo del contrato</p>`,
          "sm:col-span-2 lg:col-span-1"
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
    // Registro del día
    // ------------------------------------------------------------------
    const registroDelDia = () => registros.find((r) => r.fecha === fecha) || null;

    const pintarDia = () => {
      const reg = registroDelDia();
      const delDia = reg ? avItems.filter((a) => a.registro_id === reg.id) : [];
      const valorDia = delDia.reduce((s, a) => s + PCT.num(a.cantidad) * PCT.num(itemPorId(a.presupuesto_item_id)?.pu_venta), 0);
      const cd = PCT.avanceFisico().cd;

      const filas = delDia.length
        ? delDia
            .map((a) => {
              const it = itemPorId(a.presupuesto_item_id);
              const e = PCT.ejecItem(a.presupuesto_item_id);
              const exceso = it && PCT.num(e.cant_ejecutada) > PCT.num(it.cantidad) && !it.es_adicional;
              return `
              <tr data-aid="${a.id}" class="border-t border-gray-100">
                <td class="py-2 pr-3">
                  <p class="font-medium text-gray-900">${escapeHtml(it ? etiquetaItem(it) : "(ítem eliminado)")}</p>
                  <p class="text-[11px] ${exceso ? "text-amber-600" : "text-gray-400"}">
                    Acumulado ${PCT.fmtCant(e.cant_ejecutada)} de ${PCT.fmtCant(it?.cantidad)} ${escapeHtml(it?.unidad || "")}${exceso ? " · supera lo contratado (mayor cantidad)" : ""}
                  </p>
                </td>
                <td class="py-2 pr-3">
                  <select data-f="ejecutor" class="rounded-lg border-gray-300 text-xs">
                    <option value="contratista" ${a.ejecutor === "contratista" ? "selected" : ""}>Contratista</option>
                    <option value="propio" ${a.ejecutor === "propio" ? "selected" : ""}>Personal propio</option>
                  </select>
                </td>
                <td class="py-2 pr-3"><input data-f="cantidad" type="number" step="0.01" min="0" value="${a.cantidad}" class="w-24 rounded-lg border-gray-300 text-right text-sm tabular-nums" /> <span class="text-xs text-gray-400">${escapeHtml(it?.unidad || "")}</span></td>
                <td class="py-2 pr-3 tabular-nums text-xs text-gray-600">${formatoMoneda(PCT.num(a.cantidad) * PCT.num(it?.pu_venta))}</td>
                <td class="py-2 text-right"><button data-borrar class="text-gray-400 hover:text-red-600" title="Quitar"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="5" class="py-6 text-center text-gray-400">Aún no hay cantidades registradas este día.</td></tr>`;

      root.querySelector("#av-dia").innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <button id="av-ayer" class="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50" title="Día anterior"><span class="material-symbols-outlined text-[18px]">chevron_left</span></button>
            <input id="av-fecha" type="date" value="${fecha}" class="rounded-lg border-gray-300 text-sm" />
            <button id="av-manana" class="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50" title="Día siguiente"><span class="material-symbols-outlined text-[18px]">chevron_right</span></button>
            <button id="av-hoy" class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Hoy</button>
            <p class="ml-auto text-sm font-semibold capitalize text-gray-700">${fechaLarga(fecha)}</p>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Clima</label>
              <input id="av-clima" list="av-climas" value="${escapeHtml(reg?.clima || "")}" placeholder="Ej. Soleado" class="${CLASE_INPUT}" />
              <datalist id="av-climas">${CLIMAS.map((c) => `<option value="${c}"></option>`).join("")}</datalist>
            </div>
            <div class="sm:col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-700">Observaciones del día</label>
              <input id="av-obs" value="${escapeHtml(reg?.observaciones || "")}" placeholder="Qué se hizo, personal presente, etc." class="${CLASE_INPUT}" />
            </div>
            <div class="sm:col-span-3">
              <label class="mb-1 block text-xs font-medium text-gray-700">Novedades <span class="font-normal text-gray-400">(incidentes, pendientes con el cliente, paradas, materiales faltantes...)</span></label>
              <textarea id="av-nov" rows="2" class="${CLASE_INPUT}">${escapeHtml(reg?.novedades || "")}</textarea>
            </div>
          </div>
          <div class="mt-2 text-right"><button id="av-guardar-bitacora" class="rounded-lg border border-primary px-4 py-1.5 text-xs font-semibold text-primary hover:bg-blue-50">Guardar bitácora</button></div>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex items-baseline justify-between">
            <h3 class="text-base font-bold text-gray-900">Cantidades ejecutadas este día</h3>
            <p class="text-xs text-gray-500">Valor del día: <b class="tabular-nums text-gray-800">${formatoMoneda(valorDia)}</b>${cd ? ` · ${PCT.fmtPct(valorDia / cd, 2)} del contrato` : ""}</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm"><thead class="text-left text-[11px] uppercase text-gray-500"><tr><th class="pb-2">Ítem</th><th class="pb-2">Ejecutó</th><th class="pb-2">Cantidad</th><th class="pb-2">Valor (venta)</th><th></th></tr></thead>
            <tbody id="av-filas">${filas}</tbody></table>
          </div>

          <form id="av-form-agregar" class="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-12 sm:items-end">
            <div class="sm:col-span-5">
              <label class="mb-1 block text-xs font-medium text-gray-700">Ítem del presupuesto</label>
              <input id="av-item" list="av-lista-items" placeholder="Escribe para buscar: 1.1, cámara..." autocomplete="off" class="${CLASE_INPUT}" />
              <datalist id="av-lista-items"></datalist>
            </div>
            <div class="sm:col-span-3">
              <label class="mb-1 block text-xs font-medium text-gray-700">Ejecutó</label>
              <select id="av-ejecutor" class="${CLASE_INPUT}">
                <option value="contratista">Contratista</option>
                <option value="propio">Personal propio</option>
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="mb-1 block text-xs font-medium text-gray-700">Cantidad</label>
              <input id="av-cant" type="number" step="0.01" min="0" class="${CLASE_INPUT}" />
            </div>
            <div class="sm:col-span-2"><button type="submit" class="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Agregar</button></div>
            <p id="av-info-item" class="text-xs text-gray-500 sm:col-span-12"></p>
          </form>
          <button id="av-nuevo-adicional" type="button" class="mt-2 text-xs font-semibold text-amber-700 hover:underline">¿Trabajo fuera del contrato? Crear ítem adicional</button>
        </div>`;

      conectarDia();
    };

    const conectarDia = () => {
      const q = (s) => root.querySelector(s);

      // navegación de fecha
      const irA = (iso) => {
        if (!iso) return;
        fecha = iso;
        pintarDia();
      };
      q("#av-fecha").addEventListener("change", (e) => irA(e.target.value));
      q("#av-ayer").addEventListener("click", () => irA(sumaDias(fecha, -1)));
      q("#av-manana").addEventListener("click", () => irA(sumaDias(fecha, 1)));
      q("#av-hoy").addEventListener("click", () => irA(PCT.hoyISO()));

      // bitácora
      q("#av-guardar-bitacora").addEventListener("click", async () => {
        try {
          await asegurarRegistro({
            clima: q("#av-clima").value.trim() || null,
            observaciones: q("#av-obs").value.trim() || null,
            novedades: q("#av-nov").value.trim() || null,
          });
          await cargarAvance();
          pintarLateral();
          mostrarAviso("Bitácora guardada.", "exito");
        } catch (err) {
          manejarError(err, "No se pudo guardar la bitácora");
        }
      });

      // lista de ítems para buscar (con etiqueta única)
      const etiquetas = new Map();
      const dl = q("#av-lista-items");
      const usadas = new Set();
      soloItems().forEach((i) => {
        let et = etiquetaItem(i);
        if (usadas.has(et)) et += ` [${i.id.slice(0, 4)}]`;
        usadas.add(et);
        etiquetas.set(et, i.id);
      });
      dl.innerHTML = [...etiquetas.keys()].map((et) => `<option value="${escapeHtml(et)}"></option>`).join("");

      const itemElegido = () => {
        const id = etiquetas.get(q("#av-item").value.trim());
        return id ? itemPorId(id) : null;
      };
      q("#av-item").addEventListener("input", () => {
        const it = itemElegido();
        const info = q("#av-info-item");
        if (!it) return (info.textContent = "");
        const e = PCT.ejecItem(it.id);
        const pend = PCT.num(it.cantidad) - PCT.num(e.cant_ejecutada);
        info.textContent = `Contratado: ${PCT.fmtCant(it.cantidad)} ${it.unidad || ""} · Ejecutado: ${PCT.fmtCant(e.cant_ejecutada)} · ${pend >= 0 ? "Pendiente: " + PCT.fmtCant(pend) : "Excede lo contratado en " + PCT.fmtCant(-pend)}`;
        // sugerir ejecutor: contratista si el proyecto tiene uno asignado
        q("#av-ejecutor").value = PCT.estado.proyecto.contratista_principal_id ? "contratista" : "propio";
      });

      q("#av-form-agregar").addEventListener("submit", async (e) => {
        e.preventDefault();
        const it = itemElegido();
        const cantidad = PCT.num(q("#av-cant").value);
        if (!it) return mostrarAviso("Elige un ítem de la lista del presupuesto.", "error");
        if (cantidad <= 0) return mostrarAviso("La cantidad debe ser mayor que cero.", "error");
        try {
          const reg = await asegurarRegistro();
          // si ya existe una línea del mismo ítem y ejecutor ese día, se suma
          const existente = avItems.find((a) => a.registro_id === reg.id && a.presupuesto_item_id === it.id && a.ejecutor === q("#av-ejecutor").value);
          if (existente) {
            const { error } = await window.sb.from("avance_items").update({ cantidad: PCT.num(existente.cantidad) + cantidad }).eq("id", existente.id);
            if (error) throw error;
          } else {
            const { error } = await window.sb.from("avance_items").insert({
              registro_id: reg.id, proyecto_id: pid, presupuesto_item_id: it.id, cantidad, ejecutor: q("#av-ejecutor").value,
            });
            if (error) throw error;
          }
          await refrescarTodo();
        } catch (err) {
          manejarError(err, "No se pudo registrar el avance");
        }
      });

      // editar / borrar una línea
      const tbody = q("#av-filas");
      tbody.addEventListener("change", async (e) => {
        const tr = e.target.closest("tr[data-aid]");
        if (!tr || !e.target.dataset.f) return;
        const campo = e.target.dataset.f;
        const valor = campo === "cantidad" ? PCT.num(e.target.value) : e.target.value;
        if (campo === "cantidad" && valor <= 0) return mostrarAviso("La cantidad debe ser mayor que cero (o quita la línea).", "error");
        const { error } = await window.sb.from("avance_items").update({ [campo]: valor }).eq("id", tr.dataset.aid);
        if (error) return manejarError(error, "No se pudo guardar el cambio");
        await refrescarTodo();
      });
      tbody.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-borrar]");
        if (!btn) return;
        const { error } = await window.sb.from("avance_items").delete().eq("id", btn.closest("tr").dataset.aid);
        if (error) return manejarError(error, "No se pudo quitar la línea");
        await refrescarTodo();
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
          <p class="mb-3 text-xs text-gray-500">Se agrega al Presupuesto marcado como ADICIONAL. Podrás avanzarlo aquí y cortarlo al cliente y al contratista como cualquier otro ítem; no cambia el valor base del contrato.</p>
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
              const inp = root.querySelector("#av-item");
              inp.value = etiquetaItem(data);
              inp.dispatchEvent(new Event("input"));
              root.querySelector("#av-cant").focus();
              mostrarAviso("Adicional creado. Ahora registra su cantidad ejecutada.", "exito");
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
        : `<p class="py-3 text-sm text-gray-400">Agrega capítulos al Presupuesto para ver el avance por capítulo.</p>`;

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
                <td class="py-1.5 pr-2 text-xs text-gray-500">${escapeHtml(r.clima || "")}</td>
                <td class="py-1.5 pr-2 text-right text-xs tabular-nums text-gray-700">${formatoMoneda(valorPorRegistro.get(r.id) || 0)}</td>
                <td class="py-1.5 text-xs text-gray-500">${r.novedades ? `<span title="${escapeHtml(r.novedades)}" class="text-amber-600">● novedad</span>` : ""}</td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="4" class="py-4 text-center text-sm text-gray-400">Sin días registrados.</td></tr>`;

      root.querySelector("#av-lateral").innerHTML = `
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <h3 class="mb-2 text-base font-bold text-gray-900">Curva de avance real</h3>
          ${svgCurva(curvaAcumulada())}
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <h3 class="mb-1 text-base font-bold text-gray-900">Avance por capítulo</h3>
          ${filasCap}
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <h3 class="mb-2 text-base font-bold text-gray-900">Días registrados</h3>
          <div class="max-h-72 overflow-y-auto"><table class="w-full"><tbody id="av-historial">${filasHist}</tbody></table></div>
        </div>`;
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
    root.querySelector("#av-dia").innerHTML = `<div class="skeleton h-64 rounded-xl"></div>`;
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
