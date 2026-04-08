import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LayoutMobile } from '@/components/LayoutMobile';
import { CounterInput } from '@/components/CounterInput';
import { useCampoApp } from '@/core/AppProvider';
import { useAppUpdate } from '@/core/AppUpdateProvider';
import { getDeviceId } from '@/core/device';
import { canManageTeams, canManageUsers } from '@/core/permissions';
import { repository, saveEntity } from '@/core/repositories';
import { nowIso } from '@/core/date';
import type { Configuracao } from '@/core/types';
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

  const [limiteCocos, setLimiteCocos] = useState(19);
  const [limiteCachos, setLimiteCachos] = useState(19);

  const { data: config } = useQuery({
    queryKey: ['configuracoes', 'atual'],
    queryFn: async () => {
      const items = await repository.list('configuracoes');
      return (items[0] as Configuracao) || null;
    },
  });

  useEffect(() => {
    if (!config) return;
    setLimiteCocos(config.limiteCocosChao);
    setLimiteCachos(config.limiteCachos3Cocos);
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const deviceId = dispositivo?.id || getDeviceId();
      const existing = config || {
        id: 'default',
        localId: 'config:default',
        versao: 0,
        criadoEm: nowIso(),
        atualizadoEm: nowIso(),
        deletadoEm: null,
        syncStatus: 'pending_sync' as const,
        origemDispositivoId: deviceId,
      };

      const next: Configuracao = {
        ...(existing as Configuracao),
        limiteCocosChao: limiteCocos,
        limiteCachos3Cocos: limiteCachos,
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
        alert('Configurações salvas no aparelho. A sincronização será feita quando a internet voltar.');
        return;
      }

      try {
        const result = await sincronizarAgora();
        if (result?.erro) {
          alert(`Configurações salvas, mas a sincronização teve aviso: ${result.erro}`);
          return;
        }

        alert('Configurações salvas e sincronizadas com sucesso.');
      } catch (error) {
        alert(
          `Configurações salvas, mas a sincronização falhou: ${
            error instanceof Error ? error.message : 'erro desconhecido'
          }`,
        );
      }
    },
  });

  const handleUpdateAction = async () => {
    if (availableUpdate) {
      await openUpdate();
      return;
    }

    const result = await checkForUpdate();
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

  return (
    <LayoutMobile
      title="Configurações"
      subtitle="Limites usados para aprovação ou retoque da colheita"
      onBack={() => navigate('/dashboard')}
      contentClassName="overflow-x-hidden"
      showBottomNav
    >
      <div className="stack-lg min-w-0 overflow-x-hidden">
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
                Primeiro nome: {usuarioAtual?.primeiroNome || 'Não informado'}
              </p>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Matrícula:{' '}
                <span className="font-semibold text-[var(--qc-text)]">
                  {usuarioAtual?.matricula || 'Não informada'}
                </span>
              </p>
              <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Atualize aqui seu nome exibido e seu PIN de acesso. A matrícula
                permanece fixa.
              </p>
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

        <div className="stack-md pt-2">
          <Button
            size="lg"
            className="h-12 w-full rounded-[18px] text-base font-bold"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Salvando alterações' : 'Salvar'}
          </Button>

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
