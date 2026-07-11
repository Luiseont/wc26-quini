# Spec: Ajuste de puntos por clasificado en wc26-quini

**Fecha:** 2026-07-11
**Estado:** Aprobado por el usuario

## Contexto

El usuario quiere modificar la regla de puntuación del quiniela del Mundial 2026 para los casos en los que el usuario acierta "quién clasifica" (el `qualified` field del resultado, típicamente el equipo que gana en la tanda de penales cuando el marcador real es un empate).

Regla actual (en `api/_lib/points.js`):
- `QUALIFIED_TEAM`: 5 pts — se activa cuando el usuario acierta el clasificado pero no el ganador (típicamente partidos que terminan en empate con clasificado explícito por penales).

Reglas nuevas pedidas por el usuario:

1. **Solo acierta quién clasifica** → **2 pts** (antes 5 pts).
2. **El partido termina en empate y acierta quién clasifica** → **5 pts**.
3. **Acierta el resultado del partido, pero no quién clasifica** → **3 pts** (sin cambio, ya implementado como `EXACT_SCORE_DIFFERENT_WINNER`).

## Aclaración

La condición del caso 2 fue confirmada con el usuario: el usuario debe predecir el marcador exacto del empate (no basta con predecir cualquier empate). Si el usuario predice un marcador de empate diferente al real (ej. 2-2 vs 1-1 real), aunque acierte el clasificado, recibe 2 pts (caso 1).

## Cambios en `api/_lib/points.js`

### Nueva regla: `QUALIFIED_TEAM_ON_DRAW_EXACT`

- **Trigger:** `qualifierCorrect && actualWinner === 'draw' && exactScore`
- **Puntos:** 5
- **Prioridad:** justo después de `WINNER_ONLY` (índice 3), antes de `QUALIFIED_TEAM`.
- **Explicación:** "Acertaste el marcador del empate y el clasificado".

### Regla `QUALIFIED_TEAM` modificada

- Mismo trigger (`qualifierCorrect && !winnerCorrect`), pero ahora vale **2 pts** en lugar de 5.
- **Explicación actualizada:** "El equipo que respaldaste clasificó" (sin el "5 pts" en el texto del issue).

### Constante `RULE_POINTS`

```js
// Antes: [8, 7, 6, 5, 3, 2]
// Ahora:
export const RULE_POINTS = [8, 7, 6, 5, 2, 3, 2];
```

### Orden de evaluación

```js
const order = [
  'EXACT_WINNER_SCORE',          // 8
  'WINNER_PLUS_PARTIAL_SCORE',   // 7
  'WINNER_ONLY',                 // 6
  'QUALIFIED_TEAM_ON_DRAW_EXACT',// 5  ← NUEVO
  'QUALIFIED_TEAM',              // 2  ← antes 5
  'EXACT_SCORE_DIFFERENT_WINNER',// 3
  'INVERTED_SCORE',              // 2
];
```

### Mensajes de issue

- `RULE_4_TRIGGERED` se actualiza para no decir "5 pts" fijo, ya que la regla ahora vale 2 pts. Se mantiene el código para auditoría.
- Se agrega `RULE_DRAW_QUALIFIED_TRIGGERED` para los casos donde se aplica la nueva regla de 5 pts.

### Docstring

Actualizar el comentario al inicio del archivo para reflejar la nueva regla y el cambio de puntaje.

## Cambios en tests (`test/points.test.mjs`)

### Tests existentes a modificar

| Test | Cambio |
|---|---|
| "Rule 4: qualifier correct without winner (penalties recorded as 0-0) -> 5 pts" (línea 50) | Esperar **2 pts**, regla `QUALIFIED_TEAM`. |
| "Rule 4: qualifier mismatch -> 0 pts" (línea 58) | Sin cambios. |
| "Result registered as draw WITH explicit qualifier triggers a normal match" (línea 106) | Esperar **2 pts**. |
| "Rule 4: predicted qualifier correct on a draw (penalty win)" (línea 182) | Esperar **2 pts**. |
| "RULE_POINTS exports the expected canonical order" (línea 234) | Actualizar a `[8, 7, 6, 5, 2, 3, 2]`. |

### Tests nuevos a agregar

1. **"Rule 4 (nuevo): empate exacto + clasificado correcto → 5 pts"**
   - Pred: `{home:1, away:1, qualified:'home'}` — Real: `{home:1, away:1, qualified:'home'}`.
   - Esperado: 5 pts, regla `QUALIFIED_TEAM_ON_DRAW_EXACT`.

2. **"Rule 4 (general): predice empate con marcador incorrecto + clasificado correcto → 2 pts"**
   - Pred: `{home:2, away:2, qualified:'home'}` — Real: `{home:1, away:1, qualified:'home'}`.
   - Esperado: 2 pts, regla `QUALIFIED_TEAM`.

## Cambios en UI

### `src/views/Home.vue` (líneas 85-125, modal "Cómo se calculan los puntos")

- Actualizar el texto para mencionar la nueva sub-regla de empate con 5 pts.
- Cambiar "5 pts" por "2 pts" en la regla general de clasificado.

### `src/components/ParticipantModal.vue` (`RULE_LABELS`, líneas 187-193)

- Agregar `QUALIFIED_TEAM_ON_DRAW_EXACT: '5 pts'` (especial de empate).
- Cambiar `QUALIFIED_TEAM: '5 pts'` → `QUALIFIED_TEAM: '2 pts'`.

## Cambios en documentación

### `README.md` (líneas 8-22, tabla de reglas)

- Actualizar la tabla para reflejar las nuevas reglas.

## Verificación

- `npm test` debe pasar todos los tests (incluyendo los nuevos).
- `npm run test:points` específicamente para los tests de puntos.
- Revisar manualmente el modal de reglas en el frontend.

## Riesgos

- **Bajo:** La lógica de `QUALIFIED_TEAM` solo se activa en casos de empate real (porque ahí `winnerCorrect` siempre es false), por lo que el cambio es efectivamente una reducción de puntaje en esos casos — salvo cuando el usuario también predice el marcador exacto del empate.
- El cambio no afecta partidos normales (sin empate) porque en esos casos el clasificado implícito coincide con el ganador y las reglas de ganador tienen mayor prioridad.