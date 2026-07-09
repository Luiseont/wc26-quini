# WC26 Quiniela — Rediseño + Migración a Vercel KV

**Fecha:** 2026-07-09
**Estado:** Diseño validado en mockups, pendiente de aprobación final.

## Contexto

Quiniela web para el Mundial 2026 (fase 4tos → final). Proyecto privado entre
amigos, no es un producto. Hoy la app funciona pero tiene dos limitaciones:

1. **Visual:** la estética oscura con acentos dorados se siente genérica y no
   aprovecha la identidad deportiva del producto.
2. **Persistencia:** depende de MongoDB Atlas (que ya está integrado), pero el
   setup es innecesariamente pesado para el tamaño del proyecto. Si no se
   configura, los datos se pierden en cada cold start de Vercel.

Este spec resuelve ambas cosas: rediseño tipo "sportsbook" + migración a
Vercel KV (Redis serverless).

## Decisiones de diseño

### Persistencia: Vercel KV (en lugar de MongoDB Atlas)

- **Servicio:** Vercel KV (Redis administrado).
- **Setup:** 1 clic desde el dashboard de Vercel, sin connection strings.
- **Costo:** free tier generoso (30k requests/día, 256 MB).
- **Migración:** el `store.js` actual expone una interfaz
  (`listParticipants`, `createParticipant`, `upsertResult`, etc.). Se agrega
  un nuevo backend `kv` que cumple la misma interfaz; el resto del código no
  se toca.

#### Adapter `store.js`

```js
// Pseudo-código (no literal)
async function connect() {
  if (db) return db;
  if (process.env.KV_REST_API_URL) {
    mode = 'kv';
    kv = createClient(); // @vercel/kv
    return kv;
  }
  if (process.env.MONGODB_URI) {
    mode = 'mongo'; // legacy, sin cambios
    ...
  }
  mode = 'memory';
  ...
}
```

#### Modelo en Vercel KV

```
participants:<id>  →  JSON { id, name, predictions, createdAt, updatedAt }
participants:idx   →  SET de IDs (para listar)
results:<matchId>  →  JSON { matchId, home, away, qualified, finished, updatedAt }
participants:name:<lower> → <id>   (índice único por nombre)
```

Las funciones públicas se mantienen (`listParticipants`, `getParticipant`,
`createParticipant`, `updateParticipant`, `deleteParticipant`, `listResults`,
`upsertResult`, `resetAll`). Solo cambia la implementación interna.

### Admin: contraseña hardcodeada

Como es un proyecto entre amigos, **no se usan variables de entorno** para
la clave de admin. La contraseña vive en `api/_lib/auth.js` como constante:

```js
const ADMIN_PASSWORD = 'wc26-amigos-2026'; // simple, compartido entre admins
```

- Los endpoints admin (`/api/results`, `/api/admin/*`) siguen requiriendo el
  header `x-admin-key`.
- El frontend pide la clave una vez, la guarda en `localStorage`, la manda
  en cada request.
- Si en el futuro se quiere rotar la contraseña, se edita el archivo y se
  redeploy.

### Diseño visual: Sportsbook

Paleta y tipografía:

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg-0` | `#0e1116` | Fondo global |
| `--bg-1` | `#141921` | Cards, tablas |
| `--line` | `#1f2530` | Bordes finos |
| `--text` | `#e6e9ef` | Texto principal |
| `--text-dim` | `#8b94a3` | Texto secundario |
| `--text-faint` | `#6b7280` | Labels, meta |
| `--accent-good` | `#22c55e` | Acierto, verde |
| `--accent-bad` | `#ef4444` | Fallo, rojo |
| `--accent-gold` | `#facc15` | Líder, dorado |
| `--accent-warn` | `#f59e0b` | Warning, amarillo |
| Font UI | Inter | Texto general |
| Font mono | ui-monospace | **Todos los números, marcadores, IDs** |

Reglas de estilo:

- **Bordes finos** (1px `#1f2530`) en todas las cards y separadores.
- **Top 3 del ranking:** borde izquierdo de 3px en dorado/plata/bronce.
- **Estados de partido:** FINAL (verde), EN JUEGO (amarillo), PRÓXIMO (gris).
- **Celdas de puntos en el leaderboard:** coloreadas según acierto
  (verde/rojo) y gris si el partido aún no terminó.
- **Logo:** `QUINIELA·WC26` con punto verde como acento.
- **Tipografía monospace obligatoria** para todos los marcadores, IDs de
  partido, números de puntos y deltas.

### Vistas

#### 1. Home (desktop)

- Top bar con logo + nav + cupos restantes.
- Hero con 3 cards de stats decorativas: cuota campeón, partidos
  restantes, promedio de aciertos.
- Grid 2 columnas: tabla de participantes (izquierda) + formulario de
  predicción (derecha).
- Tabla de participantes con columnas: #, Jugador, PTS, EX (último
  resultado), A8 (aciertos exactos), TREND (▲/▼ últimos 7 días).

#### 2. Leaderboard (desktop)

- Header: título "Ranking · Fase Final" + tabs de filtro (Global / Cuartos /
  Semi / Final).
- Tabla grande con columnas: #, Jugador, PTS, QF1, QF2, QF3, QF4, SF1, SF2,
  F, Δ.
- Celdas coloreadas: verde = acierto (ganador), rojo = fallo, dorado =
  marcador exacto (8 pts), gris = partido no finalizado.

#### 3. PredictionForm

- Una card por fase (Cuartos, Semifinales, Final).
- Cada partido es una fila con: ID, nombre equipo local (texto completo),
  input marcador local, separador "VS", input marcador visitante, nombre
  equipo visitante (texto completo), **dos pills checkbox** para elegir
  clasificado, badge MAX PTS.
- Sticky footer con: progreso (X/7 cargados), potencial máximo, botones
  "Limpiar" y "Confirmar boleta".

#### 4. PredictionForm — checkbox de clasificado

```html
<div class="classified-pills">
  <button class="on">[✓] BRASIL</button>
  <button class="">[○] ARGENTINA</button>
</div>
```

El seleccionado se ve verde (`rgba(34,197,94,.15)` fondo, `#22c55e` borde),
el otro en gris. Ambos tienen el mismo tamaño y tipografía mono.

#### 5. Admin

- Badge rojo "ADMIN" arriba + nombre de sesión + estado del storage.
- Cards de status: modo storage (Vercel KV), finalizados (X/7),
  participantes.
- Tabla editable de partidos con las mismas columnas que PredictionForm
  más "Clasificado" y "Estado" (FINAL/EN JUEGO/PRÓXIMO).
- Sección colapsable de "Carga masiva" (pegar varias líneas tipo
  `QF1 2-1 1`).
- Botones: Refrescar, Reset total.

#### 6. Mobile (≤640px)

- Header compacto con logo + tabs en línea.
- Hero con tu posición destacada grande (42px dorado).
- 2 cards de stats lado a lado.
- Lista de participantes → **tarjetas verticales** apiladas (no tabla).
  Cada tarjeta: rank, nombre (con badge "TU" si es el usuario), puntos,
  delta.
- PredictionForm → cada partido es una **card vertical** con marcador
  grande centrado (22px monospace) y pills de clasificado debajo.

### Cálculo de puntos

Sin cambios. La lógica de `points.js` se mantiene:

- `scorePrediction(prediction, result)` aplica las 5 reglas en cascada.
- `totalFor(predictions, results)` suma puntos por participante.
- `GET /api/leaderboard` recalcula todo on-demand.

**No se persisten puntos**: son derivados puros de `predictions + results`.
Cambiar un resultado actualiza el leaderboard al siguiente hit.

### Tests

Se mantienen los tests existentes:

- `test/points.test.mjs` — 21 escenarios de reglas.
- `test/api.test.mjs` — 10 tests end-to-end.

Se agrega `test/kv-store.test.mjs` que mockea `@vercel/kv` y valida:

- Crear / leer / actualizar / borrar participante.
- `listParticipants` con el SET de IDs.
- Índice único por nombre (no se puede crear duplicado).
- `upsertResult` + `listResults`.
- `resetAll` borra todo.

## Estructura de archivos

```
api/_lib/
  store.js          ← refactor: agrega backend 'kv' + factory
  kv.js             ← NUEVO: cliente + helpers de Vercel KV
  auth.js           ← modificado: constante hardcodeada
  points.js         ← sin cambios
  matches.js        ← sin cambios
  http.js           ← sin cambios

src/
  style.css         ← reemplazo: nueva paleta + tipografía mono
  components/
    PredictionForm.vue  ← refactor: layout cards + checkbox pills
    ParticipantModal.vue ← adaptación a sportsbook
  views/
    Home.vue         ← refactor: hero stats + tabla densa
    Leaderboard.vue  ← refactor: tabla con desglose por partido
    Admin.vue        ← refactor: cards status + tabla editable

test/
  points.test.mjs   ← sin cambios
  api.test.mjs      ← sin cambios
  kv-store.test.mjs ← NUEVO

package.json         ← +@vercel/kv
vercel.json          ← sin cambios (sigue detectando /api/*)
.env.example         ← reducir: solo KV_REST_API_URL (legacy: MONGODB_URI)
```

## Variables de entorno

| Variable | Antes | Ahora |
|----------|-------|-------|
| `KV_REST_API_URL` | (no existía) | **requerida en producción** (auto-set por Vercel al instalar KV) |
| `KV_REST_API_TOKEN` | (no existía) | **requerida en producción** (auto-set por Vercel) |
| `MONGODB_URI` | opcional | **legacy**, ignorada si KV está presente |
| `MONGODB_DB` | opcional | legacy |
| `ADMIN_KEY` | requerida | **eliminada**, ahora hardcodeada en auth.js |
| `ALLOWED_ORIGIN` | opcional | opcional, sin cambios |

## Plan de deploy

1. Hacer push del repo a GitHub.
2. Crear proyecto en Vercel apuntando al repo.
3. En Storage → Create Database → KV.
4. (Opcional) Borrar variable `ADMIN_KEY` del dashboard de Vercel.
5. Redeploy. La app debería estar funcionando con Vercel KV.

## Out of scope

- Autenticación de usuarios (no se necesita — el nombre es suficiente).
- Notificaciones push.
- Multi-tenancy.
- Exportación de datos.
- Modo claro.