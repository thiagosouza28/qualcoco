import { repository } from '@/core/repositories';
import type {
  AvaliacaoColaborador,
  AvaliacaoRua,
  Colaborador,
  Equipe,
  PapelAvaliacao,
  PerfilUsuario,
} from '@/core/types';

const PERFIL_ALIAS: Record<string, PerfilUsuario> = {
  admin: 'administrador',
  administrador: 'administrador',
  colaborador: 'colaborador',
  fiscal: 'fiscal',
  fiscal_chefe: 'fiscal_chefe',
  'fiscal chefe': 'fiscal_chefe',
  gestor: 'fiscal_chefe',
};

const PAPEL_ALIAS: Record<string, PapelAvaliacao> = {
  ajudante: 'ajudante',
  participante: 'ajudante',
  fiscal_revisor: 'fiscal_revisor',
  responsavel: 'responsavel_principal',
  responsavel_principal: 'responsavel_principal',
};

export const normalizePerfilUsuario = (
  value?: string | null,
): PerfilUsuario => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return PERFIL_ALIAS[normalized] || 'colaborador';
};

export const normalizePapelAvaliacao = (
  value?: string | null,
): PapelAvaliacao => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return PAPEL_ALIAS[normalized] || 'ajudante';
};

export const isAdministrador = (perfil?: string | null) =>
  normalizePerfilUsuario(perfil) === 'administrador';

export const isFiscal = (perfil?: string | null) =>
  normalizePerfilUsuario(perfil) === 'fiscal';

export const isFiscalChefe = (perfil?: string | null) =>
  normalizePerfilUsuario(perfil) === 'fiscal_chefe';

export const hasVisaoTotal = (perfil?: string | null) => {
  const normalized = normalizePerfilUsuario(perfil);
  return normalized === 'administrador' || normalized === 'fiscal_chefe';
};

export const canManageUsers = (perfil?: string | null) =>
  isAdministrador(perfil);

export const canManageTeams = (perfil?: string | null) =>
  isAdministrador(perfil);

export const canStartEvaluation = (perfil?: string | null) => {
  const normalized = normalizePerfilUsuario(perfil);
  return (
    normalized === 'colaborador' ||
    normalized === 'fiscal_chefe' ||
    normalized === 'administrador'
  );
};

export const canEditCompletedEvaluation = (perfil?: string | null) =>
  !isFiscal(perfil);

export const canMarkRetoque = (perfil?: string | null) =>
  isFiscalChefe(perfil) || isAdministrador(perfil);

export const canStartRetoque = (perfil?: string | null) => {
  const normalized = normalizePerfilUsuario(perfil);
  return (
    normalized === 'colaborador' ||
    normalized === 'fiscal_chefe' ||
    normalized === 'administrador'
  );
};

export const getUsuarioPerfil = async (usuarioId?: string) => {
  if (!usuarioId) return 'colaborador' as PerfilUsuario;
  const usuario = await repository.get('colaboradores', usuarioId);
  return normalizePerfilUsuario(usuario?.perfil);
};

export const getUsuarioEquipeIds = async (usuarioId?: string) => {
  if (!usuarioId) return [];

  const vinculos = await repository.filter(
    'usuarioEquipes',
    (item) => item.usuarioId === usuarioId && !item.deletadoEm,
  );

  return Array.from(new Set(vinculos.map((item) => item.equipeId))).filter(Boolean);
};

export const getUsuarioEquipes = async (usuarioId?: string) => {
  const [equipeIds, equipes] = await Promise.all([
    getUsuarioEquipeIds(usuarioId),
    repository.list('equipes'),
  ]);

  const equipeIdsSet = new Set(equipeIds);
  return equipes
    .filter((item) => !item.deletadoEm && equipeIdsSet.has(item.id))
    .sort((a, b) => a.numero - b.numero || a.nome.localeCompare(b.nome));
};

export const getAccessContext = async (usuarioId?: string) => {
  if (!usuarioId) {
    return {
      usuario: null,
      perfil: 'colaborador' as PerfilUsuario,
      equipeIds: [] as string[],
      visaoTotal: false,
    };
  }

  const [usuario, equipeIds] = await Promise.all([
    repository.get('colaboradores', usuarioId),
    getUsuarioEquipeIds(usuarioId),
  ]);
  const perfil = normalizePerfilUsuario(usuario?.perfil);

  return {
    usuario: usuario || null,
    perfil,
    equipeIds,
    visaoTotal: hasVisaoTotal(perfil),
  };
};

export const equipeEhAcessivelParaUsuario = (
  equipeId: string | null | undefined,
  equipeIdsUsuario: string[],
  perfil?: string | null,
) => {
  if (hasVisaoTotal(perfil)) {
    return true;
  }

  if (!equipeId) {
    return false;
  }

  return equipeIdsUsuario.includes(equipeId);
};

export const filtrarEquipesVisiveis = async (
  usuario?: Colaborador | null,
  equipes?: Equipe[],
) => {
  const source = equipes || (await repository.list('equipes'));
  const ativas = source.filter((item) => !item.deletadoEm && item.ativa);
  const perfil = normalizePerfilUsuario(usuario?.perfil);

  if (hasVisaoTotal(perfil)) {
    return ativas.sort((a, b) => a.numero - b.numero || a.nome.localeCompare(b.nome));
  }

  const equipeIds = await getUsuarioEquipeIds(usuario?.id);
  const equipeIdsSet = new Set(equipeIds);
  const filtradas = ativas.filter((item) => equipeIdsSet.has(item.id));

  return (filtradas.length > 0 ? filtradas : ativas).sort(
    (a, b) => a.numero - b.numero || a.nome.localeCompare(b.nome),
  );
};

export const colaboradorParticipaDaAvaliacao = (
  participantes: AvaliacaoColaborador[],
  colaboradorId?: string,
) =>
  Boolean(colaboradorId) &&
  participantes.some(
    (item) => !item.deletadoEm && item.colaboradorId === colaboradorId,
  );

export const avaliacaoPossuiEquipeAcessivel = (
  ruas: Array<Pick<AvaliacaoRua, 'equipeId'>>,
  equipeIdsUsuario: string[],
) =>
  ruas.some(
    (item) => Boolean(item.equipeId) && equipeIdsUsuario.includes(item.equipeId || ''),
  );
