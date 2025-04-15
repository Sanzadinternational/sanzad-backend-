import { integer, pgTable, varchar, text,timestamp, date, jsonb, boolean } from 'drizzle-orm/pg-core'; 

export const SearchCarTable = pgTable('SearchCar',{
    id: integer().primaryKey().generatedAlwaysAsIdentity(), 
    From:varchar({length:255}),
    To:varchar({length:255}),
    Distance:integer('distance'), 
    Currency:varchar({length:255}), 
}) 