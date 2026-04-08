import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutMobile } from '@/components/LayoutMobile';
import { useCampoApp } from '@/core/AppProvider';
import {
  criarRetoqueAvaliacao,
  finalizarAvaliacao,
  obterAvaliacaoDetalhada,
  salvarRegistroColeta,
} from '@/core/evaluations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { repository } from '@/core/repositories';

const formatarAlinhamentoTipo = (value: 'inferior-impar' | 'inferior-par') =>
  value === 'inferior-impar' ? 'Ímpar' : 'Par';

export function TelaDetalheAvaliacao() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const [drafts, setDrafts] = useState<Record<string, { quantidade: string; observacoes: string }>>({});
  const [responsavelId, setResponsavelId] = useState('');
  const [showRetoqueModal, setShowRetoqueModal] = useState(false);
  const [retoqueResponsavelId, setRetoqueResponsavelId] = useState('');
  const [retoqueParticipantes, setRetoqueParticipantes] = useState<string[]>([]);
  const [retoqueAcompanhado, setRetoqueAcompanhado] = useState(false);

  const { data, isFetched } = useQuery({
    queryKey: ['avaliacao', id, usuarioAtual?.id],
    queryFn: () => obterAvaliacaoDetalhada(id, usuarioAtual?.id),
    enabled: Boolean(id && usuarioAtual?.id),
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores', 'ativos'],
    queryFn: () => repository.list('colaboradores'),
  });

  useEffect(() => {
    if (isFetched && !data) {
      navigate('/historico', { replace: true });
    }
  }, [data, isFetched, navigate]);

  const grouped = useMemo(() => {
    if (!data) return [];
    return data.parcelas.map((parcela) => ({
      parcela,
      ruas: data.ruas.filter((rua) => rua.avaliacaoParcelaId === parcela.id),
    }));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      ruaId: string;
      parcelaId: string;
      quantidade: number;
      observacoes: string;
      quantidadeCachos3: number;
    }) => {
      const colaboradorId =
        responsavelId || data?.participantes[0]?.colaborador?.id || '';
      return salvarRegistroColeta({
        avaliacaoId: id,
        parcelaId: payload.parcelaId,
        ruaId: payload.ruaId,
        colaboradorId,
        quantidade: payload.quantidade,
        quantidadeCachos3: payload.quantidadeCachos3,
        observacoes: payload.observacoes,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['avaliacao', id] });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizarAvaliacao(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  const iniciarRetoqueMutation = useMutation({
    mutationFn: async () =>
      criarRetoqueAvaliacao({
        avaliacaoOriginalId: id,
        responsavelId: retoqueResponsavelId || usuarioAtual?.id || '',
        participanteIds: retoqueAcompanhado ? retoqueParticipantes : [],
      }),
    onSuccess: async (result) => {
      if (!result) return;
      await queryClient.invalidateQueries();
      setShowRetoqueModal(false);
      navigate(`/avaliacoes/${result.avaliacao.id}`);
    },
  });

  const handleIniciarRetoque = () => {
    if (!retoqueResponsavelId && !usuarioAtual?.id) {
      alert('Selecione o responsável principal do retoque.');
      return;
    }
    if (retoqueAcompanhado && retoqueParticipantes.length === 0) {
      alert('Selecione ao menos um ajudante para o retoque.');
      return;
    }
    iniciarRetoqueMutation.mutate();
  };

  return (
    <LayoutMobile
      title="Detalhes da avaliação"
      subtitle={data?.avaliacao?.status === 'completed' ? 'Finalizada' : 'Coleta em andamento'}
      onBack={() => navigate('/historico')}
    >
      <div className="stack-lg">
        <Dialog open={showRetoqueModal} onOpenChange={setShowRetoqueModal}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Iniciar retoque</DialogTitle>
            </DialogHeader>
            <div className="stack-md">
              <Select
                value={retoqueResponsavelId || usuarioAtual?.id || ''}
                onValueChange={setRetoqueResponsavelId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Responsável principal do retoque" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((colaborador) => (
                    <SelectItem key={colaborador.id} value={colaborador.id}>
                      {colaborador.primeiroNome} • {colaborador.matricula}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={retoqueAcompanhado ? 'default' : 'outline'}
                  onClick={() => setRetoqueAcompanhado(true)}
                >
                  Acompanhado
                </Button>
                <Button
                  type="button"
                  variant={!retoqueAcompanhado ? 'default' : 'outline'}
                  onClick={() => {
                    setRetoqueAcompanhado(false);
                    setRetoqueParticipantes([]);
                  }}
                >
                  Sozinho
                </Button>
              </div>

              {retoqueAcompanhado ? (
                <div className="grid grid-cols-2 gap-2">
                  {colaboradores
                    .filter((item) => item.id !== retoqueResponsavelId)
                    .map((colaborador) => {
                      const ativo = retoqueParticipantes.includes(colaborador.id);
                      return (
                        <Button
                          key={colaborador.id}
                          type="button"
                          variant={ativo ? 'default' : 'outline'}
                          onClick={() =>
                            setRetoqueParticipantes((current) =>
                              ativo
                                ? current.filter((item) => item !== colaborador.id)
                                : [...current, colaborador.id],
                            )
                          }
                        >
                          {colaborador.primeiroNome}
                        </Button>
                      );
                    })}
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowRetoqueModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleIniciarRetoque} disabled={iniciarRetoqueMutation.isPending}>
                {iniciarRetoqueMutation.isPending ? 'Iniciando retoque' : 'Iniciar retoque'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="surface-card">
          <CardContent className="stack-md p-5">
            <div className="stats-grid stats-grid--three">
              <div>
                <span className="eyebrow">Parcelas</span>
                <strong>{data?.parcelas.length || 0}</strong>
              </div>
              <div>
                <span className="eyebrow">Ruas</span>
                <strong>{data?.ruas.length || 0}</strong>
              </div>
              <div>
                <span className="eyebrow">Média</span>
                <strong>{data?.avaliacao?.mediaParcela.toFixed(2) || '0.00'}</strong>
              </div>
            </div>

            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger>
                <SelectValue placeholder="Colaborador responsável pelo registro" />
              </SelectTrigger>
              <SelectContent>
                {data?.participantes.map((item) =>
                  item.colaborador ? (
                    <SelectItem key={item.colaborador.id} value={item.colaborador.id}>
                      {item.colaborador.primeiroNome}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {data?.avaliacao?.status === 'refazer' && data?.avaliacao?.tipo !== 'retoque' ? (
          <Button type="button" size="lg" className="w-full" onClick={() => setShowRetoqueModal(true)}>
            Iniciar retoque
          </Button>
        ) : null}

        {grouped.map(({ parcela, ruas }) => (
          <Card key={parcela.id} className="surface-card">
            <CardContent className="stack-md p-5">
              <div>
                <p className="eyebrow">{parcela.parcelaCodigo}</p>
                <h3 className="section-title">
                  Linhas {parcela.linhaInicial} a {parcela.linhaFinal}
                </h3>
                {parcela.faixasFalha?.length ? (
                  <p className="mt-2 text-sm text-[var(--qc-text-muted)]">
                    Falha do alinhamento:{' '}
                    {parcela.faixasFalha
                      .map(
                        (faixa) =>
                          `${formatarAlinhamentoTipo(faixa.alinhamentoTipo)} ${faixa.linhaInicial}-${faixa.linhaFinal}`,
                      )
                      .join(' • ')}
                  </p>
                ) : null}
              </div>

              <div className="stack-md">
                {ruas.map((rua) => {
                  const draft = drafts[rua.id] || { quantidade: '', observacoes: '' };
                  const existente = data?.registros.find((item) => item.ruaId === rua.id);

                  return (
                    <div key={rua.id} className="record-row">
                      <div className="record-row__head">
                        <div className="flex flex-col gap-1">
                          <strong>Rua {rua.ruaNumero}</strong>
                          {rua.equipeNome ? (
                            <span className="sync-badge sync-badge--synced">{rua.equipeNome}</span>
                          ) : null}
                        </div>
                        <span>
                          {rua.linhaInicial} - {rua.linhaFinal}
                        </span>
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder={existente ? String(existente.quantidade) : 'Quantidade observada'}
                        value={draft.quantidade}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          setDrafts((current) => ({
                            ...current,
                            [rua.id]: {
                              ...draft,
                              quantidade: event.target.value,
                            },
                          }))
                        }
                      />
                      <Textarea
                        rows={2}
                        placeholder={existente?.observacoes || 'Observações da rua'}
                        value={draft.observacoes}
                        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                          setDrafts((current) => ({
                            ...current,
                            [rua.id]: {
                              ...draft,
                              observacoes: event.target.value,
                            },
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          saveMutation.mutate({
                            ruaId: rua.id,
                            parcelaId: rua.parcelaId,
                            quantidade: Number(draft.quantidade || existente?.quantidade || 0),
                            quantidadeCachos3: existente?.quantidadeCachos3 || 0,
                            observacoes: draft.observacoes || existente?.observacoes || '',
                          })
                        }
                      >
                        Salvar registro
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={finalizeMutation.isPending}
          onClick={() => finalizeMutation.mutate()}
        >
          {finalizeMutation.isPending ? 'Finalizando avaliação' : 'Finalizar avaliação'}
        </Button>

        {data?.logs?.length ? (
          <Card className="surface-card">
            <CardContent className="stack-md p-5">
              <h3 className="section-title">Histórico de atividade</h3>
              <div className="space-y-2">
                {data.logs.map((log) => (
                  <div key={log.id} className="text-sm text-[var(--qc-text-muted)]">
                    {new Date(log.criadoEm).toLocaleString('pt-BR')} • {log.descricao}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </LayoutMobile>
  );
}
