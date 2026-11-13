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
  "Atendido_Por" text default 'CNPJ 1' check ("Atendido_Por" in ('CNPJ 1', 'CNPJ 2')),  -- 08/11/2026
  "Asaas_Conta" text check ("Asaas_Conta" in ('CNPJ 1', 'CNPJ 2')),  -- em qual Asaas está o Asaas_Customer_Id
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
  "Empresas" text,                   -- onde a pessoa trabalha (não é o cliente), uma por linha; 27/10/2026
  "Criado_Em" timestamptz not null default now()
);
create index on "Contatos_Solicitantes" using gin ("Entidades_Vinculadas");

-- Sindicaturas (empresas de síndicos), 28/10/2026. Só o nome por enquanto. Quem trabalha
-- nela é quem tem o mesmo nome em Contatos_Solicitantes."Empresas" (sem diferenciar acento,
-- maiúscula nem pontuação), não um vínculo por id.
create table "Sindicaturas" (
  id text primary key default novo_id(),
  "Nome" text not null,
  "Criado_Em" timestamptz not null default now()
);

-- Administradoras de condomínio, 28/10/2026: nome e e-mails. Ficam ligadas aos CLIENTES (não aos
-- contatos), pelo mesmo nome em Entidades_Cadastradas."Administradora" (sem diferenciar
-- acento, maiúscula nem pontuação).
create table "Administradoras" (
  id text primary key default novo_id(),
  "Nome" text not null,
  "Emails" text,                     -- um por linha
  "Criado_Em" timestamptz not null default now()
);

-- Cadastro de e-mails, 31/10/2026: todo e-mail do sistema (financeiro dos clientes, contatos,
-- administradoras, chamados), com "a quem pertence" opcional. Serve de sugestão em todo campo
-- de e-mail. O fluxo "App - E-mails" acrescenta sozinho os que aparecem nos outros cadastros.
create table "Emails" (
  id text primary key default novo_id(),
  "Email" text not null,
  "Pertence" text,
  "Criado_Em" timestamptz not null default now()
);
create unique index on "Emails" (lower("Email"));

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
  -- Gasto de deslocamento (09/11/2026), calculado toda noite pela rota do dia:
  "Km_Deslocamento" numeric(8,1),
  "Custo_Deslocamento" numeric(10,2),
  "Custo_Detalhe" text,              -- JSON: custo por km de cada parte (combustível, pneus...) e o preço usado
  "Calculado_Em" timestamptz,
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

-- Notas fiscais emitidas pelo sistema (API da Sefin, com o certificado A1), 04/11/2026.
-- A linha nasce "Enviando" antes do envio: é ela que reserva o número da DPS (o índice único
-- impede repetir). Tomador e obra ficam copiados aqui porque a nota não muda se o cadastro mudar.
create table "Notas_Fiscais" (
  id text primary key default novo_id(),
  "Ambiente" text not null,          -- Producao | Testes
  "Emissor" text not null default 'CNPJ 1' check ("Emissor" in ('CNPJ 1', 'CNPJ 2')),  -- qual MEI emitiu (13/11/2026)
  "Serie" integer not null,
  "Numero_DPS" integer not null,
  "Id_DPS" text,
  "Status" text not null,            -- Enviando | Emitida | Recusada | Sem resposta
  "Chave_Acesso" text,
  "Numero_NFSe" text,
  "Situacao" text,                   -- cStat devolvido pelo governo (107 = NFS-e do MEI)
  "Cliente_Ref" text references "Entidades_Cadastradas"(id) on delete set null,
  "Tomador_Documento" text,
  "Tomador_Nome" text,
  "Obra" text,
  "Descricao" text,
  "Valor" numeric(12,2),
  "Competencia" date,
  "Erro" text,
  "Xml_Nota" text,
  "Emitida_Em" timestamptz,
  "Criado_Em" timestamptz not null default now()
);
create unique index on "Notas_Fiscais" ("Ambiente", "Emissor", "Serie", "Numero_DPS");
create index on "Notas_Fiscais" ("Cliente_Ref");

-- Os dois CNPJs (MEIs) da mesma empresa, 08/11/2026. Cada cliente diz por qual é atendido
-- (Entidades_Cadastradas."Atendido_Por"). Os dados reais ficam só no banco, não neste arquivo.
create table "Empresas_Emissoras" (
  id text primary key default novo_id(),
  "Codigo" text not null unique check ("Codigo" in ('CNPJ 1', 'CNPJ 2')),
  "CNPJ" text,
  "Titular" text,
  "Banco" text,
  "Agencia" text,
  "Conta" text,
  "Chave_PIX" text,
  "Credencial_Asaas" text,         -- id da credencial do Asaas no n8n
  -- Certificado A1 de cada CNPJ (11/11/2026): fica instalado no Windows (Cert:CurrentUserMy); aqui só
  -- a impressão digital, a validade e onde está o .pfx (nunca a senha nem o arquivo).
  "Certificado_Thumbprint" text,
  "Certificado_Validade" date,
  "Certificado_Arquivo" text,
  "Observacoes" text,
  "Criado_Em" timestamptz not null default now()
);

-- Veículo da empresa e o documento dele (CRLV), 08/11/2026. Os dados reais ficam só no banco.
create table "Veiculos" (
  id text primary key default novo_id(),
  "Documento" jsonb not null default '[]',
  "Placa" text,
  "Marca_Modelo" text,
  "Especie_Tipo" text,
  "Carroceria" text,
  "Categoria" text,
  "Cor" text,
  "Combustivel" text,
  "Ano_Fabricacao" text,
  "Ano_Modelo" text,
  "Renavam" text,
  "Chassi" text,
  "Motor" text,
  "Numero_CRV" text,
  "Codigo_Seguranca_CLA" text,
  "CAT" text,
  "Placa_Anterior" text,
  "Potencia_Cilindrada" text,
  "Capacidade" text,
  "Lotacao" text,
  "Peso_Bruto_Total" text,
  "CMT" text,
  "Eixos" text,
  "Proprietario_Nome" text,
  "Proprietario_Documento" text,
  "Local" text,
  "Data_Documento" text,
  "Exercicio" text,
  "Observacoes" text,
  "Consumo_Km_L" numeric(5,2) check ("Consumo_Km_L" > 0 and "Consumo_Km_L" < 100), -- digitado pelo dono, fora do documento
  "Preco_Litro" numeric(6,3) check ("Preco_Litro" > 0 and "Preco_Litro" < 100),        -- idem (09/11/2026), R$ por litro
  "Manutencao_Km" numeric(6,3) check ("Manutencao_Km" > 0 and "Manutencao_Km" < 100),  -- idem (13/11/2026), R$ de manutenção por km
  "Ipva_Ano" numeric(10,2) check ("Ipva_Ano" > 0 and "Ipva_Ano" < 1000000),  -- idem (13/11/2026), IPVA em R$ por ano
  "Ipva_Km" numeric(6,3) check ("Ipva_Km" > 0 and "Ipva_Km" < 100),  -- idem, IPVA em R$ por km (o que entra na conta)
  "Seguro_Mes" numeric(10,2) check ("Seguro_Mes" > 0 and "Seguro_Mes" < 1000000),  -- idem (13/11/2026), seguro em R$ por mês
  "Seguro_Km" numeric(6,3) check ("Seguro_Km" > 0 and "Seguro_Km" < 100),  -- idem, seguro em R$ por km (o que entra na conta)
  "Criado_Em" timestamptz not null default now()
);

-- Pneus do veículo (09/11/2026): um por posição, preenchidos à mão pelo dono.
create table "Pneus" (
  id text primary key default novo_id(),
  "Posicao" text not null unique check ("Posicao" in ('Dianteiro esquerdo', 'Dianteiro direito', 'Traseiro esquerdo', 'Traseiro direito', 'Estepe')),
  "Marca" text,
  "Modelo" text,
  "Valor_Pago" numeric(10,2) check ("Valor_Pago" >= 0),
  "Data_Troca" date,
  "Desgaste_R_Km" numeric(10,4) check ("Desgaste_R_Km" >= 0),
  "Criado_Em" timestamptz not null default now()
);

-- Coordenadas de cada endereço já consultado no mapa (OpenStreetMap), 09/11/2026: cada endereço
-- é consultado uma vez só. "Achou" = false guarda que não foi encontrado (não tenta de novo).
create table "Geo_Enderecos" (
  id text primary key default novo_id(),
  "Endereco" text not null unique,
  "Consulta" text,
  "Lat" numeric(10,7),
  "Lon" numeric(10,7),
  "Achou" boolean not null default false,
  "Consultado_Em" timestamptz not null default now(),
  "Criado_Em" timestamptz not null default now()
);

-- Arquivos de cada cliente (13/11/2026): cada PDF gerado no app (orçamento, recibo, comunicado, laudo) fica
-- guardado aqui, ligado ao cliente do cadastro, para ver e buscar depois. O PDF em si fica na pasta de
-- anexos do PC (coluna "Arquivo"). "Texto_Busca" junta o que foi digitado, para a busca por palavras;
-- "Hash_PDF" evita guardar duas vezes o mesmo PDF do mesmo cliente. NFS-e não entra aqui: já está em
-- "Notas_Fiscais" (as emitidas pelo sistema); "nfs" aqui é só o PDF de nota feita fora do sistema (importada).
-- "servico" e "relatorio_tecnico" estão previstos e ainda serão definidos.
create table "Arquivos_Cliente" (
  id text primary key default novo_id(),
  "Cliente_Ref" text references "Entidades_Cadastradas"(id) on delete set null,
  "Cliente_Nome" text,                -- nome como saiu no documento
  "Tipo" text not null check ("Tipo" in ('nfs','orcamento','recibo','comunicado','laudo','servico','relatorio_tecnico')),
  "Titulo" text not null,
  "Descricao" text,
  "Texto_Busca" text,
  "Data_Documento" date,
  "Valor" numeric(12,2),
  "Emissor" text not null default 'CNPJ 1' check ("Emissor" in ('CNPJ 1','CNPJ 2')),
  "Origem" text not null default 'gerado' check ("Origem" in ('gerado','importado')),
  "Hash_PDF" text,
  "Dados_Json" text,                  -- dados usados no documento, para refazer
  "Arquivo" jsonb not null default '[]',
  "Criado_Em" timestamptz not null default now()
);
create index on "Arquivos_Cliente" ("Cliente_Ref", "Tipo", "Data_Documento");
create index on "Arquivos_Cliente" ("Hash_PDF");

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
