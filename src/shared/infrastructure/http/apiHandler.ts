import { NextResponse } from 'next/server';

export type ApiHandler = (req: Request, ...args: any[]) => Promise<NextResponse>;

export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (req: Request, ...args: any[]) => {
    try {
      const response = await handler(req, ...args);
      return response;
    } catch (error: any) {
      console.error('[API Error]:', error);
      return NextResponse.json(
        { success: false, error: error.message || 'Internal Server Error' },
        { status: 500 }
      );
    }
  };
}
