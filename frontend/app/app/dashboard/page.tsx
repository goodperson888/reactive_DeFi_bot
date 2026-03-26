"use client";

import { useState } from "react";
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useBalance,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { CONTRACTS, destinationChain, reactiveChain } from "@/lib/wagmi";
import { USER_VAULT_ABI, RC_FACTORY_ABI } from "@/lib/abi";
import { Navbar } from "@/components/Navbar";
import { useHydrated } from "@/lib/useHydrated";

// RC gas 预算默认值（ETH），约可运行数周
const RC_GAS_DEFAULT = "0.005";

export default function DashboardPage() {
  const hydrated = useHydrated();
  const { address, isConnected } = useAccount();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [rcGasBudget, setRcGasBudget] = useState(RC_GAS_DEFAULT);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: userInfo, refetch } = useReadContract({
    address: CONTRACTS.userVault,
    abi: USER_VAULT_ABI,
    functionName: "getUserInfo",
    args: [address!],
    chainId: destinationChain.id,
    query: { enabled: !!address },
  });

  const { data: rcBalance } = useReadContract({
    address: CONTRACTS.rcFactory,
    abi: RC_FACTORY_ABI,
    functionName: "getRCBalance",
    args: [address!],
    chainId: reactiveChain.id,
    query: { enabled: !!address },
  });

  const { data: factoryRcAddress, refetch: refetchFactoryRcAddress } = useReadContract({
    address: CONTRACTS.rcFactory,
    abi: RC_FACTORY_ABI,
    functionName: "getRCAddress",
    args: [address!],
    chainId: reactiveChain.id,
    query: { enabled: !!address },
  });

  const { data: walletBalance } = useBalance({ address, chainId: destinationChain.id });

  const { data: tvl } = useReadContract({
    address: CONTRACTS.userVault,
    abi: USER_VAULT_ABI,
    functionName: "totalTVL",
    chainId: destinationChain.id,
  });

  const { data: userCount } = useReadContract({
    address: CONTRACTS.userVault,
    abi: USER_VAULT_ABI,
    functionName: "getUserCount",
    chainId: destinationChain.id,
  });

  const balance = userInfo ? userInfo[0] : 0n;
  const totalDeposited = userInfo ? userInfo[1] : 0n;
  const totalProfit = userInfo ? userInfo[2] : 0n;
  const executionCount = userInfo ? userInfo[3] : 0n;
  const isActive = userInfo ? userInfo[4] : false;
  const vaultRcAddress = userInfo ? userInfo[5] as string : null;
  const deployedRcAddress = factoryRcAddress as string | undefined;
  const hasDeployedRC = !!deployedRcAddress && deployedRcAddress !== "0x0000000000000000000000000000000000000000";
  const hasSyncedRC = !!vaultRcAddress && vaultRcAddress !== "0x0000000000000000000000000000000000000000";
  const hasDeposit = totalDeposited > 0n;

  const unrealizedProfit = balance > totalDeposited ? balance - totalDeposited : 0n;
  const estimatedFee = (unrealizedProfit * 2000n) / 10000n;

  // 步骤状态
  const step = !hasDeposit ? 1 : !hasDeployedRC || !hasSyncedRC ? 2 : 3;

  function handleDeposit() {
    if (!depositAmount) return;
    writeContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: "deposit",
      chainId: destinationChain.id,
      value: parseEther(depositAmount),
    }, { onSuccess: () => { setDepositAmount(""); refetch(); } });
  }

  function handleDeployRC() {
    writeContract({
      address: CONTRACTS.rcFactory,
      abi: RC_FACTORY_ABI,
      functionName: "deployRC",
      chainId: reactiveChain.id,
      // 使用 UserVault 里存的默认参数，传空结构体让合约用默认值
      args: [{
        healthFactorThreshold: 105n * 10n ** 16n,
        spreadThreshold: 100n,
        maxPositionPct: 20n,
        slippagePct: 2n,
        maxGasGwei: 50n,
        maxConsecutiveLosses: 3n,
        enableLiquidation: true,
        enableArbitrage: true,
      }],
      value: parseEther(rcGasBudget),
    }, { onSuccess: () => refetchFactoryRcAddress() });
  }

  function handleSyncRC() {
    if (!deployedRcAddress) return;
    writeContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: "syncUserRC",
      args: [deployedRcAddress as `0x${string}`],
      chainId: destinationChain.id,
    }, { onSuccess: () => refetch() });
  }

  function handleWithdraw() {
    const amount = withdrawAmount ? parseEther(withdrawAmount) : 0n;
    writeContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: "withdraw",
      args: [amount],
      chainId: destinationChain.id,
    }, { onSuccess: () => { setWithdrawAmount(""); refetch(); } });
  }

  function handleToggleStrategy() {
    writeContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: isActive ? "pauseStrategy" : "resumeStrategy",
      chainId: destinationChain.id,
    }, { onSuccess: () => refetch() });
  }

  if (!hydrated) {
    return (
      <>
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
            <div className="mb-4 h-6 w-32 rounded bg-white/10" />
            <div className="mb-3 h-4 w-full rounded bg-white/5" />
            <div className="h-4 w-2/3 rounded bg-white/5" />
          </div>
        </div>
      </>
    );
  }

  if (!isConnected) {
    return (
      <>
        <Navbar />
        <div className="flex flex-1 items-center justify-center text-gray-400">请先连接钱包</div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-10 w-full">

        {/* 全局统计 */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "总 TVL", value: tvl ? `${formatEther(tvl as bigint).slice(0, 8)} ETH` : "—" },
            { label: "用户数", value: userCount ? userCount.toString() : "—" },
            { label: "佣金率", value: "20%" },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-gray-400 text-sm mb-1">{s.label}</div>
              <div className="text-2xl font-bold">{s.value}</div>
            </div>
          ))}
        </div>

        {/* 新用户引导：两步流程 */}
        {step < 3 && (
          <div className="mb-8">
            {/* 步骤指示器 */}
            <div className="flex items-center gap-3 mb-6">
              {[
                { n: 1, label: "存款" },
                { n: 2, label: "部署 RC" },
                { n: 3, label: "运行中" },
              ].map(({ n, label }, i) => (
                <div key={n} className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 text-sm ${step === n ? "text-white" : step > n ? "text-emerald-400" : "text-gray-500"}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                      step > n ? "bg-emerald-500 border-emerald-500 text-black" :
                      step === n ? "border-white text-white" : "border-gray-600 text-gray-600"
                    }`}>
                      {step > n ? "✓" : n}
                    </span>
                    {label}
                  </div>
                  {i < 2 && <div className={`w-12 h-px ${step > n ? "bg-emerald-500" : "bg-gray-700"}`} />}
                </div>
              ))}
            </div>

            {/* 步骤 1：存款 */}
            {step === 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold text-lg mb-1">第一步：存入资金</h2>
                <p className="text-gray-400 text-sm mb-5">存入的 ETH 将用于执行清算和套利策略，随时可提取。</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      placeholder="0.0 ETH"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                    {walletBalance && (
                      <p className="text-xs text-gray-500 mt-1">
                        钱包余额：{parseFloat(formatEther(walletBalance.value)).toFixed(4)} ETH
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={!depositAmount || isPending || isConfirming}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
                  >
                    {isPending || isConfirming ? "确认中..." : "存入"}
                  </button>
                </div>
              </div>
            )}

            {/* 步骤 2：部署 RC */}
            {step === 2 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                {!hasDeployedRC ? (
                  <>
                    <h2 className="font-semibold text-lg mb-1">第二步：部署你的 RC 合约</h2>
                    <p className="text-gray-400 text-sm mb-5">
                      这一步会切到 Reactive Network，部署一个属于你的合约，用于监听链上事件并自动执行策略。
                    </p>

                    <div className="bg-gray-800 rounded-lg p-4 mb-5 text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">RC gas 预算</span>
                        <span className="font-mono">{rcGasBudget} ETH</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>预计可运行时长</span>
                        <span>约 {Math.round(parseFloat(rcGasBudget) / 0.0001)} 次触发</span>
                      </div>
                      <div className="border-t border-gray-700 pt-2 flex justify-between font-medium">
                        <span>总支付</span>
                        <span className="text-emerald-400">{rcGasBudget} ETH</span>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="text-sm text-gray-300 block mb-2">
                        调整 gas 预算
                      </label>
                      <input
                        type="range"
                        min={0.001} max={0.05} step={0.001}
                        value={rcGasBudget}
                        onChange={(e) => setRcGasBudget(e.target.value)}
                        className="w-full accent-emerald-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0.001 ETH（省）</span>
                        <span>0.05 ETH（充足）</span>
                      </div>
                    </div>

                    <button
                      onClick={handleDeployRC}
                      disabled={isPending || isConfirming}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold py-3 rounded-lg text-sm transition-colors"
                    >
                      {isPending || isConfirming ? "部署中..." : `部署 RC（Reactive 链，支付 ${rcGasBudget} ETH）`}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="font-semibold text-lg mb-1">第二步：同步 RC 地址到 Vault</h2>
                    <p className="text-gray-400 text-sm mb-5">
                      RC 已经部署完成，还需要把地址同步到 Base Sepolia 上的 Vault，前端面板和策略状态才会完全联通。
                    </p>
                    <div className="bg-gray-800 rounded-lg p-4 mb-5 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400">Reactive RC 地址</span>
                        <span className="font-mono text-xs break-all text-emerald-400">{deployedRcAddress}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleSyncRC}
                      disabled={isPending || isConfirming}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold py-3 rounded-lg text-sm transition-colors"
                    >
                      {isPending || isConfirming ? "同步中..." : "同步 RC 地址到 Vault"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 已有仓位：正常面板 */}
        {step === 3 && (
          <div className="grid grid-cols-2 gap-6">
            {/* 我的仓位 */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-lg">我的仓位</h2>
                <span className={`text-xs px-2 py-1 rounded-full ${isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-700 text-gray-400"}`}>
                  {isActive ? "运行中" : "已暂停"}
                </span>
              </div>

              <div className="space-y-3 mb-5">
                {[
                  { label: "当前余额", value: `${formatEther(balance).slice(0, 10)} ETH` },
                  { label: "存入本金", value: `${formatEther(totalDeposited).slice(0, 10)} ETH` },
                  { label: "未实现利润", value: `+${formatEther(unrealizedProfit).slice(0, 10)} ETH`, green: true },
                  { label: "累计已实现利润", value: `${formatEther(totalProfit).slice(0, 10)} ETH` },
                  { label: "执行次数", value: executionCount.toString() },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-gray-400">{row.label}</span>
                    <span className={row.green ? "text-emerald-400" : ""}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* RC 余额 */}
              <div className="bg-gray-800 rounded-lg px-3 py-2 mb-4 flex justify-between text-xs">
                <span className="text-gray-400">RC gas 剩余</span>
                <span className="font-mono text-yellow-400">
                  {rcBalance ? `${formatEther(rcBalance as bigint).slice(0, 8)} ETH` : "—"}
                </span>
              </div>

              <button
                onClick={handleToggleStrategy}
                disabled={isPending || isConfirming}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                } disabled:opacity-50`}
              >
                {isActive ? "暂停策略" : "启动策略"}
              </button>
            </div>

            {/* 存取款 */}
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold mb-4">追加存款</h2>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="0.0 ETH"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleDeposit}
                    disabled={!depositAmount || isPending || isConfirming}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    {isPending || isConfirming ? "确认中..." : "存入"}
                  </button>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold mb-1">提款</h2>
                {unrealizedProfit > 0n && (
                  <p className="text-xs text-gray-400 mb-4">
                    预计佣金：{formatEther(estimatedFee).slice(0, 8)} ETH（利润的 20%）
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="0.0 ETH（留空=全部）"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={balance === 0n || isPending || isConfirming || isActive}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    {isPending || isConfirming ? "确认中..." : "提取"}
                  </button>
                </div>
                {isActive && (
                  <p className="text-xs text-yellow-500 mt-2">请先暂停策略再提款</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
