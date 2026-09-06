(async () => {
  const { session } = await window.pctronicReady;
  if (!session) return;

  const avatarPreview = document.getElementById("perfil-avatar-preview");
  let perfilActual = null;

  function pintarAvatar(nombre, avatarUrl) {
    if (avatarUrl) {
      avatarPreview.style.backgroundImage = `url('${avatarUrl}')`;
      avatarPreview.textContent = "";
    } else {
      avatarPreview.style.backgroundImage = "";
      avatarPreview.textContent = (nombre || "?").trim().charAt(0).toUpperCase();
    }
  }

  async function cargarPerfil() {
    const { data, error } = await window.sb.from("profiles").select("*").eq("id", session.user.id).single();
    if (error) return manejarError(error, "No se pudo cargar tu perfil");
    perfilActual = data;
    document.getElementById("perfil-nombre").value = data.nombre_completo || "";
    document.getElementById("perfil-cargo").value = data.cargo || "";
    document.getElementById("perfil-telefono").value = data.telefono || "";
    document.getElementById("perfil-email").value = session.user.email || "";
    pintarAvatar(data.nombre_completo || session.user.email, data.avatar_url);
  }

  document.getElementById("btn-guardar-perfil").addEventListener("click", async () => {
    const payload = {
      nombre_completo: document.getElementById("perfil-nombre").value.trim() || null,
      cargo: document.getElementById("perfil-cargo").value.trim() || null,
      telefono: document.getElementById("perfil-telefono").value.trim() || null,
    };
    const { error } = await window.sb.from("profiles").update(payload).eq("id", session.user.id);
    if (error) return manejarError(error, "No se pudo guardar tu perfil");
    mostrarAviso("Perfil actualizado. Los cambios se verán en el menú al recargar la página.", "exito");
    cargarPerfil();
  });

  document.getElementById("input-avatar").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      mostrarAviso("Selecciona un archivo de imagen (JPG o PNG)", "error");
      e.target.value = "";
      return;
    }

    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ruta = `${session.user.id}/avatar.${extension}`;

    const { error: errorSubida } = await window.sb.storage.from("avatars").upload(ruta, file, {
      upsert: true,
      cacheControl: "3600",
    });
    if (errorSubida) {
      manejarError(errorSubida, "No se pudo subir la foto");
      e.target.value = "";
      return;
    }

    const { data: publicUrlData } = window.sb.storage.from("avatars").getPublicUrl(ruta);
    // Se agrega un parámetro de tiempo para evitar que el navegador muestre la foto anterior en caché.
    const urlConVersion = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: errorActualizar } = await window.sb
      .from("profiles")
      .update({ avatar_url: urlConVersion })
      .eq("id", session.user.id);
    if (errorActualizar) {
      manejarError(errorActualizar, "La foto se subió pero no se pudo guardar en tu perfil");
      e.target.value = "";
      return;
    }

    pintarAvatar(document.getElementById("perfil-nombre").value, urlConVersion);
    mostrarAviso("Foto de perfil actualizada", "exito");
    e.target.value = "";
  });

  document.getElementById("btn-cambiar-password").addEventListener("click", async () => {
    const nueva = document.getElementById("perfil-password").value;
    const confirmar = document.getElementById("perfil-password-confirm").value;
    if (!nueva || nueva.length < 6) {
      return mostrarAviso("La contraseña debe tener al menos 6 caracteres", "error");
    }
    if (nueva !== confirmar) {
      return mostrarAviso("Las contraseñas no coinciden", "error");
    }
    const { error } = await window.sb.auth.updateUser({ password: nueva });
    if (error) return manejarError(error, "No se pudo actualizar la contraseña");
    document.getElementById("perfil-password").value = "";
    document.getElementById("perfil-password-confirm").value = "";
    mostrarAviso("Contraseña actualizada correctamente", "exito");
  });

  cargarPerfil();
})();
