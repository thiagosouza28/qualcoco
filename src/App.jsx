import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import SyncStatusBar from '@/components/SyncStatusBar';
import { createPageUrl, getJornadaId, getResponsavelNome } from '@/utils';

const IniciarJornada = lazy(() => import('@/pages/IniciarJornada'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const NovaAvaliacao = lazy(() => import('@/pages/NovaAvaliacao'));
const RegistroLinhas = lazy(() => import('@/pages/RegistroLinhas'));
const ResumoParcela = lazy(() => import('@/pages/ResumoParcela'));
const Relatorio = lazy(() => import('@/pages/Relatorio'));
const Historico = lazy(() => import('@/pages/Historico'));
const Equipes = lazy(() => import('@/pages/Equipes'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));

function IndexRedirect() {
  const hasResponsavel = Boolean(getResponsavelNome());
  const hasJornada = Boolean(getJornadaId());

  return (
    <Navigate
      to={
        hasResponsavel && hasJornada
          ? createPageUrl('Dashboard')
          : createPageUrl('IniciarJornada')
      }
      replace
    />
  );
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const hasResponsavel = Boolean(getResponsavelNome());

  if (!hasResponsavel) {
    return (
      <Navigate
        to={`${createPageUrl('IniciarJornada')}?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  return children;
}

function App() {
  return (
    <div className="min-h-screen">
      <SyncStatusBar />
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm font-semibold text-slate-500">
            Carregando QualCoco...
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<IndexRedirect />} />
          <Route path="/IniciarJornada" element={<IniciarJornada />} />
          <Route
            path="/Dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/NovaAvaliacao"
            element={
              <ProtectedRoute>
                <NovaAvaliacao />
              </ProtectedRoute>
            }
          />
          <Route
            path="/RegistroLinhas"
            element={
              <ProtectedRoute>
                <RegistroLinhas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ResumoParcela"
            element={
              <ProtectedRoute>
                <ResumoParcela />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Relatorio"
            element={
              <ProtectedRoute>
                <Relatorio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Historico"
            element={
              <ProtectedRoute>
                <Historico />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Equipes"
            element={
              <ProtectedRoute>
                <Equipes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Configuracoes"
            element={
              <ProtectedRoute>
                <Configuracoes />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
