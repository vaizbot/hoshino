/** 滚动位置记忆：按页面 key 存 sessionStorage，返回上一页时恢复滚动位置 */

const PREFIX = 'vaizbot-scroll:'

export function saveScroll(key: string, y: number): void {
  try {
    sessionStorage.setItem(PREFIX + key, String(Math.round(y)))
  } catch {
    /* 忽略存储失败 */
  }
}

export function restoreScroll(key: string): number | null {
  try {
    const v = sessionStorage.getItem(PREFIX + key)
    if (v === null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}
