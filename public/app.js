const socket = io();
let currentUser = null;
let currentChatPartner = null;
let isRegisterMode = false;
let selectedMsgElement = null;

// المسار الافتراضي للصورة المحددة
const DEFAULT_AVATAR = '/kullanici.jpg';

// 🔄 استعادة الجلسة وتجنب الخروج عند الـ Refresh
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('plug_chat_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        socket.emit('user-online', currentUser.username);
        setupProfileUI();
    }
});

function logout() {
    localStorage.removeItem('plug_chat_user');
    location.reload();
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('register-fields').classList.toggle('hidden');
    document.getElementById('register-submit-btn').classList.toggle('hidden');
    document.getElementById('login-btn').classList.toggle('hidden');
    document.getElementById('toggle-auth-btn').innerText = isRegisterMode ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'إنشاء حساب جديد';
}

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
        if (!currentUser.avatar || currentUser.avatar.includes('default.png')) {
            currentUser.avatar = DEFAULT_AVATAR;
        }
        localStorage.setItem('plug_chat_user', JSON.stringify(currentUser));
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
    document.getElementById('my-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
}

async function uploadAvatar() {
    const file = document.getElementById('avatar-input').files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    currentUser.avatar = data.url;
    localStorage.setItem('plug_chat_user', JSON.stringify(currentUser));
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
    localStorage.setItem('plug_chat_user', JSON.stringify(currentUser));
    alert('تم حفظ البيانات بنجاح');
}

socket.on('users-update', (users) => {
    const grid = document.getElementById('users-grid');
    grid.innerHTML = '';

    users.forEach(u => {
        if (u.username === currentUser.username) return;
        const userAvatar = u.avatar && !u.avatar.includes('default.png') ? u.avatar : DEFAULT_AVATAR;

        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <span class="status-dot ${u.isOnline ? 'online' : 'offline'}"></span>
            <img class="avatar" src="${userAvatar}" onerror="this.src='${DEFAULT_AVATAR}'">
            <h4>${u.username}</h4>
            <p>العمر: ${u.age} | ${u.status}</p>
            <button onclick="sendFriendRequest('${u.username}')">طلب صداقة</button>
            <button onclick="openPrivateChat('${u.username}')" class="btn-alt">رسالة</button>
        `;
        grid.appendChild(card);
    });
});

// 💬 الشات الجماعي والخاص
async function sendGlobalMsg() {
    const input = document.getElementById('g-msg-input');
    if (input.value.trim()) {
        socket.emit('send-global-msg', { sender: currentUser.username, avatar: currentUser.avatar, text: input.value });
        input.value = '';
    }
}

function sendGlobalLike() {
    socket.emit('send-global-msg', { sender: currentUser.username, avatar: currentUser.avatar, text: '👍' });
}

async function sendGlobalMedia(input) {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    socket.emit('send-global-msg', { sender: currentUser.username, avatar: currentUser.avatar, media: data.url });
    input.value = '';
}

socket.on('new-global-msg', (msg) => {
    renderMessage(document.getElementById('global-messages'), msg);
});

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
            msgData: { sender: currentUser.username, avatar: currentUser.avatar, text: input.value }
        });
        input.value = '';
    }
}

function sendPrivateLike() {
    socket.emit('send-private-msg', {
        from: currentUser.username,
        to: currentChatPartner,
        msgData: { sender: currentUser.username, avatar: currentUser.avatar, text: '👍' }
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
        msgData: { sender: currentUser.username, avatar: currentUser.avatar, media: data.url }
    });
    input.value = '';
}

// 🎙️ تسجيل الفوكال والتسجيل الزمني بالثواني
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recTimerInterval;
let secondsRecorded = 0;

async function toggleRecord(type) {
    const btn = document.getElementById(type === 'global' ? 'g-mic-btn' : 'p-mic-btn');
    const timerBox = document.getElementById(type === 'global' ? 'g-rec-timer' : 'p-rec-timer');
    const timerCount = document.getElementById(type === 'global' ? 'g-timer-count' : 'p-timer-count');
    
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            secondsRecorded = 0;
            
            timerBox.classList.remove('hidden');
            recTimerInterval = setInterval(() => {
                secondsRecorded++;
                const mins = String(Math.floor(secondsRecorded / 60)).padStart(2, '0');
                const secs = String(secondsRecorded % 60).padStart(2, '0');
                timerCount.innerText = `${mins}:${secs}`;
            }, 1000);
            
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                clearInterval(recTimerInterval);
                timerBox.classList.add('hidden');
                
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice.mp3');
                
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                
                const payload = { sender: currentUser.username, avatar: currentUser.avatar, media: data.url, isAudio: true };
                if (type === 'global') {
                    socket.emit('send-global-msg', payload);
                } else {
                    socket.emit('send-private-msg', { from: currentUser.username, to: currentChatPartner, msgData: payload });
                }
            };
            
            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
        } catch (err) {
            alert('يرجى السماح بصلاحية المايكروفون');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.classList.remove('recording');
    }
}

// 🎨 عرض الرسالة وتنسيقها على طريقة فيسبوك مع زر المشغل للتسجيل الصوتي
function renderMessage(container, msg) {
    const wrapper = document.createElement('div');
    const isMe = msg.sender === currentUser.username;
    wrapper.className = `msg-wrapper ${isMe ? 'me' : 'them'}`;

    const avatarUrl = msg.avatar && !msg.avatar.includes('default.png') ? msg.avatar : DEFAULT_AVATAR;

    let contentHtml = ``;
    if (msg.text) contentHtml += `<div>${msg.text}</div>`;
    if (msg.media) {
        if (msg.media.match(/\.(jpeg|jpg|gif|png)$/i)) {
            contentHtml += `<img src="${msg.media}" style="max-width:200px; border-radius:12px; margin-top:5px;">`;
        } else if (msg.media.match(/\.(mp4|webm)$/i)) {
            contentHtml += `<video src="${msg.media}" controls style="max-width:200px; border-radius:12px; margin-top:5px;"></video>`;
        } else if (msg.media.match(/\.(mp3|ogg|wav)$/i) || msg.isAudio) {
            contentHtml += `
                <div class="custom-audio-player">
                    <button onclick="toggleAudio(this, '${msg.media}')">▶️ تشغيل</button>
                    <audio src="${msg.media}" onended="resetAudioBtn(this)"></audio>
                </div>
            `;
        }
    }

    wrapper.innerHTML = `
        <img class="avatar" src="${avatarUrl}" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="msg-body">
            <span class="msg-author">${msg.sender}</span>
            <div class="msg-bubble" onclick="openReactions(this)">
                ${contentHtml}
            </div>
        </div>
    `;

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

// تشغيل الفوكال وإيقافه عبر الزر
function toggleAudio(btn, src) {
    const audio = btn.nextElementSibling;
    if (audio.paused) {
        audio.play();
        btn.innerText = '⏸️ إيقاف';
    } else {
        audio.pause();
        btn.innerText = '▶️ تشغيل';
    }
}

function resetAudioBtn(audio) {
    audio.previousElementSibling.innerText = '▶️ تشغيل';
}

// 😃 فتح التفاعلات عند النقر على الرسالة
function openReactions(bubble) {
    selectedMsgElement = bubble;
    document.getElementById('reaction-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('reaction-modal').classList.add('hidden');
}

function reactToMsg(emoji) {
    if (!selectedMsgElement) return;
    let badge = selectedMsgElement.querySelector('.reaction-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'reaction-badge';
        selectedMsgElement.appendChild(badge);
    }
    badge.innerText = emoji;
    closeModal();
}
