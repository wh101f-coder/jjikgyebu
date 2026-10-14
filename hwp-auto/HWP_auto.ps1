#requires -version 5.1
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

function U([int[]]$codes) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in $codes) { [void]$sb.Append([char]$c) }
    return $sb.ToString()
}

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
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw "File selection was cancelled." }
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
    if (-not $hwp.HAction.Execute("InsertText", $ps.HSet)) { throw ("Cannot insert marker: " + $marker) }
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
    if (-not (Find-Text $hwp $marker)) { throw ("Marker not found: " + $marker) }
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

function Get-EndnoteControls($hwp) {
    $arr = New-Object System.Collections.ArrayList
    $ctrl = $hwp.HeadCtrl
    while ($null -ne $ctrl) {
        try {
            if ($ctrl.CtrlID -eq "en") { [void]$arr.Add($ctrl) }
        } catch {}
        try { $ctrl = $ctrl.Next } catch { break }
    }
    return ,$arr.ToArray()
}

function Count-Endnotes($hwp) {
    return @(Get-EndnoteControls $hwp).Count
}

function Delete-SavedControls-Reverse($hwp, $controls) {
    $removed = 0
    if ($null -eq $controls) { return 0 }
    for ($i = $controls.Count - 1; $i -ge 0; $i--) {
        $ctrl = $controls[$i]
        try {
            if ($hwp.DeleteCtrl($ctrl)) {
                $removed++
                continue
            }
        } catch {}
        try {
            $hwp.SetPosBySet($ctrl.GetAnchorPos(0))
            $hwp.Run("NoteModify")
            $hwp.Run("Delete")
            $removed++
        } catch {}
    }
    return $removed
}

function Detect-SourceAnswers($hwp, [string]$path) {
    $endnoteCount = Count-Endnotes $hwp
    if ($endnoteCount -le 0) {
        return [pscustomobject]@{ HasAnswers=$false; Endnotes=0; Evidence="no-endnotes" }
    }

    $txt = ""
    try { $txt = [string]$hwp.GetTextFile("TEXT", "") } catch {}

    $answerHeader = U @(0xC815,0xB2F5)
    $lines = @()
    if ($txt) { $lines = $txt -split "`r?`n" }

    if ($txt) {
        $idx = $txt.LastIndexOf($answerHeader)
        if ($idx -ge 0) {
            $tail = $txt.Substring($idx + $answerHeader.Length)
            foreach ($ln in ($tail -split "`r?`n")) {
                $t = $ln.Trim()
                if ($t -match '^\d+\)\s*(\S.+|\S)$') {
                    return [pscustomobject]@{ HasAnswers=$true; Endnotes=$endnoteCount; Evidence="quick-answer-text" }
                }
            }
        }
    }

    $circled = @()
    for ($c = 0x2460; $c -le 0x2464; $c++) { $circled += ([char]$c).ToString() }
    $singleChoiceHits = 0
    foreach ($ln in $lines) {
        $t = $ln.Trim()
        if ($circled -contains $t) { $singleChoiceHits++ }
    }
    if ($singleChoiceHits -ge 2) {
        return [pscustomobject]@{ HasAnswers=$true; Endnotes=$endnoteCount; Evidence=("circled-answer-lines:" + $singleChoiceHits) }
    }

    $base = [System.IO.Path]::GetFileNameWithoutExtension($path)
    $hasWord = U @(0xB2F5,0xC788,0xC74C)
    $noWord  = U @(0xB2F5,0xC5C6,0xC74C)
    if ($base.Contains($hasWord) -and -not $base.Contains($noWord)) {
        return [pscustomobject]@{ HasAnswers=$true; Endnotes=$endnoteCount; Evidence="filename" }
    }

    return [pscustomobject]@{ HasAnswers=$false; Endnotes=$endnoteCount; Evidence="endnotes-but-no-answer-text" }
}

Write-Host ""
Write-Host "HWP exam-layout native copy test V3.7" -ForegroundColor Green
Write-Host "V3.7 keeps template endnotes during paste, then removes the ORIGINAL template endnote controls in reverse order."
Write-Host "This prevents index shifting from deleting the wrong notes."
Write-Host ""

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultTemplate = Join-Path $here "template.hwp"
if (Test-Path $defaultTemplate) { $templatePath = $defaultTemplate }
else { $templatePath = Pick-Hwp "Select the layout template HWP" $here }

$sourceCandidates = Get-ChildItem -LiteralPath $here -Filter "*.hwp" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $templatePath -and $_.Name -notmatch "HWPTEST|_output|_result" }
if ($sourceCandidates.Count -eq 1) { $sourcePath = $sourceCandidates[0].FullName }
else { $sourcePath = Pick-Hwp "Select the source exam HWP" $here }

$src = New-Object -ComObject HWPFrame.HwpObject
Try-RegisterSecurityModule $src
[void]$src.Open($sourcePath, "HWP", "")
try { $src.XHwpWindows.Item(0).Visible = $true } catch {}

$detect = Detect-SourceAnswers $src $sourcePath
if ($detect.HasAnswers) {
    $suffix = U @(0xB2F5,0xC788,0xC74C)
    Write-Host ("Detected: ANSWER-PRESENT / endnotes=" + $detect.Endnotes + " / evidence=" + $detect.Evidence) -ForegroundColor Green
} else {
    $suffix = U @(0xB2F5,0xC5C6,0xC74C)
    Write-Host ("Detected: NO-ANSWER / endnotes=" + $detect.Endnotes + " / evidence=" + $detect.Evidence) -ForegroundColor Yellow
}

$srcDir = Split-Path -Parent $sourcePath
$srcBase = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)
$outPath = Join-Path $srcDir ($srcBase + "_" + $suffix + "_HWPTEST.hwp")
Copy-Item -LiteralPath $templatePath -Destination $outPath -Force

$dst = New-Object -ComObject HWPFrame.HwpObject
Try-RegisterSecurityModule $dst
[void]$dst.Open($outPath, "HWP", "")
try { $dst.XHwpWindows.Item(0).Visible = $true } catch {}

# Snapshot the ORIGINAL template endnote controls before any paste.
$templateEndnoteCtrls = @(Get-EndnoteControls $dst)
$templateEndnotes = $templateEndnoteCtrls.Count
Write-Host ("Template endnotes snapshot: " + $templateEndnotes) -ForegroundColor DarkGray

if ($detect.HasAnswers) {
    Write-Host "ANSWER-PRESENT mode: keep template notes temporarily; after paste, delete only the saved ORIGINAL template notes in reverse order." -ForegroundColor Green
} else {
    Write-Host "NO-ANSWER mode: keep template blank endnotes." -ForegroundColor Green
}

Write-Host ""
Write-Host "Step A: mark four paste positions in the OUTPUT document." -ForegroundColor Green
Write-Host "Order: problem 1 top-left, problem 2 bottom-left, problem 3 top-right, problem 4 bottom-right."

$markers = @("__HMC_SLOT_1__", "__HMC_SLOT_2__", "__HMC_SLOT_3__", "__HMC_SLOT_4__")
$slotNames = @("problem 1: top-left", "problem 2: bottom-left", "problem 3: top-right", "problem 4: bottom-right")
for ($i = 0; $i -lt 4; $i++) {
    Pause-Step ("Click " + $slotNames[$i] + " in the OUTPUT HWP window.")
    Insert-PlainMarker $dst $markers[$i]
}

Write-Host ""
Write-Host "Step B: select source problems 1 to 4 one at a time." -ForegroundColor Green
for ($q = 1; $q -le 4; $q++) {
    Pause-Step ("In the SOURCE HWP window, select only problem " + $q + " content as one block.")
    $src.Run("Copy")
    Paste-AtMarker $dst $markers[$q - 1]
    Write-Host ("Problem " + $q + " pasted. Endnotes now=" + (Count-Endnotes $dst)) -ForegroundColor Green
}

foreach ($m in $markers) { AllReplace-Plain $dst $m "" }

if ($detect.HasAnswers) {
    $beforeDelete = Count-Endnotes $dst
    $removed = Delete-SavedControls-Reverse $dst $templateEndnoteCtrls
    $afterDelete = Count-Endnotes $dst
    Write-Host ("Template endnotes removed in reverse by saved control identity: " + $removed) -ForegroundColor Green
    Write-Host ("Endnotes before=" + $beforeDelete + " / after=" + $afterDelete) -ForegroundColor DarkGray
    Write-Host "Expected: only source answer endnotes remain, preserving 1-2-3-4 answer order." -ForegroundColor Green
} else {
    Write-Host ("Final endnotes=" + (Count-Endnotes $dst) + " / template baseline=" + $templateEndnotes) -ForegroundColor DarkGray
    Write-Host "Expected: template blank quick-answer notes remain." -ForegroundColor Green
}

try { [void]$dst.SaveAs($outPath, "HWP", "") } catch { try { $dst.Run("FileSave") } catch {} }

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
Write-Host ("Output file: " + $outPath) -ForegroundColor Green
[void](Read-Host "Press Enter to close this console")
