const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path'); // Added this for folder paths
require('dotenv').config();

const app = express();
const PORT = 5000;

// --- CONFIGURATION ---
app.set('view engine', 'ejs'); // Tell Express you're using EJS
app.set('views', path.join(__dirname, 'views')); // Set the views folder path
app.use(express.static(path.join(__dirname, 'public'))); // Serve style.css from public folder

// Middleware
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// 1. MongoDB Connection
const dbURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ehsaas";

mongoose.connect(dbURI)
    .then(() => console.log("✅ Successfully connected to MongoDB for Ehsaas"))
    .catch((err) => console.log("❌ MongoDB Connection Error: ", err));

// 2. Base Route (Updated)
app.get('/', (req, res) => {
    res.render('landing'); // Use render, not send!
});

// 3. Start the Server
app.listen(PORT, () => {
    console.log(`--------------------------------------------------`);
    console.log(`🚀 EHSAAS BACKEND STARTING...`);
    console.log(`📡 Localhost URL: http://localhost:${PORT}`);
    console.log(`--------------------------------------------------`);
});