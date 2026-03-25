// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDEX {
    function swapETHForUSDC() external payable returns (uint256 amountOut);
    function swapUSDCForETH(uint256 usdcAmount) external payable returns (uint256 amountOut);
    function getPrice() external view returns (uint256);
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256);
}

/**
 * @title ArbitrageExecutor
 * @notice 在 Destination 链执行套利操作
 * @dev 由 RC Controller 跨链调用，真实调用 DEX swap
 */
contract ArbitrageExecutor {
    // ─── 常量 ──────────────────────────────────────────────────────────────────

    address public constant ETH  = address(0);
    address public constant USDC = address(1);

    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event ArbitrageExecuted(
        address indexed dexA,
        address indexed dexB,
        address tokenIn,
        uint256 amountIn,
        uint256 profit
    );

    event ExecutionFailed(
        address indexed dexA,
        address indexed dexB,
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
     * @notice 执行套利（由 RC Controller 跨链调用）
     * @param dexA Origin DEX 地址（价格低，买入端）
     * @param dexB Destination DEX 地址（价格高，卖出端）
     * @param tokenIn 输入代币（ETH=address(0), USDC=address(1)）
     * @param amountIn 输入数量
     * @param minProfit 最小利润要求（wei）
     */
    function executeArbitrage(
        address dexA,
        address dexB,
        address tokenIn,
        address /* tokenOut */,
        uint256 amountIn,
        uint256 minProfit
    ) external onlyRC payable returns (bool success) {
        require(dexA != address(0) && dexB != address(0), "Invalid DEX");
        require(amountIn > 0, "Zero amount");

        if (tokenIn == ETH) {
            // ETH -> USDC on dexB (sell high), then USDC -> ETH on dexA (buy low)
            // 简化为单步：在 dexB 用 ETH 换 USDC，验证价差
            require(address(this).balance >= amountIn, "Insufficient ETH");

            uint256 usdcOut = IDEX(dexB).swapETHForUSDC{value: amountIn}();
            require(usdcOut > 0, "Swap failed");

            // 计算等值 ETH（用 dexA 价格反算）
            uint256 ethEquiv = IDEX(dexA).getAmountOut(USDC, usdcOut);

            if (ethEquiv <= amountIn) {
                emit ExecutionFailed(dexA, dexB, "No profit after swap");
                return false;
            }

            uint256 profit = ethEquiv - amountIn;
            if (profit < minProfit) {
                emit ExecutionFailed(dexA, dexB, "Profit below threshold");
                return false;
            }

            totalProfit += profit;
            executionCount++;
            emit ArbitrageExecuted(dexA, dexB, tokenIn, amountIn, profit);

        } else {
            // USDC -> ETH 方向（tokenIn == USDC）
            uint256 ethOut = IDEX(dexB).swapUSDCForETH(amountIn);
            require(ethOut > 0, "Swap failed");

            uint256 usdcEquiv = IDEX(dexA).getAmountOut(ETH, ethOut);

            if (usdcEquiv <= amountIn) {
                emit ExecutionFailed(dexA, dexB, "No profit after swap");
                return false;
            }

            uint256 profit = usdcEquiv - amountIn;
            if (profit < minProfit) {
                emit ExecutionFailed(dexA, dexB, "Profit below threshold");
                return false;
            }

            totalProfit += profit;
            executionCount++;
            emit ArbitrageExecuted(dexA, dexB, tokenIn, amountIn, profit);
        }

        return true;
    }

    // ─── 管理员功能 ────────────────────────────────────────────────────────────

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
