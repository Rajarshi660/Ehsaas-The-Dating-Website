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
const PORT = 5000;

// --- DATABASE ---
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ehsaas")
    .then(() => console.log("✅ Ehsaas Engine Connected"))
    .catch(err => console.error(err));

// --- STORAGE ---
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
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'ehsaas_vibe_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// --- AUTH ROUTES ---
app.get('/', (req, res) => res.render('landing'));
app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

app.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password, gender, interestedIn, genres } = req.body;
        const genresArray = genres ? genres.split(',').map(g => g.trim().toLowerCase()) : [];
        const newUser = new User({ name, email, password, gender, interestedIn, genres: genresArray });
        await newUser.save();
        req.session.user = { id: newUser._id, name: newUser.name };
        res.redirect('/profile');
    } catch (err) { res.status(500).send("Signup Error"); }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && user.password === password) {
        req.session.user = { id: user._id, name: user.name };
        return res.redirect('/profile');
    }
    res.status(401).send("Invalid credentials.");
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// --- EXPLORE ---
app.get('/explore', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const me = await User.findById(req.session.user.id);
        const users = await User.find({ 
            _id: { $ne: me._id },
            gender: me.interestedIn,
            interestedIn: me.gender
        });
        const matches = users.map(u => {
            const common = u.genres.filter(g => me.genres.includes(g));
            const percent = Math.round((common.length / Math.max(me.genres.length, 1)) * 100);
            return { ...u._doc, percent, common };
        }).filter(u => u.percent >= 30);
        res.render('explore', { matches });
    } catch (err) { res.status(500).send("Explore Error"); }
});

// --- PROFILE & EDIT ---
app.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const user = await User.findById(req.session.user.id);
        const posts = await Post.find({ user: user._id }).sort({ createdAt: -1 });
        const vibes = posts.map(p => p.vibe);
        const topVibe = vibes.sort((a,b) => vibes.filter(v => v===a).length - vibes.filter(v => v===b).length).pop() || 'minimal';
        res.render('profile', { user, posts, topVibe });
    } catch (err) { res.status(500).send("Profile Error"); }
});

app.post('/profile/edit', upload.single('profilePic'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const { name, bio, genres, gender, interestedIn } = req.body;
        const updateData = { 
            name, bio, gender, interestedIn,
            genres: genres ? genres.split(',').map(g => g.trim().toLowerCase()) : [] 
        };
        if (req.file) updateData.profilePic = `/uploads/${req.file.filename}`;
        
        await User.findByIdAndUpdate(req.session.user.id, updateData);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/upload', upload.single('postImage'), async (req, res) => {
    if (!req.session.user || !req.file) return res.status(400).json({ success: false });
    try {
        const isVideo = req.file.mimetype.startsWith('video/');
        const newPost = new Post({
            user: req.session.user.id,
            contentUrl: `/uploads/${req.file.filename}`,
            type: isVideo ? 'video' : 'image',
            vibe: req.body.vibe || 'minimal'
        });
        await newPost.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.listen(PORT, () => console.log(`🚀 EHSAAS: http://localhost:${PORT}`));