import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { useSync } from '@/components/SyncContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createAvaliacaoRecord,
  listEquipes,
  queryKeys,
} from '@/lib/dataService';
import {
  clamp,
  createPageUrl,
  formatEquipeNome,
  generateParcelas,
  gerarRuasDistribuidasPorFaixas,
  getDataBrasil,
  getJornadaId,
  getResponsavelNome,
  formatResponsaveis,
  normalizarFaixaLinhas,
} from '@/utils';

const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_PARCELAS_POR_EQUIPE = 3;
const formatParcelaComAlinhamento = (parcela, alinhamentoInicio, alinhamentoFim) =>
  alinhamentoInicio && alinhamentoFim
    ? `${parcela} (Alinh. ${alinhamentoInicio}-${alinhamentoFim})`
    : parcela;
const distribuirRuasEntreParcelas = (totalRuas, totalParcelas) => {
  if (totalParcelas <= 0) return [];

  const base = Math.floor(totalRuas / totalParcelas);
  const resto = totalRuas % totalParcelas;

  return Array.from({ length: totalParcelas }, (_, index) =>
    base + (index < resto ? 1 : 0),
  );
};

function NovaAvaliacao() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline, queueOperation } = useSync();
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState([]);
  const [alinhamentosPorParcela, setAlinhamentosPorParcela] = useState({});
  const [equipe1Id, setEquipe1Id] = useState('');
  const [equipe2Id, setEquipe2Id] = useState('');
  const [duasEquipes, setDuasEquipes] = useState(false);
  const [totalRuasEq1, setTotalRuasEq1] = useState(14);
  const [totalRuasEq2, setTotalRuasEq2] = useState(14);
  const [paridade, setParidade] = useState('impar');
  const [linhaInicioEq1, setLinhaInicioEq1] = useState('');
  const [linhaFimEq1, setLinhaFimEq1] = useState('');
  const [linhaInicioEq2, setLinhaInicioEq2] = useState('');
  const [linhaFimEq2, setLinhaFimEq2] = useState('');
  const [letraSelecionada, setLetraSelecionada] = useState('A');
  const [responsaveisExtras, setResponsaveisExtras] = useState([]);
  const [novoResponsavel, setNovoResponsavel] = useState('');

  const { data: equipes = [] } = useQuery({
    queryKey: queryKeys.equipes,
    queryFn: () => listEquipes(isOnline),
  });

  const parcelas = useMemo(
    () => generateParcelas().filter((item) => item.startsWith(`${letraSelecionada}-`)),
    [letraSelecionada],
  );
  const parcelasOrdenadas = useMemo(
    () => [...parcelasSelecionadas].sort((a, b) => a.localeCompare(b)),
    [parcelasSelecionadas],
  );
  const exigeAlinhamentoPorParcela = parcelasSelecionadas.length > 1;
  const alinhamentosPreenchidos = useMemo(
    () =>
      parcelasSelecionadas.every(
        (item) => {
          const alinhamento = alinhamentosPorParcela[item] || {};
          return (
            String(alinhamento.inicio || '').trim().length > 0 &&
            String(alinhamento.fim || '').trim().length > 0
          );
        },
      ),
    [alinhamentosPorParcela, parcelasSelecionadas],
  );
  const alinhamentosValidos = useMemo(
    () =>
      parcelasSelecionadas.every((item) => {
        const alinhamento = alinhamentosPorParcela[item] || {};
        const inicio = Number(alinhamento.inicio);
        const fim = Number(alinhamento.fim);
        return inicio > 0 && fim > 0 && fim >= inicio;
      }),
    [alinhamentosPorParcela, parcelasSelecionadas],
  );
  const parcelasConfiguradas = useMemo(
    () =>
      parcelasOrdenadas.map((item) => {
        const alinhamento = alinhamentosPorParcela[item] || {};
        const alinhamentoInicio = String(alinhamento.inicio || '').trim();
        const alinhamentoFim = String(alinhamento.fim || '').trim();
        return {
          base: item,
          alinhamentoInicio,
          alinhamentoFim,
          label: formatParcelaComAlinhamento(
            item,
            alinhamentoInicio,
            alinhamentoFim,
          ),
        };
      }),
    [alinhamentosPorParcela, parcelasOrdenadas],
  );

  const equipe1 = equipes.find((item) => item.id === equipe1Id);
  const equipe2 = equipes.find((item) => item.id === equipe2Id);
  const responsavelPrincipal = getResponsavelNome();
  const responsavelCompleto = useMemo(
    () => formatResponsaveis([responsavelPrincipal, ...responsaveisExtras]),
    [responsavelPrincipal, responsaveisExtras],
  );

  const faixaEq1Preenchida = Boolean(linhaInicioEq1) && Boolean(linhaFimEq1);
  const faixaEq2Preenchida = Boolean(linhaInicioEq2) && Boolean(linhaFimEq2);
  const faixaEq1Parcial = Boolean(linhaInicioEq1) !== Boolean(linhaFimEq1);
  const faixaEq2Parcial = Boolean(linhaInicioEq2) !== Boolean(linhaFimEq2);
  const faixaEq1Invalida =
    faixaEq1Preenchida &&
    normalizarFaixaLinhas(linhaInicioEq1, linhaFimEq1).inicio >=
      normalizarFaixaLinhas(linhaInicioEq1, linhaFimEq1).fim;
  const faixaEq2Invalida =
    faixaEq2Preenchida &&
    normalizarFaixaLinhas(linhaInicioEq2, linhaFimEq2).inicio >=
      normalizarFaixaLinhas(linhaInicioEq2, linhaFimEq2).fim;
  const totalParcelasSelecionadas = parcelasConfiguradas.length;
  const ruasDistribuidasEq1 = useMemo(
    () => distribuirRuasEntreParcelas(totalRuasEq1, totalParcelasSelecionadas),
    [totalParcelasSelecionadas, totalRuasEq1],
  );
  const ruasDistribuidasEq2 = useMemo(
    () =>
      distribuirRuasEntreParcelas(
        totalRuasEq2,
        totalParcelasSelecionadas,
      ),
    [totalParcelasSelecionadas, totalRuasEq2],
  );
  const quantidadeRuasValidaPorParcelas =
    totalParcelasSelecionadas <= 1 ||
    (totalRuasEq1 >= totalParcelasSelecionadas &&
      (!duasEquipes || totalRuasEq2 >= totalParcelasSelecionadas));

  const parcelasPreview = useMemo(() => {
    if (!parcelasConfiguradas.length) {
      return [];
    }

    if (faixaEq1Parcial || faixaEq1Invalida || !quantidadeRuasValidaPorParcelas) {
      return [];
    }

    if (
      duasEquipes &&
      (!faixaEq1Preenchida ||
        !faixaEq2Preenchida ||
        faixaEq2Parcial ||
        faixaEq2Invalida)
    ) {
      return [];
    }

    return parcelasConfiguradas.map((parcela, index) => {
      const ruasEq1 = ruasDistribuidasEq1[index] || 0;
      const ruasEq2 = duasEquipes ? ruasDistribuidasEq2[index] || 0 : 0;
      const faixas = duasEquipes
        ? [
            {
              id: `${parcela.base}-eq1`,
              label: equipe1?.nome || 'Equipe 1',
              linhaInicio: linhaInicioEq1,
              linhaFim: linhaFimEq1,
              totalRuas: ruasEq1,
            },
            {
              id: `${parcela.base}-eq2`,
              label: equipe2?.nome || 'Equipe 2',
              linhaInicio: linhaInicioEq2,
              linhaFim: linhaFimEq2,
              totalRuas: ruasEq2,
            },
          ]
        : [
            {
              id: `${parcela.base}-eq1`,
              label: equipe1?.nome || 'Equipe 1',
              linhaInicio: linhaInicioEq1,
              linhaFim: linhaFimEq1,
              fallbackInicio: 1,
              fallbackFim: 136,
              totalRuas: ruasEq1,
            },
          ];

      const previewRuasPorEquipe = gerarRuasDistribuidasPorFaixas({
        totalRuas: duasEquipes ? ruasEq1 + ruasEq2 : ruasEq1,
        paridade,
        faixas,
      });

      return {
        ...parcela,
        ruasEq1,
        ruasEq2,
        previewRuasPorEquipe,
        ruasProgramadas: previewRuasPorEquipe
          .flatMap((faixa) => faixa.ruas)
          .sort((a, b) => a[0] - b[0]),
      };
    });
  }, [
    duasEquipes,
    equipe1?.nome,
    equipe2?.nome,
    faixaEq1Invalida,
    faixaEq1Parcial,
    faixaEq1Preenchida,
    faixaEq2Invalida,
    faixaEq2Parcial,
    faixaEq2Preenchida,
    linhaFimEq1,
    linhaFimEq2,
    linhaInicioEq1,
    linhaInicioEq2,
    paridade,
    parcelasConfiguradas,
    quantidadeRuasValidaPorParcelas,
    ruasDistribuidasEq1,
    ruasDistribuidasEq2,
  ]);
  const previewRuasPorEquipe = parcelasPreview.flatMap((item) =>
    item.previewRuasPorEquipe.map((faixa) => ({
      ...faixa,
      parcela: item.label,
    })),
  );

  const canSubmit =
    parcelasSelecionadas.length > 0 &&
    (!exigeAlinhamentoPorParcela || alinhamentosPreenchidos) &&
    (!exigeAlinhamentoPorParcela || alinhamentosValidos) &&
    quantidadeRuasValidaPorParcelas &&
    Boolean(equipe1) &&
    (!duasEquipes || Boolean(equipe2)) &&
    totalRuasEq1 > 0 &&
    (!duasEquipes || totalRuasEq2 > 0) &&
    !faixaEq1Parcial &&
    !faixaEq1Invalida &&
    (!duasEquipes || (!faixaEq2Parcial && !faixaEq2Invalida)) &&
    parcelasPreview.length === parcelasSelecionadas.length &&
    parcelasPreview.every((item) => item.ruasProgramadas.length > 0);

  const createMutation = useMutation({
    mutationFn: async ({ parcelas, payloadBase }) => {
      const created = [];

      for (const item of parcelas) {
        const record = await createAvaliacaoRecord(
          {
            ...payloadBase,
            parcela: item.label,
            total_ruas: item.ruasProgramadas.length,
            ruas_programadas: JSON.stringify(item.ruasProgramadas),
          },
          { isOnline, queueOperation },
        );
        created.push(record);
      }

      return created;
    },
    onSuccess: (createdRecords) => {
      queryClient.invalidateQueries({ queryKey: ['avaliacoes'] });
      queryClient.invalidateQueries({
        queryKey: queryKeys.avaliacoesJornada(getJornadaId()),
      });

      if (createdRecords.length === 1) {
        navigate(`${createPageUrl('RegistroLinhas')}?id=${createdRecords[0].id}`);
        return;
      }

      navigate(createPageUrl('Dashboard'));
    },
  });

  const toggleParcela = (item) => {
    setParcelasSelecionadas((current) => {
      if (current.includes(item)) {
        setAlinhamentosPorParcela((previous) => {
          const next = { ...previous };
          delete next[item];
          return next;
        });
        return current.filter((value) => value !== item);
      }

      if (current.length >= MAX_PARCELAS_POR_EQUIPE) {
        return current;
      }

      setAlinhamentosPorParcela((previous) => ({
        ...previous,
        [item]:
          previous[item] || {
            inicio: '',
            fim: '',
          },
      }));
      return [...current, item];
    });
  };

  const handleChangeAlinhamento = (parcela, field, value) => {
    setAlinhamentosPorParcela((current) => ({
      ...current,
      [parcela]: {
        ...(current[parcela] || {}),
        [field]: value,
      },
    }));
  };

  const handleAddResponsavel = () => {
    const nome = novoResponsavel.trim();
    if (!nome) return;

    setResponsaveisExtras((current) => {
      if (current.some((item) => item.toLowerCase() === nome.toLowerCase())) {
        return current;
      }
      return [...current, nome];
    });
    setNovoResponsavel('');
  };

  const handleRemoveResponsavel = (nome) => {
    setResponsaveisExtras((current) =>
      current.filter((item) => item !== nome),
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (parcelasSelecionadas.length === 0 || !equipe1) return;

    createMutation.mutate({
      parcelas: parcelasPreview,
      payloadBase: {
        equipe1_id: equipe1.id,
        equipe1_nome: formatEquipeNome(equipe1, linhaInicioEq1, linhaFimEq1),
        equipe2_id: duasEquipes && equipe2 ? equipe2.id : '',
        equipe2_nome:
          duasEquipes && equipe2
            ? formatEquipeNome(equipe2, linhaInicioEq2, linhaFimEq2)
            : '',
        responsavel: responsavelCompleto,
        data: getDataBrasil(),
        jornada_id: getJornadaId(),
        status: 'em_andamento',
        finalizada: false,
        total_cocos_chao: 0,
        total_cachos_3: 0,
        total_registros: 0,
        media_cocos_chao: 0,
        media_cachos_3: 0,
      },
    });
  };

  return (
    <main className="page-shell">
      <PageHeader
        title="Nova Avaliação"
        subtitle="Selecione uma, duas ou tres parcelas, distribuição de ruas e equipe(s)."
        onBack={() => navigate(createPageUrl('Dashboard'))}
      />

      <form onSubmit={handleSubmit} className="page-content space-y-5 pt-5">
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Parcela(s)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Se a mesma equipe trabalhar em duas ou tres parcelas no dia,
                selecione todas aqui. Limite de {MAX_PARCELAS_POR_EQUIPE}{' '}
                parcelas por vez.
              </p>
              <div className="flex flex-wrap gap-2">
                {parcelasConfiguradas.length > 0 ? (
                  parcelasConfiguradas.map((item) => (
                    <span
                      key={item.base}
                      className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                    >
                      {item.label}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    Nenhuma parcela selecionada.
                  </span>
                )}
              </div>
            </div>
            {parcelasOrdenadas.length > 1 ? (
              <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Alinhamento por parcela
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Informe o alinhamento inicial e final de cada parcela desta
                    equipe antes de criar as avaliações.
                  </p>
                </div>
                <div className="space-y-3">
                  {parcelasOrdenadas.map((item) => (
                    <div
                      key={`alinhamento-${item}`}
                      className="grid grid-cols-[1fr,88px,88px] items-center gap-3"
                    >
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800">
                        {item}
                      </div>
                      <Input
                        type="number"
                        min="1"
                        placeholder="Inicio"
                        value={alinhamentosPorParcela[item]?.inicio || ''}
                        onChange={(event) =>
                          handleChangeAlinhamento(
                            item,
                            'inicio',
                            event.target.value,
                          )
                        }
                        className="text-center"
                      />
                      <Input
                        type="number"
                        min="1"
                        placeholder="Fim"
                        value={alinhamentosPorParcela[item]?.fim || ''}
                        onChange={(event) =>
                          handleChangeAlinhamento(
                            item,
                            'fim',
                            event.target.value,
                          )
                        }
                        className="text-center"
                      />
                    </div>
                  ))}
                </div>
                {!alinhamentosPreenchidos ? (
                  <p className="text-xs text-amber-600">
                    Preencha o alinhamento inicial e final de todas as parcelas
                    selecionadas.
                  </p>
                ) : !alinhamentosValidos ? (
                  <p className="text-xs text-red-600">
                    O alinhamento final deve ser maior ou igual ao alinhamento
                    inicial em cada parcela.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="grid grid-cols-7 gap-2">
              {letras.map((letra) => (
                <Button
                  key={letra}
                  type="button"
                  size="sm"
                  variant={letraSelecionada === letra ? 'default' : 'secondary'}
                  className="w-full rounded-xl px-0"
                  onClick={() => setLetraSelecionada(letra)}
                >
                  {letra}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {parcelas.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={parcelasSelecionadas.includes(item) ? 'default' : 'outline'}
                  className="rounded-xl px-2"
                  disabled={
                    parcelasSelecionadas.length >= MAX_PARCELAS_POR_EQUIPE &&
                    !parcelasSelecionadas.includes(item)
                  }
                  onClick={() => toggleParcela(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ruas a Avaliar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={paridade === 'impar' ? 'default' : 'secondary'}
                onClick={() => setParidade('impar')}
              >
                Ímpar
              </Button>
              <Button
                type="button"
                variant={paridade === 'par' ? 'default' : 'secondary'}
                onClick={() => setParidade('par')}
              >
                Par
              </Button>
            </div>
            <div>
              <Label>Quantidade de ruas</Label>
              <p className="mt-2 text-xs text-slate-500">
                Defina a quantidade separadamente em cada equipe abaixo.
              </p>
              {totalParcelasSelecionadas > 1 ? (
                <p className="mt-1 text-xs text-slate-500">
                  A quantidade informada sera dividida automaticamente entre as
                  parcelas selecionadas.
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
              {previewRuasPorEquipe.length > 0 ? (
                previewRuasPorEquipe.map((faixa, index) => (
                  <div key={faixa.id} className="rounded-2xl bg-slate-50 p-3">
                    {totalParcelasSelecionadas > 1 ? (
                      <p className="text-xs font-bold text-slate-700">
                        {faixa.parcela}
                      </p>
                    ) : null}
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {faixa.label} · L{faixa.inicio}-{faixa.fim}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {faixa.ruas.map(([inicio, fim]) => (
                        <span
                          key={`${faixa.id}-${inicio}-${fim}`}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            index === 0
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-violet-50 text-violet-700'
                          }`}
                        >
                          {inicio} - {fim}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : !quantidadeRuasValidaPorParcelas ? (
                <p className="text-xs text-amber-600">
                  Para dividir as ruas entre {totalParcelasSelecionadas}{' '}
                  parcela{totalParcelasSelecionadas > 1 ? 's' : ''}, cada equipe
                  precisa ter pelo menos {totalParcelasSelecionadas} rua
                  {totalParcelasSelecionadas > 1 ? 's' : ''}.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {duasEquipes
                    ? 'Defina a linha inicial e final das duas equipes para gerar as ruas.'
                    : 'Se quiser limitar a amostragem, defina a linha inicial e final da equipe principal.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Equipe(s)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Equipe principal</Label>
              <Select value={equipe1Id} onValueChange={setEquipe1Id}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a equipe" />
                </SelectTrigger>
                <SelectContent>
                  {equipes.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                A mesma equipe pode ser usada em outras parcelas da jornada.
              </p>
            </div>

            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <div>
                <Label>Pessoas do levantamento</Label>
                <p className="mt-1 text-xs text-slate-500">
                  Adicione outras pessoas que fizeram o levantamento junto no
                  mesmo dia para esta equipe.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {responsavelPrincipal || 'Sem responsavel'}
                </span>
                {responsaveisExtras.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => handleRemoveResponsavel(item)}
                  >
                    {item} x
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Adicionar outra pessoa"
                  value={novoResponsavel}
                  onChange={(event) => setNovoResponsavel(event.target.value)}
                />
                <Button type="button" onClick={handleAddResponsavel}>
                  Adicionar
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="ruasEq1">Quantidade de ruas da equipe principal</Label>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() =>
                    setTotalRuasEq1((value) => clamp(value - 1, 1, 68))
                  }
                >
                  -
                </Button>
                <Input
                  id="ruasEq1"
                  type="number"
                  min="1"
                  max="68"
                  value={totalRuasEq1}
                  onChange={(event) =>
                    setTotalRuasEq1(clamp(event.target.value, 1, 68))
                  }
                  className="text-center"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() =>
                    setTotalRuasEq1((value) => clamp(value + 1, 1, 68))
                  }
                >
                  +
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="linhaInicioEq1">Linha início</Label>
                <Input
                  id="linhaInicioEq1"
                  type="number"
                  min="1"
                  max="136"
                  value={linhaInicioEq1}
                  onChange={(event) => setLinhaInicioEq1(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="linhaFimEq1">Linha fim</Label>
                <Input
                  id="linhaFimEq1"
                  type="number"
                  min="1"
                  max="136"
                  value={linhaFimEq1}
                  onChange={(event) => setLinhaFimEq1(event.target.value)}
                />
              </div>
            </div>
            {faixaEq1Parcial ? (
              <p className="text-xs text-amber-600">
                Preencha início e fim da equipe principal para aplicar a faixa.
              </p>
            ) : null}
            {faixaEq1Invalida ? (
              <p className="text-xs text-red-600">
                A linha final da equipe principal deve ser maior que a inicial.
              </p>
            ) : null}

            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                duasEquipes
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
              onClick={() => setDuasEquipes((value) => !value)}
            >
              <span className="text-sm font-semibold text-slate-800">
                Duas equipes nesta parcela?
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {duasEquipes ? 'Sim' : 'Não'}
              </span>
            </button>

            {duasEquipes ? (
              <>
                <div className="space-y-2">
                  <Label>Segunda equipe</Label>
                  <Select value={equipe2Id} onValueChange={setEquipe2Id}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a equipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipes
                        .filter((item) => item.id !== equipe1Id)
                        .map((equipe) => (
                          <SelectItem key={equipe.id} value={equipe.id}>
                            {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ruasEq2">Quantidade de ruas da segunda equipe</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() =>
                        setTotalRuasEq2((value) => clamp(value - 1, 1, 68))
                      }
                    >
                      -
                    </Button>
                    <Input
                      id="ruasEq2"
                      type="number"
                      min="1"
                      max="68"
                      value={totalRuasEq2}
                      onChange={(event) =>
                        setTotalRuasEq2(clamp(event.target.value, 1, 68))
                      }
                      className="text-center"
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={() =>
                        setTotalRuasEq2((value) => clamp(value + 1, 1, 68))
                      }
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="linhaInicioEq2">Linha início</Label>
                    <Input
                      id="linhaInicioEq2"
                      type="number"
                      min="1"
                      max="136"
                      value={linhaInicioEq2}
                      onChange={(event) => setLinhaInicioEq2(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="linhaFimEq2">Linha fim</Label>
                    <Input
                      id="linhaFimEq2"
                      type="number"
                      min="1"
                      max="136"
                      value={linhaFimEq2}
                      onChange={(event) => setLinhaFimEq2(event.target.value)}
                    />
                  </div>
                </div>
                {faixaEq2Parcial ? (
                  <p className="text-xs text-amber-600">
                    Preencha início e fim da segunda equipe para distribuir as ruas.
                  </p>
                ) : null}
                {faixaEq2Invalida ? (
                  <p className="text-xs text-red-600">
                    A linha final da segunda equipe deve ser maior que a inicial.
                  </p>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canSubmit || createMutation.isPending}
        >
          {createMutation.isPending
            ? 'Criando avaliações...'
            : parcelasSelecionadas.length > 1
              ? `Criar ${parcelasSelecionadas.length} avaliações`
              : 'Iniciar Avaliação'}
        </Button>
      </form>
    </main>
  );
}

export default NovaAvaliacao;
