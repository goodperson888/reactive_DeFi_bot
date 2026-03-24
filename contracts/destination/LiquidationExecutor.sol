// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LiquidationExecutor
 * @notice Executes liquidation actions on the destination chain.
 * @dev `totalProfit` tracks simulated strategy profit, while
 *      `withdrawableBalance` tracks actual native-token funds received by the contract.
 */
contract LiquidationExecutor {
    event LiquidationExecuted(
        address indexed targetUser,
        uint256 debtRepaid,
        uint256 profit,
        address indexed executor
    );

    event ExecutionFailed(address indexed targetUser, string reason);

    address public rcController;
    address public vault;

    uint256 public totalProfit;
    uint256 public withdrawableBalance;
    uint256 public executionCount;

    modifier onlyRC() {
        require(msg.sender == rcController, "Only RC Controller");
        _;
    }

    constructor(address _rcController, address _vault) {
        rcController = _rcController;
        vault = _vault;
    }

    function executeLiquidation(
        uint256 targetChain,
        address targetContract,
        address targetUser,
        uint256 debtAmount
    ) external onlyRC returns (bool success) {
        targetChain;
        targetContract;

        uint256 profit = (debtAmount * 5) / 100;
        totalProfit += profit;
        executionCount++;

        emit LiquidationExecuted(targetUser, debtAmount, profit, msg.sender);
        return true;
    }

    function withdrawProfit() external {
        require(msg.sender == vault || msg.sender == rcController, "Unauthorized");

        uint256 amount = withdrawableBalance;
        if (amount == 0) return;

        withdrawableBalance = 0;
        payable(vault).transfer(amount);
    }

    function updateRCController(address newController) external {
        require(msg.sender == rcController, "Only current RC");
        rcController = newController;
    }

    function updateVault(address newVault) external {
        require(msg.sender == rcController, "Only RC");
        vault = newVault;
    }

    receive() external payable {
        withdrawableBalance += msg.value;
    }
}
