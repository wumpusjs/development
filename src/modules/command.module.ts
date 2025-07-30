import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import BaseModule from '@modules/base.module';
import EventModule from '@modules/event.module';
import { type Embed, Message } from '@response';
import type Bot from '@utils/bot';
import Command from '@utils/core/command';
import env from '@utils/core/env';
import Event from '@utils/core/event';
import Loader from '@utils/core/loader';
import { Logger } from '@utils/core/logger';
import { BaseState } from '@utils/state';
import {
	type CacheType,
	type ChatInputCommandInteraction,
	type ClientEvents,
	type Interaction,
	REST,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	Routes,
} from 'discord.js';

export class CommandModuleState extends BaseState {
	commands: Map<string, Wumpus.ICommandContext & Wumpus.ICommandOptions> =
		new Map();
}

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

export default class CommandModule extends BaseModule {
	requirements = {
		modules: [EventModule],
	};

	logger = new Logger('CommandModule');

	event: Event<'interactionCreate'> | null = null;
	public async init(): Promise<void> {
		const loader = new Loader<Command>(
			path.join(process.cwd(), 'src', COMMANDS_DIRECTORY),
			{
				filter: (fileName) =>
					fileName.endsWith('.js') || fileName.endsWith('.ts'),
				loggerContext: 'CommandLoader',
			}
		);

		const commands = await loader.load();
		const commandModuleState = this.bot.state.get(CommandModuleState);

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

			if (commandModuleState.commands.has(commandIdentifier)) {
				this.logger.error(
					`Duplicate command identifier found: ${commandIdentifier}!`
				);
				process.exit(1);
			} else {
				commandModuleState.commands.set(
					commandIdentifier,
					command.context
				);
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
				handler: this.handleInteraction.bind(this),
			});

			eventModule.addEventListener(
				this.event as Event<keyof ClientEvents>
			);
			this.logger.debug('Registered interactionCreate event listener');
		}

		const commandModuleState = this.bot.state.get(CommandModuleState);

		this.logger.info(
			`Loaded ${commandModuleState.commands.size} commands from ${COMMANDS_DIRECTORY}.`
		);

		await this.registerCommands();

		this.logger.info('CommandModule started successfully.');
	}

	private async handleInteraction(
		bot: Bot,
		_eventName: 'interactionCreate',
		args: [Interaction<CacheType>]
	): Promise<void> {
		const [interaction] = args;
		if (!interaction.isChatInputCommand()) {
			return;
		}

		const commandModuleState = this.bot.state.get(CommandModuleState);
		const commandContext = commandModuleState.commands.get(
			interaction.commandName
		);
		if (!commandContext) {
			return;
		}

		try {
			await this.executeCommand(bot, interaction, commandContext);
		} catch (error) {
			const commandError = new CommandError(
				commandContext.identifier,
				interaction,
				error instanceof Error ? error.message : String(error),
				commandContext.errors === 'hidden'
			);
			await this.handleCommandError(commandError);
		}
	}

	private async executeCommand(
		bot: Bot,
		interaction: ChatInputCommandInteraction,
		commandContext: Wumpus.ICommandContext
	): Promise<void> {
		const result = await commandContext.handler(bot, interaction);
		const reply =
			result instanceof Message
				? result
				: new Message(result as string | Embed);

		if (interaction.replied || interaction.deferred) {
			await interaction.editReply(reply);
		} else {
			await interaction.reply(reply);
		}
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
			this.logReplyError(replyError, commandIdentifier);
		}
	}

	private logReplyError(error: unknown, commandIdentifier: string): void {
		const isUnknownInteraction =
			error instanceof Object &&
			'code' in error &&
			(error as { code: unknown }).code === 10_062;

		if (isUnknownInteraction) {
			this.logger.warn(
				`Could not send error reply for command ${commandIdentifier}: interaction is no longer valid.`
			);
		} else {
			this.logger.error(
				`Failed to send error reply for command ${commandIdentifier}:`,
				error
			);
		}
	}

	public stop(): void | Promise<void> {
		if (this.event) {
			const eventModule = this.bot.get(EventModule);
			if (eventModule) {
				eventModule.removeEventListener(
					this.event as Event<keyof ClientEvents>
				);
				this.logger.debug('Removed interactionCreate event listener');
			}
			this.event = null;
		}

		const commandModuleState = this.bot.state.get(CommandModuleState);
		commandModuleState.commands.clear();
		this.logger.debug('Cleared commands map');
	}

	// TODO: improve complex datas into more structured types like allowing multiple names in one field
	// TODO: add internalization support for command descriptions and names
	private async registerCommands(): Promise<void> {
		const rest = new REST().setToken(env.APPLICATION_TOKEN);
		const commandModuleState = this.bot.state.get(CommandModuleState);

		const commandsData = Array.from(
			commandModuleState.commands.values()
		).map(
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
