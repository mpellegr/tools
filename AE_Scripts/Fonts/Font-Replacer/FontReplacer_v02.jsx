{
    // -------------------------------------------------------
    // 0. Check After Effects version
    // -------------------------------------------------------
    // AE version string is like "24.0.1.12"; parseFloat gives major.minor
    var aeVersionNum = parseFloat(app.version);
    // -------------------------------------------------------
    // 1. Utility: gather all unique font names used in every Text Layer
    // -------------------------------------------------------
    function listProjectFonts() {
        var fonts = [];

        function traverseComp(comp) {
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                var sourceTextProp = layer.property("Source Text");
                if (sourceTextProp && sourceTextProp.value instanceof TextDocument) {
                    var textDoc = sourceTextProp.value;
                    var fontName = textDoc.font; // e.g. "Arial-BoldMT"
                    if (fonts.indexOf(fontName) === -1) {
                        fonts.push(fontName);
                    }
                }
            }
        }

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                traverseComp(item);
            }
        }

        return fonts.sort();
    }

    // -------------------------------------------------------
    // 2. Utility: gather all installed fonts (PostScript names) via app.fonts
    //    (Supported in After Effects 24.0+)
    // -------------------------------------------------------
    function listInstalledFonts() {
        var installed = [];

        // Only attempt if AE version is ≥ 24.0 and app.fonts exists
        if (aeVersionNum < 24.0) {
        // AE < 24.0: user must type the PostScript name manually
        win.destInput = win.destGroup.add("edittext", undefined, "");
        win.destInput.characters = 30;
        win.destInput.helpTip = "AE " + app.version + " detected—type exact PostScript name";
        } else {
            // AE ≥ 24.0: populate a dropdown with allInstalled fonts
            win.destList = win.destGroup.add("dropdownlist", undefined, []);
            win.destList.characters = 30;

            var allInstalled = listInstalledFonts(); // 2D → flat, sorted array
            if (allInstalled.length === 0) {
                win.destList.add("item", "(no fonts found)");
                win.destList.enabled = false;
            } else {
                for (var i = 0; i < allInstalled.length; i++) {
                    win.destList.add("item", allInstalled[i]);
                }
                win.destList.selection = 0;
            }
        }

        var families = app.fonts.allFonts; // 2D array: [ [FontObject, …], [FontObject, …], … ]
        for (var i = 0; i < families.length; i++) {
            var variants = families[i];
            for (var j = 0; j < variants.length; j++) {
                var fontObj = variants[j];
                if (fontObj.postScriptName) {
                    installed.push(fontObj.postScriptName);
                }
            }
        }

        // Remove duplicates (precaution) and sort alphabetically
        var unique = installed.filter(function(item, idx) {
            return installed.indexOf(item) === idx;
        });

        return unique.sort();
    }

    // -------------------------------------------------------
    // 3. Build the floating palette (or dockable panel)
    // -------------------------------------------------------
    var win = (this instanceof Panel)
                ? this
                : new Window("palette", "Replace Fonts (v02)", undefined, { resizeable: true });

    // 3.1 “Replace This Font” dropdown (fonts actually used in project)
    win.srcGroup = win.add("group");
    win.srcGroup.orientation = "row";
    win.srcGroup.add("statictext", undefined, "Replace This Font:");
    win.fontList = win.srcGroup.add("dropdownlist", undefined, [], { name: "srcFonts" });
    win.fontList.characters = 30;

    var fontsInProject = listProjectFonts();
    if (fontsInProject.length === 0) {
        win.fontList.add("item", "(no text layers found)");
        win.fontList.enabled = false;
    } else {
        for (var a = 0; a < fontsInProject.length; a++) {
            win.fontList.add("item", fontsInProject[a]);
        }
        win.fontList.selection = 0; // default to first project font
    }

    // 3.2 “Replace With” dropdown (all installed fonts via app.fonts)
    win.destGroup = win.add("group");
    win.destGroup.orientation = "row";
    win.destGroup.add("statictext", undefined, "Replace With:");
    win.destList = win.destGroup.add("dropdownlist", undefined, [], { name: "destFonts" });
    win.destList.characters = 30;

    // If AE version < 24.0, disable and show message
    if (aeVersionNum < 24.0) {
        win.destList.add("item", "(AE " + app.version + " detected: fonts not enumerable)");
        win.destList.enabled = false;
    } else {
        var allInstalled = listInstalledFonts();
        if (allInstalled.length === 0) {
            win.destList.add("item", "(no fonts found)");
            win.destList.enabled = false;
        } else {
            for (var b = 0; b < allInstalled.length; b++) {
                win.destList.add("item", allInstalled[b]);
            }
            win.destList.selection = 0; // default to first installed font
        }
    }

    // 3.3 Button to perform replacement
    win.replaceBtn = win.add("button", undefined, "Replace →");

    // -------------------------------------------------------
    // 4. Button Logic: loop through comps & swap fonts
    // -------------------------------------------------------
    win.replaceBtn.onClick = function() {
        // 4.1 Validate that source dropdown is enabled and has a selection
        if (!win.fontList.selection || win.fontList.enabled === false) {
            alert("Please select a source font to replace.");
            return;
        }
        // 4.2 Validate destination dropdown is enabled and has a selection
        if (!win.destList.selection || win.destList.enabled === false) {
            alert("Please select a valid destination font.\n\n(Note: AE " + app.version + " does not support font enumeration.)");
            return;
        }

        var selectedFont = win.fontList.selection.text; // e.g. "Arial-BoldMT"
        var destFont     = win.destList.selection.text;  // e.g. "Varien-Regular"

        // Prevent no-op (source = destination)
        if (selectedFont === destFont) {
            alert("Source and destination fonts are identical.");
            return;
        }

        app.beginUndoGroup("Replace Font: " + selectedFont + " → " + destFont);

        var replacedCount = 0;

        // 4.3 Loop through every CompItem in the project
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                // 4.3.1 Loop through all layers in this comp
                for (var k = 1; k <= item.numLayers; k++) {
                    var layer = item.layer(k);
                    var sourceTextProp = layer.property("Source Text");
                    if (sourceTextProp && sourceTextProp.value instanceof TextDocument) {
                        var textDoc = sourceTextProp.value;
                        if (textDoc.font === selectedFont) {
                            textDoc.font = destFont;
                            sourceTextProp.setValue(textDoc);
                            replacedCount++;
                        }
                    }
                }
            }
        }

        app.endUndoGroup();

        // 4.4 Feedback to user
        if (replacedCount > 0) {
            alert(
                "Replaced " +
                replacedCount +
                " text layer" +
                (replacedCount === 1 ? "" : "s") +
                " of '" +
                selectedFont +
                "'\nwith '" +
                destFont +
                "'."
            );
        } else {
            alert("No layers found with font '" + selectedFont + "'.");
        }
    };

    // -------------------------------------------------------
    // 5. Layout & Show
    // -------------------------------------------------------
    win.layout.layout(true);
    win.layout.resize();
    win.onResizing = win.onResize = function () { this.layout.resize(); };

    if (win instanceof Window) {
        win.center();
        win.show();
    }
}
