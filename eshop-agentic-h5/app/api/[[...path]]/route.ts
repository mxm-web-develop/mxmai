import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GATEWAY = (
  process.env.OPEN_API_PROXY_TARGET?.trim() ||
  process.env.NEXT_PUBLIC_OPEN_API_BASE?.trim() ||
  'http://localhost:3000'
).replace(/\/$/, '');

type RouteContext = { params: Promise<{ path?: string[] }> };

function buildTargetUrl(req: NextRequest, pathSegments: string[] | undefined): string {
  const subPath = (pathSegments ?? []).join('/');
  const url = new URL(`${GATEWAY}/api/${subPath}`);
  url.search = req.nextUrl.search;
  return url.toString();
}

async function proxy(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  const target = buildTargetUrl(req, path);

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length') return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete('transfer-encoding');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, context: RouteContext) {
  return proxy(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return proxy(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return proxy(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return proxy(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return proxy(req, context);
}

export async function OPTIONS(req: NextRequest, context: RouteContext) {
  return proxy(req, context);
}
