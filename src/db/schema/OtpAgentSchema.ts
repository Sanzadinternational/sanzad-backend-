// import { integer, pgTable, varchar, text, PgTable, date, boolean } from 'drizzle-orm/pg-core'; 

// // models/otp.js
// // import { pgTable, text, integer } from 'drizzle-orm/node-postgres';

// export const otpTable = pgTable('otps', {
//   id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
//   email: text('email').notNull(),
//   otp: text('otp').notNull(),
//   createdAt: text('created_at').default('now()'),
//   expiresAt: text('expires_at').notNull(),
//   isVerified: boolean('is_verified').default(false),
//   verificationCode: text('verification_code').notNull(),
// });
import { integer, pgTable, varchar, text, PgTable, timestamp, boolean } from 'drizzle-orm/pg-core'; 

export const otpTable = pgTable('otps', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
  email: text('email').notNull(),
  otp: text('otp').notNull(),
  isVerified: boolean('is_verified').default(false),
  verificationCode: text('verification_code').notNull(),
});
