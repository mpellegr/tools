/*
ColorControlCentralizer_v01.jsx

Creates a COLOR_CONTROL comp with one COLOR_CONTROL shape layer, collects unique
color properties across the project, creates one Color Control effect per unique
color, draws a palette preview, and links source color properties by expression.
*/

(function colorControlCentralizer() {
    var CONTROL_COMP_NAME = "COLOR_CONTROL";
    var CONTROL_LAYER_NAME = "COLOR_CONTROL";
    var EFFECT_PREFIX = "Color_";
    var SWATCH_SIZE = 50;
    var SWATCH_GAP = 12;
    var SWATCH_MARGIN = 30;
    var SWATCHES_PER_ROW = 10;

    if (!app.project) {
        alert("No project is open.");
        return;
    }

    app.beginUndoGroup("Centralize Color Controls");

    var unlockedCount = 0;
    var scannedColorProps = [];
    var uniqueColors = [];
    var colorLookup = {};
    var expressionCount = 0;
    var skippedExpressionCount = 0;

    function padNumber(value, width) {
        var result = String(value);
        while (result.length < width) {
            result = "0" + result;
        }
        return result;
    }

    function clamp01(value) {
        if (value < 0) {
            return 0;
        }
        if (value > 1) {
            return 1;
        }
        return value;
    }

    function colorKey(colorValue) {
        var r = Math.round(clamp01(colorValue[0]) * 255);
        var g = Math.round(clamp01(colorValue[1]) * 255);
        var b = Math.round(clamp01(colorValue[2]) * 255);
        return padNumber(r, 3) + "_" + padNumber(g, 3) + "_" + padNumber(b, 3);
    }

    function normalizeColor(colorValue) {
        return [
            clamp01(colorValue[0]),
            clamp01(colorValue[1]),
            clamp01(colorValue[2]),
            colorValue.length > 3 ? clamp01(colorValue[3]) : 1
        ];
    }

    function findCompByName(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === name) {
                return item;
            }
        }
        return null;
    }

    function unlockAllLayers() {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) {
                continue;
            }

            for (var l = 1; l <= item.numLayers; l++) {
                var layer = item.layer(l);
                if (layer.locked) {
                    layer.locked = false;
                    unlockedCount++;
                }
            }
        }
    }

    function getOrCreateControlComp() {
        var comp = findCompByName(CONTROL_COMP_NAME);
        if (comp) {
            return comp;
        }

        return app.project.items.addComp(CONTROL_COMP_NAME, 1920, 1080, 1, 10, 25);
    }

    function removeExistingControlLayer(controlComp) {
        for (var i = controlComp.numLayers; i >= 1; i--) {
            var layer = controlComp.layer(i);
            if (layer.name === CONTROL_LAYER_NAME) {
                layer.remove();
            }
        }
    }

    function createControlLayer(controlComp) {
        removeExistingControlLayer(controlComp);

        var layer = controlComp.layers.addShape();
        layer.name = CONTROL_LAYER_NAME;
        layer.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
        layer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        return layer;
    }

    function addUniqueColor(colorValue) {
        var normalized = normalizeColor(colorValue);
        var key = colorKey(normalized);

        if (!colorLookup[key]) {
            var index = uniqueColors.length + 1;
            colorLookup[key] = {
                key: key,
                color: normalized,
                effectName: EFFECT_PREFIX + padNumber(index, 2)
            };
            uniqueColors.push(colorLookup[key]);
        }

        return colorLookup[key];
    }

    function isColorProperty(prop) {
        try {
            return prop.propertyType === PropertyType.PROPERTY &&
                   prop.propertyValueType === PropertyValueType.COLOR &&
                   prop.name === "Color";
        } catch (err) {
            return false;
        }
    }

    function scanPropertyGroup(group, comp, layer) {
        if (!group || !group.numProperties) {
            return;
        }

        for (var i = 1; i <= group.numProperties; i++) {
            var prop;
            try {
                prop = group.property(i);
            } catch (errProp) {
                continue;
            }

            if (!prop) {
                continue;
            }

            if (isColorProperty(prop)) {
                try {
                    var colorInfo = addUniqueColor(prop.value);
                    scannedColorProps.push({
                        comp: comp,
                        layer: layer,
                        prop: prop,
                        colorInfo: colorInfo
                    });
                } catch (errColor) {
                    // Some plugin properties can report as Color but reject value reads.
                }
            }

            if (prop.propertyType === PropertyType.NAMED_GROUP ||
                prop.propertyType === PropertyType.INDEXED_GROUP) {
                scanPropertyGroup(prop, comp, layer);
            }
        }
    }

    function scanProjectColors(controlComp) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem) || item === controlComp) {
                continue;
            }

            for (var l = 1; l <= item.numLayers; l++) {
                scanPropertyGroup(item.layer(l), item, item.layer(l));
            }
        }
    }

    function createColorControls(controlLayer) {
        var effects = controlLayer.property("ADBE Effect Parade");

        for (var i = 0; i < uniqueColors.length; i++) {
            var info = uniqueColors[i];
            var colorControl = effects.addProperty("ADBE Color Control");
            colorControl.name = info.effectName;
            colorControl.property(1).setValue(info.color);
        }
    }

    function createPaletteSwatches(controlLayer) {
        var contents = controlLayer.property("ADBE Root Vectors Group");

        for (var i = 0; i < uniqueColors.length; i++) {
            var info = uniqueColors[i];
            var col = i % SWATCHES_PER_ROW;
            var row = Math.floor(i / SWATCHES_PER_ROW);
            var x = SWATCH_MARGIN + (SWATCH_SIZE / 2) + col * (SWATCH_SIZE + SWATCH_GAP);
            var y = SWATCH_MARGIN + (SWATCH_SIZE / 2) + row * (SWATCH_SIZE + SWATCH_GAP);

            var group = contents.addProperty("ADBE Vector Group");
            group.name = info.effectName + "_Swatch";

            var vectors = group.property("ADBE Vectors Group");
            var rect = vectors.addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([SWATCH_SIZE, SWATCH_SIZE]);
            rect.property("ADBE Vector Rect Position").setValue([0, 0]);

            var fill = vectors.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").expression = 'effect("' + info.effectName + '")(1)';

            var stroke = vectors.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Color").setValue([0, 0, 0, 1]);
            stroke.property("ADBE Vector Stroke Width").setValue(1);
            stroke.property("ADBE Vector Stroke Opacity").setValue(25);

            group.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([x, y]);
        }
    }

    function applyColorExpressions() {
        for (var i = 0; i < scannedColorProps.length; i++) {
            var item = scannedColorProps[i];
            var expression = 'comp("' + CONTROL_COMP_NAME + '").layer("' + CONTROL_LAYER_NAME + '").effect("' + item.colorInfo.effectName + '")(1)';

            try {
                if (item.prop.canSetExpression) {
                    item.prop.expression = expression;
                    expressionCount++;
                } else {
                    skippedExpressionCount++;
                }
            } catch (errExpression) {
                skippedExpressionCount++;
            }
        }
    }

    try {
        unlockAllLayers();

        var controlComp = getOrCreateControlComp();
        var controlLayer = createControlLayer(controlComp);

        scanProjectColors(controlComp);
        createColorControls(controlLayer);
        createPaletteSwatches(controlLayer);
        applyColorExpressions();

        alert(
            "COLOR_CONTROL creado/actualizado.\n\n" +
            "Layers desbloqueados: " + unlockedCount + "\n" +
            "Propiedades Color encontradas: " + scannedColorProps.length + "\n" +
            "Colores unicos: " + uniqueColors.length + "\n" +
            "Expresiones aplicadas: " + expressionCount + "\n" +
            "Propiedades omitidas: " + skippedExpressionCount
        );
    } catch (err) {
        alert("Error creando COLOR_CONTROL:\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
}());
