-- ============================================================
-- CivicAudit — Functions & Triggers
-- Run this THIRD, after schema.sql and policies.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Auto-create a profiles row whenever a new auth.users row
--    is created. Reads metadata passed at signUp() time.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, professional_type, company_name, location)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'owner'),
    new.raw_user_meta_data->>'professional_type',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'location'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. Generic notification creator (SECURITY DEFINER so it can
--    insert a notification for a DIFFERENT user than the caller,
--    which normal RLS would otherwise block).
-- ------------------------------------------------------------
create or replace function public.create_notification(
  p_user_id uuid, p_title text, p_message text, p_type text, p_related_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, message, type, related_id)
  values (p_user_id, p_title, p_message, p_type, p_related_id);
end;
$$;

-- ------------------------------------------------------------
-- 3. New bid → notify project owner
-- ------------------------------------------------------------
create or replace function public.notify_new_bid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_project_title text;
  v_contractor_name text;
begin
  select owner_id, title into v_owner, v_project_title from public.projects where id = new.project_id;
  select full_name into v_contractor_name from public.profiles where id = new.contractor_id;

  perform public.create_notification(
    v_owner,
    'New bid received',
    v_contractor_name || ' submitted a bid on "' || v_project_title || '"',
    'new_bid',
    new.id
  );
  return new;
end;
$$;

drop trigger if exists on_bid_created on public.bids;
create trigger on_bid_created
  after insert on public.bids
  for each row execute procedure public.notify_new_bid();

-- ------------------------------------------------------------
-- 4. Bid status change → notify contractor + update project
-- ------------------------------------------------------------
create or replace function public.notify_bid_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into v_project_title from public.projects where id = new.project_id;

  if new.status = 'Shortlisted' then
    perform public.create_notification(
      new.contractor_id, 'Bid shortlisted',
      'Your bid on "' || v_project_title || '" was shortlisted.', 'bid_shortlisted', new.id
    );
  elsif new.status = 'Accepted' then
    perform public.create_notification(
      new.contractor_id, 'Bid accepted!',
      'Your bid on "' || v_project_title || '" was accepted.', 'bid_accepted', new.id
    );
    -- Assign professional to the project and move it to In Progress
    update public.projects
      set assigned_professional_id = new.contractor_id,
          status = 'In Progress'
      where id = new.project_id;
    -- Auto-reject all other pending bids on this project
    update public.bids
      set status = 'Rejected'
      where project_id = new.project_id and id <> new.id and status in ('Pending','Shortlisted');
  elsif new.status = 'Rejected' then
    perform public.create_notification(
      new.contractor_id, 'Bid update',
      'Your bid on "' || v_project_title || '" was not selected.', 'bid_rejected', new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_bid_status_change on public.bids;
create trigger on_bid_status_change
  after update on public.bids
  for each row execute procedure public.notify_bid_status_change();

-- ------------------------------------------------------------
-- 5. New message → notify receiver
-- ------------------------------------------------------------
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  perform public.create_notification(
    new.receiver_id, 'New message', v_sender_name || ' sent you a message.', 'new_message', new.id
  );
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute procedure public.notify_new_message();

-- ------------------------------------------------------------
-- 6. Site visit scheduled/updated → notify the other party
-- ------------------------------------------------------------
create or replace function public.notify_site_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_notif_type text;
begin
  v_target := case when auth.uid() = new.owner_id then new.professional_id else new.owner_id end;
  v_notif_type := case when tg_op = 'INSERT' then 'site_visit_scheduled' else 'site_visit_updated' end;

  perform public.create_notification(
    v_target,
    case when tg_op = 'INSERT' then 'Site visit scheduled' else 'Site visit updated' end,
    'A site visit on ' || new.scheduled_date || ' at ' || new.scheduled_time || ' — status: ' || new.status,
    v_notif_type,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists on_site_visit_change on public.site_visits;
create trigger on_site_visit_change
  after insert or update on public.site_visits
  for each row execute procedure public.notify_site_visit();

-- ------------------------------------------------------------
-- 7. Project update posted → notify project owner
-- ------------------------------------------------------------
create or replace function public.notify_project_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  select owner_id, title into v_owner, v_title from public.projects where id = new.project_id;

  perform public.create_notification(
    v_owner, 'Project update', new.title || ' — ' || v_title, 'project_update', new.id
  );

  update public.projects
    set progress_percentage = new.progress_percentage,
        current_stage = coalesce(new.stage, current_stage),
        status = case when new.progress_percentage >= 100 then 'Completed' else status end
    where id = new.project_id;

  return new;
end;
$$;

drop trigger if exists on_project_update_created on public.project_updates;
create trigger on_project_update_created
  after insert on public.project_updates
  for each row execute procedure public.notify_project_update();

-- ------------------------------------------------------------
-- 8. New review → notify professional + recompute average rating
-- ------------------------------------------------------------
create or replace function public.notify_and_apply_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_notification(
    new.professional_id, 'New review', 'You received a new ' || new.rating || '-star review.', 'new_review', new.id
  );

  update public.profiles
    set average_rating = (
      select round(avg(rating)::numeric, 2) from public.reviews where professional_id = new.professional_id
    ),
    completed_projects = (
      select count(distinct project_id) from public.reviews where professional_id = new.professional_id
    )
    where id = new.professional_id;

  return new;
end;
$$;

drop trigger if exists on_review_created on public.reviews;
create trigger on_review_created
  after insert on public.reviews
  for each row execute procedure public.notify_and_apply_review();

-- ------------------------------------------------------------
-- 9. AI-assisted bid ranking (rule-based scoring, documented as
--    algorithmic — see js/ai.js for the client-side explanation).
--    Returns a 0-100 match score per bid for a given project.
-- ------------------------------------------------------------
create or replace function public.rank_bids_for_project(p_project_id uuid)
returns table (bid_id uuid, score int)
language plpgsql
stable
as $$
declare
  v_budget_min numeric; v_budget_max numeric;
  v_min_quote numeric; v_max_quote numeric;
begin
  select budget_min, budget_max into v_budget_min, v_budget_max from public.projects where id = p_project_id;
  select min(quotation_amount), max(quotation_amount) into v_min_quote, v_max_quote
    from public.bids where project_id = p_project_id;

  return query
  select
    b.id,
    least(100, greatest(0, round(
      -- price competitiveness (lower is better), 40 pts
      40 * (1 - (b.quotation_amount - coalesce(v_min_quote,b.quotation_amount)) /
            nullif(coalesce(v_max_quote,b.quotation_amount) - coalesce(v_min_quote,b.quotation_amount), 0.0001))
      -- rating, 30 pts
      + 30 * (coalesce(p.average_rating,0) / 5.0)
      -- completed projects (capped contribution), 20 pts
      + 20 * least(1.0, coalesce(p.completed_projects,0) / 10.0)
      -- verification, 10 pts
      + (case when p.verification_status = 'Verified' then 10 else 0 end)
    )))::int as score
  from public.bids b
  join public.profiles p on p.id = b.contractor_id
  where b.project_id = p_project_id;
end;
$$;
