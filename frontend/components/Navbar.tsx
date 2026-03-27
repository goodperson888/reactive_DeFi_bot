"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useHydrated } from "@/lib/useHydrated";

export function Navbar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [showPicker, setShowPicker] = useState(false);

  const links = [
    { href: "/app/dashboard", label: "仓位" },
    { href: "/app/strategy", label: "策略" },
    { href: "/app/activity", label: "实时日志" },
  ];

  return (
    <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between relative">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-lg font-bold text-emerald-400">
          ReactiveBot
        </Link>
        <div className="flex gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm transition-colors ${
                pathname.startsWith(l.href)
                  ? "text-white font-medium"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {!hydrated ? (
        <div className="h-9 w-28 rounded-lg border border-gray-800 bg-white/5" />
      ) : isConnected ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 font-mono">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
          <button
            onClick={() => disconnect()}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            断开
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-medium text-sm px-4 py-2 rounded-lg transition-colors"
          >
            连接钱包
          </button>

          {showPicker && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setShowPicker(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-gray-800 transition-colors"
                >
                  {connector.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
