// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RCController
 * @notice Reactive Contract 控制器 - 基于 Reactive Network 官方示例适配
 * @dev 部署在 Reactive Network，监听 Origin 链事件并触发 Destination 链执行
 *
 * 参考：https://github.com/Reactive-Network/reactive-smart-contract-demos
 */

// TODO: 安装 Reactive Network SDK
// 方式1: npm install @reactive-network/reactive-lib
// 方式2: 直接从 GitHub 复制接口文件
// import '@reactive-network/reactive-lib/src/interfaces/IReactive.sol';
// import '@reactive-network/reactive-lib/src/abstract-base/AbstractReactive.sol';

/**
 * 临时接口定义（基于官方示例）
 * 正式使用时应该引入官方 SDK
 */

struct LogRecord {
    uint256 chain_id;
    address _contract;
    uint256 topic_0;
    uint256 topic_1;
    uint256 topic_2;
    uint256 topic_3;
    bytes data;
}

interface IReactiveService {
    function subscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;
}

abstract contract AbstractReactive {
    uint256 internal constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;

    IReactiveService internal service;
    bool internal vm;

    constructor() {
        service = IReactiveService(0x0000000000000000000000000000000000fffFfF);
        // vm 变量由 ReactVM 自动设置
    }

    modifier vmOnly() {
        require(vm, "VM only");
        _;
    }

    event Callback(
        uint256 indexed chain_id,
        address indexed _contract,
        uint64 gas_limit,
        bytes payload
    );
}

/**
 * RCController 主合约
 */
contract RCController is AbstractReactive {
    // ─── 事件 ──────────────────────────────────────────────────────────────────

    event LiquidationTriggered(
        address indexed user,
        uint256 healthFactor,
        uint256 debtAmount
    );

    event ArbitrageTriggered(
        uint256 priceA,
        uint256 priceB,
        uint256 spreadPct
    );

    event Subscribed(
        uint256 indexed chainId,
        address indexed contractAddr,
        uint256 indexed topic0
    );

    /// @notice 熔断器触发：连续亏损达到阈值时自动暂停策略
    event CircuitBreakerTriggered(uint256 indexed consecutiveLosses);

    // ─── 常量 ──────────────────────────────────────────────────────────────────

    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;

    // 事件签名（keccak256）
    // HealthFactorUpdated(address,uint256,uint256,uint256)
    uint256 private constant HEALTH_FACTOR_UPDATED_TOPIC =
        0x4ec2e8a3bd69e95166a040594140718c1942ce872ce67baf08738563aadfe9d7;

    // Swap(address,address,address,uint256,uint256,uint256)
    uint256 private constant SWAP_TOPIC =
        0xd6d34547c69c5ee3d2667625c188acf1006abb93e0ee7cf03925c67cf7760413;

    uint64 private constant CALLBACK_GAS_LIMIT = 1000000;

    /// @notice 连续亏损上限，超过后自动触发熔断暂停
    uint256 public constant MAX_CONSECUTIVE_LOSSES = 3;

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    // Origin 链合约地址
    address public mockLending;
    address public mockDexA;

    // Destination 链合约地址
    address public liquidationExecutor;
    address public arbitrageExecutor;
    address public mockDexB;  // Destination 链 DEX（套利卖出端）

    // 策略参数
    uint256 public liquidationHealthFactorThreshold;  // 1.02e18
    uint256 public arbitrageSpreadThreshold;          // 150 (1.5%)

    // 风控
    bool public paused;
    address public owner;

    /// @notice 连续亏损计数，由 owner 通过 recordLoss/recordSuccess 维护
    uint256 public consecutiveLosses;

    /// @notice 触发清算的最小债务值（18 decimals USD），低于此值跳过以避免 gas > 利润
    uint256 public minLiqDebtUSD = 10e18; // 默认 $10

    /// @notice Destination DEX 价格缓存（USDC/ETH，6 decimals）
    /// @dev ReactVM staticcall 跨链读取失败时使用此值作为 fallback，避免差价归零
    uint256 public cachedPriceB;

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(
        address _mockLending,
        address _mockDexA,
        address _liquidationExecutor,
        address _arbitrageExecutor,
        address _mockDexB,
        uint256 _healthFactorThreshold,
        uint256 _spreadThreshold
    ) payable {
        mockLending = _mockLending;
        mockDexA = _mockDexA;
        liquidationExecutor = _liquidationExecutor;
        arbitrageExecutor = _arbitrageExecutor;
        mockDexB = _mockDexB;
        liquidationHealthFactorThreshold = _healthFactorThreshold;
        arbitrageSpreadThreshold = _spreadThreshold;
        owner = msg.sender;
        paused = false;
        consecutiveLosses = 0;

        // 订阅事件（仅在非 ReactVM 模式下）
        if (!vm) {
            // 订阅 MockLending 的 HealthFactorUpdated 事件
            service.subscribe(
                SEPOLIA_CHAIN_ID,
                _mockLending,
                HEALTH_FACTOR_UPDATED_TOPIC,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            emit Subscribed(SEPOLIA_CHAIN_ID, _mockLending, HEALTH_FACTOR_UPDATED_TOPIC);

            // 订阅 MockDEX 的 Swap 事件
            service.subscribe(
                SEPOLIA_CHAIN_ID,
                _mockDexA,
                SWAP_TOPIC,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            emit Subscribed(SEPOLIA_CHAIN_ID, _mockDexA, SWAP_TOPIC);
        }
    }

    // ─── 核心逻辑：事件回调 ────────────────────────────────────────────────────

    /**
     * @notice Reactive Network 回调函数（当订阅的事件触发时自动调用）
     * @param log 事件日志记录
     */
    function react(LogRecord calldata log) external vmOnly {
        require(!paused, "Paused");

        // 判断是哪个合约的事件
        if (log._contract == mockLending) {
            _handleHealthFactorUpdate(log);
        } else if (log._contract == mockDexA) {
            _handleSwapEvent(log);
        }
    }

    /**
     * @notice 处理 HealthFactorUpdated 事件
     */
    function _handleHealthFactorUpdate(LogRecord calldata log) internal {
        // 解析事件数据
        // event HealthFactorUpdated(address indexed user, uint256 healthFactor, uint256 totalCollateral, uint256 totalDebt)
        // indexed 字段在 topics 中，data 只含三个 uint256
        address user = address(uint160(log.topic_1));
        (uint256 healthFactor, , uint256 totalDebt) =
            abi.decode(log.data, (uint256, uint256, uint256));

        // 检查是否满足清算条件
        if (healthFactor >= liquidationHealthFactorThreshold) {
            return; // 健康度正常，不触发
        }

        // Gas 成本检查：债务过小时跳过，避免 gas > 利润
        // totalDebt 为 18 decimals USD 格式，minLiqDebtUSD 同单位
        if (totalDebt < minLiqDebtUSD) {
            return;
        }

        emit LiquidationTriggered(user, healthFactor, totalDebt);

        // 触发 Destination 链执行清算
        bytes memory payload = abi.encodeWithSignature(
            "executeLiquidation(uint256,address,address,uint256)",
            SEPOLIA_CHAIN_ID,
            mockLending,
            user,
            totalDebt
        );

        emit Callback(
            BASE_SEPOLIA_CHAIN_ID,
            liquidationExecutor,
            CALLBACK_GAS_LIMIT,
            payload
        );
    }

    /**
     * @notice 处理 Swap 事件
     */
    function _handleSwapEvent(LogRecord calldata log) internal {
        // event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut,
        //            uint256 amountIn, uint256 amountOut, uint256 newPrice)
        // indexed 字段在 topics 中，data 只含三个 uint256
        (, , uint256 newPrice) = abi.decode(log.data, (uint256, uint256, uint256));

        // 优先使用管理员缓存的 DexB 价格，再尝试 staticcall 实时覆盖
        // 避免 staticcall 跨链失败时 priceB = newPrice 导致差价归零
        uint256 priceB = cachedPriceB;
        (bool ok, bytes memory ret) = mockDexB.staticcall(
            abi.encodeWithSignature("getPrice()")
        );
        if (ok && ret.length == 32) {
            priceB = abi.decode(ret, (uint256));
        }
        if (priceB == 0) return; // 无价格信息，跳过

        uint256 spreadPct = _calculateSpread(newPrice, priceB);

        if (spreadPct < arbitrageSpreadThreshold) {
            return; // 价差不足，不触发
        }

        // Gas 成本检查：预期利润必须超过 gas 估算
        uint256 amountIn = 1e16; // 0.01 ETH（保守仓位，节省测试资金）
        uint256 expectedProfitWei = (amountIn * spreadPct) / 10000;
        uint256 gasEstimateWei = uint256(CALLBACK_GAS_LIMIT) * tx.gasprice;
        if (expectedProfitWei <= gasEstimateWei) {
            return; // gas 成本超过预期利润，不触发
        }

        emit ArbitrageTriggered(newPrice, priceB, spreadPct);

        // 根据价格方向确定套利方向
        // newPrice  = Origin DEX 当前价格（USDC per ETH）
        // priceB    = Destination DEX 当前价格
        address tokenIn;
        address tokenOut;
        if (newPrice <= priceB) {
            // Origin DEX 更便宜：Executor 在 Destination DEX（高价）卖出 ETH 换 USDC
            tokenIn = address(0);   // ETH
            tokenOut = address(1);  // USDC
        } else {
            // Destination DEX 更便宜：Executor 在 Destination DEX（低价）买入 ETH
            tokenIn = address(1);   // USDC
            tokenOut = address(0);  // ETH
        }

        uint256 minProfit = (amountIn * arbitrageSpreadThreshold) / 20000; // 50% 价差作为最低利润

        bytes memory payload = abi.encodeWithSignature(
            "executeArbitrage(address,address,address,address,uint256,uint256)",
            mockDexA,
            mockDexB,
            tokenIn,
            tokenOut,
            amountIn,
            minProfit
        );

        emit Callback(
            BASE_SEPOLIA_CHAIN_ID,
            arbitrageExecutor,
            CALLBACK_GAS_LIMIT,
            payload
        );
    }

    /**
     * @notice 计算价差（basis points，1% = 100）
     */
    function _calculateSpread(uint256 priceA, uint256 priceB) internal pure returns (uint256) {
        if (priceA == 0 || priceB == 0) {
            return 0;
        }

        if (priceA > priceB) {
            return ((priceA - priceB) * 10000) / priceB;
        } else {
            return ((priceB - priceA) * 10000) / priceA;
        }
    }

    // ─── 管理员功能 ────────────────────────────────────────────────────────────

    function updateThresholds(
        uint256 newHealthFactorThreshold,
        uint256 newSpreadThreshold
    ) external {
        require(msg.sender == owner, "Only owner");
        liquidationHealthFactorThreshold = newHealthFactorThreshold;
        arbitrageSpreadThreshold = newSpreadThreshold;
    }

    function updateExecutors(
        address newLiquidationExecutor,
        address newArbitrageExecutor
    ) external {
        require(msg.sender == owner, "Only owner");
        liquidationExecutor = newLiquidationExecutor;
        arbitrageExecutor = newArbitrageExecutor;
    }

    function updateMockDexB(address newMockDexB) external {
        require(msg.sender == owner, "Only owner");
        mockDexB = newMockDexB;
    }

    function pause() external {
        require(msg.sender == owner, "Only owner");
        paused = true;
    }

    function unpause() external {
        require(msg.sender == owner, "Only owner");
        paused = false;
    }

    // ─── 熔断机制（Circuit Breaker）────────────────────────────────────────────

    /**
     * @notice 记录一次执行亏损。
     * @dev 由 owner 根据链下监控结果调用（监控 Destination 链 Executor 的失败事件）。
     *      连续亏损达到 MAX_CONSECUTIVE_LOSSES 时自动暂停策略。
     */
    function recordLoss() external {
        require(msg.sender == owner, "Only owner");
        consecutiveLosses++;
        if (consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
            paused = true;
            emit CircuitBreakerTriggered(consecutiveLosses);
        }
    }

    /**
     * @notice 记录一次执行成功，重置连续亏损计数。
     */
    function recordSuccess() external {
        require(msg.sender == owner, "Only owner");
        consecutiveLosses = 0;
    }

    /**
     * @notice 手动重置熔断器并恢复运行。
     * @dev 在排查根因并确认安全后调用。
     */
    function resetCircuitBreaker() external {
        require(msg.sender == owner, "Only owner");
        consecutiveLosses = 0;
        paused = false;
    }

    /**
     * @notice 更新清算最小债务门槛（用于 gas 成本保护）。
     * @param newMinDebtUSD 新的最小债务值（18 decimals USD 格式）
     */
    function updateMinLiqDebt(uint256 newMinDebtUSD) external {
        require(msg.sender == owner, "Only owner");
        minLiqDebtUSD = newMinDebtUSD;
    }

    /**
     * @notice 更新 Destination DEX 价格缓存（USDC/ETH，6 decimals）
     * @dev 部署后由脚本调用，设置 DexB 的参考价格，确保套利差价计算正确
     * @param price 新的价格，例如 3050e6 表示 3050 USDC/ETH
     */
    function updateCachedPriceB(uint256 price) external {
        require(msg.sender == owner, "Only owner");
        cachedPriceB = price;
    }
}
