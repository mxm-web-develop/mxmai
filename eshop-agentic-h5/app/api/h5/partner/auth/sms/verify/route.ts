import { NextRequest, NextResponse } from 'next/server';
import { getH5PartnerGateway, partnerKeyHeaders } from '@/lib/h5-partner-bff';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      phone?: string;
      code?: string;
      deviceId?: string;
      inviteToken?: string;
    };
    const phone = String(body.phone ?? '').trim();
    const code = String(body.code ?? '').trim();
    const deviceId = String(body.deviceId ?? '').trim();
    if (!phone || !code) {
      return NextResponse.json({ success: false, error: 'phone 与 code 必填' }, { status: 400 });
    }

    const headers = partnerKeyHeaders();
    if (deviceId.length >= 8) headers['X-Device-Id'] = deviceId;

    const upstream = await fetch(`${getH5PartnerGateway()}/api/v1/partner/auth/sms/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone,
        code,
        deviceId: deviceId || undefined,
        inviteToken: body.inviteToken ? String(body.inviteToken) : undefined,
      }),
    });

    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: json.message ?? '验证失败', detail: json },
        { status: upstream.status }
      );
    }

    const data = json.data ?? json;
    return NextResponse.json({
      success: true,
      sessionToken: data.sessionToken,
      expiresAt: data.expiresAt,
      phoneMasked: data.phoneMasked,
      endUserId: data.endUserId,
      loginMethod: data.loginMethod ?? 'sms',
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '验证失败' },
      { status: 503 }
    );
  }
}
