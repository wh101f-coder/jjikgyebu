# HWP AUTO UPDATE WRAPPER V1.9
# Runtime-patches the known-good V1.7 copy engine.
# V1.9 stops guessing spacing by the number of Tab characters.
# Instead, option gaps are reduced to ONE tab and the copied question gets fixed tab stops.
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
    # V1.9: normalize by TAB STOPS, not by counting Tabs.
    # SOURCE remains untouched; this runs only on the temporary one-question copy.
    try {
        $txt = ''
        try { $txt = [string]$hwp.GetTextFile('TEXT', '') } catch {}
        $hasChoice = $false
        foreach ($code in @(0x2460,0x2461,0x2462,0x2463,0x2464)) {
            if ($txt.IndexOf([char]$code) -ge 0) { $hasChoice = $true; break }
        }
        if (-not $hasChoice) {
            Log ('Q' + $q + ': no circled choice marker; option alignment skipped.')
            return
        }

        # First collapse source-specific wide gaps to a single real Tab.
        # Do longest patterns first so all common 2-8 tab runs end as one tab.
        $null = All-Replace $hwp '^t^t^t^t^t^t^t^t' '^t'
        $null = All-Replace $hwp '^t^t^t^t^t^t^t' '^t'
        $null = All-Replace $hwp '^t^t^t^t^t^t' '^t'
        $null = All-Replace $hwp '^t^t^t^t^t' '^t'
        $null = All-Replace $hwp '^t^t^t^t' '^t'
        $null = All-Replace $hwp '^t^t^t' '^t'
        $null = All-Replace $hwp '^t^t' '^t'

        # Common mixed gaps: tabs separated by one/two spaces.
        $null = All-Replace $hwp '^t ^t^t' '^t'
        $null = All-Replace $hwp '^t^t ^t' '^t'
        $null = All-Replace $hwp '^t ^t ^t' '^t'
        $null = All-Replace $hwp '^t  ^t^t' '^t'
        $null = All-Replace $hwp '^t^t  ^t' '^t'
        $null = All-Replace $hwp '^t  ^t  ^t' '^t'
        $null = All-Replace $hwp '^t ^t' '^t'
        $null = All-Replace $hwp '^t  ^t' '^t'

        # Give every paragraph in this temporary question two fixed left tab stops.
        # With one Tab between choices, ① stays at the line start, ② goes to ~28 mm,
        # ③ goes to ~56 mm. The second line naturally becomes ④ / ⑤ on the same grid.
        $null = $hwp.HAction.Run('SelectAll')
        $set = $hwp.HParameterSet.HParaShape
        $hwp.HAction.GetDefault('ParagraphShape', $set.HSet)
        $tabDef = $set.TabDef
        $tabDef.CreateItemArray('TabItem', 6)
        $tabDef.TabItem.SetItem(0, $hwp.MiliToHwpUnit(28.0))
        $tabDef.TabItem.SetItem(1, 0)
        $tabDef.TabItem.SetItem(2, 0)
        $tabDef.TabItem.SetItem(3, $hwp.MiliToHwpUnit(56.0))
        $tabDef.TabItem.SetItem(4, 0)
        $tabDef.TabItem.SetItem(5, 0)
        $null = $hwp.HAction.Execute('ParagraphShape', $set.HSet)
        try { $null = $hwp.HAction.Run('Cancel') } catch {}

        Log ('Q' + $q + ': V1.9 fixed option tab stops applied at 28mm / 56mm.')
    } catch {
        Log ('Q' + $q + ': V1.9 option alignment skipped/failed: ' + $_.Exception.Message)
    }
}
'@

    if (-not $src.Contains($old)) {
        throw 'Known V1.7 normalization block was not found; refusing unsafe patch.'
    }

    $src = $src.Replace($old, $new)
    $src = $src.Replace('V1.7', 'V1.9')
    $src = $src.Replace('AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW + 3TAB->2TAB + HEADER', 'AUTO-UPDATE + STABLE-CURSOR + AUTO-ALLOW + FIXED-TABSTOPS + HEADER')
    $src = $src.Replace('Each temporary copy automatically changes 3 consecutive tabs to 2.', 'Each temporary copy uses one Tab with fixed 28mm / 56mm option stops.')

    Set-Content -LiteralPath $runtime -Value $src -Encoding UTF8
    Write-Host 'HWP AUTO V1.9 loaded - fixed option tab stops (28mm / 56mm).' -ForegroundColor Green
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runtime
    exit $LASTEXITCODE
}
catch {
    Write-Host ''
    Write-Host 'V1.9 updater/runtime patch failed:' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    [void](Read-Host 'Press Enter to close')
    exit 1
}