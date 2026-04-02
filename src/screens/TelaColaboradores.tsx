import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, SquarePen } from 'lucide-react';
import { LayoutMobile } from '@/components/LayoutMobile';
import { listarColaboradoresAtivos, atualizarColaborador } from '@/core/auth';
import { repository } from '@/core/repositories';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function TelaColaboradores() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: ativos = [] } = useQuery({
    queryKey: ['colaboradores', 'ativos'],
    queryFn: listarColaboradoresAtivos,
  });
  const { data: todos = [] } = useQuery({
    queryKey: ['colaboradores', 'todos'],
    queryFn: () => repository.list('colaboradores'),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const colaborador = todos.find((item) => item.id === id);
      if (!colaborador) return;
      await atualizarColaborador(colaborador, {
        nome: colaborador.nome,
        primeiroNome: colaborador.primeiroNome,
        matricula: colaborador.matricula,
        ativo: !colaborador.ativo,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
    },
  });

  return (
    <LayoutMobile
      title="Colaboradores"
      subtitle={`${ativos.length} ativo(s) no dispositivo`}
      onBack={() => navigate('/dashboard')}
      action={
        <Button asChild size="sm">
          <Link to="/colaboradores/cadastro">Novo</Link>
        </Button>
      }
    >
      <div className="stack-md">
        {todos.map((colaborador) => (
          <Card key={colaborador.id} className="surface-card">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-slate-900">{colaborador.nome}</p>
                <p className="text-sm text-slate-500">
                  {colaborador.primeiroNome} • {colaborador.matricula}
                </p>
                <span className={`sync-badge sync-badge--${colaborador.ativo ? 'synced' : 'error'}`}>
                  {colaborador.ativo ? 'ativo' : 'inativo'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="icon">
                  <Link to={`/colaboradores/cadastro?id=${colaborador.id}`}>
                    <SquarePen className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => toggleMutation.mutate(colaborador.id)}
                >
                  <Power className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </LayoutMobile>
  );
}
