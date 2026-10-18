// ============================================================================
// PROYECTOS · importar desde Excel.
// Entiende tres formatos:
//   1) la COTIZACIÓN de Pctronic (hoja "Cotizador": encabezado con cliente y
//      referencia, ítems por secciones Suministro / Instalación y, abajo, los
//      totales con IVA pleno y con AIU). La app descarga ese mismo Excel
//      (docs/Plantilla_Cotizacion_Pctronic.xlsx) como plantilla.
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

  // La tabla termina en la primera celda vacía después de "Descripción": así
  // las columnas internas que algunas cotizaciones traen a la derecha
  // (Costo, Moneda, Tipo, Margen...) no se confunden con la tabla.
  // `mapa._fin` = índice de la última columna de la tabla.
  function mapearEncabezados(fila) {
    const mapa = {};
    let fin = fila.length - 1;
    for (let idx = 0; idx < fila.length; idx++) {
      const h = normEnc(fila[idx]);
      if (!h) {
        if (mapa.descripcion !== undefined) {
          fin = idx - 1;
          break;
        }
        continue;
      }
      for (const [clave, pred] of COLUMNAS) {
        if (mapa[clave] === undefined && pred(h)) {
          mapa[clave] = idx;
          break;
        }
      }
    }
    Object.defineProperty(mapa, "_fin", { value: fin, enumerable: false });
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
    // Títulos de sección: uno solo → capítulo. Dos seguidos (ej. "SISTEMA DE
    // DETECCIÓN" y luego "EQUIPOS") → capítulo + subcapítulo, y desde ahí los
    // títulos sueltos siguen siendo subcapítulos hasta el próximo par.
    let enSubcapitulos = false;
    const sinDescripcion = []; // # de los ítems que vinieron sin descripción
    for (let r = filaEnc + 1; r < filas.length; r++) {
      const f = filas[r];
      if (esFinDeTabla(f)) break;
      const g = (k) => (mapa[k] === undefined ? "" : f[mapa[k]]);
      let descripcion = String(g("descripcion") ?? "").replace(/\r\n?/g, "\n").trim();
      if (descripcion.startsWith("#")) continue; // #REF!, #N/A... (filas rotas del Excel)
      const cantidad = aNumero(g("cantidad"));

      // Sin columna "Tipo" (formato cotización): una fila con un solo texto
      // dentro de la tabla y sin descripción ni cantidad es un título de sección.
      if (mapa.tipo === undefined && !descripcion && !cantidad) {
        const textos = f.slice(0, mapa._fin + 1).map(textoCelda).filter(Boolean);
        if (textos.length === 1 && !textos[0].startsWith("#")) {
          const anterior = items[items.length - 1];
          let tipo = enSubcapitulos ? "subcapitulo" : "capitulo";
          if (anterior && anterior.tipo !== "item") {
            anterior.tipo = "capitulo";
            tipo = "subcapitulo";
            enSubcapitulos = true;
          }
          items.push({ ...ITEM_VACIO, tipo, descripcion: textos[0] });
        }
        continue;
      }

      // Ítem con cantidad pero sin descripción: se importa igual (si no, el
      // total quedaría corto) con un nombre provisional, y se avisa.
      if (!descripcion && cantidad > 0) {
        const codigo = String(g("codigo") ?? "").trim();
        const referencia = String(g("referencia") ?? "").trim();
        descripcion = `${referencia || (codigo ? "Ítem " + codigo : "Ítem")} (sin descripción)`;
        sinDescripcion.push(codigo || `fila ${r + 1}`);
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
    if (sinDescripcion.length) {
      avisos.push(
        `${sinDescripcion.length} ítem(s) venían sin descripción (${sinDescripcion.join(", ")}): se importaron con un nombre provisional. Ponles la descripción en la pestaña Cotización.`
      );
    }
    if (puContratistaPorFila) avisos.push("Se leyeron también los precios del contratista de la hoja MANO DE OBRA.");
    return { items, hoja: hojaNombre, avisos, columnas: Object.keys(mapa) };
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
  const valorDerecha = (filas, pos, maxSaltos = 4, maxCol = Infinity) => {
    if (!pos) return null;
    const f = filas[pos.fila];
    for (let c = pos.col + 1; c <= pos.col + maxSaltos && c <= maxCol && c < f.length; c++) {
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
    // solo dentro del ancho de la tabla (a la derecha puede haber columnas internas: TRM, monedas...)
    const arriba = (pred) => valorDerecha(filas, buscarEtiqueta(filas, pred, 0, enc.fila), 4, enc.mapa._fin);
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
  // PLANTILLA DE COTIZACIÓN para descargar: es el mismo Excel que usa
  // Pctronic (con logo, colores y fórmulas), guardado tal cual en docs/.
  // --------------------------------------------------------------------
  PCT.ARCHIVO_PLANTILLA_COTIZACION = "docs/Plantilla_Cotizacion_Pctronic.xlsx";
  PCT.descargarPlantillaCotizacion = () => {
    const a = document.createElement("a");
    a.href = PCT.ARCHIVO_PLANTILLA_COTIZACION;
    a.download = "Plantilla_Cotizacion_Pctronic.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // --------------------------------------------------------------------
  // EXPORTAR con la plantilla de cotización (conserva logo, colores y fórmulas)
  // --------------------------------------------------------------------
  // SheetJS (la versión gratuita) no conserva formato ni imágenes, así que para
  // escribir sobre la plantilla se usa ExcelJS, que se carga por CDN solo
  // cuando hace falta.
  const cargas = {};
  const cargarScript = (global, src) => {
    if (window[global]) return Promise.resolve();
    if (!cargas[src]) {
      cargas[src] = new Promise((ok, mal) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = ok;
        s.onerror = () => {
          delete cargas[src];
          mal(new Error("No se pudo cargar la herramienta de Excel. Revisa la conexión a internet."));
        };
        document.head.appendChild(s);
      });
    }
    return cargas[src];
  };
  // ExcelJS escribe sobre la plantilla; JSZip retoca el archivo final (logo).
  PCT.cargarExcelJS = () =>
    Promise.all([
      cargarScript("ExcelJS", "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"),
      cargarScript("JSZip", "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"),
    ]);

  // Llena la plantilla con el proyecto y sus ítems y la descarga.
  // conCostos: agrega a la derecha C.U. material, costo total y margen
  // (es la plantilla del Presupuesto de costos; se vuelve a importar igual).
  PCT.exportarCotizacionExcel = async (p, items, { conCostos = false } = {}) => {
    await PCT.cargarExcelJS();
    const resp = await fetch(PCT.ARCHIVO_PLANTILLA_COTIZACION, { cache: "no-cache" });
    if (!resp.ok) throw new Error("No se encontró la plantilla de cotización.");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await resp.arrayBuffer());
    const ws = wb.worksheets[0];
    ws.name = "Cotizador";
    const MAX_COL = 15;

    const textoDe = (cell) => {
      const v = cell.value;
      if (v && typeof v === "object") {
        if (v.richText) return v.richText.map((t) => t.text).join("");
        return String(v.result ?? v.text ?? "");
      }
      return String(v ?? "");
    };
    const etiqueta = (cell) => normEnc(textoDe(cell)).replace(/[:.]+$/, "").trim();
    const letra = (n) => ws.getColumn(n).letter;
    const clonar = (o) => JSON.parse(JSON.stringify(o || {}));

    // Fila de encabezados de la tabla y columnas por nombre
    let filaEnc = null;
    const col = {};
    for (let r = 1; r <= 60 && !filaEnc; r++) {
      const fila = Array.from({ length: MAX_COL }, (_, i) => textoDe(ws.getRow(r).getCell(i + 1)));
      const m = mapearEncabezados(fila);
      if (m.descripcion !== undefined && m.cantidad !== undefined) {
        filaEnc = r;
        Object.entries(m).forEach(([k, i]) => (col[k] = i + 1));
        col.subtotal = fila.findIndex((h) => normEnc(h).startsWith("subtotal")) + 1;
        col.ultima = m._fin + 1;
      }
    }
    if (!filaEnc || !col.subtotal) throw new Error("La plantilla no tiene la tabla de ítems esperada.");

    const buscarFinTabla = () => {
      for (let r = filaEnc + 1; r <= ws.rowCount; r++) {
        const fila = Array.from({ length: MAX_COL }, (_, i) => textoDe(ws.getRow(r).getCell(i + 1)));
        if (esFinDeTabla(fila)) return r;
      }
      return ws.rowCount + 1;
    };
    let filaTot = buscarFinTabla();

    // Estilos de muestra: primera fila de sección y primera fila de ítem
    let filaSec = null;
    let filaItem = null;
    // (en una fila combinada todas las celdas devuelven el texto de la primera,
    //  así que la sección se reconoce porque no tiene cantidad numérica)
    for (let r = filaEnc + 1; r < filaTot; r++) {
      const row = ws.getRow(r);
      const desc = textoDe(row.getCell(col.descripcion)).trim();
      const cant = row.getCell(col.cantidad).value;
      if (!filaItem && desc && typeof cant === "number") filaItem = r;
      if (!filaSec && typeof row.getCell(1).value === "string" && row.getCell(1).value.trim() && typeof cant !== "number") filaSec = r;
    }
    filaItem = filaItem || filaEnc + 2;
    filaSec = filaSec || filaItem;
    const estilos = (r) => Array.from({ length: MAX_COL }, (_, i) => clonar(ws.getRow(r).getCell(i + 1).style));
    const estiloItem = estilos(filaItem);
    const estiloSec = estilos(filaSec);
    const estiloEnc = estilos(filaEnc);
    const altoSec = ws.getRow(filaSec).height;

    // Quitar las celdas combinadas del área de ítems (se vuelven a combinar las secciones)
    Object.values(ws._merges).forEach((m) => {
      if (m.top > filaEnc && m.top < filaTot) ws.unMergeCells(m.top, m.left, m.bottom, m.right);
    });

    // Si no caben, se insertan filas antes de los totales
    const filasItems = items.length;
    const espacio = filaTot - filaEnc - 1;
    if (filasItems > espacio) {
      // ExcelJS corre las filas pero no las celdas combinadas ni las
      // referencias de las fórmulas: eso se corre aquí a mano.
      const delta = filasItems - espacio;
      const viejoTot = filaTot;
      const abajo = Object.values(ws._merges)
        .filter((m) => m.top >= viejoTot)
        .map((m) => ({ top: m.top, left: m.left, bottom: m.bottom, right: m.right }));
      abajo.forEach((m) => ws.unMergeCells(m.top, m.left, m.bottom, m.right));
      ws.spliceRows(viejoTot, 0, ...Array.from({ length: delta }, () => []));
      abajo.forEach((m) => ws.mergeCells(m.top + delta, m.left, m.bottom + delta, m.right));
      for (let r = viejoTot + delta; r <= ws.rowCount; r++) {
        ws.getRow(r).eachCell((cell) => {
          const v = cell.value;
          if (v && typeof v === "object" && typeof v.formula === "string") {
            cell.value = { formula: v.formula.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (m, c, n) => (+n >= viejoTot ? c + (+n + delta) : m)) };
          }
        });
      }
      filaTot = buscarFinTabla();
    }
    const primera = filaEnc + 1;
    const ultima = filaTot - 1;

    // Columnas de costo (solo en la plantilla de costos)
    const ivaMat = p.iva_materiales ? 1 + PCT.num(p.iva_porcentaje) / 100 : 1;
    const cc = conCostos
      ? { cu: col.ultima + 1, cuIva: col.ultima + 2, costo: col.ultima + 3, margen: col.ultima + 4, margenPct: col.ultima + 5 }
      : null;
    const ultimaCol = cc ? cc.margenPct : col.ultima;
    const fmtMoneda = estiloItem[col.pu_venta - 1]?.numFmt || "#,##0";

    // Escribir filas
    for (let r = primera; r <= ultima; r++) {
      const row = ws.getRow(r);
      const it = items[r - primera];
      for (let c = 1; c <= ultimaCol; c++) {
        const cell = row.getCell(c);
        cell.value = null;
        const base = it && it.tipo !== "item" ? estiloSec : estiloItem;
        cell.style = clonar(base[Math.min(c, col.ultima) - 1]);
      }
      row.height = undefined;
      if (!it) continue;

      if (it.tipo !== "item") {
        row.getCell(1).value = it.descripcion;
        ws.mergeCells(r, 1, r, col.ultima);
        if (altoSec) row.height = altoSec;
        continue;
      }

      const q = PCT.num(it.cantidad);
      const pu = PCT.num(it.pu_venta);
      const L = (k) => `${letra(k)}${r}`;
      const poner = (k, v) => {
        if (col[k]) row.getCell(col[k]).value = v === "" || v === undefined ? null : v;
      };
      const codigo = String(it.codigo ?? "").trim();
      poner("codigo", /^\d+$/.test(codigo) ? Number(codigo) : codigo || null);
      poner("referencia", it.referencia || null);
      poner("descripcion", it.descripcion);
      poner("cantidad", q);
      poner("unidad", it.unidad || null);
      poner("tiempo_entrega", it.tiempo_entrega || null);
      poner("marca", it.marca || null);
      poner("pu_venta", pu);
      poner("observaciones", [it.es_adicional ? "ADICIONAL" : "", it.observaciones || ""].filter(Boolean).join(" · ") || null);
      row.getCell(col.subtotal).value = { formula: `${L(col.cantidad)}*${L(col.pu_venta)}`, result: q * pu };

      if (cc) {
        const cu = PCT.num(it.cu_material);
        const cuIva = cu * ivaMat;
        row.getCell(cc.cu).value = cu;
        row.getCell(cc.cuIva).value = { formula: `${L(cc.cu)}*${ivaMat}`, result: cuIva };
        row.getCell(cc.costo).value = { formula: `${L(col.cantidad)}*${L(cc.cuIva)}`, result: q * cuIva };
        row.getCell(cc.margen).value = { formula: `${L(col.subtotal)}-${L(cc.costo)}`, result: q * pu - q * cuIva };
        row.getCell(cc.margenPct).value = {
          formula: `IF(${L(col.subtotal)}=0,"",${L(cc.margen)}/${L(col.subtotal)})`,
          result: q * pu ? (q * pu - q * cuIva) / (q * pu) : "",
        };
        [cc.cu, cc.cuIva, cc.costo, cc.margen].forEach((k) => (row.getCell(k).numFmt = fmtMoneda));
        row.getCell(cc.margenPct).numFmt = "0.0%";
      }

      // Alto según el largo de la descripción (Excel no lo ajusta solo)
      const ancho = Math.max(ws.getColumn(col.descripcion).width || 40, 10);
      const lineas = String(it.descripcion)
        .split("\n")
        .reduce((n, linea) => n + Math.max(1, Math.ceil(linea.length / (ancho * 1.1))), 0);
      if (lineas > 1) row.height = Math.min(409, 14 * lineas + 2);
    }

    // Encabezados de las columnas de costo y colores del margen
    if (cc) {
      const titulos = { cu: "C.U. material (sin IVA)", cuIva: "C.U. material (con IVA)", costo: "Costo total", margen: "Margen $", margenPct: "Margen %" };
      Object.entries(titulos).forEach(([k, t]) => {
        const cell = ws.getRow(filaEnc).getCell(cc[k]);
        cell.value = t;
        cell.style = clonar(estiloEnc[col.ultima - 1]);
        ws.getColumn(cc[k]).width = 16;
      });
      const rango = `${letra(cc.margen)}${primera}:${letra(cc.margenPct)}${ultima}`;
      ws.addConditionalFormatting({
        ref: rango,
        rules: [
          { type: "cellIs", operator: "greaterThan", formulae: ["0"], priority: 1, style: { font: { color: { argb: "FF16A34A" } } } },
          { type: "cellIs", operator: "lessThan", formulae: ["0"], priority: 2, style: { font: { color: { argb: "FFDC2626" } } } },
        ],
      });
    }

    // Totales: las sumas cubren toda el área de ítems; % de AIU e IVA del proyecto
    const subtotal = items.filter((i) => i.tipo === "item").reduce((s, i) => s + PCT.num(i.cantidad) * PCT.num(i.pu_venta), 0);
    const L_SUB = letra(col.subtotal);
    const reSuma = new RegExp(`SUM\\(${L_SUB}\\d+:${L_SUB}\\d+\\)`, "i");
    const fraccion = (v) => PCT.num(v) / 100;
    const porEtiqueta = {
      administracion: fraccion(p.administracion_porcentaje),
      imprevistos: fraccion(p.imprevistos_porcentaje),
      utilidad: fraccion(p.utilidad_porcentaje),
      "iva sobre utilidad": fraccion(p.iva_porcentaje),
      iva: fraccion(p.iva_porcentaje),
    };
    for (let r = filaTot; r <= Math.min(ws.rowCount, filaTot + 60); r++) {
      const row = ws.getRow(r);
      let pctCelda = null;
      for (let c = 1; c <= MAX_COL; c++) {
        const cell = row.getCell(c);
        const v = cell.value;
        if (v && typeof v === "object" && typeof v.formula === "string" && reSuma.test(v.formula)) {
          cell.value = { formula: v.formula.replace(reSuma, `SUM(${L_SUB}${primera}:${L_SUB}${ultima})`), result: subtotal };
        }
        const e = etiqueta(cell);
        const clave = Object.keys(porEtiqueta).find((k) => (k === "iva" ? e === "iva" : e.startsWith(k)));
        if (clave && !pctCelda) {
          // la celda del % es la primera a la derecha con un número entre 0 y 1
          for (let d = c + 1; d <= MAX_COL; d++) {
            const x = row.getCell(d);
            if (typeof x.value === "number" && x.value > 0 && x.value < 1) {
              x.value = porEtiqueta[clave];
              pctCelda = x;
              break;
            }
          }
        }
      }
      // "J152*19%" → que use la celda del %
      if (pctCelda) {
        row.eachCell((cell) => {
          const v = cell.value;
          if (v && typeof v === "object" && typeof v.formula === "string" && /\d+(\.\d+)?%/.test(v.formula)) {
            cell.value = { formula: v.formula.replace(/\d+(\.\d+)?%/, pctCelda.address) };
          }
        });
      }
    }

    // Encabezado de la cotización
    const ponerJunto = (pred, valor, desde = 1, hasta = filaEnc - 1) => {
      for (let r = desde; r <= hasta; r++) {
        for (let c = 1; c < MAX_COL; c++) {
          if (pred(etiqueta(ws.getRow(r).getCell(c)))) {
            ws.getRow(r).getCell(c + 1).value = valor;
            return true;
          }
        }
      }
      return false;
    };
    ponerJunto((l) => l === "referencia", p.numero_cotizacion || null);
    ponerJunto((l) => l === "descripcion", p.nombre || null);
    if (p.fecha_cotizacion) ponerJunto((l) => l === "fecha", new Date(`${p.fecha_cotizacion}T00:00:00Z`)); // ExcelJS toma las fechas en UTC
    ponerJunto((l) => l === "cliente", p.clientes?.nombre || null);
    ponerJunto((l) => l === "ciudad", p.ciudad || null);
    ["atencion", "correo", "telefono"].forEach((k) => ponerJunto((l) => l === k, null));
    // Condiciones comerciales (abajo)
    const deNotas = (t) => (String(p.notas || "").match(new RegExp(`^${t}:\\s*(.+)$`, "mi")) || [])[1] || null;
    const abajo = { desde: filaTot, hasta: ws.rowCount };
    if (p.comercial_responsable) ponerJunto((l) => l === "nombre", p.comercial_responsable, abajo.desde, abajo.hasta);
    if (deNotas("Preventa")) ponerJunto((l) => l === "preventa", deNotas("Preventa"), abajo.desde, abajo.hasta);
    if (deNotas("Forma de pago")) ponerJunto((l) => l === "forma de pago", deNotas("Forma de pago"), abajo.desde, abajo.hasta);

    // Resultados de las fórmulas del encabezado y de los totales, para que el
    // archivo se vea bien incluso donde no se recalcula (vista previa del
    // celular o del correo). Excel igual recalcula todo al abrir.
    const numCol = (letras) => ws.getColumn(letras).number;
    const serialExcel = (d) => (d.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
    const crudo = (addr) => {
      const v = ws.getCell(addr).value;
      if (v && typeof v === "object" && !(v instanceof Date)) return v.result ?? (v.richText ? textoDe(ws.getCell(addr)) : null);
      return v;
    };
    const numero = (addr) => {
      const v = crudo(addr);
      if (v instanceof Date) return serialExcel(v);
      return typeof v === "number" ? v : 0;
    };
    const evaluar = (formula) => {
      const f0 = formula.replace(/\$/g, "").trim();
      // referencias fuera de la tabla (columnas internas) → sin resultado
      const refs = f0.match(/\b[A-Z]{1,3}\d+\b/g) || [];
      if (refs.some((x) => numCol(x.replace(/\d+/, "")) > ultimaCol)) return undefined;
      if (/^[A-Z]{1,3}\d+$/.test(f0)) return crudo(f0) ?? undefined; // =D4
      const upper = f0.match(/^UPPER\((.*)\)$/i);
      if (upper) {
        return upper[1]
          .split("&")
          .map((t) => t.trim())
          .map((t) => (/^".*"$/.test(t) ? t.slice(1, -1) : String(crudo(t) ?? "")))
          .join("")
          .toUpperCase();
      }
      if (/^TODAY\(\)$/i.test(f0)) {
        const h = new Date();
        return serialExcel(new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())));
      }
      let f = f0.replace(/SUM\(([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)\)/gi, (_, c1, r1, c2, r2) => {
        let suma = 0;
        for (let rr = +r1; rr <= +r2; rr++) for (let k = numCol(c1); k <= numCol(c2); k++) suma += numero(`${letra(k)}${rr}`);
        return `(${suma})`;
      });
      f = f.replace(/(\d+(?:\.\d+)?)%/g, (_, n) => `(${n}/100)`);
      f = f.replace(/\b([A-Z]{1,3}\d+)\b/g, (_, a) => `(${numero(a)})`);
      if (!/^[\d.+\-*/()\seE]+$/.test(f)) return undefined;
      try {
        const x = Function(`"use strict";return (${f});`)();
        return Number.isFinite(x) ? x : undefined;
      } catch (e) {
        return undefined;
      }
    };
    const recalcular = (desde, hasta) => {
      for (let r = desde; r <= hasta; r++) {
        ws.getRow(r).eachCell((cell) => {
          const v = cell.value;
          if (v && typeof v === "object" && typeof v.formula === "string") {
            const res = evaluar(v.formula);
            cell.value = res === undefined ? { formula: v.formula } : { formula: v.formula, result: res };
          }
        });
      }
    };
    recalcular(1, filaEnc - 1);
    recalcular(filaTot, ws.rowCount);

    wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

    let buffer = await wb.xlsx.writeBuffer();
    // ExcelJS deja el logo con tamaño 0 en <a:xfrm>; Excel lo ignora pero la
    // vista previa de Mac y otros visores no lo dibujan. Se copia el tamaño real.
    try {
      const zip = await JSZip.loadAsync(buffer);
      const dibujos = Object.keys(zip.files).filter((n) => /^xl\/drawings\/[^/]+\.xml$/.test(n));
      for (const n of dibujos) {
        const xml = await zip.file(n).async("string");
        const arreglado = xml.replace(/<xdr:oneCellAnchor[\s\S]*?<\/xdr:oneCellAnchor>/g, (bloque) => {
          const colOff = (bloque.match(/<xdr:colOff>(\d+)<\/xdr:colOff>/) || [])[1] || "0";
          const rowOff = (bloque.match(/<xdr:rowOff>(\d+)<\/xdr:rowOff>/) || [])[1] || "0";
          const ext = bloque.match(/<xdr:ext cx="(\d+)" cy="(\d+)"\/>/);
          if (!ext) return bloque;
          return bloque.replace(/<a:xfrm><a:off x="0" y="0"\/><a:ext cx="0" cy="0"\/><\/a:xfrm>/, `<a:xfrm><a:off x="${colOff}" y="${rowOff}"/><a:ext cx="${ext[1]}" cy="${ext[2]}"/></a:xfrm>`);
        });
        if (arreglado !== xml) zip.file(n, arreglado);
      }
      buffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    } catch (e) {
      console.warn("No se pudo ajustar el logo del Excel:", e);
    }
    const nombre = `${conCostos ? "Costos" : "Cotizacion"}_${(p.nombre || "proyecto").replace(/[^\w\-]+/g, "_")}.xlsx`;
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { nombre, buffer };
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
