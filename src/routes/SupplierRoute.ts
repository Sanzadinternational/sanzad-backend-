import { Supplier_price, TransportNode,resetPasswords,ForgetPasswords, CreateVehicles, GetVehiclebyId, CreateZone, createTransfer, updateZone, GetVehicleBySupplierId, GetZoneBySupplierId } from '../controllers/SupplierController';
import authMiddleware from '../middlewares/authMiddleware';
import express, {Request, Response, NextFunction, Router} from 'express'; 
import { CreateSupplier,CreateDriver,DeleteSupplierApi,GetSupplierApi,GetDriver,UpdateDriver,DeleteDriver,UpdateVehicle,ChangeBookingStatusByBookingId,GetBookingBySupplierId,DeleteVehicle,UpdateVehicleTypes,UpdateVehicleModels,deleteZone,UpdateVehicleBrands,UpdateServiceTypes,DeleteVehicleType,GetSupplier,SurgeCharges,GetVehicleCarDetails,GetAllCarDetails,GetTransferCarDetails,UpdateTransferCar,UpdateExtra,CreateVehicleType,GetVehicleBrand,CreateVehicleBrand,CreateServiceType,CreateVehicleModel,GetVehicleType,
    GetCarDetails,DeleteSurgeCharges,UpdateSurgeCharges,GetSurgeCharges,GetServiceType,DeleteVehicleModel,DeleteServiceType,DeleteVehicleBrand,CreateExtraSp,UpdatedSignleCarDetails,GetVehicleModel,DeleteSingleCarDetails,CreateTransferCarDetails,suppliersendOtp,supplierverifyOtp,CreateCartDetail,Supplier_details, GetSupplier_details, deleteUserById,  One_Way_Details, CreateSupplierApi, updateTransfer,getTransferById,deleteTransfer,getTransferBySupplierId} from '../controllers'; 
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: 'drj14x20h',
  api_key: '142682146824431',
  api_secret: 's3uLKiLpYlzCh1IX7IJ4gURiSOc', 
});

// Configure Cloudinary storage for Multer
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'documents', // your Cloudinary folder
    resource_type: 'raw',
    format: "pdf",// auto handles images, pdfs, docs, etc.
  },
});

// Multer middleware
const upload = multer({ storage });

const router = express.Router();  

router.post('/registration',upload.single('Gst_Tax_Certificate'), CreateSupplier); 
router.post('/send-otp', suppliersendOtp); 
router.post('/verify-otp', supplierverifyOtp); 
router.post('/ForgetPassword',ForgetPasswords);
router.post('/ResetPassword',resetPasswords);
router.get('/GetSupplier',GetSupplier); 
router.post('/Supplier_details', Supplier_details); 
router.get('/GetSupplier_details',GetSupplier_details); 
router.delete('/deleteUserById/:id', deleteUserById);
router.post('One_Way_Service_Details', One_Way_Details); 
router.post('/CreateSupplierApi',CreateSupplierApi); 
router.get('/GetSupplierApi',GetSupplierApi);
router.delete('/DeleteSupplierApi/:id',DeleteSupplierApi);
router.post('/Supplier_price',Supplier_price); 
router.post('/TransportNode',TransportNode); 
router.post('/Createcardetail',CreateCartDetail); 
router.post('/Createvehicle',CreateVehicles); 
router.get('/getCarDetails/:id',GetCarDetails); 
router.get('/getVehicle/:id',GetVehiclebyId); 
// router.put('/UpdatedSingleCarDetails/:id',UpdatedSingleCarDetails)
router.put('/UpdatedSignleCarDetails/:id',UpdatedSignleCarDetails)
router.put('/UpdateExtraSpaces/:id',UpdateExtra)
router.put('/UpdateTransferCar/:id',UpdateTransferCar)
router.delete('/DeleteSingleCarDetails/:id',DeleteSingleCarDetails);
router.get('/GetTransferCarDetails/:id',GetTransferCarDetails); 
router.get('/GetVehicleCarDetails/:id',GetVehicleCarDetails)
router.post('/CreateRows',CreateTransferCarDetails);
router.post('/CreateExtraSpaces',CreateExtraSp); 
router.get('/GetAllCarDetails',GetAllCarDetails);
// router.get('/ExtraSpace',ExtraSpace);
router.post('/CreateVehicleType',CreateVehicleType); 
router.get('/GetVehicleType',GetVehicleType); 
router.put('/UpdateVehicleTypes/:id',UpdateVehicleTypes);
router.delete('/DeleteVehicleType/:id',DeleteVehicleType);
router.post('/CreateVehicleBrand',CreateVehicleBrand); 
router.get('/GetVehicleBrand',GetVehicleBrand),
router.delete('/DeleteVehicleBrand/:id',DeleteVehicleBrand);
router.put('/UpdateVehicleBrands/:id',UpdateVehicleBrands)
router.post('/CreateServiceType',CreateServiceType);
router.get('/GetServiceType',GetServiceType)
router.delete('/DeleteServiceType/:id',DeleteServiceType)
router.put('/UpdateServiceTypes/:id',UpdateServiceTypes)
router.post('/CreateVehicleModel',CreateVehicleModel); 
router.get('/GetVehicleModel',GetVehicleModel) 
router.delete('/DeleteVehicleModel/:id',DeleteVehicleModel);
router.put('/UpdateVehicleModels/:id',UpdateVehicleModels);
router.get('/GetVehicleType',GetVehicleType)
router.post('/SurgeCharges',SurgeCharges);
router.get('/GetSurgeCharges/:id',GetSurgeCharges);
router.put('/UpdateSurgeCharges/:id',UpdateSurgeCharges);
router.delete('/DeleteSurgeCharges/:id',DeleteSurgeCharges);
router.post('/new-zone',CreateZone);
router.put('/update-zone/:id',updateZone);
router.post('/new_transfer',createTransfer);
router.delete('/deleteZone/:id',deleteZone);
router.get('/getVehiclebySupplierId/:id',GetVehicleBySupplierId);
router.get('/getZonebySupplierId/:id',GetZoneBySupplierId);
router.get('/gettransferbyid/:id',getTransferById);
router.get('/getTransferBySupplierId/:id',getTransferBySupplierId);
router.put('/updateTransfer/:id',updateTransfer);
router.delete('/deleteTransfer/:id',deleteTransfer);
router.put('/UpdateVehicle/:id',UpdateVehicle);
router.delete('/DeleteVehicle/:id',DeleteVehicle);
router.get('/GetBookingBySupplierId/:id',GetBookingBySupplierId);
router.put('/ChangeBookingStatusByBookingId/:id',ChangeBookingStatusByBookingId);
router.post('/CreateDriver',CreateDriver);
router.get('/GetDriver/:id',GetDriver);
router.delete('/DeleteDriver/:id',DeleteDriver);
router.put('/UpdateDriver/:id',UpdateDriver);
// router.get('/products', GetProducts); 
// router.get('/product/:id', GetProductById);
// router.get('/product/:Keyword', SearchProduct); 

// router.get('/', (req: Request, res: Response, next: NextFunction) => {
//     res.json({ message:'Hello from user route'})    
// })

export {router as SupplierRoute}; 
