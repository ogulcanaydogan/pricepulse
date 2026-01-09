// Authentication Module - AWS Cognito Integration
import { AWS_CONFIG } from './config.js';

// Helper to decode JWT payload (without verification - just for reading claims)
function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// Check if JWT token is expired (with 60 second buffer)
function isTokenExpired(token) {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  // exp is in seconds, Date.now() is in milliseconds
  const expiryTime = payload.exp * 1000;
  const bufferMs = 60 * 1000; // 60 second buffer
  return Date.now() >= expiryTime - bufferMs;
}

class AuthService {
  constructor() {
    this.currentUser = null;
    this.idToken = null;
    this.accessToken = null;
  }

  // Initialize Cognito User Pool
  async init() {
    try {
      // Check if user is already logged in
      const session = await this.getCurrentSession();
      if (session) {
        this.currentUser = session.username;
        this.idToken = session.idToken;
        this.accessToken = session.accessToken;
      }
    } catch (error) {
      console.log('No active session');
    }
  }

  // Sign up new user
  async signUp(username, password, email) {
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password, email })
      });

      if (!response.ok) {
        throw new Error('Sign up failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  // Sign in user
  async signIn(username, password) {
    try {
      const response = await fetch(`${AWS_CONFIG.apiEndpoint}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error('Sign in failed');
      }

      const data = await response.json();
      this.currentUser = username;
      this.idToken = data.idToken;
      this.accessToken = data.accessToken;

      // Store tokens in localStorage
      localStorage.setItem('pricepulse_idToken', data.idToken);
      localStorage.setItem('pricepulse_accessToken', data.accessToken);
      localStorage.setItem('pricepulse_username', username);

      return data;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  // Sign out user
  async signOut() {
    this.currentUser = null;
    this.idToken = null;
    this.accessToken = null;

    localStorage.removeItem('pricepulse_idToken');
    localStorage.removeItem('pricepulse_accessToken');
    localStorage.removeItem('pricepulse_username');
  }

  // Get current session
  async getCurrentSession() {
    const idToken = localStorage.getItem('pricepulse_idToken');
    const accessToken = localStorage.getItem('pricepulse_accessToken');
    const username = localStorage.getItem('pricepulse_username');

    if (idToken && accessToken && username) {
      // Check if token is expired
      if (isTokenExpired(idToken)) {
        console.log('Session expired, clearing tokens');
        await this.signOut();
        return null;
      }
      return {
        username,
        idToken,
        accessToken
      };
    }

    return null;
  }

  // Check if user is authenticated (with expiry check)
  isAuthenticated() {
    const token = this.idToken || localStorage.getItem('pricepulse_idToken');
    if (!token) return false;
    return !isTokenExpired(token);
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Get ID token for API calls
  getIdToken() {
    return this.idToken || localStorage.getItem('pricepulse_idToken');
  }
}

// Export singleton instance
const authService = new AuthService();
export default authService;
