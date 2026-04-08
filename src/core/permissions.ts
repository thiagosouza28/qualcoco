import { repository } from '@/core/repositories';
import type {
  AvaliacaoColaborador,
  AvaliacaoRua,
  Colaborador,
  Configuracao,
  Equipe,
  MatrizPermissoesPerfis,
  MatrizPermissoesPerfisParcial,
  PapelAvaliacao,
  PerfilConfiguravel,
  PerfilUsuario,
  PermissoesPerfil,
  AcaoPermissaoPerfil,
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

export const PERFIS_CONFIGURAVEIS: PerfilConfiguravel[] = [
  'colaborador',
  'fiscal',
  'fiscal_chefe',
];

export const PERFIL_LABEL: Record<PerfilUsuario, string> = {
  colaborador: 'Colaborador',
  fiscal: 'Fiscal',
  fiscal_chefe: 'Fiscal chefe',
  administrador: 'Administrador',
};

export const PERMISSAO_PERFIL_DEFINITIONS: Array<{
  key: AcaoPermissaoPerfil;
  label: string;
  description: string;
}> = [
  {
    key: 'verHistorico',
    label: 'Histórico',
    description: 'Consulta avaliações já registradas e auditoria disponível.',
  },
  {
    key: 'verRelatorios',
    label: 'Relatórios',
    description: 'Abre relatórios e consolidados liberados para o perfil.',
  },
  {
    key: 'verSincronizacao',
    label: 'Sincronização',
    description: 'Acessa a tela de sincronização e troca local.',
  },
  {
    key: 'iniciarAvaliacao',
    label: 'Nova avaliação',
    description: 'Permite iniciar ou editar avaliações de campo.',
  },
  {
    key: 'editarAvaliacaoConcluida',
    label: 'Editar concluídas',
    description: 'Permite reabrir avaliações finalizadas para ajuste.',
  },
  {
    key: 'iniciarRetoque',
    label: 'Executar retoque',
    description: 'Permite iniciar e registrar fluxo de retoque.',
  },
  {
    key: 'marcarRetoque',
    label: 'Marcar retoque',
    description: 'Permite enviar parcela para retoque.',
  },
  {
    key: 'visaoTotal',
    label: 'Visão total',
    description: 'Libera acesso a registros de todas as equipes.',
  },
  {
    key: 'editarLimitesOperacionais',
    label: 'Editar limites',
    description: 'Permite alterar limites operacionais globais.',
  },
];

const criarPermissoesPerfil = (
  overrides: Partial<PermissoesPerfil>,
): PermissoesPerfil => ({
  verHistorico: true,
  verRelatorios: true,
  verSincronizacao: true,
  iniciarAvaliacao: false,
  editarAvaliacaoConcluida: false,
  iniciarRetoque: false,
  marcarRetoque: false,
  visaoTotal: false,
  editarLimitesOperacionais: false,
  ...overrides,
});

const PERMISSOES_ADMIN_TOTAL: PermissoesPerfil = criarPermissoesPerfil({
  iniciarAvaliacao: true,
  editarAvaliacaoConcluida: true,
  iniciarRetoque: true,
  marcarRetoque: true,
  visaoTotal: true,
  editarLimitesOperacionais: true,
});

export const DEFAULT_PERMISSOES_PERFIS: MatrizPermissoesPerfis = {
  colaborador: criarPermissoesPerfil({
    iniciarAvaliacao: true,
    editarAvaliacaoConcluida: true,
    iniciarRetoque: true,
  }),
  fiscal: criarPermissoesPerfil({}),
  fiscal_chefe: criarPermissoesPerfil({
    iniciarRetoque: true,
    marcarRetoque: true,
    visaoTotal: true,
  }),
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

export const normalizePermissoesPerfisConfig = (
  value?: MatrizPermissoesPerfisParcial | null,
): MatrizPermissoesPerfis => {
  return PERFIS_CONFIGURAVEIS.reduce<MatrizPermissoesPerfis>((acc, perfil) => {
    acc[perfil] = criarPermissoesPerfil({
      ...DEFAULT_PERMISSOES_PERFIS[perfil],
      ...(value?.[perfil] || {}),
    });
    return acc;
  }, {} as MatrizPermissoesPerfis);
};

export const obterPermissoesPerfisConfiguradas = async () => {
  const configuracoes = await repository.list('configuracoes');
  const config = (configuracoes[0] as Configuracao | undefined) || null;
  return normalizePermissoesPerfisConfig(config?.permissoesPerfis);
};

export const obterPermissoesPerfil = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
): PermissoesPerfil => {
  const normalized = normalizePerfilUsuario(perfil);
  if (normalized === 'administrador') {
    return PERMISSOES_ADMIN_TOTAL;
  }

  const resolvedMatrix = matrix || DEFAULT_PERMISSOES_PERFIS;
  return resolvedMatrix[normalized];
};

export const listarPermissoesLiberadas = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) =>
  PERMISSAO_PERFIL_DEFINITIONS.filter(
    (item) => obterPermissoesPerfil(perfil, matrix)[item.key],
  );

export const isAdministrador = (perfil?: string | null) =>
  normalizePerfilUsuario(perfil) === 'administrador';

export const isFiscal = (perfil?: string | null) =>
  normalizePerfilUsuario(perfil) === 'fiscal';

export const isFiscalChefe = (perfil?: string | null) =>
  normalizePerfilUsuario(perfil) === 'fiscal_chefe';

export const hasPermission = (
  perfil: string | null | undefined,
  action: AcaoPermissaoPerfil,
  matrix?: MatrizPermissoesPerfis,
) => obterPermissoesPerfil(perfil, matrix)[action];

export const hasVisaoTotal = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) =>
  isAdministrador(perfil) || hasPermission(perfil, 'visaoTotal', matrix);

export const canManageUsers = (perfil?: string | null) =>
  isAdministrador(perfil);

export const canManageTeams = (perfil?: string | null) =>
  isAdministrador(perfil);

export const canViewHistory = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => hasPermission(perfil, 'verHistorico', matrix);

export const canViewReports = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => hasPermission(perfil, 'verRelatorios', matrix);

export const canViewSync = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => hasPermission(perfil, 'verSincronizacao', matrix);

export const canEditOperationalSettings = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) =>
  isAdministrador(perfil) ||
  hasPermission(perfil, 'editarLimitesOperacionais', matrix);

export const canStartEvaluation = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => hasPermission(perfil, 'iniciarAvaliacao', matrix);

export const canEditCompletedEvaluation = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => hasPermission(perfil, 'editarAvaliacaoConcluida', matrix);

export const canMarkRetoque = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => hasPermission(perfil, 'marcarRetoque', matrix);

export const canStartRetoque = (
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => hasPermission(perfil, 'iniciarRetoque', matrix);

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

  const [usuario, equipeIds, permissionMatrix] = await Promise.all([
    repository.get('colaboradores', usuarioId),
    getUsuarioEquipeIds(usuarioId),
    obterPermissoesPerfisConfiguradas(),
  ]);
  const perfil = normalizePerfilUsuario(usuario?.perfil);

  return {
    usuario: usuario || null,
    perfil,
    equipeIds,
    visaoTotal: hasVisaoTotal(perfil, permissionMatrix),
  };
};

export const equipeEhAcessivelParaUsuario = (
  equipeId: string | null | undefined,
  equipeIdsUsuario: string[],
  perfil?: string | null,
  matrix?: MatrizPermissoesPerfis,
) => {
  if (hasVisaoTotal(perfil, matrix)) {
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
  const [source, permissionMatrix] = await Promise.all([
    equipes ? Promise.resolve(equipes) : repository.list('equipes'),
    obterPermissoesPerfisConfiguradas(),
  ]);
  const ativas = source.filter((item) => !item.deletadoEm && item.ativa);
  const perfil = normalizePerfilUsuario(usuario?.perfil);

  if (hasVisaoTotal(perfil, permissionMatrix)) {
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
