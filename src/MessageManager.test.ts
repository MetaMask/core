import MessageManager from './MessageManager';

const mockFlags: { [key: string]: any } = {
	estimateGas: null
};

jest.mock('eth-query', () =>
	jest.fn().mockImplementation(() => {
		return {
			estimateGas: (_transaction: any, callback: any) => {
				if (mockFlags.estimateGas) {
					callback(new Error(mockFlags.estimateGas));
				}
				callback(undefined, '0x0');
			},
			gasPrice: (callback: any) => {
				callback(undefined, '0x0');
			},
			getCode: (_to: any, callback: any) => {
				callback(undefined, '0x0');
			},
			getTransactionCount: (_from: any, _to: any, callback: any) => {
				callback(undefined, '0x0');
			},
			sendRawTransaction: (_transaction: any, callback: any) => {
				callback(undefined, '1337');
			}
		};
	})
);

describe('MessageManager', () => {
	beforeEach(() => {
		for (const key in mockFlags) {
			mockFlags[key] = null;
		}
	});

	it('should set default state', () => {
		const controller = new MessageManager();
		expect(controller.state).toEqual({ unapprovedMessages: {}, unapprovedMessagesCount: 0 });
	});

	it('should set default config', () => {
		const controller = new MessageManager();
		expect(controller.config).toEqual({});
	});

	it('should add a valid message', async () => {
		const controller = new MessageManager();
		const messageId = 1;
		const messageMetamaskId = 1;
		const messageData = '0x123';
		const messageTime = Date.now();
		const messageStatus = 'unapproved';
		const messageType = 'eth_sign';
		controller.addMessage({
			id: messageId,
			messageParams: {
				data: messageData,
				metamaskId: messageMetamaskId
			},
			status: messageStatus,
			time: messageTime,
			type: messageType
		});
		const message = controller.getMessage(messageId);
		expect(message).not.toBe(undefined);
		if (message) {
			expect(message.id).toBe(messageId);
			expect(message.messageParams.metamaskId).toBe(messageMetamaskId);
			expect(message.messageParams.data).toBe(messageData);
			expect(message.time).toBe(messageTime);
			expect(message.status).toBe(messageStatus);
			expect(message.type).toBe(messageType);
		}
	});

	it('should throw when adding invalid transaction', () => {
		const messageMetamaskId = 1;
		const messageData = '0x123';
		return new Promise(async (resolve) => {
			const controller = new MessageManager();
			try {
				await controller.addUnapprovedMessageAsync({
					data: messageData,
					metamaskId: messageMetamaskId
				});
			} catch (error) {
				expect(error.message).toContain('MetaMask Message Signature: Unknown problem:');
				resolve();
			}
		});
	});
});
