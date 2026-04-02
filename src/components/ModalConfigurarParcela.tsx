import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ModalConfigurarParcela({
  open,
  parcelaCodigo,
  initialValue,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  parcelaCodigo: string;
  initialValue?: { linhaInicial: number; linhaFinal: number } | null;
  onConfirm: (value: { linhaInicial: number; linhaFinal: number }) => void;
  onCancel: () => void;
}) {
  const [linhaInicial, setLinhaInicial] = useState('');
  const [linhaFinal, setLinhaFinal] = useState('');

  useEffect(() => {
    setLinhaInicial(String(initialValue?.linhaInicial || ''));
    setLinhaFinal(String(initialValue?.linhaFinal || ''));
  }, [initialValue, open]);

  const disabled =
    !linhaInicial ||
    !linhaFinal ||
    Number(linhaInicial) <= 0 ||
    Number(linhaFinal) <= 0 ||
    Number(linhaFinal) < Number(linhaInicial);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configuração da parcela {parcelaCodigo}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            min="1"
            placeholder="Linha inicial"
            value={linhaInicial}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setLinhaInicial(event.target.value)
            }
          />
          <Input
            type="number"
            min="1"
            placeholder="Linha final"
            value={linhaFinal}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setLinhaFinal(event.target.value)
            }
          />
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={disabled}
            onClick={() =>
              onConfirm({
                linhaInicial: Number(linhaInicial),
                linhaFinal: Number(linhaFinal),
              })
            }
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
