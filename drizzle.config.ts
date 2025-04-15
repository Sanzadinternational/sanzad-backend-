import { DB_URI } from './src/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  out: './src/db/migrations',
  schema: './src/db/schema/*',
  dialect: 'postgresql',
  dbCredentials: {
    url: DB_URI!,
  },
});