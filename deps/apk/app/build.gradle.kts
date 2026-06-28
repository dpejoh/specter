plugins {
    id("com.android.application")
}

val secrets = rootProject.file("secrets.properties")
val hasSecrets = secrets.exists()
val storePass = if (hasSecrets) secrets.readText().lineSequence()
    .find { it.startsWith("storePassword=") }?.substringAfter("=")?.trim() ?: "" else ""
val keyPass = if (hasSecrets) secrets.readText().lineSequence()
    .find { it.startsWith("keyPassword=") }?.substringAfter("=")?.trim() ?: "" else ""
val alias = if (hasSecrets) secrets.readText().lineSequence()
    .find { it.startsWith("keyAlias=") }?.substringAfter("=")?.trim() ?: "release" else "release"

android {
    namespace = "com.dpejoh.specter"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dpejoh.specter"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file("release.jks")
            storePassword = storePass
            keyAlias = alias
            keyPassword = keyPass
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
