// 100% Self-Hosted Local Adapter for Base44 Client
// Seamlessly forwards calls to local Express backend (/api)

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) 
  ? import.meta.env.VITE_API_URL 
  : '/api';

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('ottm_token') || localStorage.getItem('token') || localStorage.getItem('base44_token') || '';
}

function setToken(token) {
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('ottm_token', token);
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('ottm_token');
      localStorage.removeItem('token');
    }
  }
}

async function request(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errMessage = `Request failed with status ${response.status}`;
    try {
      const errData = await response.json();
      errMessage = errData.message || errData.error || errMessage;
    } catch {}
    const error = new Error(errMessage);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function createEntityHandler(entityName) {
  return {
    async list(sort = '-created_date', limit = 500, skip = 0) {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit) params.set('limit', limit);
      if (skip) params.set('skip', skip);
      return request(`/entities/${entityName}?${params.toString()}`);
    },

    async filter(query = {}, sort = '-created_date', limit = 500, skip = 0) {
      return request(`/entities/${entityName}/filter`, {
        method: 'POST',
        body: JSON.stringify({ query, sort, limit, skip })
      });
    },

    async get(id) {
      if (!id) return null;
      return request(`/entities/${entityName}/${id}`);
    },

    async create(data) {
      return request(`/entities/${entityName}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async update(id, data) {
      if (!id) throw new Error('ID is required for update');
      return request(`/entities/${entityName}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async updateMany(filter = {}, data = {}) {
      return request(`/entities/${entityName}/updateMany`, {
        method: 'POST',
        body: JSON.stringify({ filter, data })
      });
    },

    async delete(id) {
      if (!id) return false;
      const res = await request(`/entities/${entityName}/${id}`, {
        method: 'DELETE'
      });
      return res.success;
    }
  };
}

const entitiesProxy = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (!target[prop]) {
      target[prop] = createEntityHandler(prop);
    }
    return target[prop];
  }
});

const auth = {
  async me() {
    return request('/auth/me');
  },

  async loginViaEmailPassword(email, password) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.access_token) {
      setToken(res.access_token);
    }
    return res;
  },

  async logout(redirectUrl) {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {}
    setToken(null);
    if (redirectUrl && typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }
  },

  async register(data) {
    const res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.access_token) {
      setToken(res.access_token);
    }
    return res;
  },

  setToken(token) {
    setToken(token);
  },

  isAuthenticated() {
    return Boolean(getToken());
  },

  redirectToLogin(redirectUrl) {
    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl || '/login';
    }
  },

  async verifyOtp({ email, otpCode }) {
    const res = await request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otpCode })
    });
    if (res.access_token) {
      setToken(res.access_token);
    }
    return res;
  },

  async resendOtp(email) {
    return request('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async resetPasswordRequest(email) {
    return request('/auth/reset-password-request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async resetPassword(token, newPassword) {
    return request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword })
    });
  },

  async updateMe(data) {
    return request('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }
};

const functionsHandler = {
  async invoke(name, payload = {}) {
    const result = await request(`/functions/${name}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return { data: result };
  }
};

async function uploadMultipartFile(file) {
  if (!file) throw new Error('No file provided for upload');
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!res.ok) {
    let msg = `Upload failed with status ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error || err.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

const integrations = {
  Core: {
    async UploadFile({ file }) {
      return uploadMultipartFile(file);
    },
    async UploadPublicFile({ file }) {
      return uploadMultipartFile(file);
    }
  }
};

export const base44 = {
  auth,
  entities: entitiesProxy,
  asServiceRole: {
    entities: entitiesProxy
  },
  functions: functionsHandler,
  integrations
};

export default base44;
