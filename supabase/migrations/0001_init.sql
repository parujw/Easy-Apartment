-- Easy Apartment — initial schema (Supabase / PostgreSQL)
-- Multi-tenant: every business row carries property_id and is guarded by RLS.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ───────────────────────── Accounts ─────────────────────────

create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  phone       text not null unique,          -- username
  created_at  timestamptz not null default now()
);

create table public.properties (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null default '',
  address       text not null default '',
  promptpay_id  text not null default '',
  account_name  text not null default '',
  doc_prefix    text not null default 'EA' check (doc_prefix ~ '^[A-Z0-9]{1,6}$'),
  -- subscription (written only by security-definer functions / service role)
  plan          text not null default 'pro' check (plan in ('starter','pro','business')),
  paid_until    date,                          -- null = never paid
  intro_used    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.members (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','assistant')),
  primary key (property_id, user_id)
);

-- ───────────────────────── Rooms & people ─────────────────────────

create table public.rooms (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id) on delete cascade,
  number         text not null,
  floor          text not null default '',
  kind           text not null default 'monthly' check (kind in ('monthly','daily','airbnb')),
  status         text not null default 'vacant'
                   check (status in ('vacant','occupied','reserved','cleaning','maintenance')),
  billing_cycle  text not null default 'monthly' check (billing_cycle in ('daily','weekly','monthly','custom')),
  rent_monthly   numeric(12,2) not null default 0,
  price_nightly  numeric(12,2) not null default 0,
  deposit        numeric(12,2) not null default 0,
  ical_import_url text,
  note           text not null default '',
  unique (property_id, number)
);

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  full_name     text not null,
  nickname      text not null default '',
  phone         text not null default '',
  line_user_id  text,
  id_card_enc   bytea,                         -- encrypted at app layer
  emergency     text not null default '',
  note          text not null default '',
  created_at    timestamptz not null default now()
);

create table public.leases (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  room_id      uuid not null references public.rooms(id) on delete restrict,
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  start_date   date not null,
  end_date     date,
  rent         numeric(12,2) not null default 0,
  deposit      numeric(12,2) not null default 0,
  advance      numeric(12,2) not null default 0,
  elec_rate    numeric(8,2) not null default 8,
  water_rate   numeric(8,2) not null default 20,
  internet     numeric(12,2) not null default 0,
  ac_fee       numeric(12,2) not null default 0,
  parking      numeric(12,2) not null default 0,
  due_day      int not null default 5 check (due_day between 1 and 28),
  status       text not null default 'active' check (status in ('active','ended')),
  created_at   timestamptz not null default now()
);
create unique index one_active_lease_per_room on public.leases(room_id) where status = 'active';

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  room_id       uuid not null references public.rooms(id) on delete restrict,
  guest_name    text not null,
  guest_phone   text not null default '',
  check_in      date not null,
  check_out     date not null check (check_out > check_in),
  nightly_rate  numeric(12,2) not null default 0,
  deposit       numeric(12,2) not null default 0,
  source        text not null default 'direct' check (source in ('direct','airbnb','other')),
  external_uid  text,                          -- iCal UID for synced bookings
  status        text not null default 'confirmed'
                  check (status in ('confirmed','checked_in','checked_out','cancelled')),
  created_at    timestamptz not null default now(),
  -- no double booking of a room
  exclude using gist (room_id with =, daterange(check_in, check_out) with &&)
    where (status <> 'cancelled')
);

-- ───────────────────────── Billing ─────────────────────────

create table public.meter_readings (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  room_id      uuid not null references public.rooms(id) on delete cascade,
  read_on      date not null,
  elec         numeric(12,2),
  water        numeric(12,2),
  unique (room_id, read_on)
);

create table public.bills (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  room_id       uuid not null references public.rooms(id) on delete restrict,
  lease_id      uuid references public.leases(id),
  booking_id    uuid references public.bookings(id),
  bill_no       text not null,
  invoice_no    text not null,
  period_start  date not null,
  period_end    date not null,
  issue_date    date not null default current_date,
  due_date      date not null,
  total         numeric(12,2) not null,
  paid          numeric(12,2) not null default 0,
  status        text not null default 'unpaid' check (status in ('unpaid','partial','paid','void')),
  public_token  text not null unique default encode(gen_random_bytes(18), 'hex'),
  note          text not null default '',
  created_at    timestamptz not null default now(),
  unique (property_id, bill_no)
);

create table public.bill_items (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  bill_id     uuid not null references public.bills(id) on delete cascade,
  kind        text not null,                   -- rent, nightly, elec, water, internet, ac, parking, other, prev_balance, discount
  label       text not null,
  qty         numeric(12,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  amount      numeric(12,2) not null,
  sort        int not null default 0
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  bill_id      uuid references public.bills(id),
  room_id      uuid references public.rooms(id),
  receipt_no   text not null,
  paid_on      date not null default current_date,
  amount       numeric(12,2) not null check (amount > 0),
  method       text not null default 'transfer' check (method in ('cash','transfer','promptpay','card')),
  bank_ref     text not null default '',
  slip_path    text,
  created_at   timestamptz not null default now(),
  unique (property_id, receipt_no)
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  spent_on     date not null default current_date,
  category     text not null,
  description  text not null,
  amount       numeric(12,2) not null check (amount > 0),
  method       text not null default 'cash',
  supplier     text not null default '',
  receipt_path text,
  maintenance_id uuid,
  created_at   timestamptz not null default now()
);

create table public.maintenance (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  no           text not null,
  room_id      uuid references public.rooms(id),       -- null = common area
  category     text not null default 'อื่นๆ',
  problem      text not null,
  priority     text not null default 'normal' check (priority in ('normal','urgent','critical')),
  status       text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  reported_by  text not null default '',
  cost         numeric(12,2) not null default 0,
  created_at   timestamptz not null default now(),
  unique (property_id, no)
);

-- ───────────────────────── Subscription ─────────────────────────

create table public.topups (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  plan         text not null check (plan in ('starter','pro','business')),
  term         text not null check (term in ('intro','month','year')),
  days         int not null,
  amount       numeric(12,2) not null,
  status       text not null default 'pending' check (status in ('pending','paid','expired')),
  gateway_ref  text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

create table public.line_usage (
  property_id uuid not null references public.properties(id) on delete cascade,
  month       date not null,                  -- first day of month
  sent        int not null default 0,
  primary key (property_id, month)
);

create table public.doc_sequences (
  property_id uuid not null references public.properties(id) on delete cascade,
  name        text not null,                  -- bill, invoice, receipt, maintenance
  period      text not null,                  -- yyyymm
  value       int not null default 0,
  primary key (property_id, name, period)
);

-- ───────────────────────── Helpers ─────────────────────────

create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where property_id = p and user_id = auth.uid());
$$;

create or replace function public.is_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where property_id = p and user_id = auth.uid() and role = 'owner');
$$;

-- Writable while paid_until + 3 days grace has not passed.
create or replace function public.is_active(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from properties
    where id = p and paid_until is not null
      and paid_until + 3 >= (now() at time zone 'Asia/Bangkok')::date
  );
$$;

-- Race-free running numbers, e.g. BILL-202611-0001
create or replace function public.next_doc_no(p uuid, seq text, prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  per text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMM');
  v int;
begin
  if not is_member(p) then raise exception 'not a member'; end if;
  insert into doc_sequences (property_id, name, period, value) values (p, seq, per, 1)
  on conflict (property_id, name, period) do update set value = doc_sequences.value + 1
  returning value into v;
  return prefix || '-' || per || '-' || lpad(v::text, 4, '0');
end $$;

-- Sign-up step 2: create the user's property and owner membership.
create or replace function public.create_property(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into properties (name) values (p_name) returning id into pid;
  insert into members (property_id, user_id, role) values (pid, auth.uid(), 'owner');
  return pid;
end $$;

-- Public bill page (link sent via LINE): no login, token only.
create or replace function public.get_public_bill(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bill', to_jsonb(b) - 'public_token',
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort) from bill_items i where i.bill_id = b.id), '[]'::jsonb),
    'room', r.number,
    'property', jsonb_build_object('name', p.name, 'phone', p.phone, 'address', p.address,
                                   'promptpay_id', p.promptpay_id, 'account_name', p.account_name)
  )
  from bills b join rooms r on r.id = b.room_id join properties p on p.id = b.property_id
  where b.public_token = p_token and b.status <> 'void';
$$;

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles       enable row level security;
alter table public.properties     enable row level security;
alter table public.members        enable row level security;
alter table public.rooms          enable row level security;
alter table public.tenants        enable row level security;
alter table public.leases         enable row level security;
alter table public.bookings       enable row level security;
alter table public.meter_readings enable row level security;
alter table public.bills          enable row level security;
alter table public.bill_items     enable row level security;
alter table public.payments       enable row level security;
alter table public.expenses       enable row level security;
alter table public.maintenance    enable row level security;
alter table public.topups         enable row level security;
alter table public.line_usage     enable row level security;
alter table public.doc_sequences  enable row level security;

create policy profiles_self on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy properties_read on public.properties for select using (is_member(id));
create policy properties_update on public.properties for update using (is_owner(id)) with check (is_owner(id));
-- Members may edit branding only; plan / paid_until / intro_used stay server-side.
revoke update on public.properties from authenticated;
grant update (name, phone, address, promptpay_id, account_name, doc_prefix) on public.properties to authenticated;

create policy members_read on public.members for select using (is_member(property_id));
create policy members_owner_write on public.members for all
  using (is_owner(property_id)) with check (is_owner(property_id));

-- Business tables: members read always; write only while subscription is active.
do $$
declare t text;
begin
  foreach t in array array['rooms','tenants','leases','bookings','meter_readings','bills',
                           'bill_items','payments','expenses','maintenance'] loop
    execute format('create policy %1$s_read on public.%1$s for select using (is_member(property_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (is_member(property_id) and is_active(property_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (is_member(property_id) and is_active(property_id)) with check (is_member(property_id) and is_active(property_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (is_owner(property_id) and is_active(property_id))', t);
  end loop;
end $$;

create policy topups_read on public.topups for select using (is_member(property_id));
create policy line_usage_read on public.line_usage for select using (is_member(property_id));
-- topups / line_usage / doc_sequences are written by the server (service role) or definer functions only.

grant execute on function public.get_public_bill(text) to anon, authenticated;
