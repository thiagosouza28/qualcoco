import { type ChangeEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { atualizarPerfilColaborador } from '@/core/auth';
import { useCampoApp } from '@/core/AppProvider';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function TelaPerfil() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual, online, refreshApp, sincronizarAgora } = useCampoApp();
  const [nome, setNome] = useState('');
  const [primeiroNome, setPrimeiroNome] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!usuarioAtual) return;
    setNome(usuarioAtual.nome);
    setPrimeiroNome(usuarioAtual.primeiroNome);
  }, [usuarioAtual]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!usuarioAtual) {
        throw new Error('Não foi possível carregar o perfil atual.');
      }

      if (!nome.trim() || !primeiroNome.trim()) {
        throw new Error('Preencha o nome completo e o primeiro nome.');
      }

      if ((pin && !confirmPin) || (!pin && confirmPin)) {
        throw new Error('Preencha e confirme o novo PIN para atualizar o acesso.');
      }

      if (pin && pin !== confirmPin) {
        throw new Error('A confirmação do PIN não confere.');
      }

      return atualizarPerfilColaborador(usuarioAtual, {
        nome,
        primeiroNome,
        pin: pin || undefined,
      });
    },
    onSuccess: async () => {
      setErro('');
      setPin('');
      setConfirmPin('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['colaboradores'] }),
        queryClient.invalidateQueries({ queryKey: ['colaboradores', 'ativos'] }),
        queryClient.invalidateQueries({ queryKey: ['usuarios', 'ativos'] }),
        queryClient.invalidateQueries({ queryKey: ['login', 'colaboradores'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      await refreshApp();

      if (!online) {
        alert('Perfil atualizado neste aparelho. A sincronização será feita quando a internet voltar.');
        navigate('/configuracoes');
        return;
      }

      try {
        const result = await sincronizarAgora();
        await refreshApp();

        if (result?.erro) {
          alert(`Perfil atualizado, mas a sincronização teve aviso: ${result.erro}`);
        } else {
          alert('Perfil atualizado com sucesso.');
        }
      } catch (error) {
        alert(
          `Perfil atualizado, mas a sincronização falhou: ${
            error instanceof Error ? error.message : 'erro desconhecido'
          }`,
        );
      }

      navigate('/configuracoes');
    },
    onError: (caught) => {
      setErro(
        caught instanceof Error ? caught.message : 'Não foi possível atualizar o perfil.',
      );
    },
  });

  if (!usuarioAtual) {
    return (
      <LayoutMobile
        title="Meu perfil"
        subtitle="Atualize seu nome exibido e o PIN de acesso"
        onBack={() => navigate('/configuracoes')}
        showBottomNav
      >
        <Card className="surface-card border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm leading-relaxed text-[var(--qc-text-muted)]">
              Carregando dados do perfil.
            </p>
          </CardContent>
        </Card>
      </LayoutMobile>
    );
  }

  return (
    <LayoutMobile
      title="Meu perfil"
      subtitle="Atualize seu nome exibido e o PIN de acesso"
      onBack={() => navigate('/configuracoes')}
      showBottomNav
    >
      <div className="stack-lg">
        <Card className="surface-card border-none shadow-sm">
          <CardContent className="stack-md p-5">
            <div className="input-block">
              <label>Nome completo</label>
              <Input
                value={nome}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setNome(event.target.value)}
                placeholder="Digite seu nome completo"
              />
            </div>

            <div className="input-block">
              <label>Primeiro nome</label>
              <Input
                value={primeiroNome}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setPrimeiroNome(event.target.value)
                }
                placeholder="Como você quer aparecer no app"
              />
            </div>

            <div className="input-block">
              <label>Matrícula</label>
              <Input
                value={usuarioAtual.matricula}
                disabled
                readOnly
                className="cursor-not-allowed opacity-80"
              />
              <p className="text-xs leading-relaxed text-[var(--qc-text-muted)]">
                A matrícula é o identificador do seu acesso e não pode ser alterada por aqui.
              </p>
            </div>

            <div className="input-block">
              <label>Novo PIN de acesso</label>
              <Input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                maxLength={6}
                value={pin}
                placeholder="Deixe em branco para manter o PIN atual"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setPin(event.target.value.replace(/\D/g, ''))
                }
              />
            </div>

            <div className="input-block">
              <label>Confirmar novo PIN</label>
              <Input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                maxLength={6}
                value={confirmPin}
                placeholder="Repita o novo PIN"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setConfirmPin(event.target.value.replace(/\D/g, ''))
                }
              />
            </div>

            {erro ? <p className="text-sm text-red-600">{erro}</p> : null}
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="h-12 w-full rounded-[18px] text-base font-bold"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Salvando perfil' : 'Salvar perfil'}
        </Button>
      </div>
    </LayoutMobile>
  );
}
