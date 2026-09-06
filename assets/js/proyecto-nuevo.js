(async () => {
  const { session } = await window.pctronicReady;

  const selectCliente = document.getElementById("cliente_id");

  async function cargarClientes(seleccionarId) {
    const { data, error } = await window.sb.from("clientes").select("id, nombre").order("nombre");
    if (error) return manejarError(error, "No se pudieron cargar los clientes");
    selectCliente.innerHTML =
      `<option value="">Seleccionar un cliente...</option>` +
      data.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
    if (seleccionarId) selectCliente.value = seleccionarId;
  }
  cargarClientes();

  // Modal de cliente rápido
  const modal = document.getElementById("modal-cliente");
  document.getElementById("btn-nuevo-cliente").addEventListener("click", () => {
    document.getElementById("nuevo-cliente-nombre").value = "";
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });
  document.getElementById("btn-cancelar-cliente").addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });
  document.getElementById("btn-guardar-cliente").addEventListener("click", async () => {
    const nombre = document.getElementById("nuevo-cliente-nombre").value.trim();
    if (!nombre) return;
    const { data, error } = await window.sb.from("clientes").insert({ nombre }).select().single();
    if (error) return manejarError(error, "No se pudo crear el cliente");
    await cargarClientes(data.id);
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    mostrarAviso("Cliente creado", "exito");
  });

  document.getElementById("form-proyecto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-guardar");
    btn.disabled = true;
    btn.textContent = "Guardando...";

    const payload = {
      nombre: document.getElementById("nombre").value.trim(),
      cliente_id: selectCliente.value || null,
      tipo_proyecto: document.getElementById("tipo_proyecto").value,
      estado: document.getElementById("estado").value,
      fecha_contrato: document.getElementById("fecha_contrato").value || null,
      fecha_inicio: document.getElementById("fecha_inicio").value || null,
      fecha_fin_estimada: document.getElementById("fecha_fin_estimada").value || null,
      valor_total: Number(document.getElementById("valor_total").value || 0),
      notas: document.getElementById("notas").value.trim() || null,
      created_by: session.user.id,
    };

    const { data, error } = await window.sb.from("proyectos").insert(payload).select().single();

    if (error) {
      manejarError(error, "No se pudo crear el proyecto");
      btn.disabled = false;
      btn.textContent = "Crear Proyecto";
      return;
    }

    window.location.href = `proyecto-detalle.html?id=${data.id}`;
  });
})();
