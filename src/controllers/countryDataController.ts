// import { Request, Response, NextFunction } from "express";
// import fs from 'fs';
// import path from "path";
// const raw = fs.readFileSync(new URL('./country.json', import.meta.url), 'utf-8');
// const data = JSON.parse(raw);



// export const getAllCountryData = async (req: Request, res: Response, next: NextFunction) => {
// // res.json(data);
//   res.json({ message:'Hello from country route'});
// }

import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

// Read and parse the country data only once at module load
let data: any;

try {
  const raw = fs.readFileSync(new URL("./country.json", import.meta.url), "utf-8");
  data = JSON.parse(raw);
} catch (err) {
  console.error("Failed to load country data:", err);
  data = [];
}

export const getAllCountryData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.status(200).json(data);
  } catch (error) {
    next(error); // Pass errors to Express error handler
  }
};
