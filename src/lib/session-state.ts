import type { Session, SessionStatus } from './types';
import type { Filter } from 'mongodb';

const transitions: Record<SessionStatus, readonly SessionStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['LOCKED', 'SETTLED', 'CANCELLED'],
  LOCKED: ['OPEN', 'SETTLED', 'CANCELLED'],
  SETTLED: ['REOPENED'],
  REOPENED: ['OPEN', 'LOCKED', 'SETTLED', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return transitions[from].includes(to);
}

export function isSessionMutable(session: Pick<Session, 'status' | 'isSettled'>): boolean {
  return !session.isSettled && (session.status === 'OPEN' || session.status === 'REOPENED');
}

export function isSessionFinanciallyLocked(session: Pick<Session, 'status' | 'isSettled'>): boolean {
  return session.isSettled || session.status === 'SETTLED' || session.status === 'LOCKED';
}

export function sessionVersionFilter(session: Session): Filter<Session> {
  return session.version === undefined
    ? { id: session.id, version: { $exists: false } }
    : { id: session.id, version: session.version };
}
