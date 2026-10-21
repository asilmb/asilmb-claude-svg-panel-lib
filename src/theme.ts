// Every colour a picture paints, in one place, for a dark and a light surface.

export type Status = 'good' | 'warning' | 'serious' | 'critical'

export type Theme = {
  name: 'dark' | 'light'
  surface: string
  /** Primary ink: hero figures and values. */
  ink: string
  /** Secondary ink: labels. */
  ink2: string
  /** Axis text, scale ends, quiet notes. */
  muted: string
  grid: string
  baseline: string
  status: Record<Status, string>
  /**
   * Categorical slots in their fixed order: blue, orange and aqua validate as
   * a set in both modes. Violet sits too close to blue to share a chart with
   * it, so it paints only the `idle` icon, whose shape carries it.
   */
  series: { blue: string; orange: string; aqua: string; violet: string }
}

/** Fixed in both modes; each always ships beside a word or an icon. */
const STATUS: Record<Status, string> = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

export const dark: Theme = {
  name: 'dark',
  surface: '#1a1a19',
  ink: '#f0efec',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  baseline: '#383835',
  status: STATUS,
  series: { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', violet: '#9085e9' },
}

/** The same roles stepped for a light surface: the same ramps, not a flip. */
export const light: Theme = {
  name: 'light',
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  status: STATUS,
  series: { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', violet: '#6250d6' },
}

export const themes = { dark, light } as const

/** The word that goes beside each status colour. */
export const STATUS_WORD: Record<Status, string> = {
  good: 'ok',
  warning: 'warning',
  serious: 'serious',
  critical: 'critical',
}

/** The Claude Code theme key a `Text` beside a status mark wears. */
export const STATUS_TEXT_COLOR: Record<Status, 'success' | 'warning' | 'error'> = {
  good: 'success',
  warning: 'warning',
  serious: 'warning',
  critical: 'error',
}

/** A theme by name or as given; dark when absent. */
export function pickTheme(theme: Theme | 'dark' | 'light' | undefined): Theme {
  if (theme === undefined) return dark
  return typeof theme === 'string' ? themes[theme] : theme
}
