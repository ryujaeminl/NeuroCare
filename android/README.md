# 뉴로케어 Android (웨이크워드 래퍼)

웹앱(`../app`, `../server`)은 그대로 두고, "폰이 잠겨있거나 앱이 꺼져 있어도 이름을 부르면
앱이 켜지는" 동작만 네이티브로 추가한 프로젝트다. 실제 대화 화면은 새로 만들지 않고
WebView로 기존 Next.js 앱을 그대로 띄운다.

## 구조

- `MainActivity` — WebView 1개로 구성. `BuildConfig.WEBAPP_BASE_URL`을 로드하고, 페이지가
  마이크를 요청하면(getUserMedia) RECORD_AUDIO 권한을 확인해 허용한다. 화면에 떠 있는
  동안은 `WakeWordService.isAppInForeground = true`로 표시해 서비스의 마이크 사용과
  겹치지 않게 한다.
- `wakeword/WakeWordService` — 포그라운드 서비스. 앱이 화면에 없을 때 계속 마이크를 듣다가
  (`AudioCapture` + `SileroVad` + `SpeechSegmenter`로 발화 구간만 추출), 발화가 끝나면
  `WhisperClient`로 FastAPI `/transcribe`에 직접 전사를 요청하고, 결과에
  `BuildConfig.WAKE_WORD_LABEL`이 포함되면 `MainActivity`를 깨운다.
- `wakeword/SileroVad` — `assets/silero_vad_legacy.onnx`(웹의 `public/vad/`와 동일한 파일)를
  onnxruntime-android로 추론한다. 프레임 크기(1536, 96ms)와 threshold/redemption 값은
  웹의 `hooks/useVAD.ts` 설정을 그대로 옮겼다.

## 빌드/실행

Android Studio의 내장 JBR(OpenJDK 21)을 쓰도록 `gradle.properties`의
`org.gradle.java.home`이 고정 경로로 지정되어 있다 - 다른 PC에서 쓰려면 이 값을 수정한다.

```bash
./gradlew assembleDebug
```

에뮬레이터(예: `Pixel_10` AVD)에서 테스트:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell pm grant com.neurocare.app android.permission.RECORD_AUDIO
adb shell pm grant com.neurocare.app android.permission.POST_NOTIFICATIONS
adb shell am start -n com.neurocare.app/.MainActivity
```

`app/build.gradle.kts`의 `BACKEND_HTTP_BASE`/`WEBAPP_BASE_URL`은 에뮬레이터 전용 특수
별칭인 `10.0.2.2`(호스트 PC의 127.0.0.1)를 가리킨다. 실행 전에 호스트에서 두 서버가 떠
있어야 한다:

```bash
# 리포지토리 루트에서
cd server && .venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
npm run dev   # Next.js, 127.0.0.1:3000
```

## 확인된 것 / 확인 안 된 것

- ✅ Gradle 빌드, APK 설치, 앱 실행, WebView가 기존 웹앱(대시보드 전체)을 정상 렌더링
- ✅ 포그라운드 서비스가 알림과 함께 계속 떠 있고, 앱을 백그라운드로 보내도(홈 버튼) 죽지 않음
- ✅ onnxruntime-android가 `silero_vad_legacy.onnx`를 크래시 없이 로드
- ⚠️ **실제 목소리로 "이름을 불러서 깨어나는지"는 이 에뮬레이터 환경에서 검증하지 못했다** —
  헤드리스 에뮬레이터의 가상 마이크가 무음/저잡음만 들어와 VAD 임계값을 넘는 발화가 없었다.
  실제 기기나 마이크 입력이 연결된 에뮬레이터에서 직접 "OO야"라고 불러보며 확인해야 한다.
- 실기기 배포 시: 서버를 `0.0.0.0`으로 바인딩하고 PC 방화벽에서 포트를 열어야 폰이 Wi-Fi로
  접근 가능하다(지금은 개발 PC 로컬 전용 구성).
