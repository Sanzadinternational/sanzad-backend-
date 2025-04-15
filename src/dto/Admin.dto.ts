export interface CreateAdmin{ 
    Email:string, 
    Role:string, 
  
    Password:string, 
    Agent_account:boolean, 
    Agent_operation:boolean, 
    Agent_product:boolean,
    Supplier_account:boolean, 
    Supplier_operation:boolean, 
    Supplier_product:boolean,
    Company_name:string,
     IsApproved:number,
     Token:string,
     resetTokenExpiry:string
} 

export interface CreateMargin{
       Company_name:string,
        Currency: string,
        MarginPrice:string,
        supplier_id: string,
        Supplierregisterforeign:number
}
 