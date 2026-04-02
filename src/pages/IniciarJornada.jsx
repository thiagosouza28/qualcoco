import { Palmtree } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createPageUrl,
  generateJornadaId,
  getDataBrasil,
  getJornadaId,
  getResponsavelNome,
  setResponsavelNome,
  STORAGE_KEYS,
} from '@/utils';

function IniciarJornada() {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');

  useEffect(() => {
    setNome(getResponsavelNome());
    if (getResponsavelNome() && getJornadaId()) {
      navigate(createPageUrl('Dashboard'), { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) return;

    setResponsavelNome(nomeNormalizado);
    window.localStorage.setItem(STORAGE_KEYS.jornadaId, generateJornadaId());
    window.localStorage.setItem(STORAGE_KEYS.jornadaData, getDataBrasil());
    navigate(createPageUrl('Dashboard'), { replace: true });
  };

  return (
    <main className="safe-page-screen min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800 px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col justify-between">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/10 p-7 shadow-soft backdrop-blur">
          <div className="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="absolute -bottom-12 left-0 h-36 w-36 rounded-full bg-lime-300/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-white/12">
              <Palmtree className="h-8 w-8" />
            </div>
            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.28em] text-emerald-200">
              Controle de qualidade
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight">
              QualCoco
            </h1>
            <p className="mt-3 max-w-sm text-sm text-emerald-100/90">
              Registro mobile-first para fiscais acompanharem a qualidade da colheita de coco em campo.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-panel mt-6 space-y-4 border-white/10 bg-white/95 p-6 text-slate-900"
        >
          <div>
            <label htmlFor="responsavel" className="text-sm font-semibold text-slate-800">
              Nome do responsável
            </label>
            <Input
              id="responsavel"
              placeholder="Ex.: João Silva"
              autoComplete="name"
              className="mt-2"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="w-full">
            Iniciar Jornada
          </Button>
        </form>
      </div>
    </main>
  );
}

export default IniciarJornada;
