-- Script para criar tabelas e permitir acesso público (anon) para testes
-- Execute no SQL Editor do Supabase

-- Permite gerar UUIDs
create extension if not exists "pgcrypto";

-- Tabela de perfis de usuário (para lookup por username)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text unique,
  full_name text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
-- Permite leitura pública de email/username (necessário para login por username)
create policy "Allow public select on profiles" on profiles for select using (true);
-- Permite que o próprio usuário gerencie seu perfil
create policy "Allow insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Allow update own profile" on profiles for update using (auth.uid() = id);

-- Tabela de emissores
create table if not exists issuers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  created_at timestamptz default now()
);

-- Tabela de clientes
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj_cpf text,
  created_at timestamptz default now()
);

-- Tabela de orçamentos (itens em jsonb para simplificar)
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  issuer_id uuid references issuers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  numero text,
  items jsonb not null, -- array de itens
  subtotal numeric(12,2) default 0,
  impostos numeric(12,2) default 0,
  desconto numeric(12,2) default 0,
  total numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- Habilitar Row Level Security e criar políticas públicas de teste para cada tabela.
-- ATENÇÃO: isto permite acesso público via anon key. Para produção, ajuste políticas.

alter table issuers enable row level security;
create policy "Allow public on issuers" on issuers for all using (true) with check (true);

alter table clients enable row level security;
create policy "Allow public on clients" on clients for all using (true) with check (true);

alter table quotes enable row level security;
create policy "Allow public on quotes" on quotes for all using (true) with check (true);