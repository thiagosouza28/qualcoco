import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MapPinned, PencilLine, Plus, Star, Trash2 } from 'lucide-react';
import { AccessDeniedCard } from '@/components/AccessDeniedCard';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  atualizarArea,
  criarArea,
  definirAreaPadrao,
  duplicarArea,
  excluirArea,
  getAreaPadraoId,
  listarAreas,
} from '@/core/areas';
import { useCampoApp } from '@/core/AppProvider';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { canManageUsers } from '@/core/permissions';
import type { Area } from '@/core/types';

type AreaFormState = {
  nome: string;
  limiteCocosChao: string;
  limiteCachos: string;
};

const getInitialForm = (area?: Area | null): AreaFormState => ({
  nome: area?.nome || '',
  limiteCocosChao: String(area?.limiteCocosChao ?? 19),
  limiteCachos: String(area?.limiteCachos ?? 19),
});

export function TelaGerenciarAreas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { areaAtiva, limparAreaAtiva, selecionarArea, usuarioAtual } = useCampoApp();
  const podeGerenciarAreas = canManageUsers(usuarioAtual?.perfil);
  const [areaPadraoId, setAreaPadraoId] = useState(getAreaPadraoId());
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [form, setForm] = useState<AreaFormState>(getInitialForm());

  const { data: areas = [] } = useQuery({
    queryKey: ['areas', 'gerenciar'],
    queryFn: listarAreas,
  });

  const editingArea = useMemo(
    () => areas.find((item) => item.id === editingAreaId) || null,
    [areas, editingAreaId],
  );
  const dialogOpen = editingAreaId !== null;

  const invalidateAreas = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['areas'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['historico'] }),
      queryClient.invalidateQueries({ queryKey: ['relatorio'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome,
        limiteCocosChao: Number(form.limiteCocosChao),
        limiteCachos: Number(form.limiteCachos),
      };

      if (editingArea) {
        return atualizarArea(editingArea.id, payload);
      }

      return criarArea(payload);
    },
    onSuccess: async (area) => {
      if (!areaPadraoId) {
        await definirAreaPadrao(area.id);
        setAreaPadraoId(area.id);
      }

      if (areaAtiva?.id === area.id) {
        await selecionarArea(area.id);
      }

      setEditingAreaId(null);
      setForm(getInitialForm());
      await invalidateAreas();
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a área.');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: duplicarArea,
    onSuccess: invalidateAreas,
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Não foi possível duplicar a área.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: excluirArea,
    onSuccess: async (_result, areaId) => {
      if (areaAtiva?.id === areaId) {
        limparAreaAtiva();
      }
      if (areaPadraoId === areaId) {
        setAreaPadraoId('');
      }
      await invalidateAreas();
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir a área.');
    },
  });

  const defaultMutation = useMutation({
    mutationFn: definirAreaPadrao,
    onSuccess: async (area) => {
      setAreaPadraoId(area.id);
      await invalidateAreas();
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Não foi possível definir o padrão.');
    },
  });

  const openNew = () => {
    setEditingAreaId('');
    setForm(getInitialForm());
  };

  const openEdit = (area: Area) => {
    setEditingAreaId(area.id);
    setForm(getInitialForm(area));
  };

  const handleUseArea = async (areaId: string) => {
    try {
      await selecionarArea(areaId);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível selecionar a área.');
    }
  };

  if (!podeGerenciarAreas) {
    return (
      <LayoutMobile
        title="Gerenciar Áreas"
        subtitle="Acesso restrito"
        onBack={() => navigate('/areas')}
      >
        <AccessDeniedCard description="Somente o administrador do campo pode cadastrar, editar ou excluir áreas. Os demais usuários apenas escolhem a área de entrada." />
      </LayoutMobile>
    );
  }

  return (
    <LayoutMobile
      title="Gerenciar Áreas"
      subtitle="Limites por local de trabalho"
      onBack={() => navigate('/areas')}
    >
      <div className="stack-lg pb-8">
        <Button
          type="button"
          className="h-12 w-full rounded-[18px] text-base font-bold"
          onClick={openNew}
        >
          <Plus className="h-5 w-5" />
          Nova Área
        </Button>

        {areas.length === 0 ? (
          <Card className="rounded-[22px] border-2 border-dashed border-[var(--qc-border)] bg-[rgba(248,250,248,0.92)] shadow-none">
            <CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-3 p-5 text-center">
              <MapPinned className="h-9 w-9 text-[var(--qc-secondary)]" />
              <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                Crie a primeira área para liberar o dashboard e as avaliações.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="stack-md">
            <p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
              Ordenado por padrão e nome
            </p>
            {areas.map((area) => (
              <Card key={area.id} className="surface-card border-none bg-white shadow-sm">
                <CardContent className="stack-md p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-xl font-black tracking-tight text-[var(--qc-text)]">
                          {area.nome}
                        </p>
                        {area.id === areaAtiva?.id ? (
                          <Badge variant="blue">Ativa</Badge>
                        ) : null}
                        {area.id === areaPadraoId ? (
                          <Badge variant="emerald">Padrão</Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[var(--qc-secondary)]">
                        Cocos no chão: {area.limiteCocosChao} · Cachos: {area.limiteCachos}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-[14px] px-2"
                      onClick={() => handleUseArea(area.id)}
                    >
                      Usar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-full rounded-[14px]"
                      aria-label="Editar área"
                      onClick={() => openEdit(area)}
                    >
                      <PencilLine className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-full rounded-[14px]"
                      aria-label="Duplicar área"
                      disabled={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate(area.id)}
                    >
                      <Copy className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant={area.id === areaPadraoId ? 'default' : 'outline'}
                      size="icon"
                      className="h-11 w-full rounded-[14px]"
                      aria-label="Definir área padrão"
                      disabled={defaultMutation.isPending || area.id === areaPadraoId}
                      onClick={() => defaultMutation.mutate(area.id)}
                    >
                      <Star className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-full rounded-[14px] border-[rgba(197,58,53,0.28)] bg-[rgba(197,58,53,0.04)] text-[var(--qc-danger)]"
                      aria-label="Excluir área"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm('Excluir esta área?')) {
                          deleteMutation.mutate(area.id);
                        }
                      }}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open: boolean) => !open && setEditingAreaId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingArea ? 'Editar área' : 'Nova área'}</DialogTitle>
          </DialogHeader>

          <div className="mt-4 stack-md">
            <label className="stack-xs">
              <span className="px-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                Nome da área
              </span>
              <Input
                value={form.nome}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm((current) => ({ ...current, nome: event.target.value }))
                }
                placeholder="Ex.: Área 01"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="stack-xs">
                <span className="px-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                  Cocos no chão
                </span>
                <Input
                  type="number"
                  min="0"
                  value={form.limiteCocosChao}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((current) => ({
                      ...current,
                      limiteCocosChao: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="stack-xs">
                <span className="px-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                  Cachos
                </span>
                <Input
                  type="number"
                  min="0"
                  value={form.limiteCachos}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setForm((current) => ({
                      ...current,
                      limiteCachos: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[16px] font-bold"
              onClick={() => setEditingAreaId(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-11 rounded-[16px] font-bold"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Salvando' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutMobile>
  );
}
