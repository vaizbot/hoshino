import { supabase } from '@/lib/supabase'

export interface CommentItem {
  id: string
  post_id: string
  name: string
  content: string
  created_at: string
}

/** 拉取某篇文章（或留言板）的评论，按时间正序 */
export async function fetchComments(postId: string): Promise<CommentItem[]> {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) return []
    return (data ?? []) as CommentItem[]
  } catch {
    return []
  }
}

/** 提交评论（蜜罐字段非空视为机器人，假成功直接丢弃） */
export async function addComment(input: {
  post_id: string
  name: string
  content: string
  honeypot: string
}): Promise<{ ok: boolean; message?: string }> {
  if (input.honeypot.trim()) return { ok: true } // 机器人：假成功
  const name = input.name.trim()
  const content = input.content.trim()
  if (!content) return { ok: false, message: '写点什么再发送吧' }
  if (content.length > 1000) return { ok: false, message: '内容太长啦（1000 字以内）' }
  if (name.length > 30) return { ok: false, message: '昵称太长啦（30 字以内）' }
  const { error } = await supabase.from('comments').insert({
    post_id: input.post_id,
    name: name || '匿名',
    content
  })
  if (error) return { ok: false, message: '评论发送失败，请稍后再试' }
  return { ok: true }
}

/** 后台：全部评论（倒序） */
export async function fetchAllComments(): Promise<CommentItem[]> {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return []
    return (data ?? []) as CommentItem[]
  } catch {
    return []
  }
}

/** 后台：删除评论 */
export async function deleteComment(id: string): Promise<boolean> {
  const { error } = await supabase.from('comments').delete().eq('id', id)
  return !error
}
