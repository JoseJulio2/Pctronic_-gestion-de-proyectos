// ============================================================================
// Generación de PDF de "Acta de Corte" (variante cliente y variante
// contratista) usando jsPDF + jspdf-autotable, cargados desde cdnjs.
// ============================================================================

async function imagenABase64(url) {
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error("No se pudo descargar la imagen");
    const blob = await respuesta.blob();
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(lector.result);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("No se pudo cargar el logo para el PDF:", e);
    return null;
  }
}

// Cantidad acumulada ejecutada de un renglón hasta (e incluyendo) el corte
// dado, sumando todos los cortes con numero_corte <= corte.numero_corte.
// itemTipo: 'cotizacion' (Corte de Obra, campo cotizacion_item_id) |
// 'mano_obra' (Corte de Contratista, campo presupuesto_item_id).
function _acumuladoHastaPdf(itemId, itemTipo, corte, todosLosCortes) {
  const campo = itemTipo === "cotizacion" ? "cotizacion_item_id" : "presupuesto_item_id";
  return (todosLosCortes || [])
    .filter((c) => c.numero_corte <= corte.numero_corte)
    .reduce((acc, c) => {
      const item = (c.ejecucion_items || []).find((i) => i.item_tipo === itemTipo && i[campo] === itemId);
      return acc + Number(item?.cantidad_periodo || 0);
    }, 0);
}

// options: { proyecto, corte, todosLosCortes, items (normalizados: id, descripcion,
// unidad, cantidad, valor_unitario, valor_total), itemTipo: 'cotizacion'|'mano_obra',
// valorContratoTotal, variante: 'cliente'|'contratista', contratistaId, contratistasCache }
async function generarActaCortePDF(options) {
  const { proyecto, corte, todosLosCortes, items, itemTipo, valorContratoTotal, variante, contratistaId, contratistasCache } = options;

  if (!window.jspdf || !window.jspdf.jsPDF) {
    return mostrarAviso("No se pudo cargar el generador de PDF (revisa tu conexión)", "error");
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margenIzq = 40;
  let y = 40;

  const empresaNombre = proyecto.empresas?.nombre || "Pctronic Seguridad Electrónica";
  const logoUrl = proyecto.empresas?.logo_url;
  if (logoUrl) {
    const dataUrl = await imagenABase64(logoUrl);
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, "PNG", margenIzq, y, 55, 55);
      } catch (e) {
        console.warn("No se pudo insertar el logo en el PDF:", e);
      }
    }
  }

  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text(empresaNombre, margenIzq + 65, y + 14);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text(`Proyecto: ${proyecto.nombre}`, margenIzq + 65, y + 30);
  doc.text(`Cliente: ${proyecto.clientes?.nombre || "—"}`, margenIzq + 65, y + 44);

  y += 75;

  const titulo =
    variante === "contratista"
      ? `Acta de Corte de Contratista N° ${corte.numero_corte}`
      : `Acta de Corte N° ${corte.numero_corte}`;
  doc.setFontSize(15);
  doc.setFont(undefined, "bold");
  doc.text(titulo, margenIzq, y);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text(`Fecha de generación: ${formatoFecha(new Date().toISOString().slice(0, 10))}`, margenIzq, y + 16);

  y += 32;

  const itemsCorte = (corte.ejecucion_items || []).filter((i) => i.item_tipo === itemTipo);

  const filasDatos = (items || []).map((it) => {
    const campo = itemTipo === "cotizacion" ? "cotizacion_item_id" : "presupuesto_item_id";
    const existente = itemsCorte.find((i) => i[campo] === it.id);
    const cantidadEsteCorte = Number(existente?.cantidad_periodo || 0);
    const acumulado = _acumuladoHastaPdf(it.id, itemTipo, corte, todosLosCortes);
    const pendiente = Number(it.cantidad) - acumulado;
    return {
      descripcion: it.descripcion,
      unidad: it.unidad || "un",
      cantidadInicial: Number(it.cantidad),
      acumulado,
      pendiente,
      cantidadEsteCorte,
      valorUnitario: Number(it.valor_unitario),
      valorEsteCorte: cantidadEsteCorte * Number(it.valor_unitario),
      valorAcumulado: acumulado * Number(it.valor_unitario),
    };
  });

  const valorActaActual = filasDatos.reduce((a, f) => a + f.valorEsteCorte, 0);
  const valorEjecutadoAcumulado = filasDatos.reduce((a, f) => a + f.valorAcumulado, 0);
  const saldoPendiente = Number(valorContratoTotal || 0) - valorEjecutadoAcumulado;
  const contratista = variante === "contratista" ? (contratistasCache || []).find((c) => c.id === contratistaId) : null;

  const datosResumen = [
    ["N° de Contrato", proyecto.numero_contrato || "—"],
    ["Fecha de inicio del contrato", formatoFecha(proyecto.fecha_inicio)],
    variante === "contratista"
      ? ["Contratista", contratista?.nombre || "—"]
      : ["Valor Total del Contrato", formatoMoneda(valorContratoTotal)],
    ["Valor del Acta Actual", formatoMoneda(valorActaActual)],
    ["Saldo Pendiente", formatoMoneda(saldoPendiente)],
  ];

  doc.autoTable({
    startY: y,
    margin: { left: margenIzq, right: margenIzq },
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 170 } },
    body: datosResumen,
  });

  y = doc.lastAutoTable.finalY + 14;

  doc.autoTable({
    startY: y,
    margin: { left: margenIzq, right: margenIzq },
    head: [["Renglón", "Und", "Cant. Inicial", "Ejec. Acum.", "Pendiente", "Cant. Corte", "Vlr. Unitario", "Vlr. Corte", "Vlr. Acumulado"]],
    body: filasDatos.map((f) => [
      f.descripcion,
      f.unidad,
      f.cantidadInicial,
      f.acumulado,
      f.pendiente,
      f.cantidadEsteCorte,
      formatoMoneda(f.valorUnitario),
      formatoMoneda(f.valorEsteCorte),
      formatoMoneda(f.valorAcumulado),
    ]),
    foot: [["", "", "", "", "", "", "Total", formatoMoneda(valorActaActual), formatoMoneda(valorEjecutadoAcumulado)]],
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [19, 91, 236] },
    footStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: "bold" },
    didDrawPage: () => {
      y = 60;
    },
  });

  y = doc.lastAutoTable.finalY + 18;
  if (y > 640) {
    doc.addPage();
    y = 60;
  }

  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.text("Condiciones tributarias del contrato", margenIzq, y);
  doc.setFont(undefined, "normal");
  y += 14;
  if (proyecto.tipo_contrato === "aiu") {
    doc.text(
      `AIU: Administración ${proyecto.administracion_porcentaje}% · Imprevistos ${proyecto.imprevistos_porcentaje}% · Utilidad ${proyecto.utilidad_porcentaje}% · IVA sobre la Utilidad: ${proyecto.iva_porcentaje}%`,
      margenIzq,
      y
    );
  } else {
    doc.text(`IVA: ${proyecto.iva_porcentaje}%`, margenIzq, y);
  }

  y += 60;
  if (y > 680) {
    doc.addPage();
    y = 80;
  }

  const anchoFirma = 200;
  doc.line(margenIzq, y, margenIzq + anchoFirma, y);
  doc.line(margenIzq + 260, y, margenIzq + 260 + anchoFirma, y);
  doc.setFontSize(9);
  doc.text(variante === "contratista" ? "Firma Contratista" : "Recibido / Aprobado por el Cliente", margenIzq, y + 14);
  doc.text(`Elaborado por ${empresaNombre}`, margenIzq + 260, y + 14);

  const nombreArchivo = `Acta_Corte_${corte.numero_corte}_${variante}_${(proyecto.nombre || "proyecto").replace(/[^a-z0-9]+/gi, "_")}.pdf`;
  doc.save(nombreArchivo);
}

// Genera un PDF genérico de una tabla de datos (usado en los listados
// globales de Facturación / Compras y en el resumen anual de Cortes).
// { titulo, subtitulo, columnas, filas, nombreArchivo }
function generarPdfTabla({ titulo, subtitulo, columnas, filas, nombreArchivo }) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    return mostrarAviso("No se pudo cargar el generador de PDF (revisa tu conexión)", "error");
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margenIzq = 30;
  let y = 36;

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text(titulo, margenIzq, y);
  if (subtitulo) {
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(subtitulo, margenIzq, y + 14);
    y += 14;
  }
  y += 14;

  doc.autoTable({
    startY: y,
    margin: { left: margenIzq, right: margenIzq },
    head: [columnas],
    body: filas,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [19, 91, 236] },
  });

  doc.save(nombreArchivo);
}
