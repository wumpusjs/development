import {
    ChatInputCommandInteraction,
    InteractionContextType,
    Locale,
    PermissionFlags,
    User,
} from 'discord.js';
import Bot from '@utils/bot';
import { type } from 'arktype';
import { Embed, Message } from '@response';

declare global {
    namespace Wumpus {
        export interface ICommandContext {
            handler: (
                bot: Bot,
                interaction: ChatInputCommandInteraction,
            ) => Promise<Message | Embed | string | void>;
        }
        export interface ICommandOptions {
            identifier: string;
            description: string;
            nsfw?: boolean;
            descriptionLocalizations?: Partial<Record<Locale, string>>;
            nameLocalizations?: Partial<Record<Locale, string>>;
            permissions?: PermissionFlags[keyof PermissionFlags][];
            contexts?: InteractionContextType[];
            errors?: 'hidden' | 'visible';
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
