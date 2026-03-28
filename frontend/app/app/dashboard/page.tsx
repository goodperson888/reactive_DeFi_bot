"use client";

import { useState } from "react";
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useBalance, useSwitchChain, useConnections,
} from "wagmi";
import { parseEther, formatEther, formatUnits } from "viem";
import { CONTRACTS, destinationChain, reactiveChain, originChain, DEMO_WALLET_ADDRESS } from "@/lib/wagmi";
import { USER_VAULT_ABI, RC_FACTORY_ABI, MOCK_LENDING_ABI } from "@/lib/abi";
import { Navbar } from "@/components/Navbar";
import { useHydrated } from "@/lib/useHydrated";

// RC gas 预算默认值（ETH），约可运行数周
const RC_GAS_DEFAULT = "0.005";

export default function DashboardPage() {
  const hydrated = useHydrated();
  const { address, isConnected, chainId } = useAccount();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawSource, setWithdrawSource] = useState<"base" | "sepolia">("base");
  const [rcGasBudget, setRcGasBudget] = useState(RC_GAS_DEFAULT);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const connections = useConnections();
  // 取当前活跃连接的 connector（就是用户选择的那个，避免 Phantom 劫持）
  const activeConnector = connections[0]?.connector;

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
  const { data: sepoliaWalletBalance } = useBalance({ address, chainId: originChain.id });
  const demoAddress = (DEMO_WALLET_ADDRESS || address || "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const canReadSepoliaPosition = !!CONTRACTS.mockLending && demoAddress !== "0x0000000000000000000000000000000000000000";

  const { data: sepoliaPosition } = useReadContract({
    address: CONTRACTS.mockLending,
    abi: MOCK_LENDING_ABI,
    functionName: "positions",
    args: [demoAddress],
    chainId: originChain.id,
    query: { enabled: canReadSepoliaPosition },
  });

  const { data: sepoliaHealthFactor } = useReadContract({
    address: CONTRACTS.mockLending,
    abi: MOCK_LENDING_ABI,
    functionName: "getHealthFactor",
    args: [demoAddress],
    chainId: originChain.id,
    query: { enabled: canReadSepoliaPosition },
  });

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
  const strategyParams = userInfo ? (userInfo[6] as {
    enableLiquidation: boolean;
    enableArbitrage: boolean;
  }) : null;

  const unrealizedProfit = balance > totalDeposited ? balance - totalDeposited : 0n;
  const estimatedFee = (unrealizedProfit * 2000n) / 10000n;

  // 步骤状态
  const step = !hasDeposit ? 1 : !hasDeployedRC || !hasSyncedRC ? 2 : 3;
  const stepAction = !hasDeposit
    ? "deposit"
    : !hasDeployedRC
      ? "deploy_rc"
      : !hasSyncedRC
        ? "sync_rc"
        : "manage";
  const requiredChain = stepAction === "deploy_rc" ? reactiveChain : destinationChain;
  const isWrongChain = !!address && chainId !== requiredChain.id;
  const isLiquidationOnlyStrategy =
    !!strategyParams &&
    strategyParams.enableLiquidation &&
    !strategyParams.enableArbitrage;

  function switchTo(chainIdTarget: number) {
    switchChain({ chainId: chainIdTarget, connector: activeConnector });
  }

  function handleDeposit() {
    if (!depositAmount) return;
    if (chainId !== destinationChain.id) {
      switchTo(destinationChain.id);
      return;
    }
    writeContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: "deposit",
      chainId: destinationChain.id,
      value: parseEther(depositAmount),
    }, { onSuccess: () => { setDepositAmount(""); refetch(); } });
  }

  function handleDeployRC() {
    if (chainId !== reactiveChain.id) {
      switchTo(reactiveChain.id);
      return;
    }
    writeContract({
      address: CONTRACTS.rcFactory,
      abi: RC_FACTORY_ABI,
      functionName: "deployRC",
      chainId: reactiveChain.id,
      gas: 3_000_000n,
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
    if (chainId !== destinationChain.id) {
      switchTo(destinationChain.id);
      return;
    }
    writeContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: "syncUserRC",
      args: [deployedRcAddress as `0x${string}`],
      chainId: destinationChain.id,
    }, { onSuccess: () => refetch() });
  }

  function handleWithdraw() {
    if (withdrawSource === "sepolia") {
      if (chainId !== originChain.id) {
        switchTo(originChain.id);
      }
      return;
    }

    if (chainId !== destinationChain.id) {
      switchTo(destinationChain.id);
      return;
    }
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
    if (chainId !== destinationChain.id) {
      switchTo(destinationChain.id);
      return;
    }
    // 同步暂停/恢复 UserVault 策略状态
    writeContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: isActive ? "pauseStrategy" : "resumeStrategy",
      chainId: destinationChain.id,
    }, { onSuccess: () => refetch() });
  }

  function handlePauseRC() {
    if (!address) return;
    if (chainId !== reactiveChain.id) {
      switchTo(reactiveChain.id);
      return;
    }
    writeContract({
      address: CONTRACTS.rcFactory,
      abi: RC_FACTORY_ABI,
      functionName: "pauseRC",
      args: [address],
      chainId: reactiveChain.id,
    }, { onSuccess: () => refetchFactoryRcAddress() });
  }

  function handleResumeRC() {
    if (!address) return;
    if (chainId !== reactiveChain.id) {
      switchTo(reactiveChain.id);
      return;
    }
    writeContract({
      address: CONTRACTS.rcFactory,
      abi: RC_FACTORY_ABI,
      functionName: "resumeRC",
      args: [address],
      chainId: reactiveChain.id,
    }, { onSuccess: () => refetchFactoryRcAddress() });
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

        {/* 网络不匹配提示（本地/测试网开发时才会出现，正式网用户默认在正确网络） */}
        {hydrated && isWrongChain && (
          <div className="mb-6 flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
            <span className="text-sm text-yellow-400">
              当前网络不匹配，请切换到 <strong>{requiredChain.name}</strong>（Chain ID: {requiredChain.id}）以完成
              {stepAction === "deploy_rc" ? " RC 部署" : stepAction === "sync_rc" ? " RC 同步" : " Vault 操作"}。
            </span>
            <button
              onClick={() => switchTo(requiredChain.id)}
              disabled={isSwitching}
              className="ml-4 text-sm bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSwitching ? "切换中..." : `切换到 ${requiredChain.name}`}
            </button>
          </div>
        )}

        {step === 3 && isLiquidationOnlyStrategy && (
          <div className="mb-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
            当前策略为“自动清算”模式：清算事件源在 Sepolia。套利已关闭，不影响后续再开启套利策略。
          </div>
        )}

        {/* 双账本概览（短期止血版） */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">Base 账本（Vault）</div>
            <div className="text-sm text-gray-200">可提取余额：{formatEther(balance).slice(0, 10)} ETH</div>
            <div className="text-xs text-gray-500 mt-1">收益显示与合约提款均在 Base Vault</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-400 mb-1">Sepolia 账本（清算执行）</div>
            <div className="text-sm text-gray-200">
              钱包余额：{sepoliaWalletBalance ? `${parseFloat(formatEther(sepoliaWalletBalance.value)).toFixed(6)} ETH` : "—"}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              HF：{sepoliaHealthFactor ? formatUnits(sepoliaHealthFactor as bigint, 18).slice(0, 8) : "—"} ·
              债务：{sepoliaPosition ? `${(Number((sepoliaPosition as [bigint, bigint])[1]) / 1e6).toFixed(2)} USDC` : "—"}
            </div>
          </div>
        </div>

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

        {/* 错误提示 */}
        {writeError && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 break-all">
            {(writeError as any)?.shortMessage || writeError.message}
          </div>
        )}

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
                      disabled={isPending || isConfirming || chainId !== reactiveChain.id}
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
                      disabled={isPending || isConfirming || chainId !== destinationChain.id}
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

              {/* RC gas 剩余 */}
              <div className="bg-gray-800 rounded-lg px-3 py-2 mb-4 flex justify-between text-xs">
                <span className="text-gray-400">RC gas 剩余</span>
                <span className="font-mono text-yellow-400">
                  {rcBalance ? `${formatEther(rcBalance as bigint).slice(0, 8)} ETH` : "—"}
                </span>
              </div>

              {/* 余额为 0 警告 */}
              {balance === 0n && totalDeposited > 0n && (
                <div className="mb-4 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-xs text-orange-400">
                  余额为 0，策略无法执行。请追加存款或提款退出。
                </div>
              )}

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

              {/* RC 暂停/恢复（Reactive 链操作） */}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handlePauseRC}
                  disabled={isPending || isConfirming}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50 transition-colors"
                >
                  暂停 RC
                </button>
                <button
                  onClick={handleResumeRC}
                  disabled={isPending || isConfirming}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50 transition-colors"
                >
                  恢复 RC
                </button>
              </div>
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
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => setWithdrawSource("base")}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      withdrawSource === "base"
                        ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                        : "border-gray-700 bg-gray-800 text-gray-400"
                    }`}
                  >
                    Base Vault 提款
                  </button>
                  <button
                    onClick={() => setWithdrawSource("sepolia")}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      withdrawSource === "sepolia"
                        ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                        : "border-gray-700 bg-gray-800 text-gray-400"
                    }`}
                  >
                    Sepolia 钱包提现
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder={withdrawSource === "base" ? "0.0 ETH（留空=全部）" : "Sepolia 钱包提现请在钱包中发起转账"}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    disabled={withdrawSource === "sepolia"}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-60"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={
                      (withdrawSource === "base" && (balance === 0n || isPending || isConfirming || isActive)) ||
                      (withdrawSource === "sepolia" && isSwitching)
                    }
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    {withdrawSource === "base"
                      ? (isPending || isConfirming ? "确认中..." : "提取")
                      : `切换到 ${originChain.name}`}
                  </button>
                </div>
                {withdrawSource === "base" && isActive && (
                  <p className="text-xs text-yellow-500 mt-2">请先暂停策略再提款</p>
                )}
                {withdrawSource === "sepolia" && (
                  <p className="text-xs text-cyan-300 mt-2">
                    Sepolia 清算收益在钱包余额中，当前不经过 Base Vault 合约提款。
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
