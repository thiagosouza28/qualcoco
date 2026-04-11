const sanitizeCodigoParcela = (value: string) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const formatarCodigoParcela = (value: string) => {
  const sanitized = sanitizeCodigoParcela(value);
  const letra = sanitized.slice(0, 1).replace(/[^A-Z]/g, '');
  const numeros = sanitized.slice(1).replace(/\D/g, '');
  const blocoPrincipal = numeros.slice(0, 3);

  if (!letra) {
    return numeros.slice(0, 3);
  }

  if (!blocoPrincipal) {
    return letra;
  }

  return `${letra}-${blocoPrincipal}`;
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
