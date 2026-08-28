package site.knotcloud.persona.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.content.Context
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

class TokenStore(context: Context) {
  private val alias = "persona-mobile-token-key"
  private val keyStore get() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  fun put(key: String, value: String) {
    val ks = keyStore; if (!ks.containsAlias(alias)) KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()) }.generateKey()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, ks.getKey(alias, null)); val encrypted = cipher.doFinal(value.toByteArray()); val encoded = Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
    // The encrypted value belongs in app-private storage; the key never leaves Keystore.
    preferences.edit().putString(key, encoded).apply()
  }
  fun get(key: String): String? = preferences.getString(key, null)?.let { encoded -> val raw = Base64.decode(encoded, Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, keyStore.getKey(alias, null), GCMParameterSpec(128, raw.copyOfRange(0, 12))); String(cipher.doFinal(raw.copyOfRange(12, raw.size))) }
  fun clear() { preferences.edit().clear().apply() }
  private val preferences = context.applicationContext.getSharedPreferences("persona_secure_tokens", Context.MODE_PRIVATE)
}
