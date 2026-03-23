// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArbitrageExecutor
 * @notice 在 Destination 链执行套利操作
 * @dev 由 RC Controller 跨链调用
 */
contract ArbitrageExecutor {
    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event ArbitrageExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 profit,
        address indexed executor
    );

    event ExecutionFailed(
        address indexed dexA,
        address indexed dexB,
        string reason
    );

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    address public rcController;  // 只有 RC Controller 可以调用
    address public vault;         // 资金池地址

    uint256 public totalProfit;   // 累计利润
    uint256 public executionCount; // 执行次数

    // ─── 修饰符 ────────────────────────────────────────────────────────────────

    modifier onlyRC() {
        require(msg.sender == rcController, "Only RC Controller");
        _;
    }

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(address _rcController, address _vault) {
        rcController = _rcController;
        vault = _vault;
    }

    // ─── 核心功能 ──────────────────────────────────────────────────────────────

    /**
     * @notice 执行套利（由 RC Controller 跨链调用）
     * @param dexA DEX A 地址（买入）
     * @param dexB DEX B 地址（卖出）
     * @param tokenIn 输入代币
     * @param tokenOut 输出代币
     * @param amountIn 输入数量
     * @param minProfit 最小利润要求
     */
    function executeArbitrage(
        address dexA,
        address dexB,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minProfit
    ) external onlyRC returns (bool success) {
        // 实际场景：
        // 1. 在 dexA 买入 tokenOut
        // 2. 在 dexB 卖出 tokenOut
        // 3. 计算利润

        // MVP 演示：简化为模拟计算
        uint256 profit = _simulateArbitrage(amountIn);

        if (profit < minProfit) {
            emit ExecutionFailed(dexA, dexB, "Profit below threshold");
            return false;
        }

        totalProfit += profit;
        executionCount++;

        emit ArbitrageExecuted(tokenIn, tokenOut, amountIn, profit, msg.sender);

        return true;
    }

    /**
     * @notice 提取利润到 Vault
     */
    function withdrawProfit() external {
        require(msg.sender == vault || msg.sender == rcController, "Unauthorized");
        uint256 amount = totalProfit;
        totalProfit = 0;
        payable(vault).transfer(amount);
    }

    // ─── 内部函数 ──────────────────────────────────────────────────────────────

    function _simulateArbitrage(uint256 amountIn) internal pure returns (uint256) {
        // 模拟 1.5% 价差套利
        return (amountIn * 15) / 1000;
    }

    // ─── 管理员功能 ────────────────────────────────────────────────────────────

    function updateRCController(address newController) external {
        require(msg.sender == rcController, "Only current RC");
        rcController = newController;
    }

    function updateVault(address newVault) external {
        require(msg.sender == rcController, "Only RC");
        vault = newVault;
    }

    // ─── 接收 ETH ──────────────────────────────────────────────────────────────

    receive() external payable {}
}
