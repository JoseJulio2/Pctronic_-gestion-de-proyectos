// ============================================================================
// PROYECTOS · núcleo compartido (estado, carga de datos, cálculos y ayudas).
// Todo cuelga de window.PCT para que cada pestaña (Inicio, Cotización,
// Avance diario...) viva en su propio archivo sin necesidad de compilar nada.
// Las fórmulas replican las reglas de negocio de la plantilla de Excel v7.
// ============================================================================
window.PCT = window.PCT || {};

(function (PCT) {
  // --------------------------------------------------------------------
  // Estado en memoria del proyecto abierto
  // --------------------------------------------------------------------
  PCT.estado = {
    proyecto: null,
    items: [], // presupuesto_items ordenados (Cotización + costos)
    ejec: new Map(), // presupuesto_item_id -> fila de v_item_ejecucion
    tarifas: [], // tarifas_tecnicos
    finanzas: { cdCortado: 0, gastado: 0 }, // para el margen bruto actual
  };
  PCT.catalogos = { empresas: [], clientes: [], contratistas: [] };

  // --------------------------------------------------------------------
  // Mini bus de eventos (para que una pestaña avise a las demás)
  // --------------------------------------------------------------------
  const oyentes = {};
  PCT.on = (evento, fn) => ((oyentes[evento] = oyentes[evento] || []).push(fn), fn);
  PCT.emit = (evento, datos) => (oyentes[evento] || []).forEach((fn) => fn(datos));

  // --------------------------------------------------------------------
  // Utilidades numéricas / de texto
  // --------------------------------------------------------------------
  PCT.num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  PCT.fmtCant = (n) => PCT.num(n).toLocaleString("es-CO", { maximumFractionDigits: 2 });
  PCT.fmtPct = (frac, dec = 1) =>
    frac === null || frac === undefined || !Number.isFinite(frac)
      ? "—"
      : (frac * 100).toLocaleString("es-CO", { maximumFractionDigits: dec }) + "%";
  PCT.hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  PCT.debounce = (fn, ms = 600) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  // Quita tildes y pasa a minúscula (para comparar encabezados / nombres)
  PCT.norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();

  // --------------------------------------------------------------------
  // Carga de datos
  // --------------------------------------------------------------------
  PCT.cargarCatalogos = async () => {
    const sb = window.sb;
    const [e, c, k] = await Promise.all([
      sb.from("empresas").select("id, nombre, nit, direccion, telefono, email, logo_url").order("nombre"),
      sb.from("clientes").select("id, nombre").order("nombre"),
      sb.from("contratistas").select("id, nombre, porcentaje_retencion").order("nombre"),
    ]);
    if (e.error) throw e.error;
    if (c.error) throw c.error;
    if (k.error) throw k.error;
    PCT.catalogos = { empresas: e.data || [], clientes: c.data || [], contratistas: k.data || [] };
    return PCT.catalogos;
  };

  const SELECT_PROYECTO =
    "*, clientes(nombre), empresas(nombre, nit, direccion, telefono, email, logo_url), " +
    "contratista:contratistas!contratista_principal_id(nombre, porcentaje_retencion)";

  PCT.recargarProyecto = async () => {
    const id = PCT.estado.proyecto.id;
    const { data, error } = await window.sb.from("proyectos").select(SELECT_PROYECTO).eq("id", id).single();
    if (error) throw error;
    PCT.estado.proyecto = data;
    return data;
  };

  PCT.recargarItems = async () => {
    const id = PCT.estado.proyecto.id;
    const { data, error } = await window.sb
      .from("presupuesto_items")
      .select("*")
      .eq("proyecto_id", id)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    PCT.estado.items = data || [];
    return PCT.estado.items;
  };

  PCT.recargarEjec = async () => {
    const id = PCT.estado.proyecto.id;
    const { data, error } = await window.sb.from("v_item_ejecucion").select("*").eq("proyecto_id", id);
    if (error) throw error;
    PCT.estado.ejec = new Map((data || []).map((r) => [r.presupuesto_item_id, r]));
    return PCT.estado.ejec;
  };

  PCT.recargarTarifas = async () => {
    const id = PCT.estado.proyecto.id;
    const { data, error } = await window.sb
      .from("tarifas_tecnicos")
      .select("*")
      .eq("proyecto_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    PCT.estado.tarifas = data || [];
    return PCT.estado.tarifas;
  };

  // Lo facturado sale de los cortes de cliente; lo gastado, de Gastos.
  PCT.recargarFinanzas = async () => {
    const id = PCT.estado.proyecto.id;
    const [c, g] = await Promise.all([
      // solo cortes ya facturados o pagados (un corte "pendiente" aún no se ha facturado)
      window.sb
        .from("cortes_cliente_items")
        .select("cantidad, pu_venta_snapshot, corte:cortes_cliente!inner(proyecto_id, estado)")
        .eq("corte.proyecto_id", id)
        .in("corte.estado", ["facturado", "pagado"]),
      window.sb.from("gastos").select("valor_total").eq("proyecto_id", id),
    ]);
    if (c.error) throw c.error;
    if (g.error) throw g.error;
    PCT.estado.finanzas = {
      cdCortado: (c.data || []).reduce((s, x) => s + PCT.num(x.cantidad) * PCT.num(x.pu_venta_snapshot), 0),
      gastado: (g.data || []).reduce((s, x) => s + PCT.num(x.valor_total), 0),
    };
    return PCT.estado.finanzas;
  };

  PCT.cargarTodo = async (proyectoId) => {
    const { data, error } = await window.sb.from("proyectos").select(SELECT_PROYECTO).eq("id", proyectoId).single();
    if (error) throw error;
    PCT.estado.proyecto = data;
    await Promise.all([PCT.recargarItems(), PCT.recargarEjec(), PCT.recargarTarifas(), PCT.recargarFinanzas()]);
  };

  // --------------------------------------------------------------------
  // CÁLCULOS · ítems (Cotización y Presupuesto de costos)
  // --------------------------------------------------------------------
  // Costos de un ítem. Material con IVA solo si el proyecto lo indica
  // (en AIU el IVA de las compras es costo).
  // El Presupuesto de costos maneja SOLO material/equipos (decisión de Jose,
  // oct. 2026): la mano de obra se presupuesta en la Fase 3 (pestaña Mano de
  // obra) y transporte/alquiler salen de Gastos. Por eso el costo total del
  // ítem es solo el material; los campos cu_mano_obra, cu_transporte y
  // cu_alquiler siguen en la BD pero ya no se usan aquí.
  PCT.calcItem = (i, p = PCT.estado.proyecto) => {
    if (!i || i.tipo !== "item") return null;
    const q = PCT.num(i.cantidad);
    const ivaMat = p?.iva_materiales ? 1 + PCT.num(p.iva_porcentaje) / 100 : 1;
    const cuMatIva = PCT.num(i.cu_material) * ivaMat;
    const cuTotal = cuMatIva;
    const totalVenta = q * PCT.num(i.pu_venta);
    const costoTotal = q * cuTotal;
    const margen = totalVenta - costoTotal;
    return {
      cuMatIva,
      cuTotal,
      totalVenta,
      totMaterial: q * cuMatIva,
      totMO: q * PCT.num(i.cu_mano_obra),
      totTransp: q * PCT.num(i.cu_transporte),
      totAlq: q * PCT.num(i.cu_alquiler),
      costoTotal,
      margen,
      margenPct: totalVenta ? margen / totalVenta : null,
      totContratista: i.pu_contratista === null || i.pu_contratista === undefined ? null : q * PCT.num(i.pu_contratista),
    };
  };

  // Totales de la cotización y de los costos: contrato base (sin adicionales) y adicionales aparte.
  PCT.resumenPresupuesto = (items = PCT.estado.items, p = PCT.estado.proyecto) => {
    const vacio = () => ({ venta: 0, material: 0, mo: 0, transp: 0, alq: 0, costo: 0, margen: 0, n: 0 });
    const base = vacio();
    const adic = vacio();
    items.forEach((i) => {
      const c = PCT.calcItem(i, p);
      if (!c) return;
      const t = i.es_adicional ? adic : base;
      t.venta += c.totalVenta;
      t.material += c.totMaterial;
      t.mo += c.totMO;
      t.transp += c.totTransp;
      t.alq += c.totAlq;
      t.costo += c.costoTotal;
      t.margen += c.margen;
      t.n += 1;
    });
    return { base, adic };
  };

  // --------------------------------------------------------------------
  // CÁLCULOS · hoja INICIO (valor del contrato, AIU, anticipo)
  // --------------------------------------------------------------------
  // `cd` = costo directo = subtotal de la cotización. Por defecto el que mantiene la base de datos.
  PCT.contrato = (p = PCT.estado.proyecto, cd = null) => {
    const base = cd === null ? PCT.num(p.valor_antes_impuestos) : cd;
    const aiu = p.tipo_contrato === "aiu";
    const admin = aiu ? base * (PCT.num(p.administracion_porcentaje) / 100) : 0;
    const imprev = aiu ? base * (PCT.num(p.imprevistos_porcentaje) / 100) : 0;
    const util = aiu ? base * (PCT.num(p.utilidad_porcentaje) / 100) : 0;
    const iva = aiu ? util * (PCT.num(p.iva_porcentaje) / 100) : base * (PCT.num(p.iva_porcentaje) / 100);
    const ingreso = base + admin + imprev + util; // sin IVA
    const total = ingreso + iva;
    return {
      cd: base,
      admin,
      imprev,
      util,
      iva,
      ingreso,
      total,
      anticipo: total * (PCT.num(p.anticipo_porcentaje) / 100),
    };
  };

  // Acta de cobro de un conjunto de cantidades (hoja CORTES CLIENTE):
  // CD del corte → A, I, U, IVA → total acta → amortización de anticipo → neto.
  PCT.acta = (cdCorte, p = PCT.estado.proyecto) => {
    const c = PCT.contrato(p, cdCorte);
    const amortizacion = -c.total * (PCT.num(p.anticipo_porcentaje) / 100);
    return { ...c, amortizacion, neto: c.total + amortizacion };
  };

  // --------------------------------------------------------------------
  // CÁLCULOS · margen bruto actual = facturado − gastado
  // --------------------------------------------------------------------
  // Facturado = ingreso sin IVA de los cortes de cliente facturados o pagados (CD del corte
  // con A+I+U en AIU; el IVA no es ingreso). Gastado = todo lo registrado en
  // Gastos (única fuente del dinero que sale).
  PCT.margenActual = (p = PCT.estado.proyecto, f = PCT.estado.finanzas) => {
    const facturado = PCT.contrato(p, PCT.num(f.cdCortado)).ingreso;
    const gastado = PCT.num(f.gastado);
    const margen = facturado - gastado;
    return { facturado, gastado, margen, pct: facturado ? margen / facturado : null };
  };

  // --------------------------------------------------------------------
  // CÁLCULOS · avance físico real (desde Avance diario, NO desde cortes)
  // --------------------------------------------------------------------
  PCT.ejecItem = (itemId) =>
    PCT.estado.ejec.get(itemId) || {
      cant_ejecutada: 0,
      cant_ejecutada_contratista: 0,
      cant_ejecutada_propio: 0,
      cant_cortada_cliente: 0,
      cant_cortada_mo: 0,
      pendiente_cortar_cliente: 0,
      pendiente_cortar_mo: 0,
    };

  // Replica en el navegador lo que calcula el trigger de la base de datos:
  // valor ejecutado (con tope en la cantidad contratada de cada ítem) sobre el
  // costo directo del contrato base. Los adicionales se reportan aparte.
  PCT.avanceFisico = (items = PCT.estado.items) => {
    let cd = 0;
    let ejecBase = 0;
    let ejecAdic = 0;
    items.forEach((i) => {
      if (i.tipo !== "item") return;
      const e = PCT.num(PCT.ejecItem(i.id).cant_ejecutada);
      if (i.es_adicional) {
        ejecAdic += e * PCT.num(i.pu_venta);
      } else {
        cd += PCT.num(i.cantidad) * PCT.num(i.pu_venta);
        ejecBase += Math.min(e, PCT.num(i.cantidad)) * PCT.num(i.pu_venta);
      }
    });
    return { cd, ejecBase, ejecAdic, pct: cd ? Math.min(1, ejecBase / cd) : 0 };
  };

  // Avance de un capítulo (para vincular con el cronograma): valor ejecutado /
  // valor del capítulo, recorriendo los ítems que le siguen hasta el próximo
  // capítulo.
  PCT.avanceDeCapitulo = (capituloId, items = PCT.estado.items) => {
    let dentro = false;
    let total = 0;
    let ejec = 0;
    for (const i of items) {
      if (i.tipo === "capitulo") {
        if (dentro) break;
        dentro = i.id === capituloId;
        continue;
      }
      if (!dentro || i.tipo !== "item" || i.es_adicional) continue;
      total += PCT.num(i.cantidad) * PCT.num(i.pu_venta);
      ejec += Math.min(PCT.num(PCT.ejecItem(i.id).cant_ejecutada), PCT.num(i.cantidad)) * PCT.num(i.pu_venta);
    }
    return total ? ejec / total : 0;
  };

  // --------------------------------------------------------------------
  // Modal sencillo reutilizable
  // --------------------------------------------------------------------
  // PCT.modal({ titulo, html, ancho, botones: [{ texto, clase, onClick }] })
  // devuelve { el, cerrar }. Si onClick devuelve false, el modal no se cierra.
  PCT.modal = ({ titulo, html, ancho = "max-w-lg", botones = [] }) => {
    const fondo = document.createElement("div");
    fondo.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4";
    fondo.innerHTML = `
      <div class="max-h-[90vh] w-full ${ancho} overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h3 class="mb-3 text-base font-bold text-gray-900">${escapeHtml(titulo || "")}</h3>
        <div class="modal-cuerpo text-sm text-gray-700">${html || ""}</div>
        <div class="modal-botones mt-5 flex flex-wrap justify-end gap-2"></div>
      </div>`;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    const cont = fondo.querySelector(".modal-botones");
    botones.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.texto;
      btn.className =
        b.clase ||
        "rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50";
      btn.addEventListener("click", async () => {
        const r = b.onClick ? await b.onClick({ el: fondo, cerrar }) : undefined;
        if (r !== false) cerrar();
      });
      cont.appendChild(btn);
    });
    return { el: fondo, cerrar };
  };
  PCT.BTN_PRIMARIO = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700";

  // --------------------------------------------------------------------
  // Panel de indicadores: un solo recuadro con divisiones finas. Las celdas
  // se reparten el ancho (flex) y, si no caben, pasan a otra fila ocupando
  // todo el ancho, sin dejar huecos. Se usa en todas las pestañas.
  // --------------------------------------------------------------------
  PCT.CLASE_PANEL_KPIS = "flex flex-wrap gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200";
  PCT.CLASE_CELDA_KPI = "min-w-[160px] flex-1 bg-white px-4 py-3";
  PCT.tarjetaKpi = (titulo, valor, sub = "", claseValor = "text-gray-900") => `
    <div class="${PCT.CLASE_CELDA_KPI}">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">${titulo}</p>
      <p class="mt-1 text-lg font-bold tabular-nums ${claseValor}">${valor}</p>
      ${sub ? `<p class="mt-0.5 text-[11px] leading-snug text-gray-400">${sub}</p>` : ""}
    </div>`;
  PCT.BTN_PELIGRO = "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700";

  // Confirmación con el modal (devuelve una promesa de true/false)
  PCT.confirmar = (titulo, mensaje, textoOk = "Aceptar", peligro = false) =>
    new Promise((resolve) => {
      PCT.modal({
        titulo,
        html: `<p>${mensaje}</p>`,
        botones: [
          { texto: "Cancelar", onClick: () => resolve(false) },
          { texto: textoOk, clase: peligro ? PCT.BTN_PELIGRO : PCT.BTN_PRIMARIO, onClick: () => resolve(true) },
        ],
      });
    });
})(window.PCT);
