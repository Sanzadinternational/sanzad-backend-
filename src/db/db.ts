import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { DB_URI } from '../config';

const pool = new Pool({
  connectionString: DB_URI,
});

export const db = drizzle(pool);

