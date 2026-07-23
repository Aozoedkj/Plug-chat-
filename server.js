const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100MB للفوكال والملفات
});

// إعداد مجلد uploads
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// إعداد التخزين للملفات والفوكال
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🧠 الذاكرة المؤقتة (بيانات المستخدمين والرسائل)
let users = [];           
let globalMessages = [];  
let privateMessages = {}; 
let friendRequests = {};  
let friendsList = {};     

// 1️⃣ التسجيل والدخول
app.post('/api/auth', (req, res) => {
    const { username, password, action, age, status } = req.body;
    let user = users.find(u => u.username === username);

    if (action === 'register') {
        if (user) return res.json({ success: false, msg: 'اسم المستخدم مأخوذ بالفعل!' });
        user = { 
            username, 
            password, 
            age: age || 20, 
            status: status || 'أعزب', 
            avatar: '/kullanici.jpg', 
            isOnline: false 
        };
        users.push(user);
        friendRequests[username] = [];
        friendsList[username] = [];
        return res.json({ success: true, user });
    }

    if (action === 'login') {
        if (!user || user.password !== password) {
            return res.json({ success: false, msg: 'اسم المستخدم أو كلمة السر خاطئة!' });
        }
        return res.json({ success: true, user });
    }
});

// 2️⃣ تحديث الملف الشخصي
app.post('/api/update-profile', (req, res) => {
    const { username, age, status, avatar } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        if (age) user.age = age;
        if (status) user.status = status;
        if (avatar) user.avatar = avatar;
    }
    res.json({ success: true });
});

// 3️⃣ جلب المستخدمين المعرفين
app.get('/api/users', (req, res) => {
    res.json(users.map(u => ({
        username: u.username,
        age: u.age,
        status: u.status,
        avatar: u.avatar || '/kullanici.jpg',
        isOnline: u.isOnline
    })));
});

// 4️⃣ معلومات مستخدم معين
app.get('/api/user-info', (req, res) => {
    const u = users.find(x => x.username === req.query.username);
    if (u) {
        res.json({ username: u.username, age: u.age, status: u.status, avatar: u.avatar || '/kullanici.jpg' });
    } else {
        res.json({ username: req.query.username, avatar: '/kullanici.jpg' });
    }
});

// 5️⃣ سجلات الشات (تمنع مسح الرسائل عند الريفرش)
app.get('/api/global-history', (req, res) => {
    res.json(globalMessages);
});

app.get('/api/private-history', (req, res) => {
    const { user1, user2 } = req.query;
    const chatKey = [user1, user2].sort().join('_');
    res.json(privateMessages[chatKey] || []);
});

// 6️⃣ قائمة المحادثات (أسلوب فيسبوك)
app.get('/api/my-chats', (req, res) => {
    const username = req.query.username;
    const myFriends = friendsList[username] || [];
    
    const chats = myFriends.map(fName => {
        const friendUser = users.find(u => u.username === fName) || {};
        const chatKey = [username, fName].sort().join('_');
        const msgs = privateMessages[chatKey] || [];
        const lastMsgObj = msgs[msgs.length - 1];
        
        let lastMsg = 'لا توجد رسائل بعد';
        if (lastMsgObj) {
            if (lastMsgObj.text) lastMsg = lastMsgObj.text;
            else if (lastMsgObj.isAudio) lastMsg = '🎙️ رسالة صوتية';
            else if (lastMsgObj.media) lastMsg = '📷 صورة/فيديو';
        }

        return {
            username: fName,
            avatar: friendUser.avatar || '/kullanici.jpg',
            lastMsg
        };
    });

    res.json(chats);
});

// 7️⃣ طلبات وقائمة الأصدقاء
app.post('/api/friend-request', (req, res) => {
    const { from, to } = req.body;
    if (!friendRequests[to]) friendRequests[to] = [];
    if (!friendRequests[to].includes(from)) {
        friendRequests[to].push(from);
    }
    res.json({ success: true, msg: 'تم إرسال طلب الصداقة' });
});

app.get('/api/friends-data', (req, res) => {
    const username = req.query.username;
    res.json({
        requests: friendRequests[username] || [],
        friends: friendsList[username] || []
    });
});

app.post('/api/respond-friend-request', (req, res) => {
    const { username, targetUser, action } = req.body;
    
    if (friendRequests[username]) {
        friendRequests[username] = friendRequests[username].filter(u => u !== targetUser);
    }

    if (action === 'accept') {
        if (!friendsList[username]) friendsList[username] = [];
        if (!friendsList[targetUser]) friendsList[targetUser] = [];
        
        if (!friendsList[username].includes(targetUser)) friendsList[username].push(targetUser);
        if (!friendsList[targetUser].includes(username)) friendsList[targetUser].push(username);
    }

    res.json({ success: true });
});

// 8️⃣ رفع الملفات والصوتيات
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع ملف' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// ⚡ Socket.io للمحادثات المباشرة
io.on('connection', (socket) => {
    let connectedUser = null;

    socket.on('user-online', (username) => {
        connectedUser = username;
        const u = users.find(x => x.username === username);
        if (u) u.isOnline = true;
        io.emit('update-user-status', { username, isOnline: true });
    });

    socket.on('send-global-msg', (msgData) => {
        globalMessages.push(msgData);
        if (globalMessages.length > 200) globalMessages.shift();
        io.emit('new-global-msg', msgData);
    });

    socket.on('send-private-msg', ({ from, to, msgData }) => {
        const chatKey = [from, to].sort().join('_');
        if (!privateMessages[chatKey]) privateMessages[chatKey] = [];
        privateMessages[chatKey].push(msgData);

        io.emit(`private-msg-${chatKey}`, msgData);
    });

    socket.on('disconnect', () => {
        if (connectedUser) {
            const u = users.find(x => x.username === connectedUser);
            if (u) u.isOnline = false;
            io.emit('update-user-status', { username: connectedUser, isOnline: false });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
