export interface AgentInput{
                Company_name:string,
                Address:string,
                Country:string,
                City:string,
                Zip_code:string,
                IATA_Code:string,
                Gst_Vat_Tax_number:string, 
                Contact_Person:string,
                Email:string,
                Office_number:string,
                Mobile_number:string,
                Currency:string,
                Gst_Tax_Certificate:string,
                Role:string,
                profileImage: string
} 

export interface SupplierInput { 
    Company_name:string,
    Owner: string,
    Address: string,
    Country: string, 
    City: string,
    Zip_code: string,
    Office_number: string,
    Contact_Person: string,
    Mobile_number: string,
    Gst_Vat_Tax_number: string, 
    PAN_number: string, 
    Currency: string,
    Gst_Tax_Certificate: string,
    profileImage:string
    }
export interface AdminInput{ 
    Agent_account:boolean, 
    Agent_operation:boolean, 
    Supplier_account:boolean, 
    Supplier_operation:boolean, 
    Company_name:string,
    profileImage:string
}