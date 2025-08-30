# Notion MCP Integration Configuration

# Add these to your .env.local file for testing:

# For regular Notion API integration (existing)
NOTION_TOKEN=your_notion_integration_token_here

# For MCP (Model Context Protocol) integration (new)
MCP_NOTION_SERVER_URL=http://localhost:3001/mcp/notion

# Optional: OpenAI API for AI voice assistance features
OPENAI_API_KEY=your_openai_api_key_here

# Setup Instructions:

## 1. Regular Notion API Setup:
# - Go to https://www.notion.so/my-integrations
# - Create new integration, copy the token
# - Share your databases with the integration
# - Add token to NOTION_TOKEN above

## 2. MCP Server Setup:
# - The MCP server would typically run separately
# - For now, it's mocked in the API routes
# - Real MCP integration would connect to actual MCP server
# - Update MCP_NOTION_SERVER_URL with your MCP server URL

## 3. Testing the Integration:
# - Regular Notion: Click "Notion Tasks" button (uses direct API)
# - MCP Integration: Click "AI Notes" button (uses MCP protocol)
# - Both are separate and can be used for different purposes:
#   - Regular Notion: Task management, project tracking
#   - MCP Notion: AI voice notes, dynamic content, context-aware operations

## Use Cases for MCP Integration:
# - AI voice assistant can create/update notes via MCP
# - Context-aware task suggestions based on current time blocks
# - Dynamic database queries based on AI conversation context
# - Smart categorization and tagging of voice notes
# - Integration with OpenAI for intelligent note processing