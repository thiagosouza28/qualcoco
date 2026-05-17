const sanitizeCodigoParcela = (value: string) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const formatarCodigoParcela = (value: string) => {
  const sanitized = sanitizeCodigoParcela(value);
  const prefixo = (sanitized.match(/^[A-Z]{1,2}/)?.[0] || '').slice(0, 2);
  const numeros = sanitized.slice(prefixo.length).replace(/\D/g, '');
  const blocoPrincipal = numeros.slice(0, 3);

  if (!prefixo) {
    return numeros.slice(0, 3);
  }

  if (!blocoPrincipal) {
    return prefixo;
  }

  return `${prefixo}-${blocoPrincipal}`;
};

export const normalizarCodigoParcela = (value: string) =>
  formatarCodigoParcela(value).replace(/\s+/g, '');

export const codigoParcelaCorrespondeBusca = (
  codigo: string,
  busca: string,
) => {
  const codigoNormalizado = normalizarCodigoParcela(codigo);
  const buscaNormalizada = normalizarCodigoParcela(busca);

  if (!buscaNormalizada) {
    return true;
  }

  return (
    codigoNormalizado.includes(buscaNormalizada) ||
    codigoNormalizado
      .replace(/-/g, '')
      .includes(buscaNormalizada.replace(/-/g, ''))
  );
};
