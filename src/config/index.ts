require('dotenv').config();
export const DB_URI: string = process.env.DATABASE_URI || 'defaultMongoURI'; 
export const Site_url: string = "localhost:3000";