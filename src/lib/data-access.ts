import type { AuthSessionUser } from './auth';
import type { Session } from './types';

export function isAdmin(user: AuthSessionUser): boolean {
  return user.role === 'OWNER' || user.role === 'ADMIN';
}

/** Keep roster visibility while hiding another member's personal financial data. */
export function sanitizeSessionForUser(session: Session, user: AuthSessionUser): Session {
  if (isAdmin(user)) return session;

  return {
    ...session,
    participants: session.participants.map((participant) => {
      if (participant.userId === user.id) return participant;
      return {
        ...participant,
        userPhone: undefined,
        courtFeeShare: 0,
        shuttleFeeShare: 0,
        drinkFeeShare: 0,
        otherFeeShare: 0,
        guestSurcharge: 0,
        totalCost: 0,
        totalAdvanced: 0,
        totalPaid: 0,
        debtAmount: 0,
        netSettlement: 0,
      };
    }),
  };
}

