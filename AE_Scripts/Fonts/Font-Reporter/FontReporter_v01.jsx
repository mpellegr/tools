{
    // Pedir al usuario que confirme que quiere ejecutar el script
    app.beginUndoGroup("Informe de tipografías");

    // Objeto para agrupar capas por tipografía
    var fontMap = {};

    // Función que examina cada ítem del proyecto
    function scanProject() {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                scanComp(item);
            }
        }
    }

    // Función que recorre todas las capas de una composición
    function scanComp(comp) {
        for (var j = 1; j <= comp.numLayers; j++) {
            var layer = comp.layer(j);
            if (layer instanceof TextLayer) {
                var textProp = layer.property("Source Text");
                var textDocument = textProp.value;
                var fontName = textDocument.font;
                if (!fontMap[fontName]) {
                    fontMap[fontName] = [];
                }
                fontMap[fontName].push({
                    compName: comp.name,
                    layerName: layer.name
                });
            }
        }
    }

    // Ejecutar el escaneo
    scanProject();

    // Montar el contenido del informe
    var report = "";
    for (var font in fontMap) {
        report += "Tipografía: " + font + "\r\n";
        var entries = fontMap[font];
        for (var k = 0; k < entries.length; k++) {
            report += "  • Compo: " + entries[k].compName +
                      " — Capa: " + entries[k].layerName + "\r\n";
        }
        report += "\r\n";
    }

    // Pedir al usuario dónde guardar el archivo
    var reportFile = File.saveDialog("Guardar informe de tipografías como…", "*.txt");
    if (reportFile) {
        reportFile.open("w");
        reportFile.write(report);
        reportFile.close();
        alert("Informe guardado en:\n" + reportFile.fsName);
    } else {
        // Si el usuario cancela, mostrar el informe en ventana de alerta
        alert(report);
    }

    app.endUndoGroup();
}
