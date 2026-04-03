import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutMobile } from '@/components/LayoutMobile';
import { useCampoApp } from '@/core/AppProvider';
import { finalizarAvaliacao, obterAvaliacaoDetalhada, salvarRegistroColeta } from '@/core/evaluations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const formatarAlinhamentoTipo = (value: 'inferior-impar' | 'inferior-par') =>
  value === 'inferior-impar' ? 'Ímpar' : 'Par';

export function TelaDetalheAvaliacao() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { usuarioAtual } = useCampoApp();
  const [drafts, setDrafts] = useState<Record<string, { quantidade: string; observacoes: string }>>({});
  const [responsavelId, setResponsavelId] = useState('');

  const { data, isFetched } = useQuery({
    queryKey: ['avaliacao', id, usuarioAtual?.id],
    queryFn: () => obterAvaliacaoDetalhada(id, usuarioAtual?.id),
    enabled: Boolean(id && usuarioAtual?.id),
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

  return (
    <LayoutMobile
      title="Detalhes da avaliação"
      subtitle={data?.avaliacao?.status === 'completed' ? 'Finalizada' : 'Coleta em andamento'}
      onBack={() => navigate('/historico')}
    >
      <div className="stack-lg">
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
                        onChange={(event: any) =>
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
                        onChange={(event: any) =>
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
          {finalizeMutation.isPending ? 'Finalizando...' : 'Finalizar avaliação'}
        </Button>
      </div>
    </LayoutMobile>
  );
}
