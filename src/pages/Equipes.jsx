import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit2, Trash2, UserCheck, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { useSync } from '@/components/SyncContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createEquipeRecord,
  deleteEquipeRecord,
  listEquipes,
  queryKeys,
  updateEquipeRecord,
} from '@/lib/dataService';
import { createPageUrl } from '@/utils';

function Equipes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline, queueOperation } = useSync();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [fiscal, setFiscal] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editNome, setEditNome] = useState('');
  const [editFiscal, setEditFiscal] = useState('');

  const { data: equipes = [] } = useQuery({
    queryKey: queryKeys.equipes,
    queryFn: () => listEquipes(isOnline),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.equipes });

  const createMutation = useMutation({
    mutationFn: () =>
      createEquipeRecord(
        {
          numero: parseInt(numero, 10),
          nome,
          fiscal,
          ativa: true,
        },
        { isOnline, queueOperation },
      ),
    onSuccess: () => {
      setDialogOpen(false);
      setNumero('');
      setNome('');
      setFiscal('');
      refresh();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      updateEquipeRecord(id, payload, { isOnline, queueOperation }),
    onSuccess: () => {
      setEditingId('');
      refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteEquipeRecord(id, { isOnline, queueOperation }),
    onSuccess: refresh,
  });

  const startEdit = (equipe) => {
    setEditingId(equipe.id);
    setEditNome(equipe.nome);
    setEditFiscal(equipe.fiscal || '');
  };

  return (
    <main className="page-shell">
      <PageHeader
        title="Equipes"
        subtitle="Cadastro e manutenção das equipes"
        onBack={() => navigate(createPageUrl('Dashboard'))}
        rightContent={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                Nova
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar equipe</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    type="number"
                    value={numero}
                    onChange={(event) => setNumero(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="fiscal">Fiscal</Label>
                  <Input
                    id="fiscal"
                    value={fiscal}
                    onChange={(event) => setFiscal(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => createMutation.mutate()}
                  disabled={!numero || !nome}
                >
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <section className="page-content space-y-3 pt-5">
        {equipes.map((equipe) => (
          <Card key={equipe.id}>
            <CardContent className="p-4">
              {editingId === equipe.id ? (
                <div className="space-y-3">
                  <Input
                    value={editNome}
                    onChange={(event) => setEditNome(event.target.value)}
                  />
                  <Input
                    placeholder="Fiscal"
                    value={editFiscal}
                    onChange={(event) => setEditFiscal(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setEditingId('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      onClick={() =>
                        updateMutation.mutate({
                          id: equipe.id,
                          payload: { nome: editNome, fiscal: editFiscal },
                        })
                      }
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <Badge variant="amber">Equipe {equipe.numero}</Badge>
                      <p className="text-base font-bold text-slate-900">
                        {equipe.nome}
                      </p>
                    </div>
                    {equipe.fiscal ? (
                      <p className="mt-2 text-sm text-slate-600">
                        <UserCheck className="mr-1 inline h-4 w-4" />
                        {equipe.fiscal}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => startEdit(equipe)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => deleteMutation.mutate(equipe.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

export default Equipes;
