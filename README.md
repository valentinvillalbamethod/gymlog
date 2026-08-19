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

La forma más simple (una sola vez con internet, después funciona por siempre offline):

1. Subí este repo a GitHub y activá **GitHub Pages** (Settings → Pages → branch `main`).
2. Abrí la URL de Pages en Chrome del celular.
3. Menú ⋮ → **"Agregar a la pantalla de inicio"** / **"Instalar app"**.
4. Listo: se abre como app propia, sin barra del navegador, y funciona sin conexión gracias al service worker.

Alternativa sin GitHub: serví la carpeta desde tu PC en la red local (`python -m http.server`) y abrí `http://IP-DE-TU-PC:8123` desde el celular (la instalación como PWA requiere HTTPS o localhost, pero podés usarla igual desde el navegador).

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
