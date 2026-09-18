package site.knotcloud.persona

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val LightColors = lightColorScheme(
  primary = Color(0xFF4E674C), onPrimary = Color.White,
  primaryContainer = Color(0xFFDCE4D4), onPrimaryContainer = Color(0xFF20301F),
  secondary = Color(0xFFB45D3A), onSecondary = Color.White,
  background = Color(0xFFF7F1E8), onBackground = Color(0xFF232821),
  surface = Color(0xFFFFFAF3), onSurface = Color(0xFF232821),
  surfaceVariant = Color(0xFFECE5DA), onSurfaceVariant = Color(0xFF62685F),
  outline = Color(0xFFB9B2A7),
)

private val DarkColors = darkColorScheme(
  primary = Color(0xFFAFC89A), onPrimary = Color(0xFF1C2A19),
  primaryContainer = Color(0xFF344431), onPrimaryContainer = Color(0xFFDCE9D3),
  secondary = Color(0xFFE49A78), onSecondary = Color(0xFF3A1609),
  background = Color(0xFF111411), onBackground = Color(0xFFF4EBDD),
  surface = Color(0xFF1A1E1A), onSurface = Color(0xFFF4EBDD),
  surfaceVariant = Color(0xFF262B26), onSurfaceVariant = Color(0xFFC7C8BF),
  outline = Color(0xFF777D73),
)

private val PersonaTypography = androidx.compose.material3.Typography(
  displaySmall = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, fontSize = 38.sp, lineHeight = 44.sp),
  headlineLarge = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, fontSize = 32.sp, lineHeight = 38.sp),
  headlineMedium = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, fontSize = 27.sp, lineHeight = 34.sp),
  titleLarge = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium, fontSize = 22.sp, lineHeight = 28.sp),
  titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
  bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
  bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
  labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
)

@Composable
fun PersonaTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
    typography = PersonaTypography,
    content = content,
  )
}
