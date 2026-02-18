const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketio = require('socket.io');
require('dotenv').config();

// Models
const User = require('./models/User');
const Post = require('./models/Post');
const VibeAction = require('./models/VibeAction');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 5000;

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ehsaas")
    .then(() => console.log("✅ Ehsaas Engine Synchronized"))
    .catch(err => console.error(err));

// --- STORAGE CONFIG ---
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

// Global Middleware for Navbar Counts & Data
app.use(async (req, res, next) => {
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user.id);
            res.locals.currentUser = user;
            
            // Pending matches for the Heart Notification Badge
            const received = await VibeAction.find({ toUser: user._id, action: 'tick' }).populate('fromUser');
            const myActions = await VibeAction.find({ fromUser: user._id });
            const myRespondedIds = myActions.map(a => a.toUser.toString());
            
            res.locals.pendingCount = received.filter(v => !myRespondedIds.includes(v.fromUser._id.toString())).length;
        } catch (err) {
            res.locals.pendingCount = 0;
        }
    } else {
        res.locals.currentUser = null;
        res.locals.pendingCount = 0;
    }
    next();
});

// --- AUTH & LANDING ROUTES ---
app.get('/', (req, res) => res.render('landing')); 

app.get('/login', (req, res) => res.render('login'));

app.get('/signup', (req, res) => res.render('signup'));

// FIXED: Signup Post Route
app.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password, gender, interestedIn, genres } = req.body;
        const genresArray = genres ? genres.split(',').map(g => g.trim().toLowerCase()) : [];
        
        const newUser = new User({ 
            name, email, password, gender, interestedIn, 
            genres: genresArray,
            points: 50, level: 1,
            currentMood: "Vibing", moodIcon: "✨",
            profilePic: "/uploads/default-avatar.png" 
        });

        await newUser.save();
        req.session.user = { id: newUser._id, name: newUser.name };
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.status(500).send("Signup Error: Account may already exist.");
    }
});

// Fixed: Login Post Route
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && user.password === password) {
            req.session.user = { id: user._id, name: user.name };
            return res.redirect('/profile');
        }
        res.status(401).send("Invalid email or password.");
    } catch (err) { res.status(500).send("Login Error"); }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// --- PROFILE EDIT (FIXED FOR SAVE FAILED) ---
app.post('/profile/edit', upload.single('profilePic'), async (req, res) => {
    try {
        const { name, bio, genres } = req.body;
        const updateData = { 
            name, bio, 
            genres: genres ? genres.split(',').map(g => g.trim()) : [] 
        };

        if (req.file) {
            updateData.profilePic = `/uploads/${req.file.filename}`;
        }

        const updatedUser = await User.findByIdAndUpdate(req.session.user.id, updateData, { new: true });
        if (updatedUser) {
            req.session.user.name = updatedUser.name;
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false });
        }
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- PROFILE FETCHING LOGIC ---
const fetchFullProfile = async (targetId, currentUserId) => {
    const user = await User.findById(targetId);
    const posts = await Post.find({ user: targetId }).sort({ createdAt: -1 });
    
    const received = await VibeAction.find({ toUser: targetId, action: 'tick' }).populate('fromUser');
    const myActions = await VibeAction.find({ fromUser: currentUserId });
    
    const myRespondedIds = myActions.map(a => a.toUser.toString());
    const myTickIds = myActions.filter(a => a.action === 'tick').map(a => a.toUser.toString());

    return { 
        user, posts, 
        pendingMatches: received.filter(v => !myRespondedIds.includes(v.fromUser._id.toString())).map(v => v.fromUser),
        confirmedChats: received.filter(v => myTickIds.includes(v.fromUser._id.toString())).map(v => v.fromUser),
        isOwner: targetId.toString() === currentUserId.toString() 
    };
};

app.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const data = await fetchFullProfile(req.session.user.id, req.session.user.id);
    res.render('profile', { ...data, topVibe: data.posts.length ? data.posts[0].vibe : 'minimal' });
});

app.get('/user/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const data = await fetchFullProfile(req.params.id, req.session.user.id);
    res.render('profile', { ...data, topVibe: data.posts.length ? data.posts[0].vibe : 'minimal' });
});

// --- EXPLORE ---
app.get('/explore', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const me = await User.findById(req.session.user.id);
    const myActions = await VibeAction.find({ fromUser: me._id });
    const actedUserIds = myActions.map(a => a.toUser);

    const users = await User.find({ 
        _id: { $ne: me._id, $nin: actedUserIds },
        gender: me.interestedIn,
        interestedIn: me.gender
    });

    const matches = users.map(u => {
        const common = u.genres.filter(g => me.genres.includes(g));
        const percent = Math.round((common.length / Math.max(me.genres.length, 1)) * 100);
        return { ...u._doc, percent };
    }).filter(u => u.percent >= 30);

    const data = await fetchFullProfile(me._id, me._id);
    res.render('explore', { ...data, matches, currentUserMoodIcon: me.moodIcon });
});

// --- CONTENT & API ---
app.post('/upload', upload.single('postImage'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    const isVideo = req.file.mimetype.startsWith('video/');
    await Post.create({ 
        user: req.session.user.id, 
        contentUrl: `/uploads/${req.file.filename}`, 
        type: isVideo ? 'video' : 'image' 
    });
    res.json({ success: true });
});

app.post('/delete-post/:id', async (req, res) => {
    const post = await Post.findById(req.params.id);
    if (post && post.user.toString() === req.session.user.id) {
        const filePath = path.join(__dirname, 'public', post.contentUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await Post.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } else res.status(403).json({ success: false });
});

app.post('/api/vibe-action', async (req, res) => {
    const { toUserId, action } = req.body;
    await VibeAction.findOneAndUpdate(
        { fromUser: req.session.user.id, toUser: toUserId },
        { action },
        { upsert: true }
    );
    res.json({ success: true });
});

app.post('/api/update-mood', async (req, res) => {
    const { mood, icon } = req.body;
    await User.findByIdAndUpdate(req.session.user.id, { currentMood: mood, moodIcon: icon });
    res.json({ success: true });
});

// --- CHAT ---
app.get('/chat/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const receiver = await User.findById(req.params.id);
    const room = [req.session.user.id, receiver._id.toString()].sort().join('_');
    const chatHistory = await Message.find({ room }).sort({ createdAt: 1 });
    res.render('chat', { receiver, chatHistory, room });
});

io.on('connection', (socket) => {
    socket.on('joinRoom', (room) => socket.join(room));
    socket.on('chatMessage', async (data) => {
        const msg = new Message({ room: data.room, sender: data.senderId, text: data.msg });
        await msg.save();
        io.to(data.room).emit('message', { msg: data.msg, senderId: data.senderId });
    });
});

server.listen(PORT, () => console.log(`🚀 EHSAAS LIVE: http://localhost:${PORT}`));