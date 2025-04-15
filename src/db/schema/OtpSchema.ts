import { integer, pgTable, varchar, text, PgTable, timestamp, boolean, serial } from 'drizzle-orm/pg-core'; 

export const otpss = pgTable('otpss', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    email: text('email').notNull(),
    otp: text('otp').notNull(),
    otpExpiry: timestamp('otpExpiry').notNull(),
});

export type otpss = {
    id: number;
    email: string;
    otp: string;
    otpExpiry: Date;
  };