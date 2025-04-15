import { Request, Response, NextFunction } from "express";
import axios from "axios";
import * as turf from '@turf/turf';
import { Units } from '@turf/turf';

export const calculateDistanceHandler= async(req:Request,res:Response,next:NextFunction)=>{
    const { from, to } = req.body; // Expecting { from: [lat, lon], to: [lat, lon] }

  if (!from || !to || from.length !== 2 || to.length !== 2) {
    return res.status(400).json({ error: 'Invalid coordinates provided' });
  }

  try {
    const fromPoint = turf.point(from);
    const toPoint = turf.point(to);
    const options: { units: Units } = { units: 'kilometers' };

    const distance = turf.distance(fromPoint, toPoint, options);
    res.status(200).json({ distance: distance.toFixed(2) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate distance' });
  }
}


export const geocodeHandler= async(req:Request,res:Response,next:NextFunction)=>{
    const { address } = req.query;

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
    if (response.data.length > 0) {
      res.status(200).json({
        lat: response.data[0].lat,
        lon: response.data[0].lon,
      });
    } else {
      res.status(404).json({ error: 'Location not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coordinates' });
  }
}