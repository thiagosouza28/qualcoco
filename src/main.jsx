import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import moment from 'moment';
import 'moment/locale/pt-br';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SyncProvider } from '@/components/SyncContext';
import './index.css';

moment.locale('pt-br');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SyncProvider>
          <App />
        </SyncProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
