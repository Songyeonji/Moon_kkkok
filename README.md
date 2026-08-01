# 레슨 시간 예약 웹앱 (moon._.kkkok)

레슨 시간(기본 **19:00–20:40, 10분 단위 · 10명**)을 회원이 **로그인 없이** 신청하고,
**관리자(문대언)** 가 비밀번호 로그인 후 **날짜·시간 설정**과 **승인/반려**를 관리하는 웹앱입니다.

- 프론트: **React + TypeScript + Tailwind** (Vite, 반응형 웹앱, Pretendard)
- 백엔드/DB: **Google Apps Script 웹앱 + Google 스프레드시트**
- 시간: **한국시간(KST, `Asia/Seoul`)** — `dayjs` 로 자동 처리
- **신규 신청은 바로 확정**, **변경·취소만 관리자 승인**. 반려되면 이전 예약이 그대로 유지됩니다.
- 화면은 **탑바(현황 · 나의 신청 내역 · 관리자)** 구조이고, 현황은 **달력**으로 봅니다.

```
React(TS/Tailwind) SPA  ──fetch──▶  Apps Script 웹앱(API)  ──▶  Google 스프레드시트(DB)
```

---

## 1. 지금 바로 실행 (목업 모드 — 구글 계정 불필요)

Apps Script 없이 브라우저 메모리(localStorage)로 전체 기능을 미리 볼 수 있습니다.

```bash
npm install
npm run dev
```

- 접속: `http://localhost:5173`
- 상단 탑바에서 **현황 / 나의 신청 내역 / 관리자** 전환 (각각 주소 `#`, `#my`, `#admin`)
- 목업 관리자 비밀번호: **`admin1234`**
- 데모 데이터는 자동 시드됩니다. 초기화하려면 브라우저 콘솔에서
  `localStorage.removeItem('moon_lesson_mock_v1')` 실행 후 새로고침.

`.env` 의 `VITE_MOCK=1` 이면 목업 모드입니다.

---

## 2. 실제 배포 (구글 스프레드시트를 DB로 연결)

> ⚠️ 구글 계정이 필요합니다. **본인(문대언) 계정으로 직접** 아래를 진행하세요.
> (제3자가 대신 로그인/배포할 수 없습니다.)

### 2-1. 스프레드시트 만들기
1. [sheets.new](https://sheets.new) 로 새 스프레드시트 생성 (이름 예: `레슨예약DB`)

### 2-2. Apps Script 코드 붙여넣기
2. 스프레드시트 상단 메뉴 **확장 프로그램 → Apps Script**
3. 기본 `Code.gs` 내용을 지우고, 이 저장소 **`apps-script/Code.gs`** 내용을 전부 붙여넣기
4. 좌측 **프로젝트 설정(⚙️)** → "`appsscript.json` 매니페스트 파일 표시" 체크
   → 나타난 `appsscript.json` 을 이 저장소 **`apps-script/appsscript.json`** 내용으로 교체
5. 저장(💾)

### 2-3. 시트 초기화
6. 상단 함수 선택 목록에서 **`initSpreadsheet`** 선택 → **실행(▶)**
   - 최초 실행 시 권한 승인 팝업이 뜨면 본인 계정으로 허용
   - `Settings / Members / Blackouts / Bookings / Quotas` 시트와 헤더가 자동 생성됩니다.

### 2-4. 관리자 비밀번호 설정
7. 좌측 **프로젝트 설정(⚙️) → 스크립트 속성 → 속성 추가**
   - 속성: `ADMIN_PASSWORD`  /  값: **원하는 비밀번호**
   - (이 값이 서버에서 관리자 인증에 사용됩니다. 프론트 코드에는 저장되지 않습니다.)

### 2-5. 웹앱으로 배포
8. 우측 상단 **배포 → 새 배포 → 유형: 웹 앱**
   - 설명: 아무거나
   - **실행 계정: 나(본인)**
   - **액세스 권한: 모든 사용자**
   - **배포** → 표시되는 **웹 앱 URL**(`.../exec`) 복사
   - (코드를 수정할 때마다 **배포 → 배포 관리 → 편집 → 새 버전**으로 갱신)

### 2-6. 프론트에 연결
9. 프로젝트 루트에 `.env` 파일 (없으면 `.env.example` 복사) 을 아래처럼:
   ```env
   VITE_MOCK=0
   VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```
10. 재시작: `npm run dev` (또는 배포 빌드 `npm run build`)

---

## 3. 웹에 올리기 (배포)

프론트는 **정적 사이트**라 어디에나 무료로 올릴 수 있어요. (백엔드는 이미 Apps Script가 담당)

```bash
npm run build   # dist/ 폴더 생성
```

### 방법 A. Vercel (가장 쉬움 · 추천)
1. 코드를 GitHub 저장소에 올림 (`git init` → commit → push)
2. [vercel.com](https://vercel.com) 가입 → **Add New → Project** → 그 저장소 선택
3. **Environment Variables** 에 두 개 입력
   - `VITE_MOCK` = `0`
   - `VITE_API_URL` = Apps Script `/exec` 주소
4. **Deploy** → `https://내프로젝트.vercel.app` 주소 완성
   - 이후 GitHub에 push 할 때마다 **자동 재배포**

### 방법 B. Netlify
1. [netlify.com](https://netlify.com) → **Add new site → Import an existing project** → 저장소 선택
2. Build command `npm run build`, Publish directory `dist`
3. **Site settings → Environment variables** 에 `VITE_MOCK=0`, `VITE_API_URL=...` 입력 후 재배포

> 드래그 배포도 가능: 로컬에서 `.env` 채우고 `npm run build` 한 뒤,
> [app.netlify.com/drop](https://app.netlify.com/drop) 에 `dist` 폴더를 끌어다 놓으면 끝.

### 방법 C. GitHub Pages
```bash
npm run build
npx gh-pages -d dist      # 최초 1회: npm i -D gh-pages
```
저장소 **Settings → Pages** 에서 `gh-pages` 브랜치 선택.
(경로는 `vite.config.ts` 의 `base: './'` 로 이미 상대경로 처리됨)

### 배포 후
- 회원에게는 **기본 주소**를 공유 → 열면 바로 **현황(달력)** 화면
- 관리자는 우측 상단 **관리자** 탭 (또는 주소 뒤 `#admin`) → 비밀번호 로그인
- 휴대폰에서 주소 열고 **"홈 화면에 추가"** 하면 앱처럼 쓸 수 있어요

> ⚠️ 코드를 수정해 다시 올릴 때, **Apps Script 쪽을 고쳤다면** Apps Script에서
> **배포 → 배포 관리 → 편집 → 버전: 새 버전 → 배포** 를 꼭 눌러야 반영됩니다.

---

## 4. 사용법 요약

**현황 (`#`)**
- **달력**으로 한 달 현황을 봅니다. 각 날짜에 `확정/전체` 인원, 대기 건수, `휴무` 표시
- 날짜를 누르면 **시간대별 상세 모달** → 빈 시간의 **신청** 버튼으로 바로 신청
- 우측 상단 **+ 신청하기** 버튼으로도 신청 모달을 열 수 있어요

**나의 신청 내역 (`#my`)**
- 이름을 고르면 이번 달 **총 횟수/확정/완료/대기/남음** 과 예약 목록 표시
- 다가오는 예약은 **변경**·**취소** 가능 (둘 다 관리자 승인 후 반영)

> **승인 정책**: 신규 신청은 **바로 확정**됩니다. **변경·취소만** 관리자 승인이 필요하고,
> 반려되면 **이전 예약이 그대로 유지**됩니다.

**관리자 (비밀번호 로그인, `#admin`)**
- **승인 대기**: 변경·취소 요청을 보고 **승인/반려** (반려 시 이전 예약 유지)
- **월별 현황**: 달마다 **회원별 신청 횟수(4·8·10회 등)** 설정 + 회원별 **확정/완료/대기/남음** 현황 확인
- **회원 관리**: 명단 추가·활성/비활성 (드롭다운 소스, 오타 방지)
- **날짜·시간**: 레슨 시작/종료/간격/정원 + **신청 가능 요일**(기본 월·화·목·금) 설정, 그리고 학교 사정으로 **레슨 없는 날을 '사용불가'로 지정**(그날은 신청 불가)

> **월별 신청 횟수**: 매달 학교 일정에 따라 레슨 가능 횟수가 달라지므로, 관리자가 **그 달의 회원별 횟수**를 정합니다.
> 회원은 그 횟수만큼 원하는 날짜에 신청하고(하루 1레슨), 신청 화면에서 본인의 **확정/완료(받은 레슨)/대기/남은 신청**을 확인합니다.
> 이 값은 `Quotas` 시트에 `월(YYYY-MM) · 이름 · 횟수` 로 저장됩니다. (미설정 시 기본 8회)

---

## 5. 데이터 모델 (스프레드시트 시트)

| 시트 | 컬럼 |
|---|---|
| `Settings` | `startTime, endTime, slotMinutes, capacityPerSlot, availableWeekdays`(신청 가능 요일, 예: `1,2,4,5`=월화목금) (1행) |
| `Members` | `name, active` |
| `Blackouts` | `date` — 사용불가(레슨 없는) 날짜. 요일상 열리는 날이라도 여기 있으면 신청 불가 |
| `Bookings` | `id, name, date, slot, status, requestType, supersedesId, createdAt, decidedAt, note` |
| `Quotas` | `month(YYYY-MM), name, quota` — 달마다 회원별 신청 가능 횟수(학교 일정에 따라 4/8/10 등, 미설정 시 8) |

- `status`: `pending`(대기) · `approved`(확정) · `rejected`(반려) · `cancelled`(취소)
- `requestType`: `new`(신규) · `change`(변경) · `cancel`(취소)
- 변경/취소 승인 시, 이전 확정 예약(`supersedesId`)은 `cancelled` 로 대체됩니다.

---

## 6. 폴더 구조

```
src/
  styles/      tokens.css (디자인 토큰 — 색상 단일 소스, brand = rose)
  lib/         types.ts · time.ts(KST/슬롯) · dates.ts(요일·휴무·달력) · progress.ts(월 횟수) · api.ts(fetch+목업)
  components/  TopBar · Footer · Dropdown · Button · Badge · Card · Modal · Spinner · Toast
  hooks/       usePolling.ts (근실시간 갱신)
  features/
    booking/   BookingPage(달력+신청모달) · CalendarBoard · DayDetailModal · BookingForm · MyHistory
    admin/     AdminDashboard · AdminLogin · ApprovalQueue · MonthlyStatus · MemberManager · DateSlotManager
apps-script/   Code.gs · appsscript.json
```

**레이아웃**: `App.tsx` 가 **탑바 · 본문 · 푸터** 앱 셸을 잡고, 페이지 전체는 스크롤되지 않습니다
(본문 영역만 필요할 때 스크롤). 신청은 **모달**로 처리해 현황 화면의 시선 분산을 없앴습니다.

**색상/테마**: 모든 색은 `src/styles/tokens.css` 의 CSS 변수(디자인 토큰)에서 나옵니다.
테마색(brand)은 **rose** 기반이며, 이 파일의 `--brand-*` 값만 바꾸면 전체 톤이 바뀝니다.
상태색은 `success`(확정) · `warning`(대기) · `danger`(반려/취소) · `info`(신규) 토큰으로 정리되어 있습니다.
폰트는 **Pretendard**(CDN, `index.html`) 를 기본으로 씁니다.

## 7. 참고 (CORS)
- 쓰기 요청은 `Content-Type: text/plain` 으로 보내 브라우저 preflight(OPTIONS) 를 피합니다(Apps Script 표준 패턴). 읽기는 GET.
- Apps Script 배포 액세스가 **"모든 사용자"** 여야 프론트에서 호출됩니다.
