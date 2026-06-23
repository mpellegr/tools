(function FontReplacer(thisObj) {
    var SCRIPT_NAME = "MPMotion | Font Replacer";

    function uniqueSorted(values) {
        var unique = [];
        for (var i = 0; i < values.length; i++) {
            if (values[i] && indexOf(unique, values[i]) === -1) {
                unique.push(values[i]);
            }
        }
        return unique.sort();
    }

    function indexOf(items, value) {
        for (var i = 0; i < items.length; i++) {
            if (items[i] === value) {
                return i;
            }
        }
        return -1;
    }

    function getSourceTextProperty(layer) {
        var prop = layer.property("Source Text");
        if (prop) {
            return prop;
        }

        var textProps = layer.property("ADBE Text Properties");
        if (textProps) {
            return textProps.property("ADBE Text Document");
        }

        return null;
    }

    function getProjectFonts() {
        var fonts = [];
        if (!app.project) {
            return fonts;
        }

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) {
                continue;
            }

            for (var j = 1; j <= item.numLayers; j++) {
                var sourceText = getSourceTextProperty(item.layer(j));
                if (!sourceText) {
                    continue;
                }

                try {
                    var textDoc = sourceText.value;
                    if (textDoc && textDoc.font) {
                        fonts.push(textDoc.font);
                    }
                } catch (err) {
                }
            }
        }

        return uniqueSorted(fonts);
    }

    function getFontPostScriptName(fontObj) {
        if (!fontObj) {
            return "";
        }

        try {
            if (fontObj.postScriptName) {
                return fontObj.postScriptName;
            }
        } catch (err1) {
        }

        try {
            if (fontObj.name) {
                return fontObj.name;
            }
        } catch (err2) {
        }

        return "";
    }

    function getFontLabel(fontObj, postScriptName) {
        var family = "";
        var style = "";

        try {
            family = fontObj.familyName || "";
        } catch (err1) {
        }

        try {
            style = fontObj.styleName || "";
        } catch (err2) {
        }

        if (family) {
            return family + (style ? " " + style : "") + "  [" + postScriptName + "]";
        }

        return postScriptName;
    }

    function getInstalledFonts() {
        var installed = [];
        var seen = [];

        try {
            if (!app.fonts || !app.fonts.allFonts) {
                return installed;
            }

            var families = app.fonts.allFonts;
            for (var i = 0; i < families.length; i++) {
                var familyFonts = families[i];
                for (var j = 0; j < familyFonts.length; j++) {
                    var fontObj = familyFonts[j];
                    var postScriptName = getFontPostScriptName(fontObj);
                    if (!postScriptName || indexOf(seen, postScriptName) !== -1) {
                        continue;
                    }

                    seen.push(postScriptName);
                    installed.push({
                        label: getFontLabel(fontObj, postScriptName),
                        postScriptName: postScriptName
                    });
                }
            }
        } catch (err) {
            installed = [];
        }

        installed.sort(function(a, b) {
            var aa = a.label.toLowerCase();
            var bb = b.label.toLowerCase();
            if (aa < bb) {
                return -1;
            }
            if (aa > bb) {
                return 1;
            }
            return 0;
        });

        return installed;
    }

    function clearDropdown(dropdown) {
        while (dropdown.items.length > 0) {
            dropdown.remove(dropdown.items[0]);
        }
    }

    function containsText(value, query) {
        if (!query) {
            return true;
        }

        return value.toLowerCase().indexOf(query.toLowerCase()) !== -1;
    }

    function getErrorMessage(err) {
        if (!err) {
            return "Unknown error";
        }

        if (err.message) {
            return err.message;
        }

        return String(err);
    }

    function fillSourceDropdown(dropdown) {
        clearDropdown(dropdown);

        var fonts = getProjectFonts();
        if (fonts.length === 0) {
            dropdown.add("item", "(no text fonts found)");
            dropdown.enabled = false;
            return;
        }

        dropdown.enabled = true;
        for (var i = 0; i < fonts.length; i++) {
            dropdown.add("item", fonts[i]);
        }
        dropdown.selection = 0;
    }

    function fillDestinationDropdown(dropdown, fonts, filterText) {
        clearDropdown(dropdown);

        if (fonts.length === 0) {
            dropdown.add("item", "(installed fonts unavailable)");
            dropdown.enabled = false;
            return false;
        }

        var added = 0;
        for (var i = 0; i < fonts.length; i++) {
            if (!containsText(fonts[i].label, filterText) && !containsText(fonts[i].postScriptName, filterText)) {
                continue;
            }

            var item = dropdown.add("item", fonts[i].label);
            item.postScriptName = fonts[i].postScriptName;
            added++;
        }

        if (added === 0) {
            dropdown.add("item", "(sin resultados)");
            dropdown.enabled = false;
            return true;
        }

        dropdown.enabled = true;
        dropdown.selection = 0;
        return true;
    }

    function replaceProjectFont(sourceFont, destinationFont, includeLockedLayers) {
        var result = {
            replaced: 0,
            skippedLocked: 0,
            failed: 0,
            errors: []
        };

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof CompItem)) {
                continue;
            }

            for (var j = 1; j <= item.numLayers; j++) {
                var layer = item.layer(j);
                var sourceText = getSourceTextProperty(layer);
                if (!sourceText) {
                    continue;
                }

                var wasLocked = false;
                try {
                    var textDoc = sourceText.value;
                    if (textDoc && textDoc.font === sourceFont) {
                        wasLocked = layer.locked;
                        if (wasLocked && !includeLockedLayers) {
                            result.skippedLocked++;
                            continue;
                        }

                        if (wasLocked) {
                            layer.locked = false;
                        }

                        textDoc.font = destinationFont;
                        sourceText.setValue(textDoc);
                        result.replaced++;

                        if (wasLocked) {
                            layer.locked = true;
                        }
                    }
                } catch (err) {
                    result.failed++;
                    result.errors.push({
                        compName: item.name,
                        layerName: layer.name,
                        layerIndex: j,
                        message: getErrorMessage(err)
                    });
                    try {
                        if (layer.locked !== true && wasLocked === true) {
                            layer.locked = true;
                        }
                    } catch (restoreErr) {
                    }
                }
            }
        }

        return result;
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 8;
        win.margins = 12;

        var sourceGroup = win.add("group");
        sourceGroup.orientation = "column";
        sourceGroup.alignChildren = ["fill", "top"];
        sourceGroup.add("statictext", undefined, "Origen (fuentes usadas en el proyecto)");
        var sourceDropdown = sourceGroup.add("dropdownlist", undefined, []);
        sourceDropdown.preferredSize.width = 360;

        var destinationGroup = win.add("group");
        destinationGroup.orientation = "column";
        destinationGroup.alignChildren = ["fill", "top"];
        destinationGroup.add("statictext", undefined, "Destino (fuentes instaladas)");
        var destinationFilter = destinationGroup.add("edittext", undefined, "");
        destinationFilter.characters = 36;
        destinationFilter.helpTip = "Escribe para filtrar la lista de fuentes destino.";
        var destinationDropdown = destinationGroup.add("dropdownlist", undefined, []);
        destinationDropdown.preferredSize.width = 360;

        var manualGroup = win.add("group");
        manualGroup.orientation = "column";
        manualGroup.alignChildren = ["fill", "top"];
        manualGroup.add("statictext", undefined, "Destino manual (PostScript name)");
        var manualDestination = manualGroup.add("edittext", undefined, "");
        manualDestination.characters = 36;

        var includeLockedCheckbox = win.add("checkbox", undefined, "Incluir capas bloqueadas");
        includeLockedCheckbox.value = false;
        includeLockedCheckbox.helpTip = "Si esta activo, desbloquea temporalmente las capas con candado y vuelve a bloquearlas despues.";

        var buttons = win.add("group");
        buttons.orientation = "row";
        buttons.alignment = ["right", "top"];
        var refreshButton = buttons.add("button", undefined, "Actualizar");
        var replaceButton = buttons.add("button", undefined, "Reemplazar");
        var installedFonts = [];
        var installedFontsAvailable = false;

        function applyDestinationFilter() {
            installedFontsAvailable = fillDestinationDropdown(destinationDropdown, installedFonts, destinationFilter.text);
            return installedFontsAvailable;
        }

        function refreshLists() {
            fillSourceDropdown(sourceDropdown);
            installedFonts = getInstalledFonts();
            installedFontsAvailable = applyDestinationFilter();
            destinationFilter.enabled = installedFontsAvailable;
            destinationFilter.visible = installedFontsAvailable;
            var hasInstalledFonts = installedFontsAvailable;
            manualGroup.visible = !hasInstalledFonts;
            win.layout.layout(true);
        }

        refreshButton.onClick = refreshLists;
        destinationFilter.onChanging = applyDestinationFilter;

        replaceButton.onClick = function() {
            if (!sourceDropdown.enabled || !sourceDropdown.selection) {
                alert("No hay fuente de origen seleccionada.");
                return;
            }

            var sourceFont = sourceDropdown.selection.text;
            var destinationFont = "";

            if (installedFontsAvailable && destinationDropdown.enabled && destinationDropdown.selection) {
                destinationFont = destinationDropdown.selection.postScriptName || destinationDropdown.selection.text;
            } else {
                destinationFont = manualDestination.text;
            }

            if (!destinationFont) {
                alert("Elige una fuente destino o escribe su PostScript name.");
                return;
            }

            if (sourceFont === destinationFont) {
                alert("La fuente origen y destino son iguales.");
                return;
            }

            app.beginUndoGroup("Replace Font: " + sourceFont + " to " + destinationFont);
            var result = replaceProjectFont(sourceFont, destinationFont, includeLockedCheckbox.value);
            app.endUndoGroup();

            var message =
                "Capas actualizadas: " + result.replaced +
                "\nBloqueadas omitidas: " + result.skippedLocked +
                "\nErrores: " + result.failed +
                "\nOrigen: " + sourceFont +
                "\nDestino: " + destinationFont;

            if (result.errors.length > 0) {
                message += "\n\nDetalles de errores:";
                for (var i = 0; i < result.errors.length && i < 10; i++) {
                    var errorInfo = result.errors[i];
                    message += "\n- " + errorInfo.compName + " > " + errorInfo.layerName +
                        " (#" + errorInfo.layerIndex + "): " + errorInfo.message;
                }

                if (result.errors.length > 10) {
                    message += "\n- ... " + (result.errors.length - 10) + " errores mas.";
                }
            }

            alert(message);

            refreshLists();
        };

        refreshLists();

        win.layout.layout(true);
        win.layout.resize();
        win.onResizing = win.onResize = function() {
            this.layout.resize();
        };

        return win;
    }

    var panel = buildUI(thisObj);
    if (panel instanceof Window) {
        panel.center();
        panel.show();
    }
})(this);
