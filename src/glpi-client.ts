/**
 * GLPI REST API Client
 * Handles authentication and API calls to GLPI
 */

export interface GlpiConfig {
  url: string;
  appToken?: string;
  userToken?: string;
  username?: string;
  password?: string;
}

export interface GlpiSession {
  sessionToken: string;
}

export interface GlpiTicket {
  id: number;
  name: string;
  content: string;
  status: number;
  urgency: number;
  priority: number;
  date: string;
  date_mod: string;
  users_id_recipient: number;
  itilcategories_id: number;
  entities_id: number;
}

export interface GlpiUser {
  id: number;
  name: string;
  realname: string;
  firstname: string;
  email: string;
  is_active: number;
}

export interface GlpiGroup {
  id: number;
  name: string;
  completename: string;
  comment: string;
}

export interface GlpiCategory {
  id: number;
  name: string;
  completename: string;
}

export class GlpiClient {
  private config: GlpiConfig;
  private sessionToken: string | null = null;

  constructor(config: GlpiConfig) {
    this.config = config;
    // Remove trailing slash from URL
    this.config.url = config.url.replace(/\/$/, '');
  }

  private getHeaders(includeSession: boolean = true): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.appToken) {
      headers['App-Token'] = this.config.appToken;
    }

    if (includeSession && this.sessionToken) {
      headers['Session-Token'] = this.sessionToken;
    }

    return headers;
  }

  async initSession(): Promise<string> {
    const headers = this.getHeaders(false);

    if (this.config.userToken) {
      headers['Authorization'] = `user_token ${this.config.userToken}`;
    } else if (this.config.username && this.config.password) {
      const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else {
      throw new Error('No authentication method provided. Set userToken or username/password.');
    }

    const response = await fetch(`${this.config.url}/apirest.php/initSession`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to init session: ${response.status} - ${error}`);
    }

    const data = await response.json() as { session_token: string };
    this.sessionToken = data.session_token;
    return this.sessionToken;
  }

  async killSession(): Promise<void> {
    if (!this.sessionToken) return;

    await fetch(`${this.config.url}/apirest.php/killSession`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    this.sessionToken = null;
  }

  async ensureSession(): Promise<void> {
    if (!this.sessionToken) {
      await this.initSession();
    }
  }

  // ==================== TICKETS ====================

  async getTickets(options: {
    range?: string;
    sort?: number;
    order?: 'ASC' | 'DESC';
    searchText?: string;
    is_deleted?: boolean;
  } = {}): Promise<GlpiTicket[]> {
    await this.ensureSession();

    const params = new URLSearchParams();
    if (options.range) params.append('range', options.range);
    if (options.sort) params.append('sort', options.sort.toString());
    if (options.order) params.append('order', options.order);
    if (options.is_deleted !== undefined) params.append('is_deleted', options.is_deleted ? '1' : '0');

    const url = `${this.config.url}/apirest.php/Ticket?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get tickets: ${response.status}`);
    }

    return response.json() as Promise<GlpiTicket[]>;
  }

  async getTicket(id: number): Promise<GlpiTicket> {
    await this.ensureSession();

    const response = await fetch(`${this.config.url}/apirest.php/Ticket/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get ticket ${id}: ${response.status}`);
    }

    return response.json() as Promise<GlpiTicket>;
  }

  async createTicket(ticket: {
    name: string;
    content: string;
    urgency?: number;
    priority?: number;
    itilcategories_id?: number;
    type?: number;
    entities_id?: number;
    _users_id_assign?: number;
    _groups_id_assign?: number;
  }): Promise<{ id: number; message: string }> {
    await this.ensureSession();

    const response = await fetch(`${this.config.url}/apirest.php/Ticket`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ input: ticket }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create ticket: ${response.status} - ${error}`);
    }

    return response.json() as Promise<{ id: number; message: string }>;
  }

  async updateTicket(id: number, updates: Partial<GlpiTicket>): Promise<boolean> {
    await this.ensureSession();

    const response = await fetch(`${this.config.url}/apirest.php/Ticket/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ input: updates }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update ticket ${id}: ${response.status}`);
    }

    return true;
  }

  async addTicketFollowup(ticketId: number, content: string, isPrivate: boolean = false): Promise<{ id: number }> {
    await this.ensureSession();

    const response = await fetch(`${this.config.url}/apirest.php/ITILFollowup`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        input: {
          itemtype: 'Ticket',
          items_id: ticketId,
          content: content,
          is_private: isPrivate ? 1 : 0,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to add followup: ${response.status} - ${error}`);
    }

    return response.json() as Promise<{ id: number }>;
  }

  async getTicketFollowups(ticketId: number): Promise<any[]> {
    await this.ensureSession();

    const response = await fetch(
      `${this.config.url}/apirest.php/Ticket/${ticketId}/ITILFollowup`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get followups: ${response.status}`);
    }

    return response.json() as Promise<any[]>;
  }

  // ==================== USERS ====================

  async getUsers(options: { range?: string; is_active?: boolean } = {}): Promise<GlpiUser[]> {
    await this.ensureSession();

    const params = new URLSearchParams();
    if (options.range) params.append('range', options.range);
    if (options.is_active !== undefined) {
      params.append('searchText[is_active]', options.is_active ? '1' : '0');
    }

    const response = await fetch(`${this.config.url}/apirest.php/User?${params.toString()}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get users: ${response.status}`);
    }

    return response.json() as Promise<GlpiUser[]>;
  }

  async getUser(id: number): Promise<GlpiUser> {
    await this.ensureSession();

    const response = await fetch(`${this.config.url}/apirest.php/User/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get user ${id}: ${response.status}`);
    }

    return response.json() as Promise<GlpiUser>;
  }

  // ==================== GROUPS ====================

  async getGroups(options: { range?: string } = {}): Promise<GlpiGroup[]> {
    await this.ensureSession();

    const params = new URLSearchParams();
    if (options.range) params.append('range', options.range);

    const response = await fetch(`${this.config.url}/apirest.php/Group?${params.toString()}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get groups: ${response.status}`);
    }

    return response.json() as Promise<GlpiGroup[]>;
  }

  async getGroup(id: number): Promise<GlpiGroup> {
    await this.ensureSession();

    const response = await fetch(`${this.config.url}/apirest.php/Group/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get group ${id}: ${response.status}`);
    }

    return response.json() as Promise<GlpiGroup>;
  }

  // ==================== CATEGORIES ====================

  async getCategories(options: { range?: string } = {}): Promise<GlpiCategory[]> {
    await this.ensureSession();

    const params = new URLSearchParams();
    if (options.range) params.append('range', options.range);

    const response = await fetch(`${this.config.url}/apirest.php/ITILCategory?${params.toString()}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get categories: ${response.status}`);
    }

    return response.json() as Promise<GlpiCategory[]>;
  }

  // ==================== SEARCH ====================

  async search(itemtype: string, criteria: any[]): Promise<any> {
    await this.ensureSession();

    const params = new URLSearchParams();
    criteria.forEach((c, i) => {
      Object.entries(c).forEach(([key, value]) => {
        params.append(`criteria[${i}][${key}]`, String(value));
      });
    });

    const response = await fetch(
      `${this.config.url}/apirest.php/search/${itemtype}?${params.toString()}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to search ${itemtype}: ${response.status}`);
    }

    return response.json();
  }

  // ==================== STATISTICS ====================

  async getMyTickets(): Promise<GlpiTicket[]> {
    await this.ensureSession();

    // Search tickets assigned to current user
    const response = await fetch(
      `${this.config.url}/apirest.php/search/Ticket?criteria[0][field]=5&criteria[0][searchtype]=equals&criteria[0][value]=myself`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get my tickets: ${response.status}`);
    }

    return response.json() as Promise<GlpiTicket[]>;
  }
}
