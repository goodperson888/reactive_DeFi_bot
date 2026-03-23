// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LiquidationExecutor
 * @notice 在 Destination 链执行清算操作
 * @dev 由 RC Controller 跨链调用
 */
contract LiquidationExecutor {
    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event LiquidationExecuted(
        address indexed targetUser,
        uint256 debtRepaid,
        uint256 profit,
        address indexed executor
    );

    event ExecutionFailed(
        address indexed targetUser,
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
     * @notice 执行清算（由 RC Controller 跨链调用）
     * @param targetChain Origin 链 ID
     * @param targetContract 目标借贷合约地址
     * @param targetUser 被清算用户
     * @param debtAmount 清算债务数量
     */
    function executeLiquidation(
        uint256 targetChain,
        address targetContract,
        address targetUser,
        uint256 debtAmount
    ) external onlyRC returns (bool success) {
        // 实际场景：这里会调用跨链桥 + 目标链的借贷协议
        // MVP 演示：简化为记录事件

        // 模拟清算利润计算（5% 奖励）
        uint256 profit = (debtAmount * 5) / 100;

        totalProfit += profit;
        executionCount++;

        emit LiquidationExecuted(targetUser, debtAmount, profit, msg.sender);

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
