-- Banco local da Soluções Rápidas (PostgreSQL 17), substituto do Airtable.
--
-- Os nomes de tabelas e campos são os mesmos do Airtable, de propósito: os fluxos
-- do n8n continuam lendo os mesmos nomes. Por isso ficam entre aspas.
--
-- Diferenças em relação ao Airtable:
-- - "id" guarda o mesmo id do Airtable (recXXXXXXXXXXXXXX) nos registros importados;
--   registros novos ganham um id no mesmo formato.
-- - Vínculo entre tabelas fica só do lado "filho" (ex.: o local aponta para o cliente).
--   O lado "mãe" do Airtable (ex.: Entidades.Locais_Atendimento) vira consulta.
-- - Campos de consulta (lookup) e fórmula viram consulta ou valor padrão.
-- - Anexos ficam como lista em JSON (nome + caminho do arquivo na pasta de anexos).
-- - "Criado_Em" existe em todas as tabelas.

create or replace function novo_id() returns text
language sql volatile as $$
  select 'rec' || string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
                                    1 + floor(random() * 62)::int, 1), '')
  from generate_series(1, 14)
$$;

-- ===================== Base "cadastro" =====================

create table "Entidades_Cadastradas" (
  id text primary key default novo_id(),
  "CPF_CNPJ" text,
  "Razao_Social_Nome" text,
  "Nome_Fantasia_Identificador" text,
  "Tipo_Documento" text,             -- CNPJ - Condomínio | CNPJ - Empresa | CPF - Pessoa Física
  "Exigencia_Fiscal" text,           -- Exige Nota Fiscal | Apenas Recibo
  "Emails_Financeiro_NFE" text,
  "WhatsApp_CNPJ" text,
  "Administradora" text,
  "Empresa_Sindicos" text,
  "Status" text,                    -- Ativo | Inativo
  "Observacoes" text,
  "Asaas_Customer_Id" text,
  "Criado_Em" timestamptz not null default now()
);
create index on "Entidades_Cadastradas" ("CPF_CNPJ");

create table "Locais_Atendimento" (
  id text primary key default novo_id(),
  "Nome_do_Local" text,
  "Endereco_Completo" text,
  "Bairro_Cidade" text,
  "Observacoes_Acesso" text,
  "Cliente_Vinculado" text references "Entidades_Cadastradas"(id) on delete set null,
  "Status" text,                    -- Ativo | Inativo | Arquivado
  "Observacoes" text,
  "Criado_Em" timestamptz not null default now()
);
create index on "Locais_Atendimento" ("Cliente_Vinculado");

create table "Contatos_Solicitantes" (
  id text primary key default novo_id(),
  "Nome_Contato" text,
  "Cargo_Funcao" text,               -- Síndico | Administradora | Gerente | Zelador | Proprietário | Outro
  "Entidades_Vinculadas" text[] not null default '{}',  -- um contato pode atender mais de um cliente
  "Observacoes" text,
  "Status" text,                    -- Ativo | Inativo | Arquivado
  "WhatsApps" text,                  -- um por linha
  "Emails" text,                     -- um por linha
  "Criado_Em" timestamptz not null default now()
);
create index on "Contatos_Solicitantes" using gin ("Entidades_Vinculadas");

create table "Chamados" (
  id text primary key default novo_id(),
  "Numero_Chamado" integer unique,
  "Cliente_Ref" text references "Entidades_Cadastradas"(id) on delete set null,
  "Cliente_Nome" text,
  "Cliente_Documento" text,
  "Endereco_Copia" text,
  "Contato_Nome" text,
  "Contato_WhatsApp" text,
  "Contato_Email" text,
  "Local_Exato" text,
  "Descricao_Solicitacao" text,
  "Anexos" jsonb not null default '[]',
  "Observacoes_Servico" text,
  "Status" text,                     -- Aguardando confirmação de data | Agendado | Em andamento | Concluído | Cancelado
  "Horario_Combinado_Cliente" text,  -- HH:MM
  "Reservado_Inicio" timestamptz,
  "Duracao_Escolhida" text,          -- 1h | 2h | 3h | Período manhã | Período tarde | Dia inteiro
  "Reservado_Fim" timestamptz,
  "Historico" text,
  "Tipo_Chamado" text,               -- Atendimento | Orçamento
  "Orcamento_Valor_Material" numeric(12,2),
  "Orcamento_Valor_MaoDeObra" numeric(12,2),
  "Orcamento_Valor_Aproximado" numeric(12,2),
  "Orcamento_Forma_Pagamento" text,
  "Orcamento_Detalhes" text,
  "Orcamento_Situacao" text,         -- Finalizado
  "Criado_Em" timestamptz not null default now()
);
create index on "Chamados" ("Cliente_Ref");
create index on "Chamados" ("Reservado_Inicio");

create table "Visitas" (
  id text primary key default novo_id(),
  "Visita" text,
  "Chamado" text references "Chamados"(id) on delete set null,
  "Situacao" text,                   -- Em andamento | Concluída
  "Inicio_Real" timestamptz,
  "Fim_Real" timestamptz,
  "Resumo" text,
  "Recebido_Por" text,
  "Iniciado_Por" text,
  "Concluido_Por" text,
  "Reservado_Antes" text,            -- JSON com os horários antes do empurrão (para desfazer)
  "Criado_Em" timestamptz not null default now()
);
create index on "Visitas" ("Chamado");

create table "Usuarios" (
  id text primary key default novo_id(),
  "Nome" text,
  "Email" text,
  "Senha_Hash" text,
  "Papel" text,                      -- Dono | Usuario
  "Ativo" boolean not null default false,
  "Codigo_Recuperacao_Hash" text,
  "Codigo_Expira_Em" timestamptz,
  "Codigo_Tentativas" integer,
  "Confirmacao_Falhas" integer,
  "Confirmacao_Bloqueada_Ate" timestamptz,
  "Historico" text,
  "Criado_Em" timestamptz not null default now()
);
create unique index on "Usuarios" (lower("Email"));

create table "Sessoes" (
  id text primary key default novo_id(),
  "Token" text,
  "Usuario" text references "Usuarios"(id) on delete cascade,
  "Dispositivo" text,
  "Expira_Em" timestamptz,
  "Criado_Em" timestamptz not null default now()
);
create index on "Sessoes" ("Token");
create index on "Sessoes" ("Usuario");

-- ===================== Base "Financeiro" =====================

create table "Fornecedores" (
  id text primary key default novo_id(),
  "Nome" text,
  "CNPJ" text,
  "Observacoes" text,
  "Criado_Em" timestamptz not null default now()
);

create table "Cartoes" (
  id text primary key default novo_id(),
  "Nome" text,
  "Banco" text,
  "Bandeira" text,                   -- Visa | Mastercard | Elo | American Express | Hipercard | Outra
  "Final" text,
  "Chave_PIX" text,
  "Tipo_Chave_PIX" text,             -- CNPJ | CPF | EMAIL | PHONE | EVP
  "Dia_Fechamento" integer,
  "Dia_Vencimento" integer,
  "Limite" numeric(12,2),
  "Ativo" boolean not null default false,
  "Observacoes" text,
  "Criado_Em" timestamptz not null default now()
);

create table "Recorrentes" (
  id text primary key default novo_id(),
  "Descricao" text,
  "Valor" numeric(12,2),
  "Fornecedor_Ref" text references "Fornecedores"(id) on delete set null,
  "Categoria" text,
  "Forma_Pagamento" text,
  "Dia_Do_Mes" integer,
  "Restantes" integer,
  "Sem_Fim" boolean not null default false,
  "Ativo" boolean not null default false,
  "Proxima_Geracao" date,
  "Observacoes" text,
  "Criado_Em" timestamptz not null default now()
);

create table "Recebimentos" (
  id text primary key default novo_id(),
  "Descricao" text,
  "Valor" numeric(12,2),
  "Cliente_Nome" text,
  "Cliente_Documento" text,
  "Vencimento" date,
  "Status" text,                     -- Pendente | Recebido | Cancelado
  "Data_Recebimento" date,
  "Forma" text,                      -- PIX | Boleto | Dinheiro | Transferência | Cartão
  "Asaas_Cobranca_Id" text,
  "Asaas_Cliente_Id" text,
  "Asaas_Link" text,
  "Observacoes" text,
  "Comprovantes" jsonb not null default '[]',
  "Material_Valor" numeric(12,2),
  "Criado_Em" timestamptz not null default now()
);

create table "Despesas" (
  id text primary key default novo_id(),
  "Descricao" text,
  "Valor" numeric(12,2),
  "Fornecedor" text,                 -- campo antigo (texto solto), mantido só para não perder dado
  "Vencimento" date,
  "Status" text,                     -- Pendente | Pago
  "Categoria" text,
  "Data_Pagamento" date,
  "Observacoes" text,
  "Forma_Pagamento" text,
  "Parcela_Numero" integer,
  "Parcela_Total" integer,
  "Grupo" text,
  "Fornecedor_Ref" text references "Fornecedores"(id) on delete set null,
  "Recorrente_Ref" text references "Recorrentes"(id) on delete set null,
  "Comprovantes" jsonb not null default '[]',
  "Servico_Ref" text references "Recebimentos"(id) on delete set null,
  "Cartao_Ref" text references "Cartoes"(id) on delete set null,
  "Criado_Em" timestamptz not null default now()
);
create index on "Despesas" ("Vencimento");
create index on "Despesas" ("Grupo");

create table "Config_Financeiro" (
  id text primary key default novo_id(),
  "Chave" text,
  "Saldo_Inicial" numeric(12,2),
  "Data_Saldo_Inicial" date,
  "Reserva_Meta" numeric(12,2),
  "Giro_Meta" numeric(12,2),
  "Regime" text,                     -- MEI | Simples Nacional | Outro
  "Imposto_Fixo_Mensal" numeric(12,2),
  "Aliquota_Imposto" numeric(9,4),   -- fração: 0,06 = 6%
  "Teto_Anual" numeric(12,2),
  "Folha_Mensal" numeric(12,2),
  "Provisiona_Decimo_Ferias" boolean not null default false,
  "Socio_1_Nome" text,
  "Socio_1_Percentual" numeric(9,6),
  "Socio_2_Nome" text,
  "Socio_2_Percentual" numeric(9,6),
  "Criado_Em" timestamptz not null default now()
);

create table "Conferencias" (
  id text primary key default novo_id(),
  "Data" date,
  "Saldo_Informado" numeric(12,2),
  "Saldo_Calculado" numeric(12,2),
  "Diferenca" numeric(12,2),
  "Observacoes" text,
  "Criado_Em" timestamptz not null default now()
);

create table "Retiradas" (
  id text primary key default novo_id(),
  "Data" date,
  "Socio" text,
  "Valor" numeric(12,2),
  "Observacoes" text,
  "Criado_Em" timestamptz not null default now()
);

create table "Pagamentos_Fatura" (
  id text primary key default novo_id(),
  "Data" date,
  "Cartao_Ref" text references "Cartoes"(id) on delete set null,
  "Vencimento_Fatura" date,
  "Valor" numeric(12,2),
  "Valor_Calculado" numeric(12,2),
  "Status" text,                     -- Enviado | Falhou
  "Asaas_Transfer_Id" text,
  "Observacoes" text,
  "Metodo" text,                     -- PIX | Boleto
  "Criado_Em" timestamptz not null default now()
);
create index on "Pagamentos_Fatura" ("Cartao_Ref");

-- Usuário que o n8n usa: lê e grava dados, mas não muda a estrutura.
-- (a senha é definida fora deste arquivo; ver C:\Users\rediv\senha-banco.txt)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'n8n_app') then
    create role n8n_app login;
  end if;
end $$;
grant usage on schema public to n8n_app;
grant select, insert, update, delete on all tables in schema public to n8n_app;
grant execute on function novo_id() to n8n_app;
