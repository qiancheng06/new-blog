package site.knotcloud.persona

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.*
import site.knotcloud.persona.data.*
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

class MainActivity : ComponentActivity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    try {
      val sharedText = intent?.getStringExtra(Intent.EXTRA_TEXT)
      setContent {
        PersonaTheme {
          val context = LocalContext.current
          val persona: PersonaViewModel = viewModel(factory = PersonaViewModel.factory(context))
          val session = remember { Session(TokenStore(context.applicationContext)) }
          val calendarRepo = remember {
            CalendarRepository(context.applicationContext) {
              if (session.isPaired()) createMobileApi(session) else null
            }
          }
          val calendar: CalendarViewModel = viewModel(factory = remember(calendarRepo) {
            object : androidx.lifecycle.ViewModelProvider.Factory {
              @Suppress("UNCHECKED_CAST")
              override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
                CalendarViewModel(calendarRepo) as T
            }
          })
          LaunchedEffect(Unit) {
            if (session.isPaired()) {
              calendar.refresh()
              SyncWorker.enqueue(context.applicationContext)
            }
          }
          PersonaApp(persona, calendar, sharedText)
        }
      }
    } catch (error: Throwable) {
      Log.e("Persona", "startup failed", error)
      setContent {
        PersonaTheme {
          Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Persona 启动失败，请查看日志", modifier = Modifier.padding(24.dp))
          }
        }
      }
    }
  }
}

private data class Destination(val route: String, val label: String, val icon: ImageVector)

private val destinations = listOf(
  Destination("today", "Today", Icons.Outlined.Today),
  Destination("tools", "Tools", Icons.Outlined.Build),
  Destination("chat", "Chat", Icons.Outlined.ChatBubbleOutline),
  Destination("settings", "Settings", Icons.Outlined.Settings),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonaApp(persona: PersonaViewModel, calendar: CalendarViewModel, sharedText: String? = null) {
  val nav = rememberNavController()
  val currentRoute = nav.currentBackStackEntryAsState().value?.destination?.route ?: "today"
  var captureOpen by rememberSaveable { mutableStateOf(!sharedText.isNullOrBlank()) }
  val personaState by persona.state.collectAsState()

  LaunchedEffect(personaState.captureSaved) {
    if (personaState.captureSaved) {
      // Sheet closes after save; clear flag so it can reopen cleanly.
      persona.clearError()
    }
  }

  Scaffold(
    containerColor = MaterialTheme.colorScheme.background,
    bottomBar = {
      PersonaBottomBar(
        selectedRoute = currentRoute,
        onNavigate = { route ->
          nav.navigate(route) {
            popUpTo("today") { saveState = true }
            launchSingleTop = true
            restoreState = true
          }
        },
        onCapture = { captureOpen = true },
      )
    },
  ) { padding ->
    NavHost(navController = nav, startDestination = "today", modifier = Modifier.padding(padding)) {
      composable("today") { TodayScreen(calendar) }
      composable("tools") { ToolsScreen() }
      composable("chat") { ChatScreen(persona) }
      composable("settings") { SettingsScreen(persona) }
    }
  }

  if (captureOpen) {
    ModalBottomSheet(
      onDismissRequest = { captureOpen = false },
      sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
      containerColor = MaterialTheme.colorScheme.surface,
    ) {
      CaptureSheet(persona, sharedText.orEmpty()) { captureOpen = false }
    }
  }
}

@Composable
private fun PersonaBottomBar(selectedRoute: String, onNavigate: (String) -> Unit, onCapture: () -> Unit) {
  NavigationBar(
    modifier = Modifier.navigationBarsPadding(),
    containerColor = MaterialTheme.colorScheme.surface,
    tonalElevation = 3.dp,
  ) {
    destinations.take(2).forEach { destination ->
      NavigationBarItem(
        selected = selectedRoute == destination.route,
        onClick = { onNavigate(destination.route) },
        icon = { Icon(destination.icon, contentDescription = null) },
        label = { Text(destination.label) },
      )
    }
    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
      FloatingActionButton(
        onClick = onCapture,
        modifier = Modifier.offset(y = (-10).dp).size(58.dp),
        shape = CircleShape,
        containerColor = MaterialTheme.colorScheme.primary,
      ) {
        Icon(Icons.Outlined.Add, contentDescription = "快速记录", modifier = Modifier.size(28.dp))
      }
    }
    destinations.drop(2).forEach { destination ->
      NavigationBarItem(
        selected = selectedRoute == destination.route,
        onClick = { onNavigate(destination.route) },
        icon = { Icon(destination.icon, contentDescription = null) },
        label = { Text(destination.label) },
      )
    }
  }
}

private data class AgendaItem(val title: String, val time: String, val accent: Color, val completed: Boolean = false)

@Composable
private fun TodayScreen(calendar: CalendarViewModel) {
  var selectedDate by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
  val selected = LocalDate.parse(selectedDate)
  val events by calendar.events.collectAsState()
  val uiState by calendar.state.collectAsState()

  val dayEvents = events.filter { event ->
    val day = event.start.take(10)
    day == selected.toString() || (event.start.isEmpty() && selected == LocalDate.now())
  }
  val agenda = if (dayEvents.isNotEmpty()) {
    dayEvents.map { event ->
      AgendaItem(
        title = event.title,
        time = formatEventTime(event),
        accent = MaterialTheme.colorScheme.primary,
        completed = event.completed,
      )
    }
  } else {
    listOf(
      AgendaItem("整理 Android 页面结构", "09:30", MaterialTheme.colorScheme.primary),
      AgendaItem("下午例会", "14:30", MaterialTheme.colorScheme.secondary),
      AgendaItem("晚间复盘", "20:30", MaterialTheme.colorScheme.tertiary),
    )
  }
  val sourceLabel = when {
    dayEvents.isNotEmpty() -> "日历事件"
    uiState is CalendarUiState.Live -> "今日暂无事件"
    else -> "示例内容"
  }

  LaunchedEffect(selectedDate) {
    // Keep cache warm when user browses the week strip.
    if (events.isEmpty() && uiState !is CalendarUiState.Demo) calendar.refresh()
  }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 28.dp),
    verticalArrangement = Arrangement.spacedBy(18.dp),
  ) {
    item {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
          Text("Today", style = MaterialTheme.typography.headlineLarge)
          Text(
            selected.format(DateTimeFormatter.ofPattern("M月d日 · EEEE", Locale.SIMPLIFIED_CHINESE)),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
        when (uiState) {
          is CalendarUiState.Live -> StatusBadge("已连接", MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer)
          CalendarUiState.Demo -> StatusBadge("演示数据", MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant)
          CalendarUiState.Loading -> StatusBadge("同步中", MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(48.dp).padding(start = 8.dp)) {
          Box(contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = "Persona", tint = MaterialTheme.colorScheme.primary)
          }
        }
      }
    }
    item { WeekCalendar(selected) { selectedDate = it.toString() } }
    item {
      Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        shape = RoundedCornerShape(22.dp),
      ) {
        Column(Modifier.padding(20.dp)) {
          Text(greeting(), style = MaterialTheme.typography.titleLarge)
          Spacer(Modifier.height(8.dp))
          Text(
            when (uiState) {
              is CalendarUiState.Live -> "今天的安排会随 Persona 日历更新。"
              else -> "今天可以从三件小事开始。"
            },
            color = MaterialTheme.colorScheme.onPrimaryContainer,
          )
        }
      }
    }
    item { SectionHeader("今日重点", sourceLabel) }
    items(agenda.take(3)) { PriorityRow(it) }
    item { SectionHeader("Upcoming", if (agenda.isEmpty()) "暂无安排" else "今日安排") }
    item {
      Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(vertical = 8.dp)) {
          if (agenda.isEmpty()) {
            Text(
              "这一天还没有安排。点中央 + 可以快速记一条。",
              modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          } else {
            agenda.forEachIndexed { index, agendaItem ->
              AgendaRow(agendaItem)
              if (index < agenda.lastIndex) {
                HorizontalDivider(Modifier.padding(start = 76.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
              }
            }
          }
        }
      }
    }
    item {
      Card(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
      ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.Top) {
          Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
          Spacer(Modifier.width(14.dp))
          Column {
            Text("Persona", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(
              when (uiState) {
                is CalendarUiState.Live -> "日历已与 Persona 同步，改动会写入服务端。"
                else -> "先完成最重要的一件事，再为下午留一点缓冲。"
              },
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
        }
      }
    }
  }
}

@Composable
private fun StatusBadge(text: String, container: Color, onContainer: Color) {
  Surface(shape = RoundedCornerShape(50), color = container) {
    Text(text, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), style = MaterialTheme.typography.labelLarge, color = onContainer)
  }
}

@Composable
private fun WeekCalendar(selectedDate: LocalDate, onSelect: (LocalDate) -> Unit) {
  val monday = selectedDate.minusDays((selectedDate.dayOfWeek.value - DayOfWeek.MONDAY.value).toLong())
  Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
    Column(Modifier.padding(horizontal = 10.dp, vertical = 14.dp)) {
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
          selectedDate.format(DateTimeFormatter.ofPattern("yyyy年 M月", Locale.SIMPLIFIED_CHINESE)),
          style = MaterialTheme.typography.titleMedium,
          modifier = Modifier.weight(1f).padding(start = 8.dp),
        )
        IconButton(onClick = { onSelect(LocalDate.now()) }) {
          Icon(Icons.Outlined.CalendarMonth, contentDescription = "回到今天")
        }
      }
      Spacer(Modifier.height(6.dp))
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        repeat(7) { offset ->
          val day = monday.plusDays(offset.toLong())
          val selected = day == selectedDate
          Column(
            modifier = Modifier.clip(RoundedCornerShape(18.dp))
              .background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent)
              .clickable { onSelect(day) }
              .padding(horizontal = 10.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
          ) {
            Text(
              day.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.SIMPLIFIED_CHINESE),
              style = MaterialTheme.typography.bodyMedium,
              color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
              day.dayOfMonth.toString(), style = MaterialTheme.typography.titleMedium,
              color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            )
          }
        }
      }
    }
  }
}

@Composable
private fun SectionHeader(title: String, action: String?) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
    action?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
  }
}

@Composable
private fun PriorityRow(item: AgendaItem) {
  Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface) {
    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
      Icon(
        if (item.completed) Icons.Outlined.CheckCircle else Icons.Outlined.CheckCircleOutline,
        contentDescription = if (item.completed) "已完成" else "未完成",
        tint = item.accent,
      )
      Spacer(Modifier.width(12.dp))
      Text(
        item.title,
        modifier = Modifier.weight(1f),
        style = MaterialTheme.typography.bodyLarge,
        color = if (item.completed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
      )
      Text(item.time, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
private fun AgendaRow(item: AgendaItem) {
  Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
    Text(item.time, modifier = Modifier.width(54.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
    Box(Modifier.size(10.dp).clip(CircleShape).background(item.accent))
    Spacer(Modifier.width(14.dp))
    Text(item.title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
    Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

@Composable
private fun ToolsScreen() {
  Column(Modifier.fillMaxSize().padding(24.dp)) {
    Text("Tools", style = MaterialTheme.typography.headlineLarge)
    Spacer(Modifier.weight(1f))
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
      Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(72.dp)) {
        Box(contentAlignment = Alignment.Center) {
          Icon(Icons.Outlined.Build, contentDescription = null, modifier = Modifier.size(30.dp), tint = MaterialTheme.colorScheme.primary)
        }
      }
      Spacer(Modifier.height(20.dp))
      Text("工具站正在搭建中", style = MaterialTheme.typography.titleLarge)
      Spacer(Modifier.height(8.dp))
      Text("这里会逐步加入更顺手的个人工具。", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
    Spacer(Modifier.weight(1.4f))
  }
}

@Composable
private fun ChatScreen(viewModel: PersonaViewModel) {
  var text by rememberSaveable { mutableStateOf("") }
  val state by viewModel.state.collectAsState()

  Column(Modifier.fillMaxSize().imePadding()) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
      Column(Modifier.weight(1f)) {
        Text("Persona", style = MaterialTheme.typography.headlineLarge)
        Text(
          if (state.mode == ConnectionMode.Live) "已连接 Persona API" else "本地演示模式",
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(44.dp)) {
        Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
      }
    }
    LazyColumn(
      modifier = Modifier.weight(1f).fillMaxWidth(),
      contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
      reverseLayout = false,
    ) {
      if (state.chat.isEmpty()) {
        item {
          ChatBubble(
            ChatLine(
              false,
              if (state.mode == ConnectionMode.Live) "嗨，今天有什么想聊的吗？" else "嗨，今天有什么想聊的吗？配对后会走 Persona 服务端。",
            ),
          )
        }
      }
      items(state.chat) { ChatBubble(it) }
      if (state.busy) item { Text("Persona 正在思考…", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp)) }
    }
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) }
    Row(
      modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(12.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      OutlinedTextField(
        value = text, onValueChange = { text = it }, modifier = Modifier.weight(1f),
        placeholder = { Text("说点什么…") }, maxLines = 4, shape = RoundedCornerShape(24.dp),
      )
      Spacer(Modifier.width(8.dp))
      IconButton(
        onClick = { val value = text.trim(); if (value.isNotEmpty()) { viewModel.sendChat(value); text = "" } },
        enabled = text.isNotBlank() && !state.busy,
        modifier = Modifier.size(52.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
      ) { Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "发送", tint = MaterialTheme.colorScheme.onPrimary) }
    }
  }
}

@Composable
private fun ChatBubble(line: ChatLine) {
  Row(Modifier.fillMaxWidth(), horizontalArrangement = if (line.fromUser) Arrangement.End else Arrangement.Start) {
    Surface(
      shape = RoundedCornerShape(
        topStart = 20.dp, topEnd = 20.dp,
        bottomStart = if (line.fromUser) 20.dp else 6.dp,
        bottomEnd = if (line.fromUser) 6.dp else 20.dp,
      ),
      color = if (line.fromUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
      modifier = Modifier.fillMaxWidth(0.82f),
    ) {
      Text(
        line.text, modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        color = if (line.fromUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
      )
    }
  }
}

@Composable
private fun CaptureSheet(viewModel: PersonaViewModel, initialText: String, onClose: () -> Unit) {
  var text by rememberSaveable { mutableStateOf(initialText) }
  var type by rememberSaveable { mutableStateOf("note") }
  val state by viewModel.state.collectAsState()

  LaunchedEffect(state.captureSaved) {
    if (state.captureSaved) onClose()
  }

  Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp).padding(bottom = 32.dp)) {
    Text("Write it down", style = MaterialTheme.typography.headlineLarge)
    Text(
      if (state.mode == ConnectionMode.Live) "会写入 Persona Capture。" else "先记下来，之后再慢慢整理。",
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(18.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      listOf("note" to "笔记", "idea" to "想法", "journal" to "日记").forEach { (value, label) ->
        FilterChip(selected = type == value, onClick = { type = value }, label = { Text(label) })
      }
    }
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(
      value = text, onValueChange = { text = it }, modifier = Modifier.fillMaxWidth().height(190.dp),
      placeholder = { Text("此刻在想什么？") }, shape = RoundedCornerShape(20.dp),
    )
    state.error?.let {
      Spacer(Modifier.height(8.dp))
      Text(it, color = MaterialTheme.colorScheme.error)
    }
    Spacer(Modifier.height(16.dp))
    Button(
      onClick = { viewModel.saveCapture(type, text.trim()) },
      enabled = text.isNotBlank() && !state.busy,
      modifier = Modifier.fillMaxWidth().height(54.dp),
      shape = RoundedCornerShape(18.dp),
    ) { Text(if (state.busy) "正在保存…" else "保存记录") }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsScreen(viewModel: PersonaViewModel) {
  val state by viewModel.state.collectAsState()
  var pairingOpen by rememberSaveable { mutableStateOf(false) }
  var pairingCode by rememberSaveable { mutableStateOf("") }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp),
  ) {
    item { Text("Settings", style = MaterialTheme.typography.headlineLarge) }
    item {
      Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
          Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(46.dp)) {
            Box(contentAlignment = Alignment.Center) { Text("P", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold) }
          }
          Spacer(Modifier.width(14.dp))
          Column(Modifier.weight(1f)) {
            Text(
              if (state.paired) "Persona 已连接" else "Persona Preview",
              style = MaterialTheme.typography.titleMedium,
            )
            Text(
              when {
                state.paired -> "设备 ${state.deviceId?.take(8) ?: "—"} · Mobile API v1"
                else -> "本地演示模式 · 设置中可配对"
              },
              color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
          }
          Icon(
            if (state.paired) Icons.Outlined.CloudDone else Icons.Outlined.Visibility,
            contentDescription = if (state.paired) "已连接" else "本地演示模式",
            tint = MaterialTheme.colorScheme.primary,
          )
        }
      }
    }
    item {
      Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column {
          ListItem(
            headlineContent = { Text(if (state.paired) "断开设备" else "输入配对码连接") },
            supportingContent = {
              Text(state.pairingCodeHint, style = MaterialTheme.typography.bodyMedium)
            },
            leadingContent = {
              Icon(
                if (state.paired) Icons.Outlined.LinkOff else Icons.Outlined.Link,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
              )
            },
            modifier = Modifier.clickable {
              if (state.paired) viewModel.disconnect() else pairingOpen = true
            },
          )
        }
      }
    }
    item { SettingsGroup("偏好", listOf(Icons.Outlined.DarkMode to "外观", Icons.Outlined.NotificationsNone to "通知与提醒")) }
    item { SettingsGroup("应用", listOf(Icons.Outlined.Info to "关于 Persona")) }
    state.error?.let { message ->
      item {
        Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
      }
    }
  }

  if (pairingOpen) {
    AlertDialog(
      onDismissRequest = { pairingOpen = false },
      title = { Text("设备配对") },
      text = {
        Column {
          Text("在网页 Workspace 设置中生成一次性配对码（约 12 位），再粘贴到此处。")
          Spacer(Modifier.height(12.dp))
          OutlinedTextField(
            value = pairingCode,
            onValueChange = { pairingCode = it },
            label = { Text("配对码") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
          )
          if (state.busy) {
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(Modifier.fillMaxWidth())
          }
        }
      },
      confirmButton = {
        TextButton(
          enabled = pairingCode.isNotBlank() && !state.busy,
          onClick = {
            viewModel.pair(pairingCode)
            pairingCode = ""
            pairingOpen = false
          },
        ) { Text("连接") }
      },
      dismissButton = {
        TextButton(onClick = { pairingOpen = false }) { Text("取消") }
      },
    )
  }
}

@Composable
private fun SettingsGroup(title: String, entries: List<Pair<ImageVector, String>>) {
  Column {
    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 6.dp, bottom = 8.dp))
    Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
      entries.forEachIndexed { index, (icon, label) ->
        ListItem(
          headlineContent = { Text(label) },
          leadingContent = { Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
          trailingContent = { Icon(Icons.Outlined.ChevronRight, contentDescription = null) },
          modifier = Modifier.clickable { },
        )
        if (index < entries.lastIndex) {
          HorizontalDivider(Modifier.padding(start = 56.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
        }
      }
    }
  }
}

private fun greeting(): String = when (java.time.LocalTime.now().hour) {
  in 5..11 -> "早上好"
  in 12..17 -> "下午好"
  else -> "晚上好"
}

private fun formatEventTime(event: CachedCalendarEvent): String {
  val start = event.start
  if (start.isBlank()) return "全天"
  return runCatching {
    if (start.contains("T")) {
      val parsed = OffsetDateTime.parse(start)
      parsed.format(DateTimeFormatter.ofPattern("HH:mm"))
    } else {
      "全天"
    }
  }.getOrDefault(
    runCatching {
      LocalDateTime.parse(start.replace("Z", "")).format(DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrDefault(start.take(5)),
  )
}
