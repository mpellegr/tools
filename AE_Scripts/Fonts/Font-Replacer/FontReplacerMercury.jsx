/**************************************************************
  FontReplacer_MercuryEngine.jsx
  -------------------------------------------------------------
  Attempts to list all installed fonts by forcing the Mercury 
  (Modern) Text Engine, then replaces an "old" font (used in 
  your project) with a "new" font across text layers.
  
  If getSystemFonts() returns an empty list, your AE version 
  might not support enumerating system fonts this way.
**************************************************************/

(function FontReplacer(thisObj) {

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Font Replacer (Mercury)", undefined, {resizeable:true});

        pal.spacing = 10;
        pal.margins = 16;

        // 1) Fonts actually used in project
        var usedFonts = getAllUsedFonts();
        usedFonts.sort();

        // 2) Attempt all system fonts (including style), using Mercury Engine
        var allSystemFonts = getSystemFonts();
        allSystemFonts.sort();

        // If the array is empty, we’ll show a fallback message
        if (allSystemFonts.length === 0) {
            allSystemFonts.push("No fonts found (engine not supported?).");
        }

        // --- UI Layout ---
        // Old Font
        var oldFontGroup = pal.add("group");
        oldFontGroup.add("statictext", undefined, "Old Font:");
        var oldFontDropdown = oldFontGroup.add("dropdownlist", [0,0,200,22], usedFonts);
        if (usedFonts.length > 0) oldFontDropdown.selection = 0;

        // New Font
        var newFontGroup = pal.add("group");
        newFontGroup.add("statictext", undefined, "New Font:");
        var newFontDropdown = newFontGroup.add("dropdownlist", [0,0,200,22], allSystemFonts);
        if (newFontDropdown.items.length > 0) newFontDropdown.selection = 0;

        // Replace Button
        var replaceBtn = pal.add("button", undefined, "Replace Fonts");
        replaceBtn.alignment = ["center","top"];

        replaceBtn.onClick = function() {
            if (!oldFontDropdown.selection) {
                alert("Please select an Old Font (project fonts).");
                return;
            }
            if (!newFontDropdown.selection) {
                alert("Please select a New Font (system fonts).");
                return;
            }

            var oldFont = oldFontDropdown.selection.text;
            var newFont = newFontDropdown.selection.text;

            if (newFont === "No fonts found (engine not supported?).") {
                alert("Unable to list system fonts in this AE version/build.");
                return;
            }

            if (oldFont === newFont) {
                alert("Old and new fonts are the same. Pick something else.");
                return;
            }

            app.beginUndoGroup("Replace Fonts");
            replaceFontsInProject(oldFont, newFont);
            app.endUndoGroup();

            alert("Font replacement complete!");
        };

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function() {
            this.layout.resize();
        };

        return pal;
    }

    // ---------------------------------------------------------
    // Find all font names used in text layers of the project
    // ---------------------------------------------------------
    function getAllUsedFonts() {
        var fontsFound = [];
        var proj = app.project;
        if (!proj) return fontsFound;

        for (var i = 1; i <= proj.numItems; i++) {
            var item = proj.item(i);
            if (item instanceof CompItem) {
                for (var j = 1; j <= item.numLayers; j++) {
                    var lyr = item.layer(j);
                    var srcText = lyr.property("Source Text");
                    if (srcText) {
                        var textDoc = srcText.value;
                        var fName = textDoc.font;
                        if (fontsFound.indexOf(fName) === -1) {
                            fontsFound.push(fName);
                        }
                    }
                }
            }
        }
        return fontsFound;
    }

    // ---------------------------------------------------------
    // Attempt to get an array of all system fonts, including style
    // by forcing the Mercury (Modern) Text Engine.
    // ---------------------------------------------------------
    function getSystemFonts() {
        var fontList = [];

        var proj = app.project;
        if (!proj) return fontList;

        // Create a temporary comp & text layer
        var tempComp = proj.items.addComp("Temp_Mercury_Fonts", 100, 100, 1, 1, 25);
        var textLayer = tempComp.layers.addText("temp");

        // Force the text document to Mercury (Modern) engine
        var textDoc = textLayer.property("Source Text").value;

        // The "TextEngine" enumerations can differ by build.
        // Standard naming is often "TextEngine.ENGINE_MERCURY" or "TextEngineValue.ENGINE_MERCURY".
        // We'll try the numeric constant fallback if the direct enum is not recognized.
        try {
            textDoc.textEngine = TextEngine.ENGINE_MERCURY; 
        } catch (e) {
            // In case ENGINE_MERCURY is not recognized in older versions, 
            // we can try something like a numeric constant or skip.
            // If your AE doesn't define TextEngine.ENGINE_MERCURY, 
            // this approach won't work. Possibly textDoc.fonts is empty.
        }

        // Reapply the textDoc to the layer
        textLayer.property("Source Text").setValue(textDoc);

        // Now try to read the fonts array
        try {
            if (textDoc.fonts) {
                fontList = textDoc.fonts;
            }
        } catch (e) {
            // textDoc.fonts may be unavailable or throw an error
            fontList = [];
        }

        // Cleanup
        tempComp.remove();
        return fontList;
    }

    // ---------------------------------------------------------
    // Replace `oldFontName` with `newFontName` in all text layers
    // ---------------------------------------------------------
    function replaceFontsInProject(oldFontName, newFontName) {
        var proj = app.project;
        if (!proj) return;

        for (var i = 1; i <= proj.numItems; i++) {
            var item = proj.item(i);
            if (item instanceof CompItem) {
                for (var j = 1; j <= item.numLayers; j++) {
                    var lyr = item.layer(j);
                    var srcText = lyr.property("Source Text");
                    if (srcText) {
                        var textDoc = srcText.value;
                        if (textDoc.font === oldFontName) {
                            textDoc.font = newFontName;
                            srcText.setValue(textDoc);
                        }
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------
    // Build & Show UI
    // ---------------------------------------------------------
    var myPanel = buildUI(thisObj);
    if (myPanel instanceof Window) {
        myPanel.center();
        myPanel.show();
    }

})(this);
