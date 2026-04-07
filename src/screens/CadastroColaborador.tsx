import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { atualizarColaborador, cadastrarColaborador } from '@/core/auth';
import { repository } from '@/core/repositories';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function CadastroColaborador() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const colaboradorId = params.get('id');

  const { data: colaborador } = useQuery({
    queryKey: ['colaboradores', colaboradorId],
    queryFn: () => repository.get('colaboradores', colaboradorId || ''),
    enabled: Boolean(colaboradorId),
  });

  const [nome, setNome] = useState('');
  const [primeiroNome, setPrimeiroNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!colaborador) return;
    setNome(colaborador.nome);
    setPrimeiroNome(colaborador.primeiroNome);
    setMatricula(colaborador.matricula);
  }, [colaborador]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (colaborador) {
        return atualizarColaborador(colaborador, {
          nome,
          primeiroNome,
          matricula,
          ativo: colaborador.ativo,
          pin: pin || undefined,
        });
      }

      return cadastrarColaborador({
        nome,
        primeiroNome,
        matricula,
        pin,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
      navigate(colaborador ? '/colaboradores' : '/login');
    },
    onError: (caught) => {
      setErro(
        caught instanceof Error ? caught.message : 'Não foi possível salvar.',
      );
    },
  });

  return (
    <LayoutMobile
      title={colaborador ? 'Editar colaborador' : 'Novo colaborador'}
      subtitle="Cadastro rápido para operação de campo"
      onBack={() => navigate(colaborador ? '/colaboradores' : '/login')}
    >
      <Card className="surface-card">
        <CardContent className="stack-md p-5">
          <div className="input-block">
            <label>Nome completo</label>
            <Input value={nome} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNome(event.target.value)} />
          </div>
          <div className="input-block">
            <label>Primeiro nome</label>
            <Input
              value={primeiroNome}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPrimeiroNome(event.target.value)}
            />
          </div>
          <div className="input-block">
            <label>Matrícula</label>
            <Input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={matricula}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setMatricula(event.target.value.replace(/\D/g, ''))
              }
            />
          </div>
          <div className="input-block">
            <label>{colaborador ? 'Novo PIN (opcional)' : 'PIN'}</label>
            <Input
              type="tel"
              value={pin}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={6}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPin(event.target.value.replace(/\D/g, ''))}
            />
          </div>

          {erro ? <p className="text-sm text-red-600">{erro}</p> : null}

          <Button
            size="lg"
            className="w-full"
            disabled={!nome || !primeiroNome || !matricula || (!colaborador && !pin)}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Salvando colaborador' : 'Salvar colaborador'}
          </Button>
        </CardContent>
      </Card>
    </LayoutMobile>
  );
}
