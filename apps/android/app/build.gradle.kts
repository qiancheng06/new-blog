plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  id("org.jetbrains.kotlin.plugin.serialization")
}

android { namespace = "site.knotcloud.persona"; compileSdk = 35
  defaultConfig { applicationId = "site.knotcloud.persona"; minSdk = 26; targetSdk = 35; versionCode = 2; versionName = "0.2.0" }
  buildTypes { release { isMinifyEnabled = false; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") } }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
  buildFeatures { compose = true; buildConfig = true }
  buildTypes.configureEach {
    // Emulator reaches the host loopback as 10.0.2.2. Real devices on LAN should
    // point this at the workstation IP running Persona API :3001.
    buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3001/\"")
  }
}

dependencies {
  implementation(platform("androidx.compose:compose-bom:2025.01.00"))
  implementation("androidx.activity:activity-compose:1.10.1")
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.material:material-icons-extended")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.navigation:navigation-compose:2.8.7")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
  implementation("androidx.work:work-runtime-ktx:2.10.0")
  implementation("com.squareup.retrofit2:retrofit:2.11.0")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("com.squareup.retrofit2:converter-kotlinx-serialization:2.11.0")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}

// The current Android demo is Kotlin-only. On this Windows host, the otherwise
// empty Javac task cannot reopen AGP's generated R.jar, so skip that task.
tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
  enabled = false
}
