"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, destinationChain, reactiveChain } from "@/lib/wagmi";
import { USER_VAULT_ABI, RC_FACTORY_ABI } from "@/lib/abi";
import { Navbar } from "@/components/Navbar";
import { useHydrated } from "@/lib/useHydrated";

const DEFAULT_PARAMS = {
  healthFactorThreshold: "1.05",
  spreadThreshold: "100",      // basis points, 100 = 1%
  maxPositionPct: "20",
  slippagePct: "2",
  maxGasGwei: "50",
  maxConsecutiveLosses: "3",
  enableLiquidation: true,
  enableArbitrage: true,
};

type StrategyForm = typeof DEFAULT_PARAMS;

type OnChainStrategy = {
  healthFactorThreshold: bigint;
  spreadThreshold: bigint;
  maxPositionPct: bigint;
  slippagePct: bigint;
  maxGasGwei: bigint;
  maxConsecutiveLosses: bigint;
  enableLiquidation: boolean;
  enableArbitrage: boolean;
};

export default function StrategyPage() {
  const hydrated = useHydrated();
  const { address, isConnected } = useAccount();
  const [draftParams, setDraftParams] = useState<StrategyForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [rcSynced, setRcSynced] = useState(false);

  const { writeContract: writeVaultContract, data: vaultTxHash, isPending: isVaultPending } = useWriteContract();
  const { isLoading: isVaultConfirming } = useWaitForTransactionReceipt({ hash: vaultTxHash });
  const { writeContract: writeRCContract, data: rcTxHash, isPending: isRCPending } = useWriteContract();
  const { isLoading: isRCConfirming } = useWaitForTransactionReceipt({ hash: rcTxHash });

  const { data: userInfo } = useReadContract({
    address: CONTRACTS.userVault,
    abi: USER_VAULT_ABI,
    functionName: "getUserInfo",
    args: [address!],
    chainId: destinationChain.id,
    query: { enabled: !!address },
  });

  const { data: rcAddress } = useReadContract({
    address: CONTRACTS.rcFactory,
    abi: RC_FACTORY_ABI,
    functionName: "getRCAddress",
    args: [address!],
    chainId: reactiveChain.id,
    query: { enabled: !!address },
  });

  const chainParams = useMemo<StrategyForm>(() => {
    if (!userInfo?.[6]) return DEFAULT_PARAMS;

    const p = userInfo[6] as OnChainStrategy;

    return {
      healthFactorThreshold: (Number(p.healthFactorThreshold) / 1e18).toFixed(2),
      spreadThreshold: p.spreadThreshold.toString(),
      maxPositionPct: p.maxPositionPct.toString(),
      slippagePct: p.slippagePct.toString(),
      maxGasGwei: p.maxGasGwei.toString(),
      maxConsecutiveLosses: p.maxConsecutiveLosses.toString(),
      enableLiquidation: p.enableLiquidation,
      enableArbitrage: p.enableArbitrage,
    };
  }, [userInfo]);

  const params = draftParams ?? chainParams;
  const hasRC = !!rcAddress && rcAddress !== "0x0000000000000000000000000000000000000000";
  const liquidationOnly = params.enableLiquidation && !params.enableArbitrage;

  const contractParams = {
    healthFactorThreshold: BigInt(Math.round(parseFloat(params.healthFactorThreshold) * 1e18)),
    spreadThreshold: BigInt(params.spreadThreshold),
    maxPositionPct: BigInt(params.maxPositionPct),
    slippagePct: BigInt(params.slippagePct),
    maxGasGwei: BigInt(params.maxGasGwei),
    maxConsecutiveLosses: BigInt(params.maxConsecutiveLosses),
    enableLiquidation: params.enableLiquidation,
    enableArbitrage: params.enableArbitrage,
  };

  function handleSave() {
    writeVaultContract({
      address: CONTRACTS.userVault,
      abi: USER_VAULT_ABI,
      functionName: "updateStrategy",
      args: [contractParams],
      chainId: destinationChain.id,
    }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    });
  }

  function handleSyncRCParams() {
    if (!address) return;
    writeRCContract({
      address: CONTRACTS.rcFactory,
      abi: RC_FACTORY_ABI,
      functionName: "updateParams",
      args: [address, contractParams],
      chainId: reactiveChain.id,
    }, {
      onSuccess: () => { setRcSynced(true); setTimeout(() => setRcSynced(false), 3000); }
    });
  }

  function resetToDefault() {
    setDraftParams(DEFAULT_PARAMS);
  }

  if (!hydrated) {
    return (
      <>
        <Navbar />
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
            <div className="mb-5 h-6 w-28 rounded bg-white/10" />
            <div className="mb-3 h-4 w-full rounded bg-white/5" />
            <div className="h-4 w-5/6 rounded bg-white/5" />
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
      <div className="max-w-2xl mx-auto px-6 py-10 w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold">策略配置</h1>
          <button onClick={resetToDefault} className="text-sm text-gray-400 hover:text-white transition-colors">
            恢复默认
          </button>
        </div>

        <div className="space-y-6">
          {/* 启用模块 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-medium mb-4 text-gray-300">启用策略</h2>
            <div className="flex gap-6">
              {[
                { key: "enableLiquidation", label: "清算策略", desc: "监听借贷健康度，自动清算" },
                { key: "enableArbitrage", label: "套利策略", desc: "监听 DEX 价差，自动套利" },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={params[item.key as keyof typeof params] as boolean}
                    onChange={(e) => setDraftParams({ ...params, [item.key]: e.target.checked })}
                    className="mt-1 accent-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            {liquidationOnly && (
              <p className="mt-4 text-xs text-cyan-300">
                当前仅启用自动清算：事件源链在 Sepolia；套利已关闭，可随时重新开启。
              </p>
            )}
          </div>

          {/* 清算参数 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-medium mb-4 text-gray-300">清算参数</h2>
            <SliderField
              label="健康度触发阈值"
              value={params.healthFactorThreshold}
              min={1.01} max={1.2} step={0.01}
              unit=""
              hint="低于此值触发清算，越低越保守"
              onChange={(v) => setDraftParams({ ...params, healthFactorThreshold: v })}
            />
          </div>

          {/* 套利参数 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-medium mb-4 text-gray-300">套利参数</h2>
            <SliderField
              label="最小价差"
              value={(parseInt(params.spreadThreshold) / 100).toFixed(2)}
              min={0.5} max={5} step={0.1}
              unit="%"
              hint="低于此价差不执行套利"
              onChange={(v) => setDraftParams({ ...params, spreadThreshold: String(Math.round(parseFloat(v) * 100)) })}
            />
          </div>

          {/* 风控参数 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-medium mb-4 text-gray-300">风控参数</h2>
            <div className="space-y-5">
              <SliderField
                label="单次最大仓位"
                value={params.maxPositionPct}
                min={5} max={100} step={5}
                unit="%"
                hint="每次最多使用余额的百分比"
                onChange={(v) => setDraftParams({ ...params, maxPositionPct: v })}
              />
              <SliderField
                label="滑点容忍度"
                value={params.slippagePct}
                min={0.5} max={10} step={0.5}
                unit="%"
                hint="超过此滑点不执行"
                onChange={(v) => setDraftParams({ ...params, slippagePct: v })}
              />
              <SliderField
                label="最大 Gas 价格"
                value={params.maxGasGwei}
                min={10} max={200} step={5}
                unit=" Gwei"
                hint="Gas 超过此价格不执行"
                onChange={(v) => setDraftParams({ ...params, maxGasGwei: v })}
              />
              <SliderField
                label="连续亏损停机阈值"
                value={params.maxConsecutiveLosses}
                min={1} max={10} step={1}
                unit=" 次"
                hint="连续亏损超过此次数自动暂停"
                onChange={(v) => setDraftParams({ ...params, maxConsecutiveLosses: v })}
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isVaultPending || isVaultConfirming}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold py-3 rounded-xl transition-colors"
          >
            {isVaultPending || isVaultConfirming ? "保存中..." : saved ? "Vault 已保存 ✓" : "保存到 Vault"}
          </button>

          {hasRC && (
            <button
              onClick={handleSyncRCParams}
              disabled={isRCPending || isRCConfirming}
              className="w-full border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-300 font-semibold py-3 rounded-xl transition-colors"
            >
              {isRCPending || isRCConfirming ? "同步中..." : rcSynced ? "RC 已同步 ✓" : "同步到 Reactive RC"}
            </button>
          )}

          <p className="text-xs text-gray-500 leading-relaxed">
            策略参数现在分为两份状态：Base Sepolia 上的 Vault 配置，以及 Reactive Network 上已部署 RC 的执行参数。
            如果你已经部署过 RC，保存到 Vault 之后再点一次“同步到 Reactive RC”，两边就会保持一致。
          </p>
        </div>
      </div>
    </>
  );
}

function SliderField({
  label, value, min, max, step, unit, hint, onChange,
}: {
  label: string; value: string; min: number; max: number; step: number;
  unit: string; hint: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm text-gray-300">{label}</label>
        <span className="text-sm font-mono text-emerald-400">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-emerald-500"
      />
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
    </div>
  );
}
