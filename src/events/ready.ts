import Event from '@event';

export default new Event('ready', {
    handler(_bot, _event, [client]) {
        console.log('Bot is ready!', client.user?.tag);
    },
});
