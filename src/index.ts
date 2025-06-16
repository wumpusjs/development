import '@dotenvx/dotenvx/config';
import '@env';

import { GatewayIntentBits } from 'discord.js';
import Bot from '@utils/bot';

const bot = new Bot({
    token: process.env.APPLICATION_TOKEN || '',
    intents: [GatewayIntentBits.Guilds],
    hmr: true,
    modules: 'auto',
});

bot.on('initialized', bot.start);

bot.init();
