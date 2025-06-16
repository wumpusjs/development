import Command from '@command';

export default new Command({
    identifier: 'test',
    description: 'A test command to verify command registration and execution.',
    async handler(_bot, interaction) {
        await interaction.reply({
            content: 'Test command executed successfully!',
            ephemeral: true,
        });
    },
});
