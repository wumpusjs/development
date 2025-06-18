import Command from '@command';

export default new Command({
    identifier: 'test',
    description: 'A test command to verify command registration and execution.',
    async handler(_bot, interaction) {
        throw new Error('This is a test error to verify error handling.');
    },
    errors: 'visible'
});
