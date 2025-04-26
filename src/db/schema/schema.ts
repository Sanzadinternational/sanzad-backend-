import { integer, pgTable, varchar,uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
export const usersTable = pgTable("users", {
  id: integer(),
  name: varchar({ length: 255 }).notNull(),
  age: integer().notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
});



// import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
export const userTable = pgTable("user", {
  id: integer(),
  name: varchar({ length: 255 }).notNull(),
  age: integer().notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: text("role").notNull(), // "supplier", "agent", "admin"
  role_id: varchar({ length: 255 }).notNull(), // points to ID in their respective table
  type: text("type").notNull(),
  message: text("message").notNull(),
  is_read: boolean("is_read").default(false),
  created_at: timestamp("created_at").defaultNow(),
});
