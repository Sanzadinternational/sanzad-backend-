import express, {Request, Response, NextFunction, Router} from 'express'; 
import authMiddleware from '../middlewares/authMiddleware';
import { ForgetPassword,resetPassword } from '../controllers/AgentController';
import { CreateAgent,GetAgent,loginAgent,QuickEmail,GetBookingByAgentId,GetBill,OneWayTrip,RoundTrip,GetOneWayTrip,GetRoundTrip,UpdateOneWayTrip, sendOtp, verifyOtp } from '../controllers'; 
import { Emailotps } from '../controllers/EmailotpsController'; 
import { dashboard } from '../controllers/LoginController';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
const multer = require('multer');
import fs from 'fs';
import path from 'path';
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
    resource_type: "raw", // auto handles images, pdfs, docs, etc.
    allowed_formats: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt'], // restrict formats if needed
  },
});

// Multer middleware
const upload = multer({ storage });
const router = express.Router(); 

router.post('/registration',upload.single('Gst_Tax_Certificate'),  CreateAgent); 
// router.post('/forgotpassword',forgotPassword); 
// router.post('/resetpassword',resetpassword);
router.post('/ForgetPassword',ForgetPassword); 
router.post('/ResetPassword',resetPassword);
router.get('/GetAgent',GetAgent); 
router.post('/login',loginAgent);  
// router.post('/emailsend',EmailSend); 
router.post('/getbill',GetBill); 
router.post('/Emailotps',Emailotps); 
router.post('/OneWayTrip',OneWayTrip); 
router.get('/GetOneWayTrip',GetOneWayTrip); 
router.put('/UpdateOneWayTrip',UpdateOneWayTrip); 
router.post('/RoundTrip',RoundTrip); 
router.get('/GetRoundTrip',GetRoundTrip);
router.post('/send-otp', sendOtp);
router.post('/QuickEmail',QuickEmail);
router.post('/verify-otp', verifyOtp);
router.get('/GetBookingByAgentId/:id',GetBookingByAgentId);
router.get('/dashboard', authMiddleware, dashboard);
export {router as AgentRoute}; 
