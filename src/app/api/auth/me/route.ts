import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ user: null });
  }

  const db = await getDb();
  const user = await db.collection('users').findOne(
    { id: sessionUser.id, isActive: true },
    { projection: { password: 0 } }
  );

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user });
}

