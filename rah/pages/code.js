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

window.addEventListener('mousemove', (event) => {
    invertCursor.style.left = event.clientX + 'px';
    invertCursor.style.top = event.clientY + 'px';
    invertCursor.style.opacity = '1';
});

window.addEventListener('mouseleave', () => {
    invertCursor.style.opacity = '0';
});