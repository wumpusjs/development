import Event from '@event';

export default new Event('ready', {
	handler(_bot, _event, [client]) {
		// biome-ignore lint/suspicious/noConsole: this is for debugging purposes
		console.log('Bot is ready!', client.user?.tag);
	},
});
