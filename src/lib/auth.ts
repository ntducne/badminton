import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getDb } from './db';
import { User, Role } from './types';

const configuredJwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!configuredJwtSecret || configuredJwtSecret.length < 32)) {
  throw new Error('JWT_SECRET phải được cấu hình tối thiểu 32 ký tự ở production');
}
const JWT_SECRET = configuredJwtSecret || 'development-only-badminton-secret-change-me';
const COOKIE_NAME = 'badminton_token';

export interface AuthSessionUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  email?: string;
  avatarUrl?: string;
}

export function signToken(user: AuthSessionUser): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function verifyToken(token: string): AuthSessionUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthSessionUser;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthSessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

export async function authenticateUser(phone: string, passwordPlain: string): Promise<User | null> {
  const db = await getDb();
  const user = await db.collection<User>('users').findOne({ phone, isActive: true });
  if (!user || !user.password) return null;

  const isMatch = await bcrypt.compare(passwordPlain, user.password);
  if (!isMatch) return null;

  return user;
}
