# Image Analyzer

Aplicación experimental local para analizar una carpeta de imágenes, consultar sus metadatos y agrupar imágenes relacionadas. Utiliza Streamlit y EfficientNet-B0, combinando imagen completa, recorte central, tamaño y similitud de nombres.

## Uso

Ejecuta `run.bat` o:

```powershell
.\.venv\Scripts\python.exe -m streamlit run app.py --server.address=127.0.0.1
```

Introduce una carpeta local, ajusta `Distance threshold` y pulsa `Run analysis`. Un umbral menor tiende a separar más grupos. Consulta la tabla y descarga el CSV. Las imágenes se procesan localmente; la primera carga del modelo puede descargar sus pesos preentrenados.

Formatos: JPG, JPEG, PNG, TIFF, GIF, BMP y WebP. No recorre subcarpetas. En archivos con varias imágenes no analiza todas las páginas o fotogramas.

## Resultados y límites

Exporta identificador y tamaño de cluster, nombre, extensión, dimensiones, proporción, tamaño de archivo, fecha de modificación y ruta. 

- El agrupamiento es heurístico: no garantiza duplicados ni equivalencia de contenido.
- Las reglas de nombres pueden unir imágenes visualmente diferentes.
- El modelo vuelve a cargarse en cada análisis y las matrices crecen de forma cuadrática con el número de imágenes. Empieza con carpetas pequeñas.
- Los archivos que no se pueden procesar se omiten y se registran en consola.
- Una carpeta sin imágenes válidas devuelve una lista vacía. Una única imagen válida forma un grupo de tamaño uno.
- La interfaz no conserva los resultados entre todas las interacciones o recargas.
- La aplicación está pensada para uso local; no incorpora autenticación para servirla a terceros.

## Referencia PowerShell

`reference/GetImageInfo_v03.ps1` conserva un extractor experimental que requiere ImageMagick (`magick` en PATH):

```powershell
.\reference\GetImageInfo_v03.ps1 -FolderPath .\examples -OutputCsv .\inventory.csv
```

Extrae metadatos y añade brillo, textura/contraste, average hash y un color aproximado al reducir a un píxel. Admite PSD en su filtro, pero depende de que ImageMagick lo pueda leer. No realiza clustering. Estas métricas no están implementadas en la aplicación Python. El hash y la textura necesitan validación; el análisis de salida de ImageMagick puede producir campos vacíos. El color calculado no es necesariamente el color dominante.

## Instalación en Windows

Requiere Python 3.11 de 64 bits. Desde esta carpeta:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Las versiones de dependencias se conservan del prototipo; su instalación en un entorno limpio está pendiente de verificación.

## Archivos

- `app.py`: interfaz Streamlit.
- `image_analyzer_core.py`: análisis y agrupación.
- `run.bat`: lanzador local para Windows.
- `requirements.txt`: dependencias de Python.
- `reference/`: extractor PowerShell conservado como referencia.
- `examples/`: imágenes geométricas sintéticas, sin datos de terceros.

Esta distribución no incluye entornos virtuales, informes previos ni imágenes procedentes de otros proyectos. No se ha añadido una licencia de distribución.
