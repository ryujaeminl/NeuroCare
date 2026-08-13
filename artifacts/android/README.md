# Android Install Files

Current Android release: `2.21`

## APKs

- `neurocare-patient-v2.21.apk`: patient app, package `com.neurocare.app.patient`
- `neurocare-guardian-v2.21.apk`: guardian app, package `com.neurocare.app.guardian`

Both files are debug-signed and can be installed directly for testing. Android may require enabling installation from the source used to download the APK.

## Install

```powershell
adb install -r neurocare-patient-v2.21.apk
adb install -r neurocare-guardian-v2.21.apk
```

The guardian app opens full-screen SOS alerts for linked patients. The patient app creates emergency events from the SOS button and distress phrases.
