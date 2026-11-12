import { describe, expect, it } from 'vitest';
import { parseCredentials } from '../src/credentials.ts';

const valid = {
  host: 'localhost',
  port: 7434,
  pin: 'pin',
  token: 'token',
  deviceId: 'device-id',
  deviceName: 'VS Code (mac)',
  role: 'owner',
};

describe('parseCredentials', () => {
  it('aceita credenciais válidas', () => {
    expect(parseCredentials(JSON.stringify(valid))).toEqual(valid);
  });

  it('devolve undefined para JSON inválido', () => {
    expect(parseCredentials('{')).toBeUndefined();
    expect(parseCredentials('null')).toBeUndefined();
    expect(parseCredentials('[]')).toBeUndefined();
  });

  it('devolve undefined para campo faltando', () => {
    expect(parseCredentials(JSON.stringify({ ...valid, token: undefined }))).toBeUndefined();
    expect(parseCredentials(JSON.stringify({ ...valid, deviceName: '' }))).toBeUndefined();
    expect(parseCredentials(JSON.stringify({ ...valid, role: '' }))).toBeUndefined();
  });

  it('devolve undefined para porta inválida', () => {
    expect(parseCredentials(JSON.stringify({ ...valid, port: 0 }))).toBeUndefined();
    expect(parseCredentials(JSON.stringify({ ...valid, port: 65536 }))).toBeUndefined();
    expect(parseCredentials(JSON.stringify({ ...valid, port: 7434.5 }))).toBeUndefined();
    expect(parseCredentials(JSON.stringify({ ...valid, port: '7434' }))).toBeUndefined();
  });

  it('devolve undefined para entrada ausente', () => {
    expect(parseCredentials(undefined)).toBeUndefined();
  });

  it('remove campos extras', () => {
    const withExtras = { ...valid, extra: 'ignorado' };
    expect(parseCredentials(JSON.stringify(withExtras))).toEqual(valid);
  });
});
