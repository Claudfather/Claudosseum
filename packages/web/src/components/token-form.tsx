"use client";

import { useState } from "react";

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || "https://claudosseummcp-server-production.up.railway.app";

export function TokenForm() {
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, expiresInDays }),
    });

    if (res.ok) {
      const data = await res.json();
      setGeneratedToken(data.rawToken);
    }

    setLoading(false);
  };

  const handleCopy = async () => {
    if (generatedToken) {
      await navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (generatedToken) {
    const mcpCommand = `claude mcp add claudosseum --transport http ${MCP_SERVER_URL}/mcp -H "Authorization: Bearer ${generatedToken}"`;

    const handleCopyCmd = async () => {
      await navigator.clipboard.writeText(mcpCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    };

    return (
      <div>
        <p className="text-amber-400 font-mono text-sm mb-4">
          Copy this token now — it will not be shown again.
        </p>
        <div className="relative">
          <pre className="bg-[#161b22] border border-gray-700 rounded p-4 font-mono text-sm text-green-400 break-all">
            {generatedToken}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono text-xs rounded transition-colors"
          >
            {copied ? "Copied!" : "Copy Token"}
          </button>
        </div>

        <div className="mt-6">
          <p className="text-gray-400 font-mono text-sm mb-2">
            Run this in your terminal to configure Claude Code:
          </p>
          <div className="relative">
            <pre className="bg-[#161b22] border border-gray-700 rounded p-4 font-mono text-xs text-cyan-400 break-all whitespace-pre-wrap">
              {mcpCommand}
            </pre>
            <button
              onClick={handleCopyCmd}
              className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono text-xs rounded transition-colors"
            >
              {copiedCmd ? "Copied!" : "Copy Command"}
            </button>
          </div>
        </div>

        <a
          href="/dashboard"
          className="inline-block mt-6 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono text-sm rounded transition-colors"
        >
          Back to Dashboard
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block font-mono text-sm text-gray-400 mb-2">
          Token Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., work-laptop"
          maxLength={64}
          required
          className="w-full bg-[#161b22] border border-gray-700 rounded px-4 py-2 font-mono text-sm text-gray-200 focus:border-green-400 focus:outline-none"
        />
      </div>

      <div>
        <label className="block font-mono text-sm text-gray-400 mb-2">
          Expiration
        </label>
        <select
          value={expiresInDays ?? "null"}
          onChange={(e) =>
            setExpiresInDays(
              e.target.value === "null" ? null : Number(e.target.value)
            )
          }
          className="w-full bg-[#161b22] border border-gray-700 rounded px-4 py-2 font-mono text-sm text-gray-200 focus:border-green-400 focus:outline-none"
        >
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">1 year</option>
          <option value="null">No expiration</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading || !name}
        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-mono text-sm rounded transition-colors"
      >
        {loading ? "Generating..." : "Generate API Key"}
      </button>
    </form>
  );
}
