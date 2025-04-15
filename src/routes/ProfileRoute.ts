import express, {Request, Response, NextFunction, Router} from 'express'; 
const { updateProfile } = require("../controllers/ProfileControllers");
import authMiddleware from '../middlewares/authMiddleware';
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
 
router.put('/UpdateProfile/:id', upload.single('profileImage'),updateProfile); 

export {router as ProfileRoute}; 

