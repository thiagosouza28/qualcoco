import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  atualizarColaborador,
  cadastrarColaborador,
  listarEquipeIdsDoUsuario,
} from '@/core/auth';
import { useCampoApp } from '@/core/AppProvider';
import { canManageUsers, normalizePerfilUsuario } from '@/core/permissions';
import { listarEquipes } from '@/core/teams';
import { repository } from '@/core/repositories';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const PERFIS = [
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'fiscal_chefe', label: 'Fiscal chefe' },
  { value: 'administrador', label: 'Administrador' },
] as const;

const createEmptyFormState = () => ({
  nome: '',
  primeiroNome: '',
  matricula: '',
  pin: '',
  perfil: 'colaborador',
  ativo: true,
});

export function CadastroColaborador() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const [params] = useSearchParams();
  const colaboradorId = params.get('id');
  const quickHelperMode = params.get('quick') === '1';
  const returnTo = params.get('returnTo') || '/colaboradores';
  const isEditMode = Boolean(colaboradorId);

  const { data: todosUsuarios = [] } = useQuery({
    queryKey: ['colaboradores', 'todos'],
    queryFn: () => repository.list('colaboradores'),
  });

  const bootstrapLiberado =
    todosUsuarios.filter((item) => !item.deletadoEm).length === 0;
  const podeGerenciar =
    bootstrapLiberado ||
    canManageUsers(usuarioAtual?.perfil) ||
    (quickHelperMode && Boolean(usuarioAtual) && !isEditMode);

  const {
    data: colaborador,
    isPending: carregandoColaborador,
    isFetched: colaboradorCarregado,
  } = useQuery({
    queryKey: ['colaboradores', colaboradorId],
    queryFn: () => repository.get('colaboradores', colaboradorId || ''),
    enabled: isEditMode,
  });

  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes'],
    queryFn: listarEquipes,
  });

  const { data: equipeIdsUsuario = [] } = useQuery({
    queryKey: ['colaboradores', colaboradorId, 'equipes'],
    queryFn: () => listarEquipeIdsDoUsuario(colaboradorId || ''),
    enabled: isEditMode,
  });

  const {
    data: equipeIdsUsuarioAtual = [],
    isFetched: equipeIdsUsuarioAtualCarregado,
  } = useQuery({
    queryKey: ['colaboradores', usuarioAtual?.id, 'equipes'],
    queryFn: () => listarEquipeIdsDoUsuario(usuarioAtual?.id || ''),
    enabled: Boolean(usuarioAtual?.id),
  });
  const novoFormSeedRef = useRef<string | null>(null);
  const editFormSeedRef = useRef<string | null>(null);
  const editEquipeSeedRef = useRef<string | null>(null);

  const [nome, setNome] = useState('');
  const [primeiroNome, setPrimeiroNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [pin, setPin] = useState('');
  const [perfil, setPerfil] = useState('colaborador');
  const [ativo, setAtivo] = useState(true);
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    novoFormSeedRef.current = null;
    editFormSeedRef.current = null;
    editEquipeSeedRef.current = null;

    if (!isEditMode) {
      const initial = createEmptyFormState();
      setNome(initial.nome);
      setPrimeiroNome(initial.primeiroNome);
      setMatricula(initial.matricula);
      setPin(initial.pin);
      setPerfil(initial.perfil);
      setAtivo(initial.ativo);
      setEquipeIds([]);
    }
  }, [colaboradorId, isEditMode, quickHelperMode, usuarioAtual?.id]);

  useEffect(() => {
    if (isEditMode) {
      return;
    }

    const seedKey = `novo:${quickHelperMode ? 'quick' : 'padrao'}:${usuarioAtual?.id || 'anon'}`;
    if (novoFormSeedRef.current === seedKey) {
      return;
    }

    if (quickHelperMode && usuarioAtual?.id && !equipeIdsUsuarioAtualCarregado) {
      return;
    }

    setEquipeIds(quickHelperMode ? equipeIdsUsuarioAtual : []);
    novoFormSeedRef.current = seedKey;
  }, [
    equipeIdsUsuarioAtual,
    equipeIdsUsuarioAtualCarregado,
    isEditMode,
    quickHelperMode,
    usuarioAtual?.id,
  ]);

  useEffect(() => {
    if (!isEditMode || !colaborador) {
      return;
    }

    const seedKey = `edicao:${colaborador.id}:${colaborador.atualizadoEm}`;
    if (editFormSeedRef.current === seedKey) {
      return;
    }

    setNome(colaborador.nome || '');
    setPrimeiroNome(colaborador.primeiroNome || '');
    setMatricula(colaborador.matricula || '');
    setPin('');
    setPerfil(normalizePerfilUsuario(colaborador.perfil));
    setAtivo(colaborador.ativo);
    editFormSeedRef.current = seedKey;
  }, [colaborador, isEditMode]);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    const seedKey = `equipes:${colaboradorId}:${equipeIdsUsuario.join(',')}`;
    if (editEquipeSeedRef.current === seedKey) {
      return;
    }

    setEquipeIds(equipeIdsUsuario);
    editEquipeSeedRef.current = seedKey;
  }, [colaboradorId, equipeIdsUsuario, isEditMode]);

  useEffect(() => {
    if (!erro) return;
    setErro('');
  }, [ativo, equipeIds, erro, matricula, nome, perfil, pin, primeiroNome]);

  const equipesAtivas = useMemo(
    () => equipes.filter((item) => item.ativa && !item.deletadoEm),
    [equipes],
  );
  const carregandoFormulario = isEditMode && carregandoColaborador;
  const perfilNormalizado = normalizePerfilUsuario(perfil);
  const exigeEquipe =
    perfilNormalizado === 'colaborador' || perfilNormalizado === 'fiscal';
  const podeSalvar =
    !carregandoFormulario &&
    nome.trim().length > 0 &&
    matricula.trim().length > 0 &&
    (isEditMode || pin.length === 4 || pin.length === 6) &&
    (!exigeEquipe || equipeIds.length > 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: nome.trim(),
        primeiroNome: primeiroNome.trim(),
        matricula: matricula.trim(),
        ativo,
        pin: pin || undefined,
        perfil: perfilNormalizado,
        equipeIds,
      };

      if (!payload.nome || !payload.matricula) {
        throw new Error('Preencha nome completo e matrícula.');
      }

      if (exigeEquipe && payload.equipeIds.length === 0) {
        throw new Error('Selecione ao menos uma equipe para este perfil.');
      }

      if (isEditMode) {
        if (!colaborador) {
          throw new Error('Usuário não encontrado para edição.');
        }

        return atualizarColaborador(colaborador, payload);
      }

      return cadastrarColaborador({
        ...payload,
        pin: pin,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
        queryClient.invalidateQueries({ queryKey: ['colaboradores'] }),
        queryClient.invalidateQueries({ queryKey: ['colaboradores', 'todos'] }),
        queryClient.invalidateQueries({ queryKey: ['colaboradores', colaboradorId] }),
        queryClient.invalidateQueries({
          queryKey: ['colaboradores', colaboradorId, 'equipes'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['colaboradores', usuarioAtual?.id, 'equipes'],
        }),
        queryClient.invalidateQueries({ queryKey: ['usuarioEquipes'] }),
        queryClient.invalidateQueries({ queryKey: ['equipes'] }),
      ]);
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
              Apenas administradores podem cadastrar, editar ou inativar
              usuários.
            </p>
          </CardContent>
        </Card>
      </LayoutMobile>
    );
  }

  if (isEditMode && colaboradorCarregado && !colaborador) {
    return (
      <LayoutMobile
        title="Editar usuário"
        subtitle="Registro indisponível"
        onBack={() => navigate(returnTo)}
      >
        <Card className="surface-card">
          <CardContent className="p-5">
            <p className="text-sm text-[var(--qc-text-muted)]">
              O usuário informado não foi encontrado ou não está mais
              disponível.
            </p>
          </CardContent>
        </Card>
      </LayoutMobile>
    );
  }

  const perfilTravado =
    quickHelperMode && !canManageUsers(usuarioAtual?.perfil);

  return (
    <LayoutMobile
      title={
        isEditMode
          ? 'Editar usuário'
          : quickHelperMode
            ? 'Novo ajudante'
            : 'Novo usuário'
      }
      subtitle="Cadastro profissional para operação de campo"
      onBack={() => navigate(returnTo)}
    >
      <form className="stack-lg" onSubmit={handleSubmit}>
        <Card className="surface-card">
          <CardContent className="stack-md p-5">
            <div className="input-block">
              <label>Nome completo</label>
              <Input
                value={nome}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setNome(event.target.value)
                }
              />
            </div>

            <div className="input-block">
              <label>Primeiro nome</label>
              <Input
                value={primeiroNome}
                placeholder="Opcional. Se vazio, será extraído do nome."
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setPrimeiroNome(event.target.value)
                }
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
                <select
                  className="h-12 w-full rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 text-sm text-[var(--qc-text)] shadow-sm outline-none transition focus:border-[var(--qc-primary)] focus:bg-[var(--qc-surface)] focus:ring-4 focus:ring-[rgba(210,231,211,0.85)]"
                  value={perfil}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    setPerfil(event.target.value)
                  }
                  disabled={perfilTravado}
                >
                  {PERFIS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
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
              <label>{isEditMode ? 'Novo PIN (opcional)' : 'PIN'}</label>
              <Input
                type="tel"
                value={pin}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={6}
                placeholder={isEditMode ? 'Mantenha vazio para não alterar' : '4 ou 6 dígitos'}
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
                  Para colaborador e fiscal, ao menos uma equipe deve ser
                  selecionada. Para fiscal chefe e administrador, o vínculo é
                  opcional.
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

        {!isEditMode && exigeEquipe && equipeIds.length === 0 ? (
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
          {mutation.isPending
            ? 'Salvando usuário'
            : isEditMode
              ? 'Salvar alterações'
              : 'Salvar usuário'}
        </Button>
      </form>
    </LayoutMobile>
  );
}
