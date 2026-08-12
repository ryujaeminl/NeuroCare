# Graph Report - Neurocare  (2026-08-12)

## Corpus Check
- 246 files · ~154,166 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1413 nodes · 2376 edges · 110 communities (87 shown, 23 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6f30de28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- requireGuardianAccess
- types.ts
- WakeWordService
- MainActivity
- speaker.py
- moodAnalysis.ts
- devDependencies
- chat/route.ts
- compilerOptions
- emergencyDispatcher.ts
- dependencies
- authOptions.ts
- main.py
- .agents/skills/caveman-compress/scripts/compress.py
- useConversationEngine.ts
- requirePatientSelf
- [memberId]/page.tsx
- app/layout.tsx
- turnDetector.ts
- useConversationEngine
- .continue/skills/caveman-compress/scripts/compress.py
- encodeWav
- app/page.tsx
- SpeechQueue
- copy-vad-assets.mjs
- serve-lan.mjs
- tts/route.ts
- [eventId]/page.tsx
- useVAD.ts
- ttsClient.ts
- test_streaming.py
- gradlew
- useAudioQueue.ts
- ProgressRing.tsx
- .agents/skills/caveman-compress/scripts/validate.py
- regions
- apply-migration-to-turso.mjs
- .roo/skills/caveman-compress/scripts/validate.py
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- send-medication-reminders.sh
- deploy.sh
- { GET, POST }
- .agents/skills/caveman-compress/README.md
- .continue/skills/caveman-compress/README.md
- .roo/skills/caveman-compress/README.md
- permissions.ts
- mood/route.ts
- HistoryView.tsx
- authErrorResponse
- 뉴로케어
- useLinkedPatients
- settings/page.tsx
- .agents/skills/cavecrew/SKILL.md
- Caveman Help
- family/page.tsx
- .continue/skills/cavecrew/SKILL.md
- Caveman Help
- .roo/skills/cavecrew/SKILL.md
- Caveman Help
- messages/route.ts
- Caveman Compress
- .agents/skills/caveman/SKILL.md
- Caveman Compress
- .continue/skills/caveman/SKILL.md
- Caveman Compress
- .roo/skills/caveman/SKILL.md
- caveman-commit
- caveman-review
- caveman-commit
- caveman-review
- caveman-commit
- caveman-review
- .continue/skills/caveman-compress/scripts/validate.py
- prisma.ts
- scripts
- caveman-stats
- caveman-stats
- caveman-stats
- fit
- register/route.ts
- package.json
- useStreamingStt.ts
- .agents/skills/caveman-compress/scripts/__init__.py
- CLAUDE.md
- .continue/skills/caveman-compress/scripts/__init__.py
- 휴대폰 네이티브 캘린더 연동 Implementation Plan
- 휴대폰 네이티브 캘린더 연동 설계
- react-dom
- @ricky0123/vad-web
- memories/[id]/route.ts
- .roo/skills/caveman-compress/scripts/__init__.py
- 음성 파이프라인을 Azure OpenAI Realtime API로 교체 (1단계: 핵심 파이프라인)
- 유튜브 노래 재생 기능 설계
- Global Constraints
- guardian/page.tsx
- useConversationPersistence.ts
- next
- next-auth
- @prisma/client
- @vercel/blob

## God Nodes (most connected - your core abstractions)
1. `authErrorResponse()` - 78 edges
2. `prisma` - 43 edges
3. `requireGuardianAccess()` - 39 edges
4. `WakeWordService` - 27 edges
5. `requirePatientAccess()` - 22 edges
6. `MainActivity` - 21 edges
7. `useConversationEngine()` - 20 edges
8. `requirePatientSelf()` - 20 edges
9. `requireSession()` - 19 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `FamilyPage()` --calls--> `useLinkedPatients()`  [EXTRACTED]
  app/guardian/family/page.tsx → hooks/useLinkedPatients.ts
- `SettingsPage()` --calls--> `useLinkedPatients()`  [EXTRACTED]
  app/guardian/settings/page.tsx → hooks/useLinkedPatients.ts
- `GET()` --calls--> `authErrorResponse()`  [EXTRACTED]
  app/api/auth/invite/route.ts → lib/auth/permissions.ts
- `POST()` --calls--> `authErrorResponse()`  [EXTRACTED]
  app/api/auth/invite/route.ts → lib/auth/permissions.ts
- `DELETE()` --calls--> `authErrorResponse()`  [EXTRACTED]
  app/api/auth/invite/route.ts → lib/auth/permissions.ts

## Import Cycles
- None detected.

## Communities (110 total, 23 thin omitted)

### Community 0 - "requireGuardianAccess"
Cohesion: 0.13
Nodes (19): DELETE(), MedicationPatch, PATCH(), GET(), MedicationInput, POST(), validate(), DELETE() (+11 more)

### Community 1 - "types.ts"
Cohesion: 0.16
Nodes (21): GET(), PATCH(), PreferencePatch, requireGuardian(), toWidgetOrder(), PreferenceState, DashboardLayoutEditor(), DashboardLayoutEditorProps (+13 more)

### Community 2 - "WakeWordService"
Cohesion: 0.07
Nodes (20): AudioCapture, FloatArray, SileroVad, FloatArray, SpeechSegmenter, FloatArray, Intent, WakeWordService (+12 more)

### Community 3 - "MainActivity"
Cohesion: 0.06
Nodes (24): Activity, android, BootReceiver, Context, Intent, EmergencyAlertActivity, Bundle, EmergencyNotifier (+16 more)

### Community 4 - "speaker.py"
Cohesion: 0.09
Nodes (44): check_session_speaker(), check_session_speaker_array(), cosine_similarity(), _decode_wav(), delete_voiceprint(), _embed(), _embed_with_duration(), enroll() (+36 more)

### Community 5 - "moodAnalysis.ts"
Cohesion: 0.32
Nodes (7): MOOD_VALUES, AnalyzableTurn, analyzeMood(), extractJson(), foundryClient, MoodResult, toMoodResult()

### Community 6 - "devDependencies"
Cohesion: 0.09
Nodes (23): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, prisma, tailwindcss, @tailwindcss/postcss (+15 more)

### Community 7 - "chat/route.ts"
Cohesion: 0.08
Nodes (36): buildSystemPrompt(), ChatMessage, foundryClient, PhotoToShow, SystemPromptResult, GET(), buildRecentCalendarEvents(), formatDateLabel() (+28 more)

### Community 8 - "compilerOptions"
Cohesion: 0.06
Nodes (31): android, dom, dom.iterable, esnext, everything-claude-code, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts (+23 more)

### Community 9 - "emergencyDispatcher.ts"
Cohesion: 0.08
Nodes (34): POST(), POST(), GET(), POST(), MedicationForm(), MedicationFormProps, toDateInput(), isValidTimeString() (+26 more)

### Community 10 - "dependencies"
Cohesion: 0.10
Nodes (21): animejs, @anthropic-ai/foundry-sdk, bcryptjs, @libsql/client, onnxruntime-web, dependencies, animejs, @anthropic-ai/foundry-sdk (+13 more)

### Community 11 - "authOptions.ts"
Cohesion: 0.11
Nodes (12): formatQuotedAt(), MemoriesPage(), EmergencyBanner(), OpenEvent, applyScale(), FontScale, FontSizeToggle(), OPTIONS (+4 more)

### Community 12 - "main.py"
Cohesion: 0.14
Nodes (21): BaseModel, BytesIO, delete, get, post, delete_enrollment(), enroll(), enrollment_status() (+13 more)

### Community 13 - ".agents/skills/caveman-compress/scripts/compress.py"
Cohesion: 0.10
Nodes (33): main(), print_usage(), backup_dir_for(), build_compress_prompt(), build_fix_prompt(), call_claude(), compress_file(), first_nonblank_line() (+25 more)

### Community 14 - "useConversationEngine.ts"
Cohesion: 0.15
Nodes (14): useBargeIn(), UseBargeInOptions, ConversationLogEntry, ConversationPhase, STREAMING_WS_URL, UseConversationEngineOptions, UseConversationEngineResult, RealtimeServerEvent (+6 more)

### Community 15 - "requirePatientSelf"
Cohesion: 0.18
Nodes (14): DELETE(), GET(), POST(), GET(), GET(), POST(), todayKeyKst(), POST() (+6 more)

### Community 16 - "[memberId]/page.tsx"
Cohesion: 0.29
Nodes (7): FamilyMemberOption, MemberDetail, FamilyMemberOption, MemoryForm(), MemoryFormProps, MemoryFormValue, toDateInput()

### Community 17 - "app/layout.tsx"
Cohesion: 0.24
Nodes (6): geistMono, geistSans, metadata, ClientDiagnostics(), Providers(), ProvidersProps

### Community 18 - "turnDetector.ts"
Cohesion: 0.24
Nodes (8): useSpeechCalibration(), UseSpeechCalibrationResult, COMPLETE_SILENCE_MS, COMPLETE_SUFFIXES, DEFAULT_INCOMPLETE_SILENCE_MS, INCOMPLETE_SUFFIXES, INCOMPLETE_WORDS, isUtteranceComplete()

### Community 19 - "useConversationEngine"
Cohesion: 0.31
Nodes (9): computeDbfs(), decomposeHangul(), editDistance(), isWakeWordOnly(), reportToServer(), stripWakeWordPrefix(), transcribeSegment(), trimHistory() (+1 more)

### Community 20 - ".continue/skills/caveman-compress/scripts/compress.py"
Cohesion: 0.10
Nodes (33): main(), print_usage(), backup_dir_for(), build_compress_prompt(), build_fix_prompt(), call_claude(), compress_file(), first_nonblank_line() (+25 more)

### Community 21 - "encodeWav"
Cohesion: 0.39
Nodes (4): Status, VoiceEnrollment(), encodeWav(), writeString()

### Community 22 - "app/page.tsx"
Cohesion: 0.32
Nodes (5): DashboardCardProps, DashboardSummary, formatPlanDate(), HomePage(), EmergencyButton()

### Community 24 - "copy-vad-assets.mjs"
Cohesion: 0.33
Nodes (5): filesToCopy, onnxRuntimeDist, rootDir, targetDir, vadWebDist

### Community 25 - "serve-lan.mjs"
Cohesion: 0.33
Nodes (5): HTTPS_PORT, next, options, server, TARGET_PORT

### Community 26 - "tts/route.ts"
Cohesion: 0.80
Nodes (3): POST(), isClovaVoiceConfigured(), synthesizeWithClova()

### Community 27 - "[eventId]/page.tsx"
Cohesion: 0.50
Nodes (4): EmergencyEventDetail, EmergencyEventPage(), fetchEmergencyEvent(), TRIGGER_LABELS

### Community 28 - "useVAD.ts"
Cohesion: 0.40
Nodes (5): preconnectBackend(), useVAD(), UseVADCallbacks, UseVADResult, VAD_SAMPLE_RATE

### Community 30 - "test_streaming.py"
Cohesion: 0.50
Nodes (4): main(), /ws/transcribe 엔드포인트 독립 테스트. 앱 클라이언트를 건드리지 않고 서버 로직만 검증한다. edge-tts로 문장을 합성 ->…, edge-tts로 mp3를 만들고 av로 16kHz mono PCM16으로 디코드한다., synthesize_pcm16()

### Community 31 - "gradlew"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 32 - "useAudioQueue.ts"
Cohesion: 0.50
Nodes (3): QueueItem, useAudioQueue(), UseAudioQueueResult

### Community 34 - ".agents/skills/caveman-compress/scripts/validate.py"
Cohesion: 0.15
Nodes (23): benchmark_pair(), count_tokens(), main(), print_table(), Path, count_bullets(), extract_code_blocks(), extract_headings() (+15 more)

### Community 37 - ".roo/skills/caveman-compress/scripts/validate.py"
Cohesion: 0.06
Nodes (56): benchmark_pair(), count_tokens(), main(), print_table(), Path, main(), print_usage(), backup_dir_for() (+48 more)

### Community 52 - ".agents/skills/caveman-compress/README.md"
Cohesion: 0.09
Nodes (20): Before / After, Benchmarks, How It Work, <img src="../../docs/assets/dancing-rock.svg" width="20" height="20" alt="rock"/> Caveman (285 tokens), Install, 📄 Original (706 tokens), Part of Caveman, Security (+12 more)

### Community 53 - ".continue/skills/caveman-compress/README.md"
Cohesion: 0.09
Nodes (20): Before / After, Benchmarks, How It Work, <img src="../../docs/assets/dancing-rock.svg" width="20" height="20" alt="rock"/> Caveman (285 tokens), Install, 📄 Original (706 tokens), Part of Caveman, Security (+12 more)

### Community 54 - ".roo/skills/caveman-compress/README.md"
Cohesion: 0.09
Nodes (20): Before / After, Benchmarks, How It Work, <img src="../../docs/assets/dancing-rock.svg" width="20" height="20" alt="rock"/> Caveman (285 tokens), Install, 📄 Original (706 tokens), Part of Caveman, Security (+12 more)

### Community 55 - "permissions.ts"
Cohesion: 0.21
Nodes (11): DELETE(), GET(), POST(), GET(), DELETE(), POST(), SubscribeInput, GET() (+3 more)

### Community 56 - "mood/route.ts"
Cohesion: 0.31
Nodes (7): EmergencyInput, GET(), PATIENT_TRIGGER_TYPES, POST(), POST(), serializeNotableMoments(), dispatchEmergency()

### Community 57 - "HistoryView.tsx"
Cohesion: 0.10
Nodes (26): hasConcerningStreak(), MoodSummaryCard(), MoodSummaryCardProps, SessionMood, formatDate(), formatTime(), HistorySessionSummary, HistoryTimeline() (+18 more)

### Community 58 - "authErrorResponse"
Cohesion: 0.15
Nodes (21): GET(), PATCH(), DELETE(), FamilyMemberPatch, GET(), PATCH(), FamilyMemberInput, GET() (+13 more)

### Community 59 - "뉴로케어"
Cohesion: 0.12
Nodes (15): 구조, 뉴로케어 Android (웨이크워드 래퍼), 빌드/실행, 확인된 것 / 확인 안 된 것, 1. Python STT 백엔드 (faster-whisper + edge-tts 폴백), 2. Next.js 앱, 3. 환경 변수, 개발용 테스트 계정 (+7 more)

### Community 60 - "useLinkedPatients"
Cohesion: 0.20
Nodes (12): formatDate(), isEnded(), isEndingSoon(), MedicationsPage(), GuardianPage(), FamilyMemberOption, PhotosPage(), FamilyMemberOption (+4 more)

### Community 61 - "settings/page.tsx"
Cohesion: 0.16
Nodes (14): CHANNEL_LABELS, SettingsPage(), THRESHOLD_LABELS, DementiaStageSettings(), DementiaStageSettingsProps, PatientSelectorProps, PushOptIn(), urlBase64ToUint8Array() (+6 more)

### Community 62 - ".agents/skills/cavecrew/SKILL.md"
Cohesion: 0.14
Nodes (12): cavecrew, Example chaining, How to invoke, Model overrides, See also, What it does, Auto-clarity (inherited), Chaining patterns (+4 more)

### Community 63 - "Caveman Help"
Cohesion: 0.14
Nodes (12): caveman-help, Example output, How to invoke, See also, What it does, Caveman Help, Configure Default Mode, Deactivate (+4 more)

### Community 64 - "family/page.tsx"
Cohesion: 0.20
Nodes (9): FamilyPage(), FamilyMemberCard(), FamilyMemberSummary, FamilyMessageBoard(), FamilyPlanList(), toDateInput(), FamilySummaryCard(), FamilyTaskChecklist() (+1 more)

### Community 65 - ".continue/skills/cavecrew/SKILL.md"
Cohesion: 0.14
Nodes (12): cavecrew, Example chaining, How to invoke, Model overrides, See also, What it does, Auto-clarity (inherited), Chaining patterns (+4 more)

### Community 66 - "Caveman Help"
Cohesion: 0.14
Nodes (12): caveman-help, Example output, How to invoke, See also, What it does, Caveman Help, Configure Default Mode, Deactivate (+4 more)

### Community 67 - ".roo/skills/cavecrew/SKILL.md"
Cohesion: 0.14
Nodes (12): cavecrew, Example chaining, How to invoke, Model overrides, See also, What it does, Auto-clarity (inherited), Chaining patterns (+4 more)

### Community 68 - "Caveman Help"
Cohesion: 0.14
Nodes (12): caveman-help, Example output, How to invoke, See also, What it does, Caveman Help, Configure Default Mode, Deactivate (+4 more)

### Community 69 - "messages/route.ts"
Cohesion: 0.33
Nodes (7): POST(), DELETE(), POST(), ALLOWED_TYPES, deletePhoto(), putPhoto(), UploadError

### Community 70 - "Caveman Compress"
Cohesion: 0.17
Nodes (11): Boundaries, Caveman Compress, Compress, Compression Rules, Pattern, Preserve EXACTLY (never modify), Preserve Structure, Process (+3 more)

### Community 71 - ".agents/skills/caveman/SKILL.md"
Cohesion: 0.17
Nodes (10): caveman, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Intensity (+2 more)

### Community 72 - "Caveman Compress"
Cohesion: 0.17
Nodes (11): Boundaries, Caveman Compress, Compress, Compression Rules, Pattern, Preserve EXACTLY (never modify), Preserve Structure, Process (+3 more)

### Community 73 - ".continue/skills/caveman/SKILL.md"
Cohesion: 0.17
Nodes (10): caveman, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Intensity (+2 more)

### Community 74 - "Caveman Compress"
Cohesion: 0.17
Nodes (11): Boundaries, Caveman Compress, Compress, Compression Rules, Pattern, Preserve EXACTLY (never modify), Preserve Structure, Process (+3 more)

### Community 75 - ".roo/skills/caveman/SKILL.md"
Cohesion: 0.17
Nodes (10): caveman, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Intensity (+2 more)

### Community 76 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 77 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 78 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 79 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 80 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 81 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 82 - ".continue/skills/caveman-compress/scripts/validate.py"
Cohesion: 0.15
Nodes (23): benchmark_pair(), count_tokens(), main(), print_table(), Path, count_bullets(), extract_code_blocks(), extract_headings() (+15 more)

### Community 83 - "prisma.ts"
Cohesion: 0.18
Nodes (6): DELETE(), POST(), createPrismaClient(), globalForPrisma, prisma, prisma

### Community 84 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, dev:lan, lint, postinstall, start, start:lan

### Community 85 - "caveman-stats"
Cohesion: 0.29
Nodes (5): caveman-stats, Example output, How to invoke, See also, What it does

### Community 86 - "caveman-stats"
Cohesion: 0.29
Nodes (5): caveman-stats, Example output, How to invoke, See also, What it does

### Community 87 - "caveman-stats"
Cohesion: 0.29
Nodes (5): caveman-stats, Example output, How to invoke, See also, What it does

### Community 88 - "fit"
Cohesion: 0.40
Nodes (5): Image, fit(), main(), 앱 아이콘 생성. 원본 이미지 하나로 안드로이드 런처 아이콘 전부를 만든다. uv run --with pillow python…, 흰 정사각 캔버스 중앙에 원본을 ratio 비율로 앉힌다.

### Community 89 - "register/route.ts"
Cohesion: 0.83
Nodes (3): generateInviteCode(), POST(), isUserRole()

### Community 90 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 95 - "휴대폰 네이티브 캘린더 연동 Implementation Plan"
Cohesion: 0.12
Nodes (15): Global Constraints, Task 10: 보호자 앱 - 일정 API (Neurocare_care), Task 11: 보호자 앱 - 대시보드 UI (Neurocare_care), Task 1: Prisma 스키마 - CalendarEvent, PendingCalendarProposal (환자 앱), Task 2: LLM 기반 일정 의도 추출 (환자 앱), Task 3: 캘린더 DB 연산 + 프롬프트 블록 빌더 (환자 앱), Task 4: chat/route.ts에 캘린더 흐름 연결 (환자 앱), Task 5: 동기화 대상 조회 + 완료 표시 API (환자 앱) (+7 more)

### Community 96 - "휴대폰 네이티브 캘린더 연동 설계"
Cohesion: 0.15
Nodes (12): 1. 전체 구조, 2. 데이터 모델, 3. 쓰기 흐름, 3a. 환자 음성 확인 경로 (`app/api/chat/route.ts`), 3b. 보호자 웹 경로 (`Neurocare_care`), 4. 네이티브 동기화 (`android/app/.../MainActivity.kt`), 5. 읽기 흐름 ("그날 뭐였지"), 6. 보호자 대시보드 노출 (+4 more)

### Community 99 - "memories/[id]/route.ts"
Cohesion: 0.40
Nodes (8): MemoryPatch, PATCH(), GET(), MemoryInput, POST(), parseTags(), serializeTags(), upsertFamilyMemory()

### Community 101 - "음성 파이프라인을 Azure OpenAI Realtime API로 교체 (1단계: 핵심 파이프라인)"
Cohesion: 0.20
Nodes (9): 목표 / 범위, 배경, 범위 밖 (다음 단계로 미룸), 세션 시작/종료 지점 (기존 그대로 재사용, 새 네이티브 코드 없음), 아키텍처, 에러 처리, 음성 파이프라인을 Azure OpenAI Realtime API로 교체 (1단계: 핵심 파이프라인), 컴포넌트 (+1 more)

### Community 102 - "유튜브 노래 재생 기능 설계"
Cohesion: 0.20
Nodes (9): chat/route.ts 연동 (캘린더 패턴 재사용), 마이크/오디오 충돌 처리, 목표, 범위 밖 (Non-goals), 아키텍처, 에러 처리, 유튜브 노래 재생 기능 설계, 컴포넌트 (+1 more)

### Community 103 - "Global Constraints"
Cohesion: 0.25
Nodes (7): Global Constraints, Realtime 음성 파이프라인 (1단계) Implementation Plan, Task 1: 페르소나 프롬프트를 공유 모듈로 추출, Task 2: 임시토큰 발급 라우트, Task 3: 응급 감지 라우트, Task 4: Realtime WebRTC 클라이언트 훅, Task 5: 페이지 연결 + 실기기 검증

### Community 104 - "guardian/page.tsx"
Cohesion: 0.53
Nodes (4): isActive(), isEndingSoon(), MedicationSummaryCard(), SELECTED_PATIENT_STORAGE_KEY

## Knowledge Gaps
- **455 isolated node(s):** `foundryClient`, `ChatMessage`, `PhotoToShow`, `SystemPromptResult`, `PATIENT_TRIGGER_TYPES` (+450 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authErrorResponse()` connect `authErrorResponse` to `requireGuardianAccess`, `types.ts`, `memories/[id]/route.ts`, `messages/route.ts`, `emergencyDispatcher.ts`, `requirePatientSelf`, `prisma.ts`, `permissions.ts`, `mood/route.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `prisma` connect `prisma.ts` to `requireGuardianAccess`, `types.ts`, `memories/[id]/route.ts`, `messages/route.ts`, `chat/route.ts`, `emergencyDispatcher.ts`, `authOptions.ts`, `requirePatientSelf`, `permissions.ts`, `mood/route.ts`, `register/route.ts`, `authErrorResponse`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `isMood()` connect `HistoryView.tsx` to `family/page.tsx`, `types.ts`, `moodAnalysis.ts`, `settings/page.tsx`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `foundryClient`, `ChatMessage`, `PhotoToShow` to the rest of the system?**
  _455 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `requireGuardianAccess` be split into smaller, more focused modules?**
  _Cohesion score 0.13043478260869565 - nodes in this community are weakly interconnected._
- **Should `WakeWordService` be split into smaller, more focused modules?**
  _Cohesion score 0.07138047138047138 - nodes in this community are weakly interconnected._
- **Should `MainActivity` be split into smaller, more focused modules?**
  _Cohesion score 0.06487434248977206 - nodes in this community are weakly interconnected._