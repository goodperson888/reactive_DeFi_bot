// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDEX {
    function swapETHForUSDC() external payable returns (uint256 amountOut);
    function swapUSDCForETH(uint256 usdcAmount) external payable returns (uint256 amountOut);
    function getPrice() external view returns (uint256);
}

/**
 * @title ArbitrageExecutor
 * @notice Executes destination-chain arbitrage actions triggered by RCController.
 */
contract ArbitrageExecutor {
    address public constant ETH = address(0);
    address public constant USDC = address(1);

    event ArbitrageExecuted(
        address indexed dexA,
        address indexed dexB,
        address tokenIn,
        uint256 amountIn,
        uint256 profit
    );

    event ExecutionFailed(address indexed dexA, address indexed dexB, string reason);

    address public rcController;
    address public vault;

    /// @notice 累计预期利润（ETH wei 单位，基于 minProfit 记账），与实际 ETH 余额变化为近似关系
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
     * @notice Execute arbitrage on destination chain.
     * @dev Cross-chain signal check is already done in RCController.
     *      dexA is the origin-chain DEX (informational only, cannot be called cross-chain here).
     *      dexB is the destination-chain DEX that this executor interacts with.
     *      tokenIn/tokenOut direction is determined by RCController based on which DEX is cheaper:
     *        - tokenIn=ETH  → Origin is cheaper; sell ETH on dexB at higher price
     *        - tokenIn=USDC → Destination is cheaper; buy ETH on dexB at lower price
     *      profit is recorded as minProfit (ETH wei), which is the minimum expected gain.
     */
    function executeArbitrage(
        address dexA,       // Origin DEX address — passed for event traceability, not called here
        address dexB,       // Destination DEX address — actual swap target
        address tokenIn,
        address /* tokenOut */,
        uint256 amountIn,
        uint256 minProfit
    ) external onlyRC payable returns (bool success) {
        require(dexA != address(0) && dexB != address(0), "Invalid DEX");
        require(amountIn > 0, "Zero amount");

        if (tokenIn == ETH) {
            require(address(this).balance >= amountIn, "Insufficient ETH");

            uint256 usdcOut = IDEX(dexB).swapETHForUSDC{value: amountIn}();
            require(usdcOut > 0, "Swap failed");
            // 利润以 minProfit (wei) 记账，为预期最低收益
            totalProfit += minProfit;
            executionCount++;
            emit ArbitrageExecuted(dexA, dexB, tokenIn, amountIn, minProfit);
        } else {
            uint256 ethOut = IDEX(dexB).swapUSDCForETH(amountIn);
            require(ethOut > 0, "Swap failed");
            totalProfit += minProfit;
            executionCount++;
            emit ArbitrageExecuted(dexA, dexB, tokenIn, amountIn, minProfit);
        }

        return true;
    }

    function withdrawProfit() external {
        require(msg.sender == vault || msg.sender == rcController, "Unauthorized");
        uint256 amount = address(this).balance;
        require(amount > 0, "No balance");
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
