/** 大纲地图核心：分支叙事树（左/主/右三枝 45° 展开）+ 布局算法 + 章节工具 */

export type Branch = 'left' | 'main' | 'right'

export interface Chapter {
  id: string
  title: string
  summary: string
  parentId?: string | null
  dir?: Branch | null
  deletedAt?: string
  saved?: boolean
  used?: boolean
}

export function newChapter(parentId: string | null, dir: Branch | null): Chapter {
  return {
    id: crypto.randomUUID(),
    title: '新章节',
    summary: '',
    parentId,
    dir,
    saved: false,
    used: false
  }
}

/** 新建作品的预置大纲：根节点 + 一个主枝子节点 */
export function presetOutline(): Chapter[] {
  const rootId = crypto.randomUUID()
  return [
    { id: rootId, title: '', summary: '', parentId: null, dir: null, saved: false, used: false },
    { id: crypto.randomUUID(), title: '', summary: '', parentId: rootId, dir: 'main', saved: false, used: false }
  ]
}

export interface OutlineNode {
  id: string
  x: number
  y: number
  dir?: Branch | null
}

const DX: Record<Branch, number> = { left: -130, main: 0, right: 130 }
const DY = 130
const ROOT_GAP = 300

/** 树布局：根在上，子节点按左/主/右偏移；防环 + 列碰撞避让 */
export function layoutOutline(chapters: Chapter[]): Map<string, OutlineNode> {
  const active = chapters.filter((c) => !c.deletedAt)
  const byId = new Map(active.map((c) => [c.id, c]))
  const map = new Map<string, OutlineNode>()
  const visiting = new Set<string>()

  const place = (node: Chapter, parent?: OutlineNode): OutlineNode => {
    const existing = map.get(node.id)
    if (existing) return existing
    if (visiting.has(node.id)) {
      // 环：按独立根处理
      const orphan: OutlineNode = { id: node.id, x: map.size * ROOT_GAP, y: 0, dir: node.dir ?? null }
      map.set(node.id, orphan)
      return orphan
    }
    visiting.add(node.id)
    const placed: OutlineNode = parent
      ? { id: node.id, x: parent.x + DX[node.dir ?? 'main'], y: parent.y + DY, dir: node.dir ?? null }
      : { id: node.id, x: 0, y: 0, dir: node.dir ?? null }
    map.set(node.id, placed)
    for (const child of active.filter((c) => c.parentId === node.id)) place(child, placed)
    visiting.delete(node.id)
    return placed
  }

  const roots = active.filter((c) => !c.parentId || !byId.has(c.parentId))
  roots.forEach((r, i) => {
    const node = place(r)
    node.x = i * ROOT_GAP
  })

  // 同列碰撞：下移避让
  const columns = new Map<string, OutlineNode[]>()
  for (const n of map.values()) {
    const key = `${Math.round(n.x / 10)}`
    const list = columns.get(key) ?? []
    list.push(n)
    columns.set(key, list)
  }
  for (const list of columns.values()) {
    list.sort((a, b) => a.y - b.y)
    for (let i = 1; i < list.length; i++) {
      if (list[i].y - list[i - 1].y < 56) list[i].y = list[i - 1].y + 56
    }
  }

  return map
}

/** 取用章节：标记 used 并把标题/摘要追加到正文末尾 */
export function appendChapterToDraft(draft: string, chapter: Chapter): string {
  const block = [chapter.title.trim(), chapter.summary.trim()].filter(Boolean).join('\n')
  if (!block) return draft
  const tail = draft.replace(/\s+$/, '')
  return tail ? `${tail}\n\n${block}\n` : `${block}\n`
}

/** 某节点某方向是否已有子节点 */
export function childDirTaken(chapters: Chapter[], parentId: string, dir: Branch): boolean {
  return chapters.some((c) => !c.deletedAt && c.parentId === parentId && c.dir === dir)
}
