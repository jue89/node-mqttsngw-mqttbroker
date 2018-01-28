const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

jest.mock('../fsmClient.js');
const fsmClient = require('../fsmClient.js');

const fsmMain = require('../fsmMain.js');

test('init client fsm factory', () => {
	const BUS = {};
	const LOG = {};
	fsmMain(BUS, LOG);
	expect(fsmClient.mock.calls[0][0]).toBe(BUS);
	expect(fsmClient.mock.calls[0][1]).toBe(LOG);
});

describe('state: listening', () => {
	test('react to brokerConnect messages', () => {
		const CONNECT = {
			clientKey: '::1_12345',
			will: true,
			willTopic: 'willTopic',
			willMessage: 'willMessage',
			cleanSession: true,
			clientId: 'client'
		};
		const CTX = { broker: (id) => id };
		const bus = new EventEmitter({wildcard: true});
		fsmMain(bus).testState('listening', CTX);
		bus.emit(['brokerConnect', CONNECT.clientKey, 'req'], Object.assign({}, CONNECT));
		expect(fsmClient._run.mock.calls[0][0]).toMatchObject(Object.assign({
			broker: CONNECT.clientId
		}, CONNECT));
	});
});
