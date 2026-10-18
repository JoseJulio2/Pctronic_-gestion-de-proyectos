// ============================================================================
// PROYECTOS · pestaña DOCUMENTOS (contratos, planos, pólizas, soportes...).
// Los archivos viven en el bucket de Supabase "documentos".
// ============================================================================
(function (PCT) {
  const CATEGORIAS = {
    contrato: "Contrato",
    cotizacion: "Cotización final",
    planos: "Planos",
    polizas: "Pólizas",
    orden_compra: "Orden de compra",
    acta_entrega: "Acta de entrega",
    corte: "Corte / soporte",
    otro: "Otro",
  };

  PCT.renderDocumentos = async (root) => {
    const pid = PCT.estado.proyecto.id;
    let docs = [];
    let filtro = "";

    root.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-gray-500">Contrato, cotización final, planos, pólizas, órdenes de compra, actas y demás archivos del proyecto.</p>
          <label class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <span class="material-symbols-outlined text-[18px]">upload</span> Subir documento
            <input type="file" id="doc-input" class="hidden" />
          </label>
        </div>
        <div id="doc-filtros" class="flex flex-wrap gap-2"></div>
        <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="px-4 py-3">Archivo</th><th class="px-4 py-3">Categoría</th><th class="px-4 py-3">Subido</th><th class="px-4 py-3"></th></tr></thead>
            <tbody id="doc-tabla"></tbody>
          </table>
        </div>
      </div>`;

    const pintar = () => {
      root.querySelector("#doc-filtros").innerHTML = [["", "Todos"], ...Object.entries(CATEGORIAS)]
        .map(
          ([v, l]) =>
            `<button data-cat="${v}" class="rounded-full border px-3 py-1 text-xs font-semibold ${
              filtro === v ? "border-primary bg-blue-50 text-primary" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }">${l}</button>`
        )
        .join("");
      const lista = filtro ? docs.filter((d) => d.categoria === filtro) : docs;
      root.querySelector("#doc-tabla").innerHTML = lista.length
        ? lista
            .map(
              (d) => `<tr class="border-t border-gray-100" data-id="${d.id}">
                <td class="px-4 py-2.5"><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" class="font-medium text-primary hover:underline">${escapeHtml(d.nombre_archivo)}</a></td>
                <td class="px-4 py-2.5"><span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">${CATEGORIAS[d.categoria] || d.categoria}</span></td>
                <td class="px-4 py-2.5 text-xs text-gray-500">${formatoFecha(d.created_at)}</td>
                <td class="px-4 py-2.5 text-right"><button data-borrar class="text-gray-400 hover:text-red-600" title="Eliminar"><span class="material-symbols-outlined text-[18px]">delete</span></button></td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">No hay documentos en esta categoría.</td></tr>`;
    };

    const cargar = async () => {
      const { data, error } = await window.sb.from("documentos").select("*").eq("proyecto_id", pid).order("created_at", { ascending: false });
      if (error) return manejarError(error, "No se pudieron cargar los documentos");
      docs = data || [];
      pintar();
    };

    root.querySelector("#doc-filtros").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      filtro = b.dataset.cat;
      pintar();
    });

    root.querySelector("#doc-tabla").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-borrar]");
      if (!b) return;
      const id = b.closest("tr").dataset.id;
      const ok = await PCT.confirmar("Eliminar documento", "¿Eliminar este documento del proyecto?", "Eliminar", true);
      if (!ok) return;
      const { error } = await window.sb.from("documentos").delete().eq("id", id);
      if (error) return manejarError(error, "No se pudo eliminar");
      cargar();
    });

    root.querySelector("#doc-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      PCT.modal({
        titulo: "Subir documento",
        ancho: "max-w-sm",
        html: `<p class="mb-3 truncate text-sm text-gray-500">${escapeHtml(file.name)}</p>
          <label class="mb-1 block text-xs font-medium text-gray-700">Categoría</label>
          <select id="doc-categoria" class="w-full rounded-lg border-gray-300 text-sm">${Object.entries(CATEGORIAS)
            .map(([v, l]) => `<option value="${v}">${l}</option>`)
            .join("")}</select>`,
        botones: [
          { texto: "Cancelar" },
          {
            texto: "Subir",
            clase: PCT.BTN_PRIMARIO,
            onClick: async ({ el }) => {
              const categoria = el.querySelector("#doc-categoria").value;
              const ruta = `${pid}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
              const { error: errSubida } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
              if (errSubida) {
                manejarError(errSubida, "No se pudo subir el documento");
                return false;
              }
              const url = window.sb.storage.from("documentos").getPublicUrl(ruta).data.publicUrl;
              const { error } = await window.sb.from("documentos").insert({
                proyecto_id: pid, categoria, nombre_archivo: file.name, url, subido_por: PCT.usuarioId || null,
              });
              if (error) {
                manejarError(error, "El archivo se subió pero no se pudo registrar");
                return false;
              }
              mostrarAviso("Documento subido.", "exito");
              cargar();
            },
          },
        ],
      });
    });

    await cargar();
  };
})(window.PCT);
