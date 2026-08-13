# Neurocare Android

This directory contains the native Android WebView wrapper for Neurocare. The web app remains the main product surface; Android adds product flavors, permissions, wake-word support, calendar sync, and native emergency alert surfaces.

## Flavors

- `patient`: package `com.neurocare.app.patient`, starts at `/patient`
- `guardian`: package `com.neurocare.app.guardian`, starts at `/guardian`

Both flavors share `MainActivity` and use `BuildConfig.WEBAPP_BASE_URL` for the deployed Next.js app.

## Build

From this directory:

```powershell
.\gradlew.bat :app:assemblePatientDebug :app:assembleGuardianDebug
```

Generated APKs:

- `app/build/outputs/apk/patient/debug/app-patient-debug.apk`
- `app/build/outputs/apk/guardian/debug/app-guardian-debug.apk`

Kotlin compile checks:

```powershell
.\gradlew.bat :app:compilePatientDebugKotlin :app:compileGuardianDebugKotlin
```

## Install

```powershell
adb install -r app/build/outputs/apk/patient/debug/app-patient-debug.apk
adb install -r app/build/outputs/apk/guardian/debug/app-guardian-debug.apk
```

Android may require enabling installation from the source used to download the APK.

## Runtime Notes

- `BACKEND_HTTP_BASE` points to the STT/TTS backend.
- `WEBAPP_BASE_URL` points to the deployed Next.js app.
- `WAKE_WORD_LABEL` is the patient wake-word label.
- The guardian flavor polls `/api/emergency` while active and opens `EmergencyAlertActivity` full-screen for open SOS events.
- The patient flavor keeps wake-word and voice conversation behavior active through the shared native shell.

Update release artifacts in `../artifacts/android` after each version bump.
