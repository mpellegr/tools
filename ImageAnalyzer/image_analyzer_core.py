from __future__ import annotations

from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
import re
from collections import defaultdict

import numpy as np
from PIL import Image
from sklearn.cluster import AgglomerativeClustering

import torch
from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights

# ------------------------------------------------------------
# ImageAnalyzer Core
# Version: v06_06  (multisignal + semantic grouping + numeric ClusterID)
# Notes:
#   - EfficientNet-B0 embeddings (full + center crop)
#   - Distance = W_FULL, W_CENTER, W_SIZE, W_NAME
#   - Semantic rule merges clusters with same semantic key
#   - Console-only logging via print(), no callbacks yet
# ------------------------------------------------------------

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.tif', '.tiff', '.gif', '.bmp', '.webp'}

# Pesos de cada señal
W_FULL   = 0.60   # visual: embedding imagen completa
W_CENTER = 0.30   # visual: embedding crop central
W_SIZE   = 0.05   # penalización por tamaño
W_NAME   = 0.15   # similitud de nombre

# Umbral por defecto (lo podrás ajustar desde la UI)
DEFAULT_DISTANCE_THRESHOLD = 0.55


# ------------------ Modelo EfficientNet ------------------ #

def load_model(device):
    weights = EfficientNet_B0_Weights.DEFAULT
    model = efficientnet_b0(weights=weights)
    model.classifier = torch.nn.Identity()
    model.eval()
    model.to(device)

    preprocess = weights.transforms()
    return model, preprocess


def center_crop_pil(im: Image.Image, scale: float = 0.6) -> Image.Image:
    w, h = im.size
    side = int(min(w, h) * scale)
    if side <= 0:
        return im
    cx, cy = w // 2, h // 2
    left   = max(cx - side // 2, 0)
    upper  = max(cy - side // 2, 0)
    right  = min(left + side, w)
    lower  = min(upper + side, h)
    return im.crop((left, upper, right, lower))


def extract_embeddings_multiscale(path: Path, model, preprocess, device):
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size

        x_full = preprocess(im).unsqueeze(0).to(device)
        im_center = center_crop_pil(im, scale=0.6)
        x_center = preprocess(im_center).unsqueeze(0).to(device)

        with torch.no_grad():
            emb_full = model(x_full).squeeze(0).cpu().numpy().astype("float32")
            emb_center = model(x_center).squeeze(0).cpu().numpy().astype("float32")

        for emb in (emb_full, emb_center):
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb /= norm

        return emb_full, emb_center, w, h


# ------------------ Similitud de nombres ------------------ #

def tokenize(name: str):
    clean = re.sub(r'[^a-zA-Z0-9]+', ' ', name.lower())
    return set(filter(None, clean.split()))


def levenshtein_dist(a: str, b: str) -> int:
    if len(a) < len(b):
        a, b = b, a
    if len(b) == 0:
        return len(a)
    prev_row = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            cost = 0 if ca == cb else 1
            curr.append(min(prev_row[j+1] + 1,
                            curr[j] + 1,
                            prev_row[j] + cost))
        prev_row = curr
    return prev_row[-1]


def name_similarity(n1: str, n2: str) -> float:
    if n1 == n2:
        return 1.0

    t1 = tokenize(n1)
    t2 = tokenize(n2)
    if not t1 or not t2:
        jacc = 0.0
    else:
        jacc = len(t1 & t2) / len(t1 | t2)

    ld = levenshtein_dist(n1.lower(), n2.lower())
    lnorm = 1 - ld / max(len(n1), len(n2))

    return 0.5 * jacc + 0.5 * lnorm


def extract_semantic_key(name: str) -> str:
    base = name.lower()
    base = re.sub(r'\.(jpg|jpeg|png|tif|tiff|gif|bmp|webp)$', '', base)
    base = re.sub(r'half\s*\d*', '', base)
    base = re.sub(r'\bp\d+\b', '', base)
    base = re.sub(r'\b([0-9])\b', '', base)
    base = re.sub(r'\s+', ' ', base).strip()
    return base


# ------------------ Distancias multiseñal ------------------ #

def cosine_distance_matrix(X: np.ndarray) -> np.ndarray:
    sim = X @ X.T
    return 1.0 - sim


def build_multisignal_distance_matrix(
    X_full: np.ndarray,
    X_center: np.ndarray,
    sizes: np.ndarray,
    names: list[str],
) -> np.ndarray:
    n = X_full.shape[0]

    dist_full = cosine_distance_matrix(X_full)
    dist_center = cosine_distance_matrix(X_center)

    widths = sizes[:, 0]
    heights = sizes[:, 1]
    widths_safe = np.where(widths <= 0, 1.0, widths)
    heights_safe = np.where(heights <= 0, 1.0, heights)
    log_w = np.log(widths_safe)
    log_h = np.log(heights_safe)

    size_pen = np.zeros((n, n), dtype=float)
    for i in range(n):
        for j in range(i + 1, n):
            s = abs(log_w[i] - log_w[j]) + abs(log_h[i] - log_h[j])
            size_pen[i, j] = s
            size_pen[j, i] = s
    if np.max(size_pen) > 0:
        size_pen = size_pen / np.max(size_pen)

    dist_name = np.zeros((n, n), dtype=float)
    for i in range(n):
        for j in range(i + 1, n):
            sim = name_similarity(names[i], names[j])
            d = 1.0 - sim
            dist_name[i, j] = d
            dist_name[j, i] = d

    dist = (
        W_FULL   * dist_full +
        W_CENTER * dist_center +
        W_SIZE   * size_pen +
        W_NAME   * dist_name
    )
    return dist


# ------------------ Embeddings + análisis ------------------ #

def _build_embeddings_matrix(base_path: Path):
    """
    Devuelve:
      rows: lista de dicts con metadatos
      X_full, X_center: embeddings
      sizes: (w,h)
      names: stems
      sem_keys: claves semánticas
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[ImageAnalyzer] Usando dispositivo: {device}")


    rows: List[Dict[str, Any]] = []
    embs_full = []
    embs_center = []
    sizes = []
    names = []
    sem_keys = []

    files = sorted(
        [p for p in base_path.iterdir()
         if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS],
        key=lambda p: p.name
    )

    total = len(files)
    if total == 0:
        print("[ImageAnalyzer] No se encontraron imágenes en la carpeta.")
        return [], None, None, None, None, None

    model, preprocess = load_model(device)
    print(f"[ImageAnalyzer] Encontradas {total} imágenes. Extrayendo embeddings...")

    for idx, path in enumerate(files, start=1):
        print(f"\r[ImageAnalyzer] Procesando imágenes: {idx}/{total}", end="", flush=True)

        try:
            emb_full, emb_center, w, h = extract_embeddings_multiscale(
                path, model, preprocess, device
            )
        except Exception as e:
            print(f"\n  -> Error al procesar {path.name}: {e}")
            continue

        stem = path.stem

        rows.append({
            "FileName": stem,
            "Extension": path.suffix.lstrip('.').lower(),
            "Width": w,
            "Height": h,
            "AspectRatio": round(w / h, 4) if h else None,
            "FileSizeBytes": path.stat().st_size,
            "LastWriteTime": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
            "FullPath": str(path),
            "Error": None,
        })
        embs_full.append(emb_full)
        embs_center.append(emb_center)
        sizes.append((w, h))
        names.append(stem)
        sem_keys.append(extract_semantic_key(stem))

    print("\n[ImageAnalyzer] Embeddings generados.")

    if not rows:
        return [], None, None, None, None, None

    X_full = np.stack(embs_full, axis=0)
    X_center = np.stack(embs_center, axis=0)
    sizes = np.array(sizes, dtype=float)

    return rows, X_full, X_center, sizes, names, sem_keys


# ------------------ API principal para la UI ------------------ #

def analyze_folder(folder_path: str, distance_threshold: float = DEFAULT_DISTANCE_THRESHOLD) -> List[Dict[str, Any]]:
    """
    Analiza una carpeta y devuelve una lista de dicts con:
      ClusterID, ClusterSize, FileName, Extension, Width, Height, AspectRatio,
      FileSizeBytes, LastWriteTime, FullPath, Error
    """
    base_path = Path(folder_path)
    if not base_path.is_dir():
        raise ValueError(f"La carpeta '{folder_path}' no existe o no es un directorio.")

    rows, X_full, X_center, sizes, names, sem_keys = _build_embeddings_matrix(base_path)

    if X_full is None or len(rows) < 1:
        return []

    if len(rows) == 1:
        return [dict(rows[0], ClusterID=0, ClusterSize=1)]

    print("[ImageAnalyzer] Calculando matriz de distancias...")
    dist = build_multisignal_distance_matrix(X_full, X_center, sizes, names)

    print("[ImageAnalyzer] Aplicando clustering jerárquico...")
    model = AgglomerativeClustering(
        n_clusters=None,
        metric="precomputed",
        linkage="average",
        distance_threshold=distance_threshold,
    )
    labels = model.fit_predict(dist)

    # Regla semántica: fusionar clusters con misma sem_key
    groups = defaultdict(list)
    for idx, key in enumerate(sem_keys):
        groups[key].append(idx)

    for key, idxs in groups.items():
        if len(idxs) < 2:
            continue
        leader = int(sorted(labels[idxs])[0])
        for i in idxs:
            labels[i] = leader

    unique, counts = np.unique(labels, return_counts=True)
    cluster_sizes = {int(u): int(c) for u, c in zip(unique, counts)}

    # Añadir a rows
    out_rows: List[Dict[str, Any]] = []
    for i, r in enumerate(rows):
        label = int(labels[i])
        #cid = f"C{label:03d}"
        row = dict(r)
        #row["ClusterID"] = cid
        row["ClusterID"] = label          # numeric only
        row["ClusterSize"] = cluster_sizes[label]
        out_rows.append(row)

    print(f"[ImageAnalyzer] Análisis completado. Imágenes procesadas: {len(out_rows)}")
    return out_rows

