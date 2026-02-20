#!/usr/bin/env node

/**
 * MCP Server for GLPI
 * Provides tools and resources for interacting with GLPI IT Service Management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { GlpiClient, GlpiConfig } from './glpi-client.js';

// Ticket status mapping
const TICKET_STATUS: Record<number, string> = {
  1: 'New',
  2: 'Processing (assigned)',
  3: 'Processing (planned)',
  4: 'Pending',
  5: 'Solved',
  6: 'Closed',
};

const TICKET_URGENCY: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Very high',
};

// Get configuration from environment variables
function getConfig(): GlpiConfig {
  const url = process.env.GLPI_URL;
  if (!url) {
    throw new Error('GLPI_URL environment variable is required');
  }

  return {
    url,
    appToken: process.env.GLPI_APP_TOKEN,
    userToken: process.env.GLPI_USER_TOKEN,
    username: process.env.GLPI_USERNAME,
    password: process.env.GLPI_PASSWORD,
  };
}

// Initialize the MCP server
const server = new Server(
  {
    name: 'mcp-server-glpi',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

let glpiClient: GlpiClient;

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Ticket Tools
      {
        name: 'glpi_list_tickets',
        description: 'List tickets from GLPI with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of tickets to return (default: 50)',
            },
            status: {
              type: 'number',
              description: 'Filter by status (1=New, 2=Processing assigned, 3=Processing planned, 4=Pending, 5=Solved, 6=Closed)',
            },
            order: {
              type: 'string',
              enum: ['ASC', 'DESC'],
              description: 'Sort order (default: DESC)',
            },
          },
        },
      },
      {
        name: 'glpi_get_ticket',
        description: 'Get detailed information about a specific ticket',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The ticket ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'glpi_create_ticket',
        description: 'Create a new ticket in GLPI',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Ticket title/subject',
            },
            content: {
              type: 'string',
              description: 'Ticket description/content',
            },
            urgency: {
              type: 'number',
              description: 'Urgency level (1-5, default: 3)',
            },
            category_id: {
              type: 'number',
              description: 'Category ID for the ticket',
            },
            user_id_assign: {
              type: 'number',
              description: 'User ID to assign the ticket to',
            },
            group_id_assign: {
              type: 'number',
              description: 'Group ID to assign the ticket to',
            },
          },
          required: ['name', 'content'],
        },
      },
      {
        name: 'glpi_update_ticket',
        description: 'Update an existing ticket',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The ticket ID to update',
            },
            name: {
              type: 'string',
              description: 'New ticket title',
            },
            content: {
              type: 'string',
              description: 'New ticket content',
            },
            status: {
              type: 'number',
              description: 'New status (1-6)',
            },
            urgency: {
              type: 'number',
              description: 'New urgency (1-5)',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'glpi_add_followup',
        description: 'Add a followup/comment to a ticket',
        inputSchema: {
          type: 'object',
          properties: {
            ticket_id: {
              type: 'number',
              description: 'The ticket ID',
            },
            content: {
              type: 'string',
              description: 'Followup content',
            },
            is_private: {
              type: 'boolean',
              description: 'Whether the followup is private (default: false)',
            },
          },
          required: ['ticket_id', 'content'],
        },
      },
      {
        name: 'glpi_get_ticket_followups',
        description: 'Get all followups/comments for a ticket',
        inputSchema: {
          type: 'object',
          properties: {
            ticket_id: {
              type: 'number',
              description: 'The ticket ID',
            },
          },
          required: ['ticket_id'],
        },
      },
      // User Tools
      {
        name: 'glpi_list_users',
        description: 'List users from GLPI',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of users to return (default: 50)',
            },
            active_only: {
              type: 'boolean',
              description: 'Only return active users (default: true)',
            },
          },
        },
      },
      {
        name: 'glpi_get_user',
        description: 'Get detailed information about a specific user',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The user ID',
            },
          },
          required: ['id'],
        },
      },
      // Group Tools
      {
        name: 'glpi_list_groups',
        description: 'List groups from GLPI',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of groups to return (default: 50)',
            },
          },
        },
      },
      {
        name: 'glpi_get_group',
        description: 'Get detailed information about a specific group',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The group ID',
            },
          },
          required: ['id'],
        },
      },
      // Category Tools
      {
        name: 'glpi_list_categories',
        description: 'List ticket categories from GLPI',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of categories to return (default: 50)',
            },
          },
        },
      },
      // Search Tool
      {
        name: 'glpi_search',
        description: 'Search for items in GLPI using criteria',
        inputSchema: {
          type: 'object',
          properties: {
            itemtype: {
              type: 'string',
              description: 'Type of item to search (Ticket, User, Computer, etc.)',
            },
            field: {
              type: 'number',
              description: 'Field ID to search on (use glpi_get_search_options to find field IDs)',
            },
            searchtype: {
              type: 'string',
              enum: ['contains', 'equals', 'notequals', 'lessthan', 'morethan'],
              description: 'Type of search',
            },
            value: {
              type: 'string',
              description: 'Value to search for',
            },
          },
          required: ['itemtype', 'field', 'searchtype', 'value'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ==================== TICKET TOOLS ====================
      case 'glpi_list_tickets': {
        const limit = (args?.limit as number) || 50;
        const tickets = await glpiClient.getTickets({
          range: `0-${limit - 1}`,
          order: (args?.order as 'ASC' | 'DESC') || 'DESC',
        });

        const formattedTickets = tickets.map((t: any) => ({
          id: t.id,
          name: t.name,
          status: TICKET_STATUS[t.status] || t.status,
          urgency: TICKET_URGENCY[t.urgency] || t.urgency,
          date: t.date,
          date_mod: t.date_mod,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(formattedTickets, null, 2),
            },
          ],
        };
      }

      case 'glpi_get_ticket': {
        const id = args?.id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'Ticket ID is required');

        const ticket = await glpiClient.getTicket(id);
        const followups = await glpiClient.getTicketFollowups(id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...ticket,
                  status_label: TICKET_STATUS[ticket.status],
                  urgency_label: TICKET_URGENCY[ticket.urgency],
                  followups_count: followups.length,
                  followups,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'glpi_create_ticket': {
        const name = args?.name as string;
        const content = args?.content as string;
        if (!name || !content) {
          throw new McpError(ErrorCode.InvalidParams, 'name and content are required');
        }

        const result = await glpiClient.createTicket({
          name,
          content,
          urgency: (args?.urgency as number) || 3,
          itilcategories_id: args?.category_id as number,
          _users_id_assign: args?.user_id_assign as number,
          _groups_id_assign: args?.group_id_assign as number,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      }

      case 'glpi_update_ticket': {
        const id = args?.id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'Ticket ID is required');

        const updates: any = {};
        if (args?.name) updates.name = args.name;
        if (args?.content) updates.content = args.content;
        if (args?.status) updates.status = args.status;
        if (args?.urgency) updates.urgency = args.urgency;

        await glpiClient.updateTicket(id, updates);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Ticket ${id} updated` }, null, 2),
            },
          ],
        };
      }

      case 'glpi_add_followup': {
        const ticketId = args?.ticket_id as number;
        const content = args?.content as string;
        if (!ticketId || !content) {
          throw new McpError(ErrorCode.InvalidParams, 'ticket_id and content are required');
        }

        const result = await glpiClient.addTicketFollowup(
          ticketId,
          content,
          (args?.is_private as boolean) || false
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, followup_id: result.id }, null, 2),
            },
          ],
        };
      }

      case 'glpi_get_ticket_followups': {
        const ticketId = args?.ticket_id as number;
        if (!ticketId) throw new McpError(ErrorCode.InvalidParams, 'ticket_id is required');

        const followups = await glpiClient.getTicketFollowups(ticketId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(followups, null, 2),
            },
          ],
        };
      }

      // ==================== USER TOOLS ====================
      case 'glpi_list_users': {
        const limit = (args?.limit as number) || 50;
        const users = await glpiClient.getUsers({
          range: `0-${limit - 1}`,
          is_active: args?.active_only !== false,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(users, null, 2),
            },
          ],
        };
      }

      case 'glpi_get_user': {
        const id = args?.id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'User ID is required');

        const user = await glpiClient.getUser(id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(user, null, 2),
            },
          ],
        };
      }

      // ==================== GROUP TOOLS ====================
      case 'glpi_list_groups': {
        const limit = (args?.limit as number) || 50;
        const groups = await glpiClient.getGroups({
          range: `0-${limit - 1}`,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(groups, null, 2),
            },
          ],
        };
      }

      case 'glpi_get_group': {
        const id = args?.id as number;
        if (!id) throw new McpError(ErrorCode.InvalidParams, 'Group ID is required');

        const group = await glpiClient.getGroup(id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(group, null, 2),
            },
          ],
        };
      }

      // ==================== CATEGORY TOOLS ====================
      case 'glpi_list_categories': {
        const limit = (args?.limit as number) || 50;
        const categories = await glpiClient.getCategories({
          range: `0-${limit - 1}`,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(categories, null, 2),
            },
          ],
        };
      }

      // ==================== SEARCH TOOL ====================
      case 'glpi_search': {
        const itemtype = args?.itemtype as string;
        const field = args?.field as number;
        const searchtype = args?.searchtype as string;
        const value = args?.value as string;

        if (!itemtype || field === undefined || !searchtype || value === undefined) {
          throw new McpError(ErrorCode.InvalidParams, 'itemtype, field, searchtype, and value are required');
        }

        const results = await glpiClient.search(itemtype, [
          { field, searchtype, value },
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Define available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'glpi://tickets/open',
        name: 'Open Tickets',
        description: 'List of all open tickets (status: New, Processing, Pending)',
        mimeType: 'application/json',
      },
      {
        uri: 'glpi://tickets/recent',
        name: 'Recent Tickets',
        description: 'Most recently modified tickets',
        mimeType: 'application/json',
      },
      {
        uri: 'glpi://groups',
        name: 'Groups',
        description: 'List of all groups',
        mimeType: 'application/json',
      },
      {
        uri: 'glpi://categories',
        name: 'Categories',
        description: 'List of ticket categories',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    switch (uri) {
      case 'glpi://tickets/open': {
        const tickets = await glpiClient.getTickets({ range: '0-99' });
        const openTickets = tickets.filter((t: any) => t.status < 5);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(openTickets, null, 2),
            },
          ],
        };
      }

      case 'glpi://tickets/recent': {
        const tickets = await glpiClient.getTickets({
          range: '0-19',
          order: 'DESC',
        });
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(tickets, null, 2),
            },
          ],
        };
      }

      case 'glpi://groups': {
        const groups = await glpiClient.getGroups({ range: '0-99' });
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(groups, null, 2),
            },
          ],
        };
      }

      case 'glpi://categories': {
        const categories = await glpiClient.getCategories({ range: '0-99' });
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(categories, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Error reading resource: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Main function
async function main() {
  try {
    const config = getConfig();
    glpiClient = new GlpiClient(config);

    // Initialize session
    await glpiClient.initSession();
    console.error('GLPI session initialized successfully');

    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP GLPI Server running on stdio');

    // Handle shutdown
    process.on('SIGINT', async () => {
      await glpiClient.killSession();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await glpiClient.killSession();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
