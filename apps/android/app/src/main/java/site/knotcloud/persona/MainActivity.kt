package site.knotcloud.persona

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.navigation.compose.*
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.padding
import site.knotcloud.persona.data.*
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

class MainActivity : ComponentActivity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    try {
      val session = Session(TokenStore(this))
      val api = createMobileApi(session)
      val calendar = CalendarViewModel(CalendarRepository(this, api))
      val persona = PersonaViewModel(session, api, CalendarRepository(this, api))
      WorkManager.getInstance(this).enqueue(OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())
      val shared = intent?.getStringExtra(Intent.EXTRA_TEXT)
      setContent { PersonaApp(persona, calendar, shared) }
    } catch (error: Throwable) {
      Log.e("Persona", "startup failed", error)
      setContent { MaterialTheme { Text("Persona 启动失败，请查看日志", modifier = androidx.compose.ui.Modifier.padding(24.dp)) } }
    }
  }
}

@Composable fun PersonaApp(persona: PersonaViewModel, calendar: CalendarViewModel, sharedText: String? = null) {
  val nav = rememberNavController()
  val paired by persona.paired.collectAsState()
  if (!paired) { PairingScreen(persona); return }
  MaterialTheme {
    Scaffold(
      bottomBar = {
        NavigationBar {
          listOf("calendar" to "日历", "chat" to "AI", "capture" to "速记", "settings" to "设置").forEach { (route, label) ->
            NavigationBarItem(selected = false, onClick = { nav.navigate(route) }, icon = {}, label = { Text(label) })
          }
        }
      },
      content = { innerPadding ->
        NavHost(nav, startDestination = "calendar", modifier = androidx.compose.ui.Modifier.padding(innerPadding)) {
          composable("calendar") { CalendarScreen(calendar) }
          composable("chat") { ChatScreen(persona) }
          composable("capture") { CaptureScreen(persona, sharedText) }
          composable("settings") { SettingsScreen(persona) }
        }
      },
    )
  }
}

@Composable private fun PairingScreen(viewModel: PersonaViewModel) {
  var code by rememberSaveable { mutableStateOf("") }
  val error by viewModel.error.collectAsState()
  androidx.compose.foundation.layout.Column(modifier = androidx.compose.ui.Modifier.padding(24.dp)) {
    Text("连接 Persona", style = MaterialTheme.typography.headlineMedium)
    Text("请在网页设置的“移动设备”页面生成配对码")
    androidx.compose.material3.OutlinedTextField(code, { code = it }, label = { Text("一次性配对码") })
    Button(onClick = { viewModel.pair(code) }, enabled = code.isNotBlank()) { Text("配对") }
    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
  }
}

@Composable private fun ChatScreen(viewModel: PersonaViewModel) {
  var text by rememberSaveable { mutableStateOf("") }; val lines by viewModel.chat.collectAsState()
  androidx.compose.foundation.layout.Column(modifier = androidx.compose.ui.Modifier.padding(16.dp)) {
    androidx.compose.foundation.lazy.LazyColumn(modifier = androidx.compose.ui.Modifier.weight(1f)) { items(lines.size) { i -> Text(if (lines[i].fromUser) "我：${lines[i].text}" else "Persona：${lines[i].text}", modifier = androidx.compose.ui.Modifier.padding(6.dp)) } }
    androidx.compose.foundation.layout.Row { androidx.compose.material3.OutlinedTextField(text, { text = it }, modifier = androidx.compose.ui.Modifier.weight(1f), label = { Text("说点什么") }); Button(onClick = { viewModel.sendChat(text); text = "" }, enabled = text.isNotBlank()) { Text("发送") } }
  }
}

@Composable private fun CaptureScreen(viewModel: PersonaViewModel, sharedText: String?) {
  var text by rememberSaveable { mutableStateOf(sharedText ?: "") }; var type by rememberSaveable { mutableStateOf("note") }; val saved by viewModel.captures.collectAsState()
  androidx.compose.foundation.layout.Column(modifier = androidx.compose.ui.Modifier.padding(24.dp)) { Text("快速记录", style = MaterialTheme.typography.headlineMedium); androidx.compose.material3.OutlinedTextField(text, { text = it }, modifier = androidx.compose.ui.Modifier.weight(1f, false), label = { Text("内容") }); androidx.compose.foundation.layout.Row { listOf("note" to "笔记", "idea" to "想法", "journal" to "日记").forEach { (value, label) -> FilterChip(selected = type == value, onClick = { type = value }, label = { Text(label) }, modifier = androidx.compose.ui.Modifier.padding(end = 4.dp)) } }; Button(onClick = { viewModel.saveCapture(type, text); text = "" }, enabled = text.isNotBlank()) { Text("保存") }; saved.take(3).forEach { Text("已保存：$it") } }
}

@Composable private fun SettingsScreen(viewModel: PersonaViewModel) { androidx.compose.foundation.layout.Column(modifier = androidx.compose.ui.Modifier.padding(24.dp)) { Text("设置", style = MaterialTheme.typography.headlineMedium); Button(onClick = viewModel::logout) { Text("退出登录") } } }

@Composable private fun CalendarScreen(viewModel: CalendarViewModel) {
  val events by viewModel.events.collectAsState()
  LaunchedEffect(Unit) { viewModel.refresh("2026-01-01", "2027-01-01") }
  androidx.compose.foundation.lazy.LazyColumn(modifier = androidx.compose.ui.Modifier.padding(24.dp)) {
    item { Text("日历", style = MaterialTheme.typography.headlineMedium) }
    if (events.isEmpty()) item { Text("暂无缓存日程或尚未完成配对") }
    items(events.size) { index -> Text(events[index].title, modifier = androidx.compose.ui.Modifier.padding(vertical = 8.dp)) }
  }
}
