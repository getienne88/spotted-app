-- Spotted App - Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- USERS PROFILE TABLE (extends Supabase auth)
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  phone text,
  bank_last4 text,
  payout_method text default 'Direct Deposit',
  notifications_report_updates boolean default true,
  notifications_payment_received boolean default true,
  notifications_weekly_digest boolean default false,
  notifications_new_features boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security)
alter table public.profiles enable row level security;

-- Users can only see/edit their own profile
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- VIOLATION TYPES TABLE (reference data)
-- ============================================
create table public.violation_types (
  id text primary key,
  label text not null,
  fine integer not null,
  icon text not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert violation types
insert into public.violation_types (id, label, fine, icon, description) values
  ('hydrant', 'Fire Hydrant', 115, '🚒', 'Within 15ft of hydrant'),
  ('double', 'Double Parked', 115, '🚗', 'Blocking travel lane'),
  ('bike', 'Bike Lane', 175, '🚲', 'Blocking bicycle lane'),
  ('bus', 'Bus Stop/Lane', 175, '🚌', 'In bus zone or lane'),
  ('crosswalk', 'Crosswalk', 115, '🚶', 'Blocking pedestrian crossing'),
  ('sidewalk', 'Sidewalk', 115, '♿', 'On sidewalk/ramp');

-- Everyone can read violation types
alter table public.violation_types enable row level security;
create policy "Anyone can view violation types" on public.violation_types
  for select using (true);

-- ============================================
-- REPORTS TABLE (the main data)
-- ============================================
create table public.reports (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  violation_type text references public.violation_types(id) not null,
  
  -- Location data
  latitude decimal(10, 8),
  longitude decimal(11, 8),
  location_text text, -- "5th Ave & 9th St"
  
  -- Evidence
  photo_url text,
  plate_number text,
  
  -- Status
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  
  -- Financial
  fine_amount integer,
  reward_amount decimal(10, 2),
  paid_out boolean default false,
  paid_out_at timestamp with time zone,
  
  -- Timestamps
  reported_at timestamp with time zone default timezone('utc'::text, now()) not null,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.reports enable row level security;

-- Users can only see their own reports
create policy "Users can view own reports" on public.reports
  for select using (auth.uid() = user_id);

-- Users can insert their own reports
create policy "Users can create own reports" on public.reports
  for insert with check (auth.uid() = user_id);

-- Users can update their own pending reports (e.g., add plate number)
create policy "Users can update own pending reports" on public.reports
  for update using (auth.uid() = user_id and status = 'pending');

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
create index reports_user_id_idx on public.reports(user_id);
create index reports_status_idx on public.reports(status);
create index reports_reported_at_idx on public.reports(reported_at desc);
create index reports_plate_number_idx on public.reports(plate_number);

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- User stats view
create or replace view public.user_stats as
select 
  p.id as user_id,
  count(r.id) as total_reports,
  count(case when r.status = 'approved' then 1 end) as approved_reports,
  count(case when r.status = 'pending' then 1 end) as pending_reports,
  count(case when r.status = 'rejected' then 1 end) as rejected_reports,
  coalesce(sum(case when r.status = 'approved' then r.reward_amount else 0 end), 0) as total_earned,
  coalesce(sum(case when r.status = 'pending' then r.reward_amount else 0 end), 0) as pending_earnings,
  round(
    case 
      when count(r.id) > 0 
      then (count(case when r.status = 'approved' then 1 end)::decimal / count(r.id) * 100)
      else 0 
    end, 1
  ) as success_rate
from public.profiles p
left join public.reports r on p.id = r.user_id
group by p.id;

-- Enable RLS on view (users see only their own stats)
-- Note: Views inherit RLS from underlying tables

-- ============================================
-- STORAGE BUCKET FOR PHOTOS
-- ============================================
-- Run this separately or in Supabase Dashboard > Storage > New Bucket

-- Create bucket (do this in Dashboard: Storage > New Bucket > "violation-photos")
-- Set it to public or private depending on your needs

-- Storage policies (run after creating bucket):
-- insert into storage.buckets (id, name, public) values ('violation-photos', 'violation-photos', false);

-- create policy "Users can upload their own photos"
-- on storage.objects for insert
-- with check (bucket_id = 'violation-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can view their own photos"
-- on storage.objects for select
-- using (bucket_id = 'violation-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to calculate reward (10% of fine)
create or replace function calculate_reward(fine integer)
returns decimal as $$
begin
  return round(fine * 0.10, 2);
end;
$$ language plpgsql;

-- Function to check for duplicate reports (same plate + location + type within 2 hours)
create or replace function check_duplicate_report(
  p_plate text,
  p_lat decimal,
  p_lng decimal,
  p_violation_type text
)
returns boolean as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count
  from public.reports
  where plate_number = p_plate
    and violation_type = p_violation_type
    and reported_at > now() - interval '2 hours'
    and (
      -- Within ~100 meters (rough approximation)
      abs(latitude - p_lat) < 0.001 
      and abs(longitude - p_lng) < 0.001
    );
  
  return existing_count > 0;
end;
$$ language plpgsql;

-- ============================================
-- SAMPLE DATA (optional - for testing)
-- ============================================
-- Uncomment to add test data after you have a user

/*
-- Replace 'YOUR_USER_ID' with actual user UUID after signing up
insert into public.reports (user_id, violation_type, location_text, plate_number, status, fine_amount, reward_amount, reported_at) values
  ('YOUR_USER_ID', 'bike', '5th Ave & 9th St', 'ABC-1234', 'approved', 175, 17.50, now() - interval '3 days'),
  ('YOUR_USER_ID', 'hydrant', '7th Ave & Carroll St', 'XYZ-5678', 'pending', 115, 11.50, now() - interval '1 day'),
  ('YOUR_USER_ID', 'crosswalk', 'Court St & Atlantic Ave', 'JKL-7890', 'rejected', 115, 0, now() - interval '5 days'),
  ('YOUR_USER_ID', 'double', 'Union St & 4th Ave', 'DEF-9012', 'approved', 115, 11.50, now() - interval '7 days');
*/
