import { CardParcela } from '@/components/CardParcela';

export function ListaParcelas({
  parcelas,
  configuradas,
  selecionadas,
  onSelect,
}: {
  parcelas: Array<{ id: string; codigo: string }>;
  configuradas: Record<string, unknown>;
  selecionadas: string[];
  onSelect: (parcelaId: string) => void;
}) {
  return (
    <div className="chips-grid">
      {parcelas.map((parcela) => (
        <CardParcela
          key={parcela.id}
          codigo={parcela.codigo}
          configurada={Boolean(configuradas[parcela.id])}
          selecionada={selecionadas.includes(parcela.id)}
          onClick={() => onSelect(parcela.id)}
        />
      ))}
    </div>
  );
}
