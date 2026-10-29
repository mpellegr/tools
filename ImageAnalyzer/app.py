import streamlit as st
from pathlib import Path
from datetime import datetime
import pandas as pd

# Usamos el mismo valor que en image_analyzer_core.DEFAULT_DISTANCE_THRESHOLD
DEFAULT_DISTANCE_THRESHOLD = 0.55

st.set_page_config(page_title="Image Analyzer", layout="wide")

# Cabecera más discreta
header_col1, header_col2 = st.columns([3, 1])
with header_col1:
    st.markdown("#### Image Analyzer · v07_03")
with header_col2:
    st.write("")  # reservado por si luego quieres info de versión, etc.

st.markdown(
    "Select a folder, run the analysis, and inspect the similarity clusters. "
    "This UI is an early version focused on inspection and CSV export."
)

# -------------------------------------------------------------------
# Top controls (horizontal)
# -------------------------------------------------------------------
controls_col1, controls_col2, controls_col3 = st.columns([4, 2, 1])

with controls_col1:
    default_folder = str(Path.cwd())
    folder = st.text_input(
        "Image folder",
        value=default_folder,
        help="Path to the folder that contains the images to analyze.",
    )

with controls_col2:
    distance_threshold = st.slider(
        "Distance threshold",
        min_value=0.1,
        max_value=1.5,
        value=float(DEFAULT_DISTANCE_THRESHOLD),
        step=0.05,
        help=(
            "Lower values = stricter clustering (more, smaller clusters). "
            "Higher values = more tolerant clustering (fewer, larger clusters)."
        ),
    )

with controls_col3:
    run_button = st.button("Run analysis", use_container_width=True)

# -------------------------------------------------------------------
# Main area
# -------------------------------------------------------------------
if run_button:
    if not folder.strip():
        st.error("Please provide a valid image folder.")
    else:
        base_path = Path(folder)
        if not base_path.is_dir():
            st.error(f"Folder does not exist or is not a directory:\n`{folder}`")
        else:
            # Importamos el motor SOLO cuando se va a usar
            from image_analyzer_core import analyze_folder  # import diferido

            with st.spinner(
                "Analyzing images… loading model and computing clusters. "
                "This may take a while for large folders."
            ):
                rows = analyze_folder(folder, distance_threshold=distance_threshold)

            if not rows:
                st.warning("No results were produced. Are there valid images in the folder?")
            else:
                df = pd.DataFrame(rows)

                # Sort: biggest clusters first
                df = df.sort_values(
                    by=["ClusterSize", "ClusterID", "FileName"],
                    ascending=[False, True, True],
                )

                st.success(f"Analysis completed. Processed images: {len(df)}")

                folder_name = base_path.name or "images"
                timestamp = datetime.now().strftime("%y%m%d_%H%M")  # YYMMDD_hhmm

                st.subheader("Image details")

                detail_cols = [
                    "ClusterID",
                    "ClusterSize",
                    "FileName",
                    "Extension",
                    "Width",
                    "Height",
                    "AspectRatio",
                    "FileSizeBytes",
                    "LastWriteTime",
                    "FullPath",
                ]

                detail_df = df[detail_cols]

                st.dataframe(detail_df, use_container_width=True)

                # CSV export for details
                detail_csv = detail_df.to_csv(index=False).encode("utf-8")
                detail_filename = f"{folder_name}_{timestamp}_Detail.csv"

                st.download_button(
                    label="Download details as CSV",
                    data=detail_csv,
                    file_name=detail_filename,
                    mime="text/csv",
                    key="download_detail_csv",
                )
else:
    st.info("Set the image folder and distance threshold above, then click **Run analysis**.")

