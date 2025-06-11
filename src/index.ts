import '@dotenvx/dotenvx/config';

import { GatewayIntentBits } from 'discord.js';
import EventModule from '@modules/event.module';
import Bot from '@utils/bot';

const bot = new Bot({
    token: process.env.APPLICATION_TOKEN || '',
    intents: [GatewayIntentBits.Guilds],
});

bot.register(EventModule);

bot.on('initialized', bot.start);

bot.init();
