import '@dotenvx/dotenvx/config';
import '@env';

import Bot from '@utils/bot';
import { GatewayIntentBits } from 'discord.js';

const bot = new Bot({
	token: process.env.APPLICATION_TOKEN || '',
	intents: [GatewayIntentBits.Guilds],
	hmr: true,
	modules: 'auto',
});

bot.on('initialized', bot.start);

bot.init();
