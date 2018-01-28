module.exports = (opts) => (bus) => {
	// Make sure broker config is a callback
	if (typeof opts.broker !== 'function') {
		const brokerConfig = opts.broker;
		opts.broker = () => brokerConfig;
	}

	const mainFactory = require('./fsmMain.js')(bus, opts.log);
	return () => {
		const main = mainFactory.run(opts);
		return () => main.next(null);
	};
};
