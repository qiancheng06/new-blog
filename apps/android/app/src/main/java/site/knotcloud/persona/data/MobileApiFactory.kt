package site.knotcloud.persona.data

import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import site.knotcloud.persona.BuildConfig
import java.util.concurrent.TimeUnit

class Session(private val tokens: TokenStore) {
  fun accessToken(): String? = tokens.get("accessToken")
  fun refreshToken(): String? = tokens.get("refreshToken")
  fun deviceId(): String? = tokens.get("deviceId")
  fun isPaired(): Boolean = !accessToken().isNullOrBlank() && !refreshToken().isNullOrBlank()
  fun save(value: TokenResponse) {
    tokens.put("deviceId", value.deviceId)
    tokens.put("accessToken", value.accessToken)
    tokens.put("refreshToken", value.refreshToken)
    tokens.put("accessExpiresAt", value.accessExpiresAt)
    tokens.put("refreshExpiresAt", value.refreshExpiresAt)
  }
  fun clear() = tokens.clear()
}

class TokenAuthenticator(private val session: Session, private val refreshApi: MobileApi) : Authenticator {
  override fun authenticate(route: okhttp3.Route?, response: Response): Request? {
    if (responseCount(response) >= 2) return null
    val refresh = session.refreshToken() ?: return null
    val refreshed = try {
      // Authenticator is blocking; call the suspend endpoint via runBlocking.
      kotlinx.coroutines.runBlocking { refreshApi.refresh(RefreshRequest(refresh)) }
    } catch (_: Exception) {
      null
    } ?: return null
    session.save(refreshed)
    return response.request.newBuilder().header("Authorization", "Bearer ${refreshed.accessToken}").build()
  }

  private fun responseCount(response: Response): Int {
    var count = 1
    var prior = response.priorResponse
    while (prior != null) { count += 1; prior = prior.priorResponse }
    return count
  }
}

fun createJson(): Json = Json { ignoreUnknownKeys = true; explicitNulls = false }

fun createMobileApi(session: Session, authenticatorEnabled: Boolean = true): MobileApi {
  val json = createJson()
  val contentType = "application/json".toMediaType()
  val auth = Interceptor { chain ->
    val request = chain.request().newBuilder().apply {
      session.accessToken()?.let { header("Authorization", "Bearer $it") }
    }.build()
    chain.proceed(request)
  }
  val clientBuilder = OkHttpClient.Builder()
    .addInterceptor(auth)
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(40, TimeUnit.SECONDS)
    .writeTimeout(40, TimeUnit.SECONDS)
  if (authenticatorEnabled) {
    val refreshRetrofit = Retrofit.Builder()
      .baseUrl(BuildConfig.API_BASE_URL)
      .client(OkHttpClient.Builder().build())
      .addConverterFactory(json.asConverterFactory(contentType))
      .build()
      .create(MobileApi::class.java)
    clientBuilder.authenticator(TokenAuthenticator(session, refreshRetrofit))
  }
  return Retrofit.Builder()
    .baseUrl(BuildConfig.API_BASE_URL)
    .client(clientBuilder.build())
    .addConverterFactory(json.asConverterFactory(contentType))
    .build()
    .create(MobileApi::class.java)
}

fun createPairingApi(): MobileApi {
  val json = createJson()
  return Retrofit.Builder()
    .baseUrl(BuildConfig.API_BASE_URL)
    .client(OkHttpClient.Builder().build())
    .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
    .build()
    .create(MobileApi::class.java)
}
