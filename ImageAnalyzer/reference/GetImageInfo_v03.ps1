param(
    [string]$FolderPath,
    [string]$OutputCsv
)

$timestamp = (Get-Date).ToString("yyMMdd_HHmm")
if (-not $OutputCsv) {
    $OutputCsv = Join-Path (Get-Location) ("Images_$timestamp.csv")
}

if (-not $FolderPath) {
    $FolderPath = Read-Host "Introduce la carpeta inicial"
}

if (-not (Test-Path -Path $FolderPath)) {
    Write-Host "La carpeta '$FolderPath' no existe." -ForegroundColor Red
    exit 1
}

$imageExtensions = '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.gif', '.bmp', '.webp', '.psd'

Write-Host "Leyendo imágenes en: $FolderPath"
Write-Host "Generando CSV en: $OutputCsv"
Write-Host ""

# -------------------------
# Función: hash perceptual tipo "average hash" (16x16 -> 256 bits -> 64 hex)
# -------------------------
function Get-AvgHash {
    param(
        [string]$ImagePath
    )

    # Sacamos la imagen como texto 16x16 en escala de grises, 8 bits
    $txt = & magick "$ImagePath" -quiet `
        -resize "16x16^!" `
        -colorspace Gray `
        -depth 8 `
        txt:- 2>$null

    if (-not $txt) { return $null }

    $values = @()

    foreach ($line in ($txt -split "`n")) {
        # Filtramos líneas de pixel, buscamos srgb(r,g,b)
        if ($line -match 'srgb\((\d+),(\d+),(\d+)\)') {
            $v = [int]$matches[1]   # en gris r=g=b
            $values += $v
        }
    }

    if ($values.Count -ne 256) {
        # Algo raro; devolvemos vacío
        return $null
    }

    # Media de luminancia
    $mean = ($values | Measure-Object -Average).Average

    # Convertimos a bits según la media
    $bits = New-Object System.Collections.Generic.List[int]
    foreach ($v in $values) {
        if ($v -ge $mean) { $bits.Add(1) } else { $bits.Add(0) }
    }

    # Agrupamos de 4 en 4 bits -> un dígito hex
    $hexChars = New-Object System.Text.StringBuilder
    for ($i = 0; $i -lt $bits.Count; $i += 4) {
        $n = ($bits[$i] -shl 3) -bor ($bits[$i+1] -shl 2) -bor ($bits[$i+2] -shl 1) -bor $bits[$i+3]
        [void]$hexChars.Append(("{0:X1}" -f $n))
    }

    return $hexChars.ToString()
}

# -------------------------
# Función: fuerza de textura/contraste (0–100)
# -------------------------
function Get-TextureStrength {
    param(
        [string]$ImagePath
    )

    $info = & magick "$ImagePath" -quiet `
        -colorspace Gray `
        -format "%[standard_deviation];%[quantumrange]" info: 2>$null

    if (-not $info -or -not $info.Contains(";")) {
        return $null
    }

    $parts = $info -split ';'
    $std = [double]$parts[0]
    $qr  = [double]$parts[1]

    if ($qr -eq 0) { return $null }

    # Normalizamos a 0–100
    $value = ($std / $qr) * 100.0
    return [Math]::Round($value, 2)
}

$results = @()

Get-ChildItem -Path $FolderPath -File | Where-Object {
    $imageExtensions -contains $_.Extension.ToLower()
} | ForEach-Object {

    $file = $_
    $full = $file.FullName

    # Básicos + brillo medio
    $info_basic = & magick "$full" -quiet `
        -colorspace Gray `
        -format "%w;%h;%[fx:mean*100]" info: 2>$null

    $width = $null
    $height = $null
    $meanBright = $null

    if ($info_basic -and $info_basic.Contains(";")) {
        $parts = $info_basic -split ';'
        $width      = [int]$parts[0]
        $height     = [int]$parts[1]
        $meanBright = [Math]::Round([double]$parts[2], 2)
    }

    $aspect = $null
    if ($height -and $height -ne 0) {
        $aspect = [Math]::Round(($width / $height), 4)
    }

    # Hash perceptual propio
    $avgHash = Get-AvgHash -ImagePath $full

    # Color dominante
    $domRaw = & magick "$full" -quiet -scale "1x1!" -format "%[pixel:p{0,0}]" info: 2>$null
    $domHex = $domRaw
    if ($domRaw -match 'srgb\((\d+),(\d+),(\d+)\)') {
        $domHex = "#{0:X2}{1:X2}{2:X2}" -f $matches[1], $matches[2], $matches[3]
    }

    # Textura / contraste
    $texture = Get-TextureStrength -ImagePath $full

    $results += [pscustomobject]@{
        FileName        = $file.BaseName
        Extension       = $file.Extension.TrimStart('.')
        Width           = $width
        Height          = $height
        AspectRatio     = $aspect
        FileSizeBytes   = $file.Length
        AvgHash         = $avgHash
        MeanBrightness  = $meanBright
        TextureStrength = $texture
        DominantColor   = $domHex
        LastWriteTime   = $file.LastWriteTime
        FullPath        = $full
    }
}

$results | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8

Write-Host "`nListo. CSV generado:`n  $OutputCsv"

