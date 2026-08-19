# GymLog 🏋️

Registro personal de entrenamientos de gimnasio. **Liviano, 100% offline y sin dependencias**: HTML + CSS + JavaScript puro. Los datos viven solo en tu dispositivo.

## Qué hace

- **Rutinas** (A, B, C…) con ejercicios desde un catálogo de +80 (o creá los tuyos).
- **Series y repeticiones** editables con un toque; agregar/sacar series sobre la marcha.
- **Check de serie completada** → arranca solo el **cronómetro de descanso** (configurable general, por ejercicio, y distinto entre series y entre ejercicios; botones ±15s y saltar).
- **Superseries**: agrupá ejercicios; al completar una serie pasás directo al siguiente ejercicio del grupo (sin timer o con el que definas) y el descanso corre al cerrar la ronda.
- **Valores de la sesión anterior** visibles y precargados en cada serie (estilo Hevy/Strong) + aviso de **récord personal** 🏆.
- **Progreso**: calendario mensual con días entrenados, historial de sesiones (duración, series, volumen), gráfico por ejercicio (peso máximo por sesión) y volumen por rutina.
- **Cronómetro con sonido y vibración**, pantalla siempre encendida durante el entrenamiento (opcional).
- **Respaldo**: exportar/importar todo a un archivo JSON desde Ajustes.

## Probar en la PC

```
python -m http.server 8123
```

y abrir http://localhost:8123

## Instalar en el celular

La app está publicada en:

**https://valentinvillalbamethod.github.io/gymlog/**

Una sola vez con internet, después funciona offline para siempre:

1. Abrí esa URL en Chrome (Android) o Safari (iPhone) del celular.
2. Android: menú ⋮ → **"Instalar app"** / **"Agregar a la pantalla de inicio"**.
   iPhone: botón Compartir → **"Agregar a inicio"**.
3. Listo: se abre como app propia, sin barra del navegador, y anda sin conexión.

Cada vez que se actualice el código en `main`, GitHub Pages lo republica y la app
se actualiza sola la próxima vez que la abras con internet (service worker con
estrategia *stale-while-revalidate*).

## Tus datos

- Se guardan en `localStorage` bajo la clave `gymlog_v1`, en tu dispositivo. Nada sale a internet.
- La app pide **almacenamiento persistente** al navegador (evita que el sistema lo purgue) y estando **instalada como app** queda mucho más protegida que una pestaña.
- Aún así: **exportá un respaldo cada tanto** (Ajustes → Exportar). La app te lo recuerda si pasan más de 2 semanas.

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la app (tabs, pantallas, modales) |
| `style.css` | Estilos — mobile-first, tema oscuro |
| `app.js` | Toda la lógica y el estado |
| `data.js` | Catálogo de ejercicios |
| `sw.js` | Service worker (cache offline + actualización automática) |
| `manifest.webmanifest` | Instalación como app |
| `icon.svg`, `icon-180.png`, `icon-512.png`, `icon-maskable-512.png` | Íconos (el PNG de 180 es el que usa iOS) |

Peso total: ~60 KB. Sin dependencias, sin build, sin `node_modules`.
