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

    // ─── 常量 ──────────────────────────────────────────────────────────────────

    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;

    // 事件签名（keccak256）
    // HealthFactorUpdated(address,uint256,uint256,uint256)
    uint256 private constant HEALTH_FACTOR_UPDATED_TOPIC =
        0x8c0d6b0b6f3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c;

    // Swap(address,address,address,uint256,uint256,uint256)
    uint256 private constant SWAP_TOPIC =
        0x7c0d6b0b6f3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c3e3c;

    uint64 private constant CALLBACK_GAS_LIMIT = 1000000;

    // ─── 状态变量 ──────────────────────────────────────────────────────────────

    // Origin 链合约地址
    address public mockLending;
    address public mockDexA;

    // Destination 链合约地址
    address public liquidationExecutor;
    address public arbitrageExecutor;

    // 策略参数
    uint256 public liquidationHealthFactorThreshold;  // 1.02e18
    uint256 public arbitrageSpreadThreshold;          // 150 (1.5%)

    // 风控
    bool public paused;
    address public owner;

    // ─── 构造函数 ──────────────────────────────────────────────────────────────

    constructor(
        address _mockLending,
        address _mockDexA,
        address _liquidationExecutor,
        address _arbitrageExecutor,
        uint256 _healthFactorThreshold,
        uint256 _spreadThreshold
    ) payable {
        mockLending = _mockLending;
        mockDexA = _mockDexA;
        liquidationExecutor = _liquidationExecutor;
        arbitrageExecutor = _arbitrageExecutor;
        liquidationHealthFactorThreshold = _healthFactorThreshold;
        arbitrageSpreadThreshold = _spreadThreshold;
        owner = msg.sender;
        paused = false;

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
        // event HealthFactorUpdated(address user, uint256 healthFactor, uint256 totalCollateral, uint256 totalDebt)
        address user = address(uint160(log.topic_1));
        (uint256 healthFactor, uint256 totalCollateral, uint256 totalDebt) =
            abi.decode(log.data, (uint256, uint256, uint256));

        // 检查是否满足清算条件
        if (healthFactor >= liquidationHealthFactorThreshold) {
            return; // 健康度正常，不触发
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
        // 解析事件数据
        // event Swap(address user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 newPrice)
        (, , , , , uint256 newPrice) = abi.decode(
            log.data,
            (address, address, address, uint256, uint256, uint256)
        );

        // 简化：假设 Destination 链价格固定为 3050 USDC
        uint256 priceB = 3050e6;
        uint256 spreadPct = _calculateSpread(newPrice, priceB);

        if (spreadPct < arbitrageSpreadThreshold) {
            return; // 价差不足，不触发
        }

        emit ArbitrageTriggered(newPrice, priceB, spreadPct);

        // 触发 Destination 链执行套利
        bytes memory payload = abi.encodeWithSignature(
            "executeArbitrage(address,address,address,address,uint256,uint256)",
            mockDexA,
            address(0), // Destination DEX（需要配置）
            address(0), // tokenIn
            address(0), // tokenOut
            1e18,       // amountIn（示例）
            0           // minProfit
        );

        emit Callback(
            BASE_SEPOLIA_CHAIN_ID,
            arbitrageExecutor,
            CALLBACK_GAS_LIMIT,
            payload
        );
    }

    /**
     * @notice 计算价差（basis points）
     */
    function _calculateSpread(uint256 priceA, uint256 priceB) internal pure returns (uint256) {
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

    function pause() external {
        require(msg.sender == owner, "Only owner");
        paused = true;
    }

    function unpause() external {
        require(msg.sender == owner, "Only owner");
        paused = false;
    }
}
