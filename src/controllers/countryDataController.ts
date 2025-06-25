import { Request, Response, NextFunction } from "express";
import fs from 'fs';
const raw = fs.readFileSync(new URL('./country.json'), 'utf-8');
const data = JSON.parse(raw);



export const getAllCountryData = async (req: Request, res: Response, next: NextFunction) => {
res.json(data);
}
