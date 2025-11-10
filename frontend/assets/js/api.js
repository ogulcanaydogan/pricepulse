// API Client Module - API Gateway Integration
import { AWS_CONFIG } from './config.js';
import authService from './auth.js';

class ApiClient {
  constructor() {
    this.baseUrl = AWS_CONFIG.apiEndpoint;
  }

  // Helper method to make authenticated requests
  async request(endpoint, options = {}) {
    const idToken = authService.getIdToken();
    
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    if (idToken) {
      defaultHeaders['Authorization'] = `Bearer ${idToken}`;
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      
      if (response.status === 401) {
        // Token expired, sign out user
        await authService.signOut();
        window.location.href = '/login.html';
        throw new Error('Session expired');
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // Get all items for current user
  async getItems() {
    return this.request('/items', {
      method: 'GET'
    });
  }

  // Get single item
  async getItem(itemId) {
    return this.request(`/items/${itemId}`, {
      method: 'GET'
    });
  }

  // Create new item
  async createItem(itemData) {
    return this.request('/items', {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
  }

  // Update existing item
  async updateItem(itemId, itemData) {
    return this.request(`/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(itemData)
    });
  }

  // Delete item
  async deleteItem(itemId) {
    return this.request(`/items/${itemId}`, {
      method: 'DELETE'
    });
  }

  // Test extract price from URL
  async testExtract(url) {
    return this.request('/test-extract', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  }

  // Trigger manual price check for an item
  async checkPrice(itemId) {
    return this.request(`/items/${itemId}/check`, {
      method: 'POST'
    });
  }

  // Get notifications for current user
  async getNotifications() {
    return this.request('/notifications', {
      method: 'GET'
    });
  }

  // Mark notification as read
  async markNotificationRead(notificationId) {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'PUT'
    });
  }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;
