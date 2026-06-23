# Font Replacer

ScriptUI panel for After Effects that scans the fonts used by project text layers and replaces one project font with one installed system font.

## Active Version

- `FontReplacer.jsx`: current working version.

## How It Works

- Source fonts are read from `TextDocument.font` in every project composition, so the list can include fonts referenced by the project even when they are not installed.
- Destination fonts are read from After Effects' `app.fonts.allFonts` API when available and written back using the font PostScript name.
- The destination list can be filtered by typing part of a family, style, or PostScript name.
- If the installed-font API is unavailable in the running AE version, the panel falls back to a manual destination PostScript-name field.
- Locked layers are skipped by default. Enable `Incluir capas bloqueadas` to unlock matching layers temporarily, replace the font, and restore the lock.
- Error summaries include comp name, layer name, layer index, and the underlying error message.
- Replacement is wrapped in one undo group.

## Previous Versions

Older experiments and target-specific scripts are archived in `_anteriores/`.

- `FontReplaceTo_ApercuMovistarPlus.jsx`
- `FontReplaceTo_BebasNeuePro.jsx`
- `FontReplaceTo_VarienRegular.jsx`
- `FontReplacer.jsx`
- `FontReplacer_v02.jsx`
- `FontReplacerMercury.jsx`
