import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCheck, ChevronRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCampoApp } from '@/core/AppProvider';
import {
  limparNotificacoesDoUsuario,
  listarNotificacoesDoUsuario,
  marcarNotificacaoComoLida,
  marcarTodasNotificacoesComoLidas,
} from '@/core/notifications';

export function TelaNotificacoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();

  const { data: notificacoes = [] } = useQuery({
    queryKey: ['notificacoes', usuarioAtual?.id],
    queryFn: () => listarNotificacoesDoUsuario(usuarioAtual?.id),
    enabled: Boolean(usuarioAtual?.id),
  });

  const marcarTodasMutation = useMutation({
    mutationFn: () => marcarTodasNotificacoesComoLidas(usuarioAtual?.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
    },
  });

  const limparTodasMutation = useMutation({
    mutationFn: () => limparNotificacoesDoUsuario(usuarioAtual?.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
    },
  });

  const abrirNotificacaoMutation = useMutation({
    mutationFn: async (notificacaoId: string) =>
      marcarNotificacaoComoLida(notificacaoId, usuarioAtual?.id),
    onSuccess: async (notificacao) => {
      await queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
      if (notificacao?.acaoPath) {
        navigate(notificacao.acaoPath);
      }
    },
  });

  const naoLidas = notificacoes.filter((item) => !item.lida).length;

  return (
    <LayoutMobile
      title="Notificações"
      subtitle={
        naoLidas > 0
          ? `${naoLidas} pendente(s) para você`
          : 'Histórico de alertas e atribuições'
      }
      onBack={() => navigate(-1)}
      showBottomNav
      action={
        notificacoes.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => marcarTodasMutation.mutate()}
              disabled={marcarTodasMutation.isPending || naoLidas === 0}
            >
              <CheckCheck className="h-4 w-4" />
              Ler tudo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                if (confirm('Limpar todas as notificações desta lista?')) {
                  limparTodasMutation.mutate();
                }
              }}
              disabled={limparTodasMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        ) : null
      }
    >
      <div className="stack-lg pb-24">
        {notificacoes.length === 0 ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-[var(--qc-border)] bg-white text-[var(--qc-secondary)]">
                <Bell className="h-9 w-9" />
              </div>
              <div className="stack-xs">
                <p className="text-lg font-black tracking-tight text-[var(--qc-text)]">
                  Nenhuma notificação por enquanto
                </p>
                <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Quando houver nova parcela, alerta de retoque ou atribuição, ela aparecerá aqui.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          notificacoes.map((notificacao) => (
            <button
              key={notificacao.id}
              type="button"
              className="w-full text-left"
              onClick={() => abrirNotificacaoMutation.mutate(notificacao.id)}
            >
              <Card className="surface-card border-none shadow-sm active:scale-[0.99]">
                <CardContent className="flex items-start gap-4 p-4">
                  <div
                    className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${
                      notificacao.lida
                        ? 'bg-[rgba(210,231,211,0.36)] text-[var(--qc-secondary)]'
                        : 'bg-[rgba(0,107,68,0.12)] text-[var(--qc-primary)]'
                    }`}
                  >
                    <BellRing className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-black tracking-tight text-[var(--qc-text)]">
                        {notificacao.titulo}
                      </p>
                      {!notificacao.lida ? (
                        <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--qc-primary)]" />
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                      {notificacao.mensagem}
                    </p>
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                      {new Date(notificacao.criadoEm).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[var(--qc-secondary)]" />
                </CardContent>
              </Card>
            </button>
          ))
        )}
      </div>
    </LayoutMobile>
  );
}
