# ColorControlCentralizer - Estado actual

## Version recomendada

La version activa y recomendada es:

`ColorControlCentralizer_v02_04.jsx`

Ruta:

`Scripts/AfterEffects/Replacers/ColorControlCentralizer_v02_04.jsx`

Esta version incluye UI flotante, tolerancia de agrupacion, exportacion CSV,
tratamiento especial para textos, revision manual desde UI y navegacion a capas
con problemas.

## Objetivo del script

Centralizar el control de color en proyectos complejos de After Effects:

- Crear una comp `COLOR_CONTROL`.
- Crear dentro un Shape Layer `COLOR_CONTROL`.
- Detectar colores usados en composiciones del proyecto.
- Agrupar colores unicos, con tolerancia configurable.
- Crear un `Expression Controls / Color Control` por color.
- Crear una paleta visual de cuadrados `50x50` en la comp de control.
- Reemplazar colores modificables por expresiones hacia los controles centrales.
- Generar un informe CSV con cambios aplicados y casos que requieren revision.

## Comportamiento principal

Al pulsar `ANALISAR`, el script:

1. Desbloquea layers bloqueados.
2. Crea o actualiza la comp `COLOR_CONTROL`.
3. Recorre las comps del proyecto, excluyendo `COLOR_CONTROL`.
4. Detecta propiedades de color por `PropertyValueType.COLOR`, no solo por nombre.
5. Agrupa colores similares usando el slider `Tolerancia` de `0` a `10`.
6. Crea controles `Color_01`, `Color_02`, etc.
7. Dibuja una paleta de swatches ligada a esos controles.
8. Aplica expresiones a propiedades seguras.
9. Exporta un CSV UTF-8 con BOM.
10. Muestra en la UI los casos omitidos o de revision manual.

La expresion base aplicada es:

```jsx
comp("COLOR_CONTROL").layer("COLOR_CONTROL").effect("Color_06")(1)
```

## Tolerancia de color

La tolerancia se mide en pasos RGB de 8 bits por canal.

- `0`: precision absoluta. Solo agrupa colores identicos.
- `1`: colores como `#00FF47` y `#00FF48` pueden agruparse.
- `10`: limpieza mas agresiva de paleta.

El color representativo de un grupo es el primer color encontrado para ese grupo.

## Deteccion de colores

Desde `v02_03`, el script detecta cualquier propiedad real de tipo color mediante:

`PropertyValueType.COLOR`

Esto permite detectar propiedades comunes que no se llaman literalmente `Color`,
por ejemplo:

- `Tint`: `Map Black To`, `Map White To`
- `Tritone`: `Highlights`, `Midtones`, `Shadows`
- Efectos de Fill, Stroke o Glow con nombres especificos de color

## Propiedades animadas

Las propiedades de color con keyframes no se modifican automaticamente.

Motivo: aplicar una expresion directa sobrescribe visualmente la animacion de
color aunque los keyframes sigan existiendo.

Estos casos se mandan al CSV/UI como:

`MANUAL_REVIEW`

Razon:

`Animated color property; expression would override keyframed color values`

En `v02_04`, la UI permite seleccionar una de estas filas y aplicar la expresion
manualmente con el boton `APLICAR EXPRESSION`, si se decide aceptar ese override.

## Capas de texto

Para capas de texto con color base en `Source Text > fillColor`, el script usa
un enfoque especial.

Si la capa de texto:

- tiene `fillColor`,
- no tiene `Source Text` animado,
- y no tiene ya un animator con propiedad activa de color,

entonces el script crea un Text Animator:

`COLOR_CONTROL_Fill`

Y dentro anade una propiedad:

`Fill Color`

con expresion hacia el `Color Control` correspondiente.

Si el texto ya tiene un animator con `Fill Color` o `Stroke Color` activo, se
marca para revision manual:

`Text layer already has a color animator`

Si `Source Text` esta animado, tambien se marca para revision manual:

`Animated Source Text; fillColor can vary by keyframe`

## Propiedades ignoradas

El script ignora propiedades de color que After Effects expone internamente pero
que no estan activas ni visibles para el usuario.

Casos conocidos:

- `Text > Animators > Animator X > Properties > Back Color`
- `Bevel Color`
- `Fill Color`
- `Front Color`
- `Side Color`
- `Stroke Color`
- `Material Options` de layers no 3D
- colores internos de `Layer Styles` ocultos

Estas propiedades no se listan como `OMITTED`, porque generan ruido y no
representan colores realmente editables del proyecto.

El resumen final muestra:

`Propiedades inactivas ignoradas: N`

## CSV

Cada ejecucion genera un CSV en:

`Scripts/AfterEffects/Replacers/`

Con nombre:

`ColorControlCentralizer_v02_04_log_YYYYMMDD_HHMMSS.csv`

Los CSV de esta carpeta estan ignorados por Git:

```gitignore
Scripts/AfterEffects/Replacers/*.csv
```

El CSV se escribe como UTF-8 con BOM para abrir correctamente en Excel.

Orden de bloques:

1. `OMITTED_PROPERTIES`
2. `APPLIED_CHANGES`

Columnas:

- `Status`
- `Reason`
- `Comp`
- `Layer Index`
- `Layer Name`
- `Property Path`
- `Original HEX`
- `Original RGB`
- `Assigned Control`
- `Control HEX`
- `Control RGB`
- `Expression`

## UI actual

La ventana flotante incluye:

- Titulo `Color Control Centralizer v02_04`
- Slider `Tolerancia` de `0` a `10`
- Campo numerico sincronizado
- Boton `ANALISAR`
- Tabla `Omitted / manual review`
- Campo editable con la expresion de la fila seleccionada
- Boton `APLICAR EXPRESSION`

La tabla muestra:

- `Comp`
- `Layer`
- `Property`
- `Reason`
- `Expression`

Doble click en una fila:

- abre la comp,
- selecciona el layer,
- intenta seleccionar la propiedad si AE lo permite.

Boton `APLICAR EXPRESSION`:

- aplica la expresion de la fila seleccionada a la propiedad apuntada,
- incluso si la propiedad estaba animada,
- muestra error si After Effects no permite aplicar esa expresion.

## Historial de versiones

- `v01`: primera version directa, sin UI.
- `v02`: UI flotante con tolerancia.
- `v02_02`: CSV con aplicadas y omitidas, UTF-8 BOM, filtrado de Layer Styles ocultos.
- `v02_03`: soporte de textos con Text Animator, deteccion por tipo de color, casos animados a revision manual, filtros para propiedades inactivas.
- `v02_04`: tabla de omitidas/manual review en UI, navegacion por doble click, visualizacion y aplicacion manual de expresiones.

## Commits relevantes

- `9758a61` - New script: Color Control Centralizer
- `b5a70d9` - Feat: UI and Tolerance added
- `42b4a1f` - Add color control centralizer v02_03
- `f89ab3f` - Add color control centralizer v02_04 review UI
- `28ff3db` - Add color control centralizer v02_02 CSV log
- `d45279a` - Ignore Replacers CSV logs

Nota: `v02_02` fue commiteado despues de `v02_04`, aunque historicamente es una
version anterior del script.

## Limitaciones conocidas

- La seleccion exacta de una propiedad desde scripting es best effort; AE no
  siempre permite seleccionar cualquier propiedad programaticamente.
- Las propiedades de color animadas se envian a revision manual por seguridad.
- El boton `APLICAR EXPRESSION` permite forzar expresiones sobre propiedades
  animadas, pero esto puede cambiar el resultado visual al sobrescribir los
  keyframes.
- El agrupamiento con tolerancia usa el primer color encontrado como color
  representativo del grupo.
- El script no hace todavia una fase separada de "analizar sin modificar".

## Posibles siguientes pasos

- Separar `ANALISAR` de `APLICAR CAMBIOS`.
- Anadir preview de colores encontrados antes de modificar el proyecto.
- Permitir excluir comps, layers o tipos de propiedades.
- Guardar una ruta tecnica mas robusta para abrir propiedades concretas.
- Crear un modo de consolidacion de colores animados mas avanzado, si compensa
  el riesgo de fragilidad.
