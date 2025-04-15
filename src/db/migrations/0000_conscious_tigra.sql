DO $$ BEGIN
 CREATE TYPE "public"."role" AS ENUM('admin', 'superadmin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Email" varchar(255),
	"Company_name" varchar(255),
	"Password" varchar(255),
	"Role" "role" NOT NULL,
	"Agent_account" boolean DEFAULT false,
	"Agent_operation" boolean DEFAULT false,
	"Supplier_account" boolean DEFAULT false,
	"Supplier_operation" boolean DEFAULT false,
	"Agent_product" boolean DEFAULT false,
	"Supplier_product" boolean DEFAULT false,
	"profileImage" varchar(255),
	"IsApproved" integer,
	"Token" varchar(255),
	"ResetTokenExpiry" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Agent_registration" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Agent_registration_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Company_name" varchar(255) NOT NULL,
	"Address" varchar(255) NOT NULL,
	"Country" varchar(255) NOT NULL,
	"City" varchar(255) NOT NULL,
	"Zip_code" varchar(255) NOT NULL,
	"IATA_Code" varchar(255) NOT NULL,
	"Gst_Vat_Tax_number" varchar(255) NOT NULL,
	"Contact_Person" varchar(255) NOT NULL,
	"Email" varchar(255) NOT NULL,
	"Password" varchar(255) NOT NULL,
	"Office_number" varchar(255) NOT NULL,
	"Mobile_number" varchar(255) NOT NULL,
	"Currency" varchar(255) NOT NULL,
	"Gst_Tax_Certificate" varchar(255) NOT NULL,
	"profileImage" varchar(255),
	"Role" varchar(255),
	"IsApproved" integer,
	"Token" varchar(255),
	"ResetTokenExpiry" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OneWayTrip" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "OneWayTrip_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pick_up_location" varchar(255) NOT NULL,
	"drop_off_location" varchar(255) NOT NULL,
	"date" date NOT NULL,
	"passengers" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RoundTrip" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "RoundTrip_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pick_up_location" varchar(255) NOT NULL,
	"drop_off_location" varchar(255) NOT NULL,
	"date" date NOT NULL,
	"return_date" date NOT NULL,
	"passengers" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forget_password" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "forget_password_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"resetToken" varchar(255),
	"resetTokenExpires" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"Agent_Id" integer,
	"vehicle_id" uuid NOT NULL,
	"supplier_Id" integer,
	"pickup_location" varchar(255) NOT NULL,
	"drop_location" varchar(255) NOT NULL,
	"pickup_lat" numeric(9, 6) NOT NULL,
	"pickup_lng" numeric(9, 6) NOT NULL,
	"drop_lat" numeric(9, 6) NOT NULL,
	"drop_lng" numeric(9, 6) NOT NULL,
	"distance_miles" numeric(10, 2) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"booked_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_method" varchar(50),
	"payment_status" varchar(50) DEFAULT 'pending',
	"transaction_id" varchar(100),
	"reference_number" varchar(100),
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "payments_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "payments_reference_number_unique" UNIQUE("reference_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "otps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"otp" text NOT NULL,
	"is_verified" boolean DEFAULT false,
	"verification_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otpss" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "otpss_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"otp" text NOT NULL,
	"otpExpiry" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"age" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" integer,
	"name" varchar(255) NOT NULL,
	"age" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SearchCar" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "SearchCar_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"From" varchar(255),
	"To" varchar(255),
	"distance" integer,
	"Currency" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_details" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supplier_details_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Vehicle_type" varchar(255) NOT NULL,
	"Vehicle_brand" varchar(255) NOT NULL,
	"Type_service" varchar(255) NOT NULL,
	"Vehicle_model" varchar(255) NOT NULL,
	"Doors" varchar(255) NOT NULL,
	"Seats" varchar(255) NOT NULL,
	"Category_space" varchar(255),
	"Max_number_pax_accommodate" varchar(255) NOT NULL,
	"Luggage_information" varchar(255) NOT NULL,
	"Max_number_medium_suitcase" varchar(255) NOT NULL,
	"Max_number_carbin_bag" varchar(255) NOT NULL,
	"Space_available_other_luggage" varchar(255) NOT NULL,
	"Location_details" varchar(255) NOT NULL,
	"Transfer_information" varchar(255) NOT NULL,
	"Service_providing_location" varchar(255) NOT NULL,
	"Airport" varchar(255) NOT NULL,
	"Port_cruise" varchar(255) NOT NULL,
	"Station" varchar(255) NOT NULL,
	"City_center" varchar(255) NOT NULL,
	"Vehicle_for" varchar(255) NOT NULL,
	"Half_day_city_limit_4hrs" varchar(255),
	"Full_day_city_limit_8hrs" varchar(255),
	"Inclusions" varchar(255),
	"Vehicle_rent" varchar(255) NOT NULL,
	"Fuel" varchar(255) NOT NULL,
	"Driver" varchar(255) NOT NULL,
	"Parking_fees" varchar(255) NOT NULL,
	"Toll_or_taxes" varchar(255) NOT NULL,
	"Driver_tips" varchar(255) NOT NULL,
	"Other" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ExtraSpace" (
	"uniqueId" varchar(255),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ExtraSpace_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Roof_Rack" varchar(255),
	"Trailer_Hitch" varchar(255),
	"Extended_Cargo_Space" varchar(255),
	"SupplierCarDetailsforeign" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TransferCar" (
	"uniqueId" varchar(255),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "TransferCar_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Transfer_from" varchar(255),
	"Extra_Price" varchar(255),
	"Distance" varchar(255),
	"Location" varchar(255),
	"Vice_versa" boolean,
	"NightTime" varchar(255),
	"NightTime_Price" varchar(255),
	"Price" varchar(255),
	"SupplierCarDetailsforeign" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "all_Vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"SupplierId" varchar(255),
	"VehicleType" varchar(255),
	"VehicleBrand" varchar(255),
	"ServiceType" varchar(255),
	"VehicleModel" varchar(255),
	"Doors" varchar(255),
	"Seats" varchar(255),
	"Cargo" varchar(255),
	"Passengers" varchar(255),
	"MediumBag" varchar(255),
	"SmallBag" varchar(255),
	"Extraspace" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "One_Way_Service_Details" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "One_Way_Service_Details_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"country" varchar(255) NOT NULL,
	"city" varchar(255) NOT NULL,
	"location_from_airport" varchar(255) NOT NULL,
	"location_from_port_cruise" varchar(255) NOT NULL,
	"location_from_station" varchar(255) NOT NULL,
	"location_from_city_center" varchar(255) NOT NULL,
	"location_to_airport" varchar(255) NOT NULL,
	"location_to_port_cruise" varchar(255) NOT NULL,
	"location_to_station" varchar(255) NOT NULL,
	"location_to_city_center" varchar(255) NOT NULL,
	"night_time_supplement" varchar(255) NOT NULL,
	"vice_versa" varchar(255) NOT NULL,
	"half_day_city_limit_4hrs" varchar(255) NOT NULL,
	"full_day_city_limit_8hrs" varchar(255) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"price" integer NOT NULL,
	"new_location" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"country" varchar(255),
	"city" varchar(255),
	"location_from_airport" varchar(255),
	"location_from_port_cruise" varchar(255),
	"location_from_station" varchar(255),
	"location_from_city_center" varchar(255),
	"location_to_airport" varchar(255),
	"location_to_port_cruise" varchar(255),
	"location_to_station" varchar(255),
	"location_to_city_center" varchar(255),
	"night_time_supplement" varchar(255),
	"vice_versa" varchar(255),
	"half_day_city_limit_4hrs" varchar(255),
	"full_day_city_limit_8hrs" varchar(255),
	"from_date" varchar(255),
	"to_date" varchar(255),
	"price" varchar(255),
	"new_location" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Roundtrip_Service_Price_Details" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Roundtrip_Service_Price_Details_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"country" varchar(255) NOT NULL,
	"city" varchar(255) NOT NULL,
	"location_from_airport" varchar(255) NOT NULL,
	"location_from_port_cruise" varchar(255) NOT NULL,
	"location_from_station" varchar(255) NOT NULL,
	"location_from_city_center" varchar(255) NOT NULL,
	"location_to_airport" varchar(255) NOT NULL,
	"location_to_port_cruise" varchar(255) NOT NULL,
	"location_to_station" varchar(255) NOT NULL,
	"location_to_city_center" varchar(255) NOT NULL,
	"night_time_supplement" varchar(255) NOT NULL,
	"vice_versa" varchar(255) NOT NULL,
	"half_day_city_limit_4hrs" varchar(255) NOT NULL,
	"full_day_city_limit_8hrs" varchar(255) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"price" integer NOT NULL,
	"new_location" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ServiceType" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ServiceType_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ServiceType" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Supplier_Apidata" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Supplier_Apidata_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Api" varchar(255),
	"Api_User" varchar(255) NOT NULL,
	"Api_Password" varchar(255) NOT NULL,
	"Api_Id_Foreign" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Car_Details" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Car_Details_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"uid" varchar(255),
	"uniqueId" varchar(255),
	"SupplierId" varchar(255),
	"VehicleType" varchar(255),
	"VehicleBrand" varchar(255),
	"ServiceType" varchar(255),
	"VehicleModel" varchar(255),
	"Doors" varchar(255),
	"Seats" varchar(255),
	"Cargo" varchar(255),
	"City" varchar(255),
	"Country" varchar(255),
	"Passengers" varchar(255),
	"MediumBag" varchar(255),
	"SmallBag" varchar(255),
	"TransferInfo" varchar(255),
	"HalfDayRide" varchar(255),
	"FullDayRide" varchar(255),
	"HalfFullNightTime" varchar(255),
	"HalfFullNightTimePrice" varchar(255),
	"VehicleRent" varchar(255),
	"Fuel" varchar(255),
	"Driver" varchar(255),
	"ParkingFee" varchar(255),
	"TollTax" varchar(255),
	"Tip" varchar(255),
	"TollFee" varchar(255),
	"Parking" varchar(255),
	"Currency" varchar(255),
	"From" date,
	"To" date,
	"Others" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SurgeCharge" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "SurgeCharge_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"VehicleName" varchar(255),
	"From" date,
	"To" date,
	"SurgeChargePrice" varchar(255),
	"vehicle_id" uuid,
	"supplier_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_nodes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transport_nodes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"formatted_address" varchar(255),
	"location_lat" varchar(255),
	"location_lon" varchar(255),
	"description" varchar(255),
	"place_id" varchar(255),
	"country" varchar(255),
	"airport_or_establishment" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "VehicleBrand" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "VehicleBrand_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"VehicleBrand" varchar(255),
	"ServiceType" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "VehicleModel" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "VehicleModel_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"VehicleModel" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "VehicleType" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "VehicleType_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"VehicleType" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supplier_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Company_name" varchar(255) NOT NULL,
	"Owner" varchar(255) NOT NULL,
	"Address" varchar(255) NOT NULL,
	"Country" varchar(255) NOT NULL,
	"City" varchar(255) NOT NULL,
	"Zip_code" varchar(255) NOT NULL,
	"Office_number" varchar(255) NOT NULL,
	"Email" varchar(255) NOT NULL,
	"Contact_Person" varchar(255) NOT NULL,
	"Mobile_number" varchar(255) NOT NULL,
	"Gst_Vat_Tax_number" varchar(255) NOT NULL,
	"PAN_number" varchar(255) NOT NULL,
	"Currency" varchar(255) NOT NULL,
	"Gst_Tax_Certificate" varchar(255) NOT NULL,
	"profileImage" varchar(255),
	"Password" varchar(255) NOT NULL,
	"Role" varchar(255),
	"IsApproved" integer,
	"Token" varchar(255),
	"ResetTokenExpiry" varchar(255),
	CONSTRAINT "supplier_Email_unique" UNIQUE("Email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_otps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supplier_otps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"otp" text NOT NULL,
	"otpExpiry" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Vehicle_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" varchar(255),
	"vehicle_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"extra_price_per_mile" numeric(5, 2) NOT NULL,
	"Currency" varchar(255),
	"Transfer_info" varchar(255),
	"NightTime" varchar(255),
	"NightTime_Price" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" varchar(255),
	"address" varchar(255),
	"name" varchar(255) NOT NULL,
	"latitude" numeric(10, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"radius_km" numeric(5, 2) NOT NULL,
	"geojson" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking" ADD CONSTRAINT "booking_Agent_Id_Agent_registration_id_fk" FOREIGN KEY ("Agent_Id") REFERENCES "public"."Agent_registration"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking" ADD CONSTRAINT "booking_vehicle_id_all_Vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."all_Vehicles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking" ADD CONSTRAINT "booking_supplier_Id_supplier_id_fk" FOREIGN KEY ("supplier_Id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ExtraSpace" ADD CONSTRAINT "ExtraSpace_SupplierCarDetailsforeign_Car_Details_id_fk" FOREIGN KEY ("SupplierCarDetailsforeign") REFERENCES "public"."Car_Details"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "TransferCar" ADD CONSTRAINT "TransferCar_SupplierCarDetailsforeign_Car_Details_id_fk" FOREIGN KEY ("SupplierCarDetailsforeign") REFERENCES "public"."Car_Details"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Supplier_Apidata" ADD CONSTRAINT "Supplier_Apidata_Api_Id_Foreign_supplier_id_fk" FOREIGN KEY ("Api_Id_Foreign") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SurgeCharge" ADD CONSTRAINT "SurgeCharge_vehicle_id_all_Vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."all_Vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Vehicle_transfers" ADD CONSTRAINT "Vehicle_transfers_vehicle_id_all_Vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."all_Vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Vehicle_transfers" ADD CONSTRAINT "Vehicle_transfers_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
