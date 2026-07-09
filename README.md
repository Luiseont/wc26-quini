# Quiniela WC 2026 · 4tos → Final

Web en Vue 3 + Vite con API serverless, lista para desplegar en Vercel y usar
MongoDB Atlas (o SQLite en memoria para desarrollo local). Cubre la fase de
4tos de final, semifinales y final del mundial, con cálculo automático de
puntos por participante y un panel de admin para cargar resultados.

## Reglas de puntuación

| # | Regla | Puntos |
|---|-------|--------|
| 1 | Equipo ganador + marcador exacto | 8 |
| 2 | Ganador + acierto parcial (goles a favor **o** en contra, no ambos) | 7 |
| 3 | Solo el equipo ganador | 6 |
| 4 | Equipo clasificado (solo aplica si ganador y clasificado se definen por separado, ej. penales) | 5 |
| 5 | Marcador exacto, independientemente del ganador | 3 |

Las reglas se evalúan en cascada y se aplica la de mayor valor que coincida.
El sistema detecta inconsistencias lógicas (empates en eliminatorias,
predicciones contradictorias, marcadores imposibles, etc.) y las lista en el
panel de admin.

## Estructura

```
.
├── api/                  # Funciones serverless para Vercel
│   ├── _lib/             # store, points, matches, http, auth
│   ├── participants.js   # GET/POST
│   ├── participants/[id].js
│   ├── matches.js
│   ├── results.js
│   ├── results/[matchId].js
│   ├── leaderboard.js
│   ├── admin/check.js
│   ├── admin/inconsistencies.js
│   ├── admin/reset.js
│   └── health.js
├── server/dev-api.mjs    # Express server para desarrollo local
├── src/                  # Frontend Vue 3
│   ├── components/
│   ├── views/
│   ├── App.vue
│   ├── main.js
│   ├── router.js
│   ├── store.js          # Pinia store
│   ├── api.js
│   └── style.css
├── test/                 # node:test
│   ├── points.test.mjs   # 21 tests de las reglas
│   └── api.test.mjs      # 10 tests end-to-end
├── vercel.json
├── vite.config.js
└── package.json
```

## Desarrollo local

```bash
npm install
npm run dev          # arranca Vite (5173) + API Express (8787) en paralelo
```

Abre <http://localhost:5173>. La UI hace proxy de `/api/*` al servidor de
desarrollo en `8787`.

Si no configuras `MONGODB_URI`, la API usa un store en memoria: útil para
desarrollo, **no apto para producción** (los datos se pierden al reiniciar).

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `MONGODB_URI` | Cadena de conexión de MongoDB Atlas | (vacío → memoria) |
| `MONGODB_DB` | Nombre de la base de datos | `wc26_quini` |
| `ADMIN_KEY` | Clave compartida para endpoints de admin | `changeme` |
| `ALLOWED_ORIGIN` | Origen CORS permitido | `*` |

## Despliegue en Vercel

1. Sube el repo a GitHub.
2. Crea un proyecto en Vercel apuntando al repo. Vercel detecta Vite y las
   funciones en `/api` automáticamente.
3. Configura las variables de entorno (`MONGODB_URI`, `MONGODB_DB`, `ADMIN_KEY`)
   en la sección *Environment Variables* del proyecto.
4. (Opcional) Crea un cluster gratuito en MongoDB Atlas y copia la connection
   string en `MONGODB_URI`.

Sin `MONGODB_URI` el deploy funciona pero los datos se pierden en cada cold
start de las funciones serverless.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado y contadores |
| GET | `/api/matches` | Partidos (4tos → final) |
| GET | `/api/results` | Resultados actuales |
| POST | `/api/results` | Carga masiva de resultados *(admin)* |
| GET | `/api/results/:matchId` | Resultado de un partido |
| PUT | `/api/results/:matchId` | Actualizar resultado *(admin)* |
| GET | `/api/participants` | Listado de participantes |
| POST | `/api/participants` | Crear participante |
| GET | `/api/participants/:id` | Participante + predicciones |
| PUT | `/api/participants/:id` | Editar predicciones |
| DELETE | `/api/participants/:id` | Eliminar participante |
| GET | `/api/leaderboard` | Ranking con puntos por partido |
| GET | `/api/admin/check` | Verifica la clave de admin |
| GET | `/api/admin/inconsistencies` | Lista inconsistencias detectadas *(admin)* |
| POST | `/api/admin/reset` | Borra todo *(admin, requiere `confirm: "RESET"`)* |

Las rutas marcadas con *(admin)* requieren el header `x-admin-key` con el
valor de `ADMIN_KEY`. La UI guarda la clave en `localStorage` la primera vez
que se introduce en la pantalla `/admin`.

## Tests

```bash
node --test test/points.test.mjs   # 21 tests de la lógica de puntos
node --test test/api.test.mjs      # 10 tests end-to-end (levantan el dev server)
```

## Flujo de uso

1. Cualquier persona abre la web, escribe su nombre y registra sus
   predicciones (marcador de cada partido).
2. El admin entra a `/admin`, introduce la clave y carga los resultados reales
   de cada partido marcándolos como *finalizados* a medida que terminan.
3. La tabla de posiciones se recalcula automáticamente. Las inconsistencias se
   muestran en el panel de admin.
