# MCP Server for GLPI

A Model Context Protocol (MCP) server that provides integration with GLPI (Gestionnaire Libre de Parc Informatique) for AI assistants like Claude.

## Features

### Tools

| Tool | Description |
|------|-------------|
| `glpi_list_tickets` | List tickets with optional filters (status, limit, order) |
| `glpi_get_ticket` | Get detailed ticket information including followups |
| `glpi_create_ticket` | Create a new ticket |
| `glpi_update_ticket` | Update an existing ticket |
| `glpi_add_followup` | Add a followup/comment to a ticket |
| `glpi_get_ticket_followups` | Get all followups for a ticket |
| `glpi_list_users` | List users |
| `glpi_get_user` | Get user details |
| `glpi_list_groups` | List groups |
| `glpi_get_group` | Get group details |
| `glpi_list_categories` | List ticket categories |
| `glpi_search` | Search for items using GLPI search criteria |

### Resources

| Resource URI | Description |
|--------------|-------------|
| `glpi://tickets/open` | All open tickets (New, Processing, Pending) |
| `glpi://tickets/recent` | Most recently modified tickets |
| `glpi://groups` | All groups |
| `glpi://categories` | All ticket categories |

## Installation

```bash
npm install -g mcp-glpi
```

Or use directly with npx:

```bash
npx mcp-glpi
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GLPI_URL` | Yes | Base URL of your GLPI instance (e.g., `https://glpi.example.com`) |
| `GLPI_APP_TOKEN` | No | Application token from GLPI API settings |
| `GLPI_USER_TOKEN` | No* | User API token (found in user preferences) |
| `GLPI_USERNAME` | No* | Username for basic auth |
| `GLPI_PASSWORD` | No* | Password for basic auth |

*Either `GLPI_USER_TOKEN` or `GLPI_USERNAME`/`GLPI_PASSWORD` is required.

### GLPI API Setup

1. Go to **Setup > General > API** in GLPI
2. Enable the REST API
3. Create an API client and note the App Token
4. For user authentication, either:
   - Use a User Token (found in user preferences under "Remote access keys")
   - Or use username/password authentication

### Claude Desktop Configuration

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "glpi": {
      "command": "npx",
      "args": ["mcp-glpi"],
      "env": {
        "GLPI_URL": "https://your-glpi-instance.com",
        "GLPI_APP_TOKEN": "your-app-token",
        "GLPI_USER_TOKEN": "your-user-token"
      }
    }
  }
}
```

## Usage Examples

Once configured, you can ask Claude to:

- "List all open tickets in GLPI"
- "Show me ticket #123"
- "Create a new ticket for a printer issue in room 101"
- "Add a followup to ticket #456 saying the issue has been investigated"
- "List all groups in GLPI"
- "Search for tickets containing 'network' in the title"

## Development

### Building from source

```bash
git clone https://github.com/GMS64260/mcp-glpi.git
cd mcp-glpi
npm install
npm run build
```

### Running locally

```bash
export GLPI_URL="https://your-glpi-instance.com"
export GLPI_USER_TOKEN="your-token"
npm start
```

## Ticket Status Reference

| Status ID | Label |
|-----------|-------|
| 1 | New |
| 2 | Processing (assigned) |
| 3 | Processing (planned) |
| 4 | Pending |
| 5 | Solved |
| 6 | Closed |

## Urgency Reference

| Urgency ID | Label |
|------------|-------|
| 1 | Very low |
| 2 | Low |
| 3 | Medium |
| 4 | High |
| 5 | Very high |

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Links

- [GLPI Project](https://glpi-project.org/)
- [GLPI API Documentation](https://glpi-user-documentation.readthedocs.io/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
