import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { requireServerAdmin } from '@/shared/authz/requireServerAdmin';
import { aggregateSystemHealth } from '@/modules/system-health/server/aggregateHealth';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const admin = await requireServerAdmin();
    if (!admin.ok) {
      return NextResponse.json({ success: false, error: admin.error }, { status: 403 });
    }

    const health = await aggregateSystemHealth();
    return NextResponse.json(
      { success: true, health },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  },
  { module: 'system-health', action: 'read' }
);
