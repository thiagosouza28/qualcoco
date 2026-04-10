import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Trees } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LayoutMobile } from '@/components/LayoutMobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCampoApp } from '@/core/AppProvider';
import { todayIso } from '@/core/date';
import { filtrarEquipesVisiveis, normalizePerfilUsuario } from '@/core/permissions';
import {
  cadastrarParcelaPlanejada,
  listarParcelasPlanejadasVisiveis,
} from '@/core/plannedParcels';

const formatarCodigoParcela = (value: string) => {
  const sanitized = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const letra = sanitized.slice(0, 1).replace(/[^A-Z]/g, '');
  const numeros = sanitized.slice(1).replace(/\D/g, '').slice(0, 3);

  if (!letra) return numeros;
  if (!numeros) return letra;
  return `${letra}-${numeros}`;
};

export function TelaParcelasPlanejadas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual, session } = useCampoApp();
  const perfil = normalizePerfilUsuario(usuarioAtual?.perfil);
  const [codigo, setCodigo] = useState('');
  const [equipeId, setEquipeId] = useState('');
  const [alinhamentoInicial, setAlinhamentoInicial] = useState('');
  const [alinhamentoFinal, setAlinhamentoFinal] = useState('');
  const [dataColheita, setDataColheita] = useState(todayIso());
  const [observacao, setObservacao] = useState('');

  const { data: equipes = [] } = useQuery({
    queryKey: ['equipes', 'parcelas-planejadas', usuarioAtual?.id],
    queryFn: () => filtrarEquipesVisiveis(usuarioAtual),
    enabled: Boolean(usuarioAtual?.id),
  });

  const { data: parcelasPlanejadas = [] } = useQuery({
    queryKey: ['parcelas-planejadas', usuarioAtual?.id, session?.equipeDiaId],
    queryFn: () =>
      listarParcelasPlanejadasVisiveis({
        usuarioId: usuarioAtual?.id,
        equipeId: session?.equipeDiaId || null,
        incluirConcluidas: true,
      }),
    enabled: Boolean(usuarioAtual?.id),
  });

  useEffect(() => {
    if (perfil === 'fiscal' && equipes[0] && !equipeId) {
      setEquipeId(equipes[0].id);
    }
  }, [equipeId, equipes, perfil]);

  const equipeBloqueada = perfil === 'fiscal' && equipes.length === 1;
  const grupos = useMemo(
    () => ({
      disponiveis: parcelasPlanejadas.filter((item) => item.status === 'disponivel'),
      andamento: parcelasPlanejadas.filter((item) => item.status === 'em_andamento'),
      retoque: parcelasPlanejadas.filter((item) => item.status === 'em_retoque'),
    }),
    [parcelasPlanejadas],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!usuarioAtual?.id) {
        throw new Error('Usuario atual nao encontrado.');
      }

      return cadastrarParcelaPlanejada({
        codigo,
        equipeId: equipeId || null,
        alinhamentoInicial: Number(alinhamentoInicial),
        alinhamentoFinal: Number(alinhamentoFinal),
        dataColheita,
        observacao,
        criadoPor: usuarioAtual.id,
        origem: perfil === 'fiscal' ? 'fiscal' : 'colaborador',
      });
    },
    onSuccess: async () => {
      setCodigo('');
      setAlinhamentoInicial('');
      setAlinhamentoFinal('');
      setObservacao('');
      await queryClient.invalidateQueries({ queryKey: ['parcelas-planejadas'] });
      await queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Falha ao cadastrar a parcela.');
    },
  });

  return (
    <LayoutMobile
      title="Parcelas"
      subtitle="Cadastro planejado e fila do dia"
      onBack={() => navigate('/dashboard')}
      showBottomNav
    >
      <div className="stack-lg pb-24">
        <Card className="surface-card border-none shadow-sm">
          <CardContent className="stack-md p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[rgba(0,107,68,0.08)] text-[var(--qc-primary)]">
                <Trees className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight text-[var(--qc-text)]">
                  Cadastrar parcela
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                  O cadastro planejado alimenta a operacao do dia e dispara notificacao para a equipe.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={codigo}
                placeholder="Codigo da parcela"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setCodigo(formatarCodigoParcela(event.target.value))
                }
              />
              <Select
                value={equipeId}
                onValueChange={setEquipeId}
                disabled={equipeBloqueada}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Equipe" />
                </SelectTrigger>
                <SelectContent>
                  {equipes.map((equipe) => (
                    <SelectItem key={equipe.id} value={equipe.id}>
                      {String(equipe.numero).padStart(2, '0')} • {equipe.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                inputMode="numeric"
                min="1"
                value={alinhamentoInicial}
                placeholder="Alinhamento inicial"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAlinhamentoInicial(event.target.value.replace(/\D/g, '').slice(0, 3))
                }
              />
              <Input
                type="number"
                inputMode="numeric"
                min="1"
                value={alinhamentoFinal}
                placeholder="Alinhamento final"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAlinhamentoFinal(event.target.value.replace(/\D/g, '').slice(0, 3))
                }
              />
              <Input
                type="date"
                value={dataColheita}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDataColheita(event.target.value)
                }
              />
              <div className="rounded-[18px] border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] px-4 py-3 text-sm text-[var(--qc-text-muted)]">
                Origem registrada como{' '}
                <strong className="text-[var(--qc-primary)]">
                  {perfil === 'fiscal' ? 'fiscal' : 'colaborador'}
                </strong>
                .
              </div>
              <div className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={observacao}
                  placeholder="Observacao opcional"
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setObservacao(event.target.value)
                  }
                />
              </div>
            </div>

            <Button
              type="button"
              className="h-12 rounded-[18px] font-bold"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              <Plus className="h-5 w-5" />
              {mutation.isPending ? 'Salvando parcela' : 'Salvar parcela'}
            </Button>
          </CardContent>
        </Card>

        {[
          ['Disponiveis', grupos.disponiveis],
          ['Em andamento', grupos.andamento],
          ['Em retoque', grupos.retoque],
        ].map(([titulo, items]) => (
          <section key={titulo} className="stack-md">
            <div className="px-1">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--qc-secondary)]">
                {titulo}
              </p>
            </div>

            {items.length === 0 ? (
              <Card className="surface-card border-none shadow-sm">
                <CardContent className="p-4 text-sm text-[var(--qc-text-muted)]">
                  Nenhuma parcela nesta faixa.
                </CardContent>
              </Card>
            ) : (
              items.map((parcela) => (
                <Card key={parcela.id} className="surface-card border-none shadow-sm">
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="text-lg font-black tracking-tight text-[var(--qc-text)]">
                        {parcela.codigo}
                      </p>
                      <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                        Equipe {parcela.equipeNome || '--'} • Colheita {parcela.dataColheita}
                      </p>
                      <p className="mt-1 text-sm text-[var(--qc-text-muted)]">
                        Alinhamento {parcela.alinhamentoInicial}-{parcela.alinhamentoFinal}
                      </p>
                    </div>
                    {parcela.status === 'disponivel' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() =>
                          navigate(`/avaliacoes/nova?parcelaPlanejadaId=${parcela.id}`)
                        }
                      >
                        Iniciar
                      </Button>
                    ) : (
                      <div className="inline-flex h-11 items-center rounded-2xl border border-[var(--qc-border)] px-4 text-sm font-bold text-[var(--qc-secondary)]">
                        {parcela.status}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        ))}

        <Card className="surface-card border-none shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[rgba(0,107,68,0.08)] text-[var(--qc-primary)]">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-[var(--qc-text)]">
                Notificacao automatica
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--qc-text-muted)]">
                Cada parcela cadastrada aqui gera alerta de nova parcela disponivel para os colaboradores.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </LayoutMobile>
  );
}
