import { 
    pgTable, 
    uuid, 
    varchar, 
    decimal, 
    timestamp, 
    integer,
    text,
    time,
    date
} from 'drizzle-orm/pg-core';
import { registerTable
 } from './SupplierSchema';
 import { AgentTable } from './AgentSchema';
import { Create_Vehicles } from './SupplierSchema';

// Booking Table Schema
export const BookingTable = pgTable('booking', { 
    id: uuid('id').defaultRandom().primaryKey(),
    agent_id: integer('Agent_Id').references(() => AgentTable.id),
    suplier_id: integer('supplier_Id').references(() => registerTable.id),
    pickup_location: varchar({length:255}).notNull(),
    drop_location: varchar({length:255}).notNull(),
    pickup_lat: decimal('pickup_lat', { precision: 9, scale: 6 }).notNull(),
    pickup_lng: decimal('pickup_lng', { precision: 9, scale: 6 }).notNull(),
    drop_lat: decimal('drop_lat', { precision: 9, scale: 6 }).notNull(),
    drop_lng: decimal('drop_lng', { precision: 9, scale: 6 }).notNull(),
    distance_miles: decimal('distance_miles', { precision: 10, scale: 2 }).notNull(),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    currency:varchar({length:255}),
    customer_name: varchar('customer_name', { length: 255 }).notNull(),
    customer_email: varchar('customer_email', { length: 255 }).notNull(),
    customer_mobile: varchar('customer_mobile', { length: 20 }).notNull(),
    status: varchar('status', { length: 50 })
        .default('pending')
        .$type<'pending' | 'confirmed' | 'completed' | 'cancelled'>(),
    booked_at: timestamp('booked_at', { withTimezone: true }).defaultNow(),
    planeArrivingFrom: varchar({length:355}),
    airlineName:varchar({length:255}),
    flightNumber:varchar({length:255}),
    cruiseShipName:varchar({length:255}),
    trainArrivingFrom:varchar({length:255}),
    trainName:varchar({length:255}),
    trainOperator:varchar({length:255}),
    hotelName:varchar({length:255}),
    venueAddress:varchar({length:255}),
    gstNumber:varchar({length:255}),
    gstRequired:varchar({length:255}),
    driver_id:integer(),
    pickupAddress:varchar({length:255}),
    destinationName:varchar({length:255}),
    destinationAddress:varchar({length:255}),
    booking_time:varchar({length:255}),
    pickup_type:varchar({length:255}),
    passengers: varchar({ length: 255 }),
    booking_date: date("booking_date"), // 📅 native DATE type
    return_date: date("return_date"), // 📅 native DATE type
    return_time: time("return_time"),
    return_trip: varchar('return_trip', { length: 50 })
        .default('yes')
        .$type<'yes' | 'No'>(),
    booking_unique_id: varchar({ length: 255 }),
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
