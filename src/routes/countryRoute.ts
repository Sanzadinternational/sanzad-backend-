import express, {Request, Response, NextFunction, Router} from 'express'; 
import getAllCountryData from "../controllers/countryDataController";
const router = express.Router(); 

router.get('/GetCountryData',getAllCountryData);

export {router as countryRoute }; 
