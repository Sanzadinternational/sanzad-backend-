import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DB_URI } from '../config';

const pool = new Pool({
  connectionString: DB_URI,
});

export const db = drizzle(pool);

