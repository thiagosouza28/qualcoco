import { type ChangeEvent, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LayoutMobile } from '@/components/LayoutMobile';
import { MAX_ALINHAMENTO } from '@/core/constants';
import {
  type AlinhamentoTipo,
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
    const maxLinhas = Math.max(2, MAX_ALINHAMENTO - inicioAjustado + 1);
    const quantidadeDigitada = parsearInteiroPositivo(quantidadeRuas, 8);
    const totalLinhas = limitar(quantidadeDigitada, 2, maxLinhas);
    const totalDivisoes = Math.floor(totalLinhas / 2);
    const linhaFinal = inicioAjustado + totalLinhas - 1;
    const sobraLinha = totalLinhas % 2 === 1;
    const divisoes = Array.from({ length: totalDivisoes }, (_, index) => {
      const linhaInicial = inicioAjustado + index * 2;
      return {
        numero: index + 1,
        linhaInicial,
        linhaFinal: linhaInicial + 1,
      };
    });

    return {
      inicioAjustado,
      inicioDigitado,
      inicioFoiAjustado: inicioAjustado !== inicioDigitado,
      quantidadeDigitada,
      quantidadeFoiAjustada: totalLinhas !== quantidadeDigitada,
      totalLinhas,
      totalDivisoes,
      linhaFinal,
      sobraLinha,
      divisoes,
    };
  }, [alinhamentoInicial, alinhamentoTipo, quantidadeRuas]);

  const alterarTipo = (tipo: AlinhamentoTipo) => {
    const inicioAjustado = normalizarInicioRapido(alinhamentoInicial, tipo);
    setAlinhamentoTipo(tipo);
    setAlinhamentoInicial(String(inicioAjustado));
  };

  const ajustarCampos = () => {
    setAlinhamentoInicial(String(resultado.inicioAjustado));
    setQuantidadeRuas(String(resultado.totalLinhas));
  };

  const alterarAlinhamentoInicial = (event: ChangeEvent<HTMLInputElement>) => {
    setAlinhamentoInicial(limparNumero(event.target.value));
  };

  const alterarQuantidadeRuas = (event: ChangeEvent<HTMLInputElement>) => {
    setQuantidadeRuas(limparNumero(event.target.value));
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
              <Label htmlFor="quantidade-ruas" className="">
                Quantidade de ruas
              </Label>
              <Input
                id="quantidade-ruas"
                type="number"
                inputMode="numeric"
                min={2}
                max={MAX_ALINHAMENTO}
                value={quantidadeRuas}
                onBlur={ajustarCampos}
                onChange={alterarQuantidadeRuas}
              />
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

            {resultado.sobraLinha ? (
              <Badge variant="amber">
                <AlertTriangle className="h-3.5 w-3.5" />1 rua sem par
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
                Divisoes
              </p>
              <p className="mt-1 text-3xl font-black text-[var(--qc-text)]">
                {resultado.totalDivisoes}
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
