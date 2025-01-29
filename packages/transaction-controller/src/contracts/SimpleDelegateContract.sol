// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract SimpleDelegateContract {
    struct Call {
        bytes data;
        address to;
        uint256 value;
    }

    event Executed(address indexed to, uint256 value, bytes data);

    function execute(Call[] memory calls) external payable {
        for (uint256 i = 0; i < calls.length; i++) {
            Call memory call = calls[i];
            (bool success,) = call.to.call{value: call.value}(call.data);
            require(success, "Call failed");
            emit Executed(call.to, call.value, call.data);
        }
    }

    receive() external payable {}
}