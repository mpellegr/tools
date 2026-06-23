{
    // Function to traverse all comps and gather unique fonts used in text layers.
    function listProjectFonts() {
        var fonts = [];
        // Helper function to iterate over a composition’s layers.
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
        // Loop through every item in the project.
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                traverseComp(item);
            }
        }
        return fonts;
    }

    // Create a dockable panel if possible, or a floating palette.
    var win = (this instanceof Panel) ? this : new Window("palette", "MPMotion | Replace Fonts with Bebas Neue Pro", undefined, {resizeable: true});

    // Add a dropdown to list fonts found in the project.
    win.fontList = win.add("dropdownlist", undefined, []);
    var fontsInProject = listProjectFonts();
    for (var i = 0; i < fontsInProject.length; i++) {
        win.fontList.add("item", fontsInProject[i]);
    }
    if (win.fontList.items.length > 0) {
        win.fontList.selection = 0;
    }

    // Add a button to trigger the replacement.
    win.replaceBtn = win.add("button", undefined, "Replace with Bebas Neue Pro");

    win.replaceBtn.onClick = function() {
        if (!win.fontList.selection) {
            alert("Please select a font from the list.");
            return;
        }
        var selectedFont = win.fontList.selection.text;
        // Start an undo group to allow easy reversal.
        app.beginUndoGroup("Replace Font");
        // Loop through every composition and its layers.
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                for (var j = 1; j <= item.numLayers; j++) {
                    var layer = item.layer(j);
                    var sourceTextProp = layer.property("Source Text");
                    if (sourceTextProp && sourceTextProp.value instanceof TextDocument) {
                        var textDoc = sourceTextProp.value;
                        // If this text layer uses the selected font, replace it.
                        if (textDoc.font === selectedFont) {
                            textDoc.font = "Bebas Neue Pro";
                            sourceTextProp.setValue(textDoc);
                        }
                    }
                }
            }
        }
        app.endUndoGroup();
        alert("Replaced font '" + selectedFont + "' with 'Bebas Neue Pro'.");
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
