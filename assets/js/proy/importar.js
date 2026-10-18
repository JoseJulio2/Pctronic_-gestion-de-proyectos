// ============================================================================
// PROYECTOS · importar desde Excel.
// Entiende tres formatos:
//   1) la COTIZACIÓN de Pctronic (hoja "Cotizador": encabezado con cliente y
//      referencia, ítems por secciones Suministro / Instalación y, abajo, los
//      totales con IVA pleno y con AIU). Es la plantilla que descarga la app.
//   2) la plantilla completa "PCT_Plantilla_Proyecto_v7" (hojas INICIO,
//      PRESUPUESTO y MANO DE OBRA), y
//   3) las hojas simples que exporta la propia app (cotización o costos).
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
    // número de serie de Excel (días desde 1899-12-30) cuando la celda no trae formato de fecha
    if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
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
  // ÍTEMS (cotización y costos)
  // --------------------------------------------------------------------
  const COLUMNAS = [
    ["tipo", (h) => h === "tipo"],
    ["codigo", (h) => h === "item" || h === "#" || h === "no." || h === "n°"],
    ["referencia", (h) => h === "referencia" || h === "ref."],
    ["descripcion", (h) => h === "descripcion"],
    ["marca", (h) => h === "marca"],
    ["unidad", (h) => h === "und" || h === "unidad"],
    ["cantidad", (h) => h === "cant." || h === "cant" || h === "cantidad"],
    ["tiempo_entrega", (h) => h.startsWith("tiempo de entrega")],
    ["observaciones", (h) => h.startsWith("observacion")],
    ["pu_venta", (h) => h === "pu venta" || h === "precio venta" || h === "pu venta ($)" || h === "precio unitario" || h === "valor unitario"],
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

  const ITEM_VACIO = {
    codigo: null, referencia: null, marca: null, unidad: null, cantidad: 0, tiempo_entrega: null, observaciones: null,
    pu_venta: 0, cu_material: 0, cu_mano_obra: 0, cu_transporte: 0, concepto_alquiler: null, cu_alquiler: 0, pu_contratista: null,
  };

  const TIPO_FILA = (t, tieneCant) => {
    const n = PCT.norm(t);
    if (n.startsWith("capit")) return "capitulo";
    if (n.startsWith("subcap")) return "subcapitulo";
    if (n.startsWith("item") || n === "") return tieneCant || n === "item" ? "item" : n === "" ? null : "item";
    return "item";
  };

  // Hoja de ítems: PRESUPUESTO (v7), la de la cotización o, si no, la primera.
  const hojaDeItems = (libro) =>
    buscarHoja(libro, "presupuesto") ||
    libro.SheetNames.find((n) => PCT.norm(n).startsWith("cotiza")) ||
    libro.SheetNames[0];

  // Texto de una celda sin espacios sobrantes ("" si es número o vacía)
  const textoCelda = (v) => (typeof v === "string" ? v.trim() : "");
  // ¿La fila marca el final de la tabla de ítems? (bloque de totales de la cotización)
  const esFinDeTabla = (f) =>
    f.some((c) => {
      const n = normEnc(c);
      return n.startsWith("total oferta") || n === "subtotal" || n.startsWith("total costo directo");
    });

  // Devuelve { items, origen, avisos }. `items` ya viene normalizado para la BD.
  PCT.parsearPresupuesto = (libro) => {
    const avisos = [];
    const hojaNombre = hojaDeItems(libro);
    const filas = filasDeHoja(libro, hojaNombre);
    if (!filas) throw new Error("El archivo no tiene hojas.");
    const enc = filaEncabezado(filas);
    if (!enc) {
      throw new Error(
        'No encontré la tabla de ítems: busco una fila de encabezados con "Descripción" y "Cant.". ¿Es la plantilla correcta?'
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
      if (esFinDeTabla(f)) break;
      const g = (k) => (mapa[k] === undefined ? "" : f[mapa[k]]);
      const descripcion = String(g("descripcion") ?? "").trim();
      if (descripcion.startsWith("#")) continue; // #REF!, #N/A... (filas rotas del Excel)
      const cantidad = aNumero(g("cantidad"));

      // Sin columna "Tipo" (formato cotización): una fila con un solo texto y
      // sin descripción ni cantidad es el título de una sección → capítulo.
      if (mapa.tipo === undefined && !descripcion && !cantidad) {
        const textos = f.map(textoCelda).filter(Boolean);
        if (textos.length === 1 && !textos[0].startsWith("#")) {
          items.push({ ...ITEM_VACIO, tipo: "capitulo", descripcion: textos[0] });
        }
        continue;
      }

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

      const txt = (k) => (tipo === "item" ? String(g(k) ?? "").trim() || null : null);
      items.push({
        tipo,
        codigo: String(g("codigo") ?? "").trim() || null,
        referencia: txt("referencia"),
        descripcion,
        marca: txt("marca"),
        unidad: tipo === "item" ? String(g("unidad") ?? "").trim() || "un" : null,
        cantidad: tipo === "item" ? cantidad : 0,
        tiempo_entrega: txt("tiempo_entrega"),
        observaciones: txt("observaciones"),
        pu_venta: tipo === "item" ? aNumero(g("pu_venta")) : 0,
        cu_material: tipo === "item" ? aNumero(g("cu_material")) : 0,
        cu_mano_obra: tipo === "item" ? aNumero(g("cu_mano_obra")) : 0,
        cu_transporte: tipo === "item" ? aNumero(g("cu_transporte")) : 0,
        concepto_alquiler: tipo === "item" ? String(g("concepto_alquiler") ?? "").trim() || null : null,
        cu_alquiler: tipo === "item" ? aNumero(g("cu_alquiler")) : 0,
        pu_contratista: tipo === "item" ? pu_contratista : null,
      });
    }
    if (!items.some((i) => i.tipo === "item")) avisos.push("La hoja no tiene ítems todavía.");
    if (puContratistaPorFila) avisos.push("Se leyeron también los precios del contratista de la hoja MANO DE OBRA.");
    return { items, hoja: hojaNombre, avisos };
  };

  // --------------------------------------------------------------------
  // ENCABEZADO Y TOTALES DE LA COTIZACIÓN (formato "Cotizador" de Pctronic)
  // --------------------------------------------------------------------
  // Las etiquetas pueden estar en cualquier columna ("Cliente:", "Fecha:"...);
  // el valor es la siguiente celda con contenido a la derecha.
  const etiquetaNorm = (v) => normEnc(v).replace(/[:.]+$/, "").trim();

  // Busca `pred(etiqueta)` en las filas [desde, hasta) y devuelve { fila, col }
  const buscarEtiqueta = (filas, pred, desde = 0, hasta = filas.length) => {
    for (let r = desde; r < Math.min(hasta, filas.length); r++) {
      const f = filas[r];
      for (let c = 0; c < f.length; c++) {
        if (typeof f[c] === "string" && pred(etiquetaNorm(f[c]))) return { fila: r, col: c };
      }
    }
    return null;
  };
  const valorDerecha = (filas, pos, maxSaltos = 4) => {
    if (!pos) return null;
    const f = filas[pos.fila];
    for (let c = pos.col + 1; c <= pos.col + maxSaltos && c < f.length; c++) {
      if (f[c] !== "" && f[c] !== null && f[c] !== undefined) return f[c];
    }
    return null;
  };
  // Primer número entre 0 y 1 a la derecha de la etiqueta (los % del bloque AIU)
  const porcentajeDerecha = (filas, pos) => {
    if (!pos) return null;
    const f = filas[pos.fila];
    for (let c = pos.col + 1; c < f.length; c++) {
      const n = typeof f[c] === "number" ? f[c] : NaN;
      if (n > 0 && n < 1) return Math.round(n * 100000) / 1000;
    }
    return null;
  };

  // Devuelve null si el libro no tiene el formato de cotización. Si lo tiene:
  // { proyecto, clienteNombre, contratistaNombre, tarifas, esquemas, descuento }
  // `esquemas` dice qué totales trae la cotización: { aiu: bool, iva: bool }.
  PCT.parsearEncabezadoCotizacion = (libro) => {
    const hoja = hojaDeItems(libro);
    const filas = filasDeHoja(libro, hoja);
    if (!filas) return null;
    const enc = filaEncabezado(filas);
    if (!enc || enc.mapa.tipo !== undefined) return null; // la v7 y lo exportado por la app traen "Tipo"
    const arriba = (pred) => valorDerecha(filas, buscarEtiqueta(filas, pred, 0, enc.fila));
    const abajo = (pred) => buscarEtiqueta(filas, pred, enc.fila + 1);
    const texto = (v) => (v === null || v === undefined ? "" : String(v).trim());

    const proyecto = {};
    const notas = [];
    const nombre = texto(arriba((l) => l === "descripcion" || l === "proyecto"));
    if (nombre) proyecto.nombre = nombre;
    const numero = texto(arriba((l) => l.startsWith("cotizacion no") || l === "cotizacion n°")) || texto(arriba((l) => l === "referencia"));
    if (numero) proyecto.numero_cotizacion = numero;
    const fecha = aFechaISO(arriba((l) => l === "fecha"));
    if (fecha) proyecto.fecha_cotizacion = fecha;
    const ciudad = texto(arriba((l) => l === "ciudad"));
    if (ciudad) proyecto.ciudad = ciudad;
    const clienteNombre = texto(arriba((l) => l === "cliente")) || null;

    const validez = aFechaISO(arriba((l) => l.startsWith("validez")));
    if (validez) notas.push(`Validez de la oferta: ${formatoFecha(validez)}`);
    [["atencion", "Atención"], ["correo", "Correo"], ["telefono", "Teléfono"]].forEach(([l, t]) => {
      const v = texto(arriba((x) => x === l));
      if (v) notas.push(`${t}: ${v}`);
    });

    // Bloque AIU
    const pA = porcentajeDerecha(filas, abajo((l) => l.startsWith("administracion")));
    const pI = porcentajeDerecha(filas, abajo((l) => l.startsWith("imprevistos")));
    const pU = porcentajeDerecha(filas, abajo((l) => l === "utilidad"));
    const pIvaU = porcentajeDerecha(filas, abajo((l) => l.startsWith("iva sobre utilidad")));
    // Bloque IVA pleno (suministros)
    const pIva = porcentajeDerecha(filas, abajo((l) => l === "iva"));
    const esquemas = { aiu: pA !== null || pU !== null, iva: pIva !== null };
    if (pA !== null) proyecto.administracion_porcentaje = pA;
    if (pI !== null) proyecto.imprevistos_porcentaje = pI;
    if (pU !== null) proyecto.utilidad_porcentaje = pU;
    if (pIvaU !== null || pIva !== null) proyecto.iva_porcentaje = pIvaU ?? pIva;
    if (esquemas.aiu && !esquemas.iva) proyecto.tipo_contrato = "aiu";
    if (esquemas.iva && !esquemas.aiu) proyecto.tipo_contrato = "iva";

    const posDesc = abajo((l) => l === "descuento");
    const descRaw = posDesc ? valorDerecha(filas, posDesc, 6) : null;
    const descuento = typeof descRaw === "number" ? descRaw : 0;

    // Condiciones comerciales y quién elaboró la oferta
    const formaPago = texto(valorDerecha(filas, abajo((l) => l === "forma de pago")));
    if (formaPago) {
      notas.push(`Forma de pago: ${formaPago}`);
      const m = formaPago.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+)?anticipo/i);
      if (m) proyecto.anticipo_porcentaje = aNumero(m[1]);
    }
    [["garantia equipos", "Garantía equipos"], ["otras garantias", "Otras garantías"]].forEach(([l, t]) => {
      const v = texto(valorDerecha(filas, abajo((x) => x === l)));
      if (v) notas.push(`${t}: ${v}`);
    });
    const elaboro = texto(valorDerecha(filas, abajo((l) => l === "nombre")));
    if (elaboro) proyecto.comercial_responsable = elaboro;
    const preventa = texto(valorDerecha(filas, abajo((l) => l === "preventa")));
    if (preventa) notas.push(`Preventa: ${preventa}`);
    if (notas.length) proyecto.notas = notas.join("\n");

    return { proyecto, clienteNombre, contratistaNombre: null, tarifas: [], esquemas, descuento };
  };

  // --------------------------------------------------------------------
  // PLANTILLA DE COTIZACIÓN para descargar (mismo formato que usa Pctronic)
  // --------------------------------------------------------------------
  PCT.descargarPlantillaCotizacion = () => {
    const filaItems = 13; // primera fila de ítems (en Excel, base 1)
    const ultimaItems = 80; // espacio para ítems antes de los totales
    const rango = `I${filaItems}:I${ultimaItems}`;
    const aoa = [];
    const poner = (fila, col, v) => {
      while (aoa.length < fila) aoa.push([]);
      aoa[fila - 1][col] = v;
    };
    const A = 0, B = 1, C = 2, D = 3, E = 4, F = 5, G = 6, H = 7, I = 8, J = 9;

    poner(1, A, "COTIZACIÓN");
    poner(2, C, window.PCTRONIC_CONFIG?.NOMBRE_EMPRESA || "Pctronic Seguridad Electrónica");
    poner(4, C, "Referencia:"); poner(4, H, "Atencion:");
    poner(5, C, "Descripcion:"); poner(5, D, "Nombre del proyecto"); poner(5, H, "Correo:");
    poner(6, C, "Fecha:"); poner(6, H, "Cliente:");
    poner(7, C, "Validez de la oferta:"); poner(7, H, "Telefono:");
    poner(8, C, "Cotizacion No."); poner(8, H, "Ciudad:");
    poner(10, A, "DETALLE");
    ["#", "REFERENCIA", "DESCRIPCIÓN", "CANT.", "UNIDAD", "TIEMPO DE ENTREGA", "MARCA", "Precio Unitario", "Subtotal", "Observaciones"].forEach((t, c) => poner(11, c, t));

    const ejemplo = [
      ["Suministro"],
      [1, "REF-001", "SUMINISTRO DE CÁMARA DOMO IP 4MP", 10, "UND", "10 días", "Marca", 850000],
      [2, "REF-002", "SUMINISTRO DE CABLE UTP CAT6", 300, "ML", "10 días", "Marca", 4500],
      ["Instalacion"],
      [3, "PCT.SERV.INST", "INSTALACIÓN DE CÁMARA DOMO IP 4MP", 10, "UND", "30 días", "PCTronic", 120000],
      [4, "PCT.SERV.INST", "INSTALACIÓN DE CABLE UTP CAT6", 300, "ML", "30 días", "PCTronic", 2000],
    ];
    let fila = filaItems - 1;
    ejemplo.forEach((e) => {
      if (e.length === 1) return poner(fila++, A, e[0]);
      e.forEach((v, c) => poner(fila, c, v));
      poner(fila, I, { f: `D${fila}*H${fila}` });
      fila++;
    });

    let t = ultimaItems + 2;
    poner(t++, A, "TOTAL OFERTA SUMINISTROS");
    const sub = t;
    poner(t, G, "SubTotal"); poner(t++, J, { f: `SUM(${rango})` });
    poner(t, G, "Descuento"); poner(t++, J, 0);
    poner(t, G, "SubTotal"); poner(t, J, { f: `J${sub}-(J${sub}*J${sub + 1})` }); t++;
    poner(t, G, "IVA"); poner(t, H, 0.19); poner(t, J, { f: `J${t - 1}*H${t}` }); t++;
    poner(t, G, "Total"); poner(t, J, { f: `J${t - 2}+J${t - 1}` }); t++;
    t++;
    poner(t++, A, "TOTAL OFERTA AIU INSTALACION");
    const cd = t;
    poner(t, G, "TOTAL COSTO DIRECTO OBRA"); poner(t++, J, { f: `SUM(${rango})` });
    poner(t, G, "ADMINISTRACIÓN"); poner(t, I, 0.1); poner(t, J, { f: `J${cd}*I${t}` }); t++;
    poner(t, G, "IMPREVISTOS"); poner(t, I, 0.03); poner(t, J, { f: `J${cd}*I${t}` }); t++;
    poner(t, G, "UTILIDAD"); poner(t, I, 0.05); poner(t, J, { f: `J${cd}*I${t}` }); t++;
    poner(t, G, "IVA SOBRE UTILIDAD"); poner(t, I, 0.19); poner(t, J, { f: `J${t - 1}*I${t}` }); t++;
    poner(t, G, "TOTAL"); poner(t, J, { f: `SUM(J${cd}:J${t - 1})` }); t++;
    t += 2;
    poner(t, B, "CONDICIONES COMERCIALES"); poner(t++, F, "ELABORADO POR:");
    poner(t, B, "GARANTIA EQUIPOS"); poner(t, C, "12 meses"); poner(t++, F, "NOMBRE");
    poner(t, B, "FORMA DE PAGO"); poner(t, C, "30% anticipo, saldo con actas parciales"); poner(t++, F, "CORREO");
    poner(t, B, "OTRAS GARANTIAS"); poner(t, C, "3 meses mano de obra"); poner(t++, F, "PREVENTA");
    poner(t, B, "MONEDA"); poner(t, C, "Peso Colombiano");

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [6, 16, 52, 8, 8, 14, 22, 14, 14, 18].map((wch) => ({ wch }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, ws, "Cotizador");
    XLSX.writeFile(libro, "Plantilla_Cotizacion_Pctronic.xlsx");
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
