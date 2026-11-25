plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.instafav.app"
    compileSdk = 35

    signingConfigs {
        create("fixed") {
            storeFile = file("instafav.keystore")
            storePassword = "instafav1234"
            keyAlias = "instafav"
            keyPassword = "instafav1234"
        }
    }

    defaultConfig {
        applicationId = "com.instafav.app"
        minSdk = 24
        targetSdk = 35
        val runNum = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 0
        versionCode = 10 + runNum
        versionName = if (runNum > 0) "1.3.$runNum" else "1.3"
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("fixed")
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("fixed")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
