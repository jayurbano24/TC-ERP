import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export default defineConfig({
  schema: 'src/infrastructure/database/prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
  },
});
