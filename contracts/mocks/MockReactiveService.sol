// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev 本地开发 Mock：模拟 Reactive Network 系统服务合约
 *      通过 hardhat_setCode 注入到 0x0000000000000000000000000000000000fffFfF
 */
contract MockReactiveService {
    event Subscribed(uint256 chain_id, address _contract, uint256 topic_0);
    event Unsubscribed(uint256 chain_id, address _contract, uint256 topic_0);

    function subscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256, uint256, uint256
    ) external {
        emit Subscribed(chain_id, _contract, topic_0);
    }

    function unsubscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256, uint256, uint256
    ) external {
        emit Unsubscribed(chain_id, _contract, topic_0);
    }
}
