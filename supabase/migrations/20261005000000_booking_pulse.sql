-- Booking Pulse: the only data this app stores about bookings.
-- No names, personal identity numbers, addresses, phone numbers or free text.
-- patient_id is Muntra's internal ID. Contact details are fetched live from
-- the Muntra API when a person needs them, never stored here.

create table public.bookings (
  booking_id                bigint primary key,
  clinic_id                 bigint,
  patient_id                bigint,
  booking_type_id           bigint,
  booking_type_name         text,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  duration_minutes          integer,
  status                    text,
  patient_partstat          text,
  patient_arrived_at        timestamptz,
  is_new_patient            boolean not null default false,
  wants_earlier_slot        boolean not null default false,
  late_cancellation         boolean not null default false,
  failed_to_appear          boolean not null default false,
  failed_to_appear_handled  boolean not null default false,
  is_done                   boolean not null default false,
  is_deleted                boolean not null default false,
  last_trigger              text,
  first_seen_at             timestamptz not null default now(),
  last_event_at             timestamptz not null default now()
);

create index bookings_starts_at_idx on public.bookings (starts_at);

create table public.booking_events (
  id           bigint generated always as identity primary key,
  booking_id   bigint not null,
  trigger      text not null,
  status       text,
  starts_at    timestamptz,
  received_at  timestamptz not null default now()
);

create index booking_events_booking_id_idx on public.booking_events (booking_id);

-- Row level security: nothing is readable without logging in to the dashboard.
-- The webhook function writes with the service role key, which bypasses RLS.
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

create policy "Signed-in staff can read bookings"
  on public.bookings for select to authenticated using (true);

create policy "Signed-in staff can read booking events"
  on public.booking_events for select to authenticated using (true);

-- Bookings per day (clinic time zone).
create view public.daily_booking_stats with (security_invoker = true) as
select
  (starts_at at time zone 'Europe/Stockholm')::date                 as day,
  count(*) filter (where status <> 'CANCELLED')                      as booked,
  count(*) filter (where status = 'CANCELLED')                       as cancelled,
  count(*) filter (where late_cancellation)                          as late_cancellations,
  count(*) filter (where failed_to_appear)                           as no_shows,
  count(*) filter (where patient_arrived_at is not null)             as arrived
from public.bookings
where not is_deleted and starts_at is not null
group by 1;

-- Patients who should have arrived but have not been checked in.
-- Starting point for the no-show / late-patient workflow.
create view public.missed_bookings with (security_invoker = true) as
select *,
  round(extract(epoch from (now() - starts_at)) / 60)::int as minutes_late
from public.bookings
where not is_deleted
  and status <> 'CANCELLED'
  and patient_id is not null
  and patient_arrived_at is null
  and not failed_to_appear
  and not late_cancellation
  and starts_at < now() - interval '10 minutes'
  and starts_at > now() - interval '7 days';

-- Live updates in the dashboard.
alter publication supabase_realtime add table public.bookings;
