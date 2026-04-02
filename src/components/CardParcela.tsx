import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils';

export function CardParcela({
  codigo,
  configurada,
  selecionada,
  onClick,
}: {
  codigo: string;
  configurada: boolean;
  selecionada: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={selecionada ? 'default' : 'outline'}
      className={cn(
        'chip-parcela',
        selecionada && 'chip-parcela--selected',
      )}
      onClick={onClick}
    >
      <span>{codigo}</span>
      {configurada ? <CheckCircle2 className="h-4 w-4" /> : null}
    </Button>
  );
}
