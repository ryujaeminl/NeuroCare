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
        versionCode = 3
        versionName = "1.2"

        // 배포된 Vercel 사이트 + Railway에 상시 구동 중인 STT 백엔드(server/Dockerfile).
        // 더 이상 로컬 PC/터널에 의존하지 않는다. LAN 개발로 되돌리려면 192.168.x/10.0.2.2로.
        buildConfigField("String", "BACKEND_HTTP_BASE", "\"https://neurocare-stt-production.up.railway.app\"")
        buildConfigField("String", "WEBAPP_BASE_URL", "\"https://neuro-care-sand.vercel.app\"")
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
