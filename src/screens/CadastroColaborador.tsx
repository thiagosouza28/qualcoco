import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { atualizarColaborador, cadastrarColaborador, listarEquipeIdsDoUsuario } from '@/core/auth';
import { useCampoApp } from '@/core/AppProvider';
import { canManageUsers, normalizePerfilUsuario } from '@/core/permissions';
import { listarEquipes } from '@/core/teams';
import { repository } from '@/core/repositories';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PERFIS = [
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'fiscal_chefe', label: 'Fiscal chefe' },
  { value: 'administrador', label: 'Administrador' },
] as const;

export function CadastroColaborador() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const [params] = useSearchParams();
  const colaboradorId = params.get('id');
  const quickHelperMode = params.get('quick') === '1';
  const returnTo = params.get('returnTo') || '/colaboradores';

  const { data: todosUsuarios = [] } = useQuery({
    queryKey: ['colaboradores', 'todos'],
    queryFn: () => repository.list('colaboradores'),
  });

  const bootstrapLiberado = todosUsuarios.filter((item) => !item.deletadoEm).length === 0;
  const podeGerenciar =
    bootstrapLiberado ||
    canManageUsers(usuarioAtual?.perfil) ||
    (quickHelperMode && Boolean(usuarioAtual) && !colaboradorId);

  const { data: colaborador } = useQuery({
    queryKey: ['colaboradores', colaboradorId],
    queryFn: () => repository.get('colaboradores', colaboradorId || ''),
    enabled: Boolean(colaboradorId),
  });

  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes'],
    queryFn: listarEquipes,
  });

  const { data: equipeIdsUsuario = [] } = useQuery({
    queryKey: ['colaboradores', colaboradorId, 'equipes'],
    queryFn: () => listarEquipeIdsDoUsuario(colaboradorId || ''),
    enabled: Boolean(colaboradorId),
  });
  const { data: equipeIdsUsuarioAtual = [] } = useQuery({
    queryKey: ['colaboradores', usuarioAtual?.id, 'equipes'],
    queryFn: () => listarEquipeIdsDoUsuario(usuarioAtual?.id || ''),
    enabled: Boolean(usuarioAtual?.id),
  });

  const [nome, setNome] = useState('');
  const [primeiroNome, setPrimeiroNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [pin, setPin] = useState('');
  const [perfil, setPerfil] = useState('colaborador');
  const [ativo, setAtivo] = useState(true);
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!colaborador) return;
    setNome(colaborador.nome);
    setPrimeiroNome(colaborador.primeiroNome);
    setMatricula(colaborador.matricula);
    setPerfil(normalizePerfilUsuario(colaborador.perfil));
    setAtivo(colaborador.ativo);
  }, [colaborador]);

  useEffect(() => {
    setEquipeIds(equipeIdsUsuario);
  }, [equipeIdsUsuario]);

  useEffect(() => {
    if (!quickHelperMode || colaborador) return;
    if (equipeIds.length > 0) return;
    setEquipeIds(equipeIdsUsuarioAtual);
  }, [colaborador, equipeIds.length, equipeIdsUsuarioAtual, quickHelperMode]);

  useEffect(() => {
    if (!quickHelperMode || colaborador) return;
    setPerfil('colaborador');
    setAtivo(true);
  }, [colaborador, quickHelperMode]);

  const equipesAtivas = useMemo(
    () => equipes.filter((item) => item.ativa && !item.deletadoEm),
    [equipes],
  );
  const perfilNormalizado = normalizePerfilUsuario(perfil);
  const exigeEquipe =
    perfilNormalizado === 'colaborador' || perfilNormalizado === 'fiscal';
  const podeSalvar =
    nome.trim().length > 0 &&
    matricula.trim().length > 0 &&
    (Boolean(colaborador) || pin.length === 4 || pin.length === 6) &&
    (!exigeEquipe || equipeIds.length > 0);

  useEffect(() => {
    if (!erro) return;
    setErro('');
  }, [ativo, equipeIds, erro, matricula, nome, perfil, pin, primeiroNome]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!nome.trim() || !matricula.trim()) {
        throw new Error('Preencha nome completo e matrícula.');
      }

      if (exigeEquipe && equipeIds.length === 0) {
        throw new Error('Selecione ao menos uma equipe para este perfil.');
      }

      if (colaborador) {
        return atualizarColaborador(colaborador, {
          nome,
          primeiroNome,
          matricula,
          ativo,
          pin: pin || undefined,
          perfil: perfilNormalizado,
          equipeIds,
        });
      }

      return cadastrarColaborador({
        nome,
        primeiroNome,
        matricula,
        pin,
        ativo,
        perfil: perfilNormalizado,
        equipeIds,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate(returnTo);
    },
    onError: (caught) => {
      setErro(
        caught instanceof Error ? caught.message : 'Não foi possível salvar.',
      );
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }

    mutation.mutate();
  };

  if (!podeGerenciar) {
    return (
      <LayoutMobile
        title="Usuários"
        subtitle="Acesso restrito"
        onBack={() => navigate('/dashboard')}
      >
        <Card className="surface-card">
          <CardContent className="p-5">
            <p className="text-sm text-[var(--qc-text-muted)]">
              Apenas administradores podem cadastrar, editar ou inativar usuários.
            </p>
          </CardContent>
        </Card>
      </LayoutMobile>
    );
  }

  const perfilTravado = quickHelperMode && !canManageUsers(usuarioAtual?.perfil);

  return (
    <LayoutMobile
      title={colaborador ? 'Editar usuário' : quickHelperMode ? 'Novo ajudante' : 'Novo usuário'}
      subtitle="Cadastro profissional para operação de campo"
      onBack={() => navigate(returnTo)}
    >
      <form className="stack-lg" onSubmit={handleSubmit}>
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
                placeholder="Opcional, se vazio será extraído do nome"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPrimeiroNome(event.target.value)}
              />
            </div>

            <div className="input-block">
              <label>Matrícula</label>
              <Input
                autoComplete="off"
                value={matricula}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setMatricula(event.target.value.replace(/\D/g, ''))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="input-block">
                <label>Perfil</label>
                <Select value={perfil} onValueChange={setPerfil} disabled={perfilTravado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERFIS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="input-block">
                <label>Status</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={ativo ? 'default' : 'outline'}
                    className="h-11 rounded-2xl"
                    onClick={() => setAtivo(true)}
                    disabled={perfilTravado}
                  >
                    Ativo
                  </Button>
                  <Button
                    type="button"
                    variant={!ativo ? 'default' : 'outline'}
                    className="h-11 rounded-2xl"
                    onClick={() => setAtivo(false)}
                    disabled={perfilTravado}
                  >
                    Inativo
                  </Button>
                </div>
              </div>
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
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setPin(event.target.value.replace(/\D/g, ''))
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardContent className="stack-md p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                  Equipes vinculadas
                </p>
                <p className="text-sm text-[var(--qc-text-muted)]">
                  Para colaborador e fiscal, ao menos uma equipe deve ser selecionada. Para fiscal chefe e administrador, o vínculo é opcional.
                </p>
              </div>
              <Badge variant="slate">{equipeIds.length} selecionada(s)</Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {equipesAtivas.map((equipe) => {
                const selecionada = equipeIds.includes(equipe.id);
                return (
                  <button
                    key={equipe.id}
                    type="button"
                    className={
                      selecionada
                        ? 'rounded-[22px] border border-[rgba(0,107,68,0.22)] bg-[rgba(0,107,68,0.08)] px-4 py-4 text-left transition'
                        : 'rounded-[22px] border border-[var(--qc-border)] bg-white px-4 py-4 text-left transition'
                    }
                    onClick={() =>
                      setEquipeIds((current) =>
                        selecionada
                          ? current.filter((item) => item !== equipe.id)
                          : [...current, equipe.id],
                      )
                    }
                  >
                    <p className="text-sm font-black text-[var(--qc-text)]">
                      Eq {String(equipe.numero).padStart(2, '0')}
                    </p>
                    <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                      {equipe.nome}
                    </p>
                    {equipe.fiscal ? (
                      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                        Fiscal: {equipe.fiscal}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {erro ? <p className="text-sm text-red-600">{erro}</p> : null}

        {!colaborador && exigeEquipe && equipeIds.length === 0 ? (
          <p className="text-sm text-amber-700">
            Selecione ao menos uma equipe antes de salvar este usuário.
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!podeSalvar || mutation.isPending}
        >
          {mutation.isPending ? 'Salvando usuário' : 'Salvar usuário'}
        </Button>
      </form>
    </LayoutMobile>
  );
}
