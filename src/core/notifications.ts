import { nowIso } from '@/core/date';
import { getOrCreateDevice } from '@/core/device';
import {
  limparMarcacaoNotificacaoNativa,
  limparTodasNotificacoesNativas,
  publicarNotificacaoNativa,
} from '@/core/nativeNotifications';
import { createEntity, repository, saveEntity } from '@/core/repositories';
import { normalizePerfilUsuario } from '@/core/permissions';
import type {
  Colaborador,
  Equipe,
  Notificacao,
  PerfilUsuario,
} from '@/core/types';

const PERFIS_COM_ACESSO: PerfilUsuario[] = [
  'colaborador',
  'fiscal',
  'fiscal_chefe',
  'administrador',
];

const filtrarUsuariosAtivos = (usuarios: Colaborador[]) =>
  usuarios.filter((item) => item.ativo && !item.deletadoEm);

const formatarEquipeResumo = (
  equipe?: Pick<Equipe, 'numero' | 'nome'> | null,
  fallbackNome?: string | null,
) => {
  const numero =
    typeof equipe?.numero === 'number' ? String(equipe.numero).padStart(2, '0') : '';
  const nome = String(equipe?.nome || fallbackNome || '').trim();

  if (numero && nome) {
    return `${numero} - ${nome}`;
  }
  if (numero) {
    return numero;
  }
  return nome;
};

const resolverEquipeResumo = async (input: {
  equipeId?: string | null;
  equipeNome?: string | null;
}) => {
  if (input.equipeId) {
    const equipe = await repository.get('equipes', input.equipeId);
    const resumo = formatarEquipeResumo(equipe || null, input.equipeNome);
    if (resumo) {
      return `Equipe ${resumo}`;
    }
  }

  const fallback = String(input.equipeNome || '').trim();
  return fallback ? `Equipe ${fallback}` : '';
};

export const listarNotificacoesDoUsuario = async (
  usuarioId?: string,
  options: {
    unreadOnly?: boolean;
    limit?: number;
  } = {},
) => {
  if (!usuarioId) {
    return [];
  }

  const result = await repository.filter(
    'notificacoes',
    (item) =>
      item.usuarioId === usuarioId &&
      !item.deletadoEm &&
      (!options.unreadOnly || !item.lida),
  );

  const ordered = result.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return typeof options.limit === 'number'
    ? ordered.slice(0, Math.max(options.limit, 0))
    : ordered;
};

export const contarNotificacoesNaoLidas = async (usuarioId?: string) =>
  (await listarNotificacoesDoUsuario(usuarioId, { unreadOnly: true })).length;

export const marcarNotificacaoComoLida = async (
  notificacaoId: string,
  usuarioId?: string,
) => {
  const notificacao = await repository.get('notificacoes', notificacaoId);
  if (!notificacao || notificacao.deletadoEm) {
    return null;
  }

  if (usuarioId && notificacao.usuarioId !== usuarioId) {
    throw new Error('Esta notificacao nao pertence ao usuario informado.');
  }

  if (notificacao.lida) {
    return notificacao;
  }

  const next: Notificacao = {
    ...notificacao,
    lida: true,
    lidaEm: nowIso(),
    atualizadoEm: nowIso(),
    syncStatus: 'pending_sync',
    versao: notificacao.versao + 1,
  };
  await saveEntity('notificacoes', next);
  limparMarcacaoNotificacaoNativa(notificacao.id);
  return next;
};

export const marcarTodasNotificacoesComoLidas = async (usuarioId?: string) => {
  const notificacoes = await listarNotificacoesDoUsuario(usuarioId, {
    unreadOnly: true,
  });

  for (const notificacao of notificacoes) {
    await marcarNotificacaoComoLida(notificacao.id, usuarioId);
  }

  return notificacoes.length;
};

export const limparNotificacoesDoUsuario = async (usuarioId?: string) => {
  const notificacoes = await listarNotificacoesDoUsuario(usuarioId);
  const deletedAt = nowIso();

  for (const notificacao of notificacoes) {
    const next: Notificacao = {
      ...notificacao,
      lida: true,
      lidaEm: notificacao.lidaEm || deletedAt,
      deletadoEm: deletedAt,
      atualizadoEm: deletedAt,
      syncStatus: 'pending_sync',
      versao: notificacao.versao + 1,
    };
    await saveEntity('notificacoes', next);
    limparMarcacaoNotificacaoNativa(notificacao.id);
  }

  await limparTodasNotificacoesNativas();
  return notificacoes.length;
};

export const criarNotificacao = async (input: {
  usuarioId: string;
  tipo: Notificacao['tipo'];
  titulo: string;
  mensagem: string;
  referenciaId: string;
  referenciaTipo?: Notificacao['referenciaTipo'];
  acaoPath?: string | null;
  acaoLabel?: string | null;
  equipeId?: string | null;
}) => {
  const usuario = await repository.get('colaboradores', input.usuarioId);
  if (!usuario || usuario.deletadoEm || !usuario.ativo) {
    return null;
  }

  const device = await getOrCreateDevice();
  const created = await createEntity('notificacoes', device.id, {
    usuarioId: input.usuarioId,
    tipo: input.tipo,
    titulo: input.titulo.trim(),
    mensagem: input.mensagem.trim(),
    referenciaId: input.referenciaId,
    referenciaTipo: input.referenciaTipo || undefined,
    acaoPath: input.acaoPath || null,
    acaoLabel: input.acaoLabel || null,
    equipeId: input.equipeId || null,
    lida: false,
    lidaEm: null,
  });

  await publicarNotificacaoNativa(created);
  return created;
};

export const criarNotificacoesParaUsuarios = async (input: {
  usuarioIds: string[];
  tipo: Notificacao['tipo'];
  titulo: string;
  mensagem: string;
  referenciaId: string;
  referenciaTipo?: Notificacao['referenciaTipo'];
  acaoPath?: string | null;
  acaoLabel?: string | null;
  equipeId?: string | null;
}) => {
  const usuarioIds = Array.from(
    new Set(
      input.usuarioIds
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );

  const notificacoes: Notificacao[] = [];
  for (const usuarioId of usuarioIds) {
    const created = await criarNotificacao({
      ...input,
      usuarioId,
    });
    if (created) {
      notificacoes.push(created);
    }
  }

  return notificacoes;
};

export const listarUsuariosPorPerfil = async (
  perfil: PerfilUsuario,
  options: {
    equipeId?: string | null;
  } = {},
) => {
  const [usuarios, vinculos] = await Promise.all([
    repository.list('colaboradores'),
    repository.list('usuarioEquipes'),
  ]);
  const ativos = filtrarUsuariosAtivos(usuarios).filter(
    (item) => normalizePerfilUsuario(item.perfil) === perfil,
  );

  if (!options.equipeId) {
    return ativos;
  }

  const idsPermitidos = new Set(
    vinculos
      .filter(
        (item) =>
          !item.deletadoEm && item.equipeId === options.equipeId,
      )
      .map((item) => item.usuarioId),
  );

  return ativos.filter((item) => idsPermitidos.has(item.id));
};

export const listarUsuariosNotificaveis = async (options: {
  perfil?: PerfilUsuario;
  perfis?: PerfilUsuario[];
  equipeId?: string | null;
}) => {
  const perfis = Array.from(
    new Set(
      (options.perfis || (options.perfil ? [options.perfil] : PERFIS_COM_ACESSO)).filter(
        Boolean,
      ),
    ),
  );

  const grupos = await Promise.all(
    perfis.map((perfil) =>
      listarUsuariosPorPerfil(perfil, { equipeId: options.equipeId }),
    ),
  );

  return grupos.flat();
};

export const notificarNovaParcela = async (input: {
  parcelaPlanejadaId: string;
  codigo: string;
  equipeId?: string | null;
  equipeNome?: string | null;
}) => {
  const colaboradores = await listarUsuariosNotificaveis({
    perfil: 'colaborador',
  });
  const equipeResumo = await resolverEquipeResumo(input);

  return await criarNotificacoesParaUsuarios({
    usuarioIds: colaboradores.map((item) => item.id),
    tipo: 'nova_parcela',
    titulo: 'Nova parcela disponivel',
    mensagem: `Nova parcela disponivel: ${input.codigo}${equipeResumo ? ` - ${equipeResumo}` : ''}`,
    referenciaId: input.parcelaPlanejadaId,
    referenciaTipo: 'parcela_planejada',
    acaoPath: '/dashboard',
    acaoLabel: 'Abrir parcela',
    equipeId: input.equipeId || null,
  });
};

export const notificarPossivelRetoque = async (input: {
  avaliacaoId: string;
  codigo: string;
  equipeId?: string | null;
  equipeNome?: string | null;
}) => {
  const fiscais = await listarUsuariosNotificaveis({
    perfil: 'fiscal',
    equipeId: input.equipeId || null,
  });
  const equipeResumo = await resolverEquipeResumo(input);

  return await criarNotificacoesParaUsuarios({
    usuarioIds: fiscais.map((item) => item.id),
    tipo: 'possivel_retoque',
    titulo: 'Possivel retoque',
    mensagem: `Parcela ${input.codigo} pode precisar de retoque${equipeResumo ? ` - ${equipeResumo}` : ''}`,
    referenciaId: input.avaliacaoId,
    referenciaTipo: 'avaliacao',
    acaoPath: `/detalhe/${input.avaliacaoId}`,
    acaoLabel: 'Abrir avaliacao',
    equipeId: input.equipeId || null,
  });
};

export const notificarRetoqueAtribuido = async (input: {
  avaliacaoId: string;
  codigo: string;
  usuarioIds: string[];
  equipeId?: string | null;
  equipeNome?: string | null;
}) => {
  const equipeResumo = await resolverEquipeResumo(input);

  return await criarNotificacoesParaUsuarios({
    usuarioIds: input.usuarioIds,
    tipo: 'retoque_atribuido',
    titulo: 'Retoque atribuido',
    mensagem: `Voce foi designado para o retoque da parcela ${input.codigo}${
      equipeResumo ? ` - ${equipeResumo}` : ''
    }`,
    referenciaId: input.avaliacaoId,
    referenciaTipo: 'avaliacao',
    acaoPath: `/detalhe/${input.avaliacaoId}`,
    acaoLabel: 'Abrir retoque',
    equipeId: input.equipeId || null,
  });
};
