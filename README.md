# 찍계부 PWA 프로토타입

아이폰에 앱처럼 설치할 수 있는 웹앱(PWA) 버전입니다.

## 지금 들어있는 기능
- 카드 사용내역 스크린샷 여러 장 선택
- 한국어/영어 OCR
- 날짜 / 업체명 / 금액 / 카드사 후보 추출
- 연속 스크린샷의 겹친 거래를 보수적으로 중복 제거
- 동일 날짜·동일 업체 반복 소액결제를 합계로 묶어서 표시
- 등록 전 수정
- 지출 직접 등록 / 수정 / 삭제
- 월별 합계 / 전월 비교
- 기본 소비 분석
- 모든 지출 데이터는 현재 브라우저의 localStorage에 저장

## 중요
이 프로토타입은 OCR을 위해 Tesseract.js와 한국어 OCR 모델을 인터넷에서 불러옵니다.
처음 분석할 때 시간이 조금 걸릴 수 있습니다.

카드앱마다 화면 구성이 달라서 첫 버전 파서는 범용 휴리스틱입니다.
실제 카드앱 스크린샷을 테스트하면서 카드사별 파서를 추가하면 정확도가 크게 좋아집니다.

## Windows에서 가장 쉬운 배포: GitHub Pages
1. GitHub에 로그인
2. 새 Repository를 만들기 (예: jjig-ledger)
3. 이 폴더 안의 파일들을 전부 업로드
4. Repository → Settings → Pages
5. Build and deployment에서 "Deploy from a branch"
6. Branch를 main / root로 선택하고 Save
7. 잠시 후 표시되는 https://아이디.github.io/jjig-ledger/ 주소를 아이폰 Safari에서 열기
8. Safari 하단 공유 버튼 → "홈 화면에 추가"
9. 홈 화면의 '찍계부' 아이콘으로 실행

## 다른 무료 호스팅
Netlify Drop, Cloudflare Pages, Vercel 등 정적 사이트 호스팅에도 그대로 올릴 수 있습니다.

## 개인정보
현재 버전은 OCR을 브라우저 안에서 수행합니다. 지출 데이터는 외부 서버 DB에 저장하지 않습니다.
다만 Tesseract 라이브러리/언어모델 파일을 CDN에서 다운로드합니다.
