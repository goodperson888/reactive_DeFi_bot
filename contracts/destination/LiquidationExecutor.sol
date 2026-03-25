// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILending {
    function liquidate(address user, uint256 debtToCover) external payable;
    function getHealthFactor(address user) external view returns (uint256);
    function positions(address user) external view returns (uint256 collateral, uint256 debt);
}

/**
 * @title LiquidationExecutor
 * @notice 在 Destination 链执行清算操作
 * @dev 由 RC Controller 跨链调用，真实调用借贷协议 liquidate
 */
contract LiquidationExecutor {
    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event LiquidationExecuted(
        address indexed targetUser,
        uint256 debtRepaid,
        uint256 collateralReceived,
        address indexed executor
    );

    event ExecutionFailed(
        address indexed targetUser,
        string reason
    );

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    address public rcController;
    address public vault;

    uint256 public totalProfit;
    uint256 public executionCount;

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
     * @param targetContract 目标借贷合约地址
     * @param targetUser 被清算用户
     * @param debtAmount 清算债务数量
     */
    function executeLiquidation(
        uint256 /* targetChain */,
        address targetContract,
        address targetUser,
        uint256 debtAmount
    ) external onlyRC payable returns (bool success) {
        require(targetContract != address(0), "Invalid lending contract");
        require(targetUser != address(0), "Invalid user");
        require(debtAmount > 0, "Zero debt");

        // 验证用户确实可被清算（健康度 < 1.0）
        uint256 hf = ILending(targetContract).getHealthFactor(targetUser);
        if (hf >= 1e18) {
            emit ExecutionFailed(targetUser, "User not liquidatable");
            return false;
        }

        uint256 balanceBefore = address(this).balance - msg.value;

        // 调用借贷协议执行清算，发送 ETH 用于偿还债务
        // MockLending.liquidate 需要 ETH 来偿还 USDC 债务（简化模型）
        try ILending(targetContract).liquidate{value: msg.value}(targetUser, debtAmount) {
            uint256 collateralReceived = address(this).balance - balanceBefore;
            uint256 profit = collateralReceived > msg.value
                ? collateralReceived - msg.value
                : 0;

            totalProfit += profit;
            executionCount++;

            emit LiquidationExecuted(targetUser, debtAmount, collateralReceived, msg.sender);
            return true;
        } catch Error(string memory reason) {
            emit ExecutionFailed(targetUser, reason);
            return false;
        } catch {
            emit ExecutionFailed(targetUser, "Unknown error");
            return false;
        }
    }

    // ─── 管理员功能 ────────────────────────────────────────────────────────────

    function withdrawProfit() external {
        require(msg.sender == vault || msg.sender == rcController, "Unauthorized");
        uint256 amount = address(this).balance;
        require(amount > 0, "No profit to withdraw");
        totalProfit = 0;
        (bool ok,) = payable(vault).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function updateRCController(address newController) external {
        require(msg.sender == rcController, "Only current RC");
        rcController = newController;
    }

    function updateVault(address newVault) external {
        require(msg.sender == rcController, "Only RC");
        vault = newVault;
    }

    receive() external payable {}
}
