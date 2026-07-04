process.on('uncaughtException', err => { console.error('FATAL UNCAUGHT:', err); process.exit(1); });
process.on('unhandledRejection', err => { console.error('FATAL REJECTION:', err); process.exit(1); });

import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

// Fix DNS resolution issue for MongoDB SRV records on this network
import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "8.8.4.4"]);
import app from './app.js';
import { createServer } from "http";
import mongodbConnection from "./db/mongodb/mongodbConnection.js";
import { initWhatsApp } from "./services/whatsapp.service.js";
import { startPaymentCronJobs } from "./cron/payment.cron.js";


mongodbConnection().then(() => {
    const PORT = process.env.PORT || 5002;
    console.log(PORT)
    const server = createServer(app);

    server.listen(PORT, () => {
        console.log(`Server running at port: ${PORT}`);
    });

    // ─── Initialize WhatsApp Payment Verification ──────────────────────────────
    // WhatsApp client (will print QR to terminal on first run)
    initWhatsApp();

    // Payment cron jobs (Gmail polling, matching engine, cleanup)
    startPaymentCronJobs();
}).catch((err) => {
    console.error(" MongoDB connection failed:", err);
});
