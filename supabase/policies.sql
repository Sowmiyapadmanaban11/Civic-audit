-- ============================================================
-- CivicAudit — Row Level Security Policies
-- Run this SECOND, after schema.sql
-- ============================================================

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- profiles
-- ============================================================
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles for select
  using ( true ); -- public directory: names/ratings/portfolios must be browsable

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check ( auth.uid() = id );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using ( auth.uid() = id or public.is_admin() )
  with check ( auth.uid() = id or public.is_admin() );

-- ============================================================
-- projects
-- ============================================================
drop policy if exists "projects_select" on public.projects;
create policy "projects_select"
  on public.projects for select
  using (
    status = 'Open'
    or owner_id = auth.uid()
    or assigned_professional_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "projects_insert_owner" on public.projects;
create policy "projects_insert_owner"
  on public.projects for insert
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
  );

drop policy if exists "projects_update_owner" on public.projects;
create policy "projects_update_owner"
  on public.projects for update
  using ( owner_id = auth.uid() or assigned_professional_id = auth.uid() or public.is_admin() )
  with check ( owner_id = auth.uid() or assigned_professional_id = auth.uid() or public.is_admin() );

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner"
  on public.projects for delete
  using ( owner_id = auth.uid() or public.is_admin() );

-- ============================================================
-- project_documents
-- ============================================================
drop policy if exists "docs_select" on public.project_documents;
create policy "docs_select"
  on public.project_documents for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.status = 'Open' or p.owner_id = auth.uid() or p.assigned_professional_id = auth.uid())
    ) or public.is_admin()
  );

drop policy if exists "docs_insert" on public.project_documents;
create policy "docs_insert"
  on public.project_documents for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id and (p.owner_id = auth.uid() or p.assigned_professional_id = auth.uid())
    )
  );

drop policy if exists "docs_delete" on public.project_documents;
create policy "docs_delete"
  on public.project_documents for delete
  using ( uploaded_by = auth.uid() or public.is_admin() );

-- ============================================================
-- bids
-- ============================================================
drop policy if exists "bids_select" on public.bids;
create policy "bids_select"
  on public.bids for select
  using (
    contractor_id = auth.uid()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "bids_insert" on public.bids;
create policy "bids_insert"
  on public.bids for insert
  with check (
    contractor_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'professional')
    and exists (select 1 from public.projects p where p.id = project_id and p.status = 'Open')
  );

-- Contractor may edit their own bid while pending; project owner may change status.
drop policy if exists "bids_update" on public.bids;
create policy "bids_update"
  on public.bids for update
  using (
    (contractor_id = auth.uid() and status = 'Pending')
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or public.is_admin()
  )
  with check (
    contractor_id = auth.uid()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "bids_delete" on public.bids;
create policy "bids_delete"
  on public.bids for delete
  using ( (contractor_id = auth.uid() and status = 'Pending') or public.is_admin() );

-- ============================================================
-- portfolios
-- ============================================================
drop policy if exists "portfolios_select_all" on public.portfolios;
create policy "portfolios_select_all"
  on public.portfolios for select
  using ( true );

drop policy if exists "portfolios_write_own" on public.portfolios;
create policy "portfolios_insert_own"
  on public.portfolios for insert
  with check ( professional_id = auth.uid() );

create policy "portfolios_update_own"
  on public.portfolios for update
  using ( professional_id = auth.uid() or public.is_admin() )
  with check ( professional_id = auth.uid() or public.is_admin() );

create policy "portfolios_delete_own"
  on public.portfolios for delete
  using ( professional_id = auth.uid() or public.is_admin() );

-- ============================================================
-- messages
-- ============================================================
drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
  on public.messages for select
  using ( sender_id = auth.uid() or receiver_id = auth.uid() or public.is_admin() );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
  on public.messages for insert
  with check ( sender_id = auth.uid() );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update"
  on public.messages for update
  using ( receiver_id = auth.uid() ) -- only the receiver can mark as read
  with check ( receiver_id = auth.uid() );

-- ============================================================
-- site_visits
-- ============================================================
drop policy if exists "visits_select" on public.site_visits;
create policy "visits_select"
  on public.site_visits for select
  using ( owner_id = auth.uid() or professional_id = auth.uid() or public.is_admin() );

drop policy if exists "visits_insert" on public.site_visits;
create policy "visits_insert"
  on public.site_visits for insert
  with check ( owner_id = auth.uid() or professional_id = auth.uid() );

drop policy if exists "visits_update" on public.site_visits;
create policy "visits_update"
  on public.site_visits for update
  using ( owner_id = auth.uid() or professional_id = auth.uid() or public.is_admin() )
  with check ( owner_id = auth.uid() or professional_id = auth.uid() or public.is_admin() );

-- ============================================================
-- reviews
-- ============================================================
drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all"
  on public.reviews for select
  using ( true );

drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_insert"
  on public.reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

-- ============================================================
-- notifications
-- ============================================================
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using ( user_id = auth.uid() );

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- Inserts happen via SECURITY DEFINER trigger functions (see functions.sql),
-- but we also allow a user to create a notification addressed to themselves.
drop policy if exists "notifications_insert_self" on public.notifications;
create policy "notifications_insert_self"
  on public.notifications for insert
  with check ( user_id = auth.uid() );

-- ============================================================
-- project_updates
-- ============================================================
drop policy if exists "updates_select" on public.project_updates;
create policy "updates_select"
  on public.project_updates for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (p.owner_id = auth.uid() or p.assigned_professional_id = auth.uid())
    ) or public.is_admin()
  );

drop policy if exists "updates_insert" on public.project_updates;
create policy "updates_insert"
  on public.project_updates for insert
  with check (
    professional_id = auth.uid()
    and exists (select 1 from public.projects p where p.id = project_id and p.assigned_professional_id = auth.uid())
  );

-- ============================================================
-- reported_content
-- ============================================================
drop policy if exists "reports_insert" on public.reported_content;
create policy "reports_insert"
  on public.reported_content for insert
  with check ( reporter_id = auth.uid() );

drop policy if exists "reports_select_admin" on public.reported_content;
create policy "reports_select_admin"
  on public.reported_content for select
  using ( reporter_id = auth.uid() or public.is_admin() );

drop policy if exists "reports_update_admin" on public.reported_content;
create policy "reports_update_admin"
  on public.reported_content for update
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- ============================================================
-- STORAGE POLICIES
-- Convention: files are stored at  {user_id}/{filename}
-- so ownership can be checked from the path's first folder.
-- ============================================================

-- profile-images (public bucket)
drop policy if exists "profile_images_read" on storage.objects;
create policy "profile_images_read"
  on storage.objects for select
  using ( bucket_id = 'profile-images' );

drop policy if exists "profile_images_write" on storage.objects;
create policy "profile_images_write"
  on storage.objects for insert
  with check ( bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "profile_images_update" on storage.objects;
create policy "profile_images_update"
  on storage.objects for update
  using ( bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "profile_images_delete" on storage.objects;
create policy "profile_images_delete"
  on storage.objects for delete
  using ( bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text );

-- portfolio-images (public bucket)
drop policy if exists "portfolio_images_read" on storage.objects;
create policy "portfolio_images_read"
  on storage.objects for select
  using ( bucket_id = 'portfolio-images' );

drop policy if exists "portfolio_images_write" on storage.objects;
create policy "portfolio_images_write"
  on storage.objects for insert
  with check ( bucket_id = 'portfolio-images' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "portfolio_images_delete" on storage.objects;
create policy "portfolio_images_delete"
  on storage.objects for delete
  using ( bucket_id = 'portfolio-images' and (storage.foldername(name))[1] = auth.uid()::text );

-- project-documents (private bucket — only the uploader can read/write via signed URLs
-- from the client; broader read access for project participants is handled at the
-- application layer using signed URLs generated after a project_documents SELECT passes RLS)
drop policy if exists "project_docs_write" on storage.objects;
create policy "project_docs_write"
  on storage.objects for insert
  with check ( bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "project_docs_read_own" on storage.objects;
create policy "project_docs_read_own"
  on storage.objects for select
  using ( bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "project_docs_delete_own" on storage.objects;
create policy "project_docs_delete_own"
  on storage.objects for delete
  using ( bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text );
