import crypto from 'crypto';
import path from 'path';

/**
 * Returns the SHA-256 hex digest of a string (used for QR and password-reset token hashing).
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Safely checks whether targetPath resides strictly inside rootDir without path traversal.
 */
export function isPathInsideRoot(rootDir: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);

  const normalizedRoot = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot;
  const normalizedTarget = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;

  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Parses either a JSON QR payload (`{"sessionId": "...", "token": "..."}`) or a raw token string.
 */
export function parseQrInput(rawInput: string): { token: string; sessionId?: string } {
  const trimmed = rawInput.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { token?: unknown; sessionId?: unknown };
      if (typeof parsed.token === 'string' && parsed.token.length > 0) {
        return {
          token: parsed.token,
          sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
        };
      }
    } catch {
      return { token: trimmed };
    }
  }
  return { token: trimmed };
}
