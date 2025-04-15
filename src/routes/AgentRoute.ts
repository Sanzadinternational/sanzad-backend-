import express, {Request, Response, NextFunction, Router} from 'express'; 
import authMiddleware from '../middlewares/authMiddleware';
import { ForgetPassword,resetPassword } from '../controllers/AgentController';
import { CreateAgent,GetAgent,loginAgent,QuickEmail,GetBill,OneWayTrip,RoundTrip,GetOneWayTrip,GetRoundTrip,UpdateOneWayTrip, sendOtp, verifyOtp } from '../controllers'; 
import { Emailotps } from '../controllers/EmailotpsController'; 
import { dashboard } from '../controllers/LoginController';
const multer = require('multer');
import fs from 'fs';
import path from 'path';
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer
const storage = multer.diskStorage({
    destination: (req: Request, file: any, cb: (error: Error | null, destination: string) => void) => {
        cb(null, uploadDir);
    },
    filename: (req: Request, file: any, cb: (error: Error | null, filename: string) => void) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

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
router.post('/verify-otp', verifyOtp)
router.get('/dashboard', authMiddleware, dashboard);
export {router as AgentRoute}; 
