// =============================================================================
// app/api/auth/login/route.ts — Authenticate dashboard user
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, getExpectedAuthToken, isPasswordConfigured } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { password } = (await req.json()) as { password?: string };
    const configured = isPasswordConfigured();

    if (configured && password !== process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: 'Incorrect dashboard password' },
        { status: 401 }
      );
    }

    const token = await getExpectedAuthToken();
    const response = NextResponse.json({ success: true });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err) {
    return NextResponse.json(
      { error: 'Login failed', details: String(err) },
      { status: 500 }
    );
  }
}
