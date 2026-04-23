import { useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  History,
  Loader2,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  exportarPacoteSyncLocal,
  importarPacoteSyncLocal,
  limparHistoricoSincronizacao,
  obterDiagnosticoNuvem,
  type SyncExecutionResult,
} from '@/core/sync';
import { repository } from '@/core/repositories';
import { useCampoApp } from '@/core/AppProvider';
import { canViewSync } from '@/core/permissions';
import { useRolePermissions } from '@/core/useRolePermissions';
import { cn } from '@/utils';
import { formatDateTimeLabel } from '@/core/date';

const formatDurationLabel = (durationMs?: number | null) => {
  if (!durationMs || durationMs <= 0) {
    return '0s';
  }

  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
};

const formatProviderLabel = (mode?: string | null) => {
  if (mode === 'firebase') {
    return 'Firebase';
  }

  if (mode === 'invalid') {
    return 'Configuração inválida';
  }

  return 'Não configurado';
};

const formatSyncTypeLabel = (tipoSync: string) => {
  switch (tipoSync) {
    case 'firebase_push':
      return 'push do Firebase';
    case 'firebase_pull':
      return 'pull do Firebase';
    case 'local_export':
      return 'exportação local';
    case 'local_import':
      return 'importação local';
    default:
      return tipoSync.replace('_', ' ');
  }
};

export function TelaSincronizacao() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const {
    sincronizarAgora,
    sincronizando,
    pendenciasSync,
    online,
    syncProgress,
    usuarioAtual,
  } = useCampoApp();
  const { permissionMatrix } = useRolePermissions(usuarioAtual?.perfil);
  const [ultimoResultadoSync, setUltimoResultadoSync] =
    useState<SyncExecutionResult | null>(null);
  const [limpandoHistorico, setLimpandoHistorico] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ['sync', 'logs'],
    queryFn: () => repository.list('syncLogs'),
    refetchInterval: sincronizando ? 1200 : false,
    staleTime: sincronizando ? 0 : 15_000,
  });

  const {
    data: diagnostico,
    refetch: refetchDiagnostico,
    isFetching: testandoConexao,
  } = useQuery({
    queryKey: ['sync', 'diagnostico', online],
    queryFn: obterDiagnosticoNuvem,
    refetchInterval: false,
    staleTime: 30_000,
  });

  const sortedLogs = useMemo(
    () =>
      [...logs]
        .filter((item) => !item.deletadoEm)
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
        .slice(0, 15),
    [logs],
  );

  const ultimaSyncLabel = diagnostico?.lastSyncAt
    ? formatDateTimeLabel(diagnostico.lastSyncAt)
    : 'Nunca';

  if (!canViewSync(usuarioAtual?.perfil, permissionMatrix)) {
    return (
      <LayoutMobile
        title="Sincronização"
        subtitle="Acesso restrito"
        onBack={() => navigate(-1)}
      >
        <AccessDeniedCard description="A tela de sincronização só aparece quando essa operação está liberada para o seu perfil pelo administrador." />
      </LayoutMobile>
    );
  }

  const importarArquivo = async (file?: File | null) => {
    if (!file) return;

    try {
      const text = await file.text();
      await importarPacoteSyncLocal(text);
      await queryClient.invalidateQueries();
      alert('Pacote importado com sucesso.');
    } catch (error) {
      alert(
        'Falha ao importar pacote: ' +
          (error instanceof Error ? error.message : 'Erro desconhecido'),
      );
    }
  };

  const handleLimparHistorico = async () => {
    if (sortedLogs.length === 0 || limpandoHistorico) return;

    if (!window.confirm('Deseja limpar o histórico de sincronização deste aparelho?')) {
      return;
    }

    setLimpandoHistorico(true);

    try {
      const removidos = await limparHistoricoSincronizacao();
      await queryClient.invalidateQueries({ queryKey: ['sync', 'logs'] });

      if (removidos > 0) {
        alert('Histórico de sincronização limpo neste aparelho.');
      }
    } catch (error) {
      alert(
        'Não foi possível limpar o histórico: ' +
          (error instanceof Error ? error.message : 'Erro desconhecido'),
      );
    } finally {
      setLimpandoHistorico(false);
    }
  };

  return (
    <LayoutMobile
      title="Sincronização"
      subtitle="Gestão de dados offline e em nuvem"
      onBack={() => navigate(-1)}
    >
      <div className="stack-lg">
        <Card className="surface-card overflow-hidden border-none shadow-sm">
          <div className="flex items-center justify-between bg-[var(--qc-primary-strong)] px-6 py-5">
            <div className="flex items-center gap-3 text-white">
              <Cloud className="h-6 w-6 text-white/80" />
              <h2 className="text-lg font-black tracking-tight">Nuvem Firebase</h2>
            </div>
            <Badge
              className={cn(
                'border-none px-3 py-1 font-black text-white',
                online ? 'bg-[rgba(255,255,255,0.18)]' : 'bg-[rgba(197,58,53,0.84)]',
              )}
            >
              {online ? 'Online' : 'Offline'}
            </Badge>
          </div>

          <CardContent className="p-4">
            <div className="stack-md">
              <div className="flex items-center justify-between rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Pendências Locais
                  </span>
                  <p className="text-[2rem] font-black tracking-[-0.04em] text-[var(--qc-text)]">
                    {pendenciasSync}
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--qc-text-muted)]">
                  <Cloud className="h-6 w-6" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-[20px] border border-[var(--qc-border)] bg-white p-4">
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Banco Nuvem
                  </span>
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {diagnostico?.configured ? 'Configurado' : 'Não configurado'}
                  </p>
                </div>
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Provedor
                  </span>
                  <p className="text-sm font-bold uppercase text-[var(--qc-text)]">
                    {formatProviderLabel(diagnostico?.keyMode)}
                  </p>
                </div>
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Sessão
                  </span>
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {diagnostico?.authReady ? 'Pronta' : 'Pendente'}
                  </p>
                </div>
                <div className="stack-xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Última Sync
                  </span>
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    {ultimaSyncLabel}
                  </p>
                </div>
              </div>

              {diagnostico?.accessHint ? (
                <div className="rounded-[20px] border border-[rgba(197,58,53,0.18)] bg-[rgba(197,58,53,0.06)] p-4">
                  <p className="text-sm font-medium leading-relaxed text-[var(--qc-danger)]">
                    {diagnostico.accessHint}
                  </p>
                </div>
              ) : null}

              {diagnostico?.schemaWarnings?.length ? (
                <div className="rounded-[20px] border border-[var(--qc-border-strong)] bg-[var(--qc-tertiary)] p-4">
                  <p className="text-sm font-medium leading-relaxed text-[var(--qc-primary)]">
                    {diagnostico.schemaWarnings.join(' ')}
                  </p>
                </div>
              ) : null}

              {diagnostico?.lastSyncDetails ? (
                <div className="rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                    {diagnostico.lastSyncDetails}
                  </p>
                </div>
              ) : null}

              {syncProgress ? (
                <div className="rounded-[20px] border border-[var(--qc-border-strong)] bg-[rgba(210,231,211,0.28)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                        Progresso Atual
                      </span>
                      <p className="mt-2 text-base font-black leading-tight text-[var(--qc-text)]">
                        {syncProgress.label}
                      </p>
                      {syncProgress.currentStoreLabel ? (
                        <p className="mt-2 text-sm text-[var(--qc-text-muted)]">
                          Etapa: {syncProgress.currentStoreLabel}
                          {syncProgress.currentPage > 0
                            ? ` • página ${syncProgress.currentPage}`
                            : ''}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[2rem] font-black tracking-[-0.05em] text-[var(--qc-primary)]">
                        {syncProgress.percent}%
                      </p>
                      <p className="text-xs font-semibold text-[var(--qc-text-muted)]">
                        {formatDurationLabel(syncProgress.elapsedMs)} decorridos
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full bg-[var(--qc-primary)] transition-[width] duration-300"
                      style={{ width: `${syncProgress.percent}%` }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[20px] bg-white/72 p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                        Envio Local
                      </p>
                      <p className="mt-2 text-sm font-bold text-[var(--qc-text)]">
                        {syncProgress.pushCompleted}/{syncProgress.pushTotal}
                      </p>
                    </div>

                    <div className="rounded-[20px] bg-white/72 p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--qc-secondary)]">
                        Tabelas Web
                      </p>
                      <p className="mt-2 text-sm font-bold text-[var(--qc-text)]">
                        {syncProgress.pullCompleted}/{syncProgress.pullTotal}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-[var(--qc-text-muted)]">
                    <span>
                      Registros da etapa:{' '}
                      {syncProgress.storeRowsTotal > 0
                        ? `${syncProgress.storeRowsCompleted}/${syncProgress.storeRowsTotal}`
                        : 'aguardando'}
                    </span>
                    <span>
                      Restante:{' '}
                      {syncProgress.estimatedRemainingMs
                        ? formatDurationLabel(syncProgress.estimatedRemainingMs)
                        : 'calculando'}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-[18px] font-bold"
                  onClick={() => refetchDiagnostico()}
                  disabled={testandoConexao}
                >
                  {testandoConexao ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Testando conexão
                    </>
                  ) : (
                    <>
                      <Cloud className="h-5 w-5" />
                      Testar Conexão
                    </>
                  )}
                </Button>

                <Button
                  size="lg"
                  className="h-12 rounded-[18px] font-bold"
                  onClick={async () => {
                    const result = await sincronizarAgora();
                    setUltimoResultadoSync(result);
                    await refetchDiagnostico();
                  }}
                  disabled={sincronizando || !online}
                >
                  {sincronizando ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sincronizando {syncProgress?.percent ?? 0}%
                    </>
                  ) : (
                    <>
                      <Cloud className="h-5 w-5" />
                      Sincronizar Agora
                    </>
                  )}
                </Button>
              </div>

              {ultimoResultadoSync ? (
                <div className="rounded-[20px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <p className="text-sm font-bold text-[var(--qc-text)]">
                    Enviados: {ultimoResultadoSync.enviado} • Recebidos:{' '}
                    {ultimoResultadoSync.recebido} • Conflitos:{' '}
                    {ultimoResultadoSync.conflitos}
                  </p>
                  <p className="mt-2 text-sm text-[var(--qc-text-muted)]">
                    Duração: {formatDurationLabel(ultimoResultadoSync.duracaoMs)}
                  </p>
                  {ultimoResultadoSync.erro ? (
                    <p className="mt-2 text-sm leading-relaxed text-[var(--qc-danger)]">
                      {ultimoResultadoSync.erro}
                    </p>
                  ) : null}
                  {ultimoResultadoSync.avisos.length > 0 ? (
                    <p className="mt-2 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                      {ultimoResultadoSync.avisos.join(' ')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!online ? (
                <p className="text-center text-xs font-medium text-[var(--qc-danger)]">
                  Conecte-se à internet para sincronizar com a nuvem.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card overflow-hidden border-none shadow-sm">
          <div className="flex items-center gap-3 bg-[var(--qc-secondary)] px-4 py-4 text-white">
            <Share2 className="h-6 w-6 text-white/84" />
            <h2 className="text-lg font-black tracking-tight">Troca Local</h2>
          </div>

          <CardContent className="p-4">
            <div className="stack-md">
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Sem internet, gere um arquivo de sincronismo para transferir via
                Bluetooth, WhatsApp ou Nearby Share.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-[18px] font-bold"
                  onClick={() => exportarPacoteSyncLocal()}
                >
                  <Download className="h-4 w-4" />
                  Exportar
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-[18px] font-bold"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Importar
                </Button>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  void importarArquivo(event.target.files?.[0] || null)
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="stack-md">
          <div className="section-head items-center gap-3 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-xl font-black tracking-tight text-[var(--qc-text)]">
                Histórico de sincronização
              </h2>
              <History className="h-5 w-5 text-[rgba(93,98,78,0.42)]" />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-[16px] font-bold"
              onClick={() => {
                void handleLimparHistorico();
              }}
              disabled={sortedLogs.length === 0 || limpandoHistorico}
            >
              {limpandoHistorico ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Limpando histórico
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Limpar histórico
                </>
              )}
            </Button>
          </div>

          {sortedLogs.length === 0 ? (
            <Card className="surface-card border-none shadow-sm">
              <CardContent className="p-6 text-center">
                <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                  Nenhum log de sincronização registrado.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="stack-sm">
              {sortedLogs.map((log) => (
                <Card key={log.id} className="surface-card border-none shadow-sm">
                  <CardContent className="flex items-start gap-4 p-4">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        log.status === 'success'
                          ? 'bg-[var(--qc-tertiary)] text-[var(--qc-primary)]'
                          : 'bg-[rgba(197,58,53,0.1)] text-[var(--qc-danger)]',
                      )}
                    >
                      {log.status === 'success' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <AlertCircle className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-[var(--qc-text)]">
                          {formatSyncTypeLabel(log.tipoSync)}
                        </p>
                        <span className="text-[10px] font-medium text-[var(--qc-secondary)]">
                          {formatDateTimeLabel(log.criadoEm)}
                        </span>
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-[var(--qc-text-muted)]">
                        {log.detalhes}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </LayoutMobile>
  );
}
