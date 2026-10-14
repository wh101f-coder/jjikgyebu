# HWP 4Q COPY ONLY V1.7 AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW
# Added:
#   1) Normalize multiple-choice spacing inside each copied problem only: 3 tabs -> 2 tabs.
#   2) Auto-update the template title/subject from the SOURCE filename when metadata can be parsed.
# Workflow: capture output cursors Q1-Q4, capture source blocks Q1-Q4, paste Q4-Q1.
# No endnote logic. No Alt+G. No Delete-key automation.

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $base 'HWP_4Q_DEBUG.log'

function Log([string]$msg) {
    $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
    try { Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8 } catch {}
}

function Wait-Enter([string]$message) {
    Write-Host ''
    Write-Host $message -ForegroundColor Yellow
    [void](Read-Host 'Press Enter in this console when ready')
}

function Select-One([object[]]$items, [string]$title, [string]$excludeFullName) {
    $list = @($items | Where-Object { $_.FullName -ne $excludeFullName })
    if ($list.Count -eq 0) { throw ($title + ': no HWP file available.') }
    Write-Host ''
    Write-Host $title -ForegroundColor Cyan
    for ($i = 0; $i -lt $list.Count; $i++) {
        Write-Host ('[{0}] {1}' -f ($i + 1), $list[$i].Name)
    }
    while ($true) {
        $raw = Read-Host 'Choose number'
        $n = 0
        if ([int]::TryParse($raw, [ref]$n)) {
            if ($n -ge 1 -and $n -le $list.Count) { return $list[$n - 1] }
        }
        Write-Host 'Invalid number. Try again.' -ForegroundColor Yellow
    }
}

# Keep this file ASCII-safe for Windows PowerShell 5.1.
function U([string]$b64) {
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
}

# Korean strings decoded at runtime so the downloaded .ps1 does not depend on UTF-8 BOM handling.
$K_MID       = U '7KSR6rCE'
$K_FINAL     = U '6riw66eQ'
$K_MATH      = U '7IiY7ZWZ'
$K_SU1       = U '7IiYMQ=='
$K_SU2       = U '7IiYMg=='
$K_CALC      = U '66+47KCB67aE'
$K_GEO       = U '6riw7ZWY'
$K_PROB      = U '7ZmV66Wg'
$K_GO        = U '6rOg'
$K_JUNG      = U '7KSR'
$K_YEOGO     = U '7Jes6rOg'
$K_YEOJUNG   = U '7Jes7KSR'
$K_HIGHSCH   = U '6rOg65Ox7ZWZ6rWQ'
$K_MIDSCH    = U '7KSR7ZWZ6rWQ'
$K_GIRLHIGH  = U '7Jes7J6Q6rOg65Ox7ZWZ6rWQ'
$K_GIRLMID   = U '7Jes7J6Q7KSR7ZWZ6rWQ'
$K_YEAR_SPC  = U '64WEIA=='
$K_GRADE_SPC = U '7ZWZ64WEIA=='
$K_SEM_SPC   = U '7ZWZ6riwIA=='
$K_EXAM_SPC  = U '6rOg7IKsIA=='
$OLD_HEADER  = U 'MjAyNeuFhCAx7ZWZ64WEIDHtlZnquLAg7KSR6rCE6rOg7IKsIOyLrO2VmeqzoOuTse2Vmeq1kA=='
$OLD_SUBJECT = U '6rO17Ya17IiY7ZWZMQ=='

# Official Hancom automation security module. Installed once per Windows user.
$securityModuleName = 'FilePathCheckerModuleExample'
$securityRegPath = 'HKCU:\Software\HNC\HwpAutomation\Modules'
$securityUsesPath = 'HKCU:\Software\HNC\HwpAutomation\Modules\Uses'
$securityInstallDir = Join-Path $env:LOCALAPPDATA 'HncSec'
$securityDllPath = Join-Path $securityInstallDir 'FilePathCheckerModuleExample.dll'
$securityZipUrl = 'https://raw.githubusercontent.com/hancom-io/devcenter-archive/main/hwp-automation/%EB%B3%B4%EC%95%88%EB%AA%A8%EB%93%88%28Automation%29.zip'
$securityExpectedSha256 = '9AC5B97C47AC8AED1E8BCA27A3EEF39411361D8F68C262509F0C40A8F9D21BB6'

function Ensure-SecurityModuleInstalled {
    $ready = $false
    try {
        $regValue = (Get-ItemProperty -LiteralPath $securityRegPath -Name $securityModuleName -ErrorAction Stop).$securityModuleName
        if ($regValue -and (Test-Path -LiteralPath $regValue)) {
            $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $regValue).Hash.ToUpperInvariant()
            if ($hash -eq $securityExpectedSha256) {
                $script:securityDllPath = $regValue
                $ready = $true
            }
        }
    } catch {}
    if ($ready) {
        Log 'Official HWP security module already installed.'
        return
    }

    Write-Host 'Installing Hancom automation security module once for this Windows user...' -ForegroundColor Cyan
    Log 'Security module installation started.'
    New-Item -ItemType Directory -Force -Path $securityInstallDir | Out-Null
    $tmpRoot = Join-Path $env:TEMP ('HncSec_' + [guid]::NewGuid().ToString('N'))
    $zipPath = Join-Path $tmpRoot 'hancom_security.zip'
    $extractDir = Join-Path $tmpRoot 'unzipped'
    try {
        New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $securityZipUrl -OutFile $zipPath
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
        $dll = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter 'FilePathCheckerModuleExample.dll' | Select-Object -First 1
        if ($null -eq $dll) { throw 'Official FilePathCheckerModuleExample.dll was not found.' }
        Copy-Item -LiteralPath $dll.FullName -Destination $securityDllPath -Force
        try { Unblock-File -LiteralPath $securityDllPath -ErrorAction SilentlyContinue } catch {}
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $securityDllPath).Hash.ToUpperInvariant()
        if ($hash -ne $securityExpectedSha256) { throw ('Security DLL SHA-256 mismatch: ' + $hash) }
        New-Item -Path $securityRegPath -Force | Out-Null
        New-ItemProperty -Path $securityRegPath -Name $securityModuleName -PropertyType String -Value $securityDllPath -Force | Out-Null
        New-Item -Path $securityUsesPath -Force | Out-Null
        New-ItemProperty -Path $securityUsesPath -Name $securityModuleName -PropertyType DWord -Value 1 -Force | Out-Null
        Write-Host 'HWP access auto-allow setup complete.' -ForegroundColor Green
        Log 'Security module installed and registered.'
    }
    finally {
        try { if (Test-Path -LiteralPath $tmpRoot) { Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue } } catch {}
    }
}

function Register-SecurityModule($hwp) {
    try {
        $regOk = [bool]$hwp.RegisterModule('FilePathCheckDLL', $securityModuleName)
        if (-not $regOk) { throw 'RegisterModule returned False.' }
        Log 'RegisterModule(FilePathCheckerModuleExample) succeeded.'
    } catch {
        Log ('RegisterModule failed: ' + $_.Exception.Message)
        throw ('HWP auto-allow security module registration failed: ' + $_.Exception.Message)
    }
}

function New-HwpFileObject([string]$path) {
    Log ('Creating HWP COM object: ' + $path)
    $hwp = New-Object -ComObject 'HWPFrame.HwpObject'
    Register-SecurityModule $hwp
    try { $hwp.XHwpWindows.Item(0).Visible = $true } catch {}
    $ok = $hwp.Open($path, 'HWP', 'forceopen:true')
    if ($ok -eq $false) { throw ('Could not open HWP file: ' + $path) }
    try { $hwp.XHwpWindows.Item(0).Visible = $true } catch {}
    return $hwp
}

function New-HwpClipboardObject() {
    $hwp = New-Object -ComObject 'HWPFrame.HwpObject'
    Register-SecurityModule $hwp
    try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
    return $hwp
}

$wshell = $null
try { $wshell = New-Object -ComObject 'WScript.Shell' } catch {}

function Focus-Hwp($hwp) {
    if ($null -eq $wshell) { return }
    try {
        $cap = $hwp.XHwpWindows.Item(0).Caption
        if ($cap) {
            $null = $wshell.AppActivate($cap)
            Start-Sleep -Milliseconds 250
        }
    } catch {}
}

function All-Replace($hwp, [string]$findText, [string]$replaceText) {
    try { $null = $hwp.HAction.Run('MoveDocBegin') } catch {}
    $pset = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault('AllReplace', $pset.HSet)
    $pset.MatchCase = 0
    $pset.AllWordForms = 0
    $pset.SeveralWords = 0
    $pset.UseWildCards = 0
    $pset.WholeWordOnly = 0
    $pset.AutoSpell = 0
    try { $pset.Direction = $hwp.FindDir('AllDoc') } catch { $pset.Direction = 2 }
    $pset.IgnoreFindString = 0
    $pset.IgnoreReplaceString = 0
    $pset.FindString = $findText
    $pset.ReplaceString = $replaceText
    $pset.ReplaceMode = 1
    $pset.IgnoreMessage = 1
    try { $pset.FindRegExp = 0 } catch {}
    try { $pset.FindTextInPicture = 1 } catch {}
    try { $pset.FindType = 1 } catch {}
    return $hwp.HAction.Execute('AllReplace', $pset.HSet)
}

function Normalize-ChoiceTabs($hwp, [int]$q) {
    # Hancom special-character syntax: ^t means a tab.
    # Only the temporary document containing one copied question is modified.
    try {
        $null = All-Replace $hwp '^t^t^t' '^t^t'
        Log ('Q' + $q + ': normalized triple tabs to double tabs in temp copy.')
    } catch {
        Log ('Q' + $q + ': tab normalization skipped/failed: ' + $_.Exception.Message)
    }
}

function Expand-SchoolName([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return $s }
    if ($s.EndsWith($K_HIGHSCH) -or $s.EndsWith($K_MIDSCH)) { return $s }
    if ($s.EndsWith($K_YEOGO)) {
        return $s.Substring(0, $s.Length - $K_YEOGO.Length) + $K_GIRLHIGH
    }
    if ($s.EndsWith($K_YEOJUNG)) {
        return $s.Substring(0, $s.Length - $K_YEOJUNG.Length) + $K_GIRLMID
    }
    if ($s.EndsWith($K_GO)) {
        return $s.Substring(0, $s.Length - $K_GO.Length) + $K_HIGHSCH
    }
    if ($s.EndsWith($K_JUNG)) {
        return $s.Substring(0, $s.Length - $K_JUNG.Length) + $K_MIDSCH
    }
    return $s
}

function Get-ExamMeta([string]$fileName) {
    $stem = [IO.Path]::GetFileNameWithoutExtension($fileName)
    $tokens = @($stem.Replace('_', ' ') -split '\s+' | Where-Object { $_ -ne '' })
    if ($tokens.Count -eq 0) { return $null }

    $year = $null; $yearIndex = -1
    for ($i = 0; $i -lt $tokens.Count; $i++) {
        if ($tokens[$i] -match '^(20)?\d{2}$') {
            $y = [int]$tokens[$i]
            if ($y -lt 100) { $y += 2000 }
            if ($y -ge 2000 -and $y -le 2099) { $year = $y; $yearIndex = $i; break }
        }
    }

    $grade = $null; $sem = $null
    foreach ($t in $tokens) {
        if ($t -match '^([1-3])-([1-2])$') {
            $grade = [int]$Matches[1]; $sem = [int]$Matches[2]; break
        }
    }
    if (($null -eq $grade) -and $yearIndex -ge 0 -and ($yearIndex + 2) -lt $tokens.Count) {
        if ($tokens[$yearIndex + 1] -match '^[1-3]$' -and $tokens[$yearIndex + 2] -match '^[1-2]$') {
            $grade = [int]$tokens[$yearIndex + 1]
            $sem = [int]$tokens[$yearIndex + 2]
        }
    }

    $exam = $null; $school = $null; $subject = $null
    foreach ($t in $tokens) {
        if ($null -eq $exam -and ($t -eq $K_MID -or $t -eq $K_FINAL)) { $exam = $t }
        if ($null -eq $subject) {
            if ($t.Contains($K_MATH) -or $t -eq $K_SU1 -or $t -eq $K_SU2 -or $t.Contains($K_CALC) -or $t.Contains($K_GEO) -or $t.Contains($K_PROB)) {
                $subject = $t
                if ($subject -eq $K_SU1) { $subject = $K_MATH + '1' }
                if ($subject -eq $K_SU2) { $subject = $K_MATH + '2' }
            }
        }
    }
    foreach ($t in $tokens) {
        if ($t -eq $subject) { continue }
        if ($t.EndsWith($K_HIGHSCH) -or $t.EndsWith($K_MIDSCH) -or $t.EndsWith($K_YEOGO) -or $t.EndsWith($K_YEOJUNG) -or $t.EndsWith($K_GO) -or $t.EndsWith($K_JUNG)) {
            $school = $t; break
        }
    }

    if ($null -eq $year -or $null -eq $grade -or $null -eq $sem -or $null -eq $exam -or $null -eq $school) { return $null }
    $school = Expand-SchoolName $school
    $left = ([string]$year) + $K_YEAR_SPC + ([string]$grade) + $K_GRADE_SPC + ([string]$sem) + $K_SEM_SPC + $exam + $K_EXAM_SPC + $school
    return [pscustomobject]@{ Left = $left; Subject = $subject }
}

function Update-TemplateHeader($hwp, [string]$sourceName) {
    try {
        $meta = Get-ExamMeta $sourceName
        if ($null -eq $meta) {
            Log ('Header metadata could not be parsed from filename: ' + $sourceName)
            Write-Host 'Header: filename metadata was not clear enough, so template header was left unchanged.' -ForegroundColor Yellow
            return
        }
        $r1 = All-Replace $hwp $OLD_HEADER $meta.Left
        if ($meta.Subject) {
            $r2 = All-Replace $hwp $OLD_SUBJECT $meta.Subject
        }
        Write-Host ('Header updated: ' + $meta.Left + ' / ' + $meta.Subject) -ForegroundColor Green
        Log ('Header updated from source filename.')
    } catch {
        Log ('Header update failed: ' + $_.Exception.Message)
        Write-Host 'Header auto-update failed; problem copy itself is still kept.' -ForegroundColor Yellow
    }
}

$clipDocs = @{}
try {
    Set-Location -LiteralPath $base
    try { Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue } catch {}
    Log 'Script started.'
    Ensure-SecurityModuleInstalled

    Clear-Host
    Write-Host 'HWP 4-question COPY-ONLY V1.7' -ForegroundColor Green
    Write-Host 'AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW + 3TAB->2TAB + HEADER' -ForegroundColor Green
    Write-Host 'Cursor Q1-Q4 -> Block Q1-Q4 -> internal paste Q4-Q1.' -ForegroundColor Green
    Write-Host 'No endnote code. No Alt+G. No Delete sequence.' -ForegroundColor Green

    $allHwp = @(Get-ChildItem -LiteralPath $base -Filter '*.hwp' | Where-Object {
        -not $_.PSIsContainer -and $_.Name -notmatch '_4Q_COPY_TEST_'
    })
    if ($allHwp.Count -lt 2) { throw 'At least two HWP files are required: source and template.' }

    $sourceFile = Select-One $allHwp 'STEP 1 - Choose SOURCE HWP' ''
    $templateFile = Select-One $allHwp 'STEP 2 - Choose TEMPLATE HWP' $sourceFile.FullName

    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $sourceStem = [IO.Path]::GetFileNameWithoutExtension($sourceFile.Name)
    $outName = $sourceStem + '_4Q_COPY_TEST_' + $stamp + '.hwp'
    $outPath = Join-Path $base $outName
    Copy-Item -LiteralPath $templateFile.FullName -Destination $outPath -Force

    Write-Host ''
    Write-Host ('Source   : ' + $sourceFile.Name) -ForegroundColor Cyan
    Write-Host ('Template : ' + $templateFile.Name) -ForegroundColor Cyan
    Write-Host ('Output   : ' + $outName) -ForegroundColor Cyan

    $src = New-HwpFileObject $sourceFile.FullName
    $dst = New-HwpFileObject $outPath

    Write-Host ''
    Write-Host 'PHASE 1 - CAPTURE OUTPUT CURSORS Q1-Q4' -ForegroundColor White
    $targetPos = @{}
    for ($q = 1; $q -le 4; $q++) {
        Focus-Hwp $dst
        Wait-Enter ('[' + $q + '/4] OUTPUT: click the exact BODY paste cursor for question ' + $q + '.')
        $targetPos[$q] = $dst.GetPosBySet()
        Write-Host ('[' + $q + '/4] cursor captured.') -ForegroundColor Green
        Log ('Q' + $q + ': target position captured.')
    }

    Write-Host ''
    Write-Host 'PHASE 2 - CAPTURE SOURCE BLOCKS Q1-Q4' -ForegroundColor White
    Write-Host 'Each temporary copy automatically changes 3 consecutive tabs to 2.' -ForegroundColor DarkGray
    for ($q = 1; $q -le 4; $q++) {
        Focus-Hwp $src
        Wait-Enter ('[' + $q + '/4] SOURCE: select the full problem block for question ' + $q + '.')
        $null = $src.HAction.Run('Copy')
        Start-Sleep -Milliseconds 350

        $tmp = New-HwpClipboardObject
        $null = $tmp.HAction.Run('Paste')
        Start-Sleep -Milliseconds 250
        Normalize-ChoiceTabs $tmp $q
        $clipDocs[$q] = $tmp
        Write-Host ('[' + $q + '/4] block captured and tab-normalized.') -ForegroundColor Green
        Log ('Q' + $q + ': source block captured into temp HWP.')
    }

    Write-Host ''
    Write-Host 'PHASE 3 - PASTING INTERNALLY IN REVERSE ORDER Q4 -> Q1' -ForegroundColor White
    Write-Host 'Do not click anything until DONE appears.' -ForegroundColor Yellow
    for ($q = 4; $q -ge 1; $q--) {
        $tmp = $clipDocs[$q]
        try {
            $null = $tmp.HAction.Run('SelectAll')
            $null = $tmp.HAction.Run('Copy')
            Start-Sleep -Milliseconds 300
            $null = $dst.SetPosBySet($targetPos[$q])
            $null = $dst.HAction.Run('Paste')
            Start-Sleep -Milliseconds 650
            Write-Host ('Q' + $q + ' pasted.') -ForegroundColor Green
            Log ('Q' + $q + ': pasted in reverse-order phase.')
        } catch {
            Log ('Q' + $q + ': reverse paste failed: ' + $_.Exception.Message)
            throw ('Could not paste question ' + $q + '.')
        }
    }

    Write-Host ''
    Write-Host 'PHASE 4 - HEADER UPDATE' -ForegroundColor White
    Update-TemplateHeader $dst $sourceFile.Name

    try {
        $null = $dst.HAction.Run('FileSave')
    } catch {
        try { $null = $dst.SaveAs($outPath, 'HWP', '') } catch {}
    }

    Write-Host ''
    Write-Host 'DONE - 4-question COPY/PASTE test finished.' -ForegroundColor Green
    Write-Host ('Output: ' + $outPath) -ForegroundColor Green
    Write-Host ('Log   : ' + $logPath) -ForegroundColor DarkGray
    Log 'Script completed successfully.'
}
catch {
    $msg = $_.Exception.Message
    $detail = ($_ | Out-String)
    Log ('ERROR: ' + $msg)
    Log $detail
    Write-Host ''
    Write-Host '==================== ERROR ====================' -ForegroundColor Red
    Write-Host $msg -ForegroundColor Red
    Write-Host ''
    Write-Host $detail -ForegroundColor DarkRed
    Write-Host '================================================' -ForegroundColor Red
    Write-Host ('Log file: ' + $logPath) -ForegroundColor Yellow
}
finally {
    foreach ($k in @($clipDocs.Keys)) {
        try { $clipDocs[$k].Quit() } catch {}
    }
}

Write-Host ''
[void](Read-Host 'Press Enter to close')
