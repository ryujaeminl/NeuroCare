# Graph Report - Neurocare  (2026-08-11)

## Corpus Check
- 231 files · ~141,325 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1319 nodes · 2238 edges · 101 communities (79 shown, 22 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5ce13bd7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- requireGuardianAccess
- types.ts
- WakeWordService
- MainActivity
- speaker.py
- isMood
- devDependencies
- chat/route.ts
- compilerOptions
- medicationReminderDispatcher.ts
- dependencies
- authOptions.ts
- main.py
- .agents/skills/caveman-compress/scripts/validate.py
- useConversationEngine.ts
- enroll/route.ts
- [memberId]/page.tsx
- app/layout.tsx
- turnDetector.ts
- useConversationEngine
- .continue/skills/caveman-compress/scripts/validate.py
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
- useBargeIn.ts
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
- authErrorResponse
- prisma
- HistoryView.tsx
- requirePatientAccess
- 뉴로케어
- useLinkedPatients
- guardian/page.tsx
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
- medications/route.ts
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
- @libsql/client
- onnxruntime-web
- react-dom
- @ricky0123/vad-web
- web-push
- .roo/skills/caveman-compress/scripts/__init__.py

## God Nodes (most connected - your core abstractions)
1. `authErrorResponse()` - 78 edges
2. `requireGuardianAccess()` - 39 edges
3. `prisma` - 39 edges
4. `WakeWordService` - 27 edges
5. `requirePatientAccess()` - 22 edges
6. `useConversationEngine()` - 20 edges
7. `requirePatientSelf()` - 20 edges
8. `requireSession()` - 19 edges
9. `MainActivity` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `maybeTriggerVoiceDistress()`  [EXTRACTED]
  app/api/chat/route.ts → lib/guardian/emergencyDispatcher.ts
- `POST()` --calls--> `checkAndSendMedicationReminders()`  [EXTRACTED]
  app/api/cron/medication-reminders/route.ts → lib/guardian/medicationReminderDispatcher.ts
- `GET()` --calls--> `authErrorResponse()`  [EXTRACTED]
  app/api/emergency/[eventId]/route.ts → lib/auth/permissions.ts
- `PATCH()` --calls--> `authErrorResponse()`  [EXTRACTED]
  app/api/emergency/[eventId]/route.ts → lib/auth/permissions.ts
- `PATCH()` --calls--> `requireGuardianAccess()`  [EXTRACTED]
  app/api/emergency/[eventId]/route.ts → lib/auth/permissions.ts

## Import Cycles
- None detected.

## Communities (101 total, 22 thin omitted)

### Community 0 - "requireGuardianAccess"
Cohesion: 0.15
Nodes (19): DELETE(), FamilyMemberPatch, GET(), PATCH(), DELETE(), MemoryPatch, PATCH(), GET() (+11 more)

### Community 1 - "types.ts"
Cohesion: 0.13
Nodes (26): GET(), PATCH(), PreferencePatch, requireGuardian(), toWidgetOrder(), CHANNEL_LABELS, PreferenceState, THRESHOLD_LABELS (+18 more)

### Community 2 - "WakeWordService"
Cohesion: 0.07
Nodes (20): AudioCapture, FloatArray, SileroVad, FloatArray, SpeechSegmenter, FloatArray, Intent, WakeWordService (+12 more)

### Community 3 - "MainActivity"
Cohesion: 0.08
Nodes (23): Activity, BootReceiver, Context, Intent, EmergencyAlertActivity, Bundle, EmergencyNotifier, Context (+15 more)

### Community 4 - "speaker.py"
Cohesion: 0.09
Nodes (44): check_session_speaker(), check_session_speaker_array(), cosine_similarity(), _decode_wav(), delete_voiceprint(), _embed(), _embed_with_duration(), enroll() (+36 more)

### Community 5 - "isMood"
Cohesion: 0.16
Nodes (18): hasConcerningStreak(), MoodSummaryCard(), MoodSummaryCardProps, SessionMood, isToday(), TodayMood, TodayMoodCard(), TodayMoodCardProps (+10 more)

### Community 6 - "devDependencies"
Cohesion: 0.09
Nodes (23): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, prisma, tailwindcss, @tailwindcss/postcss (+15 more)

### Community 7 - "chat/route.ts"
Cohesion: 0.11
Nodes (26): buildStageGuidance(), buildSystemPrompt(), ChatMessage, PhotoToShow, POST(), SystemPromptResult, EMBEDDING_DIMENSION, EmbeddingPurpose (+18 more)

### Community 8 - "compilerOptions"
Cohesion: 0.06
Nodes (31): android, dom, dom.iterable, esnext, everything-claude-code, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts (+23 more)

### Community 9 - "medicationReminderDispatcher.ts"
Cohesion: 0.09
Nodes (35): POST(), GET(), MedicationForm(), MedicationFormProps, toDateInput(), isValidTimeString(), meetsAlertThreshold(), parseReminderTimes() (+27 more)

### Community 10 - "dependencies"
Cohesion: 0.10
Nodes (21): animejs, bcryptjs, next, next-auth, dependencies, animejs, bcryptjs, next (+13 more)

### Community 11 - "authOptions.ts"
Cohesion: 0.11
Nodes (12): formatQuotedAt(), MemoriesPage(), EmergencyBanner(), OpenEvent, applyScale(), FontScale, FontSizeToggle(), OPTIONS (+4 more)

### Community 12 - "main.py"
Cohesion: 0.14
Nodes (21): BaseModel, BytesIO, delete, get, post, delete_enrollment(), enroll(), enrollment_status() (+13 more)

### Community 13 - ".agents/skills/caveman-compress/scripts/validate.py"
Cohesion: 0.06
Nodes (56): benchmark_pair(), count_tokens(), main(), print_table(), Path, main(), print_usage(), backup_dir_for() (+48 more)

### Community 14 - "useConversationEngine.ts"
Cohesion: 0.17
Nodes (12): ConversationLogEntry, ConversationPhase, STREAMING_WS_URL, UseConversationEngineOptions, UseConversationEngineResult, ConversationPersistence, useConversationPersistence(), normalizeGain() (+4 more)

### Community 15 - "enroll/route.ts"
Cohesion: 0.29
Nodes (9): DELETE(), GET(), POST(), POST(), deleteEnrollment(), enrollVoice(), getEnrollmentStatus(), transcribeAudio() (+1 more)

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

### Community 20 - ".continue/skills/caveman-compress/scripts/validate.py"
Cohesion: 0.06
Nodes (56): benchmark_pair(), count_tokens(), main(), print_table(), Path, main(), print_usage(), backup_dir_for() (+48 more)

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

### Community 55 - "authErrorResponse"
Cohesion: 0.22
Nodes (15): DELETE(), GET(), POST(), EmergencyInput, GET(), PATIENT_TRIGGER_TYPES, POST(), GET() (+7 more)

### Community 56 - "prisma"
Cohesion: 0.20
Nodes (11): DELETE(), POST(), GET(), GET(), POST(), todayKeyKst(), POST(), AuthError (+3 more)

### Community 57 - "HistoryView.tsx"
Cohesion: 0.15
Nodes (14): formatDate(), formatTime(), HistorySessionSummary, HistoryTimeline(), HistoryTimelineProps, HistoryView(), HistoryViewProps, SearchHit (+6 more)

### Community 58 - "requirePatientAccess"
Cohesion: 0.15
Nodes (14): GET(), PATCH(), FamilyMemberInput, GET(), POST(), GET(), PlanInput, POST() (+6 more)

### Community 59 - "뉴로케어"
Cohesion: 0.12
Nodes (15): 구조, 뉴로케어 Android (웨이크워드 래퍼), 빌드/실행, 확인된 것 / 확인 안 된 것, 1. Python STT 백엔드 (faster-whisper + edge-tts 폴백), 2. Next.js 앱, 3. 환경 변수, 개발용 테스트 계정 (+7 more)

### Community 60 - "useLinkedPatients"
Cohesion: 0.17
Nodes (14): FamilyPage(), formatDate(), isEnded(), isEndingSoon(), MedicationsPage(), GuardianPage(), FamilyMemberOption, PhotosPage() (+6 more)

### Community 61 - "guardian/page.tsx"
Cohesion: 0.20
Nodes (11): DementiaStageSettingsProps, isActive(), isEndingSoon(), MedicationSummaryCard(), PatientSelectorProps, DEFAULT_WAKE_WORD, WakeWordSettings(), WakeWordSettingsProps (+3 more)

### Community 62 - ".agents/skills/cavecrew/SKILL.md"
Cohesion: 0.14
Nodes (12): cavecrew, Example chaining, How to invoke, Model overrides, See also, What it does, Auto-clarity (inherited), Chaining patterns (+4 more)

### Community 63 - "Caveman Help"
Cohesion: 0.14
Nodes (12): caveman-help, Example output, How to invoke, See also, What it does, Caveman Help, Configure Default Mode, Deactivate (+4 more)

### Community 64 - "family/page.tsx"
Cohesion: 0.22
Nodes (8): FamilyMemberCard(), FamilyMemberSummary, FamilyMessageBoard(), FamilyPlanList(), toDateInput(), FamilySummaryCard(), FamilyTaskChecklist(), PatientSelector()

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
Cohesion: 0.26
Nodes (9): GET(), POST(), DELETE(), GET(), POST(), ALLOWED_TYPES, deletePhoto(), putPhoto() (+1 more)

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

### Community 82 - "medications/route.ts"
Cohesion: 0.27
Nodes (8): DELETE(), MedicationPatch, PATCH(), GET(), MedicationInput, POST(), validate(), serializeReminderTimes()

### Community 83 - "prisma.ts"
Cohesion: 0.24
Nodes (6): PATCH(), PatientPatch, createPrismaClient(), globalForPrisma, isDementiaStage(), prisma

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

## Knowledge Gaps
- **407 isolated node(s):** `ChatMessage`, `PhotoToShow`, `SystemPromptResult`, `PATIENT_TRIGGER_TYPES`, `EmergencyInput` (+402 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authErrorResponse()` connect `authErrorResponse` to `requireGuardianAccess`, `types.ts`, `messages/route.ts`, `medicationReminderDispatcher.ts`, `enroll/route.ts`, `medications/route.ts`, `prisma.ts`, `prisma`, `requirePatientAccess`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `prisma` connect `prisma` to `requireGuardianAccess`, `types.ts`, `messages/route.ts`, `chat/route.ts`, `medicationReminderDispatcher.ts`, `authOptions.ts`, `medications/route.ts`, `prisma.ts`, `authErrorResponse`, `register/route.ts`, `requirePatientAccess`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `useConversationEngine()` connect `useConversationEngine` to `useAudioQueue.ts`, `useBargeIn.ts`, `useConversationEngine.ts`, `turnDetector.ts`, `encodeWav`, `app/page.tsx`, `useStreamingStt.ts`, `useVAD.ts`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `ChatMessage`, `PhotoToShow`, `SystemPromptResult` to the rest of the system?**
  _407 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `requireGuardianAccess` be split into smaller, more focused modules?**
  _Cohesion score 0.14855072463768115 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1310483870967742 - nodes in this community are weakly interconnected._
- **Should `WakeWordService` be split into smaller, more focused modules?**
  _Cohesion score 0.07138047138047138 - nodes in this community are weakly interconnected._