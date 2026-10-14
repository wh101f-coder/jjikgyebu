# HWP AUTO UPDATE WRAPPER V1.8
# Runtime-patches the known-good V1.7 copy engine with stronger choice-tab normalization.
# This keeps the stable cursor-first / block-first / reverse-paste workflow unchanged.

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime = Join-Path $base 'HWP_auto_runtime.ps1'
$sourceUrl = 'https://raw.githubusercontent.com/wh101f-coder/jjikgyebu/6adeb9d4797828eb3eb2c2216932855a5532382d/HWP_auto_latest.ps1'

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object Net.WebClient
    $wc.Encoding = [Text.Encoding]::UTF8
    $src = $wc.DownloadString($sourceUrl)

    $old = @'
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
'@

    $new = @'
function Normalize-ChoiceTabs($hwp, [int]$q) {
    # V1.8: source exams do not store every visual gap as exactly 3 adjacent tabs.
    # Some use 4-8 tabs, or tabs separated by one/two spaces.
    # Only the temporary one-question document is changed; SOURCE stays untouched.
    try {
        $txt = ''
        try { $txt = [string]$hwp.GetTextFile('TEXT', '') } catch {}
        $hasChoice = $false
        foreach ($code in @(0x2460,0x2461,0x2462,0x2463,0x2464)) {
            if ($txt.IndexOf([char]$code) -ge 0) { $hasChoice = $true; break }
        }
        if (-not $hasChoice) {
            Log ('Q' + $q + ': no circled choice marker; tab normalization skipped.')
            return
        }

        # Collapse any long contiguous tab run to exactly two tabs.
        $null = All-Replace $hwp '^t^t^t^t^t^t^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t^t^t^t^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t^t^t^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t^t^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t^t' '^t^t'

        # Also normalize common visually-identical gaps where spaces sit between tabs.
        $null = All-Replace $hwp '^t ^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t ^t' '^t^t'
        $null = All-Replace $hwp '^t ^t ^t' '^t^t'
        $null = All-Replace $hwp '^t  ^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t  ^t' '^t^t'
        $null = All-Replace $hwp '^t  ^t  ^t' '^t^t'

        # One extra pass catches runs created after mixed-gap cleanup.
        $null = All-Replace $hwp '^t^t^t^t' '^t^t'
        $null = All-Replace $hwp '^t^t^t' '^t^t'
        Log ('Q' + $q + ': V1.8 choice-gap normalization applied.')
    } catch {
        Log ('Q' + $q + ': tab normalization skipped/failed: ' + $_.Exception.Message)
    }
}
'@

    if (-not $src.Contains($old)) {
        throw 'Known V1.7 normalization block was not found; refusing unsafe patch.'
    }

    $src = $src.Replace($old, $new)
    $src = $src.Replace('V1.7', 'V1.8')
    $src = $src.Replace('AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW + 3TAB->2TAB + HEADER', 'AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW + ROBUST-TABS + HEADER')
    $src = $src.Replace('Each temporary copy automatically changes 3 consecutive tabs to 2.', 'Each temporary copy normalizes 3+ / mixed tab gaps to two tabs.')

    # Windows PowerShell 5.1 writes UTF-8 with BOM here, avoiding the old parser issue.
    Set-Content -LiteralPath $runtime -Value $src -Encoding UTF8
    Write-Host 'HWP AUTO V1.8 loaded - robust choice spacing.' -ForegroundColor Green
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runtime
    exit $LASTEXITCODE
}
catch {
    Write-Host ''
    Write-Host 'V1.8 updater/runtime patch failed:' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    [void](Read-Host 'Press Enter to close')
    exit 1
}
