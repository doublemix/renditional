export default [
    {
        input: {
            core: 'core.js',
        },
        output: {
            format: 'umd',
            dir: 'umd',
            name: 'Renditional',
        },
    },
    {
        input: 'hash-router.js',
        external: [
            'renditional'
        ],
        output: {
            format: 'umd',
            dir: 'umd',
            name: 'RenditionalHashRouter',
            globals: {
                'renditional': 'Renditional',
            },
        }
    }
]
