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

function Insert-PlainMarker($hwp, [string]$marker) {
    $ps = $hwp.HParameterSet.HInsertText
    $hwp.HAction.GetDefault("InsertText", $ps.HSet)
    $ps.Text = $marker
    if (-not $hwp.HAction.Execute("InsertText", $ps.HSet)) {
        throw ("Cannot insert marker: " + $marker)
    }
}

function Find-Text($hwp, [string]$text) {
    $hwp.Run("MoveDocBegin")
    $ps = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault("RepeatFind", $ps.HSet)
    $ps.FindString = $text
    $ps.Direction = 0
    $ps.IgnoreMessage = 1
    $ps.FindType = 1
    return [bool]$hwp.HAction.Execute("RepeatFind", $ps.HSet)
}

function Paste-AtMarker($hwp, [string]$marker) {
    if (-not (Find-Text $hwp $marker)) {
        throw ("Marker not found: " + $marker)
    }
    # RepeatFind selects the marker text. Pasting replaces only that plain text.
    # No HWP field/control is deleted, so no 'delete field?' dialog appears.
    $hwp.Run("Paste")
}

function AllReplace-Plain($hwp, [string]$find, [string]$replace) {
    try {
        $ps = $hwp.HParameterSet.HFindReplace
        $hwp.HAction.GetDefault("AllReplace", $ps.HSet)
        $ps.FindString = $find
        $ps.ReplaceString = $replace
        $ps.Direction = 0
        $ps.IgnoreMessage = 1
        $ps.FindType = 1
        [void]$hwp.HAction.Execute("AllReplace", $ps.HSet)
    } catch {}
}

Write-Host ""
Write-Host "HWP exam-layout native copy test V3.4" -ForegroundColor Green
Write-Host "V3.4 uses ordinary temporary marker text instead of HWP fields."
Write-Host "Therefore the HWP 'delete field/control?' confirmation dialog should not appear."
Write-Host "Existing hidden endnote markers beside the template problem numbers are preserved."
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

$src = New-Object -ComObject HWPFrame.HwpObject
$dst = New-Object -ComObject HWPFrame.HwpObject
Try-RegisterSecurityModule $src
Try-RegisterSecurityModule $dst

[void]$src.Open($sourcePath, "HWP", "")
[void]$dst.Open($outPath, "HWP", "")
try { $src.XHwpWindows.Item(0).Visible = $true } catch {}
try { $dst.XHwpWindows.Item(0).Visible = $true } catch {}

Write-Host ""
Write-Host "Step A: mark four paste positions in the OUTPUT document." -ForegroundColor Green
Write-Host "Order: problem 1 top-left, problem 2 bottom-left, problem 3 top-right, problem 4 bottom-right."
Write-Host "Temporary text markers will appear. They will be replaced by the copied problem blocks."

$markers = @("__HMC_SLOT_1__", "__HMC_SLOT_2__", "__HMC_SLOT_3__", "__HMC_SLOT_4__")
$slotNames = @("problem 1: top-left", "problem 2: bottom-left", "problem 3: top-right", "problem 4: bottom-right")
for ($i = 0; $i -lt 4; $i++) {
    Pause-Step ("Click " + $slotNames[$i] + " in the OUTPUT HWP window.")
    Insert-PlainMarker $dst $markers[$i]
    Write-Host ("Temporary marker inserted: " + $markers[$i]) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Step B: select source problems 1 to 4 one at a time." -ForegroundColor Green
Write-Host "Select only the problem content that should sit after the template problem number."
Write-Host "Do not select the source problem number if the template already supplies the large number."
Write-Host "Do not include page headers, column separator lines, footer lines, or nearby problems."

for ($q = 1; $q -le 4; $q++) {
    Pause-Step ("In the SOURCE HWP window, select only problem " + $q + " content as one block.")
    $src.Run("Copy")
    Paste-AtMarker $dst $markers[$q - 1]
    Write-Host ("Problem " + $q + " pasted.") -ForegroundColor Green
}

# Remove any temporary marker left behind if a paste operation did not replace it.
foreach ($m in $markers) { AllReplace-Plain $dst $m "" }

try {
    [void]$dst.SaveAs($outPath, "HWP", "")
} catch {
    try { $dst.Run("FileSave") } catch {}
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host ("Output file: " + $outPath) -ForegroundColor Green
Write-Host "The template endnote anchors were intentionally left untouched."
Write-Host "Next automation step: blank endnote bodies for no-answer files, or transfer source endnote answers for answer files."
[void](Read-Host "Press Enter to close this console")
