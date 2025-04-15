CREATE TABLE IF NOT EXISTS "Margin" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "Margin_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"Company_name" varchar(255),
	"Currency" varchar(255),
	"MarginPrice" varchar(255),
	"supplier_id" varchar(255),
	"Supplierregisterforeign" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Margin" ADD CONSTRAINT "Margin_Supplierregisterforeign_supplier_id_fk" FOREIGN KEY ("Supplierregisterforeign") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
