# MediaMotionLab — Conversor Excel a CSV v01.02

Aplicación de escritorio que convierte a CSV los modelos Excel utilizados por Producción de Promos y Continuidad para solicitar piezas a montadores y grafistas.

Estos modelos contienen datos de competiciones y equipos, centralizados en SharePoint y mantenidos por Documentación. Cada Excel está preparado para un tipo de pieza (cierres de promos, taquillas, combos, etc.).

Los CSV generados se importan en After Effects para rellenar automáticamente los datos y adaptar los gráficos según la información de cada pieza.

La conversión puede realizarla cualquier usuario, tanto desde Producción antes de enviar la petición como desde los equipos de Montaje y Grafismo al recibirla.

La aplicación se desarrolló para sustituir una funcionalidad de conversión automática que se perdió con la implantación de iTracker.

Esta copia parte de `Build_v01_02`, con el nombre MediaMotionLab y sin logos, imágenes ni icono personalizado. El ejecutable se ha recompilado con estos cambios. La función de conversión se mantiene sin cambios.

## Código y dependencias

`MPM_Excel-CSV_GUI_v01_02.py` contiene la interfaz Tkinter y la función `xlsx_to_csv_ae_friendly`. Utiliza `openpyxl` para leer Excel.

Desde esta carpeta, con Python y Tkinter disponibles:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe MPM_Excel-CSV_GUI_v01_02.py
```

La dependencia directa es `openpyxl==3.1.5`. Pillow ya no es necesario para la interfaz.

## Salida y límites

- Exporta una hoja por operación, con comas como separador, UTF-8 sin BOM y saltos de línea LF. Los campos con comas, comillas o saltos de línea se entrecomillan según las reglas de `csv.writer`.
- Las celdas sin valor se escriben vacías. El número de columnas se toma de `max_column` de la hoja; un rango usado mayor que los datos puede producir filas o columnas vacías adicionales.
- Lee los valores almacenados de las fórmulas, sin recalcularlas. Si Excel no ha guardado un resultado, la celda puede salir vacía. Conviene recalcular y guardar el libro antes de convertir.
- No conserva estilos ni formatos de presentación, como ceros iniciales aplicados mediante formato numérico. No admite el formato antiguo `.xls` desde la interfaz.
- La conversión se ejecuta en el hilo de la interfaz; un libro grande puede dejar la ventana sin responder mientras termina.
- Si se elige un CSV existente, se sobrescribe. La escritura no es atómica: un fallo durante la conversión puede dejar un archivo incompleto.

## Uso en Windows

El ejecutable está empaquetado para ejecutarse sin instalar Python. Para distribuirlo, basta con copiar el `.exe`.

## Generar un ejecutable

Con el entorno anterior preparado, en Windows y desde esta carpeta:

```powershell
.\.venv\Scripts\python.exe -m pip install pyinstaller==6.22.2
.\.venv\Scripts\python.exe -m PyInstaller --clean --noconfirm MPM_Excel-CSV_GUI_v01_02.spec
```

La salida se genera en `dist/MPM_Excel-CSV_GUI_v01_02.exe`. El archivo `.spec` no incorpora imágenes ni icono personalizado. El ejecutable incluido se ha generado en Windows con Python 3.11.0 y PyInstaller 6.22.2. No se garantiza una compilación idéntica byte a byte en otro entorno.

## Alcance de la revisión

Revisión: 29 de octubre de 2026. Se ha comprobado la importación del código y una conversión con datos sintéticos: Unicode, comas, comillas, saltos de línea y celdas vacías. Se ha verificado que la salida no lleva BOM y que la función de conversión coincide con la original.

Se ha recompilado el ejecutable. No se ha realizado una prueba interactiva de la interfaz ni de importación en After Effects.

SHA-256 del ejecutable incluido: 465bcbde4e89710d8497a59ee29614bc730693b11cde061c1a476b829b405c51
