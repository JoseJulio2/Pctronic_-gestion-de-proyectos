// ============================================================================
// PROYECTOS · importar desde Excel.
// Entiende dos formatos:
//   1) la plantilla completa "PCT_Plantilla_Proyecto_v7" (hojas INICIO,
//      PRESUPUESTO y MANO DE OBRA), y
//   2) la plantilla simple de una sola hoja que descarga la propia app.
// Los encabezados se buscan por NOMBRE (no por posición), así que si agregas o
// mueves una columna en el Excel la importación no se descuadra.
// ============================================================================
(function (PCT) {
  // --------------------------------------------------------------------
  // Lectura del archivo
  // --------------------------------------------------------------------
  PCT.leerLibroExcel = (file) =>
    new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
      lector.onload = (e) => {
        try {
          resolve(XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true }));
        } catch (err) {
          reject(new Error("El archivo no parece ser un Excel válido (.xlsx)."));
        }
      };
      lector.readAsArrayBuffer(file);
    });

  const filasDeHoja = (libro, nombre) => {
    const ws = libro.Sheets[nombre];
    return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: true }) : null;
  };
  const buscarHoja = (libro, nombreNorm) => libro.SheetNames.find((n) => PCT.norm(n) === nombreNorm) || null;
  // Encabezado normalizado: sin tildes, sin saltos de línea, espacios simples
  const normEnc = (s) => PCT.norm(s).replace(/\s+/g, " ");

  const aNumero = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim();
    if (!s) return 0;
    // "1.234.567,89" o "1,234,567.89" o "1234.5"
    const limpio = s.replace(/[^\d.,-]/g, "");
    if (limpio.includes(",") && limpio.includes(".")) {
      return limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? Number(limpio.replace(/\./g, "").replace(",", ".")) || 0
        : Number(limpio.replace(/,/g, "")) || 0;
    }
    if (limpio.includes(",")) return Number(limpio.replace(",", ".")) || 0;
    return Number(limpio) || 0;
  };

  const aFechaISO = (v) => {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v)) {
      const d = new Date(v.getTime() + 12 * 3600 * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  };

  // En Excel los % suelen venir como fracción (0,08 = 8 %).
  const aPorcentaje = (v) => {
    const n = aNumero(v);
    return n > 0 && n < 1 ? Math.round(n * 100000) / 1000 : n;
  };

  // --------------------------------------------------------------------
  // PRESUPUESTO
  // --------------------------------------------------------------------
  const COLUMNAS = [
    ["tipo", (h) => h === "tipo"],
    ["codigo", (h) => h === "item"],
    ["descripcion", (h) => h === "descripcion"],
    ["unidad", (h) => h === "und" || h === "unidad"],
    ["cantidad", (h) => h === "cant." || h === "cant" || h === "cantidad"],
    ["pu_venta", (h) => h === "pu venta" || h === "precio venta" || h === "pu venta ($)"],
    ["cu_material", (h) => h.startsWith("c.u. material") && !h.includes("con iva")],
    ["cu_mano_obra", (h) => h.startsWith("c.u. mano de obra")],
    ["cu_transporte", (h) => h.startsWith("c.u. transporte")],
    ["concepto_alquiler", (h) => h.startsWith("concepto")],
    ["cu_alquiler", (h) => h.startsWith("c.u. alquiler")],
    ["pu_contratista", (h) => h.includes("contratista") && h.startsWith("pu")],
  ];

  function mapearEncabezados(fila) {
    const mapa = {};
    fila.forEach((celda, idx) => {
      const h = normEnc(celda);
      if (!h) return;
      for (const [clave, pred] of COLUMNAS) {
        if (mapa[clave] === undefined && pred(h)) {
          mapa[clave] = idx;
          break;
        }
      }
    });
    return mapa;
  }

  function filaEncabezado(filas, maxBuscar = 25) {
    for (let r = 0; r < Math.min(filas.length, maxBuscar); r++) {
      const mapa = mapearEncabezados(filas[r]);
      if (mapa.descripcion !== undefined && mapa.cantidad !== undefined) return { fila: r, mapa };
    }
    return null;
  }

  const TIPO_FILA = (t, tieneCant) => {
    const n = PCT.norm(t);
    if (n.startsWith("capit")) return "capitulo";
    if (n.startsWith("subcap")) return "subcapitulo";
    if (n.startsWith("item") || n === "") return tieneCant || n === "item" ? "item" : n === "" ? null : "item";
    return "item";
  };

  // Devuelve { items, origen, avisos }. `items` ya viene normalizado para la BD.
  PCT.parsearPresupuesto = (libro) => {
    const avisos = [];
    const hojaNombre = buscarHoja(libro, "presupuesto") || libro.SheetNames[0];
    const filas = filasDeHoja(libro, hojaNombre);
    if (!filas) throw new Error("El archivo no tiene hojas.");
    const enc = filaEncabezado(filas);
    if (!enc) {
      throw new Error(
        'No encontré la tabla del presupuesto: busco una fila de encabezados con "Descripción" y "Cant.". ¿Es la plantilla correcta?'
      );
    }
    const { fila: filaEnc, mapa } = enc;

    // PU contratista vive en la hoja MANO DE OBRA (alineada fila a fila con PRESUPUESTO)
    let puContratistaPorFila = null;
    let moHoja = buscarHoja(libro, "mano de obra");
    if (mapa.pu_contratista === undefined && moHoja) {
      const filasMO = filasDeHoja(libro, moHoja);
      for (let r = 0; r < Math.min(filasMO.length, 30); r++) {
        const m = mapearEncabezados(filasMO[r]);
        if (m.pu_contratista !== undefined) {
          puContratistaPorFila = { filas: filasMO, desplazamiento: r - filaEnc, col: m.pu_contratista };
          break;
        }
      }
    }

    const items = [];
    for (let r = filaEnc + 1; r < filas.length; r++) {
      const f = filas[r];
      const g = (k) => (mapa[k] === undefined ? "" : f[mapa[k]]);
      const descripcion = String(g("descripcion") ?? "").trim();
      const cantidad = aNumero(g("cantidad"));
      const tipo = TIPO_FILA(g("tipo"), cantidad > 0);
      if (!descripcion || !tipo) continue;

      let pu_contratista = null;
      if (mapa.pu_contratista !== undefined) {
        const raw = g("pu_contratista");
        pu_contratista = raw === "" || raw === null ? null : aNumero(raw);
      } else if (puContratistaPorFila) {
        const fm = puContratistaPorFila.filas[r + puContratistaPorFila.desplazamiento];
        const raw = fm ? fm[puContratistaPorFila.col] : "";
        pu_contratista = raw === "" || raw === null || raw === undefined ? null : aNumero(raw);
      }

      items.push({
        tipo,
        codigo: String(g("codigo") ?? "").trim() || null,
        descripcion,
        unidad: tipo === "item" ? String(g("unidad") ?? "").trim() || "un" : null,
        cantidad: tipo === "item" ? cantidad : 0,
        pu_venta: tipo === "item" ? aNumero(g("pu_venta")) : 0,
        cu_material: tipo === "item" ? aNumero(g("cu_material")) : 0,
        cu_mano_obra: tipo === "item" ? aNumero(g("cu_mano_obra")) : 0,
        cu_transporte: tipo === "item" ? aNumero(g("cu_transporte")) : 0,
        concepto_alquiler: tipo === "item" ? String(g("concepto_alquiler") ?? "").trim() || null : null,
        cu_alquiler: tipo === "item" ? aNumero(g("cu_alquiler")) : 0,
        pu_contratista: tipo === "item" ? pu_contratista : null,
      });
    }
    if (!items.length) avisos.push("La hoja no tiene renglones de presupuesto todavía.");
    if (puContratistaPorFila) avisos.push("Se leyeron también los precios del contratista de la hoja MANO DE OBRA.");
    return { items, hoja: hojaNombre, avisos };
  };

  // --------------------------------------------------------------------
  // INICIO (datos y parámetros) — solo existe en la plantilla completa
  // --------------------------------------------------------------------
  const CAMPOS_INICIO = [
    ["nombre", (l) => l === "nombre del proyecto", "t"],
    ["_cliente", (l) => l === "cliente", "t"],
    ["ciudad", (l) => l === "ciudad", "t"],
    ["numero_cotizacion", (l) => l.startsWith("n") && l.includes("cotizacion"), "t"],
    ["fecha_cotizacion", (l) => l === "fecha de cotizacion", "d"],
    ["fecha_inicio", (l) => l.startsWith("fecha de inicio"), "d"],
    ["fecha_fin_estimada", (l) => l.startsWith("fecha fin"), "d"],
    ["director_proyecto", (l) => l.startsWith("director"), "t"],
    ["comercial_responsable", (l) => l.startsWith("comercial"), "t"],
    ["_contratista", (l) => l.startsWith("contratista"), "t"],
    ["_estado", (l) => l.startsWith("estado del proyecto"), "t"],
    ["administracion_porcentaje", (l) => l.startsWith("administracion"), "p"],
    ["imprevistos_porcentaje", (l) => l.startsWith("imprevistos"), "p"],
    ["utilidad_porcentaje", (l) => l.startsWith("utilidad"), "p"],
    ["iva_porcentaje", (l) => l === "iva", "p"],
    ["_iva_mat", (l) => l.includes("sumar iva"), "t"],
    ["anticipo_porcentaje", (l) => l.startsWith("anticipo pactado"), "p"],
    ["impuestos_porcentaje", (l) => l.startsWith("impuestos"), "p"],
    ["polizas_porcentaje", (l) => l.startsWith("polizas"), "p"],
    ["legales_porcentaje", (l) => l.startsWith("gastos legales"), "p"],
    ["recargo_hora_extra_porcentaje", (l) => l.startsWith("recargo hora extra"), "p"],
    ["anticipo_recibido", (l) => l.startsWith("anticipo recibido"), "n"],
  ];

  PCT.parsearInicio = (libro) => {
    const hoja = buscarHoja(libro, "inicio");
    if (!hoja) return null;
    const filas = filasDeHoja(libro, hoja);
    const res = {};
    // etiquetas en la columna B, valores en la C
    filas.forEach((f) => {
      const etiqueta = normEnc(f[1]);
      if (!etiqueta) return;
      const val = f[2];
      for (const [clave, pred, tipo] of CAMPOS_INICIO) {
        if (res[clave] !== undefined || !pred(etiqueta)) continue;
        if (val === "" || val === null || val === undefined) return;
        res[clave] = tipo === "d" ? aFechaISO(val) : tipo === "p" ? aPorcentaje(val) : tipo === "n" ? aNumero(val) : String(val).trim();
        return;
      }
    });

    const proyecto = {};
    Object.entries(res).forEach(([k, v]) => {
      if (!k.startsWith("_") && v !== null && v !== "") proyecto[k] = v;
    });
    if (res._iva_mat) proyecto.iva_materiales = PCT.norm(res._iva_mat).startsWith("s");
    const mapaEstado = {
      "en planeacion": "sin_iniciar",
      "en ejecucion": "en_curso",
      suspendido: "detenido",
      terminado: "finalizado",
      liquidado: "finalizado",
    };
    if (res._estado && mapaEstado[PCT.norm(res._estado)]) proyecto.estado = mapaEstado[PCT.norm(res._estado)];

    // tarifas de técnicos: bloque bajo el encabezado "Cargo" (columna G)
    const tarifas = [];
    const idxEnc = filas.findIndex((f) => normEnc(f[6]) === "cargo");
    if (idxEnc >= 0) {
      for (let r = idxEnc + 1; r <= idxEnc + 8 && r < filas.length; r++) {
        const cargo = String(filas[r][6] ?? "").trim();
        if (!cargo || PCT.norm(cargo).startsWith("valores de")) continue;
        tarifas.push({ cargo, valor_hora: aNumero(filas[r][7]), horas_dia: aNumero(filas[r][8]) || 8 });
      }
    }
    return { proyecto, clienteNombre: res._cliente || null, contratistaNombre: res._contratista || null, tarifas };
  };

  // --------------------------------------------------------------------
  // Guardar ítems en la BD (usado al crear el proyecto y en Presupuesto)
  // --------------------------------------------------------------------
  // `desde` = número de orden a partir del cual numerar.
  PCT.insertarItems = async (proyectoId, items, desde = 0, extra = {}) => {
    const filas = items.map((it, i) => ({ ...it, ...extra, proyecto_id: proyectoId, orden: desde + i + 1 }));
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await window.sb.from("presupuesto_items").insert(filas.slice(i, i + 200));
      if (error) throw error;
    }
    return filas.length;
  };
})(window.PCT);
