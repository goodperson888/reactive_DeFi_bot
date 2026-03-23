// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockDEX
 * @notice 模拟 DEX，用于演示跨链套利场景
 * @dev 部署在 Origin 链和 Destination 链，手动制造价差
 */
contract MockDEX {
    // ─── 事件 ──────────────────────────────────────────────────────────────────

    /// @notice Swap 事件（RC 监听此事件触发套利）
    event Swap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 newPrice  // tokenOut/tokenIn 价格（1e18）
    );

    /// @notice 流动性变化事件
    event LiquidityUpdated(
        address indexed token,
        uint256 reserve,
        uint256 price
    );

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    // 简化模型：只支持 ETH <-> USDC 交易对
    uint256 public ethReserve;   // ETH 储备（wei）
    uint256 public usdcReserve;  // USDC 储备（1e6）

    // 手动设置的价格（方便演示价差）
    uint256 public ethPriceUSDC = 3000e6;  // 1 ETH = 3000 USDC

    address public constant ETH = address(0);
    address public constant USDC = address(1);

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor() payable {
        // 初始流动性（可选）
        if (msg.value > 0) {
            ethReserve = msg.value;
            usdcReserve = (msg.value * ethPriceUSDC) / 1e18;
        }
    }

    // ─── 核心功能 ──────────────────────────────────────────────────────────────

    /// @notice 添加流动性（仅 ETH，简化演示）
    function addLiquidity() external payable {
        ethReserve += msg.value;
        usdcReserve += (msg.value * ethPriceUSDC) / 1e18;
        emit LiquidityUpdated(ETH, ethReserve, ethPriceUSDC);
    }

    /// @notice Swap ETH -> USDC
    function swapETHForUSDC() external payable returns (uint256 amountOut) {
        require(msg.value > 0, "Zero input");

        // 简化定价：固定价格（实际 AMM 用 x*y=k）
        amountOut = (msg.value * ethPriceUSDC) / 1e18;
        require(amountOut <= usdcReserve, "Insufficient liquidity");

        ethReserve += msg.value;
        usdcReserve -= amountOut;

        // 实际应该转 USDC token，这里简化为记录
        emit Swap(msg.sender, ETH, USDC, msg.value, amountOut, ethPriceUSDC);
    }

    /// @notice Swap USDC -> ETH（简化：直接传 USDC 数量）
    function swapUSDCForETH(uint256 usdcAmount) external payable returns (uint256 amountOut) {
        require(usdcAmount > 0, "Zero input");

        amountOut = (usdcAmount * 1e18) / ethPriceUSDC;
        require(amountOut <= ethReserve, "Insufficient liquidity");

        usdcReserve += usdcAmount;
        ethReserve -= amountOut;

        payable(msg.sender).transfer(amountOut);

        emit Swap(msg.sender, USDC, ETH, usdcAmount, amountOut, ethPriceUSDC);
    }

    // ─── 管理员功能（演示用）──────────────────────────────────────────────────

    /// @notice 手动设置价格（制造价差）
    function setPrice(uint256 newPrice) external {
        ethPriceUSDC = newPrice;
        emit LiquidityUpdated(ETH, ethReserve, newPrice);
    }

    // ─── 视图函数 ──────────────────────────────────────────────────────────────

    /// @notice 获取当前价格
    function getPrice() external view returns (uint256) {
        return ethPriceUSDC;
    }

    /// @notice 计算 Swap 输出（不执行）
    function getAmountOut(address tokenIn, uint256 amountIn)
        external
        view
        returns (uint256)
    {
        if (tokenIn == ETH) {
            return (amountIn * ethPriceUSDC) / 1e18;
        } else {
            return (amountIn * 1e18) / ethPriceUSDC;
        }
    }

    // ─── 接收 ETH ──────────────────────────────────────────────────────────────

    receive() external payable {
        ethReserve += msg.value;
    }
}
