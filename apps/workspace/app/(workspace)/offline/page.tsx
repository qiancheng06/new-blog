import { RefreshCw, WifiOff } from "lucide-react"

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <span className="offline-mark" aria-hidden="true"><WifiOff size={28} /></span>
      <p>PERSONA</p>
      <h1>当前处于离线状态</h1>
      <span>网络恢复后重新载入，日历写入将在连接成功后开放。</span>
      <a href="/calendar"><RefreshCw size={16} />重新载入</a>
    </main>
  )
}
