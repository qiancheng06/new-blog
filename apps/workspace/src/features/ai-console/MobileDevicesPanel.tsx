"use client"

import { Copy, KeyRound, LoaderCircle, Pencil, RefreshCw, Smartphone, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { personaUrl } from "@/shared/api/personaApi"

type MobileDevice = {
  id: string
  name: string
  platform?: string
  appVersion?: string
  createdAt?: string
  lastSeenAt?: string | null
  revokedAt?: string | null
}

type PairingCode = { code: string; expiresAt: string }

export function MobileDevicesPanel() {
  const [devices, setDevices] = useState<MobileDevice[]>([])
  const [pairing, setPairing] = useState<PairingCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function loadDevices() {
    setLoading(true)
    try {
      const response = await fetch(personaUrl("/api/mobile/devices"), { cache: "no-store" })
      const result = await response.json() as { devices?: MobileDevice[]; error?: string }
      if (!response.ok) throw new Error(result.error || "设备列表加载失败")
      setDevices(result.devices || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "设备列表加载失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadDevices() }, [])

  async function createCode() {
    setBusy("pair")
    setError("")
    setMessage("")
    try {
      const response = await fetch(personaUrl("/api/mobile/pairing-code"), { method: "POST" })
      const result = await response.json() as PairingCode & { error?: string }
      if (!response.ok || !result.code) throw new Error(result.error || "配对码生成失败")
      setPairing(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "配对码生成失败")
    } finally {
      setBusy(null)
    }
  }

  async function rename(device: MobileDevice) {
    const name = window.prompt("设备名称", device.name)
    if (!name || name.trim() === device.name) return
    setBusy(device.id)
    setError("")
    try {
      const response = await fetch(personaUrl(`/api/mobile/devices/${encodeURIComponent(device.id)}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) })
      const result = await response.json() as { device?: MobileDevice; error?: string }
      if (!response.ok || !result.device) throw new Error(result.error || "设备重命名失败")
      setDevices((current) => current.map((item) => item.id === device.id ? result.device! : item))
      setMessage("设备名称已更新")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "设备重命名失败")
    } finally {
      setBusy(null)
    }
  }

  async function revoke(device: MobileDevice) {
    if (!window.confirm(`确定撤销“${device.name}”的访问权限吗？`)) return
    setBusy(device.id)
    setError("")
    try {
      const response = await fetch(personaUrl(`/api/mobile/devices/${encodeURIComponent(device.id)}`), { method: "DELETE" })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "设备撤销失败")
      setDevices((current) => current.filter((item) => item.id !== device.id))
      setMessage("设备已撤销，手机端将无法继续刷新令牌")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "设备撤销失败")
    } finally {
      setBusy(null)
    }
  }

  async function copyCode() {
    if (!pairing) return
    await navigator.clipboard?.writeText(pairing.code)
    setMessage("配对码已复制")
  }

  return (
    <section className="ai-settings-panel mobile-devices-panel">
      <header><Smartphone size={17} /><div><strong>移动设备</strong><span>为 Persona Android 客户端生成独立配对凭据</span></div><button className="ai-icon-button" type="button" title="刷新设备列表" onClick={() => void loadDevices()} disabled={loading}><RefreshCw size={15} className={loading ? "spinning" : ""} /></button></header>
      <div className="mobile-pairing-actions">
        <button className="ai-primary-button" type="button" onClick={() => void createCode()} disabled={busy === "pair"}>{busy === "pair" ? <LoaderCircle size={16} className="spinning" /> : <KeyRound size={16} />}生成五分钟配对码</button>
        <span>配对码只显示一次，手机输入后立即失效。</span>
      </div>
      {pairing ? <div className="mobile-pairing-code" role="status"><div><small>请在 Android App 中输入</small><strong>{pairing.code}</strong><span>有效期至 {new Date(pairing.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span></div><button className="ai-secondary-button" type="button" onClick={() => void copyCode()}><Copy size={15} />复制</button></div> : null}
      {error ? <p className="ai-runtime-message error" role="alert">{error}</p> : null}
      {message ? <p className="ai-runtime-message success" role="status">{message}</p> : null}
      <div className="mobile-devices-list">
        <div className="mobile-devices-list-title">已配对设备</div>
        {loading ? <p className="ai-analysis-note">正在加载设备列表…</p> : devices.length === 0 ? <p className="ai-analysis-note">暂无设备。点击上方按钮开始配对。</p> : devices.map((device) => <div className="mobile-device-row" key={device.id}><div className="mobile-device-icon"><Smartphone size={16} /></div><div className="mobile-device-copy"><strong>{device.name || "未命名设备"}</strong><span>{device.platform || "Android"}{device.appVersion ? ` · ${device.appVersion}` : ""} · 最近活动 {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString("zh-CN") : "尚未使用"}</span></div><button className="ai-icon-button" type="button" title="重命名" onClick={() => void rename(device)} disabled={busy === device.id}><Pencil size={15} /></button><button className="ai-icon-button danger" type="button" title="撤销设备" onClick={() => void revoke(device)} disabled={busy === device.id}><Trash2 size={15} /></button></div>)}
      </div>
    </section>
  )
}
