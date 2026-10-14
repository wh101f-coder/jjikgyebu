#requires -version 5.1
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

function Pause-Step([string]$msg) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $msg -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
    [void](Read-Host "Press Enter when ready")
}

function Pick-Hwp([string]$title, [string]$initialDir) {
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = $title
    $dlg.Filter = "HWP document (*.hwp)|*.hwp|All files (*.*)|*.*"
    if (Test-Path $initialDir) { $dlg.InitialDirectory = $initialDir }
    $dlg.Multiselect = $false
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "File selection was cancelled."
    }
    return $dlg.FileName
}

function Try-RegisterSecurityModule($hwp) {
    try {
        $reg = "HKCU:\Software\HNC\HwpAutomation\Modules"
        if (Test-Path $reg) {
            $props = (Get-ItemProperty $reg).PSObject.Properties |
                Where-Object { $_.Name -notmatch "^PS" -and $_.Value -is [string] }
            foreach ($p in $props) {
                try {
                    if ($hwp.RegisterModule("FilePathCheckDLL", $p.Name)) {
                        Write-Host ("Security module: " + $p.Name) -ForegroundColor DarkGreen
                        return
                    }
                } catch {}
            }
        }
    } catch {}
    Write-Host "Security module was not auto-registered. If HWP asks for file access, allow it." -ForegroundColor Yellow
}

function Get-Pos3($hwp) {
    try {
        $posSet = $hwp.GetPosBySet()
        if ($null -eq $posSet) { throw "GetPosBySet returned null" }
        $list = [int]$posSet.Item("List")
        $para = [int]$posSet.Item("Para")
        $pos  = [int]$posSet.Item("Pos")
        return @($list, $para, $pos)
    } catch {
        throw ("Cannot read cursor position: " + $_.Exception.Message)
    }
}

function Set-Pos3($hwp, $p) {
    try {
        $ok = $hwp.SetPos([int]$p[0], [int]$p[1], [int]$p[2])
        if (-not $ok) { throw "SetPos returned false" }
        return
    } catch {}

    try {
        $posSet = $hwp.CreateSet("ListParaPos")
        $posSet.SetItem("List", [int]$p[0])
        $posSet.SetItem("Para", [int]$p[1])
        $posSet.SetItem("Pos",  [int]$p[2])
        $ok2 = $hwp.SetPosBySet($posSet)
        if (-not $ok2) { throw "SetPosBySet returned false" }
    } catch {
        throw ("Cannot restore cursor position: " + $_.Exception.Message)
    }
}

Write-Host ""
Write-Host "HWP exam-layout native copy test V3.2" -ForegroundColor Green
Write-Host "Encoding-safe build: ASCII-only PowerShell source for Windows PowerShell 5.1."
Write-Host "This test copies four problem blocks as native HWP content."
Write-Host ""

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$defaultTemplate = Join-Path $here "template.hwp"
if (Test-Path $defaultTemplate) {
    $templatePath = $defaultTemplate
} else {
    $templatePath = Pick-Hwp "Select the layout template HWP" $here
}

$sourceCandidates = Get-ChildItem -LiteralPath $here -Filter "*.hwp" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $templatePath -and $_.Name -notmatch "HWPTEST|_output|_result" }

if ($sourceCandidates.Count -eq 1) {
    $sourcePath = $sourceCandidates[0].FullName
    Write-Host ("Source auto-selected: " + $sourcePath)
} else {
    $sourcePath = Pick-Hwp "Select the source exam HWP" $here
}

$srcDir = Split-Path -Parent $sourcePath
$srcBase = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)
$outPath = Join-Path $srcDir ($srcBase + "_HWPTEST.hwp")
Copy-Item -LiteralPath $templatePath -Destination $outPath -Force

Write-Host ("Source: " + $sourcePath)
Write-Host ("Template: " + $templatePath)
Write-Host ("Output: " + $outPath) -ForegroundColor Green

try {
    $src = New-Object -ComObject HWPFrame.HwpObject
    $dst = New-Object -ComObject HWPFrame.HwpObject
} catch {
    Write-Host "Cannot create HWPFrame.HwpObject COM object." -ForegroundColor Red
    throw
}

Try-RegisterSecurityModule $src
Try-RegisterSecurityModule $dst

[void]$src.Open($sourcePath, "HWP", "")
[void]$dst.Open($outPath, "HWP", "")

try { $src.XHwpWindows.Item(0).Visible = $true } catch {}
try { $dst.XHwpWindows.Item(0).Visible = $true } catch {}

Write-Host ""
Write-Host "Step A: mark four paste positions in the OUTPUT document." -ForegroundColor Green
Write-Host "Use the problem start positions in this order: top-left, top-right, bottom-left, bottom-right."

$slotNames = @("top-left", "top-right", "bottom-left", "bottom-right")
$slots = @()
for ($i = 0; $i -lt 4; $i++) {
    Pause-Step ("Click the " + $slotNames[$i] + " problem-start position in the OUTPUT HWP window.")
    $p = Get-Pos3 $dst
    $slots += ,$p
    Write-Host ("Saved position: List=" + $p[0] + ", Para=" + $p[1] + ", Pos=" + $p[2]) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Step B: select source problems 1 to 4 one at a time." -ForegroundColor Green
Write-Host "Include the whole problem: text, equation, figure/table, view box, and choices."
Write-Host "Do not include page headers, column separator lines, footer lines, or nearby problems."

for ($q = 1; $q -le 4; $q++) {
    Pause-Step ("In the SOURCE HWP window, select only problem " + $q + " as one block.")
    $src.Run("Copy")
    Set-Pos3 $dst $slots[$q - 1]
    $dst.Run("Paste")
    Write-Host ("Problem " + $q + " pasted.") -ForegroundColor Green
}

try {
    [void]$dst.SaveAs($outPath, "HWP", "")
} catch {
    try { $dst.Run("FileSave") } catch {}
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host ("Output file: " + $outPath) -ForegroundColor Green
Write-Host "Check whether equations, tables, pictures and text remain native HWP objects."
[void](Read-Host "Press Enter to close this console")
