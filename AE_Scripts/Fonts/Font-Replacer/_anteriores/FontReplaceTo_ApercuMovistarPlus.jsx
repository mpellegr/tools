(function() {
    // Function to traverse all compositions and gather unique fonts used in text layers.
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

    // Create a dockable panel or floating palette.
    var win = (this instanceof Panel)
        ? this
        : new Window("palette", "MPMotion | Replace Fonts with ApercuMovistarPlus", undefined, { resizeable: true });

    // Dropdown to list project fonts.
    win.fontList = win.add("dropdownlist", undefined, []);
    var fontsInProject = listProjectFonts();
    for (var i = 0; i < fontsInProject.length; i++) {
        win.fontList.add("item", fontsInProject[i]);
    }
    if (win.fontList.items.length > 0) {
        win.fontList.selection = 0;
    }

    // Button to trigger replacement.
    win.replaceBtn = win.add("button", undefined, "Replace with ApercuMovistarPlus");

    win.replaceBtn.onClick = function() {
        if (!win.fontList.selection) {
            alert("Please select a font from the list.");
            return;
        }
        var selectedFont = win.fontList.selection.text;
        app.beginUndoGroup("Replace Font to ApercuMovistarPlus");

        // Iterate through all comps and layers
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                for (var j = 1; j <= item.numLayers; j++) {
                    var layer = item.layer(j);
                    var sourceTextProp = layer.property("Source Text");
                    if (sourceTextProp && sourceTextProp.value instanceof TextDocument) {
                        var textDoc = sourceTextProp.value;
                        if (textDoc.font === selectedFont) {
                            // Preserve the original variation (face) after the last dash
                            var dashIndex = selectedFont.lastIndexOf('-');
                            var variation = dashIndex !== -1
                                ? selectedFont.substr(dashIndex + 1)
                                : "";
                            var newFont = "ApercuMovistarPlus" + (variation ? "-" + variation : "");
                            textDoc.font = newFont;
                            sourceTextProp.setValue(textDoc);
                        }
                    }
                }
            }
        }

        app.endUndoGroup();
        alert("Replaced font '" + selectedFont + "' with 'ApercuMovistarPlus" + (variation ? "-" + variation : "") + "'.");
    };

    // Layout adjustments
    win.layout.layout(true);
    win.layout.resize();
    win.onResizing = win.onResize = function() { this.layout.resize(); };

    if (win instanceof Window) {
        win.center();
        win.show();
    }
})();
