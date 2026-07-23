const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DB_FILE = './database.json';

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

function loadData() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], globalChat: [], privateChats: {} }));
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('لم يتم رفع أي ملف');
    res.json({ url: `/uploads/${req.file.filename}`, type: req.file.mimetype });
});

let activeUsers = {};

io.on('connection', (socket) => {
    socket.on('user-online', (username) => {
        activeUsers[socket.id] = username;
        let data = loadData();
        let user = data.users.find(u => u.username === username);
        if (user) user.isOnline = true;
        saveData(data);
        io.emit('users-update', data.users);
    });

    socket.on('send-global-msg', (msgData) => {
        let data = loadData();
        data.globalChat.push(msgData);
        saveData(data);
        io.emit('new-global-msg', msgData);
    });

    socket.on('send-private-msg', ({ from, to, msgData }) => {
        let data = loadData();
        let chatKey = [from, to].sort().join('_');
        if (!data.privateChats[chatKey]) data.privateChats[chatKey] = [];
        data.privateChats[chatKey].push(msgData);
        saveData(data);

        io.emit(`private-msg-${chatKey}`, msgData);
        io.emit(`chat-notification-${to}`, from);
    });

    socket.on('send-friend-request', ({ from, to }) => {
        let data = loadData();
        let target = data.users.find(u => u.username === to);
        if (target && !target.requests.includes(from) && !target.friends.includes(from)) {
            target.requests.push(from);
            saveData(data);
            io.emit(`update-requests-${to}`);
        }
    });

    socket.on('accept-friend-request', ({ user, friend }) => {
        let data = loadData();
        let u1 = data.users.find(u => u.username === user);
        let u2 = data.users.find(u => u.username === friend);

        if (u1 && u2) {
            u1.requests = u1.requests.filter(r => r !== friend);
            if (!u1.friends.includes(friend)) u1.friends.push(friend);
            if (!u2.friends.includes(user)) u2.friends.push(user);
            saveData(data);
            io.emit('users-update', data.users);
            io.emit(`update-requests-${user}`);
        }
    });

    socket.on('disconnect', () => {
        let username = activeUsers[socket.id];
        if (username) {
            let data = loadData();
            let user = data.users.find(u => u.username === username);
            if (user) user.isOnline = false;
            saveData(data);
            delete activeUsers[socket.id];
            io.emit('users-update', data.users);
        }
    });
});

app.post('/api/auth', (req, res) => {
    const { username, password, action, age, status } = req.body;
    let data = loadData();

    if (action === 'register') {
        if (data.users.find(u => u.username === username)) {
            return res.json({ success: false, msg: 'اسم المستخدم مستعمل من قبل' });
        }
        let newUser = {
            username,
            password,
            age: age || 18,
            status: status || 'أعزب',
            avatar: '/uploads/default.png',
            friends: [],
            requests: [],
            isOnline: false
        };
        data.users.push(newUser);
        saveData(data);
        return res.json({ success: true, user: newUser });
    } else {
        let user = data.users.find(u => u.username === username && u.password === password);
        if (user) return res.json({ success: true, user });
        return res.json({ success: false, msg: 'خطأ في اسم المستخدم أو كلمة السر' });
    }
});

app.post('/api/update-profile', (req, res) => {
    const { username, age, status, avatar } = req.body;
    let data = loadData();
    let user = data.users.find(u => u.username === username);
    if (user) {
        if (age) user.age = age;
        if (status) user.status = status;
        if (avatar) user.avatar = avatar;
        saveData(data);
        return res.json({ success: true, user });
    }
    res.json({ success: false });
});

server.listen(PORT, () => console.log(`🚀 Plug Chat يعمل الآن على المنفذ ${PORT}`));
