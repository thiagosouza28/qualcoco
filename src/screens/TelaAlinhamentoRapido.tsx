import { type ChangeEvent, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LayoutMobile } from '@/components/LayoutMobile';
import { MAX_ALINHAMENTO, MAX_RUAS_POR_ALINHAMENTO } from '@/core/constants';
import {
  type AlinhamentoTipo,
  gerarRuasComOffset,
  normalizarLinhaInicialPorAlinhamento,
} from '@/core/plots';
import { cn } from '@/utils';

const formatarLinha = (value: number) => String(value).padStart(2, '0');

const formatarTipo = (tipo: AlinhamentoTipo) =>
  tipo === 'inferior-par' ? 'PAR' : 'ÍMPAR';

const fallbackInicioPorTipo = (tipo: AlinhamentoTipo) =>
  tipo === 'inferior-par' ? 2 : 1;

const parsearInteiroPositivo = (value: string, fallback: number) => {
  const numero = Math.trunc(Number(value));
  return Number.isFinite(numero) && numero > 0 ? numero : fallback;
};

const limparNumero = (value: string) => value.replace(/\D/g, '').slice(0, 3);

const limitar = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizarInicioRapido = (
  linhaInicial: string,
  alinhamentoTipo: AlinhamentoTipo,
) => {
  const fallback = fallbackInicioPorTipo(alinhamentoTipo);
  const inicio = normalizarLinhaInicialPorAlinhamento(
    linhaInicial,
    alinhamentoTipo,
    fallback,
  );

  if (inicio + 1 <= MAX_ALINHAMENTO) {
    return inicio;
  }

  return normalizarLinhaInicialPorAlinhamento(
    MAX_ALINHAMENTO - 1,
    alinhamentoTipo,
    fallback,
  );
};

export function TelaAlinhamentoRapido() {
  const navigate = useNavigate();
  const [alinhamentoTipo, setAlinhamentoTipo] =
    useState<AlinhamentoTipo>('inferior-impar');
  const [alinhamentoInicial, setAlinhamentoInicial] = useState('1');
  const [alinhamentoFinal, setAlinhamentoFinal] = useState('16');
  const [quantidadeRuas, setQuantidadeRuas] = useState('8');

  const resultado = useMemo(() => {
    const inicioAjustado = normalizarInicioRapido(
      alinhamentoInicial,
      alinhamentoTipo,
    );
    const inicioDigitado = parsearInteiroPositivo(
      alinhamentoInicial,
      fallbackInicioPorTipo(alinhamentoTipo),
    );
    const finalDigitado = parsearInteiroPositivo(
      alinhamentoFinal,
      inicioAjustado + 1,
    );
    const finalAjustado = limitar(
      finalDigitado,
      inicioAjustado + 1,
      MAX_ALINHAMENTO,
    );
    const totalLinhas = finalAjustado - inicioAjustado + 1;
    const maxRuas = Math.max(
      1,
      Math.floor(totalLinhas / 2),
    );
    const quantidadeDigitada = parsearInteiroPositivo(quantidadeRuas, 8);
    const totalRuas = limitar(quantidadeDigitada, 1, maxRuas);
    const divisoes = gerarRuasComOffset({
      totalRuas,
      alinhamentoTipo,
      linhaInicio: inicioAjustado,
      linhaFim: finalAjustado,
    }).map(([linhaInicial, linhaFim], index) => ({
      numero: index + 1,
      linhaInicial,
      linhaFinal: linhaFim,
    }));

    return {
      inicioAjustado,
      inicioDigitado,
      inicioFoiAjustado: inicioAjustado !== inicioDigitado,
      finalAjustado,
      finalDigitado,
      finalFoiAjustado: finalAjustado !== finalDigitado,
      quantidadeDigitada,
      quantidadeFoiAjustada: totalRuas !== quantidadeDigitada,
      maxRuas,
      totalLinhas,
      totalRuas,
      totalDivisoes: divisoes.length,
      linhaFinal: finalAjustado,
      divisoes,
    };
  }, [alinhamentoFinal, alinhamentoInicial, alinhamentoTipo, quantidadeRuas]);

  const alterarTipo = (tipo: AlinhamentoTipo) => {
    const inicioAjustado = normalizarInicioRapido(alinhamentoInicial, tipo);
    setAlinhamentoTipo(tipo);
    setAlinhamentoInicial(String(inicioAjustado));
  };

  const ajustarCampos = () => {
    setAlinhamentoInicial(String(resultado.inicioAjustado));
    setAlinhamentoFinal(String(resultado.finalAjustado));
    setQuantidadeRuas(String(resultado.totalRuas));
  };

  const alterarAlinhamentoInicial = (event: ChangeEvent<HTMLInputElement>) => {
    setAlinhamentoInicial(limparNumero(event.target.value));
  };

  const alterarAlinhamentoFinal = (event: ChangeEvent<HTMLInputElement>) => {
    setAlinhamentoFinal(limparNumero(event.target.value));
  };

  const alterarQuantidadeRuas = (event: ChangeEvent<HTMLInputElement>) => {
    setQuantidadeRuas(limparNumero(event.target.value));
  };

  const alterarQuantidadePorPasso = (delta: number) => {
    const quantidadeAtual = parsearInteiroPositivo(
      quantidadeRuas,
      resultado.totalRuas,
    );
    setQuantidadeRuas(
      String(limitar(quantidadeAtual + delta, 1, resultado.maxRuas)),
    );
  };

  return (
    <LayoutMobile
      title="Alinhamento rápido"
      subtitle="Divisão de ruas"
      onBack={() => navigate('/dashboard')}
      contentClassName="pb-8"
    >
      <Card className="border-none bg-white shadow-sm">
        <CardContent className="space-y-5 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={alinhamentoTipo === 'inferior-impar' ? 'default' : 'outline'}
              className="h-12 rounded-xl"
              onClick={() => alterarTipo('inferior-impar')}
            >
              ÍMPAR
            </Button>
            <Button
              type="button"
              variant={alinhamentoTipo === 'inferior-par' ? 'default' : 'outline'}
              className="h-12 rounded-xl"
              onClick={() => alterarTipo('inferior-par')}
            >
              PAR
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="alinhamento-inicial" className="">
                  Alinhamento inicial
                </Label>
                <Input
                  id="alinhamento-inicial"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_ALINHAMENTO}
                  value={alinhamentoInicial}
                  onBlur={ajustarCampos}
                  onChange={alterarAlinhamentoInicial}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="alinhamento-final" className="">
                  Alinhamento final
                </Label>
                <Input
                  id="alinhamento-final"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_ALINHAMENTO}
                  value={alinhamentoFinal}
                  onBlur={ajustarCampos}
                  onChange={alterarAlinhamentoFinal}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantidade-ruas" className="">
                Quantidade de ruas
              </Label>
              <div className="flex h-12 items-center overflow-hidden rounded-2xl border border-[var(--qc-border)] bg-[var(--qc-surface-muted)] shadow-sm">
                <button
                  type="button"
                  aria-label="Diminuir quantidade de ruas"
                  className="h-full w-14 border-r border-[var(--qc-border)] text-lg font-black text-[var(--qc-secondary)]"
                  onClick={() => alterarQuantidadePorPasso(-1)}
                >
                  -
                </button>
                <input
                  id="quantidade-ruas"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.min(MAX_RUAS_POR_ALINHAMENTO, resultado.maxRuas)}
                  value={quantidadeRuas}
                  onBlur={ajustarCampos}
                  onChange={alterarQuantidadeRuas}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-center text-lg font-black text-[var(--qc-text)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="Aumentar quantidade de ruas"
                  className="h-full w-14 border-l border-[var(--qc-border)] text-lg font-black text-[var(--qc-secondary)]"
                  onClick={() => alterarQuantidadePorPasso(1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={resultado.inicioFoiAjustado ? 'red' : 'emerald'}>
              {resultado.inicioFoiAjustado ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {resultado.inicioFoiAjustado
                ? `Ajustado para ${formatarLinha(resultado.inicioAjustado)}`
                : 'Alinhamento correto'}
            </Badge>

            {resultado.quantidadeFoiAjustada ? (
              <Badge variant="amber">
                <AlertTriangle className="h-3.5 w-3.5" />
                Quantidade ajustada
              </Badge>
            ) : null}

            {resultado.finalFoiAjustado ? (
              <Badge variant="amber">
                <AlertTriangle className="h-3.5 w-3.5" />
                Final ajustado para {formatarLinha(resultado.finalAjustado)}
              </Badge>
            ) : null}

          </div>
        </CardContent>
      </Card>

      <Card className="border-none bg-white shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-[var(--qc-surface-muted)] p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--qc-text-muted)]">
                Total de linhas
              </p>
              <p className="mt-1 text-3xl font-black text-[var(--qc-text)]">
                {resultado.totalLinhas}
              </p>
            </div>

            <div className="rounded-[16px] bg-[var(--qc-surface-muted)] p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--qc-text-muted)]">
                Tipo
              </p>
              <p className="mt-1 text-3xl font-black text-[var(--qc-text)]">
                {formatarTipo(alinhamentoTipo)}
              </p>
            </div>

            <div className="rounded-[16px] bg-[var(--qc-surface-muted)] p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--qc-text-muted)]">
                Alinhamento
              </p>
              <p className="mt-1 text-2xl font-black text-[var(--qc-text)]">
                {formatarLinha(resultado.inicioAjustado)}-
                {formatarLinha(resultado.linhaFinal)}
              </p>
            </div>

            <div className="rounded-[16px] bg-[var(--qc-surface-muted)] p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--qc-text-muted)]">
                Ruas
              </p>
              <p className="mt-1 text-3xl font-black text-[var(--qc-text)]">
                {resultado.totalRuas}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none bg-white shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-[var(--qc-secondary)]">
            <ListChecks className="h-5 w-5" />
            <p className="text-sm font-black uppercase tracking-[0.12em]">
              Lista de divisões
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {resultado.divisoes.map((divisao) => (
              <div
                key={divisao.numero}
                className={cn(
                  'flex h-12 items-center justify-between rounded-[14px] border px-3',
                  'border-[var(--qc-border)] bg-[var(--qc-surface-muted)]',
                )}
              >
                <span className="text-xs font-extrabold text-[var(--qc-text-muted)]">
                  {String(divisao.numero).padStart(2, '0')}
                </span>
                <span className="text-lg font-black text-[var(--qc-text)]">
                  {formatarLinha(divisao.linhaInicial)}-
                  {formatarLinha(divisao.linhaFinal)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </LayoutMobile>
  );
}
