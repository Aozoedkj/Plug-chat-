const socket = io();
let currentUser = null;
let currentChatPartner = null;
let isRegisterMode = false;
let selectedMsgElement = null;
let activeReplyText = null;

const DEFAULT_AVATAR = '/kullanici.jpg';

// 🔄 الحفاظ على الجلسة عند Refresh
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('plug_chat_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        socket.emit('user-online', currentUser.username);
        setupProfileUI();
        loadUsersList();
        loadFriendsData();
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

    if (!username || !password) return alert('يرجى كتابة الاسم وكلمة السر');

    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, password, action, age, status })
    });
    const data = await res.json();

    if (data.success) {
        currentUser = data.user;
        localStorage.setItem('plug_chat_user', JSON.stringify(currentUser));
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        socket.emit('user-online', currentUser.username);
        setupProfileUI();
        loadUsersList();
        loadFriendsData();
    } else {
        alert(data.msg);
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    
    if (tabName === 'users') loadUsersList();
    if (tabName === 'chats') loadConversationsList();
    if (tabName === 'global') loadGlobalHistory();
    if (tabName === 'friends') loadFriendsData();
}

function setupProfileUI() {
    document.getElementById('my-username').innerText = currentUser.username;
    document.getElementById('my-age').value = currentUser.age || 20;
    document.getElementById('my-status').value = currentUser.status || 'أعزب';
    document.getElementById('my-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
}

// 📸 تغيير وصيانة الملف الشخصي
async function uploadAvatar() {
    const input = document.getElementById('avatar-input');
    if (input.files && input.files[0]) {
        const formData = new FormData();
        formData.append('file', input.files[0]);
        
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.url) {
            currentUser.avatar = data.url;
            document.getElementById('my-avatar').src = data.url;
            saveProfile();
        }
    }
}

async function saveProfile() {
    const age = document.getElementById('my-age').value;
    const status = document.getElementById('my-status').value;
    
    currentUser.age = age;
    currentUser.status = status;
    localStorage.setItem('plug_chat_user', JSON.stringify(currentUser));
    
    await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, age, status, avatar: currentUser.avatar })
    });
    
    alert('تم حفظ البيانات بنجاح!');
}

// 🌐 جلب مستخدمي المنصة
async function loadUsersList() {
    const res = await fetch('/api/users');
    const users = await res.json();
    const grid = document.getElementById('users-grid');
    grid.innerHTML = '';

    users.forEach(u => {
        if (u.username === currentUser.username) return;
        const userAvatar = u.avatar || DEFAULT_AVATAR;

        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <span class="status-dot ${u.isOnline ? 'online' : 'offline'}"></span>
            <img class="avatar" src="${userAvatar}" onclick="viewUserProfile('${u.username}')">
            <h4>${u.username}</h4>
            <p>العمر: ${u.age || 20} | ${u.status || 'أعزب'}</p>
            <button onclick="sendFriendRequest('${u.username}')">طلب صداقة</button>
            <button onclick="openPrivateChat('${u.username}')" class="btn-alt">رسالة</button>
        `;
        grid.appendChild(card);
    });
}

// 👥 طلبات الأصدقاء
async function sendFriendRequest(targetUser) {
    const res = await fetch('/api/friend-request', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ from: currentUser.username, to: targetUser })
    });
    const data = await res.json();
    alert(data.msg || 'تم إرسال طلب الصداقة');
}

async function loadFriendsData() {
    const res = await fetch(`/api/friends-data?username=${currentUser.username}`);
    const data = await res.json();

    const reqList = document.getElementById('requests-list');
    reqList.innerHTML = '';
    (data.requests || []).forEach(req => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.innerHTML = `
            <span><b>${req}</b> أرسل لك طلب صداقة</span>
            <button onclick="respondFriendReq('${req}', 'accept')">قبول</button>
            <button onclick="respondFriendReq('${req}', 'reject')" class="btn-secondary">رفض</button>
        `;
        reqList.appendChild(item);
    });

    const fList = document.getElementById('friends-list');
    fList.innerHTML = '';
    (data.friends || []).forEach(f => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.innerHTML = `<span><b>${f}</b></span> <button onclick="openPrivateChat('${f}')">مراسلة</button>`;
        fList.appendChild(item);
    });
}

async function respondFriendReq(fromUser, action) {
    await fetch('/api/respond-friend-request', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: currentUser.username, targetUser: fromUser, action })
    });
    loadFriendsData();
}

// 💬 قائمة محادثات أسلوب Messenger
async function loadConversationsList() {
    document.getElementById('chats-list-view').classList.remove('hidden');
    document.getElementById('private-chat-window').classList.add('hidden');

    const res = await fetch(`/api/my-chats?username=${currentUser.username}`);
    const chats = await res.json();
    const container = document.getElementById('conversations-list');
    container.innerHTML = '';

    chats.forEach(c => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.innerHTML = `
            <img class="avatar" src="${c.avatar || DEFAULT_AVATAR}">
            <div>
                <b>${c.username}</b>
                <div style="font-size:12px; color:#65676b;">${c.lastMsg || 'اضغط لبدء المحادثة'}</div>
            </div>
        `;
        item.onclick = () => openPrivateChat(c.username);
        container.appendChild(item);
    });
}

function backToChatsList() {
    loadConversationsList();
}

async function openPrivateChat(targetUsername) {
    currentChatPartner = targetUsername;
    document.getElementById('chats-list-view').classList.add('hidden');
    document.getElementById('private-chat-window').classList.remove('hidden');
    document.getElementById('chat-with-name').innerText = targetUsername;
    
    const msgContainer = document.getElementById('private-messages');
    msgContainer.innerHTML = '';

    const res = await fetch(`/api/private-history?user1=${currentUser.username}&user2=${targetUsername}`);
    const history = await res.json();
    history.forEach(m => renderMessage(msgContainer, m));

    const chatKey = [currentUser.username, targetUsername].sort().join('_');
    socket.off(`private-msg-${chatKey}`);
    socket.on(`private-msg-${chatKey}`, (msg) => {
        renderMessage(msgContainer, msg);
    });
}

async function loadGlobalHistory() {
    const msgContainer = document.getElementById('global-messages');
    msgContainer.innerHTML = '';
    const res = await fetch('/api/global-history');
    const history = await res.json();
    history.forEach(m => renderMessage(msgContainer, m));
}

socket.on('new-global-msg', (msg) => {
    const msgContainer = document.getElementById('global-messages');
    renderMessage(msgContainer, msg);
});

// ✉️ الإرسال واللايك والوسائط
async function sendGlobalMsg() {
    const input = document.getElementById('g-msg-input');
    if (input.value.trim()) {
        const payload = { sender: currentUser.username, avatar: currentUser.avatar, text: input.value, replyTo: activeReplyText };
        socket.emit('send-global-msg', payload);
        input.value = '';
        cancelReply('g');
    }
}

async function sendPrivateMsg() {
    const input = document.getElementById('p-msg-input');
    if (input.value.trim()) {
        const msgData = { sender: currentUser.username, avatar: currentUser.avatar, text: input.value, replyTo: activeReplyText };
        socket.emit('send-private-msg', { from: currentUser.username, to: currentChatPartner, msgData });
        input.value = '';
        cancelReply('p');
    }
}

function sendGlobalLike() {
    socket.emit('send-global-msg', { sender: currentUser.username, avatar: currentUser.avatar, text: '👍' });
}

function sendPrivateLike() {
    const msgData = { sender: currentUser.username, avatar: currentUser.avatar, text: '👍' };
    socket.emit('send-private-msg', { from: currentUser.username, to: currentChatPartner, msgData });
}

async function sendGlobalMedia(input) {
    if (input.files && input.files[0]) {
        const formData = new FormData();
        formData.append('file', input.files[0]);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        socket.emit('send-global-msg', { sender: currentUser.username, avatar: currentUser.avatar, media: data.url });
    }
}

async function sendPrivateMedia(input) {
    if (input.files && input.files[0]) {
        const formData = new FormData();
        formData.append('file', input.files[0]);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        const msgData = { sender: currentUser.username, avatar: currentUser.avatar, media: data.url };
        socket.emit('send-private-msg', { from: currentUser.username, to: currentChatPartner, msgData });
    }
}

// 🎙️ تسجيل وتوجيه الصوت الفوكال
let mediaRecorder, audioChunks = [], isRecording = false, recTimerInterval, secondsRecorded = 0;

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
                
                const mins = String(Math.floor(secondsRecorded / 60)).padStart(2, '0');
                const secs = String(secondsRecorded % 60).padStart(2, '0');
                const durationStr = `${mins}:${secs}`;

                const payload = { sender: currentUser.username, avatar: currentUser.avatar, media: data.url, isAudio: true, duration: durationStr };
                if (type === 'global') socket.emit('send-global-msg', payload);
                else socket.emit('send-private-msg', { from: currentUser.username, to: currentChatPartner, msgData: payload });
            };
            
            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
        } catch (err) {
            alert('يرجى سماح استخدام المايكروفون');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btn.classList.remove('recording');
    }
}

// 🎨 عرض الرسائل بالكامل
function renderMessage(container, msg) {
    const wrapper = document.createElement('div');
    const isMe = msg.sender === currentUser.username;
    wrapper.className = `msg-wrapper ${isMe ? 'me' : 'them'}`;

    const avatarUrl = msg.avatar || DEFAULT_AVATAR;

    let contentHtml = ``;
    if (msg.replyTo) {
        contentHtml += `<div class="quoted-reply">↩️ ${msg.replyTo}</div>`;
    }
    if (msg.text) contentHtml += `<div>${msg.text}</div>`;
    if (msg.media) {
        if (msg.media.match(/\.(jpeg|jpg|gif|png)$/i)) {
            contentHtml += `<img src="${msg.media}" style="max-width:200px; border-radius:12px; margin-top:5px;">`;
        } else if (msg.media.match(/\.(mp3|ogg|wav)$/i) || msg.isAudio) {
            contentHtml += `
                <div class="fb-voice-player">
                    <button class="play-pause-btn" onclick="toggleFbAudio(this, '${msg.media}')">▶</button>
                    <div class="voice-wave"></div>
                    <span class="voice-duration">${msg.duration || '0:05'}</span>
                    <audio src="${msg.media}" onended="resetFbAudioBtn(this)"></audio>
                </div>
            `;
        }
    }

    wrapper.innerHTML = `
        <img class="avatar" src="${avatarUrl}" onclick="viewUserProfile('${msg.sender}')">
        <div class="msg-body">
            <span class="msg-author" onclick="viewUserProfile('${msg.sender}')">${msg.sender}</span>
            <div class="msg-bubble" onclick="openReactions(this)">
                ${contentHtml}
            </div>
        </div>
    `;

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

function toggleFbAudio(btn, src) {
    const audio = btn.parentElement.querySelector('audio');
    if (audio.paused) {
        audio.play();
        btn.innerText = '⏸';
    } else {
        audio.pause();
        btn.innerText = '▶';
    }
}

function resetFbAudioBtn(audio) {
    audio.parentElement.querySelector('.play-pause-btn').innerText = '▶';
}

// 👤 استعراض البروفايل عند النقر
async function viewUserProfile(username) {
    const res = await fetch(`/api/user-info?username=${username}`);
    const u = await res.json();
    
    document.getElementById('view-user-avatar').src = u.avatar || DEFAULT_AVATAR;
    document.getElementById('view-user-name').innerText = u.username;
    document.getElementById('view-user-details').innerText = `العمر: ${u.age || 20} | الحالة: ${u.status || 'أعزب'}`;
    
    const chatBtn = document.getElementById('view-user-chat-btn');
    chatBtn.onclick = () => {
        closeProfileModal();
        openPrivateChat(u.username);
    };

    document.getElementById('user-profile-modal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('user-profile-modal').classList.add('hidden');
}

// 😃 التفاعلات والرد المباشر
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

function initiateReply() {
    closeModal();
    if (!selectedMsgElement) return;
    activeReplyText = selectedMsgElement.innerText.replace(/[\r\n]+/g, " ").slice(0, 30);
    
    document.getElementById('p-reply-box').classList.remove('hidden');
    document.getElementById('p-reply-text').innerText = `الرد على: ${activeReplyText}`;
    document.getElementById('g-reply-box').classList.remove('hidden');
    document.getElementById('g-reply-text').innerText = `الرد على: ${activeReplyText}`;
}

function cancelReply(type) {
    activeReplyText = null;
    document.getElementById(`${type}-reply-box`).classList.add('hidden');
}
