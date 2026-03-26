"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
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
};

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const client = usePublicClient({ chainId: destinationChain.id });
  const connected = Boolean(client && CONTRACTS.userVault);

  useEffect(() => {
    if (!client || !CONTRACTS.userVault) return;

    // 监听 ExecutionResult 事件
    const unwatchExecution = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "ExecutionResult",
      onLogs: (newLogs) => {
        setLogs((prev) => [
          ...newLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "execution" as const,
            user: log.args.user as string,
            strategyType: log.args.strategyType as string,
            success: log.args.success as boolean,
            profit: log.args.profit as bigint,
            loss: log.args.loss as bigint,
            timestamp: Date.now(),
            txHash: log.transactionHash,
          })),
          ...prev,
        ].slice(0, 100));
      },
    });

    // 监听 Deposited 事件
    const unwatchDeposit = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "Deposited",
      onLogs: (newLogs) => {
        setLogs((prev) => [
          ...newLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "deposit" as const,
            user: log.args.user as string,
            amount: log.args.amount as bigint,
            timestamp: Date.now(),
            txHash: log.transactionHash,
          })),
          ...prev,
        ].slice(0, 100));
      },
    });

    // 监听 Withdrawn 事件
    const unwatchWithdraw = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "Withdrawn",
      onLogs: (newLogs) => {
        setLogs((prev) => [
          ...newLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "withdraw" as const,
            user: log.args.user as string,
            amount: log.args.amount as bigint,
            fee: log.args.fee as bigint,
            timestamp: Date.now(),
            txHash: log.transactionHash,
          })),
          ...prev,
        ].slice(0, 100));
      },
    });

    // 监听 StrategyPaused 事件
    const unwatchPaused = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "StrategyPaused",
      onLogs: (newLogs) => {
        setLogs((prev) => [
          ...newLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "paused" as const,
            user: log.args.user as string,
            timestamp: Date.now(),
            txHash: log.transactionHash,
          })),
          ...prev,
        ].slice(0, 100));
      },
    });

    return () => {
      unwatchExecution();
      unwatchDeposit();
      unwatchWithdraw();
      unwatchPaused();
    };
  }, [client]);

  return (
    <>
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-10 w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">实时事件日志</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`} />
            <span className="text-gray-400">{connected ? "监听中" : "未连接"}</span>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-20">
            等待链上事件...
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
  const time = new Date(log.timestamp).toLocaleTimeString("zh-CN");
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
    content = "策略已暂停（连续亏损触发）";
  }

  return (
    <div className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm">
      <span className={`font-mono font-bold w-4 text-center ${color}`}>{icon}</span>
      <span className="text-gray-500 font-mono text-xs w-20">{time}</span>
      <span className="text-gray-400 font-mono text-xs w-24">{shortUser}</span>
      <span className={`flex-1 ${color}`}>{content}</span>
      {log.txHash && explorerBase && (
        <a
          href={`${explorerBase}/${log.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300 font-mono"
        >
          {log.txHash.slice(0, 8)}...
        </a>
      )}
    </div>
  );
}
