import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  return NextResponse.json({
    status: 'ok',
    service: 'tc-erp-web',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  });
});
