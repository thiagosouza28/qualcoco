export type StoreName =
  | 'equipes'
  | 'colaboradores'
  | 'parcelas'
  | 'avaliacoes'
  | 'avaliacaoColaboradores'
  | 'avaliacaoParcelas'
  | 'avaliacaoRuas'
  | 'registrosColeta'
  | 'syncQueue'
  | 'syncLogs'
  | 'dispositivos'
  | 'tentativasLogin'
  | 'configuracoes';

export type SyncStatus = 'local' | 'pending_sync' | 'synced' | 'conflict' | 'error';
export type OrigemDado = 'local' | 'shared' | 'firebase';
export type TipoSync = 'firebase_push' | 'firebase_pull' | 'local_export' | 'local_import';

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
  authUserId?: string | null;
  authEmail?: string | null;
}

export interface Parcela extends BaseEntity {
  codigo: string;
  descricao: string;
  ativo: boolean;
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
  status: 'draft' | 'in_progress' | 'completed' | 'ok' | 'refazer';
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
  papel: 'responsavel' | 'participante';
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
