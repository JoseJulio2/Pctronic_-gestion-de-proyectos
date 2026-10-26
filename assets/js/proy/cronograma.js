// ============================================================================
// PROYECTOS · pestaña CRONOGRAMA (hoja CRONOGRAMA de la plantilla v7).
// Fases con sus actividades (hito, gestión, compra, instalación, pruebas) en
// una sola tabla (cronograma_actividades, ordenada por `orden`): una fila de
// tipo 'fase' agrupa las actividades que le siguen hasta la próxima fase.
// Reglas (iguales al Excel):
//   Inicio = inicio real › inicio fijo › fin de la predecesora + 1 (hito: +0)
//            › inicio de obra del proyecto › hoy
//   Fin    = fin real › (hito: el inicio) › inicio + días − 1
//   Avance = % manual › 100 % si tiene fin real › si es Instalación con frente
//            vinculado: avance del capítulo según el AVANCE DIARIO › 0
//            (las de Compra quedan en manual hasta que exista el módulo Compras)
//   Estado = hito: Cumplido / Vencido / Pendiente; resto: Terminada / Atrasada
//            / En curso / Debe iniciar / Por iniciar. Días de atraso si pasó el fin.
//   Fase   = inicio mínimo, fin máximo, avance ponderado por duración.
// Las fechas son de calendario (como el Excel), no días hábiles.
// ============================================================================
(function (PCT) {
  const TIPOS = {
    fase: "Fase",
    hito: "Hito",
    gestion: "Gestión",
    compra: "Compra",
    instalacion: "Instalación",
    pruebas: "Pruebas",
  };
  const TIPOS_ACT = ["hito", "gestion", "compra", "instalacion", "pruebas"];
  const COLORES_FASE = ["#135bec", "#0891b2", "#7c3aed", "#d97706", "#059669", "#db2777", "#4b5563"];
  const ESTADOS = {
    Terminada: "bg-green-100 text-green-800",
    Cumplido: "bg-green-100 text-green-800",
    "En curso": "bg-blue-100 text-blue-800",
    "Debe iniciar": "bg-amber-100 text-amber-800",
    "Por iniciar": "bg-gray-100 text-gray-600",
    Pendiente: "bg-gray-100 text-gray-600",
    Atrasada: "bg-red-100 text-red-700",
    Vencido: "bg-red-100 text-red-700",
    "Con atraso": "bg-red-100 text-red-700",
  };
  const CELDA =
    "w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs hover:border-gray-300 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary";
  const DIA = 86400000;

  // Fechas como texto ISO (AAAA-MM-DD) para evitar líos de zona horaria
  const aFecha = (iso) => new Date(iso + "T12:00:00");
  const aIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sumarDias = (iso, n) => {
    const d = aFecha(iso);
    d.setDate(d.getDate() + n);
    return aIso(d);
  };
  const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / DIA);
  const fechaCorta = (iso) => (iso ? aFecha(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "") : "—");

  PCT.renderCronograma = async (root) => {
    const p = () => PCT.estado.proyecto;
    const pid = PCT.estado.proyecto.id;
    let acts = []; // cronograma_actividades ordenadas
    let calc = new Map(); // id → { inicio, fin, dias, pct, estado, atraso, fase, numero, color }

    const capitulos = () => PCT.estado.items.filter((i) => i.tipo === "capitulo");
    const cargar = async () => {
      const { data, error } = await window.sb.from("cronograma_actividades").select("*").eq("proyecto_id", pid).order("orden", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      acts = data || [];
    };

    // ------------------------------------------------------------------
    // Cálculo de fechas, avance y estado
    // ------------------------------------------------------------------
    const calcular = () => {
      calc = new Map();
      const hoy = PCT.hoyISO();
      const inicioProyecto = p().fecha_inicio || hoy;
      const porId = new Map(acts.map((a) => [a.id, a]));
      // numeración: F1, F2… para fases; 1, 2, 3… para actividades
      let nFase = 0;
      let nAct = 0;
      let faseActual = null;
      acts.forEach((a) => {
        if (a.tipo === "fase") {
          nFase += 1;
          faseActual = a.id;
          calc.set(a.id, { numero: `F${nFase}`, color: COLORES_FASE[(nFase - 1) % COLORES_FASE.length], fase: a.id });
        } else {
          nAct += 1;
          const colorFase = faseActual ? calc.get(faseActual).color : COLORES_FASE[6];
          calc.set(a.id, { numero: String(nAct), color: colorFase, fase: faseActual });
        }
      });

      // fechas de actividades (con predecesoras; se protege contra ciclos)
      const enCurso = new Set();
      const fechas = (a) => {
        const c = calc.get(a.id);
        if (c.inicio) return c;
        let inicio;
        if (a.inicio_real) inicio = a.inicio_real;
        else if (a.inicio_fijo) inicio = a.inicio_fijo;
        else if (a.predecesora_id && porId.has(a.predecesora_id) && !enCurso.has(a.id)) {
          enCurso.add(a.id);
          const pr = fechas(porId.get(a.predecesora_id));
          enCurso.delete(a.id);
          inicio = pr.fin ? sumarDias(pr.fin, a.tipo === "hito" ? 0 : 1) : inicioProyecto;
        } else inicio = inicioProyecto;
        const dias = a.tipo === "hito" ? 0 : Math.max(PCT.num(a.dias), 1);
        const fin = a.fin_real || (a.tipo === "hito" ? inicio : sumarDias(inicio, dias - 1));
        Object.assign(c, { inicio, fin, dias });
        return c;
      };

      acts.filter((a) => a.tipo !== "fase").forEach((a) => {
        const c = fechas(a);
        let pct = 0;
        if (a.pct_manual !== null && a.pct_manual !== undefined) pct = PCT.num(a.pct_manual) / 100;
        else if (a.fin_real) pct = 1;
        else if (a.frente_item_id && a.tipo === "instalacion") pct = Math.min(1, PCT.avanceDeCapitulo(a.frente_item_id));
        let estado;
        if (a.tipo === "hito") estado = pct >= 1 ? "Cumplido" : hoy > c.fin ? "Vencido" : "Pendiente";
        else if (pct >= 1) estado = "Terminada";
        else if (hoy > c.fin) estado = "Atrasada";
        else if (pct > 0 || a.inicio_real) estado = "En curso";
        else if (hoy >= c.inicio) estado = "Debe iniciar";
        else estado = "Por iniciar";
        const atraso = pct < 1 && hoy > c.fin ? diasEntre(c.fin, hoy) : 0;
        Object.assign(c, { pct, estado, atraso });
      });

      // fases: agregan a sus actividades
      acts.filter((a) => a.tipo === "fase").forEach((f) => {
        const hijas = acts.filter((a) => a.tipo !== "fase" && calc.get(a.id).fase === f.id).map((a) => calc.get(a.id));
        const c = calc.get(f.id);
        if (!hijas.length) return Object.assign(c, { inicio: null, fin: null, dias: null, pct: null, estado: "", atraso: 0 });
        const inicio = hijas.map((h) => h.inicio).sort()[0];
        const fin = hijas.map((h) => h.fin).sort().at(-1);
        const peso = hijas.reduce((s, h) => s + Math.max(h.dias, 1), 0);
        const pct = hijas.reduce((s, h) => s + Math.max(h.dias, 1) * h.pct, 0) / peso;
        const conAtraso = hijas.some((h) => h.estado === "Atrasada" || h.estado === "Vencido");
        const estado = conAtraso ? "Con atraso" : pct >= 1 ? "Terminada" : pct > 0 ? "En curso" : "Por iniciar";
        Object.assign(c, { inicio, fin, dias: diasEntre(inicio, fin) + 1, pct, estado, atraso: Math.max(...hijas.map((h) => h.atraso)) });
      });
    };

    // ------------------------------------------------------------------
    // Estructura
    // ------------------------------------------------------------------
    root.innerHTML = `
      <div class="space-y-5">
        <div id="cr-kpis" class="${PCT.CLASE_PANEL_KPIS}"></div>
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">Cronograma de obra</h3>
              <p class="text-xs text-gray-500">Escribe días y predecesora: las fechas se calculan solas. El avance de las actividades de <b>Instalación</b> sale del Avance diario del capítulo vinculado; en las demás pon el % a mano o el fin real.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" id="cr-pdf" class="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><span class="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF para el cliente</button>
              <button type="button" data-nuevo="fase" class="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-blue-100">+ Fase</button>
              <button type="button" data-nuevo="actividad" class="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">+ Actividad</button>
            </div>
          </div>
          <div class="overflow-x-auto rounded-lg border border-gray-100">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 text-left text-[10px] font-semibold uppercase text-gray-500">
                <tr>
                  <th class="px-2 py-2">ID</th><th class="px-2 py-2">Fase / actividad</th><th class="px-2 py-2">Tipo</th><th class="px-2 py-2">Responsable</th>
                  <th class="px-2 py-2">Frente (capítulo)</th><th class="px-2 py-2">Pred.</th><th class="px-2 py-2">Inicio fijo</th><th class="px-2 py-2 text-right">Días</th>
                  <th class="px-2 py-2">Inicio</th><th class="px-2 py-2">Fin</th><th class="px-2 py-2">Inicio real</th><th class="px-2 py-2">Fin real</th>
                  <th class="px-2 py-2 text-right">% manual</th><th class="px-2 py-2">Avance</th><th class="px-2 py-2">Estado</th><th class="px-2 py-2 text-right">Atraso</th><th></th>
                </tr>
              </thead>
              <tbody id="cr-filas"></tbody>
            </table>
          </div>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="text-base font-bold text-gray-900">Diagrama de Gantt</h3>
            <p class="text-xs text-gray-400">Semanas de lunes a domingo · barra clara = duración, barra oscura = avance · ◆ hito · línea roja = hoy</p>
          </div>
          <div id="cr-gantt" class="overflow-x-auto"></div>
        </div>
      </div>`;

    // ------------------------------------------------------------------
    // KPIs
    // ------------------------------------------------------------------
    const pintarKpis = () => {
      const actividades = acts.filter((a) => a.tipo !== "fase").map((a) => calc.get(a.id));
      const inicio = actividades.length ? actividades.map((c) => c.inicio).sort()[0] : null;
      const fin = actividades.length ? actividades.map((c) => c.fin).sort().at(-1) : null;
      const finContractual = p().fecha_fin_estimada || null;
      const holgura = finContractual && fin ? diasEntre(fin, finContractual) : null;
      const hitos = acts.filter((a) => a.tipo === "hito");
      const hitosOk = hitos.filter((a) => calc.get(a.id).estado === "Cumplido").length;
      const atrasadas = actividades.filter((c) => c.estado === "Atrasada" || c.estado === "Vencido").length;
      const av = PCT.avanceFisico();
      root.querySelector("#cr-kpis").innerHTML =
        PCT.tarjetaKpi("Inicio", inicio ? formatoFecha(inicio) : "—") +
        PCT.tarjetaKpi("Fin proyectado", fin ? formatoFecha(fin) : "—") +
        PCT.tarjetaKpi("Fin contractual", finContractual ? formatoFecha(finContractual) : "Sin definir", finContractual ? "" : "Ponlo en la pestaña Inicio") +
        PCT.tarjetaKpi("Holgura", holgura === null ? "—" : `${holgura} días`, holgura === null ? "" : holgura < 0 ? "El fin proyectado pasa el contractual" : "Antes del fin contractual", holgura === null ? "text-gray-900" : holgura < 0 ? "text-red-600" : "text-green-600") +
        PCT.tarjetaKpi("Avance físico", PCT.fmtPct(av.pct), "Según el Avance diario") +
        PCT.tarjetaKpi("Hitos cumplidos", `${hitosOk} / ${hitos.length}`) +
        PCT.tarjetaKpi("Atrasadas", String(atrasadas), atrasadas ? "Actividades vencidas" : "Al día", atrasadas ? "text-red-600" : "text-gray-900");
    };

    // ------------------------------------------------------------------
    // Tabla
    // ------------------------------------------------------------------
    const badge = (estado) => (estado ? `<span class="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${ESTADOS[estado] || "bg-gray-100 text-gray-600"}">${estado}</span>` : "");
    const barra = (pct, color) =>
      pct === null || pct === undefined
        ? ""
        : `<div class="flex items-center gap-1.5"><div class="h-1.5 w-14 overflow-hidden rounded-full bg-gray-200"><div class="h-full rounded-full" style="width:${Math.round(pct * 100)}%;background:${color}"></div></div><span class="text-[11px] tabular-nums text-gray-600">${PCT.fmtPct(pct, 0)}</span></div>`;

    const acciones = (idx) => `
      <td class="whitespace-nowrap px-1 text-right">
        <button data-acc="subir" ${idx === 0 ? "disabled" : ""} title="Subir" class="text-gray-400 hover:text-gray-800 disabled:opacity-30"><span class="material-symbols-outlined text-[16px]">arrow_upward</span></button>
        <button data-acc="bajar" ${idx === acts.length - 1 ? "disabled" : ""} title="Bajar" class="text-gray-400 hover:text-gray-800 disabled:opacity-30"><span class="material-symbols-outlined text-[16px]">arrow_downward</span></button>
        <button data-acc="insertar" title="Insertar actividad debajo" class="text-gray-400 hover:text-primary"><span class="material-symbols-outlined text-[16px]">playlist_add</span></button>
        <button data-acc="borrar" title="Eliminar" class="text-gray-400 hover:text-red-600"><span class="material-symbols-outlined text-[16px]">delete</span></button>
      </td>`;

    const pintarTabla = () => {
      const tbody = root.querySelector("#cr-filas");
      if (!acts.length) {
        tbody.innerHTML = `<tr><td colspan="17" class="px-4 py-10 text-center">
          <p class="text-sm text-gray-500">El cronograma está vacío.</p>
          <button type="button" id="cr-base" class="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Cargar cronograma base</button>
          <p class="mt-2 text-xs text-gray-400">Crea las fases de la plantilla (inicio y planeación, cortes, cierre) y una fase por cada capítulo de la cotización con compra → instalación → pruebas. Luego ajustas días y fechas.</p>
        </td></tr>`;
        tbody.querySelector("#cr-base").addEventListener("click", cargarBase);
        return;
      }
      const opcionesPred = (a) =>
        `<option value="">—</option>` +
        acts
          .filter((x) => x.tipo !== "fase" && x.id !== a.id)
          .map((x) => `<option value="${x.id}" ${x.id === a.predecesora_id ? "selected" : ""}>${calc.get(x.id).numero} · ${escapeHtml(x.nombre.slice(0, 40))}</option>`)
          .join("");
      const opcionesFrente = (a) =>
        `<option value="">—</option>` + capitulos().map((c) => `<option value="${c.id}" ${c.id === a.frente_item_id ? "selected" : ""}>${escapeHtml(((c.codigo ? c.codigo + " · " : "") + c.descripcion).slice(0, 40))}</option>`).join("");

      tbody.innerHTML = acts
        .map((a, idx) => {
          const c = calc.get(a.id);
          if (a.tipo === "fase") {
            return `<tr data-id="${a.id}" class="border-t border-gray-200 font-semibold" style="background:${c.color}14">
              <td class="px-2 py-1.5 text-xs" style="color:${c.color}">${c.numero}</td>
              <td class="px-1 py-1" colspan="7"><input data-f="nombre" value="${escapeHtml(a.nombre)}" class="${CELDA} font-bold uppercase" style="color:${c.color}" /></td>
              <td class="px-2 py-1 text-xs">${fechaCorta(c.inicio)}</td>
              <td class="px-2 py-1 text-xs">${fechaCorta(c.fin)}</td>
              <td colspan="3" class="px-2 py-1 text-[11px] font-normal text-gray-500">${c.dias ? `${c.dias} días` : "Sin actividades"}</td>
              <td class="px-2 py-1">${barra(c.pct, c.color)}</td>
              <td class="px-2 py-1">${badge(c.estado)}</td>
              <td class="px-2 py-1 text-right text-xs tabular-nums text-red-600">${c.atraso || ""}</td>
              ${acciones(idx)}
            </tr>`;
          }
          const esHito = a.tipo === "hito";
          return `<tr data-id="${a.id}" class="border-t border-gray-100">
            <td class="px-2 py-1 text-xs text-gray-500">${c.numero}</td>
            <td class="min-w-[220px] px-1 py-1"><input data-f="nombre" value="${escapeHtml(a.nombre)}" class="${CELDA}" /></td>
            <td class="min-w-[110px] px-1 py-1"><select data-f="tipo" class="${CELDA}">${TIPOS_ACT.map((t) => `<option value="${t}" ${t === a.tipo ? "selected" : ""}>${TIPOS[t]}</option>`).join("")}</select></td>
            <td class="min-w-[120px] px-1 py-1"><input data-f="responsable" value="${escapeHtml(a.responsable || "")}" class="${CELDA}" /></td>
            <td class="min-w-[150px] px-1 py-1"><select data-f="frente_item_id" class="${CELDA}">${opcionesFrente(a)}</select></td>
            <td class="min-w-[180px] px-1 py-1"><select data-f="predecesora_id" class="${CELDA}">${opcionesPred(a)}</select></td>
            <td class="min-w-[130px] px-1 py-1"><input data-f="inicio_fijo" type="date" value="${a.inicio_fijo || ""}" class="${CELDA}" /></td>
            <td class="min-w-[60px] px-1 py-1">${esHito ? `<span class="block px-1 text-right text-xs text-gray-400">0</span>` : `<input data-f="dias" type="number" min="1" step="1" value="${a.dias ?? 1}" class="${CELDA} text-right tabular-nums" />`}</td>
            <td class="whitespace-nowrap px-2 py-1 text-xs font-medium text-gray-800">${fechaCorta(c.inicio)}</td>
            <td class="whitespace-nowrap px-2 py-1 text-xs font-medium text-gray-800">${fechaCorta(c.fin)}</td>
            <td class="min-w-[130px] px-1 py-1"><input data-f="inicio_real" type="date" value="${a.inicio_real || ""}" class="${CELDA}" /></td>
            <td class="min-w-[130px] px-1 py-1"><input data-f="fin_real" type="date" value="${a.fin_real || ""}" class="${CELDA}" /></td>
            <td class="min-w-[70px] px-1 py-1"><input data-f="pct_manual" type="number" min="0" max="100" step="1" value="${a.pct_manual ?? ""}" placeholder="auto" class="${CELDA} text-right tabular-nums" /></td>
            <td class="px-2 py-1">${barra(c.pct, c.color)}</td>
            <td class="px-2 py-1">${badge(c.estado)}</td>
            <td class="px-2 py-1 text-right text-xs tabular-nums text-red-600">${c.atraso || ""}</td>
            ${acciones(idx)}
          </tr>`;
        })
        .join("");
    };

    // ------------------------------------------------------------------
    // Gantt (por semanas, de lunes a domingo)
    // ------------------------------------------------------------------
    const pintarGantt = () => {
      const cont = root.querySelector("#cr-gantt");
      const conFechas = acts.filter((a) => calc.get(a.id).inicio);
      if (!conFechas.length) {
        cont.innerHTML = `<p class="py-6 text-center text-sm text-gray-400">El Gantt aparece cuando haya actividades.</p>`;
        return;
      }
      const hoy = PCT.hoyISO();
      let desde = conFechas.map((a) => calc.get(a.id).inicio).sort()[0];
      let hasta = conFechas.map((a) => calc.get(a.id).fin).sort().at(-1);
      if (hoy < desde) desde = hoy;
      if (hoy > hasta) hasta = hoy;
      const d0 = aFecha(desde);
      desde = sumarDias(desde, -((d0.getDay() + 6) % 7)); // lunes de esa semana
      const semanas = Math.max(1, Math.ceil((diasEntre(desde, hasta) + 1) / 7));
      const totalDias = semanas * 7;
      // las semanas llenan el ancho disponible (mínimo 56 px cada una)
      const ANCHO_SEM = Math.max(56, Math.floor((cont.clientWidth - 256 - 8) / semanas));
      const anchoTotal = semanas * ANCHO_SEM;
      const x = (iso) => (diasEntre(desde, iso) / totalDias) * anchoTotal;

      const encSem = Array.from({ length: semanas }, (_, k) => {
        const lunes = sumarDias(desde, k * 7);
        const d = aFecha(lunes);
        const nuevoMes = k === 0 || d.getDate() <= 7;
        return `<div class="shrink-0 border-l border-gray-100 px-1 text-[10px] text-gray-500" style="width:${ANCHO_SEM}px">${nuevoMes ? `<b class="block text-gray-700">${d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "")}</b>` : `<span class="block">&nbsp;</span>`}${d.getDate()}</div>`;
      }).join("");
      const lineasSem = Array.from({ length: semanas }, (_, k) => `<div class="absolute top-0 bottom-0 border-l border-gray-100" style="left:${k * ANCHO_SEM}px"></div>`).join("");
      const lineaHoy = `<div class="absolute top-0 bottom-0 z-10 w-px bg-red-500" style="left:${x(hoy) + ANCHO_SEM / 14}px" title="Hoy"></div>`;

      const filas = acts
        .map((a) => {
          const c = calc.get(a.id);
          const etiqueta = `<div class="sticky left-0 z-20 w-64 shrink-0 truncate border-r border-gray-100 bg-white px-2 text-xs ${a.tipo === "fase" ? "font-bold" : "pl-4 text-gray-700"}" style="${a.tipo === "fase" ? `color:${c.color}` : ""}" title="${escapeHtml(a.nombre)}">${c.numero} · ${escapeHtml(a.nombre)}</div>`;
          let grafico = "";
          if (c.inicio) {
            const izq = x(c.inicio);
            const ancho = Math.max(((diasEntre(c.inicio, c.fin) + 1) / totalDias) * anchoTotal, 4);
            if (a.tipo === "hito") {
              grafico = `<div class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm leading-none" style="left:${izq + ANCHO_SEM / 14}px;color:${c.pct >= 1 ? "#059669" : c.estado === "Vencido" ? "#dc2626" : c.color}" title="${escapeHtml(a.nombre)} · ${formatoFecha(c.inicio)}">◆</div>`;
            } else {
              const alto = a.tipo === "fase" ? "h-2.5" : "h-4";
              grafico = `<div class="absolute top-1/2 ${alto} -translate-y-1/2 overflow-hidden rounded" style="left:${izq}px;width:${ancho}px;background:${c.color}33" title="${escapeHtml(a.nombre)} · ${formatoFecha(c.inicio)} → ${formatoFecha(c.fin)} · ${PCT.fmtPct(c.pct, 0)}">
                <div class="h-full" style="width:${Math.round((c.pct || 0) * 100)}%;background:${c.estado === "Atrasada" || c.estado === "Con atraso" ? "#dc2626" : c.color}"></div>
              </div>`;
            }
          }
          return `<div class="flex h-7 items-center border-t border-gray-50">${etiqueta}<div class="relative h-full shrink-0" style="width:${anchoTotal}px">${grafico}</div></div>`;
        })
        .join("");

      cont.innerHTML = `
        <div class="relative min-w-max">
          <div class="flex border-b border-gray-200 pb-1"><div class="sticky left-0 z-20 w-64 shrink-0 bg-white"></div><div class="flex">${encSem}</div></div>
          <div class="relative">
            <div class="pointer-events-none absolute top-0 bottom-0" style="left:16rem;width:${anchoTotal}px">${lineasSem}${lineaHoy}</div>
            ${filas}
          </div>
        </div>`;
    };

    const pintar = () => {
      calcular();
      pintarKpis();
      pintarTabla();
      pintarGantt();
    };

    // ------------------------------------------------------------------
    // Edición
    // ------------------------------------------------------------------
    const tbody = root.querySelector("#cr-filas");
    tbody.addEventListener("change", async (e) => {
      const inp = e.target;
      const tr = inp.closest("tr[data-id]");
      if (!tr || !inp.dataset.f) return;
      const a = acts.find((x) => x.id === tr.dataset.id);
      const campo = inp.dataset.f;
      let valor;
      if (campo === "dias") valor = Math.max(1, Math.round(PCT.num(inp.value)) || 1);
      else if (campo === "pct_manual") valor = inp.value.trim() === "" ? null : Math.min(100, Math.max(0, PCT.num(inp.value)));
      else if (campo === "nombre") {
        valor = inp.value.trim();
        if (!valor) {
          inp.value = a.nombre;
          return mostrarAviso("El nombre no puede quedar vacío.", "error");
        }
      } else valor = inp.value.trim() || null;
      // a dónde iba el usuario (para devolver el foco tras redibujar)
      const sig = document.activeElement?.closest?.("tr[data-id]") ? { id: document.activeElement.closest("tr[data-id]").dataset.id, f: document.activeElement.dataset.f } : null;
      const datos = { [campo]: valor };
      if (campo === "tipo" && valor === "hito") datos.dias = 0;
      if (campo === "tipo" && valor !== "hito" && !PCT.num(a.dias)) datos.dias = 1;
      const { error } = await window.sb.from("cronograma_actividades").update(datos).eq("id", a.id);
      if (error) return manejarError(error, "No se pudo guardar el cambio");
      Object.assign(a, datos);
      pintar();
      if (sig?.f) root.querySelector(`#cr-filas tr[data-id="${sig.id}"] [data-f="${sig.f}"]`)?.focus();
    });

    const ordenFinal = () => (acts.length ? Math.max(...acts.map((a) => PCT.num(a.orden))) + 1 : 1);
    const crear = async (fila) => {
      const { data, error } = await window.sb.from("cronograma_actividades").insert({ proyecto_id: pid, ...fila }).select().single();
      if (error) return manejarError(error, "No se pudo agregar");
      await cargar();
      pintar();
      const inp = root.querySelector(`#cr-filas tr[data-id="${data.id}"] [data-f="nombre"]`);
      if (inp) {
        inp.focus();
        inp.select();
      }
    };

    root.querySelectorAll("[data-nuevo]").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.nuevo === "fase") return crear({ tipo: "fase", nombre: "Nueva fase", dias: 0, orden: ordenFinal() });
        // la actividad nueva sigue a la última actividad
        const ultima = [...acts].reverse().find((a) => a.tipo !== "fase");
        crear({ tipo: "gestion", nombre: "Nueva actividad", dias: 1, orden: ordenFinal(), predecesora_id: ultima?.id || null });
      })
    );

    tbody.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-acc]");
      if (!btn) return;
      const a = acts.find((x) => x.id === btn.closest("tr[data-id]").dataset.id);
      const idx = acts.indexOf(a);
      const acc = btn.dataset.acc;
      if (acc === "subir" || acc === "bajar") {
        const otro = acts[idx + (acc === "subir" ? -1 : 1)];
        if (!otro) return;
        const [r1, r2] = await Promise.all([
          window.sb.from("cronograma_actividades").update({ orden: otro.orden }).eq("id", a.id),
          window.sb.from("cronograma_actividades").update({ orden: a.orden }).eq("id", otro.id),
        ]);
        if (r1.error || r2.error) return manejarError(r1.error || r2.error, "No se pudo mover");
        await cargar();
        return pintar();
      }
      if (acc === "insertar") {
        const sig = acts[idx + 1];
        const orden = sig ? (PCT.num(a.orden) + PCT.num(sig.orden)) / 2 : PCT.num(a.orden) + 1;
        return crear({ tipo: "gestion", nombre: "Nueva actividad", dias: 1, orden, predecesora_id: a.tipo !== "fase" ? a.id : null });
      }
      if (acc === "borrar") {
        const dependen = acts.filter((x) => x.predecesora_id === a.id).length;
        const ok = await PCT.confirmar(
          a.tipo === "fase" ? "Eliminar fase" : "Eliminar actividad",
          `¿Eliminar «${escapeHtml(a.nombre)}»?${a.tipo === "fase" ? " Sus actividades NO se borran: quedan en la fase anterior." : ""}${dependen ? ` ${dependen} actividad(es) la tienen como predecesora y quedarán sin predecesora.` : ""}`,
          "Eliminar",
          true
        );
        if (!ok) return;
        const { error } = await window.sb.from("cronograma_actividades").delete().eq("id", a.id);
        if (error) return manejarError(error, "No se pudo eliminar");
        await cargar();
        pintar();
      }
    });

    // ------------------------------------------------------------------
    // Cronograma base (como la plantilla v7, con un frente por capítulo)
    // ------------------------------------------------------------------
    let creandoBase = false;
    const cargarBase = async () => {
      // evita crearlo dos veces (doble clic o el botón pulsado mientras trabaja)
      if (creandoBase) return;
      creandoBase = true;
      const boton = root.querySelector("#cr-base");
      if (boton) {
        boton.disabled = true;
        boton.textContent = "Creando cronograma...";
      }
      const { count, error: errConteo } = await window.sb.from("cronograma_actividades").select("id", { count: "exact", head: true }).eq("proyecto_id", pid);
      if (errConteo || count > 0) {
        creandoBase = false;
        await cargar();
        pintar();
        if (errConteo) return manejarError(errConteo, "No se pudo crear el cronograma base");
        return mostrarAviso("Este proyecto ya tiene cronograma.", "info");
      }
      const filas = [];
      let orden = 0;
      const add = (f) => {
        orden += 1;
        const fila = { proyecto_id: pid, orden, dias: 1, ...f, _clave: f._clave || null, _pred: f._pred || null };
        filas.push(fila);
        return fila;
      };
      add({ tipo: "fase", nombre: "INICIO Y PLANEACIÓN", dias: 0 });
      add({ tipo: "hito", nombre: "Firma de contrato / orden de compra", responsable: "Gerencia", dias: 0, _clave: "firma" });
      add({ tipo: "hito", nombre: "Socialización del proyecto con el cliente", responsable: "Dir. proyectos", dias: 0, _clave: "social", _pred: "firma" });
      add({ tipo: "gestion", nombre: "Planeación, programación y pedidos iniciales", responsable: "Dir. proyectos", dias: 5, _clave: "plan", _pred: "social" });
      add({ tipo: "hito", nombre: "Acta de inicio de obra", responsable: "Dir. proyectos", dias: 0, _clave: "acta", _pred: "plan" });
      const caps = capitulos();
      const finesFrente = [];
      (caps.length ? caps : [{ id: null, descripcion: "FRENTE 1 (cambie el nombre)" }]).forEach((c, k) => {
        add({ tipo: "fase", nombre: c.descripcion.toUpperCase(), dias: 0 });
        add({ tipo: "compra", nombre: `Compra de materiales — ${c.descripcion}`, responsable: "Compras", dias: 10, frente_item_id: c.id, _clave: `compra${k}`, _pred: "acta" });
        add({ tipo: "instalacion", nombre: `Instalación — ${c.descripcion}`, responsable: "Contratista", dias: 15, frente_item_id: c.id, _clave: `inst${k}`, _pred: `compra${k}` });
        add({ tipo: "pruebas", nombre: `Pruebas / certificación — ${c.descripcion}`, responsable: "Técnico", dias: 3, frente_item_id: c.id, _clave: `prueba${k}`, _pred: `inst${k}` });
        finesFrente.push(`prueba${k}`);
      });
      add({ tipo: "fase", nombre: "CORTES Y FACTURACIÓN", dias: 0 });
      add({ tipo: "hito", nombre: "Acta de corte 1 al cliente", responsable: "Dir. proyectos", dias: 0, _pred: "acta" });
      add({ tipo: "fase", nombre: "CIERRE Y ENTREGA", dias: 0 });
      add({ tipo: "pruebas", nombre: "Pruebas integrales y capacitación al cliente", responsable: "Dir. proyectos", dias: 3, _clave: "integral", _pred: finesFrente.at(-1) });
      add({ tipo: "hito", nombre: "Entrega y acta de recibo final", responsable: "Dir. proyectos", dias: 0, _pred: "integral" });

      try {
        const limpias = filas.map(({ _clave, _pred, ...f }) => f);
        const { data, error } = await window.sb.from("cronograma_actividades").insert(limpias).select("id, orden");
        if (error) throw error;
        // enlazar predecesoras por clave
        const idPorOrden = new Map(data.map((d) => [d.orden, d.id]));
        const idPorClave = new Map(filas.filter((f) => f._clave).map((f) => [f._clave, idPorOrden.get(f.orden)]));
        const enlaces = filas.filter((f) => f._pred && idPorClave.get(f._pred)).map((f) => ({ id: idPorOrden.get(f.orden), pred: idPorClave.get(f._pred) }));
        for (const l of enlaces) {
          const { error: e2 } = await window.sb.from("cronograma_actividades").update({ predecesora_id: l.pred }).eq("id", l.id);
          if (e2) throw e2;
        }
        await cargar();
        pintar();
        mostrarAviso(`Cronograma base creado con ${filas.length} filas. Ajusta días, responsables y fechas.`, "exito");
      } catch (err) {
        manejarError(err, "No se pudo crear el cronograma base");
      } finally {
        creandoBase = false;
      }
    };

    // ------------------------------------------------------------------
    // PDF para el cliente: resumen, tabla de actividades y Gantt
    // ------------------------------------------------------------------
    const hexARgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const aclarar = (rgb, f) => rgb.map((c) => Math.round(c + (255 - c) * f));

    const descargarPdf = async () => {
      if (!acts.length) return mostrarAviso("El cronograma está vacío.", "error");
      if (!window.jspdf?.jsPDF) return mostrarAviso("No se pudo cargar el generador de PDF (revisa tu conexión).", "error");
      calcular();
      const pr = p();
      const emp = pr.empresas || {};
      const doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 30;
      const hoy = PCT.hoyISO();
      const logo = emp.logo_url && typeof imagenABase64 === "function" ? await imagenABase64(emp.logo_url) : null;

      const actividades = acts.filter((a) => a.tipo !== "fase").map((a) => calc.get(a.id));
      const inicio = actividades.map((c) => c.inicio).sort()[0];
      const fin = actividades.map((c) => c.fin).sort().at(-1);
      const finContr = pr.fecha_fin_estimada || null;

      // encabezado de cada página
      const encabezado = (titulo) => {
        if (logo) {
          try {
            doc.addImage(logo, M, 18, 70, 30, undefined, "FAST");
          } catch (e) {
            /* formato de logo no soportado */
          }
        }
        doc.setFont(undefined, "bold");
        doc.setFontSize(13);
        doc.text(titulo, logo ? M + 80 : M, 32);
        doc.setFont(undefined, "normal");
        doc.setFontSize(8.5);
        doc.text(`${pr.nombre || ""}${pr.clientes?.nombre ? " · " + pr.clientes.nombre : ""}${pr.numero_contrato ? " · Contrato " + pr.numero_contrato : ""}`, logo ? M + 80 : M, 44);
        doc.setFont(undefined, "bold");
        doc.text(emp.nombre || window.PCTRONIC_CONFIG?.NOMBRE_EMPRESA || "Pctronic Seguridad Electrónica", W - M, 30, { align: "right" });
        doc.setFont(undefined, "normal");
        doc.text(`Fecha de corte: ${formatoFecha(hoy)}`, W - M, 42, { align: "right" });
        doc.setDrawColor(220);
        doc.line(M, 54, W - M, 54);
      };
      const pie = () => {
        const n = doc.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) {
          doc.setPage(i);
          doc.setFontSize(7.5);
          doc.setTextColor(150);
          doc.text(`Página ${i} de ${n}`, W - M, H - 14, { align: "right" });
          doc.setTextColor(0);
        }
      };

      // ---- página 1: resumen + tabla ----
      encabezado("CRONOGRAMA DE OBRA");
      const resumen = [
        ["Inicio", inicio ? formatoFecha(inicio) : "—"],
        ["Fin proyectado", fin ? formatoFecha(fin) : "—"],
        ["Fin contractual", finContr ? formatoFecha(finContr) : "Sin definir"],
        ["Avance físico", PCT.fmtPct(PCT.avanceFisico().pct)],
        ["Hitos cumplidos", `${acts.filter((a) => a.tipo === "hito" && calc.get(a.id).estado === "Cumplido").length} / ${acts.filter((a) => a.tipo === "hito").length}`],
      ];
      const anchoCaja = (W - 2 * M - 4 * 8) / 5;
      resumen.forEach(([t, v], i) => {
        const x = M + i * (anchoCaja + 8);
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(x, 64, anchoCaja, 38, 4, 4, "F");
        doc.setFontSize(7.5);
        doc.setTextColor(110);
        doc.text(t.toUpperCase(), x + 8, 77);
        doc.setFontSize(12);
        doc.setTextColor(20);
        doc.setFont(undefined, "bold");
        doc.text(v, x + 8, 94);
        doc.setFont(undefined, "normal");
      });
      doc.setTextColor(0);

      const filasTabla = acts.map((a) => {
        const c = calc.get(a.id);
        return {
          a,
          c,
          celdas: [
            c.numero,
            a.nombre,
            a.tipo === "fase" ? "" : TIPOS[a.tipo],
            a.tipo === "fase" ? "" : a.responsable || "",
            c.inicio ? formatoFecha(c.inicio) : "",
            c.fin ? formatoFecha(c.fin) : "",
            c.dias === null || c.dias === undefined ? "" : String(c.dias),
            c.pct === null || c.pct === undefined ? "" : PCT.fmtPct(c.pct, 0),
            c.estado || "",
          ],
        };
      });
      doc.autoTable({
        startY: 112,
        margin: { left: M, right: M, top: 64 },
        head: [["ID", "Fase / actividad", "Tipo", "Responsable", "Inicio", "Fin", "Días", "Avance", "Estado"]],
        body: filasTabla.map((f) => f.celdas),
        styles: { fontSize: 7.5, cellPadding: 3, valign: "middle" },
        headStyles: { fillColor: [19, 91, 236], textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 62 }, 3: { cellWidth: 90 }, 4: { cellWidth: 62 }, 5: { cellWidth: 62 }, 6: { cellWidth: 34, halign: "right" }, 7: { cellWidth: 44, halign: "right" }, 8: { cellWidth: 68 } },
        didParseCell: (d) => {
          if (d.section !== "body") return;
          const f = filasTabla[d.row.index];
          if (f.a.tipo === "fase") {
            d.cell.styles.fontStyle = "bold";
            d.cell.styles.fillColor = aclarar(hexARgb(f.c.color), 0.85);
            d.cell.styles.textColor = hexARgb(f.c.color);
          }
          if (d.column.index === 8 && ["Atrasada", "Vencido", "Con atraso"].includes(f.c.estado)) d.cell.styles.textColor = [220, 38, 38];
          if (d.column.index === 8 && ["Terminada", "Cumplido"].includes(f.c.estado)) d.cell.styles.textColor = [5, 150, 105];
        },
        didDrawPage: (d) => {
          if (d.pageNumber > 1) encabezado("CRONOGRAMA DE OBRA");
        },
      });

      // ---- Gantt ----
      const conFechas = acts.filter((a) => calc.get(a.id).inicio);
      let desde = conFechas.map((a) => calc.get(a.id).inicio).sort()[0];
      let hasta = conFechas.map((a) => calc.get(a.id).fin).sort().at(-1);
      if (hoy < desde) desde = hoy;
      if (hoy > hasta) hasta = hoy;
      desde = sumarDias(desde, -((aFecha(desde).getDay() + 6) % 7)); // lunes
      const semanas = Math.max(1, Math.ceil((diasEntre(desde, hasta) + 1) / 7));
      const totalDias = semanas * 7;
      const IZQ = M + 190; // ancho de la columna de nombres
      const ANCHO = W - M - IZQ;
      const xDe = (iso) => IZQ + (diasEntre(desde, iso) / totalDias) * ANCHO;
      const ALTO_FILA = 15;
      const TOPE = 92;
      const filasPorPagina = Math.floor((H - TOPE - 40) / ALTO_FILA);

      const encabezadoGantt = (nFilas) => {
        doc.addPage();
        encabezado("DIAGRAMA DE GANTT");
        doc.setFontSize(7);
        doc.setTextColor(100);
        const paso = semanas > 26 ? 2 : 1; // si hay muchas semanas, etiqueta una sí y otra no
        for (let k = 0; k < semanas; k++) {
          const lunes = sumarDias(desde, k * 7);
          const x = IZQ + (k * 7 / totalDias) * ANCHO;
          doc.setDrawColor(235);
          doc.line(x, TOPE - 10, x, TOPE + nFilas * ALTO_FILA);
          if (k % paso === 0) {
            const d = aFecha(lunes);
            const mes = d.toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
            doc.text(k === 0 || d.getDate() <= 7 * paso ? `${d.getDate()} ${mes}` : String(d.getDate()), x + 2, TOPE - 14);
          }
        }
        doc.setTextColor(0);
      };

      for (let i = 0; i < acts.length; i += filasPorPagina) {
        const pagina = acts.slice(i, i + filasPorPagina);
        encabezadoGantt(pagina.length);
        pagina.forEach((a, k) => {
          const c = calc.get(a.id);
          const y = TOPE + k * ALTO_FILA;
          const rgb = hexARgb(c.color);
          if (a.tipo === "fase") {
            doc.setFillColor(...aclarar(rgb, 0.9));
            doc.rect(M, y, W - 2 * M, ALTO_FILA, "F");
          }
          doc.setFontSize(7.5);
          doc.setFont(undefined, a.tipo === "fase" ? "bold" : "normal");
          doc.setTextColor(...(a.tipo === "fase" ? rgb : [40, 40, 40]));
          const nombre = `${c.numero} · ${a.nombre}`;
          doc.text(doc.splitTextToSize(nombre, 180)[0], a.tipo === "fase" ? M + 2 : M + 8, y + 10);
          doc.setTextColor(0);
          doc.setFont(undefined, "normal");
          if (!c.inicio) return;
          const x0 = xDe(c.inicio);
          if (a.tipo === "hito") {
            const cx = x0 + ANCHO / totalDias / 2;
            const cy = y + ALTO_FILA / 2;
            const color = c.pct >= 1 ? [5, 150, 105] : c.estado === "Vencido" ? [220, 38, 38] : rgb;
            doc.setFillColor(...color);
            doc.lines([[4, 4], [-4, 4], [-4, -4], [4, -4]], cx, cy - 4, [1, 1], "F", true);
            return;
          }
          const ancho = Math.max(((diasEntre(c.inicio, c.fin) + 1) / totalDias) * ANCHO, 2);
          const alto = a.tipo === "fase" ? 5 : 8;
          const yb = y + (ALTO_FILA - alto) / 2;
          doc.setFillColor(...aclarar(rgb, 0.7));
          doc.rect(x0, yb, ancho, alto, "F");
          const atrasada = c.estado === "Atrasada" || c.estado === "Con atraso";
          doc.setFillColor(...(atrasada ? [220, 38, 38] : rgb));
          if (c.pct > 0) doc.rect(x0, yb, ancho * Math.min(1, c.pct), alto, "F");
        });
        // línea de hoy
        const xh = xDe(hoy) + ANCHO / totalDias / 2;
        doc.setDrawColor(220, 38, 38);
        doc.setLineWidth(0.8);
        doc.line(xh, TOPE - 6, xh, TOPE + pagina.length * ALTO_FILA);
        doc.setLineWidth(0.2);
        doc.setFontSize(6.5);
        doc.setTextColor(220, 38, 38);
        doc.text("Hoy", xh + 2, TOPE - 2);
        doc.setTextColor(0);
      }
      // leyenda
      doc.setFontSize(7);
      doc.setTextColor(110);
      doc.text("Barra clara = duración programada · barra oscura = avance · rojo = con atraso · rombo = hito (verde = cumplido)", M, H - 14);
      doc.setTextColor(0);

      pie();
      doc.save(`Cronograma_${(pr.nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.pdf`);
    };
    root.querySelector("#cr-pdf").addEventListener("click", () => descargarPdf().catch((err) => manejarError(err, "No se pudo generar el PDF")));

    root.querySelector("#cr-filas").innerHTML = `<tr><td colspan="17" class="py-6"><div class="skeleton h-10 rounded"></div></td></tr>`;
    try {
      await cargar();
    } catch (err) {
      return manejarError(err, "No se pudo cargar el cronograma");
    }
    pintar();
  };
})(window.PCT);
