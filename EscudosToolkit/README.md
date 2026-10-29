# Escudos Toolkit

Toolkit PowerShell + ImageMagick para inventariar, normalizar y comparar escudos/logotipos distribuidos en carpetas y subcarpetas.

## Requisitos

- Windows 10/11.
- Windows PowerShell 5.1 o PowerShell 7.
- ImageMagick 7.x instalado y disponible desde terminal mediante `magick`.
- Ghostscript si se quieren leer y convertir formatos AI, EPS, PS o PDF compatibles con ImageMagick.

Comprobar ImageMagick:

```powershell
magick -version
```

Si `magick` no está disponible, el toolkit ofrece instalar ImageMagick mediante `winget`. Tras la instalación hay que cerrar y volver a abrir PowerShell para actualizar `PATH`.

El toolkit también comprueba la presencia de Ghostscript (`gswin64c`, `gswin32c` o `gs`). Si falta, muestra instrucciones y el enlace oficial para instalarlo manualmente. No intenta instalar Ghostscript mediante `winget`, porque ese paquete no está disponible de forma suficientemente estable. El toolkit puede continuar con PNG, JPG, SVG y otros formatos que no dependan de Ghostscript, pero AI, EPS, PS y PDF no podrán procesarse.

Instalación manual:

1. Descargar Ghostscript para Windows 64-bit desde <https://ghostscript.com/releases/gsdnld.html>.
2. Instalarlo con las opciones predeterminadas.
3. Cerrar y volver a abrir PowerShell.
4. Comprobar la instalación con `gswin64c --version`.

Los archivos AI deben haberse guardado con contenido PDF/PostScript compatible; en Illustrator se recomienda activar **Crear archivo compatible con PDF**.

### Tratamiento de SVG

En ImageMagick, el fondo y la densidad deben establecerse antes de cargar un SVG. El toolkit usa fondo transparente y densidad de 600 DPI antes de rasterizarlo; después recorta, escala y centra el resultado. Esto evita que las áreas sin dibujo se conviertan accidentalmente en rectángulos blancos. A diferencia de PNG, JPG y otros formatos raster, un SVG puede ampliarse hasta el tamaño solicitado sin activar la limitación de resolución.

AI, EPS, PS y PDF compatibles reciben el mismo tratamiento vectorial con una densidad de 300 DPI y también pueden ampliarse. Para AI, un fallo de lectura indica ahora explícitamente que deben comprobarse Ghostscript y la opción de compatibilidad PDF del archivo.

## Ejecución

Puedes ejecutar `run.bat` con doble clic. El lanzador permite scripts solo en ese proceso, sin modificar la política persistente del sistema. También puedes iniciarlo desde PowerShell:

```powershell
cd "C:\ruta\del\proyecto"
.\EscudosToolkit.ps1
```

Si PowerShell bloquea scripts:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\EscudosToolkit.ps1
```

El cambio de ExecutionPolicy anterior solo afecta a la sesión actual.

El menú permanece abierto después de completar cada operación. Pulsa Enter cuando se solicite para regresar al menú. La opción `5. Salir` también espera una confirmación antes de cerrar la ventana.

## Modos

### 4. Verificar y organizar estructura de carpetas

Esta operación es independiente del procesamiento de imágenes. Los modos 1 y 2 no mueven archivos ni crean `ORIGINALES`.

Al seleccionar la opción 4, el toolkit pregunta si la ruta corresponde a:

1. `ROOT`, que contiene varias carpetas de competición.
2. Una competición específica.

La estructura canónica es:

```text
ROOT/
├── COMPETICION1/
│   ├── ORIGINALES/
│   └── 540x540/
├── COMPETICION2/
│   ├── ORIGINALES/
│   └── 540x540/
└── COMPETICION3/
    └── ORIGINALES/
```

Durante la verificación previa:

- Las carpetas auxiliares `_ejemplos` y `_Informes` se ignoran por completo.
- Se crea `ORIGINALES` dentro de cada competición cuando no existe.
- Las imágenes sueltas situadas directamente dentro de una competición se mueven a `ORIGINALES`.
- Los movimientos nunca sobrescriben archivos; ante una colisión se añade un sufijo.
- Las carpetas de output con patrón cuadrado `NxN`, como `540x540`, se conservan y no se reprocesan.
- Si se encuentra una carpeta `OLD`, se informa de su ruta. La carpeta se conserva sin cambios y se excluye del procesamiento.
- Se auditan todas las imágenes que estén dentro de carpetas `NxN`. El ancho y alto reales del lienzo deben coincidir exactamente con el tamaño indicado por la carpeta.

La auditoría dimensional genera un CSV con todos los archivos revisados en:

```text
EscudosToolkit/_Informes/verificacion_carpetas_nxn_<fecha_hora>.csv
```

Cada fila se marca como:

- `OK`: dimensiones coherentes con la carpeta.
- `FueraEspecificacion`: el ancho o el alto no coincide con `NxN`.
- `NoLegible`: ImageMagick no pudo leer el archivo.

El informe incluye archivo, extensión, ruta, carpeta `NxN`, dimensiones esperadas y dimensiones reales. La validación comprueba el lienzo completo, no el bounding box del contenido: un escudo centrado con contenido menor sigue siendo válido si su imagen mide exactamente, por ejemplo, `540x540`.

### 1. Normalizar imágenes + generar informe

El usuario introduce:

- Carpeta raíz.
- Tamaño cuadrado de salida, por ejemplo `540`.

El script:

- Recorre archivos recursivamente.
- Rechaza GIF y PSD de forma explícita y recomienda guardarlos previamente como PNG.
- Usa ImageMagick para decidir si cada archivo es una imagen legible; no depende únicamente de la extensión.
- Ignora `_ejemplos`, `_Informes`, `OLD` y cualquier carpeta de output cuyo nombre siga el patrón cuadrado `NxN`, por ejemplo `540x540` o `1080x1080`.
- Obtiene dimensiones completas (`OriginalBoxDims`).
- Obtiene el bounding box del contenido ignorando márgenes transparentes (`OriginalFillDims`).
- Detecta imágenes completamente opacas y marca `Alpha!`.
- Marca `Resolución!` cuando el lado mayor del contenido es menor que el tamaño solicitado.
- Recorta los márgenes transparentes.
- Mantiene proporciones.
- No amplía imágenes cuya resolución útil sea inferior al objetivo.
- En SVG, AI, EPS, PS y PDF permite ampliar por tratarse de formatos vectoriales y rasteriza con fondo transparente a alta densidad.
- Centra el resultado en un lienzo cuadrado transparente.
- Exporta PNG32.
- Crea una subcarpeta `<ancho>x<alto>` junto al original.
- Nunca sobrescribe un PNG existente. Si varios originales comparten carpeta y nombre base, todos reciben la extensión original como sufijo, por ejemplo `equipo_ai.png` y `equipo_png.png`. Si el destino aún existe, añade un contador.
- Genera un CSV de informe.
- Genera un CSV separado de errores y rechazos cuando sea necesario.

El nombre del informe incorpora la carpeta seleccionada y el tamaño solicitado:

```text
informe_<NOMBRE_DE_LA_CARPETA>_<tamaño>.csv
```

Ejemplos:

```text
informe_COMPETICION_A_540.csv
informe_COMPETICION_B_540.csv
```

### 2. Solo generar informe

Hace el mismo análisis, pero:

- No crea carpetas de output.
- No modifica ni convierte archivos.
- Calcula las dimensiones de salida de forma teórica.

### 3. Comparar similitud

Lee un CSV generado por el propio toolkit y compara el `dHash` de todas las imágenes.

El dHash es de 64 bits:

- Distancia `0`: hashes idénticos.
- Distancia baja: mayor similitud estructural.
- Distancia alta: menor similitud.

Como punto de partida se propone un umbral entre `4` y `8`, pero debe calibrarse con el dataset real.

El resultado se guarda en:

```text
similares_dhash_<umbral>.csv
```

## Columnas del CSV

| Columna | Contenido |
|---|---|
| `NombreArchivo` | Nombre sin extensión |
| `ExtensionOriginal` | Extensión del archivo original, con punto y en minúsculas |
| `REVISAR` | `OK`, `Alpha!`, `Resolución!`, o combinación |
| `OriginalPath` | Ruta del archivo original |
| `OutputPath` | Ruta generada; queda vacía en modo solo informe |
| `OriginalBoxDims` | Tamaño completo del lienzo original |
| `OriginalFillDims` | Tamaño del contenido ignorando márgenes transparentes |
| `OutputBoxDims` | Tamaño cuadrado solicitado |
| `OutputFillDims` | Tamaño calculado del contenido tras normalización |
| `ImageSignature` | Signature de ImageMagick sobre imagen normalizada |
| `dHash` | Difference hash de 64 bits |

Cuando existen rechazos o fallos se crea además:

```text
errores_<NOMBRE_DE_LA_CARPETA>_<tamaño>.csv
```

Incluye la ruta original, el estado (`Rechazado` o `Error`), la operación y el mensaje. Los archivos fallidos no se contabilizan como conversiones correctas.

## Formatos rechazados

GIF y PSD no se procesan, aunque ImageMagick pueda leerlos, porque pueden contener múltiples frames o capas y su interpretación no es inequívoca. Deben exportarse previamente a un formato de imagen único; se recomienda PNG.

## Importante: ImageSignature no es pHash

Las versiones anteriores del proyecto usaban:

```powershell
-format "%#"
```

y lo llamaban `PerceptualHash`.

Según la documentación oficial de ImageMagick, `%#` es la **signature hash de los valores de imagen**, no un perceptual hash. Por eso no debe compararse mediante distancia de Hamming esperando similitud perceptual.

El toolkit la conserva como `ImageSignature` por utilidad diagnóstica, pero el comparador usa `dHash`.

ImageMagick sí dispone de una métrica `PHASH` real mediante `compare -metric PHASH`, pero no devuelve un hash binario simple equivalente a `%#`. Una evolución posible es usar `PHASH`, `SSIM` o `NCC` como segunda fase de validación de candidatos.

## Próximas mejoras recomendadas

- Separar el toolkit en módulos `.psm1`.
- Añadir un modo dry-run.
- Añadir clusters de duplicados en vez de únicamente parejas.
- Añadir una segunda fase de comparación `PHASH` / `SSIM` sobre candidatos dHash.
- Añadir tests con un dataset pequeño y conocido.
- Sustituir escritura manual de CSV por objetos + `Export-Csv` en todos los puntos.
- Revisar, si aparece la necesidad, el tratamiento específico de AI y EPS multipágina.

## Datos locales y comportamiento de escritura

Los CSV contienen rutas y nombres de los archivos analizados. Revísalos antes de compartirlos. Los informes generados quedan excluidos de Git mediante `.gitignore`.

La opción 4 mueve las imágenes sueltas a `ORIGINALES`; utilízala sobre una copia si necesitas conservar la estructura inicial. Los PNG existentes no se sobrescriben, pero los informes con el mismo nombre sí pueden reemplazarse en ejecuciones posteriores. No hay modo dry-run.

La comparación dHash devuelve candidatos, no confirma duplicados. La comparación por parejas crece de forma cuadrática con la cantidad de imágenes.

## Distribución

Incluye el script y esta guía de uso. No incluye documentación de trabajo, PDF de referencia, imágenes de terceros ni informes anteriores. El script se conserva sin cambios funcionales respecto a la versión de origen.

