const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const User = require('./models/User');
const Post = require('./models/Post');

const app = express();

// --- DATABASE ---
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ehsaas")
    .then(() => console.log("✅ Ehsaas DB Connected"))
    .catch(err => console.log("❌ DB Error:", err));

// --- MULTER CONFIG (Auto-creates uploads folder) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'ehsaas_full_stack_vibe_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Global user variable for EJS
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// --- ROUTES ---

app.get('/', (req, res) => res.render('landing'));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/login', (req, res) => res.render('login'));

app.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password, age, dob, genres } = req.body;
        const genresArray = genres.split(',').map(g => g.trim().toLowerCase());
        const newUser = new User({ name, email, password, age, dob, genres: genresArray });
        const savedUser = await newUser.save();
        req.session.user = { id: savedUser._id, name: savedUser.name };
        res.redirect('/');
    } catch (err) { res.status(500).send("Signup Error"); }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && user.password === password) {
        req.session.user = { id: user._id, name: user.name };
        return res.redirect('/');
    }
    res.status(401).send("Invalid Login");
});

// Explore Page (The Match Engine)
app.get('/explore', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const me = await User.findById(req.session.user.id);
        const users = await User.find({ _id: { $ne: me._id } });
        const matches = users.map(u => {
            const common = u.genres.filter(g => me.genres.includes(g));
            const percent = Math.round((common.length / me.genres.length) * 100);
            return { ...u._doc, percent, common };
        }).filter(u => u.percent >= 40);
        res.render('explore', { matches });
    } catch (err) { res.status(500).send("Explore Error"); }
});

// Profile View
app.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const user = await User.findById(req.session.user.id);
    const posts = await Post.find({ user: user._id }).sort({ createdAt: -1 });
    res.render('profile', { user, posts });
});

// Profile Edit (Handles Profile Pic)
app.post('/profile/edit', upload.single('profilePic'), async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const { name, bio, genres } = req.body;
        const genresArray = genres ? genres.split(',').map(g => g.trim().toLowerCase()) : [];
        let updateData = { name, bio, genres: genresArray };
        if (req.file) updateData.profilePic = `/uploads/${req.file.filename}`;
        
        const updated = await User.findByIdAndUpdate(req.session.user.id, updateData, { new: true });
        req.session.user.name = updated.name;
        res.redirect('/profile');
    } catch (err) { res.status(500).send("Update Error"); }
});

// Post Upload (Handles Cropped Blob from Fetch)
app.post('/upload', upload.single('postImage'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const newPost = new Post({
            user: req.session.user.id,
            imageUrl: `/uploads/${req.file.filename}`,
            caption: req.body.caption || ""
        });
        await newPost.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.listen(5000, () => console.log("🚀 EHSAAS: http://localhost:5000"));