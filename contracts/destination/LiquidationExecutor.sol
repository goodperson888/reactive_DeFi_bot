// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LiquidationExecutor
 * @notice Executes destination-chain liquidation actions triggered by RCController.
 * @dev In this mock implementation, execution is modeled locally and does not call source-chain contracts.
 */
contract LiquidationExecutor {
    event LiquidationExecuted(
        address indexed targetUser,
        uint256 debtRepaid,
        uint256 collateralReceived,
        address indexed executor
    );

    event ExecutionFailed(address indexed targetUser, string reason);

    address public rcController;
    address public vault;

    /// @notice 累计模拟利润（单位与 debtAmount 相同，即 USDC 1e6 格式），仅用于统计，不对应真实 ETH
    uint256 public totalProfit;
    uint256 public executionCount;

    modifier onlyRC() {
        require(msg.sender == rcController, "Only RC Controller");
        _;
    }

    constructor(address _rcController, address _vault) {
        rcController = _rcController;
        vault = _vault;
    }

    /**
     * @notice Execute liquidation.
     * @dev Cross-chain state check and trigger decision are already done in RCController.
     *      targetContract/targetChain are kept for payload compatibility.
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

        // Mock execution: 5% liquidation bonus.
        uint256 collateralReceived = (debtAmount * 105) / 100;
        uint256 profit = collateralReceived - debtAmount;

        totalProfit += profit;
        executionCount++;

        emit LiquidationExecuted(targetUser, debtAmount, collateralReceived, msg.sender);
        return true;
    }

    function withdrawProfit() external {
        require(msg.sender == vault || msg.sender == rcController, "Unauthorized");
        uint256 amount = address(this).balance;
        require(amount > 0, "No profit to withdraw");
        // 注意：totalProfit 是 USDC 单位的虚拟记账值，与真实 ETH 余额是独立统计，不在此重置
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
