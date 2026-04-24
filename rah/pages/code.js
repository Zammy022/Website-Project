const signupBlockKey = 'signupBlockedUnder13';

function isSignupBlocked() {
    return sessionStorage.getItem(signupBlockKey) === 'true';
}

function setSignupBlocked(blocked) {
    sessionStorage.setItem(signupBlockKey, blocked ? 'true' : 'false');
}

function updateSignupAccessUi() {
    const blocked = isSignupBlocked();
    const signupLinks = document.querySelectorAll('.nav-signup-btn, .signup-access-link');

    signupLinks.forEach((link) => {
        if (!link.dataset.originalHref) {
            link.dataset.originalHref = link.getAttribute('href') || 'signup.html';
        }

        if (blocked) {
            link.classList.add('disabled-link');
            link.setAttribute('aria-disabled', 'true');
            link.removeAttribute('href');
        } else {
            link.classList.remove('disabled-link');
            link.removeAttribute('aria-disabled');
            link.setAttribute('href', link.dataset.originalHref);
        }
    });

    const signupForm = document.getElementById('signup-form');
    const signupMessage = document.getElementById('signup-age-message');
    if (signupForm) {
        Array.from(signupForm.elements).forEach((field) => {
            field.disabled = blocked;
        });
        if (signupMessage) {
            signupMessage.hidden = !blocked;
        }
    }

    const signinMessage = document.getElementById('signin-age-message');
    if (signinMessage) {
        signinMessage.hidden = !blocked;
    }
}

// --- Nav profile: show profile img or Sign Up button ---
async function initNav() {
    const signupBtn = document.querySelector('.nav-signup-btn');
    const navProfile = document.getElementById('nav-profile');
    if (!navProfile) return;

    try {
        const res = await fetch('/me');
        if (res.ok) {
            const user = await res.json();
            if (signupBtn) signupBtn.style.display = 'none';
            navProfile.style.display = 'flex';
            const img = document.getElementById('nav-profile-img');
            if (img) img.src = user.profileImg || '/default-avatar.svg';
        } else {
            navProfile.style.display = 'none';
        }
    } catch {
        if (navProfile) navProfile.style.display = 'none';
    }
}
initNav();
updateSignupAccessUi();

// --- Sign up ---
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    const signupAgeInput = document.getElementById('signup-age');
    const signupAgeValue = document.getElementById('signup-age-value');

    if (signupAgeInput && signupAgeValue) {
        signupAgeValue.textContent = signupAgeInput.value;
        signupAgeInput.addEventListener('input', () => {
            signupAgeValue.textContent = signupAgeInput.value;
        });
    }

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (isSignupBlocked()) {
            alert('Sign up is disabled in this browser session for users under 13.');
            return;
        }

        const age = Number(document.getElementById('signup-age')?.value);
        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!Number.isFinite(age) || age < 1) {
            alert('Please select a valid age.');
            return;
        }

        setSignupBlocked(age < 13);
        updateSignupAccessUi();

        if (age < 13) {
            alert('Users under 13 cannot sign up in this browser session.');
            return;
        }

        try {
            const res = await fetch('/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (res.ok) {
                alert('Account created! You can now sign in.');
                window.location.href = 'signin.html';
            } else {
                alert(data.error || 'Sign up failed.');
            }
        } catch {
            alert('Could not connect to the server.');
        }
    });
}

// --- Sign in ---
const signinForm = document.getElementById('signin-form');
if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signin-email').value.trim();
        const password = document.getElementById('signin-password').value;

        try {
            const res = await fetch('/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = 'index.html';
            } else {
                alert(data.error || 'Sign in failed.');
            }
        } catch {
            alert('Could not connect to the server.');
        }
    });
}

// --- Chat room ---
const chatForm = document.getElementById('chat-form');
if (chatForm) {
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    let cursorX = null;
    let cursorY = null;
    let currentUserEmail = '';
    let currentUserProfileImg = '/default-avatar.svg';
    let lastMessagesSignature = '';

    const escapeHtml = (value) => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const formatSecretMessage = (rawMessage) => {
        const text = String(rawMessage || '');
        let output = '';
        let cursor = 0;

        while (cursor < text.length) {
            const start = text.indexOf('<', cursor);
            if (start === -1) {
                output += escapeHtml(text.slice(cursor));
                break;
            }

            const end = text.indexOf('>', start + 1);
            if (end === -1) {
                output += escapeHtml(text.slice(cursor));
                break;
            }

            output += escapeHtml(text.slice(cursor, start));
            const secretChunk = text.slice(start + 1, end);
            output += secretChunk
                ? `<span class="secret-stack"><span class="secret-text secret-text-back">${escapeHtml(secretChunk)}</span><span class="secret-text secret-text-front">${escapeHtml(secretChunk)}</span></span>`
                : '&lt;&gt;';
            cursor = end + 1;
        }

        return output;
    };

    const applySecretVisibility = () => {
        chatMessages.querySelectorAll('.secret-stack').forEach((el) => {
            if (cursorX === null) {
                el.style.setProperty('--lx', '-999px');
                el.style.setProperty('--ly', '-999px');
            } else {
                const rect = el.getBoundingClientRect();
                el.style.setProperty('--lx', (cursorX - rect.left) + 'px');
                el.style.setProperty('--ly', (cursorY - rect.top) + 'px');
            }
        });
    };

    const isNearBottom = (element, threshold = 24) => {
        const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
        return distanceFromBottom <= threshold;
    };

    const resolveProfileImg = (msg) => {
        if (msg.profileImg) {
            return msg.profileImg;
        }
        if (currentUserEmail && msg.email === currentUserEmail) {
            return currentUserProfileImg;
        }
        return '/default-avatar.svg';
    };

    const getMessagesSignature = (messages) => messages
        .map((msg) => [msg.email || '', msg.username || '', msg.message || '', msg.createdAt || '', resolveProfileImg(msg)].join('|'))
        .join('\n');

    const renderMessages = (messages, forceScrollToBottom = false) => {
        const shouldStickToBottom = forceScrollToBottom || isNearBottom(chatMessages);
        const previousDistanceFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop;

        chatMessages.innerHTML = '';
        messages.forEach((msg) => {
            const row = document.createElement('div');
            row.className = 'chat-msg';
            const stamp = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const profileImg = resolveProfileImg(msg);
            row.innerHTML = `<div class="chat-msg-head"><img class="chat-msg-avatar" src="${escapeHtml(profileImg)}" alt="${escapeHtml(msg.username)} profile" loading="eager" onerror="this.onerror=null;this.src='/default-avatar.svg';"><strong>${escapeHtml(msg.username)}</strong><span class="chat-time">${escapeHtml(stamp)}</span></div><div class="chat-msg-body">${formatSecretMessage(msg.message)}</div>`;
            chatMessages.appendChild(row);
        });

        if (shouldStickToBottom) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            chatMessages.scrollTop = Math.max(chatMessages.scrollHeight - previousDistanceFromBottom, 0);
        }

        applySecretVisibility();
    };

    const loadMessages = async () => {
        try {
            if (!currentUserEmail) {
                const meRes = await fetch('/me');
                if (meRes.ok) {
                    const me = await meRes.json();
                    currentUserEmail = String(me.email || '');
                    currentUserProfileImg = me.profileImg || '/default-avatar.svg';
                }
            }

            const res = await fetch('/chat/messages');
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 401) {
                    alert(data.error || 'Please sign in to use chat.');
                    window.location.href = 'signin.html';
                }
                return;
            }
            const data = await res.json();
            const messages = data.messages || [];
            const nextSignature = getMessagesSignature(messages);
            if (nextSignature === lastMessagesSignature) {
                applySecretVisibility();
                return;
            }
            lastMessagesSignature = nextSignature;
            renderMessages(messages);
        } catch {
            // Keep page usable even if polling fails temporarily.
        }
    };

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;

        try {
            const res = await fetch('/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || 'Could not send message.');
                if (res.status === 401) {
                    window.location.href = 'signin.html';
                }
                return;
            }
            chatInput.value = '';
            await loadMessages();
            chatMessages.scrollTop = chatMessages.scrollHeight;
            applySecretVisibility();
        } catch {
            alert('Could not connect to the server.');
        }
    });

    window.addEventListener('mousemove', (event) => {
        cursorX = event.clientX;
        cursorY = event.clientY;
        applySecretVisibility();
    });

    window.addEventListener('mouseleave', () => {
        cursorX = null;
        cursorY = null;
        applySecretVisibility();
    });

    chatMessages.addEventListener('scroll', applySecretVisibility);

    loadMessages();
    setInterval(loadMessages, 3000);
}

// --- Profile settings ---
const profileImgForm = document.getElementById('profile-img-form');
if (profileImgForm) {
    // Load current profile info
    fetch('/me').then(r => r.ok ? r.json() : null).then(user => {
        if (!user) { window.location.href = 'signin.html'; return; }
        const preview = document.getElementById('profile-preview');
        if (preview) preview.src = user.profileImg || '/default-avatar.svg';
        const nameEl = document.getElementById('profile-username');
        if (nameEl) nameEl.textContent = user.username;
    });

    profileImgForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('profile-img-input');
        if (!fileInput.files.length) return;
        const formData = new FormData();
        formData.append('profileImg', fileInput.files[0]);

        try {
            const res = await fetch('/profile/image', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok) {
                const preview = document.getElementById('profile-preview');
                if (preview) preview.src = data.profileImg;
                alert('Profile picture updated!');
            } else {
                alert(data.error || 'Upload failed.');
            }
        } catch {
            alert('Could not connect to the server.');
        }
    });
}

// --- Sign out ---
const signoutBtn = document.getElementById('signout-btn');
if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
        await fetch('/signout', { method: 'POST' });
        window.location.href = 'index.html';
    });
}
const invertCursor = document.getElementById('invert-cursor');
if (invertCursor) {
    window.addEventListener('mousemove', (event) => {
        invertCursor.style.left = event.clientX + 'px';
        invertCursor.style.top = event.clientY + 'px';
        invertCursor.style.opacity = '1';
    });

    window.addEventListener('mouseleave', () => {
        invertCursor.style.opacity = '0';
    });
}