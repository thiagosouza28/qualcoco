import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, Search, Shield, SquarePen } from 'lucide-react';
import {
  atualizarColaborador,
  buscarUsuariosPorNomeOuMatricula,
} from '@/core/auth';
import { useCampoApp } from '@/core/AppProvider';
import { canManageUsers, normalizePerfilUsuario } from '@/core/permissions';
import { listarEquipes } from '@/core/teams';
import { repository } from '@/core/repositories';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LayoutMobile } from '@/components/LayoutMobile';

const PERFIL_LABEL: Record<string, string> = {
  administrador: 'Administrador',
  colaborador: 'Colaborador',
  fiscal: 'Fiscal',
  fiscal_chefe: 'Fiscal chefe',
};

export function TelaColaboradores() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const [busca, setBusca] = useState('');

  const podeGerenciar = canManageUsers(usuarioAtual?.perfil);

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios', 'busca', busca],
    queryFn: () => buscarUsuariosPorNomeOuMatricula(busca),
    enabled: podeGerenciar,
  });

  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes'],
    queryFn: listarEquipes,
    enabled: podeGerenciar,
  });

  const { data: vinculos = [] } = useQuery({
    queryKey: ['usuarioEquipes'],
    queryFn: () => repository.list('usuarioEquipes'),
    enabled: podeGerenciar,
  });

  const equipeMap = useMemo(
    () => new Map(equipes.map((item) => [item.id, item])),
    [equipes],
  );

  const equipesPorUsuario = useMemo(() => {
    return vinculos.reduce<Record<string, string[]>>((acc, item) => {
      if (item.deletadoEm) return acc;
      const equipe = equipeMap.get(item.equipeId);
      if (!equipe || equipe.deletadoEm) return acc;
      acc[item.usuarioId] = acc[item.usuarioId] || [];
      acc[item.usuarioId].push(`Eq ${String(equipe.numero).padStart(2, '0')}`);
      return acc;
    }, {});
  }, [equipeMap, vinculos]);

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const colaborador = usuarios.find((item) => item.id === id);
      if (!colaborador) return;

      const equipeIds = vinculos
        .filter((item) => !item.deletadoEm && item.usuarioId === id)
        .map((item) => item.equipeId);

      await atualizarColaborador(colaborador, {
        nome: colaborador.nome,
        primeiroNome: colaborador.primeiroNome,
        matricula: colaborador.matricula,
        ativo: !colaborador.ativo,
        perfil: normalizePerfilUsuario(colaborador.perfil),
        equipeIds,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  if (!podeGerenciar) {
    return (
      <LayoutMobile
        title="Usuários"
        subtitle="Acesso restrito"
        onBack={() => navigate(-1)}
      >
        <Card className="surface-card">
          <CardContent className="p-5">
            <p className="text-sm text-[var(--qc-text-muted)]">
              Apenas administradores podem visualizar e gerenciar o cadastro
              completo de usuários.
            </p>
          </CardContent>
        </Card>
      </LayoutMobile>
    );
  }

  return (
    <LayoutMobile
      title="Usuários"
      subtitle={`${usuarios.length} registro(s) encontrado(s)`}
      onBack={() => navigate(-1)}
      action={
        <Button asChild size="sm">
          <Link to="/colaboradores/cadastro?returnTo=%2Fcolaboradores">
            Novo usuário
          </Link>
        </Button>
      }
    >
      <div className="stack-md">
        <Card className="surface-card">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--qc-secondary)]" />
              <Input
                className="pl-11"
                placeholder="Buscar por nome ou matrícula"
                value={busca}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setBusca(event.target.value)
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                Cadastro de usuário
              </p>
              <p className="text-sm text-[var(--qc-text-muted)]">
                Crie colaborador, fiscal, fiscal chefe ou administrador.
              </p>
            </div>
            <Button asChild>
              <Link to="/colaboradores/cadastro?returnTo=%2Fcolaboradores">
                Cadastrar
              </Link>
            </Button>
          </CardContent>
        </Card>

        {usuarios.map((colaborador) => {
          const perfil = normalizePerfilUsuario(colaborador.perfil);
          const equipesUsuario = equipesPorUsuario[colaborador.id] || [];

          return (
            <Card key={colaborador.id} className="surface-card">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {colaborador.nome}
                  </p>
                  <p className="text-sm text-slate-500">
                    {colaborador.matricula}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={colaborador.ativo ? 'emerald' : 'red'}>
                      {colaborador.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant="slate">
                      <Shield className="h-3.5 w-3.5" />
                      {PERFIL_LABEL[perfil] || 'Colaborador'}
                    </Badge>
                    {equipesUsuario.map((equipe) => (
                      <Badge
                        key={`${colaborador.id}-${equipe}`}
                        variant="amber"
                      >
                        {equipe}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button asChild variant="outline" size="icon">
                    <Link
                      to={`/colaboradores/cadastro?id=${colaborador.id}&returnTo=%2Fcolaboradores`}
                    >
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
          );
        })}
      </div>
    </LayoutMobile>
  );
}
