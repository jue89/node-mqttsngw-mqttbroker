const FSM = require('edfsm');
const mqtt = require('mqtt');
module.exports = (bus, log) => {
	return FSM({
		fsmName: '[Core] Client',
		log: log,
		input: bus,
		output: bus,
		firstState: 'init'
	}).state('init', (ctx, i, o, next) => {
		// Make sure configuration is valid
		if (typeof ctx.broker !== 'object' || typeof ctx.broker.url !== 'string') {
			o(['brokerConnect', ctx.clientKey, 'res'], {
				clientKey: ctx.clientKey,
				error: 'No valid configuration given'
			});
			return next(null);
		}

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
		ctx.connection.on('connect', (connack) => {
			o(['brokerConnect', ctx.clientKey, 'res'], {
				clientKey: ctx.clientKey,
				error: null,
				sessionResumed: connack.sessionPresent
			});
			ctx.connected = true;
			next('connected');
		}).on('error', (err) => {
			o(['brokerConnect', ctx.clientKey, 'res'], {
				clientKey: ctx.clientKey,
				error: err.message
			});
			next(null);
		});
	}).final((ctx, i, o, end, err) => {
		// TODO: close notify if connected is still true
		if (ctx.connection) ctx.connection.end(true, () => end());
	});
};
