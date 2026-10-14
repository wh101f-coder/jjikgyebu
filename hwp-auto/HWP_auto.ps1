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

function Create-SlotField($hwp, [string]$name, [string]$label) {
    try {
        $ok = $hwp.CreateField($label, "HMC paste slot", $name)
        if (-not $ok) { throw "CreateField returned false" }
        return
    } catch {
        throw ("Cannot create persistent slot field '" + $name + "': " + $_.Exception.Message)
    }
}

function Move-To-SlotField($hwp, [string]$name) {
    try {
        $ok = $hwp.MoveToField($name, $true, $true, $true)
        if (-not $ok) { throw "MoveToField returned false" }
        return
    } catch {
        throw ("Cannot move to persistent slot field '" + $name + "': " + $_.Exception.Message)
    }
}

Write-Host ""
Write-Host "HWP exam-layout native copy test V3.3" -ForegroundColor Green
Write-Host "Fix: paste destinations are now persistent HWP fields, not raw cursor addresses."
Write-Host "Raw cursor addresses can become invalid after problem 1 changes the document structure."
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
Write-Host "IMPORTANT: use this order: problem 1 top-left, problem 2 bottom-left, problem 3 top-right, problem 4 bottom-right."
Write-Host "A small temporary SLOT field will be inserted at each clicked position."

$slotNames = @("problem 1: top-left", "problem 2: bottom-left", "problem 3: top-right", "problem 4: bottom-right")
$fieldNames = @("HMC_SLOT_1", "HMC_SLOT_2", "HMC_SLOT_3", "HMC_SLOT_4")

for ($i = 0; $i -lt 4; $i++) {
    Pause-Step ("Click " + $slotNames[$i] + " in the OUTPUT HWP window.")
    Create-SlotField $dst $fieldNames[$i] ("SLOT" + ($i + 1))
    Write-Host ("Persistent field created: " + $fieldNames[$i]) -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Step B: select source problems 1 to 4 one at a time." -ForegroundColor Green
Write-Host "Include the whole problem: text, equation, figure/table, view box, and choices."
Write-Host "Do not include page headers, column separator lines, footer lines, or nearby problems."

for ($q = 1; $q -le 4; $q++) {
    Pause-Step ("In the SOURCE HWP window, select only problem " + $q + " as one block.")
    $src.Run("Copy")

    $fieldName = $fieldNames[$q - 1]
    Move-To-SlotField $dst $fieldName

    # The field is selected. Delete it; the caret remains at the exact slot.
    $dst.Run("Delete")
    $dst.Run("Paste")

    Write-Host ("Problem " + $q + " pasted at " + $fieldName + ".") -ForegroundColor Green
}

try {
    [void]$dst.SaveAs($outPath, "HWP", "")
} catch {
    try { $dst.Run("FileSave") } catch {}
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host ("Output file: " + $outPath) -ForegroundColor Green
Write-Host "Check that problems 1,2,3,4 are in TL, BL, TR, BR respectively and that no content went to endnotes."
[void](Read-Host "Press Enter to close this console")
