import { faker } from '@faker-js/faker';
import { Logger } from './logger';

export type DeviceDetails = {
    device_id: string;
    did: string;
    os: string;
    provider: string;
    pushId: string;
    publicKey: string;
    privateKey: string;
    device_name: string;
};

export class DataGenerator {
    static generateUser(index: number = 1) {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();

        const user = {
            username: `basic${index}`,
            password: '1Kosmos123$',
            email: faker.internet.email({ firstName, lastName }),
            firstName: firstName,
            lastName: lastName
        };

        Logger.log('DATA', 'GENERATED_USER', `User: ${user.username} | Pwd: ${user.password}`);

        return user;
    }

    static generateRuleName() {
        return `Rule_${faker.commerce.productName().replace(/\s+/g, '_')}`;
    }

    static getVirtualDeviceDetails(): DeviceDetails {
        const device = {
            device_id: "2F4A8B1C-9E7D-4523-A8F6-1B9C4E7D2A58",
            did: "a7f4e9b2c8d6f1a5e3b7c9d2f8a4e6b1c7d9f3a5",
            os: "ios",
            provider: "apple",
            pushId: "c76f053a7b2950f9baa0f1dbec9c953c5d055ebc49b15fec7bcc2b71ef8de995",
            publicKey: "/ktyh5MOlr4eDtwuvpLfunl/xs16mq+P9kMlKIuiPozNQRYXxQdvVC/BbxazAmAwWGur9V5c/H7gngA6n35BIA==",
            privateKey: "kO/GXMLM3pU6ngJHJWgQFLBnk2ziWo75jYkYWpgMfng=",
            device_name: "QA automation virtual device #1"
        };

        Logger.log('DATA', 'DEVICE_DETAILS', `Fetched details for: ${device.device_name}`);

        return device;
    }
}