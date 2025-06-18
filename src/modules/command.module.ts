import path from 'path';
import { pathToFileURL } from 'url';
import BaseModule from '@modules/base.module';
import fs from 'fs/promises';
import { readFolderRecursively } from '@utils/modules/event';
import Command from '@utils/core/command';
import { Logger } from '@utils/core/logger';
import EventModule from '@modules/event.module';
import Event from '@utils/core/event';
import {
    ChatInputCommandInteraction,
    REST,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    Routes,
} from 'discord.js';
import env from '@utils/core/env';

export class CommandError extends Error {
    commandIdentifier: string;
    interaction: ChatInputCommandInteraction;
    hidden: boolean;

    constructor(
        commandIdentifier: string,
        interaction: ChatInputCommandInteraction,
        message: string,
        hidden = false,
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

        const folder = path.join(process.cwd(), 'src', COMMANDS_DIRECTORY);
        const filePaths = await readFolderRecursively(
            folder,
            (fileName) => fileName.endsWith('.js') || fileName.endsWith('.ts'),
        );

        for (const fullPath of filePaths) {
            let resolvedPath: string | null = null;
            try {
                const stats = await fs.lstat(fullPath);
                if (stats.isSymbolicLink()) {
                    resolvedPath = await fs.realpath(fullPath);
                } else if (stats.isFile()) {
                    resolvedPath = fullPath;
                }

                if (resolvedPath) {
                    resolvedPath = pathToFileURL(resolvedPath).href;
                }
            } catch (error) {
                console.error(`Error processing file ${fullPath}:`, error);
                continue;
            }

            if (!resolvedPath) {
                console.warn(
                    `Skipping unsupported file type or error for: ${fullPath}`,
                );
                continue;
            }

            const exported: Command | unknown = (await import(resolvedPath))
                ?.default;

            if (
                !exported ||
                typeof exported !== 'object' ||
                !(exported instanceof Command) ||
                !exported.context ||
                !exported.context.handler ||
                typeof exported.context.handler !== 'function'
            ) {
                console.warn(`Skipping invalid command file: ${resolvedPath}`);
                continue;
            }

            const commandIdentifier = exported.context.identifier;

            if (this.commands.has(commandIdentifier)) {
                this.logger.error(
                    `Duplicate command identifier found: ${commandIdentifier}. Skipping.`,
                );
                process.exit(1);
            } else {
                this.commands.set(commandIdentifier, exported.context);
            }
        }
    }
    public async start(): Promise<void> {
        if (!this.event) {
            const eventModule = this.bot.get(EventModule);

            if (!eventModule) {
                this.logger.error(
                    'EventModule is not registered. Cannot start CommandModule.',
                );
                return;
            }
            this.event = new Event('interactionCreate', {
                handler: async (bot, eventName, [interaction]) => {
                    if (!interaction.isChatInputCommand()) return;
                    const commandContext = this.commands.get(
                        interaction.commandName.split('.', 1)[0],
                    );
                    if (commandContext) {
                        try {
                            await interaction.deferReply();
                            await commandContext.handler(bot, interaction);
                        } catch (error) {
                            const commandError = new CommandError(
                                commandContext.identifier,
                                interaction,
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                                commandContext.errors === 'hidden',
                            );
                            await this.handleCommandError(commandError);
                        }
                    }
                },
            });

            eventModule.addEventListener(this.event);
            this.logger.debug('Registered interactionCreate event listener');
        } else {
            this.logger.debug('Event listener already registered, skipping');
        }

        this.logger.info(
            `Loaded ${this.commands.size} commands from ${COMMANDS_DIRECTORY}.`,
        );

        await this.registerCommands();

        this.logger.info('CommandModule started successfully.');
    }

    private async handleCommandError(
        commandError: CommandError,
    ): Promise<void> {
        const { commandIdentifier, interaction, message, hidden } =
            commandError;
        if (!interaction.isChatInputCommand()) {
            this.logger.error(`Unexpected interaction type for command error`);
            return;
        }

        let content = `Error occurred while handling command ${commandIdentifier}`;
        if (!hidden) {
            content += `: ${message}`;
        }

        try {
            const replyOptions = { content, flags: 1 << 6 }; // Ephemeral
            console.log(interaction.replied, interaction.deferred);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        } catch (replyError: any) {
            console.log(replyError);
            if (
                replyError?.code === 10062 ||
                (replyError?.message &&
                    replyError.message.includes('Unknown interaction'))
            ) {
                this.logger.warn(
                    `2 Could not send error reply for command ${commandIdentifier}: interaction is no longer valid (possibly expired or already acknowledged).`,
                );
            } else {
                this.logger.error(
                    `Failed to send error reply for command ${commandIdentifier}:`,
                    replyError,
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
                    nsfw: command.nsfw || false,
                    description_localizations:
                        command.descriptionLocalizations ?? {},
                    name_localizations: command.nameLocalizations ?? {},
                    default_member_permissions:
                        (command.permissions || [])?.reduce((acc, perm) => {
                            if (typeof perm != 'bigint') {
                                this.logger.warn(
                                    `Invalid permission type for command ${
                                        command.identifier
                                    }: ${typeof perm}. Expected bigint.`,
                                );
                                return acc;
                            }
                            return acc | perm;
                        }, 0n) || null,
                    contexts: Array.isArray(command?.contexts)
                        ? Array.from(new Set(command.contexts))
                        : undefined,
                    // integration_types
                    // handler
                } as RESTPostAPIChatInputApplicationCommandsJSONBody),
        );

        try {
            await rest.put(Routes.applicationCommands(env.APPLICATION_ID), {
                body: commandsData,
            });
            this.logger.info(
                `Successfully registered ${commandsData.length} commands.`,
            );
        } catch (error) {
            this.logger.error('Failed to register commands:', error);
        }
    }
}
