# Neurocare

Neurocare is an AI companion and guardian dashboard for older patients and their families. The patient app focuses on voice-first conversation, memory recall, medication/calendar support, wake-word entry, and emergency escalation. The guardian app focuses on linked-patient monitoring, family memories, medication schedules, photos, push notifications, and SOS acknowledgement.

## Current Release

- Web app: Next.js 16 / React 19
- Android version: `2.21`
- Patient package: `com.neurocare.app.patient`
- Guardian package: `com.neurocare.app.guardian`
- Android artifacts: [artifacts/android](artifacts/android)

Release highlights in `2.21`:

- Patient SOS button and voice-distress phrases such as "살려줘", "도와줘", and "119 불러" create emergency events for linked guardians.
- Guardian web screens no longer depend on a top banner tap. Open SOS events redirect straight to the full emergency detail screen.
- Guardian Android app polls open SOS events while active and launches the native full-screen emergency activity immediately.
- Realtime and regular chat distress checks now await emergency dispatch so the event is not lost after a fast serverless response.
- Calendar sync for the Android WebView runs more frequently while the app is visible.

## Main Features

- Voice conversation: WebRTC realtime voice pipeline, VAD, interruption handling, TTS playback, and conversation persistence.
- Memory recall: family memories, photos, prior conversation turns, and Pinecone/Upstage embeddings when configured.
- Guardian dashboard: linked-patient overview, medication management, family plans, message board, photos, mood summaries, and wake-word settings.
- Emergency flow: manual SOS, voice-distress detection, mood-critical alerts, push/SMS fallback, guardian acknowledgement, and full-screen Android alert surface.
- Android WebView wrapper: patient and guardian product flavors share the same native shell and load different app start paths.

## Repository Layout

```text
app/                  Next.js app routes and API endpoints
components/           Shared patient and guardian UI components
hooks/                Voice conversation, realtime, VAD, audio, and patient-link hooks
lib/                  Auth, guardian notifications, memory, calendar, TTS, audio, and DB helpers
prisma/               Prisma schema, migrations, and seed data
server/               FastAPI STT/TTS/speaker backend
android/              Native Android WebView wrapper with patient/guardian flavors
artifacts/android/    Built APKs and install notes
docs/superpowers/     Design specs and implementation plans
```

## Local Setup

Install Node dependencies:

```bash
npm install
```

Prepare environment variables:

```bash
cp .env.local.example .env.local
```

Required values:

- `AUTH_SECRET`
- `DATABASE_URL`
- `UPSTAGE_API_KEY`

Optional values:

- `PINECONE_API_KEY`
- `PINECONE_INDEX`
- `NCP_CLOVA_CLIENT_ID`
- `NCP_CLOVA_CLIENT_SECRET`
- `GUARDIAN_APP_URL`
- Web Push, Twilio, Resend, and Blob credentials for production notifications/storage

Run database migrations and seed local test accounts:

```bash
npx prisma migrate dev
npx prisma db seed
```

Start the web app:

```bash
npm run dev
```

Default seed accounts:

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Patient | `patient@test.local` | `test1234` | Invite code `NEURO-1234` |
| Guardian | `guardian@test.local` | `test1234` | Link with the patient invite code |

## STT Backend

The FastAPI backend provides `/transcribe`, `/tts`, and speaker enrollment endpoints.

```bash
uv venv --python 3.11 server/.venv
uv pip install --python server/.venv -r server/requirements.txt
cd server
.venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

Speaker enrollment dependencies are optional and heavier:

```bash
uv pip install --python server/.venv torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python server/.venv --no-deps -r server/requirements-speaker.txt
```

## Android

Build both app flavors:

```bash
cd android
.\gradlew.bat :app:assemblePatientDebug :app:assembleGuardianDebug
```

Generated APKs:

- `android/app/build/outputs/apk/patient/debug/app-patient-debug.apk`
- `android/app/build/outputs/apk/guardian/debug/app-guardian-debug.apk`

Release copies are stored in [artifacts/android](artifacts/android):

- `neurocare-patient-v2.21.apk`
- `neurocare-guardian-v2.21.apk`

The Android wrapper uses `BuildConfig.WEBAPP_BASE_URL` for the deployed Next.js app and `BuildConfig.BACKEND_HTTP_BASE` for the STT backend. Update those values in [android/app/build.gradle.kts](android/app/build.gradle.kts) when changing deployment targets.

## Verification

Useful checks before release:

```bash
npm run lint
cd android
.\gradlew.bat :app:compileGuardianDebugKotlin :app:compilePatientDebugKotlin
.\gradlew.bat :app:assemblePatientDebug :app:assembleGuardianDebug
```

Known lint state: `components/DogMascot.tsx` currently warns about using `<img>` instead of Next `<Image />`.

## Emergency Behavior

Patient-side triggers:

- Manual SOS button posts `manual_button`.
- Realtime speech transcripts post to `/api/realtime/distress-check`.
- Regular chat calls the same voice-distress detector before generating the response.
- Session timeout can post `session_timeout` after a check-in grace period.

Guardian-side handling:

- `/api/emergency` returns linked patients' open emergency events.
- Guardian web layout redirects to `/guardian/emergency/{eventId}` when an open SOS exists.
- Guardian Android flavor polls `/api/emergency` with the WebView session cookie and opens `EmergencyAlertActivity` full-screen.
- Push remains available as a fallback channel, and SMS fallback runs if an open event is not acknowledged within the configured timeout.
