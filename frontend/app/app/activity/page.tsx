"use client";

import { useEffect, useState, useCallback } from "react";
import { usePublicClient, useAccount } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, destinationChain, APP_ENV } from "@/lib/wagmi";
import { USER_VAULT_ABI } from "@/lib/abi";
import { Navbar } from "@/components/Navbar";

type LogEntry = {
  id: string;
  type: "execution" | "deposit" | "withdraw" | "paused";
  user: string;
  strategyType?: string;
  success?: boolean;
  profit?: bigint;
  loss?: bigint;
  amount?: bigint;
  fee?: bigint;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
};

// localStorage key（按链+合约地址区分，避免不同环境混用）
function getCacheKey(chainId: number, vault: string) {
  return `activity_logs_${chainId}_${vault.toLowerCase()}`;
}

function serializeLogs(logs: LogEntry[]): string {
  return JSON.stringify(logs.map((l) => ({
    ...l,
    profit: l.profit?.toString(),
    loss: l.loss?.toString(),
    amount: l.amount?.toString(),
    fee: l.fee?.toString(),
  })));
}

function deserializeLogs(raw: string): LogEntry[] {
  try {
    const arr = JSON.parse(raw);
    return arr.map((l: any) => ({
      ...l,
      profit: l.profit != null ? BigInt(l.profit) : undefined,
      loss: l.loss != null ? BigInt(l.loss) : undefined,
      amount: l.amount != null ? BigInt(l.amount) : undefined,
      fee: l.fee != null ? BigInt(l.fee) : undefined,
    }));
  } catch {
    return [];
  }
}

function saveLogs(chainId: number, vault: string, logs: LogEntry[]) {
  try {
    localStorage.setItem(getCacheKey(chainId, vault), serializeLogs(logs.slice(0, 200)));
  } catch {}
}

function loadLogs(chainId: number, vault: string): LogEntry[] {
  try {
    const raw = localStorage.getItem(getCacheKey(chainId, vault));
    return raw ? deserializeLogs(raw) : [];
  } catch {
    return [];
  }
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const client = usePublicClient({ chainId: destinationChain.id });
  const { chainId } = useAccount();
  const connected = Boolean(client && CONTRACTS.userVault);
  const vault = CONTRACTS.userVault as string;

  // 合并新日志（去重 + 保持时间倒序）
  const mergeLogs = useCallback((incoming: LogEntry[]) => {
    setLogs((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const fresh = incoming.filter((l) => !existingIds.has(l.id));
      if (fresh.length === 0) return prev;
      const merged = [...fresh, ...prev]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 200);
      saveLogs(destinationChain.id, vault, merged);
      return merged;
    });
  }, [vault]);

  // 启动时从 localStorage 加载缓存
  useEffect(() => {
    if (!vault) return;
    const cached = loadLogs(destinationChain.id, vault);
    if (cached.length > 0) setLogs(cached);
    setLoading(false);
  }, [vault]);

  // 实时监听新事件
  useEffect(() => {
    if (!client || !CONTRACTS.userVault) return;

    const unwatchExecution = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "ExecutionResult",
      onLogs: (newLogs) => {
        mergeLogs(newLogs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          type: "execution" as const,
          user: log.args.user as string,
          strategyType: log.args.strategyType as string,
          success: log.args.success as boolean,
          profit: log.args.profit as bigint,
          loss: log.args.loss as bigint,
          timestamp: Date.now(),
          txHash: log.transactionHash ?? undefined,
          blockNumber: Number(log.blockNumber),
        })));
      },
    });

    const unwatchDeposit = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "Deposited",
      onLogs: (newLogs) => {
        mergeLogs(newLogs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          type: "deposit" as const,
          user: log.args.user as string,
          amount: log.args.amount as bigint,
          timestamp: Date.now(),
          txHash: log.transactionHash ?? undefined,
          blockNumber: Number(log.blockNumber),
        })));
      },
    });

    const unwatchWithdraw = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "Withdrawn",
      onLogs: (newLogs) => {
        mergeLogs(newLogs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          type: "withdraw" as const,
          user: log.args.user as string,
          amount: log.args.amount as bigint,
          fee: log.args.fee as bigint,
          timestamp: Date.now(),
          txHash: log.transactionHash ?? undefined,
          blockNumber: Number(log.blockNumber),
        })));
      },
    });

    const unwatchPaused = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "StrategyPaused",
      onLogs: (newLogs) => {
        mergeLogs(newLogs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          type: "paused" as const,
          user: log.args.user as string,
          timestamp: Date.now(),
          txHash: log.transactionHash ?? undefined,
          blockNumber: Number(log.blockNumber),
        })));
      },
    });

    return () => {
      unwatchExecution();
      unwatchDeposit();
      unwatchWithdraw();
      unwatchPaused();
    };
  }, [client, mergeLogs]);

  function handleClear() {
    if (!vault) return;
    localStorage.removeItem(getCacheKey(destinationChain.id, vault));
    setLogs([]);
  }

  return (
    <>
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-10 w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">事件日志</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
              <span className="text-gray-400">{connected ? "监听中" : "未连接"}</span>
            </div>
            {logs.length > 0 && (
              <button
                onClick={handleClear}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                清除历史
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          历史记录保存在本地浏览器，最多保留 200 条。切换设备或清除浏览器数据后会丢失。
        </p>

        {loading ? (
          <div className="text-center text-gray-500 py-20">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="text-center text-gray-500 py-20">
            暂无记录，等待链上事件...
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const shortUser = `${log.user.slice(0, 6)}...${log.user.slice(-4)}`;
  const time = new Date(log.timestamp).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const explorerBase =
    APP_ENV === "local"
      ? ""
      : APP_ENV === "mainnet"
        ? "https://basescan.org/tx"
        : "https://sepolia.basescan.org/tx";

  let icon = "●";
  let color = "text-gray-400";
  let content = "";

  if (log.type === "execution") {
    icon = log.success ? "✓" : "✗";
    color = log.success ? "text-emerald-400" : "text-red-400";
    const strategy = log.strategyType === "liquidation" ? "清算" : "套利";
    if (log.success && log.profit && log.profit > 0n) {
      content = `${strategy}成功 +${formatEther(log.profit).slice(0, 8)} ETH`;
    } else {
      content = `${strategy}失败 -${log.loss ? formatEther(log.loss).slice(0, 8) : "0"} ETH`;
    }
  } else if (log.type === "deposit") {
    icon = "↓";
    color = "text-blue-400";
    content = `存入 ${log.amount ? formatEther(log.amount).slice(0, 8) : "?"} ETH`;
  } else if (log.type === "withdraw") {
    icon = "↑";
    color = "text-yellow-400";
    content = `提取 ${log.amount ? formatEther(log.amount).slice(0, 8) : "?"} ETH（佣金 ${log.fee ? formatEther(log.fee).slice(0, 6) : "0"} ETH）`;
  } else if (log.type === "paused") {
    icon = "⏸";
    color = "text-orange-400";
    content = "策略已暂停";
  }

  return (
    <div className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm">
      <span className={`font-mono font-bold w-4 text-center ${color}`}>{icon}</span>
      <span className="text-gray-500 font-mono text-xs w-36 shrink-0">{time}</span>
      <span className="text-gray-400 font-mono text-xs w-24 shrink-0">{shortUser}</span>
      <span className={`flex-1 ${color}`}>{content}</span>
      {log.txHash && explorerBase && (
        <a
          href={`${explorerBase}/${log.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300 font-mono shrink-0"
        >
          {log.txHash.slice(0, 8)}...
        </a>
      )}
    </div>
  );
}
