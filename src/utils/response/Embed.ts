import { APIEmbed } from 'discord.js';
import { type } from 'arktype';

type EmbedData = typeof Embed.Schema.infer;
type EmbedField = typeof Embed.FieldSchema.infer;

export class EmbedValidationError extends Error {
    constructor(public readonly validationErrors: type.errors) {
        super(`Embed validation failed: \n- ${validationErrors.join('\n- ')}`);
        this.name = 'EmbedValidationError';
    }
}

export default class Embed {
    public static readonly FooterSchema = type({
        text: 'string',
        icon_url: 'string.url?',
        proxy_icon_url: 'string.url?',
    });

    public static readonly MediaSchema = type({
        url: 'string.url',
        proxy_url: 'string.url?',
        height: 'number?',
        width: 'number?',
    });

    public static readonly AuthorSchema = type({
        name: 'string',
        url: 'string.url?',
        icon_url: 'string.url?',
        proxy_icon_url: 'string.url?',
    });

    public static readonly ProviderSchema = type({
        name: 'string?',
        url: 'string.url?',
    });

    public static readonly FieldSchema = type({
        name: 'string',
        value: 'string',
        inline: 'boolean?',
    });

    public static readonly Schema = type({
        title: 'string?',
        description: 'string?',
        url: 'string.url?',
        timestamp: 'string.date.iso?',
        color: 'string.hex?',
        footer: this.FooterSchema.optional(),
        image: this.MediaSchema.optional(),
        thumbnail: this.MediaSchema.optional(),
        video: this.MediaSchema.optional(),
        provider: this.ProviderSchema.optional(),
        author: this.AuthorSchema.optional(),
        fields: this.FieldSchema.array().optional(),
    });

    private data: Partial<EmbedData> = {};

    public constructor(data?: Partial<EmbedData>) {
        if (data) {
            this.data = { ...data };
        }
    }

    public static from(data: unknown): Embed {
        const result = this.Schema(data);

        if (result instanceof type.errors) {
            throw new EmbedValidationError(result);
        }

        return new Embed(result);
    }

    public setTitle(title: string): this {
        this.data.title = title;
        return this;
    }

    public setDescription(description: string): this {
        this.data.description = description;
        return this;
    }

    public setURL(url: string): this {
        this.data.url = url;
        return this;
    }

    public setColor(color: string): this {
        this.data.color = color;
        return this;
    }

    public setTimestamp(timestamp: string | Date | null = new Date()): this {
        if (timestamp === null) {
            delete this.data.timestamp;
        } else {
            this.data.timestamp =
                timestamp instanceof Date ? timestamp.toISOString() : timestamp;
        }
        return this;
    }

    public setFooter(options: typeof Embed.FooterSchema.infer): this {
        this.data.footer = options;
        return this;
    }

    public setImage(url: string): this {
        this.data.image = { url };
        return this;
    }

    public setThumbnail(url: string): this {
        this.data.thumbnail = { url };
        return this;
    }

    public setAuthor(options: typeof Embed.AuthorSchema.infer): this {
        this.data.author = options;
        return this;
    }

    public addField(name: string, value: string, inline?: boolean): this {
        return this.addFields({ name, value, inline });
    }

    public addFields(fields: EmbedField[]): this;
    public addFields(...fields: EmbedField[]): this;
    public addFields(...fields: EmbedField[] | [EmbedField[]]): this {
        if (!this.data.fields) {
            this.data.fields = [];
        }

        const fieldsToAdd = Array.isArray(fields[0])
            ? fields[0]
            : (fields as EmbedField[]);

        this.data.fields.push(...fieldsToAdd);
        return this;
    }

    public toJSON(): APIEmbed {
        return {
            ...this.data,
            color: this.data.color
                ? parseInt(this.data.color.replace('#', ''), 16)
                : undefined,
        };
    }
}
