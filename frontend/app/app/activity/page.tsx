"use client";

import { useEffect, useState, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, destinationChain, originChain, APP_ENV } from "@/lib/wagmi";
import { USER_VAULT_ABI, MOCK_LENDING_ABI, MOCK_DEX_ABI } from "@/lib/abi";
import { Navbar } from "@/components/Navbar";

// Alchemy Free tier 对 eth_getLogs 的区块跨度有限制（最多约 10 blocks）。
// 这里按小窗口分段回查，兼顾稳定性与 RPC 免费额度限制。
const EVENT_LOOKBACK_BLOCKS = 64n;
const EVENT_CHUNK_BLOCKS = 8n;

const ETH_TOKEN = "0x0000000000000000000000000000000000000000";
const USDC_TOKEN = "0x0000000000000000000000000000000000000001";

type LogEntry = {
  id: string;
  type: "execution" | "deposit" | "withdraw" | "paused" | "hf_update" | "liquidated" | "dex_swap";
  user: string;
  strategyType?: string;
  success?: boolean;
  profit?: bigint;
  loss?: bigint;
  amount?: bigint;
  fee?: bigint;
  chain?: "Sepolia" | "Base Sepolia";
  note?: string;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
};

// localStorage key（按链+合约地址区分，避免不同环境混用）
function formatSwapContent(
  chain: "Sepolia" | "Base Sepolia",
  tokenIn: string,
  amountIn: bigint,
  tokenOut: string,
  amountOut: bigint
) {
  const inLower = tokenIn.toLowerCase();
  const outLower = tokenOut.toLowerCase();
  if (inLower === ETH_TOKEN && outLower === USDC_TOKEN) {
    return `[${chain}] 套利腿 ETH->USDC ${formatEther(amountIn).slice(0, 10)} ETH -> ${(Number(amountOut) / 1e6).toFixed(2)} USDC`;
  }
  if (inLower === USDC_TOKEN && outLower === ETH_TOKEN) {
    return `[${chain}] 套利腿 USDC->ETH ${(Number(amountIn) / 1e6).toFixed(2)} USDC -> ${formatEther(amountOut).slice(0, 12)} ETH`;
  }
  return `[${chain}] Swap in=${amountIn.toString()} out=${amountOut.toString()}`;
}

async function getContractEventsChunked(
  client: any,
  params: {
    address: `0x${string}`;
    abi: readonly unknown[];
    eventName: string;
  },
  fromBlock: bigint,
  toBlock: bigint
) {
  if (toBlock < fromBlock) return [];
  const logs: any[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const end = cursor + EVENT_CHUNK_BLOCKS - 1n > toBlock ? toBlock : cursor + EVENT_CHUNK_BLOCKS - 1n;
    try {
      const part = await client.getContractEvents({
        ...params,
        fromBlock: cursor,
        toBlock: end,
      });
      logs.push(...part);
    } catch (error) {
      // 单个窗口失败不阻断整页，尽量收集其余窗口数据
      console.error(`[activity] chunk fetch failed ${params.eventName} ${cursor}-${end}`, error);
    }
    cursor = end + 1n;
  }

  return logs;
}

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
  const sepoliaClient = usePublicClient({ chainId: originChain.id });
  const connected = Boolean((client && CONTRACTS.userVault) || (sepoliaClient && CONTRACTS.mockLending));
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

  // 进入页面时回查最近区块事件，避免仅依赖实时监听导致漏显示
  useEffect(() => {
    if (!client || !CONTRACTS.userVault) return;

    let cancelled = false;
    (async () => {
      try {
        const latest = await client.getBlockNumber();
        const fromBlock = latest > EVENT_LOOKBACK_BLOCKS ? latest - EVENT_LOOKBACK_BLOCKS : 0n;

        const [executionLogs, depositLogs, withdrawLogs, pausedLogs, baseSwapLogs] = await Promise.all([
          getContractEventsChunked(
            client,
            { address: CONTRACTS.userVault, abi: USER_VAULT_ABI, eventName: "ExecutionResult" },
            fromBlock,
            latest
          ),
          getContractEventsChunked(
            client,
            { address: CONTRACTS.userVault, abi: USER_VAULT_ABI, eventName: "Deposited" },
            fromBlock,
            latest
          ),
          getContractEventsChunked(
            client,
            { address: CONTRACTS.userVault, abi: USER_VAULT_ABI, eventName: "Withdrawn" },
            fromBlock,
            latest
          ),
          getContractEventsChunked(
            client,
            { address: CONTRACTS.userVault, abi: USER_VAULT_ABI, eventName: "StrategyPaused" },
            fromBlock,
            latest
          ),
          CONTRACTS.mockDexB
            ? getContractEventsChunked(
                client,
                { address: CONTRACTS.mockDexB, abi: MOCK_DEX_ABI, eventName: "Swap" },
                fromBlock,
                latest
              )
            : Promise.resolve([]),
        ]);

        if (cancelled) return;

        mergeLogs([
          ...executionLogs.map((log) => ({
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
          })),
          ...depositLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "deposit" as const,
            user: log.args.user as string,
            amount: log.args.amount as bigint,
            timestamp: Date.now(),
            txHash: log.transactionHash ?? undefined,
            blockNumber: Number(log.blockNumber),
          })),
          ...withdrawLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "withdraw" as const,
            user: log.args.user as string,
            amount: log.args.amount as bigint,
            fee: log.args.fee as bigint,
            timestamp: Date.now(),
            txHash: log.transactionHash ?? undefined,
            blockNumber: Number(log.blockNumber),
          })),
          ...pausedLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "paused" as const,
            user: log.args.user as string,
            timestamp: Date.now(),
            txHash: log.transactionHash ?? undefined,
            blockNumber: Number(log.blockNumber),
          })),
          ...baseSwapLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "dex_swap" as const,
            chain: "Base Sepolia" as const,
            user: log.args.user as string,
            note: formatSwapContent(
              "Base Sepolia",
              log.args.tokenIn as string,
              log.args.amountIn as bigint,
              log.args.tokenOut as string,
              log.args.amountOut as bigint
            ),
            timestamp: Date.now(),
            txHash: log.transactionHash ?? undefined,
            blockNumber: Number(log.blockNumber),
          })),
        ]);
      } catch (error) {
        console.error("[activity] failed to backfill vault events", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, mergeLogs]);

  // 实时监听新事件
  useEffect(() => {
    if (!client || !CONTRACTS.userVault) return;

    const unwatchExecution = client.watchContractEvent({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      eventName: "ExecutionResult",
      poll: true,
      pollingInterval: 4000,
      onError: () => {},
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
      poll: true,
      pollingInterval: 4000,
      onError: () => {},
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
      poll: true,
      pollingInterval: 4000,
      onError: () => {},
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
      poll: true,
      pollingInterval: 4000,
      onError: () => {},
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
    const unwatchBaseSwap = CONTRACTS.mockDexB
      ? client.watchContractEvent({
          address: CONTRACTS.mockDexB,
          abi: MOCK_DEX_ABI,
          eventName: "Swap",
          poll: true,
          pollingInterval: 4000,
          onError: () => {},
          onLogs: (newLogs) => {
            mergeLogs(newLogs.map((log) => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "dex_swap" as const,
              chain: "Base Sepolia" as const,
              user: log.args.user as string,
              note: formatSwapContent(
                "Base Sepolia",
                log.args.tokenIn as string,
                log.args.amountIn as bigint,
                log.args.tokenOut as string,
                log.args.amountOut as bigint
              ),
              timestamp: Date.now(),
              txHash: log.transactionHash ?? undefined,
              blockNumber: Number(log.blockNumber),
            })));
          },
        })
      : () => {};

    return () => {
      unwatchExecution();
      unwatchDeposit();
      unwatchWithdraw();
      unwatchPaused();
      unwatchBaseSwap();
    };
  }, [client, mergeLogs]);

  useEffect(() => {
    if (!sepoliaClient || !CONTRACTS.mockLending) return;

    let cancelled = false;
    (async () => {
      try {
        const latest = await sepoliaClient.getBlockNumber();
        const fromBlock = latest > EVENT_LOOKBACK_BLOCKS ? latest - EVENT_LOOKBACK_BLOCKS : 0n;
        const [hfLogs, liquidatedLogs, sepoliaSwapLogs] = await Promise.all([
          getContractEventsChunked(
            sepoliaClient,
            { address: CONTRACTS.mockLending, abi: MOCK_LENDING_ABI, eventName: "HealthFactorUpdated" },
            fromBlock,
            latest
          ),
          getContractEventsChunked(
            sepoliaClient,
            { address: CONTRACTS.mockLending, abi: MOCK_LENDING_ABI, eventName: "Liquidated" },
            fromBlock,
            latest
          ),
          CONTRACTS.mockDexA
            ? getContractEventsChunked(
                sepoliaClient,
                { address: CONTRACTS.mockDexA, abi: MOCK_DEX_ABI, eventName: "Swap" },
                fromBlock,
                latest
              )
            : Promise.resolve([]),
        ]);

        if (cancelled) return;

        mergeLogs([
          ...hfLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "hf_update" as const,
            chain: "Sepolia" as const,
            user: log.args.user as string,
            note: `HF=${(Number(log.args.healthFactor) / 1e18).toFixed(4)}`,
            timestamp: Date.now(),
            txHash: log.transactionHash ?? undefined,
            blockNumber: Number(log.blockNumber),
          })),
          ...liquidatedLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "liquidated" as const,
            chain: "Sepolia" as const,
            user: log.args.user as string,
            amount: log.args.collateralSeized as bigint,
            note: `debt=${(Number(log.args.debtRepaid) / 1e6).toFixed(2)} USDC`,
            timestamp: Date.now(),
            txHash: log.transactionHash ?? undefined,
            blockNumber: Number(log.blockNumber),
          })),
          ...sepoliaSwapLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            type: "dex_swap" as const,
            chain: "Sepolia" as const,
            user: log.args.user as string,
            note: formatSwapContent(
              "Sepolia",
              log.args.tokenIn as string,
              log.args.amountIn as bigint,
              log.args.tokenOut as string,
              log.args.amountOut as bigint
            ),
            timestamp: Date.now(),
            txHash: log.transactionHash ?? undefined,
            blockNumber: Number(log.blockNumber),
          })),
        ]);
      } catch (error) {
        console.error("[activity] failed to backfill sepolia events", error);
      }
    })();

    const unwatchHF = sepoliaClient.watchContractEvent({
      address: CONTRACTS.mockLending,
      abi: MOCK_LENDING_ABI,
      eventName: "HealthFactorUpdated",
      poll: true,
      pollingInterval: 4000,
      onError: () => {},
      onLogs: (newLogs) => {
        mergeLogs(newLogs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          type: "hf_update" as const,
          chain: "Sepolia",
          user: log.args.user as string,
          note: `HF=${(Number(log.args.healthFactor) / 1e18).toFixed(4)}`,
          timestamp: Date.now(),
          txHash: log.transactionHash ?? undefined,
          blockNumber: Number(log.blockNumber),
        })));
      },
    });

    const unwatchLiquidated = sepoliaClient.watchContractEvent({
      address: CONTRACTS.mockLending,
      abi: MOCK_LENDING_ABI,
      eventName: "Liquidated",
      poll: true,
      pollingInterval: 4000,
      onError: () => {},
      onLogs: (newLogs) => {
        mergeLogs(newLogs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          type: "liquidated" as const,
          chain: "Sepolia",
          user: log.args.user as string,
          amount: log.args.collateralSeized as bigint,
          note: `debt=${(Number(log.args.debtRepaid) / 1e6).toFixed(2)} USDC`,
          timestamp: Date.now(),
          txHash: log.transactionHash ?? undefined,
          blockNumber: Number(log.blockNumber),
        })));
      },
    });
    const unwatchSepoliaSwap = CONTRACTS.mockDexA
      ? sepoliaClient.watchContractEvent({
          address: CONTRACTS.mockDexA,
          abi: MOCK_DEX_ABI,
          eventName: "Swap",
          poll: true,
          pollingInterval: 4000,
          onError: () => {},
          onLogs: (newLogs) => {
            mergeLogs(newLogs.map((log) => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "dex_swap" as const,
              chain: "Sepolia" as const,
              user: log.args.user as string,
              note: formatSwapContent(
                "Sepolia",
                log.args.tokenIn as string,
                log.args.amountIn as bigint,
                log.args.tokenOut as string,
                log.args.amountOut as bigint
              ),
              timestamp: Date.now(),
              txHash: log.transactionHash ?? undefined,
              blockNumber: Number(log.blockNumber),
            })));
          },
        })
      : () => {};

    return () => {
      cancelled = true;
      unwatchHF();
      unwatchLiquidated();
      unwatchSepoliaSwap();
    };
  }, [mergeLogs, sepoliaClient]);

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
  } else if (log.type === "hf_update") {
    icon = "!";
    color = "text-cyan-300";
    content = `[Sepolia] 健康度更新 ${log.note || ""}`;
  } else if (log.type === "liquidated") {
    icon = "✂";
    color = "text-red-400";
    content = `[Sepolia] 清算完成 ${log.note || ""} 抵押扣押 ${log.amount ? formatEther(log.amount).slice(0, 8) : "?"} ETH`;
  } else if (log.type === "dex_swap") {
    icon = "↔";
    color = "text-indigo-300";
    content = log.note || "Swap";
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
