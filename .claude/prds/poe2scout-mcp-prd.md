---
name: poe2scout-mcp-prd
description: MCP server that enables Claude to access real-time Path of Exile 2 market data for AI-powered trading analysis
status: draft
created: 2025-08-21T02:58:37Z
updated: 2025-08-21T02:58:37Z
---

# Product Requirements Document: POE2Scout MCP Server

## 1. Executive Summary

### Product Name
POE2Scout MCP Bridge

### Vision
Create an MCP (Model Context Protocol) server that enables Claude to access real-time Path of Exile 2 market data, providing traders with AI-powered market analysis, price checking, and trading insights through natural language queries.

### About MCP
The Model Context Protocol (MCP) is an open standard for connecting AI assistants to the systems where data lives, including content repositories, business tools, and development environments. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools.

### Target Platforms
This MCP server will be compatible with:
- **Claude Desktop**: Anthropic's desktop application for Claude
- **Claude Code**: Anthropic's command-line tool for agentic coding that can leverage MCP servers to access external data while generating code
- **VS Code with Copilot**: Microsoft's IDE with GitHub Copilot integration
- **Cursor**: AI-first IDE with MCP support
- **Other MCP-compatible clients**: Zed, Replit, Sourcegraph Cody, etc.

### Objectives
- Enable Claude to query POE2 market data in real-time
- Provide intelligent market analysis and trading recommendations
- Support complex queries about item values, market trends, and arbitrage opportunities
- Maintain compliance with poe2scout API usage guidelines

## 2. Technical Requirements

### MCP Resources and Documentation
- **Official MCP Documentation**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **MCP Specification**: [spec.modelcontextprotocol.io](https://spec.modelcontextprotocol.io)
- **GitHub Organization**: [github.com/modelcontextprotocol](https://github.com/modelcontextprotocol)
- **TypeScript SDK**: [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **Python SDK**: [github.com/modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk)
- **MCP Quickstart Guide**: [modelcontextprotocol.io/quickstart](https://modelcontextprotocol.io/quickstart)
- **Claude Desktop MCP Support**: [support.anthropic.com/en/articles/10949351](https://support.anthropic.com/en/articles/10949351-getting-started-with-model-context-protocol-mcp-on-claude-for-desktop)
- **Claude Code MCP Documentation**: [docs.anthropic.com/en/docs/claude-code/mcp](https://docs.anthropic.com/en/docs/claude-code/mcp)
- **Community MCP Servers**: [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)

### SDK Options
MCP servers can be built using multiple SDKs:
- **TypeScript SDK** (Recommended for this project) - Official SDK with full protocol support
- **Python SDK** - Official SDK with FastMCP framework support
- **C# SDK** - Microsoft partnership, available via NuGet
- **Java SDK** - Community supported
- **Kotlin SDK** - Community supported
- **Go SDK** - Community supported

### Prerequisites
- **Runtime**: Node.js 18+ (for TypeScript) or Python 3.10+ (for Python)
- **MCP SDK**: Latest version of Anthropic's MCP SDK (v0.6.0+)
- **API Access**: poe2scout.com API (open, no key required)
- **Database** (Optional): Local SQLite for caching frequent queries
- **MCP Clients for Testing**: 
  - Claude Desktop (supports Desktop Extensions as of 2025)
  - Claude Code (command-line tool for agentic coding)
  - VS Code with Copilot
  - Cursor IDE
- **Package Manager**: npm/yarn (TypeScript) or pip/uv (Python)

### API Compliance
- Include User-Agent header with contact email
- Implement rate limiting (respect poe2scout's guidelines)
- Cache responses to minimize API calls
- Handle API maintenance windows gracefully

## 3. Core Features & Tools

### 3.1 Price Checking Tools

#### `get_item_price`
**Purpose**: Fetch current market price for specific items  
**Parameters**:
- `item_name` (string): Name of the item
- `league` (string): Target league (default: current league)
- `corrupted` (boolean): Filter for corrupted items
- `links` (number): Number of socket links (optional)

**Returns**: Current price, price confidence, listing count, price trend

#### `get_currency_rates`
**Purpose**: Get exchange rates between currencies  
**Parameters**:
- `from_currency` (string): Source currency
- `to_currency` (string): Target currency
- `league` (string): Target league

**Returns**: Exchange rate, volume, spread

### 3.2 Market Analysis Tools

#### `analyze_price_history`
**Purpose**: Analyze historical price trends  
**Parameters**:
- `item_name` (string): Item to analyze
- `time_range` (string): "1d", "1w", "1m", "league"
- `league` (string): Target league

**Returns**: Price history, volatility, trend direction, support/resistance levels

#### `find_arbitrage_opportunities`
**Purpose**: Identify profitable trading opportunities  
**Parameters**:
- `min_profit_margin` (number): Minimum profit percentage
- `max_investment` (number): Maximum currency to invest
- `league` (string): Target league

**Returns**: List of arbitrage opportunities with profit margins

### 3.3 Portfolio Management Tools

#### `track_item_value`
**Purpose**: Monitor specific items for price changes  
**Parameters**:
- `items` (array): List of items to track
- `alert_threshold` (number): Percentage change to trigger alert

**Returns**: Current values, changes since last check

#### `evaluate_trade`
**Purpose**: Assess whether a proposed trade is fair  
**Parameters**:
- `offered_items` (array): Items being offered
- `requested_items` (array): Items being requested

**Returns**: Trade fairness score, market value comparison

### 3.4 Market Intelligence Tools

#### `get_market_trends`
**Purpose**: Identify trending items and market movements  
**Parameters**:
- `category` (string): "currency", "uniques", "divination", "all"
- `time_frame` (string): Time period to analyze

**Returns**: Top movers, volume changes, emerging trends

#### `search_underpriced_items`
**Purpose**: Find items listed below market value  
**Parameters**:
- `category` (string): Item category to search
- `max_price` (number): Maximum price threshold
- `min_discount` (number): Minimum discount percentage

**Returns**: List of underpriced items with profit potential

## 4. User Stories

### Trader Stories
1. "As a trader, I want to ask 'What's the current price of Mageblood?' and get instant market data"
2. "As a trader, I want to ask 'Show me Divine Orb price trends this week' to make informed decisions"
3. "As a trader, I want to ask 'Find me arbitrage opportunities with 20% profit margin' to identify trades"

### Flipper Stories
1. "As a flipper, I want to ask 'What uniques are underpriced right now?' to find deals"
2. "As a flipper, I want to ask 'Track these 10 items and alert me to price drops' for monitoring"

### New Player Stories
1. "As a new player, I want to ask 'Is 50 chaos fair for this item?' to avoid scams"
2. "As a new player, I want to ask 'What's the Divine to Chaos ratio?' to understand currency values"

### Developer Stories (Claude Code)
1. "As a developer using Claude Code, I want to say 'Create a Python dashboard that tracks my favorite items' and have it generate the code with live price data"
2. "As a developer, I want to say 'Build a Discord bot that posts daily currency rates' and have Claude Code create it using real POE2 data"
3. "As a developer, I want to say 'Generate a trading profit tracker script' and have Claude Code build it with actual market data integration"

## 5. Technical Architecture

### MCP Protocol Implementation
MCP uses JSON-RPC over stdio (standard input/output) for local servers or HTTP/SSE for remote servers. The protocol provides:
- **Resources**: Read-only data sources (like GET endpoints)
- **Tools**: Executable functions that can perform actions
- **Prompts**: Reusable prompt templates for common queries

### Component Structure
```
poe2scout-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── api/
│   │   ├── client.ts      # POE2Scout API client
│   │   └── types.ts       # API response types
│   ├── tools/
│   │   ├── pricing.ts     # Price checking tools
│   │   ├── analysis.ts    # Market analysis tools
│   │   └── portfolio.ts   # Portfolio tools
│   ├── cache/
│   │   └── manager.ts     # Response caching logic
│   └── utils/
│       ├── rateLimit.ts   # Rate limiting
│       └── formatter.ts   # Response formatting
├── config/
│   └── mcp.json          # MCP configuration
├── tests/
├── tsconfig.json         # TypeScript configuration
└── package.json
```

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "type": "module"
  }
}
```

### Data Flow
1. Claude sends natural language query
2. MCP server interprets and routes to appropriate tool
3. Tool checks cache for recent data
4. If cache miss, queries poe2scout API
5. Process and format response
6. Return structured data to Claude
7. Claude presents insights in natural language

## 6. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Set up MCP server boilerplate
- [ ] Implement poe2scout API client
- [ ] Create basic price checking tool
- [ ] Add caching layer
- [ ] Test with Claude Desktop

### Phase 2: Essential Tools (Week 2)
- [ ] Implement currency rate tool
- [ ] Add price history analysis
- [ ] Create trade evaluation tool
- [ ] Implement error handling

### Phase 3: Advanced Features (Week 3)
- [ ] Build arbitrage finder
- [ ] Add market trend analysis
- [ ] Implement item tracking
- [ ] Create underpriced item search

### Phase 4: Optimization (Week 4)
- [ ] Optimize caching strategies
- [ ] Improve response formatting
- [ ] Add comprehensive logging
- [ ] Performance testing
- [ ] Documentation

## 7. Success Metrics

### Performance KPIs
- Response time < 2 seconds for cached queries
- Response time < 5 seconds for fresh API calls
- Cache hit rate > 60%
- Zero API rate limit violations

### Functionality KPIs
- Support for 100% of major POE2 currencies
- Accurate price data (within 5% of actual market)
- Successful handling of 95% of user queries
- Proper error messages for unsupported queries

### Platform Integration KPIs
- Successful integration with Claude Desktop
- Full functionality in Claude Code for development tasks
- Compatible with VS Code/Cursor MCP extensions
- Zero crashes during 24-hour continuous operation

## 8. Example Interactions

### Claude Desktop Examples
```
User: "What's the price of Headhunter in the current league?"
Claude: "Headhunter is currently trading for approximately 125-130 Divine Orbs 
in Settlers League, based on 47 active listings. The price has increased 
8% over the past week."

User: "Find me good currency flipping opportunities"
Claude: "I found several profitable currency flips:
1. Ancient Orbs → Divine Orbs: 12% margin (buy at 1:8, sell at 1:7)
2. Awakened Sextants → Chaos: 9% margin (buy at 1:4.5, sell at 1:4)
3. Fossils (Pristine) → Chaos: 15% margin (bulk buying opportunity)"

User: "Is 2 Divine Orbs fair for a 6-linked Belly of the Beast?"
Claude: "That's slightly overpriced. Current market data shows 6-linked 
Belly of the Beast trading for 1.4-1.6 Divine Orbs. You could likely 
find one for 1.5 Divine or less if you're patient."
```

### Claude Code Examples
```bash
# User in Claude Code terminal
$ claude "Create a Python script that monitors Divine Orb prices and sends alerts when they drop below 200 chaos"

# Claude Code generates a complete script using MCP data:
# - Fetches real-time prices from POE2Scout
# - Sets up monitoring with actual current prices
# - Includes notification logic
# - Saves as divine_monitor.py

$ claude "Build a web dashboard showing my tracked items with live prices"

# Claude Code creates:
# - React dashboard with real POE2 prices
# - Auto-refresh using MCP server data
# - Price history charts
# - Profit/loss calculations

$ claude "Generate a report of the best items to flip today based on current market conditions"

# Claude Code:
# - Analyzes current market data via MCP
# - Creates markdown report with tables
# - Includes specific items and margins
# - Adds trading strategy recommendations
```

## 9. Future Enhancements

### Potential V2 Features
- Build price calculator (total cost for POB builds)
- Crafting profit calculator
- League-start strategy optimizer
- Historical league economy comparisons
- Integration with other POE tools/APIs
- Discord notification system
- Multi-account portfolio tracking

## 10. Development Notes

### API Endpoints to Integrate
- Review poe2scout.com/api/swagger for full endpoint list
- Priority endpoints: `/prices`, `/items`, `/currency`, `/history`
- Include proper headers: `User-Agent: poe2scout-mcp/1.0 (your-email@example.com)`

### Caching Strategy
- Currency rates: 5-minute cache
- Unique prices: 15-minute cache  
- Historical data: 1-hour cache
- Trending data: 10-minute cache

### MCP Ecosystem Status (2025)
- **Anthropic Products**: 
  - Claude Desktop supports MCP servers via Desktop Extensions (DXT)
  - Claude Code (CLI tool) can connect to MCP servers for agentic coding tasks
  - Both support stdio and HTTP transports
- **Protocol Adoption**: OpenAI adopted MCP in March 2025 for ChatGPT Desktop
- **Microsoft Integration**: Copilot uses MCP as default bridge to external knowledge
- **IDE Support**: Zed, Replit, Codeium, Sourcegraph, and Cursor have integrated MCP
- **Enterprise Adoption**: Block, Apollo, Wix actively using MCP in production
- **Transport Evolution**: SSE deprecated in favor of Streamable HTTP

## 11. Implementation Examples

### Basic MCP Server Setup (TypeScript)
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "poe2scout-mcp",
  version: "1.0.0"
});

// Define a tool for price checking
server.tool(
  "get_item_price",
  "Get current market price for a POE2 item",
  {
    item_name: z.string().describe("Name of the item"),
    league: z.string().default("current").describe("Target league")
  },
  async ({ item_name, league }) => {
    // Fetch from poe2scout API
    const response = await fetch(
      `https://poe2scout.com/api/prices/${encodeURIComponent(item_name)}`,
      { headers: { "User-Agent": "poe2scout-mcp/1.0 (email@example.com)" } }
    );
    
    const data = await response.json();
    
    return {
      content: [{
        type: "text",
        text: `Current price of ${item_name}: ${data.price} ${data.currency}`
      }]
    };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Claude Desktop Configuration
Add to Claude Desktop settings (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "poe2scout": {
      "command": "node",
      "args": ["./build/index.js"],
      "env": {
        "POE2SCOUT_CACHE_DIR": "/tmp/poe2scout-cache"
      }
    }
  }
}
```

### Claude Code Configuration
Claude Code is Anthropic's command-line tool for agentic coding that can connect to MCP servers. Configure using the Claude CLI:

```bash
# Add the POE2Scout MCP server to Claude Code
claude mcp add poe2scout --env POE2SCOUT_CACHE_DIR=/tmp/poe2scout-cache -- node /path/to/poe2scout-mcp/build/index.js

# Alternative: Add with specific scope
claude mcp add poe2scout --scope project -- node ./build/index.js

# List configured servers
claude mcp list

# Get details for the server
claude mcp get poe2scout

# Remove if needed
claude mcp remove poe2scout
```

**Claude Code Scopes:**
- `local` (default): Available only to you in the current project
- `project`: Shared with everyone via `.mcp.json` file
- `user`: Available across all your projects

**Using in Claude Code:**
Once configured, you can use natural language commands in Claude Code:
```
# Examples of using POE2Scout in Claude Code:
"Check the current price of Headhunter and create a markdown report"
"Analyze Divine Orb price trends and update the trading-strategy.md file"
"Find arbitrage opportunities and generate a Python script to track them"
```

### Package.json Configuration
```json
{
  "name": "poe2scout-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsx watch src/index.ts",
    "inspector": "npx @modelcontextprotocol/inspector build/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.6.0",
    "zod": "^3.22.0",
    "node-cache": "^5.1.2"
  },
  "devDependencies": {
    "@types/node": "^20.11.24",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

### Testing with Claude Code
After building your MCP server, test it with Claude Code for development workflows:

```bash
# Build the server
npm run build

# Add to Claude Code (local scope for testing)
claude mcp add poe2scout-test --env DEBUG=true -- node ./build/index.js

# Test in Claude Code
claude "Using the poe2scout server, check the current price of Divine Orbs and create a Python script to track them"

# The server will be called when Claude Code needs POE2 market data
# You can see the MCP interactions in the debug output

# For production deployment (user scope)
claude mcp add poe2scout --scope user -- node /path/to/production/build/index.js

# Now available in all your Claude Code projects
```

**Claude Code Use Cases with POE2Scout MCP:**
- Generate trading bots with real market data
- Create price tracking dashboards
- Build Discord/Slack notifications for price changes
- Develop portfolio management tools
- Automate market analysis reports

## 12. Common Troubleshooting

### MCP Connection Issues
- **Transport Initialization Failed**: Ensure stdio streams are properly configured
- **Tool Not Found**: Verify tool names match exactly between registration and calls
- **Module Resolution Errors**: Use `NodeNext` in tsconfig.json for proper ESM support
- **Server Crashes on Startup**: Add error handling with `server.onerror` callback

### POE2Scout API Issues
- **Rate Limiting**: Implement exponential backoff for API calls
- **Maintenance Windows**: Check POE2 server status before API calls
- **Stale Data**: Implement cache invalidation based on POE2 update cycles

---

**Next Steps**: 
1. Clone the [MCP TypeScript SDK repository](https://github.com/modelcontextprotocol/typescript-sdk)
2. Set up development environment with Node.js 18+
3. Initialize project using the example code above
4. Test with [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) before integration
5. Configure for your preferred platform:
   - **Claude Desktop**: Follow the [official guide](https://support.anthropic.com/en/articles/10949351)
   - **Claude Code**: Use `claude mcp add` command as documented above
   - **VS Code/Cursor**: Add to respective MCP configurations
6. Begin Phase 1 implementation
7. Join the [MCP Discord community](https://discord.gg/anthropic-mcp) for support

**Useful Resources**:
- [Awesome MCP Servers](https://github.com/modelcontextprotocol/awesome-mcp) - Community collection
- [MCP Specification](https://spec.modelcontextprotocol.io) - Protocol details
- [FastMCP](https://github.com/punkpeye/fastmcp) - TypeScript framework for rapid development
- [MCP Security Considerations](https://spec.modelcontextprotocol.io/specification/security) - Best practices