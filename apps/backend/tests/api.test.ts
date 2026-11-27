import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { app } from '../src/app';
import { isPathInsideRoot, parseQrInput, sha256 } from '../src/lib/security';
import {
  AUTH_COOKIE_NAME,
  extractToken,
  requireRole,
  signAuthToken,
} from '../src/middleware/auth';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'capstone_test_secret_min_32_chars_long';

class MemorySocket extends Duplex {
  override _read(): void {}
  override _write(
    _chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}

async function invokeApp(
  urlPath: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<{ status: number; headers: http.OutgoingHttpHeaders; json: Record<string, unknown> }> {
  const socket = new MemorySocket() as unknown as net.Socket;
  const req = new http.IncomingMessage(socket);
  req.method = options?.method ?? 'GET';
  req.url = urlPath;
  req.headers = {
    host: '127.0.0.1:4000',
    ...(options?.headers ?? {}),
  };

  const payloadString = options?.body !== undefined ? JSON.stringify(options.body) : undefined;
  if (payloadString !== undefined) {
    const buf = Buffer.from(payloadString, 'utf8');
    req.headers['content-type'] = 'application/json';
    req.headers['content-length'] = String(buf.length);
    req.push(buf);
  }
  req.push(null);

  const res = new http.ServerResponse(req);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const result = (origEnd as (...args: unknown[]) => http.ServerResponse)(chunk, ...rest);
      const rawText = Buffer.concat(chunks).toString('utf8');
      const jsonBodyStart = rawText.indexOf('\r\n\r\n');
      const bodyOnly = jsonBodyStart >= 0 ? rawText.slice(jsonBodyStart + 4) : rawText;
      try {
        const parsed = bodyOnly ? (JSON.parse(bodyOnly) as Record<string, unknown>) : {};
        resolve({
          status: res.statusCode,
          headers: res.getHeaders(),
          json: parsed,
        });
      } catch (err) {
        reject(err);
      }
      return result;
    }) as typeof res.end;

    res.assignSocket(socket);
    app(req, res);
  });
}

describe('Security & QR Helper Unit Tests', () => {
  it('hashes tokens deterministically with SHA-256', () => {
    const hashA = sha256('sample-token-123');
    const hashB = sha256('sample-token-123');
    const hashC = sha256('different-token');
    assert.equal(hashA, hashB);
    assert.notEqual(hashA, hashC);
    assert.equal(hashA.length, 64);
  });

  it('prevents directory traversal outside upload root', () => {
    const root = path.resolve(process.cwd(), 'uploads');
    assert.equal(isPathInsideRoot(root, path.join(root, 'room-301', 'snapshot.jpg')), true);
    assert.equal(isPathInsideRoot(root, root), false);
    assert.equal(isPathInsideRoot(root, path.resolve(root, '..', 'secrets.txt')), false);
    assert.equal(isPathInsideRoot(root, path.resolve(root, '..', 'uploads-evil', 'file.png')), false);
  });

  it('parses both JSON QR payloads and raw token strings', () => {
    const jsonPayload = JSON.stringify({ sessionId: 'sess-101', token: 'abc123token' });
    assert.deepEqual(parseQrInput(jsonPayload), {
      sessionId: 'sess-101',
      token: 'abc123token',
    });

    assert.deepEqual(parseQrInput('  raw-token-xyz  '), {
      token: 'raw-token-xyz',
    });

    assert.deepEqual(parseQrInput('{malformed-json'), {
      token: '{malformed-json',
    });
  });
});

describe('Auth Middleware Unit Tests', () => {
  it('extracts JWT from cookie first, then Bearer header', () => {
    const reqCookie = {
      cookies: { [AUTH_COOKIE_NAME]: 'cookie-jwt' },
      headers: { authorization: 'Bearer header-jwt' },
    } as unknown as Request;
    assert.equal(extractToken(reqCookie), 'cookie-jwt');

    const reqHeader = {
      cookies: {},
      headers: { authorization: 'Bearer header-jwt' },
    } as unknown as Request;
    assert.equal(extractToken(reqHeader), 'header-jwt');

    const reqEmpty = { cookies: {}, headers: {} } as unknown as Request;
    assert.equal(extractToken(reqEmpty), null);
  });

  it('signs valid JWT and enforces RBAC roles cleanly', () => {
    const token = signAuthToken({
      id: 'user-1',
      email: 'admin@centreguard.local',
      fullName: 'Admin User',
      role: 'ADMIN',
    });
    assert.equal(token.split('.').length, 3);

    const guard = requireRole('ADMIN', 'FACILITY_MANAGER');
    let nextCalled = false;
    let statusCode = 0;
    let body: unknown = null;

    const makeRes = () =>
      ({
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          body = payload;
          return this;
        },
      }) as unknown as Response;

    guard({} as Request, makeRes(), () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);

    statusCode = 0;
    guard(
      { user: { id: 'u2', email: 's@test.local', fullName: 'Student', role: 'STUDENT' } } as Request,
      makeRes(),
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);
    assert.match(String((body as { error: string }).error), /Access denied/);

    statusCode = 0;
    guard(
      { user: { id: 'u3', email: 'fm@test.local', fullName: 'FM', role: 'FACILITY_MANAGER' } } as Request,
      makeRes(),
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, true);
    assert.equal(statusCode, 0);
  });
});

describe('HTTP API Surface, Security Headers & Auth Guards', () => {
  it('returns API metadata and helmet security headers on GET / and GET /api/health', async () => {
    const rootRes = await invokeApp('/');
    assert.equal(rootRes.status, 200);
    assert.equal(rootRes.headers['x-content-type-options'], 'nosniff');
    assert.equal(rootRes.json.healthEndpoint, '/api/health');

    const healthRes = await invokeApp('/api/health');
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.json.status, 'ok');
    assert.equal(healthRes.json.service, 'capstone-backend');
    assert.ok(['connected', 'disconnected'].includes(String(healthRes.json.database)));
  });

  it('rejects malformed auth registration and login inputs with 400 before hitting DB', async () => {
    const badRegister = await invokeApp('/api/auth/register', {
      method: 'POST',
      body: { fullName: 'A', email: 'not-an-email', password: '123' },
    });
    assert.equal(badRegister.status, 400);
    assert.equal(typeof badRegister.json.error, 'string');

    const badLogin = await invokeApp('/api/auth/login', {
      method: 'POST',
      body: { email: 'invalid-email', password: '' },
    });
    assert.equal(badLogin.status, 400);
    assert.equal(typeof badLogin.json.error, 'string');
  });

  it('blocks unauthenticated access to all protected module routes with 401', async () => {
    const protectedEndpoints = [
      '/api/auth/me',
      '/api/users',
      '/api/students',
      '/api/instructors',
      '/api/classrooms',
      '/api/sessions',
      '/api/attendance/my',
      '/api/media',
      '/api/ai/jobs',
      '/api/inspections',
      '/api/maintenance',
      '/api/notifications',
      '/api/reports/overview',
    ];

    for (const endpoint of protectedEndpoints) {
      const res = await invokeApp(endpoint);
      assert.equal(res.status, 401, `Expected 401 for unauthenticated GET ${endpoint}, got ${res.status}`);
    }
  });

  it('clears cg_token cookie and sets no-store headers on POST /api/auth/logout', async () => {
    const res = await invokeApp('/api/auth/logout', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(res.json.message, 'Logged out successfully.');
    assert.match(String(res.headers['cache-control']), /no-store/);
    const setCookieHeader = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'].join('; ')
      : String(res.headers['set-cookie'] ?? '');
    assert.match(setCookieHeader, /cg_token=;/);
    assert.match(setCookieHeader, /Path=\//);
    assert.match(setCookieHeader, /HttpOnly/);
    assert.match(setCookieHeader, /SameSite=Lax/);
  });
});
