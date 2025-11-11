// AWS Configuration
const AWS_CONFIG = {
  region: 'us-east-1',
  apiEndpoint: 'https://rsqbj2qxlj.execute-api.us-east-1.amazonaws.com',
  userPoolId: 'us-east-1_H7CkhbKyO',
  userPoolClientId: '1rp3q7m9nuvebskg2d6f997rei'
};

// Simple AuthService (inline, no imports)
const authService = {
  currentUser: null,
  idToken: null,
  accessToken: null,

  async init() {
    const idToken = localStorage.getItem('pricepulse_idToken');
    const accessToken = localStorage.getItem('pricepulse_accessToken');
    const username = localStorage.getItem('pricepulse_username');

    if (idToken && accessToken && username) {
      this.currentUser = username;
      this.idToken = idToken;
      this.accessToken = accessToken;
    }
  },

  async signIn(username, password) {
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) throw new Error('Sign in failed');

      const data = await response.json();
      this.currentUser = username;
      this.idToken = data.idToken;
      this.accessToken = data.accessToken;

      localStorage.setItem('pricepulse_idToken', data.idToken);
      localStorage.setItem('pricepulse_accessToken', data.accessToken);
      localStorage.setItem('pricepulse_username', username);

      return data;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  },

  async signUp(username, password, email) {
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email })
      });

      if (!response.ok) throw new Error('Sign up failed');
      return await response.json();
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  },

  getIdToken() {
    return this.idToken || localStorage.getItem('pricepulse_idToken');
  },

  isAuthenticated() {
    return !!this.getIdToken();
  },

  async signOut() {
    this.currentUser = null;
    this.idToken = null;
    this.accessToken = null;
    localStorage.removeItem('pricepulse_idToken');
    localStorage.removeItem('pricepulse_accessToken');
    localStorage.removeItem('pricepulse_username');
  }
};

const titles = {
  signin: {
    title: 'Welcome Back',
    subtitle: 'Sign in to your PricePulse account'
  },
  signup: {
    title: 'Create your account',
    subtitle: 'Track prices with your family in just a few clicks'
  }
};

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const toggleButtons = document.querySelectorAll('[data-switch-to]');
const demoModeLink = document.getElementById('demo-mode-link');

let activeView = 'signin';

const setViewCopy = (view) => {
  if (!titles[view]) return;
  if (authTitle) authTitle.textContent = titles[view].title;
  if (authSubtitle) authSubtitle.textContent = titles[view].subtitle;
};

const clearMessages = () => {
  if (errorMessage) errorMessage.classList.remove('visible');
  if (successMessage) successMessage.classList.remove('visible');
};

const showError = (message) => {
  if (!errorMessage) return;
  if (message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('visible');
  } else {
    errorMessage.classList.remove('visible');
  }
};

const showSuccess = (message) => {
  if (!successMessage) return;
  if (message) {
    successMessage.textContent = message;
    successMessage.classList.add('visible');
  } else {
    successMessage.classList.remove('visible');
  }
};

const toggleView = (view) => {
  if (view === activeView) return;
  activeView = view;
  loginForm?.classList.toggle('hidden', view !== 'signin');
  signupForm?.classList.toggle('hidden', view !== 'signup');
  toggleButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.switchTo === view);
  });
  clearMessages();
  setViewCopy(view);
};

toggleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    toggleView(button.dataset.switchTo || 'signin');
  });
});

const setLoadingState = (button, isLoading, loadingText) => {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.submitText || button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
};

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessages();

  const username = loginForm.username.value.trim();
  const password = loginForm.password.value;
  const submitButton = loginForm.querySelector('button[type="submit"]');

  if (!username || !password) {
    showError('Please enter both username/email and password.');
    return;
  }

  setLoadingState(submitButton, true, 'Signing in…');

  try {
    await authService.signIn(username, password);
    window.location.href = 'index.html';
  } catch (error) {
    showError(error?.message || 'Unable to sign in. Please try again.');
  } finally {
    setLoadingState(submitButton, false);
  }
});

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessages();

  const username = signupForm['signup-username'].value.trim();
  const email = signupForm['signup-email'].value.trim();
  const password = signupForm['signup-password'].value;
  const confirmPassword = signupForm['signup-confirm'].value;
  const submitButton = signupForm.querySelector('button[type="submit"]');

  if (!username || !email || !password) {
    showError('All fields are required.');
    return;
  }

  if (password !== confirmPassword) {
    showError('Passwords do not match.');
    return;
  }

  setLoadingState(submitButton, true, 'Creating account…');

  try {
    await authService.signUp(username, password, email);
    showSuccess('Account created! Check your email to verify, then sign in.');
    signupForm.reset();
    toggleView('signin');
  } catch (error) {
    showError(error?.message || 'Unable to sign up. Please try again.');
  } finally {
    setLoadingState(submitButton, false);
  }
});

demoModeLink?.addEventListener('click', (event) => {
  event.preventDefault();
  window.location.href = 'index.html';
});

const bootstrap = async () => {
  try {
    await authService.init();
    if (authService.isAuthenticated()) {
      window.location.href = 'index.html';
    }
  } catch (error) {
    console.debug('No active session', error);
  }
};

bootstrap();
