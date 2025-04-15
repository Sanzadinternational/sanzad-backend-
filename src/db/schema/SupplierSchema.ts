import { integer, pgTable, varchar, text,timestamp, date, jsonb, boolean, numeric, uuid } from 'drizzle-orm/pg-core'; 

export const registerTable = pgTable('supplier', { 
  id: integer().primaryKey().generatedAlwaysAsIdentity(), 
  Company_name: varchar({ length: 255 }).notNull(),
  Owner: varchar({ length: 255 }).notNull(),
  Address: varchar({ length: 255 }).notNull(),
  Country: varchar({ length: 255 }).notNull(), 
  City: varchar({ length: 255 }).notNull(),
  Zip_code: varchar({length:255}).notNull(),
  Office_number: varchar({length:255}).notNull(), 
  Email: varchar({ length: 255 }).notNull().unique(), 
  Contact_Person: varchar({length:255}).notNull(),

  Mobile_number: varchar({length:255}).notNull(),
  Gst_Vat_Tax_number: varchar({length:255}).notNull(), 
  PAN_number: varchar({length:255}).notNull(), 
  Currency: varchar({ length: 255 }).notNull(),
  Gst_Tax_Certificate: varchar({ length: 255 }).notNull(), 
  profileImage:varchar({length:255}),
  Password: varchar({length:255}).notNull(),
  Role:varchar({length:255}),
  IsApproved:integer(), 
  Token:varchar({length:255}), 
  ResetTokenExpiry: varchar({length:255}), 
}); 
    
export const One_WayTable = pgTable('One_Way_Service_Details',{
    id:integer().primaryKey().generatedAlwaysAsIdentity(),
    country:varchar({length:255}).notNull(),
    city:varchar({length:255}).notNull(),
    location_from_airport:varchar({length:255}).notNull(),
    location_from_port_cruise:varchar({length:255}).notNull(),
    location_from_station:varchar({length:255}).notNull(),
    location_from_city_center:varchar({length:255}).notNull(),
    location_to_airport:varchar({length:255}).notNull(),
    location_to_port_cruise:varchar({length:255}).notNull(),
    location_to_station:varchar({length:255}).notNull(),
    location_to_city_center:varchar({length:255}).notNull(),
    night_time_supplement:varchar({length:255}).notNull(),
    vice_versa:varchar({length:255}).notNull(),
    half_day_city_limit_4hrs:varchar({length:255}).notNull(),
    full_day_city_limit_8hrs:varchar({length:255}).notNull(),
    from_date: date().notNull(), 
    to_date: date().notNull(),   
    price: integer().notNull(), 
    new_location: varchar({ length: 255 }).notNull(),
  
}); 
 
export const PriceTable = pgTable('price',{
  id:integer().primaryKey().generatedAlwaysAsIdentity(), 
    country:varchar({length:255}),
    city:varchar({length:255}),
    location_from_airport:varchar({length:255}),
    location_from_port_cruise:varchar({length:255}), 
    location_from_station:varchar({length:255}),
    location_from_city_center:varchar({length:255}), 
    location_to_airport:varchar({length:255}),
    location_to_port_cruise:varchar({length:255}),
    location_to_station:varchar({length:255}),
    location_to_city_center:varchar({length:255}),
    night_time_supplement:varchar({length:255}),
    vice_versa:varchar({length:255}),
    half_day_city_limit_4hrs:varchar({length:255}),
    full_day_city_limit_8hrs:varchar({length:255}),
    from_date: varchar({length:255}), 
    to_date: varchar({length:255}),   
    price: varchar({length:255}), 
    new_location: varchar({ length: 255 }),
});

export const zones = pgTable("zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplier_id: varchar({length:255}),
  address: varchar({length:255}),
  name: varchar("name", { length: 255 }).notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 6 }).notNull(),
  radius_miles: numeric("radius_km", { precision: 5, scale: 2 }).notNull(),
  geojson: jsonb("geojson").default(null),
  created_at: timestamp("created_at").defaultNow(),
});

// Transfers Table
export const transfers_Vehicle = pgTable("Vehicle_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplier_id: varchar({length:255}),
  vehicle_id: uuid("vehicle_id").references(() => Create_Vehicles.id).notNull(),
  zone_id: uuid("zone_id").references(() => zones.id).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  extra_price_per_mile: numeric("extra_price_per_mile", { precision: 5, scale: 2 }).notNull(),
  Currency:varchar({length:255}),
  Transfer_info:varchar({length:255}),
  NightTime: varchar({ length: 255 }), 
  NightTime_Price: varchar({ length: 255 }), 
  created_at: timestamp("created_at").defaultNow(),
});

export const TransportNodes = pgTable('transport_nodes',{

  id:integer().primaryKey().generatedAlwaysAsIdentity(), 
  formatted_address:varchar({length:255}),
  location_lat:varchar({length:255}),
  location_lon:varchar({length:255}),
  description:varchar({length:255}),
  place_id:varchar({length:255}),
  country:varchar({length:255}),
  airport_or_establishment:varchar({length:255}),

})
export const Roundtrip_Service_Price_Details = pgTable('Roundtrip_Service_Price_Details',{
  id:integer().primaryKey().generatedAlwaysAsIdentity(),
  country:varchar({length:255}).notNull(),
  city:varchar({length:255}).notNull(),
  location_from_airport:varchar({length:255}).notNull(),
  location_from_port_cruise:varchar({length:255}).notNull(),
  location_from_station:varchar({length:255}).notNull(),
  location_from_city_center:varchar({length:255}).notNull(),
  location_to_airport:varchar({length:255}).notNull(),
  location_to_port_cruise:varchar({length:255}).notNull(),
  location_to_station:varchar({length:255}).notNull(),
  location_to_city_center:varchar({length:255}).notNull(),
  night_time_supplement:varchar({length:255}).notNull(),
  vice_versa:varchar({length:255}).notNull(),
  half_day_city_limit_4hrs:varchar({length:255}).notNull(), 
  full_day_city_limit_8hrs:varchar({length:255}).notNull(),
  from_date: date().notNull(), 
  to_date: date().notNull(),   
  price: integer().notNull(), 
  new_location: varchar({ length: 255 }).notNull(), 
}); 

export const supplier_otps = pgTable('supplier_otps', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    email: text('email').notNull(),
    otp: text('otp').notNull(),
    otpExpiry: timestamp('otpExpiry').notNull(),
});

export type supplier_otps = {
    id: number;
    email: string;
    otp: string;
    otpExpiry: Date;
  }; 
 
  export const SupplierApidataTable = pgTable('Supplier_Apidata', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(), // Primary key auto-incrementing ID
    Api: varchar({ length: 255 }), // Optional API name
    Api_User: varchar({ length: 255 }).notNull(), // Not null API user
    Api_Password: varchar({ length: 255 }).notNull(), // Not null API password
    Api_Id_Foreign: integer('Api_Id_Foreign') 
      .references(() => registerTable.id), // References the `id` column in `registerTable`
  }); 
            
  export const SupplierCarDetailsTable = pgTable('Car_Details',{ 
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
    uid:varchar({length:255}),
    uniqueId:varchar({length:255}),
    SupplierId:varchar({length:255}), 
    VehicleType: varchar({length:255}), 
    VehicleBrand:varchar({length:255}), 
    ServiceType:varchar({length:255}), 
    VehicleModel:varchar({length:255}), 
    Doors:varchar({length:255}), 
    Seats:varchar({length:255}), 
    Cargo:varchar({length:255}),
    City:varchar({length:255}),
    Country:varchar({length:255}),
    Passengers:varchar({length:255}), 
    MediumBag:varchar({length:255}),
    SmallBag:varchar({length:255}), 
    TransferInfo:varchar({length:255}),

    HalfDayRide:varchar({length:255}),
    FullDayRide:varchar({length:255}),
    HalfFullNightTime:varchar({length:255}),
    HalfFullNightTimePrice:varchar({length:255}), 
    VehicleRent:varchar({length:255}),
    Fuel:varchar({length:255}), 
    Driver:varchar({length:255}), 
    ParkingFee:varchar({length:255}), 
    TollTax:varchar({length:255}),
    Tip:varchar({length:255}),
    TollFee:varchar({length:255}),
    Parking:varchar({length:255}),
    Currency:varchar({length:255}),
    From: date(),  
    To: date(),  
    Others:varchar({length:255}) 
  }) 

  export const Create_Vehicles = pgTable('all_Vehicles',{ 
    id: uuid("id").primaryKey().defaultRandom(),
    SupplierId:varchar({length:255}), 
    VehicleType: varchar({length:255}), 
    VehicleBrand:varchar({length:255}), 
    ServiceType:varchar({length:255}), 
    VehicleModel:varchar({length:255}), 
    Doors:varchar({length:255}), 
    Seats:varchar({length:255}), 
    Cargo:varchar({length:255}),
    Passengers:varchar({length:255}), 
    MediumBag:varchar({length:255}),
    SmallBag:varchar({length:255}),
    ExtraSpace: jsonb("Extraspace"),
  }) 
  
//ExtraSpace Table

  export const CreateExtraSpaces=pgTable('ExtraSpace',{
    uniqueId:varchar({length:255}), 
    id: integer('id') 
      .primaryKey()
      .generatedAlwaysAsIdentity(), 
      Roof_Rack:varchar({length:255}),
      Trailer_Hitch:varchar({length:255}),
      Extended_Cargo_Space:varchar({length:255}),
    SupplierCarDetailsforeign: integer('SupplierCarDetailsforeign')
    .references(() => SupplierCarDetailsTable.id, { onDelete: "cascade" })
  }) 



  export const CreateTransferCar = pgTable('TransferCar', { 
    uniqueId:varchar({length:255}),
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
    Transfer_from: varchar({ length: 255 }), 
    Extra_Price: varchar({length:255}), 
    Distance: varchar({length:255}),  
    Location:varchar({length:255}),  
    Vice_versa: boolean(),
    NightTime: varchar({ length: 255 }), 
    NightTime_Price: varchar({ length: 255 }), 
    Price: varchar({ length: 255 }),
    SupplierCarDetailsforeign: integer('SupplierCarDetailsforeign')
        .references(() => SupplierCarDetailsTable.id, { onDelete: "cascade" }),
}); 
    
export const SurgeChargeTable=pgTable('SurgeCharge',{
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
  VehicleName:varchar({length:255}),
  From:date(), 
  To:date(), 
  SurgeChargePrice:varchar({length:255}),
  vehicle_id: uuid("vehicle_id").references(() => Create_Vehicles.id),
  supplier_id:varchar({length:255})
}); 
     
  export const VehicleTypeTable=pgTable('VehicleType',{
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
    VehicleType:varchar({length:255})
  })

  export const VehicleBrandTable=pgTable('VehicleBrand',{
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
    VehicleBrand:varchar({length:255}),
    ServiceType:varchar({length:255}),
  })

export const ServiceTypeTable=pgTable('ServiceType',{
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
  ServiceType:varchar({length:255})
}) 

export const VehicleModelTable=pgTable('VehicleModel',{
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(), 
  VehicleModel:varchar({length:255})
}) 


function datetime(arg0: string): any {
  throw new Error('Function not implemented.');
}

