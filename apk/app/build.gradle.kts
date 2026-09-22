plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.min.journal"
    compileSdk = 35

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    signingConfigs {
        create("studyUpdate") {
            storeFile = rootProject.file("study-update.jks")
            storePassword = "studyupdate2026"
            keyAlias = "study"
            keyPassword = "studyupdate2026"
        }
    }

    defaultConfig {
        applicationId = "com.min.journal"
        minSdk = 26
        targetSdk = 35
        versionCode = 13
        versionName = "1.13"
    }

    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("studyUpdate") }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("studyUpdate")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.browser:browser:1.8.0")
}
