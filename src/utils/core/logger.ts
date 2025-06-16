import chalk from 'chalk';
import { inspect } from 'util';

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

    public info(...args: any[]): void {
        this.log(LogLevel.INFO, ...args);
    }

    public warn(...args: any[]): void {
        this.log(LogLevel.WARN, ...args);
    }

    public error(...args: any[]): void {
        this.log(LogLevel.ERROR, ...args);
    }

    public debug(...args: any[]): void {
        this.log(LogLevel.DEBUG, ...args);
    }

    private log(level: LogLevel, ...args: any[]): void {
        const timestamp = chalk.gray(new Date().toISOString());
        const levelString = levelColors[level].bold(`[${level}]`);
        const contextString = chalk.cyan(`[${this.context}]`);

        const formattedMessage = this.formatArgs(args);

        const logMessage = `${timestamp} ${levelString} ${contextString} ${formattedMessage}`;

        if (level === LogLevel.ERROR) {
            console.error(logMessage);
        } else {
            console.log(logMessage);
        }
    }

    private formatArgs(args: any[]): string {
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
