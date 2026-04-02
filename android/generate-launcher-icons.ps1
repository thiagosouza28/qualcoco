Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$resRoot = Join-Path $projectRoot 'android\app\src\main\res'
$previewPath = Join-Path $projectRoot 'android\qualcoco-launcher-preview.png'

$palette = @{
  Bg = [System.Drawing.Color]::FromArgb(255, 241, 247, 239)
  BgBorder = [System.Drawing.Color]::FromArgb(255, 220, 232, 218)
  Dark = [System.Drawing.Color]::FromArgb(255, 10, 102, 68)
  Darker = [System.Drawing.Color]::FromArgb(255, 5, 73, 49)
  Green = [System.Drawing.Color]::FromArgb(255, 31, 143, 90)
  Light = [System.Drawing.Color]::FromArgb(255, 123, 197, 66)
  White = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
  Shell = [System.Drawing.Color]::FromArgb(255, 214, 218, 222)
  ShellDark = [System.Drawing.Color]::FromArgb(255, 163, 170, 178)
  Shadow = [System.Drawing.Color]::FromArgb(34, 5, 73, 49)
}

function New-PointF([float]$x, [float]$y) {
  return New-Object System.Drawing.PointF($x, $y)
}

function New-RoundedRectPath([System.Drawing.RectangleF]$rect, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2

  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

function New-LeafPath([float]$width, [float]$height) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $points = [System.Drawing.PointF[]]@(
    (New-PointF ($width * 0.06) ($height * 0.72)),
    (New-PointF ($width * 0.18) ($height * 0.28)),
    (New-PointF ($width * 0.48) ($height * 0.02)),
    (New-PointF ($width * 0.94) ($height * 0.08)),
    (New-PointF ($width * 0.82) ($height * 0.48)),
    (New-PointF ($width * 0.48) ($height * 0.92)),
    (New-PointF ($width * 0.14) ($height * 0.94))
  )
  $path.AddCurve($points, 0.25)
  $path.CloseFigure()

  return $path
}

function New-ShieldPath([System.Drawing.RectangleF]$rect) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $x = $rect.X
  $y = $rect.Y
  $w = $rect.Width
  $h = $rect.Height

  $path.StartFigure()
  $path.AddBezier(
    (New-PointF ($x + $w * 0.18) ($y + $h * 0.16)),
    (New-PointF ($x + $w * 0.20) ($y + $h * 0.05)),
    (New-PointF ($x + $w * 0.38) $y),
    (New-PointF ($x + $w * 0.50) $y)
  )
  $path.AddBezier(
    (New-PointF ($x + $w * 0.50) $y),
    (New-PointF ($x + $w * 0.62) $y),
    (New-PointF ($x + $w * 0.80) ($y + $h * 0.05)),
    (New-PointF ($x + $w * 0.82) ($y + $h * 0.16))
  )
  $path.AddLine(
    (New-PointF ($x + $w * 0.82) ($y + $h * 0.16)),
    (New-PointF ($x + $w * 0.82) ($y + $h * 0.52))
  )
  $path.AddBezier(
    (New-PointF ($x + $w * 0.82) ($y + $h * 0.72)),
    (New-PointF ($x + $w * 0.68) ($y + $h * 0.88)),
    (New-PointF ($x + $w * 0.50) ($y + $h)),
    (New-PointF ($x + $w * 0.50) ($y + $h))
  )
  $path.AddBezier(
    (New-PointF ($x + $w * 0.50) ($y + $h)),
    (New-PointF ($x + $w * 0.32) ($y + $h * 0.88)),
    (New-PointF ($x + $w * 0.18) ($y + $h * 0.72)),
    (New-PointF ($x + $w * 0.18) ($y + $h * 0.52))
  )
  $path.CloseFigure()

  return $path
}

function Draw-Leaf(
  [System.Drawing.Graphics]$graphics,
  [float]$x,
  [float]$y,
  [float]$width,
  [float]$height,
  [float]$angle,
  [System.Drawing.Color]$fromColor,
  [System.Drawing.Color]$toColor
) {
  $state = $graphics.Save()
  $graphics.TranslateTransform($x + ($width / 2), $y + ($height / 2))
  $graphics.RotateTransform($angle)
  $graphics.TranslateTransform(-($width / 2), -($height / 2))

  $path = New-LeafPath $width $height
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF 0 0),
    (New-PointF $width $height),
    $fromColor,
    $toColor
  )
  $pen = New-Object System.Drawing.Pen($palette.Dark, [Math]::Max(2, $width * 0.04))
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $graphics.FillPath($brush, $path)
  $graphics.DrawPath($pen, $path)

  $pen.Dispose()
  $brush.Dispose()
  $path.Dispose()
  $graphics.Restore($state)
}

function Draw-Coconut(
  [System.Drawing.Graphics]$graphics,
  [float]$x,
  [float]$y,
  [float]$width,
  [float]$height
) {
  $state = $graphics.Save()
  $graphics.TranslateTransform($x + ($width / 2), $y + ($height / 2))
  $graphics.RotateTransform(-22)
  $graphics.TranslateTransform(-($width / 2), -($height / 2))

  $outerRect = New-Object System.Drawing.RectangleF -ArgumentList 0, 0, $width, $height
  $innerRect = New-Object System.Drawing.RectangleF -ArgumentList ($width * 0.22), ($height * 0.10), ($width * 0.58), ($height * 0.78)
  $kernelRect = New-Object System.Drawing.RectangleF -ArgumentList ($width * 0.41), ($height * 0.29), ($width * 0.17), ($height * 0.37)
  $highlightRect = New-Object System.Drawing.RectangleF -ArgumentList ($width * 0.24), ($height * 0.12), ($width * 0.12), ($height * 0.70)

  $shellBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF 0 0),
    (New-PointF $width ($height * 0.85)),
    $palette.Green,
    $palette.Darker
  )
  $innerBrush = New-Object System.Drawing.SolidBrush($palette.White)
  $kernelBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF 0 0),
    (New-PointF $width $height),
    $palette.Shell,
    $palette.ShellDark
  )
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, $palette.Darker))
  $outlinePen = New-Object System.Drawing.Pen($palette.Dark, [Math]::Max(2, $width * 0.025))
  $innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 233, 239, 235), [Math]::Max(2, $width * 0.018))

  $graphics.FillEllipse($shadowBrush, $width * 0.03, $height * 0.08, $width * 0.92, $height * 0.92)
  $graphics.FillEllipse($shellBrush, $outerRect)
  $graphics.FillEllipse($innerBrush, $innerRect)
  $graphics.FillEllipse($kernelBrush, $kernelRect)
  $graphics.DrawArc($innerPen, $highlightRect, 100, 145)
  $graphics.DrawEllipse($outlinePen, $outerRect)
  $graphics.DrawEllipse($outlinePen, $innerRect)

  $innerPen.Dispose()
  $outlinePen.Dispose()
  $shadowBrush.Dispose()
  $kernelBrush.Dispose()
  $innerBrush.Dispose()
  $shellBrush.Dispose()
  $graphics.Restore($state)
}

function Draw-Shield(
  [System.Drawing.Graphics]$graphics,
  [float]$x,
  [float]$y,
  [float]$width,
  [float]$height
) {
  $shadowOffset = $width * 0.035
  $shadowPath = New-ShieldPath (New-Object System.Drawing.RectangleF -ArgumentList ($x + $shadowOffset), ($y + $shadowOffset), $width, $height)
  $shieldPath = New-ShieldPath (New-Object System.Drawing.RectangleF -ArgumentList $x, $y, $width, $height)

  $shadowBrush = New-Object System.Drawing.SolidBrush($palette.Shadow)
  $shieldBrush = New-Object System.Drawing.SolidBrush($palette.White)
  $shieldPen = New-Object System.Drawing.Pen($palette.Dark, [Math]::Max(3, $width * 0.045))
  $shieldPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $graphics.FillPath($shadowBrush, $shadowPath)
  $graphics.FillPath($shieldBrush, $shieldPath)
  $graphics.DrawPath($shieldPen, $shieldPath)

  $checkPen = New-Object System.Drawing.Pen($palette.Dark, [Math]::Max(4, $width * 0.09))
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $p1 = New-PointF ($x + $width * 0.30) ($y + $height * 0.53)
  $p2 = New-PointF ($x + $width * 0.46) ($y + $height * 0.68)
  $p3 = New-PointF ($x + $width * 0.71) ($y + $height * 0.40)

  $graphics.DrawLines($checkPen, [System.Drawing.PointF[]]@($p1, $p2, $p3))

  $checkPen.Dispose()
  $shieldPen.Dispose()
  $shieldBrush.Dispose()
  $shadowBrush.Dispose()
  $shieldPath.Dispose()
  $shadowPath.Dispose()
}

function Draw-Symbol([System.Drawing.Graphics]$graphics, [float]$size) {
  $symbolWidth = $size * 0.72
  $symbolHeight = $size * 0.70
  $offsetX = ($size - $symbolWidth) / 2
  $offsetY = ($size - $symbolHeight) / 2

  Draw-Coconut $graphics ($offsetX + ($symbolWidth * 0.03)) ($offsetY + ($symbolHeight * 0.30)) ($symbolWidth * 0.40) ($symbolHeight * 0.45)
  Draw-Leaf $graphics ($offsetX + ($symbolWidth * 0.36)) ($offsetY + ($symbolHeight * 0.01)) ($symbolWidth * 0.20) ($symbolHeight * 0.18) -18 $palette.Light $palette.Green
  Draw-Leaf $graphics ($offsetX + ($symbolWidth * 0.48)) ($offsetY + ($symbolHeight * 0.00)) ($symbolWidth * 0.26) ($symbolHeight * 0.20) 18 $palette.Green $palette.Darker
  Draw-Shield $graphics ($offsetX + ($symbolWidth * 0.29)) ($offsetY + ($symbolHeight * 0.22)) ($symbolWidth * 0.40) ($symbolHeight * 0.55)
}

function New-Graphics([System.Drawing.Bitmap]$bitmap) {
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  return $graphics
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $directory = Split-Path -Parent $path
  if ($directory) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-SquareIcon([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = New-Graphics $bitmap
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $padding = $size * 0.07
  $rect = New-Object System.Drawing.RectangleF -ArgumentList $padding, $padding, ($size - ($padding * 2)), ($size - ($padding * 2))
  $radius = $size * 0.22
  $path = New-RoundedRectPath $rect $radius

  $shadowPath = New-RoundedRectPath (New-Object System.Drawing.RectangleF -ArgumentList $rect.X, ($rect.Y + ($size * 0.018)), $rect.Width, $rect.Height) $radius
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, $palette.Darker))
  $bgBrush = New-Object System.Drawing.SolidBrush($palette.Bg)
  $bgPen = New-Object System.Drawing.Pen($palette.BgBorder, [Math]::Max(2, $size * 0.014))

  $graphics.FillPath($shadowBrush, $shadowPath)
  $graphics.FillPath($bgBrush, $path)
  $graphics.DrawPath($bgPen, $path)
  Draw-Symbol $graphics $size

  $bgPen.Dispose()
  $bgBrush.Dispose()
  $shadowBrush.Dispose()
  $shadowPath.Dispose()
  $path.Dispose()
  $graphics.Dispose()

  return $bitmap
}

function New-RoundIcon([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = New-Graphics $bitmap
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $padding = $size * 0.08
  $rect = New-Object System.Drawing.RectangleF -ArgumentList $padding, $padding, ($size - ($padding * 2)), ($size - ($padding * 2))
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, $palette.Darker))
  $bgBrush = New-Object System.Drawing.SolidBrush($palette.Bg)
  $bgPen = New-Object System.Drawing.Pen($palette.BgBorder, [Math]::Max(2, $size * 0.014))

  $graphics.FillEllipse($shadowBrush, $rect.X, $rect.Y + ($size * 0.018), $rect.Width, $rect.Height)
  $graphics.FillEllipse($bgBrush, $rect)
  $graphics.DrawEllipse($bgPen, $rect)
  Draw-Symbol $graphics $size

  $bgPen.Dispose()
  $bgBrush.Dispose()
  $shadowBrush.Dispose()
  $graphics.Dispose()

  return $bitmap
}

function New-ForegroundIcon([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = New-Graphics $bitmap
  $graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-Symbol $graphics $size
  $graphics.Dispose()
  return $bitmap
}

$legacySizes = @{
  'mipmap-mdpi' = 48
  'mipmap-hdpi' = 72
  'mipmap-xhdpi' = 96
  'mipmap-xxhdpi' = 144
  'mipmap-xxxhdpi' = 192
}

$foregroundSizes = @{
  'mipmap-mdpi' = 108
  'mipmap-hdpi' = 162
  'mipmap-xhdpi' = 216
  'mipmap-xxhdpi' = 324
  'mipmap-xxxhdpi' = 432
}

foreach ($entry in $legacySizes.GetEnumerator()) {
  $dir = Join-Path $resRoot $entry.Key

  $squareBitmap = New-SquareIcon $entry.Value
  Save-Png $squareBitmap (Join-Path $dir 'ic_launcher.png')
  $squareBitmap.Dispose()

  $roundBitmap = New-RoundIcon $entry.Value
  Save-Png $roundBitmap (Join-Path $dir 'ic_launcher_round.png')
  $roundBitmap.Dispose()
}

foreach ($entry in $foregroundSizes.GetEnumerator()) {
  $dir = Join-Path $resRoot $entry.Key
  $foregroundBitmap = New-ForegroundIcon $entry.Value
  Save-Png $foregroundBitmap (Join-Path $dir 'ic_launcher_foreground.png')
  $foregroundBitmap.Dispose()
}

$previewBitmap = New-SquareIcon 1024
Save-Png $previewBitmap $previewPath
$previewBitmap.Dispose()

Write-Output "Launcher icons updated: $previewPath"
