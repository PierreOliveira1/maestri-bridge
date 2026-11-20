import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { isSafeActivityPath } from '@maestri-bridge/core';

export function isFollowFileAllowed(file: string): boolean {
  return isSafeActivityPath(file) && !file.split('/').some((part) =>
    /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|credentials(?:\..*)?|id_(?:rsa|ed25519|ecdsa)(?:\..*)?)$/i.test(part) ||
    /\.(?:pem|key|p12|pfx)$/i.test(part),
  );
}

export async function resolveFollowFile(root: string, file: string): Promise<string | undefined> {
  if (!isFollowFileAllowed(file)) return undefined;
  try {
    const physicalRoot = await realpath(root);
    const physicalFile = await realpath(resolve(physicalRoot, file));
    const within = relative(physicalRoot, physicalFile);
    if (within === '' || within === '..' || within.startsWith('../') || within.startsWith('..\\') || isAbsolute(within)) {
      return undefined;
    }
    const info = await stat(physicalFile);
    return info.isFile() && info.size <= 1024 * 1024 ? physicalFile : undefined;
  } catch {
    return undefined;
  }
}
