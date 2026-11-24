plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.iris.assistant"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.iris.assistant"
        minSdk = 26
        // 갤럭시 노트20(안드로이드 13)에 맞춤
        targetSdk = 33
        versionCode = 1
        versionName = "1.0"
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging {
        resources {
            excludes += listOf(
                "META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*",
                "META-INF/INDEX.LIST", "META-INF/*.kotlin_module", "META-INF/versions/**",
                "META-INF/FastDoubleParser-*",
            )
        }
    }
}

dependencies {
    implementation("com.anthropic:anthropic-java:3.13.0")
    implementation("com.alphacephei:vosk-android:0.3.47")
    implementation("net.java.dev.jna:jna:5.13.0@aar")
}
