// ============================================================================
// Utilidades para exportar/importar plantillas Excel (usa SheetJS / window.XLSX
// cargado por CDN). Se usan en Presupuesto de proyectos y en Compras.
// ============================================================================

// Descarga un archivo .xlsx con una fila de encabezados y, opcionalmente,
// filas de ejemplo. `columnas` es un arreglo de encabezados de texto.
function descargarPlantillaExcel(nombreArchivo, columnas, filasEjemplo = []) {
  const datos = [columnas, ...filasEjemplo];
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Plantilla");
  XLSX.writeFile(libro, nombreArchivo);
}

// Lee un archivo .xlsx/.xls (desde un <input type="file">) y devuelve un
// arreglo de objetos, usando la primera fila como llaves de cada columna.
function leerArchivoExcel(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.onload = (e) => {
      try {
        const datos = new Uint8Array(e.target.result);
        const libro = XLSX.read(datos, { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });
        resolve(filas);
      } catch (err) {
        reject(err);
      }
    };
    lector.readAsArrayBuffer(file);
  });
}
