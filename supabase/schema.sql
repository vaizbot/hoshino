-- ============================================================
-- VaizBot 站点 · Supabase 数据库初始化脚本
-- 用法：Supabase 控制台 → SQL Editor → New query → 粘贴整段 → Run
-- 注意：如重复执行，表已存在时先手动 DROP TABLE public.articles;
--       策略部分已做 drop policy if exists，可安全重跑
-- ============================================================

-- 1. 建表
create table if not exists public.articles (
  id               uuid        primary key default gen_random_uuid(),
  title            text        not null,
  content          text        not null,
  cover_url        text,
  audio_url        text,
  content_zh       text,
  content_en       text,
  views            int         not null default 0,
  published        boolean     not null default true,
  source_url       text,
  source_name      text,
  is_auto_fetched  boolean     not null default false,
  created_at       timestamptz not null default now()
);

-- 2. 开启行级安全（RLS）
alter table public.articles enable row level security;

-- 3. 策略①：匿名用户只能查询「已发布」的文章
drop policy if exists "anon_select_published" on public.articles;
create policy "anon_select_published"
  on public.articles
  for select
  to anon
  using (published = true);

-- 4. 策略②：登录用户可对全部数据做增删改查（管理后台使用）
drop policy if exists "authenticated_all" on public.articles;
create policy "authenticated_all"
  on public.articles
  for all
  to authenticated
  using (true)
  with check (true);

-- 5. 播放量自增函数（供前端 services/articles.ts 的 incrementViews() 调用）
--    使用 SECURITY DEFINER 以函数属主身份执行，绕过 RLS，
--    因此匿名访客也能安全地 +1（函数内部只做 views = views + 1，无注入面）
create or replace function public.increment_article_views(article_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles
  set views = views + 1
  where id = article_id;
$$;

revoke all on function public.increment_article_views(uuid) from public;
grant execute on function public.increment_article_views(uuid) to anon, authenticated;

-- 6. 表级权限（新版 Supabase 不再自动授予，必须显式补上，否则 REST API 报 401/403 permission denied）
grant usage on schema public to anon, authenticated, service_role;
grant select on public.articles to anon;
grant select, insert, update, delete on public.articles to authenticated;
grant select, insert, update, delete on public.articles to service_role;

-- 7. 默认权限：以后在 public schema 新建的表自动继承同样权限
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;

-- ============================================================
-- 站点设置单行表（关于页 / Hero / 后台概览共用）
-- ============================================================
create table if not exists public.site_settings (
  id              int         primary key default 1,
  name            text,
  avatar_url      text,
  signature       text,
  anonymous_tts   boolean     not null default true,
  milestones      jsonb       not null default '[]',
  updated_at      timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "anon_read_site_settings" on public.site_settings;
create policy "anon_read_site_settings"
  on public.site_settings
  for select
  to anon
  using (true);

drop policy if exists "auth_write_site_settings" on public.site_settings;
create policy "auth_write_site_settings"
  on public.site_settings
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.site_settings to anon;
grant select, insert, update, delete on public.site_settings to authenticated;
grant select, insert, update, delete on public.site_settings to service_role;

insert into public.site_settings (id, name, signature)
values (1, 'VaizBot', '我的个人小站 · 记录、分享与成长')
on conflict (id) do nothing;

-- ============================================================
-- 写作工作台：创作项目（草稿/存稿/发布 + 大纲 + 软删除回收站）
-- 私有表：仅登录管理员可读写，匿名完全无权限
-- ============================================================
create table if not exists public.writing_projects (
  id         uuid        primary key default gen_random_uuid(),
  title      text        not null default '',
  draft      text        not null default '',
  status     text        not null default 'draft',
  outline    jsonb       not null default '[]',
  settings   jsonb       not null default '[]',
  article_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 已建过旧版表的话补列
alter table public.writing_projects add column if not exists settings jsonb not null default '[]';

alter table public.writing_projects enable row level security;

drop policy if exists "auth_all_writing_projects" on public.writing_projects;
create policy "auth_all_writing_projects"
  on public.writing_projects
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.writing_projects to authenticated;
grant select, insert, update, delete on public.writing_projects to service_role;

-- ============================================================
-- 评论系统：文章评论 + 留言板（post_id='guestbook'）
-- 匿名可读可发（RLS 内做服务端校验），登录管理员可删
-- ============================================================
create table if not exists public.comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    text        not null,
  name       text        not null default '',
  content    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id);

alter table public.comments enable row level security;

drop policy if exists "anon_read_comments" on public.comments;
create policy "anon_read_comments"
  on public.comments
  for select
  to anon
  using (true);

-- 匿名发评论：RLS 内做服务端校验（昵称 ≤ 30 字、内容 1~1000 字）
drop policy if exists "anon_insert_comments" on public.comments;
create policy "anon_insert_comments"
  on public.comments
  for insert
  to anon
  with check (
    char_length(btrim(name)) <= 30
    and char_length(btrim(content)) between 1 and 1000
  );

drop policy if exists "auth_delete_comments" on public.comments;
create policy "auth_delete_comments"
  on public.comments
  for delete
  to authenticated
  using (true);

grant select, insert on public.comments to anon;
grant select, delete on public.comments to authenticated;
grant select, insert, update, delete on public.comments to service_role;
