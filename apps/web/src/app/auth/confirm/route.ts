import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** Supabase SSR docs use `/auth/confirm`; we handle exchange in `/auth/callback`. */
export function GET(request: NextRequest) {
  const u = request.nextUrl.clone();
  u.pathname = '/auth/callback';
  return NextResponse.redirect(u);
}
