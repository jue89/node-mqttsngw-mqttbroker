const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

jest.mock('mqtt');
const mqtt = require('mqtt');

const fsmClient = require('../fsmClient.js');

describe('state: init', () => {
	test('make sure that broker configuration is an object', () => {
		const CTX = {
			clientKey: '::1_12345'
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerConnect', CTX.clientKey, 'res'], res);
		fsmClient(bus).testState('init', CTX);
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			error: 'No valid configuration given'
		});
	});
	test('make sure that broker configuration has at least an URL', () => {
		const CTX = {
			clientKey: '::1_12345',
			broker: {}
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerConnect', CTX.clientKey, 'res'], res);
		fsmClient(bus).testState('init', CTX);
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			error: 'No valid configuration given'
		});
	});
	test('start connection to the broker with will', () => {
		const CTX = {
			broker: {
				url: 'http://test',
				ca: Buffer.from('a')
			},
			clientKey: '::1_12345',
			will: true,
			willTopic: 'willTopic',
			willMessage: 'willMessage',
			cleanSession: true,
			clientId: 'client'
		};
		fsmClient().testState('init', CTX);
		expect(mqtt.connect.mock.calls[0][0]).toEqual('http://test');
		expect(mqtt.connect.mock.calls[0][1]).toMatchObject({
			ca: Buffer.from('a'),
			will: {
				topic: CTX.willTopic,
				payload: CTX.willMessage,
				qos: 0,
				retain: false
			},
			clean: CTX.cleanSession,
			clientId: CTX.clientId
		});
	});
	test('start connection to the broker without will', () => {
		const CTX = {
			broker: {
				url: 'http://test',
				ca: Buffer.from('a')
			},
			clientKey: '::1_12345',
			will: false,
			cleanSession: true,
			clientId: 'client'
		};
		fsmClient().testState('init', CTX);
		expect(mqtt.connect.mock.calls[0][0]).toEqual('http://test');
		expect(mqtt.connect.mock.calls[0][1]).toMatchObject({
			ca: Buffer.from('a'),
			will: undefined,
			clean: CTX.cleanSession,
			clientId: CTX.clientId
		});
	});
	test('go in connected state if broker accepted our connection', () => {
		const CTX = {
			broker: { url: 'test' },
			clientKey: '::1_12345'
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerConnect', CTX.clientKey, 'res'], res);
		const fsm = fsmClient(bus).testState('init', CTX);
		mqtt._client.emit('connect', {
			cmd: 'connack',
			returnCode: 0,
			sessionPresent: true
		});
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			error: null,
			sessionResumed: true
		});
		expect(CTX.connected).toBe(true);
		expect(fsm.next.mock.calls[0][0]).toEqual('connected');
	});
	test('forward connection errors', () => {
		const CTX = {
			broker: { url: 'test' },
			clientKey: '::1_12345'
		};
		const ERR = new Error('nope');
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerConnect', CTX.clientKey, 'res'], res);
		const fsm = fsmClient(bus).testState('init', CTX);
		mqtt._client.emit('error', ERR);
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			error: ERR.message
		});
		expect(CTX.connected).toBe(false);
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
});

describe('final', () => {
	test('close connection to broker', () => {
		const CTX = {
			broker: { url: 'test' },
			connection: { end: jest.fn() }
		};
		const fsm = fsmClient().testState('_final', CTX);
		expect(CTX.connection.end.mock.calls.length).toEqual(1);
		CTX.connection.end.mock.calls[0][1]();
		expect(fsm.next.mock.calls.length).toEqual(1);
	});
});
