const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 5000;

// --- EJS & STATIC CONFIG ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); // Important for Form Data

// --- MONGODB CONNECTION ---
const dbURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ehsaas";
mongoose.connect(dbURI)
    .then(() => console.log("✅ Successfully connected to MongoDB for Ehsaas"))
    .catch((err) => console.log("❌ MongoDB Connection Error: ", err));

// --- USER MODEL (Temporary placement for easy setup) ---
const userSchema = new mongoose.Schema({
    name: String,
    age: Number,
    dob: Date,
    genres: [String],
    email: { type: String, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// --- ROUTES ---

// 1. Landing Page
app.get('/', (req, res) => {
    res.render('landing');
});

// 2. Signup Page
app.get('/signup', (req, res) => {
    res.render('signup');
});

// 3. Login Page
app.get('/login', (req, res) => {
    res.render('login');
});

// 4. Handle Signup POST
app.post('/auth/signup', async (req, res) => {
    try {
        const { name, age, dob, genres } = req.body;
        // Logic to save user will go here
        console.log("New Signup Attempt:", name);
        res.send("Account created successfully! (Database logic pending)");
    } catch (error) {
        res.status(500).send("Error creating account.");
    }
});

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`🚀 Server dancing on http://localhost:${PORT}`);
});