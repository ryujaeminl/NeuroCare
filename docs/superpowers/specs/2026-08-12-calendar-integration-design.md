# 휴대폰 네이티브 캘린더 연동 설계

## 배경 / 목표

환자가 대화 중에 일정을 말하면(예: "다음 주 화요일에 병원 가야해") AI가 휴대폰의 진짜
네이티브 캘린더(Android CalendarContract, 구글/삼성 캘린더 등)에 일정을 추가하고,
나중에 "그날 뭐였지" 같은 질문에 실제 등록된 일정으로 답할 수 있게 한다. 보호자도
보호자 웹(Neurocare_care)에서 직접 일정을 추가/조회할 수 있어야 한다.

## 범위

- **저장소**: `Desktop/Neurocare` (환자 앱, 대화 엔진 + 네이티브 캘린더 쓰기) +
  `Neurocare_care`(보호자 앱, 일정 폼 + 대시보드 노출). 두 앱은 같은 Turso DB를 공유한다.
- **아웃 오브 스코프**: 환자 폰에 원래 있던(가족이 구글 캘린더에 직접 넣은) 외부 일정을
  읽어오는 양방향 동기화는 안 한다 - AI가 "도와서 등록한" 일정만 다룬다.

## 1. 전체 구조

```
쓰기 두 경로:
  (a) 환자 음성 확인 → 서버 CalendarEvent 저장 (syncedToDeviceAt=null)
  (b) 보호자 웹 폼 → 서버 CalendarEvent 저장 (syncedToDeviceAt=null, 확인 절차 없음)

동기화(하나로 통일, 확인 없이 바로):
  환자 앱 WebView가 (앱 재개 시 + 방금 음성으로 확인한 직후) "안 동기화된 일정" 조회
  → 각각 네이티브 캘린더에 삽입 → syncedToDeviceAt 채움
```

서버 DB(`CalendarEvent`)가 소스 오브 트루스다. 서버가 환자 폰의 실제 캘린더를 직접 못
읽으므로(보호자 대시보드는 서버 DB만 봄), 네이티브 캘린더에는 "복사"로 써준다.

## 2. 데이터 모델

```prisma
model CalendarEvent {
  id               String   @id @default(cuid())
  patientId        String
  patient          User     @relation(fields: [patientId], references: [id])
  title            String
  date             DateTime          // 하루 단위 일정 (기존 FamilyPlan과 동일)
  notes            String?
  source           String            // "patient_voice" | "guardian_web"
  createdByName    String            // 보호자 이름 or "본인" - 대시보드 표시용
  syncedToDeviceAt DateTime?         // 네이티브 캘린더 반영 완료 시각, null이면 아직
  createdAt        DateTime @default(now())
}

model PendingCalendarProposal {
  patientId  String   @id          // 환자당 최대 1개만 대기 (헷갈림 방지)
  title      String
  date       DateTime
  createdAt  DateTime @default(now())
}
```

`PendingCalendarProposal`은 확인 대기 상태 하나만 들고 있다가 확인/취소되면 바로 지운다.
새 제안이 들어오면 기존 대기 중이던 건 버린다(치매 환자 대화라 여러 제안이 동시에
쌓이면 안 됨).

## 3. 쓰기 흐름

### 3a. 환자 음성 확인 경로 (`app/api/chat/route.ts`)

```
maybeProposeCalendarEvent(patientId, latestUserText) 실행
  - PendingCalendarProposal 있는지 먼저 확인
  - 없으면: 구조화 LLM 호출 1번으로 "일정 의도 있나? 있으면 title/date 추출"
    (날짜 파싱은 정규식보다 LLM이 "다음 주 화요일" 같은 상대 날짜를 훨씬 잘 다룬다)
  - 감지되면 PendingCalendarProposal 저장 + 시스템 프롬프트에
    "[제안할 일정] OO / YYYY-MM-DD - 확인 물어보세요" 주입
  - 있으면: isAffirmativeReply(latestUserText)로 확인 (photoContext.ts의 기존 함수 재사용)
    - 긍정: CalendarEvent 저장(source="patient_voice") + PendingCalendarProposal 삭제
      + 응답 헤더로 클라이언트에 "네이티브 동기화 지금 트리거" 신호
    - 부정/무관: PendingCalendarProposal 삭제만 (다시 안 물어봄)
```

### 3b. 보호자 웹 경로 (`Neurocare_care`)

`CalendarEventForm` → `POST /api/guardian/calendar-events` → 그냥 저장(확인 없음,
FamilyPlanList 추가 폼과 같은 패턴).

## 4. 네이티브 동기화 (`android/app/.../MainActivity.kt`)

- 새 브릿지 메서드 `Android.addCalendarEvent(title, isoDate)` -
  `ContentResolver.insert(CalendarContract.Events.CONTENT_URI, ...)`로 실제 삽입.
  `WRITE_CALENDAR` 권한 필요(최초 실행 시 마이크/위치 권한과 같이 일괄 요청).
- 동기화 트리거 함수 `syncUnsyncedCalendarEvents()` 하나를 (a) `MainActivity.onResume()`,
  (b) 방금 confirm 응답 받은 직후 둘 다에서 호출 -
  `GET /api/calendar-events/unsynced?patientId=X` 조회 → 각각 네이티브 삽입 →
  `POST /api/calendar-events/:id/synced`로 표시.
- `WRITE_CALENDAR` 권한이 거부된 경우: 네이티브 삽입만 계속 실패하고
  `syncedToDeviceAt`은 null로 남는다. 서버 DB의 `CalendarEvent`는 이미 저장돼 있으므로
  보호자 대시보드 노출과 대화 중 "그날 뭐였지" 답변(5번 항목)은 정상 동작한다 - 날씨
  기능과 같은 철학으로, 권한이 없어도 핵심 기능(일정 기억/응답)은 그대로 살아있고
  "휴대폰 캘린더 앱에서도 보이는 것"만 못 하게 된다.

## 5. 읽기 흐름 ("그날 뭐였지")

`lib/memory/familyContext.ts`의 `buildUpcomingFamilyPlans`와 같은 패턴 - 매 턴 항상
주입, LLM이 알아서 관련 있을 때만 사용:

```
buildRecentCalendarEvents(patientId):
  CalendarEvent에서 (오늘 - 60일) ~ (오늘 + 14일) 범위 조회, 최대 30개
  "[등록된 일정]" 블록으로 프롬프트에 주입
  예: "- 2026-07-15 병원 진료 (정형외과)"
```

과거 60일까지 커버하면 "지난달 15일 뭐였지" 정도는 잡힌다. 동적으로 날짜를 감지해
필요할 때만 조회하는 방식은 안 쓴다(기존 패턴과 다르게 별도 의도 감지 로직이 필요해져
복잡도만 커짐 - "항상 주입, LLM이 알아서 판단"이 이 앱 전체의 일관된 컨텍스트 주입
방식이다).

## 6. 보호자 대시보드 노출

`Neurocare_care`에 `CalendarEventList`/`CalendarSummaryCard` 컴포넌트 + 관련 API -
FamilyPlanList와 같은 패턴으로 조회, 보호자가 직접 추가한 것과 환자가 음성으로 추가한
것 둘 다 `source` 필드로 구분 표시.

## 결정 로그

- 진짜 네이티브 캘린더 vs 앱 자체 DB 확장: **네이티브 캘린더** (사용자가 명시적으로 선택)
- 음성 추가 시 확인 필요 여부: **확인 후 추가** (치매 환자 대화라 애매한 말에 자동으로
  일정이 생기면 위험)
- 보호자 웹 추가 시 확인 필요 여부: **확인 없음** (보호자는 신뢰된 성인, 확인 절차가
  오히려 번거로움)
- 보호자 앱 노출 여부: **노출함** → 이 결정 때문에 서버 DB가 소스 오브 트루스가 되고
  네이티브 캘린더는 그 복사본이 되는 구조로 확정됨
- 읽기 범위: 과거 60일 + 미래 14일, 최대 30개
