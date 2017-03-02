import {
    isArray,
    isPath,
    oneOf,
    isString,
    required,
} from 'roc/validators';

export default {
    settings: {
        dev: {
            watch: {
                description: 'Files/folders that should trigger a restart of the server.',
                validator: required(oneOf(isPath, isArray(isPath))),
            },
            build: {
                targets: {
                    override: 'roc-package-webpack-dev',
                    validator: required(isArray(/^node$/i)),
                },
            },
        },
        build: {
            externals: {
                description: 'Regex expression to match for adding additional externals',
                validator: isArray(isString),
            },
        },
    },
};
