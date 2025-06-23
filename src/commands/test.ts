import Command from '@command';
import { Embed, Message } from '@response';

export default new Command({
    identifier: 'test',
    description: 'A test command to verify command registration and execution.',
    async handler(_bot, interaction) {
        const embed = new Embed({
            title: 'Test Embed',
            description:
                'This is a test embed to verify command registration and execution.',
            color: '#00FF00',
            fields: [
                {
                    name: 'Field 1',
                    value: 'This is the first field.',
                    inline: true,
                },
                {
                    name: 'Field 2',
                    value: 'This is the second field.',
                    inline: true,
                },
                {
                    name: 'Field 3',
                    value: 'This is the third field.',
                    inline: true,
                },
            ],
            author: {
                name: 'Test Author',
                icon_url: 'https://example.com/icon.png',
            },
            footer: {
                text: 'Test Footer',
                icon_url: 'https://example.com/footer-icon.png',
            },
            url: 'https://example.com',
            timestamp: new Date().toISOString(),
            provider: {
                name: 'Test Provider',
                url: 'https://example.com/provider',
            },
            image: {
                url: 'https://example.com/image.png',
            },
            thumbnail: {
                url: 'https://example.com/thumbnail.png',
            },
            video: {
                url: 'https://example.com/video.mp4',
            },
        });
        /* return new Message('This is a test message.'); */
        /* return embed; */
        /* return 'This is a test message to verify command registration and execution.'; */
        return new Message({
            content:
                'This is a test message to verify command registration and execution.',
        })
            .addEmbed(embed)
            .setEphemeral(true);
    },
    errors: 'visible',
});
