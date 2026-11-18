<#
  Prepares REAL handwriting photos for the local validation protocol
  (__tests__/realProtocol.optin.test.js), on Windows, with no extra software:

    - reads JPEG / PNG photos from real-samples\originals (HEIC is not
      readable here: set the phone camera to JPEG / "Most compatible", or
      export as JPEG first)
    - applies the photo's EXIF orientation, as the app's native decoder does
    - scales the long edge to 2000 px, the app's analysis size
      (src/handwriting/learn/raster.js ANALYSIS_LONG_EDGE)
    - writes <name>.png into real-samples\ — PNG keeps no EXIF, so camera
      details and GPS location are not copied

  Prints only file names and sizes, never image data. Everything stays in
  real-samples\, which is git-ignored. Run from the project folder:

    powershell -ExecutionPolicy Bypass -File scripts\real-samples-to-png.ps1
#>
param(
  [string]$Source = 'real-samples\originals',
  [string]$Target = 'real-samples',
  [int]$LongEdge = 2000
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$targetFull = [System.IO.Path]::GetFullPath($Target)
if (-not ($targetFull -match '[\\/]real-samples([\\/]|$)')) {
  throw "Refusing to write outside a real-samples folder: $targetFull"
}
if (-not (Test-Path $Source)) { throw "No photos folder: $Source (put the phone photos there)" }
New-Item -ItemType Directory -Force -Path $Target | Out-Null

# EXIF orientation (tag 0x0112) -> the rotation that shows the photo upright.
$turns = @{
  2 = [System.Drawing.RotateFlipType]::RotateNoneFlipX
  3 = [System.Drawing.RotateFlipType]::Rotate180FlipNone
  4 = [System.Drawing.RotateFlipType]::Rotate180FlipX
  5 = [System.Drawing.RotateFlipType]::Rotate90FlipX
  6 = [System.Drawing.RotateFlipType]::Rotate90FlipNone
  7 = [System.Drawing.RotateFlipType]::Rotate270FlipX
  8 = [System.Drawing.RotateFlipType]::Rotate270FlipNone
}

$photos = Get-ChildItem -Path $Source -File | Where-Object { $_.Extension -match '^\.(jpe?g|png)$' }
if (-not $photos) { Write-Output "No .jpg / .jpeg / .png files in $Source"; exit 0 }

foreach ($f in $photos) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  try {
    $orientation = 1
    if ($img.PropertyIdList -contains 0x0112) { $orientation = [int]$img.GetPropertyItem(0x0112).Value[0] }
    if ($turns.ContainsKey($orientation)) { $img.RotateFlip($turns[$orientation]) }
    $scale = [Math]::Min(1.0, $LongEdge / [double][Math]::Max($img.Width, $img.Height))
    $w = [int][Math]::Round($img.Width * $scale)
    $h = [int][Math]::Round($img.Height * $scale)
    $out = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($out)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.DrawImage($img, 0, 0, $w, $h)
    } finally { $g.Dispose() }
    $dest = Join-Path $Target ($f.BaseName + '.png')
    $out.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose()
    Write-Output ("{0} -> {1}  ({2}x{3}, EXIF orientation {4})" -f $f.Name, (Split-Path $dest -Leaf), $w, $h, $orientation)
  } finally { $img.Dispose() }
}
