import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center">
        <div className="max-w-2xl">
          <div className="inline-block bg-emerald-500/10 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-6 border border-emerald-500/20">
            Powered by Reactive Network
          </div>
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            链上自动化<br />
            <span className="text-emerald-400">清算 &amp; 套利</span>
          </h1>
          <p className="text-gray-400 text-lg mb-10 leading-relaxed">
            存入资金，设置策略，程序自动监听链上机会并执行。
            每个用户独立 RC 合约，互不干扰，提款时才收取利润佣金。
          </p>

          <div className="flex gap-4 justify-center mb-16">
            <Link
              href="/app/dashboard"
              className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              开始使用
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-6 text-left">
            {[
              { title: "独立 RC", desc: "每个用户部署独立 Reactive Contract，策略参数完全隔离" },
              { title: "按量付费", desc: "RC gas 按实际触发次数消耗，退出时退回剩余 ETH" },
              { title: "提款抽佣", desc: "只在提款时收取利润的 20%，不赚钱不收费" },
            ].map((item) => (
              <div key={item.title} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="text-emerald-400 font-semibold mb-2">{item.title}</div>
                <div className="text-gray-400 text-sm leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
