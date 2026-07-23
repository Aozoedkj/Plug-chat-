const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8
});

// إعداد مجلد المرفقات
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 📁 نظام التخزين الدائم
const DATA_FILE = path.join(__dirname, 'db.json');

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = { users: [], globalMessages: [], privateMessages: {}, friendRequests: {}, friendsList: {} };
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    try {
        const raw = fs.readFileSync(DATA_FILE);
        return JSON.parse(raw);
    } catch (e) {
        return { users: [], globalMessages: [], privateMessages: {}, friendRequests: {}, friendsList: {} };
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = loadData();

// إعادة ضبط الاتصال عند الإقلاع
db.users.forEach(u => u.isOnline = false);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1️⃣ التسجيل والدخول
app.post('/api/auth', (req, res) => {
    const { username, password, action, age, status } = req.body;
    
    if (!username || !password) {
        return res.json({ success: false, msg: 'يرجى كتابة اسم المستخدم وكلمة السر' });
    }

    let user = db.users.find(u => u.username === username);

    if (action === 'register') {
        if (user) return res.json({ success: false, msg: 'اسم المستخدم مأخوذ بالفعل!' });
        
        user = { 
            username, 
            password, 
            age: age || 20, 
            status: status || 'أعزب', 
            avatar: '', 
            isOnline: true 
        };
        
        db.users.push(user);
        if (!db.friendRequests[username]) db.friendRequests[username] = [];
        if (!db.friendsList[username]) db.friendsList[username] = [];
        
        saveData();
        io.emit('reload-users-list');
        return res.json({ success: true, user });
    }

    if (action === 'login') {
        if (!user || user.password !== password) {
            return res.json({ success: false, msg: 'اسم المستخدم أو كلمة السر خاطئة!' });
        }
        user.isOnline = true;
        saveData();
        io.emit('reload-users-list');
        return res.json({ success: true, user });
    }
});

// 2️⃣ تحديث البروفايل
app.post('/api/update-profile', (req, res) => {
    const { username, age, status, avatar } = req.body;
    const user = db.users.find(u => u.username === username);
    if (user) {
        if (age) user.age = age;
        if (status) user.status = status;
        if (avatar) user.avatar = avatar;
        saveData();
        io.emit('reload-users-list');
    }
    res.json({ success: true });
});

// 3️⃣ جلب المستخدمين
app.get('/api/users', (req, res) => {
    res.json(db.users.map(u => ({
        username: u.username,
        age: u.age,
        status: u.status,
        avatar: u.avatar || '',
        isOnline: !!u.isOnline
    })));
});

// 4️⃣ بيانات مستخدم محدد
app.get('/api/user-info', (req, res) => {
    const u = db.users.find(x => x.username === req.query.username);
    if (u) {
        res.json({ username: u.username, age: u.age, status: u.status, avatar: u.avatar || '' });
    } else {
        res.json({ username: req.query.username, avatar: '' });
    }
});

// 5️⃣ السجلات
app.get('/api/global-history', (req, res) => {
    res.json(db.globalMessages);
});

app.get('/api/private-history', (req, res) => {
    const { user1, user2 } = req.query;
    const chatKey = [user1, user2].sort().join('_');
    res.json(db.privateMessages[chatKey] || []);
});

// 6️⃣ المحادثات والدردشة
app.get('/api/my-chats', (req, res) => {
    const username = req.query.username;
    const myFriends = db.friendsList[username] || [];
    
    const chats = myFriends.map(fName => {
        const friendUser = db.users.find(u => u.username === fName) || {};
        const chatKey = [username, fName].sort().join('_');
        const msgs = db.privateMessages[chatKey] || [];
        const lastMsgObj = msgs[msgs.length - 1];
        
        let lastMsg = 'لا توجد رسائل بعد';
        if (lastMsgObj) {
            if (lastMsgObj.text) lastMsg = lastMsgObj.text;
            else if (lastMsgObj.isAudio) lastMsg = '🎙️ رسالة صوتية';
            else if (lastMsgObj.media) lastMsg = '📷 صورة/فيديو';
        }

        return {
            username: fName,
            avatar: friendUser.avatar || '',
            lastMsg
        };
    });

    res.json(chats);
});

// 7️⃣ طلبات الصداقة
app.post('/api/friend-request', (req, res) => {
    const { from, to } = req.body;
    
    if (!db.friendRequests[to]) db.friendRequests[to] = [];
    if (!db.friendsList[from]) db.friendsList[from] = [];
    
    if (db.friendsList[from].includes(to)) {
        return res.json({ success: false, msg: 'أنتم أصدقاء بالفعل!' });
    }
    
    if (db.friendRequests[to].includes(from)) {
        return res.json({ success: false, msg: 'لقد أرسلت طلب صداقة سابقاً، وهو بانتظار الموافقة.' });
    }

    db.friendRequests[to].push(from);
    saveData();

    io.emit(`new-friend-request-${to}`);

    res.json({ success: true, msg: 'تم إرسال طلب الصداقة بنجاح!' });
});

app.get('/api/friends-data', (req, res) => {
    const username = req.query.username;
    res.json({
        requests: db.friendRequests[username] || [],
        friends: db.friendsList[username] || []
    });
});

app.post('/api/respond-friend-request', (req, res) => {
    const { username, targetUser, action } = req.body;
    
    if (db.friendRequests[username]) {
        db.friendRequests[username] = db.friendRequests[username].filter(u => u !== targetUser);
    }

    if (action === 'accept') {
        if (!db.friendsList[username]) db.friendsList[username] = [];
        if (!db.friendsList[targetUser]) db.friendsList[targetUser] = [];
        
        if (!db.friendsList[username].includes(targetUser)) db.friendsList[username].push(targetUser);
        if (!db.friendsList[targetUser].includes(username)) db.friendsList[targetUser].push(username);
    }

    saveData();
    res.json({ success: true });
});

// 8️⃣ رفع الملفات
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع ملف' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// Socket.io
io.on('connection', (socket) => {
    let connectedUser = null;

    socket.on('user-online', (username) => {
        connectedUser = username;
        const u = db.users.find(x => x.username === username);
        if (u) {
            u.isOnline = true;
            saveData();
        }
        io.emit('update-user-status', { username, isOnline: true });
    });

    socket.on('send-global-msg', (msgData) => {
        db.globalMessages.push(msgData);
        if (db.globalMessages.length > 300) db.globalMessages.shift();
        saveData();
        io.emit('new-global-msg', msgData);
    });

    socket.on('send-private-msg', ({ from, to, msgData }) => {
        const chatKey = [from, to].sort().join('_');
        if (!db.privateMessages[chatKey]) db.privateMessages[chatKey] = [];
        db.privateMessages[chatKey].push(msgData);
        saveData();

        io.emit(`private-msg-${chatKey}`, msgData);
    });

    socket.on('disconnect', () => {
        if (connectedUser) {
            const u = db.users.find(x => x.username === connectedUser);
            if (u) {
                u.isOnline = false;
                saveData();
            }
            io.emit('update-user-status', { username: connectedUser, isOnline: false });
        }
    });
});

// المنفذ الخاص بـ Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Plug Chat يعمل الآن على المنفذ ${PORT}`);
});
