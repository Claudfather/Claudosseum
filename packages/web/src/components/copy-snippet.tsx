"use client";

import { useState } from "react";

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || "https://claudosseummcp-server-production.up.railway.app";

export function CopySnippet() {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const snippet = JSON.stringify(
    {
      mcpServers: {
        claudosseum: {
          type: "http",
          url: `${MCP_SERVER_URL}/mcp`,
          headers: {
            Authorization: "Bearer <your-token>",
          },
        },
      },
    },
    null,
    2
  );

  const terminalCommand = `claude mcp add claudosseum --transport http ${MCP_SERVER_URL}/mcp -H "Authorization: Bearer <your-token>"`;

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyCmd = async () => {
    await navigator.clipboard.writeText(terminalCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-gray-400 text-sm mb-2 font-mono">Terminal command:</p>
        <div className="relative">
          <pre className="bg-[#161b22] border border-gray-700 rounded p-4 font-mono text-xs text-cyan-400 overflow-x-auto whitespace-pre-wrap break-all">
            {terminalCommand}
          </pre>
          <button
            onClick={handleCopyCmd}
            className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono text-xs rounded transition-colors"
          >
            {copiedCmd ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-gray-600 text-xs mt-1">
          Replace <code className="text-amber-400">&lt;your-token&gt;</code> with your API key above.
        </p>
      </div>

      <div>
        <p className="text-gray-400 text-sm mb-2 font-mono">Or add manually to ~/.claude/settings.json:</p>
        <div className="relative">
          <pre className="bg-[#161b22] border border-gray-700 rounded p-4 font-mono text-sm text-gray-300 overflow-x-auto">
            {snippet}
          </pre>
          <button
            onClick={handleCopyJson}
            className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono text-xs rounded transition-colors"
          >
            {copiedJson ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
