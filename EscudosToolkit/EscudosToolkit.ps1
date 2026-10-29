# EscudosToolkit.ps1
# Toolkit consolidado para normalizar escudos, generar informes y analizar similitud.
# Requiere: Windows PowerShell 5.1+ e ImageMagick 7.x accesible mediante "magick".
#
# MODOS
#   1. Normalizar imágenes + generar CSV
#   2. Solo generar CSV
#   3. Comparar hashes de un CSV
#   4. Verificar y organizar estructura de carpetas
#
# NOTA IMPORTANTE SOBRE HASHES
#   ImageMagick "%#" es una image signature, NO un perceptual hash real.
#   En este toolkit se conserva como "ImageSignature" por compatibilidad/diagnóstico.
#   El dHash se calcula explícitamente a partir de una versión 9x8 en escala de grises.

chcp 65001 | Out-Null
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

$ScriptStartPath = Get-Location

function Test-ImageMagick {
    $command = Get-Command magick -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return $false
    }

    & $command.Source -version > $null 2>&1
    return ($LASTEXITCODE -eq 0)
}

function Install-ImageMagick {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($null -eq $winget) {
        Write-Error "No se encuentra winget. Instala ImageMagick manualmente desde https://imagemagick.org/script/download.php#windows"
        return $false
    }

    Write-Host "Instalando ImageMagick mediante winget..." -ForegroundColor Cyan
    & $winget.Source install --id ImageMagick.ImageMagick -e --accept-package-agreements --accept-source-agreements

    if ($LASTEXITCODE -ne 0) {
        Write-Error "winget no pudo instalar ImageMagick."
        return $false
    }

    Write-Host "ImageMagick se ha instalado. Cierra y vuelve a abrir PowerShell para actualizar PATH y ejecuta de nuevo el toolkit." -ForegroundColor Green
    return $true
}

function Test-Ghostscript {
    $commands = @('gswin64c', 'gswin32c', 'gs')
    foreach ($commandName in $commands) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            & $command.Source --version > $null 2>&1
            if ($LASTEXITCODE -eq 0) { return $true }
        }
    }
    return $false
}

function Read-ExistingDirectory {
    param([string]$Prompt)
    do {
        $value = Read-Host $Prompt
        $item = Get-Item -LiteralPath $value -ErrorAction SilentlyContinue
        if ($null -eq $item -or -not $item.PSIsContainer) {
            Write-Warning "La ruta '$value' no es una carpeta válida."
        }
    } until ($null -ne $item -and $item.PSIsContainer)
    return $item.FullName
}

function Read-ExistingCsvFile {
    param([string]$Prompt)
    do {
        $value = Read-Host $Prompt
        $item = Get-Item -LiteralPath $value -ErrorAction SilentlyContinue
        if ($null -eq $item -or $item.PSIsContainer -or $item.Extension -ne '.csv') {
            Write-Warning "La ruta '$value' no es un archivo CSV válido."
        }
    } until ($null -ne $item -and -not $item.PSIsContainer -and $item.Extension -eq '.csv')
    return $item.FullName
}

function Read-ProcessingScope {
    while ($true) {
        Write-Host ""
        Write-Host "La ruta seleccionada corresponde a:" -ForegroundColor Cyan
        Write-Host "1. ROOT (contiene varias competiciones)"
        Write-Host "2. Una competición específica"
        $scope = (Read-Host "Selecciona 1 o 2").Trim()
        if ($scope -eq '1') { return 'Root' }
        if ($scope -eq '2') { return 'Competition' }
        Write-Warning "Opción no válida."
    }
}

function Get-AvailableMovePath {
    param(
        [string]$DestinationDirectory,
        [System.IO.FileInfo]$Source,
        [string]$CollisionSuffix = ''
    )

    $candidate = Join-Path $DestinationDirectory $Source.Name
    if (-not (Test-Path -LiteralPath $candidate)) { return $candidate }

    $suffix = if ([string]::IsNullOrWhiteSpace($CollisionSuffix)) { 'duplicado' } else { $CollisionSuffix }
    $counter = 1
    do {
        $numberSuffix = if ($counter -eq 1) { '' } else { "_$counter" }
        $candidate = Join-Path $DestinationDirectory ("{0}_{1}{2}{3}" -f $Source.BaseName, $suffix, $numberSuffix, $Source.Extension)
        $counter++
    } while (Test-Path -LiteralPath $candidate)

    return $candidate
}

function Initialize-CompetitionStructure {
    param(
        [string]$Root,
        [ValidateSet('Root', 'Competition')]
        [string]$Scope
    )

    $imageExtensions = @('.png', '.jpg', '.jpeg', '.webp', '.svg', '.ai', '.eps', '.ps', '.pdf', '.gif', '.psd', '.tif', '.tiff', '.bmp')
    $competitions = if ($Scope -eq 'Root') {
        @(Get-ChildItem -LiteralPath $Root -Directory -ErrorAction Stop |
            Where-Object {
                $_.Name -ne '_ejemplos' -and
                $_.Name -ne '_Informes' -and
                $_.Name -notmatch '^(\d+)x\1$' -and
                $_.Name -ne 'ORIGINALES' -and
                $_.Name -ne 'OLD'
            })
    } else {
        @((Get-Item -LiteralPath $Root -ErrorAction Stop))
    }

    if ($competitions.Count -eq 0) {
        Write-Warning "No se encontraron carpetas de competición dentro de '$Root'."
        return
    }

    foreach ($competition in $competitions) {
        Write-Host ""
        Write-Host "Verificando estructura: $($competition.FullName)" -ForegroundColor Cyan

        $originalsDirectory = Join-Path $competition.FullName 'ORIGINALES'
        if (-not (Test-Path -LiteralPath $originalsDirectory)) {
            New-Item -ItemType Directory -Path $originalsDirectory -ErrorAction Stop | Out-Null
            Write-Host "Creada carpeta ORIGINALES." -ForegroundColor Gray
        }

        $looseImages = @(Get-ChildItem -LiteralPath $competition.FullName -File -ErrorAction Stop |
            Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() })

        foreach ($looseImage in $looseImages) {
            $destination = Get-AvailableMovePath -DestinationDirectory $originalsDirectory -Source $looseImage
            Move-Item -LiteralPath $looseImage.FullName -Destination $destination -ErrorAction Stop
            Write-Host "Movido a ORIGINALES: $($looseImage.Name)" -ForegroundColor Gray
        }

        $oldDirectories = @(Get-ChildItem -LiteralPath $competition.FullName -Directory -ErrorAction Stop |
            Where-Object { $_.Name -eq 'OLD' })

        foreach ($oldDirectory in $oldDirectories) {
            Write-Warning "Se ha encontrado una carpeta OLD: $($oldDirectory.FullName)"
            Write-Warning "OLD se conserva sin cambios y se excluirá del procesamiento."
        }
    }
}

function Test-SquareOutputFolders {
    param([string]$Root)

    $squareFolders = New-Object System.Collections.Generic.List[object]
    $rootItem = Get-Item -LiteralPath $Root -ErrorAction Stop

    if ($rootItem.Name -match '^(\d+)x\1$') {
        $squareFolders.Add($rootItem)
    }

    Get-ChildItem -LiteralPath $Root -Recurse -Directory -ErrorAction Stop |
        Where-Object {
            $_.Name -match '^(\d+)x\1$' -and
            $_.FullName -notmatch '[\\/]_ejemplos([\\/]|$)' -and
            $_.FullName -notmatch '[\\/]_Informes([\\/]|$)' -and
            $_.FullName -notmatch '[\\/]OLD([\\/]|$)'
        } |
        ForEach-Object { $squareFolders.Add($_) }

    if ($squareFolders.Count -eq 0) {
        Write-Host "No se encontraron carpetas con patrón NxN para verificar." -ForegroundColor Yellow
        return
    }

    $results = New-Object System.Collections.Generic.List[object]
    $checked = 0
    $outOfSpec = 0
    $unreadable = 0

    foreach ($squareFolder in $squareFolders) {
        $match = [regex]::Match($squareFolder.Name, '^(\d+)x\1$')
        $expectedSize = [int]$match.Groups[1].Value
        $files = @(Get-ChildItem -LiteralPath $squareFolder.FullName -Recurse -File -ErrorAction Stop)

        foreach ($file in $files) {
            $checked++
            $sourceFrame = "$($file.FullName)[0]"
            $dimensions = ([string](& magick identify -ping -format "%w,%h" -- "$sourceFrame" 2>$null)).Trim()
            $dimensionsMatch = [regex]::Match($dimensions, '^(\d+),(\d+)$')

            if ($LASTEXITCODE -ne 0 -or -not $dimensionsMatch.Success) {
                $status = 'NoLegible'
                $actualDimensions = ''
                $unreadable++
            } else {
                $width = [int]$dimensionsMatch.Groups[1].Value
                $height = [int]$dimensionsMatch.Groups[2].Value
                $actualDimensions = "${width}x${height}"
                if ($width -eq $expectedSize -and $height -eq $expectedSize) {
                    $status = 'OK'
                } else {
                    $status = 'FueraEspecificacion'
                    $outOfSpec++
                }
            }

            $results.Add([PSCustomObject]@{
                Estado             = $status
                Archivo            = $file.Name
                Extension          = $file.Extension.ToLowerInvariant()
                Ruta               = $file.FullName
                CarpetaNxN         = $squareFolder.Name
                DimensionesEsperadas = "${expectedSize}x${expectedSize}"
                DimensionesReales  = $actualDimensions
            })
        }
    }

    $reportDirectory = Join-Path $PSScriptRoot '_Informes'
    if (-not (Test-Path -LiteralPath $reportDirectory)) {
        New-Item -ItemType Directory -Path $reportDirectory -ErrorAction Stop | Out-Null
    }

    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $reportPath = Join-Path $reportDirectory ("verificacion_carpetas_nxn_$timestamp.csv")
    if ($results.Count -gt 0) {
        $results | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8
    } else {
        '"Estado","Archivo","Extension","Ruta","CarpetaNxN","DimensionesEsperadas","DimensionesReales"' |
            Set-Content -Path $reportPath -Encoding UTF8
    }

    Write-Host ""
    Write-Host "Verificación de carpetas NxN completada." -ForegroundColor Cyan
    Write-Host "Archivos comprobados: $checked" -ForegroundColor Gray
    Write-Host "Fuera de especificación: $outOfSpec" -ForegroundColor $(if ($outOfSpec -gt 0) { 'Yellow' } else { 'Green' })
    Write-Host "No legibles: $unreadable" -ForegroundColor $(if ($unreadable -gt 0) { 'Yellow' } else { 'Green' })
    Write-Host "Informe generado: $reportPath" -ForegroundColor Gray
}

function Read-PositiveInteger {
    param(
        [string]$Prompt,
        [int]$Default = 0
    )
    while ($true) {
        $raw = Read-Host $Prompt
        if ([string]::IsNullOrWhiteSpace($raw) -and $Default -gt 0) {
            return $Default
        }
        $n = 0
        if ([int]::TryParse($raw, [ref]$n) -and $n -gt 0) {
            return $n
        }
        Write-Warning "Introduce un número entero mayor que 0."
    }
}

function Wait-ForUser {
    param([string]$Message = 'Pulsa Enter para continuar')
    [void](Read-Host "`n$Message")
}

function Get-ImageInfo {
    param(
        [System.IO.FileInfo]$Image,
        [int]$BoxSize
    )

    $file = $Image.FullName
    $sourceFrame = "${file}[0]"
    $vectorExtensions = @('.svg', '.ai', '.eps', '.ps', '.pdf')
    $isVector = $vectorExtensions -contains $Image.Extension.ToLowerInvariant()
    $rasterDensity = if ($Image.Extension -ieq '.svg') { 600 } elseif ($isVector) { 300 } else { 0 }

    $identifyMessages = @(& magick identify -ping -- "$sourceFrame" 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $detail = ($identifyMessages | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ }) -join ' '
        if ($Image.Extension -ieq '.ai') {
            throw "ImageMagick no puede leer el archivo AI. Comprueba que Ghostscript esté instalado y que el AI se haya guardado con compatibilidad PDF. Detalle: $detail"
        }
        throw "ImageMagick no puede leer el archivo. Detalle: $detail"
    }

    $origBox = [string](& magick -background none "$sourceFrame" -format "%wx%h" info: 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "No se pudieron obtener las dimensiones originales." }
    $opaque = [string](& magick -background none "$sourceFrame" -format "%[opaque]" info: 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "No se pudo comprobar el canal alfa." }
    $geom = [string](& magick -background none "$sourceFrame" -format "%@" info: 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "No se pudo calcular el bounding box del contenido." }

    $origBox = $origBox.Trim()
    $opaque = $opaque.Trim()
    $geom = $geom.Trim()

    if ([string]::IsNullOrWhiteSpace($origBox) -or [string]::IsNullOrWhiteSpace($geom)) {
        throw "ImageMagick devolvió dimensiones incompletas."
    }

    $parts = $geom -split '[x+]'
    if ($parts.Count -lt 2) {
        throw "La geometría devuelta por ImageMagick no es válida: '$geom'."
    }

    $fillW = [int]$parts[0]
    $fillH = [int]$parts[1]

    # ImageMagick signature sobre una versión normalizada.
    # Se conserva para diagnóstico, pero no debe tratarse como pHash real.
    $signatureInputArguments = if ($rasterDensity -gt 0) {
        @('-background', 'none', '-density', $rasterDensity, $sourceFrame)
    } else {
        @('-background', 'none', $sourceFrame)
    }

    $signature = [string](& magick @signatureInputArguments `
        -trim +repage `
        -background white -alpha remove -alpha off `
        -resize 256x256! `
        -colorspace Gray `
        -format "%#" info: 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "No se pudo calcular ImageSignature." }
    $signature = $signature.Trim()

    $dHash = Get-DHash -File $sourceFrame -Density $rasterDensity
    if ([string]::IsNullOrWhiteSpace($dHash)) { throw "No se pudo calcular dHash." }

    $reviewParts = @()
    if ($opaque -eq 'True') {
        $reviewParts += 'Alpha!'
    }
    if ([math]::Max($fillW, $fillH) -lt $BoxSize) {
        $reviewParts += 'Resolución!'
    }
    $review = if ($reviewParts.Count -eq 0) { 'OK' } else { $reviewParts -join ' | ' }

    # Mantiene el comportamiento de las versiones estables:
    # Las imágenes raster pequeñas no se amplían; los formatos vectoriales sí.
    $scale = $BoxSize / [double]([math]::Max($fillW, $fillH))
    if ($scale -gt 1 -and -not $isVector) { $scale = 1 }

    $newW = [int]([math]::Round($fillW * $scale))
    $newH = [int]([math]::Round($fillH * $scale))

    return [PSCustomObject]@{
        NombreArchivo   = $Image.BaseName
        ExtensionOriginal = $Image.Extension.ToLowerInvariant()
        REVISAR         = $review
        OriginalPath    = $file
        OriginalBoxDims = $origBox
        OriginalFillDims= "${fillW}x${fillH}"
        OutputBoxDims   = "${BoxSize}x${BoxSize}"
        OutputFillDims  = "${newW}x${newH}"
        ImageSignature  = $signature
        dHash           = $dHash
        FillWidth       = $fillW
        FillHeight      = $fillH
        OutputWidth     = $newW
        OutputHeight    = $newH
    }
}

function Get-DHash {
    param(
        [string]$File,
        [int]$Density = 0
    )

    # Genera 9x8 píxeles grises y obtiene sus intensidades mediante txt:.
    # dHash = comparación horizontal de cada píxel con el siguiente: 8x8 = 64 bits.
    $inputArguments = if ($Density -gt 0) {
        @('-background', 'none', '-density', $Density, $File)
    } else {
        @('-background', 'none', $File)
    }

    $lines = & magick @inputArguments `
        -trim +repage `
        -background white -alpha remove -alpha off `
        -colorspace Gray `
        -resize 9x8! `
        -depth 8 `
        txt:- 2>$null

    if (-not $lines) { return "" }

    $values = New-Object System.Collections.Generic.List[int]

    foreach ($line in $lines) {
        # Ejemplo esperado:
        # 0,0: (255)  #FFFFFF  gray(255)
        if ($line -match 'gray\((\d+)') {
            $values.Add([int]$matches[1])
        }
        elseif ($line -match '\((\d+)\)') {
            $values.Add([int]$matches[1])
        }
    }

    if ($values.Count -lt 72) {
        return ""
    }

    [UInt64]$hash = 0
    $bit = 0

    for ($y = 0; $y -lt 8; $y++) {
        for ($x = 0; $x -lt 8; $x++) {
            $left  = $values[$y * 9 + $x]
            $right = $values[$y * 9 + $x + 1]

            if ($left -gt $right) {
                $hash = $hash -bor ([UInt64]1 -shl $bit)
            }
            $bit++
        }
    }

    return $hash.ToString("X16")
}

function Get-HammingDistance64 {
    param(
        [string]$Hash1,
        [string]$Hash2
    )

    if ($Hash1 -notmatch '^[0-9A-Fa-f]{16}$' -or $Hash2 -notmatch '^[0-9A-Fa-f]{16}$') {
        return [int]::MaxValue
    }

    [UInt64]$a = [Convert]::ToUInt64($Hash1, 16)
    [UInt64]$b = [Convert]::ToUInt64($Hash2, 16)
    [UInt64]$xor = $a -bxor $b

    $count = 0
    while ($xor -ne 0) {
        $xor = $xor -band ($xor - 1)
        $count++
    }
    return $count
}

function Get-AvailableOutputPath {
    param(
        [System.IO.FileInfo]$Source,
        [string]$OutputDirectory,
        [System.Collections.Generic.HashSet[string]]$ReservedPaths,
        [bool]$ForceExtensionSuffix = $false
    )

    $defaultPath = Join-Path $OutputDirectory ($Source.BaseName + '.png')
    if (-not $ForceExtensionSuffix -and -not (Test-Path -LiteralPath $defaultPath) -and $ReservedPaths.Add($defaultPath)) {
        return $defaultPath
    }

    $extensionSuffix = $Source.Extension.TrimStart('.').ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($extensionSuffix)) { $extensionSuffix = 'sin_extension' }

    $candidate = Join-Path $OutputDirectory ("{0}_{1}.png" -f $Source.BaseName, $extensionSuffix)
    $counter = 2
    while ((Test-Path -LiteralPath $candidate) -or -not $ReservedPaths.Add($candidate)) {
        $candidate = Join-Path $OutputDirectory ("{0}_{1}_{2}.png" -f $Source.BaseName, $extensionSuffix, $counter)
        $counter++
    }

    return $candidate
}

function Invoke-ImageReport {
    param(
        [string]$Root,
        [int]$BoxSize,
        [bool]$Normalize
    )

    $boxDims = "${BoxSize}x${BoxSize}"
    $rootName = (Get-Item -LiteralPath $Root -ErrorAction Stop).Name
    $safeRootName = $rootName
    foreach ($invalidCharacter in [System.IO.Path]::GetInvalidFileNameChars()) {
        $safeRootName = $safeRootName.Replace([string]$invalidCharacter, '_')
    }
    $csvPath = Join-Path $Root ("informe_{0}_{1}.csv" -f $safeRootName, $BoxSize)
    $errorCsvPath = Join-Path $Root ("errores_{0}_{1}.csv" -f $safeRootName, $BoxSize)
    $rejectedExtensions = @('.gif', '.psd')
    $reportExtensions = @('.csv', '.xls', '.xlsx', '.xlsm')

    # Se excluye cualquier carpeta con patrón NxN para no reprocesar outputs cuadrados.
    $files = @(Get-ChildItem -LiteralPath $Root -Recurse -File |
        Where-Object {
            $relativeParent = $_.DirectoryName.Substring($Root.TrimEnd('\').Length).TrimStart('\')
            $folderParts = @($relativeParent -split '\\' | Where-Object { $_ })
            $insideSquareOutput = @($folderParts | Where-Object { $_ -match '^(\d+)x\1$' }).Count -gt 0
            $insideIgnoredFolder = @($folderParts | Where-Object { $_ -eq '_ejemplos' -or $_ -eq '_Informes' -or $_ -eq 'OLD' }).Count -gt 0
            -not $insideSquareOutput -and -not $insideIgnoredFolder -and
            $reportExtensions -notcontains $_.Extension.ToLowerInvariant() -and
            $_.FullName -ne $csvPath -and
            $_.FullName -ne $errorCsvPath
        })

    if ($files.Count -eq 0) {
        Write-Warning "No se encontraron archivos para analizar."
        return
    }

    $rows = New-Object System.Collections.Generic.List[object]
    $errors = New-Object System.Collections.Generic.List[object]
    $reservedPaths = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $nameCollisionCounts = @{}
    foreach ($candidateFile in $files) {
        if ($rejectedExtensions -contains $candidateFile.Extension.ToLowerInvariant()) { continue }
        $collisionKey = ($candidateFile.DirectoryName + '|' + $candidateFile.BaseName).ToLowerInvariant()
        if ($nameCollisionCounts.ContainsKey($collisionKey)) {
            $nameCollisionCounts[$collisionKey]++
        } else {
            $nameCollisionCounts[$collisionKey] = 1
        }
    }
    $recognized = 0
    $converted = 0
    $rejected = 0
    $failed = 0

    for ($i = 0; $i -lt $files.Count; $i++) {
        $img = $files[$i]
        $pct = [int](($i + 1) * 100 / $files.Count)

        Write-Progress `
            -Activity $(if ($Normalize) { "Normalizando imágenes" } else { "Generando informe" }) `
            -Status ("{0} de {1} - {2}" -f ($i + 1), $files.Count, $img.Name) `
            -PercentComplete $pct

        if ($rejectedExtensions -contains $img.Extension.ToLowerInvariant()) {
            $rejected++
            $message = "Formato $($img.Extension.ToUpperInvariant()) rechazado. Guarda el archivo en un formato aceptado, preferiblemente PNG."
            Write-Warning "$message Ruta: $($img.FullName)"
            $errors.Add([PSCustomObject]@{
                OriginalPath = $img.FullName
                Estado       = 'Rechazado'
                Operacion    = 'Validación de formato'
                Mensaje      = $message
            })
            continue
        }

        try {
            $info = Get-ImageInfo -Image $img -BoxSize $BoxSize
            $recognized++
            $outputPath = ''

            if ($Normalize) {
                $outDir = Join-Path $img.DirectoryName $boxDims
                if (-not (Test-Path -LiteralPath $outDir)) {
                    New-Item -ItemType Directory -Path $outDir -ErrorAction Stop | Out-Null
                }

                $collisionKey = ($img.DirectoryName + '|' + $img.BaseName).ToLowerInvariant()
                $forceExtensionSuffix = $nameCollisionCounts[$collisionKey] -gt 1
                $outputPath = Get-AvailableOutputPath -Source $img -OutputDirectory $outDir -ReservedPaths $reservedPaths -ForceExtensionSuffix $forceExtensionSuffix
                $sourceFrame = "$($img.FullName)[0]"
                $vectorExtensions = @('.svg', '.ai', '.eps', '.ps', '.pdf')
                $inputArguments = if ($img.Extension -ieq '.svg') {
                    @('-background', 'none', '-density', 600, $sourceFrame)
                } elseif ($vectorExtensions -contains $img.Extension.ToLowerInvariant()) {
                    @('-background', 'none', '-density', 300, $sourceFrame)
                } else {
                    @('-background', 'none', $sourceFrame)
                }

                & magick @inputArguments `
                    -trim +repage `
                    -resize "$($info.OutputWidth)x$($info.OutputHeight)" `
                    -background none `
                    -gravity center `
                    -extent $boxDims `
                    "PNG32:$outputPath"

                if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputPath)) {
                    throw "ImageMagick no pudo generar el archivo normalizado."
                }

                $converted++
            }

            $rows.Add([PSCustomObject]@{
                NombreArchivo    = $info.NombreArchivo
                ExtensionOriginal= $info.ExtensionOriginal
                REVISAR          = $info.REVISAR
                OriginalPath     = $info.OriginalPath
                OutputPath       = $outputPath
                OriginalBoxDims  = $info.OriginalBoxDims
                OriginalFillDims = $info.OriginalFillDims
                OutputBoxDims    = $info.OutputBoxDims
                OutputFillDims   = $info.OutputFillDims
                ImageSignature   = $info.ImageSignature
                dHash            = $info.dHash
            })
        }
        catch {
            $failed++
            $message = $_.Exception.Message
            Write-Warning "Error procesando '$($img.FullName)': $message"
            $errors.Add([PSCustomObject]@{
                OriginalPath = $img.FullName
                Estado       = 'Error'
                Operacion    = if ($Normalize) { 'Análisis o conversión' } else { 'Análisis' }
                Mensaje      = $message
            })
        }
    }

    Write-Progress -Activity "Procesando imágenes" -Completed

    $rows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8

    if ($errors.Count -gt 0) {
        $errors | Export-Csv -Path $errorCsvPath -NoTypeInformation -Encoding UTF8
    }

    Write-Host ""
    Write-Host "Imágenes reconocidas: $recognized" -ForegroundColor Green
    if ($Normalize) { Write-Host "Imágenes convertidas: $converted" -ForegroundColor Green }
    Write-Host "Archivos rechazados: $rejected" -ForegroundColor Yellow
    Write-Host "Archivos con error: $failed" -ForegroundColor $(if ($failed -gt 0) { 'Yellow' } else { 'Gray' })
    Write-Host "Informe generado: $csvPath" -ForegroundColor Gray
    if ($errors.Count -gt 0) { Write-Host "Informe de errores: $errorCsvPath" -ForegroundColor Gray }
}

function Invoke-HashComparison {
    $csvPath = Read-ExistingCsvFile "Introduce la ruta completa del CSV generado por EscudosToolkit"

    Write-Host ""
    Write-Host "dHash usa 64 bits. Cuanto menor sea el umbral, más estricta es la comparación." -ForegroundColor Cyan
    Write-Host "Punto de partida recomendado: 4-8. Ajusta según falsos positivos/negativos." -ForegroundColor Yellow
    $threshold = Read-PositiveInteger "Umbral máximo dHash [6]" 6

    $data = @(Import-Csv -LiteralPath $csvPath |
        Where-Object { $_.dHash -match '^[0-9A-Fa-f]{16}$' })

    if ($data.Count -lt 2) {
        Write-Warning "No hay suficientes registros con dHash válido."
        return
    }

    $pairCount = [int64]$data.Count * ($data.Count - 1) / 2
    [int64]$current = 0
    $matches = New-Object System.Collections.Generic.List[object]

    for ($i = 0; $i -lt $data.Count; $i++) {
        for ($j = $i + 1; $j -lt $data.Count; $j++) {
            $current++

            if (($current % 100) -eq 0 -or $current -eq $pairCount) {
                $pct = [int]($current * 100 / $pairCount)
                Write-Progress `
                    -Activity "Comparando dHash" `
                    -Status ("{0} de {1} pares" -f $current, $pairCount) `
                    -PercentComplete $pct
            }

            $distance = Get-HammingDistance64 $data[$i].dHash $data[$j].dHash

            if ($distance -le $threshold) {
                $matches.Add([PSCustomObject]@{
                    Image1        = $data[$i].OriginalPath
                    Image2        = $data[$j].OriginalPath
                    dHashDistance = $distance
                })
            }
        }
    }

    Write-Progress -Activity "Comparando dHash" -Completed

    $outPath = Join-Path (Split-Path $csvPath) ("similares_dhash_{0}.csv" -f $threshold)

    if ($matches.Count -eq 0) {
        Write-Host "No se encontraron parejas bajo el umbral $threshold." -ForegroundColor Yellow
        return
    }

    $matches |
        Sort-Object dHashDistance |
        Export-Csv -Path $outPath -NoTypeInformation -Encoding UTF8

    Write-Host "Parejas encontradas: $($matches.Count)" -ForegroundColor Green
    Write-Host "Informe generado: $outPath" -ForegroundColor Gray
}

if (-not (Test-ImageMagick)) {
    Write-Warning "No se encuentra ImageMagick o no responde correctamente."
    $install = Read-Host "¿Quieres instalar ImageMagick ahora mediante winget? (S/N)"
    if ($install -match '^[Ss]$') {
        $installed = Install-ImageMagick
        if ($installed) { exit 0 }
    } else {
        Write-Error "ImageMagick es obligatorio. Instálalo y ejecuta de nuevo el toolkit."
    }
    exit 1
}

if (-not (Test-Ghostscript)) {
    Write-Warning "No se encuentra Ghostscript. Los formatos AI, EPS, PS y PDF no podrán procesarse; PNG, JPG, SVG y otros formatos raster compatibles seguirán funcionando."
    Write-Host "Instalación manual recomendada:" -ForegroundColor Cyan
    Write-Host "  1. Descarga Ghostscript para Windows 64-bit desde:" -ForegroundColor Gray
    Write-Host "     https://ghostscript.com/releases/gsdnld.html" -ForegroundColor White
    Write-Host "  2. Instálalo con las opciones predeterminadas." -ForegroundColor Gray
    Write-Host "  3. Cierra y vuelve a abrir PowerShell." -ForegroundColor Gray
    Write-Host "  4. Comprueba la instalación con: gswin64c --version" -ForegroundColor Gray
    Write-Warning "Se continuará sin Ghostscript. Convierte previamente AI, EPS, PS o PDF a PNG."
    Wait-ForUser -Message 'Pulsa Enter para continuar sin Ghostscript'
}

try {
    $exitRequested = $false

    do {
        Clear-Host
        Write-Host ""
        Write-Host "======================================================"
        Write-Host " ESCUDOS TOOLKIT"
        Write-Host "======================================================"
        Write-Host "1. Normalizar imágenes + generar informe"
        Write-Host "2. Solo generar informe"
        Write-Host "3. Comparar similitud mediante dHash"
        Write-Host "4. Verificar y organizar estructura de carpetas"
        Write-Host "5. Salir"
        Write-Host ""

        $mode = (Read-Host "Selecciona una opción").Trim()

        switch ($mode) {
            "1" {
                $root = Read-ExistingDirectory "Ruta de la carpeta que contiene las imágenes"
                Write-Host ""
                Write-Host "El tamaño será cuadrado (1:1)." -ForegroundColor Cyan
                $boxSize = Read-PositiveInteger "Tamaño de salida en píxeles (ej. 540)"
                Invoke-ImageReport -Root $root -BoxSize $boxSize -Normalize $true
                Wait-ForUser
            }
            "2" {
                $root = Read-ExistingDirectory "Ruta de la carpeta que contiene las imágenes"
                Write-Host ""
                Write-Host "El tamaño se usa para calcular las dimensiones teóricas del output." -ForegroundColor Cyan
                $boxSize = Read-PositiveInteger "Tamaño de salida en píxeles (ej. 540)"
                Invoke-ImageReport -Root $root -BoxSize $boxSize -Normalize $false
                Wait-ForUser
            }
            "3" {
                Invoke-HashComparison
                Wait-ForUser
            }
            "4" {
                $scope = Read-ProcessingScope
                $rootPrompt = if ($scope -eq 'Root') { 'Ruta de ROOT' } else { 'Ruta de la competición' }
                $root = Read-ExistingDirectory $rootPrompt
                Initialize-CompetitionStructure -Root $root -Scope $scope
                Test-SquareOutputFolders -Root $root
                Wait-ForUser
            }
            "5" {
                Wait-ForUser -Message 'Pulsa Enter para salir'
                $exitRequested = $true
            }
            default {
                Write-Warning "Opción no válida."
                Wait-ForUser
            }
        }
    } until ($exitRequested)
}
finally {
    Set-Location $ScriptStartPath
}
