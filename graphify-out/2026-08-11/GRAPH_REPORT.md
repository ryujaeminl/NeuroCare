# Graph Report - C:\Users\youja\Desktop\Neurocare  (2026-08-10)

## Corpus Check
- 186 files · ~110,009 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 765 nodes · 1488 edges · 52 communities (39 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App App
- App App
- Android Android
- Android Android
- Image Path
- App App
- Eslint Eslint
- App App
- Ref Ref
- App App
- Bcryptjs Libsql
- App App
- Basemodel Bytesio
- App App
- Hooks Hooks
- App App
- App App
- App App
- Hooks Hooks
- Hooks Hooks
- Activity Android
- App App
- App App
- Lib Lib
- Scripts Scripts
- Scripts Scripts
- App App
- App App
- Hooks Hooks
- Lib Lib
- Server Server
- Android Android
- Hooks Hooks
- Components Components
- Hooks Hooks
- Ref Vercel
- Scripts Scripts
- Scripts Scripts
- Eslint Eslint
- Next Next
- Postcss Postcss
- Server Server
- Server Server
- App

## God Nodes (most connected - your core abstractions)
1. `authErrorResponse()` - 78 edges
2. `requireGuardianAccess()` - 39 edges
3. `prisma` - 39 edges
4. `WakeWordService` - 27 edges
5. `requirePatientAccess()` - 22 edges
6. `requirePatientSelf()` - 20 edges
7. `useConversationEngine()` - 19 edges
8. `requireSession()` - 19 edges
9. `MainActivity` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `checkAndSendMedicationReminders()`  [EXTRACTED]
  app/api/cron/medication-reminders/route.ts → lib/guardian/medicationReminderDispatcher.ts
- `POST()` --calls--> `dispatchEmergency()`  [EXTRACTED]
  app/api/emergency/route.ts → lib/guardian/emergencyDispatcher.ts
- `GET()` --calls--> `authErrorResponse()`  [EXTRACTED]
  app/api/enroll/route.ts → lib/auth/permissions.ts
- `GET()` --calls--> `requirePatientSelf()`  [EXTRACTED]
  app/api/enroll/route.ts → lib/auth/permissions.ts
- `POST()` --calls--> `enrollVoice()`  [EXTRACTED]
  app/api/enroll/route.ts → lib/whisperClient.ts

## Import Cycles
- None detected.

## Communities (52 total, 13 thin omitted)

### Community 0 - "App App"
Cohesion: 0.05
Nodes (84): DELETE(), GET(), POST(), GET(), PATCH(), EmergencyInput, GET(), PATIENT_TRIGGER_TYPES (+76 more)

### Community 1 - "App App"
Cohesion: 0.05
Nodes (58): GET(), PATCH(), PreferencePatch, requireGuardian(), toWidgetOrder(), FamilyPage(), formatDate(), isEnded() (+50 more)

### Community 2 - "Android Android"
Cohesion: 0.07
Nodes (20): AudioCapture, FloatArray, SileroVad, FloatArray, SpeechSegmenter, FloatArray, Intent, WakeWordService (+12 more)

### Community 3 - "Android Android"
Cohesion: 0.09
Nodes (20): BootReceiver, Context, Intent, EmergencyAlertActivity, Bundle, Bundle, MainActivity, OnBackPressedCallback (+12 more)

### Community 4 - "Image Path"
Cohesion: 0.09
Nodes (38): Image, Path, fit(), main(), 앱 아이콘 생성. 원본 이미지 하나로 안드로이드 런처 아이콘 전부를 만든다. uv run --with pillow python…, 흰 정사각 캔버스 중앙에 원본을 ratio 비율로 앉힌다., check_session_speaker(), cosine_similarity() (+30 more)

### Community 5 - "App App"
Cohesion: 0.09
Nodes (32): hasConcerningStreak(), MoodSummaryCard(), MoodSummaryCardProps, SessionMood, formatDate(), formatTime(), HistorySessionSummary, HistoryTimeline() (+24 more)

### Community 6 - "Eslint Eslint"
Cohesion: 0.06
Nodes (34): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, prisma, tailwindcss, @tailwindcss/postcss (+26 more)

### Community 7 - "App App"
Cohesion: 0.10
Nodes (25): buildStageGuidance(), buildSystemPrompt(), ChatMessage, POST(), SystemPromptResult, POST(), TurnRole, EMBEDDING_DIMENSION (+17 more)

### Community 8 - "Ref Ref"
Cohesion: 0.06
Nodes (31): android, dom, dom.iterable, esnext, everything-claude-code, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts (+23 more)

### Community 9 - "App App"
Cohesion: 0.15
Nodes (20): POST(), meetsAlertThreshold(), serializeNotableMoments(), dispatchMoodAlerts(), dispatchEmergency(), fallbackToSms(), GuardianTarget, TRIGGER_LABELS (+12 more)

### Community 10 - "Bcryptjs Libsql"
Cohesion: 0.07
Nodes (27): bcryptjs, @libsql/client, next, next-auth, onnxruntime-web, dependencies, bcryptjs, @libsql/client (+19 more)

### Community 11 - "App App"
Cohesion: 0.12
Nodes (11): generateInviteCode(), POST(), formatQuotedAt(), MemoriesPage(), EmergencyBanner(), OpenEvent, { handlers, auth, signIn, signOut }, next-auth (+3 more)

### Community 12 - "Basemodel Bytesio"
Cohesion: 0.14
Nodes (20): BaseModel, BytesIO, delete, get, post, delete_enrollment(), enroll(), enrollment_status() (+12 more)

### Community 13 - "App App"
Cohesion: 0.22
Nodes (14): POST(), GET(), MedicationForm(), MedicationFormProps, toDateInput(), isValidTimeString(), parseReminderTimes(), addDays() (+6 more)

### Community 14 - "Hooks Hooks"
Cohesion: 0.19
Nodes (11): ConversationLogEntry, ConversationPhase, UseConversationEngineOptions, UseConversationEngineResult, ConversationPersistence, useConversationPersistence(), normalizeGain(), ChatMessage (+3 more)

### Community 15 - "App App"
Cohesion: 0.31
Nodes (8): DELETE(), GET(), POST(), deleteEnrollment(), enrollVoice(), getEnrollmentStatus(), transcribeAudio(), TranscribeResult

### Community 16 - "App App"
Cohesion: 0.29
Nodes (7): FamilyMemberOption, MemberDetail, FamilyMemberOption, MemoryForm(), MemoryFormProps, MemoryFormValue, toDateInput()

### Community 17 - "App App"
Cohesion: 0.24
Nodes (6): geistMono, geistSans, metadata, ClientDiagnostics(), Providers(), ProvidersProps

### Community 18 - "Hooks Hooks"
Cohesion: 0.24
Nodes (8): useSpeechCalibration(), UseSpeechCalibrationResult, COMPLETE_SILENCE_MS, COMPLETE_SUFFIXES, DEFAULT_INCOMPLETE_SILENCE_MS, INCOMPLETE_SUFFIXES, INCOMPLETE_WORDS, isUtteranceComplete()

### Community 19 - "Hooks Hooks"
Cohesion: 0.31
Nodes (9): computeDbfs(), decomposeHangul(), editDistance(), isWakeWordOnly(), reportToServer(), stripWakeWordPrefix(), transcribeSegment(), trimHistory() (+1 more)

### Community 20 - "Activity Android"
Cohesion: 0.43
Nodes (3): Activity, EmergencyNotifier, Context

### Community 21 - "App App"
Cohesion: 0.39
Nodes (4): Status, VoiceEnrollment(), encodeWav(), writeString()

### Community 22 - "App App"
Cohesion: 0.32
Nodes (5): DashboardCardProps, DashboardSummary, formatPlanDate(), HomePage(), EmergencyButton()

### Community 24 - "Scripts Scripts"
Cohesion: 0.33
Nodes (5): filesToCopy, onnxRuntimeDist, rootDir, targetDir, vadWebDist

### Community 25 - "Scripts Scripts"
Cohesion: 0.33
Nodes (5): HTTPS_PORT, next, options, server, TARGET_PORT

### Community 26 - "App App"
Cohesion: 0.80
Nodes (3): POST(), isClovaVoiceConfigured(), synthesizeWithClova()

### Community 27 - "App App"
Cohesion: 0.50
Nodes (4): EmergencyEventDetail, EmergencyEventPage(), fetchEmergencyEvent(), TRIGGER_LABELS

### Community 28 - "Hooks Hooks"
Cohesion: 0.50
Nodes (4): preconnectBackend(), useVAD(), UseVADResult, VAD_SAMPLE_RATE

### Community 30 - "Server Server"
Cohesion: 0.50
Nodes (4): main(), /ws/transcribe 엔드포인트 독립 테스트. 앱 클라이언트를 건드리지 않고 서버 로직만 검증한다. edge-tts로 문장을 합성 ->…, edge-tts로 mp3를 만들고 av로 16kHz mono PCM16으로 디코드한다., synthesize_pcm16()

### Community 31 - "Android Android"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 32 - "Hooks Hooks"
Cohesion: 0.50
Nodes (3): QueueItem, useAudioQueue(), UseAudioQueueResult

## Knowledge Gaps
- **165 isolated node(s):** `ChatMessage`, `SystemPromptResult`, `PATIENT_TRIGGER_TYPES`, `EmergencyInput`, `FamilyMemberPatch` (+160 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authErrorResponse()` connect `App App` to `App App`, `App App`, `App App`, `App App`, `App App`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `prisma` connect `App App` to `App App`, `App App`, `App App`, `App App`, `App App`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `useConversationEngine()` connect `Hooks Hooks` to `Hooks Hooks`, `Hooks Hooks`, `Hooks Hooks`, `Hooks Hooks`, `App App`, `App App`, `Hooks Hooks`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `ChatMessage`, `SystemPromptResult`, `PATIENT_TRIGGER_TYPES` to the rest of the system?**
  _165 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App App` be split into smaller, more focused modules?**
  _Cohesion score 0.05216581276199348 - nodes in this community are weakly interconnected._
- **Should `App App` be split into smaller, more focused modules?**
  _Cohesion score 0.053613053613053616 - nodes in this community are weakly interconnected._
- **Should `Android Android` be split into smaller, more focused modules?**
  _Cohesion score 0.07138047138047138 - nodes in this community are weakly interconnected._