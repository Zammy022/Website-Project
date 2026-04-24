const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const multer = require('multer');

const app = express();
const PORT = 3000;
const USERS_FILE = path.join(__dirname, 'rah', 'data', 'users.json');
const CHAT_FILE = path.join(__dirname, 'rah', 'data', 'chat.json');
const UPLOADS_DIR = path.join(__dirname, 'rah', 'data', 'uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${req.session.userEmail}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed.'));
        }
        cb(null, true);
    }
});

app.use(express.json());
app.use(session({
    secret: 'rth-secret-key-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict' }
}));
app.use(express.static(path.join(__dirname, 'rah', 'pages')));
app.use('/elements', express.static(path.join(__dirname, 'rah', 'elements')));
app.use('/uploads', express.static(UPLOADS_DIR));

function readUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function readChatMessages() {
    return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
}

function writeChatMessages(messages) {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(messages, null, 2));
}

// Sign up
app.post('/signup', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    const users = readUsers();
    if (users.find(u => u.email === email)) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    users.push({ username, email, password, profileImg: null, createdAt: new Date().toISOString() });
    writeUsers(users);
    res.json({ success: true });
});

// Sign in
app.post('/signin', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    const users = readUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }
    req.session.userEmail = user.email;
    res.json({ success: true, username: user.username, profileImg: user.profileImg });
});

// Sign out
app.post('/signout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current user
app.get('/me', (req, res) => {
    if (!req.session.userEmail) {
        return res.status(401).json({ error: 'Not signed in.' });
    }
    const users = readUsers();
    const user = users.find(u => u.email === req.session.userEmail);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ username: user.username, email: user.email, profileImg: user.profileImg });
});

// Update profile image
app.post('/profile/image', (req, res) => {
    if (!req.session.userEmail) {
        return res.status(401).json({ error: 'Not signed in.' });
    }
    upload.single('profileImg')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const imgPath = `/uploads/${req.file.filename}`;
        const users = readUsers();
        const user = users.find(u => u.email === req.session.userEmail);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        user.profileImg = imgPath;
        writeUsers(users);
        res.json({ success: true, profileImg: imgPath });
    });
});

// Chat messages
app.get('/chat/messages', (req, res) => {
    if (!req.session.userEmail) {
        return res.status(401).json({ error: 'Please sign in to access chat.' });
    }
    const users = readUsers();
    const profileImgByEmail = new Map(users.map((user) => [user.email, user.profileImg || null]));
    const messages = readChatMessages();
    const recentMessages = messages.slice(-100).map((msg) => ({
        ...msg,
        profileImg: profileImgByEmail.get(msg.email) || null
    }));
    res.json({ messages: recentMessages });
});

app.post('/chat/messages', (req, res) => {
    if (!req.session.userEmail) {
        return res.status(401).json({ error: 'Please sign in to send messages.' });
    }

    const message = String(req.body.message || '').trim();
    if (!message) {
        return res.status(400).json({ error: 'Message is required.' });
    }
    if (message.length > 300) {
        return res.status(400).json({ error: 'Message is too long.' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === req.session.userEmail);
    if (!user) {
        return res.status(404).json({ error: 'User not found.' });
    }

    const messages = readChatMessages();
    messages.push({
        username: user.username,
        email: user.email,
        message,
        createdAt: new Date().toISOString()
    });

    const maxMessages = 500;
    if (messages.length > maxMessages) {
        writeChatMessages(messages.slice(-maxMessages));
    } else {
        writeChatMessages(messages);
    }

    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
