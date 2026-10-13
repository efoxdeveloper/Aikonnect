import { createCipheriv, createDecipheriv, createHmac, pbkdf2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);

const algorithm = 'aes-256-cbc';
const iterations = 65_536;
const iv = Buffer.from(Array.from({ length: 16 }, (_, index) => index));

export const encrypt = async (payload: string, key: string, salt = key): Promise<string> => {
  const cipher = createCipheriv(algorithm, await derive(key, salt, iterations, 32, 'sha512'), iv);
  return Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]).toString('hex');
};

export const decrypt = async (payload: string, key: string, salt = key): Promise<string> => {
  if (!/^[a-f0-9]+$/i.test(payload) || payload.length % 32 !== 0)
    throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv(
    algorithm,
    await derive(key, salt, iterations, 32, 'sha512'),
    iv,
  );
  return Buffer.concat([decipher.update(Buffer.from(payload, 'hex')), decipher.final()]).toString(
    'utf8',
  );
};

export const sign = (payload: string, hashKey: string): string =>
  createHmac('sha512', hashKey).update(payload, 'utf8').digest('hex');

export const verify = (payload: string, signature: string, hashKey: string): boolean => {
  const expected = Buffer.from(sign(payload, hashKey), 'utf8');
  const received = Buffer.from(signature.toLowerCase(), 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
};
