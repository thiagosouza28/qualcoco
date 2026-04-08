export type EvaluationStatusMeta = {
  label: string;
  tone: 'pending' | 'success' | 'warning' | 'active' | 'reviewed';
};

export const getEvaluationStatusMeta = (status?: string | null): EvaluationStatusMeta => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'ok':
    case 'completed':
      return {
        label: 'Concluído',
        tone: 'success',
      };
    case 'revisado':
      return {
        label: 'Revisado',
        tone: 'reviewed',
      };
    case 'em_retoque':
      return {
        label: 'Em retoque',
        tone: 'active',
      };
    case 'refazer':
      return {
        label: 'Necessita retoque',
        tone: 'warning',
      };
    case 'draft':
    case 'in_progress':
    default:
      return {
        label: 'Pendente',
        tone: 'pending',
      };
  }
};
