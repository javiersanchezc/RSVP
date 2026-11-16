# Especificación Técnica y Estado Actual: Aplicación de Lectura Rápida (RSVP)

Este documento refleja el estado actual, la arquitectura y las funcionalidades implementadas en la aplicación de Lectura Rápida RSVP, tras completar todas las fases de desarrollo iterativo.

---

## 1. Arquitectura y Stack Tecnológico
La aplicación se construyó con un enfoque de alto rendimiento y baja latencia visual.

- **Backend (Python / FastAPI):**
  - Actúa como procesador de lenguaje natural y gestor de biblioteca local.
  - Librerías clave: `PyMuPDF` (para PDFs), `EbookLib` y `BeautifulSoup` (para EPUBs).
  - Persistencia: Sistema de almacenamiento local basado en un archivo `history.json` para llevar el progreso de lectura sin bases de datos pesadas.
- **Frontend (HTML5, CSS3, Vanilla JS):**
  - **SPA sin frameworks pesados** (sin React/Next.js) para garantizar que el bucle del reproductor RSVP (que corre a miles de milisegundos) no sufra de *lag* o *reflows* por el Virtual DOM.
  - **Estilos:** Dark Mode con diseño premium y efectos *glassmorphism* (cristal esmerilado).
  - **Temporizador:** Uso dinámico de `setTimeout` con recálculo de latencia por palabra para precisión extrema.

---

## 2. El Motor Core RSVP (Completado)
El motor de renderizado y tokenización procesa el texto siguiendo reglas estrictas:

- **Limpieza y Tokenización:** El texto puro extraído (de PDFs o EPUBs) es limpiado de código o imágenes inútiles y separado palabra por palabra.
- **Cálculo del ORP (Optimal Recognition Point):**
  - Palabras de 1-2 letras: Índice 0 o 1.
  - Palabras de 3-5 letras: Índice 1.
  - Palabras de 6-9 letras: Índice 2.
  - Palabras de 10+ letras: Índice 3.
  - *La UI divide la palabra visualmente en tres bloques, anclando siempre la letra pivote (color rojo) en el centro exacto de la pantalla.*
- **Pausas Cognitivas Dinámicas:**
  - `.` `?` `!`: $+80\%$ de tiempo sobre la velocidad base (WPM).
  - `,` `;`: $+30\%$ de tiempo sobre la velocidad base.

---

## 3. Funcionalidades y Fases Implementadas

### ✅ Fase 1: MVP y Reproductor Base
- Reproductor funcional RSVP con control de WPM (100 a 1000).
- Animación de lectura suave y sin cortes.
- Controles de reproducción interactivos y atajos de teclado (Espacio, Flechas).

### ✅ Fase 2: Soporte para Documentos Reales
- Integración de subida de archivos (PDF y EPUB).
- Extracción de texto asíncrona mediante el backend en Python.

### ✅ Fase 3: Paginación y Control de Secciones
- El backend inyecta metadatos a cada palabra identificando su origen (Ej: "Página 5" o "Capítulo 2").
- Selector visual en el Frontend que permite saltar a cualquier parte específica del libro al instante.

### ✅ Fase 4: Vista de Contexto Dinámica (Teleprónter)
- Se eliminó la dependencia de aislar al usuario. Ahora, al leer, se muestra una ventana móvil con el contexto.
- **Algoritmo de ventana móvil:** Muestra las últimas 40 y próximas 40 palabras.
- Resaltado rojo brillante en tiempo real sobre la palabra que se está leyendo en el reproductor gigante, ayudando a mantener la ubicación espacial.

### ✅ Fase 5: Biblioteca Local e Historial Persistente
- Sistema de **Biblioteca Local** (`library/`) gestionado por el backend.
- Interfaz gráfica en el frontend que carga tus libros guardados (`history.json`).
- Guardado automático de progreso (índice de palabra exacta) al pausar o salir.
- Capacidad de **"Retomar Lectura"** sin tener que volver a subir o buscar el archivo PDF/EPUB.

---

## 4. Próximos Pasos Futuros (Escalabilidad)
- **Modo Nube (Sincronización):** Migrar el archivo `history.json` a una base de datos (PostgreSQL/MongoDB) con autenticación de usuarios para sincronizar progreso entre dispositivos.
- **Importación Web (Scraping):** Extraer artículos automáticamente pegando una URL.
- **Versión Móvil:** Empaquetado como PWA (Progressive Web App) o migración nativa, aprovechando que la API backend ya está separada.
