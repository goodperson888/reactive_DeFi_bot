// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ArbitrageExecutor
 * @notice Executes arbitrage actions on the destination chain.
 * @dev `totalProfit` tracks simulated strategy profit, while
 *      `withdrawableBalance` tracks actual native-token funds received by the contract.
 */
contract ArbitrageExecutor {
    event ArbitrageExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 profit,
        address indexed executor
    );

    event ExecutionFailed(address indexed dexA, address indexed dexB, string reason);

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

    function executeArbitrage(
        address dexA,
        address dexB,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minProfit
    ) external onlyRC returns (bool success) {
        dexA;
        dexB;

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

    function withdrawProfit() external {
        require(msg.sender == vault || msg.sender == rcController, "Unauthorized");

        uint256 amount = withdrawableBalance;
        if (amount == 0) return;

        withdrawableBalance = 0;
        payable(vault).transfer(amount);
    }

    function _simulateArbitrage(uint256 amountIn) internal pure returns (uint256) {
        return (amountIn * 15) / 1000;
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
