const FSM = require('edfsm');
const mqtt = require('mqtt');
module.exports = (bus, log) => {
	let msgId = 0;
	const genMsgId = () => {
		if (msgId === 65536) msgId = 0;
		return msgId++;
	};
	return FSM({
		fsmName: '[MQTTBroker] Client',
		log: log,
		input: bus,
		output: bus,
		firstState: 'init'
	}).state('init', (ctx, i, o, next) => {
		// Try to get configuration
		try {
			ctx.broker = ctx.broker(ctx.clientId);
		} catch (e) {
			return next(e);
		}

		// Make sure configuration is valid
		if (typeof ctx.broker !== 'object' || typeof ctx.broker.url !== 'string') {
			next(new Error('No valid configuration given'));
		} else {
			next('connect');
		}
	}).state('connect', (ctx, i, o, next) => {
		// Connect to broker
		ctx.connected = false;
		const url = ctx.broker.url;
		delete ctx.broker.url;
		ctx.connection = mqtt.connect(url, Object.assign({
			clean: ctx.cleanSession,
			clientId: ctx.clientId,
			will: (!ctx.will) ? undefined : {
				topic: ctx.willTopic,
				payload: ctx.willMessage,
				qos: 0,
				retain: false
			}
		}, ctx.broker));

		// Listen for mqtt connection events
		const onConnect = (connack) => {
			o(['brokerConnect', ctx.clientKey, 'res'], {
				clientKey: ctx.clientKey,
				error: null,
				sessionResumed: connack.sessionPresent
			});
			ctx.connected = true;
			ctx.connection.removeListener('connect', onConnect);
			ctx.connection.removeListener('error', onError);
			next('connected');
		};
		ctx.connection.on('connect', onConnect);
		const onError = (err) => next(err);
		ctx.connection.on('error', onError);

		next.timeout(9500, new Error('Connection timeout'));
	}).state('connected', (ctx, i, o, next) => {
		// Debug logging
		if (log.warn) {
			const logConnectionState = (state) => log.warn(
				`Connection state changed: ${state ? 'online' : 'offline'}`,
				{
					clientKey: ctx.clientKey,
					message_id: '8badd8119b8a47d085ccd8b4a8217dd2',
					connected: state
				}
			);
			ctx.connection.on('offline', () => {
				logConnectionState(ctx.connection.connected);
			}).on('connect', () => {
				logConnectionState(ctx.connection.connected);
			});
		}

		// React to subscription requests
		i(['brokerSubscribe', ctx.clientKey, 'req'], (req) => {
			ctx.connection.subscribe(req.topic, { qos: req.qos }, (err, ack) => {
				if (err) {
					o(['brokerSubscribe', ctx.clientKey, 'res'], {
						clientKey: ctx.clientKey,
						msgId: req.msgId,
						error: err.message
					});
				} else {
					o(['brokerSubscribe', ctx.clientKey, 'res'], {
						clientKey: ctx.clientKey,
						msgId: req.msgId,
						qos: ack.qos,
						error: null
					});
				}
			});
		});

		// React to unsubscription requests
		i(['brokerUnsubscribe', ctx.clientKey, 'req'], (req) => {
			ctx.connection.unsubscribe(req.topic, (err) => {
				if (err) {
					o(['brokerUnsubscribe', ctx.clientKey, 'res'], {
						clientKey: ctx.clientKey,
						msgId: req.msgId,
						error: err.message
					});
				} else {
					o(['brokerUnsubscribe', ctx.clientKey, 'res'], {
						clientKey: ctx.clientKey,
						msgId: req.msgId,
						error: null
					});
				}
			});
		});

		// Publish Client -> Broker
		i(['brokerPublishFromClient', ctx.clientKey, 'req'], (data) => {
			ctx.connection.publish(data.topic, data.payload, {
				qos: data.qos,
				retain: data.retain
			}, (err) => {
				o(['brokerPublishFromClient', ctx.clientKey, 'res'], {
					clientKey: ctx.clientKey,
					msgId: data.msgId,
					error: (err) ? err.message : null
				});
			});
		});

		// Publish Broker -> Client
		ctx.connection.handleMessage = (msg, cb) => {
			o(['brokerPublishToClient', ctx.clientKey, 'req'], {
				clientKey: ctx.clientKey,
				msgId: genMsgId(),
				qos: msg.qos,
				topic: msg.topic,
				payload: msg.payload
			});
			// TODO: clean this one up. Little hack.
			const handle = (data) => {
				bus.removeListener(['brokerPublishToClient', ctx.clientKey, 'res'], handle);
				if (data.error) cb(new Error(data.error));
				else cb(null);
			};
			bus.on(['brokerPublishToClient', ctx.clientKey, 'res'], handle);
		};

		// React to disconnect calls
		i(['brokerDisconnect', ctx.clientKey, 'call'], () => {
			ctx.connected = false;
			next(null);
		});
	}).final((ctx, i, o, end, err) => {
		// If some error occured, connection establishment failed!
		if (err instanceof Error) {
			o(['brokerConnect', ctx.clientKey, 'res'], {
				clientKey: ctx.clientKey,
				error: err.message
			});
		}

		// TODO: close notify if connected is still true
		if (ctx.connection) ctx.connection.end(true, () => end(err));
		else end();
	});
};
