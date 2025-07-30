import { inspect } from 'node:util';
import chalk from 'chalk';

enum LogLevel {
	INFO = 'INFO',
	WARN = 'WARN',
	ERROR = 'ERROR',
	DEBUG = 'DEBUG',
}

const levelColors: Record<LogLevel, chalk.Chalk> = {
	[LogLevel.INFO]: chalk.blue,
	[LogLevel.WARN]: chalk.yellow,
	[LogLevel.ERROR]: chalk.red,
	[LogLevel.DEBUG]: chalk.magenta,
};

export class Logger {
	private readonly context: string;

	constructor(context: string) {
		this.context = context;
	}

	public info(...args: unknown[]): void {
		this.log(LogLevel.INFO, ...args);
	}

	public warn(...args: unknown[]): void {
		this.log(LogLevel.WARN, ...args);
	}

	public error(...args: unknown[]): void {
		this.log(LogLevel.ERROR, ...args);
	}

	public debug(...args: unknown[]): void {
		this.log(LogLevel.DEBUG, ...args);
	}

	private log(level: LogLevel, ...args: unknown[]): void {
		const timestamp = chalk.gray(new Date().toISOString());
		const levelString = levelColors[level].bold(`[${level}]`);
		const contextString = chalk.cyan(`[${this.context}]`);

		const formattedMessage = this.formatArgs(args);

		const logMessage = `${timestamp} ${levelString} ${contextString} ${formattedMessage}`;

		if (level === LogLevel.ERROR) {
			// biome-ignore lint/suspicious/noConsole: This is a logger, so console output is expected
			console.error(logMessage);
		} else {
			// biome-ignore lint/suspicious/noConsole: This is a logger, so console output is expected
			console.log(logMessage);
		}
	}

	private formatArgs(args: unknown[]): string {
		return args
			.map((arg) => {
				if (typeof arg === 'string') {
					return arg;
				}
				if (arg instanceof Error) {
					return `\n${arg.stack}`;
				}
				return inspect(arg, { colors: true, depth: null });
			})
			.join(' ');
	}
}
