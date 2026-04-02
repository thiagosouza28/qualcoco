import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listarColaboradoresAtivos } from '@/core/auth';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function TelaSelecaoUsuario() {
  const navigate = useNavigate();
  const { data: colaboradores = [] } = useQuery({
    queryKey: ['usuarios', 'ativos'],
    queryFn: listarColaboradoresAtivos,
  });

  return (
    <LayoutMobile
      title="Trocar Colaborador"
      subtitle="Troca rápida em campo"
      onBack={() => navigate('/login')}
    >
      <div className="stack-lg">
        {colaboradores.length === 0 ? (
          <Card className="surface-card">
            <CardContent className="space-y-2 p-4">
              <p className="font-semibold text-slate-900">
                Nenhum colaborador cadastrado.
              </p>
              <p className="text-sm text-slate-500">
                Cadastre um novo colaborador para liberar o login neste aparelho.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {colaboradores.map((colaborador) => (
          <Card key={colaborador.id} className="surface-card">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-slate-900">{colaborador.nome}</p>
                <p className="text-sm text-slate-500">
                  {colaborador.primeiroNome} • {colaborador.matricula}
                </p>
              </div>
              <Button asChild>
                <Link to={`/login?usuario=${encodeURIComponent(colaborador.matricula)}`}>
                  Usar
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" size="lg" asChild className="w-full">
          <Link to="/colaboradores/cadastro">Cadastrar novo colaborador</Link>
        </Button>
      </div>
    </LayoutMobile>
  );
}
