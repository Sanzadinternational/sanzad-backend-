import { date, integer } from 'drizzle-orm/pg-core';
import { defaults } from './../../node_modules/@types/pg/index.d';
export interface CreateSupplierInput { 
  Company_name:string,
  Owner: string,
  Address: string,
  Country: string, 
  City: string,
  Zip_code: string,
  Office_number: string,
  Email: string,
  Contact_Person: string,

  Mobile_number: string,
  Gst_Vat_Tax_number: string, 
  PAN_number: string, 
  Currency: string,
  Gst_Tax_Certificate: string,
  Password: string, 
  Role:string,
  IsApproved:number,
  Token:string 
  }
export interface SupplierPriceInput{
  country:string,
  city:string,
  location_from_airport:string,
  location_from_port_cruise:string,
  location_from_station:string,
  location_from_city_center:string, 
  location_to_airport:string,
  location_to_port_cruise:string,
  location_to_station:string,
  location_to_city_center:string,
  night_time_supplement:string,
  vice_versa:string,
  half_day_city_limit_4hrs:string,
  full_day_city_limit_8hrs:string,
  from_date: string, 
  to_date: string,   
  price: string, 
  new_location: string,
} 
  export interface CreateTransportNodesInput{
  formatted_address:string,
  location_lat:string,
  location_lon:string,
  description:string,
  place_id:string,
  country:string,
  airport_or_establishment:string,
  }
  export interface CreateSupplierOneWayInput{
    country:string,
    city:string,
    location_from_airport:string,
    location_from_port_cruise:string,
    location_from_station:string,
    location_from_city_center:string,
    location_to_airport:string,
    location_to_port_cruise:string,
    location_to_station:string,
    location_to_city_center:string,
    night_time_supplement:string,
    vice_versa:string,
    half_day_city_limit_4hrs:string,
    full_day_city_limit_8hrs:string,
    from_date:string,
    to_date:string,
    price:number,
    new_location:string
  }
  export interface Roundtrip_Service_Price_Details{
    country:string,
    city:string,
    location_from_airport:string,
    location_from_port_cruise:string,
    location_from_station:string,
    location_from_city_center:string,
    location_to_airport:string,
    location_to_port_cruise:string,
    location_to_station:string,
    location_to_city_center:string,
    night_time_supplement:string,
    vice_versa:string,
    half_day_city_limit_4hrs:string,
    full_day_city_limit_8hrs:string,
    from_date:string,
    to_date:string, 
    price:number, 
    new_location:string 
  } 
 
  export interface CreateSupplierApidata{ 
    Api:string, 
    Api_User:string, 
    Api_Password:string, 
    Api_Id_Foreign:number 
  } 
  // export interface RowDetails {
  //   Transfer_from: string;
  //   Transfer_to: string;
  //   Vice_versa: string;
  //   Price: string;
  // }
  
export interface CreateTransferCars{
  uniqueId:string,
  SupplierId:string,
  Transfer_from:string, 
  Extra_Price:string,
  Distance:string,
  Location:string,
  Vice_versa:boolean, 
  NightTime:{ 
      type:string, 
      default:"no",
      enum:['yes','no']
    },
  NightTime_Price:string,
  Price:string,
  SupplierCarDetailsforeign:number
} 
export interface UpdateTransferCars{ 
  uniqueId:string,      
  Transfer_from:string, 
  Distance:string,      
  Extra_Price:string,   
  Location:string,    
  Vice_versa:boolean, 
  NightTime:{ 
      type:string, 
      default:"no", 
      enum:['yes','no'] 
    }, 
  NightTime_Price:string,
  Price:string
} 
export interface CreateExtraSpace{ 
    uniqueId:string,
    SupplierId:string,
    Roof_Rack:string,
    Trailer_Hitch:string,
    Extended_Cargo_Space:string,
    SupplierCarDetailsforeign:number
} 

export interface UpdateExtraSpace{ 
  
  Roof_Rack:string, 
  Trailer_Hitch:string, 
  Extended_Cargo_Space:string 
} 
export interface CreateCartDetails{ 
  uid:string,
  uniqueId:string,
  SupplierId:string,
  VehicleType:string,
  VehicleBrand:string,
  ServiceType:string,
  VehicleModel:string, 
  Doors:string,
  Seats:string, 
  Cargo:string, 
  City:string,
  Country:string,
  Passengers:string,
  MediumBag:string,
  SmallBag:string, 
  TransferInfo:string,

  HalfDayRide:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  FullDayRide:{ 
    type:string,
    default:"no",
    enum:['yes','no']
  },
  HalfFullNightTime:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  HalfFullNightTimePrice:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  VehicleRent:string,
  Fuel:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  Driver:string,
  ParkingFee:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  TollTax:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  Tip:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  TollFee:string,
  Parking:string,
  Currency:string,
  From:string, 
  To:string,
  Others:string
} 

export interface ExtraSpaceItem {
  Roof_Rack?: string;
  Trailer_Hitch?: string;
  Extended_Cargo_Space?: string;
}

export interface CreateVehicle{ 
  SupplierId:string,
  VehicleType:string,
  VehicleBrand:string,
  ServiceType:string,
  VehicleModel:string, 
  Doors:string,
  Seats:string, 
  Cargo:string, 
  Passengers:string,
  MediumBag:string,
  SmallBag:string, 
  ExtraSpace:ExtraSpaceItem[],
} 
//Vehicle Type

export interface UpdateCreateCartDetails{ 
  uid:string,
  uniqueId:string,
  SupplierId:string,
  VehicleType:string,
  VehicleBrand:string,
  ServiceType:string,
  VehicleModel:string, 
  Doors:string,
  Seats:string, 
  Cargo:string, 
  City:string,
  Country:string,
  Passengers:string,
  MediumBag:string,
  SmallBag:string, 
  TransferInfo:string,

  HalfDayRide:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  FullDayRide:{ 
    type:string,
    default:"no",
    enum:['yes','no']
  },
  HalfFullNightTime:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  HalfFullNightTimePrice:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  VehicleRent:string,
  Fuel:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  Driver:string,
  ParkingFee:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  TollTax:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  Tip:{
    type:string,
    default:"no",
    enum:['yes','no']
  },
  TollFee:string,
  Parking:string,
  Currency:string,
  From:string, 
  To:string,
  Others:string
}  
   
export interface SurgeCharge{ 
  uniqueId:string,
  VehicleName:string,
From:string,
To:string,
SurgeChargePrice:string,
supplier_id:string
}

export interface VehicleType{
  VehicleType:string
}

export interface UpdateVehicleType{
  VehicleType:string
}

export interface VehicleBrand{
  VehicleBrand:string,
  serviceType:string
}

export interface UpdateVehicleBrand{
  VehicleBrand:string,
  ServiceType:string
}

export interface ServiceType{
  ServiceType:string
}

export interface UpdateServiceType{
  ServiceType:string
}

export interface VehicleModel{
  VehicleModel:string
}

export interface UpdateVehicleModel{
  VehicleModel:string
}
