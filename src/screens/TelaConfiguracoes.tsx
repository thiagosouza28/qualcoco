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
import {
  DEFAULT_LIMITES_CONFIGURACAO,
  buildDefaultConfiguracao,
} from '@/core/appConfig';
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
    refreshAndOpenUpdate,
  } = useAppUpdate();
  const {
    config,
    permissionMatrix,
    grantedPermissions,
  } = useRolePermissions(usuarioAtual?.perfil);

  const [limiteCocos, setLimiteCocos] = useState(19);
  const [limiteCachos, setLimiteCachos] = useState(19);
  const [cocosPorBag, setCocosPorBag] = useState(600);
  const [cargasPorBag, setCargasPorBag] = useState(6);
  const [perfilLiberacaoAtual, setPerfilLiberacaoAtual] =
    useState<PerfilConfiguravel>('colaborador');
  const [permissionDraft, setPermissionDraft] = useState<MatrizPermissoesPerfis>(
    DEFAULT_PERMISSOES_PERFIS,
  );

  useEffect(() => {
    if (!config) return;
    setCocosPorBag(config.cocosPorBag);
    setCargasPorBag(config.cargasPorBag);
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
        cocosPorBag,
        cargasPorBag,
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
        alert('Ajustes salvos no aparelho. A sincronização será feita quando a internet voltar.');
        return;
      }

      try {
        const result = await sincronizarAgora();
        if (result?.erro) {
          alert(`Ajustes salvos, mas a sincronização teve aviso: ${result.erro}`);
          return;
        }

        alert('Ajustes salvos e sincronizados com sucesso.');
      } catch (error) {
        alert(
          `Ajustes salvos, mas a sincronização falhou: ${
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

  const restaurarPadrao = () => {
    setCocosPorBag(DEFAULT_LIMITES_CONFIGURACAO.cocosPorBag);
    setCargasPorBag(DEFAULT_LIMITES_CONFIGURACAO.cargasPorBag);
    setLimiteCocos(DEFAULT_LIMITES_CONFIGURACAO.limiteCocosChao);
    setLimiteCachos(DEFAULT_LIMITES_CONFIGURACAO.limiteCachos3Cocos);
  };

  const handleUpdateAction = async () => {
    const result = await refreshAndOpenUpdate();

    if (result.status === 'available') {
      return;
    }

    if (result.status === 'up-to-date') {
      alert(`O app já está na versão mais recente (${result.currentVersion}).`);
      return;
    }

    if (result.status === 'not-configured') {
      alert('Canal de atualização externa ainda não configurado.');
      return;
    }

    if (result.status === 'error') {
      alert('Não foi possível verificar atualização agora. Tente novamente em instantes.');
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
      title="Configurações"
      subtitle="Funções, limites e acessos do aplicativo"
      onBack={() => navigate('/dashboard')}
      contentClassName="overflow-x-hidden"
      showBottomNav
    >
      <div className="stack-lg min-w-0 overflow-x-hidden">
        {podeEditarLimites ? (
          <>
            <Card className="surface-card border-none shadow-sm">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                    Producao e limites
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                    Valores aplicados nos calculos, alertas e relatorios.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-[16px] font-bold"
                  onClick={restaurarPadrao}
                >
                  Restaurar padrao
                </Button>
              </CardContent>
            </Card>

            <CounterInput
              label="Cocos por Bag"
              value={cocosPorBag}
              onChange={setCocosPorBag}
              color="slate"
              max={9999}
            />

            <CounterInput
              label="Cargas por Bag"
              value={cargasPorBag}
              onChange={setCargasPorBag}
              color="emerald"
              min={1}
              max={999}
            />
            <CounterInput
              label="Limite - Cocos no Chão"
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
                <div className="flex min-h-[124px] flex-col justify-between rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Cocos por bag
                  </p>
                  <p className="mt-3 text-[clamp(2.4rem,8vw,3.4rem)] font-black leading-none tracking-[-0.06em] text-[var(--qc-text)]">
                    {cocosPorBag}
                  </p>
                </div>
                <div className="flex min-h-[124px] flex-col justify-between rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Cargas por bag
                  </p>
                  <p className="mt-3 text-[clamp(2.4rem,8vw,3.4rem)] font-black leading-none tracking-[-0.06em] text-[var(--qc-text)]">
                    {cargasPorBag}
                  </p>
                </div>
                <div className="flex min-h-[124px] flex-col justify-between rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Cocos no chão
                  </p>
                  <p className="mt-3 text-[clamp(2.4rem,8vw,3.4rem)] font-black leading-none tracking-[-0.06em] text-[var(--qc-text)]">
                    {limiteCocos}
                  </p>
                </div>
                <div className="flex min-h-[124px] flex-col justify-between rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                    Cachos com 3 cocos
                  </p>
                  <p className="mt-3 text-[clamp(2.4rem,8vw,3.4rem)] font-black leading-none tracking-[-0.06em] text-[var(--qc-text)]">
                    {limiteCachos}
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Esses limites estão visíveis para consulta, mas a alteração só aparece quando o administrador libera essa função para o seu perfil.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-4">
            <p className="break-words text-sm leading-relaxed text-[var(--qc-text-muted)]">
              Se a média ultrapassar qualquer limite configurado, a parcela será
              marcada como <span className="font-bold text-[var(--qc-danger)]">Retoque</span>.
              Os mesmos limites também destacam em verde as células do relatório
              quando uma métrica ultrapassa o valor configurado.
            </p>
          </CardContent>
        </Card>

        {nativeAndroid ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-[var(--qc-text)]">
                  Atualização do aplicativo
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Versão instalada:{' '}
                  <span className="font-semibold text-[var(--qc-text)]">
                    {currentVersion || 'Carregando versão'}
                  </span>
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  {updatingApp
                    ? updateProgressPercent != null
                      ? `Baixando atualização internamente (${updateProgressPercent}%)`
                      : 'Baixando atualização internamente'
                    : installReadyForAvailableUpdate
                      ? `A atualização ${availableUpdate?.latestVersion || ''} já foi preparada. Toque abaixo para reabrir o instalador do Android.`
                      : availableUpdate
                        ? `Nova versão ${availableUpdate.latestVersion} disponível para instalação.`
                        : manifestConfigured
                          ? 'Quando houver nova versão, o app fará o download interno do APK e abrirá o instalador do Android.'
                          : 'Canal de atualização externa ainda não configurado.'}
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
                  ? 'Verificando atualização'
                  : updatingApp
                    ? updateProgressPercent != null
                      ? `Baixando ${updateProgressPercent}%`
                      : 'Preparando atualização'
                    : installReadyForAvailableUpdate
                      ? 'Abrir instalador novamente'
                      : availableUpdate
                        ? `Atualizar para ${availableUpdate.latestVersion}`
                        : 'Verificar atualização'}
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
                  {usuarioAtual?.nome || 'Usuário atual'}
                </span>
              </p>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Perfil: {PERFIL_LABEL[usuarioAtual?.perfil || 'colaborador']}
              </p>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Matrícula:{' '}
                <span className="font-semibold text-[var(--qc-text)]">
                  {usuarioAtual?.matricula || 'Não informada'}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                Funções liberadas para o seu perfil
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
                    Nenhuma liberação operacional adicional neste perfil.
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
                onClick={() =>
                  navigate('/colaboradores/cadastro?returnTo=%2Fconfiguracoes')
                }
              >
                Cadastrar usuário
              </Button>
            ) : null}

            {canManageUsers(usuarioAtual?.perfil) ? (
              <Button
                variant="outline"
                className="h-11 w-full rounded-[18px] font-bold"
                onClick={() => navigate('/colaboradores')}
              >
                Gerenciar usuários
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
                  Liberação por perfil
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  O administrador define quais funções cada perfil visualiza e executa. O perfil administrador permanece com acesso total.
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
                A liberação de campos e funções por perfil é feita exclusivamente pelo administrador.
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
            Encerrar sessão
          </Button>
        </div>
      </div>
    </LayoutMobile>
  );
}
