// ============================================================================
// Funciones de ayuda reutilizadas en toda la app.
// ============================================================================

function formatoMoneda(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatoFecha(fecha) {
  if (!fecha) return "—";
  const d = new Date(fecha + (String(fecha).length <= 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

const ESTADOS_PROYECTO = {
  sin_iniciar: { label: "Sin Iniciar", clase: "bg-amber-100 text-amber-800" },
  en_curso: { label: "En Curso", clase: "bg-blue-100 text-blue-800" },
  detenido: { label: "Detenido", clase: "bg-gray-200 text-gray-700" },
  finalizado: { label: "Finalizado", clase: "bg-green-100 text-green-800" },
};

const ESTADOS_FACTURA = {
  pendiente: { label: "Pendiente", clase: "bg-amber-100 text-amber-800" },
  pagada: { label: "Pagada", clase: "bg-green-100 text-green-800" },
  vencida: { label: "Vencida", clase: "bg-red-100 text-red-800" },
  anulada: { label: "Anulada", clase: "bg-gray-200 text-gray-700" },
};

const ESTADOS_CORTE = {
  borrador: { label: "Borrador", clase: "bg-gray-200 text-gray-700" },
  en_tramite: { label: "En Trámite", clase: "bg-amber-100 text-amber-800" },
  pagado: { label: "Pagado", clase: "bg-green-100 text-green-800" },
};

function badgeHtml(mapa, valor) {
  const info = mapa[valor] || { label: valor || "—", clase: "bg-gray-200 text-gray-700" };
  return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${info.clase}">${info.label}</span>`;
}

// Barra de notificaciones simple (éxito / error) en la esquina de la pantalla.
function mostrarAviso(mensaje, tipo = "info") {
  const colores = {
    info: "bg-gray-900",
    exito: "bg-green-600",
    error: "bg-red-600",
  };
  const el = document.createElement("div");
  el.className = `fixed bottom-5 right-5 z-50 max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${colores[tipo] || colores.info}`;
  el.textContent = mensaje;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function manejarError(error, contexto) {
  console.error(contexto, error);
  mostrarAviso((contexto ? contexto + ": " : "") + (error?.message || "Ocurrió un error"), "error");
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ============================================================================
// Campos de dinero con separador de miles (ej. "1.250.000,50") que aceptan
// decimales (con coma) y devuelven un número plano. Uso:
//   <input class="input-moneda" inputmode="decimal" />
//   activarCamposMoneda(); // una vez, después de insertar el HTML
//   valorMoneda(inputEl);  // para leer el número actual
// ============================================================================

function formatearMiles(valorNumerico) {
  const n = Number(valorNumerico || 0);
  return n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

// Convierte lo que el usuario escribió (con puntos de miles y coma decimal
// opcional, ej. "1.500.000,25") a un número JS normal (1500000.25).
function valorMoneda(inputEl) {
  if (!inputEl) return 0;
  let texto = String(inputEl.value || "").trim();
  if (!texto) return 0;
  const partes = texto.split(",");
  const parteEntera = (partes[0] || "").replace(/[^\d]/g, "");
  const parteDecimal = partes.length > 1 ? partes[1].replace(/[^\d]/g, "") : "";
  const normalizado = parteEntera + (parteDecimal ? "." + parteDecimal : "");
  const n = Number(normalizado);
  return isNaN(n) ? 0 : n;
}

function establecerValorMoneda(inputEl, valorNumerico) {
  if (!inputEl) return;
  inputEl.value = valorNumerico ? formatearMiles(valorNumerico) : "";
}

// Reformatea en vivo lo que el usuario está escribiendo, conservando la coma
// decimal (hasta 2 decimales) mientras le pone puntos de miles a la parte entera.
function formatearWhileTyping(texto) {
  let limpio = String(texto || "").replace(/[^\d,]/g, "");
  const primeraComa = limpio.indexOf(",");
  if (primeraComa !== -1) {
    limpio = limpio.slice(0, primeraComa + 1) + limpio.slice(primeraComa + 1).replace(/,/g, "");
  }
  const [entero, decimal] = limpio.split(",");
  const enteroFormateado = entero ? Number(entero).toLocaleString("es-CO", { maximumFractionDigits: 0 }) : "";
  if (decimal === undefined) return enteroFormateado;
  return `${enteroFormateado},${decimal.slice(0, 2)}`;
}

function activarCamposMoneda(selector = ".input-moneda", contenedor = document) {
  contenedor.querySelectorAll(selector).forEach((input) => {
    if (input.dataset.moneyBound) return;
    input.dataset.moneyBound = "1";
    input.addEventListener("input", () => {
      input.value = formatearWhileTyping(input.value);
    });
  });
}
