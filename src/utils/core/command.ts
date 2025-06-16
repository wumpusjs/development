import {
    ChatInputCommandInteraction,
    ClientEvents,
    CommandInteractionOptionResolver,
    User,
} from 'discord.js';
import Bot from '@utils/bot';
import { type } from 'arktype';

declare global {
    namespace Wumpus {
        export interface ICommandContext {
            handler: (
                bot: Bot,
                interaction: ChatInputCommandInteraction,
            ) => void;
        }
        export interface ICommandOptions {
            identifier: string;
            description: string;
        }
    }
}

export default class Command {
    constructor(public context: CommandContext & CommandOptions) {}
}

export type CommandContext = Wumpus.ICommandContext;
export type CommandOptions = Wumpus.ICommandOptions;

export const ButtonSymbol = Symbol('Button');
export const ChannelSymbol = Symbol('Channel');
export const MentionableSymbol = Symbol('Mentionable');
export const RoleSymbol = Symbol('Role');
export const UserSymbol = Symbol('User');

export const option = type.module({
    button: type.unit(ButtonSymbol),
    channel: type.unit(ChannelSymbol),
    mentionable: type.unit(MentionableSymbol),
    role: type.unit(RoleSymbol),
    user: type.unit(UserSymbol),
});