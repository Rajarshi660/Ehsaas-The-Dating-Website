const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http'); 
const socketio = require('socket.io'); 
require('dotenv').config();

const User = require('./models/User');
const Post = require('./models/Post');
const VibeAction = require('./models/VibeAction');
const Message = require('./models/Message'); 

const app = express();
const server = http.createServer(app); 
const io = socketio(server); 
const PORT = 5000;

// --- DATABASE ---
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ehsaas")
    .then(() => console.log("✅ Ehsaas Engine Connected"))
    .catch(err => console.error(err));

// --- STORAGE SETUP ---
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

// --- LOGOUT (FIXED) ---
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// --- EXPLORE & VIBE ACTIONS ---
app.get('/explore', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
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
            return { ...u._doc, percent, common };
        }).filter(u => u.percent >= 30);

        res.render('explore', { matches });
    } catch (err) { res.status(500).send("Explore Error"); }
});

app.post('/api/vibe-action', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const { toUserId, action } = req.body;
    try {
        await VibeAction.create({ fromUser: req.session.user.id, toUser: toUserId, action });
        if (action === 'tick') {
            await User.findByIdAndUpdate(toUserId, { $inc: { vibeCount: 1 } });
            const reverse = await VibeAction.findOne({ fromUser: toUserId, toUser: req.session.user.id, action: 'tick' });
            if (reverse) return res.json({ success: true, match: true, message: "Mutual Vibe! 🎉" });
            return res.json({ success: true, match: false, message: "Vibe sent! ⏳" });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- CHAT WITH PERSISTENT HISTORY ---
app.get('/chat/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const receiver = await User.findById(req.params.id);
        const meId = req.session.user.id;
        
        const check1 = await VibeAction.findOne({ fromUser: meId, toUser: receiver._id, action: 'tick' });
        const check2 = await VibeAction.findOne({ fromUser: receiver._id, toUser: meId, action: 'tick' });
        if (!check1 || !check2) return res.send("Mutual Vibe Required to Chat.");

        const room = [meId, receiver._id.toString()].sort().join('_');
        const chatHistory = await Message.find({ room }).sort({ createdAt: 1 });

        res.render('chat', { receiver, chatHistory, room, currentUser: req.session.user });
    } catch (err) { res.status(500).send("Chat Error"); }
});

// --- PROFILE LOGIC ---
const fetchFullProfile = async (targetId, currentUserId) => {
    const user = await User.findById(targetId);
    const posts = await Post.find({ user: targetId }).sort({ createdAt: -1 });
    const receivedVibes = await VibeAction.find({ toUser: targetId, action: 'tick' }).populate('fromUser', 'name profilePic');
    const vibeSenders = receivedVibes.map(v => v.fromUser);

    const myActions = await VibeAction.find({ fromUser: currentUserId });
    const myTickIds = myActions.filter(a => a.action === 'tick').map(a => a.toUser.toString());
    const myResponseIds = myActions.map(a => a.toUser.toString());

    const mutualMatchIds = vibeSenders.filter(sender => myTickIds.includes(sender._id.toString())).map(sender => sender._id.toString());
    const topVibe = posts.length ? posts[0].vibe : 'minimal';
    return { user, posts, vibeSenders, myResponseIds, mutualMatchIds, topVibe };
};

app.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const data = await fetchFullProfile(req.session.user.id, req.session.user.id);
    res.render('profile', { ...data, isOwner: true });
});

app.get('/user/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const data = await fetchFullProfile(req.params.id, req.session.user.id);
    res.render('profile', { ...data, isOwner: false });
});

// --- MEDIA UPLOADS ---
app.post('/profile/edit', upload.single('profilePic'), async (req, res) => {
    const { name, bio, genres, gender, interestedIn } = req.body;
    const update = { name, bio, gender, interestedIn, genres: genres.split(',').map(g => g.trim()) };
    if (req.file) update.profilePic = `/uploads/${req.file.filename}`;
    await User.findByIdAndUpdate(req.session.user.id, update);
    res.json({ success: true });
});

app.post('/upload', upload.single('postImage'), async (req, res) => {
    const isVideo = req.file.mimetype.startsWith('video/');
    await Post.create({ user: req.session.user.id, contentUrl: `/uploads/${req.file.filename}`, type: isVideo ? 'video' : 'image' });
    res.json({ success: true });
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('joinRoom', (room) => socket.join(room));

    socket.on('chatMessage', async (data) => {
        try {
            const newMessage = new Message({
                room: data.room,
                sender: data.senderId,
                text: data.msg
            });
            await newMessage.save();
            io.to(data.room).emit('message', {
                msg: data.msg,
                senderId: data.senderId
            });
        } catch (err) { console.error(err); }
    });
});

server.listen(PORT, () => console.log(`🚀 EHSAAS REAL-TIME: http://localhost:${PORT}`));