//
export interface CreateAgentInput { 
  Company_name: string;
  Address: string;
  Country: string;
  City: string;
  Zip_code: string;
  IATA_Code: string;
  Gst_Vat_Tax_number: string;
  Contact_Person: string;
  Email: string;
 
  Password: string;
  Office_number: string;
  Mobile_number: string;
  Currency: string;
  Gst_Tax_Certificate: string;
  Role:string,
  IsApproved:number,
  Token:string,
  ResetTokenExpiry:string
} 
export interface CreateOtpInput {
  email:string,
  otp: string,
//   isVerified:boolean,
  verificationCode: string,
}

export interface CreateOneWayTripInput {  
      pick_up_location:string,
      drop_off_location:string,
      date: string, 
      passengers:number, 
}

export interface UpdateOneWayTripInput{
      pick_up_location:string,
      drop_off_location:string,
      date: string, 
      passengers:number, 
} 

export interface CreateRoundTripInput{
  pick_up_location:string,
  drop_off_location:string,
  date: string, 
  return_date:string, 
  passengers:number, 
}