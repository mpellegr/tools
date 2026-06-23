# Font Replacer

ScriptUI panel for After Effects that scans the fonts used by project text layers and replaces one project font with one installed system font.

## Active Version

- `FontReplacer.jsx`: current working version.

## Current Status

This version is ready for normal non-keyframed `Source Text` usage.

- Lists source fonts used in the open project, including missing/uninstalled fonts referenced by the project.
- Lists installed destination fonts when `app.fonts.allFonts` is available.
- Filters destination fonts while typing.
- Replaces matching text layers across every project comp.
- Skips locked layers by default.
- Can temporarily unlock matching locked layers, replace the font, and restore the lock.
- Reports replacement totals, skipped locked layers, and detailed errors.

## How It Works

- Source fonts are read from `TextDocument.font` in every project composition, so the list can include fonts referenced by the project even when they are not installed.
- Destination fonts are read from After Effects' `app.fonts.allFonts` API when available and written back using the font PostScript name.
- The destination list can be filtered by typing part of a family, style, or PostScript name.
- If the installed-font API is unavailable in the running AE version, the panel falls back to a manual destination PostScript-name field.
- Locked layers are skipped by default. Enable `Incluir capas bloqueadas` to unlock matching layers temporarily, replace the font, and restore the lock.
- Error summaries include comp name, layer name, layer index, and the underlying error message.
- Replacement is wrapped in one undo group.

## Known Limitation

Text layers with keyframed `Source Text` can fail with an After Effects error like:

`Can not call setValue() on a property with keyframes. Use setValueAtTime() or setValueAtKey() instead.`

This happens when the text document has keyframes, possibly with different fonts per keyframe. The current version detects and reports the affected comp/layer, but it does not yet replace fonts inside each keyframed `TextDocument`.

Planned follow-up: decide how keyframed text should be handled before implementation:

- Replace only the current value.
- Replace every `Source Text` keyframe.
- Replace only keyframes whose `TextDocument.font` matches the selected source font.

## Last Committed Version

- Commit: `4ab9ff3 Add configurable After Effects font replacer`

## Previous Versions

Older experiments and target-specific scripts are archived in `_anteriores/`.

- `FontReplaceTo_ApercuMovistarPlus.jsx`
- `FontReplaceTo_BebasNeuePro.jsx`
- `FontReplaceTo_VarienRegular.jsx`
- `FontReplacer.jsx`
- `FontReplacer_v02.jsx`
- `FontReplacerMercury.jsx`
