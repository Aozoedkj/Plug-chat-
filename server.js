let socket = io();
let currentUser = null;
let currentChatPartner = null;

// ==========================================
// 1️⃣ الاستماع للتحديثات الحية (Socket Events)
// ==========================================

socket.on('reload-users-list', () => {
    if (currentUser) loadUsersList();
});

socket.on('update-user-status', () => {
    if (currentUser) loadUsersList();
});

function listenForFriendRequests() {
    if (!currentUser) return;
    socket.on(`new-friend-request-${currentUser.username}`, () => {
        loadFriendsData();
        alert('وصلك طلب صداقة جديد!');
    });
}

// ==========================================
// 2️⃣ تسجيل الدخول والتسجيل (مُصلحة بالكامل)
// ==========================================

async function handleAuth(action) {
    // محاولة جلب الحقول بأكثر من اسم شائع لتفادي أخطاء الـ HTML
    const usernameEl = document.getElementById('auth-username') || document.getElementById('username');
    const passwordEl = document.getElementById('auth-password') || document.getElementById('password');
    const ageEl = document.getElementById('auth-age') || document.getElementById('age');
    const statusEl = document.getElementById('auth-status') || document.getElementById('status');

    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value.trim() : '';
    const age = ageEl ? ageEl.value : 20;
    const status = statusEl ? statusEl.value : 'أعزب';

    if (!username || !password) {
        alert('يرجى كتابة اسم المستخدم وكلمة السر');
        return;
    }

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, action, age, status })
        });

        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            
            // إخفاء شاشة التسجيل وإظهار الشاشة الرئيسية
            const authScreen = document.getElementById('auth-screen') || document.getElementById('login-screen');
            const appScreen = document.getElementById('app-screen') || document.getElementById('main-screen');

            if (authScreen) authScreen.classList.add('hidden');
            if (appScreen) appScreen.classList.remove('hidden');
            
            socket.emit('user-online', currentUser.username);
            listenForFriendRequests();
            
            loadGlobalChat();
            loadUsersList();
            loadFriendsData();
        } else {
            alert(data.msg);
        }
    } catch (err) {
        console.error('خطأ في الاتصال:', err);
        alert('حدث خطأ أثناء الاتصال بالسيرفر، تأكد من تشغيل السيرفر بشكل صحيح.');
    }
}

// ==========================================
// 3️⃣ التنقل بين التبويبات (Tabs)
// ==========================================

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.classList.remove('hidden');
    
    if (tabName === 'users') loadUsersList();
    if (tabName === 'chats') loadMyChats();
    if (tabName === 'friends') loadFriendsData();
}

// ==========================================
// 4️⃣ عرض قائمة جميع المستخدمين
// ==========================================

async function loadUsersList() {
    try {
        const res = await fetch('/api/users');
        const users = await res.json();
        
        const container = document.getElementById('users-list-container') || document.getElementById('users-list');
        if (!container) return;
        container.innerHTML = '';

        const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

        users.forEach(u => {
            if (currentUser && u.username === currentUser.username) return;

            const card = document.createElement('div');
            card.className = 'user-card';
            card.onclick = () => viewUserProfile(u.username);

            const statusDotClass = u.isOnline ? 'status-online' : 'status-offline';
            const statusText = u.isOnline ? 'متصل الآن' : 'غير متصل';

            card.innerHTML = `
                <div class="avatar-wrapper">
                    <img src="${u.avatar || fallbackAvatar}" class="user-avatar" onerror="this.src='${fallbackAvatar}'">
                    <span class="status-indicator ${statusDotClass}"></span>
                </div>
                <div class="user-info">
                    <h4>${u.username}</h4>
                    <p class="status-subtext">${statusText}</p>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error('خطأ في جلب المستخدمين:', e);
    }
}

// ==========================================
// 5️⃣ عرض بروفايل المستخدم وإرسال طلب الصداقة
// ==========================================

async function viewUserProfile(username) {
    const res = await fetch(`/api/user-info?username=${username}`);
    const u = await res.json();
    
    const fallbackAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";

    const avatarEl = document.getElementById('view-user-avatar');
    const nameEl = document.getElementById('view-user-name');
    const detailsEl = document.getElementById('view-user-details');

    if (avatarEl) avatarEl.src = u.avatar || fallbackAvatar;
    if (nameEl) nameEl.innerText = u.username;
    if (detailsEl) detailsEl.innerText = `العمر: ${u.age || 20} | الحالة: ${u.status || 'أعزب'}`;
    
    const chatBtn = document.getElementById('view-user-chat-btn');
    if (chatBtn) {
        chatBtn.onclick = () => {
            closeProfileModal();
            switchTab('chats');
            openPrivateChat(u.username);
        };
    }

    const friendBtn = document.getElementById('view-user-add-friend-btn');
    if (friendBtn) {
        friendBtn.onclick = () => sendFriendRequest(u.username);
    }

    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeProfileModal() {
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.classList.add('hidden');
}

async function sendFriendRequest(targetUser) {
    const res = await fetch('/api/friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: currentUser.username, to: targetUser })
    });
    const data = await res.json();
    alert(data.msg);
}

// ==========================================
// 6️⃣ إدراة الأصدقاء والطلبات المعلقة
// ==========================================

async function loadFriendsData() {
    if (!currentUser) return;
    const res = await fetch(`/api/friends-data?username=${currentUser.username}`);
    const data = await res.json();

    const reqContainer = document.getElementById('friend-requests-container');
    if (reqContainer) {
        reqContainer.innerHTML = '';
        if (data.requests.length === 0) {
            reqContainer.innerHTML = '<p class="empty-msg">لا توجد طلبات صداقة جديدة</p>';
        } else {
            data.requests.forEach(reqUser => {
                const item = document.createElement('div');
                item.className = 'request-item';
                item.innerHTML = `
                    <span><b>${reqUser}</b> أرسل لك طلب صداقة</span>
                    <div class="actions">
                        <button onclick="respondRequest('${reqUser}', 'accept')" class="btn-accept">قبول</button>
                        <button onclick="respondRequest('${reqUser}', 'reject')" class="btn-reject">رفض</button>
                    </div>
                `;
                reqContainer.appendChild(item);
            });
        }
    }

    const friendsContainer = document.getElementById('my-friends-container');
    if (friendsContainer) {
        friendsContainer.innerHTML = '';
        if (data.friends.length === 0) {
            friendsContainer.innerHTML = '<p class="empty-msg">ليس لديك أصدقاء بعد</p>';
        } else {
            data.friends.forEach(fUser => {
                const item = document.createElement('div');
                item.className = 'friend-item';
                item.innerHTML = `
                    <span>${fUser}</span>
                    <button onclick="switchTab('chats'); openPrivateChat('${fUser}')" class="btn-chat">مراسلة</button>
                `;
                friendsContainer.appendChild(item);
            });
        }
    }
}

async function respondRequest(targetUser, action) {
    await fetch('/api/respond-friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, targetUser, action })
    });
    loadFriendsData();
}

// ==========================================
// 7️⃣ الشات العام والمحادثات الخاصة
// ==========================================

async function loadGlobalChat() {
    const container = document.getElementById('global-messages');
    if (!container) return;
    container.innerHTML = '';
    const res = await fetch('/api/global-history');
    const msgs = await res.json();
    msgs.forEach(m => renderMessage(container, m));

    socket.off('new-global-msg');
    socket.on('new-global-msg', (msg) => {
        renderMessage(container, msg);
    });
}

function sendGlobalMessage() {
    const input = document.getElementById('global-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    socket.emit('send-global-msg', {
        sender: currentUser.username,
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    input.value = '';
}

async function loadMyChats() {
    const res = await fetch(`/api/my-chats?username=${currentUser.username}`);
    const chats = await res.json();
    const container = document.getElementById('chats-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    chats.forEach(c => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.onclick = () => openPrivateChat(c.username);
        div.innerHTML = `
            <h4>${c.username}</h4>
            <p>${c.lastMsg}</p>
        `;
        container.appendChild(div);
    });
}

async function openPrivateChat(targetUsername) {
    currentChatPartner = targetUsername;
    
    document.getElementById('chats-list-view')?.classList.add('hidden');
    document.getElementById('private-chat-window')?.classList.remove('hidden');
    
    const titleEl = document.getElementById('chat-with-name');
    if (titleEl) titleEl.innerText = targetUsername;
    
    const msgContainer = document.getElementById('private-messages');
    if (!msgContainer) return;
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

function sendPrivateMessage() {
    const input = document.getElementById('private-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentChatPartner) return;

    const msgData = {
        sender: currentUser.username,
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.emit('send-private-msg', {
        from: currentUser.username,
        to: currentChatPartner,
        msgData
    });

    input.value = '';
}

function renderMessage(container, msg) {
    if (!container) return;
    const isMe = currentUser && msg.sender === currentUser.username;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMe ? 'my-message' : 'other-message'}`;
    msgDiv.innerHTML = `
        <span class="sender-name">${msg.sender}</span>
        <p class="msg-text">${msg.text}</p>
        <span class="msg-time">${msg.time}</span>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}
