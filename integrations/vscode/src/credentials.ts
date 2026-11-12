import type { Credentials } from '@maestri-bridge/core';

export function parseCredentials(raw: string | undefined): Credentials | undefined {
  if (raw === undefined) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  const { host, port, pin, token, deviceId, deviceName, role } = record;

  if (!isNonEmptyString(host) || !isValidPort(port)) {
    return undefined;
  }
  if (
    !isNonEmptyString(pin) ||
    !isNonEmptyString(token) ||
    !isNonEmptyString(deviceId) ||
    !isNonEmptyString(deviceName) ||
    !isNonEmptyString(role)
  ) {
    return undefined;
  }

  return { host, port, pin, token, deviceId, deviceName, role };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}
