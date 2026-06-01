import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { connectMemoryDB, closeMemoryDB } from './db.js';
import {
  signToken,
  verifyToken,
  revokeToken,
  signStreamTicket,
  verifyStreamTicket
} from '../middleware/auth.js';

beforeAll(connectMemoryDB);
afterAll(closeMemoryDB);

const user = { _id: 'u1', role: 'admin', investorId: null };

describe('JWT lifecycle', () => {
  it('signs and verifies a token with a jti', async () => {
    const token = signToken(user);
    const payload = await verifyToken(token);
    expect(payload.id).toBe('u1');
    expect(payload.role).toBe('admin');
    expect(payload.jti).toBeTruthy();
  });

  it('rejects a revoked token', async () => {
    const token = signToken(user);
    const payload = await verifyToken(token);
    await revokeToken(payload);
    await expect(verifyToken(token)).rejects.toThrow(/revoked/i);
  });

  it('rejects a tampered/invalid signature', async () => {
    const bad = jwt.sign({ id: 'x' }, 'a-different-secret');
    await expect(verifyToken(bad)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ id: 'u1', jti: 'j' }, process.env.JWT_SECRET, {
      expiresIn: -10
    });
    await expect(verifyToken(expired)).rejects.toThrow();
  });
});

describe('SSE stream ticket', () => {
  it('issues a ticket with purpose=sse that verifies', async () => {
    const ticket = signStreamTicket(user);
    const payload = await verifyStreamTicket(ticket);
    expect(payload.purpose).toBe('sse');
  });

  it('does not accept a normal session token as a stream ticket', async () => {
    const token = signToken(user);
    await expect(verifyStreamTicket(token)).rejects.toThrow(/stream ticket/i);
  });
});
