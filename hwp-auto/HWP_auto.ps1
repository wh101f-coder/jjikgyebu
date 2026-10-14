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

function Get-EndnoteCtrls($hwp) {
    $items = New-Object System.Collections.ArrayList
    $ctrl = $hwp.HeadCtrl
    $last = $hwp.LastCtrl
    for ($guard = 0; $guard -lt 10000 -and $null -ne $ctrl; $guard++) {
        try {
            if ($ctrl.CtrlID -eq "en") {
                [void]$items.Add($ctrl)
            }
        } catch {}

        try {
            if ($ctrl -eq $last) { break }
            $ctrl = $ctrl.Next
        } catch {
            break
        }
    }
    return ,$items
}

function Remove-CopiedEndnotes($hwp, [int]$problemNo, [int]$countBeforePaste) {
    $after = @(Get-EndnoteCtrls $hwp)
    $delta = $after.Count - $countBeforePaste
    if ($delta -le 0) { return 0 }

    # The template already has one hidden endnote anchor beside each large problem number.
    # A source endnote copied with problem N is inserted immediately after template endnote N.
    # Because previous copied endnotes are removed immediately, the new copied note is
    # always at zero-based endnote index N (the item just after template note N).
    $removed = 0
    for ($k = 0; $k -lt $delta; $k++) {
        $notes = @(Get-EndnoteCtrls $hwp)
        $targetIndex = $problemNo
        if ($targetIndex -ge $notes.Count) { break }
        try {
            if ($hwp.DeleteCtrl($notes[$targetIndex])) {
                $removed++
            } else {
                break
            }
        } catch {
            break
        }
    }
    return $removed
}

Write-Host ""
Write-Host "HWP exam-layout native copy test V3.5" -ForegroundColor Green
Write-Host "V3.5 keeps the template endnotes but removes source endnotes imported by Paste."
Write-Host "For a no-answer output, the quick-answer page should therefore stay blank."
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

$initialEndnoteCount = @(Get-EndnoteCtrls $dst).Count
Write-Host ("Template endnotes detected: " + $initialEndnoteCount) -ForegroundColor DarkGray

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
    $beforeNotes = @(Get-EndnoteCtrls $dst).Count
    Paste-AtMarker $dst $markers[$q - 1]
    $removedNotes = Remove-CopiedEndnotes $dst $q $beforeNotes
    Write-Host ("Problem " + $q + " pasted. Copied source endnotes removed: " + $removedNotes) -ForegroundColor Green
}

foreach ($m in $markers) { AllReplace-Plain $dst $m "" }

$finalEndnoteCount = @(Get-EndnoteCtrls $dst).Count
Write-Host ("Final endnotes: " + $finalEndnoteCount + " / template endnotes: " + $initialEndnoteCount) -ForegroundColor DarkGray
if ($finalEndnoteCount -ne $initialEndnoteCount) {
    Write-Host "WARNING: endnote count changed. Do not batch-process yet; inspect this test file." -ForegroundColor Yellow
}

try {
    [void]$dst.SaveAs($outPath, "HWP", "")
} catch {
    try { $dst.Run("FileSave") } catch {}
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host ("Output file: " + $outPath) -ForegroundColor Green
Write-Host "For this no-answer test, the quick-answer list should contain only the template's blank entries."
[void](Read-Host "Press Enter to close this console")
