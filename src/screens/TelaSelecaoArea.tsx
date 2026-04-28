import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LogOut, MapPinned, Settings } from 'lucide-react';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { listarAreas } from '@/core/areas';
import { useCampoApp } from '@/core/AppProvider';
import { canManageUsers } from '@/core/permissions';

export function TelaSelecaoArea() {
  const navigate = useNavigate();
  const { selecionarArea, usuarioAtual, logout } = useCampoApp();
  const podeGerenciarAreas = canManageUsers(usuarioAtual?.perfil);

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ['areas', 'selecao'],
    queryFn: listarAreas,
  });

  const selectMutation = useMutation({
    mutationFn: (areaId: string) => selecionarArea(areaId),
    onSuccess: () => {
      navigate('/dashboard', { replace: true });
    },
    onError: (error) => {
      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível selecionar a área.',
      );
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <LayoutMobile
      title="Selecione a área"
      subtitle="Escolha a área que será trabalhada hoje"
      contentClassName="pt-4"
    >
      <div className="stack-lg pb-8">
        <div className={podeGerenciarAreas ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-[18px] font-bold"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            Sair
          </Button>

          {podeGerenciarAreas ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-[18px] font-bold"
              onClick={() => navigate('/areas/gerenciar')}
            >
              <Settings className="h-5 w-5" />
              Gerenciar Áreas
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="p-5 text-sm text-[var(--qc-text-muted)]">
              Carregando áreas cadastradas.
            </CardContent>
          </Card>
        ) : areas.length === 0 ? (
          <Card className="rounded-[22px] border-2 border-dashed border-[var(--qc-border)] bg-[rgba(248,250,248,0.92)] shadow-none">
            <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-[var(--qc-border)] bg-white text-[var(--qc-primary)]">
                <MapPinned className="h-8 w-8" />
              </div>
              <div>
                <p className="text-lg font-black text-[var(--qc-text)]">
                  Nenhuma área cadastrada
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  Cadastre uma área antes de iniciar avaliações.
                </p>
              </div>
              {podeGerenciarAreas ? (
                <Button
                  type="button"
                  className="h-12 rounded-[18px] px-6 font-bold"
                  onClick={() => navigate('/areas/gerenciar')}
                >
                  Nova Área
                </Button>
              ) : (
                <p className="max-w-[18rem] text-sm font-semibold leading-relaxed text-[var(--qc-secondary)]">
                  Peça ao administrador do campo para cadastrar as áreas.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="stack-md">
            {areas.map((area) => (
              <button
                key={area.id}
                type="button"
                className="flex min-h-[64px] w-full items-center justify-center rounded-[22px] border border-[var(--qc-border)] bg-white px-5 py-4 text-center shadow-sm active:scale-[0.99]"
                disabled={selectMutation.isPending}
                onClick={() => selectMutation.mutate(area.id)}
              >
                <span className="block max-w-full break-words text-xl font-black tracking-tight text-[var(--qc-text)] [overflow-wrap:anywhere]">
                  {area.nome}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </LayoutMobile>
  );
}
