import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LayoutMobile } from '@/components/LayoutMobile';
import { CounterInput } from '@/components/CounterInput';
import { useCampoApp } from '@/core/AppProvider';
import { useAppUpdate } from '@/core/AppUpdateProvider';
import { getDeviceId } from '@/core/device';
import {
  canEditOperationalSettings,
  canManageTeams,
  canManageUsers,
  DEFAULT_PERMISSOES_PERFIS,
  PERFIL_LABEL,
  PERFIS_CONFIGURAVEIS,
  PERMISSAO_PERFIL_DEFINITIONS,
  normalizePermissoesPerfisConfig,
} from '@/core/permissions';
import { saveEntity } from '@/core/repositories';
import { nowIso } from '@/core/date';
import { buildDefaultConfiguracao } from '@/core/appConfig';
import type {
  Configuracao,
  PerfilConfiguravel,
  MatrizPermissoesPerfis,
} from '@/core/types';
import { useRolePermissions } from '@/core/useRolePermissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function TelaConfiguracoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { logout, usuarioAtual, dispositivo, online, sincronizarAgora } = useCampoApp();
  const {
    nativeAndroid,
    manifestConfigured,
    currentVersion,
    checkingUpdate,
    updatingApp,
    updateProgressPercent,
    updateMessage,
    availableUpdate,
    installReadyForAvailableUpdate,
    checkForUpdate,
    openUpdate,
  } = useAppUpdate();
  const {
    config,
    permissionMatrix,
    grantedPermissions,
  } = useRolePermissions(usuarioAtual?.perfil);

  const [limiteCocos, setLimiteCocos] = useState(19);
  const [limiteCachos, setLimiteCachos] = useState(19);
  const [perfilLiberacaoAtual, setPerfilLiberacaoAtual] =
    useState<PerfilConfiguravel>('colaborador');
  const [permissionDraft, setPermissionDraft] = useState<MatrizPermissoesPerfis>(
    DEFAULT_PERMISSOES_PERFIS,
  );

  useEffect(() => {
    if (!config) return;
    setLimiteCocos(config.limiteCocosChao);
    setLimiteCachos(config.limiteCachos3Cocos);
    setPermissionDraft(normalizePermissoesPerfisConfig(config.permissoesPerfis));
  }, [config]);

  const podeEditarLimites = canEditOperationalSettings(
    usuarioAtual?.perfil,
    permissionMatrix,
  );
  const podeGerenciarPermissoes = canManageUsers(usuarioAtual?.perfil);
  const podeSalvarAjustesGlobais = podeEditarLimites || podeGerenciarPermissoes;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const deviceId = dispositivo?.id || getDeviceId();
      const existing = (config as Configuracao | null) || buildDefaultConfiguracao(deviceId);

      const next: Configuracao = {
        ...existing,
        limiteCocosChao: limiteCocos,
        limiteCachos3Cocos: limiteCachos,
        permissoesPerfis: podeGerenciarPermissoes
          ? normalizePermissoesPerfisConfig(permissionDraft)
          : normalizePermissoesPerfisConfig(existing.permissoesPerfis),
        atualizadoEm: nowIso(),
        syncStatus: 'pending_sync',
        versao: (existing.versao || 0) + 1,
        origemDispositivoId:
          existing.origemDispositivoId && existing.origemDispositivoId !== 'system'
            ? existing.origemDispositivoId
            : deviceId,
      };

      return saveEntity('configuracoes', next);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['configuracoes'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['relatorio'] }),
      ]);

      if (!online) {
        alert('Ajustes salvos no aparelho. A sincronizacao sera feita quando a internet voltar.');
        return;
      }

      try {
        const result = await sincronizarAgora();
        if (result?.erro) {
          alert(`Ajustes salvos, mas a sincronizacao teve aviso: ${result.erro}`);
          return;
        }

        alert('Ajustes salvos e sincronizados com sucesso.');
      } catch (error) {
        alert(
          `Ajustes salvos, mas a sincronizacao falhou: ${
            error instanceof Error ? error.message : 'erro desconhecido'
          }`,
        );
      }
    },
  });

  const grantedPermissionLabels = useMemo(
    () => grantedPermissions.map((item) => item.label),
    [grantedPermissions],
  );

  const handleUpdateAction = async () => {
    if (availableUpdate) {
      await openUpdate();
      return;
    }

    const result = await checkForUpdate();
    if (result.status === 'up-to-date') {
      alert(`O app ja esta na versao mais recente (${result.currentVersion}).`);
      return;
    }

    if (result.status === 'not-configured') {
      alert('Canal de atualizacao externa ainda nao configurado.');
      return;
    }

    if (result.status === 'error') {
      alert('Nao foi possivel verificar atualizacao agora. Tente novamente em instantes.');
    }
  };

  const togglePermission = (
    perfil: PerfilConfiguravel,
    action: (typeof PERMISSAO_PERFIL_DEFINITIONS)[number]['key'],
  ) => {
    setPermissionDraft((current) => ({
      ...current,
      [perfil]: {
        ...current[perfil],
        [action]: !current[perfil][action],
      },
    }));
  };

  return (
    <LayoutMobile
      title="Configuracoes"
      subtitle="Funcoes, limites e acessos do aplicativo"
      onBack={() => navigate('/dashboard')}
      contentClassName="overflow-x-hidden"
      showBottomNav
    >
      <div className="stack-lg min-w-0 overflow-x-hidden">
        {podeEditarLimites ? (
          <>
            <CounterInput
              label="Limite - Cocos no Chao"
              value={limiteCocos}
              onChange={setLimiteCocos}
              color="amber"
            />

            <CounterInput
              label="Limite - Cachos com 3 Cocos"
              value={limiteCachos}
              onChange={setLimiteCachos}
              color="emerald"
            />
          </>
        ) : (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold text-[var(--qc-text)]">
                Limites operacionais
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Cocos no chao
                  </p>
                  <p className="mt-1 text-xl font-black text-[var(--qc-text)]">
                    {limiteCocos}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Cachos com 3 cocos
                  </p>
                  <p className="mt-1 text-xl font-black text-[var(--qc-text)]">
                    {limiteCachos}
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Esses limites estao visiveis para consulta, mas a alteracao so aparece quando o administrador libera essa funcao para o seu perfil.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-4">
            <p className="break-words text-sm leading-relaxed text-[var(--qc-text-muted)]">
              Se a media ultrapassar qualquer limite configurado, a parcela sera
              marcada como <span className="font-bold text-[var(--qc-danger)]">Retoque</span>.
              Os mesmos limites tambem destacam em verde as celulas do relatorio
              quando uma metrica ultrapassa o valor configurado.
            </p>
          </CardContent>
        </Card>

        {nativeAndroid ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-[var(--qc-text)]">
                  Atualizacao do aplicativo
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Versao instalada:{' '}
                  <span className="font-semibold text-[var(--qc-text)]">
                    {currentVersion || 'Carregando versao'}
                  </span>
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  {updatingApp
                    ? updateProgressPercent != null
                      ? `Baixando atualizacao internamente (${updateProgressPercent}%)`
                      : 'Baixando atualizacao internamente'
                    : installReadyForAvailableUpdate
                      ? `A atualizacao ${availableUpdate?.latestVersion || ''} ja foi preparada. Toque abaixo para reabrir o instalador do Android.`
                      : availableUpdate
                        ? `Nova versao ${availableUpdate.latestVersion} disponivel para instalacao.`
                        : manifestConfigured
                          ? 'Quando houver nova versao, o app fara o download interno do APK e abrira o instalador do Android.'
                          : 'Canal de atualizacao externa ainda nao configurado.'}
                </p>

                {updateMessage ? (
                  <p className="rounded-[18px] border border-[rgba(15,118,110,0.16)] bg-[rgba(240,253,250,0.92)] px-3 py-2 text-sm leading-relaxed text-[var(--qc-text)]">
                    {updateMessage}
                  </p>
                ) : null}
              </div>

              <Button
                variant={availableUpdate ? 'default' : 'outline'}
                className="h-11 w-full rounded-[18px] font-bold"
                onClick={() => {
                  void handleUpdateAction();
                }}
                disabled={checkingUpdate || updatingApp || !manifestConfigured}
              >
                {checkingUpdate
                  ? 'Verificando atualizacao'
                  : updatingApp
                    ? updateProgressPercent != null
                      ? `Baixando ${updateProgressPercent}%`
                      : 'Preparando atualizacao'
                    : installReadyForAvailableUpdate
                      ? 'Abrir instalador novamente'
                      : availableUpdate
                        ? `Atualizar para ${availableUpdate.latestVersion}`
                        : 'Verificar atualizacao'}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-[var(--qc-text)]">Meu perfil</p>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                <span className="font-semibold text-[var(--qc-text)]">
                  {usuarioAtual?.nome || 'Usuario atual'}
                </span>
              </p>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Perfil: {PERFIL_LABEL[usuarioAtual?.perfil || 'colaborador']}
              </p>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Matricula:{' '}
                <span className="font-semibold text-[var(--qc-text)]">
                  {usuarioAtual?.matricula || 'Nao informada'}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                Funcoes liberadas para o seu perfil
              </p>
              <div className="flex flex-wrap gap-2">
                {grantedPermissionLabels.length > 0 ? (
                  grantedPermissionLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex rounded-full border border-[rgba(0,107,68,0.14)] bg-[rgba(0,107,68,0.08)] px-3 py-1 text-[11px] font-bold text-[var(--qc-primary)]"
                    >
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-[var(--qc-text-muted)]">
                    Nenhuma liberacao operacional adicional neste perfil.
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              className="h-11 w-full rounded-[18px] font-bold"
              onClick={() => navigate('/perfil')}
              disabled={!usuarioAtual}
            >
              Editar meu perfil
            </Button>

            {canManageUsers(usuarioAtual?.perfil) ? (
              <Button
                variant="outline"
                className="h-11 w-full rounded-[18px] font-bold"
                onClick={() => navigate('/colaboradores')}
              >
                Gerenciar usuarios
              </Button>
            ) : null}

            {canManageTeams(usuarioAtual?.perfil) ? (
              <Button
                variant="outline"
                className="h-11 w-full rounded-[18px] font-bold"
                onClick={() => navigate('/equipes')}
              >
                Gerenciar equipes
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {podeGerenciarPermissoes ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-[var(--qc-text)]">
                  Liberacao por perfil
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  O administrador define quais funcoes cada perfil visualiza e executa. O perfil administrador permanece com acesso total.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PERFIS_CONFIGURAVEIS.map((perfil) => (
                  <Button
                    key={perfil}
                    type="button"
                    variant={perfilLiberacaoAtual === perfil ? 'default' : 'outline'}
                    className="h-11 rounded-[18px] font-bold"
                    onClick={() => setPerfilLiberacaoAtual(perfil)}
                  >
                    {PERFIL_LABEL[perfil]}
                  </Button>
                ))}
              </div>

              <div className="stack-sm">
                {PERMISSAO_PERFIL_DEFINITIONS.map((permission) => {
                  const enabled = permissionDraft[perfilLiberacaoAtual][permission.key];
                  return (
                    <div
                      key={permission.key}
                      className="rounded-[20px] border border-[var(--qc-border)] bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                            {permission.label}
                          </p>
                          <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                            {permission.description}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant={enabled ? 'default' : 'outline'}
                          className="h-10 min-w-[118px] rounded-[16px] font-bold"
                          onClick={() =>
                            togglePermission(perfilLiberacaoAtual, permission.key)
                          }
                        >
                          {enabled ? 'Liberado' : 'Bloqueado'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                A liberacao de campos e funcoes por perfil e feita exclusivamente pelo administrador.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="stack-md pt-2">
          {podeSalvarAjustesGlobais ? (
            <Button
              size="lg"
              className="h-12 w-full rounded-[18px] text-base font-bold"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Salvando ajustes' : 'Salvar ajustes globais'}
            </Button>
          ) : null}

          <Button
            variant="outline"
            className="h-11 w-full rounded-[18px] font-bold"
            onClick={logout}
          >
            Encerrar sessao
          </Button>
        </div>
      </div>
    </LayoutMobile>
  );
}
