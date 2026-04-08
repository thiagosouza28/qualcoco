import { nowIso, todayIso } from '@/core/date';
import { getOrCreateDevice } from '@/core/device';
import { planejarParcelasAvaliacao } from '@/core/evaluationPlanning';
import { inferirAlinhamentoTipoPorLinha } from '@/core/plots';
import { normalizarContagemRua } from '@/core/registroRua';
import { createEntity, repository, saveEntity } from '@/core/repositories';
import { normalizeDateKey } from '@/core/date';
import type {
  Avaliacao,
  AvaliacaoColaborador,
  AvaliacaoLog,
  AvaliacaoParcela,
  AvaliacaoRetoque,
  AvaliacaoRua,
  Colaborador,
  FiltrosHistorico,
  TipoFalhaRua,
  NovaAvaliacaoInput,
  RegistroColeta,
  SentidoRuas,
} from '@/core/types';

export type AvaliacaoAtivaResumo = Avaliacao & {
  parcelasResumo: string;
  equipeResumo: string;
  totalParcelas: number;
  totalEquipes: number;
};

type ListLimitOptions = {
  limit?: number;
};

type AtualizarAvaliacaoInput = NovaAvaliacaoInput & {
  avaliacaoId: string;
  dataAvaliacao?: string;
  responsavelId?: string;
};

const EMPTY_DASHBOARD_STATS = {
  avaliacoesHoje: 0,
  parcelasHoje: 0,
  avaliacoesOk: 0,
  avaliacoesRefazer: 0,
  registrosHoje: 0,
  pendentesSync: 0,
  colaboradoresAtivos: 0,
};

const ORDEM_COLETA_FIXA = 'invertido' as const;

const inferirSentidoGrupo = (
  ruasGrupo: Array<Pick<AvaliacaoRua, 'linhaInicial' | 'linhaFinal'>>,
): SentidoRuas => {
  if (ruasGrupo.length < 2) {
    return 'inicio';
  }

  return ruasGrupo[0].linhaInicial > ruasGrupo[ruasGrupo.length - 1].linhaInicial
    ? 'fim'
    : 'inicio';
};

const ordenarGrupoPorLinha = <T extends Pick<AvaliacaoRua, 'linhaInicial' | 'linhaFinal'>>(
  ruasGrupo: T[],
) =>
  [...ruasGrupo].sort(
    (a, b) => a.linhaInicial - b.linhaInicial || a.linhaFinal - b.linhaFinal,
  );

const ordenarRuasPorNavegacao = (
  ruas: AvaliacaoRua[],
  parcelasOrdenadas: AvaliacaoParcela[],
) => {
  const ordemParcelas = new Map(
    parcelasOrdenadas.map((item, index) => [item.id, index]),
  );
  const ruasBase = [...ruas].sort((a, b) => {
    const ordemA = ordemParcelas.get(a.avaliacaoParcelaId) || 0;
    const ordemB = ordemParcelas.get(b.avaliacaoParcelaId) || 0;
    if (ordemA !== ordemB) {
      return ordemA - ordemB;
    }
    if (a.ruaNumero !== b.ruaNumero) {
      return a.ruaNumero - b.ruaNumero;
    }
    if (a.linhaInicial !== b.linhaInicial) {
      return a.linhaInicial - b.linhaInicial;
    }
    return a.linhaFinal - b.linhaFinal;
  });

  const ordered: AvaliacaoRua[] = [];
  let currentGroup: AvaliacaoRua[] = [];
  let currentGroupKey = '';

  const flushGroup = () => {
    if (currentGroup.length === 0) {
      return;
    }

    const explicitSentido =
      currentGroup.find(
        (item) => item.sentidoRuas === 'inicio' || item.sentidoRuas === 'fim',
      )?.sentidoRuas || null;
    const sentido = explicitSentido || inferirSentidoGrupo(currentGroup);
    const ruasGrupo = explicitSentido
      ? ordenarGrupoPorLinha(currentGroup)
      : [...currentGroup];

    if (explicitSentido === 'fim') {
      ruasGrupo.reverse();
    }

    ordered.push(
      ...ruasGrupo.map((item) => ({
        ...item,
        sentidoRuas: item.sentidoRuas || sentido,
      })),
    );
    currentGroup = [];
    currentGroupKey = '';
  };

  for (const rua of ruasBase) {
    const nextGroupKey = rua.avaliacaoParcelaId;
    if (currentGroup.length > 0 && nextGroupKey !== currentGroupKey) {
      flushGroup();
    }

    currentGroup.push(rua);
    currentGroupKey = nextGroupKey;
  }

  flushGroup();
  return ordered;
};

const colaboradorPodeVerAvaliacao = (
  avaliacao: Pick<Avaliacao, 'id' | 'usuarioId'>,
  colaboradorId: string | undefined,
  avaliacaoIdsAcessiveis: Set<string>,
) =>
  Boolean(colaboradorId) &&
  (avaliacao.usuarioId === colaboradorId ||
    avaliacaoIdsAcessiveis.has(avaliacao.id));

const colaboradorTemVisaoTotal = async (colaboradorId?: string) => {
  if (!colaboradorId) return false;
  const colaborador = await repository.get('colaboradores', colaboradorId);
  const perfil = String(colaborador?.perfil || '').trim().toLowerCase();
  return perfil === 'fiscal' || perfil === 'admin' || perfil === 'gestor';
};

export const listarIdsAvaliacoesAcessiveis = async (
  colaboradorId?: string,
) => {
  if (!colaboradorId) {
    return new Set<string>();
  }

  if (await colaboradorTemVisaoTotal(colaboradorId)) {
    const avaliacoes = await repository.list('avaliacoes');
    return new Set(avaliacoes.filter((item) => !item.deletadoEm).map((item) => item.id));
  }

  const participantes = await repository.list('avaliacaoColaboradores');

  return participantes.reduce<Set<string>>((acc, item) => {
    if (!item.deletadoEm && item.colaboradorId === colaboradorId) {
      acc.add(item.avaliacaoId);
    }
    return acc;
  }, new Set<string>());
};

const resolveColaboradorPerfil = (colaborador?: Colaborador | null) =>
  String(colaborador?.perfil || 'colaborador').trim() || 'colaborador';

const criarParticipantesAvaliacao = async ({
  avaliacaoId,
  deviceId,
  responsavelId,
  participanteIds,
  colaboradoresMap,
}: {
  avaliacaoId: string;
  deviceId: string;
  responsavelId: string;
  participanteIds: string[];
  colaboradoresMap: Map<string, Colaborador> | null;
}) => {
  const colaboradorIds = Array.from(
    new Set([responsavelId, ...participanteIds]),
  );
  const participantes: AvaliacaoColaborador[] = [];

  for (const colaboradorId of colaboradorIds) {
    const colaborador = colaboradoresMap?.get(colaboradorId) || null;
    participantes.push(
      await createEntity('avaliacaoColaboradores', deviceId, {
        avaliacaoId,
        colaboradorId,
        papel:
          colaboradorId === responsavelId ? 'responsavel' : 'participante',
        colaboradorNome: colaborador?.nome || '',
        colaboradorPrimeiroNome: colaborador?.primeiroNome || '',
        colaboradorMatricula: colaborador?.matricula || '',
        colaboradorPerfil: resolveColaboradorPerfil(colaborador),
      }),
    );
  }

  return participantes;
};

const criarLogAvaliacao = async (input: {
  avaliacaoId: string;
  colaboradorId: string | null;
  acao: string;
  descricao: string;
}) => {
  const device = await getOrCreateDevice();
  const log: AvaliacaoLog = await createEntity('avaliacaoLogs', device.id, {
    avaliacaoId: input.avaliacaoId,
    colaboradorId: input.colaboradorId,
    acao: input.acao,
    descricao: input.descricao,
  });
  return log;
};

const clonarPlanejamentoParaRetoque = async ({
  avaliacaoId,
  avaliacaoOriginalId,
  deviceId,
  dataAvaliacao,
}: {
  avaliacaoId: string;
  avaliacaoOriginalId: string;
  deviceId: string;
  dataAvaliacao: string;
}) => {
  const [parcelasOriginais, ruasOriginais] = await Promise.all([
    repository.filter(
      'avaliacaoParcelas',
      (item) => item.avaliacaoId === avaliacaoOriginalId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoRuas',
      (item) => item.avaliacaoId === avaliacaoOriginalId && !item.deletadoEm,
    ),
  ]);

  const parcelaIdMap = new Map<string, string>();
  const parcelas: AvaliacaoParcela[] = [];
  const ruas: AvaliacaoRua[] = [];

  for (const parcela of parcelasOriginais) {
    const novaParcela = await createEntity('avaliacaoParcelas', deviceId, {
      avaliacaoId,
      parcelaId: parcela.parcelaId,
      parcelaCodigo: parcela.parcelaCodigo,
      linhaInicial: parcela.linhaInicial,
      linhaFinal: parcela.linhaFinal,
      configuradaEm: nowIso(),
      faixasFalha: parcela.faixasFalha || [],
      siglasResumo: null,
    });
    parcelaIdMap.set(parcela.id, novaParcela.id);
    parcelas.push(novaParcela);
  }

  for (const rua of ruasOriginais) {
    const novoParcelaId = parcelaIdMap.get(rua.avaliacaoParcelaId);
    if (!novoParcelaId) continue;
    ruas.push(
      await createEntity('avaliacaoRuas', deviceId, {
        avaliacaoId,
        parcelaId: rua.parcelaId,
        dataAvaliacao,
        avaliacaoParcelaId: novoParcelaId,
        ruaNumero: rua.ruaNumero,
        linhaInicial: rua.linhaInicial,
        linhaFinal: rua.linhaFinal,
        alinhamentoTipo: rua.alinhamentoTipo,
        sentidoRuas: rua.sentidoRuas,
        equipeId: rua.equipeId,
        equipeNome: rua.equipeNome,
        tipoFalha: null,
      }),
    );
  }

  return { parcelas, ruas };
};

const materializarPlanejamentoAvaliacao = async ({
  avaliacaoId,
  deviceId,
  dataAvaliacao,
  parcelasInput,
  planejamentoEquipes,
  alinhamentoTipo,
  sentidoRuas,
}: {
  avaliacaoId: string;
  deviceId: string;
  dataAvaliacao: string;
  parcelasInput: NovaAvaliacaoInput['parcelas'];
  planejamentoEquipes: NovaAvaliacaoInput['planejamentoEquipes'];
  alinhamentoTipo: NovaAvaliacaoInput['alinhamentoTipo'];
  sentidoRuas: NovaAvaliacaoInput['sentidoRuas'];
}) => {
  const parcelas: AvaliacaoParcela[] = [];
  const ruas: AvaliacaoRua[] = [];
  const parcelasPlanejadas = planejarParcelasAvaliacao({
    parcelas: parcelasInput,
    planejamentoEquipes,
    alinhamentoTipo,
    sentidoRuas,
  });

  for (const parcela of parcelasPlanejadas) {
    const parcelaItem = await createEntity('avaliacaoParcelas', deviceId, {
      avaliacaoId,
      parcelaId: parcela.parcelaId,
      parcelaCodigo: parcela.parcelaCodigo,
      linhaInicial: parcela.linhaInicial,
      linhaFinal: parcela.linhaFinal,
      configuradaEm: nowIso(),
      faixasFalha: parcela.faixasFalha || [],
    });

    parcelas.push(parcelaItem);

    const ruasCanonicas = [...parcela.ruasProgramadas]
      .sort(
        (a, b) => a.linhaInicial - b.linhaInicial || a.linhaFinal - b.linhaFinal,
      )
      .map((rua, index) => ({
        ...rua,
        ruaNumero: index + 1,
      }));

    for (const rua of ruasCanonicas) {
      ruas.push(
        await createEntity('avaliacaoRuas', deviceId, {
          avaliacaoId,
          parcelaId: parcela.parcelaId,
          dataAvaliacao,
          avaliacaoParcelaId: parcelaItem.id,
          ruaNumero: rua.ruaNumero,
          linhaInicial: rua.linhaInicial,
          linhaFinal: rua.linhaFinal,
          alinhamentoTipo: rua.alinhamentoTipo,
          sentidoRuas: parcela.sentidoRuas,
          equipeId: rua.equipeId,
          equipeNome: rua.equipeNome,
          tipoFalha: null,
        }),
      );
    }
  }

  return {
    parcelas,
    ruas,
  };
};

export const criarAvaliacao = async (input: NovaAvaliacaoInput) => {
  const device = await getOrCreateDevice();
  const colaboradores = await repository.list('colaboradores');
  const colaboradoresMap = new Map(
    colaboradores.map((item) => [item.id, item]),
  );
  const avaliacao = await createEntity('avaliacoes', device.id, {
    usuarioId: input.usuarioId,
    dispositivoId: input.dispositivoId,
    dataAvaliacao: todayIso(),
    dataColheita: input.dataColheita || todayIso(),
    observacoes: input.observacoes,
    status: 'in_progress',
    tipo: input.tipo || 'normal',
    avaliacaoOriginalId: input.avaliacaoOriginalId || null,
    totalRegistros: 0,
    mediaParcela: 0,
    mediaCachos3: 0,
    origemDado: 'local',
    alinhamentoTipo: input.alinhamentoTipo,
    ordemColeta: ORDEM_COLETA_FIXA,
    modoCalculo: input.modoCalculo || 'manual',
  });

  const participantes = await criarParticipantesAvaliacao({
    avaliacaoId: avaliacao.id,
    deviceId: device.id,
    responsavelId: input.usuarioId,
    participanteIds: input.participanteIds,
    colaboradoresMap,
  });
  const { parcelas, ruas } = await materializarPlanejamentoAvaliacao({
    avaliacaoId: avaliacao.id,
    deviceId: device.id,
    dataAvaliacao: avaliacao.dataAvaliacao,
    parcelasInput: input.parcelas,
    planejamentoEquipes: input.planejamentoEquipes,
    alinhamentoTipo: input.alinhamentoTipo,
    sentidoRuas: input.sentidoRuas,
  });

  const responsavel = colaboradoresMap.get(input.usuarioId);
  await criarLogAvaliacao({
    avaliacaoId: avaliacao.id,
    colaboradorId: input.usuarioId,
    acao: 'avaliacao_iniciada',
    descricao: `Avaliação iniciada por ${responsavel?.primeiroNome || 'colaborador'}.`,
  });

  return {
    avaliacao,
    participantes,
    parcelas,
    ruas,
  };
};

export const criarRetoqueAvaliacao = async (input: {
  avaliacaoOriginalId: string;
  responsavelId: string;
  participanteIds: string[];
}) => {
  const device = await getOrCreateDevice();
  const [avaliacaoOriginal, colaboradores] = await Promise.all([
    repository.get('avaliacoes', input.avaliacaoOriginalId),
    repository.list('colaboradores'),
  ]);

  if (!avaliacaoOriginal) {
    throw new Error('Avaliação original não encontrada.');
  }

  const colaboradoresMap = new Map(
    colaboradores.map((item) => [item.id, item]),
  );

  const avaliacao = await createEntity('avaliacoes', device.id, {
    usuarioId: input.responsavelId,
    dispositivoId: avaliacaoOriginal.dispositivoId,
    dataAvaliacao: todayIso(),
    dataColheita: avaliacaoOriginal.dataColheita || todayIso(),
    observacoes: '',
    status: 'in_progress',
    tipo: 'retoque',
    avaliacaoOriginalId: avaliacaoOriginal.id,
    totalRegistros: 0,
    mediaParcela: 0,
    mediaCachos3: 0,
    origemDado: 'local',
    alinhamentoTipo: avaliacaoOriginal.alinhamentoTipo || inferirAlinhamentoTipoPorLinha(1),
    ordemColeta: ORDEM_COLETA_FIXA,
    modoCalculo: avaliacaoOriginal.modoCalculo || 'manual',
  });

  const participantes = await criarParticipantesAvaliacao({
    avaliacaoId: avaliacao.id,
    deviceId: device.id,
    responsavelId: input.responsavelId,
    participanteIds: input.participanteIds,
    colaboradoresMap,
  });

  const { parcelas, ruas } = await clonarPlanejamentoParaRetoque({
    avaliacaoId: avaliacao.id,
    avaliacaoOriginalId: avaliacaoOriginal.id,
    deviceId: device.id,
    dataAvaliacao: avaliacao.dataAvaliacao,
  });

  const responsavel = colaboradoresMap.get(input.responsavelId);
  await criarLogAvaliacao({
    avaliacaoId: avaliacao.id,
    colaboradorId: input.responsavelId,
    acao: 'retoque_iniciado',
    descricao: `Retoque iniciado por ${responsavel?.primeiroNome || 'colaborador'}.`,
  });

  return {
    avaliacao,
    participantes,
    parcelas,
    ruas,
  };
};

export const atualizarAvaliacaoConfiguracao = async (
  input: AtualizarAvaliacaoInput,
) => {
  const device = await getOrCreateDevice();
  const dataAvaliacaoAtualizada = todayIso();
  const colaboradores = await repository.list('colaboradores');
  const colaboradoresMap = new Map(
    colaboradores.map((item) => [item.id, item]),
  );
  const [avaliacao, participantesAtuais, parcelasAtuais, ruasAtuais, registrosAtuais] =
    await Promise.all([
      repository.get('avaliacoes', input.avaliacaoId),
      repository.filter(
        'avaliacaoColaboradores',
        (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
      ),
      repository.filter(
        'avaliacaoParcelas',
        (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
      ),
      repository.filter(
        'avaliacaoRuas',
        (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
      ),
      repository.filter(
        'registrosColeta',
        (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
      ),
    ]);

  if (!avaliacao || avaliacao.deletadoEm) {
    return null;
  }

  for (const registro of registrosAtuais) {
    await softDeleteAvaliacaoRecord('registrosColeta', registro);
  }

  for (const rua of ruasAtuais) {
    await softDeleteAvaliacaoRecord('avaliacaoRuas', rua);
  }

  for (const participante of participantesAtuais) {
    await softDeleteAvaliacaoRecord('avaliacaoColaboradores', participante);
  }

  for (const parcela of parcelasAtuais) {
    await softDeleteAvaliacaoRecord('avaliacaoParcelas', parcela);
  }

  const responsavelId = input.responsavelId || avaliacao.usuarioId || input.usuarioId;
  const nextAvaliacao: Avaliacao = {
    ...avaliacao,
    usuarioId: responsavelId,
    dispositivoId: input.dispositivoId,
    // Toda edição reabre a avaliação na data atual.
    dataAvaliacao: dataAvaliacaoAtualizada,
    dataColheita: input.dataColheita || avaliacao.dataColheita || todayIso(),
    observacoes: input.observacoes,
    status: 'in_progress',
    totalRegistros: 0,
    mediaParcela: 0,
    mediaCachos3: 0,
    alinhamentoTipo: input.alinhamentoTipo,
    ordemColeta: ORDEM_COLETA_FIXA,
    modoCalculo: input.modoCalculo || 'manual',
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: avaliacao.versao + 1,
  };

  await saveEntity('avaliacoes', nextAvaliacao);

  const participantes = await criarParticipantesAvaliacao({
    avaliacaoId: avaliacao.id,
    deviceId: device.id,
    responsavelId,
    participanteIds: input.participanteIds,
    colaboradoresMap,
  });
  const { parcelas, ruas } = await materializarPlanejamentoAvaliacao({
    avaliacaoId: avaliacao.id,
    deviceId: device.id,
    dataAvaliacao: dataAvaliacaoAtualizada,
    parcelasInput: input.parcelas,
    planejamentoEquipes: input.planejamentoEquipes,
    alinhamentoTipo: input.alinhamentoTipo,
    sentidoRuas: input.sentidoRuas,
  });

  return {
    avaliacao: nextAvaliacao,
    participantes,
    parcelas,
    ruas,
  };
};

export const listarAvaliacoesAtivas = async (
  colaboradorId?: string,
  options: ListLimitOptions = {},
) => {
  if (!colaboradorId) {
    return [];
  }

  const visaoTotal = await colaboradorTemVisaoTotal(colaboradorId);
  const [avaliacoes, avaliacaoParcelas, avaliacaoRuas, avaliacaoIdsAcessiveis] =
    await Promise.all([
    repository.list('avaliacoes'),
    repository.list('avaliacaoParcelas'),
    repository.list('avaliacaoRuas'),
    visaoTotal ? Promise.resolve(new Set<string>()) : listarIdsAvaliacoesAcessiveis(colaboradorId),
  ]);

  const parcelasPorAvaliacao = avaliacaoParcelas.reduce<Record<string, string[]>>(
    (acc, item) => {
      if (item.deletadoEm) return acc;
      acc[item.avaliacaoId] = acc[item.avaliacaoId] || [];
      if (!acc[item.avaliacaoId].includes(item.parcelaCodigo)) {
        acc[item.avaliacaoId].push(item.parcelaCodigo);
      }
      return acc;
    },
    {},
  );

  const equipesPorAvaliacao = avaliacaoRuas.reduce<Record<string, string[]>>(
    (acc, item) => {
      if (item.deletadoEm || !item.equipeNome) return acc;
      acc[item.avaliacaoId] = acc[item.avaliacaoId] || [];
      if (!acc[item.avaliacaoId].includes(item.equipeNome)) {
        acc[item.avaliacaoId].push(item.equipeNome);
      }
      return acc;
    },
    {},
  );

  const formatResumo = (items: string[], fallback: string) => {
    if (items.length === 0) return fallback;
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} e ${items[1]}`;
    return `${items[0]} +${items.length - 1}`;
  };

  const result = avaliacoes
    .filter(
      (item) =>
        !item.deletadoEm &&
        (visaoTotal ||
          colaboradorPodeVerAvaliacao(
            item,
            colaboradorId,
            avaliacaoIdsAcessiveis,
          )),
    )
    .map((item) => {
      const parcelas = parcelasPorAvaliacao[item.id] || [];
      const equipes = equipesPorAvaliacao[item.id] || [];

      return {
        ...item,
        parcelaCodigo:
          item.parcelaCodigo ||
          parcelas[0] ||
          'Parcela em andamento',
        parcelasResumo: formatResumo(
          parcelas,
          item.parcelaCodigo || 'Parcela em andamento',
        ),
        equipeResumo: formatResumo(equipes, 'Equipe não definida'),
        totalParcelas: parcelas.length,
        totalEquipes: equipes.length,
      };
    })
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  return typeof options.limit === 'number'
    ? result.slice(0, Math.max(options.limit, 0))
    : result;
};

export const obterAvaliacaoDetalhada = async (
  avaliacaoId: string,
  colaboradorId?: string,
) => {
  if (!colaboradorId) {
    return null;
  }

  const visaoTotal = await colaboradorTemVisaoTotal(colaboradorId);
  const [avaliacao, avaliacaoIdsAcessiveis] = await Promise.all([
    repository.get('avaliacoes', avaliacaoId),
    visaoTotal ? Promise.resolve(new Set<string>()) : listarIdsAvaliacoesAcessiveis(colaboradorId),
  ]);

  if (
    !avaliacao ||
    avaliacao.deletadoEm ||
    (!visaoTotal &&
      !colaboradorPodeVerAvaliacao(avaliacao, colaboradorId, avaliacaoIdsAcessiveis))
  ) {
    return null;
  }

  const [
    parcelas,
    ruas,
    registros,
    participantes,
    logs,
    retoques,
    colaboradoresBase,
    parcelasCatalogo,
  ] = await Promise.all([
    repository.filter(
      'avaliacaoParcelas',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoRuas',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'registrosColeta',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoColaboradores',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoLogs',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoRetoques',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.list('colaboradores'),
    repository.list('parcelas'),
  ]);

  const colaboradoresMap = new Map(
    colaboradoresBase.map((item) => [item.id, item]),
  );
  const parcelasMap = new Map(parcelasCatalogo.map((item) => [item.id, item]));
  const parcelasOrdenadas = [...parcelas].sort(
    (a, b) =>
      a.parcelaCodigo.localeCompare(b.parcelaCodigo, 'pt-BR', { numeric: true }) ||
      a.linhaInicial - b.linhaInicial ||
      a.linhaFinal - b.linhaFinal,
  );
  const ruasNormalizadas = ordenarRuasPorNavegacao(
    ruas
    .map((item) => ({
      ...item,
      dataAvaliacao: item.dataAvaliacao || avaliacao.dataAvaliacao,
      alinhamentoTipo:
        item.alinhamentoTipo ||
        inferirAlinhamentoTipoPorLinha(item.linhaInicial),
      sentidoRuas:
        item.sentidoRuas === 'inicio' || item.sentidoRuas === 'fim'
          ? item.sentidoRuas
          : undefined,
      tipoFalha: item.tipoFalha || null,
    }))
    ,
    parcelasOrdenadas,
  );
  const alinhamentoTipoAvaliacao =
    avaliacao.alinhamentoTipo ||
    ruasNormalizadas[0]?.alinhamentoTipo ||
    undefined;

  return {
    avaliacao: {
      ...avaliacao,
      alinhamentoTipo: alinhamentoTipoAvaliacao,
      ordemColeta: ORDEM_COLETA_FIXA,
      modoCalculo: avaliacao.modoCalculo || 'manual',
    },
    parcelas: parcelasOrdenadas,
    ruas: ruasNormalizadas,
    registros,
    participantes: participantes.map((item) => ({
      ...item,
      colaborador: colaboradoresMap.get(item.colaboradorId) || null,
    })),
    logs: logs.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    retoque: retoques[0] || null,
    parcelasCatalogo: parcelasMap,
  };
};

export const salvarRegistroColeta = async (input: {
  avaliacaoId: string;
  parcelaId: string;
  ruaId: string;
  colaboradorId: string;
  quantidade: number;
  quantidadeCachos3: number;
  observacoes: string;
}) => {
  const device = await getOrCreateDevice();
  const ruaAtual = await repository.get('avaliacaoRuas', input.ruaId);
  if (ruaAtual?.tipoFalha) {
    await saveEntity('avaliacaoRuas', {
      ...ruaAtual,
      tipoFalha: null,
      atualizadoEm: nowIso(),
      syncStatus: 'pending_sync',
      versao: ruaAtual.versao + 1,
    });
  }

  const registrosExistentes = await repository.filter(
    'registrosColeta',
    (item) =>
      item.avaliacaoId === input.avaliacaoId &&
      item.ruaId === input.ruaId &&
      !item.deletadoEm,
  );

  let registro: RegistroColeta;
  if (registrosExistentes[0]) {
    registro = {
      ...registrosExistentes[0],
      quantidade: input.quantidade,
      quantidadeCachos3: input.quantidadeCachos3,
      observacoes: input.observacoes,
      colaboradorId: input.colaboradorId,
      registradoEm: nowIso(),
      dispositivoId: device.id,
      atualizadoEm: nowIso(),
      syncStatus: 'pending_sync',
      versao: registrosExistentes[0].versao + 1,
    };
    await saveEntity('registrosColeta', registro);
  } else {
    registro = await createEntity('registrosColeta', device.id, {
      avaliacaoId: input.avaliacaoId,
      parcelaId: input.parcelaId,
      ruaId: input.ruaId,
      colaboradorId: input.colaboradorId,
      quantidade: input.quantidade,
      quantidadeCachos3: input.quantidadeCachos3,
      observacoes: input.observacoes,
      registradoEm: nowIso(),
      dispositivoId: device.id,
    });
  }

  await recalcularResumoAvaliacao(input.avaliacaoId);
  return registro;
};

export const recalcularResumoAvaliacao = async (avaliacaoId: string) => {
  const todosRegistros = await repository.filter(
    'registrosColeta',
    (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
  );

  const totalCocos = todosRegistros.reduce(
    (acc, item) => acc + normalizarContagemRua(item.quantidade),
    0,
  );
  const totalCachos3 = todosRegistros.reduce(
    (acc, item) => acc + normalizarContagemRua(item.quantidadeCachos3),
    0,
  );
  const totalRegs = todosRegistros.length;

  const mediaCocos = totalRegs > 0 ? totalCocos / totalRegs : 0;
  const mediaCachos = totalRegs > 0 ? totalCachos3 / totalRegs : 0;

  const avaliacao = await repository.get('avaliacoes', avaliacaoId);
  if (avaliacao) {
    await saveEntity('avaliacoes', {
      ...avaliacao,
      totalRegistros: totalRegs,
      mediaParcela: Number(mediaCocos.toFixed(2)),
      mediaCachos3: Number(mediaCachos.toFixed(2)),
      atualizadoEm: nowIso(),
      syncStatus: 'pending_sync',
      versao: avaliacao.versao + 1,
    });
  }

  return avaliacao;
};

const softDeleteAvaliacaoRecord = async <
  T extends {
    deletadoEm: string | null;
    versao: number;
    atualizadoEm: string;
    syncStatus: string;
  },
>(
  storeName:
    | 'avaliacoes'
    | 'avaliacaoColaboradores'
    | 'avaliacaoParcelas'
    | 'avaliacaoRuas'
    | 'registrosColeta',
  record: T | null | undefined,
) => {
  if (!record || record.deletadoEm) return;

  await saveEntity(storeName, {
    ...record,
    deletadoEm: nowIso(),
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: record.versao + 1,
  });
};

export const marcarFalhaRua = async (input: {
  avaliacaoId: string;
  ruaId: string;
  tipoFalha: TipoFalhaRua;
}) => {
  const rua = await repository.get('avaliacaoRuas', input.ruaId);
  if (!rua || rua.deletadoEm) return null;

  const registros = await repository.filter(
    'registrosColeta',
    (item) => item.ruaId === input.ruaId && !item.deletadoEm,
  );

  for (const registro of registros) {
    await softDeleteAvaliacaoRecord('registrosColeta', registro);
  }

  const nextRua = {
    ...rua,
    tipoFalha: input.tipoFalha,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync' as const,
    versao: rua.versao + 1,
  };

  await saveEntity('avaliacaoRuas', nextRua);
  await recalcularResumoAvaliacao(input.avaliacaoId);
  return nextRua;
};

export const limparFalhaRua = async (input: {
  avaliacaoId: string;
  ruaId: string;
}) => {
  const rua = await repository.get('avaliacaoRuas', input.ruaId);
  if (!rua || rua.deletadoEm || !rua.tipoFalha) return rua;

  const nextRua = {
    ...rua,
    tipoFalha: null,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync' as const,
    versao: rua.versao + 1,
  };

  await saveEntity('avaliacaoRuas', nextRua);
  await recalcularResumoAvaliacao(input.avaliacaoId);
  return nextRua;
};

export const excluirAvaliacaoEmAndamento = async (avaliacaoId: string) => {
  const [avaliacao, participantes, parcelas, ruas, registros] = await Promise.all([
    repository.get('avaliacoes', avaliacaoId),
    repository.filter(
      'avaliacaoColaboradores',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoParcelas',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoRuas',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'registrosColeta',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
  ]);

  if (!avaliacao || avaliacao.deletadoEm) return null;

  for (const registro of registros) {
    await softDeleteAvaliacaoRecord('registrosColeta', registro);
  }

  for (const rua of ruas) {
    await softDeleteAvaliacaoRecord('avaliacaoRuas', rua);
  }

  for (const participante of participantes) {
    await softDeleteAvaliacaoRecord('avaliacaoColaboradores', participante);
  }

  for (const parcela of parcelas) {
    await softDeleteAvaliacaoRecord('avaliacaoParcelas', parcela);
  }

  await softDeleteAvaliacaoRecord('avaliacoes', avaliacao);
  return true;
};

export const excluirAvaliacaoCompleta = async (avaliacaoId: string) => {
  const [
    avaliacao,
    participantes,
    parcelas,
    ruas,
    registros,
    logs,
    retoques,
  ] = await Promise.all([
    repository.get('avaliacoes', avaliacaoId),
    repository.filter(
      'avaliacaoColaboradores',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoParcelas',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoRuas',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'registrosColeta',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoLogs',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoRetoques',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
  ]);

  if (!avaliacao || avaliacao.deletadoEm) return null;

  for (const registro of registros) {
    await softDeleteAvaliacaoRecord('registrosColeta', registro);
  }
  for (const rua of ruas) {
    await softDeleteAvaliacaoRecord('avaliacaoRuas', rua);
  }
  for (const participante of participantes) {
    await softDeleteAvaliacaoRecord('avaliacaoColaboradores', participante);
  }
  for (const parcela of parcelas) {
    await softDeleteAvaliacaoRecord('avaliacaoParcelas', parcela);
  }
  for (const log of logs) {
    await softDeleteAvaliacaoRecord('avaliacaoLogs', log);
  }
  for (const retoque of retoques) {
    await softDeleteAvaliacaoRecord('avaliacaoRetoques', retoque);
  }

  await softDeleteAvaliacaoRecord('avaliacoes', avaliacao);
  return true;
};

export const finalizarAvaliacao = async (avaliacaoId: string) => {
  const [avaliacao, configs, participantes, retoques] = await Promise.all([
    repository.get('avaliacoes', avaliacaoId),
    repository.list('configuracoes'),
    repository.filter(
      'avaliacaoColaboradores',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.filter(
      'avaliacaoRetoques',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
  ]);

  if (!avaliacao) return null;
  const responsavel = participantes.find((item) => item.papel === 'responsavel');
  if (!responsavel) {
    throw new Error('Defina um responsável antes de finalizar a avaliação.');
  }
  if (avaliacao.tipo === 'retoque' && !retoques[0]) {
    throw new Error('Informe os dados do retoque antes de finalizar.');
  }

  const config = configs[0];
  const limiteCocos = config?.limiteCocosChao ?? 19;
  const limiteCachos = config?.limiteCachos3Cocos ?? 19;

  // Lógica de decisão: se a média de cocos no chão OU cachos com 3 for maior que o limite, marca como refazer
  const statusFinal = (avaliacao.mediaParcela > limiteCocos || avaliacao.mediaCachos3 > limiteCachos) ? 'refazer' : 'ok';

  const next: Avaliacao = {
    ...avaliacao,
    status: statusFinal,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: avaliacao.versao + 1,
  };

  await saveEntity('avaliacoes', next);

  await criarLogAvaliacao({
    avaliacaoId,
    colaboradorId: responsavel.colaboradorId,
    acao: 'avaliacao_finalizada',
    descricao:
      next.status === 'refazer'
        ? 'Avaliação finalizada com retoque.'
        : 'Avaliação finalizada com status OK.',
  });

  return next;
};

export const registrarRetoque = async (input: {
  avaliacaoId: string;
  quantidadeBags: number;
  quantidadeCargas: number;
  dataRetoque: string;
  observacao: string;
  responsavelId: string;
}) => {
  const device = await getOrCreateDevice();
  const [avaliacao, colaboradores] = await Promise.all([
    repository.get('avaliacoes', input.avaliacaoId),
    repository.list('colaboradores'),
  ]);
  if (!avaliacao || avaliacao.tipo !== 'retoque' || !avaliacao.avaliacaoOriginalId) {
    throw new Error('Retoque não disponível para esta avaliação.');
  }

  const responsavel = colaboradores.find((item) => item.id === input.responsavelId);
  const existente = await repository.filter(
    'avaliacaoRetoques',
    (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
  );

  const payload = {
    avaliacaoId: input.avaliacaoId,
    avaliacaoOriginalId: avaliacao.avaliacaoOriginalId,
    responsavelId: input.responsavelId,
    responsavelNome: responsavel?.nome || '',
    responsavelMatricula: responsavel?.matricula || '',
    quantidadeBags: input.quantidadeBags,
    quantidadeCargas: input.quantidadeCargas,
    dataRetoque: input.dataRetoque,
    observacao: input.observacao,
  };

  let record: AvaliacaoRetoque;
  if (existente[0]) {
    record = {
      ...existente[0],
      ...payload,
      atualizadoEm: nowIso(),
      syncStatus: 'pending_sync',
      versao: existente[0].versao + 1,
    };
    await saveEntity('avaliacaoRetoques', record);
  } else {
    record = await createEntity('avaliacaoRetoques', device.id, payload);
  }

  await criarLogAvaliacao({
    avaliacaoId: input.avaliacaoId,
    colaboradorId: input.responsavelId,
    acao: 'retoque_finalizado',
    descricao: `Retoque finalizado por ${responsavel?.primeiroNome || 'colaborador'}.`,
  });

  return record;
};

export const listarHistorico = async (
  filters: FiltrosHistorico = {},
  colaboradorLogadoId?: string,
  options: ListLimitOptions = {},
) => {
  if (!colaboradorLogadoId) {
    return [];
  }

  const visaoTotal = await colaboradorTemVisaoTotal(colaboradorLogadoId);
  const [
    avaliacoes,
    avaliacaoColaboradores,
    avaliacaoParcelas,
    avaliacaoIdsAcessiveis,
  ] =
    await Promise.all([
      repository.list('avaliacoes'),
      repository.list('avaliacaoColaboradores'),
      repository.list('avaliacaoParcelas'),
      visaoTotal
        ? Promise.resolve(new Set<string>())
        : listarIdsAvaliacoesAcessiveis(colaboradorLogadoId),
    ]);

  const result = avaliacoes
    .filter(
      (item) =>
        !item.deletadoEm &&
        (visaoTotal ||
          colaboradorPodeVerAvaliacao(
            item,
            colaboradorLogadoId,
            avaliacaoIdsAcessiveis,
          )),
    )
    .filter((item) =>
      filters.data ? normalizeDateKey(item.dataAvaliacao) === filters.data : true,
    )
    .filter((item) =>
      filters.syncStatus && filters.syncStatus !== 'all'
        ? item.syncStatus === filters.syncStatus
        : true,
    )
    .filter((item) =>
      filters.colaboradorId
        ? avaliacaoColaboradores.some(
            (row) =>
              row.avaliacaoId === item.id &&
              row.colaboradorId === filters.colaboradorId &&
              !row.deletadoEm,
          )
        : true,
    )
    .filter((item) =>
      filters.parcelaId
        ? avaliacaoParcelas.some(
            (row) =>
              row.avaliacaoId === item.id &&
              row.parcelaId === filters.parcelaId &&
              !row.deletadoEm,
          )
        : true,
    )
    .sort((a, b) => b.dataAvaliacao.localeCompare(a.dataAvaliacao));

  return typeof options.limit === 'number'
    ? result.slice(0, Math.max(options.limit, 0))
    : result;
};

export const estatisticasDashboard = async (colaboradorId?: string) => {
  if (!colaboradorId) {
    return EMPTY_DASHBOARD_STATS;
  }

  const visaoTotal = await colaboradorTemVisaoTotal(colaboradorId);
  const [
    avaliacoes,
    registros,
    colaboradores,
    avaliacaoColaboradores,
    avaliacaoParcelas,
    avaliacaoIdsAcessiveis,
  ] =
    await Promise.all([
      repository.list('avaliacoes'),
      repository.list('registrosColeta'),
      repository.list('colaboradores'),
      repository.list('avaliacaoColaboradores'),
      repository.list('avaliacaoParcelas'),
      visaoTotal
        ? Promise.resolve(new Set<string>())
        : listarIdsAvaliacoesAcessiveis(colaboradorId),
    ]);

  const avaliacoesVisiveis = avaliacoes.filter(
    (item) =>
      !item.deletadoEm &&
      (visaoTotal ||
        colaboradorPodeVerAvaliacao(item, colaboradorId, avaliacaoIdsAcessiveis)),
  );
  const avaliacaoIdsVisiveis = new Set(avaliacoesVisiveis.map((item) => item.id));

  const hoje = todayIso();
  const todays = avaliacoesVisiveis.filter(
    (item) => item.dataAvaliacao === hoje,
  );
  const avaliacaoIdsHoje = new Set(todays.map((item) => item.id));
  const colaboradoresVisiveis = new Set(
    avaliacaoColaboradores
      .filter(
        (item) =>
          !item.deletadoEm && avaliacaoIdsVisiveis.has(item.avaliacaoId),
      )
      .map((item) => item.colaboradorId),
  );
  const parcelasHoje = new Set(
    avaliacaoParcelas
      .filter(
        (item) =>
          !item.deletadoEm && avaliacaoIdsHoje.has(item.avaliacaoId),
      )
      .map((item) => `${item.avaliacaoId}:${item.parcelaId}`),
  ).size;

  return {
    avaliacoesHoje: todays.length,
    parcelasHoje,
    avaliacoesOk: todays.filter(a => a.status === 'completed' || a.status === 'ok').length,
    avaliacoesRefazer: todays.filter(a => a.status === 'refazer').length,
    registrosHoje: registros.filter((item) =>
      !item.deletadoEm &&
      avaliacaoIdsVisiveis.has(item.avaliacaoId) &&
      item.registradoEm.startsWith(hoje),
    ).length,
    pendentesSync: avaliacoesVisiveis.filter((item) => item.syncStatus !== 'synced')
      .length,
    colaboradoresAtivos: colaboradores.filter(
      (item) =>
        item.ativo &&
        !item.deletadoEm &&
        colaboradoresVisiveis.has(item.id),
    ).length,
  };
};
