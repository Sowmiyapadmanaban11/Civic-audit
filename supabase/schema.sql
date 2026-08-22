-- ============================================================
-- CivicAudit — Database Schema
-- Run this FIRST in Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- profiles
-- One row per auth.users row (created automatically by the
-- handle_new_user trigger defined in functions.sql)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role text not null check (role in ('owner','professional','admin')),
  professional_type text check (
    professional_type is null or professional_type in
    ('Architect','Civil Engineer','Contractor','Construction Company','Interior Designer','Other')
  ),
  company_name text,
  location text,
  bio text,
  profile_image text,
  experience_years int default 0,
  verification_status text not null default 'Pending' check (verification_status in ('Pending','Verified','Rejected')),
  average_rating numeric(3,2) default 0,
  completed_projects int default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- projects
-- ------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  project_type text not null check (
    project_type in ('Construction','Renovation','Demolition','Land Development','Interior Design','Property Sale','Other')
  ),
  location text not null,
  budget_min numeric(14,2) not null,
  budget_max numeric(14,2) not null,
  expected_duration text,
  start_date date,
  deadline date,
  requirements text,
  status text not null default 'Open' check (status in ('Open','In Progress','Completed','Cancelled')),
  assigned_professional_id uuid references public.profiles(id) on delete set null,
  current_stage text default 'Planning' check (current_stage in ('Planning','Site Preparation','Foundation','Construction','Finishing','Completed')),
  progress_percentage int default 0 check (progress_percentage between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_owner on public.projects(owner_id);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_type on public.projects(project_type);
create index if not exists idx_projects_location on public.projects(location);

-- ------------------------------------------------------------
-- project_documents
-- ------------------------------------------------------------
create table if not exists public.project_documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text,
  created_at timestamptz not null default now()
);
create index if not exists idx_docs_project on public.project_documents(project_id);

-- ------------------------------------------------------------
-- bids
-- ------------------------------------------------------------
create table if not exists public.bids (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  quotation_amount numeric(14,2) not null,
  estimated_duration text not null,
  proposal text not null,
  additional_notes text,
  status text not null default 'Pending' check (status in ('Pending','Shortlisted','Accepted','Rejected')),
  match_score int,
  created_at timestamptz not null default now(),
  unique (project_id, contractor_id)
);
create index if not exists idx_bids_project on public.bids(project_id);
create index if not exists idx_bids_contractor on public.bids(contractor_id);

-- ------------------------------------------------------------
-- portfolios
-- ------------------------------------------------------------
create table if not exists public.portfolios (
  id uuid primary key default uuid_generate_v4(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  project_type text,
  image_url text,
  project_value numeric(14,2),
  completion_year int,
  created_at timestamptz not null default now()
);
create index if not exists idx_portfolios_pro on public.portfolios(professional_id);

-- ------------------------------------------------------------
-- messages
-- ------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_sender on public.messages(sender_id);
create index if not exists idx_messages_receiver on public.messages(receiver_id);
create index if not exists idx_messages_pair on public.messages(sender_id, receiver_id);

-- ------------------------------------------------------------
-- site_visits
-- ------------------------------------------------------------
create table if not exists public.site_visits (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time not null,
  location text not null,
  status text not null default 'Pending' check (status in ('Pending','Accepted','Rejected','Rescheduled','Completed')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_visits_project on public.site_visits(project_id);

-- ------------------------------------------------------------
-- reviews
-- ------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now(),
  unique (project_id, reviewer_id)
);
create index if not exists idx_reviews_pro on public.reviews(professional_id);

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null check (type in
    ('new_bid','bid_accepted','bid_rejected','bid_shortlisted','new_message',
     'site_visit_scheduled','site_visit_updated','project_update','new_review','system')),
  related_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, is_read);

-- ------------------------------------------------------------
-- project_updates (progress tracking)
-- ------------------------------------------------------------
create table if not exists public.project_updates (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  stage text check (stage in ('Planning','Site Preparation','Foundation','Construction','Finishing','Completed')),
  progress_percentage int not null check (progress_percentage between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists idx_updates_project on public.project_updates(project_id);

-- ------------------------------------------------------------
-- reported_content (admin moderation)
-- ------------------------------------------------------------
create table if not exists public.reported_content (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('project','profile','message','review')),
  content_id uuid not null,
  reason text not null,
  status text not null default 'Open' check (status in ('Open','Reviewed','Dismissed')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Enable Row Level Security everywhere (policies in policies.sql)
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_documents enable row level security;
alter table public.bids enable row level security;
alter table public.portfolios enable row level security;
alter table public.messages enable row level security;
alter table public.site_visits enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.project_updates enable row level security;
alter table public.reported_content enable row level security;

-- ------------------------------------------------------------
-- Storage buckets
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('profile-images', 'profile-images', true),
  ('project-documents', 'project-documents', false),
  ('portfolio-images', 'portfolio-images', true)
on conflict (id) do nothing;
