// Authentication Module - AWS Cognito Integration
import { AWS_CONFIG } from './config.js';

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
      return {
        username,
        idToken,
        accessToken
      };
    }

    return null;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.idToken;
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
