-- ============================================================
-- My Money MCP — Supabase Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- ==================== Accounts ====================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('bank', 'credit_card', 'cash', 'wallet', 'savings', 'investment')),
  balance numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_accounts_is_active on accounts (is_active);

-- ==================== Transactions ====================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric not null check (amount >= 0),
  category text not null,
  account_id uuid not null references accounts (id),
  description text,
  payment_method text check (payment_method in ('upi', 'card', 'cash', 'netbanking', 'wallet')),
  tags text[],
  transfer_to_account_id uuid references accounts (id),
  transfer_id text,
  created_at timestamptz not null default now()
);

create index idx_transactions_date on transactions (date);
create index idx_transactions_type on transactions (type);
create index idx_transactions_category on transactions (category);
create index idx_transactions_account_id on transactions (account_id);
create index idx_transactions_transfer_id on transactions (transfer_id);

-- ==================== Budgets ====================
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  month text not null,  -- format: YYYY-MM
  limit_amount numeric not null check (limit_amount >= 0),
  created_at timestamptz not null default now(),
  unique (category, month)
);

create index idx_budgets_month on budgets (month);

-- ==================== Categories ====================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('income', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_categories_type on categories (type);

-- ==================== Recurring Transactions ====================
create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null check (amount >= 0),
  category text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  next_due_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_recurring_next_due on recurring_transactions (next_due_date);
create index idx_recurring_is_active on recurring_transactions (is_active);

-- ==================== Account Balances View ====================
-- Calculates current balance from initial balance + income - expenses - outgoing transfers + incoming transfers
create or replace view account_balances as
select
  a.id,
  a.name,
  a.type,
  a.balance as initial_balance,
  a.balance
    + coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0)
    - coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0)
    - coalesce(sum(case when t.type = 'transfer' then t.amount else 0 end), 0)
    + coalesce(incoming.total, 0)
    as current_balance
from accounts a
left join transactions t on t.account_id = a.id
left join (
  select transfer_to_account_id as account_id, sum(amount) as total
  from transactions
  where type = 'transfer' and transfer_to_account_id is not null
  group by transfer_to_account_id
) incoming on incoming.account_id = a.id
where a.is_active = true
group by a.id, a.name, a.type, a.balance, incoming.total;

-- ==================== Row Level Security ====================
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table categories enable row level security;
alter table recurring_transactions enable row level security;

-- Allow full access for authenticated users (single-user setup)
-- Adjust these policies if you need multi-user support
create policy "Allow all for authenticated users" on accounts
  for all using (auth.role() = 'authenticated');

create policy "Allow all for authenticated users" on transactions
  for all using (auth.role() = 'authenticated');

create policy "Allow all for authenticated users" on budgets
  for all using (auth.role() = 'authenticated');

create policy "Allow all for authenticated users" on categories
  for all using (auth.role() = 'authenticated');

create policy "Allow all for authenticated users" on recurring_transactions
  for all using (auth.role() = 'authenticated');

-- Also allow access via the anon key (service role / API key usage)
create policy "Allow all for anon" on accounts
  for all using (auth.role() = 'anon');

create policy "Allow all for anon" on transactions
  for all using (auth.role() = 'anon');

create policy "Allow all for anon" on budgets
  for all using (auth.role() = 'anon');

create policy "Allow all for anon" on categories
  for all using (auth.role() = 'anon');

create policy "Allow all for anon" on recurring_transactions
  for all using (auth.role() = 'anon');

-- ==================== Default Categories ====================
insert into categories (name, type) values
  -- Expense categories
  ('Food & Dining', 'expense'),
  ('Transport', 'expense'),
  ('Shopping', 'expense'),
  ('Rent', 'expense'),
  ('Utilities', 'expense'),
  ('Entertainment', 'expense'),
  ('Health', 'expense'),
  ('Education', 'expense'),
  ('Groceries', 'expense'),
  ('Subscriptions', 'expense'),
  ('Travel', 'expense'),
  ('Insurance', 'expense'),
  ('Personal Care', 'expense'),
  ('Gifts & Donations', 'expense'),
  ('Transfer', 'expense'),
  ('Other', 'expense'),
  -- Income categories
  ('Salary', 'income'),
  ('Freelance', 'income'),
  ('Investments', 'income'),
  ('Refund', 'income'),
  ('Other Income', 'income')
on conflict (name) do nothing;
