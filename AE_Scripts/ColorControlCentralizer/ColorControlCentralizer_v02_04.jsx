/*
ColorControlCentralizer_v02_04.jsx

Creates a floating UI to centralize project colors into a COLOR_CONTROL comp.
Tolerance is measured in 8-bit RGB channel steps. A tolerance of 0 keeps exact
matching; higher values merge visually similar colors into the first match found.
Exports a CSV log with applied and omitted color properties. Text layers with a
base fill color can be linked through a dedicated Fill Color text animator when
they do not already contain a color animator. Manual review rows are shown in
the UI and can be double-clicked to jump to the comp/layer.
*/

(function colorControlCentralizerUI(thisObj) {
    var CONTROL_COMP_NAME = "COLOR_CONTROL";
    var CONTROL_LAYER_NAME = "COLOR_CONTROL";
    var EFFECT_PREFIX = "Color_";
    var SWATCH_SIZE = 50;
    var SWATCH_GAP = 12;
    var SWATCH_MARGIN = 30;
    var SWATCHES_PER_ROW = 10;

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

    function normalizeColor(colorValue) {
        return [
            clamp01(colorValue[0]),
            clamp01(colorValue[1]),
            clamp01(colorValue[2]),
            colorValue.length > 3 ? clamp01(colorValue[3]) : 1
        ];
    }

    function colorToRgb255(colorValue) {
        return [
            Math.round(clamp01(colorValue[0]) * 255),
            Math.round(clamp01(colorValue[1]) * 255),
            Math.round(clamp01(colorValue[2]) * 255)
        ];
    }

    function rgbDistanceWithinTolerance(rgbA, rgbB, tolerance) {
        return Math.abs(rgbA[0] - rgbB[0]) <= tolerance &&
               Math.abs(rgbA[1] - rgbB[1]) <= tolerance &&
               Math.abs(rgbA[2] - rgbB[2]) <= tolerance;
    }

    function colorKeyFromRgb(rgb) {
        return padNumber(rgb[0], 3) + "_" + padNumber(rgb[1], 3) + "_" + padNumber(rgb[2], 3);
    }

    function rgbToHex(rgb) {
        var result = "";
        for (var i = 0; i < 3; i++) {
            var hex = rgb[i].toString(16).toUpperCase();
            if (hex.length < 2) {
                hex = "0" + hex;
            }
            result += hex;
        }
        return "#" + result;
    }

    function csvEscape(value) {
        if (value === null || value === undefined) {
            value = "";
        }

        var text = String(value);
        text = text.replace(/"/g, '""');
        return '"' + text + '"';
    }

    function getScriptFolder() {
        try {
            return File($.fileName).parent;
        } catch (err) {
            return Folder.desktop;
        }
    }

    function getTimestamp() {
        var now = new Date();
        return now.getFullYear() +
            padNumber(now.getMonth() + 1, 2) +
            padNumber(now.getDate(), 2) + "_" +
            padNumber(now.getHours(), 2) +
            padNumber(now.getMinutes(), 2) +
            padNumber(now.getSeconds(), 2);
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

    function runCentralizer(tolerance, onReviewRowsReady) {
        if (!app.project) {
            alert("No project is open.");
            return;
        }

        app.beginUndoGroup("Centralize Color Controls");

        var unlockedCount = 0;
        var scannedColorProps = [];
        var textBaseColorItems = [];
        var uniqueColors = [];
        var expressionCount = 0;
        var textAnimatorExpressionCount = 0;
        var skippedExpressionCount = 0;
        var hiddenIgnoredCount = 0;
        var inactiveIgnoredCount = 0;
        var manualReviewCount = 0;
        var appliedRows = [];
        var omittedRows = [];
        var csvPath = "";

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

        function findMatchingColor(rgb) {
            for (var i = 0; i < uniqueColors.length; i++) {
                if (rgbDistanceWithinTolerance(rgb, uniqueColors[i].rgb, tolerance)) {
                    return uniqueColors[i];
                }
            }
            return null;
        }

        function addUniqueColor(colorValue) {
            var normalized = normalizeColor(colorValue);
            var rgb = colorToRgb255(normalized);
            var match = findMatchingColor(rgb);

            if (match) {
                return match;
            }

            var index = uniqueColors.length + 1;
            var info = {
                key: colorKeyFromRgb(rgb),
                rgb: rgb,
                color: normalized,
                effectName: EFFECT_PREFIX + padNumber(index, 2)
            };

            uniqueColors.push(info);
            return info;
        }

        function isColorProperty(prop) {
            try {
                /*
                Common AE color properties do not always use the visible name
                "Color". Examples:
                - Tint: "Map Black To", "Map White To"
                - Tritone: "Highlights", "Midtones", "Shadows"
                - Fill/Stroke/Glow effects can expose named color slots
                Match by value type instead of display name so these are included.
                */
                return prop.propertyType === PropertyType.PROPERTY &&
                       prop.propertyValueType === PropertyValueType.COLOR;
            } catch (err) {
                return false;
            }
        }

        function isInactiveNonVisibleColorProperty(prop, propertyPath, layer) {
            var path = propertyPath ? propertyPath.toLowerCase() : "";

            try {
                if (prop.canSetExpression) {
                    if (path.indexOf("material options") === -1 ||
                        (layer && layer.threeDLayer)) {
                        return false;
                    }
                }
            } catch (errCanSetExpression) {
                return false;
            }

            /*
            AE exposes possible but inactive color slots in some property groups.
            They are not visible in the timeline until explicitly added/enabled,
            and they cannot accept expressions. Ignore them instead of reporting
            them as omitted project colors.

            Known cases:
            - Text Animator Properties: Back Color, Bevel Color, Fill Color,
              Front Color, Side Color, Stroke Color before they are active.
            - Material Options: color slots such as Shadow Color, Back Color,
              Bevel Color, Front Color, Side Color on non-3D layers.
            - Layer Styles internal colors when the style/property is hidden.
            */
            return (path.indexOf("text > animators") !== -1 &&
                    path.indexOf(" > properties > ") !== -1) ||
                   (path.indexOf("material options") !== -1 &&
                    (!layer || !layer.threeDLayer)) ||
                   path.indexOf("layer styles") !== -1 ||
                   path.indexOf("adbe layer styles") !== -1;
        }

        function getSourceTextProperty(layer) {
            try {
                return layer.property("ADBE Text Properties").property("ADBE Text Document");
            } catch (err) {
                return null;
            }
        }

        function isFilledTextLayer(layer) {
            var sourceText = getSourceTextProperty(layer);
            if (!sourceText) {
                return false;
            }

            try {
                var textDocument = sourceText.value;
                return textDocument &&
                       textDocument.applyFill !== false &&
                       textDocument.fillColor &&
                       textDocument.fillColor.length >= 3;
            } catch (err) {
                return false;
            }
        }

        function textLayerHasColorAnimator(layer) {
            try {
                var textAnimators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
                for (var a = 1; a <= textAnimators.numProperties; a++) {
                    var animator = textAnimators.property(a);
                    var animatorProperties = animator.property("ADBE Text Animator Properties");

                    if (!animatorProperties) {
                        continue;
                    }

                    for (var p = 1; p <= animatorProperties.numProperties; p++) {
                        var animatorProp = animatorProperties.property(p);
                        try {
                            if (animatorProp.propertyType === PropertyType.PROPERTY &&
                                animatorProp.canSetExpression &&
                                (animatorProp.matchName === "ADBE Text Fill Color" ||
                                 animatorProp.matchName === "ADBE Text Stroke Color")) {
                                return true;
                            }
                        } catch (errAnimatorProp) {
                        }
                    }
                }

                return false;
            } catch (err) {
                return false;
            }
        }

        function buildLogRow(item, status, reason, expression) {
            return {
                status: status,
                reason: reason,
                targetComp: item.comp,
                targetLayer: item.layer,
                targetProp: item.prop,
                compName: item.comp.name,
                layerIndex: item.layer.index,
                layerName: item.layer.name,
                propertyPath: item.propertyPath,
                originalHex: item.originalHex,
                originalRgb: item.originalRgb.join(","),
                assignedControl: item.colorInfo.effectName,
                controlHex: rgbToHex(item.colorInfo.rgb),
                controlRgb: item.colorInfo.rgb.join(","),
                expression: expression
            };
        }

        function buildTextLogRow(item, status, reason, expression) {
            return {
                status: status,
                reason: reason,
                targetComp: item.comp,
                targetLayer: item.layer,
                targetProp: null,
                compName: item.comp.name,
                layerIndex: item.layer.index,
                layerName: item.layer.name,
                propertyPath: item.propertyPath,
                originalHex: item.originalHex,
                originalRgb: item.originalRgb.join(","),
                assignedControl: item.colorInfo.effectName,
                controlHex: rgbToHex(item.colorInfo.rgb),
                controlRgb: item.colorInfo.rgb.join(","),
                expression: expression
            };
        }

        function sortLogRows(a, b) {
            if (a.compName !== b.compName) {
                return a.compName < b.compName ? -1 : 1;
            }
            if (a.layerIndex !== b.layerIndex) {
                return a.layerIndex - b.layerIndex;
            }
            if (a.layerName !== b.layerName) {
                return a.layerName < b.layerName ? -1 : 1;
            }
            if (a.propertyPath !== b.propertyPath) {
                return a.propertyPath < b.propertyPath ? -1 : 1;
            }
            return 0;
        }

        function isHiddenExpressionError(err) {
            var message = err ? err.toString().toLowerCase() : "";
            return message.indexOf("hidden") !== -1 &&
                   message.indexOf("expression") !== -1;
        }

        function isLayerStyleProperty(item) {
            var path = item.propertyPath ? item.propertyPath.toLowerCase() : "";
            return path.indexOf("layer styles") !== -1 ||
                   path.indexOf("adbe layer styles") !== -1;
        }

        function writeCsvLog() {
            appliedRows.sort(sortLogRows);
            omittedRows.sort(sortLogRows);

            var file = new File(getScriptFolder().fsName + "/ColorControlCentralizer_v02_04_log_" + getTimestamp() + ".csv");
            file.encoding = "UTF-8";

            if (!file.open("w")) {
                return "";
            }

            file.write("\uFEFF");

            function writeHeaders() {
                file.writeln([
                    "Status",
                    "Reason",
                    "Comp",
                    "Layer Index",
                    "Layer Name",
                    "Property Path",
                    "Original HEX",
                    "Original RGB",
                    "Assigned Control",
                    "Control HEX",
                    "Control RGB",
                    "Expression"
                ].join(","));
            }

            function writeRow(row) {
                file.writeln([
                    csvEscape(row.status),
                    csvEscape(row.reason),
                    csvEscape(row.compName),
                    csvEscape(row.layerIndex),
                    csvEscape(row.layerName),
                    csvEscape(row.propertyPath),
                    csvEscape(row.originalHex),
                    csvEscape(row.originalRgb),
                    csvEscape(row.assignedControl),
                    csvEscape(row.controlHex),
                    csvEscape(row.controlRgb),
                    csvEscape(row.expression)
                ].join(","));
            }

            file.writeln("OMITTED_PROPERTIES");
            writeHeaders();
            for (var o = 0; o < omittedRows.length; o++) {
                writeRow(omittedRows[o]);
            }

            file.writeln("");
            file.writeln("APPLIED_CHANGES");
            writeHeaders();
            for (var a = 0; a < appliedRows.length; a++) {
                writeRow(appliedRows[a]);
            }

            file.close();
            return file.fsName;
        }

        function scanPropertyGroup(group, comp, layer, parentPath) {
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

                var currentPath = parentPath ? parentPath + " > " + prop.name : prop.name;

                if (isColorProperty(prop)) {
                    try {
                        if (isInactiveNonVisibleColorProperty(prop, currentPath, layer)) {
                            inactiveIgnoredCount++;
                            continue;
                        }

                        var originalColor = normalizeColor(prop.value);
                        var originalRgb = colorToRgb255(originalColor);
                        var colorInfo = addUniqueColor(originalColor);
                        scannedColorProps.push({
                            comp: comp,
                            layer: layer,
                            prop: prop,
                            colorInfo: colorInfo,
                            propertyPath: currentPath,
                            originalColor: originalColor,
                            originalRgb: originalRgb,
                            originalHex: rgbToHex(originalRgb)
                        });
                    } catch (errColor) {
                        // Some plugin properties can report as Color but reject value reads.
                    }
                }

                if (prop.propertyType === PropertyType.NAMED_GROUP ||
                    prop.propertyType === PropertyType.INDEXED_GROUP) {
                    scanPropertyGroup(prop, comp, layer, currentPath);
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
                    scanPropertyGroup(item.layer(l), item, item.layer(l), item.layer(l).name);
                }
            }
        }

        function scanTextBaseColors(controlComp) {
            for (var i = 1; i <= app.project.numItems; i++) {
                var item = app.project.item(i);
                if (!(item instanceof CompItem) || item === controlComp) {
                    continue;
                }

                for (var l = 1; l <= item.numLayers; l++) {
                    var layer = item.layer(l);
                    if (!isFilledTextLayer(layer)) {
                        continue;
                    }

                    try {
                        var sourceText = getSourceTextProperty(layer);
                        var textDocument = sourceText.value;
                        var originalColor = normalizeColor(textDocument.fillColor);
                        var originalRgb = colorToRgb255(originalColor);
                        var colorInfo = addUniqueColor(originalColor);
                        var textItem = {
                            comp: item,
                            layer: layer,
                            colorInfo: colorInfo,
                            propertyPath: layer.name + " > Text > Source Text > fillColor",
                            originalColor: originalColor,
                            originalRgb: originalRgb,
                            originalHex: rgbToHex(originalRgb)
                        };

                        if (sourceText.numKeys && sourceText.numKeys > 0) {
                            manualReviewCount++;
                            omittedRows.push(buildTextLogRow(
                                textItem,
                                "MANUAL_REVIEW",
                                "Animated Source Text; fillColor can vary by keyframe",
                                ""
                            ));
                        } else if (textLayerHasColorAnimator(layer)) {
                            manualReviewCount++;
                            omittedRows.push(buildTextLogRow(
                                textItem,
                                "MANUAL_REVIEW",
                                "Text layer already has a color animator",
                                ""
                            ));
                        } else {
                            textBaseColorItems.push(textItem);
                        }
                    } catch (errText) {
                    }
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
                    if (item.prop.numKeys && item.prop.numKeys > 0) {
                        manualReviewCount++;
                        omittedRows.push(buildLogRow(
                            item,
                            "MANUAL_REVIEW",
                            "Animated color property; expression would override keyframed color values",
                            expression
                        ));
                        continue;
                    }

                    if (item.prop.canSetExpression) {
                        item.prop.expression = expression;
                        expressionCount++;
                        appliedRows.push(buildLogRow(item, "APPLIED", "Expression assigned", expression));
                    } else {
                        skippedExpressionCount++;
                        omittedRows.push(buildLogRow(item, "OMITTED", "Property cannot set expression", expression));
                    }
                } catch (errExpression) {
                    if (isHiddenExpressionError(errExpression) && isLayerStyleProperty(item)) {
                        hiddenIgnoredCount++;
                    } else {
                        skippedExpressionCount++;
                        omittedRows.push(buildLogRow(item, "OMITTED", errExpression.toString(), expression));
                    }
                }
            }
        }

        function ensureFullTextRangeSelector(animator) {
            try {
                var selectors = animator.property("ADBE Text Selectors");
                if (selectors.numProperties < 1) {
                    selectors.addProperty("ADBE Text Selector");
                }

                var selector = selectors.property(1);
                var selectorProperties = selector.property("ADBE Text Selector Properties");
                selectorProperties.property("ADBE Text Percent Start").setValue(0);
                selectorProperties.property("ADBE Text Percent End").setValue(100);
                selectorProperties.property("ADBE Text Percent Offset").setValue(0);
            } catch (err) {
                // AE versions differ slightly here; a default selector is usually created.
            }
        }

        function applyTextAnimatorExpressions() {
            for (var i = 0; i < textBaseColorItems.length; i++) {
                var item = textBaseColorItems[i];
                var expression = 'comp("' + CONTROL_COMP_NAME + '").layer("' + CONTROL_LAYER_NAME + '").effect("' + item.colorInfo.effectName + '")(1)';

                try {
                    var textProperties = item.layer.property("ADBE Text Properties");
                    var textAnimators = textProperties.property("ADBE Text Animators");
                    var animator = textAnimators.addProperty("ADBE Text Animator");
                    animator.name = "COLOR_CONTROL_Fill";
                    ensureFullTextRangeSelector(animator);

                    var animatorProperties = animator.property("ADBE Text Animator Properties");
                    var fillColor = animatorProperties.addProperty("ADBE Text Fill Color");
                    fillColor.expression = expression;

                    textAnimatorExpressionCount++;
                    appliedRows.push(buildTextLogRow(
                        item,
                        "APPLIED_TEXT_ANIMATOR",
                        "Fill Color text animator added",
                        expression
                    ));
                } catch (errTextAnimator) {
                    skippedExpressionCount++;
                    omittedRows.push(buildTextLogRow(
                        item,
                        "OMITTED",
                        errTextAnimator.toString(),
                        expression
                    ));
                }
            }
        }

        try {
            unlockAllLayers();

            var controlComp = getOrCreateControlComp();
            var controlLayer = createControlLayer(controlComp);

            scanProjectColors(controlComp);
            scanTextBaseColors(controlComp);
            createColorControls(controlLayer);
            createPaletteSwatches(controlLayer);
            applyColorExpressions();
            applyTextAnimatorExpressions();
            csvPath = writeCsvLog();

            if (onReviewRowsReady) {
                onReviewRowsReady(omittedRows);
            }

            alert(
                "COLOR_CONTROL creado/actualizado.\n\n" +
                "Tolerancia: " + tolerance + "\n" +
                "Layers desbloqueados: " + unlockedCount + "\n" +
                "Propiedades Color encontradas: " + scannedColorProps.length + "\n" +
                "Textos base detectados: " + textBaseColorItems.length + "\n" +
                "Colores unicos: " + uniqueColors.length + "\n" +
                "Expresiones aplicadas: " + expressionCount + "\n" +
                "Animators de texto aplicados: " + textAnimatorExpressionCount + "\n" +
                "Propiedades omitidas: " + skippedExpressionCount + "\n" +
                "Textos para revision manual: " + manualReviewCount + "\n" +
                "Propiedades inactivas ignoradas: " + inactiveIgnoredCount + "\n" +
                "Layer Styles ocultos ignorados: " + hiddenIgnoredCount + "\n" +
                "CSV log: " + (csvPath ? csvPath : "No se pudo escribir")
            );
        } catch (err) {
            alert("Error creando COLOR_CONTROL:\n" + err.toString());
        } finally {
            app.endUndoGroup();
        }
    }

    function buildUI(thisObjRef) {
        var win = (thisObjRef instanceof Panel)
            ? thisObjRef
            : new Window("palette", "Color Control Centralizer v02_04", undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 10;
        win.margins = 14;

        var title = win.add("statictext", undefined, "Color Control Centralizer v02_04");
        title.alignment = ["fill", "top"];

        var toleranceGroup = win.add("group");
        toleranceGroup.orientation = "row";
        toleranceGroup.alignChildren = ["center", "center"];
        toleranceGroup.add("statictext", undefined, "Tolerancia");

        var toleranceSlider = toleranceGroup.add("slider", undefined, 0, 0, 10);
        toleranceSlider.preferredSize.width = 180;

        var toleranceValue = toleranceGroup.add("edittext", undefined, "0");
        toleranceValue.characters = 3;

        var analyzeButton = win.add("button", undefined, "ANALISAR");
        analyzeButton.alignment = ["fill", "top"];

        var reviewLabel = win.add("statictext", undefined, "Omitted / manual review: 0");
        reviewLabel.alignment = ["fill", "top"];

        var reviewList = win.add("listbox", undefined, [], {
            numberOfColumns: 5,
            showHeaders: true,
            columnTitles: ["Comp", "Layer", "Property", "Reason", "Expression"],
            columnWidths: [150, 150, 260, 260, 360]
        });
        reviewList.alignment = ["fill", "fill"];
        reviewList.preferredSize = [1180, 260];

        var expressionGroup = win.add("group");
        expressionGroup.orientation = "row";
        expressionGroup.alignChildren = ["fill", "center"];
        expressionGroup.alignment = ["fill", "top"];

        var selectedExpression = expressionGroup.add("edittext", undefined, "");
        selectedExpression.alignment = ["fill", "center"];
        selectedExpression.characters = 90;

        var applyExpressionButton = expressionGroup.add("button", undefined, "APLICAR EXPRESSION");

        function setToleranceValue(value) {
            var intValue = Math.round(Number(value));
            if (isNaN(intValue)) {
                intValue = 0;
            }
            if (intValue < 0) {
                intValue = 0;
            }
            if (intValue > 10) {
                intValue = 10;
            }

            toleranceSlider.value = intValue;
            toleranceValue.text = String(intValue);
            return intValue;
        }

        toleranceSlider.onChanging = function() {
            setToleranceValue(toleranceSlider.value);
        };

        toleranceSlider.onChange = function() {
            setToleranceValue(toleranceSlider.value);
        };

        toleranceValue.onChange = function() {
            setToleranceValue(toleranceValue.text);
        };

        function clearReviewList() {
            try {
                reviewList.removeAll();
            } catch (err) {
                while (reviewList.items.length > 0) {
                    reviewList.remove(reviewList.items[0]);
                }
            }
        }

        function populateReviewList(rows) {
            clearReviewList();
            reviewLabel.text = "Omitted / manual review: " + rows.length;
            selectedExpression.text = "";

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var listItem = reviewList.add("item", row.compName);
                listItem.subItems[0].text = row.layerName;
                listItem.subItems[1].text = row.propertyPath;
                listItem.subItems[2].text = row.reason;
                listItem.subItems[3].text = row.expression;
                listItem.rowData = row;
            }

            win.layout.layout(true);
        }

        function jumpToReviewRow(row) {
            if (!row || !row.targetComp || !row.targetLayer) {
                alert("No target stored for this row.");
                return;
            }

            try {
                row.targetComp.openInViewer();

                for (var i = 1; i <= row.targetComp.numLayers; i++) {
                    row.targetComp.layer(i).selected = false;
                }

                row.targetLayer.selected = true;

                try {
                    if (row.targetProp) {
                        row.targetProp.selected = true;
                    }
                } catch (errPropSelect) {
                    // Some AE properties cannot be selected directly from script.
                }
            } catch (errJump) {
                alert("No se pudo navegar a la fila seleccionada:\n" + errJump.toString());
            }
        }

        function updateSelectedExpression() {
            if (reviewList.selection && reviewList.selection.rowData) {
                selectedExpression.text = reviewList.selection.rowData.expression || "";
            } else {
                selectedExpression.text = "";
            }
        }

        reviewList.onDoubleClick = function() {
            if (reviewList.selection && reviewList.selection.rowData) {
                jumpToReviewRow(reviewList.selection.rowData);
            }
        };

        reviewList.onChange = updateSelectedExpression;

        applyExpressionButton.onClick = function() {
            if (!reviewList.selection || !reviewList.selection.rowData) {
                alert("Selecciona una fila primero.");
                return;
            }

            var row = reviewList.selection.rowData;
            var expression = selectedExpression.text || row.expression;

            if (!row.targetProp) {
                alert("Esta fila no apunta a una propiedad directa. Requiere revision manual.");
                return;
            }

            if (!expression) {
                alert("Esta fila no tiene expression disponible.");
                return;
            }

            try {
                row.targetProp.expression = expression;
                row.reason = "Expression manually applied from UI";
                row.status = "APPLIED_FROM_UI";
                reviewList.selection.subItems[2].text = row.reason;
                alert("Expression aplicada a:\n" + row.compName + " > " + row.layerName + "\n" + row.propertyPath);
            } catch (errApplyExpression) {
                alert("No se pudo aplicar la expression:\n" + errApplyExpression.toString());
            }
        };

        analyzeButton.onClick = function() {
            runCentralizer(setToleranceValue(toleranceValue.text), populateReviewList);
        };

        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
        }

        return win;
    }

    buildUI(thisObj);
}(this));
