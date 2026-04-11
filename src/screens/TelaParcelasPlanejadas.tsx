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

type AlinhamentoTipo = NonNullable<ParcelaPlanejada['alinhamentoTipo']>;

type ParcelaLoteDraft = {
  id: string;
  codigo: string;
  alinhamentoInicial: string;
  alinhamentoFinal: string;
  alinhamentoTipo: AlinhamentoTipo;
};

type ParcelaEdicaoForm = {
  codigo: string;
  equipeId: string;
  alinhamentoInicial: string;
  alinhamentoFinal: string;
  alinhamentoTipo: AlinhamentoTipo;
  dataColheita: string;
  observacao: string;
};

const DEFAULT_ALINHAMENTO_TIPO: AlinhamentoTipo = 'inferior-impar';

const criarRascunhoParcela = (
  patch: Partial<Omit<ParcelaLoteDraft, 'id'>> = {},
): ParcelaLoteDraft => ({
  id: crypto.randomUUID(),
  codigo: '',
  alinhamentoInicial: '',
  alinhamentoFinal: '',
  alinhamentoTipo: DEFAULT_ALINHAMENTO_TIPO,
  ...patch,
});

const criarFormularioEdicao = (
  parcela?: ParcelaPlanejada | null,
): ParcelaEdicaoForm => ({
  codigo: parcela?.codigo || '',
  equipeId: parcela?.equipeId || '',
  alinhamentoInicial: parcela?.alinhamentoInicial
    ? String(parcela.alinhamentoInicial)
    : '',
  alinhamentoFinal: parcela?.alinhamentoFinal
    ? String(parcela.alinhamentoFinal)
    : '',
  alinhamentoTipo: parcela?.alinhamentoTipo || DEFAULT_ALINHAMENTO_TIPO,
  dataColheita: parcela?.dataColheita || todayIso(),
  observacao: parcela?.observacao || '',
});

const formatarAlinhamentoTipo = (value: AlinhamentoTipo) =>
  value === 'inferior-par' ? 'Par' : 'Impar';

const formatarStatusParcela = (status: ParcelaPlanejada['status']) => {
  switch (status) {
    case 'em_andamento':
      return 'Em andamento';
    case 'em_retoque':
      return 'Em retoque';
    case 'concluida':
      return 'Concluida';
    default:
      return 'Disponivel';
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
  Boolean(item.codigo.trim() || item.alinhamentoInicial.trim() || item.alinhamentoFinal.trim());

const podeGerenciarParcela = (parcela: ParcelaPlanejada) =>
  parcela.status === 'disponivel' && !parcela.avaliacaoId;

const validarParcelaDigitada = (
  item: ParcelaLoteDraft,
  outrosItens: ParcelaLoteDraft[],
) => {
  const codigo = formatarCodigoParcela(item.codigo);
  const codigoNormalizado = normalizarCodigoParcela(codigo);
  const alinhamentoInicial = Number(item.alinhamentoInicial);
  const alinhamentoFinal = Number(item.alinhamentoFinal);

  if (!codigoNormalizado) {
    throw new Error('Informe o codigo da parcela.');
  }
  if (
    !Number.isFinite(alinhamentoInicial) ||
    !Number.isFinite(alinhamentoFinal) ||
    alinhamentoInicial <= 0 ||
    alinhamentoFinal <= 0 ||
    alinhamentoFinal < alinhamentoInicial
  ) {
    throw new Error('Informe um alinhamento inicial e final valido.');
  }
  if (
    outrosItens.some(
      (outro) =>
        outro.id !== item.id &&
        normalizarCodigoParcela(outro.codigo) === codigoNormalizado,
    )
  ) {
    throw new Error('Esta parcela ja foi adicionada ao lote atual.');
  }

  return {
    codigo,
    alinhamentoInicial,
    alinhamentoFinal,
    alinhamentoTipo: item.alinhamentoTipo || DEFAULT_ALINHAMENTO_TIPO,
  };
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
  const [observacao, setObservacao] = useState('');
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
            alinhamentoTipo: validado.alinhamentoTipo,
            dataColheita,
            observacao,
            criadoPor: usuarioAtual.id,
            origem: perfil === 'colaborador' ? 'colaborador' : 'fiscal',
          };
        }),
      });
    },
    onSuccess: async () => {
      setRascunho(criarRascunhoParcela({ alinhamentoTipo: rascunho.alinhamentoTipo }));
      setParcelasLote([]);
      setObservacao('');
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

      return atualizarParcelaPlanejada(editingParcela.id, {
        codigo: editForm.codigo,
        equipeId: editForm.equipeId || null,
        alinhamentoInicial: Number(editForm.alinhamentoInicial),
        alinhamentoFinal: Number(editForm.alinhamentoFinal),
        alinhamentoTipo: editForm.alinhamentoTipo,
        dataColheita: editForm.dataColheita,
        observacao: editForm.observacao,
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
          alinhamentoInicial: String(validado.alinhamentoInicial),
          alinhamentoFinal: String(validado.alinhamentoFinal),
          alinhamentoTipo: validado.alinhamentoTipo,
        },
      ]);
      setRascunho(criarRascunhoParcela({ alinhamentoTipo: rascunho.alinhamentoTipo }));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Nao foi possivel adicionar a parcela.');
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
              <div className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={observacao}
                  placeholder="Observacao opcional para todas as parcelas deste cadastro"
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setObservacao(event.target.value)
                  }
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                    Parcela do lote
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                    Cada parcela pode ter seu proprio alinhamento inicial, final e tipo.
                  </p>
                </div>
                <Badge variant="emerald">{totalParcelasParaSalvar} para salvar</Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input
                  value={rascunho.codigo}
                  placeholder="Codigo da parcela (ex: G-156-1)"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRascunho((current) => ({
                      ...current,
                      codigo: formatarCodigoParcela(event.target.value),
                    }))
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={rascunho.alinhamentoInicial}
                    placeholder="Alinhamento inicial"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRascunho((current) => ({
                        ...current,
                        alinhamentoInicial: event.target.value.replace(/\D/g, '').slice(0, 3),
                      }))
                    }
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={rascunho.alinhamentoFinal}
                    placeholder="Alinhamento final"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRascunho((current) => ({
                        ...current,
                        alinhamentoFinal: event.target.value.replace(/\D/g, '').slice(0, 3),
                      }))
                    }
                  />
                </div>
              </div>

              {sugestoesParcelas.length > 0 ? (
                <div className="mt-3 rounded-[18px] border border-[var(--qc-border)] bg-white p-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                    Parcelas ja cadastradas
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
                              codigo: item.codigo,
                            }))
                          }
                        >
                          {item.codigo}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-[var(--qc-text-muted)]">
                    {codigoTemSugestaoExata
                      ? 'Codigo encontrado no catalogo.'
                      : 'Selecione uma parcela existente ou continue digitando para cadastrar um novo codigo.'}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={rascunho.alinhamentoTipo === 'inferior-impar' ? 'default' : 'outline'}
                  className={`h-11 rounded-xl ${
                    rascunho.alinhamentoTipo === 'inferior-impar'
                      ? 'bg-[var(--qc-primary)] text-white'
                      : 'bg-white text-[var(--qc-secondary)]'
                  }`}
                  onClick={() =>
                    setRascunho((current) => ({
                      ...current,
                      alinhamentoTipo: 'inferior-impar',
                    }))
                  }
                >
                  Impar
                </Button>
                <Button
                  type="button"
                  variant={rascunho.alinhamentoTipo === 'inferior-par' ? 'default' : 'outline'}
                  className={`h-11 rounded-xl ${
                    rascunho.alinhamentoTipo === 'inferior-par'
                      ? 'bg-[var(--qc-primary)] text-white'
                      : 'bg-white text-[var(--qc-secondary)]'
                  }`}
                  onClick={() =>
                    setRascunho((current) => ({
                      ...current,
                      alinhamentoTipo: 'inferior-par',
                    }))
                  }
                >
                  Par
                </Button>
              </div>

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
                    Revise as parcelas antes de salvar. O rascunho atual tambem entra no envio se
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
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--qc-text-muted)]">
                          <span>
                            Alinhamento {item.alinhamentoInicial}-{item.alinhamentoFinal}
                          </span>
                          <Badge variant="slate">{formatarAlinhamentoTipo(item.alinhamentoTipo)}</Badge>
                        </div>
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
                          <Badge variant="slate">
                            {formatarAlinhamentoTipo(
                              parcela.alinhamentoTipo || DEFAULT_ALINHAMENTO_TIPO,
                            )}
                          </Badge>
                          {parcela.status !== 'disponivel' ? (
                            <Badge variant="secondary">{formatarStatusParcela(parcela.status)}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                          Equipe {parcela.equipeNome || '--'} - Colheita {formatarData(parcela.dataColheita)}
                        </p>
                        <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                          Alinhamento {parcela.alinhamentoInicial}-{parcela.alinhamentoFinal}
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
                            onClick={() =>
                              navigate(`/avaliacoes/nova?parcelaPlanejadaId=${parcela.id}`)
                            }
                          >
                            Iniciar
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
                Notificacao automatica
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
                placeholder="Codigo da parcela"
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

              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={editForm.alinhamentoInicial}
                  placeholder="Alinhamento inicial"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setEditForm((current) => ({
                      ...current,
                      alinhamentoInicial: event.target.value.replace(/\D/g, '').slice(0, 3),
                    }))
                  }
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={editForm.alinhamentoFinal}
                  placeholder="Alinhamento final"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setEditForm((current) => ({
                      ...current,
                      alinhamentoFinal: event.target.value.replace(/\D/g, '').slice(0, 3),
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={editForm.alinhamentoTipo === 'inferior-impar' ? 'default' : 'outline'}
                  className={`h-11 rounded-xl ${
                    editForm.alinhamentoTipo === 'inferior-impar'
                      ? 'bg-[var(--qc-primary)] text-white'
                      : 'bg-white text-[var(--qc-secondary)]'
                  }`}
                  onClick={() =>
                    setEditForm((current) => ({
                      ...current,
                      alinhamentoTipo: 'inferior-impar',
                    }))
                  }
                >
                  Impar
                </Button>
                <Button
                  type="button"
                  variant={editForm.alinhamentoTipo === 'inferior-par' ? 'default' : 'outline'}
                  className={`h-11 rounded-xl ${
                    editForm.alinhamentoTipo === 'inferior-par'
                      ? 'bg-[var(--qc-primary)] text-white'
                      : 'bg-white text-[var(--qc-secondary)]'
                  }`}
                  onClick={() =>
                    setEditForm((current) => ({
                      ...current,
                      alinhamentoTipo: 'inferior-par',
                    }))
                  }
                >
                  Par
                </Button>
              </div>

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
                placeholder="Observacao opcional"
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
                {updateMutation.isPending ? 'Salvando' : 'Salvar alteracoes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LayoutMobile>
  );
}

