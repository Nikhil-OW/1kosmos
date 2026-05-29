import dotenv from 'dotenv';
import path from 'path';

export type UserSeed = {
    username: string;
    password: string;
    email: string;
    firstName: string;
    lastName: string;
};

export type RuntimeConfig = {
    baseUrl: string;
    tenantId: string;
    rulesEngineUrl: string;
    userMgmtUrl: string;
    adminUser: UserSeed;
    testUser: UserSeed;
    communityId: string;
    communityName: string;
    dns: string;
    licenseKey: string;
    publicKey: string;
    privateKey: string;
    adminApiUrl: string;
    caasUrl: string;
    dbAuthModule: string;
    clientTenantTag: string;
    [key: string]: any;
};

dotenv.config({ path: path.resolve(process.cwd(), 'configs/.env') });

function cliValue(...names: string[]): string | undefined {
    const normalizedNames = names.map(name => name.toLowerCase());

    for (const name of normalizedNames) {
        const npmValue = process.env[`npm_config_${name}`];
        if (npmValue) {
            return npmValue;
        }
    }

    for (let index = 0; index < process.argv.length; index += 1) {
        const arg = process.argv[index];
        if (!arg.startsWith('--')) {
            continue;
        }

        const [rawName, inlineValue] = arg.slice(2).split('=', 2);
        if (!normalizedNames.includes(rawName.toLowerCase())) {
            continue;
        }

        if (inlineValue) {
            return inlineValue;
        }

        const nextValue = process.argv[index + 1];
        if (nextValue && !nextValue.startsWith('--')) {
            return nextValue;
        }
    }

    return undefined;
}

function configCLIValue(envName: string, ...cliNames: string[]): string | undefined {
    return cliValue(...cliNames) ?? process.env[envName];
}

function requiredEnv(name: string, override?: string): string {
    const value = override ?? process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export function loadRuntimeConfig(): RuntimeConfig {
    const dns = requiredEnv('DNS', configCLIValue('DNS', 'dns'));
    const communityName = requiredEnv('COMMUNITY_NAME', configCLIValue('COMMUNITY_NAME', 'communityname', 'communityName', 'community-name', 'community_name'));
    const baseUrl = `https://${dns}/admin/${communityName}`;
    const rulesEngineUrl = `https://${dns}/rules-engine/`;
    const adminApiUrl = `https://${dns}/adminapi`;
    const userMgmtUrl = `https://${dns}/users-mgmt`;
    const caasUrl = `https://${dns}/caas`;
    const cliTenant = configCLIValue('tenantid', 'tenantId');
    const cliCommunity = configCLIValue('communityid', 'communityId');

    return {
        dns,
        communityName,
        baseUrl,
        rulesEngineUrl,
        adminApiUrl,
        userMgmtUrl,
        caasUrl,
        clientTenantTag: requiredEnv('CLIENT_TENANT_TAG', configCLIValue('clienttenanttag', 'clientTenantTag', 'client-tenant-tag')),
        tenantId: cliTenant ? cliTenant : '',
        communityId: cliCommunity ? cliCommunity : '',
        licenseKey: requiredEnv('LICENSE_KEY'),
        publicKey: requiredEnv('PUBLIC_KEY'),
        privateKey: requiredEnv('PRIVATE_KEY'),
        dbAuthModule: requiredEnv('DB_AUTH_MODULE'),
        adminUser: {
            username: requiredEnv('ADMIN_USERNAME'),
            password: requiredEnv('ADMIN_PASSWORD'),
            email: requiredEnv('ADMIN_EMAIL'),
            firstName: process.env.ADMIN_FIRST_NAME ?? 'Admin',
            lastName: process.env.ADMIN_LAST_NAME ?? 'User'
        },
        testUser: {
            username: requiredEnv('BASIC_USERNAME'),
            password: requiredEnv('ADMIN_PASSWORD'),
            email: requiredEnv('ADMIN_EMAIL'),
            firstName: process.env.ADMIN_FIRST_NAME ?? 'Admin',
            lastName: process.env.ADMIN_LAST_NAME ?? 'User'
        },
    };
}
