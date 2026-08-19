export type WorkspaceTheme = "light" | "dark" | "system"

export interface WorkspaceAppearanceConfig {
  theme: WorkspaceTheme
  accentHue: number
  motion: boolean
}

export const WORKSPACE_APPEARANCE_KEY = "persona-workspace-appearance"

export const defaultWorkspaceAppearance: WorkspaceAppearanceConfig = {
  theme: "light",
  accentHue: 165,
  motion: true,
}

export function parseWorkspaceAppearance(value: string | null): WorkspaceAppearanceConfig {
  if (!value) return defaultWorkspaceAppearance

  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceAppearanceConfig>
    return {
      theme: parsed.theme === "dark" || parsed.theme === "system" ? parsed.theme : "light",
      accentHue: clamp(Number(parsed.accentHue ?? defaultWorkspaceAppearance.accentHue), 120, 220),
      motion: parsed.motion !== false,
    }
  } catch {
    return defaultWorkspaceAppearance
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
