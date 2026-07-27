import { NextRequest, NextResponse } from 'next/server';
import { getH5PartnerGateway, partnerKeyHeaders } from '@/lib/h5-partner-bff';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { phone?: string; inviteToken?: string };
    const phone = String(body.phone ?? '').trim();
    if (!phone) {
      return NextResponse.json({ success: false, error: 'phone 必填' }, { status: 400 });
    }

    const upstream = await fetch(`${getH5PartnerGateway()}/api/v1/partner/auth/sms/send`, {
      method: 'POST',
      headers: partnerKeyHeaders(),
      body: JSON.stringify({
        phone,
        inviteToken: body.inviteToken ? String(body.inviteToken) : undefined,
      }),
    });

    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: json.message ?? '发送失败', detail: json },
        { status: upstream.status }
      );
    }

    const data = json.data ?? json;
    return NextResponse.json({ success: true, ...data });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '发送失败' },
      { status: 503 }
    );
  }
}
