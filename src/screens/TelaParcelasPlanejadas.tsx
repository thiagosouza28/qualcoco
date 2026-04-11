import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Plus, Trash2, Trees } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCampoApp } from '@/core/AppProvider';
import { todayIso } from '@/core/date';
import {
  codigoParcelaCorrespondeBusca,
  formatarCodigoParcela,
  normalizarCodigoParcela,
} from '@/core/parcelCode';
import { filtrarEquipesVisiveis, normalizePerfilUsuario } from '@/core/permissions';
import {
  atualizarParcelaPlanejada,
  cadastrarParcelasPlanejadasEmLote,
  excluirParcelaPlanejada,
  listarParcelasPlanejadasVisiveis,
} from '@/core/plannedParcels';
import { repository } from '@/core/repositories';
import type { Equipe, ParcelaPlanejada } from '@/core/types';

type ParcelaLoteDraft = {
  id: string;
  codigo: string;
  alinhamento: string;
  observacao: string;
};

type ParcelaEdicaoForm = {
  codigo: string;
  equipeId: string;
  alinhamento: string;
  dataColheita: string;
  observacao: string;
};

const CODIGO_PARCELA_REGEX = /^[A-Z]-\d{3}$/;

const criarRascunhoParcela = (
  patch: Partial<Omit<ParcelaLoteDraft, 'id'>> = {},
): ParcelaLoteDraft => ({
  id: crypto.randomUUID(),
  codigo: '',
  alinhamento: '',
  observacao: '',
  ...patch,
});

const criarFormularioEdicao = (
  parcela?: ParcelaPlanejada | null,
): ParcelaEdicaoForm => ({
  codigo: parcela?.codigo || '',
  equipeId: parcela?.equipeId || '',
  alinhamento: formatarFaixaAlinhamento(
    parcela?.alinhamentoInicial,
    parcela?.alinhamentoFinal,
  ),
  dataColheita: parcela?.dataColheita || todayIso(),
  observacao: parcela?.observacao || '',
});

function formatarFaixaAlinhamento(
  alinhamentoInicial?: string | number | null,
  alinhamentoFinal?: string | number | null,
) {
  const inicio = Number(alinhamentoInicial);
  const fim = Number(alinhamentoFinal);

  if (!Number.isFinite(inicio) || inicio <= 0) {
    return '';
  }
  if (!Number.isFinite(fim) || fim <= 0 || fim === inicio) {
    return String(inicio);
  }

  return `${inicio}-${fim}`;
}

const parsearFaixaAlinhamento = (value: string) => {
  const numeros = String(value || '')
    .match(/\d+/g)
    ?.slice(0, 2)
    .map((item) => Number(item)) || [];
  const alinhamentoInicial = numeros[0];
  const alinhamentoFinal = numeros[1] ?? numeros[0];

  if (
    !Number.isFinite(alinhamentoInicial) ||
    !Number.isFinite(alinhamentoFinal) ||
    alinhamentoInicial <= 0 ||
    alinhamentoFinal <= 0 ||
    alinhamentoFinal < alinhamentoInicial
  ) {
    throw new Error('Informe um alinhamento válido. Use algo como 1-25.');
  }

  return {
    alinhamentoInicial,
    alinhamentoFinal,
    alinhamento: formatarFaixaAlinhamento(alinhamentoInicial, alinhamentoFinal),
  };
};

const normalizarDadosParcelaDigitada = (input: {
  codigo: string;
  alinhamento: string;
  observacao?: string;
}) => {
  const codigo = formatarCodigoParcela(input.codigo);
  const codigoNormalizado = normalizarCodigoParcela(codigo);

  if (!codigoNormalizado) {
    throw new Error('Informe o código da parcela.');
  }
  if (!CODIGO_PARCELA_REGEX.test(codigoNormalizado)) {
    throw new Error('Informe o código da parcela no formato G-111.');
  }

  return {
    codigo,
    ...parsearFaixaAlinhamento(input.alinhamento),
    observacao: String(input.observacao || '').trim(),
  };
};

const getChaveGrupoParcelaPlanejada = (
  parcela: Pick<ParcelaPlanejada, 'equipeId' | 'equipeNome' | 'dataColheita'>,
) =>
  [
    String(parcela.equipeId || parcela.equipeNome || 'sem-equipe'),
    String(parcela.dataColheita || ''),
  ].join('::');

const criarBuscaAvaliacaoPlanejada = (parcelas: ParcelaPlanejada[]) => {
  const params = new URLSearchParams();

  parcelas
    .slice()
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
    .forEach((item) => params.append('parcelaPlanejadaId', item.id));

  return params.toString();
};

const formatarStatusParcela = (status: ParcelaPlanejada['status']) => {
  switch (status) {
    case 'em_andamento':
      return 'Em andamento';
    case 'em_retoque':
      return 'Em retoque';
    case 'concluida':
      return 'Concluída';
    default:
      return 'Disponível';
  }
};

const formatarEquipeOption = (equipe: Equipe) =>
  `${String(equipe.numero).padStart(2, '0')} - ${equipe.nome}`;

const formatarData = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '--';
  }

  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.valueOf())) {
    return normalized;
  }

  return date.toLocaleDateString('pt-BR');
};

const possuiRascunhoPreenchido = (item: ParcelaLoteDraft) =>
  Boolean(item.codigo.trim() || item.alinhamento.trim());

const podeGerenciarParcela = (parcela: ParcelaPlanejada) =>
  parcela.status === 'disponivel' && !parcela.avaliacaoId;

const validarParcelaDigitada = (
  item: ParcelaLoteDraft,
  outrosItens: ParcelaLoteDraft[],
) => {
  const validado = normalizarDadosParcelaDigitada(item);
  const codigoNormalizado = normalizarCodigoParcela(validado.codigo);
  if (
    outrosItens.some(
      (outro) =>
        outro.id !== item.id &&
        normalizarCodigoParcela(outro.codigo) === codigoNormalizado,
    )
  ) {
    throw new Error('Esta parcela já foi adicionada ao lote atual.');
  }

  return validado;
};

export function TelaParcelasPlanejadas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual, session } = useCampoApp();
  const perfil = normalizePerfilUsuario(usuarioAtual?.perfil);
  const [rascunho, setRascunho] = useState<ParcelaLoteDraft>(criarRascunhoParcela());
  const [parcelasLote, setParcelasLote] = useState<ParcelaLoteDraft[]>([]);
  const [equipeId, setEquipeId] = useState('');
  const [dataColheita, setDataColheita] = useState(todayIso());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParcela, setEditingParcela] = useState<ParcelaPlanejada | null>(null);
  const [editForm, setEditForm] = useState<ParcelaEdicaoForm>(criarFormularioEdicao());

  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes', 'parcelas-planejadas', usuarioAtual?.id],
    queryFn: () => filtrarEquipesVisiveis(usuarioAtual),
    enabled: Boolean(usuarioAtual?.id),
  });

  const { data: parcelasPlanejadas = [] } = useQuery({
    queryKey: ['parcelas-planejadas', usuarioAtual?.id, session?.equipeDiaId],
    queryFn: () =>
      listarParcelasPlanejadasVisiveis({
        usuarioId: usuarioAtual?.id,
        equipeId: session?.equipeDiaId || null,
        incluirConcluidas: true,
      }),
    enabled: Boolean(usuarioAtual?.id),
  });

  const { data: parcelasCatalogo = [] } = useQuery({
    queryKey: ['parcelas', 'planejadas', 'catalogo'],
    queryFn: () => repository.list('parcelas'),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (perfil === 'fiscal' && equipes[0] && !equipeId) {
      setEquipeId(equipes[0].id);
    }
  }, [equipeId, equipes, perfil]);

  const equipeBloqueada = perfil === 'fiscal' && equipes.length === 1;
  const grupos = useMemo(
    () => ({
      disponiveis: parcelasPlanejadas.filter((item) => item.status === 'disponivel'),
      andamento: parcelasPlanejadas.filter((item) => item.status === 'em_andamento'),
      retoque: parcelasPlanejadas.filter((item) => item.status === 'em_retoque'),
    }),
    [parcelasPlanejadas],
  );

  const sugestoesParcelas = useMemo(() => {
    const codigoNormalizado = normalizarCodigoParcela(rascunho.codigo);
    if (!codigoNormalizado) {
      return [];
    }

    return parcelasCatalogo
      .filter((item) => item.ativo && !item.deletadoEm)
      .filter((item) => codigoParcelaCorrespondeBusca(item.codigo, codigoNormalizado))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
      .slice(0, 8);
  }, [parcelasCatalogo, rascunho.codigo]);

  const codigoTemSugestaoExata = useMemo(
    () =>
      sugestoesParcelas.some(
        (item) =>
          normalizarCodigoParcela(item.codigo) === normalizarCodigoParcela(rascunho.codigo),
      ),
    [rascunho.codigo, sugestoesParcelas],
  );

  const totalParcelasParaSalvar = useMemo(
    () => parcelasLote.length + (possuiRascunhoPreenchido(rascunho) ? 1 : 0),
    [parcelasLote.length, rascunho],
  );
  const secoesParcelas = useMemo(
    () => [
      { titulo: 'Disponíveis', items: grupos.disponiveis },
      { titulo: 'Em andamento', items: grupos.andamento },
      { titulo: 'Em retoque', items: grupos.retoque },
    ],
    [grupos.andamento, grupos.disponiveis, grupos.retoque],
  );

  const refreshListas = async () => {
    await queryClient.invalidateQueries({ queryKey: ['parcelas-planejadas'] });
    await queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
  };

  const iniciarAvaliacaoDaEquipe = (parcela: ParcelaPlanejada) => {
    const parcelasDaEquipe = parcelasPlanejadas.filter(
      (item) =>
        item.status === 'disponivel' &&
        getChaveGrupoParcelaPlanejada(item) === getChaveGrupoParcelaPlanejada(parcela),
    );
    const busca = criarBuscaAvaliacaoPlanejada(
      parcelasDaEquipe.length > 0 ? parcelasDaEquipe : [parcela],
    );

    navigate(`/avaliacoes/nova?${busca}`);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!usuarioAtual?.id) {
        throw new Error('Usuário atual não encontrado.');
      }
      if (!equipeId) {
        throw new Error('Selecione a equipe da parcela.');
      }

      const itensParaSalvar = [...parcelasLote];
      if (possuiRascunhoPreenchido(rascunho)) {
        validarParcelaDigitada(rascunho, itensParaSalvar);
        itensParaSalvar.push(rascunho);
      }
      if (itensParaSalvar.length === 0) {
        throw new Error('Adicione pelo menos uma parcela antes de salvar.');
      }

      return cadastrarParcelasPlanejadasEmLote({
        parcelas: itensParaSalvar.map((item) => {
          const validado = validarParcelaDigitada(
            item,
            itensParaSalvar.filter((outro) => outro.id !== item.id),
          );

          return {
            codigo: validado.codigo,
            equipeId,
            alinhamentoInicial: validado.alinhamentoInicial,
            alinhamentoFinal: validado.alinhamentoFinal,
            dataColheita,
            observacao: validado.observacao,
            criadoPor: usuarioAtual.id,
            origem: perfil === 'colaborador' ? 'colaborador' : 'fiscal',
          };
        }),
      });
    },
    onSuccess: async () => {
      setRascunho(criarRascunhoParcela());
      setParcelasLote([]);
      await refreshListas();
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Falha ao cadastrar as parcelas.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingParcela) {
        throw new Error('Parcela planejada não encontrada para edição.');
      }
      const validado = normalizarDadosParcelaDigitada(editForm);

      return atualizarParcelaPlanejada(editingParcela.id, {
        codigo: validado.codigo,
        equipeId: editForm.equipeId || null,
        alinhamentoInicial: validado.alinhamentoInicial,
        alinhamentoFinal: validado.alinhamentoFinal,
        dataColheita: editForm.dataColheita,
        observacao: validado.observacao,
      });
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setEditingParcela(null);
      setEditForm(criarFormularioEdicao());
      await refreshListas();
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Falha ao atualizar a parcela.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (parcelaPlanejadaId: string) =>
      excluirParcelaPlanejada(parcelaPlanejadaId),
    onSuccess: refreshListas,
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Falha ao excluir a parcela.');
    },
  });

  const adicionarRascunhoAoLote = () => {
    try {
      const validado = validarParcelaDigitada(rascunho, parcelasLote);
      setParcelasLote((current) => [
        ...current,
        {
          ...rascunho,
          codigo: validado.codigo,
          alinhamento: validado.alinhamento,
          observacao: validado.observacao,
        },
      ]);
      setRascunho(criarRascunhoParcela());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível adicionar a parcela.');
    }
  };

  const editarItemDoLote = (item: ParcelaLoteDraft) => {
    setParcelasLote((current) => current.filter((parcela) => parcela.id !== item.id));
    setRascunho({
      ...item,
      id: crypto.randomUUID(),
    });
  };

  const removerItemDoLote = (itemId: string) => {
    setParcelasLote((current) => current.filter((item) => item.id !== itemId));
  };

  const startEditParcela = (parcela: ParcelaPlanejada) => {
    setEditingParcela(parcela);
    setEditForm(criarFormularioEdicao(parcela));
    setDialogOpen(true);
  };

  return (
    <LayoutMobile
      title="Parcelas"
      subtitle="Cadastro planejado e fila do dia"
      onBack={() => navigate('/dashboard')}
      showBottomNav
    >
      <div className="stack-lg pb-24">
        <Card className="surface-card border-none shadow-sm">
          <CardContent className="stack-md p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[rgba(0,107,68,0.08)] text-[var(--qc-primary)]">
                <Trees className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight text-[var(--qc-text)]">
                  Cadastrar parcelas
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Monte um lote com uma ou mais parcelas para a mesma equipe e salve tudo de uma
                  vez.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={equipeId}
                onValueChange={setEquipeId}
                disabled={equipeBloqueada}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Equipe" />
                </SelectTrigger>
                <SelectContent>
                  {equipes.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      {formatarEquipeOption(equipe)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dataColheita}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDataColheita(event.target.value)
                }
              />
              <div className="rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3 text-sm text-[var(--qc-text-muted)] sm:col-span-2">
                Origem registrada como{' '}
                <strong className="text-[var(--qc-primary)]">
                  {perfil === 'colaborador' ? 'colaborador' : 'fiscal'}
                </strong>
                .
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                    Parcela do lote
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                    Informe somente o código, o alinhamento e, se precisar, as observações.
                  </p>
                </div>
                <Badge variant="emerald">{totalParcelasParaSalvar} para salvar</Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input
                  value={rascunho.codigo}
                  placeholder="Código da parcela (ex: G-111)"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRascunho((current) => ({
                      ...current,
                      codigo: formatarCodigoParcela(event.target.value),
                    }))
                  }
                />
                <Input
                  value={rascunho.alinhamento}
                  inputMode="numeric"
                  placeholder="Alinhamento (ex: 1-25)"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRascunho((current) => ({
                      ...current,
                      alinhamento: event.target.value.slice(0, 11),
                    }))
                  }
                />
                <div className="sm:col-span-2">
                  <Textarea
                    rows={3}
                    value={rascunho.observacao}
                    placeholder="Observações desta parcela (opcional)"
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setRascunho((current) => ({
                        ...current,
                        observacao: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {sugestoesParcelas.length > 0 ? (
                <div className="mt-3 rounded-[18px] border border-[var(--qc-border)] bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Parcelas já cadastradas
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sugestoesParcelas.map((item) => {
                      const selecionada =
                        normalizarCodigoParcela(item.codigo) ===
                        normalizarCodigoParcela(rascunho.codigo);
                      return (
                        <Button
                          key={item.id}
                          type="button"
                          variant={selecionada ? 'default' : 'outline'}
                          className="h-9 rounded-2xl px-3 font-bold"
                          onClick={() =>
                            setRascunho((current) => ({
                              ...current,
                              codigo: formatarCodigoParcela(item.codigo),
                            }))
                          }
                        >
                          {formatarCodigoParcela(item.codigo)}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-[var(--qc-text-muted)]">
                    {codigoTemSugestaoExata
                      ? 'Código encontrado no catálogo.'
                      : 'Selecione uma parcela existente ou continue digitando para cadastrar um novo código.'}
                  </p>
                </div>
              ) : null}

              <Button
                type="button"
                variant="outline"
                className="mt-4 h-11 w-full rounded-[18px] font-bold"
                onClick={adicionarRascunhoAoLote}
              >
                <Plus className="h-4 w-4" />
                {parcelasLote.length > 0 ? 'Adicionar outra parcela' : 'Adicionar ao lote'}
              </Button>
            </div>

            <div className="rounded-[24px] border border-[var(--qc-border)] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                    Lote pronto
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                    Revise as parcelas antes de salvar. O rascunho atual também entra no envio se
                    estiver preenchido.
                  </p>
                </div>
                <Badge variant="slate">{totalParcelasParaSalvar}</Badge>
              </div>

              {parcelasLote.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--qc-text-muted)]">
                  Nenhuma parcela adicionada ao lote ainda.
                </p>
              ) : (
                <div className="mt-4 stack-sm">
                  {parcelasLote.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                          {item.codigo}
                        </p>
                        <p className="mt-1 text-xs text-[var(--qc-text-muted)]">
                          Alinhamento {item.alinhamento}
                        </p>
                        {item.observacao ? (
                          <p className="mt-1 text-xs leading-relaxed text-[var(--qc-text-muted)]">
                            {item.observacao}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-[14px]"
                          onClick={() => editarItemDoLote(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="h-9 w-9 rounded-[14px]"
                          onClick={() => removerItemDoLote(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="button"
              className="h-12 rounded-[18px] font-bold"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || totalParcelasParaSalvar === 0}
            >
              <Plus className="h-5 w-5" />
              {createMutation.isPending
                ? 'Salvando parcelas'
                : totalParcelasParaSalvar > 1
                  ? `Salvar ${totalParcelasParaSalvar} parcelas`
                  : 'Salvar parcela'}
            </Button>
          </CardContent>
        </Card>

        {secoesParcelas.map((secao) => (
          <section key={secao.titulo} className="stack-md">
            <div className="px-1">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                {secao.titulo}
              </p>
            </div>

            {secao.items.length === 0 ? (
              <Card className="surface-card border-none shadow-sm">
                <CardContent className="p-4 text-sm text-[var(--qc-text-muted)]">
                  Nenhuma parcela nesta faixa.
                </CardContent>
              </Card>
            ) : (
              secao.items.map((parcela) => (
                <Card key={parcela.id} className="surface-card border-none shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-black tracking-tight text-[var(--qc-text)]">
                            {parcela.codigo}
                          </p>
                          {parcela.status !== 'disponivel' ? (
                            <Badge variant="secondary">{formatarStatusParcela(parcela.status)}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                          Equipe {parcela.equipeNome || '--'} - Colheita {formatarData(parcela.dataColheita)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                          Alinhamento{' '}
                          {formatarFaixaAlinhamento(
                            parcela.alinhamentoInicial,
                            parcela.alinhamentoFinal,
                          )}
                        </p>
                        <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                          Inserido por {parcela.criadoPorNome || 'usuário não identificado'}
                        </p>
                        {parcela.observacao ? (
                          <p className="mt-2 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                            {parcela.observacao}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {parcela.status === 'disponivel' ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl"
                            onClick={() => iniciarAvaliacaoDaEquipe(parcela)}
                          >
                            Iniciar equipe
                          </Button>
                        ) : null}
                        {podeGerenciarParcela(parcela) ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 rounded-[16px]"
                              onClick={() => startEditParcela(parcela)}
                            >
                              <Pencil className="h-4.5 w-4.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-10 w-10 rounded-[16px]"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Excluir a parcela ${parcela.codigo} da fila planejada?`,
                                  )
                                ) {
                                  deleteMutation.mutate(parcela.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4.5 w-4.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        ))}

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[rgba(0,107,68,0.08)] text-[var(--qc-primary)]">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                Notificação automática
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Cada parcela cadastrada aqui gera alerta de nova parcela disponível com a equipe
                informada na mensagem.
              </p>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open: boolean) => {
            setDialogOpen(open);
            if (!open) {
              setEditingParcela(null);
              setEditForm(criarFormularioEdicao());
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar parcela planejada</DialogTitle>
            </DialogHeader>

            <div className="stack-md">
              <Input
                value={editForm.codigo}
                placeholder="Código da parcela"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEditForm((current) => ({
                    ...current,
                    codigo: formatarCodigoParcela(event.target.value),
                  }))
                }
              />

              <Select
                value={editForm.equipeId}
                onValueChange={(value: string) =>
                  setEditForm((current) => ({
                    ...current,
                    equipeId: value,
                  }))
                }
                disabled={equipeBloqueada}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Equipe" />
                </SelectTrigger>
                <SelectContent>
                  {equipes.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      {formatarEquipeOption(equipe)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={editForm.alinhamento}
                inputMode="numeric"
                placeholder="Alinhamento (ex: 1-25)"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEditForm((current) => ({
                    ...current,
                    alinhamento: event.target.value.slice(0, 11),
                  }))
                }
              />

              <Input
                type="date"
                value={editForm.dataColheita}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEditForm((current) => ({
                    ...current,
                    dataColheita: event.target.value,
                  }))
                }
              />

              <Textarea
                rows={3}
                value={editForm.observacao}
                placeholder="Observações da parcela (opcional)"
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setEditForm((current) => ({
                    ...current,
                    observacao: event.target.value,
                  }))
                }
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-11 rounded-2xl"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Salvando' : 'Salvar alterações'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LayoutMobile>
  );
}

