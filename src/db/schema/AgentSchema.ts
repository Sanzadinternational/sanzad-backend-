import { integer, pgTable, varchar,boolean,timestamp, text, PgTable, date } from 'drizzle-orm/pg-core'; 

export const AgentTable = pgTable('Agent_registration', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  Company_name: varchar({ length: 255 }).notNull(),
  Address: varchar({ length: 255 }).notNull(),
  Country: varchar({ length: 255 }).notNull(), 
  City: varchar({ length: 255 }).notNull(),
  Zip_code: varchar({ length: 255 }).notNull(),
  IATA_Code: varchar({ length: 255 }).notNull(),
  Gst_Vat_Tax_number: varchar({ length: 255 }).notNull(),
  Contact_Person: varchar({ length: 255 }).notNull(),
  Email: varchar({ length: 255 }).notNull(),

  Password: varchar({ length: 255 }).notNull(),
  Office_number: varchar({ length: 255 }).notNull(),
  Mobile_number: varchar({ length: 255 }).notNull(),
  Currency: varchar({ length: 255 }).notNull(),
  Gst_Tax_Certificate: varchar({ length: 255 }).notNull(),
  profileImage:varchar({length:255}),
  Role:varchar({length:255}), 
  IsApproved:integer(),
  Token:varchar({length:255}),
  ResetTokenExpiry: varchar({length:255}),
}); 
export const forget_password = pgTable('forget_password', { 
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar({length:255}).notNull(),
  password: varchar({length:255}).notNull(),
  resetToken: varchar({length:255}), // Token for password reset 
  resetTokenExpires: varchar({length:255}), // Expiry of the reset token 
});
export const OneWayTripTable =pgTable('OneWayTrip', 
  {
      id:integer().primaryKey().generatedAlwaysAsIdentity(),
      pick_up_location:varchar({length:255}).notNull(),
      drop_off_location:varchar({length:255}).notNull(),
      date: date().notNull(),
      passengers:integer().notNull(), 
  } 
) 
export const UpdateOneWayTripTable =pgTable('OneWayTrip', 
  {
      id:integer().primaryKey().generatedAlwaysAsIdentity(),
      pick_up_location:varchar({length:255}).notNull(),
      drop_off_location:varchar({length:255}).notNull(),
      date: date().notNull(),
      passengers:integer().notNull(), 
  } 
) 

export const RoundTripTable =pgTable('RoundTrip', 
  {
      id:integer().primaryKey().generatedAlwaysAsIdentity(), 
      pick_up_location:varchar({length:255}).notNull(), 
      drop_off_location:varchar({length:255}).notNull(), 
      date: date().notNull(), 
      return_date:date().notNull(), 
      passengers:integer().notNull(), 
  } 
) 



function datetime(arg0: string): any {
  throw new Error('Function not implemented.');
}

