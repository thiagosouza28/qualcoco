import { nowIso, todayIso } from '@/core/date';
import { getOrCreateDevice } from '@/core/device';
import { planejarParcelasAvaliacao } from '@/core/evaluationPlanning';
import {
  notificarPossivelRetoque,
  notificarRetoqueAtribuido,
} from '@/core/notifications';
import {
  canOperateAssignedRetoque,
  canStartEvaluation,
  canStartRetoque,
  canMarkRetoque,
  getAccessContext,
  obterPermissoesPerfisConfiguradas,
  normalizePapelAvaliacao,
  normalizePerfilUsuario,
} from '@/core/permissions';
import {
  atualizarStatusParcelaPlanejada,
  listarParcelasPlanejadasPorAvaliacao,
  vincularParcelasPlanejadasAvaliacao,
} from '@/core/plannedParcels';
import { inferirAlinhamentoTipoPorLinha } from '@/core/plots';
import { normalizarContagemRua } from '@/core/registroRua';
import { createEntity, repository, saveEntity } from '@/core/repositories';
import { normalizeDateKey } from '@/core/date';
import type {
  AtribuicaoRetoque,
  Avaliacao,
  AvaliacaoColaborador,
  AvaliacaoLog,
  AvaliacaoParcela,
  AvaliacaoRetoque,
  AvaliacaoRua,
  Colaborador,
  FiltrosHistorico,
  ParcelaPlanejada,
  TipoFalhaRua,
  NovaAvaliacaoInput,
  RegistroColeta,
  SentidoRuas,
  PerfilUsuario,
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

const getEquipeIdsDaAvaliacao = (
  avaliacaoId: string,
  avaliacoes: Avaliacao[],
  ruas: AvaliacaoRua[],
) => {
  const avaliacao = avaliacoes.find((item) => item.id === avaliacaoId) || null;
  const equipeIds = new Set<string>();

  if (avaliacao?.equipeId) {
    equipeIds.add(avaliacao.equipeId);
  }

  ruas.forEach((item) => {
    if (item.avaliacaoId === avaliacaoId && !item.deletadoEm && item.equipeId) {
      equipeIds.add(item.equipeId);
    }
  });

  return Array.from(equipeIds);
};

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

const colaboradorTemVisaoTotal = async (colaboradorId?: string) =>
  (await getAccessContext(colaboradorId)).visaoTotal;

export const listarIdsAvaliacoesAcessiveis = async (
  colaboradorId?: string,
) => {
  if (!colaboradorId) {
    return new Set<string>();
  }

  const access = await getAccessContext(colaboradorId);
  const [avaliacoes, participantes, ruas] = await Promise.all([
    repository.list('avaliacoes'),
    repository.list('avaliacaoColaboradores'),
    repository.list('avaliacaoRuas'),
  ]);

  if (access.visaoTotal) {
    return new Set(avaliacoes.filter((item) => !item.deletadoEm).map((item) => item.id));
  }

  const ids = participantes.reduce<Set<string>>((acc, item) => {
    if (!item.deletadoEm && item.colaboradorId === colaboradorId) {
      acc.add(item.avaliacaoId);
    }
    return acc;
  }, new Set<string>());

  if (access.perfil !== 'colaborador' && access.equipeIds.length > 0) {
    avaliacoes.forEach((avaliacao) => {
      if (avaliacao.deletadoEm) {
        return;
      }

      const equipeIds = getEquipeIdsDaAvaliacao(avaliacao.id, avaliacoes, ruas);
      if (equipeIds.some((item) => access.equipeIds.includes(item))) {
        ids.add(avaliacao.id);
      }
    });
  }

  return ids;
};

const resolveColaboradorPerfil = (colaborador?: Colaborador | null) =>
  normalizePerfilUsuario(colaborador?.perfil);

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
  const colaboradorIds = Array.from(new Set([responsavelId, ...participanteIds]));
  const participantes: AvaliacaoColaborador[] = [];

  for (const colaboradorId of colaboradorIds) {
    const colaborador = colaboradoresMap?.get(colaboradorId) || null;
    participantes.push(
      await createEntity('avaliacaoColaboradores', deviceId, {
        avaliacaoId,
        colaboradorId,
        papel:
          colaboradorId === responsavelId
            ? 'responsavel_principal'
            : 'ajudante',
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
  parcelaId?: string | null;
  colaboradorId: string | null;
  acao: string;
  descricao: string;
}) => {
  const device = await getOrCreateDevice();
  const colaborador = input.colaboradorId
    ? await repository.get('colaboradores', input.colaboradorId)
    : null;
  const log: AvaliacaoLog = await createEntity('avaliacaoLogs', device.id, {
    avaliacaoId: input.avaliacaoId,
    parcelaId: input.parcelaId || null,
    colaboradorId: input.colaboradorId,
    usuarioNome: colaborador?.nome || '',
    usuarioPerfil: normalizePerfilUsuario(colaborador?.perfil) as PerfilUsuario,
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

const resolveEquipePrincipal = ({
  equipeId,
  equipeNome,
  planejamentoEquipes,
}: {
  equipeId?: string | null;
  equipeNome?: string;
  planejamentoEquipes?: NovaAvaliacaoInput['planejamentoEquipes'];
}) => {
  const principal = planejamentoEquipes?.[0] || null;
  return {
    equipeId: equipeId || principal?.equipeId || null,
    equipeNome: equipeNome || principal?.equipeNome || '',
  };
};

const validarExecutorRetoque = (
  colaborador: Colaborador | null,
  label = 'colaborador designado para o retoque',
) => {
  if (!colaborador || colaborador.deletadoEm || !colaborador.ativo) {
    throw new Error(`Selecione um ${label} válido e ativo.`);
  }

  if (normalizePerfilUsuario(colaborador.perfil) !== 'colaborador') {
    throw new Error(`O ${label} precisa estar cadastrado com perfil de colaborador.`);
  }

  return colaborador;
};

const listarCodigosParcelasDaAvaliacao = async (avaliacaoId: string) =>
  (await repository.filter(
    'avaliacaoParcelas',
    (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
  ))
    .map((item) => item.parcelaCodigo)
    .filter(Boolean);

const formatarListaNomes = (nomes: string[]) =>
  nomes.filter(Boolean).join(' - ');

const FINAL_EVALUATION_STATUSES = new Set([
  'completed',
  'ok',
  'refazer',
  'revisado',
]);

const formatarEquipeSiglaKey = (value: string | null | undefined) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return /^\d+$/.test(normalized) ? normalized.padStart(2, '0') : normalized;
};

const ordenarEquipeSiglaKeys = (values: string[]) =>
  [...values].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

const remapearSiglasResumoParcela = (
  siglasResumo: AvaliacaoParcela['siglasResumo'],
  equipeLabelsPlanejadas: string[],
) => {
  if (!siglasResumo || typeof siglasResumo !== 'object') {
    return null;
  }

  const entradasAtuais = Object.entries(siglasResumo)
    .map(([equipe, sigla]) => [formatarEquipeSiglaKey(equipe), sigla] as const)
    .filter(([, sigla]) => Boolean(sigla));
  if (entradasAtuais.length === 0) {
    return null;
  }

  const equipesNovas = ordenarEquipeSiglaKeys(
    Array.from(
      new Set(
        equipeLabelsPlanejadas.map((item) => formatarEquipeSiglaKey(item)).filter(Boolean),
      ),
    ),
  );
  if (equipesNovas.length === 0) {
    return null;
  }

  const resultado: Record<string, string> = {};
  const equipesNovasRestantes = [...equipesNovas];

  for (const [equipeAtual, sigla] of entradasAtuais) {
    if (!sigla || !equipesNovasRestantes.includes(equipeAtual)) {
      continue;
    }

    resultado[equipeAtual] = sigla;
    equipesNovasRestantes.splice(equipesNovasRestantes.indexOf(equipeAtual), 1);
  }

  const siglasRestantes = entradasAtuais
    .filter(([equipeAtual]) => !(equipeAtual in resultado))
    .map(([, sigla]) => sigla)
    .filter(Boolean);

  equipesNovasRestantes.forEach((equipe, index) => {
    const sigla = siglasRestantes[index];
    if (sigla) {
      resultado[equipe] = sigla;
    }
  });

  return Object.keys(resultado).length > 0 ? resultado : null;
};

const resolverStatusFinalPorMedia = (avaliacao: Avaliacao, input: {
  limiteCocos: number;
  limiteCachos: number;
}) => {
  const excedeuLimites =
    avaliacao.mediaParcela > input.limiteCocos ||
    avaliacao.mediaCachos3 > input.limiteCachos;
  const statusAtual = String(avaliacao.status || '').trim().toLowerCase();

  if (avaliacao.tipo === 'retoque') {
    return excedeuLimites ? 'refazer' : 'revisado';
  }

  if (statusAtual === 'revisado') {
    return excedeuLimites ? 'refazer' : 'revisado';
  }

  return excedeuLimites ? 'refazer' : 'ok';
};

const sincronizarStatusFinalAvaliacaoAposEdicao = async (avaliacaoId: string) => {
  const [avaliacao, configs] = await Promise.all([
    repository.get('avaliacoes', avaliacaoId),
    repository.list('configuracoes'),
  ]);

  if (!avaliacao || avaliacao.deletadoEm) {
    return null;
  }

  const statusAtual = String(avaliacao.status || '').trim().toLowerCase();
  if (!FINAL_EVALUATION_STATUSES.has(statusAtual)) {
    return avaliacao;
  }

  const config = configs[0];
  const nextStatus = resolverStatusFinalPorMedia(avaliacao, {
    limiteCocos: config?.limiteCocosChao ?? 19,
    limiteCachos: config?.limiteCachos3Cocos ?? 19,
  });

  if (nextStatus === avaliacao.status) {
    return avaliacao;
  }

  const nextAvaliacao: Avaliacao = {
    ...avaliacao,
    status: nextStatus,
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: avaliacao.versao + 1,
  };
  await saveEntity('avaliacoes', nextAvaliacao);
  return nextAvaliacao;
};

const sincronizarAtribuicoesRetoque = async (input: {
  avaliacaoId: string;
  parcelaId?: string | null;
  parcelaCodigo?: string;
  equipeId?: string | null;
  equipeNome?: string;
  usuarioIds: string[];
  usuarioMap: Map<string, Colaborador>;
  atribuidoPor: string;
  atribuidoPorNome?: string;
}) => {
  const device = await getOrCreateDevice();
  const existentes = await repository.filter(
    'atribuicoesRetoque',
    (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
  );
  const desejados = new Set(input.usuarioIds);

  for (const existente of existentes) {
    if (desejados.has(existente.usuarioId)) {
      continue;
    }

    await saveEntity('atribuicoesRetoque', {
      ...existente,
      deletadoEm: nowIso(),
      atualizadoEm: nowIso(),
      syncStatus: 'pending_sync',
      versao: existente.versao + 1,
    });
  }

  const atualizadas: AtribuicaoRetoque[] = [];
  for (const usuarioId of input.usuarioIds) {
    const usuario = input.usuarioMap.get(usuarioId) || null;
    const existente = existentes.find((item) => item.usuarioId === usuarioId) || null;
    const payload = {
      avaliacaoId: input.avaliacaoId,
      parcelaId: input.parcelaId || null,
      parcelaCodigo: input.parcelaCodigo || '',
      equipeId: input.equipeId || null,
      equipeNome: input.equipeNome || '',
      usuarioId,
      usuarioNome: usuario?.nome || '',
      atribuidoPor: input.atribuidoPor,
      atribuidoPorNome: input.atribuidoPorNome || '',
    };

    if (existente) {
      const next: AtribuicaoRetoque = {
        ...existente,
        ...payload,
        atualizadoEm: nowIso(),
        syncStatus: 'pending_sync',
        versao: existente.versao + 1,
      };
      await saveEntity('atribuicoesRetoque', next);
      atualizadas.push(next);
      continue;
    }

    atualizadas.push(
      await createEntity('atribuicoesRetoque', device.id, payload),
    );
  }

  return atualizadas;
};

const registrarLogsParticipantes = async ({
  avaliacaoId,
  responsavelId,
  participanteIds,
  colaboradoresMap,
}: {
  avaliacaoId: string;
  responsavelId: string;
  participanteIds: string[];
  colaboradoresMap: Map<string, Colaborador>;
}) => {
  const responsavel = colaboradoresMap.get(responsavelId) || null;
  await criarLogAvaliacao({
    avaliacaoId,
    colaboradorId: responsavelId,
    acao: 'responsavel_vinculado',
    descricao: `Responsável principal definido: ${responsavel?.nome || 'Usuário'}.`,
  });

  for (const participanteId of participanteIds) {
    const participante = colaboradoresMap.get(participanteId) || null;
    await criarLogAvaliacao({
      avaliacaoId,
      colaboradorId: responsavelId,
      acao: 'ajudante_vinculado',
      descricao: `Ajudante ${participante?.nome || 'não identificado'} vinculado à avaliação.`,
    });
  }
};

export const criarAvaliacao = async (input: NovaAvaliacaoInput) => {
  if (!input.dataColheita) {
    throw new Error('Informe a data da coleta antes de iniciar a avaliação.');
  }

  if (!input.usuarioId) {
    throw new Error('Defina o responsável principal da avaliação.');
  }

  if (input.acompanhado && input.participanteIds.length === 0) {
    throw new Error('Selecione ao menos um ajudante para a avaliação acompanhada.');
  }

  const device = await getOrCreateDevice();
  const colaboradores = await repository.list('colaboradores');
  const colaboradoresMap = new Map(
    colaboradores.map((item) => [item.id, item]),
  );
  const responsavel = colaboradoresMap.get(input.usuarioId) || null;
  const permissionMatrix = await obterPermissoesPerfisConfiguradas();

  if (!canStartEvaluation(responsavel?.perfil, permissionMatrix)) {
    throw new Error('Seu perfil não possui liberação para iniciar avaliações.');
  }

  const equipePrincipal = resolveEquipePrincipal({
    equipeId: input.equipeId,
    equipeNome: input.equipeNome,
    planejamentoEquipes: input.planejamentoEquipes,
  });
  const inicioEm = nowIso();
  const avaliacao = await createEntity('avaliacoes', device.id, {
    usuarioId: input.usuarioId,
    dispositivoId: input.dispositivoId,
    dataAvaliacao: todayIso(),
    dataColheita: input.dataColheita,
    observacoes: input.observacoes,
    tipo: input.tipo || 'normal',
    avaliacaoOriginalId: input.avaliacaoOriginalId || null,
    equipeId: equipePrincipal.equipeId,
    equipeNome: equipePrincipal.equipeNome,
    responsavelPrincipalId: input.usuarioId,
    responsavelPrincipalNome: responsavel?.nome || '',
    inicioEm,
    fimEm: null,
    encerradoPorId: null,
    encerradoPorNome: '',
    marcadoRetoquePorId: null,
    marcadoRetoquePorNome: '',
    marcadoRetoqueEm: null,
    motivoRetoque: '',
    retoqueDesignadoParaId: null,
    retoqueDesignadoParaNome: '',
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

  await criarLogAvaliacao({
    avaliacaoId: avaliacao.id,
    colaboradorId: input.usuarioId,
    acao: 'avaliacao_iniciada',
    descricao: `Avaliação iniciada por ${responsavel?.primeiroNome || 'colaborador'}.`,
  });

  await registrarLogsParticipantes({
    avaliacaoId: avaliacao.id,
    responsavelId: input.usuarioId,
    participanteIds: input.participanteIds,
    colaboradoresMap,
  });

  const parcelasPlanejadasVinculadas = await vincularParcelasPlanejadasAvaliacao({
    parcelaPlanejadaIds: input.parcelaPlanejadaIds,
    avaliacaoId: avaliacao.id,
    status: 'em_andamento',
  });

  for (const parcelaPlanejada of parcelasPlanejadasVinculadas) {
    await criarLogAvaliacao({
      avaliacaoId: avaliacao.id,
      parcelaId: parcelaPlanejada.parcelaId || null,
      colaboradorId: input.usuarioId,
      acao: 'parcela_planejada_vinculada',
      descricao: `Parcela ${parcelaPlanejada.codigo} carregada do cadastro planejado para a avaliacao.`,
    });
  }

  return {
    avaliacao,
    participantes,
    parcelas,
    ruas,
    parcelasPlanejadas: parcelasPlanejadasVinculadas,
  };
};

export const criarRetoqueAvaliacao = async (input: {
  avaliacaoOriginalId: string;
  iniciadoPorId: string;
  responsavelId: string;
  participanteIds: string[];
  equipeId?: string | null;
  equipeNome?: string;
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
  const iniciadoPor = colaboradoresMap.get(input.iniciadoPorId) || null;
  const responsavelId =
    avaliacaoOriginal.retoqueDesignadoParaId ||
    input.responsavelId ||
    input.iniciadoPorId;
  const responsavel = validarExecutorRetoque(
    colaboradoresMap.get(responsavelId) || null,
    'executor do retoque',
  );
  const permissionMatrix = await obterPermissoesPerfisConfiguradas();

  if (!canStartRetoque(iniciadoPor?.perfil, permissionMatrix)) {
    throw new Error('Seu perfil não possui liberação para iniciar retoques.');
  }

  if (
    !canOperateAssignedRetoque({
      perfil: iniciadoPor?.perfil,
      usuarioId: input.iniciadoPorId,
      responsavelId,
      designadoParaId: avaliacaoOriginal.retoqueDesignadoParaId,
      designadoParaIds: avaliacaoOriginal.retoqueDesignadoParaIds,
      matrix: permissionMatrix,
    })
  ) {
    throw new Error(
      'Este retoque foi designado para outro colaborador. Apenas o designado, o fiscal chefe ou o administrador podem iniciar este fluxo.',
    );
  }

  const equipePrincipal = resolveEquipePrincipal({
    equipeId: input.equipeId || avaliacaoOriginal.equipeId,
    equipeNome: input.equipeNome || avaliacaoOriginal.equipeNome,
  });
  const inicioEm = nowIso();

  const avaliacao = await createEntity('avaliacoes', device.id, {
    usuarioId: responsavelId,
    dispositivoId: avaliacaoOriginal.dispositivoId,
    dataAvaliacao: todayIso(),
    dataColheita: avaliacaoOriginal.dataColheita || todayIso(),
    observacoes: '',
    status: 'in_progress',
    tipo: 'retoque',
    avaliacaoOriginalId: avaliacaoOriginal.id,
    equipeId: equipePrincipal.equipeId,
    equipeNome: equipePrincipal.equipeNome,
    responsavelPrincipalId: responsavelId,
    responsavelPrincipalNome: responsavel?.nome || '',
    inicioEm,
    fimEm: null,
    encerradoPorId: null,
    encerradoPorNome: '',
    marcadoRetoquePorId: avaliacaoOriginal.marcadoRetoquePorId || null,
    marcadoRetoquePorNome: avaliacaoOriginal.marcadoRetoquePorNome || '',
    marcadoRetoqueEm: avaliacaoOriginal.marcadoRetoqueEm || null,
    motivoRetoque: avaliacaoOriginal.motivoRetoque || '',
    retoqueDesignadoParaId: responsavelId,
    retoqueDesignadoParaNome: responsavel?.nome || '',
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
    responsavelId,
    participanteIds: input.participanteIds,
    colaboradoresMap,
  });

  const { parcelas, ruas } = await clonarPlanejamentoParaRetoque({
    avaliacaoId: avaliacao.id,
    avaliacaoOriginalId: avaliacaoOriginal.id,
    deviceId: device.id,
    dataAvaliacao: avaliacao.dataAvaliacao,
  });

  await criarLogAvaliacao({
    avaliacaoId: avaliacao.id,
    colaboradorId: input.iniciadoPorId,
    acao: 'retoque_iniciado',
    descricao: `Retoque aberto por ${iniciadoPor?.nome || 'Usuário'} para execução de ${responsavel?.nome || 'Usuário'} em ${inicioEm}.`,
  });
  await registrarLogsParticipantes({
    avaliacaoId: avaliacao.id,
    responsavelId,
    participanteIds: input.participanteIds,
    colaboradoresMap,
  });
  await createEntity('avaliacaoRetoques', device.id, {
    avaliacaoId: avaliacao.id,
    avaliacaoOriginalId: avaliacaoOriginal.id,
    responsavelId,
    responsavelNome: responsavel?.nome || '',
    responsavelMatricula: responsavel?.matricula || '',
    equipeId: equipePrincipal.equipeId,
    equipeNome: equipePrincipal.equipeNome,
    ajudanteIds: input.participanteIds,
    ajudanteNomes: input.participanteIds
      .map((item) => colaboradoresMap.get(item)?.nome || '')
      .filter(Boolean),
    quantidadeBags: 0,
    quantidadeCargas: 0,
    dataRetoque: '',
    dataInicio: inicioEm,
    dataFim: null,
    observacao: '',
    finalizadoPorId: null,
    finalizadoPorNome: '',
    status: 'em_retoque',
  });
  await saveEntity('avaliacoes', {
    ...avaliacaoOriginal,
    status: 'em_retoque',
    retoqueDesignadoParaId: responsavelId,
    retoqueDesignadoParaNome: responsavel?.nome || '',
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: avaliacaoOriginal.versao + 1,
  });
  await criarLogAvaliacao({
    avaliacaoId: avaliacaoOriginal.id,
    colaboradorId: input.iniciadoPorId,
    acao: 'retoque_aberto',
    descricao: `Retoque iniciado na avaliação original por ${iniciadoPor?.nome || 'Usuário'}. Executor designado: ${responsavel?.nome || 'Usuário'}. Equipe do retoque: ${equipePrincipal.equipeNome || 'Não informada'}.`,
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

  const responsavelId = input.responsavelId || avaliacao.usuarioId || input.usuarioId;
  const responsavel = colaboradoresMap.get(responsavelId) || null;
  const equipePrincipal = resolveEquipePrincipal({
    equipeId: input.equipeId || avaliacao.equipeId,
    equipeNome: input.equipeNome || avaliacao.equipeNome,
    planejamentoEquipes: input.planejamentoEquipes,
  });
  const dataAvaliacaoAtualizada =
    input.dataAvaliacao || avaliacao.dataAvaliacao || todayIso();
  const nextAvaliacao: Avaliacao = {
    ...avaliacao,
    usuarioId: responsavelId,
    dispositivoId: input.dispositivoId,
    dataAvaliacao: dataAvaliacaoAtualizada,
    dataColheita: input.dataColheita || avaliacao.dataColheita || todayIso(),
    observacoes: input.observacoes,
    equipeId: equipePrincipal.equipeId,
    equipeNome: equipePrincipal.equipeNome,
    responsavelPrincipalId: responsavelId,
    responsavelPrincipalNome: responsavel?.nome || '',
    alinhamentoTipo: input.alinhamentoTipo,
    ordemColeta: ORDEM_COLETA_FIXA,
    modoCalculo: input.modoCalculo || 'manual',
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: avaliacao.versao + 1,
  };

  await saveEntity('avaliacoes', nextAvaliacao);

  const participantesDesejados = Array.from(
    new Set([responsavelId, ...input.participanteIds].filter(Boolean)),
  );
  const participantesAtuaisPorColaborador = new Map(
    participantesAtuais.map((item) => [item.colaboradorId, item]),
  );

  for (const participanteAtual of participantesAtuais) {
    if (participantesDesejados.includes(participanteAtual.colaboradorId)) {
      continue;
    }

    await softDeleteAvaliacaoRecord('avaliacaoColaboradores', participanteAtual);
  }

  const participantes: AvaliacaoColaborador[] = [];
  for (const colaboradorId of participantesDesejados) {
    const colaborador = colaboradoresMap.get(colaboradorId) || null;
    const payload = {
      avaliacaoId: avaliacao.id,
      colaboradorId,
      papel:
        colaboradorId === responsavelId ? 'responsavel_principal' : 'ajudante',
      colaboradorNome: colaborador?.nome || '',
      colaboradorPrimeiroNome: colaborador?.primeiroNome || '',
      colaboradorMatricula: colaborador?.matricula || '',
      colaboradorPerfil: resolveColaboradorPerfil(colaborador),
    };
    const participanteAtual =
      participantesAtuaisPorColaborador.get(colaboradorId) || null;

    if (participanteAtual) {
      const nextParticipante: AvaliacaoColaborador = {
        ...participanteAtual,
        ...payload,
        atualizadoEm: nowIso(),
        syncStatus: 'pending_sync',
        versao: participanteAtual.versao + 1,
      };
      await saveEntity('avaliacaoColaboradores', nextParticipante);
      participantes.push(nextParticipante);
      continue;
    }

    participantes.push(
      await createEntity('avaliacaoColaboradores', device.id, payload),
    );
  }

  const parcelasPlanejadas = planejarParcelasAvaliacao({
    parcelas: input.parcelas,
    planejamentoEquipes: input.planejamentoEquipes,
    alinhamentoTipo: input.alinhamentoTipo,
    sentidoRuas: input.sentidoRuas,
  });
  const parcelasAtuaisPorParcelaId = new Map(
    parcelasAtuais.map((item) => [item.parcelaId, item]),
  );
  const ruasAtuaisPorParcelaAvaliacaoId = ruasAtuais.reduce<
    Map<string, AvaliacaoRua[]>
  >((acc, item) => {
    const current = acc.get(item.avaliacaoParcelaId) || [];
    current.push(item);
    acc.set(item.avaliacaoParcelaId, current);
    return acc;
  }, new Map());
  const registrosPorRuaId = registrosAtuais.reduce<Map<string, RegistroColeta[]>>(
    (acc, item) => {
      const current = acc.get(item.ruaId) || [];
      current.push(item);
      acc.set(item.ruaId, current);
      return acc;
    },
    new Map(),
  );

  const parcelasMantidas = new Set<string>();
  const parcelas: AvaliacaoParcela[] = [];
  const ruas: AvaliacaoRua[] = [];

  for (const parcelaPlanejada of parcelasPlanejadas) {
    const parcelaAtual =
      parcelasAtuaisPorParcelaId.get(parcelaPlanejada.parcelaId) || null;
    const siglasResumo = remapearSiglasResumoParcela(
      parcelaAtual?.siglasResumo || null,
      parcelaPlanejada.ruasProgramadas.map((item) => item.equipeNome),
    );

    let parcelaRecord: AvaliacaoParcela;
    if (parcelaAtual) {
      parcelasMantidas.add(parcelaAtual.id);
      parcelaRecord = {
        ...parcelaAtual,
        parcelaCodigo: parcelaPlanejada.parcelaCodigo,
        linhaInicial: parcelaPlanejada.linhaInicial,
        linhaFinal: parcelaPlanejada.linhaFinal,
        configuradaEm: nowIso(),
        faixasFalha: parcelaPlanejada.faixasFalha || [],
        siglasResumo,
        atualizadoEm: nowIso(),
        syncStatus: 'pending_sync',
        versao: parcelaAtual.versao + 1,
      };
      await saveEntity('avaliacaoParcelas', parcelaRecord);
    } else {
      parcelaRecord = await createEntity('avaliacaoParcelas', device.id, {
        avaliacaoId: avaliacao.id,
        parcelaId: parcelaPlanejada.parcelaId,
        parcelaCodigo: parcelaPlanejada.parcelaCodigo,
        linhaInicial: parcelaPlanejada.linhaInicial,
        linhaFinal: parcelaPlanejada.linhaFinal,
        configuradaEm: nowIso(),
        faixasFalha: parcelaPlanejada.faixasFalha || [],
        siglasResumo,
      });
    }

    parcelas.push(parcelaRecord);

    const ruasExistentes = [
      ...(parcelaAtual
        ? ruasAtuaisPorParcelaAvaliacaoId.get(parcelaAtual.id) || []
        : []),
    ].sort(
      (a, b) =>
        a.ruaNumero - b.ruaNumero ||
        a.linhaInicial - b.linhaInicial ||
        a.linhaFinal - b.linhaFinal,
    );
    const ruasExistentesPorFaixa = new Map(
      ruasExistentes.map((item) => [`${item.linhaInicial}:${item.linhaFinal}`, item]),
    );
    const ruasExistentesMantidas = new Set<string>();

    for (let index = 0; index < parcelaPlanejada.ruasProgramadas.length; index += 1) {
      const ruaPlanejada = parcelaPlanejada.ruasProgramadas[index];
      const ruaExata =
        ruasExistentesPorFaixa.get(
          `${ruaPlanejada.linhaInicial}:${ruaPlanejada.linhaFinal}`,
        ) || null;
      const ruaAtual =
        (ruaExata && !ruasExistentesMantidas.has(ruaExata.id) ? ruaExata : null) ||
        ruasExistentes.find(
          (item, itemIndex) =>
            itemIndex === index && !ruasExistentesMantidas.has(item.id),
        ) ||
        null;

      if (ruaAtual) {
        ruasExistentesMantidas.add(ruaAtual.id);
        const nextRua: AvaliacaoRua = {
          ...ruaAtual,
          parcelaId: parcelaPlanejada.parcelaId,
          dataAvaliacao: dataAvaliacaoAtualizada,
          avaliacaoParcelaId: parcelaRecord.id,
          ruaNumero: index + 1,
          linhaInicial: ruaPlanejada.linhaInicial,
          linhaFinal: ruaPlanejada.linhaFinal,
          alinhamentoTipo: ruaPlanejada.alinhamentoTipo,
          sentidoRuas: parcelaPlanejada.sentidoRuas,
          equipeId: ruaPlanejada.equipeId,
          equipeNome: ruaPlanejada.equipeNome,
          atualizadoEm: nowIso(),
          syncStatus: 'pending_sync',
          versao: ruaAtual.versao + 1,
        };
        await saveEntity('avaliacaoRuas', nextRua);
        ruas.push(nextRua);
        continue;
      }

      ruas.push(
        await createEntity('avaliacaoRuas', device.id, {
          avaliacaoId: avaliacao.id,
          parcelaId: parcelaPlanejada.parcelaId,
          dataAvaliacao: dataAvaliacaoAtualizada,
          avaliacaoParcelaId: parcelaRecord.id,
          ruaNumero: index + 1,
          linhaInicial: ruaPlanejada.linhaInicial,
          linhaFinal: ruaPlanejada.linhaFinal,
          alinhamentoTipo: ruaPlanejada.alinhamentoTipo,
          sentidoRuas: parcelaPlanejada.sentidoRuas,
          equipeId: ruaPlanejada.equipeId,
          equipeNome: ruaPlanejada.equipeNome,
          tipoFalha: null,
        }),
      );
    }

    for (const ruaExtra of ruasExistentes.filter(
      (item) => !ruasExistentesMantidas.has(item.id),
    )) {
      const registrosRua = registrosPorRuaId.get(ruaExtra.id) || [];
      for (const registro of registrosRua) {
        await softDeleteAvaliacaoRecord('registrosColeta', registro);
      }
      await softDeleteAvaliacaoRecord('avaliacaoRuas', ruaExtra);
    }
  }

  for (const parcelaAtual of parcelasAtuais) {
    if (parcelasMantidas.has(parcelaAtual.id)) {
      continue;
    }

    const ruasDaParcela =
      ruasAtuaisPorParcelaAvaliacaoId.get(parcelaAtual.id) || [];
    for (const rua of ruasDaParcela) {
      const registrosRua = registrosPorRuaId.get(rua.id) || [];
      for (const registro of registrosRua) {
        await softDeleteAvaliacaoRecord('registrosColeta', registro);
      }
      await softDeleteAvaliacaoRecord('avaliacaoRuas', rua);
    }
    await softDeleteAvaliacaoRecord('avaliacaoParcelas', parcelaAtual);
  }

  await recalcularResumoAvaliacao(avaliacao.id);
  const avaliacaoAtualizada =
    (await sincronizarStatusFinalAvaliacaoAposEdicao(avaliacao.id)) ||
    (await repository.get('avaliacoes', avaliacao.id)) ||
    nextAvaliacao;
  await criarLogAvaliacao({
    avaliacaoId: avaliacao.id,
    colaboradorId: responsavelId,
    acao: 'avaliacao_configuracao_editada',
    descricao:
      'Configuracao da avaliacao atualizada com preservacao dos registros existentes sempre que a parcela e a rua permaneceram ativas.',
  });

  return {
    avaliacao: avaliacaoAtualizada,
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
    parcelasPlanejadas,
    atribuicoesRetoque,
    avaliacoesBase,
    participantesBase,
    logsBase,
    retoquesBase,
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
    listarParcelasPlanejadasPorAvaliacao(avaliacaoId),
    repository.filter(
      'atribuicoesRetoque',
      (item) => item.avaliacaoId === avaliacaoId && !item.deletadoEm,
    ),
    repository.list('avaliacoes'),
    repository.list('avaliacaoColaboradores'),
    repository.list('avaliacaoLogs'),
    repository.list('avaliacaoRetoques'),
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
  const avaliacaoOriginal = avaliacao.avaliacaoOriginalId
    ? avaliacoesBase.find(
        (item) => item.id === avaliacao.avaliacaoOriginalId && !item.deletadoEm,
      ) || null
    : null;
  const retoquesRelacionados = avaliacoesBase
    .filter(
      (item) =>
        !item.deletadoEm &&
        item.tipo === 'retoque' &&
        item.avaliacaoOriginalId ===
          (avaliacao.tipo === 'retoque'
            ? avaliacao.avaliacaoOriginalId
            : avaliacao.id),
    )
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    .map((item) => ({
      avaliacao: item,
      participantes: participantesBase
        .filter(
          (participante) =>
            !participante.deletadoEm && participante.avaliacaoId === item.id,
        )
        .map((participante) => ({
          ...participante,
          papel: normalizePapelAvaliacao(participante.papel),
          colaborador: colaboradoresMap.get(participante.colaboradorId) || null,
        })),
      logs: logsBase
        .filter((log) => !log.deletadoEm && log.avaliacaoId === item.id)
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
      detalheRetoque:
        retoquesBase.find(
          (registro) => !registro.deletadoEm && registro.avaliacaoId === item.id,
        ) || null,
    }));

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
      papel: normalizePapelAvaliacao(item.papel),
      colaborador: colaboradoresMap.get(item.colaboradorId) || null,
    })),
    logs: logs.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    retoque: retoques[0] || null,
    parcelasPlanejadas,
    atribuicoesRetoque,
    avaliacaoOriginal,
    retoquesRelacionados,
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
  await sincronizarStatusFinalAvaliacaoAposEdicao(input.avaliacaoId);
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
  await sincronizarStatusFinalAvaliacaoAposEdicao(input.avaliacaoId);
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
  await sincronizarStatusFinalAvaliacaoAposEdicao(input.avaliacaoId);
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

export const finalizarAvaliacao = async (
  avaliacaoId: string,
  finalizadoPorId?: string,
) => {
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
  const responsavel = participantes.find(
    (item) => normalizePapelAvaliacao(item.papel) === 'responsavel_principal',
  );
  if (!responsavel) {
    throw new Error('Defina um responsável antes de finalizar a avaliação.');
  }
  if (avaliacao.tipo === 'retoque' && !retoques[0]) {
    throw new Error('Informe os dados do retoque antes de finalizar.');
  }

  const config = configs[0];
  const limiteCocos = config?.limiteCocosChao ?? 19;
  const limiteCachos = config?.limiteCachos3Cocos ?? 19;
  const excedeuLimites =
    avaliacao.mediaParcela > limiteCocos || avaliacao.mediaCachos3 > limiteCachos;
  const finalizadorId = finalizadoPorId || responsavel?.colaboradorId || null;
  const finalizador = finalizadorId
    ? await repository.get('colaboradores', finalizadorId)
    : null;

  // Lógica de decisão: se a média de cocos no chão OU cachos com 3 for maior que o limite, marca como refazer
  const statusFinal =
    avaliacao.tipo === 'retoque'
      ? excedeuLimites
        ? 'refazer'
        : 'revisado'
      : excedeuLimites
        ? 'refazer'
        : 'ok';

  const next: Avaliacao = {
    ...avaliacao,
    status: statusFinal,
    fimEm: nowIso(),
    encerradoPorId: finalizadorId,
    encerradoPorNome: finalizador?.nome || '',
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: avaliacao.versao + 1,
  };

  await saveEntity('avaliacoes', next);
  const codigosParcelas = await listarCodigosParcelasDaAvaliacao(avaliacaoId);
  const parcelasPlanejadas = await listarParcelasPlanejadasPorAvaliacao(avaliacaoId);

  if (avaliacao.tipo !== 'retoque') {
    for (const parcelaPlanejada of parcelasPlanejadas) {
      await atualizarStatusParcelaPlanejada({
        parcelaPlanejadaId: parcelaPlanejada.id,
        status: 'concluida',
        avaliacaoId,
      });
    }

    if (statusFinal === 'refazer') {
      await notificarPossivelRetoque({
        avaliacaoId,
        codigo: codigosParcelas.join(', ') || avaliacao.parcelaCodigo || 'sem codigo',
        equipeId: avaliacao.equipeId || null,
      });
    }
  }

  if (avaliacao.tipo === 'retoque' && avaliacao.avaliacaoOriginalId) {
    const original = await repository.get('avaliacoes', avaliacao.avaliacaoOriginalId);
    if (original && !original.deletadoEm) {
      await saveEntity('avaliacoes', {
        ...original,
        status: statusFinal === 'revisado' ? 'revisado' : 'refazer',
        fimEm: next.fimEm,
        encerradoPorId: finalizadorId,
        encerradoPorNome: finalizador?.nome || '',
        atualizadoEm: nowIso(),
        syncStatus: 'pending_sync',
        versao: original.versao + 1,
      });
      await criarLogAvaliacao({
        avaliacaoId: original.id,
        colaboradorId: finalizadorId,
        acao: 'retoque_resultado_final',
        descricao:
          statusFinal === 'revisado'
            ? 'Retoque concluído com resultado revisado.'
            : 'Retoque concluído e a parcela continua necessitando ação.',
      });
      const parcelasPlanejadasOriginais = await listarParcelasPlanejadasPorAvaliacao(
        original.id,
      );
      for (const parcelaPlanejada of parcelasPlanejadasOriginais) {
        await atualizarStatusParcelaPlanejada({
          parcelaPlanejadaId: parcelaPlanejada.id,
          status: statusFinal === 'revisado' ? 'concluida' : 'em_retoque',
          avaliacaoId: original.id,
        });
      }
    }
  }

  await criarLogAvaliacao({
    avaliacaoId,
    colaboradorId: finalizadorId || responsavel.colaboradorId,
    acao: 'avaliacao_finalizada',
    descricao:
      next.status === 'refazer'
        ? 'Avaliação finalizada com retoque.'
        : 'Avaliação finalizada com status OK.',
  });

  return next;
};

export const marcarAvaliacaoParaRetoque = async (input: {
  avaliacaoId: string;
  usuarioId: string;
  designadoParaId?: string;
  designadoParaIds?: string[];
  equipeId?: string | null;
  motivo?: string;
}) => {
  const [avaliacao, usuario, colaboradores, permissionMatrix, parcelasAvaliacao] =
    await Promise.all([
      repository.get('avaliacoes', input.avaliacaoId),
      repository.get('colaboradores', input.usuarioId),
      repository.list('colaboradores'),
      obterPermissoesPerfisConfiguradas(),
      repository.filter(
        'avaliacaoParcelas',
        (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
      ),
    ]);

  if (!avaliacao || avaliacao.deletadoEm) {
    throw new Error('Avaliação não encontrada para marcação de retoque.');
  }

  if (avaliacao.tipo === 'retoque') {
    throw new Error('A avaliação de retoque não pode ser remarcada.');
  }

  if (!canMarkRetoque(usuario?.perfil, permissionMatrix)) {
    throw new Error('Seu perfil não pode marcar a parcela para retoque.');
  }

  const designadoIds = Array.from(
    new Set(
      [...(input.designadoParaIds || []), input.designadoParaId || '']
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );

  if (designadoIds.length === 0) {
    throw new Error('Selecione ao menos um colaborador para executar o retoque.');
  }

  const colaboradoresMap = new Map(
    colaboradores.map((item) => [item.id, item]),
  );
  const designados = designadoIds.map((colaboradorId) =>
    validarExecutorRetoque(
      colaboradoresMap.get(colaboradorId) || null,
      'colaborador designado para o retoque',
    ),
  );
  const designadoPara = designados[0] || null;
  const equipeRetoque = input.equipeId
    ? await repository.get('equipes', input.equipeId)
    : avaliacao.equipeId
      ? await repository.get('equipes', avaliacao.equipeId)
      : null;
  const equipeRetoqueId = input.equipeId || avaliacao.equipeId || null;
  const equipeRetoqueNome =
    equipeRetoque?.nome ||
    avaliacao.retoqueEquipeNome ||
    avaliacao.equipeNome ||
    '';
  const codigoParcelas =
    parcelasAvaliacao.map((item) => item.parcelaCodigo).join(', ') ||
    avaliacao.parcelaCodigo ||
    'Parcela';

  const next: Avaliacao = {
    ...avaliacao,
    status: 'em_retoque',
    marcadoRetoquePorId: input.usuarioId,
    marcadoRetoquePorNome: usuario?.nome || '',
    marcadoRetoqueEm: nowIso(),
    motivoRetoque: String(input.motivo || '').trim(),
    retoqueEquipeId: equipeRetoqueId,
    retoqueEquipeNome: equipeRetoqueNome,
    retoqueDesignadoParaId: designados[0]?.id || null,
    retoqueDesignadoParaNome: designados[0]?.nome || '',
    retoqueDesignadoParaIds: designados.map((item) => item.id),
    retoqueDesignadoParaNomes: designados.map((item) => item.nome),
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: avaliacao.versao + 1,
  };

  await saveEntity('avaliacoes', next);
  await sincronizarAtribuicoesRetoque({
    avaliacaoId: input.avaliacaoId,
    parcelaId: parcelasAvaliacao[0]?.parcelaId || null,
    parcelaCodigo: codigoParcelas,
    equipeId: equipeRetoqueId,
    equipeNome: equipeRetoqueNome,
    usuarioIds: designados.map((item) => item.id),
    usuarioMap: colaboradoresMap,
    atribuidoPor: input.usuarioId,
    atribuidoPorNome: usuario?.nome || '',
  });

  const parcelasPlanejadas = await listarParcelasPlanejadasPorAvaliacao(
    input.avaliacaoId,
  );
  for (const parcelaPlanejada of parcelasPlanejadas) {
    await atualizarStatusParcelaPlanejada({
      parcelaPlanejadaId: parcelaPlanejada.id,
      status: 'em_retoque',
      avaliacaoId: input.avaliacaoId,
    });
  }
  await criarLogAvaliacao({
    avaliacaoId: input.avaliacaoId,
    colaboradorId: input.usuarioId,
    acao: 'avaliacao_marcada_retoque',
    descricao: next.motivoRetoque
      ? `Parcela enviada para retoque por ${usuario?.nome || 'Usuário'}. Motivo: ${next.motivoRetoque}.`
      : `Parcela enviada para retoque por ${usuario?.nome || 'Usuário'}.`,
  });
  await criarLogAvaliacao({
    avaliacaoId: input.avaliacaoId,
    colaboradorId: input.usuarioId,
    acao: 'retoque_designado',
    descricao: `Fiscal responsável ${usuario?.nome || 'Usuário'} designou ${designadoPara.nome} para executar o retoque.`,
  });
  await criarLogAvaliacao({
    avaliacaoId: input.avaliacaoId,
    colaboradorId: input.usuarioId,
    acao: 'retoque_equipe_definida',
    descricao: `Fiscal responsavel ${usuario?.nome || 'Usuario'} definiu a equipe ${equipeRetoqueNome || 'nao informada'} para o retoque.`,
  });

  if (designados.length > 1) {
    await criarLogAvaliacao({
      avaliacaoId: input.avaliacaoId,
      colaboradorId: input.usuarioId,
      acao: 'retoque_designado',
      descricao: `Colaboradores designados para o retoque: ${formatarListaNomes(designados.map((item) => item.nome))}.`,
    });
  }

  await notificarRetoqueAtribuido({
    avaliacaoId: input.avaliacaoId,
    codigo: codigoParcelas,
    usuarioIds: designados.map((item) => item.id),
    equipeId: equipeRetoqueId,
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
  finalizadoPorId?: string;
}) => {
  const device = await getOrCreateDevice();
  const [avaliacao, colaboradores, participantes, permissionMatrix] = await Promise.all([
    repository.get('avaliacoes', input.avaliacaoId),
    repository.list('colaboradores'),
    repository.filter(
      'avaliacaoColaboradores',
      (item) => item.avaliacaoId === input.avaliacaoId && !item.deletadoEm,
    ),
    obterPermissoesPerfisConfiguradas(),
  ]);
  if (!avaliacao || avaliacao.deletadoEm) {
    throw new Error('Avaliação não encontrada para registrar o retoque.');
  }

  const isFluxoRetoqueLegado =
    avaliacao.tipo === 'retoque' && Boolean(avaliacao.avaliacaoOriginalId);
  if (!isFluxoRetoqueLegado && avaliacao.status !== 'em_retoque') {
    throw new Error('A avaliacao precisa estar marcada como em retoque antes do fechamento.');
  }

  const designadoIds = Array.from(
    new Set(
      (avaliacao.retoqueDesignadoParaIds ||
        [avaliacao.retoqueDesignadoParaId || ''])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );
  const responsavelId =
    String(input.responsavelId || '').trim() ||
    String(input.finalizadoPorId || '').trim() ||
    designadoIds[0] ||
    '';
  if (!responsavelId) {
    throw new Error('Defina quem executou o retoque.');
  }

  const responsavel = validarExecutorRetoque(
    colaboradores.find((item) => item.id === responsavelId) || null,
    'executor do retoque',
  );
  const finalizadorId = input.finalizadoPorId || responsavelId;
  const finalizador =
    colaboradores.find((item) => item.id === finalizadorId) || null;

  if (
    !canOperateAssignedRetoque({
      perfil: finalizador?.perfil,
      usuarioId: finalizadorId,
      responsavelId,
      designadoParaId: avaliacao.retoqueDesignadoParaId,
      designadoParaIds: designadoIds,
      matrix: permissionMatrix,
    })
  ) {
    throw new Error(
      'Este retoque foi designado para outro colaborador. Apenas o designado, o fiscal chefe ou o administrador podem informar sua execucao.',
    );
  }
  const existente = await repository.filter(
    'avaliacaoRetoques',
    (item) =>
      !item.deletadoEm &&
      (item.avaliacaoId === input.avaliacaoId ||
        (!isFluxoRetoqueLegado &&
          item.avaliacaoOriginalId === input.avaliacaoId)),
  );
  const ajudantes = isFluxoRetoqueLegado
    ? participantes.filter(
        (item) => normalizePapelAvaliacao(item.papel) === 'ajudante',
      )
    : designadoIds
        .filter((item) => item !== responsavelId)
        .map((colaboradorId) => ({
          colaboradorId,
          colaboradorNome:
            colaboradores.find((item) => item.id === colaboradorId)?.nome || '',
          colaboradorPrimeiroNome:
            colaboradores.find((item) => item.id === colaboradorId)?.primeiroNome ||
            '',
        }));
  const agora = nowIso();

  const payload = {
    avaliacaoId: input.avaliacaoId,
    avaliacaoOriginalId: isFluxoRetoqueLegado
      ? avaliacao.avaliacaoOriginalId || avaliacao.id
      : avaliacao.id,
    responsavelId,
    responsavelNome: responsavel?.nome || '',
    responsavelMatricula: responsavel?.matricula || '',
    equipeId: avaliacao.retoqueEquipeId || avaliacao.equipeId || null,
    equipeNome: avaliacao.retoqueEquipeNome || avaliacao.equipeNome || '',
    ajudanteIds: ajudantes.map((item) => item.colaboradorId),
    ajudanteNomes: ajudantes
      .map((item) => item.colaboradorNome || item.colaboradorPrimeiroNome || '')
      .filter(Boolean),
    quantidadeBags: Math.max(0, input.quantidadeBags),
    quantidadeCargas: Math.max(0, input.quantidadeCargas),
    dataRetoque: input.dataRetoque,
    dataInicio:
      existente[0]?.dataInicio ||
      (isFluxoRetoqueLegado
        ? avaliacao.inicioEm || agora
        : avaliacao.marcadoRetoqueEm || agora),
    dataFim: agora,
    observacao: input.observacao,
    finalizadoPorId: finalizadorId,
    finalizadoPorNome: finalizador?.nome || '',
    status: 'finalizado' as const,
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

  if (!isFluxoRetoqueLegado) {
    await saveEntity('avaliacoes', {
      ...avaliacao,
      status: 'revisado',
      atualizadoEm: agora,
      syncStatus: 'pending_sync',
      versao: avaliacao.versao + 1,
    });
    await criarLogAvaliacao({
      avaliacaoId: input.avaliacaoId,
      colaboradorId: finalizadorId,
      acao: 'retoque_resultado_final',
      descricao: 'Retoque informado e parcela marcada como revisada.',
    });

    const parcelasPlanejadas = await listarParcelasPlanejadasPorAvaliacao(
      input.avaliacaoId,
    );
    for (const parcelaPlanejada of parcelasPlanejadas) {
      await atualizarStatusParcelaPlanejada({
        parcelaPlanejadaId: parcelaPlanejada.id,
        status: 'concluida',
        avaliacaoId: input.avaliacaoId,
      });
    }
  }

  await criarLogAvaliacao({
    avaliacaoId: input.avaliacaoId,
    colaboradorId: finalizadorId,
    acao: 'retoque_quantidades_registradas',
    descricao: `Retoque informado para ${responsavel?.nome || 'Usuário'} com ${Math.max(0, input.quantidadeBags)} bag(s) e ${Math.max(0, input.quantidadeCargas)} carga(s).`,
  });

  await criarLogAvaliacao({
    avaliacaoId: input.avaliacaoId,
    colaboradorId: finalizadorId,
    acao: 'retoque_finalizado',
    descricao: `Retoque finalizado por ${payload.finalizadoPorNome || responsavel?.nome || 'Usuário'}. Executor registrado: ${responsavel?.nome || 'Usuário'}.`,
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
