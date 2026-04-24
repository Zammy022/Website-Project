const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const BASE_DATA_DIR = path.join(__dirname, 'rah', 'data');
const SESSION_SECRET = process.env.SESSION_SECRET || 'rth-dev-secret-change-me';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ADMIN_USERNAMES = new Set(['Zammy022']);

function resolveDataDir() {
    const candidate = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : BASE_DATA_DIR;
    if (candidate === BASE_DATA_DIR) return BASE_DATA_DIR;
    try {
        fs.mkdirSync(candidate, { recursive: true });
        fs.mkdirSync(path.join(candidate, 'uploads'), { recursive: true });
        fs.accessSync(candidate, fs.constants.W_OK);
        return candidate;
    } catch {
        console.warn(`DATA_DIR "${candidate}" is not accessible, falling back to default data directory.`);
        return BASE_DATA_DIR;
    }
}

const DATA_DIR = resolveDataDir();
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

console.log(`Data directory: ${DATA_DIR}`);

function ensureDataStorage() {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(USERS_FILE)) {
        const defaultUsers = path.join(BASE_DATA_DIR, 'users.json');
        if (fs.existsSync(defaultUsers) && DATA_DIR !== BASE_DATA_DIR) {
            fs.copyFileSync(defaultUsers, USERS_FILE);
        } else {
            fs.writeFileSync(USERS_FILE, '[]');
        }
    }
    if (!fs.existsSync(CHAT_FILE)) {
        const defaultChat = path.join(BASE_DATA_DIR, 'chat.json');
        if (fs.existsSync(defaultChat) && DATA_DIR !== BASE_DATA_DIR) {
            fs.copyFileSync(defaultChat, CHAT_FILE);
        } else {
            fs.writeFileSync(CHAT_FILE, '[]');
        }
    }
}

ensureDataStorage();

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
app.set('trust proxy', 1);
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: IS_PRODUCTION,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));
app.use(express.static(path.join(__dirname, 'rah', 'pages')));
app.use('/elements', express.static(path.join(__dirname, 'rah', 'elements')));
app.use('/uploads', express.static(UPLOADS_DIR));

function readUsers() {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    let changed = false;

    users.forEach((user) => {
        if (!Object.prototype.hasOwnProperty.call(user, 'profileImg')) {
            user.profileImg = null;
            changed = true;
        }
        if (!Object.prototype.hasOwnProperty.call(user, 'isAdmin')) {
            user.isAdmin = ADMIN_USERNAMES.has(user.username);
            changed = true;
        }
        if (ADMIN_USERNAMES.has(user.username) && !user.isAdmin) {
            user.isAdmin = true;
            changed = true;
        }
    });

    if (changed) {
        writeUsers(users);
    }

    return users;
}
function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function createMessageId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readChatMessages() {
    const messages = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    let changed = false;

    messages.forEach((message) => {
        if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
            message.id = createMessageId();
            changed = true;
        }
    });

    if (changed) {
        writeChatMessages(messages);
    }

    return messages;
}

function writeChatMessages(messages) {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(messages, null, 2));
}

function getSessionUser(req) {
    if (!req.session.userEmail) {
        return null;
    }
    const users = readUsers();
    return users.find((user) => user.email === req.session.userEmail) || null;
}

function requireAuth(req, res, next) {
    const user = getSessionUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Please sign in first.' });
    }
    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
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
    users.push({
        username,
        email,
        password,
        profileImg: null,
        isAdmin: false,
        createdAt: new Date().toISOString()
    });
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
    res.json({ success: true, username: user.username, profileImg: user.profileImg, isAdmin: Boolean(user.isAdmin) });
});

// Sign out
app.post('/signout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current user
app.get('/me', (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Not signed in.' });
    }
    res.json({ username: user.username, email: user.email, profileImg: user.profileImg, isAdmin: Boolean(user.isAdmin) });
});

// Update profile image
app.post('/profile/image', (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Not signed in.' });
    }
    upload.single('profileImg')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

        const imgPath = `/uploads/${req.file.filename}`;
        const users = readUsers();
        const mutableUser = users.find((entry) => entry.email === user.email);
        if (!mutableUser) return res.status(404).json({ error: 'User not found.' });
        mutableUser.profileImg = imgPath;
        writeUsers(users);
        res.json({ success: true, profileImg: imgPath });
    });
});

// Chat messages
app.get('/chat/messages', (req, res) => {
    const currentUser = getSessionUser(req);
    if (!currentUser) {
        return res.status(401).json({ error: 'Please sign in to access chat.' });
    }
    const users = readUsers();
    const profileImgByEmail = new Map(users.map((user) => [user.email, user.profileImg || null]));
    const messages = readChatMessages();
    const recentMessages = messages.slice(-100).map((msg) => ({
        ...msg,
        profileImg: profileImgByEmail.get(msg.email) || null,
        canDelete: Boolean(currentUser.isAdmin)
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
        id: createMessageId(),
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

app.delete('/chat/messages/:id', requireAuth, requireAdmin, (req, res) => {
    const messageId = String(req.params.id || '').trim();
    if (!messageId) {
        return res.status(400).json({ error: 'Message id is required.' });
    }

    const messages = readChatMessages();
    const nextMessages = messages.filter((msg) => msg.id !== messageId);
    if (nextMessages.length === messages.length) {
        return res.status(404).json({ error: 'Message not found.' });
    }

    writeChatMessages(nextMessages);
    res.json({ success: true });
});

app.get('/admin/accounts', requireAuth, requireAdmin, (req, res) => {
    const users = readUsers();
    const safeUsers = users.map((user) => ({
        username: user.username,
        email: user.email,
        profileImg: user.profileImg || null,
        isAdmin: Boolean(user.isAdmin),
        createdAt: user.createdAt || null,
        isCurrentUser: user.email === req.user.email
    }));
    res.json({ users: safeUsers });
});

app.delete('/admin/accounts/:email', requireAuth, requireAdmin, (req, res) => {
    const targetEmail = decodeURIComponent(String(req.params.email || '')).trim();
    if (!targetEmail) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    const users = readUsers();
    const targetIndex = users.findIndex((user) => user.email.toLowerCase() === targetEmail.toLowerCase());
    if (targetIndex === -1) {
        return res.status(404).json({ error: 'Account not found.' });
    }

    const targetUser = users[targetIndex];
    const adminCount = users.filter((user) => Boolean(user.isAdmin)).length;
    if (targetUser.isAdmin && adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin account.' });
    }

    users.splice(targetIndex, 1);
    writeUsers(users);

    const nextMessages = readChatMessages().filter((msg) => msg.email.toLowerCase() !== targetUser.email.toLowerCase());
    writeChatMessages(nextMessages);

    if (targetUser.profileImg && targetUser.profileImg.startsWith('/uploads/')) {
        const imagePath = path.join(UPLOADS_DIR, path.basename(targetUser.profileImg));
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
    }

    if (targetUser.email.toLowerCase() === req.user.email.toLowerCase()) {
        req.session.destroy(() => {
            res.json({ success: true, signedOut: true });
        });
        return;
    }

    res.json({ success: true, signedOut: false });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
