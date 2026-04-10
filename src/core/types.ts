export type StoreName =
  | 'equipes'
  | 'colaboradores'
  | 'usuarioEquipes'
  | 'parcelas'
  | 'parcelasPlanejadas'
  | 'notificacoes'
  | 'atribuicoesRetoque'
  | 'avaliacoes'
  | 'avaliacaoColaboradores'
  | 'avaliacaoParcelas'
  | 'avaliacaoRuas'
  | 'avaliacaoRetoques'
  | 'avaliacaoLogs'
  | 'registrosColeta'
  | 'syncQueue'
  | 'syncLogs'
  | 'dispositivos'
  | 'tentativasLogin'
  | 'configuracoes';

export type SyncStatus = 'local' | 'pending_sync' | 'synced' | 'conflict' | 'error';
export type OrigemDado = 'local' | 'shared' | 'firebase';
export type TipoSync = 'firebase_push' | 'firebase_pull' | 'local_export' | 'local_import';
export type PerfilUsuario =
  | 'colaborador'
  | 'fiscal'
  | 'fiscal_chefe'
  | 'administrador';
export type PerfilConfiguravel = Exclude<PerfilUsuario, 'administrador'>;
export type AcaoPermissaoPerfil =
  | 'verHistorico'
  | 'verRelatorios'
  | 'verSincronizacao'
  | 'iniciarAvaliacao'
  | 'editarAvaliacaoConcluida'
  | 'iniciarRetoque'
  | 'marcarRetoque'
  | 'visaoTotal'
  | 'editarLimitesOperacionais';
export type PermissoesPerfil = Record<AcaoPermissaoPerfil, boolean>;
export type MatrizPermissoesPerfis = Record<
  PerfilConfiguravel,
  PermissoesPerfil
>;
export type MatrizPermissoesPerfisParcial = Partial<
  Record<PerfilConfiguravel, Partial<PermissoesPerfil>>
>;
export type PapelAvaliacao =
  | 'responsavel'
  | 'participante'
  | 'responsavel_principal'
  | 'ajudante'
  | 'fiscal_revisor';
export type StatusAvaliacao =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'ok'
  | 'refazer'
  | 'em_retoque'
  | 'revisado';

export interface BaseEntity {
  id: string;
  localId: string;
  criadoEm: string;
  atualizadoEm: string;
  deletadoEm: string | null;
  syncStatus: SyncStatus;
  versao: number;
  origemDispositivoId: string;
}

export interface Equipe extends BaseEntity {
  numero: number;
  nome: string;
  fiscal: string;
  ativa: boolean;
}

export interface Colaborador extends BaseEntity {
  nome: string;
  primeiroNome: string;
  matricula: string;
  pinHash: string;
  pinSalt: string;
  ativo: boolean;
  perfil?: PerfilUsuario;
  authUserId?: string | null;
  authEmail?: string | null;
}

export interface UsuarioEquipe extends BaseEntity {
  usuarioId: string;
  equipeId: string;
}

export interface Parcela extends BaseEntity {
  codigo: string;
  descricao: string;
  ativo: boolean;
}

export interface ParcelaPlanejada extends BaseEntity {
  codigo: string;
  equipeId: string | null;
  equipeNome: string;
  alinhamentoInicial: number;
  alinhamentoFinal: number;
  alinhamentoTipo?: 'inferior-impar' | 'inferior-par';
  dataColheita: string;
  observacao: string;
  criadoPor: string;
  criadoPorNome?: string;
  origem: 'fiscal' | 'colaborador';
  status: 'disponivel' | 'em_andamento' | 'em_retoque' | 'concluida';
  parcelaId?: string | null;
  avaliacaoId?: string | null;
}

export interface Notificacao extends BaseEntity {
  usuarioId: string;
  tipo: 'nova_parcela' | 'possivel_retoque' | 'retoque_atribuido';
  titulo: string;
  mensagem: string;
  referenciaId: string;
  referenciaTipo?: 'parcela_planejada' | 'avaliacao' | 'atribuicao_retoque';
  acaoPath?: string | null;
  acaoLabel?: string | null;
  equipeId?: string | null;
  lida: boolean;
  lidaEm?: string | null;
}

export interface AtribuicaoRetoque extends BaseEntity {
  avaliacaoId: string;
  parcelaId?: string | null;
  parcelaCodigo?: string;
  equipeId: string | null;
  equipeNome?: string;
  usuarioId: string;
  usuarioNome?: string;
  atribuidoPor: string;
  atribuidoPorNome?: string;
}

export interface Dispositivo extends BaseEntity {
  nomeDispositivo: string;
  identificadorLocal: string;
  ultimoSyncEm: string | null;
}

export interface Avaliacao extends BaseEntity {
  usuarioId: string;
  dispositivoId: string;
  dataAvaliacao: string;
  dataColheita?: string;
  observacoes: string;
  status: StatusAvaliacao;
  tipo?: 'normal' | 'retoque';
  avaliacaoOriginalId?: string | null;
  equipeId?: string | null;
  equipeNome?: string;
  responsavelPrincipalId?: string | null;
  responsavelPrincipalNome?: string;
  inicioEm?: string;
  fimEm?: string | null;
  encerradoPorId?: string | null;
  encerradoPorNome?: string;
  marcadoRetoquePorId?: string | null;
  marcadoRetoquePorNome?: string;
  marcadoRetoqueEm?: string | null;
  motivoRetoque?: string;
  retoqueEquipeId?: string | null;
  retoqueEquipeNome?: string;
  retoqueDesignadoParaId?: string | null;
  retoqueDesignadoParaNome?: string;
  retoqueDesignadoParaIds?: string[] | null;
  retoqueDesignadoParaNomes?: string[] | null;
  totalRegistros: number;
  mediaParcela: number;
  mediaCachos3: number;
  origemDado: OrigemDado;
  parcelaCodigo?: string;
  alinhamentoTipo?: string;
  ordemColeta?: OrdemColeta;
  modoCalculo?: ModoCalculo;
}

export interface AvaliacaoColaborador extends BaseEntity {
  avaliacaoId: string;
  colaboradorId: string;
  papel: PapelAvaliacao;
  colaboradorNome?: string;
  colaboradorPrimeiroNome?: string;
  colaboradorMatricula?: string;
  colaboradorPerfil?: PerfilUsuario;
}

export interface AvaliacaoRetoque extends BaseEntity {
  avaliacaoId: string;
  avaliacaoOriginalId: string;
  responsavelId: string;
  responsavelNome: string;
  responsavelMatricula: string;
  equipeId?: string | null;
  equipeNome?: string;
  ajudanteIds?: string[];
  ajudanteNomes?: string[];
  quantidadeBags: number;
  quantidadeCargas: number;
  dataRetoque: string;
  dataInicio?: string;
  dataFim?: string | null;
  observacao: string;
  finalizadoPorId?: string | null;
  finalizadoPorNome?: string;
  status?: 'em_retoque' | 'finalizado';
}

export interface AvaliacaoLog extends BaseEntity {
  avaliacaoId: string;
  parcelaId?: string | null;
  colaboradorId: string | null;
  usuarioNome?: string;
  usuarioPerfil?: PerfilUsuario;
  acao: string;
  descricao: string;
}

export interface AvaliacaoParcela extends BaseEntity {
  avaliacaoId: string;
  parcelaId: string;
  parcelaCodigo: string;
  linhaInicial: number;
  linhaFinal: number;
  configuradaEm: string;
  faixasFalha?: FaixaFalhaParcela[] | null;
  siglasResumo?: Partial<Record<string, SiglaResumoParcela>> | null;
}

export interface AvaliacaoRua extends BaseEntity {
  avaliacaoId: string;
  parcelaId: string;
  dataAvaliacao: string;
  avaliacaoParcelaId: string;
  ruaNumero: number;
  linhaInicial: number;
  linhaFinal: number;
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  sentidoRuas?: SentidoRuas;
  equipeId: string | null;
  equipeNome: string;
  tipoFalha?: TipoFalhaRua | null;
}

export interface RegistroColeta extends BaseEntity {
  avaliacaoId: string;
  parcelaId: string;
  ruaId: string;
  colaboradorId: string;
  quantidade: number;
  quantidadeCachos3: number;
  observacoes: string;
  registradoEm: string;
  dispositivoId: string;
}

export interface SyncQueueItem {
  id: string;
  entidade: StoreName;
  registroId: string;
  operacao: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  tentativas: number;
  status: 'pending' | 'processing' | 'error';
  ultimoErro?: string | null;
  origem: OrigemDado;
  criadoEm: string;
  atualizadoEm: string;
}

export interface SyncLog extends BaseEntity {
  dispositivoId: string;
  tipoSync: TipoSync;
  status: 'success' | 'warning' | 'error';
  detalhes: string;
  enviado: number;
  recebido: number;
}

export interface TentativaLogin extends BaseEntity {
  colaboradorId: string | null;
  identificadorInformado: string;
  sucesso: boolean;
  motivo: string;
  dispositivoId: string;
}

export interface Configuracao extends BaseEntity {
  limiteCocosChao: number;
  limiteCachos3Cocos: number;
  permissoesPerfis?: MatrizPermissoesPerfisParcial | null;
}

export type SentidoRuas = 'inicio' | 'fim';
export type OrdemColeta = 'padrao' | 'invertido';
export type ModoCalculo = 'manual' | 'media_vizinhas';
export type TipoFalhaRua = 'rua_com_falha' | 'linha_invalida';
export type SiglaResumoParcela =
  | 'A.C.R'
  | 'A.N.C.R'
  | 'A.C.N.R'
  | 'A.N.C.N.R';

export interface SessaoCampo {
  colaboradorId: string;
  ultimoAcessoEm: string;
  iniciadoEm: string;
  equipeDiaId?: string | null;
  equipeDiaNome?: string;
}

export interface ParcelaConfigurada {
  parcelaId: string;
  parcelaCodigo: string;
  linhaInicial: number;
  linhaFinal: number;
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  sentidoRuas: SentidoRuas;
  faixasFalha?: FaixaFalhaParcela[] | null;
}

export interface FaixaFalhaParcela {
  linhaInicial: number;
  linhaFinal: number;
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
}

export interface PlanejamentoEquipeInput {
  equipeId: string;
  equipeNome: string;
  ordem: number;
  linhaInicio: number | null;
  linhaFim: number | null;
  totalRuas: number;
  ruasPorParcela?: Record<string, number>;
}

export interface NovaAvaliacaoInput {
  usuarioId: string;
  dispositivoId: string;
  dataColheita: string;
  observacoes: string;
  participanteIds: string[];
  parcelaPlanejadaIds?: string[];
  acompanhado?: boolean;
  tipo?: 'normal' | 'retoque';
  avaliacaoOriginalId?: string | null;
  equipeId?: string | null;
  equipeNome?: string;
  parcelas: ParcelaConfigurada[];
  planejamentoEquipes: PlanejamentoEquipeInput[];
  alinhamentoTipo: 'inferior-impar' | 'inferior-par';
  sentidoRuas: SentidoRuas;
  ordemColeta?: OrdemColeta;
  modoCalculo?: ModoCalculo;
}

export interface FiltrosHistorico {
  colaboradorId?: string;
  data?: string;
  parcelaId?: string;
  syncStatus?: SyncStatus | 'all';
}

export interface PacoteSyncLocal {
  id: string;
  criadoEm: string;
  origemDispositivoId: string;
  origemNomeDispositivo: string;
  entidades: Partial<Record<StoreName, Record<string, unknown>[]>>;
}
