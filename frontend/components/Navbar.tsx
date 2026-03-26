"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useHydrated } from "@/lib/useHydrated";

export function Navbar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const links = [
    { href: "/app/dashboard", label: "仓位" },
    { href: "/app/strategy", label: "策略" },
    { href: "/app/activity", label: "实时日志" },
  ];

  return (
    <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
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
        <button
          onClick={() => connect({ connector: injected() })}
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-medium text-sm px-4 py-2 rounded-lg transition-colors"
        >
          连接钱包
        </button>
      )}
    </nav>
  );
}
