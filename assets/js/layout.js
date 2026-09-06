// ============================================================================
// Barra lateral + encabezado + control de acceso (login obligatorio).
// Se incluye en TODAS las páginas protegidas para que se vean idénticas.
// ============================================================================

const NAV_ITEMS = [
  { page: "dashboard", href: "dashboard.html", icon: "dashboard", label: "Panel Principal" },
  { page: "proyectos", href: "proyectos.html", icon: "folder_open", label: "Proyectos" },
  { page: "facturacion", href: "facturacion.html", icon: "receipt_long", label: "Facturación" },
  { page: "compras", href: "compras.html", icon: "shopping_cart", label: "Compras y Costos" },
  { page: "clientes", href: "clientes.html", icon: "groups", label: "Clientes" },
  { page: "contratistas", href: "contratistas.html", icon: "engineering", label: "Contratistas" },
  { page: "proveedores", href: "proveedores.html", icon: "local_shipping", label: "Proveedores" },
  { page: "empresas", href: "empresas.html", icon: "domain", label: "Empresas" },
];

const NAV_ITEMS_ADMIN = [
  { page: "usuarios", href: "usuarios.html", icon: "manage_accounts", label: "Usuarios" },
];

function logoSvg() {
  return `
    <svg viewBox="0 0 24 24" class="h-8 w-8 text-primary shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5.25 3.4 10.14 8 11.32C16.6 21.14 20 16.25 20 11V5l-8-3Zm0 2.18 6 2.25V11c0 4.28-2.7 8.24-6 9.28C8.7 19.24 6 15.28 6 11V6.43l6-2.25Z"/>
      <path d="m11 13.59-2.3-2.3-1.4 1.42L11 16.4l6.7-6.7-1.4-1.41L11 13.59Z"/>
    </svg>`;
}

function renderSidebar(activePage) {
  const cfg = window.PCTRONIC_CONFIG || {};
  const items = [...NAV_ITEMS];
  const linksHtml = (arr) =>
    arr
      .map((item) => {
        const active = item.page === activePage;
        return `
        <a href="${item.href}"
           class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
             ${active ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}">
          <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
          ${item.label}
        </a>`;
      })
      .join("");

  return `
  <aside class="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-gray-200 bg-white">
    <div class="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
      ${logoSvg()}
      <div class="leading-tight">
        <p class="text-sm font-bold text-gray-900">Pctronic</p>
        <p class="text-xs text-gray-500">Seguridad Electrónica</p>
      </div>
    </div>
    <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4" id="nav-links">
      ${linksHtml(items)}
      <div id="nav-admin-slot"></div>
    </nav>
    <div class="border-t border-gray-100 p-3">
      <button id="btn-logout" class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">
        <span class="material-symbols-outlined text-[20px]">logout</span>
        Cerrar Sesión
      </button>
    </div>
  </aside>`;
}

function renderTopbar(titulo) {
  return `
  <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
    <h1 class="text-lg font-bold text-gray-900">${escapeHtml(titulo || "")}</h1>
    <a href="perfil.html" class="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50" title="Mi perfil">
      <div class="text-right leading-tight hidden sm:block">
        <p id="topbar-nombre" class="text-sm font-semibold text-gray-800">—</p>
        <p id="topbar-rol" class="text-xs text-gray-500">—</p>
      </div>
      <div class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary font-bold text-sm bg-cover bg-center" id="topbar-avatar">
        ?
      </div>
    </a>
  </header>`;
}

async function inicializarApp() {
  const page = document.body.dataset.page || "";
  const titulo = document.body.dataset.title || "";

  const {
    data: { session },
  } = await window.sb.auth.getSession();

  if (!session) {
    if (page !== "login") window.location.href = "login.html";
    return { session: null, profile: null };
  }

  if (page === "login") {
    window.location.href = "dashboard.html";
    return { session, profile: null };
  }

  const sidebarEl = document.getElementById("app-sidebar");
  const topbarEl = document.getElementById("app-topbar");
  if (sidebarEl) sidebarEl.innerHTML = renderSidebar(page);
  if (topbarEl) topbarEl.innerHTML = renderTopbar(titulo);

  let profile = null;
  try {
    const { data, error } = await window.sb
      .from("profiles")
      .select("nombre_completo, rol, cargo, telefono, avatar_url")
      .eq("id", session.user.id)
      .single();
    if (!error) profile = data;
  } catch (e) {
    console.warn("No se pudo cargar el perfil", e);
  }

  const nombre = profile?.nombre_completo || session.user.email;
  const rol = profile?.rol === "admin" ? "Administrador" : "Miembro del equipo";

  const nombreEl = document.getElementById("topbar-nombre");
  const rolEl = document.getElementById("topbar-rol");
  const avatarEl = document.getElementById("topbar-avatar");
  if (nombreEl) nombreEl.textContent = nombre;
  if (rolEl) rolEl.textContent = rol;
  if (avatarEl) {
    if (profile?.avatar_url) {
      avatarEl.textContent = "";
      avatarEl.style.backgroundImage = `url('${profile.avatar_url}')`;
    } else {
      avatarEl.style.backgroundImage = "";
      avatarEl.textContent = (nombre || "?").trim().charAt(0).toUpperCase();
    }
  }

  if (profile?.rol === "admin") {
    const slot = document.getElementById("nav-admin-slot");
    if (slot) {
      slot.innerHTML = NAV_ITEMS_ADMIN.map((item) => {
        const active = item.page === page;
        return `
        <a href="${item.href}"
           class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
             ${active ? "bg-blue-50 text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}">
          <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
          ${item.label}
        </a>`;
      }).join("");
    }
  }

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await window.sb.auth.signOut();
      window.location.href = "login.html";
    });
  }

  return { session, profile };
}

// Otras páginas hacen: const { session, profile } = await window.pctronicReady;
window.pctronicReady = inicializarApp();
