/** 把正文按段落打包成朗读段，每段不超过 1800 字（MiMo 单次上限 4000，留足余量） */
export function buildChunks(content: string): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current && current.length + p.length > 1800) {
      chunks.push(current)
      current = ''
    }
    current = current ? `${current}\n\n${p}` : p
  }
  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [content]
}
