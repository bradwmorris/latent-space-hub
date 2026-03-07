// API Key Storage Service
// Handles secure storage and retrieval of user-provided API keys

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
}

export interface ApiKeyStatus {
  openai: 'connected' | 'failed' | 'testing' | 'not-set';
  anthropic: 'connected' | 'failed' | 'testing' | 'not-set';
}

const STORAGE_KEY = 'ls-hub-api-keys';

export class ApiKeyService {
  private static instance: ApiKeyService;
  private keys: ApiKeys = {};
  private status: ApiKeyStatus = {
    openai: 'not-set',
    anthropic: 'not-set'
  };

  static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService();
    }
    return ApiKeyService.instance;
  }

  constructor() {
    this.loadKeys();
  }

  // Load keys from localStorage
  private loadKeys(): void {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          this.keys = JSON.parse(stored);
        }
      }
    } catch (error) {
      console.warn('Failed to load API keys from storage:', error);
      this.keys = {};
    }
  }

  // Save keys to localStorage
  private saveKeys(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keys));
      }
    } catch (error) {
      console.error('Failed to save API keys to storage:', error);
    }
  }

  // Get OpenAI API key (user key or fallback to env)
  getOpenAiKey(): string | undefined {
    // Priority: User key > Environment key
    return this.keys.openai || process.env.OPENAI_API_KEY;
  }

  // Get Anthropic API key (user key or fallback to env)
  getAnthropicKey(): string | undefined {
    // Priority: User key > Environment key  
    return this.keys.anthropic || process.env.ANTHROPIC_API_KEY;
  }

  // Set OpenAI API key
  setOpenAiKey(key: string): void {
    if (this.validateOpenAiKey(key)) {
      this.keys.openai = key;
      this.saveKeys();
    } else {
      throw new Error('Invalid OpenAI API key format');
    }
  }

  // Set Anthropic API key
  setAnthropicKey(key: string): void {
    if (this.validateAnthropicKey(key)) {
      this.keys.anthropic = key;
      this.saveKeys();
    } else {
      throw new Error('Invalid Anthropic API key format');
    }
  }

  // Clear specific key
  clearOpenAiKey(): void {
    delete this.keys.openai;
    this.saveKeys();
    this.status.openai = 'not-set';
  }

  clearAnthropicKey(): void {
    delete this.keys.anthropic;
    this.saveKeys();
    this.status.anthropic = 'not-set';
  }

  // Clear all keys
  clearAllKeys(): void {
    this.keys = {};
    this.saveKeys();
    this.status = {
      openai: 'not-set',
      anthropic: 'not-set'
    };
  }

  // Get masked key for display (show only last 4 characters)
  getMaskedKey(provider: 'openai' | 'anthropic'): string {
    const key = provider === 'openai' ? this.keys.openai : this.keys.anthropic;
    if (!key) return '';
    return '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••' + key.slice(-4);
  }

  // Check if user has provided custom keys
  hasUserKeys(): boolean {
    return !!(this.keys.openai || this.keys.anthropic);
  }

  // Get current keys (for internal use)
  getStoredKeys(): ApiKeys {
    return { ...this.keys };
  }

  // Validate OpenAI key format
  private validateOpenAiKey(key: string): boolean {
    return typeof key === 'string' && 
           key.length > 20 && 
           (key.startsWith('sk-') || key.startsWith('sk-proj-'));
  }

  // Validate Anthropic key format  
  private validateAnthropicKey(key: string): boolean {
    return typeof key === 'string' && 
           key.length > 20 && 
           key.startsWith('sk-ant-');
  }

  // Test connection to OpenAI
  async testOpenAiConnection(key?: string): Promise<boolean> {
    const testKey = key || this.getOpenAiKey();
    if (!testKey) return false;

    this.status.openai = 'testing';
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${testKey}`,
          'Content-Type': 'application/json'
        }
      });

      const isConnected = response.ok;
      this.status.openai = isConnected ? 'connected' : 'failed';
      return isConnected;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      this.status.openai = 'failed';
      return false;
    }
  }

  // Test connection to Anthropic
  async testAnthropicConnection(key?: string): Promise<boolean> {
    const testKey = key || this.getAnthropicKey();
    if (!testKey) return false;

    this.status.anthropic = 'testing';

    try {
      // Simple test call to Anthropic API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': testKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      const isConnected = response.ok;
      this.status.anthropic = isConnected ? 'connected' : 'failed';
      return isConnected;
    } catch (error) {
      console.error('Anthropic connection test failed:', error);
      this.status.anthropic = 'failed';
      return false;
    }
  }

  // Get connection status
  getStatus(): ApiKeyStatus {
    return { ...this.status };
  }

  // Update status
  updateStatus(provider: 'openai' | 'anthropic', status: ApiKeyStatus['openai']): void {
    this.status[provider] = status;
  }
}

// Export singleton instance
export const apiKeyService = ApiKeyService.getInstance();
