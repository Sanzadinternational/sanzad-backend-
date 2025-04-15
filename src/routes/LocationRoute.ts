import express, {Request, Response, NextFunction} from 'express';
import { calculateDistanceHandler, geocodeHandler } from '../controllers';
const router = express.Router();

router.post('/calculateDistance', calculateDistanceHandler);
router.get('/geocode', geocodeHandler);


// router.get('/', (req: Request, res: Response, next: NextFunction) => {
//     res.json({ message:'Hello from user route'})    
// })

export {router as LocationRoute}; 