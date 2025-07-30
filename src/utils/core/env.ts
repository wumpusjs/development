import { type } from 'arktype';
import { Logger } from './logger';

const logger = new Logger('Env');

const ENV_SCHEMA = type({
	APPLICATION_ID: type('17 <= string.digits <= 20'),
	APPLICATION_TOKEN: type(
		'/^[A-Za-z0-9_-]{24,}\\.[A-Za-z0-9_-]{6,}\\.[A-Za-z0-9_-]{38,}$/'
	),
});

const env = ENV_SCHEMA({
	APPLICATION_ID: process.env.APPLICATION_ID,
	APPLICATION_TOKEN: process.env.APPLICATION_TOKEN,
});

if (env instanceof type.errors) {
	logger.error('Invalid environment variables:', env.summary);
	process.exit(1);
}

export type Env = typeof ENV_SCHEMA.infer;

declare global {
	namespace NodeJS {
		interface ProcessEnv extends Env {}
	}
}

export default env as Env;
