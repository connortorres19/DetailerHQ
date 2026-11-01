import { NextResponse, type NextRequest } from 'next/server';
import { suppressFromToken } from '@/lib/email/unsubscribe';

// One-click unsubscribe (RFC 8058: List-Unsubscribe + List-Unsubscribe-Post) from mail apps.
// GET (a person opening the link) goes to the confirmation page instead.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ok = await suppressFromToken((await params).token);
  return new NextResponse(ok ? 'Unsubscribed' : 'Not found', { status: ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return NextResponse.redirect(new URL(`/u/${(await params).token}`, request.nextUrl.origin));
}
