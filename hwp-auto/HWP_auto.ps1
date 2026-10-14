#requires -version 5.1
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

function Pause-Step([string]$msg) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $msg -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
    [void](Read-Host "준비되면 Enter")
}

function Pick-Hwp([string]$title, [string]$initialDir) {
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = $title
    $dlg.Filter = "한글 문서 (*.hwp)|*.hwp|모든 파일 (*.*)|*.*"
    if (Test-Path $initialDir) { $dlg.InitialDirectory = $initialDir }
    $dlg.Multiselect = $false
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        throw "파일 선택이 취소되었습니다."
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
                        Write-Host "보안 승인 모듈 사용: $($p.Name)" -ForegroundColor DarkGreen
                        return
                    }
                } catch {}
            }
        }
    } catch {}
    Write-Host "보안 승인 모듈을 자동 등록하지 못했습니다. 한글에서 파일 접근 창이 뜨면 [모두 허용]을 눌러주세요." -ForegroundColor Yellow
}

function Replace-All($hwp, [string]$find, [string]$replace) {
    try {
        $ps = $hwp.HParameterSet.HFindReplace
        $hwp.HAction.GetDefault("AllReplace", $ps.HSet)
        $ps.FindString = $find
        $ps.ReplaceString = $replace
        $ps.Direction = 0
        $ps.IgnoreMessage = 1
        $ps.FindType = 1
        [void]$hwp.HAction.Execute("AllReplace", $ps.HSet)
    } catch {
        Write-Host "머리말 자동 치환 일부 실패: '$find' -> '$replace'" -ForegroundColor Yellow
    }
}

function Get-Pos3($hwp) {
    try {
        $posSet = $hwp.GetPosBySet()
        if ($null -eq $posSet) { throw "GetPosBySet returned null" }
        $list = [int]$posSet.Item("List")
        $para = [int]$posSet.Item("Para")
        $pos  = [int]$posSet.Item("Pos")
        return @($list, $para, $pos)
    }
    catch {
        throw "현재 커서 위치를 읽지 못했습니다. GetPosBySet 오류: $($_.Exception.Message)"
    }
}

function Set-Pos3($hwp, $p) {
    try {
        $ok = $hwp.SetPos([int]$p[0], [int]$p[1], [int]$p[2])
        if (-not $ok) { throw "SetPos returned false" }
    }
    catch {
        try {
            $posSet = $hwp.CreateSet("ListParaPos")
            $posSet.SetItem("List", [int]$p[0])
            $posSet.SetItem("Para", [int]$p[1])
            $posSet.SetItem("Pos",  [int]$p[2])
            $ok2 = $hwp.SetPosBySet($posSet)
            if (-not $ok2) { throw "SetPosBySet returned false" }
        }
        catch {
            throw "저장된 위치로 커서를 옮기지 못했습니다. $($_.Exception.Message)"
        }
    }
}

Write-Host ""
Write-Host "HWP 내신기출 양식통일 - 자동업데이트 테스트 V3.1" -ForegroundColor Green
Write-Host "실행할 때마다 GitHub의 최신 HWP_auto.ps1을 받아서 실행됩니다."
Write-Host "현재는 수식/표/그림을 HWP 개체 그대로 복붙하는 1페이지(4문항) 검증 단계입니다."
Write-Host ""

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultSource = Join-Path $here "24_2_1_중간_수1_교하고.hwp"
$defaultTemplate = Join-Path $here "template.hwp"

if (Test-Path $defaultSource) {
    $ans = Read-Host "테스트 원본으로 '$defaultSource' 사용? (Enter=예 / n=다른 파일)"
    if ($ans -match "^[nN]") { $sourcePath = Pick-Hwp "원본 HWP 선택" $here }
    else { $sourcePath = $defaultSource }
} else {
    $sourcePath = Pick-Hwp "원본 HWP 선택" $here
}

if (Test-Path $defaultTemplate) {
    $ans = Read-Host "양식으로 '$defaultTemplate' 사용? (Enter=예 / n=다른 파일)"
    if ($ans -match "^[nN]") { $templatePath = Pick-Hwp "내신기출양식 HWP 선택" $here }
    else { $templatePath = $defaultTemplate }
} else {
    $templatePath = Pick-Hwp "내신기출양식 HWP 선택" $here
}

$srcDir = Split-Path -Parent $sourcePath
$srcBase = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)
$outPath = Join-Path $srcDir ($srcBase + "_답없음_HWP테스트.hwp")

Copy-Item -LiteralPath $templatePath -Destination $outPath -Force

Write-Host ""
Write-Host "원본: $sourcePath"
Write-Host "양식: $templatePath"
Write-Host "출력: $outPath" -ForegroundColor Green

try {
    $src = New-Object -ComObject HWPFrame.HwpObject
    $dst = New-Object -ComObject HWPFrame.HwpObject
} catch {
    Write-Host ""
    Write-Host "한글 COM(HWPFrame.HwpObject)을 만들지 못했습니다." -ForegroundColor Red
    Write-Host "한컴오피스 한글이 설치된 Windows PC에서 실행해야 합니다."
    throw
}

Try-RegisterSecurityModule $src
Try-RegisterSecurityModule $dst

[void]$src.Open($sourcePath, "HWP", "")
[void]$dst.Open($outPath, "HWP", "")

try { $src.XHwpWindows.Item(0).Visible = $true } catch {}
try { $dst.XHwpWindows.Item(0).Visible = $true } catch {}

Replace-All $dst "2025년 1학년 1학기 중간고사 심학고등학교" "2024년 2학년 1학기 중간고사 교하고등학교"
Replace-All $dst "공통수학1" "수학1"
Replace-All $dst "2025 1학년 1학기 중간고사 심학고등학교 정답" "2024 2학년 1학기 중간고사 교하고등학교 정답"

Write-Host ""
Write-Host "먼저 출력 양식의 첫 페이지에서 4개 붙여넣기 위치를 지정합니다." -ForegroundColor Green
Write-Host "각 위치는 큰 문제번호 바로 아래, 문제가 시작될 자리로 클릭해 주세요."

$slotNames = @("왼쪽 위", "오른쪽 위", "왼쪽 아래", "오른쪽 아래")
$slots = @()
for ($i=0; $i -lt 4; $i++) {
    Pause-Step "출력 HWP 창에서 첫 페이지 [$($slotNames[$i])] 문제 시작 위치를 클릭하세요."
    $p = Get-Pos3 $dst
    $slots += ,$p
    Write-Host "저장된 위치: List=$($p[0]), Para=$($p[1]), Pos=$($p[2])" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "이제 원본 HWP에서 1~4번 문제를 '문제 자체만' 블록 선택합니다." -ForegroundColor Green
Write-Host "포함: 문제번호, 본문, 수식, 그림/표, 보기, ①~⑤"
Write-Host "제외: 머리말선, 단 구분선, 주변 여백/선, 다른 문제"
Write-Host ""

for ($q=1; $q -le 4; $q++) {
    Pause-Step "원본 HWP 창에서 [$q 번 문제 전체]만 정확히 블록 선택하세요."
    try {
        $src.Run("Copy")
    } catch {
        Write-Host "$q 번 복사 실패. 블록이 제대로 선택되어 있는지 확인하세요." -ForegroundColor Red
        throw
    }

    Set-Pos3 $dst $slots[$q-1]
    try {
        $dst.Run("Paste")
    } catch {
        Write-Host "$q 번 붙여넣기 실패." -ForegroundColor Red
        throw
    }
    Write-Host "$q 번 HWP 네이티브 블록 붙여넣기 완료" -ForegroundColor Green
}

try {
    [void]$dst.SaveAs($outPath, "HWP", "")
} catch {
    try { $dst.Run("FileSave") } catch {}
}

Write-Host ""
Write-Host "완료!" -ForegroundColor Green
Write-Host "생성 파일: $outPath" -ForegroundColor Green
Write-Host ""
Write-Host "확인할 것:"
Write-Host "  1) 수식이 이미지가 아니라 한글 수식 개체로 유지되는지"
Write-Host "  2) 표/그림이 깨지지 않는지"
Write-Host "  3) 문제 블록의 글꼴/간격이 원본 그대로 유지되는지"
Write-Host "  4) 네 양식의 머리말/단 구분선은 그대로인지"
Write-Host ""
Write-Host "한글 창은 검수할 수 있게 열어 둡니다."
[void](Read-Host "검수 후 이 콘솔만 닫으려면 Enter")
