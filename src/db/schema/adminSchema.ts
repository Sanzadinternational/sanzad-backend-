import { integer, pgTable, varchar,timestamp, text, PgTable, date, boolean, pgEnum } from 'drizzle-orm/pg-core'; 
export const RoleEnum = pgEnum('role', ['admin', 'superadmin']); 
import {registerTable} from '../schema/SupplierSchema'; 

export const AdminTable = pgTable('admin',{ 
    id: integer().primaryKey().generatedAlwaysAsIdentity(), 
    Email:varchar({length:255}), 
    Company_name:varchar({length:255}), 
    Password:varchar({length:255}), 
    Role: RoleEnum().notNull(), 
  
    Agent_account: boolean().default(false), 
    Agent_operation:boolean().default(false), 
    Supplier_account:boolean().default(false), 
    Supplier_operation:boolean().default(false), 
    Agent_product:boolean().default(false),
    Supplier_product:boolean().default(false),
    profileImage:varchar({length:255}),
    IsApproved:integer(),
    Token:varchar({length:255}),
    ResetTokenExpiry: varchar({length:255}),
});

export const MarginTable = pgTable('Margin',{
    id: integer().primaryKey().generatedAlwaysAsIdentity(), 
    Company_name:varchar({length:255}),
    Currency: varchar({ length: 255 }),
    MarginPrice: varchar({length:255}),
    supplier_id: varchar({length:255}),
    Supplierregisterforeign: integer('Supplierregisterforeign')
        .references(() => registerTable.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at").defaultNow(),
})