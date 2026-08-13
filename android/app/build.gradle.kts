plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.neurocare.guardian"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.neurocare.guardian"
        minSdk = 26
        targetSdk = 34
        versionCode = 21
        versionName = "2.21"

        buildConfigField("String", "WEBAPP_BASE_URL", "\"https://neurocare-care.vercel.app\"")
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
    implementation(libs.material)
}
