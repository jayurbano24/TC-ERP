import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
export default defineConfig({
  // @ts-ignore - Required for early access features but not in the type definitions yet
  earlyAccess: true,
  schema: 'src/infrastructure/database/prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tcerp'
  }
});
