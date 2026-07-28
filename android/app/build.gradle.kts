plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.neurocare.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.neurocare.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // 개발용 기본값 - 실제 기기에서는 설정 화면 등으로 바꿀 수 있게 추후 확장.
        // 에뮬레이터의 10.0.2.2는 호스트 PC의 127.0.0.1을 가리키는 특수 별칭이다.
        // 실기기 배포용 LAN 주소. 에뮬레이터로 되돌리려면 10.0.2.2 로 바꾼다.
        // WebView의 마이크(getUserMedia)는 보안 컨텍스트에서만 동작하므로 웹앱은 반드시 https다.
        // (Next.js `--experimental-https`가 만든 자체서명 인증서 — MainActivity에서 이 호스트만 예외 처리)
        buildConfigField("String", "BACKEND_HTTP_BASE", "\"http://192.168.219.103:8000\"")
        buildConfigField("String", "WEBAPP_BASE_URL", "\"https://192.168.219.103:3000\"")
        buildConfigField("String", "WAKE_WORD_LABEL", "\"복실아\"")
        // 태블릿 1대 = 환자 1명 전제. 이 기기에서 등록된 성문의 ID.
        buildConfigField("String", "SPEAKER_ID", "\"device\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation("androidx.webkit:webkit:1.12.1")
    implementation(libs.material)
    implementation(libs.onnxruntime.android)
    implementation(libs.okhttp)
}
