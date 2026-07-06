import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { resolveProfileDisplayNames } from '@/shared/infrastructure/profiles/resolveProfileDisplayNames';

const DisplayNamesQuery = z.object({
  ids: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = DisplayNamesQuery.safeParse(
      Object.fromEntries(new URL(req.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const names = await resolveProfileDisplayNames(parsed.data.ids);
    return NextResponse.json({ names });
  },
  { module: 'profiles', action: 'display_names' }
);
