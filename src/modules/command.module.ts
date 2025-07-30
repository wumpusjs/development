import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import BaseModule from '@modules/base.module';
import EventModule from '@modules/event.module';
import { Message } from '@response';
import Command from '@utils/core/command';
import env from '@utils/core/env';
import Event from '@utils/core/event';
import Loader from '@utils/core/loader';
import { Logger } from '@utils/core/logger';
import {
	type ChatInputCommandInteraction,
	REST,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	Routes,
} from 'discord.js';

export class CommandError extends Error {
	commandIdentifier: string;
	interaction: ChatInputCommandInteraction;
	hidden: boolean;

	constructor(
		commandIdentifier: string,
		interaction: ChatInputCommandInteraction,
		message: string,
		hidden = false
	) {
		super(message);
		this.name = 'CommandError';
		this.commandIdentifier = commandIdentifier;
		this.interaction = interaction;
		this.hidden = hidden;
	}
}

export const COMMANDS_DIRECTORY = 'commands';

/* type ReadonlyFields<T> = {
    [P in keyof T as { -readonly [K in P]: T[K] } extends { [K in P]: T[K] }
        ? never
        : P]: T[P];
}; */

export default class CommandModule extends BaseModule {
	requirements = {
		modules: [EventModule],
	};

	commands: Map<string, Wumpus.ICommandContext & Wumpus.ICommandOptions> =
		new Map();
	logger = new Logger('CommandModule');

	event: Event<'interactionCreate'> | null = null;
	public async init(): Promise<void> {
		this.commands.clear();

		const loader = new Loader<Command>(
			path.join(process.cwd(), 'src', COMMANDS_DIRECTORY),
			{
				filter: (fileName) =>
					fileName.endsWith('.js') || fileName.endsWith('.ts'),
				loggerContext: 'CommandLoader',
			}
		);

		const commands = await loader.load();

		for (const command of commands) {
			if (
				!command ||
				typeof command !== 'object' ||
				!(command instanceof Command) ||
				!command.context ||
				!command.context.handler ||
				typeof command.context.handler !== 'function'
			) {
				this.logger.warn('Skipping invalid command file.');
				continue;
			}

			const commandIdentifier = command.context.identifier;

			if (this.commands.has(commandIdentifier)) {
				this.logger.error(
					`Duplicate command identifier found: ${commandIdentifier}. Skipping.`
				);
				process.exit(1);
			} else {
				this.commands.set(commandIdentifier, command.context);
			}
		}
	}
	public async start(): Promise<void> {
		if (this.event) {
			this.logger.debug('Event listener already registered, skipping');
		} else {
			const eventModule = this.bot.get(EventModule);

			if (!eventModule) {
				this.logger.error(
					'EventModule is not registered. Cannot start CommandModule.'
				);
				return;
			}
			this.event = new Event('interactionCreate', {
				handler: async (bot, _eventName, [interaction]) => {
					if (!interaction.isChatInputCommand()) {
						return;
					}
					const commandContext = this.commands.get(
						interaction.commandName.split('.', 1)[0]
					);
					if (commandContext) {
						try {
							const result = await commandContext.handler(
								bot,
								interaction
							);

							let reply: Message | undefined;

							if (result instanceof Message) {
								reply = result;
							} else if (result) {
								reply = new Message(result);
							}

							if (reply) {
								if (
									interaction.replied ||
									interaction.deferred
								) {
									await interaction.editReply(reply);
								} else {
									await interaction.reply(reply);
								}
							}
						} catch (error) {
							const commandError = new CommandError(
								commandContext.identifier,
								interaction,
								error instanceof Error
									? error.message
									: String(error),
								commandContext.errors === 'hidden'
							);
							await this.handleCommandError(commandError);
						}
					}
				},
			});

			eventModule.addEventListener(this.event);
			this.logger.debug('Registered interactionCreate event listener');
		}

		this.logger.info(
			`Loaded ${this.commands.size} commands from ${COMMANDS_DIRECTORY}.`
		);

		await this.registerCommands();

		this.logger.info('CommandModule started successfully.');
	}

	private async handleCommandError(
		commandError: CommandError
	): Promise<void> {
		const { commandIdentifier, interaction, message, hidden } =
			commandError;
		if (!interaction.isChatInputCommand()) {
			this.logger.error('Unexpected interaction type for command error');
			return;
		}

		let content = `Error occurred while handling command ${commandIdentifier}`;
		if (!hidden) {
			content += `: ${message}`;
		}

		try {
			const replyOptions = { content, flags: 1 << 6 }; // Ephemeral
			this.logger.debug(interaction.replied, interaction.deferred);
			if (interaction.replied || interaction.deferred) {
				await interaction.editReply(replyOptions);
			} else {
				await interaction.reply(replyOptions);
			}
		} catch (replyError: unknown) {
			this.logger.debug(replyError);
			if (
				typeof replyError === 'object' &&
				replyError !== null &&
				(('code' in replyError &&
					typeof replyError.code === 'number' &&
					replyError.code === 10_062) ||
					('message' in replyError &&
						typeof replyError.message === 'string' &&
						replyError.message.includes('Unknown interaction')))
			) {
				this.logger.warn(
					`2 Could not send error reply for command ${commandIdentifier}: interaction is no longer valid (possibly expired or already acknowledged).`
				);
			} else {
				this.logger.error(
					`Failed to send error reply for command ${commandIdentifier}:`,
					replyError
				);
			}
		}
	}
	public stop(): void | Promise<void> {
		if (this.event) {
			const eventModule = this.bot.get(EventModule);
			if (eventModule) {
				eventModule.removeEventListener(this.event);
				this.logger.debug('Removed interactionCreate event listener');
			}
			this.event = null;
		}

		this.commands.clear();
		this.logger.debug('Cleared commands map');
	}

	// TODO: improve complex datas into more structured types like allowing multiple names in one field
	// TODO: add internalization support for command descriptions and names
	private async registerCommands(): Promise<void> {
		const rest = new REST().setToken(env.APPLICATION_TOKEN);

		const commandsData = Array.from(this.commands.values()).map(
			(command) =>
				({
					name: command.identifier,
					options: [],
					description:
						command.description || 'No description provided',
					nsfw: command.nsfw,
					description_localizations:
						command.descriptionLocalizations ?? {},
					name_localizations: command.nameLocalizations ?? {},
					default_member_permissions:
						(command.permissions || [])?.reduce((acc, perm) => {
							if (typeof perm !== 'bigint') {
								this.logger.warn(
									`Invalid permission type for command ${
										command.identifier
									}: ${typeof perm}. Expected bigint.`
								);
								return acc;
							}
							return acc | perm;
						}, 0n) || null,
					contexts: Array.isArray(command?.contexts)
						? Array.from(new Set(command.contexts))
						: undefined,
				}) as RESTPostAPIChatInputApplicationCommandsJSONBody
		);

		const cacheDir = path.join(process.cwd(), '.cache');
		const hashFilePath = path.join(cacheDir, 'commands.hash');
		const commandsJson = JSON.stringify(commandsData);
		const currentHash = createHash('sha256')
			.update(commandsJson)
			.digest('hex');

		try {
			await fs.mkdir(cacheDir, { recursive: true });
			const existingHash = await fs.readFile(hashFilePath, 'utf-8');
			if (existingHash === currentHash) {
				this.logger.info(
					'Commands have not changed. Skipping registration.'
				);
				return;
			}
		} catch (error: unknown) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				this.logger.warn('Could not read command cache file:', error);
			}
		}

		try {
			await rest.put(Routes.applicationCommands(env.APPLICATION_ID), {
				body: commandsData,
			});
			this.logger.info(
				`Successfully registered ${commandsData.length} commands.`
			);

			await fs.writeFile(hashFilePath, currentHash, 'utf-8');
			this.logger.info(`Wrote command hash to ${hashFilePath}`);
		} catch (error) {
			this.logger.error('Failed to register commands:', error);
		}
	}
}
