-- Kitchenly's database. Run this whole file once in Supabase → SQL Editor.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  emoji text not null default '🍳',
  color text not null default 'sage',
  badge text not null default '',
  stock integer not null default 0 check (stock >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null,
  phone text not null,
  address text not null,
  city text not null,
  note text not null default '',
  payment_method text not null default 'cash_on_delivery' check (payment_method in ('cash_on_delivery')),
  status text not null default 'pending' check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  shipping_fee numeric(10,2) not null default 0 check (shipping_fee >= 0),
  total numeric(10,2) not null check (total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null
);

-- New Google users get a profile row automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products" on public.products
  for select using (is_active = true);
drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Users manage their own cart" on public.cart_items;
create policy "Users manage their own cart" on public.cart_items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can read their own orders" on public.orders;
create policy "Users can read their own orders" on public.orders
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read items in their own orders" on public.order_items;
create policy "Users can read items in their own orders" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
  );

grant select on public.products to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select on public.orders, public.order_items to authenticated;

-- This function prices products from the database, writes the order and item snapshots,
-- reduces stock, and empties the signed-in shopper's bag in one transaction.
create or replace function public.place_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_city text,
  p_note text default '',
  p_payment_method text default 'cash_on_delivery'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_item record;
begin
  if v_user_id is null then raise exception 'Sign in before placing your order.'; end if;
  if coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_phone), '') = ''
     or coalesce(trim(p_address), '') = '' or coalesce(trim(p_city), '') = '' then
    raise exception 'Please complete your delivery details.';
  end if;
  if p_payment_method <> 'cash_on_delivery' then raise exception 'That payment method is not available.'; end if;

  -- Lock chosen stock and bag rows, so two checkouts cannot sell the last item at once.
  for v_item in
    select ci.product_id, ci.quantity, p.name, p.price, p.stock
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = v_user_id and p.is_active = true
    order by ci.product_id
    for update of ci, p
  loop
    if v_item.stock < v_item.quantity then
      raise exception 'Not enough stock for %.', v_item.name;
    end if;
    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  end loop;

  if v_subtotal = 0 then raise exception 'Your bag is empty.'; end if;

  insert into public.orders (user_id, customer_name, phone, address, city, note, payment_method, subtotal, total)
  values (v_user_id, trim(p_customer_name), trim(p_phone), trim(p_address), trim(p_city), coalesce(trim(p_note), ''), p_payment_method, v_subtotal, v_subtotal)
  returning id into v_order_id;

  for v_item in
    select ci.product_id, ci.quantity, p.name, p.price
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = v_user_id and p.is_active = true
    order by ci.product_id
  loop
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
    values (v_order_id, v_item.product_id, v_item.name, v_item.price, v_item.quantity, v_item.price * v_item.quantity);
    update public.products set stock = stock - v_item.quantity where id = v_item.product_id;
  end loop;

  delete from public.cart_items where user_id = v_user_id;
  return v_order_id;
end;
$$;

revoke all on function public.place_order(text, text, text, text, text, text) from public, anon;
grant execute on function public.place_order(text, text, text, text, text, text) to authenticated;

insert into public.products (name, category, description, price, emoji, color, badge, stock, sort_order) values
  ('The Everyday Spatula', 'Tools', 'A flexible, heat-safe little helper.', 14.00, '🥄', 'peach', 'BESTSELLER', 42, 1),
  ('Sunday Chef Knife', 'Prep', 'Balanced, sharp, ready for anything.', 48.00, '🔪', 'sage', 'STAFF PICK', 18, 2),
  ('Olivewood Spoon Set', 'Tools', 'Two smooth spoons made for slow stirring.', 26.00, '🥢', 'butter', '', 31, 3),
  ('Cloud Nine Whisk', 'Tools', 'Whips cream and pancake batter with ease.', 18.00, '🥄', 'lilac', 'NEW', 24, 4),
  ('Sunday Prep Bowls', 'Prep', 'A nesting trio for chopping, mixing, serving.', 39.00, '🥣', 'blue', '', 16, 5),
  ('The Market Apron', 'Textiles', 'Soft cotton, generous pockets, less mess.', 34.00, '🧑‍🍳', 'rose', '', 27, 6)
on conflict (name) do nothing;

