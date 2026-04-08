import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Trash2, User, Users } from 'lucide-react';
import { atualizarEquipe, cadastrarEquipe, excluirEquipe, listarEquipes } from '@/core/teams';
import { useCampoApp } from '@/core/AppProvider';
import { canManageTeams } from '@/core/permissions';
import type { Equipe } from '@/core/types';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const initialForm = {
  numero: '',
  nome: '',
  fiscal: '',
};

export function TelaEquipes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState<Equipe | null>(null);
  const [form, setForm] = useState(initialForm);
  const [saveError, setSaveError] = useState('');

  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes'],
    queryFn: listarEquipes,
  });

  if (!canManageTeams(usuarioAtual?.perfil)) {
    return (
      <LayoutMobile
        title="Equipes"
        subtitle="Acesso restrito"
        onBack={() => navigate('/dashboard')}
        showBottomNav
      >
        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-[var(--qc-text-muted)]">
              Apenas administradores podem cadastrar, editar ou excluir equipes.
            </p>
          </CardContent>
        </Card>
      </LayoutMobile>
    );
  }

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['equipes'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      cadastrarEquipe({
        numero: Number(form.numero),
        nome: form.nome.trim(),
        fiscal: form.fiscal.trim(),
      }),
    onSuccess: async () => {
      setSaveError('');
      setDialogOpen(false);
      setEditingEquipe(null);
      setForm(initialForm);
      await refresh();
    },
    onError: (error) => {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a equipe.',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (equipe: Equipe) =>
      atualizarEquipe(equipe, {
        numero: Number(form.numero),
        nome: form.nome.trim(),
        fiscal: form.fiscal.trim(),
        ativa: true,
      }),
    onSuccess: async () => {
      setSaveError('');
      setDialogOpen(false);
      setEditingEquipe(null);
      setForm(initialForm);
      await refresh();
    },
    onError: (error) => {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a equipe.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (equipe: Equipe) => excluirEquipe(equipe),
    onSuccess: refresh,
  });

  const formInvalid = !form.numero.trim() || !form.nome.trim();
  const numeroPreview = form.numero.trim() ? form.numero.trim().padStart(2, '0') : '--';
  const saving = createMutation.isPending || updateMutation.isPending;

  const startCreate = () => {
    setSaveError('');
    setEditingEquipe(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const startEdit = (equipe: Equipe) => {
    setSaveError('');
    setEditingEquipe(equipe);
    setForm({
      numero: String(equipe.numero),
      nome: equipe.nome,
      fiscal: equipe.fiscal || '',
    });
    setDialogOpen(true);
  };

  return (
    <LayoutMobile
      title="Equipes"
      subtitle="Cadastro compartilhado entre todos os colaboradores"
      onBack={() => navigate('/dashboard')}
      showBottomNav
      action={
        <Button
          type="button"
          className="h-11 rounded-[18px] px-5 font-bold"
          onClick={startCreate}
        >
          <Plus className="h-4 w-4" />
          Nova
        </Button>
      }
    >
      <div className="stack-lg">
        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
              As equipes cadastradas ficam visíveis para qualquer usuário logado.
              Esse é o cadastro compartilhado com todos no app.
            </p>
          </CardContent>
        </Card>

        {equipes.length === 0 ? (
          <Card className="surface-card border-none shadow-sm">
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-[var(--qc-text-muted)]">
                Nenhuma equipe cadastrada ainda. Quando criar uma equipe aqui,
                ela ficará disponível para todos os colaboradores.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="stack-md">
            {equipes.map((equipe, index) => (
              <Card key={equipe.id} className="surface-card border-none shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(210,231,211,0.52)] text-[var(--qc-primary)]">
                      <Users className="h-6 w-6" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="emerald"
                          className="bg-[var(--qc-tertiary)] px-2.5 py-1 text-[10px] font-extrabold tracking-[0.16em] text-[var(--qc-primary)]"
                        >
                          Equipe {index + 1}
                        </Badge>
                        <span className="text-[1.85rem] font-black tracking-[-0.04em] leading-none text-[var(--qc-text)]">
                          {String(equipe.numero).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-[var(--qc-text-muted)]">
                        <User className="h-4 w-4 shrink-0" />
                        <span className="truncate text-sm font-medium">
                          {equipe.nome}
                        </span>
                      </div>

                      {equipe.fiscal ? (
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--qc-secondary)]">
                          Fiscal: {equipe.fiscal}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 self-center">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 rounded-[16px]"
                        onClick={() => startEdit(equipe)}
                      >
                        <Pencil className="h-4.5 w-4.5" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-10 w-10 rounded-[16px] bg-red-700 shadow-lg shadow-red-100"
                        onClick={() => {
                          if (confirm('Excluir esta equipe?')) {
                            deleteMutation.mutate(equipe);
                          }
                        }}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setSaveError('');
              setEditingEquipe(null);
              setForm(initialForm);
            }
          }}
        >
          <DialogContent className="flex w-[min(calc(100vw-1.5rem),26rem)] max-h-[88dvh] flex-col overflow-hidden rounded-[32px] p-0 sm:max-w-none">
            <DialogHeader className="shrink-0 border-b border-[var(--qc-border)] bg-[linear-gradient(180deg,rgba(210,231,211,0.52),rgba(255,255,255,0.98))] px-5 py-5 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-white text-[var(--qc-primary)] shadow-[0_18px_30px_-24px_rgba(0,107,68,0.44)]">
                  <Users className="h-7 w-7" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--qc-secondary)]">
                    {editingEquipe
                      ? 'Atualize os dados da equipe'
                      : 'Cadastro rápido de equipe'}
                  </p>
                  <DialogTitle className="mt-1 text-[1.75rem] font-black tracking-[-0.05em] text-[var(--qc-text)]">
                    {editingEquipe ? 'Editar equipe' : 'Nova equipe'}
                  </DialogTitle>
                  <DialogDescription className="mt-1 max-w-[19rem] text-sm leading-relaxed text-[var(--qc-text-muted)]">
                    Defina o número exibido no campo, o nome da equipe e o fiscal
                    responsável.
                  </DialogDescription>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[var(--qc-border)] bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-primary)]">
                  EQ {numeroPreview}
                </span>
                {form.nome.trim() ? (
                  <span className="inline-flex max-w-full items-center rounded-full border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-3 py-1.5 text-sm font-semibold text-[var(--qc-text)]">
                    {form.nome.trim()}
                  </span>
                ) : null}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="stack-md">
                <div className="rounded-[26px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="stack-xs">
                      <label className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                        Número
                      </label>
                      <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                        Identificação curta da equipe para planejamento e relatórios.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-primary)]">
                      Obrigatório
                    </span>
                  </div>

                  <div className="relative mt-4">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--qc-primary)]">
                      EQ
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="01"
                      className="h-14 rounded-[20px] border-white bg-white pl-14 text-lg font-black tracking-[0.08em] shadow-none"
                      value={form.numero}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setForm((current) => ({
                          ...current,
                          numero: event.target.value.replace(/\D/g, ''),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-[26px] border border-[var(--qc-border)] bg-white p-4 shadow-[0_18px_28px_-28px_rgba(17,33,23,0.18)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="stack-xs">
                      <label className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                        Nome da equipe
                      </label>
                      <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                        Nome que será mostrado na avaliação, histórico e relatório.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--qc-tertiary)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-primary)]">
                      Campo
                    </span>
                  </div>

                  <Input
                    placeholder="Ex: Equipe Alfa"
                    className="mt-4 h-14 rounded-[20px] bg-[var(--qc-surface-muted)] px-4 text-base font-semibold"
                    value={form.nome}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setForm((current) => ({
                        ...current,
                        nome: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="rounded-[26px] border border-[var(--qc-border)] bg-white p-4 shadow-[0_18px_28px_-28px_rgba(17,33,23,0.18)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="stack-xs">
                      <label className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--qc-secondary)]">
                        Fiscal responsável
                      </label>
                      <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
                        Opcional. Use para identificar quem acompanha essa equipe.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--qc-surface-muted)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                      Opcional
                    </span>
                  </div>

                  <Input
                    placeholder="Nome do fiscal"
                    className="mt-4 h-14 rounded-[20px] bg-[var(--qc-surface-muted)] px-4 text-base font-medium"
                    value={form.fiscal}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setForm((current) => ({
                        ...current,
                        fiscal: event.target.value,
                      }))
                    }
                  />
                </div>

                {saveError ? (
                  <p className="rounded-[22px] border border-[rgba(197,58,53,0.18)] bg-[rgba(197,58,53,0.06)] px-4 py-3 text-sm font-medium leading-relaxed text-[var(--qc-danger)]">
                    {saveError}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter className="mt-0 shrink-0 border-t border-[var(--qc-border)] bg-white px-5 py-4">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-2xl font-bold sm:flex-1"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-12 w-full rounded-2xl text-base font-bold sm:flex-[1.2]"
                onClick={() =>
                  editingEquipe
                    ? updateMutation.mutate(editingEquipe)
                    : createMutation.mutate()
                }
                disabled={formInvalid || saving}
              >
                {editingEquipe ? 'Salvar alterações' : 'Criar equipe'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LayoutMobile>
  );
}
