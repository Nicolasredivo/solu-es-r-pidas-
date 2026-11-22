-- Cobranças pelo Asaas: boletos, notas e recibos ligados ao "A receber" e às entradas de dinheiro (20/11/2026).
--
-- Por que a lógica mora aqui, no banco: o "Airtable local" só enxerga coluna e tabela nova depois que o atalho
-- "Servidor n8n" é reaberto. As cobranças conversam com o banco direto (credencial Postgres do n8n), então
-- funcionam na hora, e cada regra fica testável sozinha (banco/testes/testar-cobrancas.js).
--
-- CUIDADO ao mexer: o Airtable local lê TODAS as colunas do banco quando liga e não sobe se achar um tipo que não
-- conhece. Só use: text, integer, numeric, boolean, date, timestamptz, jsonb e text[].
--
-- Rodar de novo é seguro: tudo é "if not exists" / "create or replace".

-- ========================= colunas novas no A receber =========================
alter table "Recebimentos"
  add column if not exists "Cliente_Ref" text references "Entidades_Cadastradas"(id) on delete set null,
  add column if not exists "Nota_Ref" text references "Notas_Fiscais"(id) on delete set null,
  add column if not exists "Arquivo_Ref" text references "Arquivos_Cliente"(id) on delete set null,
  add column if not exists "Origem" text,          -- nota | recibo | avulsa | asaas (vazio = lançado à mão)
  add column if not exists "Emissor" text,         -- CNPJ 1 | CNPJ 2
  add column if not exists "Grupo" text,           -- parcelas de uma mesma cobrança
  add column if not exists "Parcela_Numero" integer,
  add column if not exists "Parcela_Total" integer,
  add column if not exists "Asaas_Conta" text,     -- em qual Asaas está o Asaas_Cobranca_Id
  add column if not exists "Asaas_Status" text,    -- CRIANDO | ERRO | PENDING | OVERDUE | RECEIVED | ...
  add column if not exists "Boleto_Url" text,
  add column if not exists "Visto_Em" timestamptz,
  add column if not exists "Valor_Pago" numeric(12,2),
  add column if not exists "Valor_Liquido" numeric(12,2),
  add column if not exists "Taxa" numeric(12,2),
  add column if not exists "Multa_Juros" numeric(12,2),
  add column if not exists "Baixa_Por" text,       -- asaas | conciliacao | manual
  add column if not exists "Baixa_Ref" text,       -- entrada (transação) que deu a baixa
  add column if not exists "Aviso" text,           -- o que precisa da atenção do dono
  add column if not exists "Atualizado_Em" timestamptz;

create unique index if not exists recebimentos_asaas_unico on "Recebimentos" ("Asaas_Cobranca_Id")
  where "Asaas_Cobranca_Id" is not null and "Asaas_Cobranca_Id" <> '';
create unique index if not exists recebimentos_grupo_parcela on "Recebimentos" ("Grupo", "Parcela_Numero")
  where "Grupo" is not null;
create unique index if not exists recebimentos_arquivo_unico on "Recebimentos" ("Arquivo_Ref") where "Arquivo_Ref" is not null;
create index if not exists recebimentos_nota on "Recebimentos" ("Nota_Ref");
create index if not exists recebimentos_status on "Recebimentos" ("Status");

-- ========================= tabelas novas =========================
-- Histórico de cada cobrança (o "rastreamento"). Chave = trava contra repetir o mesmo acontecimento.
create table if not exists "Cobranca_Eventos" (
  id text primary key default novo_id(),
  "Recebimento_Ref" text references "Recebimentos"(id) on delete cascade,
  "Quando" timestamptz not null default now(),
  "Tipo" text not null,
  "Texto" text,
  "Chave" text unique,
  "Dados" jsonb not null default '{}',
  "Criado_Em" timestamptz not null default now()
);
create index if not exists cobranca_eventos_rec on "Cobranca_Eventos" ("Recebimento_Ref", "Quando");

-- Dinheiro que entrou no Asaas sem ser por um boleto nosso (PIX direto na chave, cobrança feita à mão...):
-- cada entrada vira uma linha, e o sistema procura de qual nota, recibo ou boleto ela é.
create table if not exists "Conciliacao" (
  id text primary key default novo_id(),
  "Conta" text not null,
  "Transacao_Id" text not null unique,
  "Data" date,
  "Valor" numeric(12,2),
  "Pagador" text,
  "Pagador_Documento" text,
  "Cliente_Ref" text references "Entidades_Cadastradas"(id) on delete set null,
  "Descricao" text,
  "Status" text not null default 'pendente',      -- pendente | vinculado | ignorado | sem-par
  "Recebimento_Ref" text references "Recebimentos"(id) on delete set null,
  "Sugestao_Ref" text references "Recebimentos"(id) on delete set null,
  "Confianca" text,                               -- alta | media | baixa
  "Criado_Em" timestamptz not null default now()
);
-- De onde e por que veio o dinheiro, escrito pelo dono (22/11/2026). Status 'anotado' = classificada sem ligar a conta.
alter table "Conciliacao" add column if not exists "Anotacao" text;

-- Estado das cobranças: começo (corte das notas antigas), última sincronização, contas do Asaas, trava.
create table if not exists "Cobranca_Estado" (
  id text primary key,
  "Valor" jsonb not null default '{}',
  "Criado_Em" timestamptz not null default now()
);
insert into "Cobranca_Estado" (id, "Valor") values ('inicio', jsonb_build_object('quando', now())) on conflict (id) do nothing;

grant select, insert, update, delete on "Cobranca_Eventos", "Conciliacao", "Cobranca_Estado" to n8n_app;
-- A sincronização troca os dados de pagamento do CNPJ para a conta do Asaas quando a chave PIX chega lá (cob_banco_asaas).
grant select, update on "Empresas_Emissoras" to n8n_app;

-- ========================= peças pequenas =========================
create or replace function cob_txt(j jsonb, k text) returns text language sql immutable as $$
  select nullif(btrim(coalesce(j ->> k, '')), '') $$;

create or replace function cob_num(j jsonb, k text) returns numeric language sql immutable as $$
  select case when coalesce(j ->> k, '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (j ->> k)::numeric end $$;

create or replace function cob_data(j jsonb, k text) returns date language sql immutable as $$
  select case when coalesce(j ->> k, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then left(j ->> k, 10)::date end $$;

create or replace function cob_digitos(t text) returns text language sql immutable as $$
  select regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g') $$;

create or replace function cob_hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Páscoa (Meeus/Jones/Butcher): base do Carnaval, da Sexta-feira Santa e de Corpus Christi.
create or replace function cob_pascoa(ano integer) returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := ano % 19; b := ano / 100; c := ano % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  return make_date(ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

-- Feriados que os bancos respeitam (nacionais + Carnaval, Sexta-feira Santa, Corpus Christi) e o de Joinville (09/03).
create or replace function cob_feriado(d date) returns boolean language sql immutable as $$
  select to_char(d, 'MM-DD') in ('01-01', '03-09', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
      or d in (cob_pascoa(extract(year from d)::int) - 48, cob_pascoa(extract(year from d)::int) - 47,
               cob_pascoa(extract(year from d)::int) - 2, cob_pascoa(extract(year from d)::int) + 60) $$;

create or replace function cob_dia_util(d date) returns date language plpgsql immutable as $$
declare x date := d;
begin
  while extract(isodow from x) in (6, 7) or cob_feriado(x) loop x := x + 1; end loop;
  return x;
end $$;

-- E-mails do cliente: os do financeiro + os dos contatos ativos (os mesmos que vão para o Asaas).
-- Na ordem do cadastro (22/11/2026): primeiro os e-mails do financeiro do cliente, depois os dos contatos; sem repetir.
create or replace function cob_emails(cliente text) returns text[] language sql stable as $$
  with brutos as (
    select lower(btrim(t.e)) as e, 1 as g, '' as k, t.n from "Entidades_Cadastradas" c,
           regexp_split_to_table(coalesce(c."Emails_Financeiro_NFE", ''), '[\n\r,;]+') with ordinality as t(e, n)
     where c.id = cliente
    union all
    select lower(btrim(t.e)), 2, k.id, t.n from "Contatos_Solicitantes" k,
           regexp_split_to_table(coalesce(k."Emails", ''), '[\n\r,;]+') with ordinality as t(e, n)
     where cliente = any (k."Entidades_Vinculadas") and coalesce(k."Status", 'Ativo') not in ('Arquivado', 'Inativo')
  ), unicos as (
    select distinct on (e) e, g, k, n from brutos where e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' order by e, g, k, n
  )
  select coalesce(array_agg(e order by g, k, n), '{}') from unicos $$;

-- Destinos dos e-mails do sistema (regra do dono, 22/11/2026): o 1º no "Para" e todos os outros no "Cc", juntos,
-- sem cópia oculta ("cco" fica sempre vazio).
create or replace function cob_destinos(emails text[]) returns jsonb language sql immutable as $$
  select jsonb_build_object('para', coalesce(emails[1], ''),
    'cc', coalesce(array_to_string(emails[2:], ', '), ''), 'cco', '') $$;

create or replace function cob_nome_cliente(c "Entidades_Cadastradas") returns text language sql immutable as $$
  select coalesce(nullif(btrim(c."Nome_Fantasia_Identificador"), ''), nullif(btrim(c."Razao_Social_Nome"), ''), 'Cliente sem nome') $$;

-- Valor em reais no jeito brasileiro (R$ 1.306,00), para textos e e-mails.
create or replace function cob_reais(v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(coalesce(v, 0), 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.') $$;

create or replace function cob_evento(rec text, tipo text, texto text, chave text default null, dados jsonb default '{}')
returns void language sql as $$
  insert into "Cobranca_Eventos" ("Recebimento_Ref", "Tipo", "Texto", "Chave", "Dados")
  values (rec, tipo, texto, chave, coalesce(dados, '{}')) on conflict ("Chave") do nothing $$;

-- O serviço escrito na nota, sem os valores e sem o bloco de pagamento.
create or replace function cob_servico_da_nota(descricao text) returns text language sql immutable as $$
  select btrim(regexp_replace(coalesce(descricao, ''),
    '\s*(Valor material = |Materiais incluídos no valor|Valor total = |Dados para pagamento|Pagamento por boleto|Pagamento em [0-9]+ boletos).*$', '')) $$;

create or replace function cob_material_da_nota(descricao text) returns numeric language sql immutable as $$
  select replace(replace(substring(coalesce(descricao, '') from 'Valor material = R\$\s*([0-9.]+,[0-9]{2})'), '.', ''), ',', '.')::numeric $$;

-- Uma cobrança no formato que o app usa.
create or replace function cob_item(r "Recebimentos") returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', r.id, 'descricao', r."Descricao", 'valor', r."Valor", 'cliente', r."Cliente_Nome", 'clienteId', r."Cliente_Ref",
    'documento', r."Cliente_Documento", 'vencimento', r."Vencimento", 'status', coalesce(r."Status", 'Pendente'),
    'dataRecebimento', r."Data_Recebimento", 'forma', r."Forma", 'origem', coalesce(r."Origem", 'manual'),
    'emissor', coalesce(r."Emissor", r."Asaas_Conta"), 'notaId', r."Nota_Ref", 'notaNumero', n."Numero_NFSe", 'notaStatus', n."Status",
    'arquivoId', r."Arquivo_Ref", 'grupo', r."Grupo", 'parcela', r."Parcela_Numero", 'parcelas', r."Parcela_Total",
    'asaasId', r."Asaas_Cobranca_Id", 'asaasConta', r."Asaas_Conta", 'asaasStatus', r."Asaas_Status", 'link', r."Asaas_Link",
    'boletoUrl', r."Boleto_Url", 'vistoEm', r."Visto_Em", 'valorPago', r."Valor_Pago", 'valorLiquido', r."Valor_Liquido",
    'taxa', r."Taxa", 'multaJuros', r."Multa_Juros", 'baixaPor', r."Baixa_Por", 'material', r."Material_Valor",
    'aviso', r."Aviso", 'criadoEm', r."Criado_Em", 'observacoes', r."Observacoes",
    -- WhatsApp para o lembrete que o dono manda: o do cadastro ou o do primeiro contato ativo.
    'whatsapp', (select coalesce(nullif(cob_digitos(c."WhatsApp_CNPJ"), ''),
        (select cob_digitos(split_part(k."WhatsApps", E'\n', 1)) from "Contatos_Solicitantes" k
          where c.id = any (k."Entidades_Vinculadas") and coalesce(k."Status", 'Ativo') not in ('Arquivado', 'Inativo')
            and coalesce(k."WhatsApps", '') <> '' order by k."Criado_Em" limit 1))
      from "Entidades_Cadastradas" c where c.id = r."Cliente_Ref"),
    'lembrete', (select max(e."Quando") from "Cobranca_Eventos" e where e."Recebimento_Ref" = r.id and e."Tipo" = 'lembrete'),
    'ultimo', (select jsonb_build_object('tipo', e."Tipo", 'texto', e."Texto", 'quando', e."Quando")
                 from "Cobranca_Eventos" e where e."Recebimento_Ref" = r.id order by e."Quando" desc limit 1))
  from (select 1) x left join "Notas_Fiscais" n on n.id = r."Nota_Ref" $$;

-- Divide em parcelas, em centavos: as primeiras arredondadas e a última com a sobra (soma sempre exata).
create or replace function cob_parcela(total numeric, n int, i int) returns numeric language sql immutable as $$
  select round(case when i < n then floor(total * 100 / n) / 100 else total - (n - 1) * (floor(total * 100 / n) / 100) end, 2) $$;

-- Descrição do boleto no Asaas (aparece na fatura, no PDF do boleto e nos e-mails do Asaas). Regra do dono (20/11/2026):
-- todo boleto diz a que nota se refere: "Referente à NFS-e nº 445: <serviço>". O boleto nasce ANTES da nota (o link
-- dele vai na nota), então até a nota sair vai a data dela; assim que sai, o sistema troca pelo número (mudar a
-- descrição não manda e-mail ao cliente: o aviso de "cobrança alterada" fica desligado).
create or replace function cob_descricao_boleto(r "Recebimentos", numero text, servico text) returns text language sql stable as $$
  select left(
    case when coalesce(btrim(numero), '') <> '' then 'Referente à NFS-e nº ' || btrim(numero)
         when r."Origem" = 'recibo' then 'Referente ao recibo de ' || to_char(coalesce((select (a."Criado_Em" at time zone 'America/Sao_Paulo')::date
              from "Arquivos_Cliente" a where a.id = r."Arquivo_Ref"), (r."Criado_Em" at time zone 'America/Sao_Paulo')::date, cob_hoje()), 'DD/MM/YYYY')
         when r."Origem" = 'nota' then 'Referente à NFS-e de ' || to_char(coalesce((r."Criado_Em" at time zone 'America/Sao_Paulo')::date, cob_hoje()), 'DD/MM/YYYY')
         else 'Referente a' end
    || case when coalesce(r."Parcela_Total", 1) > 1 then ' (parcela ' || r."Parcela_Numero" || ' de ' || r."Parcela_Total" || ')' else '' end
    || ': ' || s.t || case when s.t ~ '[.!?]$' then '' else '.' end
    || ' Após o vencimento: multa de 2% e juros de 1% ao mês. Dúvidas: (47) 99208-1047 ou adm.solucoes.rapidas@gmail.com.', 500)
  from (select coalesce(nullif(left(btrim(regexp_replace(coalesce(servico, ''), '\s+', ' ', 'g')), 330), ''), 'serviço') as t) s $$;

-- Pede ao Asaas a descrição com o número da nota (usada ao ligar a nota e, se falhar, de novo na sincronização).
create or replace function cob_chamada_descricao(r "Recebimentos", numero text, servico text) returns jsonb language sql stable as $$
  select jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'POST', 'url', 'https://api.asaas.com/v3/payments/' || r."Asaas_Cobranca_Id",
    'corpo', jsonb_build_object('description', cob_descricao_boleto(r, numero, servico)),
    'ref', jsonb_build_object('tipo', 'descricao', 'id', r.id, 'numero', btrim(coalesce(numero, '')))) $$;

-- Resposta do Asaas à troca da descrição: deu certo = não pede de novo; deu errado = tenta de novo amanhã.
create or replace function cob_descricao_feita(rid text, numero text, erro text) returns void language plpgsql as $$
begin
  if erro is null then
    perform cob_evento(rid, 'descricao', 'Descrição do boleto no Asaas: "Referente à NFS-e nº ' || coalesce(numero, '?') || '".', 'descricao:' || rid || ':' || coalesce(numero, ''));
  else
    perform cob_evento(rid, 'erro', 'Não consegui pôr o número da nota na descrição do boleto (' || left(erro, 150) || '). Tento de novo amanhã.',
      'descricao-erro:' || rid || ':' || coalesce(numero, '') || ':' || cob_hoje());
  end if;
end $$;

-- PDF da nota no boleto (pedido do dono, 22/11/2026). O Asaas não põe arquivo anexo nos e-mails dele, mas mostra o
-- documento para baixar na página do boleto (a "fatura", que é o link do e-mail), já antes do pagamento. O PDF é o
-- que o sistema gerou da nota (Pdf_Nota); sem PDF ou sem boleto, não há chamada (null).
create or replace function cob_chamada_nf_pdf(r "Recebimentos") returns jsonb language sql stable as $$
  select jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'POST',
    'url', 'https://api.asaas.com/v3/payments/' || r."Asaas_Cobranca_Id" || '/documents',
    'anexo', nf."Pdf_Nota" -> 0 ->> 'id',
    'ref', jsonb_build_object('tipo', 'nf-pdf', 'id', r.id, 'nota', nf.id, 'numero', btrim(coalesce(nf."Numero_NFSe", ''))))
  from "Notas_Fiscais" nf
  where nf.id = r."Nota_Ref" and nf."Status" = 'Emitida' and coalesce(nf."Pdf_Nota" -> 0 ->> 'id', '') ~ '^att[0-9a-f]{32}$'
    and coalesce(r."Asaas_Cobranca_Id", '') ~ '^pay_[A-Za-z0-9]+$' $$;

-- Resposta do Asaas ao PDF: deu certo = não manda de novo; deu errado = tenta de novo amanhã.
create or replace function cob_nf_pdf_feito(rid text, nid text, numero text, erro text) returns void language plpgsql as $$
begin
  if erro is null then
    perform cob_evento(rid, 'nf-pdf', 'PDF da NFS-e nº ' || coalesce(nullif(numero, ''), '?') || ' anexado ao boleto (o cliente baixa na página do boleto).',
      'nf-pdf:' || rid || ':' || coalesce(nid, ''));
  else
    perform cob_evento(rid, 'erro', 'Não consegui anexar o PDF da nota ao boleto (' || left(erro, 150) || '). Tento de novo amanhã.',
      'nf-pdf-erro:' || rid || ':' || coalesce(nid, '') || ':' || cob_hoje());
  end if;
end $$;

-- Conta do Asaas nos dados de pagamento (regra do dono, 20/11/2026): quando a chave PIX do próprio CNPJ fica ativa
-- no Asaas (fim da portabilidade do CNPJ 1, que hoje está no Inter), as notas e os recibos daquele CNPJ passam a
-- sair com a conta do Asaas, sem ninguém mexer. Os dados de antes ficam guardados em Cobranca_Estado
-- ("banco-antes:<CNPJ>") para poder voltar.
-- cob_banco_novo só DECIDE (não grava): devolve os dados novos da linha, ou null se ainda não é a hora.
create or replace function cob_banco_novo(e jsonb, est jsonb, banco_asaas text) returns jsonb language sql immutable as $$
  select case
    when coalesce(e ->> 'Banco', '') ~ '^\s*461\M' then null                  -- já é a conta do Asaas
    when length(cob_digitos(e ->> 'CNPJ')) <> 14 then null
    when coalesce(est ->> 'conta', '') !~ '^[0-9]+(-[0-9A-Za-z])?$' then null      -- conta do Asaas ainda não lida
    -- Só a chave PIX do próprio CNPJ, ativa, conta como "portabilidade concluída" (outra chave não basta).
    when not exists (select 1 from jsonb_array_elements(coalesce(est -> 'pixChaves', '[]')) as k(v)
                      where upper(coalesce(k.v ->> 'tipo', '')) = 'CNPJ' and cob_digitos(k.v ->> 'chave') = cob_digitos(e ->> 'CNPJ')) then null
    else jsonb_build_object('Banco', coalesce(nullif(btrim(banco_asaas), ''), '461 - Asaas I.P S.A'),
                            'Agencia', coalesce(nullif(est ->> 'agencia', ''), '0001'), 'Conta', est ->> 'conta',
                            'Chave_PIX', cob_digitos(e ->> 'CNPJ'))
  end $$;

create or replace function cob_banco_asaas() returns jsonb language plpgsql as $$
declare e "Empresas_Emissoras"; est jsonb; novo jsonb; banco text; trocados jsonb := '[]';
begin
  -- Mesmo jeito de escrever o banco que o CNPJ 2 já usa ("461 - Asaas I.P S.A").
  select x."Banco" into banco from "Empresas_Emissoras" x where coalesce(x."Banco", '') ~ '^\s*461\M' limit 1;
  for e in select * from "Empresas_Emissoras" loop
    select "Valor" into est from "Cobranca_Estado" where id = 'conta:' || e."Codigo";
    novo := cob_banco_novo(to_jsonb(e), est, banco);
    if novo is null then continue; end if;
    insert into "Cobranca_Estado" (id, "Valor") values ('banco-antes:' || e."Codigo", jsonb_build_object('quando', now(),
        'Banco', e."Banco", 'Agencia', e."Agencia", 'Conta', e."Conta", 'Chave_PIX', e."Chave_PIX"))
    on conflict (id) do nothing;
    update "Empresas_Emissoras" set "Banco" = novo ->> 'Banco', "Agencia" = novo ->> 'Agencia', "Conta" = novo ->> 'Conta',
           "Chave_PIX" = novo ->> 'Chave_PIX'
     where id = e.id;
    insert into "Cobranca_Estado" (id, "Valor") values ('banco-trocado:' || e."Codigo", jsonb_build_object('quando', now(), 'conta', novo ->> 'Conta'))
    on conflict (id) do update set "Valor" = excluded."Valor";
    trocados := trocados || jsonb_build_object('codigo', e."Codigo", 'conta', novo ->> 'Conta');
  end loop;
  return trocados;
end $$;

-- ========================= painel (o que o app mostra) =========================
create or replace function cob_painel(p jsonb) returns jsonb language plpgsql stable as $$
declare hoje date := cob_hoje(); ini timestamptz;
begin
  select ("Valor" ->> 'quando')::timestamptz into ini from "Cobranca_Estado" where id = 'inicio';
  return jsonb_build_object('ok', true, 'hoje', hoje, 'inicio', ini,
    'recebimentos', coalesce((select jsonb_agg(cob_item(r) order by r."Vencimento" nulls last, r."Criado_Em")
        from "Recebimentos" r
       where coalesce(r."Status", 'Pendente') = 'Pendente'
          or (r."Status" = 'Recebido' and r."Data_Recebimento" >= (date_trunc('month', hoje) - interval '2 months')::date)
          or (r."Status" = 'Cancelado' and r."Criado_Em" >= now() - interval '45 days')), '[]'::jsonb),
    'conciliacao', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'conta', c."Conta", 'data', c."Data", 'valor', c."Valor",
          'pagador', c."Pagador", 'documento', c."Pagador_Documento", 'clienteId', c."Cliente_Ref", 'descricao', c."Descricao",
          'status', c."Status", 'confianca', c."Confianca", 'sugestao', c."Sugestao_Ref", 'anotacao', c."Anotacao") order by c."Data" desc)
        from "Conciliacao" c where c."Status" in ('pendente', 'sem-par') and c."Data" >= hoje - 60), '[]'::jsonb),
    -- Também as NFS-e trazidas de fora (PDF importado na pasta NFS-e do cliente, com valor; 22/11/2026), até o dono
    -- dizer se vai receber ou se já recebeu.
    'notasSemConta', coalesce((select jsonb_agg(x.j order by x.quando desc) from (
        select jsonb_build_object('id', n.id, 'numero', n."Numero_NFSe", 'cliente', n."Tomador_Nome",
          'clienteId', n."Cliente_Ref", 'valor', n."Valor", 'emitidaEm', n."Emitida_Em", 'emissor', n."Emissor") j, n."Emitida_Em" quando
          from "Notas_Fiscais" n
         where n."Ambiente" = 'Producao' and n."Status" = 'Emitida'
           and not exists (select 1 from "Recebimentos" r where r."Nota_Ref" = n.id)
           and (ini is null or n."Emitida_Em" < ini)
        union all
        select jsonb_build_object('id', a.id, 'numero', coalesce(substring(a."Titulo" from '\d+'), a."Titulo"), 'cliente', a."Cliente_Nome",
          'clienteId', a."Cliente_Ref", 'valor', a."Valor", 'emitidaEm', a."Data_Documento", 'emissor', a."Emissor", 'importada', true), a."Data_Documento"::timestamptz
          from "Arquivos_Cliente" a
         where a."Tipo" = 'nfs' and a."Origem" = 'importado' and coalesce(a."Valor", 0) > 0
           and coalesce(a."Dados_Json", '') not like '%"substituidoPor"%'
           and not exists (select 1 from "Recebimentos" r where r."Arquivo_Ref" = a.id)) x), '[]'::jsonb),
    -- notasPeloAsaas: a linha do CNPJ em Empresas_Emissoras já é a conta do Asaas (notas e recibos saem com ela).
    'contas', coalesce((select jsonb_object_agg(substr(e.id, 7), e."Valor" || jsonb_build_object('notasPeloAsaas',
        exists (select 1 from "Empresas_Emissoras" x where x."Codigo" = substr(e.id, 7) and coalesce(x."Banco", '') ~ '^\s*461\M')))
      from "Cobranca_Estado" e where e.id like 'conta:%'), '{}'::jsonb),
    'sinc', (select "Valor" from "Cobranca_Estado" where id = 'sinc'));
end $$;

create or replace function cob_historico(p jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'eventos', coalesce((select jsonb_agg(jsonb_build_object('tipo', e."Tipo", 'texto', e."Texto", 'quando', e."Quando")
    order by e."Quando") from "Cobranca_Eventos" e where e."Recebimento_Ref" = cob_txt(p, 'id')), '[]'::jsonb)) $$;

-- ========================= conferir antes de gerar =========================
-- p: { clienteId, valor, material, parcelas, vencimentos: [AAAA-MM-DD...] }
create or replace function cob_preparar(p jsonb) returns jsonb language plpgsql stable as $$
declare
  c "Entidades_Cadastradas"; hoje date := cob_hoje(); n int := coalesce(cob_num(p, 'parcelas')::int, 1);
  total numeric := round(coalesce(cob_num(p, 'valor'), 0), 2); material numeric := round(coalesce(cob_num(p, 'material'), 0), 2);
  problemas text[] := '{}'; avisos text[] := '{}'; parc jsonb := '[]'; venc date; anterior date; vu date; i int;
  conta text; estado jsonb; emails text[]; parecidas jsonb;
begin
  select * into c from "Entidades_Cadastradas" where id = cob_txt(p, 'clienteId');
  if c.id is null then return jsonb_build_object('ok', false, 'mensagem', 'Cliente não encontrado.'); end if;
  conta := coalesce(nullif(c."Atendido_Por", ''), 'CNPJ 1');
  if not coalesce(c."Gera_Boleto", false) then problemas := array_append(problemas, ('Este cliente está com "Gera boletos" desligado.')::text); end if;
  if coalesce(c."Asaas_Customer_Id", '') = '' then
    problemas := array_append(problemas, ('O cliente ainda não está no Asaas: abra o cadastro dele e salve de novo para sincronizar.')::text);
  elsif coalesce(nullif(c."Asaas_Conta", ''), 'CNPJ 1') <> conta then
    problemas := array_append(problemas, (('O cliente é atendido pelo ' || conta || ', mas está no Asaas do ' || coalesce(nullif(c."Asaas_Conta", ''), 'CNPJ 1') || ': salve o cadastro de novo para ele mudar de conta.'))::text);
  end if;
  if n < 1 or n > 12 then problemas := array_append(problemas, ('Escolha de 1 a 12 parcelas.')::text); n := greatest(1, least(n, 12)); end if;
  if total <= 0 then problemas := array_append(problemas, ('Falta o valor.')::text);
  elsif total > 100000 then problemas := array_append(problemas, ('Valor acima de R$ 100.000,00: confira.')::text);
  elsif cob_parcela(total, n, 1) < 5 then problemas := array_append(problemas, ('Cada boleto precisa ser de pelo menos R$ 5,00 (regra do Asaas).')::text);
  end if;
  if material < 0 or material > total then material := 0; end if;
  if coalesce(jsonb_typeof(p -> 'vencimentos'), '') <> 'array' or jsonb_array_length(p -> 'vencimentos') <> n then
    problemas := array_append(problemas, ('Falta a data de vencimento de cada boleto.')::text);
  else
    for i in 1..n loop
      venc := case when (p -> 'vencimentos' ->> (i - 1)) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p -> 'vencimentos' ->> (i - 1))::date end;
      if venc is null then problemas := array_append(problemas, (('Data inválida no boleto ' || i || '.'))::text); continue; end if;
      if venc < hoje then problemas := array_append(problemas, (('O boleto ' || i || ' vence antes de hoje.'))::text); end if;
      if anterior is not null and venc <= anterior then problemas := array_append(problemas, (('O boleto ' || i || ' precisa vencer depois do anterior.'))::text); end if;
      vu := cob_dia_util(venc);
      if vu <> venc then avisos := array_append(avisos, (('O boleto ' || i || ' vence em ' || to_char(venc, 'DD/MM') || ', que não é dia útil.'))::text); end if;
      parc := parc || jsonb_build_object('n', i, 'valor', cob_parcela(total, n, i), 'material', cob_parcela(material, n, i),
                                         'vencimento', venc, 'diaUtil', vu = venc, 'sugerido', vu);
      anterior := venc;
    end loop;
  end if;
  emails := cob_emails(c.id);
  if coalesce(array_length(emails, 1), 0) = 0 then
    avisos := array_append(avisos, ('Cliente sem e-mail: o aviso de vencimento não vai sair. Mande o link pelo WhatsApp.')::text);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'descricao', r."Descricao", 'valor', r."Valor", 'vencimento', r."Vencimento")), '[]')
    into parecidas from "Recebimentos" r
   where r."Cliente_Ref" = c.id and coalesce(r."Status", 'Pendente') = 'Pendente' and r."Asaas_Cobranca_Id" is not null
     and r."Criado_Em" >= now() - interval '45 days' and (r."Valor" = total or r."Valor" = cob_parcela(total, n, 1));
  if jsonb_array_length(parecidas) > 0 then avisos := array_append(avisos, ('Já existe boleto aberto deste cliente com o mesmo valor: confira se não é repetido.')::text); end if;
  select "Valor" into estado from "Cobranca_Estado" where id = 'conta:' || conta;
  return jsonb_build_object('ok', true, 'podeGerar', coalesce(array_length(problemas, 1), 0) = 0,
    'problemas', to_jsonb(problemas), 'avisos', to_jsonb(avisos),
    'cliente', jsonb_build_object('id', c.id, 'nome', cob_nome_cliente(c), 'documento', c."CPF_CNPJ", 'emissor', conta,
                                  'asaasId', c."Asaas_Customer_Id", 'emails', to_jsonb(emails), 'whatsapp', c."WhatsApp_CNPJ"),
    'conta', jsonb_build_object('codigo', conta, 'pix', estado -> 'pix', 'taxaBoleto', estado -> 'taxaBoleto', 'taxaAviso', estado -> 'taxaAviso'),
    'parcelas', parc, 'total', total, 'parecidas', parecidas);
end $$;

-- ========================= ações (o fluxo "App - Cobrancas" chama só estas duas) =========================
-- cob_acao: decide o que fazer. Devolve { resposta } (pronto) ou { chamadas, contexto } (o fluxo faz as chamadas
-- ao Asaas e depois entrega as respostas para cob_registrar, com o mesmo contexto).
create or replace function cob_acao(p jsonb) returns jsonb language plpgsql as $$
declare
  acao text := cob_txt(p, 'acao'); r "Recebimentos"; c "Entidades_Cadastradas"; pre jsonb; grupo text := cob_txt(p, 'grupo'); base "Recebimentos";
  item jsonb; chamadas jsonb := '[]'; novo text; i int; n int; servico text; desc_boleto text; origem text; venc date;
  hoje date := cob_hoje(); conc "Conciliacao"; nota "Notas_Fiscais"; ids text[];
begin
  if acao = 'painel' then return jsonb_build_object('resposta', cob_painel(p)); end if;
  if acao = 'historico' then return jsonb_build_object('resposta', cob_historico(p)); end if;
  if acao = 'preparar' then return jsonb_build_object('resposta', cob_preparar(p)); end if;

  if acao = 'criar' then
    if grupo is null or grupo !~ '^[A-Za-z0-9-]{8,64}$' then
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Pedido sem identificação: recarregue a página.'));
    end if;
    origem := case when cob_txt(p, 'origem') in ('nota', 'recibo') then cob_txt(p, 'origem') else 'avulsa' end;
    servico := left(regexp_replace(coalesce(cob_txt(p, 'servico'), 'Serviço'), '\s+', ' ', 'g'), 300);
    -- Pedido repetido (internet caiu e o app tentou de novo): devolve o que já existe, sem criar outro.
    if not exists (select 1 from "Recebimentos" where "Grupo" = grupo) then
      pre := cob_preparar(p);
      if not coalesce((pre ->> 'ok')::boolean, false) then return jsonb_build_object('resposta', pre); end if;
      if not coalesce((pre ->> 'podeGerar')::boolean, false) then
        return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', array_to_string(array(select jsonb_array_elements_text(pre -> 'problemas')), ' ')));
      end if;
      select * into c from "Entidades_Cadastradas" where id = cob_txt(p, 'clienteId');
      n := jsonb_array_length(pre -> 'parcelas');
      -- Ciclo do dono desde 21/11/2026: a nota (ou o recibo) sai antes e já está no A receber; o boleto nasce DESSA
      -- conta (ela vira o 1º boleto), então o "Referente à NFS-e nº X" já vai na criação e nada conta em dobro.
      if cob_txt(p, 'recebimentoId') is not null then
        select * into base from "Recebimentos" where id = cob_txt(p, 'recebimentoId');
        if base.id is null or coalesce(base."Status", 'Pendente') <> 'Pendente' or coalesce(base."Asaas_Cobranca_Id", '') <> '' or base."Grupo" is not null then
          return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Esta conta já tem boleto ou não está mais em aberto.'));
        end if;
        if base."Cliente_Ref" is distinct from c.id then
          return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'A conta é de outro cliente: o boleto não foi criado.'));
        end if;
        if round(base."Valor", 2) <> round(coalesce(cob_num(p, 'valor'), 0), 2) then
          return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'O boleto precisa ter o valor da conta (' || cob_reais(base."Valor") || ').'));
        end if;
        origem := coalesce(nullif(base."Origem", ''), origem);
      end if;
      for i in 1..n loop
        item := pre -> 'parcelas' -> (i - 1);
        if i = 1 and base.id is not null then
          update "Recebimentos" set "Valor" = (item ->> 'valor')::numeric, "Vencimento" = (item ->> 'vencimento')::date, "Forma" = 'Boleto',
                 "Grupo" = grupo, "Parcela_Numero" = 1, "Parcela_Total" = n, "Asaas_Conta" = pre -> 'cliente' ->> 'emissor',
                 "Asaas_Cliente_Id" = c."Asaas_Customer_Id", "Asaas_Status" = 'CRIANDO', "Material_Valor" = (item ->> 'material')::numeric,
                 "Descricao" = left(base."Descricao", 140) || case when n > 1 then ' · parcela 1 de ' || n else '' end, "Atualizado_Em" = now()
           where id = base.id;
          novo := base.id;
        else
          insert into "Recebimentos" ("Descricao", "Valor", "Cliente_Nome", "Cliente_Documento", "Cliente_Ref", "Vencimento", "Status",
              "Forma", "Origem", "Emissor", "Grupo", "Parcela_Numero", "Parcela_Total", "Asaas_Conta", "Asaas_Cliente_Id", "Asaas_Status",
              "Material_Valor", "Nota_Ref", "Atualizado_Em")
          values (left(coalesce(base."Descricao", servico), 140) || case when n > 1 then ' · parcela ' || i || ' de ' || n else '' end, (item ->> 'valor')::numeric,
              cob_nome_cliente(c), cob_digitos(c."CPF_CNPJ"), c.id, (item ->> 'vencimento')::date, 'Pendente', 'Boleto', origem,
              pre -> 'cliente' ->> 'emissor', grupo, i, n, pre -> 'cliente' ->> 'emissor', c."Asaas_Customer_Id", 'CRIANDO',
              (item ->> 'material')::numeric, base."Nota_Ref", now())
          returning id into novo;
        end if;
        perform cob_evento(novo, 'criando', 'Cobrança preparada no sistema' || case when n > 1 then ' (parcela ' || i || ' de ' || n || ')' else '' end || '.');
      end loop;
    end if;
    -- Chamadas ao Asaas só para o que ainda não tem boleto lá.
    for r in select * from "Recebimentos" where "Grupo" = grupo and coalesce("Asaas_Cobranca_Id", '') = '' and "Status" = 'Pendente' order by "Parcela_Numero" loop
      -- "Referente à NFS-e nº X: serviço" (ou "ao recibo de <data>"); boleto sem nota ainda: a data, e o número depois.
      desc_boleto := cob_descricao_boleto(r, (select nf."Numero_NFSe" from "Notas_Fiscais" nf where nf.id = r."Nota_Ref" and nf."Status" = 'Emitida'), servico);
      -- Linha já existia (repetição): primeiro procura no Asaas pela referência, para nunca criar boleto em dobro.
      if r."Asaas_Status" = 'ERRO' or r."Criado_Em" < now() - interval '1 minute' then
        chamadas := chamadas || jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'GET',
          'url', 'https://api.asaas.com/v3/payments?externalReference=' || r.id, 'ref', jsonb_build_object('tipo', 'procura', 'id', r.id, 'descricao', desc_boleto));
      else
        chamadas := chamadas || jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'POST', 'url', 'https://api.asaas.com/v3/payments',
          'corpo', jsonb_build_object('customer', r."Asaas_Cliente_Id", 'billingType', 'BOLETO', 'value', r."Valor", 'dueDate', r."Vencimento",
            'description', desc_boleto, 'externalReference', r.id, 'fine', jsonb_build_object('value', 2), 'interest', jsonb_build_object('value', 1),
            -- Pagável até 30 dias depois do vencimento (regra do dono, 20/11/2026; antes 20). Só vale na criação:
            -- o Asaas não muda esse prazo num boleto que já existe (testado).
            'daysAfterDueDateToRegistrationCancellation', 30),
          'ref', jsonb_build_object('tipo', 'criar', 'id', r.id));
      end if;
    end loop;
    if jsonb_array_length(chamadas) = 0 then
      return jsonb_build_object('resposta', cob_resultado_grupo(grupo));
    end if;
    return jsonb_build_object('chamadas', chamadas, 'contexto', jsonb_build_object('acao', 'criar', 'grupo', grupo));
  end if;

  if acao = 'ligar-nota' then
    select * into nota from "Notas_Fiscais" where id = cob_txt(p, 'notaId');
    if nota.id is null or nota."Status" <> 'Emitida' then
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Nota não encontrada ou não emitida.'));
    end if;
    if not exists (select 1 from "Recebimentos" where "Grupo" = grupo) then
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Boleto não encontrado.'));
    end if;
    if exists (select 1 from "Recebimentos" where "Grupo" = grupo and "Cliente_Ref" is distinct from nota."Cliente_Ref") then
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'A nota é de outro cliente: não liguei.'));
    end if;
    update "Recebimentos" set "Nota_Ref" = nota.id, "Atualizado_Em" = now() where "Grupo" = grupo and "Nota_Ref" is null;
    for r in select * from "Recebimentos" where "Grupo" = grupo order by "Parcela_Numero" nulls last, "Vencimento" loop
      perform cob_evento(r.id, 'nota-ligada', 'Ligado à NFS-e nº ' || coalesce(nota."Numero_NFSe", '?') || '.', 'nota-ligada:' || r.id);
      -- A descrição do boleto passa a citar a nota: "Referente à NFS-e nº X" (mudar a descrição não manda e-mail ao cliente).
      if coalesce(r."Asaas_Cobranca_Id", '') <> '' and r."Status" = 'Pendente' and coalesce(nota."Numero_NFSe", '') <> '' then
        chamadas := chamadas || cob_chamada_descricao(r, nota."Numero_NFSe", cob_servico_da_nota(nota."Descricao"));
      end if;
    end loop;
    if jsonb_array_length(chamadas) = 0 then return jsonb_build_object('resposta', cob_resultado_grupo(grupo)); end if;
    return jsonb_build_object('chamadas', chamadas, 'contexto', jsonb_build_object('acao', 'ligar-nota', 'grupo', grupo));
  end if;

  if acao = 'registrar-nota' then return jsonb_build_object('resposta', cob_registrar_nota(cob_txt(p, 'notaId'))); end if;
  if acao = 'registrar-recibo' then return jsonb_build_object('resposta', cob_registrar_recibo(cob_txt(p, 'arquivoId'))); end if;
  if acao = 'preparar-email' then return jsonb_build_object('resposta', cob_preparar_email(p)); end if;
  if acao = 'enviar-nota' then return cob_enviar_nota(p); end if;

  if acao in ('baixa', 'prorrogar', 'cancelar') then
    select * into r from "Recebimentos" where id = cob_txt(p, 'id');
    if r.id is null then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Cobrança não encontrada.')); end if;
    if coalesce(r."Status", 'Pendente') <> 'Pendente' then
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Esta cobrança já está ' || lower(r."Status") || '.'));
    end if;
    if acao = 'baixa' then
      venc := coalesce(cob_data(p, 'data'), hoje);
      if venc > hoje then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'A data do recebimento não pode ser depois de hoje.')); end if;
      if coalesce(cob_num(p, 'valor'), 0) <= 0 then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Falta o valor recebido.')); end if;
      if coalesce(r."Asaas_Cobranca_Id", '') <> '' then
        return jsonb_build_object('chamadas', jsonb_build_array(jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'POST',
            'url', 'https://api.asaas.com/v3/payments/' || r."Asaas_Cobranca_Id" || '/receiveInCash',
            'corpo', jsonb_build_object('paymentDate', venc, 'value', round(cob_num(p, 'valor'), 2), 'notifyCustomer', false),
            'ref', jsonb_build_object('tipo', 'baixa', 'id', r.id))),
          'contexto', jsonb_build_object('acao', 'baixa', 'id', r.id, 'data', venc, 'valor', round(cob_num(p, 'valor'), 2), 'forma', cob_txt(p, 'forma')));
      end if;
      return jsonb_build_object('resposta', cob_baixar(r.id, venc, round(cob_num(p, 'valor'), 2), 'manual', null, cob_txt(p, 'forma')));
    end if;
    if acao = 'prorrogar' then
      venc := cob_data(p, 'vencimento');
      if venc is null or venc < hoje then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Escolha uma data de hoje em diante.')); end if;
      if coalesce(r."Asaas_Cobranca_Id", '') = '' then
        update "Recebimentos" set "Vencimento" = venc, "Atualizado_Em" = now() where id = r.id;
        perform cob_evento(r.id, 'vencimento', 'Previsão mudou para ' || to_char(venc, 'DD/MM/YYYY') || '.');
        return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'mensagem', 'Data trocada.', 'item', (select cob_item(x) from "Recebimentos" x where x.id = r.id)));
      end if;
      return jsonb_build_object('chamadas', jsonb_build_array(jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'POST',
          'url', 'https://api.asaas.com/v3/payments/' || r."Asaas_Cobranca_Id", 'corpo', jsonb_build_object('dueDate', venc),
          'ref', jsonb_build_object('tipo', 'prorrogar', 'id', r.id))),
        'contexto', jsonb_build_object('acao', 'prorrogar', 'id', r.id, 'vencimento', venc, 'antes', r."Vencimento"));
    end if;
    -- cancelar
    if coalesce(r."Asaas_Cobranca_Id", '') <> '' then
      return jsonb_build_object('chamadas', jsonb_build_array(jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'DELETE',
          'url', 'https://api.asaas.com/v3/payments/' || r."Asaas_Cobranca_Id", 'ref', jsonb_build_object('tipo', 'cancelar', 'id', r.id))),
        'contexto', jsonb_build_object('acao', 'cancelar', 'id', r.id));
    end if;
    update "Recebimentos" set "Status" = 'Cancelado', "Atualizado_Em" = now() where id = r.id;
    perform cob_evento(r.id, 'cancelado', 'Cancelada no sistema.');
    return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'mensagem', 'Cancelada.'));
  end if;

  if acao = 'conciliar' then
    select * into conc from "Conciliacao" where id = cob_txt(p, 'conciliacaoId');
    select * into r from "Recebimentos" where id = cob_txt(p, 'id');
    if conc.id is null or r.id is null then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Entrada ou cobrança não encontrada.')); end if;
    if conc."Status" not in ('pendente', 'sem-par') then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Esta entrada já foi resolvida.')); end if;
    if coalesce(r."Status", 'Pendente') <> 'Pendente' then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Esta cobrança já foi recebida ou cancelada.')); end if;
    update "Conciliacao" set "Status" = 'vinculado', "Recebimento_Ref" = r.id where id = conc.id;
    if coalesce(r."Asaas_Cobranca_Id", '') <> '' then
      -- Pagou por fora um boleto que ainda está aberto: dá baixa nele no Asaas, para os avisos de vencido pararem.
      return jsonb_build_object('chamadas', jsonb_build_array(jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'POST',
          'url', 'https://api.asaas.com/v3/payments/' || r."Asaas_Cobranca_Id" || '/receiveInCash',
          'corpo', jsonb_build_object('paymentDate', least(conc."Data", hoje), 'value', conc."Valor", 'notifyCustomer', false),
          'ref', jsonb_build_object('tipo', 'baixa', 'id', r.id))),
        'contexto', jsonb_build_object('acao', 'baixa', 'id', r.id, 'data', least(conc."Data", hoje), 'valor', conc."Valor", 'por', 'conciliacao', 'ref', conc."Transacao_Id"));
    end if;
    return jsonb_build_object('resposta', cob_baixar(r.id, least(conc."Data", hoje), conc."Valor", 'conciliacao', conc."Transacao_Id", null));
  end if;

  if acao = 'ignorar' then
    -- Com texto: fica anotada (de onde e por que veio), fora do faturamento. Sem texto: só deixada de lado.
    update "Conciliacao" set "Status" = case when coalesce(btrim(cob_txt(p, 'texto')), '') <> '' then 'anotado' else 'ignorado' end,
           "Anotacao" = coalesce(nullif(left(btrim(cob_txt(p, 'texto')), 300), ''), "Anotacao")
     where id = cob_txt(p, 'conciliacaoId') and "Status" in ('pendente', 'sem-par');
    return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'mensagem',
      case when coalesce(btrim(cob_txt(p, 'texto')), '') <> '' then 'Entrada anotada.' else 'Entrada deixada de lado.' end));
  end if;

  if acao = 'incluir-antigas' then
    -- Notas de antes das cobranças: o dono diz quais ainda vai receber e quais já recebeu.
    -- O id pode ser de uma nota do sistema ou de uma NFS-e trazida de fora (PDF na pasta do cliente).
    ids := array(select jsonb_array_elements_text(coalesce(p -> 'receber', '[]')));
    for i in 1..coalesce(array_length(ids, 1), 0) loop
      if exists (select 1 from "Arquivos_Cliente" where id = ids[i]) then perform cob_registrar_arquivo(ids[i]); else perform cob_registrar_nota(ids[i]); end if;
    end loop;
    ids := array(select jsonb_array_elements_text(coalesce(p -> 'recebidas', '[]')));
    for i in 1..coalesce(array_length(ids, 1), 0) loop
      item := case when exists (select 1 from "Arquivos_Cliente" where id = ids[i]) then cob_registrar_arquivo(ids[i]) else cob_registrar_nota(ids[i]) end;
      if coalesce(item ->> 'id', '') <> '' then
        perform cob_baixar(item ->> 'id', coalesce((select ("Emitida_Em" at time zone 'America/Sao_Paulo')::date from "Notas_Fiscais" where id = ids[i]),
            (select "Data_Documento" from "Arquivos_Cliente" where id = ids[i]), hoje),
          (select "Valor" from "Recebimentos" where id = item ->> 'id'), 'manual', null, null);
      end if;
    end loop;
    return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'mensagem', 'Notas anteriores organizadas.'));
  end if;

  return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Ação inválida.'));
end $$;

-- Resumo de um grupo recém-criado, para o app montar a nota com os links.
create or replace function cob_resultado_grupo(grupo text) returns jsonb language sql stable as $$
  select jsonb_build_object('ok', not exists (select 1 from "Recebimentos" r where r."Grupo" = grupo and coalesce(r."Asaas_Cobranca_Id", '') = '' and r."Status" = 'Pendente'),
    'grupo', grupo,
    'cobrancas', coalesce((select jsonb_agg(cob_item(r) order by r."Parcela_Numero") from "Recebimentos" r where r."Grupo" = grupo), '[]'::jsonb),
    'mensagem', case when exists (select 1 from "Recebimentos" r where r."Grupo" = grupo and r."Asaas_Status" = 'ERRO')
      then 'O Asaas não aceitou: ' || coalesce((select r."Aviso" from "Recebimentos" r where r."Grupo" = grupo and r."Asaas_Status" = 'ERRO' limit 1), 'tente de novo.')
      else 'Boleto criado no Asaas.' end) $$;

-- Dá baixa numa cobrança (recebida). Usada pela baixa à mão, pela conciliação e pela sincronização.
create or replace function cob_baixar(rid text, quando date, valor numeric, por text, ref text, forma text) returns jsonb language plpgsql as $$
begin
  update "Recebimentos" set "Status" = 'Recebido', "Data_Recebimento" = quando, "Valor_Pago" = valor,
         "Baixa_Por" = por, "Baixa_Ref" = coalesce(ref, "Baixa_Ref"), "Forma" = coalesce(nullif(forma, ''), "Forma"),
         "Valor_Liquido" = coalesce("Valor_Liquido", case when por <> 'asaas' then valor end), "Atualizado_Em" = now()
   where id = rid and coalesce("Status", 'Pendente') = 'Pendente';
  if found then
    perform cob_evento(rid, 'pago', case por when 'manual' then 'Recebimento registrado por você: ' when 'conciliacao' then 'Entrada no Asaas ligada a esta cobrança: '
      else 'Pago: ' end || cob_reais(valor) || ' em ' || to_char(quando, 'DD/MM/YYYY') || '.', 'pago:' || rid);
  end if;
  return jsonb_build_object('ok', true, 'mensagem', 'Recebimento registrado.', 'item', (select cob_item(x) from "Recebimentos" x where x.id = rid));
end $$;

-- O link de um boleto escrito na nota liga a nota a ele e às outras parcelas do mesmo pedido (o "ligar" do app ou do
-- chat que não chegou a rodar). Devolve quantas cobranças ligou (0 = nenhum boleto citado na nota).
create or replace function cob_ligar_por_link(nid text) returns int language plpgsql as $$
declare n "Notas_Fiscais"; r "Recebimentos"; k int;
begin
  select * into n from "Notas_Fiscais" where id = nid;
  if n.id is null then return 0; end if;
  update "Recebimentos" x set "Nota_Ref" = n.id, "Atualizado_Em" = now()
   where x."Nota_Ref" is null and (
     (coalesce(x."Asaas_Link", '') <> '' and position(x."Asaas_Link" in coalesce(n."Descricao", '')) > 0)
     or x."Grupo" in (select y."Grupo" from "Recebimentos" y where y."Grupo" is not null and coalesce(y."Asaas_Link", '') <> ''
                        and position(y."Asaas_Link" in coalesce(n."Descricao", '')) > 0));
  get diagnostics k = row_count;
  if k > 0 then
    for r in select * from "Recebimentos" x where x."Nota_Ref" = n.id loop
      perform cob_evento(r.id, 'nota-ligada', 'Ligado à NFS-e nº ' || coalesce(n."Numero_NFSe", '?') || ' (pelo link do boleto escrito na nota).', 'nota-ligada:' || r.id);
    end loop;
  end if;
  return k;
end $$;

-- A receber de um recibo gerado no sistema (sem previsão). Repetir não duplica.
create or replace function cob_registrar_recibo(aid text) returns jsonb language plpgsql as $$
declare a "Arquivos_Cliente"; novo text;
begin
  select * into a from "Arquivos_Cliente" where id = aid;
  if a.id is null or a."Tipo" <> 'recibo' or coalesce(a."Valor", 0) <= 0 then
    return jsonb_build_object('ok', false, 'mensagem', 'Recibo não encontrado (ou sem valor).');
  end if;
  select id into novo from "Recebimentos" where "Arquivo_Ref" = a.id limit 1;
  if novo is not null then return jsonb_build_object('ok', true, 'existente', true, 'id', novo); end if;
  insert into "Recebimentos" ("Descricao", "Valor", "Cliente_Nome", "Cliente_Documento", "Cliente_Ref", "Status", "Origem", "Emissor", "Arquivo_Ref", "Atualizado_Em")
  select left('Recibo · ' || coalesce(nullif(a."Titulo", ''), 'serviço'), 140), a."Valor", coalesce(cob_nome_cliente(c), a."Cliente_Nome"),
         cob_digitos(c."CPF_CNPJ"), c.id, 'Pendente', 'recibo', coalesce(a."Emissor", c."Atendido_Por", 'CNPJ 1'), a.id, now()
    from (select 1) z left join "Entidades_Cadastradas" c on c.id = a."Cliente_Ref"
  on conflict do nothing
  returning id into novo;
  if novo is null then select id into novo from "Recebimentos" where "Arquivo_Ref" = a.id limit 1;
  else perform cob_evento(novo, 'recibo', 'Recibo gerado: entra no A receber sem previsão de pagamento.'); end if;
  return jsonb_build_object('ok', novo is not null, 'id', novo);
end $$;

-- A receber de uma NFS-e trazida de fora (PDF importado na pasta NFS-e do cliente, com valor; 22/11/2026), sem
-- previsão, como as notas do sistema. Recibo vai pelo cob_registrar_recibo. Repetir não duplica.
create or replace function cob_registrar_arquivo(aid text) returns jsonb language plpgsql as $$
declare a "Arquivos_Cliente"; novo text; num text;
begin
  select * into a from "Arquivos_Cliente" where id = aid;
  if a.id is not null and a."Tipo" = 'recibo' then return cob_registrar_recibo(aid); end if;
  if a.id is null or a."Tipo" <> 'nfs' or a."Origem" <> 'importado' or coalesce(a."Valor", 0) <= 0 then
    return jsonb_build_object('ok', false, 'mensagem', 'Nota não encontrada (ou sem valor).');
  end if;
  select id into novo from "Recebimentos" where "Arquivo_Ref" = a.id limit 1;
  if novo is not null then return jsonb_build_object('ok', true, 'existente', true, 'id', novo); end if;
  num := substring(a."Titulo" from '\d+');
  insert into "Recebimentos" ("Descricao", "Valor", "Cliente_Nome", "Cliente_Documento", "Cliente_Ref", "Status", "Origem", "Emissor", "Arquivo_Ref", "Atualizado_Em")
  select left(case when num is not null then 'NFS-e nº ' || num || ' · ' else 'NFS-e · ' end || coalesce(nullif(btrim(a."Descricao"), ''), a."Titulo"), 140),
         a."Valor", coalesce(cob_nome_cliente(c), a."Cliente_Nome"), cob_digitos(c."CPF_CNPJ"), c.id, 'Pendente', 'nota',
         coalesce(a."Emissor", c."Atendido_Por", 'CNPJ 1'), a.id, now()
    from (select 1) z left join "Entidades_Cadastradas" c on c.id = a."Cliente_Ref"
  on conflict do nothing
  returning id into novo;
  if novo is null then select id into novo from "Recebimentos" where "Arquivo_Ref" = a.id limit 1;
  else perform cob_evento(novo, 'nota', 'NFS-e trazida de fora: entra no A receber sem previsão de pagamento.'); end if;
  return jsonb_build_object('ok', novo is not null, 'id', novo);
end $$;

-- A receber de uma nota sem boleto (ou de uma nota emitida pelo chat). Repetir não duplica.
create or replace function cob_registrar_nota(nid text) returns jsonb language plpgsql as $$
declare n "Notas_Fiscais"; c "Entidades_Cadastradas"; novo text; servico text;
begin
  select * into n from "Notas_Fiscais" where id = nid;
  if n.id is null or n."Status" <> 'Emitida' then return jsonb_build_object('ok', false, 'mensagem', 'Nota não encontrada ou não emitida.'); end if;
  -- Uma de cada vez por nota (22/11/2026): o app (logo depois de emitir) e a sincronização podem registrar a mesma
  -- nota no mesmo instante; sem a trava, ela entraria duas vezes no A receber.
  perform pg_advisory_xact_lock(hashtext('cob-registrar-nota:' || n.id));
  select id into novo from "Recebimentos" where "Nota_Ref" = n.id limit 1;
  if novo is not null then return jsonb_build_object('ok', true, 'existente', true, 'id', novo); end if;
  select * into c from "Entidades_Cadastradas" where id = n."Cliente_Ref";
  servico := left(cob_servico_da_nota(n."Descricao"), 90);
  insert into "Recebimentos" ("Descricao", "Valor", "Cliente_Nome", "Cliente_Documento", "Cliente_Ref", "Status", "Origem", "Emissor",
      "Nota_Ref", "Material_Valor", "Atualizado_Em")
  values ('NFS-e nº ' || coalesce(n."Numero_NFSe", '?') || case when servico <> '' then ' · ' || servico else '' end, n."Valor",
      coalesce(cob_nome_cliente(c), n."Tomador_Nome"), cob_digitos(coalesce(c."CPF_CNPJ", n."Tomador_Documento")), c.id, 'Pendente', 'nota',
      coalesce(n."Emissor", 'CNPJ 1'), n.id, coalesce(cob_material_da_nota(n."Descricao"), 0), now())
  returning id into novo;
  perform cob_evento(novo, 'nota', 'NFS-e nº ' || coalesce(n."Numero_NFSe", '?') || ' emitida, sem boleto: entra no A receber sem previsão de pagamento.');
  return jsonb_build_object('ok', true, 'id', novo);
end $$;

-- cob_registrar: recebe as respostas do Asaas (na ordem das chamadas) e grava.
-- p: { contexto, respostas: [{ ref, resposta }] }
create or replace function cob_registrar(p jsonb) returns jsonb language plpgsql as $$
declare ctx jsonb := p -> 'contexto'; acao text := ctx ->> 'acao'; x jsonb; ref jsonb; res jsonb; pay jsonb; erro text;
  rid text; chamadas jsonb := '[]'; desc_boleto text; r "Recebimentos";
begin
  for x in select * from jsonb_array_elements(coalesce(p -> 'respostas', '[]')) loop
    ref := x -> 'ref'; res := x -> 'resposta'; rid := ref ->> 'id';
    erro := case when res ? 'error' then coalesce(substring(res -> 'error' ->> 'message' from '"description"\s*:\s*"([^"]+)"'),
                                                left(coalesce(res -> 'error' ->> 'description', res -> 'error' ->> 'message', 'erro'), 200)) end;
    if ref ->> 'tipo' = 'procura' then
      -- Achou o boleto que tinha sido criado antes: só grava. Não achou: cria agora.
      pay := (select t.v from jsonb_array_elements(coalesce(res -> 'data', '[]')) as t(v) where coalesce((t.v ->> 'deleted')::boolean, false) = false limit 1);
      if pay is not null then perform cob_gravar_pagamento(rid, pay, 'recuperado');
      elsif erro is null then
        select * into r from "Recebimentos" where id = rid;
        chamadas := chamadas || jsonb_build_object('conta', r."Asaas_Conta", 'metodo', 'POST', 'url', 'https://api.asaas.com/v3/payments',
          'corpo', jsonb_build_object('customer', r."Asaas_Cliente_Id", 'billingType', 'BOLETO', 'value', r."Valor", 'dueDate', r."Vencimento",
            'description', ref ->> 'descricao', 'externalReference', r.id, 'fine', jsonb_build_object('value', 2),
            'interest', jsonb_build_object('value', 1), 'daysAfterDueDateToRegistrationCancellation', 30),
          'ref', jsonb_build_object('tipo', 'criar', 'id', r.id));
      else
        update "Recebimentos" set "Asaas_Status" = 'ERRO', "Aviso" = erro, "Atualizado_Em" = now() where id = rid;
      end if;
    elsif ref ->> 'tipo' = 'criar' then
      if erro is null and coalesce(res ->> 'id', '') like 'pay_%' then perform cob_gravar_pagamento(rid, res, 'criado');
      else
        update "Recebimentos" set "Asaas_Status" = 'ERRO', "Aviso" = coalesce(erro, 'resposta inesperada do Asaas'), "Atualizado_Em" = now() where id = rid;
        perform cob_evento(rid, 'erro', 'O Asaas não aceitou criar o boleto: ' || coalesce(erro, 'resposta inesperada') || '.');
      end if;
    elsif ref ->> 'tipo' = 'descricao' then
      perform cob_descricao_feita(rid, ref ->> 'numero', erro);
    elsif ref ->> 'tipo' = 'baixa' then
      if erro is null then
        perform cob_baixar(rid, (ctx ->> 'data')::date, (ctx ->> 'valor')::numeric, coalesce(ctx ->> 'por', 'manual'), ctx ->> 'ref', ctx ->> 'forma');
        update "Recebimentos" set "Asaas_Status" = coalesce(res ->> 'status', 'RECEIVED_IN_CASH') where id = rid;
        return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'mensagem', 'Recebimento registrado. O Asaas deu baixa no boleto e parou os avisos.',
          'item', (select cob_item(y) from "Recebimentos" y where y.id = rid)));
      end if;
      if ctx ->> 'por' = 'conciliacao' then update "Conciliacao" set "Status" = 'pendente', "Recebimento_Ref" = null where "Transacao_Id" = ctx ->> 'ref'; end if;
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'O Asaas não deu baixa no boleto: ' || erro || '. Nada mudou.'));
    elsif ref ->> 'tipo' = 'prorrogar' then
      if erro is null then
        update "Recebimentos" set "Vencimento" = (ctx ->> 'vencimento')::date, "Asaas_Status" = coalesce(res ->> 'status', "Asaas_Status"),
               "Aviso" = case when "Aviso" like 'Venceu há mais de 30 dias%' then null else "Aviso" end, "Atualizado_Em" = now() where id = rid;
        perform cob_evento(rid, 'vencimento', 'Vencimento mudou de ' || to_char((ctx ->> 'antes')::date, 'DD/MM/YYYY') || ' para '
          || to_char((ctx ->> 'vencimento')::date, 'DD/MM/YYYY') || '. Os avisos seguem a data nova.');
        return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'mensagem', 'Vencimento trocado no Asaas.', 'item', (select cob_item(y) from "Recebimentos" y where y.id = rid)));
      end if;
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'O Asaas não aceitou a data nova: ' || erro || '.'));
    elsif ref ->> 'tipo' = 'cancelar' then
      if erro is null or erro ~* 'não encontrad|not found|removid' then
        update "Recebimentos" set "Status" = 'Cancelado', "Asaas_Status" = 'DELETED', "Atualizado_Em" = now() where id = rid;
        perform cob_evento(rid, 'cancelado', 'Boleto cancelado no Asaas (não cobra taxa).', 'cancelado:' || rid);
        return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'mensagem', 'Boleto cancelado.'));
      end if;
      return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'O Asaas não cancelou: ' || erro || '.'));
    end if;
  end loop;
  -- Procura que não achou nada: a criação acontece numa segunda volta.
  if jsonb_array_length(chamadas) > 0 then return jsonb_build_object('chamadas', chamadas, 'contexto', ctx); end if;
  if acao in ('criar', 'ligar-nota') then return jsonb_build_object('resposta', cob_resultado_grupo(ctx ->> 'grupo')); end if;
  return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Nada foi feito.'));
end $$;

-- Grava num A receber o que o Asaas devolveu de um pagamento (criado agora ou achado depois).
create or replace function cob_gravar_pagamento(rid text, pay jsonb, motivo text) returns void language plpgsql as $$
declare numero text;
begin
  update "Recebimentos" set "Asaas_Cobranca_Id" = pay ->> 'id', "Asaas_Link" = pay ->> 'invoiceUrl', "Boleto_Url" = pay ->> 'bankSlipUrl',
         "Asaas_Status" = coalesce(pay ->> 'status', 'PENDING'), "Asaas_Cliente_Id" = coalesce(pay ->> 'customer', "Asaas_Cliente_Id"),
         "Aviso" = null, "Atualizado_Em" = now()
   where id = rid;
  perform cob_evento(rid, 'criado', 'Boleto criado no Asaas: ' || cob_reais((pay ->> 'value')::numeric) || ', vence em '
    || to_char((pay ->> 'dueDate')::date, 'DD/MM/YYYY') || '. Pode ser pago até 30 dias depois, com multa e juros.', 'criado:' || rid);
  select btrim(nf."Numero_NFSe") into numero from "Recebimentos" x join "Notas_Fiscais" nf on nf.id = x."Nota_Ref" where x.id = rid;
  if coalesce(numero, '') <> '' and position(('NFS-e nº ' || numero) in coalesce(pay ->> 'description', '')) > 0 then
    perform cob_descricao_feita(rid, numero, null);
  end if;
end $$;

-- ========================= sincronização (fluxo "Cobrancas - Sincronizar", de 30 em 30 minutos) =========================
-- Taxa do Asaas como gasto (pedido do dono, 22/11/2026): cada boleto pago vira uma despesa paga no Financeiro, com a
-- taxa que o Asaas cobrou de fato (valor pago - líquido). Uma só por cobrança (Servico_Ref); refeita se a taxa mudar.
create or replace function cob_despesa_taxa(rid text, quando date) returns void language plpgsql as $$
declare r "Recebimentos"; numero text; did text;
begin
  select * into r from "Recebimentos" where id = rid;
  if r.id is null or coalesce(r."Taxa", 0) <= 0 then return; end if;
  select nf."Numero_NFSe" into numero from "Notas_Fiscais" nf where nf.id = r."Nota_Ref" and nf."Status" = 'Emitida';
  select id into did from "Despesas" where "Servico_Ref" = rid and "Categoria" = 'Taxas do Asaas' limit 1;
  if did is null then
    insert into "Despesas" ("Descricao", "Valor", "Vencimento", "Status", "Categoria", "Data_Pagamento", "Forma_Pagamento", "Observacoes", "Servico_Ref")
    values (left('Taxa do boleto · ' || coalesce(r."Cliente_Nome", 'cliente') || coalesce(' · NFS-e nº ' || nullif(btrim(numero), ''), ''), 200),
            r."Taxa", coalesce(quando, cob_hoje()), 'Pago', 'Taxas do Asaas', coalesce(quando, cob_hoje()), 'Asaas',
            'Descontada pelo Asaas do boleto pago (' || coalesce(r."Asaas_Conta", '') || ').', rid);
  else
    update "Despesas" set "Valor" = r."Taxa" where id = did and "Valor" is distinct from r."Taxa";
  end if;
end $$;

-- Anexos dos e-mails do sistema: o PDF do boleto (link público do Asaas) e o PDF da nota ou do recibo (guardados no
-- sistema, entregues pelo fluxo "anexo"). O nó do n8n baixa cada um; o que falhar fica de fora (o link vai no texto).
create or replace function cob_anexos(r "Recebimentos", com_documento boolean default true) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(a.v order by a.o), '[]'::jsonb) from (
    select 1 as o, jsonb_build_object('url', r."Boleto_Url", 'nome', 'Boleto ' || to_char(r."Vencimento", 'DD-MM-YYYY') ||
           case when coalesce(r."Parcela_Total", 1) > 1 then ' (' || r."Parcela_Numero" || ' de ' || r."Parcela_Total" || ')' else '' end || '.pdf') as v
     where coalesce(r."Boleto_Url", '') ~ '^https://[a-z0-9.-]*asaas\.com/'
    union all
    select 2, jsonb_build_object('url', 'http://localhost:5678/webhook/anexo?id=' || (nf."Pdf_Nota" -> 0 ->> 'id'),
           'nome', coalesce(nullif(nf."Pdf_Nota" -> 0 ->> 'filename', ''), 'NFS-e ' || coalesce(nf."Numero_NFSe", '') || '.pdf'))
      from "Notas_Fiscais" nf
     where com_documento and nf.id = r."Nota_Ref" and nf."Status" = 'Emitida' and coalesce(nf."Pdf_Nota" -> 0 ->> 'id', '') ~ '^att[0-9a-f]{32}$'
    union all
    select 3, jsonb_build_object('url', 'http://localhost:5678/webhook/anexo?id=' || (ac."Arquivo" -> 0 ->> 'id'),
           'nome', coalesce(nullif(ac."Arquivo" -> 0 ->> 'filename', ''), 'Recibo.pdf'))
      from "Arquivos_Cliente" ac
     where com_documento and ac.id = r."Arquivo_Ref" and coalesce(ac."Arquivo" -> 0 ->> 'id', '') ~ '^att[0-9a-f]{32}$') a $$;

create or replace function cob_html(t text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') $$;

-- E-mail do sistema (HTML simples, sem imagens). tipo: criado | vespera | atraso. Para "criado" de um boleto parcelado,
-- `parcelas` traz todas as parcelas do pedido (uma linha cada).
create or replace function cob_email_html(r "Recebimentos", tipo text, parcelas jsonb default null) returns text language sql stable as $$
  select '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;max-width:560px">'
    || '<p style="margin:0 0 4px;font-size:18px;color:#0F2747"><strong>Soluções Rápidas</strong></p>'
    || '<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Manutenção predial</p>'
    || case tipo
         when 'criado' then '<p>Olá! Segue o boleto do serviço prestado' || case when jsonb_array_length(coalesce(parcelas, '[]')) > 1
              then ', em ' || jsonb_array_length(parcelas) || ' parcelas.' else ', com vencimento em <strong>' || to_char(r."Vencimento", 'DD/MM/YYYY') || '</strong>.' end
              || ' O boleto' || case when r."Nota_Ref" is not null then ' e a nota fiscal vão anexos.' when r."Arquivo_Ref" is not null then ' e o recibo vão anexos.' else ' vai anexo.' end || '</p>'
         when 'vespera' then '<p>Olá! Só um lembrete: o boleto abaixo <strong>vence amanhã, ' || to_char(r."Vencimento", 'DD/MM/YYYY') || '</strong>.</p>'
         else '<p>Olá! Consta em aberto o boleto abaixo, que venceu em <strong>' || to_char(r."Vencimento", 'DD/MM/YYYY')
              || '</strong>. Pelo link ele já sai com o valor atualizado.</p>' end
    || '<table style="border-collapse:collapse;margin:12px 0;font-size:14px">'
    || '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Cliente</td><td style="padding:4px 0">' || cob_html(r."Cliente_Nome") || '</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Referente a</td><td style="padding:4px 0">' || cob_html(r."Descricao") || '</td></tr>'
    || case when jsonb_array_length(coalesce(parcelas, '[]')) > 1 then
         (select string_agg('<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Parcela ' || (x ->> 'n') || '</td><td style="padding:4px 0"><strong>'
            || cob_reais((x ->> 'valor')::numeric) || '</strong> · vence ' || to_char((x ->> 'vencimento')::date, 'DD/MM/YYYY')
            || ' · <a href="' || replace(coalesce(x ->> 'link', ''), '"', '') || '">ver boleto</a></td></tr>', '' order by (x ->> 'n')::int)
            from jsonb_array_elements(parcelas) x)
       else '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Valor</td><td style="padding:4px 0"><strong>' || cob_reais(r."Valor") || '</strong></td></tr>'
         || '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Vencimento</td><td style="padding:4px 0">' || to_char(r."Vencimento", 'DD/MM/YYYY') || '</td></tr>' end
    || '</table>'
    || case when jsonb_array_length(coalesce(parcelas, '[]')) > 1 then '' else
         '<p><a href="' || replace(coalesce(r."Asaas_Link", ''), '"', '') || '" style="display:inline-block;background:#0F2747;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px">Ver boleto e pagar</a></p>' end
    || '<p style="font-size:13px;color:#6b7280">' || case when tipo = 'criado' then '' else 'Se já pagou, pode desconsiderar este e-mail. ' end
    || 'Após o vencimento entram multa de 2% e juros de 1% ao mês.</p>'
    || '<p style="font-size:13px;color:#6b7280">Dúvidas: (47) 99208-1047 · adm.solucoes.rapidas@gmail.com</p></div>' $$;

-- (nome antigo, usado pelos testes)
create or replace function cob_email_lembrete(r "Recebimentos") returns text language sql stable as $$ select cob_email_html(r, 'vespera') $$;

-- ========== Nota por e-mail ao financeiro do cliente (22/11/2026, pedido do dono) ==========
-- Cliente sem boleto: depois de emitir, o sistema pergunta se manda a nota (PDF) e quais documentos da pasta do
-- cliente vão junto. Sai do e-mail adm, para os e-mails do financeiro (Para/Cc/Cco), pelo fluxo "App - Cobrancas".

-- O que o e-mail vai ter (para mostrar antes de enviar).
create or replace function cob_preparar_email(p jsonb) returns jsonb language plpgsql stable as $$
declare n "Notas_Fiscais"; emails text[];
begin
  select * into n from "Notas_Fiscais" where id = cob_txt(p, 'notaId');
  if n.id is null or n."Status" <> 'Emitida' then return jsonb_build_object('ok', false, 'mensagem', 'Nota não encontrada ou não emitida.'); end if;
  if n."Cliente_Ref" is null then return jsonb_build_object('ok', false, 'mensagem', 'Esta nota não está ligada a um cliente do sistema.'); end if;
  emails := cob_emails(n."Cliente_Ref");
  if coalesce(array_length(emails, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'mensagem', 'O cliente não tem e-mail do financeiro: cadastre o e-mail ou mande a nota pelo WhatsApp.');
  end if;
  return jsonb_build_object('ok', true, 'numero', n."Numero_NFSe", 'clienteId', n."Cliente_Ref", 'destinos', cob_destinos(emails),
    'temPdf', coalesce(n."Pdf_Nota" -> 0 ->> 'id', '') ~ '^att[0-9a-f]{32}$', 'teste', n."Ambiente" <> 'Producao');
end $$;

-- Texto do e-mail da nota (HTML simples, sem imagens).
create or replace function cob_email_nota_html(n "Notas_Fiscais", cliente text, documentos text[]) returns text language sql stable as $$
  select '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;max-width:560px">'
    || '<p style="margin:0 0 4px;font-size:18px;color:#0F2747"><strong>Soluções Rápidas</strong></p>'
    || '<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Manutenção predial</p>'
    || '<p>Olá! Segue em anexo a nota fiscal do serviço prestado' || case when coalesce(array_length(documentos, 1), 0) > 0 then ', junto com '
         || case when array_length(documentos, 1) = 1 then 'o documento abaixo' else 'os documentos abaixo' end else '' end || '.</p>'
    || '<table style="border-collapse:collapse;margin:12px 0;font-size:14px">'
    || '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Nota fiscal</td><td style="padding:4px 0">NFS-e nº ' || cob_html(coalesce(n."Numero_NFSe", '?')) || '</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Cliente</td><td style="padding:4px 0">' || cob_html(coalesce(cliente, n."Tomador_Nome")) || '</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Serviço</td><td style="padding:4px 0">' || cob_html(cob_servico_da_nota(n."Descricao")) || '</td></tr>'
    || '<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Valor</td><td style="padding:4px 0"><strong>' || cob_reais(n."Valor") || '</strong></td></tr>'
    || coalesce('<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Pagamento</td><td style="padding:4px 0">'
         || cob_html(nullif(btrim(substring(coalesce(n."Descricao", '') from 'Dados para pagamento - (.*)$')), '')) || '</td></tr>', '')
    || coalesce((select string_agg('<tr><td style="padding:4px 16px 4px 0;color:#6b7280">Anexo</td><td style="padding:4px 0">' || cob_html(d) || '</td></tr>', '')
         from unnest(documentos) d), '')
    || '</table>'
    || '<p style="font-size:13px;color:#6b7280">Dúvidas: (47) 99208-1047 · adm.solucoes.rapidas@gmail.com</p></div>' $$;

-- Monta o e-mail e reserva o envio (um por pedido: clique duplo não manda duas vezes). Devolve { email } para o
-- fluxo mandar, ou { resposta } com o motivo de não mandar.
create or replace function cob_enviar_nota(p jsonb) returns jsonb language plpgsql as $$
declare n "Notas_Fiscais"; emails text[]; pedido text := cob_txt(p, 'pedido'); rid text; ev text; dest jsonb; anexos jsonb; nomes text[];
  docs text[]; cliente text;
begin
  if pedido is null or pedido !~ '^[A-Za-z0-9-]{8,64}$' then
    return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Pedido sem identificação: recarregue a página.'));
  end if;
  select * into n from "Notas_Fiscais" where id = cob_txt(p, 'notaId');
  if n.id is null or n."Status" <> 'Emitida' then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Nota não encontrada ou não emitida.')); end if;
  if n."Cliente_Ref" is null then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Esta nota não está ligada a um cliente do sistema.')); end if;
  if coalesce(n."Pdf_Nota" -> 0 ->> 'id', '') !~ '^att[0-9a-f]{32}$' then
    return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'O PDF da nota ainda não está pronto. Tente de novo em alguns segundos.'));
  end if;
  emails := cob_emails(n."Cliente_Ref");
  if coalesce(array_length(emails, 1), 0) = 0 then
    return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'O cliente não tem e-mail do financeiro: cadastre o e-mail ou mande a nota pelo WhatsApp.'));
  end if;
  dest := cob_destinos(emails);
  -- A nota no A receber (a mesma conta de sempre; cria se ainda não existir) guarda o histórico do envio.
  rid := (cob_registrar_nota(n.id)) ->> 'id';
  -- Documentos escolhidos: só da pasta do mesmo cliente, com arquivo, no máximo 10.
  docs := array(select jsonb_array_elements_text(coalesce(p -> 'documentos', '[]')) limit 10);
  select coalesce(jsonb_agg(jsonb_build_object('url', 'http://localhost:5678/webhook/anexo?id=' || (a."Arquivo" -> 0 ->> 'id'),
           'nome', coalesce(nullif(a."Arquivo" -> 0 ->> 'filename', ''), a."Titulo" || '.pdf')) order by a."Data_Documento" desc nulls last, a."Criado_Em" desc), '[]'::jsonb),
         coalesce(array_agg(a."Titulo" order by a."Data_Documento" desc nulls last, a."Criado_Em" desc), '{}')
    into anexos, nomes
    from "Arquivos_Cliente" a
   where a.id = any (docs) and a."Cliente_Ref" = n."Cliente_Ref" and coalesce(a."Arquivo" -> 0 ->> 'id', '') ~ '^att[0-9a-f]{32}$';
  anexos := jsonb_build_array(jsonb_build_object('url', 'http://localhost:5678/webhook/anexo?id=' || (n."Pdf_Nota" -> 0 ->> 'id'),
              'nome', coalesce(nullif(n."Pdf_Nota" -> 0 ->> 'filename', ''), 'NFS-e ' || coalesce(n."Numero_NFSe", '') || '.pdf'))) || anexos;
  select cob_nome_cliente(c) into cliente from "Entidades_Cadastradas" c where c.id = n."Cliente_Ref";
  insert into "Cobranca_Eventos" ("Recebimento_Ref", "Tipo", "Texto", "Chave", "Dados")
  values (rid, 'email-enviando', 'Nota sendo enviada por e-mail.', 'email-nota:' || n.id || ':' || pedido,
          jsonb_build_object('destinos', dest, 'numero', n."Numero_NFSe", 'anexos', jsonb_array_length(anexos)))
  on conflict ("Chave") do nothing returning id into ev;
  if ev is null then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Este envio já foi pedido. Veja o histórico da conta em Financeiro › A receber.')); end if;
  return jsonb_build_object('email', jsonb_build_object('evento', ev, 'para', dest ->> 'para', 'cc', dest ->> 'cc', 'cco', dest ->> 'cco',
    'assunto', 'Soluções Rápidas · NFS-e nº ' || coalesce(n."Numero_NFSe", '?'),
    'html', cob_email_nota_html(n, cliente, nomes), 'anexos', anexos));
end $$;

-- Resultado do envio. p: { evento, ok, erro, anexos (os que foram), esperados }
create or replace function cob_email_feito(p jsonb) returns jsonb language plpgsql as $$
declare e "Cobranca_Eventos"; d jsonb; foram int := coalesce(cob_num(p, 'anexos')::int, 0); esperados int := coalesce(cob_num(p, 'esperados')::int, 0);
  quem text; ok boolean := coalesce((p ->> 'ok')::boolean, false);
begin
  select * into e from "Cobranca_Eventos" where id = cob_txt(p, 'evento') and "Tipo" = 'email-enviando';
  if e.id is null then return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem', 'Envio não encontrado.')); end if;
  d := e."Dados" -> 'destinos';
  quem := (d ->> 'para') || case when coalesce(d ->> 'cc', '') <> '' then ' (Cc: ' || (d ->> 'cc') || ')' else '' end
          || case when coalesce(d ->> 'cco', '') <> '' then ' (Cco: ' || (d ->> 'cco') || ')' else '' end;
  if ok and foram >= 1 then
    update "Cobranca_Eventos" set "Tipo" = 'email-nota', "Quando" = now(),
           "Texto" = 'NFS-e nº ' || coalesce(e."Dados" ->> 'numero', '?') || ' enviada por e-mail para ' || quem || ', com ' || foram || ' anexo(s).'
     where id = e.id;
    return jsonb_build_object('resposta', jsonb_build_object('ok', true, 'para', d ->> 'para', 'cc', d ->> 'cc', 'cco', d ->> 'cco', 'anexos', foram,
      'mensagem', 'E-mail enviado para ' || quem || ', com ' || foram || ' anexo(s).'
        || case when foram < esperados then ' Atenção: ' || (esperados - foram) || ' documento(s) não foram (não consegui ler o arquivo).' else '' end));
  end if;
  update "Cobranca_Eventos" set "Tipo" = 'erro', "Quando" = now(), "Chave" = "Chave" || ':falhou:' || e.id,
         "Texto" = 'Não consegui mandar a nota por e-mail (' || left(coalesce(nullif(cob_txt(p, 'erro'), ''), case when foram = 0 then 'o PDF da nota não foi lido' else 'erro' end), 150) || ').'
   where id = e.id;
  return jsonb_build_object('resposta', jsonb_build_object('ok', false, 'mensagem',
    'O e-mail não saiu: ' || coalesce(nullif(cob_txt(p, 'erro'), ''), case when foram = 0 then 'não consegui ler o PDF da nota' else 'erro no envio' end) || '. Nada foi enviado; tente de novo.'));
end $$;

-- Passo 1: trava (uma sincronização por vez), lista o que perguntar ao Asaas e reserva os lembretes da véspera.
create or replace function cob_sinc_plano(p jsonb) returns jsonb language plpgsql as $$
-- (p.hora só existe para o teste conferir o lembrete fora do horário; o fluxo nunca manda.)
declare ok int; hoje date := cob_hoje(); hora int := coalesce(cob_num(p, 'hora')::int, extract(hour from now() at time zone 'America/Sao_Paulo')::int);
  chamadas jsonb := '[]'; r record; conta text; desde date := cob_hoje() - 3; lembretes jsonb := '[]'; taxas boolean; reservado text;
  emails_desde timestamptz; g record; base "Recebimentos"; dias int;
begin
  insert into "Cobranca_Estado" (id, "Valor") values ('sinc:trava', jsonb_build_object('ate', now() + interval '10 minutes'))
  on conflict (id) do update set "Valor" = excluded."Valor" where ("Cobranca_Estado"."Valor" ->> 'ate')::timestamptz < now()
  returning 1 into ok;
  if ok is null then return jsonb_build_object('ok', true, 'ocupado', true); end if;
  -- Lembrete reservado numa volta que parou no meio (PC desligou, erro): libera para tentar de novo.
  delete from "Cobranca_Eventos" where "Tipo" = 'lembrete-reservado' and "Quando" < now() - interval '30 minutes';
  foreach conta in array array['CNPJ 1', 'CNPJ 2'] loop
    chamadas := chamadas
      || jsonb_build_object('conta', conta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/finance/balance', 'ref', jsonb_build_object('tipo', 'saldo', 'conta', conta))
      || jsonb_build_object('conta', conta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/pix/addressKeys?status=ACTIVE', 'ref', jsonb_build_object('tipo', 'pix', 'conta', conta))
      || jsonb_build_object('conta', conta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/payments?limit=100&dateCreated%5Bge%5D=' || desde, 'ref', jsonb_build_object('tipo', 'lista', 'conta', conta))
      || jsonb_build_object('conta', conta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/payments?limit=100&paymentDate%5Bge%5D=' || desde, 'ref', jsonb_build_object('tipo', 'lista', 'conta', conta))
      || jsonb_build_object('conta', conta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/financialTransactions?limit=100&startDate=' || desde || '&finishDate=' || hoje, 'ref', jsonb_build_object('tipo', 'extrato', 'conta', conta));
    -- Taxas: uma vez por dia basta.
    taxas := null;
    select coalesce(("Valor" ->> 'taxasEm')::date, '2000-01-01') < hoje into taxas from "Cobranca_Estado" where id = 'conta:' || conta;
    if coalesce(taxas, true) then
      chamadas := chamadas || jsonb_build_object('conta', conta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/myAccount/fees', 'ref', jsonb_build_object('tipo', 'taxas', 'conta', conta));
    end if;
    -- Agência e conta no Asaas (vão nos dados de pagamento das notas e recibos quando o PIX do CNPJ estiver lá): 1x/dia.
    taxas := null;
    select coalesce(("Valor" ->> 'numeroEm')::date, '2000-01-01') < hoje into taxas from "Cobranca_Estado" where id = 'conta:' || conta;
    if coalesce(taxas, true) then
      chamadas := chamadas || jsonb_build_object('conta', conta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/myAccount/accountNumber', 'ref', jsonb_build_object('tipo', 'numero-conta', 'conta', conta));
    end if;
  end loop;
  -- Cada boleto aberto: como está no Asaas e se o cliente já abriu a fatura.
  for r in select id, "Asaas_Cobranca_Id" as pid, "Asaas_Conta" as aconta, "Visto_Em" as visto from "Recebimentos"
            where coalesce("Asaas_Cobranca_Id", '') <> '' and ("Status" = 'Pendente' or ("Status" = 'Recebido' and "Asaas_Status" = 'CONFIRMED'))
            order by "Vencimento" limit 150 loop
    chamadas := chamadas || jsonb_build_object('conta', r.aconta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/payments/' || r.pid, 'ref', jsonb_build_object('tipo', 'pagamento', 'id', r.id));
    if r.visto is null then
      chamadas := chamadas || jsonb_build_object('conta', r.aconta, 'metodo', 'GET', 'url', 'https://api.asaas.com/v3/payments/' || r.pid || '/viewingInfo', 'ref', jsonb_build_object('tipo', 'visto', 'id', r.id));
    end if;
  end loop;
  -- E-mails ao cliente pelo sistema (regra do dono, 22/11/2026: os avisos do Asaas ficam desligados). Ligado a partir
  -- de Cobranca_Estado 'emails-sistema' (desde). Remetente: adm (credencial SMTP do fluxo). A reserva com a chave garante
  -- um envio só por boleto/pedido e por data; e-mail perdido (PC desligado) não sai atrasado.
  select ("Valor" ->> 'desde')::timestamptz into emails_desde from "Cobranca_Estado" where id = 'emails-sistema';
  if emails_desde is not null then
    -- (a) Boleto criado: um e-mail por pedido (todas as parcelas), com os boletos e a nota (ou recibo) anexos.
    for g in select coalesce(x."Grupo", x.id) as k, min(x.id) as primeiro from "Recebimentos" x
              where x."Status" = 'Pendente' and coalesce(x."Asaas_Cobranca_Id", '') <> ''
                and x."Asaas_Status" in ('PENDING', 'AWAITING_RISK_ANALYSIS') and x."Cliente_Ref" is not null
                -- Boleto criado depois de ligar os e-mails (a conta pode ser mais antiga: "Gerar boleto" numa nota de antes),
                -- ou feito direto no painel do Asaas depois disso (os avisos do Asaas estão desligados: só o sistema avisa).
                and (exists (select 1 from "Cobranca_Eventos" ce where ce."Chave" = 'criado:' || x.id and ce."Quando" >= emails_desde)
                     or (x."Origem" = 'asaas' and x."Criado_Em" >= emails_desde))
                and not exists (select 1 from "Recebimentos" y where y."Grupo" = x."Grupo" and coalesce(y."Asaas_Cobranca_Id", '') = '' and y."Status" = 'Pendente')
                and not exists (select 1 from "Cobranca_Eventos" e where e."Chave" in ('email-criado:' || coalesce(x."Grupo", x.id), 'sem-email:criado:' || coalesce(x."Grupo", x.id)))
              group by 1 limit 20 loop
      select * into base from "Recebimentos" where id = (select y.id from "Recebimentos" y where coalesce(y."Grupo", y.id) = g.k order by y."Parcela_Numero" nulls first limit 1);
      if coalesce(array_length(cob_emails(base."Cliente_Ref"), 1), 0) = 0 then
        perform cob_evento(base.id, 'sem-email', 'Boleto criado, mas o cliente não tem e-mail: mande pelo WhatsApp.', 'sem-email:criado:' || g.k);
        update "Recebimentos" set "Aviso" = 'Cliente sem e-mail: mande o boleto pelo WhatsApp.' where id = base.id and "Aviso" is null;
        continue;
      end if;
      reservado := null;
      insert into "Cobranca_Eventos" ("Recebimento_Ref", "Tipo", "Texto", "Chave", "Dados")
      values (base.id, 'lembrete-reservado', 'E-mail do boleto sendo enviado.', 'email-criado:' || g.k, '{}')
      on conflict ("Chave") do nothing returning id into reservado;
      if reservado is not null then
        lembretes := lembretes || (select jsonb_build_object('evento', reservado, 'tipo', 'criado', 'id', base.id, 'emails', to_jsonb(cob_emails(base."Cliente_Ref")),
          'assunto', 'Soluções Rápidas · boleto' || coalesce(' e NFS-e nº ' || nullif(btrim((select nf."Numero_NFSe" from "Notas_Fiscais" nf where nf.id = base."Nota_Ref" and nf."Status" = 'Emitida')), ''), '')
                     || case when count(*) > 1 then ' · ' || count(*) || ' parcelas' else ' · vence ' || to_char(base."Vencimento", 'DD/MM') end,
          'html', cob_email_html(base, 'criado', case when count(*) > 1 then jsonb_agg(jsonb_build_object('n', y."Parcela_Numero", 'valor', y."Valor", 'vencimento', y."Vencimento", 'link', y."Asaas_Link")) end),
          'anexos', (select coalesce(jsonb_agg(a.v), '[]'::jsonb) from (
                      select t.v from "Recebimentos" z, jsonb_array_elements(cob_anexos(z, false)) as t(v) where coalesce(z."Grupo", z.id) = g.k and z."Status" = 'Pendente'
                      union all
                      select t.v from jsonb_array_elements(cob_anexos(base, true)) as t(v) where t.v ->> 'url' like 'http://localhost:%') a))
          from "Recebimentos" y where coalesce(y."Grupo", y.id) = g.k and y."Status" = 'Pendente');
      end if;
    end loop;
    -- (b) Aviso dos 30 dias: o boleto não pode mais ser pago; quem resolve é o dono (só um aviso, no sistema).
    for r in select x.* from "Recebimentos" x where x."Status" = 'Pendente' and coalesce(x."Asaas_Cobranca_Id", '') <> ''
              and x."Vencimento" is not null and hoje - x."Vencimento" >= 30 loop
      update "Recebimentos" set "Aviso" = 'Venceu há mais de 30 dias e o boleto não pode mais ser pago: dê uma data nova, a baixa (se recebeu por fora) ou cancele.'
       where id = r.id and coalesce("Aviso", '') not like 'Venceu há mais de 30 dias%';
      perform cob_evento(r.id, 'limite', 'Venceu há mais de 30 dias: o boleto não pode mais ser pago.', 'limite30:' || r."Asaas_Cobranca_Id" || ':' || r."Vencimento");
    end loop;
  end if;
  if hora between 8 and 20 then
    for r in
      with candidatos as (
        select x.* from "Recebimentos" x
         where x."Status" = 'Pendente' and coalesce(x."Asaas_Cobranca_Id", '') <> '' and x."Asaas_Status" in ('PENDING', 'AWAITING_RISK_ANALYSIS')
           and x."Vencimento" = hoje + 1 and x."Cliente_Ref" is not null)
      select c.*, cob_emails(c."Cliente_Ref") as emails from candidatos c
    loop
      if coalesce(array_length(r.emails, 1), 0) = 0 then
        perform cob_evento(r.id, 'sem-email', 'Vence amanhã, mas o cliente não tem e-mail: mande o link pelo WhatsApp.', 'sem-email:' || r."Asaas_Cobranca_Id" || ':' || r."Vencimento");
        continue;
      end if;
      reservado := null;
      insert into "Cobranca_Eventos" ("Recebimento_Ref", "Tipo", "Texto", "Chave", "Dados")
      values (r.id, 'lembrete-reservado', 'Lembrete de véspera sendo enviado.', 'lembrete:' || r."Asaas_Cobranca_Id" || ':' || r."Vencimento", '{}')
      on conflict ("Chave") do nothing returning id into reservado;
      if reservado is not null then
        select * into base from "Recebimentos" where id = r.id;
        lembretes := lembretes || jsonb_build_object('evento', reservado, 'tipo', 'vespera', 'id', r.id, 'emails', to_jsonb(r.emails),
          'assunto', 'Lembrete: boleto de ' || cob_reais(r."Valor") || ' vence amanhã (' || to_char(r."Vencimento", 'DD/MM') || ')',
          'html', cob_email_html(base, 'vespera'), 'anexos', case when emails_desde is not null then cob_anexos(base) else '[]'::jsonb end);
      end if;
    end loop;
    -- Atraso: aviso a cada 3 dias (1º, 4º, 7º... dia depois do vencimento) até o 29º; o dia perdido não sai depois.
    if emails_desde is not null then
      for r in
        with candidatos as (
          select x.* from "Recebimentos" x
           where x."Status" = 'Pendente' and coalesce(x."Asaas_Cobranca_Id", '') <> '' and x."Asaas_Status" in ('PENDING', 'OVERDUE')
             and x."Vencimento" < hoje and hoje - x."Vencimento" between 1 and 29 and (hoje - x."Vencimento" - 1) % 3 = 0 and x."Cliente_Ref" is not null)
        select c.*, cob_emails(c."Cliente_Ref") as emails from candidatos c
      loop
        dias := hoje - r."Vencimento";
        if coalesce(array_length(r.emails, 1), 0) = 0 then continue; end if;
        reservado := null;
        insert into "Cobranca_Eventos" ("Recebimento_Ref", "Tipo", "Texto", "Chave", "Dados")
        values (r.id, 'lembrete-reservado', 'Aviso de atraso sendo enviado.', 'atraso:' || r."Asaas_Cobranca_Id" || ':' || r."Vencimento" || ':' || dias, '{}')
        on conflict ("Chave") do nothing returning id into reservado;
        if reservado is not null then
          select * into base from "Recebimentos" where id = r.id;
          lembretes := lembretes || jsonb_build_object('evento', reservado, 'tipo', 'atraso', 'id', r.id, 'emails', to_jsonb(r.emails),
            'assunto', 'Boleto em aberto: ' || cob_reais(r."Valor") || ', venceu em ' || to_char(r."Vencimento", 'DD/MM'),
            'html', cob_email_html(base, 'atraso'), 'anexos', cob_anexos(base));
        end if;
      end loop;
    end if;
  end if;
  lembretes := coalesce((select jsonb_agg(l || jsonb_build_object('destinos', cob_destinos(array(select jsonb_array_elements_text(l -> 'emails')))))
                          from jsonb_array_elements(lembretes) l), '[]'::jsonb);
  return jsonb_build_object('ok', true, 'ocupado', false, 'chamadas', chamadas, 'lembretes', lembretes, 'hoje', hoje,
    'clientesConhecidos', coalesce((select jsonb_agg(jsonb_build_object('conta', coalesce(nullif("Asaas_Conta", ''), 'CNPJ 1'), 'asaas', "Asaas_Customer_Id"))
      from "Entidades_Cadastradas" where coalesce("Asaas_Customer_Id", '') <> ''), '[]'::jsonb));
end $$;

-- (O texto do lembrete de véspera é o cob_email_html(r, 'vespera'); cob_email_lembrete fica só como atalho dele.)

-- Passo 2: grava tudo o que o Asaas respondeu. p: { respostas: [{ ref, resposta }], clientes: [{ conta, customer: {...} }] }
create or replace function cob_sinc_gravar(p jsonb) returns jsonb language plpgsql as $$
declare x jsonb; ref jsonb; res jsonb; pay jsonb; rid text; r "Recebimentos"; st text; vis timestamptz; conta text; e jsonb;
  cli text; novo text; tx jsonb; pagos int := 0; importados int := 0; hoje date := cob_hoje(); ini timestamptz; n "Notas_Fiscais";
  a "Arquivos_Cliente"; cand record; ncand int; dinheiro jsonb := '[]'; conc "Conciliacao"; sugeridos int := 0; vinculados int := 0;
  estado jsonb; taxa numeric; promo date; pdf jsonb;
begin
  select ("Valor" ->> 'quando')::timestamptz into ini from "Cobranca_Estado" where id = 'inicio';
  for x in select * from jsonb_array_elements(coalesce(p -> 'respostas', '[]')) loop
    ref := x -> 'ref'; res := x -> 'resposta'; conta := ref ->> 'conta';
    if res ? 'error' then
      if ref ->> 'tipo' in ('saldo', 'pix', 'taxas') then
        insert into "Cobranca_Estado" (id, "Valor") values ('conta:' || conta, jsonb_build_object('erro', left(res -> 'error' ->> 'message', 200), 'erroEm', now()))
        on conflict (id) do update set "Valor" = "Cobranca_Estado"."Valor" || excluded."Valor";
      end if;
      continue;
    end if;
    if ref ->> 'tipo' = 'saldo' then
      insert into "Cobranca_Estado" (id, "Valor") values ('conta:' || conta, jsonb_build_object('saldo', (res ->> 'balance')::numeric, 'saldoEm', now(), 'erro', null))
      on conflict (id) do update set "Valor" = "Cobranca_Estado"."Valor" || excluded."Valor";
    elsif ref ->> 'tipo' = 'pix' then
      -- Quais chaves (tipo e chave) também ficam guardadas: a do próprio CNPJ ativa = portabilidade concluída.
      insert into "Cobranca_Estado" (id, "Valor") values ('conta:' || conta, jsonb_build_object('pix', jsonb_array_length(coalesce(res -> 'data', '[]')) > 0,
          'pixChaves', coalesce((select jsonb_agg(jsonb_build_object('tipo', k.v ->> 'type', 'chave', k.v ->> 'key'))
                                   from jsonb_array_elements(coalesce(res -> 'data', '[]')) as k(v) where coalesce(k.v ->> 'status', 'ACTIVE') = 'ACTIVE'), '[]'::jsonb)))
      on conflict (id) do update set "Valor" = "Cobranca_Estado"."Valor" || excluded."Valor";
    elsif ref ->> 'tipo' = 'numero-conta' then
      if coalesce(res ->> 'account', '') ~ '^[0-9]+$' then
        insert into "Cobranca_Estado" (id, "Valor") values ('conta:' || conta, jsonb_build_object('agencia', coalesce(nullif(res ->> 'agency', ''), '0001'),
            'conta', (res ->> 'account') || case when coalesce(res ->> 'accountDigit', '') ~ '^[0-9A-Za-z]$' then '-' || (res ->> 'accountDigit') else '' end,
            'numeroEm', hoje))
        on conflict (id) do update set "Valor" = "Cobranca_Estado"."Valor" || excluded."Valor";
      end if;
    elsif ref ->> 'tipo' = 'taxas' then
      promo := cob_data(res -> 'payment' -> 'bankSlip', 'expirationDate');
      taxa := case when promo is not null and promo > hoje then (res -> 'payment' -> 'bankSlip' ->> 'discountValue')::numeric
                   else (res -> 'payment' -> 'bankSlip' ->> 'defaultValue')::numeric end;
      insert into "Cobranca_Estado" (id, "Valor") values ('conta:' || conta, jsonb_build_object('taxaBoleto', taxa, 'promoAte', promo,
          'taxaAviso', (res -> 'notification' ->> 'messagingFeeValue')::numeric, 'taxasEm', hoje))
      on conflict (id) do update set "Valor" = "Cobranca_Estado"."Valor" || excluded."Valor";
    elsif ref ->> 'tipo' = 'pagamento' then
      perform cob_sinc_pagamento(ref ->> 'id', res);
    elsif ref ->> 'tipo' = 'visto' then
      vis := least(nullif(res ->> 'invoiceViewedDate', '')::timestamptz, nullif(res ->> 'boletoViewedDate', '')::timestamptz);
      if vis is null then vis := coalesce(nullif(res ->> 'invoiceViewedDate', '')::timestamptz, nullif(res ->> 'boletoViewedDate', '')::timestamptz); end if;
      if vis is not null then
        update "Recebimentos" set "Visto_Em" = vis where id = ref ->> 'id' and "Visto_Em" is null;
        if found then perform cob_evento(ref ->> 'id', 'visto', 'O cliente abriu a fatura em ' || to_char(vis at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || '.', 'visto:' || (ref ->> 'id'), '{}'); end if;
      end if;
    elsif ref ->> 'tipo' = 'lista' then
      for pay in select * from jsonb_array_elements(coalesce(res -> 'data', '[]')) loop
        if coalesce((pay ->> 'deleted')::boolean, false) then continue; end if;
        if exists (select 1 from "Recebimentos" where "Asaas_Cobranca_Id" = pay ->> 'id') then continue; end if;
        -- Criado pelo sistema, mas a resposta se perdeu: liga pela referência.
        select * into r from "Recebimentos" where id = pay ->> 'externalReference' and coalesce("Asaas_Cobranca_Id", '') = '';
        if r.id is not null then perform cob_gravar_pagamento(r.id, pay, 'recuperado'); perform cob_sinc_pagamento(r.id, pay); continue; end if;
        select id into cli from "Entidades_Cadastradas" where "Asaas_Customer_Id" = pay ->> 'customer' limit 1;
        if pay ->> 'status' in ('PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS') then
          -- Boleto feito direto no Asaas: entra no A receber.
          insert into "Recebimentos" ("Descricao", "Valor", "Cliente_Nome", "Cliente_Documento", "Cliente_Ref", "Vencimento", "Status", "Forma", "Origem",
              "Emissor", "Asaas_Conta", "Asaas_Cobranca_Id", "Asaas_Cliente_Id", "Asaas_Status", "Asaas_Link", "Boleto_Url", "Aviso", "Atualizado_Em")
          select left(coalesce(nullif(pay ->> 'description', ''), 'Cobrança feita no Asaas'), 140), (pay ->> 'value')::numeric,
              case when c.id is null then 'Cliente do Asaas' else cob_nome_cliente(c) end, cob_digitos(c."CPF_CNPJ"), c.id, (pay ->> 'dueDate')::date, 'Pendente',
              case pay ->> 'billingType' when 'PIX' then 'PIX' else 'Boleto' end, 'asaas', conta, conta, pay ->> 'id', pay ->> 'customer',
              pay ->> 'status', pay ->> 'invoiceUrl', pay ->> 'bankSlipUrl',
              case when coalesce((pay -> 'fine' ->> 'value')::numeric, 0) = 0 or coalesce((pay -> 'interest' ->> 'value')::numeric, 0) = 0
                   then 'Feito direto no Asaas sem multa e juros.' end, now()
            from (select 1) z left join "Entidades_Cadastradas" c on c.id = cli
          returning id into novo;
          perform cob_evento(novo, 'importado', 'Cobrança feita direto no Asaas, trazida para o sistema.', 'importado:' || (pay ->> 'id'));
          importados := importados + 1;
        elsif pay ->> 'status' in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH') then
          -- Dinheiro que entrou sem ser por boleto do sistema (PIX direto na chave, cobrança à mão): procurar o par.
          insert into "Conciliacao" ("Conta", "Transacao_Id", "Data", "Valor", "Pagador", "Pagador_Documento", "Cliente_Ref", "Descricao", "Status")
          select conta, 'pay:' || (pay ->> 'id'), coalesce(cob_data(pay, 'paymentDate'), cob_data(pay, 'clientPaymentDate'), hoje), (pay ->> 'value')::numeric,
                 coalesce((select k.v -> 'customer' ->> 'name' from jsonb_array_elements(coalesce(p -> 'clientes', '[]')) as k(v) where k.v -> 'customer' ->> 'id' = pay ->> 'customer' limit 1),
                          (select cob_nome_cliente(c) from "Entidades_Cadastradas" c where c.id = cli)),
                 cob_digitos(coalesce((select k.v -> 'customer' ->> 'cpfCnpj' from jsonb_array_elements(coalesce(p -> 'clientes', '[]')) as k(v) where k.v -> 'customer' ->> 'id' = pay ->> 'customer' limit 1),
                          (select c."CPF_CNPJ" from "Entidades_Cadastradas" c where c.id = cli))),
                 cli, left(coalesce(pay ->> 'description', case pay ->> 'billingType' when 'PIX' then 'PIX recebido' else 'Pagamento recebido' end), 200), 'novo'
          on conflict ("Transacao_Id") do nothing;
        end if;
      end loop;
    elsif ref ->> 'tipo' = 'extrato' then
      -- Créditos que não são de cobrança (sem paymentId): PIX recebido, transferência recebida.
      for tx in select * from jsonb_array_elements(coalesce(res -> 'data', '[]')) loop
        if coalesce((tx ->> 'value')::numeric, 0) <= 0 or coalesce(tx ->> 'paymentId', '') <> '' then continue; end if;
        if coalesce(tx ->> 'type', '') !~ '(PIX|TRANSFER|DEPOSIT|CREDIT)' or coalesce(tx ->> 'type', '') ~ '(REVERSAL|REFUND|FEE)' then continue; end if;
        insert into "Conciliacao" ("Conta", "Transacao_Id", "Data", "Valor", "Pagador", "Descricao", "Status")
        values (conta, 'ft:' || (tx ->> 'id'), coalesce(cob_data(tx, 'date'), hoje), (tx ->> 'value')::numeric,
                nullif(btrim(substring(coalesce(tx ->> 'description', '') from '-\s*([^-]+)$')), ''), left(coalesce(tx ->> 'description', 'Crédito'), 200), 'novo')
        on conflict ("Transacao_Id") do nothing;
      end loop;
    end if;
  end loop;

  -- Entradas novas: de qual cobrança é cada uma? Mesmo valor (ao centavo) e mesma conta. O documento do pagador
  -- igual ao do cliente (ou o próprio cliente no Asaas) dá certeza: baixa sozinha. Sem certeza: vira sugestão.
  for conc in select * from "Conciliacao" where "Status" = 'novo' order by "Data", "Criado_Em" loop
    -- Dinheiro mandado pelo próprio dono (ex.: o saldo do Inter passando para o Asaas, 22/11/2026): não é pagamento de
    -- cliente. Fica para classificar, já com a anotação sugerida, e nunca vira baixa nem sugestão de cobrança.
    if exists (select 1 from "Empresas_Emissoras" em
                where (length(btrim(coalesce(em."Titular", ''))) >= 8
                       and upper(coalesce(conc."Pagador", '') || ' ' || coalesce(conc."Descricao", '')) like '%' || upper(btrim(em."Titular")) || '%')
                   or (length(coalesce(conc."Pagador_Documento", '')) >= 11 and conc."Pagador_Documento" = cob_digitos(em."CNPJ"))) then
      update "Conciliacao" set "Status" = 'sem-par', "Anotacao" = coalesce("Anotacao", 'Transferência entre contas próprias (ex.: saldo do Inter)') where id = conc.id;
      continue;
    end if;
    select count(*) into ncand from "Recebimentos" q
     where q."Status" = 'Pendente' and coalesce(q."Emissor", q."Asaas_Conta", 'CNPJ 1') = conc."Conta" and q."Valor" = conc."Valor"
       and (q."Vencimento" is null or q."Vencimento" between conc."Data" - 90 and conc."Data" + 90);
    select q.id, q."Asaas_Cobranca_Id" as pid, q."Asaas_Conta" as aconta into cand from "Recebimentos" q
     where q."Status" = 'Pendente' and coalesce(q."Emissor", q."Asaas_Conta", 'CNPJ 1') = conc."Conta" and q."Valor" = conc."Valor"
       and (q."Vencimento" is null or q."Vencimento" between conc."Data" - 90 and conc."Data" + 90)
       and ((conc."Cliente_Ref" is not null and q."Cliente_Ref" = conc."Cliente_Ref")
            or (length(conc."Pagador_Documento") >= 11 and cob_digitos(q."Cliente_Documento") = conc."Pagador_Documento"))
     order by abs(coalesce(q."Vencimento", (q."Criado_Em" at time zone 'America/Sao_Paulo')::date) - conc."Data"), q."Criado_Em" limit 1;
    if cand.id is not null then
      update "Conciliacao" set "Status" = 'vinculado', "Recebimento_Ref" = cand.id, "Confianca" = 'alta' where id = conc.id;
      if coalesce(cand.pid, '') <> '' then
        dinheiro := dinheiro || jsonb_build_object('conta', cand.aconta, 'metodo', 'POST', 'url', 'https://api.asaas.com/v3/payments/' || cand.pid || '/receiveInCash',
          'corpo', jsonb_build_object('paymentDate', least(conc."Data", hoje), 'value', conc."Valor", 'notifyCustomer', false),
          'ref', jsonb_build_object('tipo', 'baixa', 'id', cand.id));
      end if;
      perform cob_baixar(cand.id, least(conc."Data", hoje), conc."Valor", 'conciliacao', conc."Transacao_Id", 'PIX');
      vinculados := vinculados + 1;
      continue;
    end if;
    if ncand > 0 then
      select q.id into cand from "Recebimentos" q
       where q."Status" = 'Pendente' and coalesce(q."Emissor", q."Asaas_Conta", 'CNPJ 1') = conc."Conta" and q."Valor" = conc."Valor"
         and (q."Vencimento" is null or q."Vencimento" between conc."Data" - 90 and conc."Data" + 90)
       order by abs(coalesce(q."Vencimento", (q."Criado_Em" at time zone 'America/Sao_Paulo')::date) - conc."Data"), q."Criado_Em" limit 1;
      update "Conciliacao" set "Status" = 'pendente', "Sugestao_Ref" = cand.id, "Confianca" = case when ncand = 1 then 'media' else 'baixa' end where id = conc.id;
      sugeridos := sugeridos + 1;
    else
      update "Conciliacao" set "Status" = 'sem-par' where id = conc.id;
    end if;
  end loop;

  -- Notas emitidas depois do começo das cobranças: toda nota vira "a receber" (com boleto, liga; sem boleto, cria).
  for n in select * from "Notas_Fiscais" nf where nf."Ambiente" = 'Producao' and nf."Status" = 'Emitida' and ini is not null and nf."Emitida_Em" >= ini
             and not exists (select 1 from "Recebimentos" x where x."Nota_Ref" = nf.id) loop
    if cob_ligar_por_link(n.id) = 0 then perform cob_registrar_nota(n.id); end if;
  end loop;
  -- Descrição do boleto com o número da nota ("Referente à NFS-e nº X"): pede ao Asaas o que ainda falta (ligado pela
  -- sincronização, ou o Asaas falhou na hora). Boleto que falhou: no máximo uma tentativa por dia.
  for r in select x.* from "Recebimentos" x join "Notas_Fiscais" nf on nf.id = x."Nota_Ref"
            where x."Status" = 'Pendente' and coalesce(x."Asaas_Cobranca_Id", '') <> ''
              and coalesce(x."Asaas_Status", '') in ('PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS')
              and nf."Status" = 'Emitida' and coalesce(nf."Numero_NFSe", '') <> ''
              and not exists (select 1 from "Cobranca_Eventos" e
                               where e."Chave" in ('descricao:' || x.id || ':' || btrim(nf."Numero_NFSe"),
                                                   'descricao-erro:' || x.id || ':' || btrim(nf."Numero_NFSe") || ':' || hoje))
            order by x."Criado_Em" desc limit 20 loop
    select * into n from "Notas_Fiscais" where id = r."Nota_Ref";
    dinheiro := dinheiro || cob_chamada_descricao(r, n."Numero_NFSe", cob_servico_da_nota(n."Descricao"));
  end loop;
  -- PDF da nota na página do boleto (22/11/2026): boleto aberto, ligado a nota emitida com PDF, que ainda não recebeu.
  -- Falhou: no máximo uma tentativa por dia.
  for r in select x.* from "Recebimentos" x join "Notas_Fiscais" nf on nf.id = x."Nota_Ref"
            where x."Status" = 'Pendente' and coalesce(x."Asaas_Cobranca_Id", '') <> ''
              and coalesce(x."Asaas_Status", '') in ('PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS')
              and nf."Status" = 'Emitida' and jsonb_array_length(nf."Pdf_Nota") > 0
              and not exists (select 1 from "Cobranca_Eventos" e
                               where e."Chave" in ('nf-pdf:' || x.id || ':' || nf.id, 'nf-pdf-erro:' || x.id || ':' || nf.id || ':' || hoje))
            order by x."Criado_Em" desc limit 20 loop
    pdf := cob_chamada_nf_pdf(r);
    if pdf is not null then dinheiro := dinheiro || pdf; end if;
  end loop;
  -- Nota cancelada: a conta sem boleto é cancelada junto; boleto aberto fica avisado para o dono decidir.
  for r in select x.* from "Recebimentos" x join "Notas_Fiscais" nf on nf.id = x."Nota_Ref"
            where nf."Status" = 'Cancelada' and x."Status" = 'Pendente' loop
    if coalesce(r."Asaas_Cobranca_Id", '') = '' then
      update "Recebimentos" set "Status" = 'Cancelado', "Atualizado_Em" = now() where id = r.id;
      perform cob_evento(r.id, 'cancelado', 'A nota foi cancelada, então esta conta a receber também.', 'cancelado:' || r.id);
    elsif coalesce(r."Aviso", '') not like 'A nota deste boleto foi cancelada%' then
      update "Recebimentos" set "Aviso" = 'A nota deste boleto foi cancelada: cancele o boleto também, se for o caso.' where id = r.id;
      perform cob_evento(r.id, 'nota-cancelada', 'A nota deste boleto foi cancelada.', 'nota-cancelada:' || r.id);
    end if;
  end loop;
  -- Recibos gerados no sistema (o recibo é a cobrança de quem não tem nota): entram no A receber sem previsão.
  for a in select * from "Arquivos_Cliente" ac where ac."Tipo" = 'recibo' and ac."Origem" = 'gerado' and coalesce(ac."Valor", 0) > 0
             and ini is not null and ac."Criado_Em" >= ini and not exists (select 1 from "Recebimentos" x where x."Arquivo_Ref" = ac.id) loop
    perform cob_registrar_recibo(a.id);
  end loop;

  -- Chave PIX do CNPJ chegou ao Asaas: notas e recibos daquele CNPJ passam a sair com a conta do Asaas. Um erro aqui
  -- nunca derruba a sincronização (fica anotado em "banco-erro").
  begin
    perform cob_banco_asaas();
  exception when others then
    insert into "Cobranca_Estado" (id, "Valor") values ('banco-erro', jsonb_build_object('quando', now(), 'erro', left(sqlerrm, 200)))
    on conflict (id) do update set "Valor" = excluded."Valor";
  end;

  insert into "Cobranca_Estado" (id, "Valor") values ('sinc', jsonb_build_object('quando', now(), 'importados', importados, 'vinculados', vinculados, 'sugeridos', sugeridos))
  on conflict (id) do update set "Valor" = excluded."Valor";
  return jsonb_build_object('ok', true, 'chamadas', dinheiro, 'importados', importados, 'vinculados', vinculados, 'sugeridos', sugeridos);
end $$;

-- Como o Asaas está agora um boleto que o sistema conhece.
create or replace function cob_sinc_pagamento(rid text, pay jsonb) returns void language plpgsql as $$
declare r "Recebimentos"; st text := pay ->> 'status'; quando date; valor numeric; liquido numeric; original numeric;
begin
  select * into r from "Recebimentos" where id = rid;
  if r.id is null then return; end if;
  if coalesce((pay ->> 'deleted')::boolean, false) or st in ('REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE') then
    if r."Status" = 'Pendente' then
      update "Recebimentos" set "Status" = 'Cancelado', "Asaas_Status" = coalesce(st, 'DELETED'), "Atualizado_Em" = now() where id = rid;
      perform cob_evento(rid, 'cancelado', case when coalesce((pay ->> 'deleted')::boolean, false) then 'Boleto removido no Asaas.' else 'Boleto estornado no Asaas.' end, 'cancelado:' || rid);
    end if;
    return;
  end if;
  if st in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED') then
    quando := coalesce(cob_data(pay, 'clientPaymentDate'), cob_data(pay, 'paymentDate'), cob_data(pay, 'confirmedDate'), cob_hoje());
    valor := (pay ->> 'value')::numeric; liquido := nullif(pay ->> 'netValue', '')::numeric; original := nullif(pay ->> 'originalValue', '')::numeric;
    update "Recebimentos" set "Asaas_Status" = st, "Valor_Pago" = coalesce("Valor_Pago", valor),
           "Valor_Liquido" = case when st = 'RECEIVED_IN_CASH' then coalesce("Valor_Liquido", valor) else coalesce(liquido, "Valor_Liquido") end,
           "Taxa" = case when st = 'RECEIVED_IN_CASH' then 0 when liquido is not null then greatest(valor - liquido, 0) else "Taxa" end,
           "Multa_Juros" = case when original is not null and original > 0 and valor > original then valor - original else "Multa_Juros" end,
           "Atualizado_Em" = now()
     where id = rid;
    if r."Status" = 'Pendente' then
      perform cob_baixar(rid, quando, valor, 'asaas', pay ->> 'id', case pay ->> 'billingType' when 'PIX' then 'PIX' else r."Forma" end);
    end if;
    perform cob_despesa_taxa(rid, quando);
    return;
  end if;
  -- Aberto: data ou valor mudados direto no Asaas também valem aqui.
  update "Recebimentos" set "Asaas_Status" = st,
         "Vencimento" = coalesce(cob_data(pay, 'dueDate'), "Vencimento"), "Valor" = coalesce(nullif(pay ->> 'value', '')::numeric, "Valor"),
         "Asaas_Link" = coalesce(pay ->> 'invoiceUrl', "Asaas_Link"), "Boleto_Url" = coalesce(pay ->> 'bankSlipUrl', "Boleto_Url"), "Atualizado_Em" = now()
   where id = rid and ("Asaas_Status" is distinct from st or "Vencimento" is distinct from cob_data(pay, 'dueDate') or "Valor" is distinct from nullif(pay ->> 'value', '')::numeric);
  if found and r."Vencimento" is distinct from cob_data(pay, 'dueDate') and cob_data(pay, 'dueDate') is not null then
    perform cob_evento(rid, 'vencimento', 'Vencimento mudou no Asaas para ' || to_char(cob_data(pay, 'dueDate'), 'DD/MM/YYYY') || '.');
  end if;
  if st = 'OVERDUE' and r."Asaas_Status" is distinct from 'OVERDUE' then
    perform cob_evento(rid, 'vencido', 'Venceu sem pagamento. O sistema avisa o cliente por e-mail a cada 3 dias; dá para pagar até 30 dias depois do vencimento.', 'vencido:' || rid || ':' || r."Vencimento");
  end if;
end $$;

-- Passo 3: lembretes que saíram (ou não) e baixas de boleto pago por fora.
-- p: { lembretes: [{ evento, ok, erro, emails }], respostas: [{ ref, resposta }] }
create or replace function cob_sinc_final(p jsonb) returns jsonb language plpgsql as $$
declare x jsonb; ok int := 0; falhou int := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p -> 'lembretes', '[]')) loop
    if coalesce((x ->> 'ok')::boolean, false) then
      update "Cobranca_Eventos" set "Tipo" = case x ->> 'tipo' when 'criado' then 'email-criado' when 'atraso' then 'email-atraso' else 'lembrete' end, "Quando" = now(),
             "Texto" = case x ->> 'tipo' when 'criado' then 'Boleto enviado por e-mail pelo sistema' when 'atraso' then 'Aviso de atraso enviado por e-mail'
                       else 'Lembrete de véspera enviado por e-mail' end
                       || ' (' || coalesce(x ->> 'quantos', '?') || ' endereço(s)' || coalesce(', ' || nullif(x ->> 'anexos', '') || ' anexo(s)', '') || ').'
       where id = x ->> 'evento';
      ok := ok + 1;
    else
      -- Falhou: libera a chave para tentar de novo na próxima volta.
      delete from "Cobranca_Eventos" where id = x ->> 'evento' and "Tipo" = 'lembrete-reservado';
      falhou := falhou + 1;
    end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'respostas', '[]')) loop
    -- Descrição com o número da nota.
    if x -> 'ref' ->> 'tipo' = 'descricao' then
      perform cob_descricao_feita(x -> 'ref' ->> 'id', x -> 'ref' ->> 'numero',
        case when (x -> 'resposta') ? 'error' then coalesce(x -> 'resposta' -> 'error' ->> 'message', 'erro') end);
      continue;
    end if;
    -- PDF da nota na página do boleto.
    if x -> 'ref' ->> 'tipo' = 'nf-pdf' then
      perform cob_nf_pdf_feito(x -> 'ref' ->> 'id', x -> 'ref' ->> 'nota', x -> 'ref' ->> 'numero',
        case when (x -> 'resposta') ? 'error' then coalesce(x -> 'resposta' -> 'error' ->> 'message', 'erro')
             when coalesce(x -> 'resposta' ->> 'id', '') = '' then 'resposta inesperada do Asaas' end);
      continue;
    end if;
    if (x -> 'resposta') ? 'error' then
      perform cob_evento(x -> 'ref' ->> 'id', 'erro', 'Recebido por fora, mas o Asaas não deu baixa no boleto: dê baixa pelo sistema para os avisos pararem.');
      update "Recebimentos" set "Aviso" = 'Pago por fora: falta dar baixa no boleto do Asaas.' where id = x -> 'ref' ->> 'id';
    else
      update "Recebimentos" set "Asaas_Status" = coalesce(x -> 'resposta' ->> 'status', 'RECEIVED_IN_CASH') where id = x -> 'ref' ->> 'id';
    end if;
  end loop;
  update "Cobranca_Estado" set "Valor" = jsonb_build_object('ate', now()) where id = 'sinc:trava';
  update "Cobranca_Estado" set "Valor" = "Valor" || jsonb_build_object('lembretes', ok, 'lembretesFalharam', falhou, 'fim', now()) where id = 'sinc';
  return jsonb_build_object('ok', true, 'lembretes', ok, 'falharam', falhou);
end $$;

grant execute on all functions in schema public to n8n_app;
