# HWP 4Q COPY ONLY V1.6 AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW
# Workflow: capture 4 output cursors first, capture 4 source blocks first,
# then paste into output in reverse order (Q4 -> Q1) so saved positions do not shift.
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
            if ($n -ge 1 -and $n -le $list.Count) {
                return $list[$n - 1]
            }
        }
        Write-Host 'Invalid number. Try again.' -ForegroundColor Yellow
    }
}

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

$clipDocs = @{}
try {
    Set-Location -LiteralPath $base
    try { Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue } catch {}
    Log 'Script started.'
    Ensure-SecurityModuleInstalled

    Clear-Host
    Write-Host 'HWP 4-question COPY-ONLY test V1.6 AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW' -ForegroundColor Green
    Write-Host 'Cursor Q1-Q4 -> Block Q1-Q4 -> internal paste Q4-Q1.' -ForegroundColor Green
    Write-Host 'No endnote code. No Alt+G. No Delete sequence.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'IMPORTANT: the reverse internal paste keeps Q2-Q4 cursor positions from shifting.' -ForegroundColor White

    $allHwp = @(Get-ChildItem -LiteralPath $base -Filter '*.hwp' | Where-Object {
        -not $_.PSIsContainer -and $_.Name -notmatch '_4Q_COPY_TEST_'
    })

    if ($allHwp.Count -lt 2) {
        throw 'At least two HWP files are required: source and template.'
    }

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
    Write-Host 'Nothing is pasted into OUTPUT yet.' -ForegroundColor DarkGray

    for ($q = 1; $q -le 4; $q++) {
        Focus-Hwp $src
        Wait-Enter ('[' + $q + '/4] SOURCE: select the full problem block for question ' + $q + '.')
        $null = $src.HAction.Run('Copy')
        Start-Sleep -Milliseconds 350

        $tmp = New-HwpClipboardObject
        $null = $tmp.HAction.Run('Paste')
        Start-Sleep -Milliseconds 250
        $clipDocs[$q] = $tmp
        Write-Host ('[' + $q + '/4] block captured.') -ForegroundColor Green
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
