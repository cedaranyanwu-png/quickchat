param(
  [Parameter(Mandatory = $false)]
  [string]$InputFile = '.\QuickChat-Promo-1080p.webm',
  [Parameter(Mandatory = $false)]
  [string]$OutputFile = '.\QuickChat-Promo-1080p.mp4'
)

$resolvedInput = Resolve-Path -LiteralPath $InputFile -ErrorAction SilentlyContinue
if (-not $resolvedInput) {
  Write-Error "Input WebM was not found: $InputFile. Record the presentation in index.html first."
  exit 1
}

$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegCommand) {
  Write-Error 'FFmpeg is not installed or is not on PATH. Install FFmpeg, reopen PowerShell, and run this script again.'
  exit 1
}

& $ffmpegCommand.Source -y -i $resolvedInput.Path -vf 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p' -r 30 -c:v libx264 -preset medium -crf 19 -movflags +faststart $OutputFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "MP4 created: $((Resolve-Path -LiteralPath $OutputFile).Path)"
