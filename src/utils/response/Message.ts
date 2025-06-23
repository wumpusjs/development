import { ChatInputCommandInteraction, MessageFlags, MessagePayload } from 'discord.js';
import Embed from './Embed';

interface IMessageOptions {
    content?: string;
    embeds?: Embed[];
    ephemeral?: boolean;
}

export default class Message {
    content?: string;
    embeds?: Embed[];
    ephemeral?: boolean;

    public constructor(content: string | Embed | IMessageOptions) {
        if (typeof content === 'string') {
            this.content = content;
        } else if (content instanceof Embed) {
            this.embeds = [content];
        } else if (typeof content === 'object') {
            this.content = content.content;
            this.embeds = content.embeds;
            this.ephemeral = content.ephemeral;
        } else {
            throw new Error('Invalid content type for Message constructor');
        }
    }

    public addEmbed(embed: Embed): this {
        if (!this.embeds) {
            this.embeds = [];
        }
        this.embeds.push(embed);
        return this;
    }

    public setContent(content: string): this {
        this.content = content;
        return this;
    }

    public setEphemeral(ephemeral: boolean): this {
        this.ephemeral = ephemeral;
        return this;
    }

	public toPayload(interaction: ChatInputCommandInteraction): MessagePayload {
		let flags = 0;

		if (this.ephemeral) {
			flags |= MessageFlags.Ephemeral;
		}

		const payload = MessagePayload.create(interaction, {
			content: this.content,
			embeds: this.embeds?.map(embed => embed.toJSON()),
			flags,
		})

		return payload;
	}
}