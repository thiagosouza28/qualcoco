alter table public.avaliacao_ruas
  add column if not exists data_avaliacao date;

update public.avaliacao_ruas ar
set data_avaliacao = a.data_avaliacao
from public.avaliacoes a
where a.id = ar.avaliacao_id
  and ar.data_avaliacao is null;

alter table public.avaliacao_ruas
  alter column data_avaliacao set default current_date;

update public.avaliacao_ruas
set data_avaliacao = current_date
where data_avaliacao is null;

alter table public.avaliacao_ruas
  alter column data_avaliacao set not null;

create index if not exists avaliacao_ruas_parcela_data_idx
on public.avaliacao_ruas (parcela_id, data_avaliacao desc);
