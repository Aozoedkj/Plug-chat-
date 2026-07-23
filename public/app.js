const socket = io();
let currentUser = null;
let currentChatPartner = null;
let isRegisterMode = false;

// التكيف التلقائي لشريط الإدخال مع لوحة المفاتيح
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        const chatBars = document.querySelectorAll('.chat-bar');
        chatBars.forEach(bar => {
            bar.style.bottom = `${window.innerHeight - window.visualViewport.height}px`;
        });
    });
}

// التبديل بين وضع الدخول ووضع إنشاء الحساب
function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const registerFields = document.getElementById('register-fields');
    const loginBtn = document.getElementById('login-btn');
    const registerSubmitBtn = document.getElementById('register-submit-btn');
    const toggleBtn = document.getElementById('toggle-auth-btn');

    if (isRegisterMode) {
        registerFields.classList.remove('hidden');
        registerSubmitBtn.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        toggleBtn.innerText = 'لديك حساب بالفعل؟ تسجيل الدخول';
    } else {
        registerFields.classList.add('hidden');
        registerSubmitBtn.classList.add('hidden');
        loginBtn.classList.remove('hidden');
        toggleBtn.innerText = 'إنشاء حساب جديد';
    }
}

// معالجة تسجيل الدخول / إنشاء الحساب
async function handleAuth(action) {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const age = document.getElementById('auth-age').value;
    const status = document.getElementById('auth-status').value;

    if (!username || !password) return alert('يرجى ملء كافة الحقول الأساسية');

    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, password, action, age, status })
    });
    const data = await res.json();

    if (data.success) {
        currentUser = data.user;
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        socket.emit('user-online', currentUser.username);
        setupProfileUI();
    } else {
        alert(data.msg);
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

function setupProfileUI() {
    document.getElementById('my-username').innerText = currentUser.username;
    document.getElementById('my-age').value = currentUser.age;
    document.getElementById('my-status').value = currentUser.status;
    document.getElementById('my-avatar').src = currentUser.avatar;
}

async function uploadAvatar() {
    const file = document.getElementById('avatar-input').files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    currentUser.avatar = data.url;
    document.getElementById('my-avatar').src = data.url;
}

async function saveProfile() {
    const age = document.getElementById('my-age').value;
    const status = document.getElementById('my-status').value;
    await fetch('/api/update-profile', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: currentUser.username, age, status, avatar: currentUser.avatar })
    });
    alert('تم حفظ البيانات بنجاح');
}

socket.on('users-update', (users) => {
    const grid = document.getElementById('users-grid');
    grid.innerHTML = '';

    users.forEach(u => {
        if (u.username === currentUser.username) return;

        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <span class="status-dot ${u.isOnline ? 'online' : 'offline'}"></span>
            <img class="avatar" src="${u.avatar}">
            <h4>${u.username}</h4>
            <p>العمر: ${u.age} | ${u.status}</p>
            <button onclick="sendFriendRequest('${u.username}')">طلب صداقة</button>
            <button onclick="openPrivateChat('${u.username}')" class="btn-alt">رسالة</button>
        `;
        grid.appendChild(card);
    });
});

function sendFriendRequest(targetUser) {
    socket.emit('send-friend-request', { from: currentUser.username, to: targetUser });
    alert('تم إرسال طلب الصداقة');
}

// 💬 الشات الجماعي
async function sendGlobalMsg() {
    const input = document.getElementById('g-msg-input');
    if (input.value.trim()) {
        socket.emit('send-global-msg', { sender: currentUser.username, text: input.value });
        input.value = '';
    }
}

function sendGlobalLike() {
    socket.emit('send-global-msg', { sender: currentUser.username, text: '👍' });
}

async function sendGlobalMedia(input) {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    socket.emit('send-global-msg', { sender: currentUser.username, media: data.url });
    input.value = '';
}

socket.on('new-global-msg', (msg) => {
    renderMessage(document.getElementById('global-messages'), msg);
});

// 💬 الشات الخاص
function openPrivateChat(targetUsername) {
    currentChatPartner = targetUsername;
    switchTab('chats');
    document.getElementById('private-chat-window').classList.remove('hidden');
    document.getElementById('chat-with-name').innerText = targetUsername;
    document.getElementById('private-messages').innerHTML = '';

    const chatKey = [currentUser.username, targetUsername].sort().join('_');
    socket.off(`private-msg-${chatKey}`);
    socket.on(`private-msg-${chatKey}`, (msg) => {
        renderMessage(document.getElementById('private-messages'), msg);
    });
}

async function sendPrivateMsg() {
    const input = document.getElementById('p-msg-input');
    if (input.value.trim()) {
        socket.emit('send-private-msg', {
            from: currentUser.username,
            to: currentChatPartner,
            msgData: { sender: currentUser.username, text: input.value }
        });
        input.value = '';
    }
}

function sendPrivateLike() {
    socket.emit('send-private-msg', {
        from: currentUser.username,
        to: currentChatPartner,
        msgData: { sender: currentUser.username, text: '👍' }
    });
}

async function sendPrivateMedia(input) {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    socket.emit('send-private-msg', {
        from: currentUser.username,
        to: currentChatPartner,
        msgData: { sender: currentUser.username, media: data.url }
    });
    input.value = '';
}

// 🎙️ تسجيل المايك
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

async function toggleRecord(type) {
    const btn = document.getElementById(type === 'global' ? 'g-mic-btn' : 'p-mic-btn');
    
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice.mp3');
                
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                
                if (type === 'global') {
                    socket.emit('send-global-msg', { sender: currentUser.username, media: data.url });
                } else {
                    socket.emit('send-private-msg', {
                        from: currentUser.username,
                        to: currentChatPartner,
                        msgData: { sender: currentUser.username, media: data.url }
                    });
                }
            };
            
            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
        } catch (err) {
            alert('يرجى منح صلاحية استخدام المايكروفون');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.classList.remove('recording');
    }
}

// عرض الرسالة بالأنواع المختلفة
function renderMessage(container, msg) {
    const el = document.createElement('div');
    const isMe = msg.sender === currentUser.username;
    el.className = `msg ${isMe ? 'msg-me' : 'msg-them'}`;

    let content = `<b>${msg.sender}:</b> ${msg.text || ''}`;
    if (msg.media) {
        if (msg.media.match(/\.(jpeg|jpg|gif|png)$/i)) {
            content += `<br><img src="${msg.media}" style="max-width:100%; border-radius:10px; margin-top:5px;">`;
        } else if (msg.media.match(/\.(mp4|webm)$/i)) {
            content += `<br><video src="${msg.media}" controls style="max-width:100%; border-radius:10px; margin-top:5px;"></video>`;
        } else if (msg.media.match(/\.(mp3|ogg|wav)$/i)) {
            content += `<br><audio src="${msg.media}" controls style="max-width:100%; margin-top:5px;"></audio>`;
        }
    }
    el.innerHTML = content;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

function startCall() {
    alert(`جاري الاتصال بـ ${currentChatPartner}...`);
}
