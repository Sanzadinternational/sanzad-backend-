import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import path from 'path';

// Routes
import { SupplierRoute } from "./src/routes";
import { AgentRoute, LocationRoute } from "./src/routes";
import { AdminRoute } from './src/routes/AdminRoute';
import { LoginRoute } from "./src/routes/LoginRoute";
import { SearchRouter } from "./src/routes/SearchRoute";
import { ProfileRoute } from "./src/routes/ProfileRoute";
import { PaymentRoute } from "./src/routes/PaymentRoute";
import { CountryRoute } from "./src/routes/countryRoute";

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
export const io = new SocketIOServer(server, {
  cors: {
    origin: "*", // Allow all origins (change in production)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// Listen for client connections
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options("*", cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use("/api/V1/supplier", SupplierRoute); 
app.use("/api/V1", LoginRoute);
app.use('/api/V1/agent', AgentRoute);
app.use('/api/V1/location', LocationRoute);
app.use('/api/V1/admin', AdminRoute); 
app.use("/api/V1/data", SearchRouter);
app.use('/api/V1/view', ProfileRoute);
app.use('/api/V1/payment', PaymentRoute);
app.use('api/V1/data', CountryRoute);
app.use('/uploads', express.static('/home/ubuntu/uploads'));

// Start Server
server.listen(4000, () => {
  console.clear();
  console.log("Server is running on port 8000");
});
