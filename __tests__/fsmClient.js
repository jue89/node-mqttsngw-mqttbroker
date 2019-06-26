const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

jest.mock('mqtt');
const mqtt = require('mqtt');

const fsmClient = require('../fsmClient.js');

describe('state: init', () => {
	test('get broker config', () => {
		const CTX = {
			clientId: 'client',
			broker: (id) => id
		};
		fsmClient().testState('init', CTX);
		expect(CTX.broker).toEqual(CTX.clientId);
	});
	test('handle broker config callback errors', () => {
		const ERR = new Error('nope');
		const CTX = {
			broker: () => { throw ERR; }
		};
		const fsm = fsmClient().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual(ERR.message);
	});
	test('make sure that broker configuration is an object', () => {
		const CTX = {
			clientKey: '::1_12345',
			broker: () => undefined
		};
		const fsm = fsmClient().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('No valid configuration given');
	});
	test('make sure that broker configuration has at least an URL', () => {
		const CTX = {
			clientKey: '::1_12345',
			broker: () => {}
		};
		const fsm = fsmClient().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('No valid configuration given');
	});
	test('go to connect state', () => {
		const CTX = {
			broker: () => ({ url: '' })
		};
		const fsm = fsmClient().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0]).toEqual('connect');
	});
});

describe('state: connect', () => {
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
		fsmClient().testState('connect', CTX);
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
		fsmClient().testState('connect', CTX);
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
		const fsm = fsmClient(bus).testState('connect', CTX);
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
	test('remove listener once the connection has been established', () => {
		const CTX = {
			broker: { url: 'test' },
			clientKey: '::1_12345'
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('connect', CTX);
		mqtt._client.emit('connect', {});
		mqtt._client.emit('connect', {});
		expect(fsm.next.mock.calls.length).toBe(1);
	});
	test('forward connection errors', () => {
		const CTX = {
			broker: { url: 'test' },
			clientKey: '::1_12345'
		};
		const ERR = new Error('nope');
		const fsm = fsmClient().testState('connect', CTX);
		mqtt._client.emit('error', ERR);
		expect(CTX.connected).toBe(false);
		expect(fsm.next.mock.calls[0][0].message).toEqual(ERR.message);
	});
});

describe('state: connected', () => {
	test('log state change to offline', () => {
		const LOG = {
			warn: jest.fn()
		};
		const CONNECTION = new EventEmitter();
		const CTX = {
			clientKey: '::1_12345',
			connected: true,
			connection: CONNECTION
		};
		const bus = new EventEmitter();
		fsmClient(bus, LOG).testState('connected', CTX);
		CONNECTION.connected = false;
		CTX.connection.emit('offline');
		expect(LOG.warn.mock.calls[0][0]).toEqual('Connection state changed: offline');
		expect(LOG.warn.mock.calls[0][1]).toMatchObject({
			clientKey: CTX.clientKey,
			message_id: '8badd8119b8a47d085ccd8b4a8217dd2',
			connected: false
		});
	});
	test('log state change to online', () => {
		const LOG = {
			warn: jest.fn()
		};
		const CONNECTION = new EventEmitter();
		const CTX = {
			clientKey: '::1_12345',
			connected: true,
			connection: CONNECTION
		};
		const bus = new EventEmitter();
		fsmClient(bus, LOG).testState('connected', CTX);
		CONNECTION.connected = true;
		CTX.connection.emit('connect');
		expect(LOG.warn.mock.calls[0][0]).toEqual('Connection state changed: online');
		expect(LOG.warn.mock.calls[0][1]).toMatchObject({
			clientKey: CTX.clientKey,
			message_id: '8badd8119b8a47d085ccd8b4a8217dd2',
			connected: true
		});
	});
	test('close connection if a disconnect call is received', () => {
		const CTX = {
			clientKey: '::1_12345',
			connected: true,
			connection: {}
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus, {}).testState('connected', CTX);
		bus.emit(['brokerDisconnect', CTX.clientKey, 'call'], {
			clientKey: CTX.clientKey
		});
		expect(CTX.connected).toBe(false);
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('subscribe to topic', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const SUB = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test',
			qos: 1
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerSubscribe', CTX.clientKey, 'res'], res);
		fsmClient(bus, {}).testState('connected', CTX);
		bus.emit(['brokerSubscribe', CTX.clientKey, 'req'], SUB);
		expect(mqtt._client.subscribe.mock.calls[0][0]).toEqual(SUB.topic);
		expect(mqtt._client.subscribe.mock.calls[0][1]).toMatchObject({
			qos: SUB.qos
		});
		mqtt._client.subscribe.mock.calls[0][2](null, { qos: SUB.qos });
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: SUB.msgId,
			qos: SUB.qos,
			error: null
		});
	});
	test('report subscription error', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const SUB = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test',
			qos: 1
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerSubscribe', CTX.clientKey, 'res'], res);
		fsmClient(bus, {}).testState('connected', CTX);
		bus.emit(['brokerSubscribe', CTX.clientKey, 'req'], SUB);
		expect(mqtt._client.subscribe.mock.calls[0][0]).toEqual(SUB.topic);
		expect(mqtt._client.subscribe.mock.calls[0][1]).toMatchObject({
			qos: SUB.qos
		});
		mqtt._client.subscribe.mock.calls[0][2](new Error('nope'));
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: SUB.msgId,
			error: 'nope'
		});
	});
	test('unsubscribe from topic', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const SUB = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test'
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerUnsubscribe', CTX.clientKey, 'res'], res);
		fsmClient(bus, {}).testState('connected', CTX);
		bus.emit(['brokerUnsubscribe', CTX.clientKey, 'req'], SUB);
		expect(mqtt._client.unsubscribe.mock.calls[0][0]).toEqual(SUB.topic);
		mqtt._client.unsubscribe.mock.calls[0][1](null);
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: SUB.msgId,
			error: null
		});
	});
	test('report desubscription error', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const SUB = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test'
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerUnsubscribe', CTX.clientKey, 'res'], res);
		fsmClient(bus, {}).testState('connected', CTX);
		bus.emit(['brokerUnsubscribe', CTX.clientKey, 'req'], SUB);
		mqtt._client.unsubscribe.mock.calls[0][1](new Error('nope'));
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: SUB.msgId,
			error: 'nope'
		});
	});
	test('publish to broker', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const PUB = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test',
			qos: 1,
			retain: true,
			payload: Buffer.from('a')
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerPublishFromClient', CTX.clientKey, 'res'], res);
		fsmClient(bus, {}).testState('connected', CTX);
		bus.emit(['brokerPublishFromClient', CTX.clientKey, 'req'], PUB);
		expect(mqtt._client.publish.mock.calls[0][0]).toEqual(PUB.topic);
		expect(mqtt._client.publish.mock.calls[0][1]).toBe(PUB.payload);
		expect(mqtt._client.publish.mock.calls[0][2]).toMatchObject({
			qos: PUB.qos,
			retain: PUB.retain
		});
		mqtt._client.publish.mock.calls[0][3](null);
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: PUB.msgId,
			error: null
		});
	});
	test('publish to broker error', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const PUB = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test',
			qos: 1,
			retain: true,
			payload: Buffer.from('a')
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerPublishFromClient', CTX.clientKey, 'res'], res);
		fsmClient(bus, {}).testState('connected', CTX);
		bus.emit(['brokerPublishFromClient', CTX.clientKey, 'req'], PUB);
		expect(mqtt._client.publish.mock.calls[0][0]).toEqual(PUB.topic);
		expect(mqtt._client.publish.mock.calls[0][1]).toBe(PUB.payload);
		expect(mqtt._client.publish.mock.calls[0][2]).toMatchObject({
			qos: PUB.qos,
			retain: PUB.retain
		});
		const ERR = new Error('nope');
		mqtt._client.publish.mock.calls[0][3](ERR);
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: PUB.msgId,
			error: ERR.message
		});
	});
	test('publish to client', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const PUB = {
			cmd: 'publish',
			qos: 1,
			dup: false,
			topic: 'test',
			payload: Buffer.from('test'),
			retain: false
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['brokerPublishToClient', CTX.clientKey, 'req'], req);
		const cb = jest.fn();
		fsmClient(bus, {}).testState('connected', CTX);
		CTX.connection.handleMessage(PUB, cb);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: 0,
			topic: PUB.topic,
			payload: PUB.payload,
			qos: PUB.qos
		});
		expect(cb.mock.calls.length).toEqual(0);
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 0,
			error: null
		});
		expect(cb.mock.calls[0][0]).toBe(null);
	});
	test('suppress handleMessage callback if context has been destroyed in the meantime', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const PUB = {};
		const bus = new EventEmitter();
		const cb = jest.fn();
		fsmClient(bus, {}).testState('connected', CTX);
		CTX.connection.handleMessage(PUB, cb);
		CTX.connection = null;
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'res'], {});
		expect(cb.mock.calls.length).toEqual(0);
	});
	test('publish to client error', () => {
		const CTX = {
			clientKey: '::1_12345',
			connection: mqtt.connect()
		};
		const PUB = {
			cmd: 'publish',
			qos: 1,
			dup: false,
			topic: 'test',
			payload: Buffer.from('test'),
			retain: false
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['brokerPublishToClient', CTX.clientKey, 'req'], req);
		const cb = jest.fn();
		fsmClient(bus, {}).testState('connected', CTX);
		CTX.connection.handleMessage(PUB, cb);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: 0,
			topic: PUB.topic,
			payload: PUB.payload,
			qos: PUB.qos
		});
		expect(cb.mock.calls.length).toEqual(0);
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 0,
			error: 'nope'
		});
		expect(cb.mock.calls[0][0].message).toBe('nope');
	});
});

describe('final', () => {
	test('close connection to broker', () => {
		const connection = { end: jest.fn() };
		const CTX = {
			broker: { url: 'test' },
			connection
		};
		const fsm = fsmClient().testState('_final', CTX);
		expect(connection.end.mock.calls.length).toEqual(1);
		connection.end.mock.calls[0][1]();
		expect(fsm.next.mock.calls.length).toEqual(1);
		expect(CTX.connection).toBe(null);
	});
	test('forward errors to core', () => {
		const CTX = {
			clientKey: '::1_12345'
		};
		const ERR = new Error('test');
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['brokerConnect', CTX.clientKey, 'res'], res);
		fsmClient(bus).testState('_final', CTX, ERR);
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			error: ERR.message
		});
	});
});
