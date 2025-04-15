// export default authMiddleware;
import { NextFunction, Request, Response } from "express";
import JWT from 'jsonwebtoken';

type DecodedToken = {
  id: string;
  [key: string]: any;
};

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return res.status(401).send({
        success: false,
        message: "Authorization header is missing",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).send({
        success: false,
        message: "Token is missing",
      });
    }

    JWT.verify(token, process.env.JWT_SECRET || 'your_secret_key', (err, decoded) => {
      if (err || !decoded) {
        return res.status(401).send({
          success: false,
          message: "Unauthorized User",
        });
      }

      const decodedToken = decoded as DecodedToken;
      req.body.id = decodedToken.id;
      req.body.role = decodedToken.role;
      next();
    });
  } catch (error) {
    console.error("Error in authentication middleware:", error);
    res.status(500).send({
      success: false,
      message: "Error in Auth API",
      error,
    });
  }
};

export default authMiddleware;

