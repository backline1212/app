import type { AgentHint } from "./api";

export interface Snippet {
  label: string;
  code: string;
}

export interface McpClient {
  id: AgentHint;
  name: string;
  color: string;
  /** What the person does, in order, around the snippets. */
  intro: string;
  snippets: (url: string, token: string) => Snippet[];
  /** A one-click install link, where the client has one. */
  install?: { label: string; href: (url: string, token: string) => string };
  after: string;
}

export const TOKEN_PLACEHOLDER = "<YOUR_BACKLINE_TOKEN>";

const bearer = (token: string) => `Bearer ${token}`;
const json = (value: unknown) => JSON.stringify(value, null, 2);

/** Base64 of a UTF-8 string (Cursor's install link carries its config this way). */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const MCP_CLIENTS: McpClient[] = [
  {
    id: "claude",
    name: "Claude Code",
    color: "#D97757",
    intro: "Run this once in a terminal. --scope user makes Backline available in every project.",
    snippets: (url, token) => [
      {
        label: "Terminal",
        code: `claude mcp add --transport http --scope user backline ${url} --header "Authorization: ${bearer(token)}"`,
      },
    ],
    after:
      "Run /mcp inside Claude Code to check that backline is connected. Then ask “what's open in Backline?”, or type /mcp__backline__fix_ticket #12 to start on a ticket.",
  },
  {
    id: "cursor",
    name: "Cursor",
    color: "#14141A",
    intro: "Use the install button, or add this to ~/.cursor/mcp.json (every project) or .cursor/mcp.json (one project).",
    snippets: (url, token) => [
      {
        label: "mcp.json",
        code: json({ mcpServers: { backline: { url, headers: { Authorization: bearer(token) } } } }),
      },
    ],
    install: {
      label: "Add to Cursor",
      href: (url, token) =>
        `cursor://anysphere.cursor-deeplink/mcp/install?name=backline&config=${encodeURIComponent(
          base64(JSON.stringify({ url, headers: { Authorization: bearer(token) } })),
        )}`,
    },
    after: "Open Cursor Settings → MCP to check backline shows a green dot, then ask the agent about your Backline tickets.",
  },
  {
    id: "codex",
    name: "Codex",
    color: "#10A37F",
    intro: "Add the server to ~/.codex/config.toml, and keep the token in an environment variable Codex reads.",
    snippets: (url, token) => [
      {
        label: "~/.codex/config.toml",
        code: `[mcp_servers.backline]\nurl = "${url}"\nbearer_token_env_var = "BACKLINE_MCP_TOKEN"`,
      },
      {
        label: "Shell (macOS/Linux - add to your shell profile)",
        code: `export BACKLINE_MCP_TOKEN="${token}"`,
      },
      {
        label: "PowerShell (Windows - then open a new terminal)",
        code: `setx BACKLINE_MCP_TOKEN "${token}"`,
      },
    ],
    after: "Start codex and run /mcp to check backline is listed.",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    color: "#4F46E5",
    intro: "In the Agent panel open ⋯ → MCP Servers → Manage MCP Servers → View raw config, and add this to mcp_config.json.",
    snippets: (url, token) => [
      {
        label: "mcp_config.json",
        code: json({ mcpServers: { backline: { serverUrl: url, headers: { Authorization: bearer(token) } } } }),
      },
    ],
    after: "Save, then refresh the MCP servers list - backline's tools appear under it.",
  },
  {
    id: "vscode",
    name: "VS Code",
    color: "#0065A9",
    intro: "For GitHub Copilot's agent mode. Use the install button, or add this to .vscode/mcp.json (or run “MCP: Open User Configuration”).",
    snippets: (url, token) => [
      {
        label: "mcp.json",
        code: json({ servers: { backline: { type: "http", url, headers: { Authorization: bearer(token) } } } }),
      },
    ],
    install: {
      label: "Install in VS Code",
      href: (url, token) =>
        `vscode:mcp/install?${encodeURIComponent(
          JSON.stringify({ name: "backline", type: "http", url, headers: { Authorization: bearer(token) } }),
        )}`,
    },
    after: "Start the server from the mcp.json code lens (or the MCP: List Servers command), then use Copilot Chat in Agent mode.",
  },
  {
    id: "claude_desktop",
    name: "Claude Desktop",
    color: "#C4633F",
    intro:
      "Claude Desktop reaches remote servers through the mcp-remote bridge (needs Node.js). Open Settings → Developer → Edit Config and add this to claude_desktop_config.json.",
    snippets: (url, token) => [
      {
        label: "claude_desktop_config.json",
        code: json({
          mcpServers: {
            backline: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", "Authorization:${BACKLINE_AUTH}"],
              env: { BACKLINE_AUTH: bearer(token) },
            },
          },
        }),
      },
    ],
    after: "Restart Claude Desktop. Backline's tools appear under the tools (hammer) menu in a new chat.",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    color: "#0B8A70",
    intro: "Add this to ~/.codeium/windsurf/mcp_config.json (Windsurf Settings → Cascade → MCP Servers → View raw config).",
    snippets: (url, token) => [
      {
        label: "mcp_config.json",
        code: json({ mcpServers: { backline: { serverUrl: url, headers: { Authorization: bearer(token) } } } }),
      },
    ],
    after: "Press refresh in the MCP servers panel; backline's tools become available to Cascade.",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    color: "#1A73E8",
    intro: "Add this to ~/.gemini/settings.json (or .gemini/settings.json in one project).",
    snippets: (url, token) => [
      {
        label: "settings.json",
        code: json({ mcpServers: { backline: { httpUrl: url, headers: { Authorization: bearer(token) } } } }),
      },
    ],
    after: "Start gemini and run /mcp to check backline is connected.",
  },
  {
    id: "other",
    name: "Other",
    color: "#2F3437",
    intro: "Any client that supports remote MCP servers over Streamable HTTP with a custom header.",
    snippets: (url, token) => [
      { label: "Server URL", code: url },
      { label: "Header", code: `Authorization: ${bearer(token)}` },
    ],
    after: "Transport: Streamable HTTP (stateless). There's no OAuth flow - the token is the credential.",
  },
];

export const MCP_CLIENT_BY_ID = new Map(MCP_CLIENTS.map((client) => [client.id, client]));

export interface McpToolInfo {
  name: string;
  write: boolean;
  description: string;
}

/** Mirrors backend/app/modules/mcp/server.py - what a connected agent can call. */
export const MCP_TOOLS: McpToolInfo[] = [
  { name: "list_projects", write: false, description: "Projects with their open ticket counts." },
  { name: "list_tickets", write: false, description: "Open tickets, highest priority first; filter by project, status, priority, assignee or text." },
  { name: "get_ticket", write: false, description: "The full thread, page URL, pinned element, screenshot and tracker links for “#12”." },
  { name: "generate_implementation_prompt", write: false, description: "A ready-to-work brief for fixing one ticket." },
  { name: "reply_to_ticket", write: true, description: "Post a reply - team-only by default, client-visible on request." },
  { name: "update_ticket", write: true, description: "Change status (e.g. in review, resolved) or priority." },
  { name: "send_ticket_to_tracker", write: true, description: "File the ticket in a connected Jira, Linear, GitHub… once." },
  { name: "fix_ticket (prompt)", write: false, description: "A prompt/slash command: load a ticket's brief and report back when done." },
];
