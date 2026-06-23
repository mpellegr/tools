{
    // Function to collect unique fonts used in text layers within the project.
    function listProjectFonts() {
        var fonts = [];
        function traverseComp(comp) {
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                var sourceTextProp = layer.property("Source Text");
                if (sourceTextProp && sourceTextProp.value instanceof TextDocument) {
                    var textDoc = sourceTextProp.value;
                    var fontName = textDoc.font;
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
        return fonts;
    }

    // Function to list available fonts using AE 2023 native support.
    // AE 2023 exposes the installed fonts via the app.fonts property.
    function listAvailableFonts() {
        var fonts = [];
        if (app.font && app.font.length > 0) {
            for (var i = 0; i < app.fonts.length; i++) {
                // Each element is assumed to be a font object with a .name property.
                fonts.push(app.fonts[i].name);
            }
        } else {
            // Fallback in case app.fonts is not available.
            alert("Unable to retrieve available fonts. Ensure you are running After Effects 2023 or later.");
        }
        return fonts;
    }

    // Create a UI panel (dockable if possible)
    var win = (this instanceof Panel) ? this : new Window("palette", "Replace Fonts (v02)", undefined, {resizeable: true});

    // Dropdown for fonts found in the project.
    win.fontList = win.add("dropdownlist", undefined, []);
    var fontsInProject = listProjectFonts();
    for (var i = 0; i < fontsInProject.length; i++) {
        win.fontList.add("item", fontsInProject[i]);
    }
    if (win.fontList.items.length > 0) {
        win.fontList.selection = 0;
    }

    // Dropdown for available fonts retrieved from the system.
    win.newFontList = win.add("dropdownlist", undefined, []);
    var availableFonts = listAvailableFonts();
    for (var i = 0; i < availableFonts.length; i++) {
        win.newFontList.add("item", availableFonts[i]);
    }
    if (win.newFontList.items.length > 0) {
        win.newFontList.selection = 0;
    }

    // Button to perform the font replacement.
    win.replaceBtn = win.add("button", undefined, "Replace Font");

    win.replaceBtn.onClick = function() {
        if (!win.fontList.selection || !win.newFontList.selection) {
            alert("Please select both the font to replace and the replacement font.");
            return;
        }
        var selectedFont = win.fontList.selection.text;
        var newFont = win.newFontList.selection.text;
        app.beginUndoGroup("Replace Font");

        // Loop through every composition and its text layers.
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                for (var j = 1; j <= item.numLayers; j++) {
                    var layer = item.layer(j);
                    var sourceTextProp = layer.property("Source Text");
                    if (sourceTextProp && sourceTextProp.value instanceof TextDocument) {
                        var textDoc = sourceTextProp.value;
                        if (textDoc.font === selectedFont) {
                            textDoc.font = newFont;
                            sourceTextProp.setValue(textDoc);
                        }
                    }
                }
            }
        }
        app.endUndoGroup();
        alert("Replaced font '" + selectedFont + "' with '" + newFont + "'.");
    };

    // Layout the panel.
    win.layout.layout(true);
    win.layout.resize();
    win.onResizing = win.onResize = function () { this.layout.resize(); };

    if (win instanceof Window) {
        win.center();
        win.show();
    }
}
