import { 
    pgTable, 
    uuid, 
    varchar, 
    decimal, 
    timestamp, 
    integer,
    text 
} from 'drizzle-orm/pg-core';
import { registerTable
 } from './SupplierSchema';
 import { AgentTable } from './AgentSchema';
import { Create_Vehicles } from './SupplierSchema';

// Booking Table Schema
export const BookingTable = pgTable('booking', { 
    id: uuid('id').defaultRandom().primaryKey(),
    agent_id: integer('Agent_Id').references(() => AgentTable.id),
    vehicle_id: uuid('vehicle_id').notNull().references(() => Create_Vehicles.id, { onDelete: 'cascade' }),
    suplier_id: integer('supplier_Id').references(() => registerTable.id),
    pickup_location: varchar({length:255}).notNull(),
    drop_location: varchar({length:255}).notNull(),
    pickup_lat: decimal('pickup_lat', { precision: 9, scale: 6 }).notNull(),
    pickup_lng: decimal('pickup_lng', { precision: 9, scale: 6 }).notNull(),
    drop_lat: decimal('drop_lat', { precision: 9, scale: 6 }).notNull(),
    drop_lng: decimal('drop_lng', { precision: 9, scale: 6 }).notNull(),
    distance_miles: decimal('distance_miles', { precision: 10, scale: 2 }).notNull(),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    status: varchar('status', { length: 50 })
        .default('pending')
        .$type<'pending' | 'confirmed' | 'completed' | 'cancelled'>(),
    booked_at: timestamp('booked_at', { withTimezone: true }).defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true })
});

// Payments Table Schema
export const PaymentsTable = pgTable('payments', { 
    id: uuid('id').defaultRandom().primaryKey(),
    booking_id: uuid('booking_id').notNull().references(() => BookingTable.id, { onDelete: 'cascade' }),

    payment_method: varchar('payment_method', { length: 50 })
        .$type<'CCavenue' | 'Reference'>(),
        
    payment_status: varchar('payment_status', { length: 50 })
        .default('pending')
        .$type<'pending' | 'successful' | 'failed' | 'refunded'>(),

    transaction_id: varchar('transaction_id', { length: 100 }).unique(), // CCAvenue payments
    reference_number: varchar('reference_number', { length: 100 }).unique(), // Manual payments

    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),

    created_at: timestamp('created_at', { withTimezone: true }).defaultNow()

});
