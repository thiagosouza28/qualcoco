const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const randomSalt = () => crypto.randomUUID().replaceAll('-', '');

export const validarPin = (pin: string) => /^\d{4}(\d{2})?$/.test(pin);

export const gerarHashPin = async (pin: string, salt = randomSalt()) => {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    baseKey,
    256,
  );

  return {
    salt,
    hash: toHex(bits),
  };
};

export const compararPin = async (pin: string, salt: string, hash: string) => {
  const generated = await gerarHashPin(pin, salt);
  return generated.hash === hash;
};
