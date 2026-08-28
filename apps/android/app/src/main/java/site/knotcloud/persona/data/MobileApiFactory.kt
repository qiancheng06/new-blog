package site.knotcloud.persona.data

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import site.knotcloud.persona.BuildConfig

class Session(private val tokens: TokenStore) {
  fun accessToken(): String? = tokens.get("accessToken")
  fun save(value: TokenResponse) { tokens.put("deviceId", value.deviceId); tokens.put("accessToken", value.accessToken); tokens.put("refreshToken", value.refreshToken); tokens.put("accessExpiresAt", value.accessExpiresAt); tokens.put("refreshExpiresAt", value.refreshExpiresAt) }
  fun clear() = tokens.clear()
}

fun createMobileApi(session: Session): MobileApi {
  val auth = Interceptor { chain ->
    val request = chain.request().newBuilder().apply { session.accessToken()?.let { header("Authorization", "Bearer $it") } }.build()
    chain.proceed(request)
  }
  val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
  val client = OkHttpClient.Builder().addInterceptor(auth).build()
  return Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL).client(client).addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(MobileApi::class.java)
}
