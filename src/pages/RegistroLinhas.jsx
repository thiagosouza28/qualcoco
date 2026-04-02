import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Lock,
  ListChecks,
  PencilLine,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CounterInput from '@/components/CounterInput';
import PageHeader from '@/components/PageHeader';
import { useSync } from '@/components/SyncContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createRegistroRecord,
  getAvaliacaoById,
  listRegistrosByAvaliacao,
  queryKeys,
  recalcularTotaisData,
  updateAvaliacaoRecord,
  updateRegistroRecord,
} from '@/lib/dataService';
import {
  createPageUrl,
  getDataBrasil,
  getDiaSemanaBrasil,
  getParcelaBase,
  parseRuasProgramadas,
  resolveSearchParam,
  serializarObs,
} from '@/utils';

const OBS_COM_LINHA_E_PLANTA = ['Abelhas', 'Tapios'];
const OBS_COM_PLANTA = ['Planta esquecida', 'Planta deixada'];
const OBS_SIMPLES = ['Falta colher', 'Falta tropear'];

const getRegistroKey = (registro) => `${registro.linha_inicial}-${registro.linha_final}`;
const getPairKey = ([linhaInicial, linhaFinal]) => `${linhaInicial}-${linhaFinal}`;
const parsePairKey = (pairKey) =>
  pairKey ? pairKey.split('-').map((value) => Number(value)) : null;

const getNextPendingPair = (ruasProgramadas, registros, currentPair = null) => {
  if (!ruasProgramadas.length) return null;

  const feitos = new Set(registros.map((item) => getRegistroKey(item)));
  const currentKey = currentPair ? getPairKey(currentPair) : '';
  const currentIndex = currentKey
    ? ruasProgramadas.findIndex((item) => getPairKey(item) === currentKey)
    : -1;

  for (let index = currentIndex + 1; index < ruasProgramadas.length; index += 1) {
    if (!feitos.has(getPairKey(ruasProgramadas[index]))) {
      return ruasProgramadas[index];
    }
  }

  for (let index = 0; index < ruasProgramadas.length; index += 1) {
    if (!feitos.has(getPairKey(ruasProgramadas[index]))) {
      return ruasProgramadas[index];
    }
  }

  return ruasProgramadas[ruasProgramadas.length - 1] || null;
};

function RegistroLinhas() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline, queueOperation } = useSync();
  const avaliacaoId = resolveSearchParam(location.search, 'id');

  const [cocosChao, setCocosChao] = useState(0);
  const [cachos3, setCachos3] = useState(0);
  const [observacoes, setObservacoes] = useState([]);
  const [observacaoLivre, setObservacaoLivre] = useState('');
  const [editingId, setEditingId] = useState('');
  const [showObsDialog, setShowObsDialog] = useState(false);
  const [obsDraft, setObsDraft] = useState({
    tipo: '',
    modo: '',
    linha: '',
    planta: '',
  });
  const [showRuasDialog, setShowRuasDialog] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [showObservacoes, setShowObservacoes] = useState(false);
  const [focusedPairKey, setFocusedPairKey] = useState('');
  const [showEditRuasDialog, setShowEditRuasDialog] = useState(false);
  const [draftRuas, setDraftRuas] = useState([]);
  const [novaLinhaInicial, setNovaLinhaInicial] = useState('');
  const [novaLinhaFinal, setNovaLinhaFinal] = useState('');
  const [editRuasError, setEditRuasError] = useState('');

  const { data: avaliacao } = useQuery({
    queryKey: queryKeys.avaliacao(avaliacaoId),
    queryFn: () => getAvaliacaoById(avaliacaoId, isOnline),
    enabled: Boolean(avaliacaoId),
  });

  const { data: registros = [] } = useQuery({
    queryKey: queryKeys.registros(avaliacaoId),
    queryFn: () => listRegistrosByAvaliacao(avaliacaoId, isOnline),
    enabled: Boolean(avaliacaoId),
  });

  const ruasProgramadas = useMemo(
    () => parseRuasProgramadas(avaliacao?.ruas_programadas),
    [avaliacao?.ruas_programadas],
  );
  const registrosOrdenados = useMemo(
    () =>
      [...registros].sort(
        (a, b) =>
          new Date(a.created_date || a.updated_date || 0) -
          new Date(b.created_date || b.updated_date || 0),
      ),
    [registros],
  );
  const lastRegistro = registrosOrdenados[registrosOrdenados.length - 1];
  const focusedPair = useMemo(
    () => parsePairKey(focusedPairKey),
    [focusedPairKey],
  );

  const currentPair = useMemo(() => {
    if (editingId) {
      const registro = registros.find((item) => item.id === editingId);
      return registro
        ? [registro.linha_inicial, registro.linha_final]
        : ruasProgramadas[0] || [1, 2];
    }
    if (
      focusedPair &&
      ruasProgramadas.some((item) => getPairKey(item) === focusedPairKey)
    ) {
      return focusedPair;
    }
    return getNextPendingPair(ruasProgramadas, registros) || [1, 2];
  }, [editingId, focusedPair, focusedPairKey, registros, ruasProgramadas]);
  const currentPairKey = getPairKey(currentPair);
  const paridadeAtual =
    ruasProgramadas[0]?.[0] != null
      ? ruasProgramadas[0][0] % 2 === 0
        ? 'par'
        : 'impar'
      : null;

  const progress = ruasProgramadas.length
    ? Math.min(100, Math.round((registros.length / ruasProgramadas.length) * 100))
    : 0;
  const completedAll =
    ruasProgramadas.length > 0 && registros.length >= ruasProgramadas.length;

  useEffect(() => {
    if (editingId || !ruasProgramadas.length) return;
    if (
      focusedPairKey &&
      ruasProgramadas.some((item) => getPairKey(item) === focusedPairKey)
    ) {
      return;
    }

    const nextPair = getNextPendingPair(ruasProgramadas, registros);
    if (nextPair) {
      setFocusedPairKey(getPairKey(nextPair));
    }
  }, [editingId, focusedPairKey, registros, ruasProgramadas]);

  useEffect(() => {
    if (editingId) {
      const registro = registros.find((item) => item.id === editingId);
      if (registro) {
        setCocosChao(registro.cocos_chao || 0);
        setCachos3(registro.cachos_3_cocos || 0);
        setObservacoes(registro.observacoes || []);
        setObservacaoLivre(registro.observacao_livre || '');
      }
      return;
    }
    setCocosChao(0);
    setCachos3(0);
    setObservacoes([]);
    setObservacaoLivre('');
  }, [currentPair, editingId, registros]);

  useEffect(() => {
    if (!saveFeedback) return undefined;
    const timeout = window.setTimeout(() => setSaveFeedback(''), 1200);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback]);

  useEffect(() => {
    if (!showEditRuasDialog) return;
    setDraftRuas(
      [...ruasProgramadas].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    );
    setNovaLinhaInicial('');
    setNovaLinhaFinal('');
    setEditRuasError('');
  }, [ruasProgramadas, showEditRuasDialog]);

  const persistMutation = useMutation({
    mutationFn: async ({ finalizeAfter = false }) => {
      if (!avaliacao || !currentPair) return;
      const wasEditing = Boolean(editingId);
      const savedPair = [...currentPair];
      const registroEmEdicao = editingId
        ? registros.find((item) => item.id === editingId)
        : null;

      const payload = {
        avaliacao_id: avaliacao.id,
        linha_inicial: currentPair[0],
        linha_final: currentPair[1],
        data: registroEmEdicao?.data || getDataBrasil(),
        dia: registroEmEdicao?.dia || getDiaSemanaBrasil(),
        cocos_chao: cocosChao,
        cachos_3_cocos: cachos3,
        observacoes: serializarObs(observacoes),
        observacao_livre: observacaoLivre,
      };

      let registroSalvo;
      let nextRegistros;

      if (editingId) {
        registroSalvo = await updateRegistroRecord(editingId, payload, {
          isOnline,
          queueOperation,
        });
        nextRegistros = registros.map((item) =>
          item.id === editingId ? registroSalvo : item,
        );
      } else if (!completedAll) {
        registroSalvo = await createRegistroRecord(payload, {
          isOnline,
          queueOperation,
        });
        nextRegistros = [...registros, registroSalvo];
      } else {
        nextRegistros = registros;
      }

      const totais = recalcularTotaisData(nextRegistros);
      await updateAvaliacaoRecord(
        avaliacao.id,
        { ...totais },
        { isOnline, queueOperation },
      );

      queryClient.invalidateQueries({
        queryKey: queryKeys.registros(avaliacao.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.avaliacao(avaliacao.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.avaliacoesJornada(avaliacao.jornada_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.historico });

      setEditingId('');
      const nextPendingPair = getNextPendingPair(
        ruasProgramadas,
        nextRegistros,
        savedPair,
      );
      if (!finalizeAfter && nextPendingPair) {
        setFocusedPairKey(getPairKey(nextPendingPair));
      } else if (!finalizeAfter && !wasEditing) {
        setFocusedPairKey(getPairKey(savedPair));
      }
      setSaveFeedback(editingId ? 'Atualizado!' : 'Salvo!');

      if (finalizeAfter) {
        navigate(`${createPageUrl('ResumoParcela')}?id=${avaliacao.id}`);
      }
    },
  });

  const toggleSimpleObs = (tipo) => {
    setObservacoes((current) => {
      const hasTipo = current.includes(tipo);
      const hasFaltaColher = current.includes('Falta colher');
      const hasFaltaTropear = current.includes('Falta tropear');

      if (tipo === 'Falta colher') {
        if (hasTipo) {
          return current.filter((item) => item !== 'Falta colher');
        }

        const next = [...current, 'Falta colher'];
        if (!hasFaltaTropear) {
          next.push('Falta tropear');
        }
        return next;
      }

      if (tipo === 'Falta tropear') {
        if (hasTipo) {
          return hasFaltaColher
            ? current
            : current.filter((item) => item !== 'Falta tropear');
        }
        return [...current, 'Falta tropear'];
      }

      return hasTipo
        ? current.filter((item) => item !== tipo)
        : [...current, tipo];
    });
  };

  const addStructuredObs = () => {
    if (!obsDraft.tipo) return;

    if (obsDraft.modo === 'linha_planta') {
      if (!obsDraft.linha || !obsDraft.planta) return;
      const next = {
        tipo: obsDraft.tipo,
        linha: Number(obsDraft.linha),
        planta: Number(obsDraft.planta),
      };
      setObservacoes((current) => [...current, next]);
      setObsDraft({ tipo: '', modo: '', linha: '', planta: '' });
      setShowObsDialog(false);
      return;
    }

    if (!obsDraft.planta) return;
    const next = {
      tipo: obsDraft.tipo,
      planta: Number(obsDraft.planta),
    };
    setObservacoes((current) => [...current, next]);
    setObsDraft({ tipo: '', modo: '', linha: '', planta: '' });
    setShowObsDialog(false);
  };

  const removeObservacao = (targetIndex) => {
    setObservacoes((current) =>
      current.filter((item, currentIndex) => {
        if (currentIndex !== targetIndex) return true;
        if (
          item === 'Falta tropear' &&
          current.includes('Falta colher')
        ) {
          return true;
        }
        return false;
      }),
    );
  };

  const handleFinalizar = () => {
    if (completedAll && !editingId) {
      navigate(`${createPageUrl('ResumoParcela')}?id=${avaliacao.id}`);
      return;
    }
    persistMutation.mutate({ finalizeAfter: true });
  };

  const handleGoToRua = ([linhaInicial, linhaFinal]) => {
    const registroExistente = registros.find(
      (item) =>
        item.linha_inicial === linhaInicial && item.linha_final === linhaFinal,
    );

    setFocusedPairKey(getPairKey([linhaInicial, linhaFinal]));
    setEditingId(registroExistente?.id || '');
    setShowRuasDialog(false);
  };

  const isRuaRegistrada = ([linhaInicial, linhaFinal]) =>
    registros.some(
      (item) =>
        item.linha_inicial === linhaInicial && item.linha_final === linhaFinal,
    );

  const handleAddRuaProgramada = () => {
    const linhaInicial = Number(novaLinhaInicial);
    const linhaFinal = Number(novaLinhaFinal);

    if (!linhaInicial || !linhaFinal) {
      setEditRuasError('Informe a linha inicial e a linha final.');
      return;
    }

    if (linhaFinal !== linhaInicial + 1) {
      setEditRuasError('A rua deve ter linhas consecutivas: início e fim.');
      return;
    }

    if (linhaInicial < 1 || linhaFinal > 136) {
      setEditRuasError('As linhas devem ficar entre 1 e 136.');
      return;
    }

    if (
      (paridadeAtual === 'par' && linhaInicial % 2 !== 0) ||
      (paridadeAtual === 'impar' && linhaInicial % 2 === 0)
    ) {
      setEditRuasError(
        `As ruas desta avaliação precisam seguir a paridade ${paridadeAtual}.`,
      );
      return;
    }

    if (draftRuas.some((item) => getPairKey(item) === getPairKey([linhaInicial, linhaFinal]))) {
      setEditRuasError('Essa rua já está na programação.');
      return;
    }

    setDraftRuas((current) =>
      [...current, [linhaInicial, linhaFinal]].sort(
        (a, b) => a[0] - b[0] || a[1] - b[1],
      ),
    );
    setNovaLinhaInicial('');
    setNovaLinhaFinal('');
    setEditRuasError('');
  };

  const handleRemoveRuaProgramada = (pair) => {
    if (isRuaRegistrada(pair)) return;
    setDraftRuas((current) =>
      current.filter((item) => getPairKey(item) !== getPairKey(pair)),
    );
  };

  const saveRuasMutation = useMutation({
    mutationFn: async () => {
      if (!avaliacao) return;
      const ruasOrdenadas = [...draftRuas].sort(
        (a, b) => a[0] - b[0] || a[1] - b[1],
      );

      await updateAvaliacaoRecord(
        avaliacao.id,
        {
          total_ruas: ruasOrdenadas.length,
          ruas_programadas: JSON.stringify(ruasOrdenadas),
        },
        { isOnline, queueOperation },
      );

      queryClient.invalidateQueries({
        queryKey: queryKeys.avaliacao(avaliacao.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.avaliacoesJornada(avaliacao.jornada_id),
      });

      if (!ruasOrdenadas.some((item) => getPairKey(item) === currentPairKey)) {
        const nextPair = getNextPendingPair(ruasOrdenadas, registros);
        if (nextPair) {
          setFocusedPairKey(getPairKey(nextPair));
          setEditingId('');
        }
      }

      setShowEditRuasDialog(false);
      setSaveFeedback('Ruas atualizadas!');
    },
  });

  return (
    <main className="page-shell">
      <PageHeader
        title={getParcelaBase(avaliacao?.parcela) || 'Registro de Linhas'}
        subtitle={avaliacao?.equipe1_nome || 'Carregando avaliação'}
        onBack={() => navigate(createPageUrl('Dashboard'))}
        rightContent={
          !isOnline ? (
            <Badge variant="slate">
              <WifiOff className="h-3.5 w-3.5" />
              Offline
            </Badge>
          ) : null
        }
      />

      <section className="page-content space-y-4 pt-5">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Progresso</p>
                <p className="text-xs text-slate-500">
                  {registros.length}/{ruasProgramadas.length} ruas
                </p>
              </div>
              <Badge variant="blue">
                {registros.length}/{ruasProgramadas.length} ruas
              </Badge>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-emerald-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {editingId ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center justify-between gap-3 p-4 text-amber-800">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  ✏️ Editando rua anterior — Linhas {currentPair[0]} → {currentPair[1]}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-amber-700 hover:bg-amber-100"
                onClick={() => setEditingId('')}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Rua Atual</CardTitle>
                <p className="mt-1 text-xs text-slate-500">
                  Linhas derivadas das ruas programadas
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRuasDialog(true)}
              >
                <ListChecks className="h-4 w-4" />
                Ver todas
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowEditRuasDialog(true)}
            >
              <PencilLine className="h-4 w-4" />
              Editar ruas programadas
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[28px] bg-slate-950 px-5 py-6 text-center text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
                Rua atual
              </p>
              <div className="mt-2 font-display text-4xl font-bold">
                {currentPair[0]} <span className="text-emerald-400">→</span>{' '}
                {currentPair[1]}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!lastRegistro}
              onClick={() => {
                if (!lastRegistro) return;
                setFocusedPairKey(
                  getPairKey([
                    lastRegistro.linha_inicial,
                    lastRegistro.linha_final,
                  ]),
                );
                setEditingId(lastRegistro.id);
              }}
            >
              Rua anterior
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <CounterInput
            label="Cocos no Chão"
            value={cocosChao}
            onChange={setCocosChao}
            color="amber"
          />
          <CounterInput
            label="Cachos com 5 Cocos"
            value={cachos3}
            onChange={setCachos3}
            color="emerald"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Observações</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowObservacoes((value) => !value)}
              >
                {showObservacoes ? 'Recolher' : 'Expandir'}
                <ChevronRight
                  className={`h-4 w-4 transition ${
                    showObservacoes ? 'rotate-90' : ''
                  }`}
                />
              </Button>
            </div>
          </CardHeader>
          {showObservacoes ? (
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Infestação
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OBS_COM_LINHA_E_PLANTA.map((tipo) => (
                    <Button
                      key={tipo}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setObsDraft({
                          tipo,
                          modo: 'linha_planta',
                          linha: '',
                          planta: '',
                        });
                        setShowObsDialog(true);
                      }}
                    >
                      {tipo}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Plantas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OBS_COM_PLANTA.map((tipo) => (
                    <Button
                      key={tipo}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setObsDraft({
                          tipo,
                          modo: 'planta',
                          linha: '',
                          planta: '',
                        });
                        setShowObsDialog(true);
                      }}
                    >
                      {tipo}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Outros
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OBS_SIMPLES.map((tipo) => (
                    <Button
                      key={tipo}
                      type="button"
                      size="sm"
                      variant={observacoes.includes(tipo) ? 'default' : 'outline'}
                      disabled={
                        tipo === 'Falta tropear' &&
                        observacoes.includes('Falta colher')
                      }
                      onClick={() => toggleSimpleObs(tipo)}
                    >
                      {tipo}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Se marcar "Falta colher", "Falta tropear" fica marcada automaticamente.
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Observação livre
                </p>
                <Textarea
                  placeholder="Outra observação..."
                  value={observacaoLivre}
                  onChange={(event) => setObservacaoLivre(event.target.value)}
                />
              </div>

              {observacoes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {observacoes.map((item, index) => {
                    const label =
                      typeof item === 'string'
                        ? item
                        : `${item.tipo}${
                            item.linha ? ` (linha ${item.linha})` : ''
                          }${item.planta ? ` (planta ${item.planta})` : ''}`;
                    return (
                      <button
                        type="button"
                        key={`${label}-${index}`}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                        onClick={() => removeObservacao(index)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          ) : null}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleFinalizar}
            disabled={persistMutation.isPending}
          >
            Finalizar
          </Button>
          <Button
            type="button"
            className="w-full"
            onClick={() => persistMutation.mutate({ finalizeAfter: false })}
            disabled={persistMutation.isPending || (completedAll && !editingId)}
          >
            Salvar e Próxima
          </Button>
        </div>
      </section>

      <Dialog open={showObsDialog} onOpenChange={setShowObsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{obsDraft.tipo}</DialogTitle>
            <DialogDescription>
              {obsDraft.modo === 'linha_planta'
                ? 'Informe a linha e a planta para registrar a observação.'
                : 'Informe a planta para registrar a observação.'}
            </DialogDescription>
          </DialogHeader>
          {obsDraft.modo === 'linha_planta' ? (
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">Linha da rua atual</p>
                <div className="grid grid-cols-2 gap-2">
                  {[currentPair[0], currentPair[1]].map((linha) => (
                    <Button
                      key={linha}
                      type="button"
                      variant={String(linha) === String(obsDraft.linha) ? 'default' : 'outline'}
                      onClick={() =>
                        setObsDraft((current) => ({
                          ...current,
                          linha: String(linha),
                        }))
                      }
                    >
                      Linha {linha}
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                type="number"
                min="1"
                max="60"
                placeholder="Planta"
                value={obsDraft.planta}
                onChange={(event) =>
                  setObsDraft((current) => ({
                    ...current,
                    planta: event.target.value,
                  }))
                }
              />
            </div>
          ) : (
            <Input
              type="number"
              min="1"
              max="60"
              placeholder="Planta"
              value={obsDraft.planta}
              onChange={(event) =>
                setObsDraft((current) => ({
                  ...current,
                  planta: event.target.value,
                }))
              }
            />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowObsDialog(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={addStructuredObs}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRuasDialog} onOpenChange={setShowRuasDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Todas as ruas</DialogTitle>
            <DialogDescription>
              Confira o progresso da amostragem programada.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {ruasProgramadas.map(([inicio, fim]) => {
              const done = registros.some(
                (item) =>
                  item.linha_inicial === inicio && item.linha_final === fim,
              );
              return (
                <button
                  type="button"
                  key={`${inicio}-${fim}`}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    currentPairKey === getPairKey([inicio, fim])
                      ? 'border-blue-300 bg-blue-50'
                      : done
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                  onClick={() => handleGoToRua([inicio, fim])}
                >
                  <div>
                    <span className="text-sm font-semibold text-slate-800">
                      {inicio} → {fim}
                    </span>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {done ? 'Toque para editar' : 'Toque para abrir esta rua'}
                    </p>
                  </div>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditRuasDialog} onOpenChange={setShowEditRuasDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar ruas programadas</DialogTitle>
            <DialogDescription>
              Ajuste a lista de ruas quando precisar. Ruas que já têm registro ficam travadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                min="1"
                max="136"
                placeholder="Linha inicial"
                value={novaLinhaInicial}
                onChange={(event) => setNovaLinhaInicial(event.target.value)}
              />
              <Input
                type="number"
                min="1"
                max="136"
                placeholder="Linha final"
                value={novaLinhaFinal}
                onChange={(event) => setNovaLinhaFinal(event.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Paridade da avaliação: {paridadeAtual || '-'}
              </p>
              <Button type="button" size="sm" onClick={handleAddRuaProgramada}>
                Adicionar rua
              </Button>
            </div>

            {editRuasError ? (
              <p className="text-xs text-red-600">{editRuasError}</p>
            ) : null}

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {draftRuas.map((pair) => {
                const registrada = isRuaRegistrada(pair);
                return (
                  <div
                    key={getPairKey(pair)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                      registrada
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {pair[0]} → {pair[1]}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {registrada
                          ? 'Rua já registrada, não pode ser removida.'
                          : 'Remova e adicione novamente para ajustar.'}
                      </p>
                    </div>
                    {registrada ? (
                      <Lock className="h-4 w-4 text-amber-700" />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRuaProgramada(pair)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEditRuasDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveRuasMutation.mutate()}
              disabled={!draftRuas.length || saveRuasMutation.isPending}
            >
              Salvar ruas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {saveFeedback ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-6">
          <div className="rounded-[28px] bg-white px-8 py-6 text-center shadow-soft">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
            <p className="mt-3 text-lg font-bold text-slate-900">
              {saveFeedback}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default RegistroLinhas;
