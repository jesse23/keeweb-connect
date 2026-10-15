import * as fs from 'fs';
import * as path from 'path';
import CopyPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(target: Json, patch: Json): Json {
    for (const [key, value] of Object.entries(patch)) {
        const current = target[key];
        target[key] = isObject(current) && isObject(value) ? deepMerge(current, value) : value;
    }
    return target;
}

const dev = process.argv.includes('--mode=development');

const config: Configuration = {
    entry: {
        background: './src/background/init.ts',
        'content-keeweb': './src/content/content-keeweb.ts',
        'content-page': './src/content/content-page.ts',
        options: './src/options/index.tsx'
    },
    output: {
        filename: 'js/[name].js',
        path: path.resolve('dist', 'chrome'),
        clean: true
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: { loader: 'ts-loader', options: { compilerOptions: { noEmit: false } } },
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        alias: {
            background: path.resolve('src/background'),
            common: path.resolve('src/common'),
            content: path.resolve('src/content'),
            options: path.resolve('src/options')
        },
        extensions: ['.tsx', '.ts', '.js']
    },
    optimization: {
        minimize: false
    },
    devtool: dev ? 'inline-source-map' : false,
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: '_locales', to: '_locales' },
                { from: 'icons', to: 'icons' },
                { from: 'pages', to: 'pages' },
                { from: 'img/chrome', to: 'img' },
                { from: 'styles', to: 'styles' },
                {
                    from: 'manifest.json',
                    transform: (content: Buffer) => {
                        const manifest = JSON.parse(content.toString()) as Json;
                        if (dev) {
                            const patch = JSON.parse(
                                fs.readFileSync('manifest.dev.json', 'utf8')
                            ) as Json;
                            deepMerge(manifest, patch);
                        }
                        return Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
                    }
                }
            ]
        })
    ]
};

// webpack-cli requires a default export for config files
export default config;
